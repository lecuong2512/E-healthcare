# E-healthcare

Backend NestJS cho SRS-AUTH-01: đăng ký bệnh nhân qua Email hoặc SĐT, xác nhận OTP và tạo PHR.

## Chạy API đăng ký

Yêu cầu Node.js >= 20 và PostgreSQL 16. Tại thư mục repo:

```sh
npm install
npm run build --workspace @ehealth/server
npm run migration:run --workspace @ehealth/server
npm run start --workspace @ehealth/server
```

Dùng template cấu hình ở gốc repo để thiết lập `DATABASE_URL`, `OTP_HMAC_SECRET` (secret ngẫu nhiên ít nhất 32 byte) và SMTP hoặc SMS gateway. API chạy tại `http://localhost:3000/api/v1`. Migration chạy riêng, không tự sửa schema khi server khởi động. Nếu database chưa có extension, chạy `docker/postgres/init.sql` trước migrations.

Khi đi qua Nginx, đặt `TRUSTED_PROXY_CIDRS` bằng IP/CIDR của gateway tin cậy, phân tách bằng dấu phẩy, để rate limit dùng IP người dùng. Để trống khi truy cập API trực tiếp.

Email dùng `SMTP_HOST`, `SMTP_PORT`, `SMTP_FROM`, `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_SECURE`. Có thể dùng mail catcher local để xem OTP khi phát triển. SMS adapter gọi `SMS_WEBHOOK_URL` bằng POST JSON `{ "phoneNumber": "+84901234567", "message": "..." }`, header `Authorization: Bearer <SMS_WEBHOOK_TOKEN>`; HTTP 2xx nghĩa là gateway chấp nhận gửi. Production yêu cầu HTTPS cho SMS và TLS cho SMTP. Chưa cấu hình hoặc gửi thất bại: trả 503, không tạo tài khoản/phiên mới. OTP không được trả qua API hay ghi log.

## Contract SRS-AUTH-01

`POST /api/v1/auth/register/otp` nhận thông tin đầy đủ ngay khi yêu cầu OTP:

```json
{
  "email": "patient@example.com",
  "password": "Abcd123!",
  "fullName": "Nguyễn Văn A",
  "gender": "MALE",
  "dateOfBirth": "2000-01-02"
}
```

Đăng ký qua SMS: thay `email` bằng `phoneNumber` (`0901234567` hoặc E.164); số Việt Nam dạng `0...` được lưu thành `+84...`. Mỗi đăng ký nhận đúng một phương thức liên hệ để chỉ kích hoạt identifier đã xác minh. Email được trim và chuyển chữ thường; mật khẩu giữ nguyên. Giới tính: `MALE`, `FEMALE`, `OTHER`. Ngày sinh phải hợp lệ dạng `YYYY-MM-DD`, không ở tương lai. Mật khẩu tối thiểu 8 ký tự, có hoa, thường, số, ký tự đặc biệt; tối đa 72 byte UTF-8 để tránh BCrypt cắt bỏ phần cuối.

Response 202:

```json
{
  "registrationId": "92fb6003-a8a7-43bb-9877-42eea4438263",
  "expiresIn": 180,
  "resendAfter": 60,
  "channel": "email"
}
```

`POST /api/v1/auth/register/verify`:

```json
{ "registrationId": "92fb6003-a8a7-43bb-9877-42eea4438263", "otp": "012345" }
```

Response 201 gồm `userId`, `phrId`, `status: "ACTIVE"`, `role: "ROLE_PATIENT"`. User, role và PHR rỗng được tạo trong cùng transaction. Phiên OTP bị xóa sau thành công để chống dùng lại. API này không cấp access/refresh token; đăng nhập là SRS riêng.

Mật khẩu được băm bằng BCrypt cost **12 trước khi lưu phiên chờ** để không lưu mật khẩu rõ, rồi dùng hash đó khi kích hoạt. OTP ngẫu nhiên 6 chữ số từ CSPRNG, lưu dạng HMAC-SHA256 gắn với phiên và secret. Phiên/khóa lưu PostgreSQL; khóa transaction theo identifier ngăn thao tác đồng thời vượt giới hạn.

