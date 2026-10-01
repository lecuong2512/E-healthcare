import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateEmrAddendumsTable1790150000000
  implements MigrationInterface
{
  public readonly name = 'CreateEmrAddendumsTable1790150000000';
  public readonly transaction = true;

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE emr_addendums (
        id UUID NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),

        medical_record_id UUID NOT NULL,
        doctor_id UUID NOT NULL,

        reason TEXT NOT NULL,
        previous_content JSONB NOT NULL,
        updated_content JSONB NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

        CONSTRAINT fk_emr_addendums_medical_record
          FOREIGN KEY (medical_record_id)
          REFERENCES medical_records(id)
          ON DELETE RESTRICT
          ON UPDATE CASCADE,

        CONSTRAINT fk_emr_addendums_doctor
          FOREIGN KEY (doctor_id)
          REFERENCES doctors(id)
          ON DELETE RESTRICT
          ON UPDATE CASCADE
      );

      CREATE INDEX idx_emr_addendums_medical_record_id
        ON emr_addendums USING BTREE (medical_record_id);

      CREATE INDEX idx_emr_addendums_doctor_id
        ON emr_addendums USING BTREE (doctor_id);

      CREATE INDEX idx_emr_addendums_created_at
        ON emr_addendums USING BTREE (created_at);
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP TABLE IF EXISTS emr_addendums;
    `);
  }
}
