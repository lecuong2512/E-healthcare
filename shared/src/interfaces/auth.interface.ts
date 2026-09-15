import { Role } from "../enums/role.enum";

export interface LoginResponse {
  accessToken: string;
  role: Role;
}

export interface RefreshResponse {
  accessToken: string;
  role: LoginResponse["role"];
}

export interface RegisterRequest {
  email?: string;
  phoneNumber?: string;
  password: string;
  fullName: string;
  gender: "MALE" | "FEMALE" | "OTHER";
  dateOfBirth: string;
}

export interface RegisterOtpResponse {
  registrationId: string;
  expiresIn: number;
  resendAfter: number;
  channel: "email" | "sms";
}

export interface RegisterVerifyResponse {
  userId: string;
  phrId: string;
  status: "ACTIVE";
  role: Role.PATIENT;
}
