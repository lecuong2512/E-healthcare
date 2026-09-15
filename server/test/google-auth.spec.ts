import { createHash } from "node:crypto";
import { DataSource } from "typeorm";
import { OAuth2Client } from "google-auth-library";
import { GoogleAuthService } from "../src/auth/google-auth.service";
import { SessionService } from "../src/auth/session.service";
import { environment } from "../src/config/environment";

jest.mock("google-auth-library", () => ({
  OAuth2Client: jest.fn(),
  CodeChallengeMethod: { S256: "S256" },
}));
const digest = (value: string) =>
  createHash("sha256").update(value).digest("hex");

describe("Đăng nhập Google", () => {
  const keys = [
    "GOOGLE_CLIENT_ID",
    "GOOGLE_CLIENT_SECRET",
    "GOOGLE_REDIRECT_URI",
  ];
  const originals = keys.map((key) => environment[key]);
  let query: jest.Mock;
  let client: {
    generateCodeVerifierAsync: jest.Mock;
    generateAuthUrl: jest.Mock;
    getToken: jest.Mock;
    verifyIdToken: jest.Mock;
  };
  let service: GoogleAuthService;

  beforeEach(() => {
    environment["GOOGLE_CLIENT_ID"] = "client-id";
    environment["GOOGLE_CLIENT_SECRET"] = "client-secret";
    environment["GOOGLE_REDIRECT_URI"] =
      "https://api.example.com/api/v1/auth/google/callback";
    query = jest.fn().mockResolvedValue([]);
    client = {
      generateCodeVerifierAsync: jest
        .fn()
        .mockResolvedValue({
          codeVerifier: "verifier",
          codeChallenge: "challenge",
        }),
      generateAuthUrl: jest
        .fn()
        .mockReturnValue("https://accounts.google.com/authorize"),
      getToken: jest
        .fn()
        .mockResolvedValue({ tokens: { id_token: "signed-token" } }),
      verifyIdToken: jest.fn(),
    };
    (OAuth2Client as unknown as jest.Mock).mockImplementation(() => client);
    service = new GoogleAuthService(
      { query } as unknown as DataSource,
      {} as SessionService,
    );
  });
  afterAll(() =>
    keys.forEach((key, index) => {
      if (originals[index] === undefined) delete environment[key];
      else environment[key] = originals[index];
    }),
  );

  test("Thiếu cấu hình không cho đăng nhập", async () => {
    delete environment["GOOGLE_CLIENT_ID"];
    await expect(service.start()).rejects.toMatchObject({ status: 503 });
    expect(query).not.toHaveBeenCalled();
  });

  test("Tạo state, nonce và PKCE, chỉ lưu hash cookie trình duyệt", async () => {
    const result = await service.start();
    const options = client.generateAuthUrl.mock.calls[0][0];
    expect(options).toMatchObject({
      code_challenge: "challenge",
      code_challenge_method: "S256",
      scope: ["openid", "email", "profile"],
    });
    expect(options.state).not.toBe(options.nonce);
    expect(query.mock.calls[1][1]).toEqual([
      expect.any(String),
      digest(options.state),
      digest(result.browserToken),
      digest(options.nonce),
      "verifier",
    ]);
  });

  test("Callback sai đường dẫn hoặc HTTP production bị từ chối", async () => {
    environment["GOOGLE_REDIRECT_URI"] = "https://api.example.com/wrong";
    await expect(service.start()).rejects.toMatchObject({ status: 503 });
    const previous = environment["NODE_ENV"];
    environment["NODE_ENV"] = "production";
    environment["GOOGLE_REDIRECT_URI"] =
      "http://api.example.com/api/v1/auth/google/callback";
    await expect(service.start()).rejects.toMatchObject({ status: 503 });
    if (previous === undefined) delete environment["NODE_ENV"];
    else environment["NODE_ENV"] = previous;
  });

  test("State hoặc cookie sai không trao đổi code với Google", async () => {
    await expect(
      service.callback("code", "state", "wrong-browser"),
    ).rejects.toMatchObject({ status: 401 });
    expect(client.getToken).not.toHaveBeenCalled();
  });

  test.each([
    { email_verified: false },
    { email_verified: "true" },
    { nonce: "wrong-nonce" },
    { aud: "other-client" },
    { iss: "https://attacker.example.com" },
    { exp: 1 },
  ])("Từ chối claim không hợp lệ %j", async (override) => {
    query.mockResolvedValue([
      { nonce_hash: digest("nonce"), code_verifier: "verifier" },
    ]);
    client.verifyIdToken.mockResolvedValue({
      getPayload: () => ({
        sub: "google-sub",
        email: "user@gmail.com",
        email_verified: true,
        nonce: "nonce",
        aud: "client-id",
        iss: "https://accounts.google.com",
        exp: Math.floor(Date.now() / 1000) + 300,
        ...override,
      }),
    });
    await expect(
      service.callback("code", "state", "browser"),
    ).rejects.toMatchObject({ status: 401 });
    expect(client.getToken).toHaveBeenCalledWith({
      code: "code",
      codeVerifier: "verifier",
    });
  });

  test("Không chấp nhận ngày sinh tương lai khi hoàn tất hồ sơ", async () => {
    await expect(
      service.complete("token", {
        fullName: "Người dùng",
        gender: "OTHER",
        dateOfBirth: "2999-01-01",
      } as never),
    ).rejects.toMatchObject({ status: 400 });
    expect(query).not.toHaveBeenCalled();
  });

  test("Google mới yêu cầu bổ sung hồ sơ trước khi tạo tài khoản", async () => {
    query.mockResolvedValue([
      { nonce_hash: digest("nonce"), code_verifier: "verifier" },
    ]);
    client.verifyIdToken.mockResolvedValue({
      getPayload: () => ({
        sub: "google-sub",
        email: "User@gmail.com",
        email_verified: true,
        nonce: "nonce",
        aud: "client-id",
        iss: "https://accounts.google.com",
        exp: Math.floor(Date.now() / 1000) + 300,
      }),
    });
    const manager = { query: jest.fn().mockResolvedValue([]) };
    const database = {
      query,
      transaction: (action: (manager: unknown) => unknown) => action(manager),
    };
    const sessions = { issueSession: jest.fn() };
    service = new GoogleAuthService(
      database as unknown as DataSource,
      sessions as unknown as SessionService,
    );
    const result = await service.callback("code", "state", "browser");
    expect(result.completionToken).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(result.session).toBeUndefined();
    expect(sessions.issueSession).not.toHaveBeenCalled();
    expect(manager.query.mock.calls.at(-1)?.[1]).toEqual([
      digest(result.completionToken!),
      "google-sub",
      "user@gmail.com",
      "",
    ]);
  });

  test("Tạo tài khoản Google kèm vai trò bệnh nhân và PHR trong transaction", async () => {
    query.mockResolvedValue([
      { email: "user@gmail.com", google_subject: "google-sub" },
    ]);
    const manager = {
      query: jest.fn().mockImplementation((sql: string) => {
        if (
          sql.startsWith(
            "WITH consumed AS (DELETE FROM google_registration_sessions",
          )
        )
          return [{ email: "user@gmail.com", google_subject: "google-sub" }];
        if (sql.startsWith("INSERT INTO users")) return [{ id: "user-id" }];
        return [];
      }),
    };
    const database = {
      query,
      transaction: (action: (manager: unknown) => unknown) => action(manager),
    };
    const sessions = {
      issueSession: jest
        .fn()
        .mockResolvedValue({
          accessToken: "access",
          refreshToken: "refresh",
          role: "ROLE_PATIENT",
        }),
    };
    service = new GoogleAuthService(
      database as unknown as DataSource,
      sessions as unknown as SessionService,
    );
    await service.complete("token", {
      fullName: "Người dùng",
      gender: "OTHER",
      dateOfBirth: "2000-01-01",
    } as never);
    expect(manager.query).toHaveBeenCalledWith(
      "INSERT INTO user_roles (user_id,role) VALUES ($1,$2)",
      ["user-id", "ROLE_PATIENT"],
    );
    expect(manager.query).toHaveBeenCalledWith(
      "INSERT INTO personal_health_profiles (user_id) VALUES ($1)",
      ["user-id"],
    );
    expect(sessions.issueSession).toHaveBeenCalledWith(
      manager,
      "user-id",
      "ROLE_PATIENT",
    );
  });

  test.each([
    {
      email: "user@external.example",
      linked: false,
      hd: undefined,
      expected: "reject",
    },
    {
      email: "user@gmail.com",
      linked: false,
      hd: undefined,
      expected: "success",
    },
    {
      email: "user@workspace.example",
      linked: false,
      hd: "workspace.example",
      expected: "success",
    },
    {
      email: "user@external.example",
      linked: true,
      hd: undefined,
      expected: "success",
    },
  ])(
    "Kiểm soát liên kết email $email, liên kết sẵn $linked",
    async ({ email, linked, hd, expected }) => {
      query.mockResolvedValue([
        { nonce_hash: digest("nonce"), code_verifier: "verifier" },
      ]);
      client.verifyIdToken.mockResolvedValue({
        getPayload: () => ({
          sub: "google-sub",
          email,
          email_verified: true,
          hd,
          nonce: "nonce",
          aud: "client-id",
          iss: "https://accounts.google.com",
          exp: Math.floor(Date.now() / 1000) + 300,
        }),
      });
      const manager = {
        query: jest.fn().mockImplementation((sql: string) => {
          if (sql.startsWith("SELECT id,google_subject"))
            return [
              {
                id: "user-id",
                google_subject: linked ? "google-sub" : null,
                status: "ACTIVE",
                login_locked_until: null,
              },
            ];
          if (sql.startsWith("SELECT clock_timestamp"))
            return [{ now: new Date() }];
          return [];
        }),
      };
      const database = {
        query,
        transaction: (action: (manager: unknown) => unknown) => action(manager),
      };
      const sessions = {
        roleFor: jest.fn().mockResolvedValue("ROLE_PATIENT"),
        issueSession: jest
          .fn()
          .mockResolvedValue({
            accessToken: "access",
            refreshToken: "refresh",
            role: "ROLE_PATIENT",
          }),
      };
      service = new GoogleAuthService(
        database as unknown as DataSource,
        sessions as unknown as SessionService,
      );
      if (expected === "reject") {
        await expect(
          service.callback("code", "state", "browser"),
        ).rejects.toMatchObject({ status: 409 });
        expect(sessions.issueSession).not.toHaveBeenCalled();
        expect(
          manager.query.mock.calls.some(([sql]) =>
            String(sql).startsWith("UPDATE users"),
          ),
        ).toBe(false);
      } else {
        const result = await service.callback("code", "state", "browser");
        expect(result.session?.accessToken).toBe("access");
        expect(sessions.issueSession).toHaveBeenCalledWith(
          manager,
          "user-id",
          "ROLE_PATIENT",
        );
      }
    },
  );

  test.each([
    { status: "INACTIVE", login_locked_until: null },
    { status: "ACTIVE", login_locked_until: new Date(Date.now() + 1800000) },
  ])(
    "Tài khoản không hoạt động hoặc khóa tạm không đăng nhập Google %j",
    async (account) => {
      query.mockResolvedValue([
        { nonce_hash: digest("nonce"), code_verifier: "verifier" },
      ]);
      client.verifyIdToken.mockResolvedValue({
        getPayload: () => ({
          sub: "google-sub",
          email: "user@gmail.com",
          email_verified: true,
          nonce: "nonce",
          aud: "client-id",
          iss: "https://accounts.google.com",
          exp: Math.floor(Date.now() / 1000) + 300,
        }),
      });
      const manager = {
        query: jest.fn().mockImplementation((sql: string) => {
          if (sql.startsWith("SELECT id,google_subject"))
            return [
              { id: "user-id", google_subject: "google-sub", ...account },
            ];
          if (sql.startsWith("SELECT clock_timestamp"))
            return [{ now: new Date() }];
          return [];
        }),
      };
      const sessions = { issueSession: jest.fn() };
      service = new GoogleAuthService(
        {
          query,
          transaction: (action: (manager: unknown) => unknown) =>
            action(manager),
        } as unknown as DataSource,
        sessions as unknown as SessionService,
      );
      await expect(
        service.callback("code", "state", "browser"),
      ).rejects.toMatchObject({ status: 403 });
      expect(sessions.issueSession).not.toHaveBeenCalled();
    },
  );
});
