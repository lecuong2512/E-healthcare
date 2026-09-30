# BÁO CÁO FINAL E2E RETEST: TC-PHR-005 (SRS-EHEALTH-2026-V1)

**Dự án:** E-Healthcare Portal  
**Test Case ID:** `TC-PHR-005`  
**Defect ID:** `DEFECT-PHR-005-DOCTOR-ACCESS`  
**Branch thực thi:** `feature/fix-phr-005-doctor-access`  
**Ngày thực hiện:** 30/09/2026  
**Tiêu chuẩn nghiệm thu:** Zero-Tolerance Real Browser & Real Database Runtime Evidence  
**Kết quả chung:** **PASS (100% CÁC BƯỚC VÀ RÀNG BUỘC NGHIỆP VỤ ĐẠT)**  
**Trạng thái Defect:** **FIXED & VERIFIED**

---

## 1. TỔNG QUAN & KẾT QUẢ NGHIỆM THU

Theo yêu cầu nghiêm ngặt từ tài liệu đặc tả nghiệp vụ `SRS-EHEALTH-2026-V1`, đợt kiểm thử này không chỉ xác nhận logic backend hay đơn vị frontend, mà là **FINAL END-TO-END RETEST** được thực thi trên môi trường trình duyệt thật Google Chrome kết nối trực tiếp đến Frontend Angular và Backend NestJS đang giao tiếp với cơ sở dữ liệu thật PostgreSQL (`ehealth_phr_test_db`).

```
+---------------------------------------------------------------------------------------------------+
|                                 CHUỖI NGHIỆP VỤ E2E HOÀN CHỈNH                                    |
|                                                                                                   |
|  [Bệnh nhân A]              [PostgreSQL Test DB]          [Bác sĩ A]            [Chrome Headless] |
|   Lê Văn Một                  ehealth_phr_test_db      BS.CKII Lê Cường          Angular Buồng Khám|
|       |                              |                         |                         |        |
|       |--- 1. Cập nhật PHR ban đầu ->|                         |                         |        |
|       |    (B+, Hen phế quản, ...)   |                         |                         |        |
|       |                              |                         |                         |        |
|       |--- 2. Lịch hẹn CHECKED_IN -->|                         |                         |        |
|                                      |                         |                         |        |
|                                      |<-- 3. Tiếp nhận khám ---|                         |        |
|                                      |    (PATCH /status)      |                         |        |
|                                      |    -> IN_CONSULTATION   |                         |        |
|                                      |                         |                         |        |
|                                      |<------- 4. Mở buồng khám /doctor/consultation/:id -------| |
|                                      |         Angular gọi GET /appointments/:id/patient-phr    | |
|                                      |----------------- 5. Trả về PHR Bệnh nhân A ------------->| |
|                                      |                                  DOM Render: Tự động nạp |
|                                      |                                  Nhóm máu: B+, Dị ứng    |
|                                      |                                                          |
|       |--- 6. PUT /phr/me mới ------>|                                                          |
|       |    (AB+, Cephalosporin, ...) |                                                          |
|       |                              |<------- 7. F5 Browser Reload ----------------------------| |
|       |                              |----------------- 8. Trả về PHR cập nhật ---------------->| |
|       |                              |                                  DOM Render: Load động   |
|       |                              |                                  Nhóm máu: AB+, Dị ứng   |
|                                      |                                                          |
|                                      |<-- 9. Bác sĩ B truy cập trái phép -----------------------| |
|                                      |    (403 UNAUTHORIZED_DOCTOR, 0 byte dữ liệu lộ)          |
+---------------------------------------------------------------------------------------------------+
```

---

## 2. MA TRẬN ĐỐI CHIẾU NGHIỆP VỤ SRS-EHEALTH-2026-V1

