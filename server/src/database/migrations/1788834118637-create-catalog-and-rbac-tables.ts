import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateCatalogAndRbacTables1788834118637
  implements MigrationInterface
{
  public readonly name = 'CreateCatalogAndRbacTables1788834118637';
  public readonly transaction = true;

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TYPE user_gender_enum AS ENUM ('MALE', 'FEMALE', 'OTHER');
      CREATE TYPE user_status_enum AS ENUM ('ACTIVE','BLOCKED','PENDING_VERIFY');
      
      CREATE TYPE user_role_enum AS ENUM (
        'ROLE_PATIENT',
        'ROLE_DOCTOR',
        'ROLE_RECEPTIONIST',
        'ROLE_ADMIN'
      );

      CREATE OR REPLACE FUNCTION update_updated_at_column()
      RETURNS TRIGGER AS $$
      BEGIN
        NEW.updated_at = CURRENT_TIMESTAMP;
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;

      CREATE TABLE users (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        phone_number VARCHAR(15),
        email VARCHAR(100),
        password_hash VARCHAR(255),
        full_name VARCHAR(100) NOT NULL,
        gender user_gender_enum NOT NULL,
        date_of_birth DATE NOT NULL,
        status user_status_enum NOT NULL DEFAULT 'PENDING_VERIFY',
        created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT chk_users_phone_number_not_blank CHECK (
          phone_number IS NULL OR phone_number ~ '[^[:space:]]'
        ),
        CONSTRAINT chk_users_email_not_blank CHECK (
          email IS NULL OR email ~ '[^[:space:]]'
        ),
        CONSTRAINT chk_users_login_identifier CHECK (
          phone_number IS NOT NULL OR email IS NOT NULL
        )
      );

      CREATE UNIQUE INDEX idx_users_phone_number
        ON users USING BTREE (phone_number)
        WHERE phone_number IS NOT NULL;
      CREATE INDEX idx_users_email
        ON users USING BTREE (email)
        WHERE email IS NOT NULL;
      CREATE UNIQUE INDEX uq_users_email_normalized
        ON users USING BTREE (LOWER(email))
        WHERE email IS NOT NULL;
      CREATE INDEX idx_users_status ON users USING BTREE (status);

      CREATE TRIGGER trg_users_updated_at
        BEFORE UPDATE ON users
        FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

      CREATE TABLE user_roles (
        user_id UUID NOT NULL,
        role user_role_enum NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT pk_user_roles PRIMARY KEY (user_id, role),
        CONSTRAINT fk_user_roles_user FOREIGN KEY (user_id)
          REFERENCES users(id) ON DELETE CASCADE ON UPDATE CASCADE
      );

      CREATE INDEX idx_user_roles_role ON user_roles USING BTREE (role);

      CREATE TABLE specialties (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name VARCHAR(100) NOT NULL,
        description TEXT,
        icon_url VARCHAR(500),
        is_active BOOLEAN NOT NULL DEFAULT TRUE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      CREATE UNIQUE INDEX idx_specialties_name
        ON specialties USING BTREE (LOWER(name));

      CREATE TRIGGER trg_specialties_updated_at
        BEFORE UPDATE ON specialties
        FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

      CREATE TABLE doctors (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL,
        specialty_id UUID NOT NULL,
        license_number VARCHAR(50) NOT NULL,
        academic_title VARCHAR(50),
        consultation_fee NUMERIC(12, 2) NOT NULL,
        bio_description TEXT,
        room_number VARCHAR(20) NOT NULL,
        rating_average NUMERIC(3, 2) NOT NULL DEFAULT 5.00,
        created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT fk_doctors_user FOREIGN KEY (user_id)
          REFERENCES users(id) ON DELETE RESTRICT ON UPDATE CASCADE,
        CONSTRAINT fk_doctors_specialty FOREIGN KEY (specialty_id)
          REFERENCES specialties(id) ON DELETE RESTRICT ON UPDATE CASCADE,
        CONSTRAINT chk_doctors_consultation_fee CHECK (consultation_fee >= 0),
        CONSTRAINT chk_doctors_rating_average CHECK (
          rating_average BETWEEN 1.00 AND 5.00
        )
      );

      CREATE UNIQUE INDEX idx_doctors_user_id
        ON doctors USING BTREE (user_id);
      CREATE INDEX idx_doctors_specialty_id
        ON doctors USING BTREE (specialty_id);
      CREATE UNIQUE INDEX idx_doctors_license_number
        ON doctors USING BTREE (license_number);

      CREATE TRIGGER trg_doctors_updated_at
        BEFORE UPDATE ON doctors
        FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

      COMMENT ON TABLE users IS 'Tài khoản người dùng nền tảng';
      COMMENT ON COLUMN users.status IS 'ACTIVE, BLOCKED hoặc PENDING_VERIFY';
      COMMENT ON TABLE user_roles IS 'Vai trò RBAC được gán cho người dùng';
      COMMENT ON COLUMN user_roles.role IS 'Một trong bốn vai trò hệ thống';
      COMMENT ON TABLE specialties IS 'Danh mục chuyên khoa y tế';
      COMMENT ON TABLE doctors IS 'Hồ sơ nghiệp vụ của bác sĩ';
      COMMENT ON COLUMN doctors.license_number IS 'Số chứng chỉ hành nghề';
      COMMENT ON COLUMN doctors.consultation_fee IS 'Phí khám niêm yết bằng VND';
      COMMENT ON COLUMN doctors.rating_average IS 'Điểm đánh giá từ 1.00 đến 5.00';
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP TABLE IF EXISTS doctors;
      DROP TABLE IF EXISTS specialties;
      DROP TABLE IF EXISTS user_roles;
      DROP TABLE IF EXISTS users;
      DROP FUNCTION IF EXISTS update_updated_at_column();
      DROP TYPE IF EXISTS user_role_enum;
      DROP TYPE IF EXISTS user_status_enum;
      DROP TYPE IF EXISTS user_gender_enum;
    `);
  }
}
