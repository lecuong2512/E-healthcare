import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddClinicCancellationOutbox1789801200000 implements MigrationInterface {
  public readonly name = 'AddClinicCancellationOutbox1789801200000';
  public readonly transaction = true;
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query("ALTER TABLE appointments DROP CONSTRAINT IF EXISTS chk_appointments_payment_status; ALTER TABLE appointments ADD CONSTRAINT chk_appointments_payment_status CHECK (payment_status IN ('UNPAID', 'PENDING', 'PAID', 'REFUND_PENDING', 'FAILED', 'REFUNDED', 'PARTIALLY_REFUNDED'));");
    await queryRunner.query("CREATE TABLE refund_requests (id UUID NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(), appointment_id UUID NOT NULL UNIQUE REFERENCES appointments(id) ON DELETE CASCADE, provider VARCHAR(20) NOT NULL, amount NUMERIC(12,2) NOT NULL, status VARCHAR(16) NOT NULL DEFAULT 'PENDING', attempts INT NOT NULL DEFAULT 0, failure_reason TEXT, processed_at TIMESTAMPTZ, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), CONSTRAINT chk_refund_requests_amount CHECK (amount > 0), CONSTRAINT chk_refund_requests_status CHECK (status IN ('PENDING','PROCESSING','SUCCEEDED','FAILED')));");
    await queryRunner.query("CREATE INDEX idx_refund_requests_pending ON refund_requests (status, attempts) WHERE status = 'PENDING';");
    await queryRunner.query("CREATE TABLE appointment_notifications (id UUID NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(), appointment_id UUID NOT NULL REFERENCES appointments(id) ON DELETE CASCADE, channel VARCHAR(8) NOT NULL, recipient VARCHAR(255) NOT NULL, subject VARCHAR(200), message TEXT NOT NULL, status VARCHAR(16) NOT NULL DEFAULT 'PENDING', attempts INT NOT NULL DEFAULT 0, failure_reason TEXT, sent_at TIMESTAMPTZ, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), CONSTRAINT uq_appointment_notifications_channel UNIQUE (appointment_id, channel), CONSTRAINT chk_appointment_notifications_channel CHECK (channel IN ('EMAIL','SMS')), CONSTRAINT chk_appointment_notifications_status CHECK (status IN ('PENDING','PROCESSING','SENT','FAILED')));");
    await queryRunner.query("CREATE INDEX idx_appointment_notifications_pending ON appointment_notifications (status, attempts) WHERE status = 'PENDING';");
  }
  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query("DROP TABLE IF EXISTS appointment_notifications; DROP TABLE IF EXISTS refund_requests; ALTER TABLE appointments DROP CONSTRAINT IF EXISTS chk_appointments_payment_status; ALTER TABLE appointments ADD CONSTRAINT chk_appointments_payment_status CHECK (payment_status IN ('UNPAID', 'PENDING', 'PAID', 'FAILED', 'REFUNDED', 'PARTIALLY_REFUNDED'));");
  }
}