| Mã điều khoản SRS | Quy định chi tiết trong SRS | Bằng chứng kiểm thử thực tế E2E | Kết quả |
| :--- | :--- | :--- | :---: |
| **SRS-AUTH-03** | Bệnh nhân cập nhật PHR bất kỳ lúc nào. PHR phải tự động hiển thị trên màn hình tiếp nhận của Bác sĩ khi bắt đầu ca khám. | Khi Bác sĩ A mở `/doctor/consultation/:appointmentId`, Angular tự động gọi API và trích xuất dữ liệu PHR hiển thị ngay trên section `.bg-amber-50` mà bác sĩ không cần thao tác thủ công. | **PASS** |
| **SRS-DOC-02** | Bác sĩ nhấn "Tiếp nhận khám". Hệ thống chuyển trạng thái lịch hẹn sang `IN_CONSULTATION`. | Bác sĩ gọi `PATCH /api/v1/appointments/:id/status` với body `{"status":"IN_CONSULTATION"}` $\rightarrow$ HTTP 200, kiểm tra trực tiếp PostgreSQL xác nhận `status = 'IN_CONSULTATION'`. | **PASS** |
| **SRS-DOC-03** | Tiền điều kiện: ca khám đang `IN_CONSULTATION`. Bệnh sử & tiền sử bệnh phải được tự động nạp sẵn từ PHR của bệnh nhân để bác sĩ tham khảo. | Tiền điều kiện thỏa mãn trước khi mở giao diện buồng khám. Tiền sử bệnh, nhóm máu, dị ứng, bệnh mạn tính, phẫu thuật hiển thị đầy đủ trên giao diện. | **PASS** |
| **SRS Mục 5.4** | Bác sĩ chỉ được xem dữ liệu của bệnh nhân mình đang trực tiếp thăm khám (Data Isolation & Strict Assignment). | Bác sĩ B (không phụ trách lịch hẹn) gọi endpoint lấy PHR của ca khám $\rightarrow$ bị backend chặn với HTTP 403 `UNAUTHORIZED_DOCTOR`, không rò rỉ bất kỳ dữ liệu bệnh nhân nào. | **PASS** |

---

## 3. THÔNG SỐ MÔI TRƯỜNG KIỂM THỬ THỰC TẾ

- **Hệ điều hành:** Microsoft Windows 11 Pro
- **Node.js Runtime:** v24.19.0
- **Trình duyệt thực thi:** Google Chrome Headless 154.0.8037.59 (điều khiển qua Chrome DevTools Protocol - CDP)
- **Cơ sở dữ liệu lưu trữ:** PostgreSQL 16 (URL: `postgresql://postgres:postgres_password@localhost:5432/ehealth_phr_test_db`)
- **Backend Service:** NestJS 11 chạy tại `http://127.0.0.1:3333` kết nối trực tiếp `DataSource` thật của TypeORM vào `ehealth_phr_test_db`.
- **Frontend Service:** Angular 19 Client bundle (`client/dist/ehealth-web-client/browser`) chạy tại `http://127.0.0.1:4200` với reverse proxy `/api/v1` trỏ thẳng sang cổng 3333.
- **Kịch bản thực thi:** `server/test/e2e-phr-005-runner.ts`
- **Mã thoát (Exit Code):** `0` (Hoàn thành 100% không có cảnh báo hay lỗi).

---

## 4. CHI TIẾT TỪNG BƯỚC THỰC THI & EVIDENCE

### Bước 1: Nghiệp vụ "Tiếp nhận khám" và chuyển đổi trạng thái (SRS-DOC-02)

1. **Khởi tạo dữ liệu:**
   - **Bệnh nhân A:** Lê Văn Một (`11111111-1111-4111-8111-111111111111`), email: `patient.a@hospital.vn`.
   - **Bác sĩ A:** BS.CKII Lê Cường (`d1111111-2222-4111-8111-222222222222`), email: `doctor.a@hospital.vn`.
   - **Lịch hẹn 1:** Mã `APT-E2E-2026-001` (`b1111111-1111-4111-8111-111111111111`), trạng thái ban đầu: `CHECKED_IN`.
2. **Thực thi nghiệp vụ Bác sĩ nhấn "Tiếp nhận khám":**
   - Bác sĩ A đăng nhập nhận Bearer JWT Token.
   - Gửi yêu cầu chuyển trạng thái:
     ```http
     PATCH /api/v1/appointments/b1111111-1111-4111-8111-111111111111/status HTTP/1.1
     Authorization: Bearer <Doctor_A_JWT>
     Content-Type: application/json

     {"status": "IN_CONSULTATION"}
     ```
   - **Kết quả HTTP:** `200 OK`, body: `{"id":"b1111111-...","status":"IN_CONSULTATION"}`.
