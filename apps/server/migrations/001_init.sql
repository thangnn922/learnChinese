-- Lược đồ khởi tạo. Chạy: npm run db:migrate
-- Mọi thay đổi sau này thêm tệp mới 002_*.sql, KHÔNG sửa tệp đã chạy.

CREATE TABLE IF NOT EXISTS schema_migrations (
  name        text PRIMARY KEY,
  applied_at  timestamptz NOT NULL DEFAULT now()
);

/* ── người dùng ─────────────────────────────────────────────────────────
   Học sinh chỉ có biệt danh + mã truy cập do giáo viên cấp.
   KHÔNG lưu email cá nhân, ngày sinh đầy đủ, ảnh mặt hay số điện thoại của trẻ. */
CREATE TABLE users (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  role          text NOT NULL CHECK (role IN ('admin', 'teacher', 'student')),
  -- chỉ tài khoản người lớn (admin/teacher) mới có email
  email         text UNIQUE,
  display_name  text NOT NULL,
  password_hash text,
  disabled      boolean NOT NULL DEFAULT false,
  created_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT student_has_no_email CHECK (role <> 'student' OR email IS NULL),
  CONSTRAINT adult_has_email CHECK (role = 'student' OR email IS NOT NULL)
);

CREATE TABLE classrooms (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL,
  -- mã lớp chỉ giúp vào ĐÚNG lớp, không đủ để đọc dữ liệu người khác
  code        text NOT NULL UNIQUE,
  created_by  uuid NOT NULL REFERENCES users (id),
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE memberships (
  user_id      uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  classroom_id uuid NOT NULL REFERENCES classrooms (id) ON DELETE CASCADE,
  role         text NOT NULL CHECK (role IN ('teacher', 'student')),
  -- mã truy cập riêng của học sinh, đã băm
  access_hash  text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, classroom_id)
);
CREATE INDEX memberships_classroom_idx ON memberships (classroom_id);

/* ── phiên đăng nhập ───────────────────────────────────────────────────
   Cookie chỉ mang session id; mọi thứ khác nằm ở đây.
   csrf_token đi kèm để chống CSRF theo kiểu double-submit. */
CREATE TABLE sessions (
  id          text PRIMARY KEY,
  user_id     uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  csrf_token  text NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  expires_at  timestamptz NOT NULL
);
CREATE INDEX sessions_user_idx ON sessions (user_id);

CREATE TABLE login_throttle (
  key           text PRIMARY KEY,
  window_start  timestamptz NOT NULL,
  attempts      int NOT NULL
);

/* ── chương trình & bài ────────────────────────────────────────────── */
CREATE TABLE curricula (
  curriculum_id   text NOT NULL,
  level           int  NOT NULL,
  edition         text NOT NULL,
  name_vi         text NOT NULL,
  source_verified boolean NOT NULL DEFAULT false,
  note_vi         text NOT NULL DEFAULT '',
  PRIMARY KEY (curriculum_id, level)
);

CREATE TABLE lessons (
  lesson_id     text PRIMARY KEY,
  curriculum_id text NOT NULL,
  level         int  NOT NULL,
  n             int  NOT NULL,
  title_zh      text NOT NULL,
  title_pinyin  text NOT NULL,
  title_en      text NOT NULL DEFAULT '',
  title_vi      text NOT NULL,
  goals_vi      jsonb NOT NULL DEFAULT '[]'::jsonb,
  printed_start int,
  printed_end   int,
  FOREIGN KEY (curriculum_id, level) REFERENCES curricula (curriculum_id, level),
  UNIQUE (curriculum_id, level, n)
);

/* ── nội dung theo phiên bản ──────────────────────────────────────────
   Mỗi lần xuất bản tạo MỘT revision mới, chụp lại toàn bộ trạng thái nội dung.
   Lượt học khoá vào một revision → giáo viên xuất bản giữa chừng không đổi đáp án. */
CREATE TABLE content_revisions (
  revision    int PRIMARY KEY,
  created_by  uuid REFERENCES users (id),
  created_at  timestamptz NOT NULL DEFAULT now(),
  note        text NOT NULL DEFAULT '',
  -- revision này được tạo bằng cách quay lại revision nào (nếu là rollback)
  rolled_back_from int
);

