# Card 4.3 — Audit append-only và retention tối thiểu 5 năm

## Chính sách trong ứng dụng/CSDL

- `audit_logs` là append-only. API runtime chỉ có `SELECT, INSERT`; trigger từ chối `UPDATE`, `DELETE`, `TRUNCATE`.
- Ứng dụng không có endpoint mutation hoặc cleanup job cho bảng này.
- Trong phạm vi codebase, bản ghi được giữ vô thời hạn. Không được thêm lifecycle xóa bản ghi dưới 5 năm.
- `actor_display_name`, `actor_role`, action, outcome, IP, User-Agent và timestamp là snapshot; không được cascade theo thay đổi/xóa tài khoản.
- Migration owner là quyền break-glass. Mọi thao tác DDL/retention bằng owner cần ticket, phê duyệt và audit vận hành ngoài database đích.

## Kiểm tra định kỳ

Chạy bằng tài khoản read-only vận hành:

```sql
SELECT
  MIN(occurred_at) AS oldest_event,
  MAX(occurred_at) AS newest_event,
  COUNT(*) AS event_count,
  pg_size_pretty(pg_total_relation_size('public.audit_logs')) AS total_size
FROM public.audit_logs;
```

Kiểm tra quyền runtime và trigger:

```sql
SELECT current_user,
       has_table_privilege(current_user, 'public.audit_logs', 'SELECT') AS can_select,
       has_table_privilege(current_user, 'public.audit_logs', 'INSERT') AS can_insert,
       has_table_privilege(current_user, 'public.audit_logs', 'UPDATE') AS can_update,
       has_table_privilege(current_user, 'public.audit_logs', 'DELETE') AS can_delete,
       has_table_privilege(current_user, 'public.audit_logs', 'TRUNCATE') AS can_truncate;

SELECT tgname, tgenabled
FROM pg_trigger
WHERE tgrelid = 'public.audit_logs'::regclass AND NOT tgisinternal;
```

Kỳ vọng: `SELECT/INSERT=true`, các quyền mutation `false`, hai trigger append-only ở trạng thái enabled.

## Capacity và cảnh báo

- Theo dõi dung lượng bảng/index và tốc độ tăng theo ngày; cảnh báo trước ngưỡng dung lượng do DevOps phê duyệt.
- Backup retention ngắn hạn không thay thế audit retention 5 năm.
- Production cần repository off-host/WORM, capacity plan và restore drill do Tech Lead/DevOps ký duyệt.
- Không tuyên bố tuân thủ retention production chỉ từ migration hoặc local integration test.

## Archive sau này

Nếu cần partition/archive, phải triển khai bằng migration mới và giữ nguyên khả năng truy vấn/khôi phục tối thiểu 5 năm. Cấm detach/drop partition hoặc xóa object storage khi chưa qua retention gate và phê duyệt pháp lý.
