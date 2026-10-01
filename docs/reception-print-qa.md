# SRS-REC-01 — Phiếu tiếp đón K80 và phiếu thu A5

Tích hợp phần in từ nhánh `feature/SRS-REC-01-print-receipts` vào kiến trúc ReceptionistFacade/ReceptionistApiService của nhánh reception integration. Luồng in được kiểm tra trên `feature/SRS-REC-01-print-integration`.

## Cấu hình và contract

- API mới: `GET /api/v1/reception/clinic-profile`, dùng quyền `ROLE_RECEPTIONIST` sẵn có của controller.
- Contract `ClinicPrintInfo` nằm trong `shared/src/interfaces/clinic-print.interface.ts`; frontend và backend cùng import qua `@shared/interfaces`.
- Cấu hình backend: `CLINIC_NAME`, `CLINIC_ADDRESS` là bắt buộc để in; `CLINIC_PHONE`, `CLINIC_TAX_CODE`, `CLINIC_LICENSE_NUMBER`, `CLINIC_LOGO_URL` là tùy chọn. Xem `.env.example`.
- Thiếu tên/địa chỉ trả 503; vẫn thực hiện được check-in và thanh toán, sau đó tải lại thông tin để in lại. Không tự điền dữ liệu pháp lý giả.
- BHYT, thanh toán doanh nghiệp và các dữ liệu pháp lý khác chưa có nguồn trong API không được suy diễn hoặc hard-code. Phiếu này là phiếu thu tại quầy, không bổ sung hệ thống hóa đơn điện tử.
- Đây là bổ sung contract cần thông báo cho nhóm khi review PR để đồng bộ triển khai client/server/config.

## Hành vi đã triển khai

- Tra cứu theo mã lịch hẹn, điện thoại hoặc token QR có chữ ký từ máy quét. Mã QR in trên K80 chỉ chứa mã lịch hẹn và có thể tra cứu bằng ô nhập tay; không in token có chữ ký.
- Thu tiền mặt theo contract hiện tại. Sau thành công tải lại lịch hẹn từ backend để xác định `canCheckIn`, `blockedReason`; nếu tải lại lỗi thì không cho thu lần nữa hoặc tự bật check-in.
- Check-in thành công cập nhật số thứ tự và tự mở hộp thoại in K80. Lỗi in không làm thay đổi kết quả check-in/thanh toán.
- In lại phiếu tiếp đón không POST check-in lần nữa. In lại phiếu thu luôn GET `/appointments/:id/receipt` để backend ghi audit và trả đúng mã phiếu cũ.
- Component in standalone chỉ nhận print model, render, format VND/giờ Việt Nam và in; không gọi API hoặc chứa router/nghiệp vụ.
- Tài liệu in nằm trong iframe riêng, chỉ chứa phiếu và stylesheet, nên không mang theo controls hoặc chiều cao app shell. Có chờ stylesheet/font/logo, hủy chờ khi rời trang, ẩn logo lỗi và dọn iframe sau `afterprint`/khi component bị hủy.
- K80: giấy rộng 80 mm, lề 4 mm, nội dung 72 mm; chiều cao tính theo nội dung. A5: giấy 148 × 210 mm, lề dọc 10 mm/ngang 12 mm, nội dung 124 mm.
- Không thông báo máy in đã in thành công chỉ dựa vào việc mở hộp thoại.
- Phiếu dùng Noto Sans WOFF2 Latin và Việt (regular/bold) đóng gói trong `client/public/fonts/`, kèm giấy phép OFL. Trước khi gọi hộp thoại in, component đợi stylesheet và cả bốn phần font cần thiết tải xong; lỗi tải font sẽ hiện trạng thái có thể in lại.

## Kiểm tra tự động

Chạy từ thư mục gốc:

```powershell
npm run build:client
npm run test --workspace=ehealth-web-client -- --watch=false --browsers=ChromeHeadless --progress=false
npm run test --workspace=@ehealth/server -- --runTestsByPath test/clinic-print-profile.spec.ts test/reception-counter-payment.spec.ts test/reception-check-in-qr-http.spec.ts test/reception-check-in-window.spec.ts
npm run qa:print --workspace=ehealth-web-client
```

