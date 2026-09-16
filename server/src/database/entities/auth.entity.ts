import { Column, Entity, PrimaryColumn, PrimaryGeneratedColumn } from "typeorm";
import { Role } from "../../../../shared/src/enums/role.enum";
import { Gender } from "../../../../shared/src/enums/gender.enum";

@Entity("user_roles")
export class UserRoleEntity {
  @PrimaryColumn({ name: "user_id", type: "uuid" })
  userId!: string;

  @PrimaryColumn({ type: "enum", enum: Role, enumName: "user_role_enum" })
  role!: Role;
}

@Entity("personal_health_profiles")
export class PersonalHealthProfileEntity {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ name: "user_id", type: "uuid" })
  userId!: string;
}

@Entity("registration_sessions")
export class RegistrationSessionEntity {
  @PrimaryColumn("uuid")
  id!: string;

  @Column({ type: "varchar", length: 100, nullable: true })
  email!: string | null;

  @Column({ name: "phone_number", type: "varchar", length: 16, nullable: true })
  phoneNumber!: string | null;

  @Column({ name: "password_hash", type: "varchar", length: 255 })
  passwordHash!: string;

  @Column({ name: "full_name", type: "varchar", length: 100 })
  fullName!: string;

  @Column({ type: "enum", enum: Gender, enumName: "user_gender_enum" })
  gender!: Gender;

  @Column({ name: "date_of_birth", type: "date" })
  dateOfBirth!: string;

  @Column({ name: "otp_hash", type: "char", length: 64 })
  otpHash!: string;

  @Column({ name: "expires_at", type: "timestamptz" })
  expiresAt!: Date;

  @Column({ name: "sent_at", type: "timestamptz" })
  sentAt!: Date;

  @Column({ name: "failed_attempts", type: "smallint", default: 0 })
  failedAttempts!: number;

  @Column({ name: "locked_until", type: "timestamptz", nullable: true })
  lockedUntil!: Date | null;
}

@Entity("registration_otp_sends")
export class RegistrationOtpSendEntity {
  @PrimaryGeneratedColumn({ type: "bigint" })
  id!: string;

  @Column({ name: "phone_number", type: "varchar", length: 16 })
  phoneNumber!: string;

  @Column({ name: "sent_at", type: "timestamptz" })
  sentAt!: Date;
}

@Entity("auth_sessions")
export class AuthSessionEntity {
  @PrimaryColumn("uuid")
  id!: string;

  @Column({ name: "user_id", type: "uuid" })
  userId!: string;

  @Column({ name: "refresh_token_hash", type: "char", length: 64 })
  refreshTokenHash!: string;

  @Column({ name: "expires_at", type: "timestamptz" })
  expiresAt!: Date;

  @Column({ name: "revoked_at", type: "timestamptz", nullable: true })
  revokedAt!: Date | null;
}

@Entity("google_oauth_flows")
export class GoogleOAuthFlowEntity {
  @PrimaryColumn("uuid")
  id!: string;

  @Column({ name: "state_hash", type: "char", length: 64 })
  stateHash!: string;

  @Column({ name: "browser_hash", type: "char", length: 64 })
  browserHash!: string;

  @Column({ name: "nonce_hash", type: "char", length: 64 })
  nonceHash!: string;

  @Column({ name: "code_verifier", type: "varchar", length: 128 })
  codeVerifier!: string;

  @Column({ name: "expires_at", type: "timestamptz" })
  expiresAt!: Date;
}

@Entity("google_registration_sessions")
export class GoogleRegistrationSessionEntity {
  @PrimaryColumn({ name: "token_hash", type: "char", length: 64 })
  tokenHash!: string;

  @Column({ name: "google_subject", type: "varchar", length: 255 })
  googleSubject!: string;

  @Column({ type: "varchar", length: 100 })
  email!: string;

  @Column({ name: "full_name", type: "varchar", length: 100 })
  fullName!: string;

  @Column({ name: "expires_at", type: "timestamptz" })
  expiresAt!: Date;
}
