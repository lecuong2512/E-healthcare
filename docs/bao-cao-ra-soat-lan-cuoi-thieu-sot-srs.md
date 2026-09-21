# BÁO CÁO RÀ SOÁT LẦN CUỐI (FINAL AUDIT REPORT)
## Tổng hợp Khoảng hụt Chi tiết, Trường hợp Ngoại lệ & Phân bổ Rõ ràng 1-1 cho Từng Card theo SRS-EHEALTH-2026-V1

- **Dự án:** Hệ thống Quản lý & Đặt lịch Khám chữa bệnh (E-Healthcare Portal)
- **Tài liệu đối chiếu:** 
  - `docs/SRS-EHEALTH-2026-V1.docx` (Bản đặc tả chuẩn Baseline 07/09/2026 - toàn bộ 8 Chương, 12 Bảng, 34 Mã yêu cầu)
  - `docs/ke-hoach-bo-sung-tasks-srs.md` (Kế hoạch bổ sung nhiệm vụ Sprint 3)
  - `docs/Kế hoạch Phân công Dự án EHealth (SRS-EHEALTH-2026-V1).xlsx` (Bảng phân công công việc 36 Cards)
- **Người thực hiện:** Technical Lead & Senior Quality Assurance Specialist
- **Ngày cập nhật:** 21/09/2026
- **Nguyên tắc phân bổ:** **Mỗi điểm thiếu sót được gán DUY NHẤT vào ĐÚNG 1 CARD và 1 NGƯỜI CHỊU TRÁCH NHIỆM CHÍNH**, tuyệt đối không phân tán sang nhiều Card gây chồng chéo công việc. Toàn bộ công thức và ký hiệu được hiển thị bằng văn bản thuần chuẩn Markdown, không dùng mã công thức LaTeX.

---

## 1. KẾT QUẢ ĐÁNH GIÁ TỔNG QUAN

Sau khi rà soát chéo giữa toàn bộ nội dung tài liệu SRS gốc với danh mục **36 Cards** đã lập trong kế hoạch phân công:

1. **Về Khung Kiến trúc & Luồng Nghiệp vụ Chính (Macro-Level):**
   - Đã bao phủ 100% các phân hệ người dùng: Bệnh nhân (`SRS-PAT`), Bác sĩ (`SRS-DOC`), Lễ tân (`SRS-REC`), Quản trị viên (`SRS-ADM`), và Xác thực (`SRS-AUTH`).
   - Đã định hình đầy đủ các cơ chế cốt lõi: Khóa phân tán Redis 10 phút, Máy trạng thái 6 nấc, Chính sách hoàn tiền 100/70/0%, Khóa bệnh án sau 24h & EMR Addendum, Hàng đợi gọi số sảnh chờ TV, và In hóa đơn POS K80.

2. **Về Các Chi tiết Nghiệp vụ Biên & Điều khoản Tuân thủ (Micro-Level):**
   - Phát hiện **8 điểm thiếu sót / chi tiết tiềm ẩn rủi ro** cần bổ sung vào checklist thực thi.
   - **Quy tắc phân công rõ ràng:** Toàn bộ 8 điểm này được gán chính xác vào **8 Card độc lập** với **1 người phụ trách duy nhất**, đảm bảo tính sở hữu (Ownership) cao nhất.

---

## 2. CHI TIẾT 8 ĐIỂM THIẾU SÓT & PHÂN BỔ 1-TO-1 VÀO TỪNG CARD

---

### 🔍 Điểm thiếu sót 1: Cơ chế Khóa tài khoản sau 5 lần đăng nhập sai & Giới hạn OTP
- **Vị trí trong SRS:** 
  - Mục 4.1.1 (SRS-AUTH-01): *"OTP sai quá 5 lần: Hệ thống vô hiệu hóa phiên OTP, yêu cầu chờ 15 phút trước khi yêu cầu mã mới."*
  - Mục 4.1.2 (SRS-AUTH-02): *"Đăng nhập sai quá 5 lần liên tiếp sẽ khóa tài khoản tạm thời trong 30 phút."*
  - Mục 7.3 (NFR-SEC-03): *"Giới hạn gửi mã OTP tối đa 3 lần / số điện thoại trong 10 phút để phòng chống SMS Flooding / Brute Force."*
