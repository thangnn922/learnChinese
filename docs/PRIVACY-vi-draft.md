# BẢN NHÁP — Thông báo quyền riêng tư

> **Đây là bản nháp do đội kỹ thuật soạn để chủ sản phẩm và người phụ trách pháp lý duyệt.**
> Chưa phải văn bản có hiệu lực. Ứng dụng **không** tự động đạt bất kỳ chứng nhận hay
> yêu cầu pháp luật nào (Nghị định 13/2023/NĐ-CP, COPPA, GDPR-K…) chỉ vì đã cài các biện pháp
> kỹ thuật mô tả dưới đây. Cần rà soát theo pháp luật nơi triển khai trước khi công bố.

## 1. Chúng tôi thu thập gì

**Của học sinh**

| Dữ liệu | Vì sao cần |
|---|---|
| Biệt danh do giáo viên đặt (ví dụ “Bé Mít”) | để giáo viên biết ai đang học |
| Mã truy cập riêng (lưu dưới dạng băm) | để chỉ đúng học sinh đó đăng nhập được |
| Lớp học được gán | để hiện đúng bài giao |
| Câu trả lời, lần trả lời đầu, số lần thử, trợ giúp đã dùng, thời gian hoạt động | để giáo viên biết cần ôn gì |
| Loại hoạt động và phiên bản câu hỏi | để đối chiếu khi có sai sót |
| Lịch ôn lại từng mục | để nhắc ôn đúng lúc |

**Chúng tôi KHÔNG thu thập của học sinh:** họ tên đầy đủ bắt buộc, email cá nhân, ngày sinh
đầy đủ, ảnh khuôn mặt, số điện thoại, địa chỉ nhà, vị trí, thông tin thiết bị dùng để theo dõi.
Lược đồ cơ sở dữ liệu có ràng buộc chặn tài khoản học sinh có email.

**Của giáo viên và quản trị viên:** email công việc, tên hiển thị, mật khẩu (băm bằng scrypt).

**Kỹ thuật:** bản ghi kiểm toán các lần đăng nhập (thành công/thất bại) có **giá trị băm** của
địa chỉ IP, không lưu IP thô.

## 2. Chúng tôi KHÔNG làm

- Không quảng cáo.
- Không gắn công cụ theo dõi của bên thứ ba.
- Không có phòng chat công khai.
- Không có hồ sơ hay bảng điểm công khai; không có bảng xếp hạng.
- Không bán, không chia sẻ dữ liệu cho bên thứ ba vì mục đích thương mại.
- Không gửi email hay tin nhắn tự động cho học sinh khi giáo viên xuất bản nội dung.
- Không dùng dữ liệu của trẻ để huấn luyện mô hình AI.

## 3. Ai xem được gì

| Người | Xem được |
|---|---|
| Học sinh | chỉ dữ liệu của chính mình |
| Giáo viên | chỉ học sinh trong lớp được gán cho họ |
| Quản trị viên | quản lý tài khoản và lớp trong đơn vị |
| Phụ huynh | **chưa có tài khoản trong bản này** — xem mục 6 |

Phân quyền được kiểm tra ở máy chủ cho từng đối tượng, không dựa vào việc ẩn nút trên giao diện.

## 4. Lưu trong bao lâu

*(Chủ sản phẩm điền số cụ thể trước khi công bố.)*

| Loại | Đề xuất | Ghi chú |
|---|---|---|
| Kết quả học tập | hết năm học + ___ tháng | giáo viên xoá được sớm hơn |
| Bản ghi kiểm toán bảo mật | ___ tháng | không xoá khi rollback nội dung |
| Bản sao lưu cơ sở dữ liệu | ___ ngày (đề xuất 30) | **dữ liệu đã xoá vẫn còn trong bản sao lưu cho tới khi bản đó hết hạn** |

## 5. Quyền của phụ huynh / người giám hộ

Liên hệ giáo viên hoặc nhà trường để: xem dữ liệu của con, yêu cầu sửa, yêu cầu xoá,
hoặc rút lại sự đồng ý. Đội vận hành thực hiện trong vòng ___ ngày làm việc.
Xem `docs/RUNBOOK.md` mục “Xoá dữ liệu” cho quy trình kỹ thuật.

Giới hạn cần nói rõ với phụ huynh: sau khi xoá, dữ liệu vẫn tồn tại trong các bản sao lưu
đã tạo trước đó cho tới khi các bản sao lưu ấy hết hạn lưu.

## 6. Ngoài phạm vi bản này

- **Tài khoản phụ huynh** chưa có. Mô hình liên kết người giám hộ đã được thiết kế nhưng
  chưa triển khai. Không có dashboard cho phụ huynh, và không tài khoản nào đọc được
  mọi học sinh.
- **Ghi âm giọng nói / chấm phát âm**: chưa có. Ứng dụng **không xin quyền micro**.
- **Trợ lý AI trò chuyện cho trẻ**: không có. Nếu sau này thêm công cụ AI soạn bài,
  công cụ đó chỉ dành cho giáo viên, đầu ra luôn ở trạng thái nháp, và **không gửi dữ liệu
  nhận diện trẻ** ra ngoài.

## 7. Bảo mật kỹ thuật đang áp dụng

- Mật khẩu và mã truy cập băm bằng scrypt, so sánh theo thời gian hằng định.
- Phiên đăng nhập trong cookie `HttpOnly`, `SameSite=Lax`, bật `Secure` khi chạy HTTPS;
  huỷ phiên khi đăng xuất; giới hạn 10 lần đăng nhập sai / 15 phút cho mỗi khoá.
- Chống CSRF bằng double-submit token cho mọi thao tác thay đổi dữ liệu.
- Mọi truy vấn SQL tham số hoá; Content-Security-Policy chặn script bên ngoài.
- Nội dung do người dùng nhập luôn hiển thị dưới dạng văn bản, không bao giờ dựng thành HTML.
- Xuất tệp cho bảng tính được chặn formula injection.
- Nhật ký không ghi mật khẩu, token hay nội dung riêng của trẻ.

## 8. Liên hệ

*(Chủ sản phẩm điền: tên đơn vị, địa chỉ, email phụ trách dữ liệu.)*
