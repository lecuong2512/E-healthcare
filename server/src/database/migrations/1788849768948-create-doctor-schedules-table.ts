import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateDoctorSchedulesTable1788849768948
  implements MigrationInterface
{
  public readonly name = 'CreateDoctorSchedulesTable1788849768948';
  public readonly transaction = true;

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE doctor_schedules (
        id UUID NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
        doctor_id UUID NOT NULL,
        date DATE NOT NULL,
        start_time TIME NOT NULL,
        end_time TIME NOT NULL,
        status VARCHAR(20) NOT NULL,
        version INTEGER NOT NULL DEFAULT 0,
        CONSTRAINT fk_doctor_schedules_doctor FOREIGN KEY (doctor_id)
          REFERENCES doctors(id) ON DELETE RESTRICT ON UPDATE CASCADE,
        CONSTRAINT chk_doctor_schedules_time_range CHECK (
          end_time > start_time
        ),
        CONSTRAINT chk_doctor_schedules_status CHECK (
          status IN ('AVAILABLE', 'HOLDING', 'BOOKED', 'OFF')
        ),
        CONSTRAINT chk_doctor_schedules_version CHECK (version >= 0)
      );

      CREATE INDEX idx_doctor_schedules_doctor_id
        ON doctor_schedules USING BTREE (doctor_id);
      CREATE INDEX idx_doctor_schedules_date
        ON doctor_schedules USING BTREE (date);
      CREATE INDEX idx_doctor_schedules_status
        ON doctor_schedules USING BTREE (status);

      COMMENT ON TABLE doctor_schedules IS 'Khung giờ khám của bác sĩ';
      COMMENT ON COLUMN doctor_schedules.doctor_id IS 'Bác sĩ phụ trách';
      COMMENT ON COLUMN doctor_schedules.date IS 'Ngày khám';
      COMMENT ON COLUMN doctor_schedules.start_time IS 'Giờ bắt đầu khung khám';
      COMMENT ON COLUMN doctor_schedules.end_time IS 'Giờ kết thúc khung khám';
      COMMENT ON COLUMN doctor_schedules.status IS
        'AVAILABLE, HOLDING, BOOKED hoặc OFF';
      COMMENT ON COLUMN doctor_schedules.version IS
        'Phiên bản phục vụ optimistic locking';
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP TABLE IF EXISTS doctor_schedules;
    `);
  }
}
