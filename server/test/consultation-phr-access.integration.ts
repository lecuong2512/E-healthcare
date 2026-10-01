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
import {
  Role,
  Gender,
  DateOfBirthPrecision,
  UserStatus,
  SlotStatus,
  AppointmentStatus,
  PaymentStatus,
  PaymentMethod,
} from "@shared/enums";

// Test suite CHỈ được phép chạy với TEST_DATABASE_URL trỏ đến ehealth_phr_test_db riêng.
const url = environment.TEST_DATABASE_URL;
if (!url || !new URL(url).pathname.startsWith("/ehealth_phr_test_db")) {
  throw new Error(
    "TEST_DATABASE_URL phải trỏ đến CSDL ehealth_phr_test_db riêng.",
  );
}

describe("TC-PHR-005: Doctor Consultation Patient PHR Access (DEFECT-PHR-005 Remediation)", () => {
  let app: INestApplication;
  let database: DataSource;
  let sessionService: SessionService;

  // Doctors
  const userDoctor1Id = "d1111111-1111-4111-8111-111111111111";
  const doctor1Id = "d1111111-2222-4111-8111-222222222222";
  let doctor1Token: string;

  const userDoctor2Id = "d2222222-1111-4111-8111-111111111111";
  const doctor2Id = "d2222222-2222-4111-8111-222222222222";
  let doctor2Token: string;

  // Patients
  const patient1Id = "11111111-1111-4111-8111-111111111111";
  let patient1Token: string;

  const patient2Id = "22222222-1111-4111-8111-222222222222";
  let patient2Token: string;

  // Admin
  const adminId = "a9999999-1111-4111-8111-111111111111";
  let adminToken: string;

  // Appointments & Schedules
  const specialtyId = "00000000-1111-4111-8111-111111111111";
  const schedule1Id = "c1111111-1111-4111-8111-111111111111";
  const schedule2Id = "c2222222-1111-4111-8111-111111111111";
  const appointment1Id = "b1111111-1111-4111-8111-111111111111";
  const appointment2Id = "b2222222-1111-4111-8111-111111111111";

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

    sessionService = moduleRef.get(SessionService);
    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();
  });

  beforeEach(async () => {
    // Truncate tables for fresh state
    await database.query(
      `TRUNCATE appointments, doctor_schedules, doctors, specialties,
                personal_health_profiles, auth_sessions, user_roles, users CASCADE`,
    );

    // 1. Seed Specialty
    await database.query(
      `INSERT INTO specialties (id, name, description, is_active)
       VALUES ($1, 'Nội tổng quát', 'Khoa nội tổng quát', true)`,
      [specialtyId],
    );

    // 2. Seed Doctor 1 (Bác sĩ Nguyễn Văn An)
    await database.query(
      `INSERT INTO users (id, email, phone_number, password_hash, full_name, gender, date_of_birth, date_of_birth_precision, status)
       VALUES ($1, 'bs.an@hospital.vn', '+84901000001', 'hash', 'BS. Nguyễn Văn An', $2, '1980-01-01', $3, $4)`,
      [userDoctor1Id, Gender.MALE, DateOfBirthPrecision.FULL_DATE, UserStatus.ACTIVE],
    );
    await database.query(
      `INSERT INTO user_roles (user_id, role) VALUES ($1, $2)`,
      [userDoctor1Id, Role.DOCTOR],
    );
    await database.query(
      `INSERT INTO doctors (id, user_id, specialty_id, license_number, academic_title, consultation_fee, room_number, rating_average, years_experience)
       VALUES ($1, $2, $3, 'CCHN-001', 'BSCKII', 300000, 'P.201', 5.00, 15)`,
      [doctor1Id, userDoctor1Id, specialtyId],
    );

    // 3. Seed Doctor 2 (Bác sĩ Trần Thị Bình)
    await database.query(
      `INSERT INTO users (id, email, phone_number, password_hash, full_name, gender, date_of_birth, date_of_birth_precision, status)
       VALUES ($1, 'bs.binh@hospital.vn', '+84901000002', 'hash', 'BS. Trần Thị Bình', $2, '1985-05-15', $3, $4)`,
      [userDoctor2Id, Gender.FEMALE, DateOfBirthPrecision.FULL_DATE, UserStatus.ACTIVE],
    );
    await database.query(
      `INSERT INTO user_roles (user_id, role) VALUES ($1, $2)`,
      [userDoctor2Id, Role.DOCTOR],
    );
    await database.query(
      `INSERT INTO doctors (id, user_id, specialty_id, license_number, academic_title, consultation_fee, room_number, rating_average, years_experience)
       VALUES ($1, $2, $3, 'CCHN-002', 'ThS.BS', 250000, 'P.202', 4.90, 10)`,
      [doctor2Id, userDoctor2Id, specialtyId],
    );

    // 4. Seed Patient 1 (Bệnh nhân Lê Văn Một)
    await database.query(
      `INSERT INTO users (id, email, phone_number, password_hash, full_name, gender, date_of_birth, date_of_birth_precision, status)
       VALUES ($1, 'patient1@test.vn', '+84911000001', 'hash', 'Lê Văn Một', $2, '1992-04-12', $3, $4)`,
      [patient1Id, Gender.MALE, DateOfBirthPrecision.FULL_DATE, UserStatus.ACTIVE],
    );
    await database.query(
      `INSERT INTO user_roles (user_id, role) VALUES ($1, $2)`,
      [patient1Id, Role.PATIENT],
    );
    await database.query(
      `INSERT INTO personal_health_profiles (
         user_id, citizen_id, address, health_insurance,
         blood_type, allergies, chronic_diseases, surgery_history
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        patient1Id,
        "001200000001",
        "123 Nguyễn Trãi, Quận 1, TP.HCM",
        "DN4010123456789",
        "B+",
        "Penicillin, Sulfonamide",
        "Hen phế quản mãn tính",
        "Mổ ruột thừa năm 2018",
      ],
    );

    // 5. Seed Patient 2 (Bệnh nhân Phạm Thị Hai)
    await database.query(
      `INSERT INTO users (id, email, phone_number, password_hash, full_name, gender, date_of_birth, date_of_birth_precision, status)
       VALUES ($1, 'patient2@test.vn', '+84911000002', 'hash', 'Phạm Thị Hai', $2, '1988-11-20', $3, $4)`,
      [patient2Id, Gender.FEMALE, DateOfBirthPrecision.FULL_DATE, UserStatus.ACTIVE],
    );
    await database.query(
      `INSERT INTO user_roles (user_id, role) VALUES ($1, $2)`,
      [patient2Id, Role.PATIENT],
    );
    await database.query(
      `INSERT INTO personal_health_profiles (
         user_id, citizen_id, address, health_insurance,
         blood_type, allergies, chronic_diseases, surgery_history
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        patient2Id,
        "001200000002",
        "456 Lê Lợi, Quận Hải Châu, Đà Nẵng",
        "DN4010987654321",
        "O+",
        "Aspirin, Paracetamol",
        "Tăng huyết áp vô căn",
        "Chưa từng phẫu thuật",
      ],
    );

    // 6. Seed Admin
    await database.query(
      `INSERT INTO users (id, email, phone_number, password_hash, full_name, gender, date_of_birth, date_of_birth_precision, status)
       VALUES ($1, 'admin@hospital.vn', '+84999000001', 'hash', 'Quản trị viên', $2, '1985-01-01', $3, $4)`,
      [adminId, Gender.MALE, DateOfBirthPrecision.FULL_DATE, UserStatus.ACTIVE],
    );
    await database.query(
      `INSERT INTO user_roles (user_id, role) VALUES ($1, $2)`,
      [adminId, Role.ADMIN],
    );

    // 7. Seed Schedules & Appointments
    // Schedule 1 & Appointment 1: Doctor 1 & Patient 1
    await database.query(
      `INSERT INTO doctor_schedules (id, doctor_id, date, start_time, end_time, status)
       VALUES ($1, $2, '2026-10-05', '08:00:00', '08:30:00', $3)`,
      [schedule1Id, doctor1Id, SlotStatus.BOOKED],
    );
    await database.query(
      `INSERT INTO appointments (
         id, appointment_code, patient_id, doctor_id, schedule_id,
         status, reason_for_visit, payment_status, payment_method, total_amount
       ) VALUES ($1, 'APP-20261005-001', $2, $3, $4, $5, 'Khó thở, ho kéo dài', $6, $7, 300000)`,
      [
        appointment1Id,
        patient1Id,
        doctor1Id,
        schedule1Id,
        AppointmentStatus.IN_CONSULTATION,
        PaymentStatus.PAID,
        PaymentMethod.PAY_AT_CLINIC,
      ],
    );

    // Schedule 2 & Appointment 2: Doctor 2 & Patient 2
    await database.query(
      `INSERT INTO doctor_schedules (id, doctor_id, date, start_time, end_time, status)
       VALUES ($1, $2, '2026-10-05', '09:00:00', '09:30:00', $3)`,
      [schedule2Id, doctor2Id, SlotStatus.BOOKED],
    );
    await database.query(
      `INSERT INTO appointments (
         id, appointment_code, patient_id, doctor_id, schedule_id,
         status, reason_for_visit, payment_status, payment_method, total_amount
       ) VALUES ($1, 'APP-20261005-002', $2, $3, $4, $5, 'Đau đầu, chóng mặt', $6, $7, 250000)`,
      [
        appointment2Id,
        patient2Id,
        doctor2Id,
        schedule2Id,
        AppointmentStatus.IN_CONSULTATION,
        PaymentStatus.PAID,
        PaymentMethod.PAY_AT_CLINIC,
      ],
    );

    // 8. Issue JWT Sessions
    const sDoc1 = await sessionService.issueSession(database.manager, userDoctor1Id, Role.DOCTOR);
    doctor1Token = sDoc1.accessToken;

    const sDoc2 = await sessionService.issueSession(database.manager, userDoctor2Id, Role.DOCTOR);
    doctor2Token = sDoc2.accessToken;

    const sPat1 = await sessionService.issueSession(database.manager, patient1Id, Role.PATIENT);
    patient1Token = sPat1.accessToken;

    const sPat2 = await sessionService.issueSession(database.manager, patient2Id, Role.PATIENT);
    patient2Token = sPat2.accessToken;

    const sAdmin = await sessionService.issueSession(database.manager, adminId, Role.ADMIN);
    adminToken = sAdmin.accessToken;
  });

  afterAll(async () => {
    await app.close();
    await database.destroy();
  });

  describe("A. Positive Test: Doctor consultation patient PHR access", () => {
    it("TC-PHR-005-P01: should return full patient PHR & demographics when assigned doctor accesses appointment PHR", async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/clinical/appointments/${appointment1Id}/patient-phr`)
        .auth(doctor1Token, { type: "bearer" });

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({
        fullName: "Lê Văn Một",
        citizenId: "001200000001",
        gender: Gender.MALE,
        dateOfBirth: "1992-04-12",
        bloodType: "B+",
        allergies: "Penicillin, Sulfonamide",
        chronicDiseases: "Hen phế quản mãn tính",
        surgeryHistory: "Mổ ruột thừa năm 2018",
        healthInsurance: "DN4010123456789",
        address: "123 Nguyễn Trãi, Quận 1, TP.HCM",
      });
    });

    it("TC-PHR-005-P02: should return correct patient 2 PHR when Doctor 2 accesses Appointment 2", async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/clinical/appointments/${appointment2Id}/patient-phr`)
        .auth(doctor2Token, { type: "bearer" });

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({
        fullName: "Phạm Thị Hai",
        citizenId: "001200000002",
        gender: Gender.FEMALE,
        dateOfBirth: "1988-11-20",
        bloodType: "O+",
        allergies: "Aspirin, Paracetamol",
        chronicDiseases: "Tăng huyết áp vô căn",
        surgeryHistory: "Chưa từng phẫu thuật",
        healthInsurance: "DN4010987654321",
        address: "456 Lê Lợi, Quận Hải Châu, Đà Nẵng",
      });
    });
  });

  describe("B. Authorization: Strict doctor-appointment assignment check", () => {
    it("TC-PHR-005-A01: Doctor 1 CANNOT view patient PHR of Appointment 2 assigned to Doctor 2 (HTTP 403 UNAUTHORIZED_DOCTOR)", async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/clinical/appointments/${appointment2Id}/patient-phr`)
        .auth(doctor1Token, { type: "bearer" });

      expect(res.status).toBe(403);
      expect(res.body.code).toBe("UNAUTHORIZED_DOCTOR");
      expect(res.body.message).toContain("Bác sĩ không được phân công");
      // Zero patient data leaked
      expect(res.body.bloodType).toBeUndefined();
      expect(res.body.allergies).toBeUndefined();
      expect(res.body.fullName).toBeUndefined();
    });

    it("TC-PHR-005-A02: Doctor 2 CANNOT view patient PHR of Appointment 1 assigned to Doctor 1 (HTTP 403 UNAUTHORIZED_DOCTOR)", async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/clinical/appointments/${appointment1Id}/patient-phr`)
        .auth(doctor2Token, { type: "bearer" });

      expect(res.status).toBe(403);
      expect(res.body.code).toBe("UNAUTHORIZED_DOCTOR");
      expect(res.body.message).toContain("Bác sĩ không được phân công");
      expect(res.body.bloodType).toBeUndefined();
      expect(res.body.allergies).toBeUndefined();
      expect(res.body.fullName).toBeUndefined();
    });
  });

  describe("C. Patient Isolation: PHR of Patient A is strictly separated from Patient B", () => {
    it("TC-PHR-005-I01: Doctor 1 request for Appointment 1 must strictly contain Patient 1 data and zero data of Patient 2", async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/clinical/appointments/${appointment1Id}/patient-phr`)
        .auth(doctor1Token, { type: "bearer" });

      expect(res.status).toBe(200);
      expect(res.body.fullName).toBe("Lê Văn Một");
      expect(res.body.bloodType).toBe("B+");
      expect(res.body.allergies).toContain("Penicillin");
      expect(res.body.allergies).not.toContain("Aspirin");
      expect(res.body.chronicDiseases).not.toContain("Tăng huyết áp");
    });

    it("TC-PHR-005-I02: Doctor 2 request for Appointment 2 must strictly contain Patient 2 data and zero data of Patient 1", async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/clinical/appointments/${appointment2Id}/patient-phr`)
        .auth(doctor2Token, { type: "bearer" });

      expect(res.status).toBe(200);
      expect(res.body.fullName).toBe("Phạm Thị Hai");
      expect(res.body.bloodType).toBe("O+");
      expect(res.body.allergies).toContain("Aspirin");
      expect(res.body.allergies).not.toContain("Penicillin");
      expect(res.body.chronicDiseases).not.toContain("Hen phế quản");
    });
  });

  describe("D. Security & RBAC: Endpoint protection and input validation", () => {
    it("TC-PHR-005-S01: Unauthenticated request should be rejected with HTTP 401 Unauthorized", async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/clinical/appointments/${appointment1Id}/patient-phr`);

      expect(res.status).toBe(401);
    });

    it("TC-PHR-005-S02: Patient role requesting doctor clinical endpoint should receive HTTP 403 Forbidden", async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/clinical/appointments/${appointment1Id}/patient-phr`)
        .auth(patient1Token, { type: "bearer" });

      expect(res.status).toBe(403);
    });

    it("TC-PHR-005-S03: Admin role requesting doctor clinical endpoint should receive HTTP 403 Forbidden", async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/clinical/appointments/${appointment1Id}/patient-phr`)
        .auth(adminToken, { type: "bearer" });

      expect(res.status).toBe(403);
    });

    it("TC-PHR-005-S04: Non-existent appointment UUID should return HTTP 404 APPOINTMENT_NOT_FOUND", async () => {
      const nonExistentId = "00000000-0000-0000-0000-000000000000";
      const res = await request(app.getHttpServer())
        .get(`/api/v1/clinical/appointments/${nonExistentId}/patient-phr`)
        .auth(doctor1Token, { type: "bearer" });

      expect(res.status).toBe(404);
      expect(res.body.code).toBe("APPOINTMENT_NOT_FOUND");
    });

    it("TC-PHR-005-S05: Malformed UUID should return HTTP 400 Bad Request via ParseUUIDPipe", async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/clinical/appointments/not-a-valid-uuid/patient-phr`)
        .auth(doctor1Token, { type: "bearer" });

      expect(res.status).toBe(400);
    });
  });

  describe("E. Regression: Patient self-access via /api/v1/phr/me remains fully functional", () => {
    it("TC-PHR-005-R01: Patient 1 can read own PHR via /api/v1/phr/me without regression", async () => {
      const res = await request(app.getHttpServer())
        .get("/api/v1/phr/me")
        .auth(patient1Token, { type: "bearer" });

      expect(res.status).toBe(200);
      expect(res.body.fullName).toBe("Lê Văn Một");
      expect(res.body.bloodType).toBe("B+");
    });

    it("TC-PHR-005-R02: Patient 1 can update own PHR via /api/v1/phr/me and doctor immediately sees updated data in consultation", async () => {
      // 1. Patient updates address and chronic diseases
      const updateRes = await request(app.getHttpServer())
        .put("/api/v1/phr/me")
        .auth(patient1Token, { type: "bearer" })
        .send({
          fullName: "Lê Văn Một (Đã cập nhật)",
          citizenId: "001200000001",
          gender: Gender.MALE,
          dateOfBirth: "1992-04-12",
          address: "999 Đường Cập Nhật Mới, Quận 7, TP.HCM",
          healthInsurance: "DN4010123456789",
          bloodType: "B+",
          allergies: "Penicillin, Sulfonamide, Cephalosporin",
          chronicDiseases: "Hen phế quản mãn tính kiểm soát tốt",
          surgeryHistory: "Mổ ruột thừa năm 2018",
        });

      expect(updateRes.status).toBe(200);
      expect(updateRes.body.address).toBe("999 Đường Cập Nhật Mới, Quận 7, TP.HCM");

      // 2. Doctor opens consultation for Appointment 1 -> sees the newly updated PHR immediately
      const doctorRes = await request(app.getHttpServer())
        .get(`/api/v1/clinical/appointments/${appointment1Id}/patient-phr`)
        .auth(doctor1Token, { type: "bearer" });

      expect(doctorRes.status).toBe(200);
      expect(doctorRes.body.fullName).toBe("Lê Văn Một (Đã cập nhật)");
      expect(doctorRes.body.address).toBe("999 Đường Cập Nhật Mới, Quận 7, TP.HCM");
      expect(doctorRes.body.allergies).toBe("Penicillin, Sulfonamide, Cephalosporin");
      expect(doctorRes.body.chronicDiseases).toBe("Hen phế quản mãn tính kiểm soát tốt");
    });
  });
});
