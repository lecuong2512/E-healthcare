import { DataSource } from "typeorm";
import { PasswordResetService } from "../src/modules/auth/password-reset.service";
import { OtpDeliveryService } from "../src/modules/auth/otp-delivery.service";
import { RedisService } from "../src/common/redis/redis.service";
import { environment } from "../src/config/environment";
import { createHmac } from "node:crypto";

describe("PasswordResetService", () => {
  let service: PasswordResetService;
  let database: { query: jest.Mock; transaction: jest.Mock };
  let delivery: { send: jest.Mock };
  let redis: {
    incrementWithTtl: jest.Mock;
    setEx: jest.Mock;
    get: jest.Mock;
    del: jest.Mock;
  };
  const secret = "test-otp-hmac-secret-at-least-32-chars-long";

  beforeEach(() => {
    environment["OTP_HMAC_SECRET"] = secret;
    database = {
      query: jest.fn().mockResolvedValue([]),
      transaction: jest.fn().mockImplementation((cb) => cb({ query: jest.fn().mockResolvedValue([]) })),
    };
    delivery = {
      send: jest.fn().mockResolvedValue(undefined),
    };
    redis = {
      incrementWithTtl: jest.fn().mockResolvedValue(1),
      setEx: jest.fn().mockResolvedValue("OK"),
      get: jest.fn().mockResolvedValue(null),
      del: jest.fn().mockResolvedValue(1),
    };

    service = new PasswordResetService(
      database as unknown as DataSource,
      delivery as unknown as OtpDeliveryService,
      redis as unknown as RedisService,
    );
  });

  describe("request", () => {
    it("returns expiresIn: 300 when user is not found to prevent enumeration", async () => {
      database.query.mockResolvedValue([]);
      const result = await service.request("unknown@example.com");
      expect(result).toEqual({ expiresIn: 300 });
      expect(delivery.send).not.toHaveBeenCalled();
    });

    it("uses flexible rateLimitKey: phone_number when available and sends forgot_password OTP", async () => {
      database.query.mockResolvedValue([
        { id: "user-1", email: "user@example.com", phone_number: "+84901234567" },
      ]);
      const result = await service.request("0901234567");
      expect(result).toEqual({ expiresIn: 300 });
      expect(redis.incrementWithTtl).toHaveBeenCalledWith("otp_sends:+84901234567", 600);
      expect(delivery.send).toHaveBeenCalledWith(
        { email: "user@example.com", phoneNumber: "+84901234567" },
        expect.stringMatching(/^\d{6}$/),
        "forgot_password",
      );
      expect(redis.setEx).toHaveBeenCalledWith(
        "password_reset_otp:user-1",
        expect.any(String),
        300,
      );
    });

    it("uses flexible rateLimitKey: email when user has no phone_number and sends OTP", async () => {
      database.query.mockResolvedValue([
        { id: "user-2", email: "emailonly@example.com", phone_number: null },
      ]);
      const result = await service.request("emailonly@example.com");
      expect(result).toEqual({ expiresIn: 300 });
      expect(redis.incrementWithTtl).toHaveBeenCalledWith("otp_sends:emailonly@example.com", 600);
      expect(delivery.send).toHaveBeenCalledWith(
        { email: "emailonly@example.com", phoneNumber: null },
        expect.stringMatching(/^\d{6}$/),
        "forgot_password",
      );
    });

    it("throws 429 OTP_SEND_LIMIT_EXCEEDED when rate limit is exceeded", async () => {
      database.query.mockResolvedValue([
        { id: "user-3", email: "spam@example.com", phone_number: "+84909999999" },
      ]);
      redis.incrementWithTtl.mockResolvedValue(4);
      await expect(service.request("spam@example.com")).rejects.toMatchObject({
        status: 429,
        response: { code: "OTP_SEND_LIMIT_EXCEEDED" },
      });
      expect(delivery.send).not.toHaveBeenCalled();
    });
  });

  describe("reset", () => {
    it("successfully resets password, updates hash, and revokes active sessions", async () => {
      const manager = { query: jest.fn().mockResolvedValue([]) };
      database.query.mockResolvedValue([
        { id: "user-1", email: "user@example.com", phone_number: "+84901234567" },
      ]);
      database.transaction.mockImplementation((cb) => cb(manager));

      const otp = "123456";
      const id = "session-uuid";
      const otpHash = createHmac("sha256", secret).update(`${id}:${otp}`).digest("hex");
      redis.get.mockResolvedValue(JSON.stringify({ id, otpHash }));

      await service.reset({
        identifier: "user@example.com",
        otp,
        newPassword: "NewPassword123!",
      });

      expect(manager.query).toHaveBeenCalledWith(
        "UPDATE users SET password_hash=$2 WHERE id=$1",
        ["user-1", expect.any(String)],
      );
      expect(manager.query).toHaveBeenCalledWith(
        "UPDATE auth_sessions SET revoked_at=clock_timestamp() WHERE user_id=$1 AND revoked_at IS NULL",
        ["user-1"],
      );
      expect(redis.del).toHaveBeenCalledWith("otp_fails:+84901234567");
      expect(redis.del).toHaveBeenCalledWith("password_reset_otp:user-1");
    });

    it("resets password for user without phone number using email as failKey", async () => {
      const manager = { query: jest.fn().mockResolvedValue([]) };
      database.query.mockResolvedValue([
        { id: "user-2", email: "emailonly@example.com", phone_number: null },
      ]);
      database.transaction.mockImplementation((cb) => cb(manager));

      const otp = "654321";
      const id = "session-uuid-2";
      const otpHash = createHmac("sha256", secret).update(`${id}:${otp}`).digest("hex");
      redis.get.mockResolvedValue(JSON.stringify({ id, otpHash }));

      await service.reset({
        identifier: "emailonly@example.com",
        otp,
        newPassword: "NewPassword123!",
      });

      expect(manager.query).toHaveBeenCalledWith(
        "UPDATE users SET password_hash=$2 WHERE id=$1",
        ["user-2", expect.any(String)],
      );
      expect(redis.del).toHaveBeenCalledWith("otp_fails:emailonly@example.com");
    });
  });
});
