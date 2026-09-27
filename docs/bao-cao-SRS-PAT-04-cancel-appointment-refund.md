# Báo cáo thực hiện SRS-PAT-04: Hủy lịch hẹn và hoàn tiền

## 1. Thông tin chung

- Dự án: E-Healthcare Portal.
- Phạm vi: giao diện lịch sử lịch hẹn, quy tắc hủy/hoàn tiền, Google OAuth và ghi nhận đồng thuận xử lý dữ liệu sức khỏe.
- Tài liệu đối chiếu: `docs/SRS-EHEALTH-2026-V1.docx`, SRS-PAT-04, mục 5.3 và SRS-AUTH-02.
- Công nghệ: Angular, NestJS, TypeORM, PostgreSQL, Google Identity Services và Jest.
- Trạng thái: hoàn tất mã nguồn và kiểm thử tự động.

## 2. Phân công thực hiện

| Checklist | Nội dung | Người thực hiện |
|---:|---|---|
| 1 | Thêm nút Hủy lịch hẹn tại danh sách lịch khám sắp tới. | Trần Tiến |
| 2 | Modal xác nhận hủy, hiển thị đầy đủ thời gian và thông tin lịch. | Trần Tiến |
| 3 | Thông báo hoàn 100% khi hủy trước ít nhất 24 giờ. | Trần Tiến |
| 4 | Thông báo hoàn 70% khi hủy từ 2 đến dưới 24 giờ. | Trần Tiến |
| 5 | Thông báo không hoàn tiền khi hủy dưới 2 giờ. | Trần Tiến |
| 6 | Nhập lý do, xác nhận hủy, cập nhật trạng thái và mở lại slot. | Trần Tiến |
| 7 | Cài đặt `google-auth-library` cho NestJS backend. | Đồng Văn Tú |
| 8 | API `POST /api/v1/auth/google` xác thực Google ID token. | Đồng Văn Tú |
| 9 | Tạo tài khoản Patient, PHR và cấp JWT/session sau OAuth. | Đồng Văn Tú |
| 10 | Checkbox cam kết bảo vệ dữ liệu sức khỏe. | Trần Tiến |
| 11 | Lưu thời điểm đồng thuận `consent_nd13_accepted_at`. | Đồng Văn Tú |

## 3. Kết quả thực hiện SRS-PAT-04

### 3.1 Hủy lịch và chính sách hoàn tiền

Trang lịch sử lịch hẹn hiển thị nút **Hủy lịch hẹn** cho lịch phù hợp. Khi người dùng chọn hủy, modal yêu cầu nhập lý do và xác nhận checkbox đồng thuận trước khi gửi request:

```http
POST /api/v1/appointments/:id/cancel
```

Payload:

```json
{
  "reason": "Không thể đến khám theo lịch đã đặt",
  "consentAccepted": true
}
```

Chính sách hoàn tiền được triển khai ở cả client để thông báo trước và backend để quyết định nghiệp vụ:

| Thời gian trước giờ khám | Hoàn tiền |
|---|---:|
| Từ 24 giờ trở lên | 100% |
| Từ 2 giờ đến dưới 24 giờ | 70% |
| Dưới 2 giờ | 0% |

Backend khóa lịch hẹn trong transaction, kiểm tra lịch thuộc đúng bệnh nhân, chuyển sang `CANCELLED_BY_PATIENT`, giải phóng slot `BOOKED` về `AVAILABLE` và lưu số tiền/tỷ lệ hoàn tiền. Điều này tránh hủy trùng hoặc giải phóng slot không nhất quán khi có request đồng thời.

### 3.2 Đồng thuận bảo vệ dữ liệu sức khỏe

Checkbox đồng thuận là điều kiện bắt buộc tại modal hủy. Backend không tin timestamp do trình duyệt cung cấp:

- DTO yêu cầu `consentAccepted` là boolean.
- Nếu chưa đồng thuận, API trả HTTP 400 và không hủy lịch.
- Khi hủy thành công bởi bệnh nhân, server tự ghi `consent_nd13_accepted_at`.
- Hủy lịch từ phía cơ sở y tế không ghi trường đồng thuận của bệnh nhân.

Migration `1790151600000-add-appointment-consent.ts` thêm cột `consent_nd13_accepted_at TIMESTAMPTZ` vào bảng `appointments` và đã được đăng ký trong datasource.

