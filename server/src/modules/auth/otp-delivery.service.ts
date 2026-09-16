import { Injectable, ServiceUnavailableException } from "@nestjs/common";
import { createTransport } from "nodemailer";
import { environment } from "../../config/environment";

@Injectable()
export class OtpDeliveryService {
  async send(
    contact: { email: string | null; phoneNumber: string | null },
    otp: string,
  ): Promise<void> {
    const message = `Mã OTP đăng ký E-Healthcare của bạn là ${otp}. Mã có hiệu lực 3 phút.`;
    try {
      if (contact.email) {
        if (!environment.SMTP_HOST || !environment.SMTP_FROM)
          throw new Error("SMTP not configured");
        const transport = createTransport({
          host: environment.SMTP_HOST,
          port: Number(environment.SMTP_PORT ?? 587),
          secure: environment.SMTP_SECURE === "true",
          requireTLS:
            environment.NODE_ENV === "production" &&
            environment.SMTP_SECURE !== "true",
          auth: environment.SMTP_USER
            ? { user: environment.SMTP_USER, pass: environment.SMTP_PASSWORD }
            : undefined,
          connectionTimeout: 10000,
          greetingTimeout: 10000,
          socketTimeout: 10000,
        });
        await transport.sendMail({
          from: environment.SMTP_FROM,
          to: contact.email,
          subject: "Xác nhận đăng ký E-Healthcare",
          text: message,
        });
      }
      if (contact.phoneNumber) {
        if (!environment.SMS_WEBHOOK_URL || !environment.SMS_WEBHOOK_TOKEN)
          throw new Error("SMS not configured");
        const url = new URL(environment.SMS_WEBHOOK_URL);
        if (environment.NODE_ENV === "production" && url.protocol !== "https:")
          throw new Error("SMS requires HTTPS");
        const response = await fetch(url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${environment.SMS_WEBHOOK_TOKEN}`,
          },
          body: JSON.stringify({ phoneNumber: contact.phoneNumber, message }),
          signal: AbortSignal.timeout(10000),
          redirect: "error",
        });
        if (!response.ok) throw new Error("SMS rejected");
      }
    } catch {
      // Không đưa OTP hoặc phản hồi từ nhà cung cấp vào log hay lỗi trả về của API.
      throw new ServiceUnavailableException({
        code: "OTP_DELIVERY_FAILED",
        message: "Không thể gửi OTP lúc này. Vui lòng thử lại sau.",
      });
    }
  }
}
