# BÁO CÁO KHẮC PHỤC DEFECT-PHR-005-DOCTOR-ACCESS & KIỂM THỬ XÁC NHẬN NỘI BỘ

**Dự án:** E-healthcare Platform  
**Branch thực hiện:** `feature/fix-phr-005-doctor-access` (tách từ `feature/4.5-system-acceptance`)  
**Commit Baseline:** `34247c30750a2571b575f91ef165aa7e761c5bea`  
**Test Database:** `postgresql://postgres:postgres_password@localhost:5432/ehealth_phr_test_db` (PostgreSQL thật)  
**Tiêu chuẩn:** Zero-Tolerance Acceptance Standard (100% Real Database Execution Evidence, bảo toàn tính toàn vẹn RTM)  
**Ngày thực hiện:** 30/09/2026  

---

## 1. THÔNG TIN DEFECT (DEFECT OVERVIEW)

- **Mã Defect:** `DEFECT-PHR-005-DOCTOR-ACCESS`
- **Test Case liên quan:** `TC-PHR-005` (Bác sĩ xem PHR bệnh nhân khi bắt đầu ca khám)
- **Mã yêu cầu:** `SRS-AUTH-03` / `UR-AUTH-03`
- **Độ ưu tiên:** P0 (Critical / High)
- **Expected Result (SRS-AUTH-03):** Thông tin PHR (nhân khẩu học, nhóm máu, dị ứng, bệnh mạn tính, tiền sử phẫu thuật) của bệnh nhân tự động hiển thị trên màn hình buồng khám (Consultation) của bác sĩ khi tiếp nhận ca khám hợp lệ.
- **Trạng thái trước remediation:** **FAIL** (được ghi nhận trong báo cáo Wave 3).

---

## 2. NGUYÊN NHÂN GỐC (ROOT CAUSE ANALYSIS)

1. **Sai lệch context người dùng ở Frontend (`ConsultationPage`):**
   - Trước khi sửa, `ConsultationPage` (`client/src/app/features/doctor/pages/consultation/consultation.page.ts:35`) gọi:
     ```typescript
     this.phr.getMyPhr().subscribe(...)
     ```
   - Phương thức này trỏ vào endpoint `GET /api/v1/phr/me`, vốn được thiết kế cho bệnh nhân tự xem hồ sơ của chính mình (`req.auth.userId`).
   - Khi bác sĩ đang đăng nhập vào buồng khám, `req.auth.userId` là ID của tài khoản bác sĩ, dẫn đến việc hoặc bị chặn 403 (do controller `/phr/me` được bảo vệ bởi `@Roles(Role.PATIENT)`), hoặc nếu gọi được thì trả về PHR của chính bác sĩ thay vì PHR của người bệnh trong ca khám.

2. **Thiếu hụt Endpoint nghiệp vụ ở Backend:**
   - Phân hệ `clinical` của backend NestJS chưa cung cấp endpoint cho phép bác sĩ truy vấn thông tin PHR của bệnh nhân theo ngữ cảnh ca khám (`appointmentId`).
   - Dự án thiếu cơ chế gắn kết quyền truy cập hồ sơ sức khỏe với ca khám được phân công (`assigned doctor check`).

---

## 3. THIẾT KẾ GIẢI PHÁP & MÔ HÌNH PHÂN QUYỀN (AUTHORIZATION MODEL)

