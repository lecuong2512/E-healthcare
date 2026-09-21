import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddWalkInPatientAndIdempotency1789927200000
  implements MigrationInterface
{
  public readonly name = 'AddWalkInPatientAndIdempotency1789927200000';
  public readonly transaction = true;

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE users
        ADD COLUMN date_of_birth_precision VARCHAR(10) NOT NULL DEFAULT 'FULL_DATE',
        ADD CONSTRAINT chk_users_date_of_birth_precision
          CHECK (date_of_birth_precision IN ('YEAR', 'FULL_DATE')),
        ADD CONSTRAINT chk_users_year_only_date
          CHECK (date_of_birth_precision <> 'YEAR'
            OR (EXTRACT(MONTH FROM date_of_birth) = 1
              AND EXTRACT(DAY FROM date_of_birth) = 1));

      ALTER TABLE appointments
        ADD COLUMN created_by UUID,
        ADD COLUMN walk_in_idempotency_key UUID,
        ADD COLUMN walk_in_request_hash CHAR(64),
        ADD CONSTRAINT fk_appointments_created_by
          FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE RESTRICT,
        ADD CONSTRAINT chk_appointments_walk_in_idempotency
          CHECK (
            (walk_in_idempotency_key IS NULL AND walk_in_request_hash IS NULL)
            OR
            (walk_in_idempotency_key IS NOT NULL
              AND walk_in_request_hash IS NOT NULL
              AND created_by IS NOT NULL)
          ),
        ADD CONSTRAINT chk_appointments_walk_in_request_hash
          CHECK (walk_in_request_hash IS NULL
            OR walk_in_request_hash ~ '^[0-9a-f]{64}$'),
        ADD CONSTRAINT chk_appointments_walk_in_source
          CHECK (queue_source IS NULL OR queue_source <> 'WALK_IN'
            OR (created_by IS NOT NULL AND walk_in_idempotency_key IS NOT NULL));

      CREATE INDEX idx_appointments_created_by
        ON appointments USING BTREE (created_by)
        WHERE created_by IS NOT NULL;

      CREATE UNIQUE INDEX idx_appointments_walk_in_idempotency
        ON appointments USING BTREE (created_by, walk_in_idempotency_key)
        WHERE walk_in_idempotency_key IS NOT NULL;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP INDEX idx_appointments_walk_in_idempotency;
      DROP INDEX idx_appointments_created_by;
      ALTER TABLE appointments
        DROP COLUMN walk_in_request_hash,
        DROP COLUMN walk_in_idempotency_key,
        DROP COLUMN created_by;
      ALTER TABLE users DROP COLUMN date_of_birth_precision;
    `);
  }
}
