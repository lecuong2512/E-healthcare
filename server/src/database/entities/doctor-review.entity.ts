import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { AppointmentEntity } from './appointment.entity';
import { DoctorEntity } from './doctor.entity';
import { UserEntity } from './user.entity';

@Entity('doctor_reviews')
@Check('chk_doctor_reviews_rating', 'rating BETWEEN 1 AND 5')
@Check(
  'chk_doctor_reviews_comment_length',
  'comment IS NULL OR char_length(comment) <= 500',
)
@Index('idx_doctor_reviews_doctor_created', ['doctorId', 'createdAt'])
@Index('idx_doctor_reviews_patient_id', ['patientId'])
export class DoctorReviewEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'appointment_id', type: 'uuid', unique: true })
  appointmentId!: string;

  @OneToOne(() => AppointmentEntity, (appointment) => appointment.review, {
    onDelete: 'RESTRICT',
    onUpdate: 'CASCADE',
  })
  @JoinColumn({ name: 'appointment_id' })
  appointment!: AppointmentEntity;

  @Column({ name: 'doctor_id', type: 'uuid' })
  doctorId!: string;

  @ManyToOne(() => DoctorEntity, {
    onDelete: 'RESTRICT',
    onUpdate: 'CASCADE',
  })
  @JoinColumn({ name: 'doctor_id' })
  doctor!: DoctorEntity;

  @Column({ name: 'patient_id', type: 'uuid' })
  patientId!: string;

  @ManyToOne(() => UserEntity, {
    onDelete: 'RESTRICT',
    onUpdate: 'CASCADE',
  })
  @JoinColumn({ name: 'patient_id' })
  patient!: UserEntity;

  @Column({ type: 'smallint' })
  rating!: number;

  @Column({ type: 'varchar', length: 500, nullable: true })
  comment!: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}
