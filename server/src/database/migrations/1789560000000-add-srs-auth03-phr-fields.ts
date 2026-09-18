import { MigrationInterface, QueryRunner } from "typeorm";

export class AddSrsAuth03PhrFields1789560000000
  implements MigrationInterface
{
  public readonly name = "AddSrsAuth03PhrFields1789560000000";

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE personal_health_profiles
        ADD COLUMN citizen_id VARCHAR(20),
        ADD COLUMN address VARCHAR(255),
        ADD COLUMN health_insurance VARCHAR(20),
        ADD COLUMN chronic_diseases TEXT,
        ADD COLUMN surgery_history TEXT;
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE personal_health_profiles
        DROP COLUMN surgery_history,
        DROP COLUMN chronic_diseases,
        DROP COLUMN health_insurance,
        DROP COLUMN address,
        DROP COLUMN citizen_id;
    `);
  }
}