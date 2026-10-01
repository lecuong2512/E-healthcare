import { Injectable } from '@nestjs/common';
import { EntityManager } from 'typeorm';

@Injectable()
export class QueueNumberService {
  async allocate(
    manager: EntityManager,
    doctorId: string,
    queueDate: string,
  ): Promise<number> {
    const rows = (await manager.query(
      `INSERT INTO doctor_queue_counters (doctor_id, queue_date, last_number)
       VALUES ($1, $2, 1)
       ON CONFLICT (doctor_id, queue_date)
       DO UPDATE SET last_number = doctor_queue_counters.last_number + 1
       RETURNING last_number`,
      [doctorId, queueDate],
    )) as Array<{ last_number: number }>;
    return rows[0].last_number;
  }
}
