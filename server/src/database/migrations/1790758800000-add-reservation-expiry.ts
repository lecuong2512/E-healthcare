import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddReservationExpiry1790758800000 implements MigrationInterface {
  readonly name = 'AddReservationExpiry1790758800000';
  readonly transaction = true;

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE appointments
        ADD COLUMN reservation_expires_at TIMESTAMPTZ;

      CREATE INDEX idx_appointments_payment_expiry
        ON appointments USING BTREE (status, reservation_expires_at)
        WHERE status = 'PENDING_PAYMENT';
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP INDEX IF EXISTS idx_appointments_payment_expiry;
      ALTER TABLE appointments DROP COLUMN IF EXISTS reservation_expires_at;
    `);
  }
}
