import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateDoctorReviews1790586000000 implements MigrationInterface {
  readonly name = 'CreateDoctorReviews1790586000000';
  readonly transaction = true;

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE doctor_reviews (
        id UUID NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
        appointment_id UUID NOT NULL,
        doctor_id UUID NOT NULL,
        patient_id UUID NOT NULL,
        rating SMALLINT NOT NULL,
        comment VARCHAR(500),
        created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

        CONSTRAINT uq_doctor_reviews_appointment UNIQUE (appointment_id),
        CONSTRAINT chk_doctor_reviews_rating CHECK (rating BETWEEN 1 AND 5),
        CONSTRAINT chk_doctor_reviews_comment_length
          CHECK (comment IS NULL OR char_length(comment) <= 500),
        CONSTRAINT fk_doctor_reviews_appointment
          FOREIGN KEY (appointment_id) REFERENCES appointments(id)
          ON DELETE RESTRICT ON UPDATE CASCADE,
        CONSTRAINT fk_doctor_reviews_doctor
          FOREIGN KEY (doctor_id) REFERENCES doctors(id)
          ON DELETE RESTRICT ON UPDATE CASCADE,
        CONSTRAINT fk_doctor_reviews_patient
          FOREIGN KEY (patient_id) REFERENCES users(id)
          ON DELETE RESTRICT ON UPDATE CASCADE
      );

      CREATE INDEX idx_doctor_reviews_doctor_created
        ON doctor_reviews USING BTREE (doctor_id, created_at DESC);
      CREATE INDEX idx_doctor_reviews_patient_id
        ON doctor_reviews USING BTREE (patient_id);
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE IF EXISTS doctor_reviews');
  }
}
