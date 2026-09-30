import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddTransactionRefunds1790766000000 implements MigrationInterface {
  name = 'AddTransactionRefunds1790766000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE refund_requests
      DROP CONSTRAINT IF EXISTS refund_requests_appointment_id_key
    `);
    await queryRunner.query(`
      ALTER TABLE refund_requests
      ADD COLUMN payment_transaction_id UUID NULL
      REFERENCES payment_transactions(id) ON DELETE RESTRICT
    `);
    await queryRunner.query(`
      CREATE INDEX idx_refund_requests_appointment_id
      ON refund_requests (appointment_id)
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX uq_refund_requests_payment_transaction_id
      ON refund_requests (payment_transaction_id)
      WHERE payment_transaction_id IS NOT NULL
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    const duplicateAppointments: Array<{ appointment_id: string }> = await queryRunner.query(`
      SELECT appointment_id
      FROM refund_requests
      GROUP BY appointment_id
      HAVING COUNT(*) > 1
      LIMIT 1
    `);
    if (duplicateAppointments.length > 0) {
      throw new Error(
        'Migration cannot be safely reverted after multiple refunds per appointment exist.',
      );
    }

    await queryRunner.query(`
      DROP INDEX IF EXISTS uq_refund_requests_payment_transaction_id
    `);
    await queryRunner.query(`
      DROP INDEX IF EXISTS idx_refund_requests_appointment_id
    `);
    await queryRunner.query(`
      ALTER TABLE refund_requests
      DROP COLUMN payment_transaction_id
    `);
    await queryRunner.query(`
      ALTER TABLE refund_requests
      ADD CONSTRAINT refund_requests_appointment_id_key UNIQUE (appointment_id)
    `);
  }
}
