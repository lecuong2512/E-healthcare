import { Role } from "../enums/role.enum";
import { Gender } from "../enums/gender.enum";

export interface CurrentUser {
  id?: string;
  fullName: string;
  email?: string | null;
  phoneNumber?: string | null;
  role: Role | string;
  avatarUrl?: string | null;
}

export interface LoginResponse {
  accessToken: string;
  role: Role;
  user?: CurrentUser;
}

export interface RefreshResponse {
  accessToken: string;
  role: LoginResponse["role"];
  user?: CurrentUser;
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
