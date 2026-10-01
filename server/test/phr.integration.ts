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
import { SessionService } from "../src/modules/auth/session.service";
import { Role, Gender, DateOfBirthPrecision, UserStatus } from "@shared/enums";
import { UpdatePhrProfileRequest } from "@shared/interfaces";

// Bộ kiểm thử CHỈ được phép chạy với TEST_DATABASE_URL trỏ đến CSDL ehealth_phr_test_db riêng.
// Tuyệt đối từ chối chạy trên ehealth_db để bảo vệ dữ liệu phát triển.
const url = environment.TEST_DATABASE_URL;
if (!url || !new URL(url).pathname.startsWith("/ehealth_phr_test_db")) {
  throw new Error(
    "TEST_DATABASE_URL phải trỏ đến CSDL ehealth_phr_test_db riêng (VD: postgresql://postgres:postgres_password@localhost:5432/ehealth_phr_test_db).",
  );
}

describe("Wave 2B.3-B: PHR Real PostgreSQL Integration Test (TC-PHR-001..004)", () => {
  let app: INestApplication;
  let database: DataSource;
  let sessionService: SessionService;

  const patientId = "a1111111-1111-4111-8111-111111111111";
  let patientToken: string;

  const endpoint = "/api/v1/phr/me";

  const defaultProfile: UpdatePhrProfileRequest = {
    fullName: "Nguyễn Văn Ban Đầu",
    citizenId: "012345678901",
    gender: Gender.MALE,
    dateOfBirth: "1990-01-01",
    address: "Số 1 Đường Khởi Tạo, Quận 1, TP.HCM",
    healthInsurance: "DN4010123456789",
    bloodType: "O+",
    allergies: "Chưa ghi nhận dị ứng",
    chronicDiseases: "Không có tiền sử bệnh mạn tính",
    surgeryHistory: "Chưa từng phẫu thuật",
  };

  const getPhr = (token = patientToken) =>
    request(app.getHttpServer())
      .get(endpoint)
      .auth(token, { type: "bearer" });

  const putPhr = (body: Partial<UpdatePhrProfileRequest>, token = patientToken) =>
    request(app.getHttpServer())
      .put(endpoint)
      .auth(token, { type: "bearer" })
      .send({ ...defaultProfile, ...body });

  beforeAll(async () => {
    // 1. Khởi tạo real TypeORM DataSource kết nối trực tiếp đến PostgreSQL test DB
    database = await createDataSource(url!).initialize();
    await database.runMigrations();

    // 2. Khởi tạo NestJS application với AppModule và ghi đè DatabaseModule bằng DataSource thật
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

    sessionService = moduleRef.get(SessionService);

    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();
  });

  beforeEach(async () => {
    // Dọn dẹp sạch sẽ các bảng dữ liệu trước mỗi test case (TRUNCATE CASCADE)
    await database.query(
      "TRUNCATE personal_health_profiles, auth_sessions, user_roles, users CASCADE",
    );

    // 1. Seed người dùng bệnh nhân vào bảng `users`
    await database.query(
      `INSERT INTO users (
        id, email, phone_number, password_hash, full_name,
        gender, date_of_birth, date_of_birth_precision, status
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        patientId,
        "patient.phr@test.local",
        "+84912345678",
        "hashed-password-for-integration-test",
        defaultProfile.fullName,
        defaultProfile.gender,
        defaultProfile.dateOfBirth,
        DateOfBirthPrecision.FULL_DATE,
        UserStatus.ACTIVE,
      ],
    );

    // 2. Gán vai trò PATIENT vào bảng `user_roles`
    await database.query(
      "INSERT INTO user_roles (user_id, role) VALUES ($1, $2)",
      [patientId, Role.PATIENT],
    );

    // 3. Khởi tạo bản ghi hồ sơ sức khỏe cá nhân trong `personal_health_profiles`
    await database.query(
      `INSERT INTO personal_health_profiles (
        user_id, citizen_id, address, health_insurance,
        blood_type, allergies, chronic_diseases, surgery_history
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        patientId,
        defaultProfile.citizenId,
        defaultProfile.address,
        defaultProfile.healthInsurance,
        defaultProfile.bloodType,
        defaultProfile.allergies,
        defaultProfile.chronicDiseases,
        defaultProfile.surgeryHistory,
      ],
    );

    // 4. Cấp phiên đăng nhập hợp lệ trong PostgreSQL (`auth_sessions`) thông qua SessionService thật
    const session = await sessionService.issueSession(
      database.manager,
      patientId,
      Role.PATIENT,
    );
    patientToken = session.accessToken;
  });

  afterAll(async () => {
    if (app) await app.close();
    if (database?.isInitialized) await database.destroy();
  });

  // =========================================================================
  // TC-PHR-001: Cập nhật thông tin nhân khẩu học (Card 1.5 P0)
  // Expected Result: Thông tin được lưu và hiển thị lại chính xác.
  // =========================================================================
  test("TC-PHR-001: Cập nhật thông tin nhân khẩu học (Họ tên, CCCD, giới tính, ngày sinh, địa chỉ, BHYT) lưu và hiển thị lại chính xác trên PostgreSQL thật", async () => {
    const updatePayload: Partial<UpdatePhrProfileRequest> = {
      fullName: "Nguyễn Văn Bệnh Nhân",
      citizenId: "012345678901",
      gender: Gender.MALE,
      dateOfBirth: "1990-05-15",
      address: "123 Đường Lê Lợi, Phường Bến Nghé, Quận 1, TP.HCM",
      healthInsurance: "DN4010123456789",
    };

    // 1. Gửi HTTP PUT /api/v1/phr/me
    const putRes = await putPhr(updatePayload);
    expect(putRes.status).toBe(200);
    expect(putRes.body.fullName).toBe("Nguyễn Văn Bệnh Nhân");
    expect(putRes.body.citizenId).toBe("012345678901");
    expect(putRes.body.gender).toBe(Gender.MALE);
    expect(putRes.body.dateOfBirth).toBe("1990-05-15");
    expect(putRes.body.address).toBe("123 Đường Lê Lợi, Phường Bến Nghé, Quận 1, TP.HCM");
    expect(putRes.body.healthInsurance).toBe("DN4010123456789");

    // 2. Gửi HTTP GET /api/v1/phr/me để đọc lại qua API
    const getRes = await getPhr();
    expect(getRes.status).toBe(200);
    expect(getRes.body.fullName).toBe("Nguyễn Văn Bệnh Nhân");
    expect(getRes.body.citizenId).toBe("012345678901");
    expect(getRes.body.gender).toBe(Gender.MALE);
    expect(getRes.body.dateOfBirth).toBe("1990-05-15");
    expect(getRes.body.address).toBe("123 Đường Lê Lợi, Phường Bến Nghé, Quận 1, TP.HCM");
    expect(getRes.body.healthInsurance).toBe("DN4010123456789");

    // 3. QUERY TRỰC TIẾP POSTGRESQL THẬT: Bảng `users`
    const [userRow] = await database.query(
      `SELECT full_name, gender, date_of_birth::text AS date_of_birth, date_of_birth_precision
       FROM users WHERE id = $1`,
      [patientId],
    );
    expect(userRow).toBeDefined();
    expect(userRow.full_name).toBe("Nguyễn Văn Bệnh Nhân");
    expect(userRow.gender).toBe(Gender.MALE);
    expect(userRow.date_of_birth).toBe("1990-05-15");
    expect(userRow.date_of_birth_precision).toBe(DateOfBirthPrecision.FULL_DATE);

    // 4. QUERY TRỰC TIẾP POSTGRESQL THẬT: Bảng `personal_health_profiles`
    const [phrRow] = await database.query(
      `SELECT citizen_id, address, health_insurance
       FROM personal_health_profiles WHERE user_id = $1`,
      [patientId],
    );
    expect(phrRow).toBeDefined();
    expect(phrRow.citizen_id).toBe("012345678901");
    expect(phrRow.address).toBe("123 Đường Lê Lợi, Phường Bến Nghé, Quận 1, TP.HCM");
    expect(phrRow.health_insurance).toBe("DN4010123456789");
  });

  // =========================================================================
  // TC-PHR-002: Cập nhật nhóm máu (Card 1.5 P0)
  // Expected Result: Giá trị được lưu và hiển thị đúng.
  // =========================================================================
  test("TC-PHR-002: Cập nhật nhóm máu hợp lệ (AB+, O-) lưu và hiển thị đúng trong PostgreSQL, reject giá trị không hợp lệ (X+)", async () => {
    // 1. Cập nhật nhóm máu hợp lệ AB+
    const putAb = await putPhr({ bloodType: "AB+" });
    expect(putAb.status).toBe(200);
    expect(putAb.body.bloodType).toBe("AB+");

    const getAb = await getPhr();
    expect(getAb.status).toBe(200);
    expect(getAb.body.bloodType).toBe("AB+");

    // Query DB thật xác nhận AB+ đã persist
    const [dbRowAb] = await database.query(
      "SELECT blood_type FROM personal_health_profiles WHERE user_id = $1",
      [patientId],
    );
    expect(dbRowAb.blood_type).toBe("AB+");

    // 2. Cập nhật nhóm máu hợp lệ O-
    const putO = await putPhr({ bloodType: "O-" });
    expect(putO.status).toBe(200);
    expect(putO.body.bloodType).toBe("O-");

    const getO = await getPhr();
    expect(getO.status).toBe(200);
    expect(getO.body.bloodType).toBe("O-");

    // Query DB thật xác nhận O- đã persist
    const [dbRowO] = await database.query(
      "SELECT blood_type FROM personal_health_profiles WHERE user_id = $1",
      [patientId],
    );
    expect(dbRowO.blood_type).toBe("O-");

    // 3. Từ chối nhóm máu không hợp lệ (X+) -> HTTP 400 Bad Request
    const putInvalid = await putPhr({ bloodType: "X+" });
    expect(putInvalid.status).toBe(400);

    // Query DB thật xác nhận giá trị trong PostgreSQL vẫn được giữ nguyên là O- (không bị ghi đè dữ liệu rác)
    const [dbRowAfterInvalid] = await database.query(
      "SELECT blood_type FROM personal_health_profiles WHERE user_id = $1",
      [patientId],
    );
    expect(dbRowAfterInvalid.blood_type).toBe("O-");
  });

  // =========================================================================
  // TC-PHR-003: Cập nhật dị ứng thuốc (Card 1.5 P0)
  // Expected Result: Thông tin dị ứng được lưu và hiển thị đúng.
  // =========================================================================
  test("TC-PHR-003: Cập nhật dị ứng thuốc lưu vào PostgreSQL và hiển thị đúng qua API", async () => {
    const allergyInfo =
      "Dị ứng Penicillin (sốc phản vệ độ 2), Dị ứng Aspirin (mẩn ngứa, co thắt phế quản)";

    // 1. Gửi HTTP PUT /api/v1/phr/me cập nhật dị ứng
    const putRes = await putPhr({ allergies: allergyInfo });
    expect(putRes.status).toBe(200);
    expect(putRes.body.allergies).toBe(allergyInfo);

    // 2. Gửi HTTP GET /api/v1/phr/me đọc lại
    const getRes = await getPhr();
    expect(getRes.status).toBe(200);
    expect(getRes.body.allergies).toBe(allergyInfo);

    // 3. QUERY TRỰC TIẾP POSTGRESQL THẬT: Bảng `personal_health_profiles`
    const [phrRow] = await database.query(
      "SELECT allergies FROM personal_health_profiles WHERE user_id = $1",
      [patientId],
    );
    expect(phrRow).toBeDefined();
    expect(phrRow.allergies).toBe(allergyInfo);
  });

  // =========================================================================
  // TC-PHR-004: Cập nhật bệnh mạn tính và tiền sử phẫu thuật (Card 1.5 P1)
  // Expected Result: Dữ liệu được lưu thành công.
  // =========================================================================
  test("TC-PHR-004: Cập nhật bệnh mạn tính và tiền sử phẫu thuật lưu thành công vào PostgreSQL thật", async () => {
    const chronicInfo =
      "Tăng huyết áp vô căn (10 năm, đang điều trị Amlodipine), Đái tháo đường type 2 (5 năm)";
    const surgeryInfo =
      "Phẫu thuật nội soi cắt ruột thừa năm 2018 (BV Chợ Rẫy), Phẫu thuật kết hợp xương đùi trái năm 2015";

    // 1. Gửi HTTP PUT /api/v1/phr/me
    const putRes = await putPhr({
      chronicDiseases: chronicInfo,
      surgeryHistory: surgeryInfo,
    });
    expect(putRes.status).toBe(200);
    expect(putRes.body.chronicDiseases).toBe(chronicInfo);
    expect(putRes.body.surgeryHistory).toBe(surgeryInfo);

    // 2. Gửi HTTP GET /api/v1/phr/me đọc lại
    const getRes = await getPhr();
    expect(getRes.status).toBe(200);
    expect(getRes.body.chronicDiseases).toBe(chronicInfo);
    expect(getRes.body.surgeryHistory).toBe(surgeryInfo);

    // 3. QUERY TRỰC TIẾP POSTGRESQL THẬT: Bảng `personal_health_profiles`
    const [phrRow] = await database.query(
      "SELECT chronic_diseases, surgery_history FROM personal_health_profiles WHERE user_id = $1",
      [patientId],
    );
    expect(phrRow).toBeDefined();
    expect(phrRow.chronic_diseases).toBe(chronicInfo);
    expect(phrRow.surgery_history).toBe(surgeryInfo);
  });
});