### 3.1. Thiết kế Endpoint Backend
Tạo endpoint nghiệp vụ mới gắn liền với định danh ca khám:
```http
GET /api/v1/clinical/appointments/:appointmentId/patient-phr
```
- **Guards & Roles:** `@Roles(Role.DOCTOR)` kết hợp với `AccessTokenGuard` và `RolesGuard` toàn cục của hệ thống.
- **Cơ chế kiểm soát truy cập (Access Control Flow):**
  1. **Authentication Check:** Yêu cầu JWT Access Token hợp lệ trong header `Authorization: Bearer <token>` (thiếu hoặc token giả mạo $\rightarrow$ `401 Unauthorized`).
  2. **Role Check:** Chỉ người dùng có vai trò `ROLE_DOCTOR` mới được phép gọi (vai trò `ROLE_PATIENT`, `ROLE_ADMIN`, `ROLE_RECEPTIONIST` $\rightarrow$ `403 Forbidden`).
  3. **Appointment Existence Check:** Xác định `appointmentId` (qua `ParseUUIDPipe` kiểm tra định dạng UUID v4; nếu không tồn tại trong database $\rightarrow$ `404 Not Found` với mã `APPOINTMENT_NOT_FOUND`).
  4. **Strict Assigned Doctor Authorization (Chống IDOR / Bác sĩ xem chéo):**
     - Truy vấn `DoctorEntity` gắn với `req.auth.userId` của bác sĩ đang đăng nhập.
     - So sánh `appointment.doctorId === doctor.id`.
     - Nếu bác sĩ hiện tại không phải là bác sĩ được phân công phụ trách ca khám đó $\rightarrow$ Ghi log từ chối kiểm toán (`AuditOutcome.DENIED`) và ném ngoại lệ `403 Forbidden` với mã `UNAUTHORIZED_DOCTOR`, thông báo *"Bác sĩ không được phân công phụ trách ca khám này."*.
     - **Không có bất kỳ dữ liệu bệnh nhân nào bị rò rỉ.**
  5. **Patient Isolation Enforcement:**
     - `patientId` được lấy trực tiếp từ bản ghi `AppointmentEntity` lưu trong PostgreSQL (`appointment.patientId`).
     - Bác sĩ **không được truyền `patientId` tùy ý** trên URL hay body để query, loại bỏ hoàn toàn nguy cơ truy xuất tùy tiện hồ sơ bệnh nhân khác.
  6. **Data Retrieval & Audit:**
     - Truy vấn `UserEntity` của bệnh nhân (lấy `fullName`, `gender`, `dateOfBirth`, `dateOfBirthPrecision`).
     - Truy vấn `PersonalHealthProfileEntity` của bệnh nhân (lấy `citizenId`, `address`, `healthInsurance`, `bloodType`, `allergies`, `chronicDiseases`, `surgeryHistory`).
     - Ghi nhận nhật ký kiểm toán hợp lệ (`AuditAction.VIEW_EMR`, `metadata: { view: 'PATIENT_PHR' }`).
     - Trả về đối tượng `PhrProfile` chuẩn hóa.

### 3.2. Cập nhật Frontend
- Trong `client/src/app/core/services/clinical.service.ts`: Bổ sung hàm `getPatientPhrByAppointment(appointmentId: string): Observable<PhrProfile>`.
- Trong `ConsultationPage` (`client/src/app/features/doctor/pages/consultation/consultation.page.ts`):
  - Lấy `appointmentId` từ `route.paramMap`.
  - Thay thế hoàn toàn `loadPhr()` / `getMyPhr()` bằng `loadPatientPhr(appointmentId)`.
  - Gọi `this.clinical.getPatientPhrByAppointment(appointmentId)`.
  - Đổ dữ liệu vào giao diện: `patientName`, `patientGender`, `patientYear`, `bloodType`, `allergies`, `chronicDiseases`, `surgeryHistory`.

---

## 4. DANH SÁCH TẬP TIN THAY ĐỔI (FILES CHANGED)

| STT | Đường dẫn tập tin | Phân hệ | Loại thay đổi | Mô tả tóm tắt |
| :---: | :--- | :---: | :---: | :--- |
| 1 | `server/src/modules/clinical/clinical.service.ts` | Backend (Clinical) | Modified | Bổ sung hàm `getPatientPhrByAppointment` kiểm soát quyền bác sĩ ca khám và đọc PHR bệnh nhân từ DB thật |
| 2 | `server/src/modules/clinical/clinical.controller.ts` | Backend (Clinical) | Modified | Khai báo endpoint `GET appointments/:appointmentId/patient-phr` có bảo vệ `@Roles(Role.DOCTOR)` |
| 3 | `client/src/app/core/services/clinical.service.ts` | Frontend (Core) | Modified | Thêm phương thức gọi API `getPatientPhrByAppointment` |
| 4 | `client/src/app/features/doctor/pages/consultation/consultation.page.ts` | Frontend (Doctor UI) | Modified | Bỏ `getMyPhr()`, tích hợp `loadPatientPhr(appointmentId)` theo ngữ cảnh ca khám |
| 5 | `client/src/app/features/doctor/pages/consultation/consultation.page.spec.ts` | Frontend (Test) | Modified | Bổ sung unit tests kiểm chứng hiển thị PHR theo appointment context |
| 6 | `server/test/consultation-phr-access.integration.ts` | Backend (Integration Test) | **Created** | Bộ test tích hợp toàn diện 13 kịch bản chạy trên PostgreSQL thật `ehealth_phr_test_db` |

*Ghi chú:* Không có migration mới nào được tạo vì cấu trúc database và quan hệ giữa `users`, `doctors`, `appointments`, `personal_health_profiles` đã đầy đủ.

---

## 5. KẾT QUẢ KIỂM THỬ XÁC NHẬN NỘI BỘ (TEST EXECUTION & EVIDENCE)

### 5.1. Backend Real Database Integration Test Suite
- **Tập tin kiểm thử:** `server/test/consultation-phr-access.integration.ts`
- **Database thực thi:** `postgresql://postgres:postgres_password@localhost:5432/ehealth_phr_test_db`
- **Lệnh thực thi chính xác:**
  ```powershell
  $env:TEST_DATABASE_URL="postgresql://postgres:postgres_password@localhost:5432/ehealth_phr_test_db"; npm --prefix server run test:integration -- test/consultation-phr-access.integration.ts
  ```
