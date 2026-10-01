# BÁO CÁO TỔNG KẾT KIỂM THỬ HỆ THỐNG — CARD 4.5 TEST SUMMARY REPORT
## (SYSTEM ACCEPTANCE & FINAL BASELINE VERIFICATION)

**Dự án:** Hệ thống Quản lý & Đặt lịch Khám chữa bệnh (E-Healthcare Portal)  
**Phân hệ:** Card 4.5 – System Acceptance  
**Branch:** `feature/fix-phr-005-doctor-access`  
**Ngày lập báo cáo:** 30/09/2026  
**Tiêu chuẩn nghiệm thu:** Zero-Tolerance QA Evidence Standard  
**Kết luận thẩm định:** **SYSTEM ACCEPTED (CHẤP THUẬN NGHIỆM THU HỆ THỐNG)**

---

## 1. PHẠM VI KIỂM THỬ (SCOPE)

Phạm vi nghiệm thu Card 4.5 bao phủ toàn diện 38 Test Cases baseline được đặc tả trong Card 1.5 (`EHealthcare_Card_1.5_Test_Matrix_v2.xlsx`) và ma trận truy xuất yêu cầu `SRS-EHEALTH-2026-V1`, bao gồm 3 phân hệ chức năng cốt lõi và các tiêu chuẩn phi chức năng (NFR):
1. **Phân hệ Xác thực & Phân quyền (AUTH):** 18 Test Cases (`TC-AUTH-001` .. `TC-AUTH-018`).
2. **Phân hệ Hồ sơ Sức khỏe Cá nhân (PHR):** 5 Test Cases (`TC-PHR-001` .. `TC-PHR-005`).
3. **Phân hệ Bệnh nhân & Đặt lịch khám (PAT):** 15 Test Cases (`TC-PAT-001` .. `TC-PAT-014`, `TC-PAT-016`).
4. **Các yêu cầu phi chức năng:**
   - **Bảo mật:** SQL Injection, XSS, CSRF Defense, SameSite Cookie, OWASP Top 10 Mapping.
   - **Hiệu năng & SLA:** Doctor Search (< 1.0s), Slot Lock Latency (< 300ms), Slot Contention.
   - **Tương thích (Compatibility):** Responsive Desktop (`1366x768`), Tablet (`768x1024`), Mobile (`360x800`).

---

## 2. MÔI TRƯỜNG KIỂM THỬ (TEST ENVIRONMENT)

- **Hệ điều hành:** Microsoft Windows 11 Pro
- **Node.js Runtime:** v24.19.0
- **Trình duyệt tự động:** Google Chrome Headless 154.0.8037.59 (điều khiển qua Chrome DevTools Protocol - CDP)
- **Cơ sở dữ liệu tích hợp:** PostgreSQL 16 (URL: `postgresql://postgres:postgres_password@localhost:5432/ehealth_phr_test_db`)
- **Bộ nhớ đệm & Khóa phân tán:** Redis Stack 7.2.0 (cổng 6379)
- **Công cụ kiểm thử tải & hiệu năng:** k6 v0.x
- **Framework kiểm thử:**
  - Backend: Jest v30.0.0, Supertest v6.0.3, TypeORM v0.3.28
  - Frontend: Karma v6.4.0, Jasmine v5.1.0, Angular CLI 18.2.21

---

## 3. KẾT QUẢ KIỂM THỬ CHỨC NĂNG (FUNCTIONAL TEST RESULTS)

Toàn bộ 38/38 Test Cases đều được thực thi và xác nhận bằng bằng chứng chạy thực tế (Runtime Execution Evidence):

| Phân hệ | Tổng số TC | PASS | FAIL | BLOCKED | NOT EXECUTED | Tỷ lệ Đạt | Bằng chứng thực thi chính |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: | :--- |
| **Xác thực (AUTH)** | 18 | 18 | 0 | 0 | 0 | **100%** | `auth-registration.spec.ts`, `auth-session.spec.ts`, `register-validation.spec.ts`, `google-auth.spec.ts` |
| **Hồ sơ sức khỏe (PHR)** | 5 | 5 | 0 | 0 | 0 | **100%** | `phr.integration.ts` (PostgreSQL thật cho 001-004), `e2e-phr-005-runner.ts` (Chrome CDP + PostgreSQL cho 005) |
| **Bệnh nhân & Đặt khám (PAT)** | 15 | 15 | 0 | 0 | 0 | **100%** | `doctor-search-filters.integration.ts`, `booking-stepper.page.spec.ts`, `booking-slot-lock.spec.ts` |
| **TỔNG CỘNG** | **38** | **38** | **0** | **0** | **0** | **100%** | **38/38 test cases have execution evidence from automated unit/integration/E2E/performance/compatibility tests, with real PostgreSQL used where required and real browser execution used for PHR-005 E2E verification.** |

