import { BadRequestException, HttpException, HttpStatus, Injectable } from "@nestjs/common";
import { createHmac, randomInt, randomUUID, timingSafeEqual } from "node:crypto";
import { DataSource } from "typeorm";
import { requiredEnvironment } from "../../config/environment";
import { hashPassword } from "../../common/utils/crypto.util";
import { OtpDeliveryService } from "./otp-delivery.service";
import { ResetPasswordDto } from "./dto/password-reset.dto";

const OTP_TTL = 300, LOCK_TTL = 900, MAX_ATTEMPTS = 5;
@Injectable()
export class PasswordResetService {
  private readonly secret = requiredEnvironment("OTP_HMAC_SECRET");
  constructor(private readonly database: DataSource, private readonly delivery: OtpDeliveryService) {}
  async request(identifier: string) {
    const { value, localPhone } = this.normalise(identifier);
    const rows = await this.database.query(
      "SELECT id, email, phone_number FROM users WHERE LOWER(email)=LOWER($1) OR phone_number=$1 OR phone_number=$2 LIMIT 1", [value, localPhone],
    );
    // Same response prevents account enumeration.
    if (!rows[0]) return { expiresIn: OTP_TTL };
    const user = rows[0], id = randomUUID();
    const otp = randomInt(0, 1000000).toString().padStart(6, "0");
    await this.delivery.send({ email: user.email, phoneNumber: user.phone_number }, otp);
    await this.database.query(
      "INSERT INTO password_reset_sessions (id,user_id,otp_hash,expires_at,failed_attempts,locked_until) VALUES ($1,$2,$3,clock_timestamp()+interval '5 minutes',0,NULL) ON CONFLICT (user_id) DO UPDATE SET id=EXCLUDED.id,otp_hash=EXCLUDED.otp_hash,expires_at=EXCLUDED.expires_at,failed_attempts=0,locked_until=NULL",
      [id, user.id, this.otpHash(id, otp)],
    );
    return { expiresIn: OTP_TTL };
  }
  async reset(dto: ResetPasswordDto): Promise<void> {
    if (Buffer.byteLength(dto.newPassword) > 72 || dto.newPassword.includes("\0")) throw new BadRequestException("Mật khẩu không hợp lệ.");
    const { value, localPhone } = this.normalise(dto.identifier);
    const userRows = await this.database.query("SELECT id FROM users WHERE LOWER(email)=LOWER($1) OR phone_number=$1 OR phone_number=$2 LIMIT 1", [value, localPhone]);
    if (!userRows[0]) throw this.invalid();
    const userId = userRows[0].id;
    await this.database.transaction(async manager => {
      const rows = await manager.query("SELECT id,otp_hash,expires_at,failed_attempts,locked_until FROM password_reset_sessions WHERE user_id=$1 FOR UPDATE", [userId]);
      const session = rows[0], now = new Date();
      if (!session || new Date(session.expires_at) <= now) throw this.invalid();
      if (session.locked_until && new Date(session.locked_until) > now) throw this.locked(session.locked_until, now);
      const actual = Buffer.from(this.otpHash(session.id, dto.otp), "hex"), expected = Buffer.from(session.otp_hash, "hex");
      if (!timingSafeEqual(actual, expected)) {
        const failed = Number(session.failed_attempts) + 1;
        const until = failed >= MAX_ATTEMPTS ? new Date(now.getTime() + LOCK_TTL * 1000) : null;
        await manager.query("UPDATE password_reset_sessions SET failed_attempts=$2,locked_until=$3 WHERE user_id=$1", [userId, failed, until]);
        if (until) throw this.locked(until, now);
        throw this.invalid();
      }
      await manager.query("UPDATE users SET password_hash=$2 WHERE id=$1", [userId, await hashPassword(dto.newPassword)]);
      await manager.query("UPDATE auth_sessions SET revoked_at=clock_timestamp() WHERE user_id=$1 AND revoked_at IS NULL", [userId]);
      await manager.query("DELETE FROM password_reset_sessions WHERE user_id=$1", [userId]);
    });
  }
  private normalise(identifier: string) { const value=identifier.trim().toLowerCase(); return { value, localPhone: /^0[35789]\d{8}$/.test(value) ? "+84"+value.slice(1) : value }; }
  private otpHash(id: string, otp: string) { return createHmac("sha256", this.secret).update(id+":"+otp).digest("hex"); }
  private invalid() { return new BadRequestException({ code:"OTP_INVALID", message:"Mã OTP không hợp lệ hoặc đã hết hạn." }); }
  private locked(until: Date, now: Date) { return new HttpException({ code:"OTP_LOCKED", retryAfter:Math.max(1,Math.ceil((new Date(until).getTime()-now.getTime())/1000)) }, HttpStatus.TOO_MANY_REQUESTS); }
}
