import './test-environment';
import { DataSource } from 'typeorm';
import { AppointmentStatus } from '@shared/enums';
import { AppointmentNotificationEntity } from '../src/database/entities/appointment-notification.entity';
import { AppointmentReminderDeliveryService } from '../src/modules/notification/services/appointment-reminder-delivery.service';

describe('AppointmentReminderDeliveryService', () => {
  let service: AppointmentReminderDeliveryService;
  let notification: any;
  let repository: { findOne: jest.Mock; save: jest.Mock };
  let send: jest.Mock;

  beforeEach(() => {
    notification = {
      id: 'notification-1',
      appointmentId: 'appointment-1',
      notificationType: 'REMINDER_24H',
      status: 'SCHEDULED',
      attempts: 0,
      appointment: { status: AppointmentStatus.CONFIRMED },
      sentAt: null,
      failureReason: null,
      provider: null,
    };
    repository = {
      findOne: jest.fn().mockResolvedValue(notification),
      save: jest.fn().mockImplementation(async (value) => value),
    };
    const dataSource = {
      getRepository: jest.fn(() => repository),
    } as unknown as DataSource;
    service = new AppointmentReminderDeliveryService(dataSource);
    send = jest.fn().mockResolvedValue(undefined);
  });

  it('marks a successfully delivered provider notification as SENT', async () => {
    await expect(service.deliver('notification-1', 'REMINDER_24H', 'SMTP', send)).resolves.toBe(true);
    expect(send).toHaveBeenCalledTimes(1);
    expect(notification.status).toBe('SENT');
    expect(notification.provider).toBe('SMTP');
    expect(notification.attempts).toBe(1);
    expect(notification.sentAt).toBeInstanceOf(Date);
  });

  it('prevents duplicate delivery when the same queue job is processed again', async () => {
    notification.status = 'SENT';
    await expect(service.deliver('notification-1', 'REMINDER_24H', 'SMTP', send)).resolves.toBe(false);
    expect(send).not.toHaveBeenCalled();
  });

  it('does not send a reminder after the appointment has been cancelled', async () => {
    notification.appointment.status = AppointmentStatus.CANCELLED_BY_PATIENT;
    await expect(service.deliver('notification-1', 'REMINDER_24H', 'SMTP', send)).resolves.toBe(false);
    expect(send).not.toHaveBeenCalled();
    expect(notification.status).toBe('FAILED');
    expect(notification.failureReason).toContain('no longer eligible');
  });

  it('records provider failure and rethrows so BullMQ can retry', async () => {
    send.mockRejectedValue(new Error('provider rejected delivery'));
    await expect(service.deliver('notification-1', 'REMINDER_24H', 'SMTP', send))
      .rejects.toThrow('Reminder provider delivery failed.');
    expect(notification.status).toBe('FAILED');
    expect(notification.failureReason).toBe('Notification provider delivery failed.');
    expect(notification.sentAt).toBeNull();
  });

  it('rejects a job whose reminder type does not match its notification log', async () => {
    await expect(service.deliver('notification-1', 'REMINDER_2H', 'SMS_WEBHOOK', send))
      .rejects.toThrow('Reminder delivery log does not match the queued reminder.');
    expect(send).not.toHaveBeenCalled();
  });
});
