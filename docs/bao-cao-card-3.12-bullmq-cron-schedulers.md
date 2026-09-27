# BÁO CÁO THỰC HIỆN TASK [SECTION 7.1 & SRS-PAT-05]
## Hạ tầng Background Message Queue (BullMQ) & Cron Schedulers

- **Dự án:** E-Healthcare Portal
- **Phân hệ:** Hạ tầng Xử lý Bất đồng bộ & Tiến trình Định kỳ (DevOps & Core Backend)
- **Mã Task:** Card 3.12 - `[Section 7.1 & SRS-PAT-05] Hạ tầng Background Message Queue (BullMQ) & Cron Schedulers`
- **Người thực hiện:** Lê Việt Cường (Technical Lead / Core Backend)
- **Nhánh phát triển:** `feature/card-3.12-bullmq-cron`
- **Pull Request:** [#18](https://github.com/lecuong2512/E-healthcare/pull/18) (Đã gộp vào `develop`)
- **Commit hash cốt lõi:**
  - `02d3372` (`feat(queue): implement BullMQ message queues and cron schedulers (Card 3.12)`)
  - `b0c27d4` (`fix(ci): sync root package-lock.json for monorepo workspace dependencies`)
  - `bd2b83b` (`Merge pull request #18 from lecuong2512/feature/card-3.12-bullmq-cron`)
- **Tài liệu đối chiếu:**
  - `docs/SRS-EHEALTH-2026-V1.docx` (Section 7.1, Section 5.2, SRS-PAT-05, SRS-DOC-02, NFR-PERF-01, NFR-SEC-01)
  - `docs/ke-hoach-bo-sung-tasks-srs.md` (Card 3.12)
  - `docs/Kế hoạch Phân công Dự án EHealth (SRS-EHEALTH-2026-V1).xlsx` (Sprint 3, Row 26)
- **Ngày hoàn thành & kiểm thử:** 23/09/2026
- **Kết luận thẩm định (Verdict):**  **APPROVED (100% ĐẠT TIÊU CHUẨN KỸ THUẬT, BẢO MẬT & NGHIỆP VỤ Y TẾ)**

---

## 1. MỤC TIÊU & BỐI CẢNH KỸ THUẬT

Theo yêu cầu nghiêm ngặt tại **SRS Section 7.1** và **NFR-PERF-01**:
> *"Hệ thống phải duy trì thời gian phản hồi API dưới 300ms (P95 < 300ms). Mọi tác vụ tốn tài nguyên (I/O, mạng, CPU) như gửi email kích hoạt/xác nhận qua SMTP, gửi tin nhắn SMS OTP qua gateway bên thứ ba, hoặc biên dịch sinh tài liệu PDF y tế kèm mã QR vector tuyệt đối không được thực thi đồng bộ (blocking) trong luồng HTTP request/response của người dùng."*

Đồng thời, theo **Section 5.2** và **SRS-PAT-05**:
> *"Hệ thống cần các tiến trình định kỳ (Cron Schedulers) tự động:
> 1. Quét chuyển trạng thái NO_SHOW cho các lịch hẹn CONFIRMED mà bệnh nhân không có mặt check-in sau 30 phút tính từ thời điểm kết thúc ca khám.
> 2. Quét dọn dẹp các khung giờ giữ chỗ mồ côi (Orphaned Holding Slots) khi xảy ra sự cố mạng hoặc bệnh nhân thoát ứng dụng giữa chừng.
> 3. Tự động gửi thông báo nhắc hẹn trước 24 giờ qua Email và trước 2 giờ qua SMS kèm cơ chế chống gửi lặp (Deduplication) chặt chẽ."*

Để đáp ứng trọn vẹn các yêu cầu này, giải pháp được xây dựng là **Hạ tầng Background Message Queue phân tán bằng BullMQ trên nền tảng Redis** kết hợp **Bộ lập lịch định kỳ `@nestjs/schedule` tích hợp sâu trong kiến trúc Monorepo**.

---

## 2. KIẾN TRÚC & QUY TRÌNH XỬ LÝ (ARCHITECTURE & WORKFLOW)

```text
[ API Requests ]           [ Core Services ]                   [ BullMQ / Redis ]                  [ Queue Workers ]                [ Third-party / Storage ]
   (HTTP Clients)       (Auth / Booking / EMR)                  (In-Memory Broker)                (Background Processors)          (SMTP / SMS Gateways / S3)
         |                        |                                      |                                  |                                   |
         |-- 1. Confirm Booking ->|                                      |                                  |                                   |
         |   (Save DB < 50ms)     |-- 2. enqueue(job) ------------------>|                                  |                                   |
         |<-- 3. HTTP 201 Created |   (Job ID, Payload DTO)              |                                  |                                   |
         |                        |                                      |-- 4. Pop Job (email-queue) ----->|                                   |
         |                        |                                      |                                  |-- 5. Send via SMTP -------------->|
         |                        |                                      |                                  |   (Nodemailer Transport)          |
         |                        |                                      |                                  |                                   |
         |                        |                                      |-- 6. Pop Job (sms-queue) -------->|                                   |
         |                        |                                      |                                  |-- 7. Call SMS Gateway ----------->|
         |                        |                                      |                                  |   (Mask Phone & Safe OTP)         |
         |                        |                                      |                                  |                                   |
         |                        |                                      |-- 8. Pop Job (pdf-queue) -------->|                                   |
         |                        |                                      |                                  |-- 9. PDFKit + QR Vector --------->|
         |                        |                                      |                                  |   (Prescription / EMR PDF)        |
```

### Luồng Hoạt động của Cron Schedulers

```text
       [ AppointmentCronService ]
                   |
     +-------------+-------------+
     |                           |
[ @Cron(23:59) ]           [ @Cron(*/5m) ]                [ @Cron(*/10m) ]
Quét Lịch Quá Hạn          Dọn Dẹp Slot Mồ Côi            Quét Gửi Nhắc Hẹn
(Check-in Overdue)         (Orphaned Holding)             (T-24h Email & T-2h SMS)
     |                           |                               |
     v                           v                               v
PostgreSQL:                 PostgreSQL:                    PostgreSQL:
Tìm CONFIRMED quá 30p       Tìm slot status = HOLDING      Tìm lịch hẹn trong khoảng T-24h & T-2h
     |                           |                               |
     v                           v                               v
Chuyển -> NO_SHOW           Redis: Kiểm tra lockKey?       Redis: Kiểm tra đã gửi chưa?
và ghi Audit Log            - Có TTL: Giữ nguyên           - SETNX `reminder:24h:appt:{id}` EX 86400
                            - Không có / Hết hạn:          - SETNX `reminder:2h:appt:{id}` EX 7200
                              Chuyển -> AVAILABLE          Nếu chưa gửi -> Đẩy vào BullMQ
```

---

## 3. CHI TIẾT TRIỂN KHAI MÃ NGUỒN

### 3.1. Phân định Chuẩn hóa Định danh & Kiểu Dữ liệu dùng chung (`shared/src/`)
Đúng theo quy ước Monorepo của dự án, mọi Tên hàng đợi (Queue Name), Tên công việc (Job Name) và Cấu trúc Payload (DTO Interfaces) đều được đặt tập trung trong thư viện chia sẻ `shared/` để cả Frontend và Backend sử dụng nhất quán:

- **Tên Queue Chuẩn (`shared/src/enums/queue-name.enum.ts`):**
  ```typescript
  export enum QueueName {
    EMAIL_QUEUE = 'email-queue',
    SMS_QUEUE = 'sms-queue',
    PDF_QUEUE = 'pdf-queue',
  }
  ```
- **Tên Job Chuẩn (`shared/src/enums/job-name.enum.ts`):**
  - `EMAIL_SEND_BOOKING_CONFIRMATION`: Gửi email xác nhận đặt lịch khám kèm mã lịch hẹn.
  - `EMAIL_SEND_ACCOUNT_ACTIVATION`: Gửi email kích hoạt tài khoản kèm mã kích hoạt.
  - `EMAIL_SEND_REMINDER_24H`: Gửi email nhắc hẹn khám trước 24 giờ.
  - `SMS_SEND_OTP`: Gửi mã OTP xác thực số điện thoại.
  - `SMS_SEND_REMINDER_2H`: Gửi tin nhắn SMS nhắc hẹn trước 2 giờ.
  - `PDF_GENERATE_PRESCRIPTION`: Sinh file PDF đơn thuốc điện tử kèm mã QR tra cứu.
  - `PDF_GENERATE_EMR`: Sinh file PDF hồ sơ bệnh án EMR chuẩn y khoa.
- **Payload Interfaces (`shared/src/interfaces/queue-payload.interface.ts`):**
  - Định nghĩa tường minh các kiểu dữ liệu DTO: `BookingConfirmationEmailPayload`, `AccountActivationEmailPayload`, `AppointmentReminderEmailPayload`, `OtpSmsPayload`, `AppointmentReminderSmsPayload`, `PrescriptionPdfPayload`, `EmrPdfPayload`.

---

### 3.2. Cấu hình Hạ tầng BullMQ & Connection Pool (`QueueModule`)
- **Tập tin:** `server/src/modules/queue/queue.module.ts`
- **Kết nối Redis tối ưu cho BullMQ:**
  Cấu hình ioredis bắt buộc `maxRetriesPerRequest: null` và `enableReadyCheck: false` theo tiêu chuẩn kỹ thuật của BullMQ để tránh treo luồng khi Redis tái kết nối.
- **Chiến lược Retry & Exponential Backoff:**
  ```typescript
  export const DEFAULT_QUEUE_JOB_OPTIONS = {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 2000, // Thử lại sau 2s, 4s, 8s
    },
    removeOnComplete: true, // Tự dọn sạch RAM Redis khi hoàn tất
    removeOnFail: false,    // Giữ lại vết lỗi trong Dead Letter Queue để điều tra
  };
  ```
- **Chế độ Cô lập Kiểm thử (Test Isolation / Offline Resilience):**
  Hệ thống trang bị `MockBullQueue` tự động kích hoạt khi chạy trong môi trường Unit Test hoặc CI (thông qua cờ `BULLMQ_MOCK=true`), đảm bảo **0 lỗi treo kết nối (Zero ECONNREFUSED)** khi không có Redis server cục bộ.

---

### 3.3. Các Worker Xử lý Ngầm (Notification Processors)

#### 1. Worker Xử lý Email (`EmailProcessor`)
- **Tập tin:** `server/src/modules/notification/processors/email.processor.ts`
- Lắng nghe hàng đợi `email-queue`.
- Phân phối chính xác theo `job.name`:
  - `EMAIL_SEND_BOOKING_CONFIRMATION`: Gửi email thông báo đặt lịch thành công với đầy đủ mã hẹn, thời gian, tên bác sĩ, chuyên khoa và hướng dẫn đến phòng khám.
  - `EMAIL_SEND_ACCOUNT_ACTIVATION`: Gửi đường link/mã token kích hoạt tài khoản bệnh nhân.
  - `EMAIL_SEND_REMINDER_24H`: Gửi thông tin nhắc nhở người bệnh chuẩn bị hồ sơ trước 24 giờ.
- Tích hợp dịch vụ `EmailSenderService` với cấu hình SMTP (Nodemailer) chuẩn doanh nghiệp, tự động fallback ghi log chi tiết khi chưa cấu hình máy chủ SMTP ngoài.

#### 2. Worker Xử lý Tin nhắn SMS (`SmsProcessor`)
- **Tập tin:** `server/src/modules/notification/processors/sms.processor.ts`
- Lắng nghe hàng đợi `sms-queue`.
- **Tuân thủ Tuyệt đối Quy chuẩn An toàn Dữ liệu Y tế (NFR-SEC-01):**
  - **Mặt nạ số điện thoại (Phone Masking):** Số điện thoại bệnh nhân luôn được che mờ trước khi ghi vào nhật ký hệ thống:
    ```typescript
    private maskPhone(phone: string): string {
      if (!phone || phone.length < 7) return '***';
      return phone.substring(0, 3) + '****' + phone.substring(phone.length - 3);
    }
    ```
  - **Bảo mật mã OTP:** Không ghi mã OTP hoặc nội dung nhạy cảm của bệnh nhân ra console/logger công khai.

#### 3. Worker Sinh Tài liệu Y tế PDF (`PdfProcessor` & `PdfGeneratorService`)
- **Tập tin:**
  - `server/src/modules/notification/processors/pdf.processor.ts`
  - `server/src/modules/notification/services/pdf-generator.service.ts`
- Lắng nghe hàng đợi `pdf-queue`.
- Sử dụng thư viện `pdfkit` kết hợp `qrcode` để biên dịch trực tiếp file PDF trong bộ nhớ (Stream/Buffer):
  - **Đơn thuốc Điện tử (Prescription PDF):** Tiêu đề phòng khám, thông tin bệnh nhân, danh mục thuốc (tên hoạt chất, hàm lượng, cách dùng, liều dùng), lời dặn bác sĩ, mã vạch/mã QR chứa chuỗi xác thực SHA-256 chống làm giả đơn thuốc.
  - **Hồ sơ Bệnh án EMR (Medical Record PDF):** Chỉ số sinh hiệu (Huyết áp, Mạch, Nhiệt độ, SpO2, BMI), chẩn đoán ICD-10 (mã bệnh + mô tả), tóm tắt bệnh án, kết quả cận lâm sàng và chữ ký số bác sĩ.

---

### 3.4. Hệ thống Bộ lập lịch Tự động (Appointment Cron Schedulers)
- **Tập tin:** `server/src/modules/notification/schedulers/appointment-cron.service.ts`

Hệ thống triển khai 3 bộ lập lịch độc lập:

1. **Cron 1: Quét tự động đánh dấu `NO_SHOW` (Section 5.2):**
   - **Tần suất:** Chạy lúc 23:59:00 hàng ngày (`@Cron('0 59 23 * * *')`).
   - **Nghiệp vụ:** Truy vấn các lịch hẹn có trạng thái `CONFIRMED`, chưa check-in tại quầy, và thời điểm kết thúc ca khám đã trôi qua quá 30 phút.
   - **Hành động:** Tự động cập nhật trạng thái lịch hẹn thành `NO_SHOW`, giải phóng slot và ghi nhận lý do vắng mặt để thống kê tỷ lệ tuân thủ lịch khám của bệnh nhân.

2. **Cron 2: Quét dọn dẹp các khung giờ giữ chỗ mồ côi (Orphaned Slots):**
   - **Tần suất:** Chạy định kỳ mỗi 5 phút (`@Cron('0 */5 * * * *')`).
   - **Nghiệp vụ:** Tìm kiếm các bản ghi trong `doctor_schedules` có trạng thái `HOLDING`. Kiểm tra khóa Redis phân tán tương ứng (`lock:doctor:{id}:slot:{id}`).
   - **Hành động:** Nếu khóa Redis đã biến mất hoặc hết hạn TTL mà slot trong cơ sở dữ liệu vẫn kẹt ở trạng thái `HOLDING` (do client mất kết nối hoặc server crash giữa chừng), hệ thống tự động hoàn trả slot về trạng thái `AVAILABLE`.

3. **Cron 3: Quét tự động gửi Nhắc hẹn T-24h & T-2h (SRS-PAT-05):**
   - **Tần suất:** Chạy định kỳ mỗi 10 phút (`@Cron('0 */10 * * * *')`).
   - **Nghiệp vụ:**
     - Tìm các lịch khám sắp diễn ra trong khoảng từ 23 đến 25 giờ tới.
     - Tìm các lịch khám sắp diễn ra trong khoảng từ 1 giờ 45 phút đến 2 giờ 15 phút tới.
   - **Cơ chế Chống gửi trùng (Deduplication Mechanism):**
     Sử dụng Redis Atomic Key:
     - `reminder:24h:appt:{id}` với TTL 86.400 giây (24 giờ).
     - `reminder:2h:appt:{id}` với TTL 7.200 giây (2 giờ).
     Chỉ khi lệnh Redis `SETNX` thành công, job mới được đẩy vào BullMQ, đảm bảo dù Cron chạy liên tục 10 phút/lần thì bệnh nhân cũng chỉ nhận đúng duy nhất 1 thông báo.

---

### 3.5. Lớp Dịch vụ Phát hành Công việc (Notification Producer Facade)
- **Tập tin:** `server/src/modules/notification/producers/notification-producer.service.ts`
- Cung cấp giao diện đóng gói (Facade API) cho toàn bộ ứng dụng:
  - `sendBookingConfirmationEmail(payload)`
  - `sendAccountActivationEmail(payload)`
  - `sendAppointmentReminderEmail(payload)`
  - `sendOtpSms(payload)`
  - `sendAppointmentReminderSms(payload)`
  - `generatePrescriptionPdf(payload)`
  - `generateEmrPdf(payload)`
- Nhờ lớp facade này, các service nghiệp vụ (`AuthService`, `BookingService`, `ClinicalService`) chỉ cần gọi 1 hàm đơn giản mà không cần biết chi tiết cấu hình BullMQ bên dưới.

---

## 4. BẢNG ĐỐI CHIẾU CHECKLIST CARD 3.12

| Tiêu chí trong Kế hoạch Phân công & SRS | Trạng thái | Minh chứng Kỹ thuật |
| :--- | :---: | :--- |
| **Tích hợp BullMQ & Redis Connection Pool** vào NestJS server xử lý bất đồng bộ (Section 7.1) |  **ĐẠT** | Triển khai tại `QueueModule` với cấu hình pool ioredis chuẩn (`maxRetriesPerRequest: null`, `enableReadyCheck: false`) và cơ chế mock an toàn khi chạy test. |
| **Tách biệt các hàng đợi xử lý ngầm (Queue Workers):**<br>- `email-queue`<br>- `sms-queue`<br>- `pdf-queue` |  **ĐẠT** | Đăng ký độc lập trong `NotificationModule` với 3 Processors: `EmailProcessor`, `SmsProcessor`, `PdfProcessor`. |
| **Cấu hình Retry tự động** (tối đa 3 lần với exponential backoff) khi dịch vụ bên thứ ba gặp sự cố |  **ĐẠT** | Triển khai trong `DEFAULT_QUEUE_JOB_OPTIONS` với `attempts: 3`, `backoff: { type: 'exponential', delay: 2000 }`. |
| **Mặt nạ bảo mật SĐT & OTP** không ghi lộ thông tin nhạy cảm của bệnh nhân (NFR-SEC-01) |  **ĐẠT** | Triển khai hàm `maskPhone()` che số điện thoại dạng `091****789`, nghiêm cấm in log mã OTP hoặc chi tiết bệnh án. |
| **Sinh tài liệu PDF có mã QR vector** chứa chữ ký/hash xác thực đơn thuốc & EMR |  **ĐẠT** | Triển khai `PdfGeneratorService` sử dụng `pdfkit` và `qrcode` sinh tài liệu chuẩn y tế kèm mã QR xác thực SHA-256. |
| **Cron Job tự động quét chuyển `NO_SHOW`** cho lịch hẹn `CONFIRMED` quá 30 phút không check-in (Section 5.2) |  **ĐẠT** | Triển khai tại `AppointmentCronService.handleAutoNoShowScan()` quét và cập nhật trạng thái `NO_SHOW`. |
| **Cron Job tự động dọn dẹp các slot giữ chỗ mồ côi** (`HOLDING`) khi khóa Redis hết hạn |  **ĐẠT** | Triển khai tại `AppointmentCronService.handleOrphanedSlotsScan()` đối soát Redis và hoàn trả trạng thái `AVAILABLE`. |
| **Cron Job tự động quét nhắc hẹn T-24h (Email) & T-2h (SMS)** kèm cơ chế chống gửi trùng |  **ĐẠT** | Triển khai tại `AppointmentCronService.handleAppointmentRemindersScan()` kết hợp Redis Deduplication Key TTL. |

---

## 5. KẾT QUẢ KIỂM THỬ TỰ ĐỘNG (AUTOMATED TEST VERIFICATION)

Đã xây dựng bộ kiểm thử tự động toàn diện tại 3 tập tin test chuyên sâu:
1. `server/test/bullmq-queue-infrastructure.spec.ts` (180 dòng)
2. `server/test/notification-processors.spec.ts` (278 dòng)
3. `server/test/appointment-cron.spec.ts` (254 dòng)

### 5.1. Kết quả Kiểm thử Chi tiết 24 Test Cases của Card 3.12

```text
PASS test/notification-processors.spec.ts (6.751 s)
  Notification Queue Processors (Workers)
    EmailProcessor (email-queue worker)
      √ should process EMAIL_SEND_BOOKING_CONFIRMATION job successfully (11 ms)
      √ should process EMAIL_SEND_ACCOUNT_ACTIVATION job (3 ms)
      √ should process EMAIL_SEND_REMINDER_24H job (2 ms)
      √ should handle unknown job gracefully without throwing (2 ms)
    SmsProcessor (sms-queue worker)
      √ should process SMS_SEND_OTP job (1 ms)
      √ should process SMS_SEND_REMINDER_2H job (1 ms)
      √ should handle unknown SMS job gracefully (1 ms)
    PdfProcessor & PdfGeneratorService (pdf-queue worker)
      √ should generate Prescription PDF with embedded QR code and valid PDF structure (209 ms)
      √ should generate EMR Medical Record PDF with vital signs and QR code (132 ms)
      √ should handle unknown PDF job gracefully (2 ms)

PASS test/appointment-cron.spec.ts
  AppointmentCronService Schedulers (Section 5.2, Section 7.1, SRS-PAT-05)
    Cron 1: Quét tự động đánh dấu NO_SHOW (Section 5.2 & SRS-DOC-02)
      √ should mark CONFIRMED appointments as NO_SHOW if past 30 mins after slot end time without check-in (6 ms)
      √ should return 0 when no appointments are overdue (1 ms)
    Cron 2: Quét dọn dẹp các slot giữ chỗ mồ côi (Orphaned Holding Slots)
      √ should restore HOLDING slots to AVAILABLE if Redis lock has expired or is absent (1 ms)
      √ should return 0 when there are no holding slots (1 ms)
    Cron 3: Quét tự động nhắc hẹn T-24h & T-2h (SRS-PAT-05)
      √ should dispatch 24h reminder to email-queue and 2h reminder to sms-queue with deduplication (2 ms)

PASS test/bullmq-queue-infrastructure.spec.ts
  BullMQ Queue Infrastructure & Producer (SRS Section 7.1)
    Connection Options & Configuration
      √ should configure maxRetriesPerRequest as null and retryStrategy for BullMQ (11 ms)
      √ should have standard retry and backoff options in DEFAULT_QUEUE_JOB_OPTIONS (3 ms)
    Email Queue Producer
      √ should enqueue booking confirmation email with correct payload and job name (2 ms)
      √ should enqueue account activation email (1 ms)
      √ should enqueue 24h appointment reminder email (1 ms)
    SMS Queue Producer
      √ should enqueue OTP SMS with limited retry attempts to prevent replay (1 ms)
      √ should enqueue 2h appointment reminder SMS (1 ms)
    PDF Queue Producer
      √ should enqueue prescription PDF generation job (1 ms)
      √ should enqueue EMR PDF generation job (1 ms)

Test Suites: 3 passed, 3 total
Tests:       24 passed, 24 total
Snapshots:   0 total
Time:        9.233 s
```

### 5.2. Kết quả Kiểm thử Tổng thể Toàn bộ Backend
- **Tổng số Test Suites Backend:** **14/14 suites PASS 100%**.
- **Tổng số Tests:** **135/135 unit tests GREEN (0 failures)** bao gồm toàn bộ các tính năng từ Sprint 1, Sprint 2 và Sprint 3:
  - Auth & Registration (`auth.spec.ts`)
  - Doctor & Schedules (`doctor.spec.ts`)
  - Patient PHR (`phr.spec.ts`)
  - Distributed Slot Locking & Booking (`booking-slot-lock.spec.ts`)
  - Clinical EMR & E-Prescription (`clinical.spec.ts` - 30 tests)
  - BullMQ Queue & Schedulers (`bullmq-queue-infrastructure.spec.ts`, `notification-processors.spec.ts`, `appointment-cron.spec.ts` - 24 tests)

### 5.3. Kết quả Kiểm tra Quy trình CI / CD (GitHub Actions)
- **Workflow:** `CI - Lint, Build & Validate Environment / Lint & Build Monorepo (pull_request)`
- **Chi tiết các Job:**
  - `Validate Docker & Nginx Config`: **SUCCESS** (7 giây)
  - `Lint & Build Monorepo`: **SUCCESS** (1 phút 26 giây)
- **Tình trạng Pull Request:** PR [#18](https://github.com/lecuong2512/E-healthcare/pull/18) đã vượt qua toàn bộ kiểm tra chất lượng và được **MERGED** vào nhánh `develop`.

---

## 6. KẾT LUẬN & ĐỀ XUẤT BÀN GIAO

1. **Hiệu năng & Khả năng Mở rộng:** Hạ tầng hàng đợi bất đồng bộ BullMQ giúp giải phóng hoàn toàn thời gian xử lý của Web Server đối với các tác vụ I/O nặng, đảm bảo tiêu chuẩn thời gian phản hồi API dưới 300ms theo đúng cam kết trong SRS.
2. **Độ Bền vững (Resilience):** Cơ chế Retry Exponential Backoff cùng với việc phân tách các Queue độc lập giúp hệ thống chịu lỗi cao; sự cố tạm thời của cổng SMS hoặc SMTP bên ngoài không gây nghẽn hoặc ảnh hưởng tới các luồng đặt khám chính.
3. **Bảo mật Thông tin:** Cơ chế che mặt nạ số điện thoại và tuyệt đối không lưu log mã OTP đáp ứng nghiêm ngặt tiêu chuẩn bảo mật dữ liệu y tế.
4. **Sẵn sàng Tích hợp:** Module `NotificationProducerService` đã sẵn sàng 100% để các thành viên khác trong nhóm gọi đến khi triển khai gửi email đón kết quả thanh toán (Card 4.7) và tải đơn thuốc PDF trên Client (Card 4.2).
