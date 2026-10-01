import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddCanonicalPayment1790773200000 implements MigrationInterface {
  name = 'AddCanonicalPayment1790773200000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE appointments
      ADD COLUMN canonical_payment_transaction_id UUID NULL
      REFERENCES payment_transactions(id) ON DELETE SET NULL
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX uq_appointments_canonical_payment_transaction_id
      ON appointments (canonical_payment_transaction_id)
      WHERE canonical_payment_transaction_id IS NOT NULL
    `);
    await queryRunner.query(`
      UPDATE appointments AS appointment
      SET canonical_payment_transaction_id = payment.id
      FROM payment_transactions AS payment
      WHERE payment.appointment_id = appointment.id
        AND payment.status = 'SUCCESS'
        AND payment.id = (
          SELECT candidate.id
          FROM payment_transactions AS candidate
          WHERE candidate.appointment_id = appointment.id
            AND candidate.status = 'SUCCESS'
          ORDER BY candidate.paid_at DESC NULLS LAST, candidate.created_at DESC
          LIMIT 1
        )
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP INDEX IF EXISTS uq_appointments_canonical_payment_transaction_id
    `);
    await queryRunner.query(`
      ALTER TABLE appointments
      DROP COLUMN canonical_payment_transaction_id
    `);
  }
}
