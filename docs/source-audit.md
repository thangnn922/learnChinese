# Source Audit — YCT 1 & template HTML

Ngày lập: 2026-09-06 · Người lập: Claude (agent) · Trạng thái: **draft, chưa có giáo viên duyệt**

Tài liệu này ghi lại **phần đã đọc**, **phần chưa rõ**, **lỗi/rủi ro** và **trang cần giáo viên đối chiếu**.
Không có nội dung nào trong repo này được coi là "đã duyệt" cho đến khi một tài khoản có quyền
`reviewer` bấm duyệt trong công cụ giáo viên.

---

## 1. Hai tệp nguồn

| Tệp | Kích thước | Loại | Đã đọc |
|---|---|---|---|
| `9cb508c7-1128-483f-a812-d735e24f9d38.html` | 81 914 B, 1 353 dòng | Trang HTML một tệp, dữ liệu **HSK 1** | Toàn bộ (CSS, DOM, JS, 3 mảng dữ liệu) |
| `Docs/YCT 1 SGK.pdf` | 42 577 758 B, 76 trang, 2480×3507 px/trang | **Bản scan**, không có lớp văn bản | Render 76/76 trang → JPEG; đọc bằng thị giác 30 trang trọng yếu |

`pdftotext` trên trang 9–12 trả về **rỗng** → xác nhận PDF không có text layer.
Phương pháp trích xuất: `pdftoppm -jpeg -scale-to-x 1150` rồi đọc ảnh trực tiếp (vision), **không dùng
tesseract** vì máy chỉ có gói ngôn ngữ `eng`/`osd` — OCR tiếng Trung + pinyin có dấu sẽ sai nhiều hơn đọc ảnh.
Kết quả vẫn được đánh dấu `verificationStatus: "needs_teacher_check"`.

### 1.1 Bản quyền / quyền sử dụng
- PDF là giáo trình thương mại (YCT 标准教程 1 / *YCT Standard Course 1*). **Không** đưa ảnh scan, không đưa
  file PDF vào bản build công khai. `.gitignore` chặn `content/**/scan/**` và `*.pdf`.
- Chữ Hán, pinyin, tiêu đề bài, câu mẫu, hội thoại: trích dẫn ngắn để dạy học, có ghi nguồn
  (`fileName`, `pdfPage`, `printedPage`, `section`).
- Minh họa trong sách **không** được sao chép. App dùng emoji + hình vẽ SVG tự tạo.
- Âm thanh: sách chỉ có **ký hiệu CD/QR** (01-01, 01-02…). **Không có tệp audio kèm theo.**
  → MVP dùng Web Speech API (`zh-CN`) và gắn nhãn "Giọng đọc máy".

---

## 2. Catalog YCT 1 (đối chiếu 目录 Contents — PDF trang 8)

Offset xác nhận: **pdfPage = printedPage + 8** (PDF tr.9 = trang in 1 = Bài 1).
Đã kiểm chứng lại tại các mốc: tr.in 5→pdf 13, 9→17, 14→22, 19→27, 24→32, 29→37, 34→42, 39→47, 44→52, 49→57, 56→64, 59→67.
Offset đúng trên toàn bộ phần thân sách; **không** suy rộng cho phần bìa/lời nói đầu (đánh số La Mã).

| Bài | Tiêu đề | Nhãn tiếng Việt | Trang in | PDF | Trạng thái nội dung |
|---:|---|---|---:|---:|---|
| 1 | 你好！ | Xin chào! | 1 | 9 | extracted |
| 2 | 你叫什么？ | Bạn tên là gì? | 5 | 13 | extracted |
| 3 | 他是谁？ | Bạn ấy là ai? | 9 | 17 | extracted |
| 4 | 我家有四口人。 | Nhà mình có bốn người | 14 | 22 | extracted |
| 5 | 我6岁。 | Mình sáu tuổi | 19 | 27 | extracted |
| 6 | 你的个子真高！ | Bạn cao thật! | 24 | 32 | extracted |
| 7 | 这是谁的狗？ | Đây là chó của ai? | 29 | 37 | extracted |
| 8 | 我去商店。 | Mình đi cửa hàng | 34 | 42 | extracted |
| 9 | 今天星期几？ | Hôm nay là thứ mấy? | 39 | 47 | extracted |
| 10 | 现在几点？ | Bây giờ là mấy giờ? | 44 | 52 | extracted |
| 11 | 你吃什么？ | Bạn ăn gì? | 49 | 57 | extracted |
| 12 | 复习 | Ôn tập | 54 | 62 | catalog-only (không có từ mới) |

