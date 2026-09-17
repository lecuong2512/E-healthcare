# Báo cáo thực hiện SRS-DOC-01 và SRS-PAT-01

## 1. Thông tin chung

- Dự án: E-Healthcare Portal.
- Phạm vi backend:
  - SRS-DOC-01: Khai báo và quản lý ca làm việc của bác sĩ.
  - SRS-PAT-01: Tìm kiếm, lọc và xem thông tin bác sĩ.
- Tài liệu đối chiếu:
  - `docs/SRS-EHEALTH-2026-V1.docx`.
  - `server/src/modules/doctor/ke-hoach-SRS-DOC-01-SRS-PAT-01.md`.
  - `server/src/modules/doctor/quy-uoc-du-an.md`.
- Công nghệ: NestJS, TypeORM, PostgreSQL, Redis và Jest.

## 2. Kết quả thực hiện SRS-DOC-01

### 2.1 Chuẩn hóa định danh bác sĩ

Migration hiện tại quy định:

- `doctors.id` là khóa chính của hồ sơ bác sĩ.
- `doctors.user_id` là khóa ngoại duy nhất tham chiếu `users.id`.
- `doctor_schedules.doctor_id` tham chiếu `doctors.id`.

Entity và luồng phân quyền đã được sửa theo đúng mô hình trên:

- Quan hệ `DoctorEntity.user` được khai báo `OneToOne`.
- `DoctorEntity.id` được dùng làm `doctorId` trong URL, lịch làm việc và lịch hẹn.
- JWT vẫn chứa `userId` của bảng `users`.
- `OwnDoctorGuard` kiểm tra quyền sở hữu bằng điều kiện đồng thời:

```text
doctors.id = route doctorId
doctors.user_id = JWT userId
```

Việc này khắc phục lỗi so sánh trực tiếp `users.id` với `doctors.id`, vốn là hai định danh khác nhau.

### 2.2 API quản lý lịch làm việc

| Method | Endpoint | Vai trò | Mô tả |
|---|---|---|---|
| POST | `/api/v1/doctors/:doctorId/schedules` | DOCTOR, ADMIN | Khai báo một ca làm việc và tự sinh các slot con. |
| GET | `/api/v1/doctors/:doctorId/schedules?from=&to=` | DOCTOR, ADMIN, RECEPTIONIST | Xem lịch theo khoảng ngày. |
| PATCH | `/api/v1/doctors/:doctorId/schedules/:scheduleId` | DOCTOR, ADMIN | Sửa ngày hoặc giờ của một slot còn trống. |
| DELETE | `/api/v1/doctors/:doctorId/schedules/:scheduleId` | DOCTOR, ADMIN | Xóa một slot còn trống. |

Ví dụ request tạo ca:

```json
{
  "date": "2026-09-24",
  "shiftType": "MORNING",
  "slotDurationMinutes": 30
}
```

Quy tắc chia slot:

- Ca sáng: `08:00-12:00`.
- Ca chiều: `13:30-17:30`.
- Thời lượng hợp lệ: 15 hoặc 30 phút.
- Mỗi slot được lưu thành một bản ghi trong `doctor_schedules`.
- Trạng thái ban đầu của tất cả slot là `AVAILABLE`.

Ví dụ ca sáng 30 phút sinh ra 8 slot:

```text
08:00-08:30
08:30-09:00
09:00-09:30
09:30-10:00
10:00-10:30
10:30-11:00
11:00-11:30
11:30-12:00
```

### 2.3 Quy ước buồng khám

Theo kế hoạch đã thống nhất, `room_number` là thuộc tính cố định của hồ sơ bác sĩ trong bảng `doctors`, không phải thuộc tính riêng của từng slot.

Vì vậy:

- DTO tạo ca không nhận `roomNumber`.
- Service đọc `room_number` từ hồ sơ bác sĩ.
- Response tạo và xem lịch trả thêm `roomNumber` để client hiển thị.

### 2.4 Quy tắc nghiệp vụ

Các quy tắc đã triển khai:

- Không cho khai báo hoặc chuyển lịch sang ngày trong quá khứ.
- Lịch tuần sau phải đăng ký trước 17:00 Thứ Sáu tuần hiện tại theo múi giờ `Asia/Ho_Chi_Minh`.
- Không cho phép slot của cùng bác sĩ bị trùng hoặc chồng thời gian.
- Chỉ cho sửa hoặc xóa slot có trạng thái `AVAILABLE`.
- Slot `HOLDING`, `BOOKED` hoặc `OFF` bị từ chối sửa/xóa với HTTP 409.
- PATCH yêu cầu `version` để phát hiện hai request cập nhật đồng thời.
- UPDATE kiểm tra đồng thời `id`, `doctor_id`, `status` và `version` trong cùng câu lệnh.
- Cache tìm kiếm và profile bác sĩ được xóa sau khi lịch thay đổi.

