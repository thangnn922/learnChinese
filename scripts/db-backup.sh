#!/usr/bin/env bash
# Sao lưu toàn bộ cơ sở dữ liệu ra một tệp nén định dạng custom của PostgreSQL.
#
#   DATABASE_URL='postgres://…' ./scripts/db-backup.sh [thư-mục-đích]
#
# Với Neon: dùng chuỗi kết nối TRỰC TIẾP (không qua pooler) — pg_dump cần session bền.
# Tệp kết quả CHỨA DỮ LIỆU HỌC SINH: để trong thư mục riêng đã được bảo vệ, không đưa vào Git,
# không tải lên nơi chia sẻ công khai.
set -euo pipefail

: "${DATABASE_URL:?Thiếu DATABASE_URL — không đoán cơ sở dữ liệu nguồn.}"
OUT_DIR="${1:-${BACKUP_DIR:-./backups}}"
PG_DUMP="${PG_DUMP:-pg_dump}"

command -v "$PG_DUMP" >/dev/null 2>&1 || {
  echo "Không tìm thấy pg_dump. Cài PostgreSQL client (ví dụ: brew install libpq) rồi đặt PG_DUMP=/đường/dẫn/pg_dump." >&2
  exit 1
}

mkdir -p "$OUT_DIR"
chmod 700 "$OUT_DIR" 2>/dev/null || true
STAMP="$(date +%Y%m%d-%H%M%S)"
FILE="$OUT_DIR/yct-$STAMP.dump"

# --no-owner/--no-acl: khôi phục được sang cơ sở dữ liệu có chủ sở hữu khác (Neon, máy local).
"$PG_DUMP" --format=custom --compress=9 --no-owner --no-acl --file="$FILE" "$DATABASE_URL"

SIZE=$(wc -c < "$FILE" | tr -d ' ')
[ "$SIZE" -gt 1000 ] || { echo "Tệp sao lưu quá nhỏ ($SIZE byte) — nghi ngờ thất bại." >&2; exit 1; }
chmod 600 "$FILE"
echo "Đã sao lưu: $FILE ($SIZE byte)"
echo "Kiểm tra nhanh nội dung: pg_restore --list \"$FILE\" | head"
