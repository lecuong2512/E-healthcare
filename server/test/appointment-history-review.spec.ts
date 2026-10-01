import { DataSource } from 'typeorm';
import { AppointmentStatus } from '@shared/enums';
import { AppointmentEntity } from '../src/database/entities/appointment.entity';
import { AppointmentLifecycleService } from '../src/modules/appointment/appointment-lifecycle.service';
import { NotificationProducerService } from '../src/modules/notification/producers/notification-producer.service';
import { QueueEventsService } from '../src/modules/realtime/queue-events.service';

describe('Appointment history review contract', () => {
  it('loads nested doctor and review data and returns a safe response shape', async () => {
    const find = jest.fn().mockResolvedValue([
      {
        id: 'appointment-1',
        patientId: 'patient-1',
        status: AppointmentStatus.COMPLETED,
        doctor: {
          id: 'doctor-1',
          academicTitle: 'BSCKII',
          consultationFee: 300000,
          roomNumber: 'P101',
          ratingAverage: 4.5,
          user: {
            fullName: 'Bác sĩ An',
            passwordHash: 'must-not-leak',
            email: 'private@example.test',
          },
          specialty: { id: 'specialty-1', name: 'Nội khoa' },
        },
        schedule: { date: '2026-09-28', startTime: '08:00:00' },
        review: {
          id: 'review-1',
          rating: 5,
          comment: 'Tốt',
          createdAt: new Date('2026-09-28T06:00:00.000Z'),
          patientId: 'patient-1',
        },
      } as unknown as AppointmentEntity,
    ]);
    const dataSource = {
      getRepository: jest.fn(() => ({ find })),
    } as unknown as DataSource;
    const service = new AppointmentLifecycleService(
      dataSource,
      {} as NotificationProducerService,
      {} as QueueEventsService,
    );

    const result = await service.listForPatient('patient-1');

    expect(find).toHaveBeenCalledWith({
      where: [{ patientId: 'patient-1' }, { createdBy: 'patient-1' }],
      relations: {
        doctor: { user: true, specialty: true },
        schedule: true,
        review: true,
        patient: true,
      },
      order: { id: 'DESC' },
    });
    expect(result[0]).toMatchObject({
      id: 'appointment-1',
      doctor: {
        id: 'doctor-1',
        ratingAverage: 4.5,
        user: { fullName: 'Bác sĩ An' },
        specialty: { id: 'specialty-1', name: 'Nội khoa' },
      },
      review: {
        id: 'review-1',
        rating: 5,
        comment: 'Tốt',
      },
    });
    expect(JSON.stringify(result)).not.toContain('must-not-leak');
    expect(JSON.stringify(result)).not.toContain('private@example.test');
  });

  it('returns review null for an appointment that has not been reviewed', async () => {
    const dataSource = {
      getRepository: jest.fn(() => ({
        find: jest.fn().mockResolvedValue([
          {
            id: 'appointment-2',
            patientId: 'patient-1',
            status: AppointmentStatus.COMPLETED,
            doctor: {
              id: 'doctor-1',
              academicTitle: null,
              consultationFee: 300000,
              roomNumber: 'P101',
              ratingAverage: 5,
              user: { fullName: 'Bác sĩ An' },
              specialty: { id: 'specialty-1', name: 'Nội khoa' },
            },
            schedule: {},
            review: null,
          } as unknown as AppointmentEntity,
        ]),
      })),
    } as unknown as DataSource;
    const service = new AppointmentLifecycleService(
      dataSource,
      {} as NotificationProducerService,
      {} as QueueEventsService,
    );

    await expect(service.listForPatient('patient-1')).resolves.toMatchObject([
      { id: 'appointment-2', review: null },
    ]);
  });
});
