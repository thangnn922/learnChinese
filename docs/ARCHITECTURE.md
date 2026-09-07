# Kiến trúc

## Nguyên tắc

1. **Logic tách khỏi giao diện.** Sinh câu hỏi, luật distractor, chấm điểm, parser và lịch ôn
   nằm trong `packages/shared` — hàm thuần, có seed, kiểm thử được không cần trình duyệt.
2. **Máy chủ là nguồn thật.** Client gửi *lựa chọn*, không gửi điểm. Đáp án không rời máy chủ
   cho tới khi học sinh đã trả lời.
3. **Nội dung có phiên bản.** Mỗi lần xuất bản tạo một revision mới. Lượt học khoá vào revision
   của nó, nên giáo viên xuất bản giữa chừng không đổi đáp án của học sinh đang làm.
4. **Không có biến toàn cục dùng chung, không có tệp HTML nguyên khối.**

## Miền

```
curriculum   Chương trình, phiên bản sách, danh mục bài (catalog toàn sách)
content      Mục nội dung + phiên bản + trạng thái duyệt + nguồn trích dẫn
practice     Sinh đề, chấm, lượt học, sự kiện trả lời
audio        Phát âm (TTS zh-CN có nhãn, hoặc tệp giáo viên đã kiểm tra)
games        Ghép cặp, xếp câu
progress     Tổng hợp, độ chính xác lần đầu, lịch ôn 1/3/7 ngày
classroom    Lớp, thành viên, bài giao, báo cáo
auth         Phiên, mật khẩu, CSRF, giới hạn tần suất
teacher-import  Parse → validate → preview diff → draft → duyệt → publish
shared-ui    Trạng thái tải/rỗng/lỗi/offline, modal có bẫy focus, mascot
```

## Thực thể

| Thực thể | Khoá | Ghi chú |
|---|---|---|
| `curricula` | (curriculum_id, level) | `source_verified` cho biết đã đối chiếu giáo trình gốc chưa |
| `lessons` | `lesson_id` = `yct1-l3` | **Không** dùng số bài trần: YCT bài 1 ≠ HSK bài 1 |
| `content_revisions` | `revision` | Mỗi lần publish/rollback một hàng |
| `content_item_versions` | (revision, item_id) | Chụp TOÀN BỘ nội dung ở mỗi revision |
| `content_head` | một hàng | Con trỏ tới revision đang hành |
| `users` | uuid | Học sinh **không có** email; ràng buộc CHECK ở lược đồ |
| `memberships` | (user_id, classroom_id) | `access_hash` = mã truy cập riêng của học sinh |
| `assignments` | uuid | Khoá vào một revision |
| `attempts` | uuid | Chứa `question_keys` (câu hỏi + đáp án), chỉ đọc ở server |
| `answer_events` | `idempotency_key` | Thêm `UNIQUE (attempt_id, question_id, try_index)` |
| `self_reports` | `idempotency_key` | Thẻ nhớ tự đánh giá — tách khỏi điểm |
| `review_states` | (user_id, content_id) | Bậc + hạn ôn |
| `audit_events` | bigserial | Rollback nội dung KHÔNG xoá bảng này |
| `sessions` | text | Cookie chỉ mang id; `csrf_token` nằm ở đây |

### `ContentItem`

```ts
{
  id, schemaVersion, type: 'vocab'|'sentence'|'grammar',
  curriculumId, level, edition, lessonId,
  hanzi, pinyin, meaningVi, glossEn, emoji, pinyinNote,
  promptVi, correct, wrongs[], explainVi,      // riêng grammar
  section,                                     // riêng sentence: 'key' | 'dialogue'
  isExtended,                                  // từ có dấu * trong 词语表
  origin: 'textbook'|'teacher_authored'|'ai_draft',
  meaningOrigin,                               // nghĩa tiếng Việt có nguồn RIÊNG
  source: { fileName, pdfPage, printedPage, section, verificationStatus },
  status: 'draft'|'reviewed'|'published'|'archived',
  reviewedBy, reviewedAt
}
```

`schemaVersion` cho phép migrate về sau. **Validate ở runtime bằng zod trên máy chủ** —
không dựa vào TypeScript, vì TypeScript biến mất khi biên dịch.

## Hợp đồng API

Mọi endpoint trả lỗi theo dạng `{ code, messageVi, details? }` với `code` trong
`ERROR_CODES` của `@yct/shared`.

