import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateClinicRooms1790400000000 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE TABLE clinic_rooms (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), room_number VARCHAR(20) NOT NULL UNIQUE, room_name VARCHAR(100), is_active BOOLEAN NOT NULL DEFAULT TRUE, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`);
    await queryRunner.query(`INSERT INTO clinic_rooms (room_number) SELECT DISTINCT room_number FROM doctors WHERE TRIM(room_number) <> '' ON CONFLICT (room_number) DO NOTHING`);
  }
  async down(queryRunner: QueryRunner): Promise<void> { await queryRunner.query('DROP TABLE clinic_rooms'); }
}
