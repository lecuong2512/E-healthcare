# SRS-REC-01 — Smoke test máy in thật (phần 12)

**Trạng thái: chưa thực hiện — thiếu thiết bị vật lý.**

Ngày 23/09/2026, danh sách `Win32_Printer` trên máy thực hiện chỉ có:

- OneNote (Desktop).
- Xuất sang WPS PDF.
- Microsoft Print to PDF.

Không có máy in POS K80 hoặc laser để xác nhận bản giấy, dao cắt giấy hay khả năng đọc QR sau in. Không gửi lệnh in tới máy in ảo và không coi QA PDF là smoke test vật lý đã đạt.

Phần triển khai và QA PDF đã được kiểm tra; xem [kết quả và cấu hình](reception-print-qa.md). Chạy các bước sau tại quầy khi có thiết bị.

## Chuẩn bị

1. Dùng môi trường kiểm thử và lịch hẹn giả lập; cấu hình thông tin phòng khám qua các biến `CLINIC_*` trong `.env.example`.
2. Ghi model máy in, phiên bản driver, trình duyệt, khổ giấy, người kiểm tra và thời gian vào bảng bên dưới.
3. Chọn scale **100%**, tắt header/footer của trình duyệt. K80 chọn giấy 80 mm; A5 chọn **148 × 210 mm, portrait**. Đối chiếu lề với cấu hình driver và vùng in được của thiết bị.
4. Đăng nhập lễ tân, tra cứu lịch hẹn hợp lệ. Thực hiện thu tiền/check-in bằng dữ liệu test, không dùng giao dịch thật để kiểm thử.

## POS K80

- [ ] Check-in thành công tự mở hộp thoại in, in ra giấy rộng 80 mm.
- [ ] Không cắt ngang chữ, tên bệnh nhân/chuyên khoa/phòng dài tự xuống dòng; tiếng Việt đủ dấu.
- [ ] Số thứ tự `1`, `99`, `999`, `1000` rõ ràng; mã lịch hẹn, giờ khám, giờ check-in và viện phí khớp API.
- [ ] QR quét được từ **bản giấy**, nội dung là mã lịch hẹn, đưa vào mục QR của quầy thì tra cứu đúng lịch hẹn.
- [ ] Có lời nhắc đến trước giờ khám 15 phút; footer không bị dao cắt làm mất chữ.
- [ ] Logo lỗi không che tên phòng khám hoặc để lại biểu tượng ảnh hỏng.
- [ ] Hủy hộp thoại rồi in lại: lịch hẹn vẫn CHECKED_IN, số thứ tự không đổi, không có POST check-in mới.
- [ ] Giả lập hết giấy/offline rồi khắc phục: in lại được mà không lặp nghiệp vụ.

## Laser A5

- [ ] Phiếu thu sau thanh toán in đúng A5 portrait, không xuất hiện trang trắng.
- [ ] Mã phiếu thu/giao dịch, tên bệnh nhân/bác sĩ, nội dung thu và thông tin phòng khám khớp backend/config.
- [ ] Số tiền, tiền khách đưa, tiền thừa, phương thức, người thu và giờ thanh toán đúng; số tiền căn phải.
- [ ] Tên/chuyên khoa dài vẫn đọc được, khu vực ký không bị cắt hoặc tách ngoài ý muốn.
- [ ] In lại gọi GET `/reception/appointments/:id/receipt`, mã phiếu và mã giao dịch không đổi, không có POST thu tiền mới; kiểm tra audit phía backend.
- [ ] Hủy in không đổi trạng thái thanh toán, giao diện không tuyên bố đã in thành công.

## Biên bản kết quả cần điền tại quầy

| Hạng mục | K80 | A5 |
| --- | --- | --- |
| Model/serial thiết bị | Chưa có | Chưa có |
| Driver / phiên bản | Chưa có | Chưa có |
| Trình duyệt / phiên bản | Chưa kiểm tra | Chưa kiểm tra |
| Giấy / scale / lề | Chưa kiểm tra | Chưa kiểm tra |
| QR từ bản giấy | Chưa kiểm tra | Không áp dụng |
| Số trang / cắt giấy / chữ ký | Chưa kiểm tra | Chưa kiểm tra |
| Người kiểm tra / ngày giờ | Chưa kiểm tra | Chưa kiểm tra |
| Kết quả / ảnh bằng chứng | Chưa kiểm tra | Chưa kiểm tra |

Chỉ đánh dấu phần 12 đạt sau khi có thiết bị và hoàn tất các kiểm tra tương ứng.
