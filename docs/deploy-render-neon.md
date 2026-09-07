# Triển khai lên Render Free + Neon PostgreSQL Free

Kiến trúc: **một** Render Web Service (gói Free) chạy Fastify. Fastify phục vụ cả giao diện
React đã build lẫn API `/api/*` trên **cùng một origin**, nên không cần CORS và cookie phiên là
cookie same-origin. Dữ liệu nằm ở **Neon PostgreSQL** (gói Free).

```
Trình duyệt ──HTTPS──▶ <ten-dich-vu>.onrender.com  (Render Web Service, plan free)
                        │  GET /            → apps/web/dist/index.html
                        │  GET /assets/*    → tệp tĩnh có vân tay nội dung
                        │  *   /api/*       → Fastify
                        └──TLS──▶ Neon PostgreSQL (plan free)
```

---

## 0. Trước khi bắt đầu

Cần có:

- Tài khoản GitHub chứa repo này.
- Tài khoản Render (đăng ký miễn phí, **không cần thẻ**).
- Tài khoản Neon (đăng ký miễn phí, **không cần thẻ**).
- Trên máy dùng để chạy migration: Node 22.18.0 và `psql`/`pg_dump` (PostgreSQL client 17 trở lên).

> Gói Free **không** cần phương thức thanh toán. Nếu tài khoản Render đã có thẻ, hãy xem
> mục [Chi phí và hạn mức](#7-chi-phí-và-hạn-mức) trước khi deploy.

---

## 1. Tạo cơ sở dữ liệu Neon

1. Vào <https://console.neon.tech> → **New Project**.
2. Đặt tên (ví dụ `yct-learn`), chọn **Postgres 17**.
3. Region: chọn **AWS Asia Pacific (Singapore) — ap-southeast-1** để cùng vùng với Render Singapore.
4. Sau khi tạo, mở **Connection Details** và lấy **hai** chuỗi kết nối:

   | Dùng khi | Chuỗi | Đặc điểm |
   |---|---|---|
   | Ứng dụng chạy | **Pooled** | host có `-pooler`, ví dụ `ep-abc-123-pooler.ap-southeast-1.aws.neon.tech` |
   | Chạy migration / sao lưu | **Direct** | host **không** có `-pooler` |

   Cả hai đều kết thúc bằng `?sslmode=require` (Neon có thể thêm `&channel_binding=require` —
   giữ nguyên, đã kiểm chứng là kết nối được).

   > Ứng dụng tự đổi `sslmode=require` thành `verify-full` trước khi đưa cho `pg`, và truyền
   > tuỳ chọn `ssl` tường minh. Chứng chỉ **luôn** được xác minh, không phụ thuộc mặc định của
   > thư viện. Không cần sửa gì trong chuỗi kết nối.

> **Vì sao migration dùng chuỗi trực tiếp:** `migrate.ts` chạy mỗi tệp `.sql` trong một
> giao dịch và tạo khoá bảng; `pg_dump` cũng cần phiên bền. Pooler ở chế độ transaction
> không bảo đảm các ngữ nghĩa đó. Ứng dụng lúc chạy chỉ dùng truy vấn ngắn nên dùng pooled được.

**Đã có sẵn project Neon?** Dùng lại, đừng tạo bản sao. Kiểm tra trước:

```bash
psql "$DATABASE_URL_DIRECT" -c "\dt"                                   # đã có bảng nào chưa
psql "$DATABASE_URL_DIRECT" -c "select name, applied_at from schema_migrations"
```

Nếu đã có dữ liệu thật, làm theo mục [8. Chuyển dữ liệu từ DB đang chạy](#8-chuyển-dữ-liệu-từ-db-đang-chạy).

---

## 2. Chuẩn bị lược đồ và dữ liệu khởi tạo

Chạy **từ máy của bạn**, dùng chuỗi kết nối **trực tiếp**. Gói Render Free không có shell
và không có pre-deploy job, nên migration không chạy tự động khi deploy — đó là chủ ý:
migration chạy trong build sẽ chạy song song với nhiều bản build cùng lúc.

```bash
npm ci
export DATABASE_URL='postgresql://…@ep-abc-123.ap-southeast-1.aws.neon.tech/yct?sslmode=require'
npm run db:migrate
```

### Nếu bạn dùng Neon CLI

`neon link` tạo `.env.local` với **ba** biến. Chú ý đúng biến:

| Biến trong `.env.local` | Là chuỗi nào | Dùng để |
|---|---|---|
| `DATABASE_URL` | **pooled** (host có `-pooler`) | ứng dụng lúc chạy → dán vào Render |
| `DATABASE_URL_UNPOOLED` | **direct** | migration, seed, `pg_dump`/`pg_restore` |

Vì vậy khi nạp tệp này để chạy migration, phải **ghi đè** `DATABASE_URL` bằng bản direct:

```bash
set -a && . ./.env.local && set +a
DATABASE_URL="$DATABASE_URL_UNPOOLED" npm run db:migrate
DATABASE_URL="$DATABASE_URL_UNPOOLED" npm run db:seed
```

`.env.local` **chứa mật khẩu**. `.gitignore` đã chặn nó qua luật `.env.*`; `neon link` cũng tự
thêm `.neon` (chỉ chứa ID, không có secret). Kiểm tra lại bất cứ lúc nào bằng
`git check-ignore -v .env.local`.

Kết quả mong đợi lần đầu: `✓ 001_init.sql`. Chạy lại lần nữa phải in `Lược đồ đã cập nhật.`
và không thay đổi gì — migration có bảng lịch sử `schema_migrations` và an toàn khi chạy lại.

Nếu quên `export DATABASE_URL`, lệnh dừng ngay với thông báo nói rõ thiếu biến nào —
không âm thầm thử `localhost`.

### Seed — CHỈ chạy trên cơ sở dữ liệu mới

`seed` nạp giáo trình YCT1/HSK1 (toàn bộ ở trạng thái **nháp**, giáo viên phải duyệt rồi xuất bản)
và tạo một tài khoản quản trị, một giáo viên, một lớp mẫu.

```bash
export SEED_ADMIN_EMAIL='admin@truong-cua-ban.vn'
export SEED_TEACHER_EMAIL='co.ngocanh@truong-cua-ban.vn'
# Bỏ trống mật khẩu → seed tự sinh ngẫu nhiên và IN RA MỘT LẦN. Chép lại ngay.
npm run db:seed
```

- Seed **idempotent**: chạy lại không nhân đôi và không ghi đè người dùng đã có.
- Seed **không** chạy tự động lúc khởi động hay lúc deploy.
- Không có mật khẩu mặc định nào nằm trong repo. **Đổi mật khẩu ngay sau lần đăng nhập đầu.**

---

## 3. Đưa mã nguồn lên GitHub

```bash
git push -u origin <ten-nhanh>
```

Rồi mở Pull Request vào `main` theo quy trình của repo. Render deploy từ nhánh khai báo trong
`render.yaml` (`branch: main`).

---

## 4. Tạo Web Service trên Render

### Cách A — dùng Blueprint (khuyến nghị)

1. <https://dashboard.render.com> → **New** → **Blueprint**.
2. Chọn repo `learnChinese`, Render đọc `render.yaml` ở gốc.
3. Render hỏi giá trị cho biến khai báo `sync: false`:
   - **DATABASE_URL** → dán chuỗi **pooled** của Neon.
4. **Apply**.

### Cách B — tạo thủ công

| Trường | Giá trị |
|---|---|
| Type | Web Service |
| Runtime | Node |
| Region | Singapore |
| Instance Type | **Free** |
| Root Directory | *(để trống — build từ gốc monorepo)* |
| Build Command | `npm ci --include=dev && npm run build` |
| Start Command | `npm run -w @yct/server start` |
| Health Check Path | `/api/health` |

Biến môi trường:

| Key | Value | Ghi chú |
|---|---|---|
| `NODE_VERSION` | `22.18.0` | phiên bản đã kiểm thử |
| `NODE_ENV` | `production` | bật cookie Secure + HSTS |
| `VITE_BACKEND` | `server` | **biến lúc build** — thiếu nó web sẽ chạy bản demo cục bộ |
| `DATABASE_URL` | *(chuỗi pooled Neon)* | bí mật |
| `PG_POOL_MAX` | `5` | |

`PORT` do Render tự đặt — **đừng** đặt tay. `HOST` để trống (production tự dùng `0.0.0.0`).

> `--include=dev` là bắt buộc: Render đặt `NODE_ENV=production`, khiến `npm ci` bỏ qua
> devDependencies, mà TypeScript và Vite nằm ở đó.

Sau khi deploy xong, Render cấp địa chỉ dạng `https://<ten-dich-vu>.onrender.com`.
**Địa chỉ thật chỉ biết sau khi Render tạo dịch vụ** — đừng đoán trước.

---

## 5. Kiểm tra sau khi deploy (smoke test)

Thay `BASE` bằng URL thật Render cấp.

```bash
BASE=https://<ten-dich-vu>.onrender.com

curl -s -o /dev/null -w '%{http_code}\n' "$BASE/api/health"        # 200 {"ok":true}
curl -s "$BASE/api/health/db"                                       # {"ok":true}
curl -s -o /dev/null -w '%{http_code} %{content_type}\n' "$BASE/"   # 200 text/html
curl -s -o /dev/null -w '%{http_code} %{content_type}\n' \
     -H 'accept: text/html' "$BASE/tien-do"                         # 200 text/html (SPA)
curl -s -o /dev/null -w '%{http_code} %{content_type}\n' \
     "$BASE/api/khong-co"                                           # 404 application/json
curl -s "$BASE/api/curricula"                                       # danh sách giáo trình
```

Rồi kiểm tra bằng trình duyệt:

1. Mở `$BASE` — trang chủ hiện ra.
2. Vào khu vực giáo viên, đăng nhập bằng tài khoản seed. Kiểm tra cookie `sid` có
   `HttpOnly; Secure; SameSite=Lax` và **không** có thuộc tính `Domain`.
3. Đăng nhập học sinh bằng mã lớp + biệt danh + mã truy cập, làm vài câu.
4. **Tải lại thẳng URL bài học** (F5 giữa bài) — phải ra đúng trang, không phải 404.
5. Đăng xuất, đăng nhập lại, xem tiến độ vẫn còn.

Chưa chạy các bước này thì **chưa** được coi là website đã sẵn sàng cho học sinh.

---

## 6. Cập nhật và quay lui

**Cập nhật:** đẩy commit lên `main` → Render tự deploy (`autoDeployTrigger: commit`).

**Quay lui bản deploy:** Render Dashboard → dịch vụ → tab **Deploys** → chọn bản chạy tốt →
**Rollback to this deploy**. Việc này chỉ đổi mã nguồn, **không** đụng tới cơ sở dữ liệu.

**Quay lui lược đồ cơ sở dữ liệu:** không có lệnh tự động. Migration chỉ tiến, không lùi.
Muốn lùi thì khôi phục từ bản sao lưu (mục 7) hoặc từ **branch** của Neon.

**Quay lui nội dung bài học:** không cần đụng cơ sở dữ liệu — dùng chức năng có sẵn trong
khu vực giáo viên (`POST /api/teacher/content/rollback`). Rollback tạo một revision **mới**
từ nội dung cũ, không xoá lịch sử.

---

## 7. Sao lưu và khôi phục

Ba script trong `scripts/`. Cần `pg_dump`/`pg_restore`/`psql` phiên bản **17 trở lên**.
Luôn dùng chuỗi kết nối **trực tiếp** (không pooler).

```bash
# Sao lưu
export DATABASE_URL='…chuỗi trực tiếp…'
./scripts/db-backup.sh ~/yct-backups          # ghi ~/yct-backups/yct-<thời-điểm>.dump

# Khôi phục sang một cơ sở dữ liệu TRỐNG rồi đối chiếu
export TARGET_DATABASE_URL='…DB trống…'
./scripts/db-restore.sh ~/yct-backups/yct-20260906-234546.dump
./scripts/db-verify.sh                        # so danh sách bảng + số dòng, KHÔNG in nội dung
```

Script từ chối ghi đè: nếu đích đã có bảng, hoặc nếu đích trùng `DATABASE_URL`, nó dừng lại.

> **Tệp `.dump` chứa dữ liệu học sinh.** Để trong thư mục riêng đã được bảo vệ (script đặt
> quyền `600`). `.gitignore` đã chặn `backups/` và `*.dump`. Không tải lên nơi chia sẻ công khai.

> **Chưa có sao lưu tự động.** Ba script trên chạy thủ công. Muốn tự động thì phải có một
> nơi lưu trữ riêng — chưa thiết lập trong task này, và không có phương án miễn phí nào
> được chọn thay. Neon Free có **Point-in-time restore trong 24 giờ** và cho tạo **branch**
> làm ảnh chụp; đó là lớp bảo vệ ngắn hạn, **không thay thế** bản sao lưu để ngoài Neon.

---

## 8. Chuyển dữ liệu từ DB đang chạy

Chỉ áp dụng khi đã có một cơ sở dữ liệu **đang được dùng thật**.

1. **Không xoá, không ghi đè DB nguồn.**
2. Sao lưu nguồn: `./scripts/db-backup.sh`.
3. Khôi phục vào Neon **trống**, rồi `./scripts/db-verify.sh` để đối chiếu bảng và số dòng.
4. Nếu nguồn vẫn đang nhận lượt ghi, phải có **cửa sổ ngừng dịch vụ**: dừng ghi → sao lưu
   lần cuối → khôi phục → đổi `DATABASE_URL` trên Render → deploy → smoke test.
   Bỏ qua bước này thì mọi lượt học phát sinh giữa lúc sao lưu và lúc chuyển sẽ mất.
5. Chọn khung giờ **ngoài giờ học**. Đây là quyết định của giáo viên, không phải quyết định kỹ thuật.

---

## 9. Chi phí và hạn mức

Số liệu tra từ tài liệu chính thức ngày **06/09/2026**. Hạn mức có thể đổi — kiểm tra lại
trước khi phụ thuộc vào nó.

### Render — gói Free

| Mục | Hạn mức | Ảnh hưởng |
|---|---|---|
| Giờ chạy | **750 giờ/tháng mỗi workspace** | đủ cho một dịch vụ chạy liên tục |
| Ngủ khi rảnh | **sau 15 phút không có truy cập** | không tắt được |
| Thời gian thức dậy | **khoảng 1 phút** | lần mở đầu tiên sau khi ngủ rất chậm |
| Ổ đĩa bền | **không có** | tệp ghi lúc chạy sẽ mất khi deploy lại |
| RAM / CPU | 512 MB / 0.1 CPU | |
| Băng thông, phút build | có hạn mức, **vượt thì bị tính tiền nếu tài khoản có phương thức thanh toán** | xem cảnh báo bên dưới |

### Neon — gói Free

| Mục | Hạn mức | Khi vượt |
|---|---|---|
| Dung lượng | **0.5 GB/project** | thao tác ghi **thất bại** |
| Compute | **100 CU-hours/project/tháng** (≈400 giờ ở 0.25 CU) | compute **bị tạm dừng** tới kỳ sau |
| Truyền dữ liệu | **5 GB/project/tháng** | compute **bị tạm dừng** |
| Ngủ khi rảnh | **sau 5 phút**, không tắt được | truy vấn đầu tiên chậm hơn |
| Branch | 10/project | |

### Cảnh báo về "0đ"

- **Neon Free là trần cứng**: vượt hạn mức thì dịch vụ *dừng*, không phát sinh hoá đơn.
- **Render Free không hoàn toàn như vậy.** Băng thông và phút build vượt hạn mức **sẽ bị tính tiền
  nếu workspace có phương thức thanh toán**. Tài khoản **không có** phương thức thanh toán thì
  không thể phát sinh phí — dịch vụ bị chặn thay vì bị tính tiền.
  → Muốn chắc chắn 0đ: **đừng thêm thẻ vào workspace Render**. Nếu đã có thẻ, đặt
  **spend limit** trong phần Billing và theo dõi mục Usage.
- **Không** dùng Render Postgres Free làm cơ sở dữ liệu lâu dài: nó **hết hạn sau 30 ngày**
  kể từ khi tạo. Đó là lý do dữ liệu nằm ở Neon.
- 0đ **không** đồng nghĩa với uptime hay tài nguyên như gói trả phí. Xem mục kế tiếp.

### Cold start — điều giáo viên cần biết

Sau 15 phút không ai truy cập, Render cho dịch vụ ngủ. Người mở trang tiếp theo phải chờ
**khoảng một phút** trang mới hiện. Cộng thêm Neon ngủ sau 5 phút nên truy vấn đầu cũng chậm hơn.

**Cách xử lý đúng:** giáo viên mở website **trước giờ học vài phút**, đợi trang chủ hiện lên,
rồi mới cho học sinh vào.

**Không** dựng bộ hẹn giờ ping máy chủ để giữ nó thức. Việc đó đốt 750 giờ chạy của Render,
đốt 100 CU-hours của Neon, và đi ngược mục đích của gói miễn phí.

---

## 10. Sự cố thường gặp

| Hiện tượng | Nguyên nhân thường gặp | Cách xử lý |
|---|---|---|
| Build lỗi `tsc: not found` / `vite: not found` | thiếu `--include=dev` | sửa Build Command |
| Trang chạy nhưng không có lớp học, dữ liệu chỉ nằm trên máy | thiếu `VITE_BACKEND=server` **lúc build** | thêm biến rồi **deploy lại** (đổi biến build phải build lại) |
| `/api/*` trả 500, trang vẫn mở được | không kết nối được Neon | kiểm tra `DATABASE_URL`; gọi `/api/health/db` |
| Đăng nhập được nhưng lần sau lại mất phiên | trình duyệt chặn cookie, hoặc mở qua HTTP | phải dùng đúng địa chỉ `https://…onrender.com` |
| Deploy báo unhealthy | health check trỏ sai đường dẫn | phải là `/api/health` |
| Mở thẳng URL bài học ra 404 | chạy bản build cũ chưa có phần phục vụ SPA | deploy lại từ nhánh mới nhất |
| Ghi dữ liệu báo lỗi hết chỗ | Neon đã đầy 0.5 GB | xoá dữ liệu cũ hoặc nâng gói |

## 11. Những gì cố ý **không** làm

- Không có sao lưu tự động ra kho lưu trữ ngoài (chưa chọn đích lưu, và chưa được phép chọn dịch vụ có thể phát sinh phí).
- Không có tải tệp lúc chạy. Ứng dụng hiện **không có** chức năng upload: âm thanh dùng
  giọng đọc sẵn của trình duyệt (Web Speech API), nội dung bài học nhập bằng văn bản/CSV và
  lưu trong PostgreSQL. Vì vậy ổ đĩa tạm của Render không ảnh hưởng gì.
  Nếu sau này thêm chức năng upload, **phải** thêm một nơi lưu trữ bền — ghi vào ổ Render sẽ
  mất sau mỗi lần deploy.
- Không có tên miền riêng. Dùng địa chỉ `onrender.com` do Render cấp.
