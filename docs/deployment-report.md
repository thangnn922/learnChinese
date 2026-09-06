# Báo cáo chuẩn bị triển khai — Render Free + Neon Free

**Ngày:** 06/09/2026 · **Trạng thái:** `READY_FOR_DEPLOY`
Mã nguồn, cấu hình, tài liệu và kiểm thử đã xong và đã chạy trên máy. Bước còn lại là tạo tài
nguyên trên Render/Neon — cần đăng nhập tài khoản mà phiên làm việc này không có.

---

## 1. Stack cuối cùng

| Thành phần | Trước | Sau | Lý do |
|---|---|---|---|
| Node.js | `engines: >=20.11` (không chặn trên) | **22.18.0** ghim ở `.nvmrc`, `engines: >=22.11 <23`, `NODE_VERSION` | Render cảnh báo khoảng phiên bản không có chặn trên sẽ nhảy sang bản mới nhất |
| Fastify | 4.28.1 | **5.12.3** | nhánh 4 **hết hỗ trợ 30/06/2025** |
| @fastify/cookie | 9.4.0 | **11.1.2** | tương thích Fastify 5 |
| @fastify/helmet | 11.1.1 | **13.1.1** | tương thích Fastify 5 |
| @fastify/static | *(chưa có)* | **10.1.3** | phục vụ giao diện cùng origin |
| pg | 8.13.1 | **8.23.0** | bản vá trong cùng nhánh 8 |
| react-router-dom | 6.28.0 | **6.30.6** | vá 2 lỗi mức **cao** (open redirect / XSS) |
| Web | Vite 5.4.11 · React 18.3.1 | *(giữ nguyên)* | |
| Hạ tầng | *(chưa có)* | Render Web Service `plan: free` + Neon PostgreSQL Free | |

### Nâng cấp Fastify 4 → 5: ảnh hưởng thực tế

Đọc migration guide trước khi nâng, sau đó chạy toàn bộ 17 test tích hợp có sẵn trên Postgres
thật. Kết quả: **không có thay đổi hành vi nào ở route, validation, xử lý lỗi hay cookie.**
Ba điểm phải sửa:

1. `setErrorHandler` thu hẹp kiểu tham số lỗi về `unknown` sau chuỗi `instanceof` → ép kiểu tường minh.
2. `@fastify/static` v10 truyền `FastifyReply` cho `setHeaders` (không phải `ServerResponse`).
3. **`trustProxy` dạng số bị Fastify 5 cố tình vô hiệu hoá** (`getTrustProxyFn` trả `false`
   cho mọi số, fail-closed). Phải dùng danh sách IP/CIDR — xem mục 3.

### Phụ thuộc còn lỗi đã biết, cố ý **không** nâng

`react-router` còn **2 lỗi mức trung bình**, chỉ vá được bằng bản **major 7**:

- *Open redirect via backslash in `<Link>`/`useNavigate`* — ứng dụng chỉ truyền đường dẫn hằng
  và `attemptId` dạng UUID do máy chủ sinh; không có đường dẫn nào do người dùng nhập.
- *Arbitrary Constructor Injection via `deserializeErrors()` in SSR Hydration* — **không áp dụng**,
  ứng dụng không dùng SSR.

Nâng lên React Router 7 là viết lại phần điều hướng, nằm ngoài phạm vi triển khai và có rủi ro
cao hơn hai lỗi trên trong bối cảnh này. **Cần xem lại nếu sau này có route nhận đường dẫn từ người dùng.**

---

## 2. Tệp đã thay đổi

### Sửa

