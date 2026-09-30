import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateStaffShiftAssignments1790600000000 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE TABLE staff_shift_assignments (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE, room_id UUID NOT NULL REFERENCES clinic_rooms(id) ON DELETE RESTRICT, shift_date DATE NOT NULL, start_time TIME NOT NULL, end_time TIME NOT NULL, approval_status VARCHAR(20) NOT NULL DEFAULT 'PENDING' CHECK (approval_status IN ('PENDING','APPROVED','LOCKED')), notes TEXT, approved_by UUID REFERENCES users(id) ON DELETE SET NULL, approved_at TIMESTAMPTZ, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), CHECK (end_time > start_time))`);
    await queryRunner.query(`CREATE INDEX staff_shift_assignments_date_idx ON staff_shift_assignments (shift_date)`);
    await queryRunner.query(`INSERT INTO staff_shift_assignments (user_id, room_id, shift_date, start_time, end_time, approval_status, notes) SELECT d.user_id, r.id, v.shift_date, v.start_time, v.end_time, 'PENDING', v.notes FROM (SELECT d.user_id, d.room_number, ROW_NUMBER() OVER (ORDER BY d.created_at) AS rn FROM doctors d WHERE COALESCE(TRIM(d.room_number), '') <> '') d JOIN clinic_rooms r ON r.room_number = d.room_number JOIN (VALUES (1, DATE '2026-10-01', TIME '08:00', TIME '12:00', 'Ca sáng chờ duyệt'), (2, DATE '2026-10-02', TIME '13:00', TIME '17:00', 'Ca chiều chờ duyệt'), (3, DATE '2026-10-03', TIME '08:00', TIME '12:00', 'Ca sáng chờ duyệt')) AS v(rn, shift_date, start_time, end_time, notes) ON v.rn = d.rn ON CONFLICT DO NOTHING`);
  }
  async down(queryRunner: QueryRunner): Promise<void> { await queryRunner.query('DROP TABLE staff_shift_assignments'); }
}
