# Card 4.3 — Database roles và quản lý khóa

## Phân tách quyền

- Migration owner: chạy migration/DDL, không dùng trong API runtime.
- Application runtime: `LOGIN`, không superuser/owner, CRUD bảng nghiệp vụ; riêng `audit_logs` chỉ `SELECT, INSERT`.
- Backup operator: không cấp cho API; DevOps quản lý quyền pgBackRest và repository.
- DBA break-glass: nằm ngoài credentials thường trực của ứng dụng, mọi lần sử dụng phải có ticket và audit vận hành.

Chạy script bằng owner sau migration, truyền password từ secret store hoặc prompt của CI; không đặt password trên history của terminal dùng chung:

```text
psql "$DATABASE_URL_MIGRATION" \
  -v app_role=ehealth_app \
  -v app_password='<secret>' \
  -v backup_role=ehealth_backup \
  -f scripts/database/provision-card43-roles.sql
```

Sau đó `DATABASE_URL` của API phải dùng `ehealth_app`, không dùng `postgres`/migration owner. Kiểm tra bằng `SELECT current_user`, `\du` và test trực tiếp rằng `UPDATE`, `DELETE`, `TRUNCATE audit_logs` đều thất bại.

API staging/production tự kiểm tra role khi khởi động. `DATABASE_MIGRATION_URL` chỉ dành cho CLI migration; không inject biến này vào container API nếu nền tảng cho phép tách secret theo workload.

## Cutover mã hóa dữ liệu cũ

- Migration mã hóa chạy backfill theo batch 500 row và có thể chạy lại nếu bị ngắt trước contract phase.
- Trong thời gian migration, đặt phiên bản ứng dụng cũ ở maintenance/read-only để không có writer tiếp tục ghi cột plaintext giữa lần kiểm tra batch cuối và lúc drop cột.
- Chạy rehearsal trên bản sao dữ liệu tổng hợp/đã khử định danh trước staging. Theo dõi lock, WAL, CPU, I/O và thời gian từng batch.
- Sau migration, xác minh không còn cột plaintext và mọi row có ciphertext cùng `encryption_key_version > 0` trước khi mở writer.
- Nếu môi trường dùng chung đã từng chạy migration này, không sửa file migration; tạo migration khắc phục mới và xin Tech Lead duyệt cutover.

## Khóa mã hóa y tế

- Local/test: khóa 64 ký tự hex có thể nằm trong `.env` không Git track.
- `MEDICAL_DATA_ENCRYPTION_KEY` là bắt buộc; API fail-fast khi biến thiếu hoặc không đúng 64 ký tự hex. Sau khi cập nhật nhánh, mỗi thành viên phải tự thêm key vào `.env` trước khi chạy server.
- Tạo key local bằng PowerShell: `[Convert]::ToHexString([Security.Cryptography.RandomNumberGenerator]::GetBytes(32)).ToLowerInvariant()`; hoặc OpenSSL: `openssl rand -hex 32`.
- Không đổi key của database đang có ciphertext. Thành viên dùng chung database dump phải nhận đúng development key qua secret manager/kênh bảo mật, không qua Git hoặc chat.
- Staging/production: secret manager inject `MEDICAL_DATA_ENCRYPTION_KEY`, version và keyring lúc runtime; không ghi vào image, Git, migration log hay DB dump.
- Mỗi ciphertext lưu `encryption_key_version`. Khi rotate, keyring phải giữ các phiên bản còn cần đọc/restore; không thu hồi key cũ trước khi re-encrypt và hết retention backup liên quan.
- Khóa pgBackRest phải khác khóa dữ liệu y tế và được recovery tách biệt.
- Admin hệ thống không có endpoint giải mã EMR. Break-glass lâm sàng là workflow riêng cần owner, lý do, thời hạn và audit; không suy quyền đọc bệnh án từ `ROLE_ADMIN`.

## Contract tích hợp xuất PDF đơn thuốc

Sau migration Card 4.3, các cột plaintext của `prescription_items` không còn tồn tại. Mọi consumer, bao gồm `PrescriptionPdfService`, phải:

1. Xác thực bệnh nhân/appointment trước khi giải mã.
2. Đọc medical record bằng `ClinicalEncryptedStore.findMedicalRecordForPatientByAppointment(...)`.
3. Đọc đơn thuốc bằng `ClinicalEncryptedStore.findPrescription(...)`.
4. Không query relation `PrescriptionEntity.items` trực tiếp và không tham chiếu các cột thuốc plaintext cũ.

`verify()` chỉ dùng mã đơn, doctor ID và timestamp để kiểm tra hash nên không cần giải mã nội dung thuốc. Không đưa nội dung đơn thuốc vào response verification công khai.

## Xoay khóa dữ liệu y tế

1. Tạo khóa 64 ký tự hex mới trong secret manager và tăng `MEDICAL_DATA_ENCRYPTION_KEY_VERSION`.
2. Đưa các khóa cũ còn cần đọc vào `MEDICAL_DATA_ENCRYPTION_KEYS_JSON`. Không khai báo lại version hiện tại trong JSON.
3. Chạy kiểm kê không thay đổi dữ liệu:

```powershell
npm run security:key-rotate --workspace=@ehealth/server -- --dry-run --batch-size=250
```

4. Trong maintenance window, chạy rotation bằng `DATABASE_URL` runtime có quyền update các bảng nghiệp vụ nhưng không phải owner/superuser:

```powershell
npm run security:key-rotate --workspace=@ehealth/server -- --batch-size=250
```

Command dùng advisory lock, xử lý theo batch và chỉ đổi row có version cũ. Có thể chạy lại sau khi gián đoạn; row đã ở version mới không bị mã hóa lại.

5. Xác minh count version cũ bằng 0, round-trip EMR/Rx/Addendum và restore backup còn hạn.
6. Không xóa khóa cũ cho đến khi mọi ciphertext và mọi backup còn retention đã chuyển/hết hạn. Không log hoặc truyền khóa qua tham số command line.
