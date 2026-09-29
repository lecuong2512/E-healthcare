# Báo cáo triển khai SRS-PAT-04 / SRS-PAT-05

## Phạm vi

Chỉ thay đổi backend cho export/verification đơn thuốc PAT-04 và reminder nền PAT-05. Không thay đổi UI, không thêm digital signature giả và không thêm clinic seal vì repository hiện chưa có provider/chứng thư hoặc asset seal.

## PAT-04: Prescription PDF

API:

- `GET /api/v1/clinical/appointments/:appointmentId/prescription.pdf` yêu cầu JWT và role `PATIENT`. Backend lấy patient ID từ session/JWT, truy vấn medical record theo đồng thời appointment ID và patient ID, rồi kiểm tra liên kết doctor/appointment trước khi tạo PDF. Lịch/đơn không thuộc bệnh nhân trả 404.
- `GET /api/v1/clinical/prescriptions/:prescriptionCode/verify?hash=...` là public để QR tra cứu; response chỉ gồm `{ "valid": boolean }`, không trả dữ liệu bệnh án.

Hash canonical được tạo từ `prescriptionCode|doctorId|createdAt.toISOString()` rồi SHA-256. Cùng payload được dùng để render hash cuối PDF và verify. QR mã hóa URL verification đã cấu hình, không chứa bệnh án. PDF có mã lịch/đơn, bệnh nhân, bác sĩ, chẩn đoán, ICD-10, thuốc/liều/cách dùng, lời dặn và ngày tái khám; footer kiểm thử đúng nguyên văn SRS.

Cấu hình cần triển khai:

- `PRESCRIPTION_VERIFICATION_BASE_URL`: origin public dùng HTTPS, không hard-code domain.
- `PDF_FONT_PATH`: đường dẫn tới TTF hỗ trợ tiếng Việt để nhúng vào PDF.

Không tìm thấy digital-signature provider/certificate hoặc clinic electronic seal trong repo; PDF không tuyên bố có chữ ký số/seal. Cần tích hợp chứng thư/provider và asset seal thật nếu yêu cầu pháp lý đòi hỏi.

## PAT-05: Appointment Reminder

Tái sử dụng `@nestjs/schedule`, `AppointmentCronService`, BullMQ email/SMS queues, processors và provider sender hiện có. Cron chạy mỗi 15 phút theo `APPOINTMENT_REMINDER_TIMEZONE` (mặc định business timezone `Asia/Ho_Chi_Minh`) và có thể tắt bằng `APPOINTMENT_REMINDERS_ENABLED=false`.

- T-24h: Email preparation reminder, trong cửa sổ ±60 phút.
- T-2h: SMS reminder di chuyển/CCCD/QR, trong cửa sổ ±15 phút.
- Chỉ lịch `CONFIRMED` được chọn; worker kiểm tra lại trạng thái ngay trước khi gửi.
- Mở rộng `appointment_notifications` với `notification_type`, `scheduled_at`, `provider`; unique partial index theo appointment/reminder type ngăn scheduler đa instance tạo duplicate. BullMQ job ID gắn với notification row. Worker lưu `SCHEDULED`, `PROCESSING`, `SENT` hoặc `FAILED` và số lần thử.
- Queue submission/provider failure lưu `FAILED`; BullMQ dùng retry/backoff hiện có. SMS webhook nhận `brandName` và `idempotencyKey`; SMTP Message-ID được tạo từ notification row.

Cấu hình provider:

- T-24h cần SMTP (`SMTP_HOST`, `SMTP_FROM`, thông tin auth nếu bắt buộc). Web Push provider chưa tồn tại nên không giả lập.
- T-2h cần `SMS_WEBHOOK_URL`, `SMS_WEBHOOK_TOKEN`, `SMS_BRAND_NAME`; webhook phải chuyển tiếp đến SMS Brandname được nhà cung cấp phê duyệt.
- Reminder senders fail closed khi thiếu cấu hình, không ghi nhận mock delivery thành công.

Giao nhận qua mạng không thể bảo đảm exactly-once nếu provider không hỗ trợ idempotency. SMS webhook được gửi idempotency key; SMTP nhận stable Message-ID nhưng provider cần hỗ trợ dedupe để loại bỏ hoàn toàn trường hợp provider đã nhận thư nhưng kết nối trả lỗi.

## Database

Migration `1790152800000-add-appointment-reminder-lifecycle.ts` mở rộng outbox hiện có; không thêm bảng hoặc sửa dữ liệu hiện hữu khi chạy `up`. Migration được đăng ký trong `database-options.ts`; `synchronize` vẫn tắt. Không cần migration cho prescription hash vì hash được tính xác định từ các cột hiện hữu.

## Files chính

- `server/src/modules/clinical/prescription-pdf.service.ts`
- `server/src/modules/clinical/clinical.controller.ts`
- `server/src/modules/clinical/clinical.module.ts`
- `server/src/modules/notification/services/pdf-generator.service.ts`
- `server/src/modules/notification/schedulers/appointment-cron.service.ts`
- `server/src/modules/notification/services/appointment-reminder-delivery.service.ts`
- `server/src/modules/notification/processors/email.processor.ts`
- `server/src/modules/notification/processors/sms.processor.ts`
- `server/src/database/entities/appointment-notification.entity.ts`
- `server/src/database/migrations/1790152800000-add-appointment-reminder-lifecycle.ts`
- `server/src/database/database-options.ts`
- Shared queue payload interfaces, provider configuration template, and focused backend tests.

## Kiểm thử và xác minh

- `npm test --prefix server`: 34 suites, 297 tests passed.
- Focused PAT-04 PDF/hash/authorization/verification tests: passed.
- Focused PAT-05 scheduler/provider/processor tests: passed.
- `npm run build --prefix server`: passed.
- `git diff --check`: passed.
- Migration SQL and DataSource registration unit checks: passed. Live `migration:show` could not connect because PostgreSQL is not listening on `localhost:5432`; no migration was applied to a database.
