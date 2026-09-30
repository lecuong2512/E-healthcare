import './test-environment';
import { environment } from '../src/config/environment';
import { EmailSenderService } from '../src/modules/notification/services/email-sender.service';
import { SmsSenderService } from '../src/modules/notification/services/sms-sender.service';

describe('Appointment reminder provider configuration', () => {
  const keys = [
    'SMTP_HOST', 'SMTP_PORT', 'SMTP_SECURE', 'SMTP_FROM', 'SMTP_USER', 'SMTP_PASSWORD',
    'SMS_WEBHOOK_URL', 'SMS_WEBHOOK_TOKEN', 'SMS_BRAND_NAME',
  ];
  let original: Record<string, string | undefined>;

  beforeEach(() => {
    original = Object.fromEntries(keys.map((key) => [key, environment[key]]));
    for (const key of keys) delete environment[key];
  });

  afterEach(() => {
    for (const key of keys) {
      if (original[key] === undefined) delete environment[key];
      else environment[key] = original[key]!;
    }
  });

  it('fails T-24 email reminder instead of reporting mock delivery without SMTP', async () => {
    const sender = new EmailSenderService();
    await expect(sender.sendAppointmentReminder24h({
      to: 'patient@example.test',
      patientName: 'Test Patient',
      appointmentCode: 'APT-TEST',
      doctorName: 'Test Doctor',
      date: '2026-10-01',
      time: '09:00',
    })).rejects.toThrow('SMTP reminder delivery is not configured.');
  });

  it('fails T-2 reminder when the webhook or approved Brandname is missing', async () => {
    const sender = new SmsSenderService();
    await expect(sender.sendAppointmentReminder2h({
      phoneNumber: '0901234567',
      patientName: 'Test Patient',
      appointmentCode: 'APT-TEST',
      doctorName: 'Test Doctor',
      time: '09:00',
    })).rejects.toThrow('SMS reminder provider is not configured.');

    environment.SMS_WEBHOOK_URL = 'https://sms-provider.example.test/send';
    environment.SMS_WEBHOOK_TOKEN = 'test-token';
    await expect(sender.sendAppointmentReminder2h({
      phoneNumber: '0901234567',
      patientName: 'Test Patient',
      appointmentCode: 'APT-TEST',
      doctorName: 'Test Doctor',
      time: '09:00',
    })).rejects.toThrow('SMS reminder Brandname is not configured.');
  });

  it('passes the approved Brandname and outbox idempotency key to the SMS provider', async () => {
    environment.SMS_WEBHOOK_URL = 'https://sms-provider.example.test/send';
    environment.SMS_WEBHOOK_TOKEN = 'test-token';
    environment.SMS_BRAND_NAME = 'EHEALTH-TEST';
    const fetchSpy = jest.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(null, { status: 202 }),
    );
    try {
      const sender = new SmsSenderService();
      await sender.sendAppointmentReminder2h({
        notificationLogId: 'notification-123',
        phoneNumber: '0901234567',
        patientName: 'Test Patient',
        appointmentCode: 'APT-TEST',
        doctorName: 'Test Doctor',
        time: '09:00',
      });
      const request = fetchSpy.mock.calls[0][1];
      const body = JSON.parse(String(request?.body));
      expect(body.brandName).toBe('EHEALTH-TEST');
      expect(body.idempotencyKey).toBe('notification-123');
    } finally {
      fetchSpy.mockRestore();
    }
  });
});