Phụ lục: 词语表 Vocabulary tr.in 56 (pdf 64–66) · 课文和小故事翻译 tr.in 59 (pdf 67–68) ·
测试页听力文本 tr.in 61 · 测试页答案 tr.in 62 · YCT奖状 tr.in 63.

### 2.1 Cấu trúc lặp của mỗi bài
`Key sentences` → `Let's learn` (từ mới) → `Let's read` (hội thoại tranh) → `Let's match / play / sing / write`
→ `Mini story` (từ bài 3) → `Test` (Listening + Reading).
Sách **ưu tiên nghe–nói trước đọc–viết**; phần luyện viết nét **không** nằm trong MVP.

### 2.2 Kiểm chứng nhận định trong đề bài
- ✅ "PDF trang 9 là trang in 1, bài 1; có số 1–10 và các mục 你, 好, 老师, 再见" — **đúng**.
  Bài 1 **không** chỉ có lời chào: nửa trang là số đếm 1–10.
- ✅ 11 bài học + bài 12 ôn tập — **đúng**.
- ⚠️ "80 từ cốt lõi": đếm thực tế trong 词语表 được **104 mục**, trong đó **11 mục có dấu sao**
  (从 mở rộng) → 93 mục không sao. Nếu gộp 星期一…星期天 thành một nhóm thì còn 87.
  **Không ép về 80 bằng cách bỏ từ mở rộng.** Chênh lệch được ghi là `unresolved` và cần giáo viên đối chiếu
  với lời nói đầu (pdf tr.5–7).
- ⚠️ "10 điểm ngữ pháp, 9 chức năng giao tiếp": **chưa đọc kỹ** phần lời nói đầu để lập bảng ánh xạ.
  Ngữ pháp trong repo hiện là **teacher_authored draft** rút ra từ Key sentences, chưa phải danh mục của sách.

---

## 3. Nguồn tiếng Việt

Sách là bản **Trung – Anh**. **Không có** nghĩa tiếng Việt trong nguồn.
→ Toàn bộ cột `meaningVi` là **bản dịch do AI soạn từ gloss tiếng Anh của sách**:
`origin: "ai_draft"`, `verificationStatus: "needs_teacher_check"`. Không được xuất bản cho lớp
trước khi giáo viên duyệt. Chữ Hán, pinyin và gloss tiếng Anh giữ `origin: "textbook"`.

Trang cần giáo viên đối chiếu trước tiên (ưu tiên giảm dần):

| Ưu tiên | PDF | Trang in | Vì sao |
|---|---:|---:|---|
| 1 | 64–66 | 56–58 | 词语表 — nguồn của toàn bộ từ vựng; pinyin dấu thanh, dấu sao mở rộng |
| 2 | 9, 13, 17, 22, 27, 32, 37, 42, 47, 52, 57 | 1,5,9,14,19,24,29,34,39,44,49 | Key sentences + Let's learn của 11 bài |
| 3 | 10, 14, 18, 23, 28, 33, 38, 43, 48, 53, 58 | 2,6,10,15,20,25,30,35,40,45,50 | Let's read — hội thoại |
| 4 | 67–68 | 59–60 | Bản dịch hội thoại (đối chiếu nghĩa) |
| 5 | 5–7 | i–iii | Lời nói đầu: xác nhận 80 từ / 10 ngữ pháp / 9 chức năng |
| 6 | 62–63 | 54–55 | Bài 12 ôn tập — chưa trích xuất |
| 7 | 69–71 | 61–63 | Listening scripts + đáp án — nguồn cho dạng nghe |

### 3.1 Điểm cần soi kỹ (rủi ro đọc sai)
- `gèzi 个子` vs `gè 个` — chỉ khác thanh/khinh thanh; ảnh scan tr.56 in `ge` (khinh thanh) cho 个.
- `bù 不` in trong 词语表 là `bù`; trong hội thoại xuất hiện **biến điệu** `bú zài`, `bù dà`, `bù cháng`.
  App lưu **pinyin từ điển** riêng và **pinyin trong ngữ cảnh** riêng — xem `pinyinNote`.
