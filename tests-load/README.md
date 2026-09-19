# Card 2.6 - Slot concurrency and load tests

Bộ kiểm thử này xác minh NFR-01 và Section 5.1 qua API, Redis và PostgreSQL thật. Đây không phải unit test mock.

## Phạm vi

| Profile | Mục tiêu chính |
| --- | --- |
| `smoke` | Hai người dùng tranh chấp: đúng một `201`, một `409` |
| `contention` | 100 VU đồng bộ giữ cùng một slot: đúng `1/99` |
| `microburst` | Một batch 100 HTTP request song song giữ cùng một slot |
| `idempotency` | Cùng một người dùng reserve lặp lại vẫn giữ duy nhất lock của mình |
| `release` | Non-owner không xóa được lock; owner xóa được |
| `ttl` | TTL 600 giây, hết hạn và người khác giữ lại được |
| `confirm` | Hai confirm đồng thời: một appointment `CONFIRMED`, một `409` |
| `throughput` | Tối thiểu 100 giao dịch reserve/release hợp lệ mỗi giây trong 60 giây steady |
| `ccu` | Đạt và duy trì 500 VU trong cửa sổ steady |
| `all` | Chạy toàn bộ profile theo thứ tự an toàn; `confirm` chạy cuối |

## Yêu cầu môi trường

- Docker Engine/Compose hoạt động.
- Node.js và npm tương thích với repository.
- API phải được khởi động bằng đúng PostgreSQL/Redis dành cho Card 2.6.
- Image k6 mặc định được ghim tại `grafana/k6:0.50.0`.

Không bắt buộc có file `.env`. Có thể inject biến môi trường trực tiếp vào tiến trình API. Nếu tạo `.env` local từ `.env.example`, không commit file đó.

Hạ tầng kiểm thử dùng project, container, network và volume riêng trong `docker-compose.slot-test.yml`:

- project: `ehealth-card26`
- PostgreSQL: `ehealth-card26-postgres`
- Redis: `ehealth-card26-redis`
- volume: `ehealth-card26-postgres-data`, `ehealth-card26-redis-data`

Không dùng `docker compose down -v` trừ khi người vận hành chủ động chấp nhận xóa dữ liệu test.

## Chạy test

Chạy từ root repository `E-healthcare`. Trước hết khởi động hạ tầng cô lập và migration:

```powershell
$env:POSTGRES_PORT = '55433'
$env:REDIS_PORT = '56380'
$env:REDIS_INSIGHT_PORT = '58002'
$env:POSTGRES_USER = 'postgres'
$env:POSTGRES_PASSWORD = 'postgres_password'
$env:POSTGRES_DB = 'ehealth_db'
docker compose --project-name ehealth-card26 --project-directory . `
  -f tests-load/docker-compose.slot-test.yml up -d postgres redis

$env:DATABASE_URL = 'postgresql://postgres:postgres_password@127.0.0.1:55433/ehealth_db'
npm run migration:run --workspace=@ehealth/server
```

Trong terminal API riêng, inject cấu hình local-only rồi khởi động server:

```powershell
$env:NODE_ENV = 'test'
$env:PORT = '3011'
$env:DATABASE_URL = 'postgresql://postgres:postgres_password@127.0.0.1:55433/ehealth_db'
$env:REDIS_HOST = '127.0.0.1'
$env:REDIS_PORT = '56380'
$env:TRUSTED_PROXY_CIDRS = '127.0.0.1/32,::1/128,172.16.0.0/12'
$env:COOKIE_SECURE = 'false'
$env:JWT_ACCESS_SECRET = 'card26-local-access-secret-at-least-32-bytes'
$env:JWT_REFRESH_SECRET = 'card26-local-refresh-secret-at-least-32-bytes'
$env:OTP_HMAC_SECRET = 'card26-local-otp-secret-at-least-32-bytes'
npm run start:dev --workspace=@ehealth/server
```

Trong terminal khác, chạy profile:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File tests-load\run-slot-tests.ps1 `
  -Action Run `
  -Profile contention `
  -RunId card26-contention-001 `
  -BaseUrl http://host.docker.internal:3011 `
  -PostgresPort 55433 `
  -RedisPort 56380 `
  -RedisInsightPort 58002
```

`RunId` phải duy nhất cho mỗi lần thực thi chính thức. Không dùng `-SkipApiPreflight` cho evidence nghiệm thu. Preflight mặc định xác minh:

1. 61 địa chỉ `X-Forwarded-For` riêng không bị gom vào giới hạn 60 request/phút/IP.
2. API quan sát đúng Redis canary.
3. API confirm được doctor, patient và slot đã seed trong đúng PostgreSQL.
4. Fixture được reset về trạng thái sạch trước khi đo.

Các action vận hành:

```powershell
# Chỉ xem kế hoạch, không thay đổi trạng thái
powershell -File tests-load\run-slot-tests.ps1 -DryRun -Profile contention `
  -RunId card26-dryrun-001

# Seed và giữ fixture để điều tra thủ công
powershell -File tests-load\run-slot-tests.ps1 -Action Seed -Profile contention `
  -RunId card26-debug-001

# Kiểm tra hoặc dọn đúng fixture do run sở hữu
powershell -File tests-load\run-slot-tests.ps1 -Action Verify `
  -RunId card26-debug-001
powershell -File tests-load\run-slot-tests.ps1 -Action Cleanup `
  -RunId card26-debug-001
```

## Điều kiện PASS

- Contention/microburst: chính xác một winner, `N-1` conflict, không response ngoài dự kiến và không network error.
- `reserve-slot` p95 nhỏ hơn 300 ms trong profile được chỉ định.
- Lần giữ chỗ ban đầu trả TTL chính xác 600; lần idempotent trả TTL còn lại trong khoảng 1-600; lock cũ hết hạn; lock mới có đúng holder và TTL Redis trực tiếp trong khoảng 1-600 giây.
- Release và confirm không để lại Redis lock.
- Confirm tạo đúng một appointment, đúng một slot `BOOKED`, không duplicate theo `schedule_id`.
- Throughput có ít nhất `MIN_BUSINESS_TPS * STEADY_SECONDS` giao dịch reserve/release thành công và không dropped iteration.
- CCU có `slot_active_vus` tối thiểu 500 trong toàn bộ cửa sổ steady được quan sát.
- DB invariant phải pass; việc chỉ tạo được file summary không đủ để kết luận PASS.

## Evidence

Mặc định evidence được ghi ra ngoài Git repository tại:

```text
../reports/card-2.6-slot-concurrency/<UTC>_<commit>_<runId>/
```

Mỗi run có manifest gồm commit SHA, trạng thái dirty, SHA-256 từng file test, image ID, thời gian bắt đầu/kết thúc và trạng thái cuối. Các file JSON/log khác ghi fixture, topology canary, k6 summary, Redis verification, DB verification và cleanup.

Runner từ chối `EvidenceRoot` nằm bằng hoặc nằm bên trong repository. Không ghi secret, password, token, cookie hay connection string vào evidence.

## Safety

- Chỉ chạy trên `local`, `test`, `testing`, `qa`, `staging` hoặc `performance`.
- Host phải nằm trong allowlist; tên giống production bị từ chối.
- Fixture dùng UUID xác định theo `RunId`, marker sở hữu và cleanup theo thứ tự khóa ngoại.
- Redis cleanup dùng compare-and-delete và từ chối xóa lock không thuộc run.
- Không `TRUNCATE`, không xóa volume, không sửa migration cũ.
- Không dùng `-SkipApiPreflight` hoặc `-SkipMigrations` nếu chưa có bằng chứng môi trường tương ứng.
