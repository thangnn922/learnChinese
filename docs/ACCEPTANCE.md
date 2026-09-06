# Bảng nghiệm thu

Mọi dòng `PASS` dưới đây đều đến từ một lần chạy thật trên máy dựng, không phải ước lượng.
Lệnh tái hiện nằm ở cuối tài liệu.

## Môi trường đã chạy

| Mục | Giá trị |
|---|---|
| Ngày chạy | 2026-09-06 (UTC) |
| Node | v22.22.2 |
| Trình duyệt | Chromium 1194 (HeadlessChrome/141), Playwright 1.49.1 |
| PostgreSQL | 16.13 (Ubuntu 16.13-0ubuntu0.24.04.1), cổng 5433 |
| Web build | Vite 5.4.11, production, chế độ **demo** cho E2E học sinh và Lighthouse; chế độ **server** cho E2E hai thiết bị |
| Phục vụ web | `vite preview` tại `http://localhost:4173/` |
| API | Fastify 4.28.1 tại `http://127.0.0.1:8787` |
| Lighthouse | 12.2.1, preset mobile mặc định (412×823, DPR 1.75, CPU ×4, RTT 150 ms, 1 638 kbps) |
| buildVersion | *(chưa có commit git — repo chưa khởi tạo lịch sử)* |

## Bảng kết quả

