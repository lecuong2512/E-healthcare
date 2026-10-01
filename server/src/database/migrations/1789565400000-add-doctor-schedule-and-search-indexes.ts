import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddDoctorScheduleAndSearchIndexes1789565400000
  implements MigrationInterface
{
  public readonly name = 'AddDoctorScheduleAndSearchIndexes1789565400000';
  public readonly transaction = true;

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE EXTENSION IF NOT EXISTS btree_gist;
      CREATE EXTENSION IF NOT EXISTS pg_trgm;

      ALTER TABLE doctor_schedules
        ADD CONSTRAINT ex_doctor_schedules_no_overlap
        EXCLUDE USING GIST (
          doctor_id WITH =,
          tsrange(date + start_time, date + end_time, '[)') WITH &&
        );

      CREATE INDEX idx_doctor_schedules_doctor_date_status
        ON doctor_schedules USING BTREE (doctor_id, date, status);

      CREATE INDEX idx_users_full_name_trgm
        ON users USING GIN (LOWER(full_name) gin_trgm_ops);
      CREATE INDEX idx_doctors_academic_title_trgm
        ON doctors USING GIN (LOWER(COALESCE(academic_title, '')) gin_trgm_ops);
      CREATE INDEX idx_doctors_bio_description_trgm
        ON doctors USING GIN (LOWER(COALESCE(bio_description, '')) gin_trgm_ops);
      CREATE INDEX idx_doctors_room_number_trgm
        ON doctors USING GIN (LOWER(room_number) gin_trgm_ops);
      CREATE INDEX idx_doctors_consultation_fee
        ON doctors USING BTREE (consultation_fee);
      CREATE INDEX idx_doctors_rating_average
        ON doctors USING BTREE (rating_average);
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP INDEX IF EXISTS idx_doctors_rating_average;
      DROP INDEX IF EXISTS idx_doctors_consultation_fee;
      DROP INDEX IF EXISTS idx_doctors_room_number_trgm;
      DROP INDEX IF EXISTS idx_doctors_bio_description_trgm;
      DROP INDEX IF EXISTS idx_doctors_academic_title_trgm;
      DROP INDEX IF EXISTS idx_users_full_name_trgm;
      DROP INDEX IF EXISTS idx_doctor_schedules_doctor_date_status;
      ALTER TABLE doctor_schedules
        DROP CONSTRAINT IF EXISTS ex_doctor_schedules_no_overlap;
    `);
  }
}