CREATE TABLE content_item_versions (
  revision  int  NOT NULL REFERENCES content_revisions (revision),
  item_id   text NOT NULL,
  payload   jsonb NOT NULL,
  status    text NOT NULL CHECK (status IN ('draft', 'reviewed', 'published', 'archived')),
  lesson_id text NOT NULL,
  type      text NOT NULL,
  PRIMARY KEY (revision, item_id)
);
CREATE INDEX civ_lookup_idx ON content_item_versions (revision, lesson_id, status);

-- con trỏ tới revision đang hành (một hàng duy nhất)
CREATE TABLE content_head (
  only_row  boolean PRIMARY KEY DEFAULT true CHECK (only_row),
  revision  int NOT NULL REFERENCES content_revisions (revision)
);

/* ── bài giao ─────────────────────────────────────────────────────── */
CREATE TABLE assignments (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  classroom_id uuid NOT NULL REFERENCES classrooms (id) ON DELETE CASCADE,
  revision     int  NOT NULL REFERENCES content_revisions (revision),
  config       jsonb NOT NULL,
  due_at       timestamptz,
  created_by   uuid NOT NULL REFERENCES users (id),
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX assignments_classroom_idx ON assignments (classroom_id);

/* ── lượt học ─────────────────────────────────────────────────────── */
CREATE TABLE attempts (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  assignment_id uuid REFERENCES assignments (id) ON DELETE SET NULL,
  classroom_id  uuid REFERENCES classrooms (id) ON DELETE SET NULL,
  revision      int  NOT NULL REFERENCES content_revisions (revision),
  mode          text NOT NULL CHECK (mode IN ('practice', 'assessment')),
  -- câu hỏi + ĐÁP ÁN, chỉ đọc ở phía máy chủ, không bao giờ gửi nguyên khối cho client
  question_keys jsonb NOT NULL,
  reduced_note  text,
  cursor        int NOT NULL DEFAULT 0,
  label         text NOT NULL DEFAULT '',
  created_at    timestamptz NOT NULL DEFAULT now(),
  finished_at   timestamptz
);
CREATE INDEX attempts_user_idx ON attempts (user_id, created_at DESC);
CREATE INDEX attempts_classroom_idx ON attempts (classroom_id);

CREATE TABLE answer_events (
  idempotency_key text PRIMARY KEY,
  attempt_id      uuid NOT NULL REFERENCES attempts (id) ON DELETE CASCADE,
  question_id     text NOT NULL,
  kind            text NOT NULL,
  content_ids     jsonb NOT NULL,
  response        text NOT NULL,
  try_index       int  NOT NULL,
  correct         boolean NOT NULL,
  skipped         boolean NOT NULL,
  assistance_used jsonb NOT NULL DEFAULT '[]'::jsonb,
  active_ms       int  NOT NULL DEFAULT 0,
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX answer_attempt_idx ON answer_events (attempt_id);
-- một câu + một lần thử chỉ được ghi đúng một lần
CREATE UNIQUE INDEX answer_unique_try ON answer_events (attempt_id, question_id, try_index);

CREATE TABLE self_reports (
  idempotency_key text PRIMARY KEY,
  attempt_id      uuid NOT NULL REFERENCES attempts (id) ON DELETE CASCADE,
  content_id      text NOT NULL,
  remembered      boolean NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX self_reports_attempt_idx ON self_reports (attempt_id);

CREATE TABLE review_states (
  user_id     uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  content_id  text NOT NULL,
  step        int  NOT NULL,
  due_at      timestamptz,
  last_result text,
  PRIMARY KEY (user_id, content_id)
);

/* ── nhật ký kiểm toán ────────────────────────────────────────────────
   Rollback nội dung KHÔNG được xoá nhật ký này. */
CREATE TABLE audit_events (
  id         bigserial PRIMARY KEY,
  at         timestamptz NOT NULL DEFAULT now(),
  actor_id   uuid REFERENCES users (id),
  action     text NOT NULL,
  target     text NOT NULL DEFAULT '',
  details    jsonb NOT NULL DEFAULT '{}'::jsonb,
  ip_hash    text
);
CREATE INDEX audit_at_idx ON audit_events (at DESC);
