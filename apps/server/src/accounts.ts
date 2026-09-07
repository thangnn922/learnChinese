/**
 * Tạo tài khoản giáo viên và học sinh.
 *
 * Giao diện quản trị chỉ tạo được tài khoản người lớn (POST /api/admin/users) và KHÔNG có
 * chỗ nào tạo học sinh — seed làm việc đó một lần rồi thôi. Script này lấp chỗ đó, đi qua đúng
 * cùng cách băm mật khẩu và cùng ràng buộc lược đồ mà ứng dụng dùng.
 *
 *   TEACHER_LOGIN=… TEACHER_PASSWORD=… TEACHER_NAME=… npm run -w @yct/server account teacher
 *   CLASS_CODE=… CLASS_NAME=… TEACHER_LOGIN=… STUDENT_NICKNAME=… STUDENT_ACCESS_CODE=… \
 *     npm run -w @yct/server account student
 *
 * Idempotent: chạy lại với cùng tên sẽ không tạo bản sao. Mật khẩu KHÔNG bao giờ được in ra
 * và không được ghi vào tệp nào.
 */
import { query, one, tx, closePool } from './db.js';
import { hashPassword } from './auth.js';
import { isMainModule } from './is-main.js';
import { describeError, requireDatabaseUrl } from './startup.js';

/** Mật khẩu yếu trên một địa chỉ công khai là rủi ro thật — cảnh báo, không chặn. */
function weakPasswordWarning(pw: string, label: string): string | null {
  const problems: string[] = [];
  if (pw.length < 12) problems.push('ngắn hơn 12 ký tự');
  if (!/[A-Z]/.test(pw) || !/[a-z]/.test(pw)) problems.push('không có cả chữ hoa lẫn chữ thường');
  if (/^[A-Za-z]+[^A-Za-z]*\d{1,4}$/.test(pw)) problems.push('theo mẫu dễ đoán "chữ + số"');
  return problems.length ? `Cảnh báo: mật khẩu ${label} ${problems.join(', ')}.` : null;
}

export async function addTeacher(opts: {
  login: string;
  password: string;
  displayName: string;
  role?: 'teacher' | 'admin';
}): Promise<{ userId: string; created: boolean }> {
  const role = opts.role ?? 'teacher';
  if (opts.password.length < 10) throw new Error('Mật khẩu phải dài ít nhất 10 ký tự.');

  const existing = await one<{ id: string }>('SELECT id FROM users WHERE lower(email) = lower($1)', [opts.login]);
  if (existing) {
    // Không âm thầm đổi mật khẩu tài khoản đang có — đó là hành vi nguy hiểm cho một script.
    return { userId: existing.id, created: false };
  }
  const hash = await hashPassword(opts.password);
  const row = await one<{ id: string }>(
    'INSERT INTO users (role, email, display_name, password_hash) VALUES ($1,$2,$3,$4) RETURNING id',
    [role, opts.login, opts.displayName, hash],
  );
  await query('INSERT INTO audit_events (actor_id, action, target, details) VALUES ($1,$2,$3,$4)', [
    row?.id ?? null,
    'admin.create_user',
    `user:${row?.id}`,
    JSON.stringify({ role, via: 'scripts/account' }),
  ]);
  return { userId: row!.id, created: true };
}

