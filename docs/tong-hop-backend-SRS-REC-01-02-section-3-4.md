# Tổng hợp backend phân hệ Lễ tân — SRS-REC-01..02 & Section 3.4

**Phạm vi:** Quét QR và check-in lịch hẹn, tiếp đón walk-in và thu tiền mặt tại quầy, đồng bộ hàng đợi qua Socket.IO.  
**Trạng thái:** Tổng hợp mã backend hiện tại trên nhánh `feature/SRS-REC-01-02-reception-qr-checkin-realtime`, ngày 22/09/2026.  
**Đối tượng đọc:** Backend, frontend lễ tân/bác sĩ, QA và vận hành.

Tài liệu này mô tả **hành vi đã triển khai**. Đặc tả thiết kế ban đầu nằm ở `server/reception_backend_implementation.md`; cấu hình vận hành chi tiết nằm ở [reception-backend-operations.md](reception-backend-operations.md).

## 1. Phạm vi theo yêu cầu

| Yêu cầu | Backend hiện có |
| --- | --- |
| SRS-REC-01: Tiếp đón lịch đã đặt | Tra cứu lịch trong ngày bằng mã lịch hoặc số điện thoại; cấp và xác minh QR có chữ ký; thu tiền tại quầy; check-in và cấp số thứ tự. |
| SRS-REC-02: Khách walk-in | Tìm slot còn trống trong ngày; định danh bệnh nhân bằng CCCD/CMND hoặc chọn hồ sơ phù hợp; tạo lịch, thu tiền mặt, check-in và cấp số trong một giao dịch. |
| Section 3.4: Hàng đợi realtime | REST snapshot cho lễ tân/bác sĩ; Socket.IO theo room, phát sự kiện sau commit, snapshot định kỳ; TV công cộng dùng token riêng và payload đã ẩn thông tin. |

Frontend quầy tiếp đón và đặt walk-in hiện còn màn hình placeholder trong `client/src/app/features/receptionist/`; tài liệu này chỉ xác nhận phần backend và hợp đồng để frontend tích hợp.

## 2. API và quyền truy cập

REST dùng tiền tố `/api/v1`. Các API `reception/*` yêu cầu access token của vai trò `RECEPTIONIST`; API cấp QR yêu cầu `PATIENT`; API `doctor/queue` yêu cầu `DOCTOR`. Token bảng công cộng chỉ dùng cho Socket.IO, không dùng được với REST nội bộ.

| Method | Đường dẫn | Mục đích / dữ liệu chính |
| --- | --- | --- |
| GET | `/appointments/:appointmentId/check-in-qr` | Bệnh nhân sở hữu lịch `CONFIRMED` lấy `{ qrToken, expiresAt }`; `Cache-Control: no-store`. |
| GET | `/reception/appointments/lookup?code=...` **hoặc** `?phone=...` | Tra lịch **hôm nay**; phải truyền đúng một tiêu chí. Trả danh sách với `requiresPayment`, `canCheckIn`, `blockedReason`. |
| POST | `/reception/qr/lookup` | Body `{ "qrToken": "..." }`; xác minh QR rồi tra lịch hôm nay. |
| POST | `/reception/qr/check-in` | Body `{ "qrToken": "..." }`; xác minh QR rồi thực hiện cùng luồng check-in như API thủ công. |
| POST | `/reception/appointments/:appointmentId/collect-payment` | Body `{ "method": "CASH", "amountTendered": 500000 }`; thu tiền cho lịch trả tại quầy. |
| GET | `/reception/appointments/:appointmentId/receipt` | Đọc lại biên lai từ giao dịch thu tiền `SUCCESS` đã lưu. |
| POST | `/reception/appointments/:appointmentId/check-in` | Check-in thủ công khi đã xác minh lịch; trả số thứ tự và thông tin bác sĩ/phòng. |
| GET | `/reception/walk-in/doctors` | Lọc tùy chọn `specialtyId`, `doctorName`; trả bác sĩ và các slot khả dụng còn lại trong ngày. |
| POST | `/reception/walk-in` | Tạo walk-in; yêu cầu header `Idempotency-Key` là UUID v4. |
| GET | `/reception/queue` | Snapshot hàng đợi trong ngày cho lễ tân. |
| GET | `/doctor/queue` | Snapshot hàng đợi trong ngày của bác sĩ đăng nhập. |
| POST | `/reception/queue/board-token` | Cấp `{ token, expiresAt }` cho TV; `Cache-Control: no-store`. |