| Method | Đường dẫn | Quyền | Ghi chú |
|---|---|---|---|
| GET | `/api/me` | ai cũng gọi được | trả `null` khi chưa đăng nhập |
| POST | `/api/auth/teacher/login` | — | throttle theo email+IP |
| POST | `/api/auth/student/login` | — | cần **mã lớp + biệt danh + mã truy cập riêng** |
| POST | `/api/auth/logout` | đã đăng nhập | huỷ phiên trong DB |
| GET | `/api/curricula` | đã đăng nhập | |
| GET | `/api/curricula/:c/:level/catalog` | đã đăng nhập | catalog TOÀN SÁCH kèm trạng thái sẵn sàng |
| POST | `/api/attempts` | học sinh/giáo viên | khoá revision; `EMPTY_BANK` nếu chưa có nội dung duyệt |
| GET | `/api/attempts/:id` | **chủ sở hữu** | 403 nếu không phải của mình |
| POST | `/api/attempts/:id/answers` | chủ sở hữu | idempotent; server chấm |
| POST | `/api/attempts/:id/self-reports` | chủ sở hữu | không vào điểm |
| POST | `/api/attempts/:id/finish` | chủ sở hữu | |
| GET | `/api/attempts/:id/summary` | chủ sở hữu | |
| GET | `/api/progress` | đã đăng nhập | chỉ dữ liệu của chính mình |
| GET | `/api/games/:kind` | đã đăng nhập | |
| GET | `/api/teacher/content` | teacher/admin | |
| POST | `/api/teacher/content/review` | teacher/admin | tạo revision mới |
| POST | `/api/teacher/import/validate` | teacher/admin | trả issue theo dòng/cột + diff |
| POST | `/api/teacher/import/publish` | teacher/admin | atomic + optimistic concurrency |
| POST | `/api/teacher/content/rollback` | teacher/admin | tạo revision mới từ revision cũ |
| GET | `/api/teacher/classrooms` | teacher/admin | chỉ lớp được cấp quyền |
| POST | `/api/teacher/classrooms/:id/assignments` | teacher của lớp đó | 403 nếu lớp khác |
| GET | `/api/teacher/classrooms/:id/report` | teacher của lớp đó | 403 nếu lớp khác |
| POST | `/api/admin/users` | admin | **không có đăng ký tự do** |
| POST | `/api/practice/start` | — | **luyện tập ẩn danh**: không đăng nhập, không ghi DB |
| POST | `/api/practice/resume` | — | dựng lại bộ câu hỏi từ `practiceId` khi tải lại trang |
| POST | `/api/practice/answer` | — | máy chủ chấm; đáp án không rời máy chủ |
| GET | `/api/health` | — | liveness, **không** truy vấn DB |
| GET | `/api/health/db` | — | readiness, 503 khi DB không phản hồi |
| GET | `/*` | — | tệp tĩnh của `apps/web/dist`; điều hướng trang trả `index.html` |

## Mô hình phiên bản nội dung

```
publish(baseRevision, upsert, removeIds):
  BEGIN
    LOCK TABLE content_head IN EXCLUSIVE MODE     ← hai giáo viên không ghi đè nhau
    if head != baseRevision: raise REVISION_CONFLICT
    next = head + 1
    INSERT content_revisions(next)
    INSERT ... SELECT: chép toàn bộ mục của head sang next (trừ removeIds)
    UPSERT các mục trong upsert vào next
    UPDATE content_head = next
    INSERT audit_events
  COMMIT
```

- **Chỉ khi COMMIT xong** giao diện mới báo “Đã xuất bản”.
- Mất mạng giữa chừng: giao dịch rollback, `content_head` không đổi, bản nháp trên máy giáo viên còn nguyên.
- Gửi hai lần: lần hai mang `baseRevision` cũ → `REVISION_CONFLICT`, không nhân đôi.
- Rollback = publish nội dung của revision cũ thành revision **mới**; báo cáo attempt lịch sử không bị đụng.

## Lớp lưu trữ ở web

`LearnApi` là hợp đồng chung. `DemoApi` (IndexedDB) và `HttpApi` (fetch) cài đặt cùng
giao diện đó; các màn hình không biết mình chạy chế độ nào. Demo mô phỏng đúng luồng
(khoá revision, chấm “ở server”, ghi idempotent) nhưng **không** có phân quyền giữa hai
người dùng và **không** đồng bộ giữa hai máy — giao diện luôn nói rõ điều này.

Không lưu ở trình duyệt: token đăng nhập, đáp án bài kiểm tra, dữ liệu riêng của trẻ.
`sessionStorage` chỉ giữ lựa chọn phạm vi/độ khó, mọi truy cập đều bọc `try/catch`.

## Xác định lại được lỗi

Mọi lần sinh đề đi qua `createRng(seed)` (mulberry32) với `seed = attemptId:revision`.
Một báo cáo lỗi kèm `attemptId` và `revision` tái hiện chính xác bộ đề.
