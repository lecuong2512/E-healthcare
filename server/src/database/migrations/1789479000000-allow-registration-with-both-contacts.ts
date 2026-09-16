import { MigrationInterface, QueryRunner } from "typeorm";

export class AllowRegistrationWithBothContacts1789479000000
  implements MigrationInterface
{
  readonly name = "AllowRegistrationWithBothContacts1789479000000";

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE registration_sessions
        DROP CONSTRAINT chk_registration_single_contact;
      ALTER TABLE registration_sessions
        ADD CONSTRAINT chk_registration_at_least_one_contact CHECK (
          email IS NOT NULL OR phone_number IS NOT NULL
        );
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE registration_sessions
        DROP CONSTRAINT chk_registration_at_least_one_contact;
      ALTER TABLE registration_sessions
        ADD CONSTRAINT chk_registration_single_contact CHECK (
          (email IS NOT NULL)::int + (phone_number IS NOT NULL)::int = 1
        );
    `);
  }
}
