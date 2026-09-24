import { MigrationInterface, QueryRunner } from "typeorm";
export class CreatePasswordResetSessions1790200000000 implements MigrationInterface {
 async up(q: QueryRunner): Promise<void> { await q.query("CREATE TABLE password_reset_sessions (id UUID PRIMARY KEY,user_id UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,otp_hash CHAR(64) NOT NULL,expires_at TIMESTAMPTZ NOT NULL,failed_attempts SMALLINT NOT NULL DEFAULT 0 CHECK (failed_attempts BETWEEN 0 AND 5),locked_until TIMESTAMPTZ)"); }
 async down(q: QueryRunner): Promise<void> { await q.query("DROP TABLE password_reset_sessions"); }
}
