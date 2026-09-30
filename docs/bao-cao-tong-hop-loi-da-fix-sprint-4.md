# BÁO CÁO TỔNG HỢP KHẮC PHỤC LỖI TÍCH HỢP & TRIỂN KHAI HỆ THỐNG
**Dự án:** Hệ thống Quản lý & Đặt lịch Khám chữa bệnh (E-Healthcare Portal)  
**Thời điểm hoàn thành:** 30/09/2026 (Giai đoạn Sprint 4 - Chuẩn bị nghiệm thu Release v1.0.0)  
**Người thực hiện:** Technical Lead & Lead QA  
**Môi trường triển khai:** Staging Live (`https://healthcare.vczo.me` trên VPS Azure `52.175.66.56`)  
**Tài liệu tham chiếu:** `docs/SRS-EHEALTH-2026-V1.docx`, `docs/ke-hoach-bo-sung-tasks-srs.md`, `docs/nhat-ky-va-tong-hop-ban-giao-phien-lam-viec-2026-09-30.md`

---

## 1. BỐI CẢNH & MỤC TIÊU XỬ LÝ

Trong quá trình nghiệm thu chéo Sprint 4, nhóm phát triển và QA đã ghi nhận các vấn đề trọng yếu:
1. **Phản hồi kiến trúc & dữ liệu từ thành viên:** Kết nối giữa Frontend và Backend/Database chưa hoàn toàn thực tế; nhiều module sử dụng mảng dữ liệu giả lập (mock cứng) trong component; cơ sở dữ liệu rỗng dẫn đến không có dữ liệu bác sĩ/ca trực để kiểm thử; các module hoạt động rời rạc (unit test từng phần với mock thì pass nhưng khi chạy phối hợp thực tế thì gặp lỗi).
2. **Các lỗi phát sinh từ người dùng & QA (15 lỗi tích hợp):**
   - Click Logo bị tự động đăng xuất và chuyển về trang `/login`.
   - Đăng nhập tài khoản bất kỳ hoặc Google OAuth luôn hiển thị tên cố định "Nguyễn An" trên Header.
   - Nhiều người dùng đăng nhập cùng tài khoản demo; dữ liệu khi thay đổi trên giao diện bị mất và quay về ban đầu khi refresh trang.
   - Không thể tạo tài khoản qua số điện thoại do cổng SMS webhook bị chặn hoặc chưa cấu hình.
   - Bệnh nhân đã đăng nhập nhưng khi đặt lịch vẫn bị yêu cầu nhập lại toàn bộ thông tin cá nhân; thiếu tùy chọn đặt cho bản thân hoặc người thân.
   - Cơ sở dữ liệu trống, thiếu danh sách bác sĩ và khung giờ khám trong ngày.
   - Header bị trùng lặp (2 header lồng nhau) tại các trang con.
   - Màn hình Bảng gọi số sảnh chờ Smart TV vẫn hiển thị thanh Header chung của website.
   - Hàng đợi bác sĩ dùng mảng mock 9 bệnh nhân gõ tay, không phản ánh đúng trạng thái tiếp nhận và không cập nhật thời gian thực.
   - Chức năng Lưu nháp bệnh án (EMR) không lưu vào CSDL; Hoàn thành ca khám chuyển trang đột ngột không rõ trạng thái.
   - Khách hủy giao dịch trên cổng MoMo / VNPAY khiến giao diện kẹt loading vô hạn.
   - Thiếu cấu hình chính thức cho cổng thanh toán VNPAY Sandbox.

Mục tiêu của đợt xử lý này là: **Loại bỏ 100% dữ liệu mock trên các luồng thực tế, đấu nối API/WebSocket thật, làm giàu Seed Data phủ kín ca trực 3 ca/ngày, sửa dứt điểm 15 lỗi, đảm bảo 100% unit tests pass và deploy thành công lên máy chủ Live.**

---