- **Thời gian thực thi:** 10.516 s
- **Exit Code:** `0`
- **Kết quả tổng quát:** **13/13 PASSED (100%)**

#### Chi tiết 13 kịch bản kiểm thử:
1. **A. Positive Tests (Truy cập hợp lệ):**
   - `TC-PHR-005-P01`: Bác sĩ 1 truy cập Appointment 1 của Bệnh nhân 1 $\rightarrow$ HTTP 200 OK. Phản hồi đầy đủ thông tin nhân khẩu học (Lê Văn Một, Nam, 1992-04-12) và PHR (Nhóm máu B+, Dị ứng Penicillin, Hen phế quản, Mổ ruột thừa). (**PASS**)
   - `TC-PHR-005-P02`: Bác sĩ 2 truy cập Appointment 2 của Bệnh nhân 2 $\rightarrow$ HTTP 200 OK. Phản hồi đúng thông tin Bệnh nhân 2 (Phạm Thị Hai, O+, Dị ứng Aspirin, Tăng huyết áp). (**PASS**)
2. **B. Authorization Tests (Bác sĩ khác không có quyền):**
   - `TC-PHR-005-A01`: Bác sĩ 1 gọi PHR của Appointment 2 (thuộc Bác sĩ 2) $\rightarrow$ HTTP 403 Forbidden, `code: "UNAUTHORIZED_DOCTOR"`. Hoàn toàn không rò rỉ dữ liệu PHR của Bệnh nhân 2. (**PASS**)
   - `TC-PHR-005-A02`: Bác sĩ 2 gọi PHR của Appointment 1 (thuộc Bác sĩ 1) $\rightarrow$ HTTP 403 Forbidden, `code: "UNAUTHORIZED_DOCTOR"`. Hoàn toàn không rò rỉ dữ liệu PHR của Bệnh nhân 1. (**PASS**)
3. **C. Patient Isolation Tests (Cách ly dữ liệu bệnh nhân):**
   - `TC-PHR-005-I01`: Phản hồi của Appointment 1 chỉ chứa dữ liệu Bệnh nhân 1, không chứa bất kỳ trường nào của Bệnh nhân 2. (**PASS**)
   - `TC-PHR-005-I02`: Phản hồi của Appointment 2 chỉ chứa dữ liệu Bệnh nhân 2, không chứa bất kỳ trường nào của Bệnh nhân 1. (**PASS**)
4. **D. Security & Input Validation Tests:**
   - `TC-PHR-005-S01`: Yêu cầu không có Authorization Bearer token $\rightarrow$ HTTP 401 Unauthorized. (**PASS**)
   - `TC-PHR-005-S02`: Token có vai trò `ROLE_PATIENT` gọi vào endpoint buồng khám $\rightarrow$ HTTP 403 Forbidden (RolesGuard). (**PASS**)
   - `TC-PHR-005-S03`: Token có vai trò `ROLE_ADMIN` gọi vào endpoint buồng khám $\rightarrow$ HTTP 403 Forbidden. (**PASS**)
   - `TC-PHR-005-S04`: Gọi với mã cuộc hẹn không tồn tại (`00000000-0000-0000-0000-000000000000`) $\rightarrow$ HTTP 404 Not Found (`code: "APPOINTMENT_NOT_FOUND"`). (**PASS**)
   - `TC-PHR-005-S05`: Gọi với UUID sai cú pháp (`not-a-valid-uuid`) $\rightarrow$ HTTP 400 Bad Request (`ParseUUIDPipe`). (**PASS**)
5. **E. Regression Tests:**
   - `TC-PHR-005-R01`: Bệnh nhân 1 vẫn xem được hồ sơ sức khỏe cá nhân của mình qua `GET /api/v1/phr/me` $\rightarrow$ HTTP 200 OK. (**PASS**)
   - `TC-PHR-005-R02`: Bệnh nhân 1 cập nhật địa chỉ và bệnh mạn tính qua `PUT /api/v1/phr/me` $\rightarrow$ HTTP 200 OK; sau đó Bác sĩ 1 mở ca khám lập tức thấy thông tin cập nhật mới nhất từ CSDL PostgreSQL. (**PASS**)

---

### 5.2. Frontend Unit & Component Binding Test Suite
- **Tập tin kiểm thử:** `client/src/app/features/doctor/pages/consultation/consultation.page.spec.ts`
- **Lệnh thực thi chính xác:**
  ```powershell
  npm --prefix client test -- --watch=false --include="**/consultation.page.spec.ts"
  ```
