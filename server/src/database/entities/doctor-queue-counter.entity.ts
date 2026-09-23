import { Column, Entity, JoinColumn, ManyToOne, PrimaryColumn } from 'typeorm';
import { DoctorEntity } from './doctor.entity';

@Entity('doctor_queue_counters')
export class DoctorQueueCounterEntity {
  @PrimaryColumn({ name: 'doctor_id', type: 'uuid' })
  doctorId!: string;

  @ManyToOne(() => DoctorEntity, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'doctor_id' })
  doctor!: DoctorEntity;

  @PrimaryColumn({ name: 'queue_date', type: 'date' })
  queueDate!: string;

  @Column({ name: 'last_number', type: 'integer', default: 0 })
  lastNumber!: number;
}