| Task/Test ID | Tình huống | Trạng thái | Kết quả đo thực | Bằng chứng | Vấn đề & bước tiếp |
|---|---|---|---|---|---|
| **EDU-01** | Chọn YCT bài 1, sinh 100 lượt với seed ghi lại | **PASS** | 0 mục ngoài phạm vi trên 100 seed `EDU-01/run-0…99`; không có lessonId nào không bắt đầu bằng `yct1-` | `packages/shared/src/__tests__/questions.test.ts` | — |
| **EDU-02** | Thiếu distractor / nghĩa tương đương | **PASS** | 他/她 cùng pinyin bị loại khi đề là pinyin; 学/学习 trùng nghĩa bị loại; 2 từ → câu 2 lựa chọn; 1 từ → chuyển thẻ nhớ; toàn ngân hàng: mọi câu đúng 1 đáp án | như trên | — |
| **EDU-03** | Sai lần đầu rồi đúng; thẻ tự đánh giá | **PASS** | điểm lần đầu 1/2 = 50% không bị sửa; self-report 1/2 báo riêng; câu bỏ qua không vào tử/mẫu; chưa có câu chấm → `null`, không chia 0 | `packages/shared/src/__tests__/progress.test.ts` | — |
| **EDU-04** | Đổi mức khó ở pinyin→nghĩa và nghe | **PASS** | mức Khó vẫn hiện pinyin ở dạng pinyin→nghĩa; dạng nghe `promptHanzi`/`promptPinyin`/`promptText` đều rỗng trước khi trả lời | `questions.test.ts` | — |
| **EDU-05*** | Hình gợi ý không được làm lộ đáp án | **PASS** | 4 dạng có đáp án là nghĩa đều `promptEmoji === ''` | `questions.test.ts` | *Test bổ sung sau khi ảnh chụp cho thấy 7️⃣ làm lộ “số bảy” |
| **DATA-01** | TSV/CSV có BOM, quote, newline, bài không hợp lệ | **PASS** | `-1` và `1abc2` bị báo lỗi đúng dòng 2 và 3 (không biến thành 1 và 12); bài 99 ngoài chương trình bị chặn; chỉ dòng hợp lệ được nhận | `packages/shared/src/__tests__/import.test.ts` | — |
| **DATA-02** | Kiểm tra vocab rồi đổi tab hoặc sửa nội dung | **PASS** | sửa một ký tự → `isBatchFresh` false; đổi loại → false; server trả `BATCH_STALE`, `content_head` không đổi | `import.test.ts`, `apps/server/src/__tests__/api.test.ts` | — |
| **DATA-03** | Publish: mất mạng, double-submit, xung đột revision | **PASS** | gửi lại batch cũ → `REVISION_CONFLICT`, không nhân đôi (1 hàng); hai giáo viên đồng thời → người sau bị từ chối, dữ liệu người trước còn nguyên; lô có lỗi → 400, revision không tăng | `api.test.ts` | Mất mạng thật chưa mô phỏng ở tầng TCP; đã chứng minh bằng giao dịch nguyên khối + kiểm thử double-submit |
| **DATA-04** | Hai thiết bị và rollback khi học sinh đang làm | **PASS** | lượt đang chạy giữ revision cũ, câu hỏi không đổi sau khi giáo viên publish; thiết bị mới nhận revision mới; rollback tạo revision mới, `audit_events` tăng, tổng kết lượt cũ vẫn đúng | `api.test.ts` | — |
| **SEC-01** | Gọi thẳng API giáo viên khi chưa đăng nhập | **PASS** | 5/5 endpoint trả 401/403; số `content_revisions` không đổi; thiếu CSRF token → 403; giao diện `/giao-vien` chỉ hiện màn đăng nhập, không lộ bảng nội dung | `api.test.ts`, `e2e/server-flow.mjs` | — |
| **SEC-02** | Học sinh A đổi ID sang B; giáo viên lớp khác | **PASS** | đọc/ghi lượt của bạn khác → 403, không ghi `answer_events`; giáo viên lớp khác đọc báo cáo và tạo bài giao → 403, không tạo assignment; học sinh gọi API giáo viên → 403; mã lớp đúng nhưng sai mã truy cập → 401 | `api.test.ts` | — |
| **SEC-03** | Import payload HTML/script; export ô công thức | **PASS** | `<img src=x onerror=alert(1)>` lưu nguyên văn dưới dạng dữ liệu, giao diện render bằng text node (không có `innerHTML` trong toàn bộ `apps/web/src`); `=1+1` → `'=1+1` khi xuất TSV | `api.test.ts`, `import.test.ts` | — |
| **SEC-04** | Sửa score/correctness từ client; gửi answer lặp | **PASS** | client gửi kèm `correct:true, score:999` bị bỏ qua, server chấm lại; payload attempt gửi cho client **không chứa** `correctOptionId`/`acceptedAnswers`; cùng khoá → `duplicate:true`; khoá khác cùng (attempt, question, try) → bị ràng buộc UNIQUE chặn, vẫn chỉ 1 hàng | `api.test.ts` | — |
| **UX-01** | 360×800, 768×1024, 1440×900; zoom 200% | **PASS** | không tràn ngang ở 320 / 360 / 640 / 768 / 1280 / 1440 và ở zoom 200% (1280 và 640); mọi vùng chạm ≥ 44×44 (0 phần tử vi phạm) | `e2e/learn-flow.mjs`, ảnh `e2e/shots/*.png` | Đã sửa 2 lỗi phát hiện trong lúc chạy: link chân trang 104×15 px, hàng bài học tràn 13 px khi phóng to |
| **UX-02** | Bàn phím, screen reader, reduced motion | **PASS** | Tab tới phương án rồi Enter trả lời được, không lỗi console; modal có bẫy focus và trả focus; `prefers-reduced-motion` tắt hoạt ảnh; Lighthouse accessibility 100 | `learn-flow.mjs`, `e2e/lighthouse/summary.json` | Chưa thử với NVDA/VoiceOver thật — xem P6-7 |
| **AUD-01** | Không có audio/giọng TTS, từ chối autoplay | **PASS** | Chromium headless không có giọng `zh-CN` → hiện “Máy này chưa có giọng đọc tiếng Trung — con nhờ cô đọc mẫu nhé.”, nút Nghe bị vô hiệu, 0 lỗi trang; không phát tiếng Việt/Anh thay thế; không tự phát khi mở màn hình | `learn-flow.mjs` | — |
| **FLOW-01** | Làm 10 câu rồi refresh/quay lại/đổi bài | **PASS** | trả lời 3 câu → refresh → tiếp đúng “Câu 4/5”; kết quả cuối vẫn mẫu số 5, không cộng hai lần; mở lại lượt đã xong không lỗi; thoát giữa chừng có hộp thoại “Học tiếp / Để dành lần sau” | `learn-flow.mjs` | — |
| **P3-01/02** | Hai phiên, hai thiết bị cùng dữ liệu | **PASS** | giáo viên xuất bản → revision 3; học sinh đăng nhập máy A làm dở, máy B thấy “Đang học dở” và mở đúng attempt đó; học sinh không thấy bảng nội dung giáo viên | `e2e/server-flow.mjs` | — |
| **PERF** | Lighthouse mobile màn hình chính | **PASS** | 3 lần: performance 97/97/97, accessibility 100/100/100, LCP 2 226 / 2 278 / 2 251 ms, TBT 30/20/25 ms, CLS 0, 131 KB | `e2e/lighthouse/summary.json` | Đo trên máy dựng, **chưa đo trên hạ tầng thật** |
| **CONTENT** | Nghiệm thu nội dung | **PARTIAL** | 177 mục có `source` đầy đủ (file, pdfPage, printedPage, section) và nhãn `origin`; **0 mục `reviewed`, 0 mục `published`** trong DB thật | `content/yct1/coverage.json` | **Chờ giáo viên duyệt** — P5-7, P5-9 |
| **P5-3** | Bài 12 (ôn tập) | **NOT RUN** | chưa trích xuất; catalog có, giao diện hiện “Chưa có bài học” | — | P5-3 |
| **P5-4/5** | Listening scripts, mini story chữ Hán | **NOT RUN** | — | — | P5-4, P5-5 |
| **P6-7** | Kiểm thử trình đọc màn hình thật | **NOT RUN** | cần máy có NVDA/VoiceOver | — | P6-7 |
| **SEC-scan** | Quét lỗ hổng phụ thuộc | **NOT RUN** | chưa chạy `npm audit` trong CI | — | P6-8 |

