import { Role } from "../enums/role.enum";

export interface LoginResponse {
  accessToken: string;
  role: Role;
}

export interface RefreshResponse {
  accessToken: string;
  role: LoginResponse["role"];
}