| Tệp | Nội dung |
|---|---|
| `package.json` | `engines` có chặn trên; `start`, `db:migrate:dist`, `db:seed:dist`; `typecheck` build shared trước |
| `apps/server/package.json` | nâng phụ thuộc; thêm `migrate:dist`, `seed:dist` |
| `apps/web/package.json` | `react-router-dom` 6.30.6; `test` thêm `--passWithNoTests` |
| `apps/server/src/app.ts` | `buildApp(options)`; `@fastify/static` + SPA fallback; tách health; `trustProxy` theo CIDR; hook xác thực chỉ chạy cho `/api`; lỗi 4xx giữ đúng mã |
| `apps/server/src/index.ts` | kiểm tra `PORT`; `0.0.0.0` khi production; tắt êm có hạn giờ, đóng cả pool |
| `apps/server/src/db.ts` | TLS Neon **có xác minh chứng chỉ**; pool nhỏ; hạn giờ; không sập vì lỗi kết nối rảnh |
| `apps/server/src/migrate.ts`, `seed.ts` | sửa lỗi nhận diện tệp chạy trực tiếp |
| `.gitignore` | chặn `backups/`, `*.dump`, `*.sql.gz`, `.DS_Store` |
| `README.md`, `docs/RUNBOOK.md`, `docs/ARCHITECTURE.md` | cập nhật cho khớp hành vi mới |
| `package-lock.json` | đồng bộ, `npm ci` chạy được |

### Thêm

`render.yaml` · `.env.example` · `.nvmrc` · `apps/server/src/is-main.ts` ·
`apps/server/src/__tests__/serving.test.ts` (14 test) ·
`scripts/db-backup.sh` · `scripts/db-restore.sh` · `scripts/db-verify.sh` ·
`docs/deploy-render-neon.md` · `docs/deployment-report.md`

Nhánh: `deploy/render-neon-free`, một commit `4b07325`. **Chưa push** — xem mục 7.

---

## 3. Lỗi phát hiện trong lúc làm và đã sửa

Bốn lỗi dưới đây **có sẵn trong mã nguồn**, không phải do việc nâng cấp gây ra.

### 3.1 `db:migrate` và `db:seed` thoát êm mà không làm gì

`migrate.ts`/`seed.ts` nhận biết "có phải tệp được gọi trực tiếp không" bằng cách so
`import.meta.url` với `process.argv[1]`. `import.meta.url` là URL **đã mã hoá phần trăm**, còn
`argv[1]` là đường dẫn thô. Chỉ cần đường dẫn có dấu cách — như thư mục hiện tại
`Claude outputs/` — là phép so sánh sai.

Hậu quả: `npm run db:migrate` in ra tên lệnh, **thoát với mã 0**, và **không tạo bảng nào**.
Đã kiểm chứng: sau khi chạy, `\dt` trả `Did not find any relations`. Cùng lỗi đó với `db:seed`.

Sửa: thêm `apps/server/src/is-main.ts`, so **đường dẫn thật đã phân giải** (`realpathSync`),
đúng với mọi tên thư mục và cả symlink.

### 3.2 Mọi lỗi 4xx của framework bị báo thành 500

`setErrorHandler` chỉ nhận ra `HttpError`, `RevisionConflict`, `ZodError`; còn lại trả 500.
Nghĩa là JSON hỏng, body vượt giới hạn 4 MB, tệp bị plugin từ chối… đều hiện ra là "lỗi máy chủ".
Giáo viên nhập một tệp quá lớn sẽ được báo *máy chủ hỏng* thay vì *tệp quá lớn*.

Sửa: nếu lỗi mang `statusCode` trong khoảng 4xx thì trả đúng mã đó, kèm thông báo tiếng Việt
theo bảng, **không** để lộ thông điệp lỗi nội bộ. Đã kiểm chứng: body 5 MB → `413`;
JSON hỏng → `400 VALIDATION_FAILED` (trước đó cả hai đều là `500`).

### 3.3 `trustProxy: true` cho phép né giới hạn đăng nhập

Ứng dụng khoá số lần đăng nhập sai theo hash IP lấy từ `req.ip`. Với `trustProxy: true`,
Fastify tin **mọi** header `X-Forwarded-For` — kể cả do client tự đặt. Kẻ dò mật khẩu chỉ cần
đổi header sau mỗi lần thử là có "IP" mới và không bao giờ bị khoá.