export async function addStudent(opts: {
  classCode: string;
  className: string;
  teacherLogin: string;
  nickname: string;
  accessCode: string;
}): Promise<{ userId: string; classroomId: string; createdUser: boolean; createdClass: boolean }> {
  if (opts.accessCode.length < 4) throw new Error('Mã truy cập phải dài ít nhất 4 ký tự.');

  const teacher = await one<{ id: string; role: string }>(
    'SELECT id, role FROM users WHERE lower(email) = lower($1) AND disabled = false',
    [opts.teacherLogin],
  );
  if (!teacher) throw new Error(`Không tìm thấy tài khoản giáo viên đang hoạt động: ${opts.teacherLogin}`);
  if (teacher.role !== 'teacher' && teacher.role !== 'admin') {
    throw new Error('Chủ lớp phải là tài khoản giáo viên hoặc quản trị.');
  }

  return tx(async (c) => {
    let createdClass = false;
    let cls = (await c.query<{ id: string }>('SELECT id FROM classrooms WHERE code = $1', [opts.classCode])).rows[0];
    if (!cls) {
      cls = (
        await c.query<{ id: string }>(
          'INSERT INTO classrooms (name, code, created_by) VALUES ($1,$2,$3) RETURNING id',
          [opts.className, opts.classCode, teacher.id],
        )
      ).rows[0];
      createdClass = true;
    }
    const classroomId = cls!.id;

    // giáo viên phải là thành viên lớp thì mới xem được báo cáo của lớp đó
    await c.query(
      "INSERT INTO memberships (user_id, classroom_id, role) VALUES ($1,$2,'teacher') ON CONFLICT DO NOTHING",
      [teacher.id, classroomId],
    );

    // Biệt danh là thứ học sinh gõ khi đăng nhập nên phải là duy nhất TRONG lớp.
    const existing = (
      await c.query<{ id: string }>(
        `SELECT u.id FROM users u JOIN memberships m ON m.user_id = u.id
          WHERE m.classroom_id = $1 AND lower(u.display_name) = lower($2)`,
        [classroomId, opts.nickname],
      )
    ).rows[0];
    if (existing) return { userId: existing.id, classroomId, createdUser: false, createdClass };

    // Học sinh KHÔNG có email — lược đồ cấm (ràng buộc student_has_no_email).
    const su = (
      await c.query<{ id: string }>("INSERT INTO users (role, display_name) VALUES ('student',$1) RETURNING id", [
        opts.nickname,
      ])
    ).rows[0];
    await c.query('INSERT INTO memberships (user_id, classroom_id, role, access_hash) VALUES ($1,$2,$3,$4)', [
      su!.id,
      classroomId,
      'student',
      await hashPassword(opts.accessCode),
    ]);
    return { userId: su!.id, classroomId, createdUser: true, createdClass };
  });
}

if (isMainModule(import.meta.url)) {
  const sub = process.argv[2];
  const need = (name: string): string => {
    const v = process.env[name];
    if (!v || v.trim() === '') throw new Error(`Thiếu biến môi trường ${name}.`);
    return v;
  };

  Promise.resolve()
    .then(async () => {
      requireDatabaseUrl();
      if (sub === 'teacher') {
        const login = need('TEACHER_LOGIN');
        const password = need('TEACHER_PASSWORD');
        const warn = weakPasswordWarning(password, `của ${login}`);
        const r = await addTeacher({
          login,
          password,
          displayName: process.env.TEACHER_NAME ?? login,
          role: process.env.TEACHER_ROLE === 'admin' ? 'admin' : 'teacher',
        });
        console.log(
          r.created
            ? `Đã tạo tài khoản giáo viên "${login}".`
            : `Tài khoản "${login}" đã tồn tại — KHÔNG đổi mật khẩu, không tạo bản sao.`,
        );
        if (warn && r.created) console.log(warn);
      } else if (sub === 'student') {
        const r = await addStudent({
          classCode: need('CLASS_CODE'),
          className: process.env.CLASS_NAME ?? need('CLASS_CODE'),
          teacherLogin: need('TEACHER_LOGIN'),
          nickname: need('STUDENT_NICKNAME'),
          accessCode: need('STUDENT_ACCESS_CODE'),
        });
        if (r.createdClass) console.log(`Đã tạo lớp "${process.env.CLASS_NAME ?? process.env.CLASS_CODE}".`);
        console.log(
          r.createdUser
            ? `Đã thêm học sinh "${process.env.STUDENT_NICKNAME}" vào lớp ${process.env.CLASS_CODE}.`
            : `Học sinh "${process.env.STUDENT_NICKNAME}" đã có trong lớp ${process.env.CLASS_CODE} — không tạo bản sao.`,
        );
      } else {
        throw new Error('Dùng: npm run -w @yct/server account teacher | student');
      }
      return closePool();
    })
    .catch((e: unknown) => {
      console.error(describeError(e));
      process.exit(1);
    });
}