- **Khoảng hụt hiện tại:**
  - Hệ thống mới chỉ có Rate Limiting theo IP tại Nginx (60 requests/phút), chưa có logic theo dõi số lần đăng nhập sai và số lần yêu cầu OTP theo số điện thoại/email người dùng.
- **Card được gán DUY NHẤT:** 
  - 🎯 **Card 3.7 | [SRS-AUTH-01..03 & NFR-SEC-02] Quên Mật Khẩu, Thu Hồi Phiên (Token Blacklist) & PHR Backend API**
  - 👤 **Người chịu trách nhiệm duy nhất:** **Đồng Văn Tú**
- **Nội dung bổ sung vào Checklist của Card 3.7:**
  - [ ] Tạo Redis Key `login_attempts:{email_hoac_sdt}` với TTL 1800 giây (30 phút). Nếu số lần sai >= 5, chặn đăng nhập và trả mã lỗi HTTP 423 Locked: "Tài khoản tạm thời bị khóa 30 phút do nhập sai mật khẩu quá 5 lần liên tiếp".
  - [ ] Tạo Redis Key `otp_fails:{sdt}` với TTL 900 giây (15 phút). Vô hiệu hóa phiên OTP và bắt buộc chờ 15 phút nếu nhập sai OTP quá 5 lần.
  - [ ] Giới hạn gửi mã OTP tối đa 3 lần / số điện thoại trong vòng 10 phút để chống spam tin nhắn.

---

### 🔍 Điểm thiếu sót 2: Đăng nhập Bằng Mạng Xã Hội Google OAuth2
- **Vị trí trong SRS:**
  - Mục 4.1.2 (SRS-AUTH-02) & Bảng 11 (UR-AUTH-01): *"Đăng nhập bằng Google OAuth2: Người dùng chọn 'Đăng nhập với Google' -> Hệ thống chuyển hướng đến Google Authentication -> Google trả về OpenID Token -> Hệ thống trích xuất email, tự động tạo tài khoản nếu chưa có và đăng nhập."*
- **Khoảng hụt hiện tại:**
  - Frontend đã có nút bấm "Đăng nhập với Google" nhưng Backend chưa có API tiếp nhận và xác thực OpenID Token / Credential từ Google.
- **Card được gán DUY NHẤT:** 
  - 🎯 **Card 3.7 | [SRS-AUTH-01..03 & NFR-SEC-02] Quên Mật Khẩu, Thu Hồi Phiên (Token Blacklist) & PHR Backend API**
  - 👤 **Người chịu trách nhiệm duy nhất:** **Đồng Văn Tú**
- **Nội dung bổ sung vào Checklist của Card 3.7:**
  - [ ] Cài đặt thư viện `google-auth-library` trên NestJS Backend server.
  - [ ] Viết API endpoint `POST /api/v1/auth/google`: Tiếp nhận Google ID Token từ client, xác thực chữ ký của Google, trích xuất email/họ tên.
  - [ ] Tự động tạo bản ghi tài khoản mới trong bảng `USERS` với `role = ROLE_PATIENT` (nếu chưa từng đăng ký) và cấp phát cặp JWT Access Token (15 phút) / Refresh Token (7 ngày trong HttpOnly Cookie).

---

### 🔍 Điểm thiếu sót 3: Cơ sở Y tế Hủy ca Bất khả kháng: Hoàn tiền 100% + Mã Voucher Giảm giá 20%
- **Vị trí trong SRS:**
  - Mục 5.3 (Chính sách hủy lịch & hoàn tiền): *"Cơ sở y tế hủy ca (do Bác sĩ cấp cứu, lịch công tác đột xuất hoặc sự cố thiết bị): Hoàn trả 100% chi phí khám bệnh kèm mã voucher giảm giá 20% cho lần đặt khám tiếp theo."*
- **Khoảng hụt hiện tại:**
  - Kế hoạch ban đầu mới chỉ tập trung vào luồng Bệnh nhân chủ động hủy ca (hoàn 100%, 70%, 0%). Chưa có logic xử lý khi Quản trị viên hoặc Bác sĩ hủy ca bất khả kháng từ phía phòng khám và phát hành Voucher đền bù.
- **Card được gán DUY NHẤT:** 
  - 🎯 **Card 3.1 | [Section 5.2 & 5.3] Máy Trạng thái Vòng đời Lịch hẹn & Xử lý Hủy lịch, Hoàn tiền**
  - 👤 **Người chịu trách nhiệm duy nhất:** **Đồng Văn Tú**