Sửa: mặc định khi production là `loopback, linklocal, uniquelocal` — chỉ tin `X-Forwarded-For`
khi máy nối trực tiếp nằm trong dải mạng riêng (đúng mô hình reverse proxy của Render).
IP client là địa chỉ ngoài cùng **không** thuộc dải tin cậy, nên thêm địa chỉ giả vào đầu header
không có tác dụng. Đặt lại qua `TRUST_PROXY` khi chạy sau proxy khác.

> Không dùng dạng số chặng: Fastify 5 fail-closed với số, sẽ khiến **mọi** người dùng chung một
> IP (IP của proxy) và giới hạn đăng nhập trở thành giới hạn toàn hệ thống.

### 3.4 `npm run typecheck` và `npm test` thất bại trên bản checkout sạch

`typecheck` không build `@yct/shared` trước nên báo 20 lỗi "Cannot find module '@yct/shared'".
`npm test` thất bại ở workspace `@yct/web` vì workspace này chưa có tệp test nào.
Đã sửa cả hai — nếu không thì mọi bước kiểm tra trước khi deploy đều "đỏ" vì lý do sai.

---

## 4. Quyết định thiết kế cho gói Free

**`/api/health` không chạm cơ sở dữ liệu.** Trước đây endpoint này chạy `SELECT 1`. Render gọi
health check định kỳ; Neon Free ngủ sau 5 phút rảnh và chỉ có **100 CU-hours/tháng**. Một health
check có truy vấn DB sẽ giữ Neon thức suốt ngày và đốt hết hạn mức. Nay:

- `/api/health` — liveness, không chạm DB. Render trỏ vào đây.
- `/api/health/db` — readiness, có chạm DB, kết quả nhớ tạm 30 giây, trả 503 khi DB không phản hồi.

**Hook xác thực chỉ chạy cho `/api`.** Hook `preHandler` gọi `loadUser()` (một truy vấn DB) cho
**mọi** request. Khi máy chủ phục vụ luôn tệp tĩnh, mỗi tệp JS/CSS/ảnh sẽ thành một truy vấn
Postgres. Nay hook bỏ qua đường dẫn không phải `/api`.

**Không có tải tệp lúc chạy → ổ đĩa tạm của Render không ảnh hưởng.** Đã rà toàn bộ mã nguồn:
không có `multipart`, không có `FormData`, không ghi tệp lúc chạy. Âm thanh dùng Web Speech API
của trình duyệt; nội dung bài học nhập bằng văn bản/CSV và lưu trong PostgreSQL.
**Nếu sau này thêm chức năng upload thì phải thêm nơi lưu bền** — ghi vào ổ Render sẽ mất sau mỗi deploy.

**Phiên đăng nhập nằm trong bảng `sessions` của PostgreSQL**, không nằm trong RAM. Đã kiểm chứng
phiên vẫn dùng được sau khi khởi động lại tiến trình — không cần đổi cơ chế xác thực.

**TLS tới Neon xác minh chứng chỉ.** Neon dùng chứng chỉ do CA công cộng cấp nên kho CA sẵn có
của Node xác minh được; **không** dùng `rejectUnauthorized: false`.

---

## 5. Kết quả kiểm thử

Môi trường: macOS · Node 22.18.0 · PostgreSQL **17.6** (chạy cục bộ) ·
Chromium (Browser pane). Bản build production, `NODE_ENV=production`, khởi động bằng
`npm start` — **không** dùng `vite preview` hay `tsx watch`.

