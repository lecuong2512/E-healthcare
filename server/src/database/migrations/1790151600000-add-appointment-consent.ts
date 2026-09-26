import { MigrationInterface, QueryRunner } from "typeorm";

/** Server timestamp proving acceptance of ND13 data-processing terms. */
export class AddAppointmentConsent1790151600000 implements MigrationInterface {
  readonly name = "AddAppointmentConsent1790151600000";

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query("ALTER TABLE appointments ADD COLUMN consent_nd13_accepted_at TIMESTAMPTZ");
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query("ALTER TABLE appointments DROP COLUMN consent_nd13_accepted_at");
  }
}