- `nǎ 哪` / `nà 那` / `nǎr 哪儿` / `nàr 那儿` — dễ lẫn dấu thanh.
- `tā 他` (bài 3) và `tā 她` (bài 2) — cùng pinyin, khác chữ. **Không được dùng làm distractor của nhau
  trong dạng pinyin → nghĩa** (sẽ tạo câu có hai đáp án đúng). Đã chặn bằng luật ambiguity.
- `一 yī` trong 一个妹妹 đọc `yí` — biến điệu, ghi ở `pinyinNote`.
- `星期天 Xīngqītiān` — sách viết hoa X; giữ nguyên chính tả của sách.

---

## 4. Audit tệp HTML tham chiếu

### 4.1 Giữ lại (KEEP)
| # | Nội dung | Ghi chú |
|---|---|---|
| K1 | Bảng màu: `--paper #ece5d6`, `--ink #2a2420`, `--seal #b23a3a`, `--jade #4f7c6d`, `--gold #b08d57` | Thành design token; bổ sung biến thể đạt tương phản |
| K2 | Font `Nunito` + `Noto Serif SC` | Thêm fallback Việt/Trung đầy đủ, tự phục vụ font |
| K3 | Thẻ bo góc, nền giấy, "con dấu" đỏ | Giữ nhận diện |
| K4 | Chọn phạm vi bài + "Chọn tất cả" | Giữ, đổi nguồn: catalog thay vì "bài nào có dữ liệu" |
| K5 | Ba mức Dễ / Trung bình / Khó = mức trợ giúp | Giữ nguyên triết lý (không đổi phạm vi kiến thức) |
| K6 | Modal cảnh báo "đang làm dở" khi đổi phạm vi | Giữ, thêm bẫy focus |
| K7 | Nhập TSV dán từ Google Sheets, có mẫu để chép | Giữ, mở rộng CSV/JSON |
| K8 | Cổng chặn khi ngân hàng quá ít dữ liệu (`setGate`) | Giữ, thông báo cụ thể hơn |
| K9 | Giải thích ngữ pháp bằng tiếng Việt sau khi trả lời | Giữ |

### 4.2 Sửa (FIX)
| # | Vấn đề trong HTML | Bằng chứng | Cách sửa |
|---|---|---|---|
| F1 | **Mã giáo viên hard-code** `const TEACHER_CODE = "laoshi"` | dòng 372 | Bỏ hoàn toàn. Xác thực ở server, mật khẩu băm Argon2id, phiên cookie HttpOnly |
| F2 | Phụ thuộc `window.storage` (API của môi trường host) | dòng 823, 835, 840, 845 | Lớp `ContentRepository` có 2 cài đặt: `demo` (IndexedDB) và `api` (HTTP) |
| F3 | **XSS**: dữ liệu nhập chèn thẳng vào `innerHTML` | dòng 1108–1121, 1181, 1215–1221, 1253–1260, 1319–1334 | Chỉ render bằng text node / JSX; báo lỗi cũng là text |
| F4 | `window._pending` toàn cục, không ràng buộc loại/nội dung | dòng 1302, 1314, 1328 | `ValidatedBatch {kind, contentHash, schemaVersion, validatedAt}`; đổi tab hoặc sửa text → huỷ |
| F5 | Cập nhật `BANK` **trước** khi lưu thành công | dòng 1329–1334 | Chỉ commit vào state sau khi server trả 2xx; lỗi → giữ nguyên bản cũ |
| F6 | `dlReset` gọi `saveBank()` mà không kiểm tra kết quả | dòng 1338–1340 | Kiểm tra kết quả, báo lỗi thật |
| F7 | **Đọc số bài sai**: `r.bai.replace(/[^\d]/g,"")` biến `-1`→`1`, `1abc2`→`12` | dòng 934 | Regex `^\d+$` nghiêm ngặt + kiểm tra `lessonId` tồn tại trong catalog |
| F8 | Distractor lấy toàn bộ pool, chỉ loại trùng **chuỗi** | dòng 1112, 1117, 1121 | Loại theo nghĩa tương đương + đồng âm; xem §4.4 |
| F9 | `.slice(0,3)` → có thể ra **1 lựa chọn** mà vẫn hiển thị | dòng 1123 | Tối thiểu 2 lựa chọn; thiếu thì chuyển sang thẻ nhớ và báo rõ |
| F10 | "Tự luận" thực ra là flashcard tự chấm | panel `#panel-tl` | Đổi tên **Thẻ nhớ**, điểm self-report tách khỏi độ chính xác |
| F11 | Toàn bộ khung cứng `max-width: 480px` | dòng 154 `.app` | Thẻ học 480–640px, dashboard giáo viên rộng hơn; mobile-first từ 360px |
| F12 | Tab bar 5 tab nhỏ, chữ xuống dòng | dòng 179–185 | Điều hướng dưới: Học / Luyện tập / Trò chơi / Tiến độ; giáo viên có lối vào riêng |
| F13 | Chấm điểm ở client, không lưu lượt trả lời | `answer()` dòng 1140 | Chấm ở server, ghi `AnswerEvent` idempotent |
| F14 | Không có trạng thái loading / offline / lỗi mạng | — | Thiết kế đủ 6 trạng thái |
| F15 | `strip()` bỏ dấu tiếng Việt — **tuyệt đối không** dùng cho pinyin | dòng 810 | Hàm chuẩn hoá header riêng; pinyin có bộ so sánh riêng giữ dấu và `ü` |
| F16 | Nút chạm nhỏ hơn 44px (`.lp` padding 6/11) | dòng 55 | Tối thiểu 44×44 CSS px |
| F17 | Không có nhãn nguồn / trạng thái duyệt | — | Mỗi mục có `origin`, `verificationStatus`, `reviewedBy` |

