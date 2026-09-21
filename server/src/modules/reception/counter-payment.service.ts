import { randomUUID } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import {
  AppointmentStatus,
  CounterPaymentMethod,
  CounterPaymentStatus,
  PaymentMethod,
  PaymentStatus,
  ReceptionAuditAction,
} from '@shared/enums';
import { CounterPaymentReceipt } from '@shared/interfaces';
import { AppointmentEntity } from '../../database/entities/appointment.entity';
import { CounterPaymentTransactionEntity } from '../../database/entities/counter-payment-transaction.entity';
import { DoctorEntity } from '../../database/entities/doctor.entity';
import { UserEntity } from '../../database/entities/user.entity';
import { CollectPaymentDto } from './dto/collect-payment.dto';
import { ReceptionAuditContext, ReceptionAuditService } from './reception-audit.service';

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
  constructor(
    private readonly dataSource: DataSource,
    private readonly audit: ReceptionAuditService,
  ) {}

  async collect(
    appointmentId: string,
    context: ReceptionAuditContext,
    dto: CollectPaymentDto,
  ): Promise<CounterPaymentReceipt> {
    if (!context.actorId) throw new UnauthorizedException();
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

      return this.recordCashPayment(
        manager,
        appointment,
        context,
        dto.amountTendered,
      );
    });
  }

  async recordCashPayment(
    manager: EntityManager,
    appointment: AppointmentEntity,
    context: ReceptionAuditContext,
    amountTendered: number,
  ): Promise<CounterPaymentReceipt> {
    const collectorId = context.actorId;
    if (
      appointment.paymentMethod !== PaymentMethod.PAY_AT_CLINIC ||
      appointment.paymentStatus !== PaymentStatus.UNPAID
    ) {
      throw new ConflictException('Lịch hẹn không thể thu tiền tại quầy.');
    }

    const amount = toMinorUnits(Number(appointment.totalAmount));
    const tendered = toMinorUnits(amountTendered);
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
      appointmentId: appointment.id,
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

    await this.audit.record(
      manager, context, ReceptionAuditAction.COUNTER_PAYMENT_COLLECTED,
      appointment.id, appointment.patientId,
      { transactionId: transaction.id, amount: Number(transaction.amount) },
    );

    return receiptFrom(transaction);
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

  async reprintReceipt(
    appointmentId: string,
    context: ReceptionAuditContext,
  ): Promise<CounterPaymentReceipt> {
    const receipt = await this.getReceipt(appointmentId);
    const appointment = await this.dataSource.getRepository(AppointmentEntity)
      .findOneBy({ id: appointmentId });
    if (!appointment) throw new NotFoundException('Không tìm thấy lịch hẹn.');
    await this.audit.record(
      this.dataSource.manager, context, ReceptionAuditAction.RECEIPT_REPRINTED,
      appointmentId, appointment.patientId,
      { receiptCode: receipt.receiptCode },
    );
    return receipt;
  }
}
