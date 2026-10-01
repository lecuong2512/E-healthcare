import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateAppointmentsTable1788851428977
  implements MigrationInterface
{
  public readonly name = 'CreateAppointmentsTable1788851428977';
  public readonly transaction = true;

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE appointments (
        id UUID NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
        appointment_code VARCHAR(20) NOT NULL,
        patient_id UUID NOT NULL,
        doctor_id UUID NOT NULL,
        schedule_id UUID NOT NULL,
        status VARCHAR(25) NOT NULL,
        reason_for_visit TEXT NOT NULL,
        payment_status VARCHAR(20) NOT NULL,
        payment_method VARCHAR(20) NOT NULL,
        total_amount NUMERIC(12, 2) NOT NULL,
        checked_in_at TIMESTAMPTZ,
        CONSTRAINT fk_appointments_patient FOREIGN KEY (patient_id)
          REFERENCES users(id) ON DELETE RESTRICT ON UPDATE CASCADE,
        CONSTRAINT fk_appointments_doctor FOREIGN KEY (doctor_id)
          REFERENCES doctors(id) ON DELETE RESTRICT ON UPDATE CASCADE,
        CONSTRAINT fk_appointments_schedule FOREIGN KEY (schedule_id)
          REFERENCES doctor_schedules(id) ON DELETE RESTRICT ON UPDATE CASCADE,
        CONSTRAINT chk_appointments_status CHECK (
          status IN (
            'PENDING_PAYMENT',
            'CONFIRMED',
            'CHECKED_IN',
            'IN_CONSULTATION',
            'COMPLETED',
            'CANCELLED'
          )
        ),
        CONSTRAINT chk_appointments_payment_status CHECK (
          payment_status IN ('UNPAID', 'PAID', 'REFUNDED')
        ),
        CONSTRAINT chk_appointments_payment_method CHECK (
          payment_method IN ('VNPAY', 'MOMO', 'PAY_AT_CLINIC')
        ),
        CONSTRAINT chk_appointments_total_amount CHECK (total_amount >= 0)
      );

      CREATE UNIQUE INDEX idx_appointments_appointment_code
        ON appointments USING BTREE (appointment_code);
      CREATE INDEX idx_appointments_patient_id
        ON appointments USING BTREE (patient_id);
      CREATE INDEX idx_appointments_doctor_id
        ON appointments USING BTREE (doctor_id);
      CREATE INDEX idx_appointments_schedule_id
        ON appointments USING BTREE (schedule_id);
      CREATE INDEX idx_appointments_status
        ON appointments USING BTREE (status);

      COMMENT ON TABLE appointments IS 'Lịch hẹn khám của bệnh nhân';
      COMMENT ON COLUMN appointments.appointment_code IS
        'Mã lịch hẹn hiển thị cho bệnh nhân';
      COMMENT ON COLUMN appointments.patient_id IS 'Người đặt khám';
      COMMENT ON COLUMN appointments.doctor_id IS 'Bác sĩ phụ trách';
      COMMENT ON COLUMN appointments.schedule_id IS 'Khung giờ khám tương ứng';
      COMMENT ON COLUMN appointments.status IS 'Trạng thái lịch hẹn khám';
      COMMENT ON COLUMN appointments.reason_for_visit IS
        'Triệu chứng hoặc lý do khám';
      COMMENT ON COLUMN appointments.payment_status IS 'Trạng thái thanh toán';
      COMMENT ON COLUMN appointments.payment_method IS 'Phương thức thanh toán';
      COMMENT ON COLUMN appointments.total_amount IS
        'Tổng chi phí thanh toán bằng VND';
      COMMENT ON COLUMN appointments.checked_in_at IS
        'Thời điểm lễ tân check-in';
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP TABLE IF EXISTS appointments;
    `);
  }
}
