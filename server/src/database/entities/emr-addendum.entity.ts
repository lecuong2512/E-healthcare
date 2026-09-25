import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { EmrClinicalSnapshot } from '@shared/interfaces';
import { MedicalRecordEntity } from './medical-record.entity';
import { DoctorEntity } from './doctor.entity';

@Entity('emr_addendums')
@Index('idx_emr_addendums_medical_record_id', ['medicalRecordId'])
@Index('idx_emr_addendums_doctor_id', ['doctorId'])
@Index('idx_emr_addendums_created_at', ['createdAt'])
export class EmrAddendumEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'medical_record_id', type: 'uuid' })
  medicalRecordId!: string;

  @ManyToOne(() => MedicalRecordEntity, {
    onDelete: 'RESTRICT',
    onUpdate: 'CASCADE',
  })
  @JoinColumn({ name: 'medical_record_id' })
  medicalRecord!: MedicalRecordEntity;

  @Column({ name: 'doctor_id', type: 'uuid' })
  doctorId!: string;

  @ManyToOne(() => DoctorEntity, {
    onDelete: 'RESTRICT',
    onUpdate: 'CASCADE',
  })
  @JoinColumn({ name: 'doctor_id' })
  doctor!: DoctorEntity;

  @Column({ type: 'text' })
  reason!: string;

  @Column({ name: 'previous_content', type: 'jsonb' })
  previousContent!: EmrClinicalSnapshot;

  @Column({ name: 'updated_content', type: 'jsonb' })
  updatedContent!: EmrClinicalSnapshot;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}