Tổng: **81 kiểm tra tự động PASS** (43 unit + 17 integration + 14 E2E demo + 7 E2E server),
0 FAIL, 0 BLOCKED ở tầng kỹ thuật; các mục NOT RUN đều cần dữ liệu hoặc thiết bị bên ngoài.

## Nội dung theo bài (tất cả ở trạng thái `draft`)

| Bài | Mục đã trích | Bài | Mục đã trích |
|---:|---:|---:|---:|
| 1 | 19 | 7 | 17 |
| 2 | 17 | 8 | 14 |
| 3 | 13 | 9 | 21 |
| 4 | 19 | 10 | 13 |
| 5 | 9 | 11 | 17 |
| 6 | 18 | 12 | **0 (unresolved)** |

Tổng 177 = 104 từ vựng (11 từ mở rộng có dấu \*) + 49 câu + 24 câu ngữ pháp.
HSK 1: 394 mục, tất cả `draft` + `unverified_no_source`, **không được giao bài**.

## JSON báo cáo

```json
{
  "phase": "P6",
  "buildVersion": null,
  "runAt": "2026-09-06T05:33:00Z",
  "environment": {
    "browser": "Chromium 1194 (HeadlessChrome/141.0.0.0), Playwright 1.49.1",
    "viewport": "360x800 · 320x800 · 640x900 · 768x1024 · 1280x900 · 1440x900; Lighthouse mobile 412x823 @1.75",
    "backendMode": "demo (E2E học sinh, Lighthouse) và server (E2E hai thiết bị, PostgreSQL 16.13)"
  },
  "content": {
    "catalogLessons": 12,
    "lessonsWithExtractedContent": 11,
    "itemsDraft": 177,
    "itemsReviewed": 0,
    "itemsPublished": 0,
    "unresolvedItems": 1,
    "outOfScopeItemsInTest": 0
  },
  "tests": { "passed": 81, "failed": 0, "blocked": 0, "notRun": 4 },
  "security": {
    "crossClassAccessBlocked": true,
    "xssBlocked": true,
    "clientSecretsFound": false
  },
  "performance": {
    "lighthouseMobilePerformance": 97,
    "lighthouseAccessibility": 100
  },
  "evidence": [
    "docs/source-audit.md",
    "content/yct1/coverage.json",
    "packages/shared/src/__tests__/ (43 test)",
    "apps/server/src/__tests__/api.test.ts (17 test)",
    "e2e/learn-flow.mjs (14 kiểm tra)",
    "e2e/server-flow.mjs (7 kiểm tra)",
    "e2e/lighthouse/summary.json",
    "e2e/shots/*.png"
  ],
  "knownLimitations": [
    "Nghĩa tiếng Việt là bản dịch AI từ gloss tiếng Anh của sách — chưa có giáo viên duyệt; 0 mục published trong DB thật",
    "Bài 12 (ôn tập), listening scripts và mini story chưa trích xuất",
    "Không có tệp audio hợp pháp; chỉ có TTS zh-CN gắn nhãn Giọng đọc máy",
    "Số Lighthouse đo trên máy dựng, chưa đo trên hạ tầng triển khai thật",
    "Chưa kiểm thử với trình đọc màn hình thật (NVDA/VoiceOver)",
    "Chưa quét lỗ hổng phụ thuộc trong CI",
    "Chưa có hàng đợi gửi lại câu trả lời khi mất mạng; chưa có rate limit ngoài đăng nhập",
    "Dữ liệu đã xoá vẫn tồn tại trong bản sao lưu cho tới khi bản đó hết hạn lưu",
    "Bộ HSK chưa đối chiếu giáo trình gốc; giữ riêng, cấm giao bài",
    "Chưa có tài khoản phụ huynh; chưa có ghi âm/chấm phát âm; không xin quyền micro"
  ],
  "nextActions": [
    "Giáo viên đối chiếu 104 từ + 49 câu và duyệt bản dịch tiếng Việt (P5-7, P5-9)",
    "Xác nhận cách đếm 80 từ cốt lõi / 10 điểm ngữ pháp với lời nói đầu (P5-8)",
    "Trích xuất bài 12, listening scripts, mini story (P5-3, P5-4, P5-5)",
    "Cung cấp bản ghi âm hợp pháp để thay TTS ở dạng nghe (P5-10)",
    "Chủ sản phẩm duyệt docs/PRIVACY-vi-draft.md và điền thời hạn lưu trữ",
    "Đo lại Lighthouse trên hạ tầng triển khai thật",
    "Chạy npm audit / quét phụ thuộc trong CI (P6-8)"
  ]
}
```

