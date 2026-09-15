import { OtpDeliveryService } from "../src/auth/otp-delivery.service";
import { environment } from "../src/config/environment";
import { createTransport } from "nodemailer";

jest.mock("nodemailer", () => ({ createTransport: jest.fn() }));

describe("OTP delivery adapters", () => {
  const initialEnvironment = { ...environment };
  const delivery = new OtpDeliveryService();

  beforeEach(() => {
    for (const key of [
      "SMTP_HOST",
      "SMTP_FROM",
      "SMTP_USER",
      "SMTP_PASSWORD",
      "SMS_WEBHOOK_URL",
      "SMS_WEBHOOK_TOKEN",
    ])
      delete environment[key];
    environment.NODE_ENV = "test";
  });
  afterEach(() => {
    for (const key of Object.keys(environment))
      if (!(key in initialEnvironment)) delete environment[key];
    Object.assign(environment, initialEnvironment);
    jest.restoreAllMocks();
    jest.clearAllMocks();
  });

  test("fails closed when email delivery is not configured", async () => {
    await expect(
      delivery.send(
        { email: "patient@example.com", phoneNumber: null },
        "012345",
      ),
    ).rejects.toMatchObject({
      status: 503,
      response: { code: "OTP_DELIVERY_FAILED" },
    });
  });

  test("passes the six-digit OTP to SMTP", async () => {
    environment.SMTP_HOST = "smtp.example.com";
    environment.SMTP_FROM = "no-reply@example.com";
    const sendMail = jest
      .fn()
      .mockResolvedValue({ accepted: ["patient@example.com"] });
    (createTransport as jest.Mock).mockReturnValue({ sendMail });
    await delivery.send(
      { email: "patient@example.com", phoneNumber: null },
      "012345",
    );
    expect(sendMail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "patient@example.com",
        text: expect.stringContaining("012345"),
      }),
    );
  });

  test("calls SMS adapter with canonical phone and token", async () => {
    environment.SMS_WEBHOOK_URL = "https://sms.example.com/send";
    environment.SMS_WEBHOOK_TOKEN = "test-token";
    const fetchMock = jest
      .spyOn(globalThis, "fetch")
      .mockResolvedValue({ ok: true } as Response);
    await delivery.send({ email: null, phoneNumber: "+84901234567" }, "012345");
    expect(fetchMock).toHaveBeenCalledWith(
      new URL(environment.SMS_WEBHOOK_URL),
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          Authorization: "Bearer test-token",
        }),
        body: JSON.stringify({
          phoneNumber: "+84901234567",
          message:
            "Mã OTP đăng ký E-Healthcare của bạn là 012345. Mã có hiệu lực 3 phút.",
        }),
      }),
    );
  });

  test("requires HTTPS for SMS in production", async () => {
    environment.NODE_ENV = "production";
    environment.SMS_WEBHOOK_URL = "http://sms.example.com/send";
    environment.SMS_WEBHOOK_TOKEN = "test-token";
    const fetchMock = jest.spyOn(globalThis, "fetch");
    await expect(
      delivery.send({ email: null, phoneNumber: "+84901234567" }, "012345"),
    ).rejects.toMatchObject({ status: 503 });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test("conceals provider failure details", async () => {
    environment.SMTP_HOST = "smtp.example.com";
    environment.SMTP_FROM = "no-reply@example.com";
    (createTransport as jest.Mock).mockReturnValue({
      sendMail: jest.fn().mockRejectedValue(new Error("secret 012345")),
    });
    await expect(
      delivery.send(
        { email: "patient@example.com", phoneNumber: null },
        "012345",
      ),
    ).rejects.toMatchObject({
      status: 503,
      response: { message: "Không thể gửi OTP lúc này. Vui lòng thử lại sau." },
    });
  });
});
