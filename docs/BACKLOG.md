# Backlog

Trạng thái: `DONE` · `PARTIAL` · `TODO` · `BLOCKED` (chờ người ngoài đội kỹ thuật).
Giữ tệp này cập nhật để phiên làm việc sau tiếp tục được mà không làm lại từ đầu.

## P0 — Audit và catalog

| ID | Việc | Phụ thuộc | Đầu ra | Nghiệm thu | Trạng thái |
|---|---|---|---|---|---|
| P0-1 | Đọc toàn bộ HTML tham chiếu | — | `docs/source-audit.md` §4 | 9 mục GIỮ, 17 mục SỬA, mỗi mục có số dòng bằng chứng | DONE |
| P0-2 | Render + đọc PDF, xác định offset trang | — | `docs/source-audit.md` §2 | offset kiểm chứng ở 12 mốc | DONE |
| P0-3 | Catalog 12 bài | P0-2 | `content/yct1/curriculum.json` | khớp 目录 tr.in iv | DONE |
| P0-4 | Trích xuất từ vựng / câu / ngữ pháp | P0-3 | `content/yct1/items.json` | 177 mục, mọi mục có `source` | DONE |
| P0-5 | Nhập bộ HSK cũ, gắn nhãn chưa đối chiếu | P0-1 | `content/hsk1/*` | 394 mục, `unverified_no_source` | DONE |
| P0-6 | Danh sách trang cần giáo viên đối chiếu | P0-4 | `source-audit.md` §3 | có thứ tự ưu tiên | DONE |

## P1 — Nền tảng

| ID | Việc | Phụ thuộc | Nghiệm thu | Trạng thái |
|---|---|---|---|---|
| P1-1 | Design token + tương phản đo thật | P0-1 | mọi màu chữ ≥ 4.5:1, ghi số đo | DONE |
| P1-2 | App shell, routing, điều hướng dưới | — | mobile 360px → desktop, tab Học/Luyện tập/Trò chơi/Tiến độ | DONE |
| P1-3 | Schema + validate runtime (zod) | P0-4 | `ContentItemSchema` chặn dữ liệu sai ở server | DONE |
| P1-4 | Repository tách demo / production | P1-3 | cùng `LearnApi`, giao diện không biết chế độ | DONE |
| P1-5 | Trạng thái tải/rỗng/lỗi/offline/disabled | P1-2 | E2E kiểm tra thật | DONE |

## P2 — Lát cắt học đầu-cuối

| ID | Việc | Phụ thuộc | Nghiệm thu | Trạng thái |
|---|---|---|---|---|
| P2-1 | Sinh câu hỏi có seed | P1-3 | cùng seed → cùng đề | DONE |
| P2-2 | Luật distractor | P2-1 | EDU-01, EDU-02 xanh | DONE |
| P2-3 | Màn hình câu hỏi + phản hồi | P2-2 | không dùng `innerHTML` ở đâu cả | DONE |
| P2-4 | Kết quả + mục cần ôn | P2-3 | độ chính xác lần đầu, `null` khi chưa có dữ liệu | DONE |
| P2-5 | Resume và thoát giữa chừng | P2-3 | FLOW-01 xanh | DONE |
| P2-6 | Nhãn “nội dung nháp” khắp nơi | P0-4 | hiển thị trên trang đầu và bảng giáo viên | DONE |

## P3 — Máy chủ, lớp học, xuất bản

| ID | Việc | Phụ thuộc | Nghiệm thu | Trạng thái |
|---|---|---|---|---|
| P3-1 | Lược đồ Postgres + migration | P1-3 | migration chạy trong giao dịch | DONE |
| P3-2 | Xác thực + phiên cookie HttpOnly + CSRF | P3-1 | SEC-01 xanh | DONE |
| P3-3 | Phân quyền theo đối tượng | P3-2 | SEC-02 xanh | DONE |
| P3-4 | Nội dung theo revision, publish atomic | P3-1 | DATA-03, DATA-04 xanh | DONE |
| P3-5 | Import validate → preview → publish | P3-4 | DATA-01, DATA-02 xanh | DONE |
| P3-6 | Lớp, bài giao, báo cáo | P3-3 | giao bài chỉ dùng nội dung đã xuất bản | DONE |
| P3-7 | Chấm ở server, ghi idempotent | P3-1 | SEC-04 xanh | DONE |
| P3-8 | Rollback tạo revision mới | P3-4 | không phá attempt lịch sử, không xoá audit | DONE |
| P3-9 | Hai thiết bị thấy cùng dữ liệu | P3-6 | `e2e/server-flow.mjs` 7/7 | DONE |

## P4 — Module học tập

