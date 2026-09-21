import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddReceptionQueueAndCounterPayment1789923600000
  implements MigrationInterface
{
  public readonly name = 'AddReceptionQueueAndCounterPayment1789923600000';
  public readonly transaction = true;

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE doctor_queue_counters (
        doctor_id UUID NOT NULL REFERENCES doctors(id) ON DELETE RESTRICT,
        queue_date DATE NOT NULL,
        last_number INTEGER NOT NULL DEFAULT 0,
        CONSTRAINT pk_doctor_queue_counters PRIMARY KEY (doctor_id, queue_date),
        CONSTRAINT chk_doctor_queue_counters_last_number CHECK (last_number >= 0)
      );

      CREATE INDEX idx_doctor_queue_counters_date
        ON doctor_queue_counters USING BTREE (queue_date);

      ALTER TABLE appointments
        ADD COLUMN queue_number INTEGER,
        ADD COLUMN queue_date DATE,
        ADD COLUMN queue_source VARCHAR(20),
        ADD COLUMN paid_at TIMESTAMPTZ,
        ADD COLUMN collected_by UUID,
        ADD CONSTRAINT fk_appointments_collected_by
          FOREIGN KEY (collected_by) REFERENCES users(id) ON DELETE RESTRICT,
        ADD CONSTRAINT chk_appointments_queue_number
          CHECK (queue_number IS NULL OR queue_number > 0),
        ADD CONSTRAINT chk_appointments_queue_source
          CHECK (queue_source IS NULL OR queue_source IN ('APPOINTMENT', 'WALK_IN')),
        ADD CONSTRAINT chk_appointments_queue_fields
          CHECK (
            (queue_number IS NULL AND queue_date IS NULL AND queue_source IS NULL)
            OR
            (queue_number IS NOT NULL AND queue_date IS NOT NULL AND queue_source IS NOT NULL)
          );

      CREATE UNIQUE INDEX idx_appointments_active_schedule
        ON appointments USING BTREE (schedule_id)
        WHERE status IN (
          'PENDING_PAYMENT', 'CONFIRMED', 'CHECKED_IN', 'IN_CONSULTATION'
        );

      CREATE UNIQUE INDEX idx_appointments_doctor_queue_number
        ON appointments USING BTREE (doctor_id, queue_date, queue_number)
        WHERE queue_number IS NOT NULL;

      CREATE INDEX idx_appointments_queue_date_status
        ON appointments USING BTREE (queue_date, status)
        WHERE queue_date IS NOT NULL;

      CREATE INDEX idx_appointments_collected_by
        ON appointments USING BTREE (collected_by)
        WHERE collected_by IS NOT NULL;

      CREATE TABLE counter_payment_transactions (
        id UUID NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
        appointment_id UUID NOT NULL,
        transaction_code VARCHAR(40) NOT NULL,
        receipt_code VARCHAR(40) NOT NULL,
        amount NUMERIC(12, 2) NOT NULL,
        amount_tendered NUMERIC(12, 2) NOT NULL,
        change_amount NUMERIC(12, 2) NOT NULL,
        method VARCHAR(20) NOT NULL,
        status VARCHAR(20) NOT NULL,
        collected_by UUID NOT NULL,
        appointment_code VARCHAR(20) NOT NULL,
        patient_name VARCHAR(100) NOT NULL,
        doctor_name VARCHAR(100) NOT NULL,
        collector_name VARCHAR(100) NOT NULL,
        paid_at TIMESTAMPTZ NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT fk_counter_payment_appointment
          FOREIGN KEY (appointment_id) REFERENCES appointments(id) ON DELETE RESTRICT,
        CONSTRAINT fk_counter_payment_collector
          FOREIGN KEY (collected_by) REFERENCES users(id) ON DELETE RESTRICT,
        CONSTRAINT chk_counter_payment_amount
          CHECK (amount >= 0 AND amount_tendered >= amount
            AND change_amount = amount_tendered - amount),
        CONSTRAINT chk_counter_payment_method CHECK (method IN ('CASH')),
        CONSTRAINT chk_counter_payment_status
          CHECK (status IN ('SUCCESS', 'VOIDED', 'REFUNDED'))
      );

      CREATE UNIQUE INDEX idx_counter_payment_transaction_code
        ON counter_payment_transactions USING BTREE (transaction_code);
      CREATE UNIQUE INDEX idx_counter_payment_receipt_code
        ON counter_payment_transactions USING BTREE (receipt_code);
      CREATE UNIQUE INDEX idx_counter_payment_appointment_success
        ON counter_payment_transactions USING BTREE (appointment_id)
        WHERE status = 'SUCCESS';
      CREATE INDEX idx_counter_payment_appointment_id
        ON counter_payment_transactions USING BTREE (appointment_id);
      CREATE INDEX idx_counter_payment_collected_by
        ON counter_payment_transactions USING BTREE (collected_by);
      CREATE INDEX idx_counter_payment_paid_at
        ON counter_payment_transactions USING BTREE (paid_at);
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP TABLE counter_payment_transactions;
      DROP INDEX idx_appointments_collected_by;
      DROP INDEX idx_appointments_queue_date_status;
      DROP INDEX idx_appointments_doctor_queue_number;
      DROP INDEX idx_appointments_active_schedule;
      ALTER TABLE appointments
        DROP COLUMN collected_by,
        DROP COLUMN paid_at,
        DROP COLUMN queue_source,
        DROP COLUMN queue_date,
        DROP COLUMN queue_number;
      DROP TABLE doctor_queue_counters;
    `);
  }
}
