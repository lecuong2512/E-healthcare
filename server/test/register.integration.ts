import "reflect-metadata";
import "./test-environment";
import { INestApplication, ServiceUnavailableException } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { compare, getRounds } from "bcrypt";
import request from "supertest";
import { DataSource } from "typeorm";
import { AppModule } from "../src/app.module";
import { DatabaseModule } from "../src/database/database.module";
import { createDataSource } from "../src/database/database-options";
import { OtpDeliveryService } from "../src/auth/otp-delivery.service";
import { AuthService } from "../src/auth/auth.service";
import { configureApp } from "../src/configure-app";
import { environment } from "../src/config/environment";
import { ThrottlerGuard } from "@nestjs/throttler";
import * as passwordUtils from "../src/common/utils/crypto.util";
import { Gender } from "../src/auth/dto/register.dto";

// Bộ kiểm thử chỉ chạy với TEST_DATABASE_URL trỏ đến CSDL riêng dành cho kiểm thử.
// Không xóa dữ liệu nếu tên CSDL không có tiền tố bắt buộc dành cho kiểm thử.
const url = environment.TEST_DATABASE_URL;
if (!url || !new URL(url).pathname.startsWith("/ehealth_auth_test_")) {
  throw new Error(
    "Set TEST_DATABASE_URL to a dedicated database named ehealth_auth_test_*",
  );
}