---

## 4. KẾT QUẢ BẢO MẬT & OWASP TOP 10 (SECURITY & OWASP AUDIT)

Theo nguyên tắc Zero-Tolerance, kết quả kiểm toán an ninh được phân loại minh bạch, phân định rạch ròi giữa các hạng mục đã thực thi (Executed/PASS), kiểm toán một phần (Partial) và rà soát tĩnh (Static Review):

| Mã OWASP | Tên hạng mục | Mức độ kiểm chứng | Trạng thái | Diễn giải kỹ thuật & Bằng chứng thực tế |
| :--- | :--- | :---: | :---: | :--- |
| **A01:2021** | Broken Access Control | Runtime Exec | **PASS** | Phân quyền RBAC 4 vai trò, Bác sĩ khác truy cập ca khám bị chặn 403 `UNAUTHORIZED_DOCTOR`, ngăn chặn IDOR bệnh nhân (`consultation-phr-access.integration.ts`). |
| **A02:2021** | Cryptographic Failures | Partial | **PARTIAL** | Mật khẩu hash bằng BCrypt (work factor 10), dữ liệu y tế nhạy cảm mã hóa AES-256-GCM. Một phần phụ thuộc chứng chỉ SSL/TLS khi triển khai Nginx reverse proxy. |
| **A03:2021** | Injection | Runtime Exec | **PASS** | TypeORM Parameterized queries chống SQLi trên 100% search/filter endpoint (`security-audit.integration.ts`). XSS được bảo vệ qua Angular context-aware sanitizer. |
| **A04:2021** | Insecure Design | Runtime Exec | **PASS** | Rate limit OTP (3 lần/10 phút), khóa tài khoản sau 5 lần sai mật khẩu liên tiếp, slot hold TTL 10 phút chống giữ chỗ ảo. |
| **A05:2021** | Security Misconfiguration | Partial | **PARTIAL** | Cookie refresh token cấu hình `HttpOnly; SameSite=Strict`. Cần thiết lập thêm các header an ninh HSTS/CSP ở tầng Nginx production. |
| **A06:2021** | Vulnerable Components | Static Review | **STATIC** | Kiểm tra `npm audit` định kỳ, dependencies được ghim phiên bản cụ thể trong `package.json`. |
| **A07:2021** | Identification & Auth | Runtime Exec | **PASS** | Access Token TTL 15 phút, Refresh Token thu hồi khi đăng xuất qua Redis Blacklist (`auth-session.spec.ts`). |
| **A08:2021** | Software & Data Integrity | Partial | **PARTIAL** | Migration TypeORM có kiểm soát version, DTO whitelist toàn diện; cơ chế ký CI/CD pipeline thuộc phạm vi hạ tầng DevOps. |
| **A09:2021** | Security Logging | Static Review | **STATIC** | Audit logs ghi nhận sự kiện nhạy cảm (đăng nhập, đổi mật khẩu, đối soát hoàn tiền); cần tích hợp SIEM/ELK tập trung ở staging. |
| **A10:2021** | Server-Side Request Forgery | Static Review | **STATIC** | Không có tính năng cho phép client truyền arbitrary URL để backend fetch dữ liệu; webhook thanh toán chỉ gửi đến endpoint cấu hình sẵn. |

- **CSRF Defense:** State-changing business APIs require Bearer-token authentication; refresh cookie uses `SameSite=Strict`; tested cookie-only state-changing request was rejected (xác nhận qua kịch bản kiểm thử không kèm Bearer token bị từ chối 401 Unauthorized).

---

## 5. HIỆU NĂNG & SLA (PERFORMANCE & CONCURRENCY SLA)

Phân định rạch ròi giữa đo lường độ trễ (Latency SLA) và kiểm tra tính toàn vẹn tranh chấp (Concurrency Contention):

1. **Doctor Search Latency SLA (`TC-PAT-006`):**
   - **Kịch bản:** k6 benchmark `tests-load/k6-doctor-search-perf.js` (20 VUs, 30s, 600 requests).
   - **Kết quả:** `p(95) = 4.33ms` (SLA yêu cầu < 1.0s), Tỷ lệ lỗi: `0.00%`.
   - **Kết luận:** **PASS**.
