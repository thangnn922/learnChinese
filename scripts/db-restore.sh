#!/usr/bin/env bash
# Khôi phục một tệp sao lưu vào cơ sở dữ liệu ĐÍCH.
#
#   TARGET_DATABASE_URL='postgres://…' ./scripts/db-restore.sh backups/yct-….dump
#
# Quy tắc an toàn:
#  - Chỉ ghi vào TARGET_DATABASE_URL. Không bao giờ đọc DATABASE_URL để tránh ghi nhầm vào DB đang chạy.
#  - Từ chối nếu đích đã có bảng, trừ khi đặt ALLOW_NON_EMPTY=1 (dùng khi cố ý khôi phục đè).
set -euo pipefail

: "${TARGET_DATABASE_URL:?Thiếu TARGET_DATABASE_URL — đích khôi phục phải được nêu rõ ràng.}"
DUMP="${1:?Thiếu đường dẫn tệp .dump}"
[ -f "$DUMP" ] || { echo "Không thấy tệp: $DUMP" >&2; exit 1; }

PG_RESTORE="${PG_RESTORE:-pg_restore}"
PSQL="${PSQL:-psql}"

if [ "${DATABASE_URL:-}" = "$TARGET_DATABASE_URL" ]; then
  echo "TARGET_DATABASE_URL trùng DATABASE_URL. Khôi phục vào chính DB đang chạy phải làm có chủ đích, không qua script này." >&2
  exit 1
fi

EXISTING=$("$PSQL" -tAX "$TARGET_DATABASE_URL" -c \
  "SELECT count(*) FROM information_schema.tables WHERE table_schema='public'")
if [ "${EXISTING:-0}" -ne 0 ] && [ "${ALLOW_NON_EMPTY:-0}" != "1" ]; then
  echo "Đích đã có $EXISTING bảng. Dừng lại để không ghi đè. Đặt ALLOW_NON_EMPTY=1 nếu thực sự muốn." >&2
  exit 1
fi

"$PG_RESTORE" --no-owner --no-acl --exit-on-error --dbname="$TARGET_DATABASE_URL" "$DUMP"
echo "Đã khôi phục vào cơ sở dữ liệu đích."
echo "Hãy đối chiếu số dòng: ./scripts/db-verify.sh"
