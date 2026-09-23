# KẾ HOẠCH BỔ SUNG NHIỆM VỤ DỰ ÁN E-HEALTHCARE PORTAL (PHIÊN BẢN CẬP NHẬT SPRINT 3)
## Báo cáo Rà soát Khoảng hụt (Gap Analysis) & Phân bổ Tối đa các Task Bổ sung vào Sprint 3 theo SRS-EHEALTH-2026-V1

- **Dự án:** Hệ thống Quản lý & Đặt lịch Khám chữa bệnh (E-Healthcare Portal)
- **Tài liệu căn cứ:** 
  - `docs/SRS-EHEALTH-2026-V1.docx` (Bản đặc tả Baseline 07/09/2026)
  - `docs/cautruc.md` (Tài liệu Cấu trúc Thư mục & Nguyên tắc Vận hành Dự án)
  - `Kế hoạch Phân công Dự án EHealth (SRS-EHEALTH-2026-V1).xlsx` (Bảng phân công gốc 4 Sprint)
- **Người lập:** Ban Kỹ thuật Dự án (Technical Lead & System Analyst)
- **Thời điểm cập nhật:** 21/09/2026 (Tuần 3 - Đang trong giai đoạn Sprint 3)
- **Định hướng điều chỉnh:** **Tập trung bổ sung gần như toàn bộ (9/11 tasks mới) trực tiếp vào Sprint 3 (21/09 - 25/09/2026)** để hoàn thiện trọn vẹn toàn bộ chu trình khám chữa bệnh, lịch trực, lễ tân sảnh, hàng đợi và bảo mật ngay trong Sprint này. Sprint 4 sẽ chỉ tập trung vào Cổng thanh toán, Báo cáo Quản trị, Rà soát An ninh & Đóng gói Release.

---

## 1. TỔNG QUAN ĐIỀU CHỈNH KẾ HOẠCH

