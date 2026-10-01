# YÊU CẦU HOÀN THIỆN & CHUẨN HÓA TASK [SECTION 5.2 & 5.3]
## Máy Trạng Thái Vòng Đời Lịch Hẹn, Xử Lý Hủy Lịch & Hoàn Tiền (PR #19)

- **Người thực hiện:** Đổng Văn Tú (Backend / Core Team)
- **Người rà soát / Lead:** Lê Việt Cường (Technical Lead / Core Backend)
- **Tài liệu căn cứ:** 
  - `docs/SRS-EHEALTH-2026-V1.docx` (Section 5.2, Section 5.3, SRS-PAT-05, SRS-DOC-02, NFR-PERF-01, NFR-SEC-01)
  - `docs/Kế hoạch Phân công Dự án EHealth (SRS-EHEALTH-2026-V1).xlsx` (Sprint 2 - Card 2.3 & Sprint 3)
  - Báo cáo kỹ thuật của Tú: `Báo cáo [Section 5.2 & 5.3] Máy Trạng thái Vòng đời Lịch hẹn & Xử lý Hủy lịch, Hoàn tiền`
- **Ngày ban hành:** 23/09/2026
- **Trạng thái:** **CẦN SỬA ĐỔI & BỔ SUNG (ACTION REQUIRED)**

---

## 1. ĐÁNH GIÁ CHUNG VỀ KẾT QUẢ ĐẠT ĐƯỢC

### 1.1. Các điểm làm tốt (Đã nghiệm thu)
1. **Máy trạng thái (State Machine) cốt lõi:** Ma trận chuyển trạng thái (`TRANSITIONS`) được định nghĩa chặt chẽ, kiểm soát đúng quyền hạn của từng vai trò (`PATIENT`, `DOCTOR`, `RECEPTIONIST`, `ADMIN`).
2. **Công thức hoàn tiền theo thời gian:** Hàm `patientRefundPercent` tính toán chính xác mốc $\ge 24h$ (100%), $2h \le t < 24h$ (70%), $< 2h$ (0%).
3. **Cơ chế bồi thường khi phòng khám hủy lịch:** Đã tự động phát hành mã voucher giảm giá 20% có hạn 6 tháng dạng `COMPENSATE-20-XXXXXX` gắn liền với tài khoản bệnh nhân và ca khám bị hủy.
4. **Giải phóng slot an toàn:** Khi lịch hẹn bị hủy, slot khám trong bảng `doctor_schedules` được hoàn trả về `AVAILABLE` ngay trong cùng một Database Transaction.

