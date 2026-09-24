import { BadRequestException, HttpException, HttpStatus, Injectable } from "@nestjs/common";
import { createHmac, randomInt, randomUUID, timingSafeEqual } from "node:crypto";
import { DataSource } from "typeorm";
import { requiredEnvironment } from "../../config/environment";
import { hashPassword } from "../../common/utils/crypto.util";
import { OtpDeliveryService } from "./otp-delivery.service";
import { ResetPasswordDto } from "./dto/password-reset.dto";
import { RedisService } from "../../common/redis/redis.service";

const OTP_TTL = 300, LOCK_TTL = 900, MAX_ATTEMPTS = 5;
@Injectable()
export class PasswordResetService {
  private readonly secret = requiredEnvironment("OTP_HMAC_SECRET");
  constructor(private readonly database: DataSource, private readonly delivery: OtpDeliveryService, private readonly redis: RedisService) {}
  async request(identifier: string) {
    const { value, localPhone } = this.normalise(identifier);
    const rows = await this.database.query(
      "SELECT id, email, phone_number FROM users WHERE LOWER(email)=LOWER($1) OR phone_number=$1 OR phone_number=$2 LIMIT 1", [value, localPhone],
    );
    // Same response prevents account enumeration.
    if (!rows[0]) return { expiresIn: OTP_TTL };
    const user = rows[0];
    // Checklist defines OTP limits by phone number; do not create a fallback key.
    if (!user.phone_number) return { expiresIn: OTP_TTL };
    if (await this.redis.incrementWithTtl(`otp_sends:${user.phone_number}`, 600) > 3) throw new HttpException({ code: "OTP_SEND_LIMIT_EXCEEDED" }, HttpStatus.TOO_MANY_REQUESTS);
    const id = randomUUID();
    const otp = randomInt(0, 1000000).toString().padStart(6, "0");
    await this.delivery.send({ email: user.email, phoneNumber: user.phone_number }, otp);
    await this.redis.setEx(`password_reset_otp:${user.id}`, JSON.stringify({ id, otpHash: this.otpHash(id, otp) }), OTP_TTL);
    return { expiresIn: OTP_TTL };
  }
  async reset(dto: ResetPasswordDto): Promise<void> {
    if (Buffer.byteLength(dto.newPassword) > 72 || dto.newPassword.includes("\0")) throw new BadRequestException("Mật khẩu không hợp lệ.");
    const { value, localPhone } = this.normalise(dto.identifier);
    const userRows = await this.database.query("SELECT id, phone_number FROM users WHERE LOWER(email)=LOWER($1) OR phone_number=$1 OR phone_number=$2 LIMIT 1", [value, localPhone]);
    if (!userRows[0]) throw this.invalid();
    const userId = userRows[0].id;
    if (!userRows[0].phone_number) throw this.invalid();
    const phoneNumber = userRows[0].phone_number as string;
    await this.database.transaction(async manager => {
      const raw = await this.redis.get(`password_reset_otp:${userId}`);
      if (!raw) throw this.invalid();
      const session = JSON.parse(raw) as { id: string; otpHash: string };
      const now = new Date();
      const actual = Buffer.from(this.otpHash(session.id, dto.otp), "hex"), expected = Buffer.from(session.otpHash, "hex");
      if (!timingSafeEqual(actual, expected)) {
        const redisFailed = await this.redis.incrementWithTtl(`otp_fails:${phoneNumber}`, LOCK_TTL);
        if (redisFailed >= MAX_ATTEMPTS) throw this.locked(new Date(now.getTime() + LOCK_TTL * 1000), now);
        throw this.invalid();
      }
      await this.redis.del(`otp_fails:${userRows[0].phone_number ?? userId}`);
      await this.redis.del(`password_reset_otp:${userId}`);
      await manager.query("UPDATE users SET password_hash=$2 WHERE id=$1", [userId, await hashPassword(dto.newPassword)]);
      await manager.query("UPDATE auth_sessions SET revoked_at=clock_timestamp() WHERE user_id=$1 AND revoked_at IS NULL", [userId]);
    });
  }
  private normalise(identifier: string) { const value=identifier.trim().toLowerCase(); return { value, localPhone: /^0[35789]\d{8}$/.test(value) ? "+84"+value.slice(1) : value }; }
  private otpHash(id: string, otp: string) { return createHmac("sha256", this.secret).update(id+":"+otp).digest("hex"); }
  private invalid() { return new BadRequestException({ code:"OTP_INVALID", message:"Mã OTP không hợp lệ hoặc đã hết hạn." }); }
  private locked(until: Date, now: Date) { return new HttpException({ code:"OTP_LOCKED", retryAfter:Math.max(1,Math.ceil((new Date(until).getTime()-now.getTime())/1000)) }, HttpStatus.TOO_MANY_REQUESTS); }
}