3. **Xác minh trực tiếp CSDL PostgreSQL:**
   - Truy vấn: `SELECT id, status, appointment_code FROM appointments WHERE id = 'b1111111-...'`
   - Kết quả: `status = 'IN_CONSULTATION'`.
   - **Kết luận:** Đạt SRS-DOC-02.

---

### Bước 2: Kiểm tra tiền điều kiện màn hình khám (SRS-DOC-03)

- Tiền điều kiện `appointment.status === 'IN_CONSULTATION'` được đảm bảo 100% trước khi cho phép bác sĩ vào buồng khám.
- **Kết luận:** Đạt SRS-DOC-03 tiền điều kiện.

---

### Bước 3: Mở trình duyệt Chrome thật, điều hướng buồng khám & Tự động nạp PHR (SRS-AUTH-03 & SRS-DOC-03)

1. **Thực thi trên Chrome Headless (CDP):**
   - Điều hướng tới `http://127.0.0.1:4200/login`.
   - Bác sĩ A điền tài khoản `doctor.a@hospital.vn` / `DoctorPass123!` và gửi form.
   - Nhận phiên đăng nhập hợp lệ (`200 OK`), HttpOnly refresh cookie được thiết lập.
   - Điều hướng tới buồng khám: `http://127.0.0.1:4200/doctor/consultation/b1111111-1111-4111-8111-111111111111`.
2. **Bắt gói tin mạng trình duyệt thực tế (Network Interception):**
   ```http
   GET http://127.0.0.1:4200/api/v1/clinical/appointments/b1111111-1111-4111-8111-111111111111/patient-phr
   HTTP/1.1 200 OK
   Content-Type: application/json; charset=utf-8

   {
     "fullName": "Lê Văn Một",
     "gender": "MALE",
     "dateOfBirth": "1992-04-12",
     "bloodType": "B+",
     "allergies": "Penicillin, Sulfonamide",
     "chronicDiseases": "Hen phế quản mãn tính",
     "surgeryHistory": "Mổ ruột thừa năm 2018"
   }
   ```
3. **Trích xuất dữ liệu DOM trực tiếp từ trang web:**
   - **Tiêu đề bệnh nhân (`header h1`):** `"Lê Văn Một · Nam · 1992"`
   - **Huy hiệu trạng thái ca khám:** `"Đang khám"` (`.bg-purple-100`)
   - **Mã hồ sơ ca khám (`p.font-mono`):** `"Mã hồ sơ: b1111111-1111-4111-8111-111111111111"`
   - **Nội dung thẻ tiền sử PHR (`section.bg-amber-50`):**
     `"Thông tin tiền sử từ PHR Nhóm máu: B+ · Dị ứng: Penicillin, Sulfonamide · Bệnh mạn tính: Hen phế quản mãn tính Tiền sử phẫu thuật: Mổ ruột thừa năm 2018"`
4. **Ảnh chụp màn hình thực tế (Screenshot 1):**
   - Đường dẫn: `docs/screenshots/tc-phr-005-consultation-e2e.png`
   
![Giao diện Buồng khám Bác sĩ tự động nạp PHR](screenshots/tc-phr-005-consultation-e2e.png)

---

### Bước 4: Kiểm chứng tính chất tải động từ CSDL PostgreSQL (Dynamic DB Update)

Để loại trừ hoàn toàn khả năng dữ liệu bị hardcode hoặc mock tĩnh trong frontend/backend, kịch bản tiến hành cập nhật động trên CSDL thật:
1. **Bệnh nhân A cập nhật PHR mới qua API nghiệp vụ:**
   ```http
   PUT /api/v1/phr/me HTTP/1.1
   Authorization: Bearer <Patient_A_JWT>
   Content-Type: application/json

   {
     "fullName": "Lê Văn Một (Cập Nhật 2026)",
     "bloodType": "AB+",
     "allergies": "Penicillin, Sulfonamide, Cephalosporin",
     "chronicDiseases": "Hen phế quản mãn tính đã kiểm soát tốt",
     "surgeryHistory": "Mổ ruột thừa năm 2018, Nội soi khớp gối 2024"
   }
   ```
   - **Kết quả HTTP:** `200 OK`. CSDL `ehealth_phr_test_db` được cập nhật bản ghi mới.