Sau khi xem xét tiến độ thực tế ngày 21/09/2026 (các nhánh PR #10, #11, #12, #13 của Sprint 1 & 2 đã hoàn thành và merge thành công), **Sprint 3 là thời điểm vàng để hoàn tất mọi mắt xích nghiệp vụ cốt lõi**.

Việc dồn các task bổ sung vào Sprint 3 giúp:
1. **Khép kín luồng nghiệp vụ Bác sĩ:** Không chỉ có buồng khám (Card 3.4) mà có luôn giao diện khai báo ca trực tuần `/doctor/schedule` và phụ lục bệnh án (EMR Addendum) sau khóa 24h.
2. **Khép kín luồng nghiệp vụ Lễ tân & Sảnh chờ:** Không chỉ có quầy check-in (Card 3.2) mà có đồng thời Màn hình TV gọi số ngoài sảnh (Queue Board) và Mẫu in phiếu khám nhiệt POS K80 / A5.
3. **Hoàn thiện bảo mật & tài khoản:** Bổ sung ngay Quên mật khẩu OTP, Redis Token Blacklist thu hồi phiên đăng xuất và Backend PHR API phục vụ khám bệnh.
4. **Minh bạch luồng Lịch hẹn:** Kết hợp máy trạng thái (Card 3.1) với giao diện Bệnh nhân tự hủy lịch & chính sách hoàn phí 100/70/0%.
5. **Ổn định hạ tầng nền tảng:** Đưa BullMQ / Redis Queue và Cron Schedulers vào ngay Sprint 3 để phục vụ gửi mail, SMS nhắc hẹn và dọn dẹp slot.

---

## 2. BẢNG TỔNG HỢP PHÂN BỔ CÁC TASK BỔ SUNG VÀO SPRINT 3 & SPRINT 4

| STT | Mã Card | Tên Task / Đầu việc Bổ sung | Căn cứ SRS | Vai trò | Phụ trách chính | Phân bổ Sprint |
| :---: | :---: | :--- | :--- | :---: | :---: | :---: |
| **1** | **Card 3.6** | **UI Khai báo & Quản lý Ca trực Bác sĩ** (`/doctor/schedule`) | SRS-DOC-01 (Mục 4.3.1) | 🔵 Frontend | **Trần Văn Tiến** | ⚡ **Sprint 3** |
| **2** | **Card 3.7** | **Quên mật khẩu OTP, Thu hồi phiên (Token Blacklist) & Backend PHR API** | SRS-AUTH-01..03, NFR-SEC-02 | 🩵 Backend | **Đồng Văn Tú** | ⚡ **Sprint 3** |
| **3** | **Card 3.8** | **Màn hình Bảng Hàng đợi Gọi số Sảnh chờ Fullscreen TV** (`/receptionist/queue-board`) | Section 3.4, SRS-REC-01 | 🔵 FE & 🩵 WS | **Trần Trọng Hoàn** | ⚡ **Sprint 3** |
| **4** | **Card 3.9** | **Chuẩn hóa Mẫu In Phiếu Khám & Hóa đơn Nhiệt POS 80mm (K80) / Laser A5** | Section 3.2, SRS-REC-01 | 🔵 Frontend | **Nguyễn Mạnh Thi** | ⚡ **Sprint 3** |
| **5** | **Card 3.10** | **Cơ chế Phụ lục Bệnh án Điện tử (EMR Addendum) sau Khóa 24h** | Section 5.4, SRS-DOC-03 | 🩵 BE & 🔵 FE | **Nguyễn Văn Tùng** | ⚡ **Sprint 3** |
| **6** | **Card 3.11** | **UI Bệnh nhân Chủ động Hủy lịch & Hiển thị Tỷ lệ Hoàn tiền 100/70/0%** | Section 5.3, SRS-PAT-04 | 🔵 FE & 🩵 BE | **Đồng Văn Tú** (phối hợp Tiến) | ⚡ **Sprint 3** |
| **7** | **Card 3.12** | **Hạ tầng Background Message Queue (BullMQ) & Cron Schedulers** | Section 7.1, SRS-PAT-05 | 🩵 BE & 🟡 DevOps | **Lê Việt Cường** | ⚡ **Sprint 3** |
| **8** | **Card 3.13** | **Giao diện Quản trị Tra cứu Nhật ký Kiểm toán** (`/admin/audit-logs`) | SRS-ADM-04 (Mục 4.5.4) | 🔵 Frontend | **Trần Trọng Hoàn** | ⚡ **Sprint 3** |
| **9** | **Card 3.14** | **Bệnh nhân Gửi Đánh giá 1-5 Sao & Nhận xét Bác sĩ sau ca khám** | SRS-PAT-01, Table 7 | 🔵 FE & 🩵 BE | **Nguyễn Mạnh Thi** | ⚡ **Sprint 3** |
| **10** | **Card 4.7** | **UI Đón Kết quả Thanh toán VNPAY/MoMo & Hóa đơn Điện tử kèm QR** | SRS-PAT-03 (Mục 4.2.3) | 🔵 Frontend | **Trần Văn Tiến** | 🚀 **Sprint 4** *(chạy cùng Card 4.1 Cổng TT)* |
| **11** | **Card 4.8** | **Diễn tập Khôi phục Thảm họa (RTO < 2h, RPO < 15m) & Audit OWASP Top 10** | NFR-AVAIL-02, NFR-SEC-03 | 🟢 QA & 🟡 DevOps | **Nguyễn Văn Tùng** (phối hợp Cường) | 🚀 **Sprint 4** *(giai đoạn nghiệm thu)* |

> **Nhận xét phân bổ:** Có **9/11 tasks bổ sung (chiếm 82%)** được kéo thẳng vào thực hiện song song trong **Sprint 3**. Hai task còn lại (Card 4.7 & Card 4.8) gắn liền hữu cơ với Cổng thanh toán bên thứ ba và Hoạt động nghiệm thu an toàn thông tin cuối kỳ tại Sprint 4.

---

## 3. CHI TIẾT CÁC CARD BỔ SUNG TRONG SPRINT 3 (21/09 - 25/09/2026)

---

### 🏷️ Card 3.6 | [SRS-DOC-01] Xây dựng Giao diện Đăng ký & Quản lý Ca trực Bác sĩ
- **Phân hệ:** Bác sĩ (Doctor Portal)
- **Vai trò:** 🔵 Frontend
- **Thành viên phụ trách:** **Trần Văn Tiến**
- **Thời lượng dự kiến:** 2 ngày (21/09 - 22/09)
- **Checklist chi tiết:**
  - [ ] Xây dựng màn hình `/doctor/schedule` (thay thế màn hình TODO hiện tại).
  - [ ] Lịch trực theo tuần (Thứ Hai - Chủ Nhật): Hiển thị trực quan các ca đã đăng ký (Ca sáng 08:00 - 12:00, Ca chiều 13:30 - 17:30).
  - [ ] Form đăng ký ca làm việc mới: Chọn ngày, chọn ca trực, chọn thời lượng slot (15 phút hoặc 30 phút), chọn buồng khám (`room_number`).
  - [ ] Tự động xem trước (Preview) danh sách slot được sinh ra trước khi gửi lên API `POST /api/v1/doctor/schedules`.
  - [ ] Hiển thị trạng thái ca trực: Đánh dấu ca đã có bệnh nhân đặt hẹn (khóa nút Hủy/Sửa ca) và ca còn trống 100% (cho phép Hủy/Sửa).
  - [ ] Kiểm tra hạn chót: Hiển thị cảnh báo nếu đăng ký sau 17:00 Thứ Sáu đối với tuần làm việc tiếp theo.

---

### 🏷️ Card 3.7 | [SRS-AUTH-01..03 & NFR-SEC-02] Quên Mật Khẩu, Thu Hồi Phiên (Token Blacklist) & PHR Backend API
- **Phân hệ:** Quản lý Người dùng & Bảo mật (IAM & Security)
- **Vai trò:** 🩵 Backend
- **Thành viên phụ trách:** **Đồng Văn Tú**
- **Thời lượng dự kiến:** 2 ngày (21/09 - 22/09)
- **Checklist chi tiết:**
  - [ ] **Quên mật khẩu OTP (SRS-AUTH-01 & 02):**
    - `POST /api/v1/auth/forgot-password`: Tiếp nhận email/SĐT, kiểm tra rate limit, sinh mã OTP 6 số lưu Redis với TTL 5 phút.
    - `POST /api/v1/auth/reset-password`: Xác thực OTP, cập nhật mật khẩu mới (BCrypt cost 12), thu hồi toàn bộ token đang hoạt động.
  - [ ] **Thu hồi phiên & Token Blacklist (NFR-SEC-02):**
    - `POST /api/v1/auth/logout`: Xóa HttpOnly Cookie `refreshToken`, trích xuất `jti` của Access Token đưa vào Redis Blacklist với TTL bằng thời gian sống còn lại.
    - Tích hợp kiểm tra Blacklist trong `JwtAuthGuard` của NestJS server.
  - [ ] **Backend PHR API (SRS-AUTH-03):**
    - Tạo `PhrModule` phục vụ 2 endpoints: `GET /api/v1/phr/me` và `PUT /api/v1/phr/me`.
    - Validate mã thẻ BHYT chuẩn Việt Nam (15 ký tự: 2 chữ cái + 1 số đối tượng + 2 số tỉnh + 10 số BHXH).
    - Validate enum nhóm máu (`A+`, `A-`, `B+`, `B-`, `AB+`, `AB-`, `O+`, `O-`) và danh sách tiền sử dị ứng thuốc/thức ăn.

---

### 🏷️ Card 3.8 | [Section 3.4 & SRS-REC-01] Màn hình Bảng Hàng đợi Gọi số Sảnh chờ (Queue Board Fullscreen TV)
- **Phân hệ:** Lễ tân & Trình chiếu Sảnh Chờ (Receptionist & Public Queue)
- **Vai trò:** 🔵 Frontend & 🩵 Backend WebSocket
- **Thành viên phụ trách:** **Trần Trọng Hoàn**
- **Thời lượng dự kiến:** 2 ngày (22/09 - 23/09)
- **Checklist chi tiết:**
  - [ ] Xây dựng màn hình chuyên dụng `/receptionist/queue-board` (hỗ trợ chế độ Toàn màn hình TV độ phân giải Full HD / 4K ngoài sảnh).
  - [ ] Bố cục giao diện hiển thị 2 khu vực trực quan:
    - **Đang khám (Now Serving):** Hiển thị số thứ tự (STT) khổ lớn, tên bệnh nhân (dạng viết tắt bảo mật: `Nguyễn V. A`), số buồng khám, chuyên khoa và tên bác sĩ phụ trách.
    - **Chuẩn bị vào khám (Next Up):** Danh sách 5 bệnh nhân kế tiếp đang chờ ở sảnh kèm STT.
  - [ ] Kết nối WebSocket / Server-Sent Events (SSE) bắt sự kiện `appointment.status_changed`: Cập nhật bảng tức thì trong < 500ms mà không cần F5 trình duyệt.
  - [ ] Hiệu ứng Flash viền vàng/xanh kèm chuông âm thanh nhẹ khi có bệnh nhân mới được gọi vào buồng khám.

---

### 🏷️ Card 3.9 | [Section 3.2 & SRS-REC-01] Mẫu In Phiếu Khám & Hóa đơn Nhiệt POS 80mm / Laser A5
- **Phân hệ:** Lễ tân (Receptionist)
- **Vai trò:** 🔵 Frontend
- **Thành viên phụ trách:** **Nguyễn Mạnh Thi**
- **Thời lượng dự kiến:** 1.5 ngày (22/09 - 23/09)
- **Checklist chi tiết:**
  - [ ] Thiết kế Component chuyên dụng `PrintReceiptComponent` phục vụ in ấn.
  - [ ] Chuẩn hóa CSS `@media print` cho 2 khổ in thực tế tại phòng khám:
    - Khổ máy in nhiệt POS 80mm (K80): Header logo phòng khám, Mã vạch / QR lịch hẹn, Số thứ tự khám, Tên bệnh nhân, Chuyên khoa, Buồng khám, Số tiền viện phí đã nộp, Lời dặn đến trước 15 phút.
    - Khổ in Laser A5: Phiếu thu tiền viện phí có đầy đủ thông tin pháp lý phục vụ thanh toán BHYT / thanh toán doanh nghiệp.
  - [ ] Tích hợp nút thao tác "In Phiếu Tiếp Đón" tự động ngay sau khi Lễ tân bấm Check-in thành công.

---

### 🏷️ Card 3.10 | [Section 5.4 & SRS-DOC-03] Cơ chế Phụ lục Bệnh án Điện tử (EMR Addendum) sau Khóa 24h
- **Phân hệ:** Bác sĩ & Hồ sơ Y tế (Clinical)
- **Vai trò:** 🩵 Backend & 🔵 Frontend
- **Thành viên phụ trách:** **Nguyễn Văn Tùng**
- **Thời lượng dự kiến:** 2 ngày (23/09 - 24/09)
- **Checklist chi tiết:**
  - [ ] **Backend CSDL & API:**
    - Tạo bảng `EMR_ADDENDUMS` (`id`, `medical_record_id`, `doctor_id`, `reason`, `previous_content`, `updated_content`, `created_at`).
    - Logic kiểm soát: Nếu `medical_records.locked_at` đã quá 24 giờ, chặn tuyệt đối thao tác `PUT/PATCH` sửa trực tiếp bệnh án gốc.
    - Endpoint `POST /api/v1/clinical/records/:id/addendums`: Tạo phụ lục bổ sung kèm lý do y khoa (ví dụ: "Bổ sung kết quả sinh thiết / kháng sinh đồ gửi muộn").
    - Endpoint `GET /api/v1/clinical/records/:id/history`: Truy vết đầy đủ bệnh án ban đầu và toàn bộ phụ lục đính kèm theo thời gian.
  - [ ] **Frontend Buồng khám:**
    - Hiển thị nhãn Badge màu đỏ **"HỒ SƠ ĐÃ KHÓA 24H (CHỈ ĐỌC)"**.
    - Cung cấp nút bấm "Tạo Phụ lục Bệnh án (Addendum)" theo đúng quy định Thông tư 46/2018/TT-BYT.

---

### 🏷️ Card 3.11 | [Section 5.3 & SRS-PAT-04] Giao diện Bệnh nhân Tự Hủy Lịch & Minh Bạch Hoàn Tiền 100/70/0%
- **Phân hệ:** Bệnh nhân (Patient Portal)
- **Vai trò:** 🔵 Frontend & 🩵 Backend
- **Thành viên phụ trách:** **Đồng Văn Tú** (phối hợp **Trần Văn Tiến**)
- **Thời lượng dự kiến:** 2 ngày (23/09 - 24/09)
- **Checklist chi tiết:**
  - [ ] Thêm nút "Hủy lịch khám" trong danh sách lịch hẹn sắp tới tại `/patient/history`.
  - [ ] Popup Modal xác nhận hủy lịch kèm bộ tính toán thời gian tự động:
    - Khoảng cách đến giờ khám $T \ge 24h$: Thông báo màu xanh "Được hoàn 100% chi phí khám".
    - $2h \le T < 24h$: Cảnh báo màu vàng "Được hoàn 70% chi phí khám (khấu trừ 30% phí điều phối ca trực)".
    - $T < 2h$: Cảnh báo màu đỏ "Hủy trong vòng dưới 2 giờ trước khám không được hoàn phí".
  - [ ] Người dùng nhập lý do hủy -> Xác nhận -> Lịch hẹn chuyển `CANCELLED`, slot giải phóng về `AVAILABLE` để bệnh nhân khác có thể đặt.

---

### 🏷️ Card 3.12 | [Section 7.1 & SRS-PAT-05] Hạ tầng Background Message Queue (BullMQ) & Cron Schedulers
- **Phân hệ:** Hạ tầng & Backend (DevOps & Backend)
- **Vai trò:** 🩵 Backend & 🟡 DevOps
- **Thành viên phụ trách:** **Lê Việt Cường**
- **Thời lượng dự kiến:** 2 ngày (23/09 - 24/09)
- **Checklist chi tiết:**
  - [x] Tích hợp BullMQ & Redis connection pool vào NestJS server.
  - [x] Tách biệt các hàng đợi xử lý ngầm (Queue Workers):
    - `email-queue`: Gửi email xác nhận đặt lịch, email kích hoạt tài khoản, email nhắc hẹn trước 24h.
    - `sms-queue`: Gửi mã OTP xác thực, SMS nhắc hẹn trước 2h.
    - `pdf-queue`: Sinh đơn thuốc điện tử và hồ sơ bệnh án định dạng PDF có mã QR.
  - [x] Cron Job quét tự động:
    - Quét lịch hẹn `CONFIRMED` quá 30 phút mà bệnh nhân không check-in quầy -> tự động đánh dấu `NO_SHOW` vào cuối ngày (Section 5.2).
    - Quét dọn dẹp các slot giữ chỗ mồ côi (nếu xảy ra lỗi kết nối mạng bất thường).

---

### 🏷️ Card 3.13 | [SRS-ADM-04] Giao diện Tra cứu Nhật ký Kiểm toán (Audit Logs Viewer UI)
- **Phân hệ:** Quản trị Hệ thống (Admin Portal)
- **Vai trò:** 🔵 Frontend
- **Thành viên phụ trách:** **Trần Trọng Hoàn**
- **Thời lượng dự kiến:** 1.5 ngày (24/09 - 25/09)
- **Checklist chi tiết:**
  - [ ] Xây dựng màn hình `/admin/audit-logs` (thay thế placeholder TODO).
  - [ ] Bảng nhật ký kiểm toán với các cột: Thời điểm (UTC+7), Tài khoản thực hiện, Vai trò, Thao tác (`LOGIN`, `VIEW_EMR`, `UPDATE_RX`, `CANCEL_APPT`...), Địa chỉ IP, User-Agent.
  - [ ] Bộ lọc tìm kiếm: Lọc theo khoảng thời gian, theo loại hành động (Action) và tìm kiếm theo User ID / IP.
  - [ ] Đảm bảo tính bảo mật: Giao diện chỉ có quyền Xem và Xuất file (Read-only & Export CSV), hoàn toàn không có nút Sửa/Xóa.

---

### 🏷️ Card 3.14 | [SRS-PAT-01 & Table 7] Tính năng Gửi Đánh giá & Phản hồi Bác sĩ sau Ca khám
- **Phân hệ:** Bệnh nhân (Patient Portal)
- **Vai trò:** 🔵 Frontend & 🩵 Backend
- **Thành viên phụ trách:** **Nguyễn Mạnh Thi**
- **Thời lượng dự kiến:** 1.5 ngày (24/09 - 25/09)
- **Checklist chi tiết:**
  - [ ] Trong tab "Lịch sử đã khám", hiển thị nút "Đánh giá bác sĩ" đối với các ca khám `COMPLETED` chưa được đánh giá.
  - [ ] Form đánh giá: Chấm điểm từ 1 đến 5 sao và viết nhận xét (tối đa 500 ký tự).
  - [ ] Backend API `POST /api/v1/doctors/:id/reviews`: Kiểm tra tính hợp lệ (bệnh nhân bắt buộc phải có ca khám hoàn thành với bác sĩ đó).
  - [ ] Cập nhật trường `rating_average` trong bảng `DOCTORS` và làm mới Redis Cache danh mục bác sĩ.

---

## 4. CHI TIẾT CÁC CARD CÒN LẠI TRONG SPRINT 4 (26/09 - 01/10/2026)

Sprint 4 sẽ được giải phóng khỏi các task phát triển lẻ tẻ, tập trung tối đa vào Thanh toán, Quản trị, An ninh và Đóng gói phát hành:

- **Card 4.1:** Tích hợp Cổng thanh toán VNPAY / MoMo Backend (Thi)
- **Card 4.7 [MỚI]:** Giao diện Đón kết quả thanh toán & Hóa đơn điện tử kèm QR (Tiến - phối hợp Thi)
- **Card 4.2:** Lịch sử khám bệnh & Tải đơn thuốc PDF (Tiến)
- **Card 4.3:** Mã hóa CSDL AES-256 tầng dữ liệu nhạy cảm (Hoàn)
- **Card 4.4:** Quản trị Danh mục Y tế, Bác sĩ & Dashboard KPI Phòng khám (Tú)
- **Card 4.8 [MỚI]:** Diễn tập Khôi phục Thảm họa (RTO < 2h, RPO < 15m) & Rà soát Lỗ hổng OWASP Top 10 (Tùng + Cường)
- **Card 4.5:** Kiểm thử Tích hợp Toàn hệ thống, Đo SLA & Đóng Ma trận RTM (Tùng)
- **Card 4.6:** Đóng gói Release v1.0.0 & Báo cáo Demo Nghiệm thu (Toàn đội)

---

## 5. BẢNG PHÂN BỔ NHÂN LỰC TOÀN ĐỘI TRONG SPRINT 3 (21/09 - 25/09/2026)

| Thành viên | Vai trò | Các Task đảm nhiệm trong Sprint 3 (Hiện tại) | Khối lượng |
| :--- | :--- | :--- | :---: |
| **Lê Việt Cường** | Tech Lead & Core Backend | **Card 3.5** (Test Chu trình khám lâm sàng & Dị ứng) + **Card 3.12** (BullMQ & Cron Workers) | 2 Cards |
| **Trần Văn Tiến** | Frontend Engineer | **Card 3.4** (Buồng khám Bác sĩ UI) + **Card 3.6** (UI Khai báo ca trực) + Hỗ trợ UI Card 3.11 | 2.5 Cards |
| **Nguyễn Mạnh Thi** | Fullstack Engineer | **Card 3.2** (Lễ tân Check-in Backend) + **Card 3.9** (Mẫu in POS K80/A5) + **Card 3.14** (Đánh giá Bác sĩ) | 3 Cards |
| **Đồng Văn Tú** | Backend / Database | **Card 3.1** (State Machine & Refund) + **Card 3.7** (Quên pass, Blacklist, PHR) + **Card 3.11** (Hủy lịch & Hoàn tiền BE) | 3 Cards |
| **Trần Trọng Hoàn** | Fullstack & QA | **Card 3.2** (Lễ tân Check-in Frontend) + **Card 3.8** (Queue Board TV Sảnh) + **Card 3.13** (Audit Logs UI) | 3 Cards |
| **Nguyễn Văn Tùng** | QA/QC & Clinical Logic | **Card 3.3** (EMR, ICD-10 & Kê đơn Backend) + **Card 3.10** (Phụ lục Bệnh án EMR Addendum) | 2 Cards |

---

## 6. SƠ ĐỒ TIẾN TRÌNH SPRINT 3 (GIAI ĐOẠN 21/09 - 25/09/2026)

```text
SPRINT 3 TIẾN ĐỘ THỰC HIỆN TẬP TRUNG (21/09 - 25/09/2026):

[21/09 - 22/09/2026] ── Khởi động Khai báo Ca trực, Lễ tân & IAM Nâng cao
├── Card 3.6: UI Khai báo ca trực Bác sĩ /doctor/schedule (Tiến)
├── Card 3.7: Quên mật khẩu OTP, Redis Token Blacklist & PHR Backend (Tú)
├── Card 3.1: Máy trạng thái Lịch hẹn State Machine (Tú)
└── Card 3.2: Tiếp đón Check-in QR quầy Lễ tân (Thi + Hoàn)

[22/09 - 23/09/2026] ── Trình chiếu Sảnh, Mẫu in & Lâm sàng EMR
├── Card 3.8: Màn hình Bảng Hàng đợi Fullscreen TV sảnh chờ /queue-board (Hoàn)
├── Card 3.9: Mẫu in Phiếu tiếp đón & Hóa đơn nhiệt POS 80mm / A5 (Thi)
├── Card 3.3: Bệnh án điện tử EMR, ICD-10 & Kê đơn thuốc Backend (Tùng)
└── Card 3.4: Buồng khám Bác sĩ & Hàng đợi chuyên khoa UI (Tiến)

[23/09 - 24/09/2026] ── Phụ lục Bệnh án, Hủy lịch Hoàn phí & Background Queue
├── Card 3.10: Phụ lục Bệnh án EMR Addendum sau khóa 24h (Tùng)
├── Card 3.11: Giao diện Bệnh nhân Hủy lịch & Hoàn tiền tự động (Tú + Tiến)
└── Card 3.12: Hạ tầng BullMQ Message Queue & Cron Schedulers (Cường)

[24/09 - 25/09/2026] ── Đánh giá Bác sĩ, Nhật ký Kiểm toán & Kiểm thử Chu trình Khám
├── Card 3.13: Màn hình Quản trị Nhật ký Kiểm toán /admin/audit-logs (Hoàn)
├── Card 3.14: Gửi Đánh giá 1-5 Sao & Nhận xét Bác sĩ (Thi)
└── Card 3.5: Kiểm thử Toàn diện Chu trình Khám Lâm sàng & Cảnh báo Dị ứng (Cường)
```

---

## 7. KẾT LUẬN

Việc bổ sung tập trung **9 tasks vào Sprint 3**:
- Giải quyết dứt điểm các màn hình còn đang để `[TODO]` trong hệ thống (`/doctor/schedule`, `/receptionist/queue-board`, `/admin/audit-logs`).
- Hoàn thiện 100% nghiệp vụ phòng khám (tiếp đón -> gọi số sảnh -> khám bệnh -> kê đơn -> in phiếu -> khóa bệnh án -> đánh giá chất lượng) ngay trong tuần hiện tại.
- Đảm bảo tải công việc được chia đều cho cả 6 thành viên (mỗi người 2 đến 3 tasks trong 5 ngày), khả thi cao và sẵn sàng đưa vào triển khai ngay.
