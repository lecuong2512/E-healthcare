import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddAdminCatalogStaffReporting1790240000000 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE TABLE medicines (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), code VARCHAR(32) NOT NULL UNIQUE, brand_name VARCHAR(255) NOT NULL, active_ingredient VARCHAR(255) NOT NULL, strength VARCHAR(100) NOT NULL, package_unit VARCHAR(100) NOT NULL, contraindications TEXT, reference_price INTEGER NOT NULL CHECK (reference_price >= 0), is_active BOOLEAN NOT NULL DEFAULT TRUE, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`);
    await queryRunner.query(`CREATE TABLE medical_services (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), code VARCHAR(32) NOT NULL UNIQUE, name VARCHAR(255) NOT NULL, listed_price INTEGER NOT NULL CHECK (listed_price >= 0), duration_minutes INTEGER NOT NULL CHECK (duration_minutes > 0), description TEXT, is_active BOOLEAN NOT NULL DEFAULT TRUE, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`);
    await queryRunner.query(`CREATE TABLE icd10_catalogs (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), code VARCHAR(16) NOT NULL UNIQUE, name VARCHAR(500) NOT NULL, category VARCHAR(500), is_active BOOLEAN NOT NULL DEFAULT TRUE, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`);
  }
  async down(queryRunner: QueryRunner): Promise<void> { await queryRunner.query('DROP TABLE IF EXISTS icd10_catalogs'); await queryRunner.query('DROP TABLE IF EXISTS medical_services'); await queryRunner.query('DROP TABLE IF EXISTS medicines'); }
}