### 4.3 Thêm mới (NEW)
M04 Nghe–chọn · M07 hai trò chơi · M08 tiến độ & ôn lại 1/3/7 ngày · lớp học – bài giao – báo cáo ·
import có preview diff và publish theo revision · authz phía server · a11y bàn phím/screen reader ·
catalog YCT tách khỏi HSK.

### 4.4 Luật distractor (thay cho F8)
Một phương án bị loại nếu: trùng chuỗi đáp án; nghĩa Việt trùng sau chuẩn hoá; **cùng pinyin** với đáp án
(她/他, 那/哪 khi chỉ hỏi pinyin); nằm ngoài phạm vi bài đã chọn (trừ khi giáo viên bật "ôn kiến thức cũ").
Không đủ phương án → giảm còn 3 hoặc 2 và **hiển thị đúng số lượng**; dưới 2 → chuyển sang thẻ nhớ.

---

## 5. Dữ liệu HSK 1 trong HTML

HTML khai nguồn "Giáo trình chuẩn HSK 1 (bản dịch Nhân Trí Việt), 词语总表 tr.132–139".
**Không có giáo trình HSK gốc đính kèm** → không đối chiếu được.
Trong repo, bộ này nằm ở `content/hsk1/` với `verificationStatus: "unverified_no_source"` và
**không** được phép đưa vào bài giao. Dùng cho: kiểm thử migration, kiểm thử "chương trình chưa có nội dung duyệt".
Không quy đổi HSK ↔ YCT. Không tuyên bố tuân thủ chuẩn thi.

Thống kê bộ HSK trong HTML: 187 mục từ vựng, 118 câu, 60 câu ngữ pháp, bài 1–15.

---

## 6. Phần chưa rõ / chưa làm (unresolved)

| ID | Nội dung | Ảnh hưởng |
|---|---|---|
| U1 | Bài 12 (ôn tập) chưa trích xuất | Catalog có, nội dung trống → hiển thị "Chưa có bài học" |
| U2 | Số từ cốt lõi 104 vs 80 công bố | Cần giáo viên xác nhận cách đếm |
| U3 | Danh mục 10 điểm ngữ pháp của sách | Ngữ pháp hiện là draft tự soạn |
| U4 | Listening scripts (tr.in 61) chưa trích xuất | Dạng nghe hiện dùng từ/câu của bài, không dùng đề Test của sách |
| U5 | Không có tệp audio hợp pháp | Chỉ có TTS, gắn nhãn "Giọng đọc máy" |
| U6 | Mini story bài 3–11 mới đọc bản dịch tiếng Anh, chưa trích chữ Hán | Chưa dùng làm nội dung |
| U7 | Tên riêng 星星/月月/明明/成龙 chưa có quy ước phiên âm tiếng Việt | Giữ nguyên chữ Hán + pinyin |
