import { hash } from "bcrypt";

export const BCRYPT_COST = 12;
export const PASSWORD_PATTERN =
  /^(?=.*[A-Z])(?=.*[a-z])(?=.*[0-9])(?=.*[\p{P}\p{S}])[\s\S]{8,}$/u;

export function hashPassword(password: string): Promise<string> {
  return hash(password, BCRYPT_COST);
}