| ID | Kiểm tra | Kết quả | Bằng chứng |
|---|---|---|---|
| DEP-01 | Clean install / build / start từ gốc repo | **PASS** | `rm -rf node_modules dist` → `npm ci --include=dev` (434 gói) → `npm run build` → `npm start`. Phục vụ đúng `apps/web/dist` và `/api`. Chạy lại từ `/tmp` bằng đường dẫn tuyệt đối cũng đúng → không phụ thuộc thư mục làm việc |
| DEP-02 | Mở thẳng và tải lại route bài học | **PASS** | curl `/tien-do`, `/giao-vien`, `/chon`, `/hoc/<uuid>` → `200 text/html`. Trên trình duyệt: F5 giữa bài `/hoc/86e947b2-…` hiện lại đúng "Câu 1/10", không 404, không màn trắng |
| DEP-03 | API/asset không tồn tại | **PASS** | `/api/khong-co` → `404 application/json` `{"code":"NOT_FOUND"}`; `/assets/khong-co.js` → `404`, không phải HTML; `POST /tien-do` → `404`; `GET /khong-co` với `accept: application/json` → `404 JSON` |
| AUTH-01 | Đăng nhập / đăng xuất | **PASS (Chromium)** · Safari **NOT RUN** | Đăng nhập giáo viên trên trình duyệt → bảng điều khiển hiện 177 mục từ PostgreSQL. `document.cookie` chỉ thấy `csrf`, **không** thấy `sid` (HttpOnly hoạt động). Tải lại toàn trang vẫn còn phiên. Cookie production: `HttpOnly; Secure; SameSite=Lax`, `Path=/`, **không có** `Domain` (host-only) |
| AUTH-02 | Học sinh truy cập API giáo viên / dữ liệu người khác | **PASS** | Học sinh gọi `/api/teacher/classrooms` → `403`; khách → `401`; ghi thiếu CSRF token → `403`. Cộng thêm 5 test tự động: đổi `attemptId` sang lượt của bạn khác → từ chối; giáo viên lớp khác → `403` |
| DATA-01 | Tạo tiến độ, restart, đọc lại | **PASS** | Làm 1 câu → `SIGTERM` (log "Nhận SIGTERM, đang dừng…", cổng đóng sạch) → khởi động lại → **cookie phiên cũ vẫn dùng được** (`/api/me` → 200) và `totalAnswered=1` còn nguyên. Chạy `db:seed` lần hai: số dòng không đổi (4 users / 1 classroom / 571 items) |
| DATA-02 | Migration chạy lại + backup/restore | **PASS** | `db:migrate` lần hai → "Lược đồ đã cập nhật", không đổi gì. `pg_dump` → khôi phục sang DB trống → `db-verify.sh` báo **KHỚP** cả 17 bảng và toàn bộ số dòng. Khôi phục vào DB đã có dữ liệu bị **chặn**; đích trùng nguồn bị **chặn** |
| DATA-03 | Giáo viên xuất bản, phiên khác đọc lại | **PASS** | 4 test tự động trên Postgres thật: gửi hai lần không nhân đôi; hai giáo viên sửa cùng lúc — người sau không ghi đè âm thầm; lô có lỗi không âm thầm đăng phần hợp lệ; lượt học đang chạy giữ revision cũ trong khi thiết bị mới thấy revision mới |
| SEC-01 | Bundle / static routes không lộ gì | **PASS** | `/.env` → `404`, không lộ nội dung; `/../package.json`, `/..%2f..%2fpackage.json`, `/%2e%2e/%2e%2e/package.json` → đều ≥400 và không chứa nội dung repo. Chỉ `apps/web/dist` được mở ra. `render.yaml` và `.env.example` không có giá trị thật; `git ls-files` không có `.env`/`.dump`/`dist` |
| OPS-01 | DB lỗi, request timeout, server vừa thức | **PASS** | Tắt Postgres: liveness vẫn `200`, readiness `503`, trang chủ vẫn `200` (giao diện tải được để báo lỗi trung thực), API trả `500 JSON` với thông báo tiếng Việt, **không lộ chi tiết nội bộ**. Bật lại Postgres → tự phục hồi, không cần restart. Gửi lại cùng `idempotencyKey` → không ghi hai lần |
| OPS-02 | Dashboard Render/Neon | **BLOCKED** | Phiên làm việc không có tài khoản Render/Neon — xem mục 7 |

### Bộ test tự động