Sai OTP lần 1–4: 400 `OTP_INVALID` kèm `remainingAttempts`. Lần thứ 5 khóa cả xác nhận lẫn yêu cầu mã mới trong 900 giây: 429 `OTP_LOCKED`, `retryAfter`. Sau khóa phải yêu cầu OTP mới. Gửi lại qua `/otp` sau ít nhất 60 giây; trả `registrationId` mới, vô hiệu phiên cũ và giữ số lần sai chưa bị khóa. OTP quá 180 giây, không tồn tại hoặc đã dùng: 400 `OTP_SESSION_INVALID`. Email/SĐT trùng: 409 `CONTACT_ALREADY_REGISTERED` cùng thông báo đúng SRS. Input sai hoặc trường không cho phép (ví dụ `role`, `status`): 400. Giới hạn theo IP: 5 yêu cầu mã và 20 xác nhận/phút; kiểm tra duplicate/cooldown/lock trước khi băm BCrypt. Bộ giới hạn IP ở mỗi process, còn khóa OTP theo identifier được chia sẻ qua PostgreSQL.

## Kiểm thử

SMS đăng ký giới hạn tối đa **3 lần gửi thành công/SĐT trong cửa sổ trượt 10 phút**, tính cả mã đầu tiên và các lần gửi lại. SĐT dạng `0...` và `+84...` dùng chung hạn mức. Lần thứ 4 trả 429 `OTP_SEND_LIMIT_EXCEEDED` kèm `retryAfter` (giây chờ đến khi một lượt gửi ra khỏi cửa sổ). Lịch sử gửi lưu PostgreSQL độc lập với phiên OTP nên không bị reset khi gửi lại hoặc khởi động lại server. Request đồng thời được kiểm tra lại dưới khóa transaction theo SĐT; gửi thất bại không tính vào hạn mức. Chạy migration mới trước khi khởi động API.

```sh
npm test --workspace @ehealth/server
# Chỉ dùng database riêng tên ehealth_auth_test_*; suite truncate dữ liệu test.
TEST_DATABASE_URL=postgresql://USER:PASSWORD@localhost:5432/ehealth_auth_test_registration npm run test:integration --workspace @ehealth/server
```

Unit tests kiểm tra validation, BCrypt cost/salt, rate limit và SMTP/SMS adapter. Integration tests dùng PostgreSQL thật và mock gửi OTP, kiểm tra kích hoạt/PHR, duplicate, hết hạn, sai 5 lần, gửi lại, concurrency, replay và rollback transaction. Không gửi Email/SMS thật trong tests.

## Đăng nhập, JWT và phân quyền (SRS-AUTH-02)

Thiết lập hai khóa `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET` ngẫu nhiên, khác nhau, ít nhất 32 byte. API từ chối khóa mẫu mặc định. Chạy migrations trước khi khởi động backend.

- `POST /api/v1/auth/login`: `{ "identifier": "patient@example.com", "password": "Abcd123!" }`. Identifier nhận Email hoặc SĐT Việt Nam/E.164. Thành công 200 `{ "accessToken": "...", "role": "ROLE_PATIENT" }`.
- Sai mật khẩu liên tiếp lần 1–4: 401 `LOGIN_INVALID`. Lần thứ 5: 429 `LOGIN_LOCKED`, `retryAfter` tối đa 1800 giây. Bộ đếm/khóa lưu trên user, các request đồng thời không làm mất số lần sai. Khóa 30 phút và thu hồi các phiên hiện có; đăng nhập đúng reset số lần sai. User `BLOCKED`/`PENDING_VERIFY` không được đăng nhập. Giới hạn thêm 10 request đăng nhập/IP/phút.
- Access JWT chứa `userId`, `role`, `sid`, có TTL 900 giây; kiểm tra chữ ký HS256, issuer, audience, loại token và hạn dùng. Refresh JWT có hạn phiên tuyệt đối 604800 giây (7 ngày), dùng secret/audience khác và chỉ được trả trong cookie `ehealth_refresh`: `HttpOnly; Secure; SameSite=Strict; Path=/api/v1/auth`.
- `POST /api/v1/auth/refresh`: trình duyệt tự gửi cookie, không nhận refresh token trong JSON. Cấp access mới, xoay refresh và chỉ lưu SHA256 của refresh trong CSDL. Dùng lại refresh cũ thu hồi cả phiên; đăng xuất cũng thu hồi ngay access/refresh của phiên. Xoay refresh không kéo dài hạn tuyệt đối 7 ngày ban đầu.
- `POST /api/v1/auth/logout`: 204, thu hồi phiên và xóa cookie; gọi khi không có phiên vẫn thành công.
- `GET /api/v1/auth/me`: gửi `Authorization: Bearer <accessToken>`, trả userId/role của phiên. Token bị sửa, hết hạn, phiên đã thu hồi, user bị khóa hoặc role đã đổi đều bị từ chối.

