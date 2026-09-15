import "reflect-metadata";
import "./test-environment";
import { Controller, Get, INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { ThrottlerGuard } from "@nestjs/throttler";
import { hash } from "bcrypt";
import { createHash } from "node:crypto";
import { JwtPayload, sign, verify as verifyJwt } from "jsonwebtoken";
import { OAuth2Client } from "google-auth-library";
import request from "supertest";
import { DataSource } from "typeorm";
import { AppModule } from "../src/app.module";
import { Roles } from "../src/auth/auth.decorators";
import { configureApp } from "../src/configure-app";
import { environment } from "../src/config/environment";
import { DatabaseModule } from "../src/database/database.module";
import { createDataSource } from "../src/database/database-options";
import { Role } from "../../shared/src/enums/role.enum";

// Route riêng để kiểm tra guard toàn cục với đủ bốn vai trò và mặc định từ chối.
@Controller("test-rbac")
class RbacTestController {
  @Get("patient") @Roles(Role.PATIENT) patient() {
    return { allowed: true };
  }
  @Get("doctor") @Roles(Role.DOCTOR) doctor() {
    return { allowed: true };
  }
  @Get("receptionist") @Roles(Role.RECEPTIONIST) receptionist() {
    return { allowed: true };
  }
  @Get("admin") @Roles(Role.ADMIN) admin() {
    return { allowed: true };
  }
  @Get("undeclared") undeclared() {
    return { allowed: true };
  }
}

const url = environment.TEST_DATABASE_URL;
// Chỉ được phép xóa dữ liệu trong CSDL riêng có tiền tố dành cho kiểm thử.
if (!url || !new URL(url).pathname.startsWith("/ehealth_auth_test_")) {
  throw new Error(
    "TEST_DATABASE_URL phải trỏ đến CSDL ehealth_auth_test_* riêng.",
  );
}

describe("SRS-AUTH-02 HTTP và PostgreSQL thật", () => {
  let app: INestApplication;
  let database: DataSource;
  let passwordHash: string;
  const password = "Abcd123!";
  const email = "patient@example.com";
  const endpoint = "/api/v1/auth";
  const login = (identifier = email, value = password) =>
    request(app.getHttpServer())
      .post(`${endpoint}/login`)
      .send({ identifier, password: value });
  const me = (token: string) =>
    request(app.getHttpServer())
      .get(`${endpoint}/me`)
      .auth(token, { type: "bearer" });
  const refresh = (cookie?: string) => {
    const call = request(app.getHttpServer()).post(`${endpoint}/refresh`);
    return cookie ? call.set("Cookie", cookie) : call;
  };
  const refreshCookie = (response: { headers: Record<string, unknown> }) => {
    const cookies = response.headers["set-cookie"] as string[];
    const cookie = cookies.find((value) =>
      value.startsWith("ehealth_refresh="),
    );
    expect(cookie).toBeDefined();
    return cookie!;
  };
  const cookiePair = (cookie: string) => cookie.split(";")[0];
  const seed = async (
    role = Role.PATIENT,
    identifier = email,
    status = "ACTIVE",
  ) => {
    const [user] = await database.query(
      `INSERT INTO users
      (email,phone_number,password_hash,full_name,gender,date_of_birth,status)
      VALUES ($1,$2,$3,'Nguyễn Văn A','MALE','2000-01-02',$4) RETURNING id`,
      [
        identifier,
        identifier === email ? "+84901234567" : null,
        passwordHash,
        status,
      ],
    );
    await database.query(
      "INSERT INTO user_roles (user_id,role) VALUES ($1,$2)",
      [user.id, role],
    );
    return user.id as string;
  };

  beforeAll(async () => {
    environment.GOOGLE_CLIENT_ID = "google-client-id-integration-test";
    environment.GOOGLE_CLIENT_SECRET = "google-client-secret-integration-test";
    environment.GOOGLE_REDIRECT_URI =
      "https://api.example.test/api/v1/auth/google/callback";
    environment.FRONTEND_URL = "https://client.example.test";
    passwordHash = await hash(password, 12);
    database = await createDataSource(url!).initialize();
    await database.runMigrations();
    const module = await Test.createTestingModule({
      imports: [AppModule],
      controllers: [RbacTestController],
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
    app = module.createNestApplication();
    configureApp(app);
    await app.init();
  });

  beforeEach(async () => {
    await database.query(
      "TRUNCATE registration_otp_sends,registration_sessions,google_oauth_flows,google_registration_sessions,auth_sessions,personal_health_profiles,user_roles,users CASCADE",
    );
  });

  afterAll(async () => {
    if (app) await app.close();
    if (database?.isInitialized) await database.destroy();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test("đăng nhập cấp JWT đúng thời hạn và refresh chỉ nằm trong cookie bảo mật", async () => {
    const userId = await seed();
    const result = await login(" PATIENT@Example.com ").expect(200);
    expect(Object.keys(result.body).sort()).toEqual(["accessToken", "role"]);
    expect(result.body.role).toBe(Role.PATIENT);
    expect(result.headers["cache-control"]).toBe("no-store");
    const cookie = refreshCookie(result);
    for (const attribute of [
      "HttpOnly",
      "Secure",
      "SameSite=Strict",
      "Max-Age=604800",
      "Path=/api/v1/auth",
    ])
      expect(cookie).toContain(attribute);
    const access = verifyJwt(
      result.body.accessToken,
      environment.JWT_ACCESS_SECRET!,
      { issuer: "ehealth-api", audience: "ehealth-client" },
    ) as JwtPayload;
    const refreshClaims = verifyJwt(
      cookiePair(cookie).split("=")[1],
      environment.JWT_REFRESH_SECRET!,
      { issuer: "ehealth-api", audience: "ehealth-refresh" },
    ) as JwtPayload;
    expect(access).toMatchObject({
      userId,
      role: Role.PATIENT,
      type: "access",
      sub: userId,
    });
    expect(access.exp! - access.iat!).toBe(900);
    expect(refreshClaims.exp! - refreshClaims.iat!).toBe(604800);
    expect(refreshClaims.sid).toBe(access.sid);
    const [stored] = await database.query("SELECT * FROM auth_sessions");
    expect(stored.refresh_token_hash).toBe(
      createHash("sha256")
        .update(cookiePair(cookie).split("=")[1])
        .digest("hex"),
    );
    expect(stored.refresh_token_hash).not.toContain(
      cookiePair(cookie).split("=")[1],
    );
    await me(result.body.accessToken).expect(200, {
      userId,
      role: Role.PATIENT,
    });
    await login("0901234567").expect(200);
    await login("+84901234567").expect(200);
  });

  test("xoay refresh; dùng lại token cũ thu hồi cả phiên và access đã cấp", async () => {
    await seed();
    const initial = await login().expect(200);
    const oldCookie = cookiePair(refreshCookie(initial));
    const renewed = await refresh(oldCookie).expect(200);
    const newCookie = cookiePair(refreshCookie(renewed));
    expect(newCookie).not.toBe(oldCookie);
    await me(renewed.body.accessToken).expect(200);
    await refresh(oldCookie).expect(401);
    await refresh(newCookie).expect(401);
    await me(initial.body.accessToken).expect(401);
    await me(renewed.body.accessToken).expect(401);
    const [stored] = await database.query(
      "SELECT revoked_at FROM auth_sessions",
    );
    expect(stored.revoked_at).toBeInstanceOf(Date);
  });

  test("refresh không chấp nhận token trong body hay access token thay refresh", async () => {
    await seed();
    const result = await login().expect(200);
    await refresh().expect(401);
    await refresh()
      .send({ refreshToken: cookiePair(refreshCookie(result)).split("=")[1] })
      .expect(401);
    await refresh(`ehealth_refresh=${result.body.accessToken}`).expect(401);
  });

  test("đăng xuất xóa cookie, thu hồi phiên và gọi lại vẫn thành công", async () => {
    await seed();
    const result = await login().expect(200);
    const cookie = cookiePair(refreshCookie(result));
    const loggedOut = await request(app.getHttpServer())
      .post(`${endpoint}/logout`)
      .set("Cookie", cookie)
      .expect(204);
    expect(refreshCookie(loggedOut)).toContain("Expires=Thu, 01 Jan 1970");
    await me(result.body.accessToken).expect(401);
    await refresh(cookie).expect(401);
    await request(app.getHttpServer()).post(`${endpoint}/logout`).expect(204);
  });

  test("sai năm lần khóa 30 phút, thu hồi phiên và hết khóa cho phép đăng nhập", async () => {
    const userId = await seed();
    const previous = await login().expect(200);
    for (let i = 0; i < 4; i++) await login(email, "Sai1234!").expect(401);
    const locked = await login(email, "Sai1234!").expect(429);
    expect(locked.body).toMatchObject({
      code: "LOGIN_LOCKED",
      retryAfter: 1800,
    });
    await login().expect(429);
    await me(previous.body.accessToken).expect(401);
    await refresh(cookiePair(refreshCookie(previous))).expect(401);
    const [user] = await database.query(
      "SELECT failed_login_attempts,login_locked_until FROM users WHERE id=$1",
      [userId],
    );
    expect(user.failed_login_attempts).toBe(5);
    expect(user.login_locked_until).toBeInstanceOf(Date);
    await database.query(
      "UPDATE users SET login_locked_until=clock_timestamp()-interval '1 second' WHERE id=$1",
      [userId],
    );
    await login().expect(200);
    const [reset] = await database.query(
      "SELECT failed_login_attempts,login_locked_until FROM users WHERE id=$1",
      [userId],
    );
    expect(reset).toEqual({
      failed_login_attempts: 0,
      login_locked_until: null,
    });
  });

  test("đăng nhập thành công đặt lại số lần sai liên tiếp", async () => {
    await seed();
    for (let i = 0; i < 4; i++) await login(email, "Sai1234!").expect(401);
    await login().expect(200);
    await login(email, "Sai1234!").expect(401);
    const [user] = await database.query(
      "SELECT failed_login_attempts FROM users",
    );
    expect(user.failed_login_attempts).toBe(1);
  });

  test("tám lần sai đồng thời không làm mất bộ đếm hoặc vượt ngưỡng khóa", async () => {
    await seed();
    const responses = await Promise.all(
      Array.from({ length: 8 }, () => login(email, "Sai1234!")),
    );
    expect(responses.filter((result) => result.status === 401)).toHaveLength(4);
    expect(responses.filter((result) => result.status === 429)).toHaveLength(4);
    const [user] = await database.query(
      "SELECT failed_login_attempts FROM users",
    );
    expect(user.failed_login_attempts).toBe(5);
  });

  test.each(["PENDING_VERIFY", "BLOCKED"])(
    "tài khoản %s không được cấp phiên",
    async (status) => {
      await seed(Role.PATIENT, email, status);
      await login().expect(401);
      expect(await database.query("SELECT id FROM auth_sessions")).toEqual([]);
    },
  );

  test("tài khoản không tồn tại không được cấp phiên", async () => {
    await login().expect(401);
    expect(await database.query("SELECT id FROM auth_sessions")).toEqual([]);
  });

  test("email bắt đầu bằng số 0 vẫn được xử lý là email khi đăng nhập", async () => {
    const userId = await seed(Role.PATIENT, "0patient@example.com");
    const result = await login("0patient@example.com").expect(200);
    await me(result.body.accessToken).expect(200, {
      userId,
      role: Role.PATIENT,
    });
  });

  test.each([
    [Role.PATIENT, "patient"],
    [Role.DOCTOR, "doctor"],
    [Role.RECEPTIONIST, "receptionist"],
    [Role.ADMIN, "admin"],
  ])(
    "guard cho phép đúng vai trò %s và từ chối vai trò khác",
    async (role, route) => {
      await seed(role);
      const result = await login().expect(200);
      const get = (path: string) =>
        request(app.getHttpServer())
          .get(`/api/v1/test-rbac/${path}`)
          .auth(result.body.accessToken, { type: "bearer" });
      await get(route).expect(200, { allowed: true });
      await get(route === "admin" ? "patient" : "admin").expect(403);
      await get("undeclared").expect(403);
      await request(app.getHttpServer())
        .get(`/api/v1/test-rbac/${route}`)
        .expect(401);
    },
  );

  test("JWT sai chữ ký, hết hạn, sai loại và đổi vai trò trong CSDL đều bị từ chối", async () => {
    const userId = await seed();
    const result = await login().expect(200);
    const claims = verifyJwt(
      result.body.accessToken,
      environment.JWT_ACCESS_SECRET!,
    ) as JwtPayload;
    const { exp: _exp, iat: _iat, ...base } = claims;
    await me("token-khong-hop-le").expect(401);
    await me(sign(base, "secret-khong-dung", { expiresIn: 900 })).expect(401);
    await me(
      sign(base, environment.JWT_ACCESS_SECRET!, { expiresIn: -1 }),
    ).expect(401);
    await me(cookiePair(refreshCookie(result)).split("=")[1]).expect(401);
    await database.query("UPDATE user_roles SET role=$2 WHERE user_id=$1", [
      userId,
      Role.DOCTOR,
    ]);
    await me(result.body.accessToken).expect(401);
  });

  const googleToken = "ma-hoan-thien-google-chi-danh-cho-test";
  const googleProfile = {
    fullName: "Nguyễn Thị B",
    gender: "FEMALE",
    dateOfBirth: "2001-02-03",
  };
  const seedGoogle = async () => {
    await database.query(
      `INSERT INTO google_registration_sessions (token_hash,google_subject,email,full_name,expires_at)
      VALUES ($1,'google-subject-test','google@gmail.com','Tên từ Google',clock_timestamp()+interval '10 minutes')`,
      [createHash("sha256").update(googleToken).digest("hex")],
    );
  };
  const completeGoogle = (token = googleToken, patch = {}) =>
    request(app.getHttpServer())
      .post(`${endpoint}/google/complete`)
      .set("Cookie", `ehealth_google_complete=${token}`)
      .send({ ...googleProfile, ...patch });

  test("hoàn thiện Google tạo ACTIVE patient, PHR rỗng và phiên; không dùng lại cookie", async () => {
    await seedGoogle();
    const result = await completeGoogle().expect(200);
    expect(result.body.role).toBe(Role.PATIENT);
    refreshCookie(result);
    const [user] = await database.query("SELECT * FROM users");
    expect(user).toMatchObject({
      email: "google@gmail.com",
      google_subject: "google-subject-test",
      full_name: googleProfile.fullName,
      status: "ACTIVE",
      password_hash: null,
    });
    expect(
      await database.query("SELECT role FROM user_roles WHERE user_id=$1", [
        user.id,
      ]),
    ).toEqual([{ role: Role.PATIENT }]);
    const [phr] = await database.query(
      "SELECT * FROM personal_health_profiles WHERE user_id=$1",
      [user.id],
    );
    expect(phr).toMatchObject({
      blood_type: null,
      allergies: null,
      medical_history: null,
    });
    await me(result.body.accessToken).expect(200, {
      userId: user.id,
      role: Role.PATIENT,
    });
    await completeGoogle().expect(401);
    expect(await database.query("SELECT id FROM users")).toHaveLength(1);
  });

  test("cookie Google hết hạn hoặc không có không tạo tài khoản", async () => {
    await seedGoogle();
    await database.query(
      "UPDATE google_registration_sessions SET expires_at=clock_timestamp()-interval '1 second'",
    );
    await completeGoogle().expect(401);
    await request(app.getHttpServer())
      .post(`${endpoint}/google/complete`)
      .send(googleProfile)
      .expect(401);
    expect(await database.query("SELECT id FROM users")).toEqual([]);
  });

  test("Google kiểm tra hồ sơ trước khi tiêu thụ phiên", async () => {
    await seedGoogle();
    await completeGoogle(googleToken, { dateOfBirth: "2099-01-01" }).expect(
      400,
    );
    await completeGoogle(googleToken, { dateOfBirth: "2001-02-29" }).expect(
      400,
    );
    await completeGoogle(googleToken, { role: Role.ADMIN }).expect(400);
    expect(
      await database.query(
        "SELECT token_hash FROM google_registration_sessions",
      ),
    ).toHaveLength(1);
    expect(await database.query("SELECT id FROM users")).toEqual([]);
    await completeGoogle().expect(200);
  });

  const startGoogle = async () => {
    const started = await request(app.getHttpServer())
      .get(`${endpoint}/google`)
      .expect(302);
    const location = new URL(started.headers.location);
    expect(location.hostname).toBe("accounts.google.com");
    expect(location.searchParams.get("scope")).toBe("openid email profile");
    expect(location.searchParams.get("code_challenge_method")).toBe("S256");
    expect(location.searchParams.get("code_challenge")).toBeTruthy();
    const cookie = (started.headers["set-cookie"] as unknown as string[]).find(
      (value) => value.startsWith("ehealth_google_flow="),
    )!;
    for (const attribute of [
      "HttpOnly",
      "Secure",
      "SameSite=Lax",
      "Max-Age=300",
      "Path=/api/v1/auth/google",
    ])
      expect(cookie).toContain(attribute);
    return {
      state: location.searchParams.get("state")!,
      nonce: location.searchParams.get("nonce")!,
      cookie: cookiePair(cookie),
    };
  };
  const mockGoogleIdentity = (nonce: string) => {
    // Chỉ thay trao đổi mạng và kiểm tra chữ ký SDK; luồng HTTP và CSDL vẫn chạy thật.
    const exchange = jest
      .spyOn(OAuth2Client.prototype, "getToken")
      .mockResolvedValue({
        tokens: { id_token: "id-token-google-gia" },
        res: null,
      } as never);
    const identity = {
      sub: "google-test",
      email: "patient@gmail.com",
      email_verified: true,
      iss: "https://accounts.google.com",
      aud: environment.GOOGLE_CLIENT_ID!,
      exp: Math.floor(Date.now() / 1000) + 3600,
      iat: Math.floor(Date.now() / 1000),
      nonce,
      name: "Nguyễn Văn Google",
    };
    jest
      .spyOn(OAuth2Client.prototype, "verifyIdToken")
      .mockResolvedValue({ getPayload: () => identity } as never);
    return exchange;
  };
  const googleCallback = (state: string, cookie: string) =>
    request(app.getHttpServer())
      .get(`${endpoint}/google/callback`)
      .query({ code: "ma-google-gia", state })
      .set("Cookie", cookie);

  test("Google start và callback cho người mới tạo cookie hoàn thiện, dùng một lần và tạo PHR", async () => {
    const flow = await startGoogle();
    const exchange = mockGoogleIdentity(flow.nonce);
    const callback = await googleCallback(flow.state, flow.cookie).expect(302);
    expect(callback.headers.location).toBe(
      "https://client.example.test/register?google=complete",
    );
    expect(callback.headers.location).not.toContain("token");
    expect(exchange).toHaveBeenCalledTimes(1);
    expect(exchange).toHaveBeenCalledWith({
      code: "ma-google-gia",
      codeVerifier: expect.any(String),
    });
    const completeCookie = (
      callback.headers["set-cookie"] as unknown as string[]
    ).find((value) => value.startsWith("ehealth_google_complete="))!;
    for (const attribute of [
      "HttpOnly",
      "Secure",
      "SameSite=Strict",
      "Max-Age=600",
    ])
      expect(completeCookie).toContain(attribute);
    expect(await database.query("SELECT id FROM google_oauth_flows")).toEqual(
      [],
    );
    expect(await database.query("SELECT id FROM users")).toEqual([]);
    await googleCallback(flow.state, flow.cookie).expect(401);
    expect(exchange).toHaveBeenCalledTimes(1);
    const completed = await request(app.getHttpServer())
      .post(`${endpoint}/google/complete`)
      .set("Cookie", cookiePair(completeCookie))
      .send(googleProfile)
      .expect(200);
    refreshCookie(completed);
    const [user] = await database.query("SELECT id,google_subject FROM users");
    expect(user.google_subject).toBe("google-test");
    expect(
      await database.query("SELECT user_id FROM personal_health_profiles"),
    ).toEqual([{ user_id: user.id }]);
    await me(completed.body.accessToken).expect(200, {
      userId: user.id,
      role: Role.PATIENT,
    });
  });

  test("callback Google liên kết email Gmail hiện có và cấp phiên không đưa token vào URL", async () => {
    const userId = await seed(Role.PATIENT, "patient@gmail.com");
    const flow = await startGoogle();
    mockGoogleIdentity(flow.nonce);
    const callback = await googleCallback(flow.state, flow.cookie).expect(302);
    expect(callback.headers.location).toBe(
      "https://client.example.test/login?google=success",
    );
    const cookie = cookiePair(refreshCookie(callback));
    const renewed = await refresh(cookie).expect(200);
    await me(renewed.body.accessToken).expect(200, {
      userId,
      role: Role.PATIENT,
    });
    expect(await database.query("SELECT id,google_subject FROM users")).toEqual(
      [{ id: userId, google_subject: "google-test" }],
    );
  });

  test("Google ưu tiên tài khoản đã liên kết subject khi email hiện tại trùng tài khoản khác", async () => {
    const linkedUserId = await seed(Role.PATIENT, "old@example.com");
    await database.query("UPDATE users SET google_subject=$2 WHERE id=$1", [
      linkedUserId,
      "google-test",
    ]);
    const otherUserId = await seed(Role.PATIENT, "patient@gmail.com");
    const flow = await startGoogle();
    mockGoogleIdentity(flow.nonce);
    const callback = await googleCallback(flow.state, flow.cookie).expect(302);
    expect(callback.headers.location).toBe(
      "https://client.example.test/login?google=success",
    );
    const session = await refresh(cookiePair(refreshCookie(callback))).expect(
      200,
    );
    await me(session.body.accessToken).expect(200, {
      userId: linkedUserId,
      role: Role.PATIENT,
    });
    const [otherUser] = await database.query(
      "SELECT google_subject FROM users WHERE id=$1",
      [otherUserId],
    );
    expect(otherUser.google_subject).toBeNull();
    const [linkedUser] = await database.query(
      "SELECT google_subject FROM users WHERE id=$1",
      [linkedUserId],
    );
    expect(linkedUser.google_subject).toBe("google-test");
  });

  test("callback Google yêu cầu cookie đúng trình duyệt và cho phép thử lại bằng cookie đúng", async () => {
    const flow = await startGoogle();
    const exchange = mockGoogleIdentity(flow.nonce);
    await googleCallback(
      flow.state,
      "ehealth_google_flow=trinh-duyet-khac",
    ).expect(401);
    expect(exchange).not.toHaveBeenCalled();
    expect(
      await database.query("SELECT id FROM google_oauth_flows"),
    ).toHaveLength(1);
    await googleCallback(flow.state, flow.cookie).expect(302);
    expect(exchange).toHaveBeenCalledTimes(1);
  });

  test("callback Google từ chối nonce sai và tiêu thụ phiên để tránh phát lại", async () => {
    const flow = await startGoogle();
    const exchange = mockGoogleIdentity("nonce-khong-khop");
    await googleCallback(flow.state, flow.cookie).expect(401);
    expect(exchange).toHaveBeenCalledTimes(1);
    expect(await database.query("SELECT id FROM google_oauth_flows")).toEqual(
      [],
    );
    expect(
      await database.query(
        "SELECT token_hash FROM google_registration_sessions",
      ),
    ).toEqual([]);
    await googleCallback(flow.state, flow.cookie).expect(401);
    expect(exchange).toHaveBeenCalledTimes(1);
  });

  test("callback Google hết hạn không trao đổi mã hoặc cấp phiên", async () => {
    const flow = await startGoogle();
    const exchange = mockGoogleIdentity(flow.nonce);
    await database.query(
      "UPDATE google_oauth_flows SET expires_at=clock_timestamp()-interval '1 second'",
    );
    await googleCallback(flow.state, flow.cookie).expect(401);
    expect(exchange).not.toHaveBeenCalled();
    expect(await database.query("SELECT id FROM auth_sessions")).toEqual([]);
  });
});
