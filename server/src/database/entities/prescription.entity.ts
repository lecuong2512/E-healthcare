import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  OneToMany,
  OneToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { MedicalRecordEntity } from './medical-record.entity';
import { PrescriptionItemEntity } from './prescription-item.entity';

@Entity('prescriptions')
@Index('idx_prescriptions_medical_record_id', ['medicalRecordId'])
@Index('idx_prescriptions_created_at', ['createdAt'])
export class PrescriptionEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'medical_record_id', type: 'uuid', unique: true })
  medicalRecordId!: string;

  @OneToOne(() => MedicalRecordEntity)
  @JoinColumn({ name: 'medical_record_id' })
  medicalRecord!: MedicalRecordEntity;

  @Column({ name: 'prescription_code', type: 'varchar', length: 30, unique: true })
  prescriptionCode!: string;

  @CreateDateColumn({
    name: 'created_at',
    type: 'timestamptz',
  })
  createdAt!: Date;

  @OneToMany(
    () => PrescriptionItemEntity,
    (prescriptionItem) => prescriptionItem.prescription,
  )
  items!: PrescriptionItemEntity[];
}