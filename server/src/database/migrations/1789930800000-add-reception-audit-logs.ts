import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddReceptionAuditLogs1789930800000 implements MigrationInterface {
  public readonly name = 'AddReceptionAuditLogs1789930800000';
  public readonly transaction = true;

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE reception_audit_logs (
        id UUID NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
        actor_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
        appointment_id UUID REFERENCES appointments(id) ON DELETE RESTRICT,
        patient_id UUID REFERENCES users(id) ON DELETE RESTRICT,
        action VARCHAR(40) NOT NULL,
        occurred_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
        ip VARCHAR(64),
        user_agent VARCHAR(512),
        metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
        CONSTRAINT chk_reception_audit_action CHECK (action IN (
          'RECEPTION_LOOKUP', 'COUNTER_PAYMENT_COLLECTED',
          'PATIENT_CHECKED_IN', 'WALK_IN_BOOKED', 'RECEIPT_REPRINTED'
        ))
      );

      CREATE INDEX idx_reception_audit_actor
        ON reception_audit_logs USING BTREE (actor_id, occurred_at);
      CREATE INDEX idx_reception_audit_appointment
        ON reception_audit_logs USING BTREE (appointment_id, occurred_at)
        WHERE appointment_id IS NOT NULL;
      CREATE INDEX idx_reception_audit_patient
        ON reception_audit_logs USING BTREE (patient_id, occurred_at)
        WHERE patient_id IS NOT NULL;
      CREATE INDEX idx_reception_audit_action_time
        ON reception_audit_logs USING BTREE (action, occurred_at);
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE reception_audit_logs');
  }
}
