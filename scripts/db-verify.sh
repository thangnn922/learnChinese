#!/usr/bin/env bash
# Đối chiếu lược đồ và số dòng giữa hai cơ sở dữ liệu (nguồn và bản khôi phục).
#
#   DATABASE_URL='…' TARGET_DATABASE_URL='…' ./scripts/db-verify.sh
#
# Chỉ đọc SỐ LƯỢNG dòng và tên bảng — không in nội dung dữ liệu của học sinh.
set -euo pipefail
: "${DATABASE_URL:?Thiếu DATABASE_URL}"
: "${TARGET_DATABASE_URL:?Thiếu TARGET_DATABASE_URL}"
PSQL="${PSQL:-psql}"

counts() {
  "$PSQL" -tAX "$1" <<'SQL'
SELECT string_agg(line, E'\n' ORDER BY line) FROM (
  SELECT format('%s=%s', c.relname,
                (xpath('/row/c/text()',
                       query_to_xml(format('SELECT count(*) AS c FROM public.%I', c.relname),
                                    false, true, '')))[1]::text::bigint) AS line
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'public' AND c.relkind = 'r'
) s;
SQL
}

A=$(counts "$DATABASE_URL")
B=$(counts "$TARGET_DATABASE_URL")

if [ "$A" = "$B" ]; then
  echo "KHỚP — cùng danh sách bảng và cùng số dòng:"
  echo "$A" | sed 's/^/  /'
  exit 0
fi
echo "KHÁC NHAU (trái = nguồn, phải = đích):" >&2
diff <(echo "$A") <(echo "$B") || true
exit 1