- **Nội dung bổ sung vào Checklist của Card 3.1:**
  - [ ] Tạo bảng `VOUCHERS` trong CSDL: `id`, `user_id`, `code` (ví dụ: `COMPENSATE-20-XXXXXX`), `discount_percent` (20%), `is_used` (mặc định FALSE), `expires_at` (thời hạn 6 tháng).
  - [ ] Xây dựng API `POST /api/v1/appointments/:id/cancel-by-clinic`: Chuyển trạng thái lịch hẹn sang `CANCELLED_BY_CLINIC`, tự động gọi lệnh hoàn phí 100%, tự động sinh bản ghi Voucher giảm giá 20% gán cho tài khoản của bệnh nhân và gửi thông báo xin lỗi qua Email/SMS.

---

### 🔍 Điểm thiếu sót 4: Ràng buộc Kê đơn Thuốc Tối đa 30 Ngày cho Bệnh nhân Mãn tính
- **Vị trí trong SRS:**
  - Mục 4.3.4 (SRS-DOC-04): *"Kiểm tra giới hạn số ngày kê đơn (mặc định tối đa 30 ngày đối với bệnh mãn tính theo quy định y tế Thông tư 52/2017/TT-BYT)."*
- **Khoảng hụt hiện tại:**
  - Card 3.3 đã có nghiệp vụ đối chiếu dị ứng thuốc, nhưng chưa có logic kiểm soát và chặn kê đơn vượt quá 30 ngày đối với các bệnh điều trị mạn tính.
- **Card được gán DUY NHẤT:** 
  - 🎯 **Card 3.3 | [SRS-DOC-03..04 & Section 5.4] Hồ sơ Bệnh án EMR, Chẩn đoán ICD-10 & Kê đơn Thuốc Điện tử**
  - 👤 **Người chịu trách nhiệm duy nhất:** **Nguyễn Văn Tùng**
- **Nội dung bổ sung vào Checklist của Card 3.3:**
  - [ ] Triển khai thuật toán tính số ngày dùng thuốc tại Backend Service:
    `Số ngày dùng = Tổng số lượng viên / (Liều sáng + Liều trưa + Liều chiều + Liều tối)`
  - [ ] Kiểm tra ràng buộc y tế: Nếu bệnh nhân có mã bệnh ICD-10 thuộc nhóm bệnh mạn tính (Tiểu đường, Tăng huyết áp, Tim mạch...) mà `Số ngày dùng > 30 ngày`, Backend từ chối lưu đơn và trả về thông báo vi phạm Thông tư 52/2017/TT-BYT của Bộ Y tế: "Quy định kê đơn thuốc bệnh mạn tính không được vượt quá 30 ngày".

---

### 🔍 Điểm thiếu sót 5: Giao diện Tiếp đón Khách vãng lai Đặt lịch Trực tiếp tại Quầy (Walk-in Booking)
- **Vị trí trong SRS:**
  - Mục 4.4.2 (SRS-REC-02) & Bảng 11 (UR-DOC-02): *"Dành cho bệnh nhân lớn tuổi hoặc người không sử dụng smartphone đến khám trực tiếp không qua đặt trước. Lễ tân tìm kiếm bác sĩ còn slot trống trong ngày -> Nhập thông tin nhân thân bệnh nhân -> Xác nhận tạo lịch hẹn -> Thu phí và cấp số thứ tự khám ngay."*
- **Khoảng hụt hiện tại:**
  - Màn hình Lễ tân quầy mới chỉ tập trung vào quét mã QR của bệnh nhân đã đặt online, thiếu Modal giao diện thao tác nhanh cho bệnh nhân đến khám trực tiếp tại chỗ.
- **Card được gán DUY NHẤT:** 
  - 🎯 **Card 3.2 | [SRS-REC-01..02 & Section 3.4] Phân hệ Lễ tân: Quét QR Check-in & Tiếp đón Realtime**
  - 👤 **Người chịu trách nhiệm duy nhất:** **Trần Trọng Hoàn**