| Bộ | Số test | Kết quả |
|---|---|---|
| `@yct/shared` (logic thuần) | 43 | **PASS** |
| `@yct/server` — tích hợp có sẵn (Postgres thật) | 17 | **PASS** |
| `@yct/server` — `serving.test.ts` (**mới**) | 14 | **PASS** |
| `@yct/web` | 0 | không có test (pass với `--passWithNoTests`) |
| `npm run typecheck` toàn workspace | — | **PASS** |
| `npm run build` | — | **PASS** |

14 test mới bao phủ: SPA fallback đúng chỗ, 404 đúng loại cho API và tệp tĩnh, quy tắc cache,
không lộ tệp ngoài thư mục build, liveness không chạm DB, và trường hợp chạy khi **không có**
bản build giao diện. Hai trong số đó **bắt được lỗi thật** khi viết: quy tắc nhận diện tệp có
vân tay nội dung sai với cách đặt tên của Vite (`ten-<hash>.js`, dùng dấu gạch ngang), và
lỗi 4xx bị trả thành 500 (mục 3.2).

### Chưa chạy

- **Safari / iOS Safari** — máy có Safari nhưng công cụ điều khiển trình duyệt trong phiên này
  chỉ chạy Chromium. Cần kiểm tra thủ công: đăng nhập, làm một lượt học, kiểm tra cookie
  same-origin còn sau khi tải lại.
- **Kiểm thử trên hạ tầng thật** (HTTPS thật, cold start thật, Neon thật) — chưa deploy được.
- **Đo hạn mức thực tế** trên dashboard Render/Neon.
- `e2e/*.mjs` (Playwright + Lighthouse) — viết cho `vite preview` ở cổng 4173, chưa chỉnh sang
  máy chủ một-origin. Không sửa trong task này để giữ thay đổi ở mức tối thiểu; các luồng đó đã
  được kiểm bằng curl và trình duyệt như bảng trên.

---

## 6. Chi phí và hạn mức

Số liệu tra từ tài liệu chính thức **ngày 06/09/2026**.

**Chi phí định kỳ: 0đ**, với điều kiện nêu rõ bên dưới.

| Nhà cung cấp | Hạn mức Free | Khi vượt |
|---|---|---|
| Render — Web Service | 750 giờ chạy/tháng/workspace; ngủ sau **15 phút** rảnh; thức dậy **~1 phút**; 512 MB / 0.1 CPU; **không có ổ đĩa bền** | băng thông và phút build vượt hạn mức **bị tính tiền nếu workspace có phương thức thanh toán** |
| Neon — PostgreSQL | 0.5 GB/project; **100 CU-hours/tháng** (≈400 giờ ở 0.25 CU); 5 GB truyền dữ liệu; ngủ sau **5 phút** | **trần cứng** — compute bị tạm dừng hoặc thao tác ghi thất bại, **không** phát sinh hoá đơn |

### Nói thẳng về "0đ"

- **Neon Free là trần cứng thật.** Vượt thì dịch vụ dừng, không có hoá đơn.
- **Render Free thì không.** Băng thông và phút build vượt hạn mức sẽ bị tính tiền **nếu workspace
  có phương thức thanh toán**. Render **không** có "hard cap 0đ" — chỉ có spend limit và cảnh báo.
  → Muốn chắc chắn 0đ: **đừng thêm thẻ vào workspace Render**. Không có thẻ thì không thể phát sinh phí.
  Nếu tài khoản đã có thẻ, đặt **spend limit** trong Billing và theo dõi Usage định kỳ.
- **Render Postgres Free hết hạn sau 30 ngày** — đó là lý do dữ liệu nằm ở Neon, không nằm ở Render.
- Đã kiểm tra: **không** phần nào trong cấu hình này cần nâng gói hay thêm thanh toán để chạy đúng.

### Đánh đổi phải chấp nhận

