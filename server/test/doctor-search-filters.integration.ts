import "reflect-metadata";
import "./test-environment";
import { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { ThrottlerGuard } from "@nestjs/throttler";
import request from "supertest";
import { DataSource } from "typeorm";
import { AppModule } from "../src/app.module";
import { configureApp } from "../src/configure-app";
import { environment } from "../src/config/environment";
import { DatabaseModule } from "../src/database/database.module";
import { createDataSource } from "../src/database/database-options";
import { RedisService } from "../src/common/redis/redis.service";
import { Role, Gender, DateOfBirthPrecision, UserStatus, SlotStatus } from "@shared/enums";

// Bộ kiểm thử CHỈ được phép chạy với TEST_DATABASE_URL trỏ đến CSDL ehealth_phr_test_db riêng.
// Tuyệt đối từ chối chạy trên ehealth_db để bảo vệ dữ liệu phát triển.
const url = environment.TEST_DATABASE_URL;
if (!url || !new URL(url).pathname.startsWith("/ehealth_phr_test_db")) {
  throw new Error(
    "TEST_DATABASE_URL phải trỏ đến CSDL ehealth_phr_test_db riêng.",
  );
}

describe("Wave 2C: Doctor Search Filters Real DB Integration Test (TC-PAT-001..005)", () => {
  let app: INestApplication;
  let database: DataSource;
  let redis: RedisService;

  const endpoint = "/api/v1/doctors/search";

  // IDs cố định cho test data
  const specialtyCardioId = "c1111111-1111-4111-8111-111111111111";
  const specialtyPediatricId = "c2222222-2222-4222-8222-222222222222";
  const specialtyDermId = "c3333333-3333-4333-8333-333333333333";

  const userDoctor1Id = "11111111-1111-4111-8111-111111111111";
  const doctor1Id = "22222222-1111-4111-8111-111111111111"; // BS Nguyễn Văn An, BSCKII, Tim mạch, 350k, 4.8 sao

  const userDoctor2Id = "11111111-2222-4222-8222-222222222222";
  const doctor2Id = "22222222-2222-4222-8222-222222222222"; // BS Trần Thị Bình, ThS.BS, Nhi khoa, 250k, 4.2 sao

  const userDoctor3Id = "11111111-3333-4333-8333-333333333333";
  const doctor3Id = "22222222-3333-4333-8333-333333333333"; // BS Lê Văn Cường, GS.TS, Tim mạch, 600k, 3.8 sao

  const userDoctor4Id = "11111111-4444-4444-8444-444444444444";
  const doctor4Id = "22222222-4444-4444-8444-444444444444"; // BS Phạm Minh Dũng, BSCKI, Da liễu, 450k, 4.0 sao

  beforeAll(async () => {
    database = await createDataSource(url!).initialize();
    await database.runMigrations();

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideModule(DatabaseModule)
      .useModule({
        module: class TestDatabaseModule {},
        providers: [{ provide: DataSource, useValue: database }],
        exports: [DataSource],
      })
      .overrideProvider(ThrottlerGuard)
      .useValue({ canActivate: () => true })
      .compile();

    redis = moduleRef.get(RedisService);
    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();
  });

  beforeEach(async () => {
    // 1. Dọn dẹp dữ liệu bảng liên quan
    await database.query(
      "TRUNCATE doctor_schedules, doctors, specialties, users CASCADE",
    );

    // 2. Xóa cache Redis để đảm bảo không bị cache bẩn giữa các test
    try {
      await redis.getClient().flushdb();
    } catch {
      // Bỏ qua nếu Redis chưa sẵn sàng
    }

    // 3. Seed Chuyên khoa
    await database.query(
      `INSERT INTO specialties (id, name, description, is_active) VALUES
       ($1, 'Tim mạch', 'Chuyên khoa tim mạch', true),
       ($2, 'Nhi khoa', 'Chuyên khoa nhi', true),
       ($3, 'Da liễu', 'Chuyên khoa da liễu', true)`,
      [specialtyCardioId, specialtyPediatricId, specialtyDermId],
    );

    // 4. Seed Bác sĩ 1: Nguyễn Văn An - BSCKII - Tim mạch - 350.000đ - 4.8 sao
    await database.query(
      `INSERT INTO users (id, email, phone_number, password_hash, full_name, gender, date_of_birth, date_of_birth_precision, status)
       VALUES ($1, 'an.nguyen@hospital.vn', '+84901000001', 'hash', 'Nguyễn Văn An', $2, '1980-01-01', $3, $4)`,
      [userDoctor1Id, Gender.MALE, DateOfBirthPrecision.FULL_DATE, UserStatus.ACTIVE],
    );
    await database.query(
      `INSERT INTO doctors (id, user_id, specialty_id, license_number, academic_title, consultation_fee, bio_description, room_number, rating_average, years_experience)
       VALUES ($1, $2, $3, 'LIC-001', 'BSCKII', 350000, 'Chuyên gia can thiệp tim mạch', 'P.201', 4.80, 15)`,
      [doctor1Id, userDoctor1Id, specialtyCardioId],
    );

    // 5. Seed Bác sĩ 2: Trần Thị Bình - ThS.BS - Nhi khoa - 250.000đ - 4.2 sao
    await database.query(
      `INSERT INTO users (id, email, phone_number, password_hash, full_name, gender, date_of_birth, date_of_birth_precision, status)
       VALUES ($1, 'binh.tran@hospital.vn', '+84901000002', 'hash', 'Trần Thị Bình', $2, '1985-05-10', $3, $4)`,
      [userDoctor2Id, Gender.FEMALE, DateOfBirthPrecision.FULL_DATE, UserStatus.ACTIVE],
    );
    await database.query(
      `INSERT INTO doctors (id, user_id, specialty_id, license_number, academic_title, consultation_fee, bio_description, room_number, rating_average, years_experience)
       VALUES ($1, $2, $3, 'LIC-002', 'ThS.BS', 250000, 'Chuyên gia Nhi sơ sinh', 'P.105', 4.20, 10)`,
      [doctor2Id, userDoctor2Id, specialtyPediatricId],
    );

    // 6. Seed Bác sĩ 3: Lê Văn Cường - GS.TS - Tim mạch - 600.000đ - 3.8 sao
    await database.query(
      `INSERT INTO users (id, email, phone_number, password_hash, full_name, gender, date_of_birth, date_of_birth_precision, status)
       VALUES ($1, 'cuong.le@hospital.vn', '+84901000003', 'hash', 'Lê Văn Cường', $2, '1970-12-20', $3, $4)`,
      [userDoctor3Id, Gender.MALE, DateOfBirthPrecision.FULL_DATE, UserStatus.ACTIVE],
    );
    await database.query(
      `INSERT INTO doctors (id, user_id, specialty_id, license_number, academic_title, consultation_fee, bio_description, room_number, rating_average, years_experience)
       VALUES ($1, $2, $3, 'LIC-003', 'GS.TS', 600000, 'Giáo sư tim mạch đầu ngành', 'P.301', 3.80, 25)`,
      [doctor3Id, userDoctor3Id, specialtyCardioId],
    );

    // 7. Seed Bác sĩ 4: Phạm Minh Dũng - BSCKI - Da liễu - 450.000đ - 4.0 sao
    await database.query(
      `INSERT INTO users (id, email, phone_number, password_hash, full_name, gender, date_of_birth, date_of_birth_precision, status)
       VALUES ($1, 'dung.pham@hospital.vn', '+84901000004', 'hash', 'Phạm Minh Dũng', $2, '1988-08-15', $3, $4)`,
      [userDoctor4Id, Gender.MALE, DateOfBirthPrecision.FULL_DATE, UserStatus.ACTIVE],
    );
    await database.query(
      `INSERT INTO doctors (id, user_id, specialty_id, license_number, academic_title, consultation_fee, bio_description, room_number, rating_average, years_experience)
       VALUES ($1, $2, $3, 'LIC-004', 'BSCKI', 450000, 'Khám và điều trị da liễu', 'P.102', 4.00, 8)`,
      [doctor4Id, userDoctor4Id, specialtyDermId],
    );

    // 8. Seed Lịch khám (Schedules):
    // - Doctor 1: ngày 2026-10-15 (AVAILABLE), ngày 2026-10-16 (HOLDING)
    // - Doctor 2: ngày 2026-10-15 (AVAILABLE)
    // - Doctor 3: ngày 2026-10-20 (AVAILABLE)
    await database.query(
      `INSERT INTO doctor_schedules (doctor_id, date, start_time, end_time, status) VALUES
       ($1, '2026-10-15', '08:00:00', '08:30:00', 'AVAILABLE'),
       ($1, '2026-10-16', '09:00:00', '09:30:00', 'HOLDING'),
       ($2, '2026-10-15', '14:00:00', '14:30:00', 'AVAILABLE'),
       ($3, '2026-10-20', '10:00:00', '10:30:00', 'AVAILABLE')`,
      [doctor1Id, doctor2Id, doctor3Id],
    );
  });

  afterAll(async () => {
    if (app) await app.close();
    if (database?.isInitialized) await database.destroy();
  });

  // =========================================================================
  // TC-PAT-001: Tìm kiếm theo tên bác sĩ (P0)
  // Precondition: Nhập tên bác sĩ hợp lệ.
  // Expected Result: Danh sách trả về các bác sĩ phù hợp.
  // =========================================================================
  test("TC-PAT-001: Tìm kiếm theo tên bác sĩ trả về các bác sĩ phù hợp và loại trừ bác sĩ không khớp", async () => {
    // 1. Tìm kiếm chính xác có dấu: "Nguyễn Văn An"
    const res1 = await request(app.getHttpServer())
      .get(endpoint)
      .query({ q: "Nguyễn Văn An" });

    expect(res1.status).toBe(200);
    expect(res1.body.data).toHaveLength(1);
    expect(res1.body.data[0].id).toBe(doctor1Id);
    expect(res1.body.data[0].fullName).toBe("Nguyễn Văn An");

    // 2. Tìm kiếm không dấu (unaccent): "van an"
    const res2 = await request(app.getHttpServer())
      .get(endpoint)
      .query({ q: "van an" });

    expect(res2.status).toBe(200);
    expect(res2.body.data).toHaveLength(1);
    expect(res2.body.data[0].id).toBe(doctor1Id);

    // 3. Tìm kiếm một tên khác: "Bình"
    const res3 = await request(app.getHttpServer())
      .get(endpoint)
      .query({ q: "Bình" });

    expect(res3.status).toBe(200);
    expect(res3.body.data).toHaveLength(1);
    expect(res3.body.data[0].id).toBe(doctor2Id);
    expect(res3.body.data[0].fullName).toBe("Trần Thị Bình");

    // 4. Tìm kiếm từ khóa không tồn tại: "Hoàng Không Tồn Tại"
    const res4 = await request(app.getHttpServer())
      .get(endpoint)
      .query({ q: "Hoàng Không Tồn Tại" });

    expect(res4.status).toBe(200);
    expect(res4.body.data).toHaveLength(0);
  });

  // =========================================================================
  // TC-PAT-002: Tìm kiếm theo học vị (P1)
  // Precondition: Nhập học vị GS/PGS/TS/BSCKII.
  // Expected Result: Danh sách được lọc theo từ khóa phù hợp.
  // =========================================================================
  test("TC-PAT-002: Tìm kiếm theo học vị (GS/PGS/TS/BSCKII) lọc danh sách theo từ khóa phù hợp", async () => {
    // 1. Tìm học vị BSCKII
    const res1 = await request(app.getHttpServer())
      .get(endpoint)
      .query({ q: "BSCKII" });

    expect(res1.status).toBe(200);
    expect(res1.body.data).toHaveLength(1);
    expect(res1.body.data[0].id).toBe(doctor1Id);
    expect(res1.body.data[0].academicTitle).toBe("BSCKII");

    // 2. Tìm học vị GS
    const res2 = await request(app.getHttpServer())
      .get(endpoint)
      .query({ q: "GS" });

    expect(res2.status).toBe(200);
    expect(res2.body.data).toHaveLength(1);
    expect(res2.body.data[0].id).toBe(doctor3Id);
    expect(res2.body.data[0].academicTitle).toBe("GS.TS");

    // 3. Tìm học vị ThS
    const res3 = await request(app.getHttpServer())
      .get(endpoint)
      .query({ q: "ThS" });

    expect(res3.status).toBe(200);
    expect(res3.body.data).toHaveLength(1);
    expect(res3.body.data[0].id).toBe(doctor2Id);
    expect(res3.body.data[0].academicTitle).toBe("ThS.BS");
  });

  // =========================================================================
  // TC-PAT-003: Lọc theo chuyên khoa (P0)
  // Precondition: Chọn một chuyên khoa.
  // Expected Result: Chỉ hiển thị bác sĩ thuộc chuyên khoa được chọn.
  // =========================================================================
  test("TC-PAT-003: Lọc theo chuyên khoa chỉ hiển thị các bác sĩ thuộc chuyên khoa được chọn", async () => {
    // 1. Lọc theo chuyên khoa Tim mạch (Doctor 1 và Doctor 3)
    const resCardio = await request(app.getHttpServer())
      .get(endpoint)
      .query({ specialtyId: specialtyCardioId });

    expect(resCardio.status).toBe(200);
    expect(resCardio.body.data).toHaveLength(2);
    const cardioDoctorIds = resCardio.body.data.map((d: any) => d.id);
    expect(cardioDoctorIds).toContain(doctor1Id);
    expect(cardioDoctorIds).toContain(doctor3Id);
    expect(cardioDoctorIds).not.toContain(doctor2Id); // Nhi khoa bị loại
    expect(cardioDoctorIds).not.toContain(doctor4Id); // Da liễu bị loại
    resCardio.body.data.forEach((doc: any) => {
      expect(doc.specialty.id).toBe(specialtyCardioId);
      expect(doc.specialty.name).toBe("Tim mạch");
    });

    // 2. Lọc theo chuyên khoa Nhi khoa (Chỉ Doctor 2)
    const resPed = await request(app.getHttpServer())
      .get(endpoint)
      .query({ specialtyId: specialtyPediatricId });

    expect(resPed.status).toBe(200);
    expect(resPed.body.data).toHaveLength(1);
    expect(resPed.body.data[0].id).toBe(doctor2Id);
    expect(resPed.body.data[0].specialty.name).toBe("Nhi khoa");

    // 3. Lọc theo chuyên khoa Da liễu (Chỉ Doctor 4)
    const resDerm = await request(app.getHttpServer())
      .get(endpoint)
      .query({ specialtyId: specialtyDermId });

    expect(resDerm.status).toBe(200);
    expect(resDerm.body.data).toHaveLength(1);
    expect(resDerm.body.data[0].id).toBe(doctor4Id);
    expect(resDerm.body.data[0].specialty.name).toBe("Da liễu");
  });

  // =========================================================================
  // TC-PAT-004: Lọc theo ngày khám và khung giá (P0)
  // Precondition: Chọn ngày khám + một khoảng giá.
  // Expected Result: Kết quả thỏa đồng thời các điều kiện lọc.
  // =========================================================================
  test("TC-PAT-004: Lọc theo ngày khám và khung giá trả về kết quả thỏa đồng thời cả hai điều kiện lọc", async () => {
    // Điều kiện: Ngày khám = '2026-10-15', Khoảng giá = [300.000đ - 500.000đ]
    // Bác sĩ có lịch AVAILABLE ngày 2026-10-15:
    // - Doctor 1: fee 350.000đ (thỏa [300k - 500k]) -> THỎA ĐỒNG THỜI
    // - Doctor 2: fee 250.000đ (< 300k, không nằm trong khoảng giá) -> BỊ LOẠI
    // Bác sĩ có fee nằm trong [300k - 500k]:
    // - Doctor 4: fee 450.000đ nhưng KHÔNG có lịch ngày 2026-10-15 -> BỊ LOẠI
    // Bác sĩ khác:
    // - Doctor 3: fee 600.000đ (> 500k) và lịch ngày 2026-10-20 -> BỊ LOẠI
    const res = await request(app.getHttpServer())
      .get(endpoint)
      .query({
        date: "2026-10-15",
        minPrice: 300000,
        maxPrice: 500000,
      });

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].id).toBe(doctor1Id);
    expect(res.body.data[0].fullName).toBe("Nguyễn Văn An");
    expect(Number(res.body.data[0].consultationFee)).toBe(350000);

    // Kiểm tra thêm trường hợp ngày 2026-10-15 với khoảng giá [200.000đ - 300.000đ]
    // -> Chỉ Doctor 2 thỏa mãn (250.000đ)
    const resLow = await request(app.getHttpServer())
      .get(endpoint)
      .query({
        date: "2026-10-15",
        minPrice: 200000,
        maxPrice: 300000,
      });

    expect(resLow.status).toBe(200);
    expect(resLow.body.data).toHaveLength(1);
    expect(resLow.body.data[0].id).toBe(doctor2Id);
    expect(resLow.body.data[0].fullName).toBe("Trần Thị Bình");
    expect(Number(resLow.body.data[0].consultationFee)).toBe(250000);
  });

  // =========================================================================
  // TC-PAT-005: Lọc đánh giá từ 4 sao (P1)
  // Precondition: Chọn filter từ 4 sao trở lên.
  // Expected Result: Chỉ hiển thị bác sĩ có rating đáp ứng điều kiện.
  // =========================================================================
  test("TC-PAT-005: Lọc đánh giá từ 4 sao trở lên chỉ hiển thị các bác sĩ có rating >= 4.0", async () => {
    // Rating các bác sĩ trong test data:
    // - Doctor 1: 4.80 (>= 4) -> THỎA
    // - Doctor 2: 4.20 (>= 4) -> THỎA
    // - Doctor 4: 4.00 (>= 4) -> THỎA
    // - Doctor 3: 3.80 (< 4)  -> BỊ LOẠI

    const res = await request(app.getHttpServer())
      .get(endpoint)
      .query({ minRating: 4 });

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(3);

    const doctorIds = res.body.data.map((d: any) => d.id);
    expect(doctorIds).toContain(doctor1Id);
    expect(doctorIds).toContain(doctor2Id);
    expect(doctorIds).toContain(doctor4Id);
    expect(doctorIds).not.toContain(doctor3Id); // Doctor 3 (3.80 sao) bị loại

    // Khẳng định tất cả kết quả trả về đều có rating >= 4.0
    res.body.data.forEach((doc: any) => {
      expect(Number(doc.ratingAverage)).toBeGreaterThanOrEqual(4.0);
    });

    // Sắp xếp mặc định theo rating giảm dần: Doctor 1 (4.8) -> Doctor 2 (4.2) -> Doctor 4 (4.0)
    expect(res.body.data[0].id).toBe(doctor1Id);
    expect(res.body.data[1].id).toBe(doctor2Id);
    expect(res.body.data[2].id).toBe(doctor4Id);
  });
});