Các kiểu request/response dùng chung nằm ở `shared/src/interfaces/reception.interface.ts` và `shared/src/interfaces/queue.interface.ts`. REST trả mã lỗi HTTP thông thường: 400 với dữ liệu sai, 401/403 với xác thực/quyền, 404 khi thiếu bản ghi, 409 khi trạng thái hoặc tài nguyên xung đột. QR hết hạn trả 410; Redis không kiểm tra/khóa được slot trả 503.

## 3. SRS-REC-01 — lịch đã đặt, QR, thanh toán, check-in

1. Bệnh nhân đăng nhập lấy `qrToken` cho lịch của chính mình. QR là JWT HS256 có `appointmentId`, `appointmentCode`, `jti`, thời điểm phát hành và hạn dùng **15 phút**; ký bằng `QR_CHECKIN_SECRET` riêng với JWT đăng nhập. Lễ tân gửi nguyên token cho API QR. Mã lịch thuần vẫn dùng cho tra cứu thủ công, không phải QR có chữ ký.
2. Lễ tân tra cứu bằng QR, mã lịch hoặc số điện thoại. Tra cứu theo số chuẩn hóa số Việt Nam và có thể trả **nhiều lịch/hồ sơ**; giao diện phải cho chọn đúng lịch. Kết quả chỉ gồm lịch có `schedule.date` bằng ngày hiện tại theo `Asia/Ho_Chi_Minh`.
3. Nếu lịch `PAY_AT_CLINIC` còn `UNPAID`, quầy thu **tiền mặt** đủ phí trước khi check-in. Backend khóa dòng appointment, tạo `counter_payment_transactions` trạng thái `SUCCESS`, cập nhật `paymentStatus=PAID`, lưu thời điểm/người thu và audit trong transaction. Biên lai đọc lại từ transaction, gồm số tiền nhận và tiền thối; không tính lại từ lịch hiện thời.
4. Check-in chỉ nhận lịch `CONFIRMED`, đã `PAID`, có slot `BOOKED` của đúng bác sĩ, trong đúng ngày và trong cửa sổ từ **60 phút trước giờ bắt đầu** đến **15 phút sau giờ kết thúc** slot. Quy tắc này được dùng cả lúc tính `canCheckIn` và lúc ghi DB; QR không vượt qua được điều kiện thanh toán hoặc thời gian.
5. Transaction khóa appointment, cấp số thứ tự theo bác sĩ/ngày, ghi `CHECKED_IN`, `queueNumber`, `queueDate`, `queueSource=APPOINTMENT`, `checkedInAt` và audit. Cùng lịch không thể được check-in/cấp số lần hai. Sau commit mới phát sự kiện hàng đợi.

QR đã dùng để check-in không tạo thêm lượt khám vì lịch không còn `CONFIRMED`. QR hết hạn hoặc bị sửa bị từ chối; QR mới chỉ được cấp cho lịch còn `CONFIRMED`.

## 4. SRS-REC-02 — tiếp đón walk-in

`GET /reception/walk-in/doctors` chỉ liệt kê slot `AVAILABLE` của **hôm nay**, có giờ bắt đầu lớn hơn giờ hiện tại và không đang bị Redis hold. Đây là ảnh chụp tại thời điểm đọc; `POST /reception/walk-in` luôn kiểm tra lại trong transaction. Số slot do lịch trực bác sĩ tạo ra là giới hạn khả dụng hiện tại; service walk-in chưa có bộ đếm quota riêng theo ca.

Body tạo walk-in gồm `scheduleId`, `fullName`, `phone`, `birthYear`, `gender`, `reasonForVisit`, `paymentMethod: "CASH"`, `amountTendered`; có thể thêm `citizenId` và `patientId`. `citizenId` chấp nhận 9 hoặc 12 chữ số. Bệnh nhân walk-in mới được tạo tài khoản chưa xác minh (`PENDING_VERIFY`) và PHR; năm sinh được lưu với `dateOfBirthPrecision=YEAR` để không hiểu ngày `01-01` là ngày sinh đã xác thực.

### Định danh bệnh nhân

