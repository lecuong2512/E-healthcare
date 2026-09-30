import { MigrationInterface, QueryRunner } from 'typeorm';

export class BackfillDoctorUserRoles1790730000000
  implements MigrationInterface
{
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      INSERT INTO user_roles (user_id, role)
      SELECT DISTINCT doctors.user_id, 'ROLE_DOCTOR'::user_role_enum
      FROM doctors
      ON CONFLICT (user_id, role) DO NOTHING
    `);
  }

  async down(): Promise<void> {
    // Data repair is intentionally irreversible: removing these roles would
    // make valid doctor accounts disappear from staff management again.
  }
}
