import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { UserEntity } from './user.entity';
import { DoctorEntity } from './doctor.entity';
import { DoctorScheduleEntity } from './doctor-schedule.entity';
import { AppointmentStatus, PaymentStatus, PaymentMethod } from '@shared/enums';

@Entity('appointments')
export class AppointmentEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'appointment_code', type: 'varchar', length: 20 })
  appointmentCode!: string;

  @Column({ name: 'patient_id', type: 'uuid' })
  patientId!: string;

  @ManyToOne(() => UserEntity)
  @JoinColumn({ name: 'patient_id' })
  patient!: UserEntity;

  @Column({ name: 'doctor_id', type: 'uuid' })
  doctorId!: string;

  @ManyToOne(() => DoctorEntity)
  @JoinColumn({ name: 'doctor_id' })
  doctor!: DoctorEntity;

  @Column({ name: 'schedule_id', type: 'uuid' })
  scheduleId!: string;

  @ManyToOne(() => DoctorScheduleEntity)
  @JoinColumn({ name: 'schedule_id' })
  schedule!: DoctorScheduleEntity;

  @Column({ type: 'varchar', length: 25 })
  status!: AppointmentStatus;

  @Column({ name: 'reason_for_visit', type: 'text' })
  reasonForVisit!: string;

  @Column({ name: 'payment_status', type: 'varchar', length: 20 })
  paymentStatus!: PaymentStatus;

  @Column({ name: 'payment_method', type: 'varchar', length: 20 })
  paymentMethod!: PaymentMethod;

  @Column({ name: 'total_amount', type: 'numeric', precision: 12, scale: 2 })
  totalAmount!: number;

  @Column({ name: 'checked_in_at', type: 'timestamptz', nullable: true })
  checkedInAt!: Date | null;

  @Column({ name: 'completed_at', type: 'timestamptz', nullable: true })
  completedAt!: Date | null;
}
