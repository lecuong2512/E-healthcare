import "reflect-metadata";
import "./test-environment";
import { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { ThrottlerGuard } from "@nestjs/throttler";
import request from "supertest";
import { DataSource } from "typeorm";
import { hash } from "bcrypt";
import { sign } from "jsonwebtoken";
import { AppModule } from "../src/app.module";
import { configureApp } from "../src/configure-app";
import { environment } from "../src/config/environment";
import { DatabaseModule } from "../src/database/database.module";
import { createDataSource } from "../src/database/database-options";
import { RedisService } from "../src/common/redis/redis.service";
import { SessionService } from "../src/modules/auth/session.service";
import { Role, Gender, DateOfBirthPrecision, UserStatus } from "@shared/enums";

const url = environment.TEST_DATABASE_URL;
if (!url || !new URL(url).pathname.startsWith("/ehealth_phr_test_db")) {
  throw new Error("TEST_DATABASE_URL phải trỏ đến CSDL ehealth_phr_test_db riêng.");
}

describe("Wave 2D: Security Audit Integration Tests (SQLi, XSS, CSRF, SameSite Cookie)", () => {
  let app: INestApplication;
  let database: DataSource;
  let redis: RedisService;

  const patientUserId = "40000000-0000-4000-8000-000000000001";
  const doctorUserId = "40000000-0000-4000-8000-000000000002";
  const doctorId = "50000000-0000-4000-8000-000000000002";
  const specialtyId = "c1111111-1111-4111-8111-111111111111";
  const testPassword = "Password123!";
  let patientAccessToken: string;
  let sessionId: string;

  let sessionService: SessionService;

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
    sessionService = moduleRef.get(SessionService);
    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();
  });

  beforeEach(async () => {
    // 1. Cleanup bảng liên quan
    await database.query("TRUNCATE personal_health_profiles, auth_sessions, user_roles, doctor_schedules, doctors, specialties, users CASCADE");

    try {
      await redis.getClient().flushdb();
    } catch {
      // Bỏ qua nếu redis flush lỗi nhẹ
    }

    const passwordHash = await hash(testPassword, 10);

    // 2. Seed Chuyên khoa
    await database.query(
      `INSERT INTO specialties (id, name, description, is_active)
       VALUES ($1, 'Tim mạch', 'Chuyên khoa tim mạch', true)`,
      [specialtyId],
    );

    // 3. Seed Bác sĩ
    await database.query(
      `INSERT INTO users (id, email, phone_number, password_hash, full_name, gender, date_of_birth, date_of_birth_precision, status)
       VALUES ($1, 'bs.an@hospital.vn', '+84901000001', $2, 'Nguyễn Văn An', $3, '1980-01-01', $4, $5)`,
      [doctorUserId, passwordHash, Gender.MALE, DateOfBirthPrecision.FULL_DATE, UserStatus.ACTIVE],
    );
    await database.query(
      `INSERT INTO doctors (id, user_id, specialty_id, license_number, academic_title, consultation_fee, bio_description, room_number, rating_average, years_experience)
       VALUES ($1, $2, $3, 'LIC-001', 'BSCKII', 350000, 'Chuyên gia tim mạch', 'P.201', 4.80, 15)`,
      [doctorId, doctorUserId, specialtyId],
    );
    await database.query(
      `INSERT INTO user_roles (user_id, role) VALUES ($1, $2)`,
      [doctorUserId, Role.DOCTOR],
    );

    // 4. Seed Bệnh nhân
    await database.query(
      `INSERT INTO users (id, email, phone_number, password_hash, full_name, gender, date_of_birth, date_of_birth_precision, status)
       VALUES ($1, 'patient.security@hospital.vn', '0901234567', $2, 'Bệnh Nhân Test', $3, '1995-05-15', $4, $5)`,
      [patientUserId, passwordHash, Gender.MALE, DateOfBirthPrecision.FULL_DATE, UserStatus.ACTIVE],
    );
    await database.query(
      `INSERT INTO user_roles (user_id, role) VALUES ($1, $2)`,
      [patientUserId, Role.PATIENT],
    );

    // 5. Seed initial personal health profile
    await database.query(
      `INSERT INTO personal_health_profiles (
        user_id, citizen_id, address, health_insurance,
        blood_type, allergies, chronic_diseases, surgery_history
      ) VALUES ($1, '001200123456', '123 Đường Test', 'DN4010123456789', 'O+', 'Không', 'Không', 'Không')`,
      [patientUserId],
    );

    // 6. Cấp phiên đăng nhập hợp lệ cho Bệnh nhân bằng SessionService thật
    const session = await sessionService.issueSession(
      database.manager,
      patientUserId,
      Role.PATIENT,
    );
    patientAccessToken = session.accessToken;
  });

  afterAll(async () => {
    await app.close();
    await database.query("TRUNCATE personal_health_profiles, auth_sessions, user_roles, doctor_schedules, doctors, specialties, users CASCADE");
    await database.destroy();
  });

  // =========================================================================
  // 1. SQL INJECTION (SQLi)
  // =========================================================================
  describe("1. SQL Injection (SQLi) Defenses", () => {
    it("chặn SQL Injection qua từ khóa tìm kiếm q: TypeORM parameterized query xử lý an toàn, không rò rỉ dữ liệu hoặc lỗi SQL", async () => {
      // Vector 1: Tautology bypass ' OR '1'='1
      const res1 = await request(app.getHttpServer())
        .get("/api/v1/doctors/search")
        .query({ q: "' OR '1'='1" })
        .expect(200);

      expect(res1.body.data).toBeDefined();
      // Không dump toàn bộ DB do OR 1=1; dữ liệu trả về chỉ khớp nếu có BS tên chứa đúng chuỗi đó
      expect(res1.body.data.length).toBe(0);

      // Vector 2: Batch command injection '; DROP TABLE users; --
      const res2 = await request(app.getHttpServer())
        .get("/api/v1/doctors/search")
        .query({ q: "'; DROP TABLE users; --" })
        .expect(200);

      expect(res2.body.data.length).toBe(0);

      // Verify: Bảng users hoàn toàn không bị xóa/ảnh hưởng
      const usersCount = await database.query("SELECT COUNT(*) FROM users");
      expect(Number(usersCount[0].count)).toBe(2);
    });

    it("chặn SQL Injection qua specialtyId: ClassValidator UUID bắt buộc từ chối ngay với 400 Bad Request", async () => {
      const sqliPayload = "' OR 1=1 --";
      const res = await request(app.getHttpServer())
        .get("/api/v1/doctors/search")
        .query({ specialtyId: sqliPayload })
        .expect(400);

      expect(res.body.message).toContain("specialtyId must be a UUID");
      expect(res.body.error).toBe("Bad Request");
    });

    it("chặn SQL Injection qua date: ClassValidator IsDateString từ chối với 400 Bad Request", async () => {
      const sqliPayload = "2026-10-15'; DELETE FROM specialties; --";
      const res = await request(app.getHttpServer())
        .get("/api/v1/doctors/search")
        .query({ date: sqliPayload })
        .expect(400);

      expect(res.body.message).toContain("date must be a valid ISO 8601 date string");
      expect(res.body.error).toBe("Bad Request");

      // Verify: specialties vẫn còn nguyên vẹn
      const specCount = await database.query("SELECT COUNT(*) FROM specialties");
      expect(Number(specCount[0].count)).toBe(1);
    });

    it("chặn SQL Injection qua minPrice/maxPrice: ClassValidator chuyển đổi số từ chối với 400 Bad Request", async () => {
      const sqliPayload = "1000 UNION SELECT password_hash FROM users --";
      const res = await request(app.getHttpServer())
        .get("/api/v1/doctors/search")
        .query({ minPrice: sqliPayload })
        .expect(400);

      expect(res.body.error).toBe("Bad Request");
    });

    it("chặn SQL Injection qua trường đăng nhập (identifier): parameterized query ngăn chặn authentication bypass", async () => {
      const sqliLoginPayload = "admin' OR '1'='1";
      const res = await request(app.getHttpServer())
        .post("/api/v1/auth/login")
        .send({ identifier: sqliLoginPayload, password: "random_password" })
        .expect((r) => expect([400, 401]).toContain(r.status));

      // Không lộ thông tin stack trace hoặc lỗi cú pháp SQL Postgres
      expect(JSON.stringify(res.body)).not.toMatch(/syntax error|pg_catalog|relation.*does not exist/i);
    });
  });

  // =========================================================================
  // 2. CROSS-SITE SCRIPTING (XSS)
  // =========================================================================
  describe("2. Cross-Site Scripting (XSS) Defenses", () => {
    it("lưu trữ an toàn payload HTML/JS độc hại trong PHR và trả về chuẩn application/json (không kích hoạt script)", async () => {
      const xssScriptPayload = "<script>alert('XSS_ATTACK')</script>";
      const xssImgPayload = "<img src=x onerror=alert(1)>";

      // 1. Gửi payload XSS lên endpoint cập nhật PHR
      const putRes = await request(app.getHttpServer())
        .put("/api/v1/phr/me")
        .set("Authorization", `Bearer ${patientAccessToken}`)
        .send({
          fullName: "Bệnh Nhân Test",
          citizenId: "001200123456",
          gender: Gender.MALE,
          dateOfBirth: "1995-05-15",
          address: "123 Đường Test",
          healthInsurance: "DN4010123456789",
          bloodType: "O+",
          allergies: xssScriptPayload,
          chronicDiseases: xssImgPayload,
          surgeryHistory: "Không có",
        })
        .expect(200);

      expect(putRes.body.allergies).toBe(xssScriptPayload);

      // 2. Đọc lại PHR qua GET /api/v1/phr/me
      const getRes = await request(app.getHttpServer())
        .get("/api/v1/phr/me")
        .set("Authorization", `Bearer ${patientAccessToken}`)
        .expect(200);

      // Verify HTTP Headers: Content-Type bắt buộc là application/json
      expect(getRes.headers["content-type"]).toMatch(/application\/json/i);

      // Verify payload được tuần tự hóa an toàn dưới dạng JSON string, trình duyệt không tự render thành HTML
      expect(getRes.body.allergies).toBe(xssScriptPayload);
      expect(getRes.body.chronicDiseases).toBe(xssImgPayload);
    });
  });

  // =========================================================================
  // 3. CROSS-SITE REQUEST FORGERY (CSRF)
  // =========================================================================
  describe("3. Cross-Site Request Forgery (CSRF) Defenses", () => {
    it("từ chối state-changing POST tới /api/v1/auth/* từ Origin độc hại khác (HTTP 403 Forbidden)", async () => {
      const res = await request(app.getHttpServer())
        .post("/api/v1/auth/login")
        .set("Origin", "http://malicious-attacker-site.com")
        .send({ identifier: "patient.security@hospital.vn", password: testPassword })
        .expect(403);

      expect(res.body.message).toBe("Nguồn yêu cầu không được phép.");
    });

    it("cho phép request khi Origin khớp với cấu hình FRONTEND_URL", async () => {
      const allowedOrigin = environment.FRONTEND_URL
        ? new URL(environment.FRONTEND_URL).origin
        : "http://localhost:4200";

      const res = await request(app.getHttpServer())
        .post("/api/v1/auth/login")
        .set("Origin", allowedOrigin)
        .send({ identifier: "patient.security@hospital.vn", password: testPassword })
        .expect(200);

      expect(res.body.accessToken).toBeDefined();
    });

    it("từ chối request thay đổi trạng thái nếu thiếu Authorization Bearer token (chặn tấn công CSRF cookie tự gửi)", async () => {
      // Kẻ tấn công trên web khác không thể ép trình duyệt gửi Authorization Bearer token
      await request(app.getHttpServer())
        .post("/api/v1/booking/reserve-slot")
        .send({
          doctorId,
          slotId: "70000000-0000-4000-8000-000000000001",
        })
        .expect(401);
    });
  });

  // =========================================================================
  // 4. SAMESITE COOKIE VERIFICATION
  // =========================================================================
  describe("4. SameSite Cookie Verification & HTTP Evidence", () => {
    it("xác nhận Set-Cookie trên endpoint đăng nhập có đầy đủ HttpOnly, SameSite=Strict, Path=/api/v1/auth", async () => {
      const res = await request(app.getHttpServer())
        .post("/api/v1/auth/login")
        .send({ identifier: "patient.security@hospital.vn", password: testPassword })
        .expect(200);

      const rawCookies = res.headers["set-cookie"];
      expect(rawCookies).toBeDefined();
      const cookies = Array.isArray(rawCookies) ? rawCookies : [rawCookies];

      const refreshCookie = cookies.find((c: string) => c.startsWith("ehealth_refresh="));
      expect(refreshCookie).toBeDefined();

      // Direct Assertions trên thuộc tính cookie HTTP
      expect(refreshCookie).toMatch(/HttpOnly/i);
      expect(refreshCookie).toMatch(/SameSite=Strict/i);
      expect(refreshCookie).toMatch(/Path=\/api\/v1\/auth/i);
      expect(refreshCookie).toMatch(/Max-Age=\d+/i);

      // Cache-Control header để chống cache phiên
      expect(res.headers["cache-control"]).toBe("no-store");
    });
  });
});
