import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddReconciliationRetry1790769600000 implements MigrationInterface {
  name = 'AddReconciliationRetry1790769600000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE payment_transactions
      ADD COLUMN reconciliation_attempts INT NOT NULL DEFAULT 0,
      ADD COLUMN next_reconcile_at TIMESTAMPTZ NULL,
      ADD COLUMN last_reconcile_error TEXT NULL,
      ADD COLUMN reconciliation_manual_review BOOLEAN NOT NULL DEFAULT FALSE
    `);
    await queryRunner.query(`
      CREATE INDEX idx_payment_transactions_reconciliation_due
      ON payment_transactions (next_reconcile_at)
      WHERE status = 'RECONCILIATION_REQUIRED'
        AND reconciliation_manual_review = FALSE
    `);
    await queryRunner.query(`
      UPDATE payment_transactions
      SET next_reconcile_at = NOW()
      WHERE status = 'RECONCILIATION_REQUIRED'
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP INDEX IF EXISTS idx_payment_transactions_reconciliation_due
    `);
    await queryRunner.query(`
      ALTER TABLE payment_transactions
      DROP COLUMN reconciliation_manual_review,
      DROP COLUMN last_reconcile_error,
      DROP COLUMN next_reconcile_at,
      DROP COLUMN reconciliation_attempts
    `);
  }
}
