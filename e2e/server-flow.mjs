/**
 * E2E chế độ MÁY CHỦ: hai phiên / hai "thiết bị" cùng nhìn một nguồn dữ liệu.
 *
 * Kiểm tra:
 *   P3-01  giáo viên đăng nhập, xuất bản; học sinh mở máy khác thấy đúng nội dung mới
 *   P3-02  học sinh làm dở trên máy A, mở máy B thấy lượt học đang dở
 *   SEC-01 chưa đăng nhập thì khu vực giáo viên chỉ hiện màn đăng nhập, không lộ dữ liệu
 *
 * Cần: API chạy ở :8787 (VITE_BACKEND=server khi build web) và `vite preview` ở :4173.
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const BASE = process.env.BASE ?? 'http://localhost:4173';
const OUT = process.env.SHOTS ?? 'e2e/shots';
const TEACHER = { email: process.env.T_EMAIL ?? 'giaovien@example.local', password: process.env.T_PASS ?? 'teacherpass12345' };
const CLASS = { classCode: process.env.CLASS_CODE ?? 'YCT1-A', nickname: 'Bé Mít', accessCode: process.env.STUDENT_CODE ?? 'hocsinh123' };
mkdirSync(OUT, { recursive: true });

const results = [];
const check = (id, ok, detail = '') => {
  results.push({ id, ok });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${id}${detail ? ' — ' + detail : ''}`);
};

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });

/** Đăng nhập qua API trong ngữ cảnh trình duyệt (cookie do máy chủ đặt). */
async function loginStudent(page) {
  return page.evaluate(async (c) => {
    const r = await fetch('/api/auth/student/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(c),
      credentials: 'same-origin',
    });
    return r.status;
  }, CLASS);
}

try {
  /* ── SEC-01 ở tầng giao diện ───────────────────────────────────────── */
  const anon = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const anonPage = await anon.newPage();
  await anonPage.goto(`${BASE}/giao-vien`, { waitUntil: 'networkidle' });
  const hasLogin = await anonPage.getByRole('heading', { name: 'Khu vực giáo viên' }).count();
  const leaked = (await anonPage.content()).includes('Ngân hàng nội dung');
  check('SEC-01/ui', hasLogin > 0 && !leaked, `login=${hasLogin} leaked=${leaked}`);
  await anonPage.screenshot({ path: `${OUT}/20-teacher-login-1280.png`, fullPage: true });

  /* ── giáo viên: đăng nhập → duyệt & xuất bản ───────────────────────── */
  const tp = anonPage;
  await tp.getByLabel('Email').fill(TEACHER.email);
  await tp.getByLabel('Mật khẩu').fill(TEACHER.password);
  await tp.getByRole('button', { name: 'Đăng nhập' }).click();
  await tp.getByRole('heading', { name: 'Bảng điều khiển giáo viên' }).waitFor({ timeout: 10000 });
  await tp.screenshot({ path: `${OUT}/21-teacher-dashboard-1280.png`, fullPage: true });

  // nhập một từ mới rồi xuất bản
  await tp.getByRole('button', { name: 'Nhập dữ liệu' }).click();
  const NEW_MEANING = 'từ kiểm thử hai thiết bị';
  await tp.getByLabel('Dữ liệu').fill(`bai\thanzi\tpinyin\tnghia\n1\t学\txué\t${NEW_MEANING}\n`);
  await tp.getByRole('button', { name: 'Kiểm tra' }).click();
  await tp.locator('.banner').first().waitFor();
  await tp.screenshot({ path: `${OUT}/22-teacher-import-preview-1280.png`, fullPage: true });
  await tp.getByRole('button', { name: 'Xuất bản cho lớp' }).click();
  await tp.locator("text=Đã xuất bản phiên bản").first().waitFor({ timeout: 10000 });
  const publishMsg = await tp.locator('.banner').first().innerText();
  check('P3-01/publish', /Đã xuất bản phiên bản \d+/.test(publishMsg), publishMsg.trim());
  await tp.screenshot({ path: `${OUT}/23-teacher-published-1280.png`, fullPage: true });

  /* ── học sinh, "thiết bị" 1 ────────────────────────────────────────── */
  const d1 = await browser.newContext({ viewport: { width: 360, height: 800 }, locale: 'vi-VN' });
  const p1 = await d1.newPage();
  await p1.goto(BASE, { waitUntil: 'networkidle' });
  check('P3-01/student-login', (await loginStudent(p1)) === 200);
  await p1.goto(`${BASE}/chon?lesson=yct1-l1`, { waitUntil: 'networkidle' });
  await p1.getByRole('button', { name: '5 câu' }).click();
  await p1.getByRole('button', { name: /Bắt đầu/ }).click();
  await p1.waitForURL(/\/hoc\//, { timeout: 10000 });
  const attemptUrl = p1.url();
  const opts = p1.locator('.opt');
  await opts.first().waitFor();
  await opts.first().click();
  await p1.locator('.verdict').first().waitFor();
  await p1.screenshot({ path: `${OUT}/24-student-server-360.png`, fullPage: true });

  /* ── học sinh, "thiết bị" 2: cùng tài khoản, phiên khác ────────────── */
  const d2 = await browser.newContext({ viewport: { width: 768, height: 1024 }, locale: 'vi-VN' });
  const p2 = await d2.newPage();
  await p2.goto(BASE, { waitUntil: 'networkidle' });
  await loginStudent(p2);
  await p2.reload({ waitUntil: 'networkidle' });
  const resumeVisible = await p2.getByRole('heading', { name: 'Đang học dở' }).count();
  check('P3-02/resume-other-device', resumeVisible > 0);
  await p2.screenshot({ path: `${OUT}/25-student-device2-768.png`, fullPage: true });

  // thiết bị 2 mở đúng lượt học dở đó
  await p2.getByRole('button', { name: /Học tiếp/ }).click();
  await p2.waitForURL(/\/hoc\//, { timeout: 10000 });
  check('P3-02/same-attempt', p2.url().split('/hoc/')[1] === attemptUrl.split('/hoc/')[1]);

  // nội dung mới xuất bản có tới thiết bị mới không
  await p2.goto(`${BASE}/giao-vien`, { waitUntil: 'networkidle' });
  const seenByStudent = (await p2.content()).includes(NEW_MEANING);
  check('P3-01/no-teacher-data-for-student', !seenByStudent, 'học sinh không thấy bảng nội dung của giáo viên');

  const fresh = await p2.evaluate(async () => {
    const r = await fetch('/api/curricula/yct/1/catalog', { credentials: 'same-origin' });
    return (await r.json()).revision;
  });
  check('P3-01/new-revision-visible', typeof fresh === 'number' && fresh >= 2, `revision=${fresh}`);
} finally {
  await browser.close();
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} PASS`);
process.exit(failed.length ? 1 : 0);