## 2. BẢNG TỔNG HỢP 15 LỖI ĐÃ KHẮC PHỤC (BUG-01 ĐẾN BUG-15)

| Mã Lỗi | Phân Hệ | Mô Tả Lỗi Ban Đầu & Nguyên Nhân Gốc | Giải Pháp Kỹ Thuật Đã Triển Khai | Kết Quả Nghiệm Thu |
| :---: | :---: | :--- | :--- | :---: |
| **BUG-01** | Frontend (Patient) | Bộ lọc chuyên khoa phân biệt chữ hoa/thường và có dấu tiếng Việt (ví dụ: tag "Tim mạch" không khớp với "Khoa Tim Mạch"); chưa hỗ trợ lọc bác sĩ theo ngày khám được chọn. | Thêm hàm chuẩn hóa Unicode NFD loại bỏ dấu và đưa về chữ thường trong `doctor-search.page.ts`. Bổ sung logic lọc theo `selectedDate` ('today', 'tomorrow' hoặc ngày từ date picker) kết hợp kiểm tra slot trực tiếp. | ✅ Đã pass unit tests (`doctor-search.page.spec.ts`) |
| **BUG-02** | Fullstack (Payment) | Chưa cấu hình thông tin kết nối chính thức của cổng VNPAY Sandbox theo tài khoản Merchant được cấp. | Đã cập nhật file cấu hình môi trường `.env` trên cả local và VPS với thông tin chính thức: `VNPAY_TMN_CODE=NFZSAHX6`, `VNPAY_HASH_SECRET=JATSRBUCHOANNIVOTQCJLVYAVHEXTNRN`, URL Sandbox `https://sandbox.vnpayment.vn/paymentv2/vpcpay.html`. | ✅ Đã cấu hình & xác thực live |
| **BUG-03** | Frontend (Payment) | Khi bệnh nhân bấm hủy giao dịch trên cổng MoMo hoặc VNPAY rồi quay lại web, trang kết quả thanh toán bị rơi vào vòng lặp polling vô hạn ở trạng thái loading. | Trong `payment-result.page.ts`: Bắt mã hủy `resultCode=1006` (MoMo) và `vnp_ResponseCode=24` (VNPAY). Ngắt ngay timer polling, chuyển giao diện sang trạng thái `recoverable`, hiển thị thông báo hủy thân thiện và cung cấp 3 nút: Thử lại thanh toán, Chuyển sang trả sau tại quầy, Hủy giữ chỗ lịch hẹn. Tự chuyển `recoverable` sau 3 lần poll nếu giao dịch vẫn PENDING. | ✅ Đã pass unit tests (`payment-result.page.spec.ts`) |
| **BUG-04** | Backend (PHR) | Giao diện hồ sơ bệnh nhân gửi request `PATCH /api/v1/phr/me` nhưng Controller chỉ khai báo `@Put('me')`, dẫn đến lỗi HTTP 404 Method Not Allowed / Route Not Found. | Bổ sung decorator `@Patch('me')` song song với `@Put('me')` cho handler `updateMyPhr` trong `server/src/modules/phr/phr.controller.ts`. | ✅ Đã test & build thành công |
| **BUG-05** | Backend (User) | Người dùng (Bệnh nhân/Bác sĩ) tải ảnh đại diện lên qua API `/api/v1/users/avatar` bị RolesGuard chặn bằng lỗi HTTP 403 Forbidden. | Gắn decorator `@Roles(Role.PATIENT, Role.DOCTOR, Role.RECEPTIONIST, Role.ADMIN)` cho `UserController` trong `server/src/modules/user/user.controller.ts`. | ✅ Đã test & build thành công |
| **BUG-06** | Frontend (Layout) | Khi người dùng click vào Brand Logo "E-HEALTH" ở Header, hệ thống điều hướng cứng về `/login` dẫn đến việc bị coi như tự động đăng xuất ngoài ý muốn. | Refactor `routerLink` của Brand Logo trong `header.component.ts` thành `[routerLink]="homeRoute()"`. Biến `homeRoute` tự động tính toán dựa trên quyền người dùng: Bệnh nhân $\rightarrow$ `/patient/doctor-search`, Bác sĩ $\rightarrow$ `/doctor/queue`, Lễ tân $\rightarrow$ `/receptionist/checkin`, Admin $\rightarrow$ `/admin/dashboard`, Khách chưa đăng nhập $\rightarrow$ `/login`. | ✅ Đã pass unit tests (`header.component.spec.ts`) |
| **BUG-07** | Fullstack (Auth/Layout) | Đăng nhập bằng Google hoặc tài khoản khác nhau nhưng Header luôn hiển thị thông tin tĩnh "Nguyễn An"; dữ liệu trên Header bị khóa cứng không đồng bộ phiên đăng nhập thật. | - Backend: Bổ sung trường `user: CurrentUser` vào `IssuedSession` trong `session.service.ts`, `session.controller.ts`, `login.service.ts`.<br>- Frontend: `TokenStoreService` lưu trữ `user` vào signal `_currentUser` và `localStorage`. `HeaderComponent` đọc dữ liệu người dùng thật, hiển thị họ tên thật, role badge và dynamic initials avatar. | ✅ Đã pass unit tests (`auth.service.spec.ts`, `token-store.service.spec.ts`) |
| **BUG-08** | Backend (Auth) | Người dùng không thể tạo tài khoản qua số điện thoại do hệ thống ném `ServiceUnavailableException` khi webhook SMS chưa được cấu hình. | Trong `otp-delivery.service.ts`: Bổ sung cơ chế Sandbox fallback cho QA/Dev. Khi chưa cấu hình SMS gateway, mã OTP được ghi trực tiếp vào Logger hệ thống thay vì làm gãy luồng đăng ký của người dùng. | ✅ Đã pass unit tests (`otp-delivery.spec.ts`) |
| **BUG-09** | Frontend (Booking) | Bệnh nhân đã đăng nhập nhưng khi vào Bước 3 đặt lịch khám vẫn phải gõ lại toàn bộ thông tin từ đầu; thiếu tùy chọn đặt cho người khác. | Tại Bước 3 của `booking-stepper.page.html`: Bổ sung 2 nút radio "🔘 Đặt cho bản thân" và "🔘 Đặt cho người thân / người khác". Khi chọn bản thân, form tự động điền họ tên, SĐT, ngày sinh, giới tính từ `PhrService.getMyPhr()` hoặc `AuthService.currentUser()`; khi chọn người khác, form tự động reset trắng để nhập mới. | ✅ Đã pass unit tests (`booking-stepper.page.spec.ts`) |
| **BUG-10** | Backend (Seed) & Frontend | Cơ sở dữ liệu rỗng, không có danh sách bác sĩ và khung giờ khám trong ngày; giao diện Tiếp nhận vãng lai của lễ tân không có thông báo khi hết ca. | - Backend: Nâng cấp kịch bản `seed-qa.ts` tạo 6 chuyên khoa, 6 phòng khám, 5 bác sĩ chuyên khoa với **625 ca trực** phủ kín cả 3 ca (Sáng: 08:00-12:00, Chiều: 13:30-17:30, Tối: 18:00-22:30) cho hôm nay và 4 ngày tới.<br>- Frontend: Bổ sung hộp cảnh báo Empty State trong `walkin-booking.page.html` hướng dẫn bệnh nhân khi hết ca khám trong ngày. | ✅ Đã seed thành công 625 slots trên DB VPS |
| **BUG-11** | Frontend (Layout) | Xuất hiện 2 header lồng nhau (trùng lặp thanh điều hướng) tại trang đăng nhập, đăng ký và các trang nghiệp vụ con. | Rà soát và xóa bỏ toàn bộ các thẻ `<header>` nội bộ thừa trong `login.page.html`, `register.page.html`, `checkin-desk.page.html`, `walkin-booking.page.html` và `phr-profile.page.html`. | ✅ Giao diện đồng bộ, sạch sẽ |
| **BUG-12** | Frontend (Reception) | Màn hình Bảng gọi số sảnh chờ Smart TV (`/receptionist/queue-board`) vẫn hiển thị thanh Navbar chung của website, làm vỡ trải nghiệm hiển thị toàn màn hình. | Trong `app.component.ts`: Bổ sung kiểm tra `isQueueBoardFullscreen = computed(...)`. Ẩn hoàn toàn `<app-navbar>` khi route hiện tại là `/receptionist/queue-board`. | ✅ Đã pass unit tests (`app.component.spec.ts`) |
| **BUG-13** | Frontend (Doctor EMR) | Màn hình Hàng đợi khám bệnh của Bác sĩ sử dụng mảng mock cứng 9 bệnh nhân gõ tay; không gọi API backend và không cập nhật khi trạng thái thay đổi. | Xóa bỏ hoàn toàn dữ liệu mock trong `patient-queue.page.ts`. Kết nối trực tiếp API `GET /api/v1/doctor/queue` để lấy snapshot thật; đấu nối `SocketService` lắng nghe sự kiện WebSocket `queue.snapshot` và `queue.status_changed` theo thời gian thực; nút "Tiếp nhận khám" gọi API chuyển trạng thái sang `IN_CONSULTATION` và điều hướng sang buồng khám. | ✅ Đã pass unit tests (`patient-queue.page.spec.ts`) |
| **BUG-14** | Frontend (Doctor EMR) | Bác sĩ bấm nút "Lưu nháp" nhưng không biết lưu ở đâu, không có API ghi nhận và khi refresh trang thì mất sạch thông tin đã nhập. | Trong `clinical.service.ts` và `consultation.page.ts`: Đấu nối hàm `saveDraft()` gọi `ClinicalService.createMedicalRecord()` hoặc `updateMedicalRecord()` lưu toàn bộ chỉ số sinh tồn, chẩn đoán ICD-10, ghi chú lâm sàng và danh mục đơn thuốc trực tiếp vào CSDL; hiển thị thông báo trạng thái rõ ràng. | ✅ Đã pass unit tests (`consultation.page.spec.ts`) |
| **BUG-15** | Frontend (Doctor EMR) | Bác sĩ bấm "Hoàn thành ca khám" thì hệ thống tự động nhảy về trang hàng đợi mà không hỏi xác nhận, không hiển thị kết quả chốt bệnh án và không biết đã khám xong hay chưa. | Trong `consultation.page.ts`: Bổ sung Modal xác nhận trước khi hoàn tất. Khi xác nhận, gọi `ClinicalService.completeConsultation()` chốt bệnh án, sinh mã băm SHA-256 chữ ký số điện tử. Sau khi hoàn tất, hiển thị Modal thành công kèm tùy chọn xem/tải đơn thuốc PDF trước khi bấm quay về hàng đợi. | ✅ Đã pass unit tests (`consultation.page.spec.ts`) |

