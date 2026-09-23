import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddEmrPrescriptionTables1790065218000
  implements MigrationInterface
{
  public readonly name = 'AddEmrPrescriptionTables1790065218000';
  public readonly transaction = true;

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE appointments
        ADD COLUMN completed_at TIMESTAMPTZ;
    `);

    await queryRunner.query(`
      CREATE TABLE medical_records (
        id UUID NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),

        appointment_id UUID NOT NULL,
        patient_id UUID NOT NULL,
        doctor_id UUID NOT NULL,

        vital_signs JSONB NOT NULL,
        clinical_notes TEXT NOT NULL,

        icd10_primary_code VARCHAR(10) NOT NULL,
        icd10_secondary_codes VARCHAR(255),

        doctor_advice TEXT,
        follow_up_date DATE,

        is_locked BOOLEAN NOT NULL DEFAULT FALSE,
        locked_at TIMESTAMPTZ,
        completed_at TIMESTAMPTZ,

        CONSTRAINT uq_medical_records_appointment
          UNIQUE (appointment_id),

        CONSTRAINT fk_medical_records_appointment
          FOREIGN KEY (appointment_id)
          REFERENCES appointments(id)
          ON DELETE RESTRICT
          ON UPDATE CASCADE,

        CONSTRAINT fk_medical_records_patient
          FOREIGN KEY (patient_id)
          REFERENCES users(id)
          ON DELETE RESTRICT
          ON UPDATE CASCADE,

        CONSTRAINT fk_medical_records_doctor
          FOREIGN KEY (doctor_id)
          REFERENCES doctors(id)
          ON DELETE RESTRICT
          ON UPDATE CASCADE
      );

      CREATE INDEX idx_medical_records_patient_id
        ON medical_records USING BTREE (patient_id);

      CREATE INDEX idx_medical_records_doctor_id
        ON medical_records USING BTREE (doctor_id);

      CREATE INDEX idx_medical_records_appointment_id
        ON medical_records USING BTREE (appointment_id);

      CREATE INDEX idx_medical_records_is_locked
        ON medical_records USING BTREE (is_locked);

      CREATE INDEX idx_medical_records_completed_at
        ON medical_records USING BTREE (completed_at);
    `);

    await queryRunner.query(`
      CREATE TABLE prescriptions (
        id UUID NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),

        medical_record_id UUID NOT NULL,
        prescription_code VARCHAR(30) NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

        CONSTRAINT uq_prescriptions_medical_record
          UNIQUE (medical_record_id),

        CONSTRAINT uq_prescriptions_code
          UNIQUE (prescription_code),

        CONSTRAINT fk_prescriptions_medical_record
          FOREIGN KEY (medical_record_id)
          REFERENCES medical_records(id)
          ON DELETE RESTRICT
          ON UPDATE CASCADE
      );

      CREATE INDEX idx_prescriptions_medical_record_id
        ON prescriptions USING BTREE (medical_record_id);

      CREATE INDEX idx_prescriptions_created_at
        ON prescriptions USING BTREE (created_at);
    `);

    await queryRunner.query(`
      CREATE TABLE prescription_items (
        id UUID NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),

        prescription_id UUID NOT NULL,

        medicine_name VARCHAR(255) NOT NULL,
        active_ingredient VARCHAR(255),

        dosage_morning VARCHAR(100),
        dosage_noon VARCHAR(100),
        dosage_afternoon VARCHAR(100),
        dosage_night VARCHAR(100),

        total_quantity NUMERIC(12, 2) NOT NULL,
        unit VARCHAR(50) NOT NULL,

        usage_instructions TEXT,

        CONSTRAINT fk_prescription_items_prescription
          FOREIGN KEY (prescription_id)
          REFERENCES prescriptions(id)
          ON DELETE CASCADE
          ON UPDATE CASCADE,

        CONSTRAINT chk_prescription_items_total_quantity
          CHECK (total_quantity > 0)
      );

      CREATE INDEX idx_prescription_items_prescription_id
        ON prescription_items USING BTREE (prescription_id);

      CREATE INDEX idx_prescription_items_medicine_name
        ON prescription_items USING BTREE (medicine_name);

      CREATE INDEX idx_prescription_items_active_ingredient
        ON prescription_items USING BTREE (active_ingredient);
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP TABLE IF EXISTS prescription_items;
    `);

    await queryRunner.query(`
      DROP TABLE IF EXISTS prescriptions;
    `);

    await queryRunner.query(`
      DROP TABLE IF EXISTS medical_records;
    `);

    await queryRunner.query(`
      ALTER TABLE appointments
        DROP COLUMN IF EXISTS completed_at;
    `);
  }
}