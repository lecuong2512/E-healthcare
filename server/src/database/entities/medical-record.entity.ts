import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  OneToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { AppointmentEntity } from './appointment.entity';
import { DoctorEntity } from './doctor.entity';
import { UserEntity } from './user.entity';
import { EmrAddendumEntity } from './emr-addendum.entity';

@Entity('medical_records')
@Index('idx_medical_records_patient_id', ['patientId'])
@Index('idx_medical_records_doctor_id', ['doctorId'])
@Index('idx_medical_records_appointment_id', ['appointmentId'])
@Index('idx_medical_records_is_locked', ['isLocked'])
@Index('idx_medical_records_completed_at', ['completedAt'])
export class MedicalRecordEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'appointment_id', type: 'uuid', unique: true })
  appointmentId!: string;

  @OneToOne(() => AppointmentEntity)
  @JoinColumn({ name: 'appointment_id' })
  appointment!: AppointmentEntity;

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

  @Column({ name: 'vital_signs', type: 'jsonb' })
  vitalSigns!: Record<string, number>;

  @Column({ name: 'clinical_notes', type: 'text' })
  clinicalNotes!: string;

  @Column({ name: 'icd10_primary_code', type: 'varchar', length: 10 })
  icd10PrimaryCode!: string;

  @Column({
    name: 'icd10_secondary_codes',
    type: 'varchar',
    length: 255,
    nullable: true,
  })
  icd10SecondaryCodes!: string | null;

  @Column({ name: 'doctor_advice', type: 'text', nullable: true })
  doctorAdvice!: string | null;

  @Column({ name: 'follow_up_date', type: 'date', nullable: true })
  followUpDate!: string | null;

  @Column({ name: 'is_locked', type: 'boolean', default: false })
  isLocked!: boolean;

  @Column({ name: 'locked_at', type: 'timestamptz', nullable: true })
  lockedAt!: Date | null;

  @Column({ name: 'completed_at', type: 'timestamptz', nullable: true })
  completedAt!: Date | null;

  @OneToMany(() => EmrAddendumEntity, (addendum) => addendum.medicalRecord)
  addendums?: EmrAddendumEntity[];
}