- Khi có `citizenId`, backend tìm PHR theo CCCD/CMND trước. Nếu tìm thấy, tên, giới tính, năm sinh và `patientId` được chọn (nếu có) phải khớp. CCCD/CMND đã tồn tại với thông tin khác trả 409 để lễ tân xác minh.
- Khi không tìm thấy CCCD/CMND, `patientId` được lễ tân chọn sẽ được kiểm tra danh tính và vai trò bệnh nhân; có thể gắn CCCD/CMND vào PHR chưa có mã.
- Nếu chưa chọn `patientId`, backend tìm hồ sơ ứng viên theo số điện thoại **và** tên, giới tính, năm sinh. Khi có ứng viên, API trả 409 với `code: "PATIENT_SELECTION_REQUIRED"` và danh sách `candidates`; lễ tân xác nhận một hồ sơ rồi gửi lại **cùng `Idempotency-Key`** cùng dữ liệu đã bổ sung `patientId` theo thiết kế phía client cần kiểm tra lưu ý bên dưới. Nếu không có ứng viên, backend tạo hồ sơ mới.
- Số điện thoại là dữ liệu liên hệ, có thể dùng chung giữa nhiều hồ sơ. `personal_health_profiles.citizen_id` có unique index khi khác `NULL`; không dùng số điện thoại làm định danh duy nhất cho walk-in.

**Lưu ý tích hợp idempotency:** Hash yêu cầu có cả `patientId`. Sau phản hồi `PATIENT_SELECTION_REQUIRED`, chưa có lịch được commit nên client có thể gửi lại với `patientId`; nếu lịch đã commit và client retry do timeout, phải gửi **chính xác body cũ và cùng key**. Cùng key đã commit nhưng body khác trả 409.

### Giao dịch và chống tranh chấp

Backend giữ Redis lock của slot tối đa 15 giây, sau đó khóa dòng `doctor_schedules` trong PostgreSQL và kiểm tra lại ngày, giờ, trạng thái. Trong cùng DB transaction: xác định/tạo bệnh nhân, chặn lịch hoạt động trùng thời gian của bệnh nhân, chuyển slot sang `BOOKED`, cấp số thứ tự, tạo appointment `CHECKED_IN`, thu tiền mặt, lưu biên lai và audit. Redis lock được giải phóng theo token chủ sở hữu trong `finally`; DB row lock và unique index slot vẫn bảo vệ khi Redis lock hết hạn. Event realtime chỉ phát sau commit.

`Idempotency-Key` được lưu cùng mã băm request trên appointment, phân biệt theo lễ tân. Retry cùng key/body sau khi đã commit trả lại lịch và biên lai cũ; dùng key với body khác trả 409. Mã lịch ngẫu nhiên `APT-YYMMDD-XXXX` được thử lại khi đụng unique index. Cấp số thứ tự dùng UPSERT nguyên tử theo `(doctor_id, queue_date)` ngay trong transaction.

## 5. Section 3.4 — hàng đợi realtime

Namespace Socket.IO là `/queue`. Client nội bộ gửi `auth: { token: accessToken }`; gateway xác thực bằng `SessionService` như REST. Lễ tân vào room `reception`; bác sĩ vào room `doctor:<doctorId>` gắn với tài khoản. Client TV gửi `auth: { boardToken }`, vào room `queue:public`, chỉ đọc. Hai kiểu token không được gửi cùng lúc. Mỗi token hết hạn sẽ ngắt socket; mỗi tài khoản/token TV bị giới hạn **5 socket trên mỗi backend instance**.

| Sự kiện | Hướng | Người nhận | Nội dung |
| --- | --- | --- | --- |
| `queue.snapshot` | Server → client | Tất cả room | Hàng đợi hiện tại. Scope `RECEPTION`/`DOCTOR` có `QueueTicket`; scope `PUBLIC` có `PublicQueueTicket`. |
| `appointment.status_changed` | Server → client | Lễ tân và bác sĩ tương ứng | Trạng thái mới, số thứ tự, mã lịch và ticket nội bộ. |
| `queue.public_status_changed` | Server → client | TV công cộng | Ticket công cộng đã lọc trường và che tên bệnh nhân. |
| `queue.sync` | Client → server | Client đã xác thực | Yêu cầu snapshot từ DB; tối đa 1 lần/giây/socket. |
| `auth.expired` | Server → client | Socket hết hạn | Báo hết hạn rồi ngắt kết nối. |

