import { Injectable, Logger } from '@nestjs/common';
import { createTransport, Transporter } from 'nodemailer';
import { environment } from '../../../config/environment';
import {
  EmailBookingConfirmationPayload,
  EmailAccountActivationPayload,
  EmailAppointmentReminder24hPayload,
  EmailAppointmentCancellationPayload,
} from '@shared/interfaces';

@Injectable()
export class EmailSenderService {
  private readonly logger = new Logger(EmailSenderService.name);
  private transporter: Transporter | null = null;

  constructor() {
    this.initTransporter();
  }

  private initTransporter(): void {
    if (!environment.SMTP_HOST || !environment.SMTP_FROM) {
      this.logger.warn('SMTP configuration is missing. Emails will be logged in mock mode.');
      return;
    }

    this.transporter = createTransport({
      host: environment.SMTP_HOST,
      port: Number(environment.SMTP_PORT ?? 587),
      secure: environment.SMTP_SECURE === 'true',
      requireTLS:
        environment.NODE_ENV === 'production' &&
        environment.SMTP_SECURE !== 'true',
      auth: environment.SMTP_USER
        ? { user: environment.SMTP_USER, pass: environment.SMTP_PASSWORD }
        : undefined,
      connectionTimeout: 10000,
      greetingTimeout: 10000,
      socketTimeout: 10000,
    });
  }

  async sendBookingConfirmation(payload: EmailBookingConfirmationPayload): Promise<void> {
    const subject = `[E-Healthcare] Xác nhận đặt lịch khám thành công #${payload.appointmentCode}`;
    const text = `Kính gửi ${payload.patientName},

Lịch hẹn khám chữa bệnh của Quý khách đã được xác nhận thành công trên hệ thống E-Healthcare.

- Mã lịch hẹn: ${payload.appointmentCode}
- Bác sĩ phụ trách: ${payload.doctorName}
- Chuyên khoa: ${payload.specialtyName || 'Đa khoa'}
- Thời gian: ${payload.time} ngày ${payload.date}
- Buồng khám: ${payload.roomNumber || 'Quầy tiếp đón hướng dẫn'}
${payload.totalAmount ? `- Phí khám dự kiến: ${payload.totalAmount.toLocaleString('vi-VN')} VND` : ''}

Quý khách vui lòng có mặt trước giờ hẹn 15 phút tại Quầy tiếp đón và xuất trình mã lịch hẹn hoặc CCCD.
Trân trọng,
Phòng khám E-Healthcare`;

    await this.sendMail(payload.to, subject, text);
  }

  async sendAccountActivation(payload: EmailAccountActivationPayload): Promise<void> {
    const subject = `[E-Healthcare] Kích hoạt tài khoản người dùng`;
    const text = `Xin chào ${payload.fullName},

Chào mừng bạn đã đăng ký tài khoản tại Cổng Y tế E-Healthcare.
${
  payload.activationLink
    ? `Vui lòng nhấp vào liên kết sau để kích hoạt tài khoản của bạn: ${payload.activationLink}`
    : payload.otp
    ? `Mã xác thực kích hoạt của bạn là: ${payload.otp} (có hiệu lực trong 3 phút).`
    : 'Tài khoản của bạn đã được kích hoạt thành công.'
}

Trân trọng,
Đội ngũ Hỗ trợ E-Healthcare`;

    await this.sendMail(payload.to, subject, text);
  }

  async sendAppointmentReminder24h(payload: EmailAppointmentReminder24hPayload): Promise<void> {
    const subject = `[E-Healthcare] Nhắc hẹn: Quý khách có lịch khám vào ngày mai (${payload.date})`;
    const text = `Kính gửi ${payload.patientName},

Hệ thống E-Healthcare xin nhắc Quý khách có lịch hẹn khám vào ngày mai:
- Mã lịch hẹn: ${payload.appointmentCode}
- Bác sĩ phụ trách: ${payload.doctorName}
- Khung giờ khám: ${payload.time}, Ngày: ${payload.date}
- Phòng khám: ${payload.roomNumber || 'Xem tại quầy tiếp đón'}

* Lưu ý quan trọng trước khi khám (Section 4.2.5 SRS-PAT-05):
${payload.notes || '- Vui lòng mang theo CCCD gắn chip và các kết quả xét nghiệm/đơn thuốc cũ (nếu có).\n- Nếu ca khám có chỉ định xét nghiệm máu hoặc nội soi, vui lòng nhịn ăn sáng từ 22:00 tối hôm trước.'}

Trân trọng cảm ơn,
Phòng khám E-Healthcare`;

    await this.sendMail(payload.to, subject, text);
  }

  async sendAppointmentCancellation(payload: EmailAppointmentCancellationPayload): Promise<void> {
    const subject = "[E-Healthcare] Thong bao huy lich hen #" + payload.appointmentCode;
    const refund = payload.refundAmount > 0
      ? "Khoan hoan tien: " + payload.refundAmount.toLocaleString("vi-VN") + " VND (" + payload.refundPercent + "%)."
      : "Lich hen chua phat sinh khoan hoan tien.";
    const text = "Kinh gui " + payload.patientName + ",\n\nCo so y te rat tiec phai huy lich hen #" + payload.appointmentCode + ".\n" + refund + "\nMa voucher boi thuong giam 20% cho lan dat kham sau: " + payload.voucherCode + ".\n\nTran trong,\nPhong kham E-Healthcare";
    await this.sendMail(payload.to, subject, text);
  }

  private async sendMail(to: string, subject: string, text: string): Promise<void> {
    if (!this.transporter) {
      this.logger.log(`[MOCK EMAIL SEND] To: ${to} | Subject: ${subject}`);
      return;
    }

    try {
      await this.transporter.sendMail({
        from: environment.SMTP_FROM || 'no-reply@ehealth.vn',
        to,
        subject,
        text,
      });
      this.logger.log(`Email successfully sent to ${to} for subject "${subject}"`);
    } catch (err: any) {
      this.logger.error(`Failed to send email to ${to}: ${err.message}`);
      throw err;
    }
  }
}
