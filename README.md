# Học tiếng Trung cùng Panda — YCT 1 (mở rộng HSK)

Web học tiếng Trung cho học sinh tiểu học Việt Nam (6–12 tuổi), có giáo viên hướng dẫn.
Giao diện tiếng Việt; mã nguồn, tên biến và API tiếng Anh.

> **Trạng thái:** nội dung YCT 1 đã trích xuất từ giáo trình nhưng **chưa có giáo viên duyệt**.
> Bản demo hiển thị nhãn “Nội dung nháp”. Bài giao thật chỉ dùng nội dung đã duyệt.
> Chưa khuyến nghị triển khai cho lớp thật cho tới khi hoàn tất các mục trong `docs/BACKLOG.md`.

## Cấu trúc

```
packages/shared/   Logic thuần: sinh câu hỏi, luật distractor, parser CSV/TSV, chấm điểm,
                   lịch ôn tập, trò chơi. Không phụ thuộc React hay Node runtime.
apps/web/          React 18 + TypeScript + Vite. Hai chế độ: demo (IndexedDB) và server (API).
apps/server/       Fastify + PostgreSQL. Xác thực, phân quyền, nội dung theo revision,
                   lớp học, bài giao, báo cáo.
content/yct1/      Nội dung YCT 1 đã trích xuất (JSON sinh ra từ bảng nguồn gõ tay).
content/hsk1/      Bộ HSK nhập từ trang HTML cũ — CHƯA đối chiếu giáo trình gốc.
e2e/               Kiểm thử đầu-cuối bằng Chromium thật + đo Lighthouse.
docs/              source-audit, kiến trúc, accessibility, quyền riêng tư, vận hành, backlog.
```

## Chạy nhanh (bản demo, không cần máy chủ)

```bash
npm install
npm run build:content          # sinh content/yct1/*.json từ bảng nguồn
npm run -w @yct/web dev        # http://localhost:5173
```

Bản demo lưu mọi thứ trong IndexedDB của trình duyệt, có nhãn “Dữ liệu trên thiết bị này”.
Không có lớp học, không đồng bộ giữa hai máy, **không có tài khoản giáo viên thật**.

## Chạy bản đầy đủ (có máy chủ)

Cần PostgreSQL 14+ (đã kiểm thử trên 16).

```bash
cp apps/server/.env.example apps/server/.env    # điền DATABASE_URL
export DATABASE_URL=postgres://user:pass@localhost:5432/yct

npm install
npm run build:content
npm run db:migrate                              # tạo lược đồ
npm run db:seed                                 # nạp catalog + tài khoản đầu tiên
                                                # → in ra mật khẩu sinh ngẫu nhiên MỘT LẦN

npm run -w @yct/server dev                      # API  http://127.0.0.1:8787
VITE_BACKEND=server npm run -w @yct/web dev     # Web  http://localhost:5173
```

Seed **không** xuất bản nội dung nào: toàn bộ ở trạng thái `draft`.
Giáo viên phải vào *Khu vực giáo viên → Nội dung*, chọn các mục, bấm **Đánh dấu đã duyệt**,
rồi mới xuất bản. Học sinh chỉ thấy nội dung đã xuất bản.

## Build & kiểm thử

```bash
npm run typecheck                       # toàn bộ workspace
npm run test:unit                       # 43 test logic thuần (packages/shared)
DATABASE_URL=postgres://…/yct_test \
  npm run -w @yct/server test           # 31 test tích hợp/triển khai trên Postgres THẬT
npm run build                           # shared → server → web

# đầu-cuối bằng trình duyệt thật (cần `vite preview` chạy ở :4173)
npm run -w @yct/web build && npm run -w @yct/web preview &
node e2e/learn-flow.mjs                 # luồng học sinh, a11y, khổ màn hình, âm thanh
node e2e/lighthouse.mjs                 # 3 lần đo, ghi e2e/lighthouse/summary.json

# chế độ máy chủ (hai thiết bị)
VITE_BACKEND=server npm run -w @yct/web build && npm run -w @yct/web preview &
node e2e/server-flow.mjs
```

> Bộ test tích hợp **xoá sạch dữ liệu** trong cơ sở dữ liệu được trỏ tới.
> Luôn dùng một database riêng cho kiểm thử.

## Triển khai

Máy chủ Fastify phục vụ **cả** `apps/web/dist` **lẫn** `/api` trên **cùng một origin**,
nên chỉ cần một tiến trình và không cần CORS.

```bash
npm ci --include=dev
VITE_BACKEND=server npm run build     # thiếu biến này → web chạy bản demo cục bộ
export DATABASE_URL=…                 # chuỗi trực tiếp khi migrate
npm run db:migrate                    # chạy TRƯỚC khi khởi động bản mới
NODE_ENV=production PORT=8787 DATABASE_URL=… npm start
```

- `NODE_ENV=production` bật cookie `Secure` + HSTS, nghe trên `0.0.0.0`, và **bắt buộc** có `PORT`.
- Chạy sau reverse proxy có HTTPS. Đặt `TRUST_PROXY` bằng IP/CIDR của proxy đó
  (mặc định `loopback, linklocal, uniquelocal` — đúng cho Render).
- Sao lưu / khôi phục: `scripts/db-backup.sh`, `scripts/db-restore.sh`, `scripts/db-verify.sh`.

**Triển khai lên Render Free + Neon Free:** làm theo [`docs/deploy-render-neon.md`](docs/deploy-render-neon.md).
Cấu hình dịch vụ nằm ở [`render.yaml`](render.yaml).

## Tài liệu

| Tệp | Nội dung |
|---|---|
| `docs/source-audit.md` | Đọc gì từ hai tệp nguồn, catalog 12 bài, 9 mục GIỮ / 17 mục SỬA, trang cần đối chiếu |
| `docs/ARCHITECTURE.md` | Miền, thực thể, hợp đồng API, mô hình phiên bản nội dung |
| `docs/ACCESSIBILITY.md` | Số đo tương phản, quyết định a11y, kết quả Lighthouse |
| `docs/PRIVACY-vi-draft.md` | **Bản nháp** thông báo quyền riêng tư — cần chủ sản phẩm duyệt |
| `docs/RUNBOOK.md` | Sao lưu, khôi phục, phân quyền, giới hạn đã biết |
| `docs/BACKLOG.md` | Danh sách công việc theo phase, có ID và trạng thái |
| `docs/ACCEPTANCE.md` | Bảng nghiệm thu Task/Test ID + JSON báo cáo |

## Nguồn nội dung và bản quyền

- Chữ Hán, pinyin, câu mẫu: trích từ *YCT 标准教程 1 / YCT Standard Course 1*, có ghi
  `pdfPage` / `printedPage` / `section` cho từng mục.
- **Nghĩa tiếng Việt do AI dịch từ gloss tiếng Anh của sách** — `origin: ai_draft`,
  `verificationStatus: needs_teacher_check`. Chưa phải bản dịch chính thức.
- Không sao chép minh họa trong sách. App dùng emoji và hình SVG tự vẽ.
- `.gitignore` chặn `*.pdf` và `content/**/scan/**` khỏi repo và bản build công khai.
