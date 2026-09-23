import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddCancelledByPatientStatus1789800600000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE appointments DROP CONSTRAINT IF EXISTS chk_appointments_status;
      ALTER TABLE appointments ADD CONSTRAINT chk_appointments_status CHECK (status IN ('PENDING_PAYMENT', 'CONFIRMED', 'CHECKED_IN', 'IN_CONSULTATION', 'COMPLETED', 'EXPIRED', 'CANCELLED', 'CANCELLED_BY_PATIENT', 'CANCELLED_BY_CLINIC', 'NO_SHOW'));
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE appointments DROP CONSTRAINT IF EXISTS chk_appointments_status;`);
  }
}