### 2.5 Bảo vệ overlap ở tầng cơ sở dữ liệu

Migration mới bổ sung exclusion constraint PostgreSQL:

```sql
EXCLUDE USING GIST (
  doctor_id WITH =,
  tsrange(date + start_time, date + end_time, '[)') WITH &&
)
```

Constraint bảo vệ dữ liệu ngay cả khi hai request tạo lịch chạy đồng thời và cùng vượt qua bước kiểm tra tại service.

Migration cũng thêm index tổng hợp:

```text
(doctor_id, date, status)
```

Index này phục vụ truy vấn slot trống của một bác sĩ theo ngày.

## 3. Kết quả thực hiện SRS-PAT-01

### 3.1 API tìm kiếm và xem bác sĩ

| Method | Endpoint | Quyền truy cập | Mô tả |
|---|---|---|---|
| GET | `/api/v1/doctors/search` | Public | Tìm kiếm, lọc và phân trang danh sách bác sĩ. |
| GET | `/api/v1/doctors/specialties` | Public | Lấy danh mục chuyên khoa đang hoạt động. |
| GET | `/api/v1/doctors/:doctorId` | Public | Xem profile và các slot `AVAILABLE` sắp tới. |

### 3.2 Tham số tìm kiếm

| Tham số | Kiểu | Ý nghĩa |
|---|---|---|
| `q` | string | Tìm theo tên bác sĩ, học vị, mô tả chuyên môn/bệnh học và số phòng. |
| `specialtyId` | UUID | Lọc theo chuyên khoa. |
| `date` | ISO date | Chỉ lấy bác sĩ có slot `AVAILABLE` trong ngày. |
| `minPrice` | number | Mức phí khám tối thiểu. |
| `maxPrice` | number | Mức phí khám tối đa. |
| `minRating` | number | Điểm đánh giá tối thiểu, từ 1 đến 5. |
| `page` | integer | Trang hiện tại, mặc định 1. |
| `limit` | integer | Số phần tử mỗi trang, mặc định 10 và tối đa 50. |

Ví dụ:

```http
GET /api/v1/doctors/search?q=tim%20mạch&specialtyId=<uuid>&date=2026-09-24&maxPrice=500000&minRating=4&page=1&limit=10
```

Kết quả mặc định được sắp xếp theo:

1. Điểm đánh giá giảm dần.
2. Tên bác sĩ tăng dần.

Chỉ bác sĩ có tài khoản `ACTIVE` và thuộc chuyên khoa đang hoạt động mới xuất hiện trong kết quả công khai.

### 3.3 Full-text search và index

Giải pháp sử dụng PostgreSQL `pg_trgm` kết hợp truy vấn `LIKE` có tham số. Các trường được tìm kiếm:

- `users.full_name`.
- `doctors.academic_title`.
- `doctors.bio_description`.
- `doctors.room_number`.

Migration bổ sung GIN trigram index cho các trường trên và B-Tree index cho:

- `doctors.consultation_fee`.
- `doctors.rating_average`.

Toàn bộ giá trị đầu vào được truyền qua parameter của TypeORM QueryBuilder, không nối trực tiếp dữ liệu người dùng vào SQL.

### 3.4 Dữ liệu trả về

Danh sách và profile bác sĩ chỉ trả các trường cần thiết cho Patient Portal:

```text
id
fullName
academicTitle
specialty
consultationFee
bioDescription
roomNumber
ratingAverage
availableSchedules (API chi tiết)
```

Email, số điện thoại và các thông tin tài khoản nội bộ không được trả trong API công khai.

## 4. Redis caching

Đã thêm cache cho:

| Dữ liệu | TTL |
|---|---:|
| Danh sách bác sĩ không lọc theo ngày | 300 giây |
| Danh sách bác sĩ lọc theo ngày | 60 giây |
| Profile và lịch trống của bác sĩ | 60 giây |
| Danh mục chuyên khoa | 900 giây |

Cache key được tạo từ SHA-256 của bộ tham số đã chuẩn hóa, tránh key quá dài và phân biệt chính xác từng tổ hợp bộ lọc.

Khi tạo, sửa hoặc xóa lịch:

- Cache danh sách bác sĩ bị xóa.
- Cache profile của bác sĩ liên quan bị xóa.

Nếu Redis tạm thời không hoạt động, API tự động đọc từ PostgreSQL thay vì làm hỏng request. Service có bộ đếm `hits`, `misses` và `hitRate` để hỗ trợ đo mục tiêu Cache Hit tối thiểu 85% trong môi trường chạy thật.

