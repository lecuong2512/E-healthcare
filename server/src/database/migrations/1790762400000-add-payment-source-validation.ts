import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddPaymentSourceValidation1790762400000
  implements MigrationInterface
{
  name = 'AddPaymentSourceValidation1790762400000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE payment_transactions
      ADD COLUMN source_validated BOOLEAN NOT NULL DEFAULT FALSE
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE payment_transactions
      DROP COLUMN source_validated
    `);
  }
}