---

## 3. CHI TIẾT CÁC CÔNG VIỆC NÂNG CẤP KỸ THUẬT

### 3.1. Làm Giàu Dữ Liệu Seed (`seed-qa.ts`)
Trước đây cơ sở dữ liệu bị rỗng khiến các tính năng tìm kiếm, đặt lịch trực tuyến, tiếp nhận vãng lai tại quầy lễ tân không có dữ liệu thực tế để hoạt động. File `server/src/database/seeds/seed-qa.ts` đã được tái thiết kế hoàn chỉnh:
* **Chuyên khoa:** Khoa Tim Mạch, Khoa Da Liễu, Khoa Nhi, Khoa Ngoại Tổng Quát, Khoa Tai Mũi Họng, Khoa Nội Tổng Quát.
* **Phòng khám:** P.101 (Tim Mạch), P.102 (Da Liễu), P.103 (Nhi), P.104 (Ngoại), P.105 (Tai Mũi Họng), P.001 (Quầy Tiếp Đón Lễ Tân).
* **Bác sĩ chuyên khoa:**
  1. `doctor@ehealth.local` - BS.CKI Trần Văn Bình (Tim Mạch, P.101)
  2. `doctor.hang@ehealth.local` - BS.CKII Nguyễn Thu Hằng (Da Liễu, P.102)
  3. `doctor.long@ehealth.local` - ThS.BS Lê Hoàng Long (Nhi Khoa, P.103)
  4. `doctor.duc@ehealth.local` - BSCKII Phạm Minh Đức (Ngoại Tổng Quát, P.104)
  5. `doctor.maianh@ehealth.local` - BS Vũ Mai Anh (Tai Mũi Họng, P.105)
