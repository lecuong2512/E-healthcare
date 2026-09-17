import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  Index,
  JoinColumn,
  ManyToOne,
  OneToOne,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
import { UserEntity } from './user.entity';
import { SpecialtyEntity } from './specialty.entity';

@Entity('doctors')
@Index('idx_doctors_user_id', ['userId'], { unique: true })
export class DoctorEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'user_id', type: 'uuid' })
  userId!: string;

  @OneToOne(() => UserEntity, {
    onDelete: 'RESTRICT',
    onUpdate: 'CASCADE',
  })
  @JoinColumn({ name: 'user_id' })
  user!: UserEntity;

  @Column({ name: 'specialty_id', type: 'uuid' })
  specialtyId!: string;

  @ManyToOne(() => SpecialtyEntity, {
    onDelete: 'RESTRICT',
    onUpdate: 'CASCADE',
  })
  @JoinColumn({ name: 'specialty_id' })
  specialty!: SpecialtyEntity;

  @Column({ name: 'license_number', type: 'varchar', length: 50 })
  licenseNumber!: string;

  @Column({ name: 'academic_title', type: 'varchar', length: 50, nullable: true })
  academicTitle!: string | null;

  @Column({
    name: 'consultation_fee',
    type: 'numeric',
    precision: 12,
    scale: 2,
    transformer: {
      to: (value: number) => value,
      from: (value: string) => Number(value),
    },
  })
  consultationFee!: number;

  @Column({ name: 'bio_description', type: 'text', nullable: true })
  bioDescription!: string | null;

  @Column({ name: 'room_number', type: 'varchar', length: 20 })
  roomNumber!: string;

  @Column({
    name: 'rating_average',
    type: 'numeric',
    precision: 3,
    scale: 2,
    default: 5.0,
    transformer: {
      to: (value: number) => value,
      from: (value: string) => Number(value),
    },
  })
  ratingAverage!: number;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
