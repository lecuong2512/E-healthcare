import { Column, Entity, PrimaryGeneratedColumn } from "typeorm";
import { Gender } from "../../../../shared/src/enums/gender.enum";

export enum UserStatus {
  ACTIVE = "ACTIVE",
  BLOCKED = "BLOCKED",
  PENDING_VERIFY = "PENDING_VERIFY",
}

@Entity("users")
export class UserEntity {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ name: "phone_number", type: "varchar", length: 16, nullable: true })
  phoneNumber!: string | null;

  @Column({ type: "varchar", length: 100, nullable: true })
  email!: string | null;

  @Column({ name: "password_hash", type: "varchar", length: 255, nullable: true })
  passwordHash!: string | null;

  @Column({ name: "full_name", type: "varchar", length: 100 })
  fullName!: string;

  @Column({ type: "enum", enum: Gender, enumName: "user_gender_enum" })
  gender!: Gender;

  @Column({ name: "date_of_birth", type: "date" })
  dateOfBirth!: string;

  @Column({ type: "enum", enum: UserStatus, enumName: "user_status_enum" })
  status!: UserStatus;

  @Column({ name: "failed_login_attempts", type: "smallint", default: 0 })
  failedLoginAttempts!: number;

  @Column({ name: "login_locked_until", type: "timestamptz", nullable: true })
  loginLockedUntil!: Date | null;

  @Column({ name: "google_subject", type: "varchar", length: 255, nullable: true })
  googleSubject!: string | null;
}