* **Khung giờ khám (Slots):** 625 khung giờ khám 30 phút phủ kín 3 ca (Sáng: 08:00 - 12:00, Chiều: 13:30 - 17:30, Tối: 18:00 - 22:30) cho hôm nay và 4 ngày tiếp theo.

### 3.2. Chuẩn Hóa Điều Hướng & Trải Nghiệm Người Dùng (Role-Based Header)
* Loại bỏ tình trạng Header cứng tên "Nguyễn An" cho mọi tài khoản. Header giờ đây tự động đọc thông tin từ `currentUser()` signal để hiển thị họ tên thật, role badge và dynamic initials avatar.
* Bổ sung Dropdown menu đầy đủ cho từng vai trò:
  - **Bệnh nhân:** Hồ sơ sức khỏe cá nhân (PHR), Lịch sử khám bệnh & Đơn thuốc, Đăng xuất.
  - **Bác sĩ:** Cấu hình ca trực, Hàng đợi khám bệnh, Đăng xuất.
  - **Lễ tân:** Bàn làm việc tiếp đón, Bảng gọi số sảnh chờ, Đăng xuất.
  - **Quản trị viên:** Dashboard KPI, Quản lý nhân sự, Danh mục y tế, Nhật ký kiểm toán, Đăng xuất.