### 1.2. Lý do cần hoàn thiện và chuẩn hóa lại
Dù PR #19 đã được gộp vào nhánh `develop`, nhưng qua rà soát kỹ thuật thực tế cho thấy mã nguồn hiện tại đang tồn tại các xung đột và thiếu sót cần phải được **Refactor & Hoàn thiện khẩn cấp**:
- **Quy trình chưa đạt chuẩn:** PR tự ý merge khi chưa có Peer Review / Approved Review từ Technical Lead.
- **Xung đột kiến trúc:** Trùng lặp scheduler chạy ngầm với hạ tầng BullMQ Queue & Cron Schedulers đã hoàn thành ở Card 3.12 (PR #18).
- **Trùng lặp Route Controller:** Hai controller cùng bắt `@Controller('appointments')` gây nguy cơ sai lệch định tuyến API.
- **Lỗi phân mảnh migration:** Dư thừa câu lệnh constraint và hàm rollback không an toàn trong TypeORM migrations.
- **Độ bao phủ kiểm thử quá thấp:** Chỉ có 2 test case tĩnh, hoàn toàn chưa có test cho các luồng nghiệp vụ hủy lịch, phân quyền và CSDL.

---

## 2. HƯỚNG DẪN THAO TÁC GIT ĐỂ SỬA ĐỔI & BỔ SUNG

Hiện tại toàn bộ code của PR #19 đã nằm trên `develop`. Tú chỉ cần tạo một nhánh hoàn thiện mới (`fix/appointment-lifecycle-refactor`) tách trực tiếp từ `develop` mới nhất để thực hiện các chỉnh sửa:

### Các bước thực hiện:
```bash
# 1. Chuyển về nhánh develop và kéo mã nguồn mới nhất về
git checkout develop
git pull origin develop

# 2. Tạo nhánh sửa đổi và hoàn thiện mới từ develop
git checkout -b fix/appointment-lifecycle-refactor

# 3. Tiến hành chỉnh sửa các hạng mục theo checklist ở Mục 3 bên dưới
```

> **Lưu ý quy trình:**
> - Toàn bộ code tính năng trước đó của Tú vẫn được bảo toàn nguyên vẹn trên `develop`. Tú chỉ cần chỉnh sửa, dọn dẹp các điểm xung đột và bổ sung bộ test.
> - Sau khi sửa xong, Tú commit và đẩy nhánh `fix/appointment-lifecycle-refactor` lên remote, sau đó mở Pull Request mới vào `develop` để Tech Lead review và phê duyệt.

---

## 3. CHECKLIST CHI TIẾT CÁC HẠNG MỤC CẦN SỬA & HOÀN THIỆN

### [ ] Mục 1: Xóa bỏ `setInterval` và Hợp nhất Scheduler với `@nestjs/schedule`
- **Vấn đề:** Tú đang dùng `setInterval(..., 60000)` trong hook `OnApplicationBootstrap` của `AppointmentNoShowScheduler` và `AppointmentPaymentExpiryScheduler`. Điều này vi phạm kiến trúc NestJS, gây chạy lặp 2 tiến trình quét `NO_SHOW` song song và quét sai nghiệp vụ (chỉ quét ngày hôm trước `schedule.date < TODAY`).
- **Yêu cầu thực hiện:**
  1. Xóa bỏ hoàn toàn file `server/src/modules/appointment/appointment-no-show.scheduler.ts`.
  2. Bỏ `AppointmentNoShowScheduler` ra khỏi mảng `providers` trong `AppointmentModule`.
  3. Logic quét `NO_SHOW` đã được triển khai chuẩn tại `AppointmentCronService.handleAutoNoShowScan()` (thuộc `server/src/modules/notification/schedulers/appointment-cron.service.ts`). Nếu cần bổ sung gì, hãy trao đổi với Cường để tích hợp vào một nơi duy nhất.
  4. Đối với `AppointmentPaymentExpiryScheduler` (hủy giữ chỗ online quá 10 phút): Đổi từ `setInterval` sang dùng decorator chuẩn `@Cron('*/2 * * * *')` (quét định kỳ 2 phút/lần) của thư viện `@nestjs/schedule`.

---

### [ ] Mục 2: Khắc phục Xung đột Trùng Route Prefix `@Controller('appointments')`
- **Vấn đề:** Cả `BookingController` và `AppointmentController` đều dùng chung `@Controller('appointments')`, dẫn đến việc các API giữ chỗ, chốt lịch và quản lý lịch hẹn bị phân mảnh ở hai module khác nhau.
- **Yêu cầu thực hiện:**
  - **Phương án chọn:** Đổi tiền tố của `BookingController` (thuộc `server/src/modules/booking/booking.controller.ts`) thành:
    ```typescript
    @Controller('booking')
    ```
    Các API giữ chỗ sẽ có đường dẫn rõ ràng:
    - `POST /api/v1/booking/reserve-slot`
    - `POST /api/v1/booking/release-slot`
    - `POST /api/v1/booking/confirm-booking`
    - `GET /api/v1/booking/slot-lock/:doctorId/:slotId`
  - Giữ nguyên `AppointmentController` với `@Controller('appointments')` chuyên trách quản lý vòng đời lịch hẹn:
    - `GET /api/v1/appointments/me`
    - `POST /api/v1/appointments/:id/cancel`
    - `POST /api/v1/appointments/:id/cancel-by-clinic`
    - `PATCH /api/v1/appointments/:id/status`
    - `GET /api/v1/appointments/me/vouchers`
    - `GET /api/v1/appointments/vouchers/validate`

---

### [ ] Mục 3: Đấu nối Gửi Thông báo Hủy lịch vào BullMQ Queue
- **Vấn đề:** Hiện tại hàm `cancelByClinic()` chỉ lưu bản ghi `appointment_notifications` ở trạng thái `PENDING` vào CSDL mà không có worker nào xử lý gửi đi.
- **Yêu cầu thực hiện:**
  - Card 3.12 đã xây dựng sẵn module hàng đợi BullMQ với `NotificationProducerService` (`server/src/modules/notification/producers/notification-producer.service.ts`).
  - Tú hãy inject `NotificationProducerService` vào `AppointmentLifecycleService`. Khi phòng khám hủy lịch, bên cạnh việc lưu outbox audit, hãy gọi trực tiếp:
    - Gửi email thông báo hủy lịch kèm mã voucher:
      ```typescript
      // Sử dụng QueueName.EMAIL_QUEUE đã có sẵn
      await this.notificationProducer.sendBookingConfirmationEmail(...) // hoặc thêm job hủy lịch
      ```
    - Gửi tin nhắn SMS xin lỗi và thông báo hoàn tiền/voucher đến số điện thoại bệnh nhân.

---

### [ ] Mục 4: Tinh gọn và Sửa lỗi Migration TypeORM
- **Vấn đề:**
  - File `1789800600000-add-cancelled-by-patient-status.ts` chạy lặp lại câu lệnh gán constraint của `1789800000000`. Hàm `down()` của nó làm mất constraint `chk_appointments_status`.
  - Migration `1789707600000-enable-unaccent-doctor-search.ts` có trong thư mục nhưng chưa được khai báo vào `database-options.ts`.
- **Yêu cầu thực hiện:**
  1. Xóa bỏ migration thừa `1789800600000-add-cancelled-by-patient-status.ts` và gộp trọn vẹn vào `1789800000000-add-appointment-lifecycle-and-vouchers.ts`.
  2. Viết lại hàm `down()` của migration `1789800000000` đảm bảo khôi phục đầy đủ constraint ban đầu nếu cần rollback.
  3. Bổ sung `EnableUnaccentDoctorSearch1789707600000` vào mảng `migrations` trong `server/src/database/database-options.ts`.

---

### [ ] Mục 5: Viết Bộ Kiểm thử Đơn vị Toàn diện (Unit Tests Bắt buộc)
- **Vấn đề:** File test hiện tại `server/test/appointment-lifecycle.spec.ts` chỉ có 2 test case đơn giản cho hàm static.
- **Yêu cầu thực hiện:** Xây dựng file test hoàn chỉnh `server/test/appointment-lifecycle.spec.ts` kiểm thử tối thiểu **8 kịch bản nghiệp vụ sau**:
  1. `cancelByPatient`: Hủy trước ca khám $\ge 24h$ $\rightarrow$ Trạng thái `CANCELLED_BY_PATIENT`, `refundPercent: 100`, slot chuyển về `AVAILABLE`.
  2. `cancelByPatient`: Hủy trước ca khám từ 2h đến < 24h $\rightarrow$ `refundPercent: 70`.
  3. `cancelByPatient`: Hủy trước ca khám < 2h $\rightarrow$ `refundPercent: 0`, không hoàn tiền.
  4. `cancelByPatient`: Bệnh nhân A cố tình hủy lịch của Bệnh nhân B $\rightarrow$ Ném lỗi `403 Forbidden`.
  5. `cancelByPatient`: Cố tình hủy lịch đã khám xong (`COMPLETED`) hoặc lịch đã hủy $\rightarrow$ Ném lỗi `400 Bad Request`.
  6. `cancelByClinic`: Cơ sở y tế hủy lịch $\rightarrow$ Hoàn tiền 100%, tự động sinh bản ghi trong bảng `vouchers` với `discountPercent = 20` và hạn 6 tháng.
  7. `cancelByClinic`: Bác sĩ A cố tình hủy lịch của Bác sĩ B $\rightarrow$ Ném lỗi `403 Forbidden`.
  8. `validateVoucher`: Kiểm tra voucher hợp lệ, voucher đã dùng, voucher hết hạn và tính đúng số tiền được giảm trừ.

---

## 4. GIẢI ĐÁP CÁC CÂU HỎI MỞ CỦA TÚ

1. **Về API Refund VNPAY / MoMo thực tế:**
   - **Trả lời:** Hạng mục này thuộc phạm vi **Card 4.1** (Nguyễn Mạnh Thi phụ trách trong Sprint 4). Việc Tú lưu bản ghi `refund_requests` với trạng thái `PENDING` là hoàn toàn đúng thiết kế. Khi Thi hoàn thành SDK thanh toán ở Sprint 4, Thi sẽ cắm worker xử lý các bản ghi này.
2. **Về cấu hình Provider Email / SMS:**
   - **Trả lời:** Card 3.12 đã cấu hình sẵn Nodemailer SMTP (Email) và SMS Gateway qua BullMQ. Tú chỉ cần inject `NotificationProducerService` là hệ thống sẽ tự động gửi thông báo mà không cần cấu hình thêm provider riêng.
3. **Về mốc giờ cắt NO_SHOW:**
   - **Trả lời:** Theo đúng **SRS Section 5.2**: Tiêu chuẩn là tự động quét và đánh dấu `NO_SHOW` cho các lịch hẹn `CONFIRMED` **sau 30 phút tính từ thời điểm kết thúc ca khám (Slot End Time + 30 phút)** nếu bệnh nhân không có mặt check-in tại quầy, kết hợp một lượt quét chốt sổ vào lúc 23:59:00 hàng ngày theo giờ Việt Nam.

---

## 5. QUY TRÌNH NGHIỆM THU & TẠO LẠI PULL REQUEST

Sau khi Tú hoàn thành 5 mục trên, vui lòng thực hiện:
1. Chạy kiểm tra cú pháp và build:
   ```bash
   npm run lint
   npm run build
   ```
2. Chạy toàn bộ bộ test đảm bảo 100% test suites đều xanh:
   ```bash
   npm --prefix server test
   ```
3. Tạo Pull Request mới nhắm vào nhánh **`develop`**:
   - Tiêu đề: `feat(appointment): complete lifecycle state machine and cancellation workflow`
   - Gán Reviewers: `lecuong2512` (Lead) và `VanTugh` / `trantienvn`.
   - **Tuyệt đối không tự bấm Merge** cho đến khi có ít nhất 1 Approved Review từ Tech Lead.
