import { MigrationInterface, QueryRunner } from 'typeorm';

export class AllowSharedPatientPhone1789934400000 implements MigrationInterface {
  public readonly name = 'AllowSharedPatientPhone1789934400000';
  public readonly transaction = true;

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP INDEX idx_users_phone_number;
      CREATE INDEX idx_users_phone_number
        ON users USING BTREE (phone_number)
        WHERE phone_number IS NOT NULL;
      CREATE UNIQUE INDEX uq_users_login_phone_number
        ON users USING BTREE (phone_number)
        WHERE phone_number IS NOT NULL AND password_hash IS NOT NULL;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP INDEX uq_users_login_phone_number;
      DROP INDEX idx_users_phone_number;
      CREATE UNIQUE INDEX idx_users_phone_number
        ON users USING BTREE (phone_number)
        WHERE phone_number IS NOT NULL;
    `);
  }
}
