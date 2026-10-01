import { MigrationInterface, QueryRunner } from 'typeorm';

export class UniquePatientCitizenId1789938000000 implements MigrationInterface {
  public readonly name = 'UniquePatientCitizenId1789938000000';
  public readonly transaction = true;

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      UPDATE personal_health_profiles
      SET citizen_id = NULLIF(BTRIM(citizen_id), '')
      WHERE citizen_id IS NOT NULL;

      ALTER TABLE personal_health_profiles
        ADD CONSTRAINT chk_phr_citizen_id_trimmed
          CHECK (citizen_id IS NULL OR (citizen_id <> '' AND citizen_id = BTRIM(citizen_id)));

      CREATE UNIQUE INDEX uq_phr_citizen_id
        ON personal_health_profiles USING BTREE (citizen_id)
        WHERE citizen_id IS NOT NULL;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP INDEX uq_phr_citizen_id;
      ALTER TABLE personal_health_profiles DROP CONSTRAINT chk_phr_citizen_id_trimmed;
    `);
  }
}
