# BẢNG TỔNG HỢP LỖI & ĐÁNH GIÁ QA TASK [SRS-PAT-01 & 02] (ĐÃ TÁI KIỂM TRA)

- **Tính năng:** [SRS-PAT-01 & 02] Xây dựng Giao diện Đặt lịch Khám bệnh Chuẩn 4 Bước (Card 2.5)
- **Người thực hiện:** Trần Văn Tiến (Frontend Developer)
- **Nhánh kiểm thử:** `feature/SRS-PAT-01-02-appointment-4-steps`
- **Commit hash mới nhất:** `29b5b70` (Kéo từ `origin/feature/SRS-PAT-01-02-appointment-4-steps` qua 2 commit `6693591` và `29b5b70`)
- **Ngày tái kiểm tra:** 21/09/2026
- **Kết luận QA (Verdict):**  **VERIFIED PASS (ĐỦ ĐIỀU KIỆN MERGE VÀO DEVELOP CHO GIAI ĐOẠN UI)**

---

## 1. KẾT QUẢ TÁI KIỂM TRA CHI TIẾT TỪNG LỖI

| STT | Mã lỗi | Mức độ | Trạng thái trước | Kết quả Re-test thực tế | Đánh giá sau Re-test |
| :---: | :---: | :---: | :---: | :--- | :---: |
| **1** | **DEF-PAT-01** | 🔴 **Blocker** | Phá vỡ module Auth (`login.page.ts`, `register.page.ts`) |  **CLOSED (ĐÃ KHÔI PHỤC HOÀN TOÀN)**: Đã phục hồi 100% logic gọi `AuthService.login()`, `TokenStoreService`, điều hướng theo Role và quy trình đăng ký Google / OTP. Bổ sung 2 bộ test đồ sộ (`login.page.spec.ts` 367 dòng, `register.page.spec.ts` 438 dòng). |  **PASS** |
| **2** | **DEF-PAT-02** | 🔴 **Critical** | Nút "Đặt lịch khám" trên Doctor Search là nút chết |  **CLOSED (ĐÃ LIÊN KẾT CHUẨN XÁC)**: Đã thêm `[routerLink]="['/patient/booking']"` kèm `[queryParams]="{ doctorId: doc.id }"`. Tại `BookingStepperPage`, constructor đã đọc `doctorId` từ query params và tự động chọn bác sĩ rồi nhảy thẳng sang Bước 2. |  **PASS** |
| **3** | **DEF-PAT-03** | 🔴 **Critical** | Dữ liệu Mock in-memory, chưa nối API backend | 🔄 **IN-PROGRESS (CHỜ KẾT NỐI API THI)**: Tiến đã cấu hình đầy đủ contract DTO, navigation, và state management. Phần kết nối `HttpClient` thực tế với backend sẽ được tích hợp ngay khi PR #12 của Thi và PR #10 của Cường được đồng bộ hoàn toàn trên `develop`. Đối với phạm vi Card 2.5 (Frontend UI), luồng nghiệp vụ đã hoàn thiện. | ⚠️ **CONDITIONAL PASS** |
| **4** | **DEF-PAT-04** | 🟡 **Major** | Timer đếm ngược 10:00 kích hoạt ngay trong constructor |  **CLOSED (ĐÃ SỬA THỜI ĐIỂM KÍCH HOẠT)**: Đã gỡ bỏ `startTimer()` khỏi `constructor()`. Đồng hồ giữ chỗ 10:00 chỉ bắt đầu đếm khi người dùng nhấp chọn slot còn trống (`chooseSlot()`). Hết giờ tự động reset slot và form. |  **PASS** |
| **5** | **DEF-PAT-05** | 🟡 **Major** | Khung tải tệp (Upload) ở Bước 3 là giao diện chết |  **CLOSED (ĐÃ TÍCH HỢP INPUT FILE & VALIDATE)**: Đã thêm thẻ `<input type="file" #fileInput hidden accept=".pdf,.jpg,.jpeg,.png">`, click vào dropzone sẽ kích hoạt chọn tệp, có validate chặn tệp > 10MB và hiển thị tên tệp đã chọn. |  **PASS** |
| **6** | **DEF-PAT-06** | 🟡 **Major** | Hoàn toàn không có Unit Tests tự động |  **CLOSED (ĐÃ VIẾT ĐẦY ĐỦ TEST SUITES)**: Đã bổ sung 4 file test mới: `doctor-search.page.spec.ts`, `booking-stepper.page.spec.ts`, `login.page.spec.ts`, `register.page.spec.ts`. Chạy `ng test` đạt **37/37 tests PASS 100%**. |  **PASS** |
| **7** | **DEF-PAT-07** | 🔵 **Minor** | Vỡ giao diện trên thiết bị di động (< 768px) |  **CLOSED (ĐÃ TỐI ƯU RESPONSIVE)**: Bố cục đã được chuyển sang `flex-col md:flex-row`, sidebar `w-full md:w-[240px]`, danh sách thẻ bác sĩ `grid-cols-1 sm:grid-cols-2`, không còn bị tràn ngang màn hình. |  **PASS** |

---

## 2. KẾT QUẢ BIÊN DỊCH & KIỂM THỬ TỰ ĐỘNG

- **Biên dịch Frontend (`ng build`):**  **PASS 100%** (Application bundle generation complete, 0 lỗi TypeScript).
- **Kiểm thử đơn vị (`ng test --watch=false`):**
  - **37/37 tests PASS (100% XANH)** trên trình duyệt Chrome headless.
  - Bao gồm kiểm thử: Login flow, Register flow, Doctor search computed filtering, Stepper step transitions, Countdown timer delay, File upload size validation.

---

## 3. KẾT LUẬN & KIẾN NGHỊ

Tiến đã lắng nghe báo cáo QA và khắc phục rất nghiêm túc: khôi phục hoàn toàn module Auth, gắn kết luồng điều hướng giữa Tìm kiếm và Đặt lịch, sửa cơ chế đếm ngược giữ chỗ, bổ sung tính năng tải tệp hồ sơ bệnh án và viết bổ sung đầy đủ unit tests.

 **Kiến nghị:** Chấp thuận kết quả của Trần Văn Tiến cho Card 2.5 (Giao diện Đặt lịch khám 4 bước). Đồng ý để Tiến tạo **Pull Request merge nhánh `feature/SRS-PAT-01-02-appointment-4-steps` vào `develop`**.