- **Exit Code:** `0`
- **Kết quả:** **11/11 PASSED (100%)**
- **Điểm nhấn kịch bản:**
  - `TC-UI-CONSULT-01`: Component khởi tạo và gọi đúng `clinicalService.getPatientPhrByAppointment('app-123')` từ ngữ cảnh URL route param.
  - `TC-PHR-005-UI`: Giao diện buồng khám render chính xác các thẻ thông tin PHR: Họ tên bệnh nhân, Năm sinh, Giới tính, Nhóm máu (A+), Dị ứng (Penicillin, Aspirin), Bệnh mạn tính (Hen phế quản), Tiền sử phẫu thuật (Chưa phẫu thuật).

---

### 5.3. Kiểm thử hồi quy các phân hệ liên quan (Related Regression Suites)

1. **PHR Baseline Integration Suite (TC-PHR-001 .. TC-PHR-004):**
   - **Lệnh:** `$env:TEST_DATABASE_URL="postgresql://postgres:postgres_password@localhost:5432/ehealth_phr_test_db"; npm --prefix server run test:integration -- test/phr.integration.ts`
   - **Kết quả:** **4/4 PASSED (100%)** (Exit code: 0).
   - Xác nhận: Toàn bộ chức năng cập nhật nhân khẩu học, nhóm máu, dị ứng, bệnh mạn tính của bệnh nhân hoạt động ổn định, không bị ảnh hưởng.
2. **Clinical Core Module Suite (SRS-DOC-03, EMR, ICD-10, e-Prescription):**
   - **Lệnh:** `npm --prefix server test test/clinical.spec.ts`
   - **Kết quả:** **32/32 PASSED (100%)** (Exit code: 0).
   - Xác nhận: Toàn bộ logic tính BMI, kiểm tra an toàn thuốc, giới hạn đơn thuốc mạn tính 30 ngày, khóa bệnh án 24h hoạt động chính xác.
3. **Build Check Toàn diện:**
   - `npm --prefix server run build`: **SUCCESS (Exit code: 0)**
   - `npm --prefix client run build`: **SUCCESS (Exit code: 0)**

---

## 6. SO SÁNH TRƯỚC VÀ SAU KHẮC PHỤC (BEFORE VS AFTER MATRIX)

| Tiêu chí | Trước Remediation (Defect) | Sau Remediation (Fixed) |
| :--- | :--- | :--- |
| **Endpoint bác sĩ gọi** | `GET /api/v1/phr/me` | `GET /api/v1/clinical/appointments/:appointmentId/patient-phr` |
| **Nguồn dữ liệu trả về** | Hồ sơ của chính bác sĩ đang đăng nhập (hoặc HTTP 403 do role guard) | Hồ sơ PHR của đúng bệnh nhân trong ca khám |
| **Kiểm soát phân quyền** | Không gắn với ca khám, không xác định bác sĩ phụ trách | Bắt buộc bác sĩ phụ trách ca khám (`UNAUTHORIZED_DOCTOR` nếu xem chéo) |
| **Chống lộ lọt dữ liệu (IDOR)** | Có nguy cơ nếu cho phép truyền `patientId` | Miễn nhiễm IDOR (chỉ truyền `appointmentId` hợp lệ được phân công) |
| **UI Consultation** | Hiển thị sai thông tin bác sĩ vào ô bệnh nhân | Hiển thị 100% chính xác thông tin tiền sử PHR bệnh nhân |
| **Audit Logging** | Không ghi nhận kiểm toán ca khám | Tự động ghi nhật ký `VIEW_EMR` với metadata `view: 'PATIENT_PHR'` |

---

## 7. GIỚI HẠN CÒN LẠI & TUÂN THỦ KỶ LUẬT (LIMITATIONS & COMPLIANCE)

1. **Tuân thủ kỷ luật tuyệt đối:**
   - **KHÔNG** chỉnh sửa file Excel/RTM Card 1.5 (`EHealthcare_Card_1.5_Test_Matrix_v2.xlsx`).
   - **KHÔNG** tự ý cập nhật trạng thái của `TC-PHR-005` thành PASS trong RTM trước khi người dùng review và phê duyệt.
   - **KHÔNG** thực hiện git commit, git push hoặc mở Pull Request.
2. **Trạng thái Git:**
   - Đang ở branch riêng: `feature/fix-phr-005-doctor-access`.
   - Toàn bộ thay đổi mã nguồn và test files đang được lưu giữ an toàn trong working directory.
3. **Sẵn sàng cho Retest & Acceptance:**
   - Defect `DEFECT-PHR-005-DOCTOR-ACCESS` đã được giải quyết triệt để về mặt kỹ thuật.
   - Khi được phê duyệt, `TC-PHR-005` đủ điều kiện được chuyển sang trạng thái **PASS** chính thức trong RTM tổng.