2. **Tải lại trang trên Chrome (`Page.reload`):**
   - Trình duyệt Chrome tải lại toàn bộ buồng khám.
   - Angular khởi tạo lại session qua refresh token và phát lệnh `GET .../patient-phr`.
3. **Trích xuất dữ liệu DOM sau reload:**
   - **Tiêu đề bệnh nhân mới:** `"Lê Văn Một (Cập Nhật 2026) · Nam · 1992"`
   - **Nội dung tiền sử PHR mới:**
     `"Thông tin tiền sử từ PHR Nhóm máu: AB+ · Dị ứng: Penicillin, Sulfonamide, Cephalosporin · Bệnh mạn tính: Hen phế quản mãn tính đã kiểm soát tốt Tiền sử phẫu thuật: Mổ ruột thừa năm 2018, Nội soi khớp gối 2024"`
4. **Ảnh chụp màn hình cập nhật động (Screenshot 2):**
   - Đường dẫn: `docs/screenshots/tc-phr-005-dynamic-update-e2e.png`

![Giao diện Buồng khám cập nhật dữ liệu động từ PostgreSQL](screenshots/tc-phr-005-dynamic-update-e2e.png)

---

### Bước 5: Kiểm tra phân quyền, chống IDOR và cách ly dữ liệu bệnh nhân (SRS Mục 5.4)

| Kịch bản kiểm thử bảo mật | Request thực tế | Phản hồi backend | Đánh giá an toàn |
| :--- | :--- | :--- | :---: |
| **Bác sĩ B truy cập ca khám của Bác sĩ A** | `GET /appointments/:appointment1Id/patient-phr` kèm JWT của Doctor B | **HTTP 403 Forbidden**<br>`{"code":"UNAUTHORIZED_DOCTOR","message":"Bác sĩ không phụ trách ca khám này."}` | **ĐẠT (Không rò rỉ 1 byte dữ liệu)** |
| **Bệnh nhân truy cập endpoint buồng khám** | `GET /appointments/:appointment1Id/patient-phr` kèm JWT của Patient | **HTTP 403 Forbidden** | **ĐẠT (Role Guard chặn đúng)** |
| **Yêu cầu không có thông tin xác thực** | `GET /appointments/:appointment1Id/patient-phr` không có Authorization | **HTTP 401 Unauthorized** | **ĐẠT (Auth Guard chặn đúng)** |
| **Giả mạo tham số `patientId` phía Client** | `GET /appointments/:appointment1Id/patient-phr?patientId=fake-id` | **HTTP 200 OK**<br>Trả về đúng PHR của bệnh nhân gắn với `appointment1Id` trong DB. Tham số giả mạo bị bỏ qua hoàn toàn. | **ĐẠT (Miễn nhiễm can thiệp Client)** |

---

## 5. NHẬT KÝ THỰC THI TOÀN VĂN (RAW RUNNER LOG DUMP)

