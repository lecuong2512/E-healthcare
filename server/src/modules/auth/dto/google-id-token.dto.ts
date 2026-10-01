import { IsString, Length } from "class-validator";

/** Google OpenID Connect ID token returned by the client SDK. */
export class GoogleIdTokenDto {
  @IsString()
  @Length(1, 4096)
  idToken!: string;
}
