import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddAppointmentCreatedAt1789801800000 implements MigrationInterface {
  public readonly name = 'AddAppointmentCreatedAt1789801800000';
  public readonly transaction = true;

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query("ALTER TABLE appointments ADD COLUMN created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();");
    await queryRunner.query("CREATE INDEX idx_appointments_pending_payment_created_at ON appointments (status, created_at) WHERE status = 'PENDING_PAYMENT';");
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query("DROP INDEX IF EXISTS idx_appointments_pending_payment_created_at; ALTER TABLE appointments DROP COLUMN IF EXISTS created_at;");
  }
}
