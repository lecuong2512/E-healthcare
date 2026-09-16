import { MigrationInterface, QueryRunner } from "typeorm";

export class CreateRegistrationOtpSendLimit1789477800000
  implements MigrationInterface
{
  public readonly name = "CreateRegistrationOtpSendLimit1789477800000";

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE registration_otp_sends (
        id BIGSERIAL PRIMARY KEY,
        phone_number VARCHAR(16) NOT NULL,
        sent_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
      );
      CREATE INDEX idx_registration_otp_sends_phone_time
        ON registration_otp_sends (phone_number, sent_at);
      INSERT INTO registration_otp_sends (phone_number, sent_at)
        SELECT phone_number, sent_at FROM registration_sessions
        WHERE phone_number IS NOT NULL
          AND sent_at > clock_timestamp() - interval '10 minutes';
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query("DROP TABLE registration_otp_sends");
  }
}
