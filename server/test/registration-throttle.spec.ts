import "./test-environment";
import { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { DataSource } from "typeorm";
import request from "supertest";
import { AppModule } from "../src/app.module";
import { DatabaseModule } from "../src/database/database.module";
import { AuthService } from "../src/auth/auth.service";
import { configureApp } from "../src/configure-app";
import { environment } from "../src/config/environment";

describe("registration HTTP rate limits", () => {
  let app: INestApplication;
  const originalProxy = environment.TRUSTED_PROXY_CIDRS;
  const requestRegistration = jest.fn().mockResolvedValue({
    registrationId: "92fb6003-a8a7-43bb-9877-42eea4438263",
    expiresIn: 180,
    resendAfter: 60,
    channel: "email",
  });
  const verifyRegistration = jest
    .fn()
    .mockResolvedValue({ status: "ACTIVE", role: "ROLE_PATIENT" });

  beforeAll(async () => {
    environment.TRUSTED_PROXY_CIDRS = "127.0.0.1/32,::1/128";
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideModule(DatabaseModule)
      .useModule({
        module: class NoDatabaseModule {},
        providers: [{ provide: DataSource, useValue: {} }],
        exports: [DataSource],
      })
      .overrideProvider(AuthService)
      .useValue({ requestRegistration, verifyRegistration })
      .compile();
    app = module.createNestApplication();
    configureApp(app);
    await app.init();
  });
  afterAll(async () => {
    if (app) await app.close();
    if (originalProxy === undefined) delete environment.TRUSTED_PROXY_CIDRS;
    else environment.TRUSTED_PROXY_CIDRS = originalProxy;
  });

  test("permits 5 requests/minute/IP and rejects the sixth before hashing or delivery", async () => {
    const payload = {
      email: "patient@example.com",
      password: "Abcd123!",
      fullName: "Patient",
      gender: "OTHER",
      dateOfBirth: "2000-01-01",
    };
    for (let i = 0; i < 5; i++)
      await request(app.getHttpServer())
        .post("/api/v1/auth/register/otp")
        .send(payload)
        .expect(202);
    await request(app.getHttpServer())
      .post("/api/v1/auth/register/otp")
      .send(payload)
      .expect(429);
    expect(requestRegistration).toHaveBeenCalledTimes(5);
  });

  test("permits 20 verification requests/minute/IP, independently of OTP-request limit", async () => {
    const payload = {
      registrationId: "92fb6003-a8a7-43bb-9877-42eea4438263",
      otp: "012345",
    };
    for (let i = 0; i < 20; i++)
      await request(app.getHttpServer())
        .post("/api/v1/auth/register/verify")
        .send(payload)
        .expect(201);
    await request(app.getHttpServer())
      .post("/api/v1/auth/register/verify")
      .send(payload)
      .expect(429);
    expect(verifyRegistration).toHaveBeenCalledTimes(20);
  });

  test("distinguishes client IPs forwarded by an explicitly trusted gateway", async () => {
    const payload = {
      email: "patient@example.com",
      password: "Abcd123!",
      fullName: "Patient",
      gender: "OTHER",
      dateOfBirth: "2000-01-01",
    };
    for (let i = 0; i < 5; i++)
      await request(app.getHttpServer())
        .post("/api/v1/auth/register/otp")
        .set("X-Forwarded-For", "203.0.113.10")
        .send(payload)
        .expect(202);
    await request(app.getHttpServer())
      .post("/api/v1/auth/register/otp")
      .set("X-Forwarded-For", "203.0.113.10")
      .send(payload)
      .expect(429);
    await request(app.getHttpServer())
      .post("/api/v1/auth/register/otp")
      .set("X-Forwarded-For", "203.0.113.11")
      .send(payload)
      .expect(202);
  });
});
