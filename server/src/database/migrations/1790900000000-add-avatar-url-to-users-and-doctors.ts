import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddAvatarUrlToUsersAndDoctors1790900000000 implements MigrationInterface {
  name = 'AddAvatarUrlToUsersAndDoctors1790900000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_url VARCHAR(500);
      ALTER TABLE doctors ADD COLUMN IF NOT EXISTS avatar_url VARCHAR(500);
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE doctors DROP COLUMN IF EXISTS avatar_url;
      ALTER TABLE users DROP COLUMN IF EXISTS avatar_url;
    `);
  }
}
