import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { AppointmentStatus } from '@shared/enums';
import { DataSource, EntityManager, QueryFailedError } from 'typeorm';
import { AppointmentEntity } from '../src/database/entities/appointment.entity';
import { DoctorReviewEntity } from '../src/database/entities/doctor-review.entity';
import { DoctorEntity } from '../src/database/entities/doctor.entity';
import { DoctorCacheService } from '../src/modules/doctor/doctor-cache.service';
import { DoctorReviewService } from '../src/modules/doctor/doctor-review.service';

describe('DoctorReviewService', () => {
  const doctorId = '0f415e3c-7307-45db-bb18-202bf63d42bf';
  const patientId = 'e274a928-cfb2-42af-b967-e9166ec532f0';
  const appointmentId = '552f60d9-a1af-48c7-ad5e-06a707657847';

  function setup(options: {
    doctor?: DoctorEntity | null;
    appointment?: AppointmentEntity | null;
    duplicate?: boolean;
    average?: string;
    saveError?: Error;
  } = {}) {
    const doctor = options.doctor === undefined
      ? ({ id: doctorId, ratingAverage: 5 } as DoctorEntity)
      : options.doctor;
    const appointment = options.appointment === undefined
      ? ({
          id: appointmentId,
          doctorId,
          patientId,
          status: AppointmentStatus.COMPLETED,
        } as AppointmentEntity)
      : options.appointment;
    const savedReview = {
      id: 'a752752f-190f-4307-b229-afb0b7ff609d',
      appointmentId,
      doctorId,
      patientId,
      rating: 4,
      comment: 'Tư vấn rõ ràng',
      createdAt: new Date('2026-09-28T06:00:00.000Z'),
    } as DoctorReviewEntity;

    const doctorQuery = {
      setLock: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      getOne: jest.fn().mockResolvedValue(doctor),
    };
    const averageQuery = {
      select: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      getRawOne: jest.fn().mockResolvedValue({ average: options.average ?? '4.25' }),
    };
    const doctorRepository = {
      createQueryBuilder: jest.fn(() => doctorQuery),
      save: jest.fn(async (value: DoctorEntity) => value),
    };
    const appointmentRepository = {
      findOne: jest.fn().mockResolvedValue(appointment),
    };
    const reviewRepository = {
      existsBy: jest.fn().mockResolvedValue(options.duplicate ?? false),
      create: jest.fn((value) => value),
      save: options.saveError
        ? jest.fn().mockRejectedValue(options.saveError)
        : jest.fn().mockResolvedValue(savedReview),
      createQueryBuilder: jest.fn(() => averageQuery),
    };
    const manager = {
      getRepository: jest.fn((entity) => {
        if (entity === DoctorEntity) return doctorRepository;
        if (entity === AppointmentEntity) return appointmentRepository;
        if (entity === DoctorReviewEntity) return reviewRepository;
        throw new Error('Unexpected repository');
      }),
    } as unknown as EntityManager;
    const dataSource = {
      transaction: jest.fn((callback) => callback(manager)),
    } as unknown as DataSource;
    const cache = {
      invalidateDoctorData: jest.fn().mockResolvedValue(undefined),
    } as unknown as DoctorCacheService;

    return {
      service: new DoctorReviewService(dataSource, cache),
      cache,
      doctorQuery,
      doctorRepository,
      appointmentRepository,
      reviewRepository,
    };
  }

  it('creates a review, trims comment, updates average and invalidates cache', async () => {
    const context = setup();

    await expect(
      context.service.create(doctorId, patientId, {
        appointmentId,
        rating: 4,
        comment: '  Tư vấn rõ ràng  ',
      }),
    ).resolves.toMatchObject({
      appointmentId,
      doctorId,
      rating: 4,
      comment: 'Tư vấn rõ ràng',
      ratingAverage: 4.25,
    });

    expect(context.doctorQuery.setLock).toHaveBeenCalledWith('pessimistic_write');
    expect(context.appointmentRepository.findOne).toHaveBeenCalledWith({
      where: { id: appointmentId, patientId },
    });
    expect(context.reviewRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({ comment: 'Tư vấn rõ ràng' }),
    );
    expect(context.doctorRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({ ratingAverage: 4.25 }),
    );
    expect(context.cache.invalidateDoctorData).toHaveBeenCalledWith(doctorId);
  });

  it('rejects an unknown doctor', async () => {
    const { service } = setup({ doctor: null });
    await expect(
      service.create(doctorId, patientId, { appointmentId, rating: 5 }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('rejects an appointment not owned by the current patient', async () => {
    const { service } = setup({ appointment: null });
    await expect(
      service.create(doctorId, patientId, { appointmentId, rating: 5 }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('rejects a doctor mismatch', async () => {
    const { service } = setup({
      appointment: {
        id: appointmentId,
        doctorId: 'dc2fe975-46c0-4804-933a-029b36735173',
        patientId,
        status: AppointmentStatus.COMPLETED,
      } as AppointmentEntity,
    });
    await expect(
      service.create(doctorId, patientId, { appointmentId, rating: 5 }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('rejects an appointment that is not completed', async () => {
    const { service } = setup({
      appointment: {
        id: appointmentId,
        doctorId,
        patientId,
        status: AppointmentStatus.CONFIRMED,
      } as AppointmentEntity,
    });
    await expect(
      service.create(doctorId, patientId, { appointmentId, rating: 5 }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects an existing appointment review', async () => {
    const { service } = setup({ duplicate: true });
    await expect(
      service.create(doctorId, patientId, { appointmentId, rating: 5 }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('maps a database duplicate race to conflict', async () => {
    const duplicate = new QueryFailedError(
      'INSERT INTO doctor_reviews',
      [],
      Object.assign(new Error('duplicate'), {
        code: '23505',
        constraint: 'uq_doctor_reviews_appointment',
      }),
    );
    const { service } = setup({ saveError: duplicate });
    await expect(
      service.create(doctorId, patientId, { appointmentId, rating: 5 }),
    ).rejects.toBeInstanceOf(ConflictException);
  });
});
