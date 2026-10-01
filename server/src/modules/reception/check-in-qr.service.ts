import { randomUUID } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  GoneException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AppointmentStatus } from '@shared/enums';
import { CheckInQrResponse, CheckInResponse, ReceptionAppointment } from '@shared/interfaces';
import { sign, TokenExpiredError, verify } from 'jsonwebtoken';
import { DataSource } from 'typeorm';
import { environment, requiredEnvironment } from '../../config/environment';
import { AppointmentEntity } from '../../database/entities/appointment.entity';
import { ReceptionAuditContext } from './reception-audit.service';
import { ReceptionService } from './reception.service';

const QR_TTL_SECONDS = 15 * 60;
const QR_ISSUER = 'ehealth-api';
const QR_AUDIENCE = 'ehealth-reception-check-in';

interface CheckInQrClaims {
  type: 'checkin_qr';
  sub: string;
  appointmentCode: string;
  iat: number;
  exp: number;
  jti: string;
}

@Injectable()
export class CheckInQrService {
  private readonly secret: string;

  constructor(
    private readonly dataSource: DataSource,
    private readonly reception: ReceptionService,
  ) {
    this.secret = requiredEnvironment('QR_CHECKIN_SECRET');
    if (
      Buffer.byteLength(this.secret) < 32 ||
      this.secret.startsWith('your_') ||
      this.secret === environment.JWT_ACCESS_SECRET ||
      this.secret === environment.JWT_REFRESH_SECRET
    ) {
      throw new Error('QR_CHECKIN_SECRET phải là secret riêng, ngẫu nhiên và dài ít nhất 32 byte.');
    }
  }

  async issue(appointmentId: string, patientId: string): Promise<CheckInQrResponse> {
    const appointment = await this.dataSource.getRepository(AppointmentEntity).findOneBy({
      id: appointmentId,
      patientId,
    });
    if (!appointment) throw new NotFoundException('Không tìm thấy lịch hẹn của bệnh nhân.');
    if (appointment.status !== AppointmentStatus.CONFIRMED) {
      throw new ConflictException('Lịch hẹn không thể cấp QR check-in ở trạng thái hiện tại.');
    }

    const issuedAt = Math.floor(Date.now() / 1000);
    const expiresAt = issuedAt + QR_TTL_SECONDS;
    const token = sign({
      type: 'checkin_qr',
      appointmentCode: appointment.appointmentCode,
      iat: issuedAt,
      exp: expiresAt,
    }, this.secret, {
      algorithm: 'HS256',
      issuer: QR_ISSUER,
      audience: QR_AUDIENCE,
      subject: appointment.id,
      jwtid: randomUUID(),
    });
    return {
      qrToken: token,
      expiresAt: new Date(expiresAt * 1000).toISOString(),
    };
  }

  async lookup(token: string, context: ReceptionAuditContext): Promise<ReceptionAppointment> {
    const claims = this.validate(token);
    const appointments = await this.reception.lookup({ code: claims.appointmentCode }, context);
    const appointment = appointments.find((item) => item.id === claims.sub);
    if (!appointment) throw new NotFoundException('Không tìm thấy lịch hẹn tương ứng với QR hôm nay.');
    return appointment;
  }

  async checkIn(token: string, context: ReceptionAuditContext): Promise<CheckInResponse> {
    const claims = this.validate(token);
    return this.reception.checkIn(claims.sub, context);
  }

  private validate(token: string): CheckInQrClaims {
    try {
      const payload = verify(token, this.secret, {
        algorithms: ['HS256'],
        issuer: QR_ISSUER,
        audience: QR_AUDIENCE,
      });
      if (
        typeof payload === 'string' ||
        payload.type !== 'checkin_qr' ||
        typeof payload.sub !== 'string' ||
        typeof payload.appointmentCode !== 'string' ||
        typeof payload.jti !== 'string' ||
        typeof payload.iat !== 'number' ||
        typeof payload.exp !== 'number' ||
        payload.exp <= payload.iat ||
        payload.exp - payload.iat > QR_TTL_SECONDS ||
        payload.iat > Math.floor(Date.now() / 1000)
      ) throw new Error('Invalid QR claims');
      return payload as CheckInQrClaims;
    } catch (error) {
      if (error instanceof TokenExpiredError) {
        throw new GoneException('Mã QR đã hết hạn; vui lòng tạo mã mới.');
      }
      throw new BadRequestException('Mã QR check-in không hợp lệ.');
    }
  }
}
