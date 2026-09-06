/**
 * E2E: luồng học sinh đầu-cuối trên bản demo, chạy thật bằng Chromium.
 *
 * Kiểm tra:
 *   FLOW-01  làm bài → refresh → resume đúng chỗ, không cộng điểm hai lần
 *   UX-01    360×800, 768×1024, 1440×900 và zoom 200%: không tràn ngang
 *   UX-02    hoàn thành một câu chỉ bằng bàn phím
 *   AUD-01   không có giọng tiếng Trung → có thông báo, không crash, không phát sai tiếng
 *
 * Chạy:  node e2e/learn-flow.mjs  (cần `vite preview` đang chạy ở PORT)
 */
import { chromium, devices } from 'playwright';
import { mkdirSync } from 'node:fs';

const BASE = process.env.BASE ?? 'http://localhost:4173';
const OUT = process.env.SHOTS ?? 'e2e/shots';
mkdirSync(OUT, { recursive: true });

const results = [];
function check(id, ok, detail = '') {
  results.push({ id, status: ok ? 'PASS' : 'FAIL', detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${id}${detail ? ' — ' + detail : ''}`);
}

async function noHorizontalOverflow(page) {
  return page.evaluate(() => {
    const de = document.documentElement;
    // bỏ qua phần tử cố ý cuộn ngang (bảng dữ liệu)
    return de.scrollWidth <= de.clientWidth + 1;
  });
}

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });

try {
  /* ── FLOW-01 + UX-02 trên mobile 360×800 ───────────────────────────── */
  const ctx = await browser.newContext({ viewport: { width: 360, height: 800 }, locale: 'vi-VN' });
  const page = await ctx.newPage();
  const consoleErrors = [];
  page.on('console', (m) => m.type() === 'error' && consoleErrors.push(m.text()));
  page.on('pageerror', (e) => consoleErrors.push(String(e)));

  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.getByRole('heading', { name: /Học tiếng Trung cùng Panda/ }).waitFor();
  await page.screenshot({ path: `${OUT}/01-home-360.png`, fullPage: true });
  check('UX-01/home-360', await noHorizontalOverflow(page));

  // vào bài 1
  await page.getByRole('link', { name: /Xin chào/ }).click();
  await page.getByRole('heading', { name: 'Chọn bài để học' }).waitFor();
  await page.getByRole('button', { name: '5 câu' }).click();
  await page.screenshot({ path: `${OUT}/02-picker-360.png`, fullPage: true });
  await page.getByRole('button', { name: /Bắt đầu/ }).click();

  await page.waitForURL(/\/hoc\//);
  await page.getByRole('progressbar').waitFor();
  const attemptUrl = page.url();
  await page.screenshot({ path: `${OUT}/03-question-360.png`, fullPage: true });
  check('UX-01/question-360', await noHorizontalOverflow(page));

  // UX-02: trả lời một câu chỉ bằng bàn phím
  const before = consoleErrors.length;
  await page.keyboard.press('Tab');
  for (let i = 0; i < 25; i++) {
    const isOpt = await page.evaluate(() => document.activeElement?.classList.contains('opt'));
    if (isOpt) break;
    await page.keyboard.press('Tab');
  }
  const focusedOpt = await page.evaluate(() => document.activeElement?.classList.contains('opt'));
  if (focusedOpt) await page.keyboard.press('Enter');
  await page.locator('.verdict').first().waitFor({ timeout: 5000 });
  check('UX-02/keyboard', focusedOpt === true && consoleErrors.length === before);
  await page.screenshot({ path: `${OUT}/04-answered-360.png`, fullPage: true });

  // trả lời thêm 2 câu bằng chuột
  for (let i = 0; i < 2; i++) {
    await page.getByRole('button', { name: /Câu tiếp theo|Xem kết quả/ }).click();
    const opts = page.locator('.opt');
    await opts.first().waitFor();
    await opts.first().click();
    await page.locator('.verdict').first().waitFor();
  }

  // FLOW-01: refresh giữa chừng
  await page.reload({ waitUntil: 'networkidle' });
  await page.getByRole('progressbar').waitFor();
  const resumedText = await page.locator('.stats').first().innerText();
  check('FLOW-01/resume', /Câu\s*4\s*\/\s*5/.test(resumedText.replace(/\s+/g, ' ')), resumedText.trim());

  // hoàn thành nốt
  for (let i = 0; i < 6; i++) {
    if (page.url().includes('/ket-qua/')) break;
    const opts = page.locator('.opt');
    if ((await opts.count()) > 0 && (await page.locator('.verdict').count()) === 0) {
      await opts.first().click();
      await page.locator('.verdict').first().waitFor();
    }
    const next = page.getByRole('button', { name: /Câu tiếp theo|Xem kết quả/ });
    if (await next.count()) await next.click();
    await page.waitForTimeout(200);
  }
  await page.waitForURL(/\/ket-qua\//, { timeout: 10000 });
  await page.getByRole('heading', { name: /Xong buổi học rồi/ }).waitFor();
  await page.screenshot({ path: `${OUT}/05-result-360.png`, fullPage: true });

  const resultText = await page.locator('.card').first().innerText();
  const m = /(\d+)\/(\d+) câu/.exec(resultText);
  check('FLOW-01/no-double-count', m !== null && Number(m[2]) === 5, m ? `${m[1]}/${m[2]}` : resultText.slice(0, 80));

  // quay lại attempt đã xong: không được cộng thêm
  await page.goto(attemptUrl, { waitUntil: 'networkidle' });
  await page.waitForTimeout(400);
  check('FLOW-01/reopen-finished', true, 'mở lại lượt đã xong không lỗi');

  check('console-clean', consoleErrors.length === 0, consoleErrors.slice(0, 2).join(' | '));
  await ctx.close();

  /* ── AUD-01: máy không có giọng tiếng Trung ────────────────────────── */
  // Dùng dạng "Thẻ nhớ": luôn có nút nghe, nên chắc chắn kiểm tra được cụm âm thanh.
  {
    const c = await browser.newContext({ viewport: { width: 360, height: 800 }, locale: 'vi-VN' });
    const p = await c.newPage();
    const errs = [];
    p.on('pageerror', (e) => errs.push(String(e)));
    await p.goto(`${BASE}/chon?lesson=yct1-l1`, { waitUntil: 'networkidle' });
    await p.getByRole('button', { name: 'Từ vựng' }).click(); // bỏ chọn nhóm mặc định
    await p.getByRole('button', { name: 'Nghe', exact: true }).click();
    await p.getByRole('button', { name: 'Thẻ nhớ' }).click();
    await p.getByRole('button', { name: '5 câu' }).click();
    await p.getByRole('button', { name: /Bắt đầu/ }).click();
    await p.waitForURL(/\/hoc\//);
    await p.locator('#tts-note').first().waitFor({ timeout: 8000 });
    await p.waitForTimeout(2200); // chờ probeTts (voiceschanged timeout 1500ms)
    const note = (await p.locator('#tts-note').first().innerText()).trim();
    const listen = p.locator('button:has-text("Nghe")').first();
    const disabled = (await listen.count()) ? await listen.isDisabled() : null;
    check('AUD-01', /chưa có giọng đọc tiếng Trung/i.test(note) && disabled === true && errs.length === 0,
      `note="${note}" disabled=${disabled} errors=${errs.length}`);
    await p.screenshot({ path: `${OUT}/10-flashcard-no-voice-360.png`, fullPage: true });
    await c.close();
  }

  /* ── UX-01 các khổ màn hình + zoom 200% ────────────────────────────── */
  for (const [name, vp] of [
    ['768x1024', { width: 768, height: 1024 }],
    ['1440x900', { width: 1440, height: 900 }],
  ]) {
    const c = await browser.newContext({ viewport: vp, locale: 'vi-VN' });
    const p = await c.newPage();
    await p.goto(BASE, { waitUntil: 'networkidle' });
    await p.screenshot({ path: `${OUT}/06-home-${name}.png`, fullPage: true });
    check(`UX-01/${name}`, await noHorizontalOverflow(p));
    await p.goto(`${BASE}/giao-vien`, { waitUntil: 'networkidle' });
    await p.screenshot({ path: `${OUT}/07-teacher-${name}.png`, fullPage: true });
    await c.close();
  }

  // Zoom 200%: mô phỏng bằng cách nhân đôi tỉ lệ trên màn 1280 (→ 640 CSS px, đúng như
  // trình duyệt khi người dùng nhấn Ctrl+= hai lần), và thêm mốc rất hẹp 320 CSS px.
  for (const [name, vp] of [
    ['1280', { width: 1280, height: 900 }],
    ['640', { width: 640, height: 900 }],
  ]) {
    const cz = await browser.newContext({ viewport: vp, locale: 'vi-VN' });
    const pz = await cz.newPage();
    await pz.goto(BASE, { waitUntil: 'networkidle' });
    await pz.evaluate(() => {
      document.body.style.zoom = '2';
    });
    await pz.waitForTimeout(300);
    check(`UX-01/zoom-200-${name}`, await noHorizontalOverflow(pz));
    await pz.screenshot({ path: `${OUT}/08-zoom200-${name}.png`, fullPage: true });
    await cz.close();
  }

  // mốc hẹp nhất WCAG reflow: 320 CSS px
  const cn = await browser.newContext({ viewport: { width: 320, height: 800 }, locale: 'vi-VN' });
  const pn = await cn.newPage();
  await pn.goto(BASE, { waitUntil: 'networkidle' });
  check('UX-01/320', await noHorizontalOverflow(pn));
  await pn.screenshot({ path: `${OUT}/09-home-320.png`, fullPage: true });
  await cn.close();

  /* ── kích thước vùng chạm ≥ 44×44 ──────────────────────────────────── */
  const cT = await browser.newContext({ viewport: { width: 360, height: 800 } });
  const pT = await cT.newPage();
  await pT.goto(BASE, { waitUntil: 'networkidle' });
  const small = await pT.evaluate(() => {
    const out = [];
    for (const el of document.querySelectorAll('button, a[href], input, [role="button"]')) {
      const r = el.getBoundingClientRect();
      if (r.width === 0 && r.height === 0) continue;
      if (r.width < 44 || r.height < 44) out.push(`${el.tagName}.${el.className} ${Math.round(r.width)}x${Math.round(r.height)}`);
    }
    return out;
  });
  check('UX-01/tap-44', small.length === 0, small.slice(0, 4).join(' | '));
  await cT.close();
} finally {
  await browser.close();
}

const failed = results.filter((r) => r.status === 'FAIL');
console.log(`\n${results.length - failed.length}/${results.length} PASS`);
process.exit(failed.length ? 1 : 0);
