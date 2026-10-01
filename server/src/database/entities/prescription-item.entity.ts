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

  /** Fields below are decrypted in memory only. */
  medicineName!: string;

  activeIngredient!: string | null;

  dosageMorning!: string | null;

  dosageNoon!: string | null;

  dosageAfternoon!: string | null;

  dosageNight!: string | null;

  totalQuantity!: number;

  unit!: string;

  usageInstructions!: string | null;

  @Column({ name: 'payload_ciphertext', type: 'bytea', select: false })
  payloadCiphertext!: Buffer;

  @Column({ name: 'encryption_key_version', type: 'smallint' })
  encryptionKeyVersion!: number;
}
