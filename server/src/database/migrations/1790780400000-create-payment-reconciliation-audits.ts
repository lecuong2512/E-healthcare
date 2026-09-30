import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreatePaymentReconciliationAudits1790780400000
  implements MigrationInterface
{
  name = 'CreatePaymentReconciliationAudits1790780400000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE payment_reconciliation_audits (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        payment_transaction_id UUID NOT NULL
          REFERENCES payment_transactions(id) ON DELETE RESTRICT,
        admin_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
        action VARCHAR(32) NOT NULL,
        reason TEXT NOT NULL,
        previous_status VARCHAR(32) NOT NULL,
        new_status VARCHAR(32) NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT chk_payment_reconciliation_audit_action CHECK (
          action IN ('MARK_FAILED', 'MARK_REFUND_REQUIRED', 'RETRY_PROVIDER_QUERY')
        )
      )
    `);
    await queryRunner.query(`
      CREATE INDEX idx_payment_reconciliation_audits_transaction_created
      ON payment_reconciliation_audits(payment_transaction_id, created_at)
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE payment_reconciliation_audits');
  }
}