- **Nội dung bổ sung vào Checklist của Card 3.2:**
  - [ ] Thiết kế nút bấm và Modal nổi bật **"Tiếp đón vãng lai (Walk-in Booking)"** tại trang `/receptionist/checkin`.
  - [ ] Form nhập liệu nhanh cho Lễ tân: Lọc danh sách bác sĩ còn ca trống trong ngày -> Nhập Họ tên, Số điện thoại, Năm sinh, Giới tính -> Chọn hình thức thu tiền mặt -> Bấm "Cấp số ngay".
  - [ ] Hệ thống tự động tạo lịch hẹn với trạng thái `CHECKED_IN`, sinh số thứ tự và đẩy trực tiếp vào Hàng đợi của Bác sĩ qua WebSocket.

---

### 🔍 Điểm thiếu sót 6: Tải lên & Xem lại Tệp Kết quả Xét nghiệm Cũ khi Đặt lịch
- **Vị trí trong SRS:**
  - Mục 4.2.2 (SRS-PAT-02 - Bước 3): *"Bệnh nhân nhập Lý do khám/Triệu chứng chính, Tải lên tệp chụp kết quả xét nghiệm cũ nếu có."*
  - Mục 4.3.3 (SRS-DOC-03): *"Bác sĩ xem được các kết quả xét nghiệm/chẩn đoán hình ảnh đính kèm mà bệnh nhân đã tải lên khi đặt hẹn."*
- **Khoảng hụt hiện tại:**
  - Trong Buồng khám Bác sĩ chưa có khu vực hiển thị các tệp đính kèm mà bệnh nhân đã gửi lên khi đặt lịch.
- **Card được gán DUY NHẤT:** 
  - 🎯 **Card 3.4 | [SRS-DOC-02..04] Màn hình Hàng đợi & Buồng khám Lâm sàng cho Bác sĩ**
  - 👤 **Người chịu trách nhiệm duy nhất:** **Trần Văn Tiến**
- **Nội dung bổ sung vào Checklist của Card 3.4:**
  - [ ] Bổ sung Component hiển thị tệp đính kèm trong tab Hồ sơ bệnh nhân tại Buồng khám `/doctor/consultation/:id`.
  - [ ] Hỗ trợ xem trước (Thumbnail / Lightbox View) các tệp ảnh chụp đơn cũ, kết quả xét nghiệm máu, phim chụp X-Quang định dạng `.jpg`, `.png`, `.pdf` (dung lượng tối đa 10MB) để bác sĩ hội chẩn nhanh.

---

### 🔍 Điểm thiếu sót 7: Điều khoản Đồng thuận Bảo vệ Dữ liệu Cá nhân Y tế theo Nghị định 13/2023/NĐ-CP
- **Vị trí trong SRS:**
  - Mục 1.4 & Mục 7.3 (NFR-SEC-04): *"Tuân thủ quy định bảo vệ dữ liệu cá nhân theo Nghị định số 13/2023/NĐ-CP đối với dữ liệu y tế nhạy cảm (dữ liệu sức khỏe, tiền sử bệnh, nhóm máu, đơn thuốc)."*
- **Khoảng hụt hiện tại:**
  - Giao diện cổng bệnh nhân chưa có ô Checkbox cam kết đồng thuận xử lý dữ liệu y tế nhạy cảm theo đúng yêu cầu pháp lý bắt buộc của Nghị định 13/2023/NĐ-CP.
- **Card được gán DUY NHẤT:** 
  - 🎯 **Card 3.11 | [Section 5.3 & SRS-PAT-04] Giao diện Bệnh nhân Tự Hủy Lịch & Minh Bạch Hoàn Tiền 100/70/0%**
  - 👤 **Người chịu trách nhiệm duy nhất:** **Trần Văn Tiến**
- **Nội dung bổ sung vào Checklist của Card 3.11:**
  - [ ] Bổ sung Checkbox cam kết bắt buộc tại các biểu mẫu bệnh nhân:
    *"Tôi xác nhận đã đọc và đồng ý cho phép E-Healthcare Portal thu thập, xử lý thông tin sức khỏe cá nhân theo quy định của Nghị định 13/2023/NĐ-CP phục vụ mục đích khám chữa bệnh."*
  - [ ] Ghi nhận thời điểm đồng thuận (`consent_nd13_accepted_at`) khi gửi yêu cầu.

---