describe("SRS-AUTH-01 HTTP + real PostgreSQL", () => {
  let app: INestApplication;
  let database: DataSource;
  let auth: AuthService;
  let otp: string;
  const send = jest.fn(async (_contact: unknown, value: string) => {
    otp = value;
  });
  const payload = {
    email: "patient@example.com",
    password: "Abcd123!",
    fullName: "Nguyễn Văn A",
    gender: "MALE",
    dateOfBirth: "2000-01-02",
  };
  const endpoint = "/api/v1/auth/register";
  const register = (patch = {}) =>
    request(app.getHttpServer())
      .post(`${endpoint}/otp`)
      .send({ ...payload, ...patch });
  const verify = (registrationId: string, value = otp) =>
    request(app.getHttpServer())
      .post(`${endpoint}/verify`)
      .send({ registrationId, otp: value });
  const wrongOtp = () => (otp === "999999" ? "999998" : "999999");

  beforeAll(async () => {
    environment.OTP_HMAC_SECRET = "integration-test-secret-at-least-32-bytes";
    database = await createDataSource(url!).initialize();
    await database.runMigrations();
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideModule(DatabaseModule)
      .useModule({
        module: class TestDatabaseModule {},
        providers: [{ provide: DataSource, useValue: database }],
        exports: [DataSource],
      })
      .overrideProvider(ThrottlerGuard)
      .useValue({ canActivate: () => true })
      .overrideProvider(OtpDeliveryService)
      .useValue({ send })
      .compile();
    auth = module.get(AuthService);
    app = module.createNestApplication();
    configureApp(app);
    await app.init();
  });

  beforeEach(async () => {
    await database.query(
      "TRUNCATE registration_otp_sends, registration_sessions, personal_health_profiles, user_roles, users CASCADE",
    );
    send.mockClear();
  });

  afterAll(async () => {
    if (app) await app.close();
    if (database?.isInitialized) await database.destroy();
  });

  test("validates input before sending or storing anything", async () => {
    await register({ password: "weak" }).expect(400);
    await register({ dateOfBirth: "2099-01-01" }).expect(400);
    await register({ dateOfBirth: "2001-02-29" }).expect(400);
    await register({ role: "ROLE_ADMIN" }).expect(400);
    await register({ phoneNumber: "0901234567" }).expect(400);
    await register({ email: undefined }).expect(400);
    await register({ password: "Aa1!" + "é".repeat(35) }).expect(400);
    expect(send).not.toHaveBeenCalled();
    expect(await database.query("SELECT id FROM users")).toEqual([]);
  });

  test("sends 6-digit OTP, stores only hashes, and creates no user before verification", async () => {
    const result = await register().expect(202);
    expect(result.body).toMatchObject({
      expiresIn: 180,
      resendAfter: 60,
      channel: "email",
    });
    expect(otp).toMatch(/^[0-9]{6}$/);
    expect(JSON.stringify(result.body)).not.toContain(otp);
    const [session] = await database.query(
      "SELECT *, EXTRACT(EPOCH FROM (expires_at - sent_at)) AS ttl FROM registration_sessions",
    );
    expect(session.id).toBe(result.body.registrationId);
    expect(getRounds(session.password_hash)).toBe(12);
    expect(await compare(payload.password, session.password_hash)).toBe(true);
    expect(session.otp_hash).toMatch(/^[a-f0-9]{64}$/);
    expect(session.otp_hash).not.toBe(otp);
    expect(Number(session.ttl)).toBeCloseTo(180, 2);
    expect(await database.query("SELECT id FROM users")).toEqual([]);
  });

  test("activates ROLE_PATIENT and creates exactly one empty PHR; rejects OTP replay", async () => {
    const registered = await register({
      email: " PATIENT@Example.com ",
    }).expect(202);
    const result = await verify(registered.body.registrationId).expect(201);
    expect(result.body).toMatchObject({
      status: "ACTIVE",
      role: "ROLE_PATIENT",
    });
    expect(Object.keys(result.body).sort()).toEqual([
      "phrId",
      "role",
      "status",
      "userId",
    ]);
    const [user] = await database.query("SELECT * FROM users WHERE id = $1", [
      result.body.userId,
    ]);
    expect(user.email).toBe("patient@example.com");
    expect(user.status).toBe("ACTIVE");
    expect(await compare(payload.password, user.password_hash)).toBe(true);
    expect(getRounds(user.password_hash)).toBe(12);
    expect(
      await database.query("SELECT role FROM user_roles WHERE user_id=$1", [
        user.id,
      ]),
    ).toEqual([{ role: "ROLE_PATIENT" }]);
    const [phr] = await database.query(
      "SELECT * FROM personal_health_profiles WHERE user_id=$1",
      [user.id],
    );
    expect(phr).toMatchObject({
      id: result.body.phrId,
      blood_type: null,
      allergies: null,
      medical_history: null,
    });
    await verify(registered.body.registrationId).expect(400);
  });

  test("supports SMS and normalizes Vietnamese local phone to E.164", async () => {
    const registration = await register({
      email: undefined,
      phoneNumber: "0901234567",
    }).expect(202);
    expect(send).toHaveBeenCalledWith(
      { email: null, phoneNumber: "+84901234567" },
      expect.any(String),
    );
    expect(registration.body.channel).toBe("sms");
    await verify(registration.body.registrationId).expect(201);
    const [user] = await database.query("SELECT phone_number FROM users");
    expect(user.phone_number).toBe("+84901234567");
    await register({ email: undefined, phoneNumber: "+84901234567" }).expect(
      409,
    );
  });

  test("stores the full 16-character E.164 representation without truncation", async () => {
    const registration = await register({
      email: undefined,
      phoneNumber: "+123456789012345",
    }).expect(202);
    await verify(registration.body.registrationId).expect(201);
    const [user] = await database.query("SELECT phone_number FROM users");
    expect(user.phone_number).toBe("+123456789012345");
  });

  test("rejects duplicate case-insensitive email with the exact SRS message", async () => {
    const registration = await register().expect(202);
    await verify(registration.body.registrationId).expect(201);
    const result = await register({ email: "PATIENT@EXAMPLE.COM" }).expect(409);
    expect(result.body).toEqual({
      code: "CONTACT_ALREADY_REGISTERED",
      message:
        "Email hoặc Số điện thoại đã được đăng ký. Vui lòng đăng nhập hoặc sử dụng chức năng quên mật khẩu.",
    });
  });

  test("does not invoke BCrypt for known cooldown or duplicate requests", async () => {
    const registration = await register().expect(202);
    const hashSpy = jest.spyOn(passwordUtils, "hashPassword");
    try {
      await register().expect(429);
      await verify(registration.body.registrationId).expect(201);
      await register().expect(409);
      expect(hashSpy).not.toHaveBeenCalled();
    } finally {
      hashSpy.mockRestore();
    }
  });

  test("rejects an existing legacy local-format phone", async () => {
    await database.query(
      "INSERT INTO users (phone_number, full_name, gender, date_of_birth) VALUES ('0901234567','Existing','MALE','2000-01-01')",
    );
    await register({ email: undefined, phoneNumber: "+84901234567" }).expect(
      409,
    );
    expect(send).not.toHaveBeenCalled();
  });

  test("commits failed attempts and locks both verification and requests after the fifth failure", async () => {
    const registration = await register().expect(202);
    for (let i = 1; i <= 4; i++) {
      const failure = await verify(
        registration.body.registrationId,
        wrongOtp(),
      ).expect(400);
      expect(failure.body.remainingAttempts).toBe(5 - i);
    }
    const failure = await verify(
      registration.body.registrationId,
      wrongOtp(),
    ).expect(429);
    expect(failure.body).toMatchObject({ code: "OTP_LOCKED", retryAfter: 900 });
    await verify(registration.body.registrationId).expect(429);
    const retry = await register().expect(429);
    expect(retry.body.code).toBe("OTP_LOCKED");
    const [session] = await database.query(
      "SELECT * FROM registration_sessions",
    );
    expect(session.failed_attempts).toBe(5);
    expect(await database.query("SELECT id FROM users")).toEqual([]);
  });

  test("serializes simultaneous invalid OTPs without losing failed-attempt counts", async () => {
    const registration = await register().expect(202);
    const results = await Promise.all(
      Array.from({ length: 8 }, () =>
        verify(registration.body.registrationId, wrongOtp()),
      ),
    );
    expect(results.filter((result) => result.status === 400)).toHaveLength(4);
    expect(results.filter((result) => result.status === 429)).toHaveLength(4);
    const [session] = await database.query(
      "SELECT failed_attempts FROM registration_sessions",
    );
    expect(session.failed_attempts).toBe(5);
  });

  test("OTP expires after 3 minutes and does not activate any account", async () => {
    const registration = await register().expect(202);
    await database.query(
      "UPDATE registration_sessions SET expires_at=clock_timestamp() - interval '1 second'",
    );
    const result = await verify(registration.body.registrationId).expect(400);
    expect(result.body.code).toBe("OTP_SESSION_INVALID");
    expect(await database.query("SELECT id FROM users")).toEqual([]);
  });

  test("resend has a cooldown, invalidates old session, and preserves failed-attempt budget", async () => {
    const first = await register().expect(202);
    const firstOtp = otp;
    const tooSoon = await register().expect(429);
    expect(tooSoon.body.code).toBe("OTP_RESEND_TOO_SOON");
    await verify(first.body.registrationId, wrongOtp()).expect(400);
    await database.query(
      "UPDATE registration_sessions SET sent_at=clock_timestamp() - interval '61 seconds'",
    );
    const second = await register().expect(202);
    expect(second.body.registrationId).not.toBe(first.body.registrationId);
    await verify(first.body.registrationId, firstOtp).expect(400);
    const [session] = await database.query(
      "SELECT failed_attempts FROM registration_sessions",
    );
    expect(session.failed_attempts).toBe(1);
    await verify(second.body.registrationId).expect(201);
  });

  test("requires a fresh OTP after the 15-minute lock ends", async () => {
    const first = await register().expect(202);
    const originalOtp = otp;
    for (let i = 0; i < 5; i++)
      await verify(first.body.registrationId, wrongOtp());
    await database.query(
      "UPDATE registration_sessions SET locked_until=clock_timestamp() - interval '1 second', sent_at=clock_timestamp() - interval '901 seconds'",
    );
    await verify(first.body.registrationId, originalOtp).expect(400);
    const second = await register().expect(202);
    const [session] = await database.query(
      "SELECT failed_attempts, locked_until FROM registration_sessions",
    );
    expect(session).toEqual({ failed_attempts: 0, locked_until: null });
    await verify(second.body.registrationId).expect(201);
  });

  test("can activate with the correct OTP after four failures", async () => {
    const registration = await register().expect(202);
    for (let i = 0; i < 4; i++)
      await verify(registration.body.registrationId, wrongOtp()).expect(400);
    await verify(registration.body.registrationId).expect(201);
  });

  test("a new service instance retains the persisted guessing/lockout state", async () => {
    const registration = await register().expect(202);
    for (let i = 0; i < 5; i++)
      await verify(registration.body.registrationId, wrongOtp());
    const restartedService = new AuthService(database, {
      send,
    } as unknown as OtpDeliveryService);
    await expect(
      restartedService.verifyRegistration({
        registrationId: registration.body.registrationId,
        otp,
      }),
    ).rejects.toMatchObject({ status: 429, response: { code: "OTP_LOCKED" } });
  });

  test("allows only one account/PHR when correct OTP is verified twice concurrently", async () => {
    const registration = await register().expect(202);
    const results = await Promise.all([
      verify(registration.body.registrationId),
      verify(registration.body.registrationId),
    ]);
    expect(results.map((result) => result.status).sort()).toEqual([201, 400]);
    expect(await database.query("SELECT id FROM users")).toHaveLength(1);
    expect(
      await database.query("SELECT id FROM personal_health_profiles"),
    ).toHaveLength(1);
  });

  test("serializes two simultaneous registration requests for the same identifier", async () => {
    const results = await Promise.all([register(), register()]);
    expect(results.map((result) => result.status).sort()).toEqual([202, 429]);
    expect(send).toHaveBeenCalledTimes(1);
    expect(
      await database.query("SELECT id FROM registration_sessions"),
    ).toHaveLength(1);
  });

  test("delivery failure does not persist a new pending request or account", async () => {
    send.mockRejectedValueOnce(
      new ServiceUnavailableException("Delivery failed"),
    );
    await register().expect(503);
    expect(
      await database.query("SELECT id FROM registration_sessions"),
    ).toEqual([]);
    expect(await database.query("SELECT id FROM users")).toEqual([]);
  });

  test("PHR creation failure rolls back user/role and retains OTP for retry", async () => {
    const registration = await register().expect(202);
    await database.query(
      "ALTER TABLE personal_health_profiles ADD CONSTRAINT test_phr_failure CHECK (blood_type IS NOT NULL)",
    );
    try {
      await expect(
        auth.verifyRegistration({
          registrationId: registration.body.registrationId,
          otp,
        }),
      ).rejects.toMatchObject({ code: "23514" });
      expect(await database.query("SELECT id FROM users")).toEqual([]);
      expect(await database.query("SELECT user_id FROM user_roles")).toEqual(
        [],
      );
      expect(
        await database.query("SELECT id FROM registration_sessions"),
      ).toHaveLength(1);
    } finally {
      await database.query(
        "ALTER TABLE personal_health_profiles DROP CONSTRAINT test_phr_failure",
      );
    }
    await verify(registration.body.registrationId).expect(201);
  });

  test("rejects malformed OTPs and unknown session IDs", async () => {
    await verify("not-a-uuid", "123456").expect(400);
    await verify("92fb6003-a8a7-43bb-9877-42eea4438263", "123456").expect(400);
    const registration = await register().expect(202);
    await verify(registration.body.registrationId, "12345").expect(400);
  });

  test("permits three SMS sends and rejects a fourth without BCrypt; latest OTP remains valid", async () => {
    let registrationId = "";
    for (let i = 0; i < 3; i++) {
      const result = await register({
        email: undefined,
        phoneNumber: "0901234567",
      }).expect(202);
      registrationId = result.body.registrationId;
      await database.query(
        "UPDATE registration_sessions SET sent_at=clock_timestamp() - interval '61 seconds'",
      );
    }
    const hashSpy = jest.spyOn(passwordUtils, "hashPassword");
    try {
      const rejected = await register({
        email: undefined,
        phoneNumber: "+84901234567",
      }).expect(429);
      expect(rejected.body.code).toBe("OTP_SEND_LIMIT_EXCEEDED");
      expect(rejected.body.retryAfter).toBeGreaterThan(0);
      expect(rejected.body.retryAfter).toBeLessThanOrEqual(600);
      expect(hashSpy).not.toHaveBeenCalled();
    } finally {
      hashSpy.mockRestore();
    }
    expect(send).toHaveBeenCalledTimes(3);
    expect(
      await database.query("SELECT id FROM registration_otp_sends"),
    ).toHaveLength(3);
    await verify(registrationId).expect(201);
  });

  test("SMS quota is per normalized phone, not shared between patients", async () => {
    await database.query(`INSERT INTO registration_otp_sends (phone_number)
      SELECT '+84901234567' FROM generate_series(1, 3)`);
    await register({ email: undefined, phoneNumber: "0901234567" }).expect(429);
    await register({ email: undefined, phoneNumber: "0907654321" }).expect(202);
    expect(send).toHaveBeenCalledTimes(1);
  });

  test("a rolling-window slot becomes available when the oldest send reaches ten minutes", async () => {
    await database.query(`INSERT INTO registration_otp_sends (phone_number, sent_at) VALUES
      ('+84901234567', clock_timestamp() - interval '10 minutes'),
      ('+84901234567', clock_timestamp() - interval '120 seconds'),
      ('+84901234567', clock_timestamp() - interval '61 seconds')`);
    await register({ email: undefined, phoneNumber: "0901234567" }).expect(202);
    expect(
      await database.query("SELECT id FROM registration_otp_sends"),
    ).toHaveLength(3);
  });

  test("parallel requests cannot use the final SMS quota slot more than once", async () => {
    await database.query(`INSERT INTO registration_otp_sends (phone_number, sent_at) VALUES
      ('+84901234567', clock_timestamp() - interval '120 seconds'),
      ('+84901234567', clock_timestamp() - interval '61 seconds')`);
    const results = await Promise.all(
      Array.from({ length: 4 }, () =>
        register({ email: undefined, phoneNumber: "0901234567" }),
      ),
    );
    expect(results.filter((result) => result.status === 202)).toHaveLength(1);
    expect(results.filter((result) => result.status === 429)).toHaveLength(3);
    expect(send).toHaveBeenCalledTimes(1);
    expect(
      await database.query("SELECT id FROM registration_otp_sends"),
    ).toHaveLength(3);
  });

  test("a rejected SMS delivery does not consume quota or persist a new session", async () => {
    await database.query(`INSERT INTO registration_otp_sends (phone_number, sent_at)
      SELECT '+84901234567', clock_timestamp() - interval '61 seconds' FROM generate_series(1, 2)`);
    send.mockRejectedValueOnce(
      new ServiceUnavailableException("Delivery failed"),
    );
    await register({ email: undefined, phoneNumber: "0901234567" }).expect(503);
    expect(
      await database.query("SELECT id FROM registration_otp_sends"),
    ).toHaveLength(2);
    expect(
      await database.query("SELECT id FROM registration_sessions"),
    ).toHaveLength(0);
    await register({ email: undefined, phoneNumber: "0901234567" }).expect(202);
    expect(
      await database.query("SELECT id FROM registration_otp_sends"),
    ).toHaveLength(3);
  });

  test("a new service instance retains SMS quota independently of OTP sessions", async () => {
    await database.query(`INSERT INTO registration_otp_sends (phone_number)
      SELECT '+84901234567' FROM generate_series(1, 3)`);
    const restartedService = new AuthService(database, {
      send,
    } as unknown as OtpDeliveryService);
    await expect(
      restartedService.requestRegistration({
        ...payload,
        email: undefined,
        phoneNumber: "0901234567",
        gender: Gender.MALE,
      }),
    ).rejects.toMatchObject({
      status: 429,
      response: { code: "OTP_SEND_LIMIT_EXCEEDED" },
    });
    expect(send).not.toHaveBeenCalled();
  });
});
