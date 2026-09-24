import "./test-environment";
import { BadRequestException, ForbiddenException } from "@nestjs/common";
import { DataSource } from "typeorm";
import { AppointmentLifecycleService } from "../src/modules/appointment/appointment-lifecycle.service";
import { NotificationProducerService } from "../src/modules/notification/producers/notification-producer.service";
import { AppointmentEntity } from "../src/database/entities/appointment.entity";
import { DoctorEntity } from "../src/database/entities/doctor.entity";
import { DoctorScheduleEntity } from "../src/database/entities/doctor-schedule.entity";
import { VoucherEntity } from "../src/database/entities/voucher.entity";
import { UserEntity } from "../src/database/entities/user.entity";
import { AppointmentStatus, PaymentMethod, PaymentStatus, Role, SlotStatus } from "@shared/enums";
import { QueueEventsService } from "../src/modules/realtime/queue-events.service";

describe("AppointmentLifecycleService", () => {
  let service: AppointmentLifecycleService;
  let appointment: any;
  let schedule: any;
  let voucher: any;
  let doctorOwnsAppointment: boolean;
  let manager: any;
  let producer: jest.Mocked<Pick<NotificationProducerService, "enqueueAppointmentCancellationEmail" | "enqueueAppointmentCancellationSms">>;
  let queueEvents: jest.Mocked<Pick<QueueEventsService, "statusChanged">>;

  const vietnamSchedule = (hoursFromNow: number) => {
    const instant = new Date(Date.now() + hoursFromNow * 60 * 60 * 1000);
    const vietnamClock = new Date(instant.getTime() + 7 * 60 * 60 * 1000);
    return {
      id: "schedule-1",
      date: vietnamClock.toISOString().slice(0, 10),
      startTime: vietnamClock.toISOString().slice(11, 19),
      status: SlotStatus.BOOKED,
    };
  };

  beforeEach(() => {
    appointment = {
      id: "appointment-1",
      appointmentCode: "APT-001",
      patientId: "patient-1",
      doctorId: "doctor-1",
      scheduleId: "schedule-1",
      status: AppointmentStatus.CONFIRMED,
      paymentStatus: PaymentStatus.PAID,
      paymentMethod: PaymentMethod.VNPAY,
      totalAmount: 100000,
      refundAmount: 0,
      refundPercent: 0,
    };
    schedule = vietnamSchedule(30);
    voucher = null;
    doctorOwnsAppointment = true;
    producer = {
      enqueueAppointmentCancellationEmail: jest.fn().mockResolvedValue({}),
      enqueueAppointmentCancellationSms: jest.fn().mockResolvedValue({}),
    };
    queueEvents = { statusChanged: jest.fn().mockResolvedValue(undefined) };

    const appointmentRepo = {
      createQueryBuilder: () => ({
        setLock: () => ({ where: () => ({ getOne: async () => appointment }) }),
      }),
    };
    const scheduleRepo = { findOneByOrFail: jest.fn().mockImplementation(async () => schedule) };
    const voucherRepo = {
      findOne: jest.fn().mockImplementation(async () => voucher?.isUsed ? null : voucher),
    };
    const doctorRepo = { existsBy: jest.fn().mockImplementation(async () => doctorOwnsAppointment) };
    const userRepo = {
      findOneByOrFail: jest.fn().mockResolvedValue({
        id: "patient-1",
        fullName: "Nguyen Van A",
        email: "patient@example.com",
        phoneNumber: "0901234567",
      }),
    };

    manager = {
      getRepository: jest.fn().mockImplementation((entity) => {
        if (entity === AppointmentEntity) return appointmentRepo;
        if (entity === DoctorScheduleEntity) return scheduleRepo;
        if (entity === VoucherEntity) return voucherRepo;
        if (entity === DoctorEntity) return doctorRepo;
        if (entity === UserEntity) return userRepo;
        return {};
      }),
      create: (_entity: unknown, data: unknown) => data,
      save: jest.fn().mockImplementation(async (data) => data),
    };
    const dataSource = {
      transaction: jest.fn().mockImplementation(async (work) => work(manager)),
      getRepository: jest.fn().mockImplementation((entity) => entity === VoucherEntity ? voucherRepo : {}),
    } as unknown as DataSource;
    service = new AppointmentLifecycleService(
      dataSource,
      producer as unknown as NotificationProducerService,
      queueEvents as unknown as QueueEventsService,
    );
  });

  it("cancels at least 24 hours before the visit with a 100% refund and frees the slot", async () => {
    schedule = vietnamSchedule(24.1);
    const result = await service.cancelByPatient(appointment.id, { userId: "patient-1", role: Role.PATIENT });
    expect(result.status).toBe(AppointmentStatus.CANCELLED_BY_PATIENT);
    expect(result.refundPercent).toBe(100);
    expect(result.refundAmount).toBe(100000);
    expect(schedule.status).toBe(SlotStatus.AVAILABLE);
  });

  it("refunds 70% when the patient cancels from 2 to under 24 hours", async () => {
    schedule = vietnamSchedule(6);
    const result = await service.cancelByPatient(appointment.id, { userId: "patient-1", role: Role.PATIENT });
    expect(result.refundPercent).toBe(70);
    expect(result.refundAmount).toBe(70000);
  });

  it("does not refund when the patient cancels under 2 hours", async () => {
    schedule = vietnamSchedule(1);
    const result = await service.cancelByPatient(appointment.id, { userId: "patient-1", role: Role.PATIENT });
    expect(result.refundPercent).toBe(0);
    expect(result.refundAmount).toBe(0);
  });

  it("rejects a patient cancelling another patients appointment", async () => {
    await expect(service.cancelByPatient(appointment.id, { userId: "patient-2", role: Role.PATIENT })).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("rejects cancellation of a completed appointment", async () => {
    appointment.status = AppointmentStatus.COMPLETED;
    await expect(service.cancelByPatient(appointment.id, { userId: "patient-1", role: Role.PATIENT })).rejects.toBeInstanceOf(BadRequestException);
  });

  it("cancels by clinic, issues a 20% voucher, creates refund work and queues both notifications", async () => {
    const result = await service.cancelByClinic(appointment.id, { userId: "admin-1", role: Role.ADMIN }, "Bac si co ca cap cuu");
    expect(result.appointment.status).toBe(AppointmentStatus.CANCELLED_BY_CLINIC);
    expect(result.appointment.refundPercent).toBe(100);
    expect(result.voucher.discountPercent).toBe(20);
    expect(result.voucher.expiresAt.getTime()).toBeGreaterThan(Date.now());
    expect(result.refundRequest?.status).toBe("PENDING");
    expect(producer.enqueueAppointmentCancellationEmail).toHaveBeenCalledWith(expect.objectContaining({ appointmentCode: "APT-001", voucherCode: result.voucher.code }));
    expect(producer.enqueueAppointmentCancellationSms).toHaveBeenCalledTimes(1);
  });

  it("rejects a doctor cancelling an appointment owned by another doctor", async () => {
    doctorOwnsAppointment = false;
    await expect(service.cancelByClinic(appointment.id, { userId: "doctor-2-user", role: Role.DOCTOR })).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("validates an active voucher and calculates its discount", async () => {
    voucher = { code: "COMPENSATE-20-ABC123", discountPercent: 20, isUsed: false, expiresAt: new Date(Date.now() + 86400000) };
    await expect(service.validateVoucher("patient-1", voucher.code, 250000)).resolves.toEqual({ code: voucher.code, discountPercent: 20, discountAmount: 50000, finalAmount: 200000 });
  });

  it.each([
    [{ code: "USED", isUsed: true, expiresAt: new Date(Date.now() + 86400000) }],
    [{ code: "EXPIRED", isUsed: false, expiresAt: new Date(Date.now() - 1000) }],
  ])("rejects a used or expired voucher", async (invalidVoucher) => {
    voucher = invalidVoucher;
    await expect(service.validateVoucher("patient-1", invalidVoucher.code, 100000)).rejects.toBeInstanceOf(BadRequestException);
  });

  it("does not allow a receptionist to start consultation", async () => {
    await expect(service.transition(appointment.id, AppointmentStatus.IN_CONSULTATION, { userId: "reception-1", role: Role.RECEPTIONIST })).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("publishes the committed doctor call transition to the queue", async () => {
    appointment.status = AppointmentStatus.CHECKED_IN;

    await service.transition(appointment.id, AppointmentStatus.IN_CONSULTATION, {
      userId: "doctor-user-1",
      role: Role.DOCTOR,
    });

    expect(queueEvents.statusChanged).toHaveBeenCalledWith(
      appointment.id,
      AppointmentStatus.CHECKED_IN,
      "APPOINTMENT_LIFECYCLE",
    );
  });
});