## 4. Google OAuth và session

`POST /api/v1/auth/google` nhận Google OpenID Connect ID token từ ứng dụng khách. Backend xác minh chữ ký token bằng `google-auth-library`, đồng thời kiểm tra:

- `aud` khớp `GOOGLE_CLIENT_ID`.
- `iss` là Google hợp lệ.
- Token chưa hết hạn.
- Email đã được Google xác minh.
- `sub` và email có độ dài hợp lệ.

Endpoint được giới hạn 10 request/phút. Với tài khoản đã tồn tại, backend liên kết Google subject khi hợp lệ và cấp Access Token 15 phút cùng Refresh Token 7 ngày qua HttpOnly Secure cookie.

Google ID token không chứa `gender` và `date_of_birth`, trong khi hai trường này là bắt buộc của bảng `users`. Vì vậy, người dùng mới nhận trạng thái cần hoàn tất hồ sơ; sau khi cung cấp dữ liệu bắt buộc, transaction tạo:

1. Bản ghi `users` ở trạng thái `ACTIVE`.
2. Vai trò `ROLE_PATIENT` trong `user_roles`.
3. Hồ sơ rỗng `personal_health_profiles`.
4. Auth session và cặp JWT theo SRS-AUTH-02.

Không tạo dữ liệu giới tính hoặc ngày sinh giả.

## 5. Các file chính

```text
client/src/app/features/patient/pages/medical-history/medical-history.page.ts
server/src/modules/appointment/appointment.controller.ts
server/src/modules/appointment/appointment-lifecycle.service.ts
server/src/modules/appointment/dto/cancel-appointment.dto.ts
server/src/database/entities/appointment.entity.ts
server/src/database/migrations/1790151600000-add-appointment-consent.ts
server/src/modules/auth/google-auth.controller.ts
server/src/modules/auth/google-auth.service.ts
server/src/modules/auth/dto/google-id-token.dto.ts
server/src/database/database-options.ts
server/test/appointment-lifecycle.spec.ts
server/test/google-auth.spec.ts
```

## 6. Kiểm thử

Các test trọng tâm xác nhận:

1. Hủy trước 24 giờ hoàn 100% và mở lại slot.
2. Hủy từ 2 đến dưới 24 giờ hoàn 70%.
3. Hủy dưới 2 giờ không hoàn tiền.
4. Từ chối hủy khi chưa đồng thuận; server ghi timestamp consent khi bệnh nhân xác nhận.
5. Hủy bởi cơ sở y tế không ghi consent của bệnh nhân.
6. Google ID token hợp lệ cho tài khoản sẵn có cấp session mà không trao đổi authorization code.
7. Google user mới hoàn tất hồ sơ tạo `ROLE_PATIENT`, PHR và session trong một transaction.
8. Từ chối Google token sai audience, issuer, expiry, nonce hoặc email chưa xác minh.

Kết quả xác minh:

```text
Test Suites: 16 passed, 16 total
Tests:       179 passed, 179 total
Snapshots:   0 total
```

Build toàn workspace:

```bash
npm run build --workspaces --if-present
```

Kết quả: thành công cho Angular client và NestJS server.

Kiểm tra diff:

```bash
git diff --check
```

Kết quả: thành công.

## 7. Hướng dẫn tích hợp

Trước khi triển khai, cấu hình:

```text
GOOGLE_CLIENT_ID
GOOGLE_CLIENT_SECRET
GOOGLE_REDIRECT_URI
JWT_ACCESS_SECRET
JWT_REFRESH_SECRET
```

Chạy migration trước khi khởi động backend:

```bash
npm run migration:run --workspace=@ehealth/server
```

Sau đó kiểm tra thủ công:

- Hủy lịch ở cả ba mốc thời gian và kiểm tra tỷ lệ hoàn tiền.
- Xác nhận không thể gửi yêu cầu hủy nếu chưa tick đồng thuận.
- Kiểm tra cột `appointments.consent_nd13_accepted_at` chỉ có giá trị sau hủy do bệnh nhân.
- Đăng nhập Google với tài khoản đã có và tài khoản mới; tài khoản mới cần hoàn tất hồ sơ trước khi được tạo.
