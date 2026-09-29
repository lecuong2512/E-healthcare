import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateAppendOnlyAuditLogs1790845200000
  implements MigrationInterface
{
  public readonly name = 'CreateAppendOnlyAuditLogs1790845200000';
  public readonly transaction = true;

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE audit_logs (
        id UUID NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
        actor_id UUID,
        actor_display_name VARCHAR(100),
        actor_role VARCHAR(32),
        action VARCHAR(64) NOT NULL,
        outcome VARCHAR(16) NOT NULL DEFAULT 'SUCCESS',
        occurred_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
        ip_address INET,
        user_agent VARCHAR(512),
        resource_type VARCHAR(64),
        resource_id VARCHAR(128),
        request_id VARCHAR(128),
        metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
        CONSTRAINT chk_audit_logs_outcome
          CHECK (outcome IN ('SUCCESS', 'DENIED', 'FAILURE')),
        CONSTRAINT chk_audit_logs_action
          CHECK (action IN (
            'LOGIN', 'LOGIN_FAILED', 'LOGOUT', 'PASSWORD_RESET',
            'CREATE_EMR', 'VIEW_EMR', 'EXPORT_EMR', 'UPDATE_EMR',
            'UPDATE_RX', 'EXPORT_RX', 'CREATE_EMR_ADDENDUM',
            'CANCEL_APPT', 'REFUND_PAYMENT', 'EXPORT_PATIENT_LIST',
            'VIEW_AUDIT_LOGS', 'EXPORT_AUDIT_LOGS'
          ))
      )
    `);

    await queryRunner.query(`
      CREATE INDEX idx_audit_logs_occurred_id
        ON audit_logs USING BTREE (occurred_at DESC, id DESC);
      CREATE INDEX idx_audit_logs_actor_occurred
        ON audit_logs USING BTREE (actor_id, occurred_at DESC)
        WHERE actor_id IS NOT NULL;
      CREATE INDEX idx_audit_logs_action_occurred
        ON audit_logs USING BTREE (action, occurred_at DESC);
      CREATE INDEX idx_audit_logs_ip_occurred
        ON audit_logs USING BTREE (ip_address, occurred_at DESC)
        WHERE ip_address IS NOT NULL;
    `);

    await queryRunner.query(`
      CREATE FUNCTION reject_audit_log_mutation()
      RETURNS TRIGGER
      LANGUAGE plpgsql
      AS $$
      BEGIN
        RAISE EXCEPTION 'audit_logs is append-only'
          USING ERRCODE = '42501';
      END;
      $$
    `);

    await queryRunner.query(`
      CREATE TRIGGER trg_audit_logs_reject_update_delete
      BEFORE UPDATE OR DELETE ON audit_logs
      FOR EACH STATEMENT EXECUTE FUNCTION reject_audit_log_mutation();

      CREATE TRIGGER trg_audit_logs_reject_truncate
      BEFORE TRUNCATE ON audit_logs
      FOR EACH STATEMENT EXECUTE FUNCTION reject_audit_log_mutation();
    `);

    await queryRunner.query(`
      REVOKE UPDATE, DELETE, TRUNCATE ON TABLE audit_logs FROM PUBLIC
    `);

    await queryRunner.query(`
      COMMENT ON TABLE audit_logs IS
        'Append-only security audit. Application retention is indefinite and must never be shorter than five years.'
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE IF EXISTS audit_logs');
    await queryRunner.query('DROP FUNCTION IF EXISTS reject_audit_log_mutation()');
  }
}
