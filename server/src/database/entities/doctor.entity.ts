import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
import { UserEntity } from './user.entity';
import { SpecialtyEntity } from './specialty.entity';

@Entity('doctors')
export class DoctorEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'user_id', type: 'uuid' })
  userId!: string;

  @ManyToOne(() => UserEntity)
  @JoinColumn({ name: 'user_id' })
  user!: UserEntity;

  @Column({ name: 'specialty_id', type: 'uuid' })
  specialtyId!: string;

  @ManyToOne(() => SpecialtyEntity)
  @JoinColumn({ name: 'specialty_id' })
  specialty!: SpecialtyEntity;

  @Column({ name: 'license_number', type: 'varchar', length: 50 })
  licenseNumber!: string;

  @Column({ name: 'academic_title', type: 'varchar', length: 50, nullable: true })
  academicTitle!: string | null;

  @Column({ name: 'consultation_fee', type: 'numeric', precision: 12, scale: 2 })
  consultationFee!: number;

  @Column({ name: 'bio_description', type: 'text', nullable: true })
  bioDescription!: string | null;

  @Column({ name: 'room_number', type: 'varchar', length: 20 })
  roomNumber!: string;

  @Column({ name: 'rating_average', type: 'numeric', precision: 3, scale: 2, default: 5.0 })
  ratingAverage!: number;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}