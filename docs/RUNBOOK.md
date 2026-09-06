# Vận hành

## Phân quyền và tài khoản

| Vai trò | Cách tạo | Làm được gì |
|---|---|---|
| `admin` | `npm run db:seed` lần đầu, sau đó `POST /api/admin/users` | tạo tài khoản người lớn, xem mọi lớp |
| `teacher` | admin cấp | chỉ lớp được gán; sửa/duyệt/xuất bản nội dung; giao bài; xem báo cáo lớp mình |
| `student` | giáo viên tạo trong lớp | chỉ đọc dữ liệu của chính mình và bài được giao |

**Không có đăng ký tự do.** Học sinh đăng nhập bằng **mã lớp + biệt danh + mã truy cập riêng**;
mã lớp một mình không đủ (kiểm thử `SEC-02`).

Seed in mật khẩu ra **một lần** rồi thôi. Nếu không đặt `SEED_*`, mật khẩu được sinh ngẫu nhiên.
Đổi ngay sau lần đăng nhập đầu.

## Sao lưu

Toàn bộ trạng thái nằm trong PostgreSQL. Không có state nào ở đĩa của tiến trình app.

```bash
# sao lưu đầy đủ, nén, có thời điểm
pg_dump --format=custom --no-owner --file="yct-$(date -u +%Y%m%dT%H%M%SZ).dump" "$DATABASE_URL"

# chỉ lược đồ (để so sánh khi nâng cấp)
pg_dump --schema-only --no-owner --file=schema.sql "$DATABASE_URL"
```

Khuyến nghị: sao lưu hằng ngày + WAL archiving nếu cần khôi phục theo thời điểm.
Lưu bản sao ở nơi khác máy chủ ứng dụng, mã hoá khi lưu trữ.

## Khôi phục

```bash
createdb yct_restore
pg_restore --no-owner --dbname=yct_restore yct-2026….dump
DATABASE_URL=postgres://…/yct_restore npm run db:migrate    # áp migration mới nếu có
```

Kiểm tra sau khôi phục:

```sql
SELECT revision FROM content_head;                      -- có đúng một hàng
SELECT count(*) FROM content_item_versions WHERE revision = (SELECT revision FROM content_head);
SELECT count(*) FROM attempts;
SELECT max(at) FROM audit_events;
```

### Giới hạn liên quan sao lưu — nói rõ

- Khôi phục từ bản sao lưu **đưa nội dung và kết quả về thời điểm sao lưu**. Mọi lượt học,
  câu trả lời và lần xuất bản sau mốc đó **mất**, trừ khi có WAL archiving.
- **Xoá dữ liệu không lan sang bản sao lưu.** Nếu phụ huynh/giáo viên yêu cầu xoá dữ liệu một
  học sinh, dữ liệu đó vẫn còn trong các bản sao lưu cũ cho tới khi các bản đó hết hạn lưu.
  Cần ghi rõ thời hạn lưu bản sao lưu trong thông báo quyền riêng tư (mặc định đề xuất: 30 ngày).
- Sao lưu chứa dữ liệu của trẻ → phải mã hoá và giới hạn người truy cập như dữ liệu gốc.

## Xoá dữ liệu

Xoá một học sinh (kéo theo lượt học, câu trả lời, lịch ôn nhờ `ON DELETE CASCADE`):

```sql
BEGIN;
  SELECT id, display_name FROM users WHERE id = :student_id AND role = 'student';
  DELETE FROM users WHERE id = :student_id AND role = 'student';
COMMIT;
```

`audit_events.actor_id` dùng `REFERENCES users(id)` **không** cascade, nên bản ghi kiểm toán
bảo mật vẫn còn (chỉ còn id, không còn biệt danh). Đây là chủ ý: **rollback nội dung hay xoá
người dùng không được xoá nhật ký bảo mật.**

Xoá một lớp: `DELETE FROM classrooms WHERE id = :id;` — cascade sang memberships và assignments;
`attempts.classroom_id` chuyển về `NULL` để báo cáo lịch sử không đứt.

## Nâng cấp

1. Sao lưu trước.
2. `npm ci && npm run build`
3. `npm run db:migrate` (mỗi migration chạy trong một giao dịch; lỗi → không để lược đồ nửa vời).
4. Khởi động lại tiến trình API. Web là tệp tĩnh, triển khai sau cũng được.

Không sửa tệp migration đã chạy — thêm `002_*.sql`.

## Theo dõi

- `GET /api/health` — **liveness**: chỉ trả `{"ok":true}` khi tiến trình còn sống, **không chạm DB**.
  Health check của nền tảng trỏ vào đây; nếu nó truy vấn DB thì Neon không bao giờ ngủ được.
- `GET /api/health/db` — **readiness**: có truy vấn DB, trả `503` khi DB không phản hồi.
  Kết quả được nhớ tạm 30 giây nên gọi liên tục cũng không đánh thức DB liên tục.
- Log ứng dụng **không** ghi token, mật khẩu hay nội dung riêng của trẻ; chỉ tên lỗi và thông điệp.
- `audit_events` ghi: đăng nhập thành công/thất bại (kèm hash IP), xuất bản, rollback,
  duyệt nội dung, tạo bài giao, tạo tài khoản.

Truy vấn hữu ích:

```sql
-- đăng nhập thất bại 24h qua theo hash IP
SELECT ip_hash, count(*) FROM audit_events
 WHERE action = 'auth.login_failed' AND at > now() - interval '24 hours'
 GROUP BY 1 ORDER BY 2 DESC;

-- lịch sử xuất bản
SELECT revision, created_at, note, rolled_back_from FROM content_revisions ORDER BY revision DESC LIMIT 20;
```

## Sự cố thường gặp

| Hiện tượng | Nguyên nhân | Xử lý |
|---|---|---|
| Giáo viên bấm Xuất bản → “Có người vừa xuất bản phiên bản mới hơn” | hai người sửa cùng lúc | tải lại, đối chiếu diff, xuất bản lại |
| “Nội dung đã thay đổi sau lần kiểm tra” | sửa text sau khi bấm Kiểm tra | bấm Kiểm tra lại |
| Học sinh thấy “Chưa có bài học” | chưa có mục nào `published` | giáo viên duyệt rồi xuất bản |
| Không nghe được | máy không có giọng `zh-CN` | cài gói giọng tiếng Trung của hệ điều hành, hoặc giáo viên đọc mẫu |
| 429 khi đăng nhập | quá 10 lần/15 phút cho một khoá | chờ hết cửa sổ, hoặc `DELETE FROM login_throttle WHERE key = …` |

## Giới hạn đã biết

- Chưa có xoá dữ liệu tự động theo chính sách lưu trữ — hiện là thao tác thủ công bằng SQL ở trên.
- Chưa có công cụ xuất dữ liệu một học sinh ra tệp cho phụ huynh (mới có báo cáo lớp trong app).
- Chưa có hàng đợi gửi lại câu trả lời khi mất mạng: câu trả lời gửi khi offline sẽ báo lỗi và
  học sinh phải bấm lại; khoá idempotency đảm bảo không ghi trùng.
- Chưa có rate limit chung cho các endpoint ngoài đăng nhập.
