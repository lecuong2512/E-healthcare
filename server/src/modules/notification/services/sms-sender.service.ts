import { Injectable, Logger } from '@nestjs/common';
import { environment } from '../../../config/environment';
import {
  SmsOtpPayload,
  SmsAppointmentReminder2hPayload,
  SmsAppointmentCancellationPayload,
} from '@shared/interfaces';

@Injectable()
export class SmsSenderService {
  private readonly logger = new Logger(SmsSenderService.name);

  async sendOtp(payload: SmsOtpPayload): Promise<void> {
    const maskedPhone = this.maskPhoneNumber(payload.phoneNumber);
    const message = `Ma OTP E-Healthcare cua ban la ${payload.otp}. Ma co hieu luc 3 phut.`;

    await this.dispatchSms(payload.phoneNumber, message, maskedPhone, 'OTP');
  }

  async sendAppointmentReminder2h(payload: SmsAppointmentReminder2hPayload): Promise<void> {
    const maskedPhone = this.maskPhoneNumber(payload.phoneNumber);
    const room = payload.roomNumber ? ` tai phong ${payload.roomNumber}` : '';
    const message = `EHEALTH: Nhac hen quy khach ${payload.patientName} co ca kham luc ${payload.time}${room} voi BS ${payload.doctorName}. Ma hen: ${payload.appointmentCode}. Vui long chuan bi di chuyen va mang theo CCCD/ma QR.`;

    await this.dispatchSms(payload.phoneNumber, message, maskedPhone, 'REMINDER_2H');
  }

  async sendAppointmentCancellation(payload: SmsAppointmentCancellationPayload): Promise<void> {
    const maskedPhone = this.maskPhoneNumber(payload.phoneNumber);
    const refund = payload.refundAmount > 0 ? " Hoan " + payload.refundPercent + "%: " + payload.refundAmount.toLocaleString("vi-VN") + "d." : "";
    const message = "EHEALTH: Xin loi, co so y te da huy lich #" + payload.appointmentCode + "." + refund + " Voucher giam 20%: " + payload.voucherCode + ".";
    await this.dispatchSms(payload.phoneNumber, message, maskedPhone, "APPOINTMENT_CANCELLATION");
  }

  private async dispatchSms(
    phoneNumber: string,
    message: string,
    maskedPhone: string,
    purpose: string,
  ): Promise<void> {
    if (!environment.SMS_WEBHOOK_URL || !environment.SMS_WEBHOOK_TOKEN) {
      this.logger.log(`[MOCK SMS SEND] Purpose: ${purpose} | To: ${maskedPhone}`);
      return;
    }

    try {
      const url = new URL(environment.SMS_WEBHOOK_URL);
      if (environment.NODE_ENV === 'production' && url.protocol !== 'https:') {
        throw new Error('SMS requires HTTPS protocol in production');
      }

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${environment.SMS_WEBHOOK_TOKEN}`,
        },
        body: JSON.stringify({ phoneNumber, message }),
        signal: AbortSignal.timeout(10000),
        redirect: 'error',
      });

      if (!response.ok) {
        throw new Error(`SMS provider responded with status ${response.status}`);
      }

      this.logger.log(`SMS successfully dispatched for ${purpose} to ${maskedPhone}`);
    } catch (err: any) {
      // Bảo mật tuyệt đối: Không đưa nội dung OTP hoặc dữ liệu nhạy cảm vào log lỗi
      this.logger.error(`Failed to dispatch SMS ${purpose} to ${maskedPhone}: ${err.message}`);
      throw err;
    }
  }

  private maskPhoneNumber(phone: string): string {
    if (!phone || phone.length < 6) return '***';
    return `${phone.slice(0, 3)}****${phone.slice(-3)}`;
  }
}
