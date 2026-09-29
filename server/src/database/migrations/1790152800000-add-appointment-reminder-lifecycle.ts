import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddAppointmentReminderLifecycle1790152800000 implements MigrationInterface {
  public readonly name = 'AddAppointmentReminderLifecycle1790152800000';
  public readonly transaction = true;

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE appointment_notifications
        DROP CONSTRAINT IF EXISTS uq_appointment_notifications_channel,
        ADD COLUMN notification_type VARCHAR(20),
        ADD COLUMN scheduled_at TIMESTAMPTZ,
        ADD COLUMN provider VARCHAR(40),
        DROP CONSTRAINT IF EXISTS chk_appointment_notifications_status,
        ADD CONSTRAINT chk_appointment_notifications_status
          CHECK (status IN ('PENDING','SCHEDULED','PROCESSING','SENT','FAILED')),
        ADD CONSTRAINT chk_appointment_notifications_type
          CHECK (notification_type IS NULL OR notification_type IN ('REMINDER_24H','REMINDER_2H'));
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX uq_appointment_notifications_reminder
        ON appointment_notifications (appointment_id, notification_type)
        WHERE notification_type IS NOT NULL;
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX uq_appointment_notifications_legacy_channel
        ON appointment_notifications (appointment_id, channel)
        WHERE notification_type IS NULL;
    `);
    await queryRunner.query(`
      CREATE INDEX idx_appointment_notifications_scheduled
        ON appointment_notifications (status, scheduled_at)
        WHERE notification_type IS NOT NULL;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query("UPDATE appointment_notifications SET status = 'PENDING' WHERE status = 'SCHEDULED';");
    await queryRunner.query('DROP INDEX IF EXISTS idx_appointment_notifications_scheduled;');
    await queryRunner.query('DROP INDEX IF EXISTS uq_appointment_notifications_legacy_channel;');
    await queryRunner.query('DROP INDEX IF EXISTS uq_appointment_notifications_reminder;');
    await queryRunner.query(`
      ALTER TABLE appointment_notifications
        DROP CONSTRAINT IF EXISTS chk_appointment_notifications_type,
        DROP CONSTRAINT IF EXISTS chk_appointment_notifications_status,
        ADD CONSTRAINT chk_appointment_notifications_status
          CHECK (status IN ('PENDING','PROCESSING','SENT','FAILED')),
        DROP COLUMN IF EXISTS notification_type,
        DROP COLUMN IF EXISTS scheduled_at,
        DROP COLUMN IF EXISTS provider;
    `);
    await queryRunner.query(`
      ALTER TABLE appointment_notifications
        ADD CONSTRAINT uq_appointment_notifications_channel UNIQUE (appointment_id, channel);
    `);
  }
}