Tỷ lệ 85% phụ thuộc mẫu truy cập thực tế và phải được xác nhận bằng load test sau khi Redis hoạt động; unit test không thể chứng minh tỷ lệ này.

## 5. Migration mới

File:

```text
server/src/database/migrations/1789565400000-add-doctor-schedule-and-search-indexes.ts
```

Migration thực hiện:

- Bật extension `btree_gist`.
- Bật extension `pg_trgm`.
- Thêm constraint chống overlap lịch bác sĩ.
- Thêm index `(doctor_id, date, status)`.
- Thêm GIN trigram index phục vụ tìm kiếm.
- Thêm B-Tree index cho phí khám và điểm đánh giá.
- Có đầy đủ `up()` và `down()`.
- Không sửa đè migration cũ.

## 6. Các file chính đã triển khai

```text
server/src/common/guards/own-doctor.guard.ts
server/src/database/entities/doctor.entity.ts
server/src/database/entities/doctor-schedule.entity.ts
server/src/database/migrations/1789565400000-add-doctor-schedule-and-search-indexes.ts
server/src/modules/doctor/doctor-cache.service.ts
server/src/modules/doctor/doctor-schedule.controller.ts
server/src/modules/doctor/doctor-schedule.service.ts
server/src/modules/doctor/doctor-search.controller.ts
server/src/modules/doctor/doctor-search.service.ts
server/src/modules/doctor/dto/schedule-range.dto.ts
server/src/modules/doctor/dto/search-doctor.dto.ts
server/src/modules/doctor/dto/update-schedule.dto.ts
server/test/doctor-schedule.spec.ts
server/test/own-doctor.guard.spec.ts
```

## 7. Kiểm thử

Đã thực hiện số lượng test tập trung theo yêu cầu, gồm:

1. Ca sáng 30 phút sinh đúng 8 slot.
2. Slot sinh ra có trạng thái `AVAILABLE` và response chứa đúng phòng khám.
3. Không cho sửa slot có trạng thái `BOOKED`.
4. Ownership guard ánh xạ đúng JWT `users.id` sang `doctors.user_id` và kiểm tra `doctors.id` trên URL.
5. Ownership guard từ chối bác sĩ truy cập hồ sơ bác sĩ khác.

Kết quả:

```text
Test Suites: 2 passed, 2 total
Tests:       4 passed, 4 total
Snapshots:   0 total
```

Build backend:

```text
npm run build --workspace=@ehealth/server
```

Kết quả: thành công, không có lỗi TypeScript.

Kiểm tra định dạng diff:

```text
git diff --check
```

Kết quả: thành công.

## 8. Hạn chế và công việc cần xác nhận khi tích hợp

- PostgreSQL và Redis local không hoạt động tại thời điểm kiểm tra, vì vậy chưa chạy `migration:run` và `migration:revert` trên database thật.
- Cần chạy thử migration trên database staging trước khi merge để phát hiện dữ liệu lịch cũ đang overlap, nếu có.
- Mục tiêu Redis Cache Hit từ 85% cần được đo bằng workload thực tế hoặc k6 sau khi có dữ liệu seed phù hợp.
- Schema hiện tại chưa có bảng review chi tiết. API dùng `doctors.rating_average` nhưng chưa trả danh sách nhận xét đã kiểm duyệt.
- Schema chưa có ảnh chân dung, số năm kinh nghiệm hoặc nơi công tác riêng. API chi tiết chỉ trả các trường thực sự tồn tại trong migration hiện tại.
- Quy trình Admin cưỡng chế hủy slot `BOOKED` và dời lịch khẩn cấp liên quan notification/realtime chưa nằm trong phần triển khai này.

## 9. Hướng dẫn kiểm tra tích hợp

Khởi động PostgreSQL và Redis, sau đó chạy:

```bash
npm run migration:run --workspace=@ehealth/server
npm run build --workspace=@ehealth/server
npm run test --workspace=@ehealth/server -- --runInBand test/doctor-schedule.spec.ts test/own-doctor.guard.spec.ts
```

Kiểm tra rollback migration:

```bash
npm run migration:revert --workspace=@ehealth/server
npm run migration:run --workspace=@ehealth/server
```

Sau khi seed dữ liệu bác sĩ, chuyên khoa và lịch làm việc, kiểm tra các trường hợp:

- Bác sĩ tạo ca sáng và ca chiều với slot 15/30 phút.
- Tạo trùng ca phải nhận HTTP 409.
- Bác sĩ khác thao tác lịch không thuộc sở hữu phải nhận HTTP 403.
- Sửa/xóa slot `BOOKED` phải nhận HTTP 409.
- Tìm kiếm kết hợp từ khóa, chuyên khoa, ngày, mức phí và rating.
- Gọi lặp lại cùng truy vấn để xác nhận Redis cache hit.
