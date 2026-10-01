import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreatePaymentTransactions1790672400000
  implements MigrationInterface
{
  public readonly name = 'CreatePaymentTransactions1790672400000';
  public readonly transaction = true;

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE appointments
        ADD COLUMN reservation_id UUID;

      CREATE INDEX idx_appointments_reservation_id
        ON appointments USING BTREE (reservation_id);

      CREATE TABLE payment_transactions (
        id UUID NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
        appointment_id UUID NOT NULL,
        reservation_id UUID NOT NULL,
        patient_id UUID NOT NULL,
        provider VARCHAR(20) NOT NULL,
        merchant_transaction_id VARCHAR(64) NOT NULL,
        provider_transaction_id VARCHAR(100),
        request_id VARCHAR(64),
        idempotency_key UUID NOT NULL,
        amount_vnd NUMERIC(15, 0) NOT NULL,
        currency CHAR(3) NOT NULL DEFAULT 'VND',
        status VARCHAR(32) NOT NULL,
        response_code VARCHAR(32),
        provider_status VARCHAR(64),
        expires_at TIMESTAMPTZ NOT NULL,
        paid_at TIMESTAMPTZ,
        callback_received_at TIMESTAMPTZ,
        signature_verified BOOLEAN NOT NULL DEFAULT FALSE,
        sanitized_provider_payload JSONB,
        created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT fk_payment_transactions_appointment
          FOREIGN KEY (appointment_id) REFERENCES appointments(id)
          ON DELETE RESTRICT ON UPDATE CASCADE,
        CONSTRAINT fk_payment_transactions_patient
          FOREIGN KEY (patient_id) REFERENCES users(id)
          ON DELETE RESTRICT ON UPDATE CASCADE,
        CONSTRAINT chk_payment_transactions_provider
          CHECK (provider IN ('VNPAY', 'MOMO')),
        CONSTRAINT chk_payment_transactions_amount
          CHECK (amount_vnd > 0 AND amount_vnd = trunc(amount_vnd)),
        CONSTRAINT chk_payment_transactions_currency CHECK (currency = 'VND'),
        CONSTRAINT chk_payment_transactions_status CHECK (
          status IN (
            'PENDING', 'SUCCESS', 'FAILED', 'TIMEOUT', 'SUPERSEDED',
            'RECONCILIATION_REQUIRED', 'LATE_SUCCESS'
          )
        )
      );

      CREATE UNIQUE INDEX uq_payment_transactions_provider_merchant
        ON payment_transactions USING BTREE (provider, merchant_transaction_id);
      CREATE UNIQUE INDEX uq_payment_transactions_provider_transaction
        ON payment_transactions USING BTREE (provider, provider_transaction_id)
        WHERE provider_transaction_id IS NOT NULL;
      CREATE UNIQUE INDEX uq_payment_transactions_patient_idempotency
        ON payment_transactions USING BTREE (patient_id, idempotency_key);
      CREATE UNIQUE INDEX uq_payment_transactions_active_appointment
        ON payment_transactions USING BTREE (appointment_id)
        WHERE status IN ('PENDING', 'RECONCILIATION_REQUIRED');
      CREATE INDEX idx_payment_transactions_appointment_id
        ON payment_transactions USING BTREE (appointment_id);
      CREATE INDEX idx_payment_transactions_patient_id
        ON payment_transactions USING BTREE (patient_id);
      CREATE INDEX idx_payment_transactions_status_expires_at
        ON payment_transactions USING BTREE (status, expires_at);
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP TABLE IF EXISTS payment_transactions;
      DROP INDEX IF EXISTS idx_appointments_reservation_id;
      ALTER TABLE appointments DROP COLUMN IF EXISTS reservation_id;
    `);
  }
}
