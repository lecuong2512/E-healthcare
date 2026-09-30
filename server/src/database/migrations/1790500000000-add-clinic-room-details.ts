import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddClinicRoomDetails1790500000000 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('ALTER TABLE clinic_rooms ADD COLUMN specialty_id UUID NULL');
    await queryRunner.query('ALTER TABLE clinic_rooms ADD COLUMN room_type VARCHAR(30) NULL');
    await queryRunner.query('ALTER TABLE clinic_rooms ADD COLUMN location VARCHAR(100) NULL');
    await queryRunner.query('ALTER TABLE clinic_rooms ADD COLUMN notes TEXT NULL');
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('ALTER TABLE clinic_rooms DROP COLUMN notes');
    await queryRunner.query('ALTER TABLE clinic_rooms DROP COLUMN location');
    await queryRunner.query('ALTER TABLE clinic_rooms DROP COLUMN room_type');
    await queryRunner.query('ALTER TABLE clinic_rooms DROP COLUMN specialty_id');
  }
}