## Lệnh tái hiện

```bash
# 1. logic thuần
npm run test:unit

# 2. tích hợp (CẦN một database RIÊNG — bộ test sẽ xoá sạch dữ liệu trong đó)
createdb yct_test
DATABASE_URL=postgres://postgres@127.0.0.1:5433/yct_test npm run -w @yct/server test

# 3. E2E học sinh + a11y + Lighthouse (chế độ demo)
npm run -w @yct/web build
npm run -w @yct/web preview &            # :4173
node e2e/learn-flow.mjs
node e2e/lighthouse.mjs

# 4. E2E hai thiết bị (chế độ máy chủ)
DATABASE_URL=postgres://…/yct npm run db:migrate
SEED_TEACHER_PASSWORD=… SEED_STUDENT_CODE=… npm run db:seed
psql "$DATABASE_URL" -c "UPDATE content_item_versions SET status='published' WHERE lesson_id LIKE 'yct1-%';"
DATABASE_URL=… npm run -w @yct/server dev &      # :8787
VITE_BACKEND=server npm run -w @yct/web build && npm run -w @yct/web preview &
node e2e/server-flow.mjs

# 5. kiểm tra lại số đo tương phản
node -e "const h=x=>[1,3,5].map(i=>parseInt(x.slice(i,i+2),16)/255),
 l=c=>c<=0.03928?c/12.92:Math.pow((c+0.055)/1.055,2.4),
 L=x=>{const[r,g,b]=h(x).map(l);return 0.2126*r+0.7152*g+0.0722*b},
 cr=(a,b)=>((Math.max(L(a),L(b))+0.05)/(Math.min(L(a),L(b))+0.05)).toFixed(2);
 console.log('ink-soft/paper',cr('#5a4f43','#ece5d6'),'seal-text/paper',cr('#8a2b2b','#ece5d6'),
 'jade-text/paper',cr('#35564a','#ece5d6'),'gold-text/paper',cr('#7a5f2f','#ece5d6'))"
```
