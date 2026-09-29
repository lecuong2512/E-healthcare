import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddRefundResolutionAudit1790776800000
  implements MigrationInterface
{
  name = 'AddRefundResolutionAudit1790776800000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE refund_requests
      ADD COLUMN provider_refund_id VARCHAR(100) NULL,
      ADD COLUMN processed_by UUID NULL REFERENCES users(id) ON DELETE SET NULL
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE refund_requests
      DROP COLUMN processed_by,
      DROP COLUMN provider_refund_id
    `);
  }
}
