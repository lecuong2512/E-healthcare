import { Role } from "../enums/role.enum";
import { Gender } from "../enums/gender.enum";

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
  gender: Gender;
  dateOfBirth: string;
}

export interface RegisterOtpResponse {
  registrationId: string;
  expiresIn: number;
  resendAfter: number;
  channel: "email" | "sms" | "both";
}

export interface RegisterVerifyResponse {
  userId: string;
  phrId: string;
  status: "ACTIVE";
  role: Role.PATIENT;
}
