/**
 * Kiểm tra cấu hình và mô tả lỗi cho các lệnh chạy từ dòng lệnh.
 *
 * Hai vấn đề mà tệp này giải quyết, cả hai đều làm việc triển khai khó chẩn đoán:
 *  1. Thiếu DATABASE_URL thì `pg` âm thầm thử localhost:5432 — sai máy chủ, sai thông báo.
 *  2. Lỗi kết nối của Node là `AggregateError` có `message` RỖNG. In mỗi `e.message`
 *     ra màn hình trống trơn, lệnh thoát với mã 1 mà không nói vì sao.
 */

/** Bắt buộc phải có chuỗi kết nối; không đoán, không thử localhost. */
export function requireDatabaseUrl(): string {
  const url = process.env.DATABASE_URL;
  if (!url || url.trim() === '') {
    throw new Error(
      'Thiếu biến môi trường DATABASE_URL.\n' +
        'Đặt chuỗi kết nối rồi chạy lại, ví dụ:\n' +
        "  export DATABASE_URL='postgresql://…?sslmode=require'\n" +
        'Với Neon: dùng chuỗi TRỰC TIẾP (host không có "-pooler") cho migration và sao lưu.',
    );
  }
  return url;
}

/**
 * Mô tả lỗi đủ để sửa được: tên, mã, thông điệp, và cả các lỗi con của AggregateError.
 * KHÔNG in chuỗi kết nối hay bất kỳ giá trị bí mật nào.
 */
export function describeError(e: unknown): string {
  if (!(e instanceof Error)) return String(e);

  const parts: string[] = [];
  const code = (e as { code?: unknown }).code;
  const head = [e.name, typeof code === 'string' ? `(${code})` : null, e.message || null]
    .filter(Boolean)
    .join(' ');
  parts.push(head || 'Lỗi không rõ nguyên nhân.');

  // Node gom nhiều lần thử kết nối (IPv4/IPv6) vào một AggregateError rỗng thông điệp.
  const subs = (e as { errors?: unknown }).errors;
  if (Array.isArray(subs)) {
    for (const s of subs) {
      if (s instanceof Error) {
        const sc = (s as { code?: unknown }).code;
        parts.push(`  → ${[s.name, typeof sc === 'string' ? `(${sc})` : null, s.message].filter(Boolean).join(' ')}`);
      }
    }
  }

  const cause = (e as { cause?: unknown }).cause;
  if (cause instanceof Error) parts.push(`  ← nguyên nhân: ${cause.name}: ${cause.message}`);

  return parts.join('\n');
}
