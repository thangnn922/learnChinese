import { randomBytes, scrypt as scryptCb, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { query, one } from './db.js';

const scrypt = promisify(scryptCb) as (
  password: string | Buffer,
  salt: string | Buffer,
  keylen: number,
) => Promise<Buffer>;

/**
 * Băm mật khẩu bằng scrypt của Node (không cần thư viện biên dịch gốc).
 * Định dạng: scrypt$N$r$p$<salt-b64>$<hash-b64>
 * Nếu triển khai thật muốn Argon2id, thay hàm này và thêm migration băm lại khi đăng nhập.
 */
const N = 16384;
const R = 8;
const P = 1;
const KEYLEN = 32;

export async function hashPassword(plain: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await scrypt(plain, salt, KEYLEN);
  return `scrypt$${N}$${R}$${P}$${salt.toString('base64')}$${key.toString('base64')}`;
}

export async function verifyPassword(plain: string, stored: string | null): Promise<boolean> {
  if (!stored) return false;
  const parts = stored.split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false;
  const salt = Buffer.from(parts[4] as string, 'base64');
  const expect = Buffer.from(parts[5] as string, 'base64');
  const key = await scrypt(plain, salt, expect.length);
  return key.length === expect.length && timingSafeEqual(key, expect);
}

/* ── phiên ─────────────────────────────────────────────────────────────── */

export const SESSION_COOKIE = 'sid';
export const CSRF_COOKIE = 'csrf';
const SESSION_TTL_MS = 12 * 60 * 60 * 1000; // 12 giờ

export interface AuthUser {
  userId: string;
  role: 'admin' | 'teacher' | 'student';
  displayName: string;
  classroomIds: string[];
}

const secure = process.env.NODE_ENV === 'production';

export async function createSession(reply: FastifyReply, userId: string): Promise<void> {
  const sid = randomBytes(32).toString('base64url');
  const csrf = randomBytes(32).toString('base64url');
  const expires = new Date(Date.now() + SESSION_TTL_MS);
  await query('INSERT INTO sessions (id, user_id, csrf_token, expires_at) VALUES ($1,$2,$3,$4)', [
    sid,
    userId,
    csrf,
    expires,
  ]);
  // Cookie phiên: HttpOnly (JS không đọc được), Secure khi chạy HTTPS, SameSite=Lax
  reply.setCookie(SESSION_COOKIE, sid, {
    httpOnly: true,
    secure,
    sameSite: 'lax',
    path: '/',
    expires,
  });
  // Cookie CSRF: JS ĐỌC ĐƯỢC vì client phải gửi lại trong header (double-submit).
  // Cookie này không cấp quyền gì nếu không có cookie phiên đi kèm.
  reply.setCookie(CSRF_COOKIE, csrf, {
    httpOnly: false,
    secure,
    sameSite: 'lax',
    path: '/',
    expires,
  });
}

export async function destroySession(req: FastifyRequest, reply: FastifyReply): Promise<void> {
  const sid = req.cookies[SESSION_COOKIE];
  if (sid) await query('DELETE FROM sessions WHERE id = $1', [sid]);
  reply.clearCookie(SESSION_COOKIE, { path: '/' });
  reply.clearCookie(CSRF_COOKIE, { path: '/' });
}

export async function loadUser(req: FastifyRequest): Promise<AuthUser | null> {
  const sid = req.cookies[SESSION_COOKIE];
  if (!sid) return null;
  const row = await one<{
    user_id: string;
    role: AuthUser['role'];
    display_name: string;
    disabled: boolean;
    csrf_token: string;
  }>(
    `SELECT s.user_id, s.csrf_token, u.role, u.display_name, u.disabled
       FROM sessions s JOIN users u ON u.id = s.user_id
      WHERE s.id = $1 AND s.expires_at > now()`,
    [sid],
  );
  if (!row || row.disabled) return null;
  const classes = await query<{ classroom_id: string }>(
    'SELECT classroom_id FROM memberships WHERE user_id = $1',
    [row.user_id],
  );
  (req as FastifyRequest & { csrfToken?: string }).csrfToken = row.csrf_token;
  return {
    userId: row.user_id,
    role: row.role,
    displayName: row.display_name,
    classroomIds: classes.map((c) => c.classroom_id),
  };
}

/**
 * Kiểm tra CSRF cho mọi thao tác thay đổi dữ liệu ĐƯỢC XÁC THỰC BẰNG COOKIE.
 *
 * Chỉ bắt buộc khi request đã mang cookie phiên: lúc đó cookie mới là thứ cấp quyền,
 * nên cần double-submit token để trang khác không lợi dụng được.
 * Request đăng nhập chưa có phiên nên không áp dụng; chống login-CSRF dựa vào
 * SameSite=Lax của cookie phiên và giới hạn tần suất.
 */
export function csrfOk(req: FastifyRequest): boolean {
  const method = req.method.toUpperCase();
  if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') return true;
  if (!req.cookies[SESSION_COOKIE]) return true;
  const fromHeader = req.headers['x-csrf-token'];
  const fromCookie = req.cookies[CSRF_COOKIE];
  if (!fromHeader || !fromCookie || typeof fromHeader !== 'string') return false;
  const a = Buffer.from(fromHeader);
  const b = Buffer.from(fromCookie);
  return a.length === b.length && timingSafeEqual(a, b);
}

/* ── giới hạn tần suất đăng nhập ───────────────────────────────────────── */

const WINDOW_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 10;

export async function throttle(key: string): Promise<boolean> {
  const rows = await query<{ attempts: number; window_start: Date }>(
    `INSERT INTO login_throttle (key, window_start, attempts)
     VALUES ($1, now(), 1)
     ON CONFLICT (key) DO UPDATE SET
       window_start = CASE WHEN login_throttle.window_start < now() - ($2 || ' milliseconds')::interval
                           THEN now() ELSE login_throttle.window_start END,
       attempts = CASE WHEN login_throttle.window_start < now() - ($2 || ' milliseconds')::interval
                       THEN 1 ELSE login_throttle.attempts + 1 END
     RETURNING attempts, window_start`,
    [key, String(WINDOW_MS)],
  );
  return (rows[0]?.attempts ?? 1) <= MAX_ATTEMPTS;
}

export async function clearThrottle(key: string): Promise<void> {
  await query('DELETE FROM login_throttle WHERE key = $1', [key]);
}