Snapshot được gửi khi kết nối và mỗi **30 giây**. Nó lấy dữ liệu từ DB cho ngày Việt Nam, gồm lịch `CHECKED_IN` và `IN_CONSULTATION` có số thứ tự; bác sĩ chỉ thấy hàng của mình. Event phát sau commit, nhưng không phải event log bền vững; khi mất event hoặc Redis gián đoạn, client dùng snapshot để đồng bộ trạng thái hiện tại.

TV nhận token riêng có hạn **8 giờ** do lễ tân cấp qua REST. Payload công cộng chỉ có `doctorId`, tên bác sĩ, phòng, số thứ tự, ngày, trạng thái và tên bệnh nhân che ký tự; không có `appointmentId`, mã lịch, `patientId`, điện thoại hay CCCD/CMND. Secret `QUEUE_BOARD_SECRET` tách khỏi QR và JWT đăng nhập.

Chạy nhiều backend instance: bật `QUEUE_REDIS_ADAPTER_ENABLED=true` ở mọi instance và cùng Redis để phân phối event giữa room trên các instance. Redis adapter dùng Pub/Sub, không lưu lịch sử event. Nếu Socket.IO dùng long polling, load balancer cần sticky session; có thể dùng riêng WebSocket transport để tránh yêu cầu này.

## 6. Dữ liệu, audit và cấu hình

| Thành phần | Vai trò / bảo vệ dữ liệu |
| --- | --- |
| `doctor_queue_counters` | Khóa chính `(doctor_id, queue_date)`; UPSERT tăng số nguyên tử trong cùng transaction. |
| `appointments` | Lưu queue, nguồn `APPOINTMENT`/`WALK_IN`, thời điểm check-in/thanh toán và idempotency; unique index slot còn hoạt động, unique số theo bác sĩ/ngày. |
| `counter_payment_transactions` | Lưu giao dịch, số biên lai, số tiền nhận/thối, ảnh chụp tên người liên quan; unique một giao dịch `SUCCESS` cho mỗi lịch. |
| `personal_health_profiles` | `citizen_id` nullable, unique khi không null; số điện thoại nằm ở `users` và được phép trùng. |
| `reception_audit_logs` | Ghi người thao tác, thời điểm, IP, user agent và metadata cho tra cứu, thu tiền, check-in, walk-in, in lại biên lai. |

Các migration liên quan: `1789923600000-add-reception-queue-and-counter-payment`, `1789927200000-add-walk-in-patient-and-idempotency`, `1789930800000-add-reception-audit-logs`, `1789934400000-allow-shared-patient-phone`, `1789938000000-unique-patient-citizen-id` trong `server/src/database/migrations/`.

Biến môi trường cần cấu hình: `QR_CHECKIN_SECRET`, `QUEUE_BOARD_SECRET` (mỗi secret riêng, ngẫu nhiên, tối thiểu 32 byte); Redis host/port/password cho khóa slot và adapter; `QUEUE_REDIS_ADAPTER_ENABLED=true` khi chạy nhiều instance. Chi tiết vận hành, hạn chế kết nối và khôi phục snapshot xem [reception-backend-operations.md](reception-backend-operations.md).

## 7. Kiểm chứng và giới hạn hiện tại

Các bộ test có sẵn gồm `reception-check-in-qr`, `reception-check-in-window`, `reception-counter-payment`, `reception-walk-in`, `reception-concurrency.integration`, `realtime-queue`, `realtime-queue-board-token` và `realtime-queue-board-http` trong `server/test/`. Lệnh chạy: `npm run build --workspace=@ehealth/server`, `npm run test --workspace=@ehealth/server`; bài integration dùng cấu hình riêng `npm run test:integration --workspace=@ehealth/server` và cần PostgreSQL/Redis phù hợp.

Các giới hạn cần nhớ khi tích hợp: quota walk-in hiện dựa vào slot lịch trực còn trống, chưa có quota riêng theo ca; Socket.IO snapshot khôi phục **trạng thái hiện tại**, không phát lại lịch sử; giới hạn 5 socket áp dụng từng instance. Frontend cần xử lý danh sách nhiều hồ sơ theo số điện thoại và phản hồi `PATIENT_SELECTION_REQUIRED` trước khi xác nhận walk-in.
