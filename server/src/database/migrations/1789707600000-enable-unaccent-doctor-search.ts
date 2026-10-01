import { MigrationInterface, QueryRunner } from "typeorm";

export class EnableUnaccentDoctorSearch1789707600000
  implements MigrationInterface
{
  public readonly name = "EnableUnaccentDoctorSearch1789707600000";
  public readonly transaction = true;

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query("CREATE EXTENSION IF NOT EXISTS unaccent");
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query("DROP EXTENSION IF EXISTS unaccent");
  }
}
