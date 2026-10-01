# BÁO CÁO NGUYÊN NHÂN & HƯỚNG DẪN XỬ LÝ CONFLICT TRÊN PULL REQUEST #12

- **Pull Request:** `#12 - Feature/srs doc 01 and srs pat 01`
- **Nhánh nguồn:** `feature/srs-doc-01-and-srs-pat-01` (Nguyễn Mạnh Thi)
- **Nhánh đích:** `develop`
- **Người tạo PR:** Nguyễn Mạnh Thi (Backend Developer)
- **Trạng thái GitHub:** ⚠️ **This branch has conflicts that must be resolved (10 files)**
- **Ngày lập báo cáo:** 20/09/2026

---

## 1. NGUYÊN NHÂN GỐC RỄ (ROOT CAUSE)

1. **Lệch nhánh xuất phát (Diverged Branch):**
   - Nhánh `feature/srs-doc-01-and-srs-pat-01` của Thi được tạo từ commit cũ `1ebaa9f` (thời điểm mới xong Sprint 2 / PR #9 của Tú).
   - Trong quá trình Thi phát triển tính năng Ca làm việc & Tìm kiếm bác sĩ, nhánh `develop` đã liên tiếp tích hợp thành công hai PR lớn:
     - **PR #10:** `feature/srs-pat-02-distributed-slot-locking` (Card 2.4 của Cường: Cơ chế Khóa phân tán Redis & Transaction Chốt lịch khám).
     - **PR #11:** `feature/2.2-auth-phr-ui` (Card 2.2: Giao diện Auth & PHR Profile).
2. **Chạm chung vào các tập tin kiến trúc cốt lõi (Overlapping Infrastructure):**
   - Cả hai nhánh độc lập cùng bổ sung thư viện Redis, cùng định nghĩa các Entity (`DoctorEntity`, `DoctorScheduleEntity`, `SpecialtyEntity`), cùng sửa đổi `app.module.ts`, `database-options.ts`, `enums/index.ts` và cấu hình test.
   - Do đó, khi GitHub thực hiện hòa trộn tự động vào `develop`, Git phát hiện 10 tập tin bị xung đột nội dung.

---

## 2. BẢNG PHÂN TÍCH CHI TIẾT 10 TẬP TIN CONFLICT & NGUYÊN TẮC HÒA GIẢI

| STT | Tập tin bị Conflict | Bản chất xung đột | Nguyên tắc hòa giải (Resolution Guide) |
| :---: | :--- | :--- | :--- |
| **1** | `server/package.json`<br>`package-lock.json` | - `develop` cài `ioredis: ^5.11.1` cho Booking Distributed Lock.<br>- Nhánh Thi cài `redis: ^5.0.14` (node-redis) cho Doctor Cache. | **Giữ cả 2 thư viện** (hoặc chuẩn hóa để `DoctorCacheService` dùng chung `ioredis` có sẵn của hệ thống). Sau khi gộp, chạy lệnh `npm install` tại root để tái tạo `package-lock.json` sạch. |
| **2** | `server/src/app.module.ts` | - `develop` đã thêm `RedisModule` và `BookingModule`.<br>- Nhánh Thi thêm `DoctorModule`. | **Giữ toàn bộ:** Thêm cả 3 module vào mảng `imports` của `AppModule` (`RedisModule`, `BookingModule`, `DoctorModule`). |
| **3** | `server/src/database/database-options.ts` | - `develop` đăng ký: `[AppointmentEntity, DoctorEntity, DoctorScheduleEntity, SpecialtyEntity]`.<br>- Nhánh Thi cũng đăng ký các entity tương tự. | **Gộp chung mảng entities:** Đảm bảo mảng chứa đủ cả 4 entity: `AppointmentEntity`, `DoctorEntity`, `DoctorScheduleEntity`, `SpecialtyEntity`. |
| **4** | `server/src/database/entities/doctor.entity.ts` | - `develop` có quan hệ `@OneToMany(() => AppointmentEntity, ...)`.<br>- Nhánh Thi có thêm thuộc tính học hàm (`academicTitle`), buồng khám (`roomNumber`), giá khám (`consultationFee`), quan hệ 1-1 với `UserEntity`. | **Hợp nhất thuộc tính:** Giữ đầy đủ tất cả các trường dữ liệu và quan hệ `user` của Thi, đồng thời giữ lại quan hệ `appointments` của Cường. |
| **5** | `server/src/database/entities/doctor-schedule.entity.ts` | - `develop` có quan hệ `@OneToMany(() => AppointmentEntity, ...)`.<br>- Nhánh Thi có thêm cột khóa lạc quan `@VersionColumn() version`, `shiftType`, `slotDurationMinutes`. | **Hợp nhất thuộc tính:** Giữ nguyên cột `version` và các thông tin phân ca của Thi, kết hợp giữ quan hệ `appointments` của Cường. |
| **6** | `server/src/database/entities/specialty.entity.ts` | Cả 2 nhánh cùng bổ sung bảng Chuyên khoa (Specialty) phục vụ tìm kiếm và đặt lịch. | **Giữ bản đầy đủ nhất:** Đảm bảo có `id`, `name`, `description`, quan hệ `@OneToMany(() => DoctorEntity, ...)`. |
| **7** | `server/jest.config.cjs` | Cả 2 nhánh cùng cấu hình đường dẫn test và module mapper. | **Gộp cấu hình:** Giữ lại mapping alias `@shared` và đường dẫn chạy test của cả 2 nhánh. |
| **8** | `server/tsconfig.json` | Khác biệt về alias paths hoặc type roots. | **Giữ cấu hình mới nhất:** Đảm bảo có alias `@shared/*` trỏ đúng vào thư mục shared. |
| **9** | `shared/src/enums/index.ts` | - `develop` export: `PaymentMethod`, `PaymentStatus`.<br>- Nhánh Thi export: `SlotStatus`, `ShiftType`, `SHIFT_TIME_RANGES`. | **Export toàn bộ:** Xuất đầy đủ tất cả enum của cả hai bên. |

---

## 3. MẪU CODE HỢP NHẤT CHO CÁC TẬP TIN TRỌNG YẾU

### 3.1. `server/src/app.module.ts`
```typescript
import { Module } from '@nestjs/common';
import { DatabaseModule } from './database/database.module';
import { AuthModule } from './modules/auth/auth.module';
import { RedisModule } from './common/redis/redis.module';
import { BookingModule } from './modules/booking/booking.module';
import { DoctorModule } from './modules/doctor/doctor.module';

@Module({
  imports: [
    DatabaseModule,
    AuthModule,
    RedisModule,
    BookingModule,
    DoctorModule,
  ],
  controllers: [],
  providers: [],
})
export class AppModule {}
```

### 3.2. `server/src/database/database-options.ts`
```typescript
import { AppointmentEntity } from './entities/appointment.entity';
import { DoctorEntity } from './entities/doctor.entity';
import { DoctorScheduleEntity } from './entities/doctor-schedule.entity';
import { SpecialtyEntity } from './entities/specialty.entity';
import { UserEntity } from './entities/user.entity';

export const entities = [
  UserEntity,
  SpecialtyEntity,
  DoctorEntity,
  DoctorScheduleEntity,
  AppointmentEntity,
];
```

### 3.3. `shared/src/enums/index.ts`
```typescript
export * from './role.enum';
export * from './gender.enum';
export * from './slot-status.enum';
export * from './shift-type.enum';
export * from './appointment-status.enum';
export * from './payment-status.enum';
export * from './payment-method.enum';
```

---

## 4. QUY TRÌNH 4 BƯỚC XỬ LÝ CONFLICT DÀNH CHO DEV THI

Dev Thi chỉ cần thực hiện đúng 4 bước sau bằng dòng lệnh tại máy cục bộ:

### Bước 1: Kéo mã nguồn mới nhất của nhánh `develop` về máy
```powershell
git checkout develop
git pull origin develop
```

### Bước 2: Chuyển sang nhánh feature và hòa trộn `develop` vào
```powershell
git checkout feature/srs-doc-01-and-srs-pat-01
git merge develop
```
*(Lúc này Git sẽ thông báo conflict tại 10 tập tin).*

### Bước 3: Giải quyết conflict theo bảng hướng dẫn tại Mục 2 & 3
- Mở VS Code / IDE, chọn giữ cả hai nội dung (Accept Both) và chỉnh sửa lại code cho sạch.
- Cài đặt lại thư viện và chạy kiểm thử xác minh:
  ```powershell
  npm install
  npm run build --workspace=@ehealth/server
  npm --prefix server test
  ```
  *(Yêu cầu: Toàn bộ 100% test suites của cả Doctor và Booking đều đạt trạng thái PASS).*

### Bước 4: Commit và đẩy lên GitHub để cập nhật PR #12
```powershell
git add .
git commit -m "chore: resolve merge conflicts with develop"
git push origin feature/srs-doc-01-and-srs-pat-01
```

Ngay sau khi push xong, GitHub PR #12 sẽ tự động chuyển sang trạng thái xanh:  **"This branch has no conflicts with the base branch"** và có thể tiến hành Merge vào `develop`.
