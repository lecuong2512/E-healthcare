import { QueryRunner } from 'typeorm';
import { AddTransactionRefunds1790766000000 } from '../src/database/migrations/1790766000000-add-transaction-refunds';

describe('AddTransactionRefunds1790766000000', () => {
  const migration = new AddTransactionRefunds1790766000000();

  it('fails before changing the schema when an appointment has multiple refunds', async () => {
    const query = jest.fn().mockResolvedValue([{ appointment_id: 'appointment-id' }]);

    await expect(migration.down({ query } as unknown as QueryRunner)).rejects.toThrow(
      'Migration cannot be safely reverted after multiple refunds per appointment exist.',
    );
    expect(query).toHaveBeenCalledTimes(1);
    expect(query.mock.calls[0][0]).toContain('HAVING COUNT(*) > 1');
  });

  it('reverts the schema only when the legacy uniqueness constraint is safe', async () => {
    const query = jest.fn().mockResolvedValueOnce([]).mockResolvedValue(undefined);

    await migration.down({ query } as unknown as QueryRunner);

    expect(query).toHaveBeenCalledTimes(5);
    expect(query.mock.calls[4][0]).toContain(
      'ADD CONSTRAINT refund_requests_appointment_id_key UNIQUE (appointment_id)',
    );
  });
});