QA PDF cần Node 22+ và Chrome/Chromium. Có thể đặt `CHROME_BIN` nếu trình duyệt không ở đường dẫn mặc định. Script chạy browser headless với profile tạm, API giả lập trên loopback và dữ liệu tổng hợp; không gọi backend thật hoặc gửi lệnh in vật lý.

Kết quả ngày 24/09/2026 trên nhánh tích hợp:

- Frontend: **121/121 pass**, gồm mapper, component và các luồng facade check-in, thu tiền, in lại, lỗi clinic profile, giữ giao dịch khi in lỗi.
- Backend: **13/13 pass** (clinic profile và ba suite hồi quy receipt/check-in).
- Production Angular build: pass, trong budget. Có cảnh báo CommonJS từ `qrcode`; thư viện nằm trong phần tải lười của quầy tiếp đón.
- Đã kiểm tra ảnh render tiếng Việt, số thứ tự 1000, tên/chuyên khoa/phòng dài, số tiền lớn, logo không tải được và khu vực chữ ký.
- QA PDF kiểm tra font Noto Sans được tải và nhúng; nếu PDF vẫn đúng mà bản giấy mất dấu/ô vuông, kiểm tra driver và chế độ raster của máy in thực tế.

## Print Preview / PDF QA — phần 11

Chrome headless `153.0.8010.53`, Windows. Script điều khiển trang production, ghi nhận tài liệu tại thời điểm gọi `window.print()` của iframe rồi xuất tài liệu đó bằng `Page.printToPDF` với `preferCSSPageSize`. Đây là kiểm tra trình bày PDF và luồng UI/API giả lập; không phải xác nhận hộp thoại native hay thiết bị vật lý.

| Bản in | Số trang | Kích thước PDF đo được (mm) | Tràn ngang |
| --- | --- | --- | --- |
| K80 thông thường | 1 | 80,09 × 142,16 | Không |
| A5 thông thường | 1 | 148,17 × 209,89 | Không |
| K80 sau thu tiền | 1 | 80,09 × 142,16 | Không |
| A5 tên/chuyên khoa dài, số tiền lớn, logo lỗi | 1 | 148,17 × 209,89 | Không |
| K80 dữ liệu dài, số thứ tự 1000, logo lỗi | 1 | 80,09 × 184,83 | Không |

Sai số nhỏ do quy đổi pixel/point của Chromium. A5 đã được chỉnh khoảng cách và cỡ chữ sau khi QA phát hiện dữ liệu dài đẩy chữ ký sang trang 2; bảng trên là kết quả sau sửa.

Luồng QA pass:

1. Check-in → K80 → mô phỏng trả về/hủy hộp thoại → in lại: chỉ một POST check-in.
2. Thu tiền → A5 → tải lại eligibility → check-in → K80 → in lại A5: một POST thu tiền, một POST check-in, một GET receipt.
3. Chạy lại luồng 2 với dữ liệu dài, số tiền lớn và logo lỗi.
4. Check-in bị API từ chối: không mở tài liệu in.

PDF, PNG và `report.json` được tạo tại `client/dist/print-qa/` (thư mục build không commit). Tên file: `k80`, `a5`, `k80-after-payment`, `a5-long`, `k80-long`.

Không đảm bảo mọi độ dài tùy ý đều vừa một A5: nội dung quá dài vẫn có thể phân trang; phần chữ ký và từng hàng dữ liệu được giữ nguyên khối. Khổ giấy/scale/header-footer của driver thực tế cần kiểm tra theo checklist phần 12.

## Phần 12 — tình trạng thiết bị

Chưa thực hiện smoke test máy in thật vì máy chỉ có các máy in ảo. [Checklist và biên bản cần hoàn tất tại quầy](reception-print-physical-smoke-test.md) ghi rõ điều kiện, thao tác và bằng chứng cần thu thập. Không đánh dấu phần 12 đã pass dựa vào kết quả PDF.