Sau 15 phút không ai truy cập, Render cho dịch vụ ngủ. Người mở trang tiếp theo phải chờ
**khoảng một phút**. Neon cũng ngủ sau 5 phút nên truy vấn đầu tiên chậm hơn bình thường.

**Cách xử lý đúng:** giáo viên mở website vài phút **trước giờ học**, đợi trang chủ hiện lên rồi
mới cho học sinh vào. **Không** dựng bộ hẹn giờ ping để giữ máy chủ thức — việc đó đốt 750 giờ
chạy của Render và 100 CU-hours của Neon, tức là tự làm hỏng chính hạn mức miễn phí.

Đây **không** phải mức sẵn sàng tương đương dịch vụ trả phí. Không có SLA, không có sao lưu tự
động ra ngoài, và một lớp học đông vào cùng lúc sẽ chạy trên 0.1 CPU / 512 MB.

---

## 7. Việc còn cần bạn làm

Ba việc dưới đây cần đăng nhập tài khoản mà phiên làm việc này không có.
**Đừng dán mật khẩu hay chuỗi kết nối vào khung chat** — nhập thẳng vào giao diện của nhà cung cấp.

1. **Đẩy nhánh lên GitHub.** Commit đã sẵn sàng trên nhánh `deploy/render-neon-free`; remote
   `https://github.com/thangnn922/learnChinese.git` đã cấu hình và **đang trống** (chưa có nhánh nào).
   Phiên này không có thông tin đăng nhập GitHub nên `git push` bị từ chối.

   ```bash
   cd "Claude outputs/yct-learn-source"
   git push -u origin deploy/render-neon-free
   ```

   Rồi mở Pull Request vào `main` và gộp. `render.yaml` khai báo `branch: main`.

2. **Tạo project Neon** theo [`docs/deploy-render-neon.md` §1](deploy-render-neon.md), lấy hai chuỗi
   kết nối (pooled và direct), rồi chạy migration + seed từ máy bạn:

   ```bash
   export DATABASE_URL='…chuỗi direct…'
   npm run db:migrate
   npm run db:seed      # in mật khẩu ngẫu nhiên MỘT LẦN — chép lại và đổi ngay sau khi đăng nhập
   ```

3. **Tạo Web Service trên Render** bằng Blueprint (đọc `render.yaml`), dán chuỗi **pooled** vào
   `DATABASE_URL` khi Render hỏi. Sau khi deploy xong, chạy smoke test ở
   [§5 của tài liệu triển khai](deploy-render-neon.md#5-kiểm-tra-sau-khi-deploy-smoke-test)
   rồi cập nhật mục "URL thật" ở đầu báo cáo này.

Ngoài ba việc trên, **không còn phần nào của mã nguồn hay cấu hình đang chờ**.

---

## 8. Ghi chú cho lần sau

- **Đổi phiên bản Node** phải sửa đồng thời `.nvmrc`, `engines` trong `package.json`, và
  `NODE_VERSION` trong `render.yaml`. Node 22 được hỗ trợ tới **30/04/2027**.
- **`VITE_BACKEND=server` là biến lúc BUILD.** Đổi nó xong phải **deploy lại**, không phải chỉ restart.
  Thiếu biến này, trang web vẫn chạy nhưng là bản demo trên máy người dùng, không có lớp học thật.
- **Không nhét migration vào build command.** Render có thể chạy nhiều build song song; hai
  migration chạy cùng lúc trên một cơ sở dữ liệu là chuyện không nên thử.
- **Chưa có sao lưu tự động.** Ba script trong `scripts/` chạy thủ công. Muốn tự động thì phải
  chọn một nơi lưu trữ riêng — chưa thiết lập, và không có phương án miễn phí nào được chọn thay.
  Neon Free có point-in-time restore **24 giờ** và cho tạo branch làm ảnh chụp; đó là lớp bảo vệ
  ngắn hạn, **không** thay thế bản sao lưu để ngoài Neon.
- **Theo dõi lại `react-router`** nếu sau này có route nhận đường dẫn do người dùng nhập (mục 1).
