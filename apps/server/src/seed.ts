/**
 * Nạp dữ liệu khởi tạo.
 *
 * KHÔNG chứa dữ liệu thật của trẻ. Học sinh mẫu chỉ có biệt danh.
 * Mật khẩu/mã truy cập lấy từ biến môi trường; nếu thiếu thì sinh ngẫu nhiên và IN RA MỘT LẦN
 * để quản trị viên đổi ngay — không có mật khẩu mặc định nằm trong repo.
 */
import { readFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ContentItemSchema, CurriculumSchema, type ContentItem, type Curriculum } from '@yct/shared';
import { query, one, tx, closePool } from './db.js';
import { isMainModule } from './is-main.js';
import { describeError, requireDatabaseUrl } from './startup.js';
import { hashPassword } from './auth.js';

const here = dirname(fileURLToPath(import.meta.url));
const contentDir = resolve(here, '../../../content');

function loadCurriculum(name: string): { curriculum: Curriculum; items: ContentItem[] } {
  const curriculum = CurriculumSchema.parse(
    JSON.parse(readFileSync(resolve(contentDir, name, 'curriculum.json'), 'utf8')),
  );
  const items = (JSON.parse(readFileSync(resolve(contentDir, name, 'items.json'), 'utf8')) as unknown[]).map((r) =>
    ContentItemSchema.parse(r),
  );
  return { curriculum, items };
}

export async function seed(opts: { quiet?: boolean } = {}): Promise<{ adminEmail: string; adminPassword: string | null; classCode: string; studentCode: string | null }> {
  const log = opts.quiet ? () => undefined : console.log;

  const adminEmail = process.env.SEED_ADMIN_EMAIL ?? 'admin@example.local';
  const adminPassword = process.env.SEED_ADMIN_PASSWORD ?? randomBytes(12).toString('base64url');
  const teacherEmail = process.env.SEED_TEACHER_EMAIL ?? 'giaovien@example.local';
  const teacherPassword = process.env.SEED_TEACHER_PASSWORD ?? randomBytes(12).toString('base64url');
  const classCode = process.env.SEED_CLASS_CODE ?? 'YCT1-A';
  const studentCode = process.env.SEED_STUDENT_CODE ?? randomBytes(6).toString('base64url');

  const yct = loadCurriculum('yct1');
  const hsk = loadCurriculum('hsk1');

  await tx(async (c) => {
    for (const { curriculum } of [yct, hsk]) {
      await c.query(
        `INSERT INTO curricula (curriculum_id, level, edition, name_vi, source_verified, note_vi)
         VALUES ($1,$2,$3,$4,$5,$6)
         ON CONFLICT (curriculum_id, level) DO UPDATE SET edition=EXCLUDED.edition, name_vi=EXCLUDED.name_vi,
           source_verified=EXCLUDED.source_verified, note_vi=EXCLUDED.note_vi`,
        [
          curriculum.curriculumId,
          curriculum.level,
          curriculum.edition,
          curriculum.nameVi,
          curriculum.sourceVerified,
          curriculum.noteVi,
        ],
      );
      for (const l of curriculum.lessons) {
        await c.query(
          `INSERT INTO lessons (lesson_id, curriculum_id, level, n, title_zh, title_pinyin, title_en, title_vi, goals_vi, printed_start, printed_end)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
           ON CONFLICT (lesson_id) DO UPDATE SET title_vi = EXCLUDED.title_vi, goals_vi = EXCLUDED.goals_vi`,
          [
            l.lessonId, l.curriculumId, l.level, l.n, l.titleZh, l.titlePinyin, l.titleEn, l.titleVi,
            JSON.stringify(l.goalsVi), l.printedStart, l.printedEnd,
          ],
        );
      }
    }

    // revision 1: TẤT CẢ nội dung ở trạng thái draft. Không có gì được published tự động —
    // giáo viên phải duyệt rồi xuất bản.
    const existing = await c.query('SELECT revision FROM content_head WHERE only_row');
    if (existing.rowCount === 0) {
      await c.query('INSERT INTO content_revisions (revision, note) VALUES (1, $1)', [
        'Nạp nội dung trích xuất — toàn bộ ở trạng thái nháp, chưa duyệt',
      ]);
      for (const it of [...yct.items, ...hsk.items]) {
        await c.query(
          `INSERT INTO content_item_versions (revision, item_id, payload, status, lesson_id, type)
           VALUES (1,$1,$2,$3,$4,$5) ON CONFLICT DO NOTHING`,
          [it.id, JSON.stringify(it), it.status, it.lessonId, it.type],
        );
      }
      await c.query('INSERT INTO content_head (only_row, revision) VALUES (true, 1)');
    }
  });

  const admin = await one<{ id: string }>('SELECT id FROM users WHERE lower(email) = lower($1)', [adminEmail]);
  let adminId = admin?.id;
  if (!adminId) {
    const r = await one<{ id: string }>(
      'INSERT INTO users (role, email, display_name, password_hash) VALUES ($1,$2,$3,$4) RETURNING id',
      ['admin', adminEmail, 'Quản trị viên', await hashPassword(adminPassword)],
    );
    adminId = r?.id;
    log(`Tài khoản quản trị: ${adminEmail} / ${adminPassword}   ← đổi ngay sau lần đăng nhập đầu`);
  }

  let teacher = await one<{ id: string }>('SELECT id FROM users WHERE lower(email) = lower($1)', [teacherEmail]);
  if (!teacher) {
    teacher = await one<{ id: string }>(
      'INSERT INTO users (role, email, display_name, password_hash) VALUES ($1,$2,$3,$4) RETURNING id',
      ['teacher', teacherEmail, 'Cô Ngọc Anh', await hashPassword(teacherPassword)],
    );
    log(`Tài khoản giáo viên: ${teacherEmail} / ${teacherPassword}   ← đổi ngay sau lần đăng nhập đầu`);
  }

  let cls = await one<{ id: string }>('SELECT id FROM classrooms WHERE code = $1', [classCode]);
  if (!cls && teacher) {
    cls = await one<{ id: string }>('INSERT INTO classrooms (name, code, created_by) VALUES ($1,$2,$3) RETURNING id', [
      'Lớp YCT 1 — A',
      classCode,
      teacher.id,
    ]);
    await query('INSERT INTO memberships (user_id, classroom_id, role) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING', [
      teacher.id,
      cls?.id,
      'teacher',
    ]);
  }

  if (cls) {
    for (const nickname of ['Bé Mít', 'Bé Na']) {
      const exists = await one<{ id: string }>(
        `SELECT u.id FROM users u JOIN memberships m ON m.user_id=u.id
          WHERE m.classroom_id=$1 AND lower(u.display_name)=lower($2)`,
        [cls.id, nickname],
      );
      if (exists) continue;
      const su = await one<{ id: string }>(
        'INSERT INTO users (role, display_name) VALUES ($1,$2) RETURNING id',
        ['student', nickname],
      );
      await query('INSERT INTO memberships (user_id, classroom_id, role, access_hash) VALUES ($1,$2,$3,$4)', [
        su?.id,
        cls.id,
        'student',
        await hashPassword(studentCode),
      ]);
    }
    log(`Lớp mẫu: mã lớp ${classCode}, mã truy cập học sinh ${studentCode}`);
  }

  return { adminEmail, adminPassword, classCode, studentCode };
}

const isMain = isMainModule(import.meta.url);
if (isMain) {
  Promise.resolve()
    .then(() => {
      requireDatabaseUrl();
      return seed();
    })
    .then(() => closePool())
    .catch((e: unknown) => {
      console.error(describeError(e));
      process.exit(1);
    });
}
