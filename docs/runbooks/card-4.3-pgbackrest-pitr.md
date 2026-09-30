# Card 4.3 — pgBackRest, WAL archive và phục hồi PITR

## Mục tiêu và giới hạn

- Full physical backup lúc `02:00 Asia/Ho_Chi_Minh` mỗi ngày.
- PostgreSQL ép chuyển WAL tối đa mỗi `300s` bằng `archive_timeout`; WAL được archive liên tục, không phải đợi cron 15 phút. Mục tiêu thiết kế là RPO nhỏ hơn 15 phút.
- Restore phải diễn ra trên cluster/volume mới. Cấm ghi đè cluster nguồn khi diễn tập.
- `pgbackrest_repo` trong Compose chỉ là đích dev/test. Production phải thay bằng repository mã hóa ở storage off-host, có kiểm soát truy cập, cảnh báo dung lượng và chính sách retention do DevOps phê duyệt.
- RPO/RTO chỉ được công bố đạt sau diễn tập có canary timestamp và đo thời gian; cấu hình này không tự tạo bằng chứng nghiệm thu Card 4.8.

## Secrets và điều kiện trước khi chạy

Tạo `.env` local không Git track và khai báo tối thiểu:

```dotenv
PGBACKREST_REPO_CIPHER_PASS=<random-secret-at-least-32-characters>
PGBACKREST_RETENTION_FULL=7
EHEALTH_BACKUP_FULL_TIME=02:00
TZ=Asia/Ho_Chi_Minh
```

Khóa repository backup phải khác `MEDICAL_DATA_ENCRYPTION_KEY`. Cả hai khóa phải nằm ngoài Git, ngoài database dump và có bản sao recovery được quản lý tách biệt. Nếu mất một trong hai khóa, backup y tế không còn khả năng khôi phục đầy đủ.

## Khởi động profile backup

```powershell
docker compose -f docker-compose.yml -f docker-compose.backup.yml config
docker compose -f docker-compose.yml -f docker-compose.backup.yml build postgres
docker compose -f docker-compose.yml -f docker-compose.backup.yml up -d postgres pgbackrest-scheduler
```

Kiểm tra bắt buộc:

```powershell
docker exec ehealth-postgres pgbackrest --config=/tmp/ehealth-pgbackrest.conf --stanza=ehealth check
docker exec ehealth-postgres pgbackrest --config=/tmp/ehealth-pgbackrest.conf --stanza=ehealth info
docker exec ehealth-postgres psql -U postgres -d ehealth_db -Atc "show archive_mode; show archive_timeout; show archive_command;"
```

Để tạo full backup có kiểm soát ngoài lịch 02:00:

```powershell
docker exec ehealth-postgres pgbackrest --config=/tmp/ehealth-pgbackrest.conf --stanza=ehealth --type=full backup
docker exec ehealth-postgres pgbackrest --config=/tmp/ehealth-pgbackrest.conf --stanza=ehealth info
```

Không đưa giá trị cipher pass, connection string hoặc dữ liệu bệnh án vào log/evidence.

## Diễn tập restore an toàn

1. Ghi `incident_time`, backup label và một canary transaction/audit ID trước sự cố giả lập.
2. Xác minh source container, source volume và repository. Tạo **volume restore mới**, tên có hậu tố ngày/giờ; tuyệt đối không mount `ehealth-postgres-data` làm đích restore.
3. Dừng mọi container tạm nếu chúng đang dùng volume restore; volume đích phải trống.
4. Chạy image `ehealth-postgres-pgbackrest:16` với repository backup read-only và volume mới tại `/var/lib/postgresql/data`, tạo config từ secret runtime, sau đó chạy:

```text
pgbackrest --config=/tmp/ehealth-pgbackrest.conf --stanza=ehealth \
  --type=time --target="<UTC target timestamp>" --target-action=promote restore
```

5. Khởi động PostgreSQL phục hồi ở cổng khác (ví dụ `55454`) với repository mount read-only và `EHEALTH_BACKUP_REPO_READ_ONLY=true`; không kết nối API production. Kiểm tra `pg_is_in_recovery()`, timeline, migration list và canary ID.
6. Smoke test bằng credentials test: auth, giải mã EMR/Rx/Addendum đúng key version, ghi/đọc audit mới, và xác nhận UPDATE/DELETE/TRUNCATE audit vẫn bị từ chối.
7. Tính RPO bằng timestamp commit cuối được phục hồi so với mốc sự cố; đạt khi `< 900s`. Tính RTO từ mốc bắt đầu sự cố đến lúc toàn bộ smoke gate PASS; đạt khi `< 7200s`.
8. Lưu manifest/checksum, backup label, target time, thời lượng, kết quả gate và người thực hiện. Không lưu PHI hay secret.
9. Sau review evidence, xóa **chỉ** container/volume restore đã xác minh đúng tên; không xóa source/repository.

## Failure gates

- `archive_command` khác cấu hình dự kiến, `pg_stat_archiver.failed_count` tăng kể từ lần kiểm tra trước, `last_failed_time` mới hơn lần backup/check thành công, WAL pending tăng liên tục, backup/check lỗi, repo đầy hoặc scheduler lỡ lịch: cảnh báo vận hành và không tuyên bố RPO đạt. Không dùng riêng tổng tích lũy `failed_count > 0`, vì lỗi khởi tạo trước `stanza-create` vẫn còn trong counter sau khi hệ thống đã hồi phục.
- Thiếu WAL, thiếu key, checksum sai hoặc restore chưa replay đến target: restore phải FAIL rõ ràng; cấm promote như một bản phục hồi thành công.
- Không tự động giải mã dữ liệu ra plaintext để rollback migration. Dùng code tương thích key version hoặc quy trình restore đã duyệt.
