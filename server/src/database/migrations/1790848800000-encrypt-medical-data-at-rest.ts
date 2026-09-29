import { MigrationInterface, QueryRunner } from 'typeorm';
import { loadMedicalEncryptionConfig } from '../../config/medical-encryption';

export class EncryptMedicalDataAtRest1790848800000
  implements MigrationInterface
{
  public readonly name = 'EncryptMedicalDataAtRest1790848800000';
  // Batches are individually committed so an interrupted backfill can resume.
  // Deployment must keep legacy writers in maintenance/read-only mode until
  // the contract phase drops plaintext columns.
  public readonly transaction = false;

  public async up(queryRunner: QueryRunner): Promise<void> {
    const config = loadMedicalEncryptionConfig();
    const key = config.keys.get(config.currentVersion)!;

    await queryRunner.query('CREATE EXTENSION IF NOT EXISTS pgcrypto');
    await queryRunner.query(`
      ALTER TABLE medical_records
        ADD COLUMN IF NOT EXISTS clinical_notes_ciphertext BYTEA,
        ADD COLUMN IF NOT EXISTS vital_signs_ciphertext BYTEA,
        ADD COLUMN IF NOT EXISTS encryption_key_version SMALLINT;

      ALTER TABLE prescription_items
        ADD COLUMN IF NOT EXISTS payload_ciphertext BYTEA,
        ADD COLUMN IF NOT EXISTS encryption_key_version SMALLINT;

      ALTER TABLE emr_addendums
        ADD COLUMN IF NOT EXISTS content_ciphertext BYTEA,
        ADD COLUMN IF NOT EXISTS encryption_key_version SMALLINT;
    `);

    if (await this.columnExists(queryRunner, 'medical_records', 'clinical_notes')) {
      await this.backfill(queryRunner, `
        WITH batch AS (
          SELECT id
            FROM medical_records
           WHERE clinical_notes_ciphertext IS NULL
              OR vital_signs_ciphertext IS NULL
              OR encryption_key_version IS NULL
           ORDER BY id
           LIMIT 500
           FOR UPDATE SKIP LOCKED
        )
        UPDATE medical_records target
           SET clinical_notes_ciphertext = pgp_sym_encrypt(
                 target.clinical_notes, $1, 'cipher-algo=aes256'
               ),
               vital_signs_ciphertext = pgp_sym_encrypt(
                 target.vital_signs::text, $1, 'cipher-algo=aes256'
               ),
               encryption_key_version = $2
          FROM batch
         WHERE target.id = batch.id
        RETURNING target.id
      `, [key, config.currentVersion]);
    }

    if (await this.columnExists(queryRunner, 'prescription_items', 'medicine_name')) {
      await this.backfill(queryRunner, `
        WITH batch AS (
          SELECT id
            FROM prescription_items
           WHERE payload_ciphertext IS NULL OR encryption_key_version IS NULL
           ORDER BY id
           LIMIT 500
           FOR UPDATE SKIP LOCKED
        )
        UPDATE prescription_items target
           SET payload_ciphertext = pgp_sym_encrypt(
                 jsonb_build_object(
                   'medicineName', target.medicine_name,
                   'activeIngredient', target.active_ingredient,
                   'dosageMorning', target.dosage_morning,
                   'dosageNoon', target.dosage_noon,
                   'dosageAfternoon', target.dosage_afternoon,
                   'dosageNight', target.dosage_night,
                   'totalQuantity', target.total_quantity,
                   'unit', target.unit,
                   'usageInstructions', target.usage_instructions
                 )::text,
                 $1,
                 'cipher-algo=aes256'
               ),
               encryption_key_version = $2
          FROM batch
         WHERE target.id = batch.id
        RETURNING target.id
      `, [key, config.currentVersion]);
    }

    if (await this.columnExists(queryRunner, 'emr_addendums', 'reason')) {
      await this.backfill(queryRunner, `
        WITH batch AS (
          SELECT id
            FROM emr_addendums
           WHERE content_ciphertext IS NULL OR encryption_key_version IS NULL
           ORDER BY id
           LIMIT 500
           FOR UPDATE SKIP LOCKED
        )
        UPDATE emr_addendums target
           SET content_ciphertext = pgp_sym_encrypt(
                 jsonb_build_object(
                   'reason', target.reason,
                   'previousContent', target.previous_content,
                   'updatedContent', target.updated_content
                 )::text,
                 $1,
                 'cipher-algo=aes256'
               ),
               encryption_key_version = $2
          FROM batch
         WHERE target.id = batch.id
        RETURNING target.id
      `, [key, config.currentVersion]);
    }

    await queryRunner.query(`
      ALTER TABLE medical_records
        ALTER COLUMN clinical_notes_ciphertext SET NOT NULL,
        ALTER COLUMN vital_signs_ciphertext SET NOT NULL,
        ALTER COLUMN encryption_key_version SET NOT NULL,
        DROP CONSTRAINT IF EXISTS chk_medical_records_encryption_key_version,
        ADD CONSTRAINT chk_medical_records_encryption_key_version
          CHECK (encryption_key_version > 0);

      ALTER TABLE prescription_items
        ALTER COLUMN payload_ciphertext SET NOT NULL,
        ALTER COLUMN encryption_key_version SET NOT NULL,
        DROP CONSTRAINT IF EXISTS chk_prescription_items_encryption_key_version,
        ADD CONSTRAINT chk_prescription_items_encryption_key_version
          CHECK (encryption_key_version > 0);

      ALTER TABLE emr_addendums
        ALTER COLUMN content_ciphertext SET NOT NULL,
        ALTER COLUMN encryption_key_version SET NOT NULL,
        DROP CONSTRAINT IF EXISTS chk_emr_addendums_encryption_key_version,
        ADD CONSTRAINT chk_emr_addendums_encryption_key_version
          CHECK (encryption_key_version > 0);
    `);

    await queryRunner.query(`
      DROP INDEX IF EXISTS idx_prescription_items_medicine_name;
      DROP INDEX IF EXISTS idx_prescription_items_active_ingredient;

      ALTER TABLE medical_records
        DROP COLUMN IF EXISTS clinical_notes,
        DROP COLUMN IF EXISTS vital_signs;

      ALTER TABLE prescription_items
        DROP COLUMN IF EXISTS medicine_name,
        DROP COLUMN IF EXISTS active_ingredient,
        DROP COLUMN IF EXISTS dosage_morning,
        DROP COLUMN IF EXISTS dosage_noon,
        DROP COLUMN IF EXISTS dosage_afternoon,
        DROP COLUMN IF EXISTS dosage_night,
        DROP COLUMN IF EXISTS total_quantity,
        DROP COLUMN IF EXISTS unit,
        DROP COLUMN IF EXISTS usage_instructions;

      ALTER TABLE emr_addendums
        DROP COLUMN IF EXISTS reason,
        DROP COLUMN IF EXISTS previous_content,
        DROP COLUMN IF EXISTS updated_content;
    `);
  }

  private async backfill(
    queryRunner: QueryRunner,
    sql: string,
    parameters: unknown[],
  ): Promise<void> {
    while (true) {
      const result = await queryRunner.query(sql, parameters);
      const affected = Array.isArray(result)
        ? Array.isArray(result[0])
          ? result[0].length
          : result.length
        : result.records.length;
      if (affected === 0) return;
    }
  }

  private async columnExists(
    queryRunner: QueryRunner,
    table: string,
    column: string,
  ): Promise<boolean> {
    const rows = await queryRunner.query(
      `SELECT EXISTS (
         SELECT 1
           FROM information_schema.columns
          WHERE table_schema = 'public'
            AND table_name = $1
            AND column_name = $2
       ) AS present`,
      [table, column],
    );
    return Boolean(rows[0]?.present);
  }

  public async down(): Promise<void> {
    throw new Error(
      'Security migration is intentionally irreversible: restoring plaintext columns requires an approved recovery runbook.',
    );
  }
}
