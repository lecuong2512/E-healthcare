import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddAppointmentLifecycleAndVouchers1789800000000 implements MigrationInterface {
  public readonly name = 'AddAppointmentLifecycleAndVouchers1789800000000';
  public readonly transaction = true;

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE appointments DROP CONSTRAINT IF EXISTS chk_appointments_status;
      ALTER TABLE appointments ADD CONSTRAINT chk_appointments_status CHECK (status IN ('PENDING_PAYMENT', 'CONFIRMED', 'CHECKED_IN', 'IN_CONSULTATION', 'COMPLETED', 'EXPIRED', 'CANCELLED', 'CANCELLED_BY_PATIENT', 'CANCELLED_BY_CLINIC', 'NO_SHOW'));
      ALTER TABLE appointments DROP CONSTRAINT IF EXISTS chk_appointments_payment_status;
      ALTER TABLE appointments ADD CONSTRAINT chk_appointments_payment_status CHECK (payment_status IN ('UNPAID', 'PENDING', 'PAID', 'FAILED', 'REFUNDED', 'PARTIALLY_REFUNDED'));
      ALTER TABLE appointments
        ADD COLUMN cancelled_at TIMESTAMPTZ,
        ADD COLUMN cancellation_reason TEXT,
        ADD COLUMN cancelled_by UUID REFERENCES users(id) ON DELETE SET NULL,
        ADD COLUMN refund_amount NUMERIC(12, 2) NOT NULL DEFAULT 0,
        ADD COLUMN refund_percent NUMERIC(5, 2) NOT NULL DEFAULT 0,
        ADD COLUMN discount_amount NUMERIC(12, 2) NOT NULL DEFAULT 0,
        ADD COLUMN voucher_code VARCHAR(32),
        ADD CONSTRAINT chk_appointments_refund_amount CHECK (refund_amount >= 0),
        ADD CONSTRAINT chk_appointments_refund_percent CHECK (refund_percent BETWEEN 0 AND 100),
        ADD CONSTRAINT chk_appointments_discount_amount CHECK (discount_amount >= 0);
      CREATE TABLE vouchers (
        id UUID NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT ON UPDATE CASCADE,
        code VARCHAR(32) NOT NULL UNIQUE,
        discount_percent NUMERIC(5, 2) NOT NULL,
        is_used BOOLEAN NOT NULL DEFAULT FALSE,
        expires_at TIMESTAMPTZ NOT NULL,
        used_at TIMESTAMPTZ,
        issued_for_appointment_id UUID REFERENCES appointments(id) ON DELETE SET NULL,
        redeemed_appointment_id UUID REFERENCES appointments(id) ON DELETE SET NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT chk_vouchers_discount_percent CHECK (discount_percent > 0 AND discount_percent <= 100),
        CONSTRAINT chk_vouchers_usage_timestamp CHECK ((is_used = FALSE AND used_at IS NULL) OR (is_used = TRUE AND used_at IS NOT NULL))
      );
      CREATE INDEX idx_vouchers_user_active ON vouchers (user_id, is_used, expires_at);
      CREATE INDEX idx_appointments_status_schedule ON appointments (status, schedule_id);
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP TABLE IF EXISTS vouchers;
      ALTER TABLE appointments DROP CONSTRAINT IF EXISTS chk_appointments_refund_amount, DROP CONSTRAINT IF EXISTS chk_appointments_refund_percent, DROP CONSTRAINT IF EXISTS chk_appointments_discount_amount, DROP COLUMN IF EXISTS voucher_code, DROP COLUMN IF EXISTS discount_amount, DROP COLUMN IF EXISTS refund_percent, DROP COLUMN IF EXISTS refund_amount, DROP COLUMN IF EXISTS cancelled_by, DROP COLUMN IF EXISTS cancellation_reason, DROP COLUMN IF EXISTS cancelled_at;

      ALTER TABLE appointments DROP CONSTRAINT IF EXISTS chk_appointments_status;
      ALTER TABLE appointments ADD CONSTRAINT chk_appointments_status CHECK (status IN ('PENDING_PAYMENT', 'CONFIRMED', 'CHECKED_IN', 'IN_CONSULTATION', 'COMPLETED', 'CANCELLED'));
      ALTER TABLE appointments DROP CONSTRAINT IF EXISTS chk_appointments_payment_status;
      ALTER TABLE appointments ADD CONSTRAINT chk_appointments_payment_status CHECK (payment_status IN ('UNPAID', 'PAID', 'REFUNDED'));
    `);
  }
}
