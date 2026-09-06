import { realpathSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Tệp này có phải là tệp được gọi trực tiếp từ dòng lệnh không?
 *
 * KHÔNG so sánh chuỗi `import.meta.url` với `process.argv[1]`: URL được mã hoá phần trăm,
 * nên chỉ cần đường dẫn có dấu cách (ví dụ thư mục "Claude outputs") là phép so sánh sai,
 * và script sẽ THOÁT ÊM mà không làm gì — migration coi như đã chạy trong khi lược đồ vẫn trống.
 * So sánh đường dẫn thật đã phân giải nên đúng với mọi tên thư mục và cả symlink.
 */
export function isMainModule(importMetaUrl: string): boolean {
  const entry = process.argv[1];
  if (!entry) return false;
  const real = (p: string): string => {
    try {
      return realpathSync(p);
    } catch {
      return resolve(p);
    }
  };
  return real(fileURLToPath(importMetaUrl)) === real(entry);
}
