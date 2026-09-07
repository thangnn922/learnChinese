// pg là gói CommonJS: nhập mặc định rồi lấy Pool ra (ESM named import không dùng được).
import pg from 'pg';
import type { PoolClient } from 'pg';

const { Pool } = pg;

/**
 * TLS cho kết nối Postgres.
 *
 * Neon bắt buộc TLS và dùng chứng chỉ do CA công cộng cấp, nên kho CA sẵn có của Node
 * xác minh được. KHÔNG dùng rejectUnauthorized: false — như vậy là mã hoá mà không biết
 * đang nói chuyện với ai.
 * Chỉ tắt TLS khi nói rõ (`sslmode=disable`) hoặc khi DB nằm ngay trên máy lập trình viên.
 */
function sslOption(raw: string | undefined): false | { rejectUnauthorized: true } {
  if (!raw) return false;
  let host = '';
  let mode = '';
  try {
    const u = new URL(raw);
    host = u.hostname;
    mode = u.searchParams.get('sslmode') ?? '';
  } catch {
    // Chuỗi kết nối không phân tích được theo dạng URL (ví dụ dạng key=value).
    // Không đoán mò: theo PGSSLMODE, mặc định là bật TLS có xác minh.
  }
  mode = mode || process.env.PGSSLMODE || '';
  if (mode === 'disable') return false;
  const isLocal = host === 'localhost' || host === '127.0.0.1' || host === '::1' || host === '';
  if (isLocal && mode === '') return false;
  return { rejectUnauthorized: true };
}

/**
 * Chuẩn hoá `sslmode` trong chuỗi kết nối.
 *
 * `pg` hiện coi `sslmode=require` như `verify-full` nhưng in SECURITY WARNING mỗi lần kết nối,
 * và ở bản major kế tiếp sẽ đổi sang ngữ nghĩa libpq — yếu hơn. Ta đã truyền `ssl` tường minh
 * nên hành vi không đổi dù thư viện đổi; đổi luôn giá trị trong chuỗi để log triển khai không
 * còn cảnh báo nói ngược với điều đang thực sự làm.
 * Chuỗi không phân tích được thì giữ nguyên, không đoán.
 */
function normalizeSslMode(raw: string | undefined, tlsOn: boolean): string | undefined {
  if (!raw || !tlsOn) return raw;
  try {
    const u = new URL(raw);
    const mode = u.searchParams.get('sslmode');
    if (mode === 'require' || mode === 'prefer' || mode === 'verify-ca') {
      u.searchParams.set('sslmode', 'verify-full');
      return u.toString();
    }
    return raw;
  } catch {
    return raw;
  }
}

const sslConfig = sslOption(process.env.DATABASE_URL);

/**
 * Kết nối Postgres. Mọi truy vấn dùng tham số hoá ($1, $2…) — không nối chuỗi SQL.
 *
 * Pool giữ nhỏ: ứng dụng chạy một tiến trình, còn Neon tính tiền theo thời gian compute
 * thức — nhiều kết nối rảnh chỉ làm chậm lúc ngủ chứ không phục vụ thêm ai.
 */
export const pool = new Pool({
  connectionString: normalizeSslMode(process.env.DATABASE_URL, sslConfig !== false),
  // Tuỳ chọn này được `pg` ưu tiên hơn sslmode trong chuỗi kết nối, nên việc xác minh
  // chứng chỉ được bảo đảm bất kể thư viện đổi mặc định.
  ssl: sslConfig,
  max: Number(process.env.PG_POOL_MAX ?? 5),
  idleTimeoutMillis: 30_000,
  // Neon ngủ khi rảnh; lần kết nối đầu sau khi ngủ phải chờ compute thức dậy.
  connectionTimeoutMillis: Number(process.env.PG_CONNECT_TIMEOUT_MS ?? 15_000),
  // Truy vấn treo không được giữ kết nối mãi.
  statement_timeout: Number(process.env.PG_STATEMENT_TIMEOUT_MS ?? 20_000),
  idle_in_transaction_session_timeout: 20_000,
});

/* Lỗi trên kết nối đang rảnh (Neon đóng kết nối khi ngủ) không được làm sập tiến trình. */
pool.on('error', (e) => {
  console.error('[pg] kết nối rảnh gặp lỗi:', e.name);
});

export async function query<T extends Record<string, unknown> = Record<string, unknown>>(
  text: string,
  params: unknown[] = [],
): Promise<T[]> {
  const r = await pool.query(text, params as never[]);
  return r.rows as T[];
}

export async function one<T extends Record<string, unknown> = Record<string, unknown>>(
  text: string,
  params: unknown[] = [],
): Promise<T | null> {
  const rows = await query<T>(text, params);
  return rows[0] ?? null;
}

/** Giao dịch: hoặc tất cả thành công, hoặc không có gì được ghi. */
export async function tx<T>(fn: (c: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const out = await fn(client);
    await client.query('COMMIT');
    return out;
  } catch (e) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw e;
  } finally {
    client.release();
  }
}

export async function closePool(): Promise<void> {
  await pool.end();
}