Guard xác thực và RBAC áp dụng toàn cục. Route công khai dùng `@Public()`; route được bảo vệ phải khai báo `@Roles(Role.PATIENT, ...)`, hỗ trợ `ROLE_PATIENT`, `ROLE_DOCTOR`, `ROLE_RECEPTIONIST`, `ROLE_ADMIN`. Không token: 401; sai vai trò hoặc route chưa khai báo vai trò: 403. Vai trò lấy từ `user_roles`, không tin role từ body/header của client. Nếu user có nhiều role, ưu tiên ADMIN, RECEPTIONIST, DOCTOR, PATIENT, phù hợp contract một role hiện tại của client.

Refresh cookie cần HTTPS và frontend/API cùng site. Với phát triển local, chạy backend ở cổng 3000, rồi `npm run start:https --workspace ehealth-web-client` để mở Angular tại `https://localhost:4200`; proxy local chuyển `/api` đến backend. Chấp nhận chứng chỉ phát triển khi trình duyệt yêu cầu. Khi dùng setup này, đặt `FRONTEND_URL=https://localhost:4200`. Khi đã cấu hình frontend, POST auth từ origin khác bị từ chối; không tắt thuộc tính Secure để chạy HTTP.

## Google OAuth 2.0 / OpenID Connect

Tạo OAuth client loại Web Application trên Google Cloud. Cấu hình `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI`, `FRONTEND_URL`. Khai báo chính xác callback trong Google Cloud, ví dụ `https://localhost:4200/api/v1/auth/google/callback` với setup local HTTPS ở trên. Production bắt buộc HTTPS.

`GET /api/v1/auth/google` chuyển đến Google với scopes `openid email profile`, PKCE S256, state và nonce ngẫu nhiên. Phiên OAuth lưu PostgreSQL, có hạn 5 phút và chỉ dùng một lần, gắn với cookie trình duyệt `HttpOnly; Secure; SameSite=Lax` riêng cho callback. Cookie tạm dùng Lax vì điều hướng từ Google là cross-site; refresh cookie vẫn luôn Strict. Backend trao đổi code và dùng Google SDK kiểm tra chữ ký ID token, issuer/audience/exp, email_verified và nonce.

Tài khoản đã liên kết Google subject đăng nhập với role hiện có, vẫn bị kiểm tra ACTIVE và khóa 30 phút. Tự liên kết Email với tài khoản mật khẩu chỉ khi Google bảo đảm quyền sở hữu Email Gmail hoặc Workspace có claim `hd`; Email bên ngoài Google không được tự động liên kết tài khoản có sẵn.

Google không cung cấp giới tính/ngày sinh cần cho schema hiện tại. Với danh tính mới, callback tạo phiên hoàn thiện hồ sơ có hạn 10 phút trong cookie `HttpOnly; Secure; SameSite=Strict`, điều hướng `/register?google=complete`. Người dùng nhập họ tên, giới tính, ngày sinh; frontend gọi `POST /api/v1/auth/google/complete` với `{ "fullName": "Nguyễn Văn A", "gender": "MALE", "dateOfBirth": "2000-01-02" }`. User ACTIVE, ROLE_PATIENT, PHR rỗng và phiên đăng nhập được tạo trong cùng transaction. Không tạo ngày sinh/giới tính giả. Token không xuất hiện trong URL. Tài khoản Google đã có điều hướng `/login?google=success`, frontend phục hồi phiên qua refresh cookie và chuyển theo role.

Kiểm thử đăng nhập/refresh/RBAC dùng HTTP và PostgreSQL thật. Kiểm thử Google mô phỏng phản hồi provider để kiểm tra state/nonce/PKCE, cookie, liên kết và hoàn thiện hồ sơ; đăng nhập Google thật cần credentials và callback đã đăng ký, không được gọi tự động trong tests.
