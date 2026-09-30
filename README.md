# E-healthcare

## Bắt buộc sau Card 4.3: cấu hình khóa mã hóa y tế

API chủ động dừng khởi động nếu thiếu `MEDICAL_DATA_ENCRYPTION_KEY`. Mỗi thành viên cần cập nhật file `.env` local không được Git track:

```dotenv
MEDICAL_DATA_ENCRYPTION_KEY=<64 ký tự hex ngẫu nhiên>
MEDICAL_DATA_ENCRYPTION_KEY_VERSION=1
MEDICAL_DATA_ENCRYPTION_KEYS_JSON=
```

Tạo khóa local trên PowerShell:

```powershell
[Convert]::ToHexString([Security.Cryptography.RandomNumberGenerator]::GetBytes(32)).ToLowerInvariant()
```

Hoặc bằng OpenSSL:

```bash
openssl rand -hex 32
```

Không commit/chia sẻ khóa qua Git hoặc kênh chat. Phải giữ nguyên khóa đã dùng để mã hóa database hiện tại; thay khóa tùy ý sẽ làm dữ liệu cũ không giải mã được. Nếu dùng chung database dump có ciphertext, nhận đúng development key qua secret manager/kênh bảo mật của team. Staging/production phải inject khóa từ secret manager và làm theo `docs/runbooks/card-4.3-database-roles-and-keys.md`.