```text
================================================================================
FINAL E2E RETEST: TC-PHR-005 THEO SRS-EHEALTH-2026-V1
Database: ehealth_phr_test_db | Chrome: Headless CDP
================================================================================

[1/6] Kết nối PostgreSQL test DB ehealth_phr_test_db và chạy migration...
[2/6] Dọn dẹp sạch sẽ và Seed dữ liệu ca khám kiểm thử...
[3/6] Khởi động NestJS backend server trên cổng 3333...
   -> Backend live at: http://127.0.0.1:3333
[4/6] Khởi động Frontend Web Server trên cổng 4200 (kèm reverse-proxy /api/v1 -> 3333)...
   -> Frontend live at: http://127.0.0.1:4200

--- BƯỚC 1: BÁC SĨ THỰC HIỆN TIẾP NHẬN KHÁM (SRS-DOC-02) ---
   -> Bác sĩ A đăng nhập thành công. Role: ROLE_DOCTOR
   -> Bác sĩ A nhấn 'Tiếp nhận khám' cho lịch hẹn APT-E2E-2026-001...
   [PASS] SRS-DOC-02: Ca khám APT-E2E-2026-001 đã chuyển sang trạng thái IN_CONSULTATION trong PostgreSQL.

--- BƯỚC 2: KIỂM TRA TIỀN ĐIỀU KIỆN BUỒNG KHÁM (SRS-DOC-03) ---
   [PASS] SRS-DOC-03 Tiền điều kiện: appointment.status === 'IN_CONSULTATION' (Hợp lệ).

--- BƯỚC 3: MỞ BROWSER CHROME HEADLESS & ĐIỀU HƯỚNG VÀO BUỒNG KHÁM ---
   -> Kết nối Chrome DevTools Protocol qua WebSocket...
   -> Điều hướng browser đến: http://127.0.0.1:4200/login
   [Browser Net >>] POST http://127.0.0.1:4200/api/v1/auth/refresh
   [Browser Net <<] 401 http://127.0.0.1:4200/api/v1/auth/refresh
   -> Điền thông tin đăng nhập Bác sĩ A...
   -> Submit form đăng nhập...
   [Browser Net >>] POST http://127.0.0.1:4200/api/v1/auth/login
   -> Chờ đăng nhập Bác sĩ A thành công...
   [Browser Net <<] 200 http://127.0.0.1:4200/api/v1/auth/login
   -> Đăng nhập thành công, URL hiện tại: http://127.0.0.1:4200/doctor/queue
   -> Điều hướng browser vào buồng khám: /doctor/consultation/b1111111-1111-4111-8111-111111111111...
   -> Chờ Angular load buồng khám và gọi endpoint PHR bệnh nhân...
   [Browser Net >>] POST http://127.0.0.1:4200/api/v1/auth/refresh
   [Browser Net <<] 200 http://127.0.0.1:4200/api/v1/auth/refresh
   [Browser Net >>] GET http://127.0.0.1:4200/api/v1/clinical/medical-records/appointment/b1111111-1111-4111-8111-111111111111
   [Browser Net >>] GET http://127.0.0.1:4200/api/v1/clinical/appointments/b1111111-1111-4111-8111-111111111111/patient-phr
   [Browser Net <<] 404 http://127.0.0.1:4200/api/v1/clinical/medical-records/appointment/b1111111-1111-4111-8111-111111111111
   [Browser Net <<] 200 http://127.0.0.1:4200/api/v1/clinical/appointments/b1111111-1111-4111-8111-111111111111/patient-phr
   -> [Browser Network] GET /api/v1/clinical/appointments/b1111111-1111-4111-8111-111111111111/patient-phr intercepted. Status: 200

   [Live DOM Extracted Data]:
     - Header (Bệnh nhân): "Lê Văn Một · Nam · 1992"
     - Trạng thái ca khám: "Đang khám"
     - Mã ca khám / hồ sơ: "Mã hồ sơ: b1111111-1111-4111-8111-111111111111"
     - Nội dung tiền sử PHR: "Thông tin tiền sử từ PHRNhóm máu: B+ · Dị ứng: Penicillin, Sulfonamide · Bệnh mạn tính: Hen phế quản mãn tínhTiền sử phẫu thuật: Mổ ruột thừa năm 2018"
   -> [Screenshot] Đã lưu ảnh chụp giao diện: C:\Project\FE\E-healthcare\docs\screenshots\tc-phr-005-consultation-e2e.png
   [PASS] SRS-AUTH-03 & SRS-DOC-03: PHR của đúng bệnh nhân đã tự động hiển thị đầy đủ trên Consultation UI.

--- BƯỚC 4: KIỂM CHỨNG DỮ LIỆU ĐỘNG TỪ POSTGRESQL (DYNAMIC DB UPDATE) ---
   -> Bệnh nhân A thực hiện cập nhật PHR mới qua PUT /api/v1/phr/me...
   -> CSDL PostgreSQL đã cập nhật thành công.
   -> Reload trang buồng khám trong browser...
   [Browser Net >>] POST http://127.0.0.1:4200/api/v1/auth/refresh
   [Browser Net <<] 200 http://127.0.0.1:4200/api/v1/auth/refresh
   [Browser Net >>] GET http://127.0.0.1:4200/api/v1/clinical/medical-records/appointment/b1111111-1111-4111-8111-111111111111
   [Browser Net >>] GET http://127.0.0.1:4200/api/v1/clinical/appointments/b1111111-1111-4111-8111-111111111111/patient-phr
   [Browser Net <<] 404 http://127.0.0.1:4200/api/v1/clinical/medical-records/appointment/b1111111-1111-4111-8111-111111111111
   [Browser Net <<] 200 http://127.0.0.1:4200/api/v1/clinical/appointments/b1111111-1111-4111-8111-111111111111/patient-phr
   -> [Browser Network] GET /api/v1/clinical/appointments/b1111111-1111-4111-8111-111111111111/patient-phr intercepted. Status: 200
   [Live DOM Extracted Data After Reload]:
     - Header mới: "Lê Văn Một (Cập Nhật 2026) · Nam · 1992"
     - PHR mới: "Thông tin tiền sử từ PHRNhóm máu: AB+ · Dị ứng: Penicillin, Sulfonamide, Cephalosporin · Bệnh mạn tính: Hen phế quản mãn tính đã kiểm soát tốtTiền sử phẫu thuật: Mổ ruột thừa năm 2018, Nội soi khớp gối 2024"
   -> [Screenshot] Đã lưu ảnh chụp giao diện cập nhật: C:\Project\FE\E-healthcare\docs\screenshots\tc-phr-005-dynamic-update-e2e.png
   [PASS] Dữ liệu PHR được load động 100% từ CSDL PostgreSQL thật, không phải fixture cứng.

--- BƯỚC 5: KIỂM TRA PHÂN QUYỀN VÀ CÁCH LY BỆNH NHÂN (SRS MỤC 5.4) ---
   -> Bác sĩ B cố gắng truy cập ca khám của Bác sĩ A...
   [PASS] SRS 5.4: Bác sĩ B bị từ chối với HTTP 403 UNAUTHORIZED_DOCTOR, không lộ dữ liệu.
   -> Người dùng vai trò PATIENT gọi endpoint buồng khám...
   [PASS] Vai trò PATIENT bị từ chối truy cập endpoint buồng khám.
   -> Yêu cầu không có token...
   [PASS] Yêu cầu không xác thực bị từ chối với HTTP 401 Unauthorized.
   -> Kiểm tra chống giả mạo patientId...
   [PASS] Backend xác định bệnh nhân duy nhất từ appointmentId trong CSDL PostgreSQL, hoàn toàn miễn nhiễm can thiệp phía client.

================================================================================
KẾT QUẢ FINAL E2E RETEST TC-PHR-005: 100% CÁC BƯỚC ĐẠT (PASS)
================================================================================

[Clean Up] Thu dọn tiến trình và tài nguyên...
   - Google Chrome process terminated.
   - Web server closed.
   - NestJS backend closed.
   - Database connection closed.
```

---

## 6. KẾT LUẬN NGHIỆM THU

1. **Test Case `TC-PHR-005`:** **PASS** (100% các tiêu chí Expected Result và ràng buộc SRS được thỏa mãn trên runtime trình duyệt và CSDL thật).
2. **Defect `DEFECT-PHR-005-DOCTOR-ACCESS`:** **FIXED & VERIFIED** (Đã khắc phục hoàn toàn gốc rễ, đáp ứng đầy đủ phân quyền và cách ly dữ liệu bệnh nhân).
3. **Môi trường & Tính toàn vẹn:**
   - CSDL sử dụng duy nhất: `ehealth_phr_test_db`.
   - File Excel `EHealthcare_Card_1.5_Test_Matrix_v2.xlsx` được bảo toàn nguyên vẹn, không chỉnh sửa ngoài phạm vi cho phép.
   - Không thực hiện commit, push hoặc tạo Pull Request theo đúng chỉ thị.
