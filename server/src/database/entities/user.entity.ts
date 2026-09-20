import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Gender, UserStatus } from '@shared/enums';

@Entity('users')
export class UserEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'phone_number', type: 'varchar', length: 15, nullable: true })
  phoneNumber!: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  email!: string | null;

  @Column({ name: 'password_hash', type: 'varchar', length: 255, nullable: true })
  passwordHash!: string | null;

  @Column({ name: 'full_name', type: 'varchar', length: 100 })
  fullName!: string;

  @Column({ type: 'enum', enum: Gender, enumName: 'user_gender_enum' })
  gender!: Gender;

  @Column({ name: 'date_of_birth', type: 'date' })
  dateOfBirth!: string;

  @Column({
    type: 'enum',
    enum: UserStatus,
    enumName: 'user_status_enum',
    default: UserStatus.PENDING_VERIFY,
  })
  status!: UserStatus;

  // Cột mới, khớp auth.service.ts
  @Column({ name: 'failed_login_attempts', type: 'int', default: 0 })
  failedLoginAttempts!: number;

  @Column({ name: 'login_locked_until', type: 'timestamptz', nullable: true })
  loginLockedUntil!: Date | null;

  @Column({ name: 'google_subject', type: 'varchar', length: 255, nullable: true })
  googleSubject!: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}