| ID | Việc | Nghiệm thu | Trạng thái |
|---|---|---|---|
| P4-1 | M02 Thẻ nhớ, self-report tách khỏi điểm | EDU-03 xanh | DONE |
| P4-2 | M03 Trắc nghiệm 4 dạng (thêm hình→từ) | EDU-02 xanh | DONE |
| P4-3 | M04 Nghe và chọn, không lộ transcript | EDU-04 xanh | DONE |
| P4-4 | M05 Điền chỗ trống + giải thích tiếng Việt | có giải thích cho mọi câu ngữ pháp | DONE |
| P4-5 | M06 Dịch câu hai chiều (chọn đáp án) | dùng câu trong bài | DONE |
| P4-6 | M07 Hai trò chơi + mascot, không kéo thả bắt buộc | chạm và bàn phím đều chơi được | DONE |
| P4-7 | M08 Tiến độ + lịch ôn 1/3/7 ngày | cấu hình được qua `DEFAULT_REVIEW_STEPS_DAYS` | DONE |
| P4-8 | Dịch tự do có rubric | — | TODO (ngoài MVP, đã ghi trong M06) |

## P5 — Nội dung toàn sách

| ID | Việc | Nghiệm thu | Trạng thái |
|---|---|---|---|
| P5-1 | Catalog đủ 12 bài | có cả bài chưa có nội dung | DONE |
| P5-2 | Trích xuất bài 1–11 | 177 mục có nguồn | DONE |
| P5-3 | Bài 12 (ôn tập) | — | TODO — hiện hiển thị “Chưa có bài học” |
| P5-4 | Listening scripts tr.in 61 | — | TODO |
| P5-5 | Mini story bài 3–11 (chữ Hán) | — | TODO |
| P5-6 | Khung mở rộng HSK, không quy đổi sang YCT | `lessonId` có tiền tố chương trình | DONE |
| P5-7 | Đối chiếu 词语表 với giáo viên | — | **BLOCKED** — cần cô Ngọc Anh |
| P5-8 | Xác nhận “80 từ cốt lõi” với lời nói đầu | — | **BLOCKED** — cần cô Ngọc Anh |
| P5-9 | Duyệt bản dịch tiếng Việt (104 từ + 49 câu) | — | **BLOCKED** — cần cô Ngọc Anh |
| P5-10 | Audio do giáo viên thu/kiểm tra | thay TTS ở dạng nghe | **BLOCKED** — cần bản ghi có quyền dùng |

## P6 — Chất lượng và vận hành

| ID | Việc | Nghiệm thu | Trạng thái |
|---|---|---|---|
| P6-1 | Unit test logic | 43 test | DONE |
| P6-2 | Integration test authz/publish/idempotency | 17 test trên Postgres thật | DONE |
| P6-3 | E2E học sinh + a11y + khổ màn hình | 14 kiểm tra | DONE |
| P6-4 | E2E hai thiết bị chế độ máy chủ | 7 kiểm tra | DONE |
| P6-5 | Lighthouse 3 lần, ghi môi trường | Perf 97 / A11y 100 | DONE |
| P6-6 | README, kiến trúc, a11y, runbook, privacy nháp | — | DONE |
| P6-7 | Kiểm thử với trình đọc màn hình thật | — | TODO |
| P6-8 | Quét phụ thuộc định kỳ trong CI | — | TODO |
| P6-9 | Hàng đợi gửi lại câu trả lời khi mất mạng | — | TODO |
| P6-10 | Rate limit chung ngoài đăng nhập | — | TODO |
| P6-11 | Công cụ xuất dữ liệu một học sinh cho phụ huynh | — | TODO |
| P6-12 | Xoá dữ liệu tự động theo chính sách lưu trữ | hiện làm thủ công bằng SQL | TODO |

## Việc chỉ người ngoài đội kỹ thuật làm được

1. Giáo viên đối chiếu 104 từ + 49 câu với sách và **duyệt** bản dịch tiếng Việt (P5-7, P5-9).
2. Xác nhận cách đếm “80 từ cốt lõi / 10 điểm ngữ pháp / 9 chức năng giao tiếp” (P5-8).
3. Cung cấp bản ghi âm hợp pháp hoặc thu mới (P5-10).
4. Chủ sản phẩm và người phụ trách pháp lý duyệt `docs/PRIVACY-vi-draft.md`, điền thời hạn lưu trữ.
5. Quyết định hạ tầng triển khai để đo lại Lighthouse trên môi trường thật.

**Không tự nhận vai người duyệt.** Nội dung AI soạn không tự chuyển thành `verified_by_teacher`;
chỉ thao tác của tài khoản có quyền trong app mới đổi được trạng thái đó.
