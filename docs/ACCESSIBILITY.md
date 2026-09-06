# Accessibility — quyết định và số đo

## Tương phản màu (đo thật, không ước lượng)

Bảng màu gốc của tệp HTML tham chiếu được giữ làm **màu nền / màu nhấn**, nhưng
ba màu trong đó **không đạt** 4.5:1 khi dùng làm chữ. Đã bổ sung biến thể riêng cho chữ.

| Vai trò | Mã màu | Trên `--paper` #ece5d6 | Trên `--card` #f7f2e7 | Kết luận |
|---|---|---:|---:|---|
| `--ink` | `#2a2420` | 12.21 | 13.71 | ✓ chữ chính |
| `--ink-soft` | `#5a4f43` | 6.36 | 7.14 | ✓ chữ phụ |
| `--ink-muted` (bản gốc) | `#6b5f52` | 4.95 | 5.56 | ✓ nhưng sát ngưỡng → chỉ dùng cho chữ ≥18.66px in đậm |
| `--seal` (bản gốc) | `#b23a3a` | 4.70 | 5.28 | dùng làm **nền**; làm chữ thì dùng `--seal-text` |
| `--seal-text` | `#8a2b2b` | 6.80 | 7.64 | ✓ pinyin, số bài |
| `--jade` (bản gốc) | `#4f7c6d` | **3.77 ✗** | 4.24 ✗ | **không dùng làm chữ** — chỉ làm nền |
| `--jade-text` | `#35564a` | 6.49 | 7.29 | ✓ |
| `--gold` (bản gốc) | `#b08d57` | **2.46 ✗** | 2.77 ✗ | **không dùng làm chữ** — chỉ làm nền |
| `--gold-text` | `#7a5f2f` | 4.78 | 5.37 | ✓ |
| `#ffffff` trên `--seal` | — | 5.90 | | ✓ nút chính |
| `#ffffff` trên `--jade` | — | 4.73 | | ✓ nút phụ, chip đang chọn |
| `--ink` trên `--gold` | — | 4.95 | | ✓ nút vàng |

Tính bằng công thức tương phản WCAG 2.x trên giá trị sRGB tuyến tính hoá.
Script kiểm tra lại: xem lệnh trong `docs/ACCEPTANCE.md` mục UX.

`@media (prefers-contrast: more)` đẩy `--ink-soft` và `--ink-muted` về `#3d352c`
và tăng độ đậm đường kẻ.

## Không chỉ dựa vào màu

Đúng/sai luôn có **biểu tượng + chữ + lời giải**:

```
✓ Đúng rồi!        ✕ Chưa đúng.
你 nǐ — bạn        + 💡 giải thích ngắn bằng tiếng Việt
```

Nút đã chọn dùng `aria-pressed`, không chỉ đổi màu. Phương án đúng/sai còn có
`<span class="sr-only">(đáp án đúng)</span>` cho trình đọc màn hình.

## Bàn phím và focus

- `:focus-visible` viền 3px `#1c4f8f`, offset 2px — không bao giờ tắt outline mà không thay thế.
- Link “Bỏ qua điều hướng” ở đầu trang.
- `<Modal>` bẫy focus: mở → focus vào trong, `Tab` quay vòng, `Esc` đóng, đóng → trả focus
  về đúng phần tử đã mở nó, khoá cuộn nền.
- Bài chưa sẵn sàng có `tabIndex={-1}` + `aria-disabled` để bàn phím không lọt vào link chết.
- Trò chơi ghép cặp và xếp câu **không bắt buộc kéo thả**: chạm/Enter để chọn cũng chơi được.

## Vùng chạm

Tối thiểu 44×44 CSS px cho mọi `button`, `a[href]`, `input`. E2E `UX-01/tap-44` quét
toàn bộ phần tử tương tác trên trang đầu ở 360×800 và **fail nếu có bất kỳ phần tử nào nhỏ hơn**.

## Chữ Hán, pinyin, tiếng Việt

- `<html lang="vi">`; mọi nội dung Hán đặt `lang="zh-Hans"`.
- Font stack đủ dự phòng: Nunito → Be Vietnam Pro → system cho tiếng Việt;
  Noto Serif SC → Songti SC → Source Han Serif SC → Microsoft YaHei cho chữ Hán.
- `.qpinyin { line-height: 1.8 }` để dấu thanh (ā á ǎ à) và `ü` không bị cắt.
- `.qhanzi { word-break: keep-all }` để không tách chữ Hán giữa dòng.
- Cỡ chữ dùng `clamp()`, phóng to 200% không tràn ngang.

## Chuyển động

`@media (prefers-reduced-motion: reduce)` đặt `--dur`/`--dur-fast` về 0 và tắt hoạt ảnh
skeleton. Không có hiệu ứng tự chạy nào không tắt được.

## Trạng thái được thiết kế thật

Đang tải (skeleton đúng kích thước, `role="status"`), rỗng (“Chưa có bài học”), lỗi
(`role="alert"` + nút Thử lại), mất mạng (banner cố định), nút bị vô hiệu (nêu rõ lý do),
thiếu giọng đọc (“Máy này chưa có giọng đọc tiếng Trung”).
**Không hiển thị tiến độ hay thành tích bịa.**

## Kết quả Lighthouse (đã chạy thật)

Môi trường ghi trong `e2e/lighthouse/summary.json`.

| Chỉ số | Trung vị 3 lần | Mục tiêu | Kết quả |
|---|---:|---:|---|
| Performance (mobile) | **97** | ≥ 90 | ✓ |
| Accessibility | **100** | ≥ 95 | ✓ |
| Best Practices | 100 | — | |
| SEO | 91 | — | |
| LCP | 2 226 ms | — | |
| Total Blocking Time | 25 ms | — | |
| CLS | 0 | — | ✓ |
| Tổng byte | 131 KB | — | |

Môi trường đo: Chromium 1194 headless, preset mobile mặc định của Lighthouse 12
(Moto G Power, CPU ×4, mạng Slow 4G), build production của `apps/web`, chế độ demo,
phục vụ bằng `vite preview` tại `http://localhost:4173/`. **Đây là số đo trên máy dựng —
cần đo lại trên hạ tầng thật trước khi công bố.**

Lỗi accessibility đã sửa trong quá trình đo: `heading-order` (thẻ trong card dùng `<h3>`
ngay sau `<h1>`) → đổi thành `<h2 class="section">`.

## Chưa làm

- Chưa kiểm thử với trình đọc màn hình thật (NVDA / VoiceOver) — mới dùng axe qua Lighthouse
  và điều hướng bàn phím trong Chromium.
- Chưa kiểm thử với người dùng thật là trẻ 6–12 tuổi.
- Chưa có bản dịch giao diện cho ngôn ngữ khác ngoài tiếng Việt.