* Xóa bỏ các thẻ `<header>` lồng nhau gây trùng lặp giao diện tại các trang con.
* Tự động ẩn thanh Navbar khi ở chế độ Bảng gọi số Smart TV (`/receptionist/queue-board`).

### 3.3. Hoàn Thiện EMR & Hàng Đợi Khám Bác Sĩ Realtime
* Xóa bỏ hoàn toàn mảng mock tĩnh 9 bệnh nhân gõ tay.
* Tích hợp snapshot API `GET /api/v1/doctor/queue` kết hợp WebSocket Gateway phòng khám, lắng nghe sự kiện `queue.snapshot` và `queue.status_changed` giúp bác sĩ nắm bắt bệnh nhân mới đến quầy check-in ngay lập tức mà không cần F5.
* Quy trình khám bệnh có chức năng Lưu nháp vào CSDL và Hoàn tất ca khám an toàn (có modal xác nhận, sinh chữ ký số SHA-256 cho đơn thuốc và hỗ trợ tải PDF đơn thuốc).

---

## 4. KẾT QUẢ KIỂM THỬ TOÀN DỰ ÁN

| Hạng Mục Kiểm Thử | Công Cụ & Môi Trường | Số Lượng Test Cases | Kết Quả |
| :--- | :--- | :---: | :---: |
| **Frontend Unit Tests** | Karma + Jasmine (ChromeHeadless) | **346 / 346 tests** | ✅ **100% PASS** (0 failed) |
| **Backend Unit Tests** | Jest Runner (runInBand) | **527 / 527 tests** (58 suites) | ✅ **100% PASS** (0 failed) |
| **Shared Types Build** | TypeScript Compiler (`tsc --noEmit`) | Toàn bộ shared interfaces & enums | ✅ **0 Lỗi** |
| **Client Production Build** | Angular CLI (`ng build`) | Output: `client/dist/ehealth-web-client` | ✅ **0 Lỗi** |
| **Server Production Build** | NestJS / TypeScript Compiler (`tsc`) | Output: `server/dist` | ✅ **0 Lỗi** |

