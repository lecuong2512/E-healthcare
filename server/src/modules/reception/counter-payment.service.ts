import { randomUUID } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { DataSource } from 'typeorm';
import {
  AppointmentStatus,
  CounterPaymentMethod,
  CounterPaymentStatus,
  PaymentMethod,
  PaymentStatus,
} from '@shared/enums';
import { CounterPaymentReceipt } from '@shared/interfaces';
import { AppointmentEntity } from '../../database/entities/appointment.entity';
import { CounterPaymentTransactionEntity } from '../../database/entities/counter-payment-transaction.entity';
import { DoctorEntity } from '../../database/entities/doctor.entity';
import { UserEntity } from '../../database/entities/user.entity';
import { CollectPaymentDto } from './dto/collect-payment.dto';

function toMinorUnits(value: number): number {
  const minorUnits = Math.round(value * 100);
  if (
    !Number.isFinite(value) ||
    value < 0 ||
    !Number.isSafeInteger(minorUnits) ||
    minorUnits > 999_999_999_999 ||
    Math.abs(value * 100 - minorUnits) > 1e-6
  ) {
    throw new BadRequestException('Số tiền không hợp lệ.');
  }
  return minorUnits;
}

function money(minorUnits: number): string {
  return (minorUnits / 100).toFixed(2);
}

function receiptFrom(transaction: CounterPaymentTransactionEntity): CounterPaymentReceipt {
  return {
    receiptCode: transaction.receiptCode,
    transactionCode: transaction.transactionCode,
    appointmentCode: transaction.appointmentCode,
    patientName: transaction.patientName,
    doctorName: transaction.doctorName,
    amount: Number(transaction.amount),
    amountTendered: Number(transaction.amountTendered),
    changeAmount: Number(transaction.changeAmount),
    paymentMethod: transaction.method,
    collectedBy: transaction.collectorName,
    paidAt: transaction.paidAt.toISOString(),
  };
}

@Injectable()
export class CounterPaymentService {
  constructor(private readonly dataSource: DataSource) {}

  async collect(
    appointmentId: string,
    collectorId: string | undefined,
    dto: CollectPaymentDto,
  ): Promise<CounterPaymentReceipt> {
    if (!collectorId) throw new UnauthorizedException();
    if (dto.method !== CounterPaymentMethod.CASH) {
      throw new BadRequestException('Quầy hiện chỉ hỗ trợ thu tiền mặt.');
    }

    return this.dataSource.transaction('READ COMMITTED', async (manager) => {
      const appointment = await manager
        .getRepository(AppointmentEntity)
        .createQueryBuilder('appointment')
        .setLock('pessimistic_write')
        .where('appointment.id = :appointmentId', { appointmentId })
        .getOne();
      if (!appointment) throw new NotFoundException('Không tìm thấy lịch hẹn.');
      if (appointment.status !== AppointmentStatus.CONFIRMED) {
        throw new ConflictException('Chỉ được thu tiền cho lịch hẹn đã xác nhận.');
      }
      if (appointment.paymentMethod !== PaymentMethod.PAY_AT_CLINIC) {
        throw new ConflictException('Lịch hẹn không chọn thanh toán tại quầy.');
      }
      if (appointment.paymentStatus !== PaymentStatus.UNPAID) {
        throw new ConflictException('Lịch hẹn đã thanh toán hoặc không thể thu tiền.');
      }

      const amount = toMinorUnits(Number(appointment.totalAmount));
      const tendered = toMinorUnits(dto.amountTendered);
      if (tendered < amount) {
        throw new BadRequestException('Số tiền khách đưa chưa đủ viện phí.');
      }

      const users = manager.getRepository(UserEntity);
      const patient = await users.findOneBy({ id: appointment.patientId });
      const collector = await users.findOneBy({ id: collectorId });
      const doctor = await manager.getRepository(DoctorEntity).findOne({
        where: { id: appointment.doctorId },
        relations: { user: true },
      });
      if (!patient || !doctor || !collector) {
        throw new NotFoundException('Thiếu thông tin bệnh nhân, bác sĩ hoặc người thu.');
      }

      const id = randomUUID();
      const paidAt = new Date();
      const transaction = manager.getRepository(CounterPaymentTransactionEntity).create({
        id,
        appointmentId,
        transactionCode: `TX-${id}`,
        receiptCode: `RC-${id}`,
        amount: money(amount),
        amountTendered: money(tendered),
        changeAmount: money(tendered - amount),
        method: CounterPaymentMethod.CASH,
        status: CounterPaymentStatus.SUCCESS,
        collectedBy: collectorId,
        appointmentCode: appointment.appointmentCode,
        patientName: patient.fullName,
        doctorName: doctor.user.fullName,
        collectorName: collector.fullName,
        paidAt,
      });
      await manager.save(CounterPaymentTransactionEntity, transaction);

      appointment.paymentStatus = PaymentStatus.PAID;
      appointment.paidAt = paidAt;
      appointment.collectedBy = collectorId;
      await manager.save(AppointmentEntity, appointment);

      return receiptFrom(transaction);
    });
  }

  async getReceipt(appointmentId: string): Promise<CounterPaymentReceipt> {
    const transaction = await this.dataSource
      .getRepository(CounterPaymentTransactionEntity)
      .findOne({
        where: { appointmentId },
        order: { createdAt: 'ASC', id: 'ASC' },
      });
    if (!transaction) throw new NotFoundException('Không tìm thấy phiếu thu tại quầy.');
    return receiptFrom(transaction);
  }
}
