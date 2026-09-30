import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddSpecialtyHeadDoctor1790320000000 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> { await queryRunner.query('ALTER TABLE specialties ADD COLUMN IF NOT EXISTS head_doctor_id UUID REFERENCES doctors(id) ON DELETE SET NULL'); }
  async down(queryRunner: QueryRunner): Promise<void> { await queryRunner.query('ALTER TABLE specialties DROP COLUMN IF EXISTS head_doctor_id'); }
}
