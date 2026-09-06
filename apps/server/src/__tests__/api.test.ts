/**
 * Kiểm thử tích hợp chạy trên Postgres THẬT.
 *
 * Đặt DATABASE_URL trỏ tới một cơ sở dữ liệu DÙNG RIÊNG cho kiểm thử — bộ test sẽ xoá sạch dữ liệu.
 * Ví dụ: DATABASE_URL=postgres://postgres@127.0.0.1:5433/yct_test npm run -w @yct/server test
 */
import { beforeAll, afterAll, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../app.js';
import { migrate } from '../migrate.js';
import { seed } from '../seed.js';
import { query, closePool, one } from '../db.js';
import { contentHash } from '@yct/shared';

let app: FastifyInstance;

const ADMIN = { email: 'admin@example.local', password: 'adminpass123456' };
const TEACHER = { email: 'giaovien@example.local', password: 'teacherpass12345' };
const CLASS_CODE = 'YCT1-A';
const STUDENT_CODE = 'hocsinh123';

interface Client {
  cookies: Record<string, string>;
  call(method: string, url: string, body?: unknown): Promise<{ status: number; json: any }>;
}

function client(): Client {
  const cookies: Record<string, string> = {};
  return {
    cookies,
    async call(method, url, body) {
      const res = await app.inject({
        method: method as never,
        url,
        headers: {
          cookie: Object.entries(cookies)
            .map(([k, v]) => `${k}=${v}`)
            .join('; '),
          ...(cookies['csrf'] ? { 'x-csrf-token': cookies['csrf'] } : {}),
          ...(body ? { 'content-type': 'application/json' } : {}),
        },
        ...(body ? { payload: JSON.stringify(body) } : {}),
      });
      for (const c of res.cookies) {
        if (c.value === '') delete cookies[c.name];
        else cookies[c.name] = c.value;
      }
      let json: unknown = null;
      try {
        json = res.body ? JSON.parse(res.body) : null;
      } catch {
        json = res.body;
      }
      return { status: res.statusCode, json: json as any };
    },
  };
}

async function loginTeacher(): Promise<Client> {
  const c = client();
  const r = await c.call('POST', '/api/auth/teacher/login', TEACHER);
  expect(r.status, JSON.stringify(r.json)).toBe(200);
  return c;
}

async function loginStudent(nickname: string): Promise<Client> {
  const c = client();
  const r = await c.call('POST', '/api/auth/student/login', {
    classCode: CLASS_CODE,
    nickname,
    accessCode: STUDENT_CODE,
  });
  expect(r.status, JSON.stringify(r.json)).toBe(200);
  return c;
}

/** Xuất bản toàn bộ nội dung YCT 1 để có ngân hàng câu hỏi cho các bài test học sinh. */
async function publishAllYct(): Promise<number> {
  const rev = (await one<{ revision: number }>('SELECT revision FROM content_head WHERE only_row'))!.revision;
  await query(
    `UPDATE content_item_versions SET status = 'published'
      WHERE revision = $1 AND lesson_id LIKE 'yct1-%'`,
    [rev],
  );
  return rev;
}

beforeAll(async () => {
  if (!process.env.DATABASE_URL) throw new Error('Cần DATABASE_URL trỏ tới DB kiểm thử.');
  // seed() đọc các biến này; đặt trước khi gọi để mật khẩu là biết trước, không ngẫu nhiên.
  process.env.SEED_ADMIN_PASSWORD = ADMIN.password;
  process.env.SEED_TEACHER_PASSWORD = TEACHER.password;
  process.env.SEED_CLASS_CODE = CLASS_CODE;
  process.env.SEED_STUDENT_CODE = STUDENT_CODE;
  await migrate(() => undefined);
  app = await buildApp();
}, 60_000);

afterAll(async () => {
  await app?.close();
  await closePool();
});

beforeEach(async () => {
  await query(`TRUNCATE answer_events, self_reports, review_states, attempts, assignments,
               sessions, login_throttle, audit_events, memberships, classrooms,
               content_item_versions, content_head, content_revisions, lessons, curricula, users
               RESTART IDENTITY CASCADE`);
  await seed({ quiet: true });
});

/* ══════════════════════════════ SEC ══════════════════════════════════ */

describe('SEC-01 — gọi thẳng API giáo viên khi chưa đăng nhập', () => {
  it('bị từ chối và KHÔNG đổi dữ liệu', async () => {
    const anon = client();
    const before = await one<{ c: string }>('SELECT count(*)::text AS c FROM content_revisions');

    for (const [method, url, body] of [
      ['GET', '/api/teacher/content?curriculum=yct&level=1', undefined],
      ['POST', '/api/teacher/content/review', { itemIds: ['yct1-l1-v-%E4%BD%A0'] }],
      ['POST', '/api/teacher/import/validate', { kind: 'vocab', text: 'x', curriculumId: 'yct', level: 1, mode: 'merge' }],
      ['POST', '/api/teacher/content/rollback', { toRevision: 1 }],
      ['GET', '/api/teacher/classrooms', undefined],
    ] as const) {
      const r = await anon.call(method, url, body);
      expect([401, 403], `${method} ${url} → ${r.status}`).toContain(r.status);
    }

    const after = await one<{ c: string }>('SELECT count(*)::text AS c FROM content_revisions');
    expect(after?.c).toBe(before?.c);
  });

  it('thao tác ghi thiếu CSRF token bị chặn', async () => {
    const t = await loginTeacher();
    delete t.cookies['csrf']; // giả lập request từ trang khác: có cookie phiên nhưng không có header
    const r = await t.call('POST', '/api/teacher/content/review', { itemIds: ['x'] });
    expect(r.status).toBe(403);
  });
});

describe('SEC-02 — học sinh A không đọc được dữ liệu của B', () => {
  it('đổi attemptId sang lượt của bạn khác → bị từ chối ở server', async () => {
    await publishAllYct();
    const a = await loginStudent('Bé Mít');
    const b = await loginStudent('Bé Na');

    const attemptB = await b.call('POST', '/api/attempts', {
      curriculumId: 'yct',
      level: 1,
      lessonIds: ['yct1-l1'],
      kinds: ['vocab_h2m'],
      questionCount: 5,
      difficulty: 'easy',
      mode: 'practice',
    });
    expect(attemptB.status).toBe(200);
    const idB = attemptB.json.attemptId as string;

    const stolen = await a.call('GET', `/api/attempts/${idB}`);
    expect(stolen.status).toBe(403);

    const stolenSummary = await a.call('GET', `/api/attempts/${idB}/summary`);
    expect(stolenSummary.status).toBe(403);

    const stolenAnswer = await a.call('POST', `/api/attempts/${idB}/answers`, {
      questionId: attemptB.json.questions?.[0]?.questionId ?? 'x',
      response: 'x',
      tryIndex: 1,
      assistanceUsed: [],
      activeMs: 10,
      idempotencyKey: 'steal-key-1',
    });
    expect(stolenAnswer.status).toBe(403);
    const leaked = await one('SELECT 1 FROM answer_events WHERE idempotency_key = $1', ['steal-key-1']);
    expect(leaked).toBeNull();
  });

  it('giáo viên lớp khác không đọc/sửa được lớp không thuộc quyền', async () => {
    const t = await loginTeacher();
    const mine = await t.call('GET', '/api/teacher/classrooms');
    expect(mine.status).toBe(200);
    const myClass = mine.json[0].classroomId as string;

    // tạo lớp thứ hai KHÔNG gán cho giáo viên này
    const other = await one<{ id: string }>(
      `INSERT INTO classrooms (name, code, created_by)
       SELECT 'Lớp khác', 'OTHER-1', id FROM users WHERE role='admin' LIMIT 1 RETURNING id`,
    );

    const readOther = await t.call('GET', `/api/teacher/classrooms/${other!.id}/report`);
    expect(readOther.status).toBe(403);

    const writeOther = await t.call('POST', `/api/teacher/classrooms/${other!.id}/assignments`, {
      lessonIds: ['yct1-l1'],
      kinds: ['vocab_h2m'],
      questionCount: 5,
      difficulty: 'easy',
      mode: 'practice',
      dueAt: null,
    });
    expect(writeOther.status).toBe(403);
    const created = await query('SELECT 1 FROM assignments WHERE classroom_id = $1', [other!.id]);
    expect(created).toHaveLength(0);

    // lớp của mình thì đọc được
    const readMine = await t.call('GET', `/api/teacher/classrooms/${myClass}/report`);
    expect(readMine.status).toBe(200);
  });

  it('học sinh không gọi được API giáo viên', async () => {
    const s = await loginStudent('Bé Mít');
    const r = await s.call('GET', '/api/teacher/content?curriculum=yct&level=1');
    expect(r.status).toBe(403);
  });
});

describe('SEC-03 — nội dung nhập chứa HTML/script', () => {
  it('được lưu nguyên văn dưới dạng text, không thực thi, không bị diễn giải', async () => {
    const t = await loginTeacher();
    const payload = '<img src=x onerror=alert(1)>';
    const text = `bai\thanzi\tpinyin\tnghia\n1\t你\tnǐ\t${payload}\n`;
    const v = await t.call('POST', '/api/teacher/import/validate', {
      kind: 'vocab',
      text,
      curriculumId: 'yct',
      level: 1,
      mode: 'merge',
    });
    expect(v.status).toBe(200);
    expect(v.json.canPublish).toBe(true);

    const p = await t.call('POST', '/api/teacher/import/publish', {
      batch: v.json.batch,
      text,
      mode: 'merge',
    });
    expect(p.status, JSON.stringify(p.json)).toBe(200);

    const stored = await one<{ payload: { meaningVi: string } }>(
      `SELECT payload FROM content_item_versions
        WHERE revision = $1 AND payload->>'meaningVi' = $2 LIMIT 1`,
      [p.json.revision, payload],
    );
    // Giá trị được giữ NGUYÊN VĂN (không tự ý escape/sửa), và chỉ là dữ liệu — giao diện render bằng text node.
    expect(stored?.payload.meaningVi).toBe(payload);
  });
});

describe('SEC-04 — điểm do máy chủ chấm', () => {
  it('client gửi correct/score đều bị bỏ qua; gửi lại cùng khoá chỉ ghi một lần', async () => {
    await publishAllYct();
    const s = await loginStudent('Bé Mít');
    const a = await s.call('POST', '/api/attempts', {
      curriculumId: 'yct',
      level: 1,
      lessonIds: ['yct1-l1'],
      kinds: ['vocab_h2m'],
      questionCount: 3,
      difficulty: 'easy',
      mode: 'assessment',
    });
    const attemptId = a.json.attemptId as string;
    const q = a.json.questions[0];

    // đáp án KHÔNG có trong payload gửi cho client
    expect(JSON.stringify(a.json)).not.toContain('correctOptionId');
    expect(JSON.stringify(a.json)).not.toContain('acceptedAnswers');

    const wrongOption = q.options[0].id;
    const r1 = await s.call('POST', `/api/attempts/${attemptId}/answers`, {
      questionId: q.questionId,
      response: wrongOption,
      tryIndex: 1,
      assistanceUsed: [],
      activeMs: 100,
      idempotencyKey: 'sec04-key-1',
      // client cố tình gửi thêm — server phải bỏ qua
      correct: true,
      score: 999,
    });
    expect(r1.status).toBe(200);
    const serverSaid = r1.json.correct as boolean;
    const truth = wrongOption === r1.json.correctOptionId;
    expect(serverSaid).toBe(truth);

    const stored = await one<{ correct: boolean }>('SELECT correct FROM answer_events WHERE idempotency_key = $1', ['sec04-key-1']);
    expect(stored?.correct).toBe(truth);

    // gửi lại đúng khoá → idempotent
    const r2 = await s.call('POST', `/api/attempts/${attemptId}/answers`, {
      questionId: q.questionId,
      response: wrongOption,
      tryIndex: 1,
      assistanceUsed: [],
      activeMs: 100,
      idempotencyKey: 'sec04-key-1',
    });
    expect(r2.json.duplicate).toBe(true);
    const rows = await query('SELECT 1 FROM answer_events WHERE attempt_id = $1 AND question_id = $2', [attemptId, q.questionId]);
    expect(rows).toHaveLength(1);

    // khoá khác nhưng cùng (attempt, question, tryIndex) → bị chặn bởi ràng buộc duy nhất
    const r3 = await s.call('POST', `/api/attempts/${attemptId}/answers`, {
      questionId: q.questionId,
      response: wrongOption,
      tryIndex: 1,
      assistanceUsed: [],
      activeMs: 100,
      idempotencyKey: 'sec04-key-1-different',
    });
    expect(r3.status).toBe(500); // vi phạm ràng buộc duy nhất → không ghi thêm
    const rows2 = await query('SELECT 1 FROM answer_events WHERE attempt_id = $1 AND question_id = $2', [attemptId, q.questionId]);
    expect(rows2).toHaveLength(1);
  });
});

/* ══════════════════════════════ DATA ═════════════════════════════════ */

describe('DATA-03 — xuất bản: mất mạng, gửi hai lần, xung đột phiên bản', () => {
  const text = 'bai\thanzi\tpinyin\tnghia\n1\t你\tnǐ\tbạn nhé\n';

  it('lô đã kiểm tra rồi sửa nội dung → BATCH_STALE, không xuất bản', async () => {
    const t = await loginTeacher();
    const v = await t.call('POST', '/api/teacher/import/validate', {
      kind: 'vocab', text, curriculumId: 'yct', level: 1, mode: 'merge',
    });
    const before = await one<{ revision: number }>('SELECT revision FROM content_head WHERE only_row');
    const p = await t.call('POST', '/api/teacher/import/publish', {
      batch: v.json.batch,
      text: text.replace('bạn nhé', 'bạn nha'), // đã sửa sau khi kiểm tra
      mode: 'merge',
    });
    expect(p.status).toBe(409);
    expect(p.json.code).toBe('BATCH_STALE');
    const after = await one<{ revision: number }>('SELECT revision FROM content_head WHERE only_row');
    expect(after?.revision).toBe(before?.revision);
  });

  it('gửi hai lần → không nhân đôi dữ liệu, revision thứ hai bị từ chối', async () => {
    const t = await loginTeacher();
    const v = await t.call('POST', '/api/teacher/import/validate', {
      kind: 'vocab', text, curriculumId: 'yct', level: 1, mode: 'merge',
    });
    const p1 = await t.call('POST', '/api/teacher/import/publish', { batch: v.json.batch, text, mode: 'merge' });
    expect(p1.status).toBe(200);
    // lần gửi thứ hai dùng lại đúng batch cũ (baseRevision đã cũ)
    const p2 = await t.call('POST', '/api/teacher/import/publish', { batch: v.json.batch, text, mode: 'merge' });
    expect(p2.status).toBe(409);
    expect(p2.json.code).toBe('REVISION_CONFLICT');

    const dup = await query(
      `SELECT item_id FROM content_item_versions WHERE revision = $1 AND payload->>'meaningVi' = 'bạn nhé'`,
      [p1.json.revision],
    );
    expect(dup).toHaveLength(1);
  });

  it('hai giáo viên sửa cùng lúc: người sau không ghi đè âm thầm', async () => {
    const t1 = await loginTeacher();
    const t2 = await loginTeacher();
    const textA = 'bai\thanzi\tpinyin\tnghia\n1\t你\tnǐ\tA\n';
    const textB = 'bai\thanzi\tpinyin\tnghia\n1\t你\tnǐ\tB\n';
    const vA = await t1.call('POST', '/api/teacher/import/validate', { kind: 'vocab', text: textA, curriculumId: 'yct', level: 1, mode: 'merge' });
    const vB = await t2.call('POST', '/api/teacher/import/validate', { kind: 'vocab', text: textB, curriculumId: 'yct', level: 1, mode: 'merge' });
    expect(vA.json.batch.baseRevision).toBe(vB.json.batch.baseRevision);

    const pA = await t1.call('POST', '/api/teacher/import/publish', { batch: vA.json.batch, text: textA, mode: 'merge' });
    expect(pA.status).toBe(200);
    const pB = await t2.call('POST', '/api/teacher/import/publish', { batch: vB.json.batch, text: textB, mode: 'merge' });
    expect(pB.status).toBe(409);

    const head = await one<{ revision: number }>('SELECT revision FROM content_head WHERE only_row');
    const withA = await query(
      `SELECT 1 FROM content_item_versions WHERE revision = $1 AND payload->>'meaningVi' = 'A'`,
      [head!.revision],
    );
    const withB = await query(
      `SELECT 1 FROM content_item_versions WHERE revision = $1 AND payload->>'meaningVi' = 'B'`,
      [head!.revision],
    );
    expect(withA).toHaveLength(1); // người xuất bản trước vẫn còn nguyên
    expect(withB).toHaveLength(0); // người sau KHÔNG ghi đè âm thầm
  });

  it('lô có lỗi: KHÔNG âm thầm đăng phần hợp lệ', async () => {
    const t = await loginTeacher();
    const mixed = 'bai\thanzi\tpinyin\tnghia\n1\t你\tnǐ\tbạn\n-1\t好\thǎo\ttốt\n';
    const v = await t.call('POST', '/api/teacher/import/validate', { kind: 'vocab', text: mixed, curriculumId: 'yct', level: 1, mode: 'merge' });
    expect(v.json.canPublish).toBe(false);
    expect(v.json.batch).toBeNull();
    const before = await one<{ revision: number }>('SELECT revision FROM content_head WHERE only_row');
    const p = await t.call('POST', '/api/teacher/import/publish', {
      batch: { kind: 'vocab', curriculumId: 'yct', level: 1, edition: 'standard-course', contentHash: contentHash(mixed), schemaVersion: 1, validatedAt: new Date().toISOString(), baseRevision: before!.revision },
      text: mixed,
      mode: 'merge',
    });
    expect(p.status).toBe(400);
    const after = await one<{ revision: number }>('SELECT revision FROM content_head WHERE only_row');
    expect(after?.revision).toBe(before?.revision);
  });
});

describe('DATA-04 — hai thiết bị và rollback khi học sinh đang làm bài', () => {
  it('lượt học đang chạy giữ revision cũ; thiết bị mới thấy revision mới; điểm cũ vẫn đúng', async () => {
    const rev0 = await publishAllYct();
    const s = await loginStudent('Bé Mít');

    const a = await s.call('POST', '/api/attempts', {
      curriculumId: 'yct', level: 1, lessonIds: ['yct1-l1'],
      kinds: ['vocab_h2m'], questionCount: 3, difficulty: 'easy', mode: 'assessment',
    });
    const attemptId = a.json.attemptId as string;
    const q0 = a.json.questions[0];
    expect(a.json.revision).toBe(rev0);

    // giáo viên xuất bản bản mới GIỮA CHỪNG
    const t = await loginTeacher();
    const newText = 'bai\thanzi\tpinyin\tnghia\n1\t你\tnǐ\tNGHĨA MỚI HOÀN TOÀN\n';
    const v = await t.call('POST', '/api/teacher/import/validate', { kind: 'vocab', text: newText, curriculumId: 'yct', level: 1, mode: 'merge' });
    const p = await t.call('POST', '/api/teacher/import/publish', { batch: v.json.batch, text: newText, mode: 'merge' });
    expect(p.status).toBe(200);
    expect(p.json.revision).toBeGreaterThan(rev0);

    // thiết bị cũ mở lại lượt đang làm: vẫn đúng revision cũ, câu hỏi không đổi
    const resumed = await s.call('GET', `/api/attempts/${attemptId}`);
    expect(resumed.json.revision).toBe(rev0);
    expect(resumed.json.questions[0].questionId).toBe(q0.questionId);
    expect(JSON.stringify(resumed.json.questions[0])).not.toContain('NGHĨA MỚI HOÀN TOÀN');

    // trả lời trong lượt cũ vẫn chấm theo đáp án cũ
    const ans = await s.call('POST', `/api/attempts/${attemptId}/answers`, {
      questionId: q0.questionId,
      response: q0.options[0].id,
      tryIndex: 1, assistanceUsed: [], activeMs: 50, idempotencyKey: 'old-rev-1',
    });
    expect(ans.status).toBe(200);

    // THIẾT BỊ MỚI: lượt học mới lấy revision mới
    const s2 = await loginStudent('Bé Mít');
    const a2 = await s2.call('POST', '/api/attempts', {
      curriculumId: 'yct', level: 1, lessonIds: ['yct1-l1'],
      kinds: ['vocab_h2m'], questionCount: 3, difficulty: 'easy', mode: 'practice',
    });
    expect(a2.json.revision).toBe(p.json.revision);

    // ROLLBACK về revision cũ → tạo revision MỚI, không phá lượt cũ, không xoá audit
    const auditBefore = await one<{ c: string }>('SELECT count(*)::text AS c FROM audit_events');
    const rb = await t.call('POST', '/api/teacher/content/rollback', { toRevision: rev0 });
    expect(rb.status, JSON.stringify(rb.json)).toBe(200);
    expect(rb.json.revision).toBeGreaterThan(p.json.revision);
    const auditAfter = await one<{ c: string }>('SELECT count(*)::text AS c FROM audit_events');
    expect(Number(auditAfter?.c)).toBeGreaterThan(Number(auditBefore?.c));

    // báo cáo của lượt cũ vẫn chấm đúng
    const sum = await s.call('GET', `/api/attempts/${attemptId}/summary`);
    expect(sum.status).toBe(200);
    expect(sum.json.answeredObjective).toBe(1);
  });
});

/* ══════════════════════ luồng học sinh & bài giao ═══════════════════════ */

describe('bài giao và ngân hàng rỗng', () => {
  it('chưa có nội dung nào được duyệt → EMPTY_BANK, không tạo lượt học giả', async () => {
    const s = await loginStudent('Bé Mít'); // chưa publishAllYct()
    const r = await s.call('POST', '/api/attempts', {
      curriculumId: 'yct', level: 1, lessonIds: ['yct1-l1'],
      kinds: ['vocab_h2m'], questionCount: 5, difficulty: 'easy', mode: 'practice',
    });
    expect(r.status).toBe(409);
    expect(r.json.code).toBe('EMPTY_BANK');
    const attempts = await query('SELECT 1 FROM attempts');
    expect(attempts).toHaveLength(0);
  });

  it('HSK chưa đối chiếu nguồn: catalog báo chưa có bài học', async () => {
    await publishAllYct();
    const s = await loginStudent('Bé Mít');
    const hsk = await s.call('GET', '/api/curricula/hsk/1/catalog');
    expect(hsk.status).toBe(200);
    expect(hsk.json.emptyPublished).toBe(true);
    expect(hsk.json.curriculum.sourceVerified).toBe(false);
    const yct = await s.call('GET', '/api/curricula/yct/1/catalog');
    expect(yct.json.emptyPublished).toBe(false);
  });

  it('học sinh chỉ làm được bài giao của lớp mình', async () => {
    await publishAllYct();
    const t = await loginTeacher();
    const classes = await t.call('GET', '/api/teacher/classrooms');
    const cid = classes.json[0].classroomId as string;
    const asg = await t.call('POST', `/api/teacher/classrooms/${cid}/assignments`, {
      lessonIds: ['yct1-l1'], kinds: ['vocab_h2m'], questionCount: 5,
      difficulty: 'easy', mode: 'assessment', dueAt: null,
    });
    expect(asg.status, JSON.stringify(asg.json)).toBe(200);

    const s = await loginStudent('Bé Mít');
    const ok = await s.call('POST', '/api/attempts', {
      curriculumId: 'yct', level: 1, lessonIds: ['yct1-l1'], kinds: ['vocab_h2m'],
      questionCount: 5, difficulty: 'easy', mode: 'assessment', assignmentId: asg.json.assignmentId,
    });
    expect(ok.status).toBe(200);

    // học sinh của lớp khác thì không
    const otherClass = await one<{ id: string }>(
      `INSERT INTO classrooms (name, code, created_by) SELECT 'Lớp B', 'B-1', id FROM users WHERE role='admin' LIMIT 1 RETURNING id`,
    );
    const otherStudent = await one<{ id: string }>(
      `INSERT INTO users (role, display_name) VALUES ('student','Bé Xoài') RETURNING id`,
    );
    await query(
      `INSERT INTO memberships (user_id, classroom_id, role, access_hash)
       SELECT $1, $2, 'student', access_hash FROM memberships WHERE access_hash IS NOT NULL LIMIT 1`,
      [otherStudent!.id, otherClass!.id],
    );
    const c2 = client();
    const login2 = await c2.call('POST', '/api/auth/student/login', {
      classCode: 'B-1', nickname: 'Bé Xoài', accessCode: STUDENT_CODE,
    });
    expect(login2.status).toBe(200);
    const denied = await c2.call('POST', '/api/attempts', {
      curriculumId: 'yct', level: 1, lessonIds: ['yct1-l1'], kinds: ['vocab_h2m'],
      questionCount: 5, difficulty: 'easy', mode: 'assessment', assignmentId: asg.json.assignmentId,
    });
    expect(denied.status).toBe(403);
  });

  it('mã lớp KHÔNG đủ để đăng nhập nếu sai mã truy cập', async () => {
    const c = client();
    const r = await c.call('POST', '/api/auth/student/login', {
      classCode: CLASS_CODE, nickname: 'Bé Mít', accessCode: 'sai-ma-truy-cap',
    });
    expect(r.status).toBe(401);
  });
});

describe('duyệt nội dung', () => {
  it('chỉ tài khoản có quyền mới đổi được trạng thái sang reviewed', async () => {
    const t = await loginTeacher();
    const item = await one<{ item_id: string }>(
      `SELECT item_id FROM content_item_versions WHERE revision = (SELECT revision FROM content_head WHERE only_row)
         AND lesson_id = 'yct1-l1' LIMIT 1`,
    );
    const r = await t.call('POST', '/api/teacher/content/review', { itemIds: [item!.item_id] });
    expect(r.status, JSON.stringify(r.json)).toBe(200);
    const head = await one<{ revision: number }>('SELECT revision FROM content_head WHERE only_row');
    const row = await one<{ status: string; payload: { reviewedBy: string; source: { verificationStatus: string } } }>(
      'SELECT status, payload FROM content_item_versions WHERE revision = $1 AND item_id = $2',
      [head!.revision, item!.item_id],
    );
    expect(row?.status).toBe('reviewed');
    expect(row?.payload.reviewedBy).toBeTruthy();
    expect(row?.payload.source.verificationStatus).toBe('verified_by_teacher');
  });
});