---

## 5. KẾT QUẢ TRIỂN KHAI THỰC TẾ LÊN MÁY CHỦ LIVE (VPS)

Hệ thống đã được triển khai tự động lên máy chủ VPS qua kết nối SSH:
* **Thông tin máy chủ:** Azure Ubuntu VM (`52.175.66.56`).
* **Tên miền chính thức:** 👉 **[https://healthcare.vczo.me](https://healthcare.vczo.me)**
* **Chứng chỉ bảo mật:** HTTPS Let's Encrypt SSL hợp lệ.
* **Hạ tầng dịch vụ đang hoạt động:**
  - `ehealth-postgres` (PostgreSQL 16 Alpine trong Docker): Port 5432 - Healthy.
  - `ehealth-redis` (Redis Stack 7.2 trong Docker): Port 6379, 8001 - Healthy.
  - `ehealth-api` (NestJS Backend quản lý bởi PM2): Port 3000 - Online.
  - `nginx` (Systemd Reverse Proxy & Static Host): Port 80, 443 - Active.
* **Dữ liệu trên máy chủ Live:** Đã chạy `migration:run` và `seed:qa` nạp thành công 5 bác sĩ, 625 slots ca trực 3 ca/ngày.
* **Xác thực API qua mạng công cộng:** Lệnh `POST https://healthcare.vczo.me/api/v1/auth/login` kiểm tra thành công, trả về token và thông tin người dùng thật.

---

## 6. DANH SÁCH TÀI KHOẢN MẪU ĐỂ NGHIỆM THU

Tất cả các tài khoản sử dụng mật khẩu chung: `Pass1234!`

| Vai Trò | Email Đăng Nhập | Số Điện Thoại | Ghi Chú Nghiệm Thu |
| :--- | :--- | :---: | :--- |
| **Bệnh nhân** | `patient@ehealth.local` | `0901234001` | Test tìm bác sĩ, đổi giữa "Đặt cho bản thân" vs "Đặt cho người khác", hủy thanh toán VNPAY/MoMo. |
| **Bác sĩ Tim Mạch** | `doctor@ehealth.local` | `0901234002` | Phòng P.101. Test hàng đợi realtime, lưu nháp bệnh án, chốt ca khám và xuất PDF đơn thuốc. |
| **Bác sĩ Da Liễu** | `doctor.hang@ehealth.local` | `0901234005` | Phòng P.102. Test ca trực và tiếp nhận bệnh nhân. |
| **Bác sĩ Nhi Khoa** | `doctor.long@ehealth.local` | `0901234006` | Phòng P.103. Test ca trực và tiếp nhận bệnh nhân. |
| **Bác sĩ Ngoại Tổng Quát** | `doctor.duc@ehealth.local` | `0901234007` | Phòng P.104. Test ca trực và tiếp nhận bệnh nhân. |
| **Bác sĩ Tai Mũi Họng** | `doctor.maianh@ehealth.local` | `0901234008` | Phòng P.105. Test ca trực và tiếp nhận bệnh nhân. |
| **Lễ tân** | `receptionist@ehealth.local` | `0901234003` | Test bàn tiếp đón check-in và Bảng gọi số sảnh chờ Smart TV (`/receptionist/queue-board`). |
| **Quản trị viên** | `admin@ehealth.local` | `0901234004` | Test Dashboard KPI, Quản trị nhân sự, Danh mục y tế và Nhật ký kiểm toán. |

---
*Báo cáo được lập tự động dựa trên kết quả kiểm thử và triển khai thực tế của dự án E-Healthcare Portal.*
