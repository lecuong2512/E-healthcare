import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { PrescriptionEntity } from './prescription.entity';

@Entity('prescription_items')
@Index('idx_prescription_items_prescription_id', ['prescriptionId'])
@Index('idx_prescription_items_medicine_name', ['medicineName'])
@Index('idx_prescription_items_active_ingredient', ['activeIngredient'])
export class PrescriptionItemEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'prescription_id', type: 'uuid' })
  prescriptionId!: string;

  @ManyToOne(
    () => PrescriptionEntity,
    (prescription) => prescription.items,
    {
      onDelete: 'CASCADE',
    },
  )
  @JoinColumn({ name: 'prescription_id' })
  prescription!: PrescriptionEntity;

  @Column({ name: 'medicine_name', type: 'varchar', length: 255 })
  medicineName!: string;

  @Column({
    name: 'active_ingredient',
    type: 'varchar',
    length: 255,
    nullable: true,
  })
  activeIngredient!: string | null;

  @Column({
    name: 'dosage_morning',
    type: 'varchar',
    length: 100,
    nullable: true,
  })
  dosageMorning!: string | null;

  @Column({
    name: 'dosage_noon',
    type: 'varchar',
    length: 100,
    nullable: true,
  })
  dosageNoon!: string | null;

  @Column({
    name: 'dosage_afternoon',
    type: 'varchar',
    length: 100,
    nullable: true,
  })
  dosageAfternoon!: string | null;

  @Column({
    name: 'dosage_night',
    type: 'varchar',
    length: 100,
    nullable: true,
  })
  dosageNight!: string | null;

  @Column({
    name: 'total_quantity',
    type: 'numeric',
    precision: 12,
    scale: 2,
  })
  totalQuantity!: number;

  @Column({ name: 'unit', type: 'varchar', length: 50 })
  unit!: string;

  @Column({
    name: 'usage_instructions',
    type: 'text',
    nullable: true,
  })
  usageInstructions!: string | null;
}