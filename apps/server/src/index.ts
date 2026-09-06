import { buildApp } from './app.js';
import { closePool } from './db.js';

const isProd = process.env.NODE_ENV === 'production';

/**
 * Cổng lắng nghe.
 * Trên nền tảng lưu trữ (Render) biến PORT LUÔN được đặt sẵn — thiếu nó là cấu hình sai,
 * nên báo lỗi rõ ràng thay vì đoán. Giá trị mặc định chỉ dành cho máy lập trình viên.
 */
function readPort(): number {
  const raw = process.env.PORT;
  if (raw === undefined || raw.trim() === '') {
    if (isProd) {
      console.error('Thiếu biến môi trường PORT. Nền tảng lưu trữ phải cấp cổng cho tiến trình này.');
      process.exit(1);
    }
    return 8787;
  }
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 1 || n > 65535) {
    console.error('PORT không hợp lệ: phải là số nguyên trong khoảng 1–65535.');
    process.exit(1);
  }
  return n;
}

/** Trong container phải nghe trên mọi giao diện mạng, nếu không reverse proxy không vào được. */
const port = readPort();
const host = process.env.HOST ?? (isProd ? '0.0.0.0' : '127.0.0.1');

const app = await buildApp();

try {
  await app.listen({ port, host });
  console.log(`Máy chủ đang nghe tại ${host}:${port}`);
} catch (e) {
  console.error((e as Error).message);
  await closePool().catch(() => undefined);
  process.exit(1);
}

/* Tắt có kiểm soát: ngừng nhận request mới, đóng kết nối HTTP đang mở, rồi đóng pool
   Postgres. Có hạn giờ để một kết nối treo không giữ tiến trình lại mãi. */
let shuttingDown = false;
async function shutdown(signal: string): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`Nhận ${signal}, đang dừng…`);
  const timer = setTimeout(() => {
    console.error('Quá hạn dừng êm — thoát cưỡng bức.');
    process.exit(1);
  }, 15_000);
  timer.unref();
  try {
    await app.close();
    await closePool();
    clearTimeout(timer);
    process.exit(0);
  } catch (e) {
    console.error('Lỗi khi dừng:', (e as Error).message);
    process.exit(1);
  }
}

for (const sig of ['SIGINT', 'SIGTERM'] as const) {
  process.on(sig, () => void shutdown(sig));
}
