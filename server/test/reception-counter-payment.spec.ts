import { BadRequestException, ConflictException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import {
  AppointmentStatus,
  CounterPaymentMethod,
  PaymentMethod,
  PaymentStatus,
} from '@shared/enums';
import { AppointmentEntity } from '../src/database/entities/appointment.entity';
import { CounterPaymentTransactionEntity } from '../src/database/entities/counter-payment-transaction.entity';
import { DoctorEntity } from '../src/database/entities/doctor.entity';
import { UserEntity } from '../src/database/entities/user.entity';
import { CounterPaymentService } from '../src/modules/reception/counter-payment.service';
import { ReceptionAuditContext, ReceptionAuditService } from '../src/modules/reception/reception-audit.service';

describe('CounterPaymentService', () => {
  const appointmentId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  const patientId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
  const doctorId = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
  const collectorId = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
  const auditContext: ReceptionAuditContext = { actorId: collectorId, ip: '127.0.0.1', userAgent: 'jest' };

  let service: CounterPaymentService;
  let appointment: AppointmentEntity;
  let patient: { fullName: string };
  let transactions: CounterPaymentTransactionEntity[];
  let lock: jest.Mock;

  beforeEach(() => {
    appointment = {
      id: appointmentId,
      appointmentCode: 'APT-260921-1234',
      patientId,
      doctorId,
      status: AppointmentStatus.CONFIRMED,
      paymentStatus: PaymentStatus.UNPAID,
      paymentMethod: PaymentMethod.PAY_AT_CLINIC,
      totalAmount: 300000,
      paidAt: null,
      collectedBy: null,
    } as AppointmentEntity;
    patient = { fullName: 'Nguyen Van A' };
    transactions = [];
    lock = jest.fn().mockReturnThis();
    const query = {
      setLock: lock,
      where: jest.fn().mockReturnThis(),
      getOne: jest.fn(async () => appointment),
    };
    const manager = {
      getRepository: jest.fn((entity) => {
        if (entity === AppointmentEntity) {
          return { createQueryBuilder: () => query };
        }
        if (entity === UserEntity) {
          return {
            findOneBy: async ({ id }: { id: string }) =>
              id === patientId ? patient : { fullName: 'Le Tan A' },
          };
        }
        if (entity === DoctorEntity) {
          return {
            findOne: async () => ({ user: { fullName: 'Bac Si B' } }),
          };
        }
        if (entity === CounterPaymentTransactionEntity) {
          return { create: (value: CounterPaymentTransactionEntity) => value };
        }
        throw new Error('Unexpected repository');
      }),
      save: jest.fn(async (entity, value) => {
        if (entity === CounterPaymentTransactionEntity) {
          transactions.push(value);
        }
        return value;
      }),
    };
    const dataSource = {
      transaction: jest.fn(async (_isolation, work) => work(manager)),
      getRepository: jest.fn(() => ({
        findOne: async () => transactions[0] ?? null,
      })),
    } as unknown as DataSource;
    service = new CounterPaymentService(
      dataSource,
      { record: jest.fn(async () => undefined) } as unknown as ReceptionAuditService,
    );
  });

  it('ghi một giao dịch và giữ nguyên dữ liệu phiếu thu khi in lại', async () => {
    const firstReceipt = await service.collect(appointmentId, auditContext, {
      method: CounterPaymentMethod.CASH,
      amountTendered: 500000,
    });

    expect(lock).toHaveBeenCalledWith('pessimistic_write');
    expect(appointment.paymentStatus).toBe(PaymentStatus.PAID);
    expect(transactions).toHaveLength(1);
    expect(firstReceipt).toMatchObject({
      amount: 300000,
      amountTendered: 500000,
      changeAmount: 200000,
      patientName: 'Nguyen Van A',
      collectedBy: 'Le Tan A',
    });

    patient.fullName = 'Ten Da Thay Doi';
    expect(await service.getReceipt(appointmentId)).toEqual(firstReceipt);
  });

  it('từ chối request lặp sau khi đã thu tiền', async () => {
    const request = {
      method: CounterPaymentMethod.CASH,
      amountTendered: 300000,
    };
    await service.collect(appointmentId, auditContext, request);

    await expect(service.collect(appointmentId, auditContext, request)).rejects.toThrow(
      ConflictException,
    );
    expect(transactions).toHaveLength(1);
  });

  it('không ghi giao dịch khi khách đưa thiếu tiền', async () => {
    await expect(
      service.collect(appointmentId, auditContext, {
        method: CounterPaymentMethod.CASH,
        amountTendered: 299999,
      }),
    ).rejects.toThrow(BadRequestException);

    expect(transactions).toHaveLength(0);
    expect(appointment.paymentStatus).toBe(PaymentStatus.UNPAID);
  });
});
