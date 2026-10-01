import { MigrationInterface, QueryRunner } from "typeorm";

export class CreateAuthSessionsAndGoogle1789478400000
  implements MigrationInterface
{
  readonly name = "CreateAuthSessionsAndGoogle1789478400000";

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE users ADD COLUMN failed_login_attempts SMALLINT NOT NULL DEFAULT 0
        CHECK (failed_login_attempts BETWEEN 0 AND 5);
      ALTER TABLE users ADD COLUMN login_locked_until TIMESTAMPTZ;
      ALTER TABLE users ADD COLUMN google_subject VARCHAR(255);
      CREATE UNIQUE INDEX uq_users_google_subject ON users(google_subject) WHERE google_subject IS NOT NULL;
      CREATE TABLE auth_sessions (
        id UUID PRIMARY KEY,
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        refresh_token_hash CHAR(64) NOT NULL,
        expires_at TIMESTAMPTZ NOT NULL,
        revoked_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
      );
      CREATE INDEX idx_auth_sessions_user ON auth_sessions(user_id);
      CREATE TABLE google_oauth_flows (
        id UUID PRIMARY KEY,
        state_hash CHAR(64) NOT NULL UNIQUE,
        browser_hash CHAR(64) NOT NULL,
        nonce_hash CHAR(64) NOT NULL,
        code_verifier VARCHAR(128) NOT NULL,
        expires_at TIMESTAMPTZ NOT NULL
      );
      CREATE TABLE google_registration_sessions (
        token_hash CHAR(64) PRIMARY KEY,
        google_subject VARCHAR(255) NOT NULL,
        email VARCHAR(100) NOT NULL,
        full_name VARCHAR(100) NOT NULL,
        expires_at TIMESTAMPTZ NOT NULL
      );
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP TABLE google_registration_sessions;
      DROP TABLE google_oauth_flows;
      DROP TABLE auth_sessions;
      DROP INDEX uq_users_google_subject;
      ALTER TABLE users DROP COLUMN google_subject;
      ALTER TABLE users DROP COLUMN login_locked_until;
      ALTER TABLE users DROP COLUMN failed_login_attempts;
    `);
  }
}
