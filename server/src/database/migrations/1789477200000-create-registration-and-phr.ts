import { MigrationInterface, QueryRunner } from "typeorm";

export class CreateRegistrationAndPhr1789477200000
  implements MigrationInterface
{
  public readonly name = "CreateRegistrationAndPhr1789477200000";

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE users ALTER COLUMN phone_number TYPE VARCHAR(16);
      CREATE TABLE registration_sessions (
        id UUID PRIMARY KEY,
        email VARCHAR(100), phone_number VARCHAR(16),
        password_hash VARCHAR(255) NOT NULL,
        full_name VARCHAR(100) NOT NULL,
        gender user_gender_enum NOT NULL,
        date_of_birth DATE NOT NULL,
        otp_hash CHAR(64) NOT NULL,
        expires_at TIMESTAMPTZ NOT NULL,
        sent_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
        failed_attempts SMALLINT NOT NULL DEFAULT 0 CHECK (failed_attempts BETWEEN 0 AND 5),
        locked_until TIMESTAMPTZ,
        CONSTRAINT chk_registration_single_contact CHECK (
          (email IS NOT NULL)::int + (phone_number IS NOT NULL)::int = 1
        )
      );
      CREATE UNIQUE INDEX uq_registration_email ON registration_sessions (LOWER(email))
        WHERE email IS NOT NULL;
      CREATE UNIQUE INDEX uq_registration_phone ON registration_sessions (phone_number)
        WHERE phone_number IS NOT NULL;
      CREATE INDEX idx_registration_expiry ON registration_sessions (expires_at);
      CREATE TABLE personal_health_profiles (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
        blood_type VARCHAR(3), allergies TEXT, medical_history TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
      CREATE TRIGGER trg_phr_updated_at BEFORE UPDATE ON personal_health_profiles
        FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
      COMMENT ON TABLE registration_sessions IS 'OTP đăng ký: chỉ lưu BCrypt và HMAC, không lưu mật khẩu/OTP rõ';
      COMMENT ON TABLE personal_health_profiles IS 'Hồ sơ sức khỏe cá nhân, tự tạo sau xác thực OTP';
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP TABLE personal_health_profiles;
      DROP TABLE registration_sessions;
      ALTER TABLE users ALTER COLUMN phone_number TYPE VARCHAR(15);
    `);
  }
}