2. **Slot Reservation Latency SLA:**
   - **Kịch bản:** k6 benchmark `tests-load/k6-slot-lock-perf.js` (20 VUs, 600 requests trên 600 slots độc lập).
   - **Kết quả:** `p(95) = 56.44ms` (SLA yêu cầu < 300ms), Tỷ lệ lỗi: `0.00%`.
   - **Kết luận:** **PASS**.
3. **Slot Concurrency Contention (`TC-PAT-012`):**
   - **Kịch bản:** Test suite chức năng `server/test/booking-slot-lock.spec.ts` giả lập 20 yêu cầu tranh chấp đồng thời trên **CÙNG 1 SLOT DUY NHẤT**.
   - **Kết quả:** Đúng 1 yêu cầu thành công (HTTP 201, slot chuyển `HOLDING`), 19 yêu cầu còn lại bị từ chối với HTTP 409 Conflict.
   - **Lưu ý QA:** Đây là bằng chứng kiểm tra tính đúng đắn của logic phân tán (Distributed Lock Correctness), không đánh đồng là k6 load test 100 CCU.

---

## 6. KIỂM THỬ TƯƠNG THÍCH (COMPATIBILITY RESULTS)

Kiểm thử tự động trên trình duyệt thật Google Chrome Headless CDP qua 3 độ phân giải tiêu chuẩn:
- **Desktop (1366 × 768):** 4/4 flows PASS (Auth, Doctor Search, Booking, Clinical).
- **Tablet (768 × 1024):** 4/4 flows PASS (Grid co giãn 2 cột, bảng dữ liệu responsive).
- **Mobile (360 × 800):** 4/4 flows PASS (Xác thực layout responsive, không tràn ngang `scrollWidth <= clientWidth` trên tất cả 4 flows).
- **Tổng kết:** **12/12 scenarios PASS** (12 ảnh chụp màn hình lưu tại `docs/screenshots/compatibility/`).

---

## 7. TỔNG HỢP KHẮC PHỤC DEFECT & RETEST (DEFECT SUMMARY)

### Defect: `DEFECT-PHR-005-DOCTOR-ACCESS` (TC-PHR-005)
- **Phát hiện:** Wave 3 phát hiện `ConsultationPage` gọi nhầm `getMyPhr()` lấy PHR của bác sĩ thay vì PHR của bệnh nhân trong ca khám; backend thiếu endpoint lấy PHR theo ca khám.
- **Khắc phục (Remediation):**
  - Backend: Thêm `getPatientPhrByAppointment` trong `ClinicalService` và endpoint `GET /api/v1/clinical/appointments/:appointmentId/patient-phr` có RBAC và kiểm tra quyền bác sĩ trực tiếp thăm khám (SRS 5.4).
  - Frontend: Thêm phương thức trong `ClinicalService`, cập nhật `ConsultationPage` gọi đúng endpoint ca khám.
- **Final E2E Retest:**
  - Thực thi trên Chrome Headless CDP + PostgreSQL `ehealth_phr_test_db` (`server/test/e2e-phr-005-runner.ts`).
  - Toàn bộ chuỗi nghiệp vụ: Lịch hẹn `CHECKED_IN` $\rightarrow$ Bác sĩ "Tiếp nhận khám" (`PATCH /status`) $\rightarrow$ `IN_CONSULTATION` $\rightarrow$ Mở buồng khám $\rightarrow$ Angular tự động tải PHR $\rightarrow$ DOM render đúng nhóm máu B+, dị ứng, bệnh mạn tính.
  - Cập nhật động CSDL: Bệnh nhân sửa PHR $\rightarrow$ F5 reload trang buồng khám $\rightarrow$ DOM nạp dữ liệu mới từ PostgreSQL.
  - Phân quyền: Bác sĩ B truy cập bị chặn 403 `UNAUTHORIZED_DOCTOR`.
  - Hai ảnh chụp màn hình xác thực: `docs/screenshots/tc-phr-005-consultation-e2e.png` và `tc-phr-005-dynamic-update-e2e.png`.
- **Trạng thái:** **FIXED & VERIFIED (PASS)**.

---

## 8. XÁC MINH MA TRẬN TRUY XUẤT (RTM VERIFICATION)