### 🔍 Điểm thiếu sót 8: Mã băm SHA-256 Xác thực Tính Toàn vẹn & Chữ ký Điện tử trên PDF
- **Vị trí trong SRS:**
  - Mục 4.2.4 & Mục 4.5.3: *"Tải tệp PDF đơn thuốc/kết quả khám có gắn chữ ký số của bác sĩ hoặc phòng khám."*
  - Mục 7.3 (NFR-SEC-01 & Thông tư 46/2018/TT-BYT): *"Chống giả mạo đơn thuốc và hồ sơ bệnh án điện tử."*
- **Khoảng hụt hiện tại:**
  - File PDF đơn thuốc hiện tại mới sinh ra định dạng text thô, chưa có mã băm bảo mật và mã QR xác thực nguồn gốc đơn thuốc hợp lệ.
- **Card được gán DUY NHẤT:** 
  - 🎯 **Card 4.2 | [SRS-PAT-04 & 05] Lịch sử Khám bệnh, Xuất Đơn thuốc PDF & Cron Job Nhắc lịch**
  - 👤 **Người chịu trách nhiệm duy nhất:** **Trần Văn Tiến**
- **Nội dung bổ sung vào Checklist của Card 4.2:**
  - [ ] Khi tạo file PDF Đơn thuốc điện tử: Sinh chuỗi mã băm bảo mật SHA-256 từ `ma_don_thuoc + ma_bac_si + thoi_gian_tao`.
  - [ ] In chuỗi mã băm và Mã QR xác thực ở góc dưới cùng của tệp PDF: "Quét mã để đối chiếu đơn thuốc gốc tại hệ thống E-Healthcare Portal", kèm hình ảnh con dấu điện tử phòng khám.

---

## 3. BẢNG TỔNG KẾT PHÂN BỔ 1-TO-1 (KHÔNG CHỒNG CHÉO)

| STT | Điểm thiếu sót được bổ sung | Card được gán DUY NHẤT | Vai trò | Người chịu trách nhiệm DUY NHẤT | Hạn chót nghiệm thu |
| :---: | :--- | :--- | :---: | :---: | :---: |
| **1** | Khóa tài khoản sau 5 lần sai & Giới hạn OTP | **Card 3.7** | 🩵 Backend | **Đồng Văn Tú** | 22/09/2026 |
| **2** | Đăng nhập Google OAuth2 | **Card 3.7** | 🩵 Backend | **Đồng Văn Tú** | 22/09/2026 |
| **3** | Phòng khám hủy ca: Hoàn 100% + Voucher 20% | **Card 3.1** | 🩵 Backend | **Đồng Văn Tú** | 23/09/2026 |
| **4** | Giới hạn kê đơn tối đa 30 ngày bệnh mãn tính | **Card 3.3** | 🩵 Backend | **Nguyễn Văn Tùng** | 24/09/2026 |
| **5** | Giao diện Tiếp đón vãng lai (Walk-in Booking) | **Card 3.2** | 🔵 Frontend | **Trần Trọng Hoàn** | 23/09/2026 |
| **6** | Xem tệp kết quả xét nghiệm cũ trong buồng khám | **Card 3.4** | 🔵 Frontend | **Trần Văn Tiến** | 23/09/2026 |
| **7** | Checkbox cam kết Nghị định 13/2023/NĐ-CP | **Card 3.11** | 🔵 Frontend | **Trần Văn Tiến** | 24/09/2026 |
| **8** | Mã băm SHA-256 & QR xác thực đơn thuốc PDF | **Card 4.2** | 🔵 Frontend | **Trần Văn Tiến** | 30/09/2026 |

---

## 4. KẾT LUẬN

1. **Rõ ràng và duy nhất:** Mỗi thiếu sót đều có **đúng 1 Card đại diện** và **đúng 1 người chịu trách nhiệm**, không xảy ra tình trạng "cha chung không ai khóc" hoặc chồng chéo giữa các thành viên.
2. **Chuẩn hóa văn bản:** Báo cáo đã loại bỏ hoàn toàn các ký hiệu toán học LaTeX bị lỗi hiển thị, sử dụng văn bản Markdown thuần túy, tương thích hoàn hảo trên mọi trình xem tài liệu.
3. **Tiến độ khả thi:** 7/8 điểm thuộc phạm vi Sprint 3 (21/09 - 25/09/2026), chỉ duy nhất 1 điểm (Mã băm PDF) thuộc Sprint 4, giúp toàn đội tập trung tối đa nguồn lực hoàn thành dứt điểm Sprint 3 đúng hạn.
