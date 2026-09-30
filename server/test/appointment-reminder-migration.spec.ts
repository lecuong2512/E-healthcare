import './test-environment';
import { QueryRunner } from 'typeorm';
import { AddAppointmentReminderLifecycle1790152800000 } from '../src/database/migrations/1790152800000-add-appointment-reminder-lifecycle';
import { createDataSource } from '../src/database/database-options';

describe('Appointment reminder lifecycle migration', () => {
  it('is registered in the application DataSource without enabling schema synchronization', () => {
    const dataSource = createDataSource('postgres://test:test@localhost:5432/ehealth_test');
    expect(dataSource.options.synchronize).toBe(false);
    expect(dataSource.options.migrations).toContain(AddAppointmentReminderLifecycle1790152800000);
  });

  it('adds nullable reminder metadata and database-enforced idempotency without dropping existing rows', async () => {
    const query = jest.fn().mockResolvedValue(undefined);
    const migration = new AddAppointmentReminderLifecycle1790152800000();

    await migration.up({ query } as unknown as QueryRunner);

    expect(query).toHaveBeenCalledTimes(4);
    expect(query.mock.calls[0][0]).toContain('ADD COLUMN notification_type VARCHAR(20)');
    expect(query.mock.calls[0][0]).toContain('ADD COLUMN scheduled_at TIMESTAMPTZ');
    expect(query.mock.calls[1][0]).toContain('UNIQUE INDEX uq_appointment_notifications_reminder');
    expect(query.mock.calls[1][0]).toContain('WHERE notification_type IS NOT NULL');
    expect(query.mock.calls[2][0]).toContain('WHERE notification_type IS NULL');
  });
});