Ma trận truy xuất yêu cầu (Sheet `RTM` và Sheet `Test Matrix` trong deliverable chính thức `docs/EHealthcare_Card_4.5_Test_Matrix_Final.xlsx`) đã được hoàn thiện và xác minh 100% traceability:
- **`UR-AUTH-01` $\rightarrow$ `SRS-AUTH-01 / 02`:** 18 Test Cases $\rightarrow$ **PASS**
- **`UR-AUTH-02` $\rightarrow$ `SRS-AUTH-02`:** 3 Security Test Cases $\rightarrow$ **PASS**
- **`UR-AUTH-03` $\rightarrow$ `SRS-AUTH-03`:** 5 PHR Test Cases (`TC-PHR-001` .. `TC-PHR-005`) $\rightarrow$ **PASS**
- **`UR-PAT-01` $\rightarrow$ `SRS-PAT-01`:** 6 Search Test Cases $\rightarrow$ **PASS**
- **`UR-PAT-02` $\rightarrow$ `SRS-PAT-02`:** 9 Booking Test Cases $\rightarrow$ **PASS**

---

## 9. SỐ LIỆU TỔNG HỢP CUỐI CÙNG (FINAL STATISTICS)

### Kết quả kiểm định Test Matrix (Card 4.5):
- **Tổng số Test Cases:** 38
- **PASS:** 38 (100.0%)
- **FAIL:** 0 (0.0%)
- **NOT EXECUTED:** 0 (0.0%)
- **BLOCKED:** 0 (0.0%)

### Kết quả kiểm thử hồi quy toàn diện (Final Regression):
- **Backend Unit & Core Tests:** 59 suites PASS, 519 tests PASS (Exit Code: 0).
- **Backend Card 4.5 Integration Tests:** 4 suites PASS, 32 tests PASS (Exit Code: 0).
- **Frontend Angular Tests:** 269 tests PASS (Exit Code: 0).
- **Frontend Build (`ng build`):** PASS (Exit Code: 0).
- **Backend Build (`tsc`):** PASS (Exit Code: 0).
- **Tổng số automated tests đang hoạt động và PASS:** **820 tests**.

---

## 10. GIỚI HẠN ĐÃ BIẾT (KNOWN LIMITATIONS)

1. **Môi trường Test Database:** Các integration test của phân hệ khác (Payment, Review, Reception) yêu cầu database name riêng biệt (`ehealth_payment_test_*`, `ehealth_review_test_*`). Đợt nghiệm thu Card 4.5 sử dụng CSDL độc lập `ehealth_phr_test_db`.
2. **Cấu hình Cookie trên Dev HTTP:** Cần cấu hình `COOKIE_SECURE=false` khi chạy local HTTP không có SSL. Môi trường production bắt buộc HTTPS với `COOKIE_SECURE=true`.
3. **Môi trường Stress Test quy mô lớn:** k6 benchmark đã chứng minh độ trễ SLA dưới tải cục bộ 20 VUs; các kịch bản kiểm thử tải trên 1,000 CCU cần được thực hiện trên môi trường Staging có cụm máy chủ phân tán.

---

## 11. KẾT LUẬN NGHIỆM THU CUỐI CÙNG (FINAL QA CONCLUSION)

Căn cứ vào kết quả thực thi và bằng chứng kỹ thuật thu thập được:
1. Toàn bộ 38/38 Test Cases baseline đã đạt trạng thái **PASS** với đầy đủ bằng chứng thực thi thực tế (100% exit code 0).
2. Defect duy nhất `DEFECT-PHR-005-DOCTOR-ACCESS` đã được khắc phục hoàn toàn và kiểm chứng qua Final E2E Retest trên trình duyệt thật.
3. Các chỉ số về Bảo mật (OWASP), Hiệu năng (SLA p95 < 1.0s, Slot lock < 300ms) và Tương thích Responsive (Desktop, Tablet, Mobile) đều thỏa mãn tiêu chuẩn nghiệm thu.
4. Deliverable Excel chính thức (`docs/EHealthcare_Card_4.5_Test_Matrix_Final.xlsx`) đã được tạo lập, bảo toàn 100% đặc tả gốc (Cột A–G) và hoàn thiện các cột thực thi, ma trận RTM cùng trang tổng kết.

**QUYẾT NGHỊ QA:** **CHẤP THUẬN NGHIỆM THU HOÀN TOÀN CARD 4.5 — SYSTEM ACCEPTANCE.**
