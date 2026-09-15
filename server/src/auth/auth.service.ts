import {
  BadRequestException,
  ConflictException,
  HttpException,
  HttpStatus,
  Injectable,
} from "@nestjs/common";
import {
  createHmac,
  randomInt,
  randomUUID,
  timingSafeEqual,
} from "node:crypto";
import { DataSource, EntityManager } from "typeorm";
import { Role } from "../../../shared/src/enums/role.enum";
import {RegisterOtpResponse,RegisterVerifyResponse} from "../../../shared/src/interfaces/auth.interface";
import { requiredEnvironment } from "../config/environment";
import { hashPassword } from "../common/utils/crypto.util";
import { RegisterDto, VerifyRegisterDto } from "./dto/register.dto";
import { OtpDeliveryService } from "./otp-delivery.service";

const OTP_TTL_SECONDS = 180;
const RESEND_SECONDS = 60;
const SMS_SEND_WINDOW_SECONDS = 600;
const MAX_SMS_SENDS = 3;
const MAX_OTP_ATTEMPTS = 5;
const LOCK_SECONDS = 900;
const DUPLICATE_MESSAGE =
  "Email hoặc Số điện thoại đã được đăng ký. Vui lòng đăng nhập hoặc sử dụng chức năng quên mật khẩu.";

interface Session {
  id: string;
  email: string | null;
  phone_number: string | null;
  password_hash: string;
  full_name: string;
  gender: string;
  date_of_birth: string;
  otp_hash: string;
  expires_at: Date;
  sent_at: Date;
  failed_attempts: number;
  locked_until: Date | null;
}

@Injectable()
export class AuthService {
  private readonly otpSecret: string;

  constructor(
    private readonly database: DataSource,
    private readonly delivery: OtpDeliveryService,
  ) {
    this.otpSecret = requiredEnvironment("OTP_HMAC_SECRET");
    if (Buffer.byteLength(this.otpSecret) < 32)
      throw new Error("OTP_HMAC_SECRET must contain at least 32 bytes");
  }

  async requestRegistration(dto: RegisterDto): Promise<RegisterOtpResponse> {
    if (Boolean(dto.email) === Boolean(dto.phoneNumber)) {
      throw new BadRequestException({
        code: "INVALID_CONTACT",
        message: "Vui lòng cung cấp một Email hoặc Số điện thoại.",
      });
    }
    if (
      Buffer.byteLength(dto.password, "utf8") > 72 ||
      dto.password.includes("\0")
    ) {
      throw new BadRequestException({
        code: "INVALID_PASSWORD",
        message: "Mật khẩu không được vượt quá 72 byte hoặc chứa ký tự NUL.",
      });
    }
    if (dto.dateOfBirth > new Date().toISOString().slice(0, 10)) {
      throw new BadRequestException({
        code: "INVALID_DATE_OF_BIRTH",
        message: "Ngày sinh không được ở tương lai.",
      });
    }
    const email = dto.email ?? null;
    const phoneNumber = dto.phoneNumber?.startsWith("0")
      ? `+84${dto.phoneNumber.slice(1)}`
      : (dto.phoneNumber ?? null);
    // Kiểm tra sớm thông tin trùng hoặc bị khóa trước khi băm BCrypt tốn tài nguyên.
    // Kiểm tra lại dưới khóa transaction để tránh xung đột giữa các request đồng thời.
    await this.assertContactAvailable(
      this.database.manager,
      email,
      phoneNumber,
    );

    const [pending]: Session[] = await this.database.query(
      "SELECT * FROM registration_sessions WHERE email = $1 OR phone_number = $2",
      [email, phoneNumber],
    );

    this.assertRequestAllowed(
      pending,
      await this.databaseNow(this.database.manager),
    );


    await this.assertSmsSendAllowed(this.database.manager, phoneNumber);
    // Băm BCrypt trước khi lưu phiên chờ để không lưu mật khẩu dạng plaintext .
    const passwordHash = await hashPassword(dto.password);

    return this.database.transaction(async (manager) => {
      await this.lockContact(manager, email, phoneNumber);
      await this.assertContactAvailable(manager, email, phoneNumber);
      const [previous]: Session[] = await manager.query(
        "SELECT * FROM registration_sessions WHERE email = $1 OR phone_number = $2 FOR UPDATE",
        [email, phoneNumber],
      );

      const now = await this.databaseNow(manager);
      this.assertRequestAllowed(previous, now);

      await this.assertSmsSendAllowed(manager, phoneNumber);
      const registrationId = randomUUID();
      const otp = randomInt(0, 1000000).toString().padStart(6, "0");
      await this.delivery.send({ email, phoneNumber }, otp);
      if (phoneNumber) {
        // Lưu lịch sử gửi độc lập với phiên OTP để gửi lại không làm reset hạn mức.
        await manager.query(
          `DELETE FROM registration_otp_sends
          WHERE phone_number = $1 AND sent_at <= clock_timestamp() - $2 * interval '1 second'`,
          [phoneNumber, SMS_SEND_WINDOW_SECONDS],
        );
        await manager.query(
          "INSERT INTO registration_otp_sends (phone_number) VALUES ($1)",
          [phoneNumber],
        );
      }
      if (previous)
        await manager.query("DELETE FROM registration_sessions WHERE id = $1", [
          previous.id,
        ]);
      // Gửi lại không reset số lần nhập sai; chỉ reset sau khi hết thời gian khóa.
      const attempts = previous?.locked_until
        ? 0
        : (previous?.failed_attempts ?? 0);
      await manager.query(
        `
        INSERT INTO registration_sessions
          (id, email, phone_number, password_hash, full_name, gender, date_of_birth,
           otp_hash, expires_at, sent_at, failed_attempts)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8,
          clock_timestamp() + $9 * interval '1 second', clock_timestamp(), $10)
      `,
        [
          registrationId,
          email,
          phoneNumber,
          passwordHash,
          dto.fullName,
          dto.gender,
          dto.dateOfBirth,
          this.otpHash(registrationId, otp),
          OTP_TTL_SECONDS,
          attempts,
        ],
      );
      return {
        registrationId,
        expiresIn: OTP_TTL_SECONDS,
        resendAfter: RESEND_SECONDS,
        channel: email ? "email" : "sms",
      };
    });
  }

  // XÁC MINH OTP VÀ TẠO TÀI KHOẢN

  async verifyRegistration(dto: VerifyRegisterDto): Promise<RegisterVerifyResponse> {
    // Luôn khóa thông tin liên hệ trước khi khóa bản ghi, cùng thứ tự với requestRegistration.
    const [contact]: Session[] = await this.database.query(
      "SELECT email, phone_number FROM registration_sessions WHERE id = $1",
      [dto.registrationId],
    );
    if (!contact) throw this.invalidSession();
    try {
      const result = await this.database.transaction(
        async (manager): Promise<RegisterVerifyResponse | HttpException> => {
          await this.lockContact(manager, contact.email, contact.phone_number);
          const [session]: Session[] = await manager.query(
            "SELECT * FROM registration_sessions WHERE id = $1 FOR UPDATE",
            [dto.registrationId],
          );
          if (!session) return this.invalidSession();
          const now = await this.databaseNow(manager);
          if (session.locked_until && session.locked_until > now)
            return this.locked(session.locked_until, now);
          if (session.locked_until || session.expires_at <= now)
            return this.invalidSession();
          const actual = Buffer.from(
            this.otpHash(dto.registrationId, dto.otp),
            "hex",
          );
          const expected = Buffer.from(session.otp_hash, "hex");
          if (!timingSafeEqual(actual, expected)) {
            const attempts = session.failed_attempts + 1;
            const lockUntil =
              attempts >= MAX_OTP_ATTEMPTS
                ? new Date(now.getTime() + LOCK_SECONDS * 1000)
                : null;
            await manager.query(
              "UPDATE registration_sessions SET failed_attempts = $2, locked_until = $3 WHERE id = $1",
              [session.id, attempts, lockUntil],
            );
            // Trả lỗi thay vì ném ngay để transaction vẫn lưu số lần sai và trạng thái khóa.
            return lockUntil
              ? this.locked(lockUntil, now)
              : new BadRequestException({
                  code: "OTP_INVALID",
                  message: "Mã OTP không đúng.",
                  remainingAttempts: MAX_OTP_ATTEMPTS - attempts,
                });
          }
          await this.assertContactAvailable(
            manager,
            session.email,
            session.phone_number,
          );
          const [user]: { id: string }[] = await manager.query(
            `
          INSERT INTO users (email, phone_number, password_hash, full_name, gender, date_of_birth, status)
          VALUES ($1, $2, $3, $4, $5, $6, 'ACTIVE') RETURNING id
        `,
            [
              session.email,
              session.phone_number,
              session.password_hash,
              session.full_name,
              session.gender,
              session.date_of_birth,
            ],
          );
          await manager.query(
            "INSERT INTO user_roles (user_id, role) VALUES ($1, $2)",
            [user.id, Role.PATIENT],
          );
          const [phr]: { id: string }[] = await manager.query(
            "INSERT INTO personal_health_profiles (user_id) VALUES ($1) RETURNING id",
            [user.id],
          );
          await manager.query(
            "DELETE FROM registration_sessions WHERE id = $1",
            [session.id],
          );
          return {
            userId: user.id,
            phrId: phr.id,
            status: "ACTIVE",
            role: Role.PATIENT,
          };
        },
      );
      if (result instanceof HttpException) throw result;
      return result;
    } catch (error) {
      // Chỉ mục duy nhất ngăn dữ liệu trùng khi tác vụ khác ghi đồng thời vào CSDL.
      if ((error as { code?: string }).code === "23505")
        throw this.duplicateContact();
      throw error;
    }
  }

  // BĂM MÃ OTP 

  private otpHash(id: string, otp: string): string {
    return createHmac("sha256", this.otpSecret)
      .update(`${id}:${otp}`)
      .digest("hex");
  }

  //  KIỂM TRA HẠN MỨC GỬI SMS 

  private async assertSmsSendAllowed(
    manager: EntityManager,
    phoneNumber: string | null,
  ): Promise<void> {
    if (!phoneNumber) return;
    const now = await this.databaseNow(manager);
    const receipts: { sent_at: Date }[] = await manager.query(
      `
      SELECT sent_at FROM registration_otp_sends
      WHERE phone_number = $1 AND sent_at > $2::timestamptz - $3 * interval '1 second'
      ORDER BY sent_at DESC LIMIT $4
    `,
      [phoneNumber, now, SMS_SEND_WINDOW_SECONDS, MAX_SMS_SENDS],
    );
    if (receipts.length >= MAX_SMS_SENDS) {
      const retryAfter = Math.max(
        1,
        Math.ceil(
          (receipts[MAX_SMS_SENDS - 1].sent_at.getTime() +
            SMS_SEND_WINDOW_SECONDS * 1000 -
            now.getTime()) /
            1000,
        ),
      );
      throw new HttpException(
        {
          code: "OTP_SEND_LIMIT_EXCEEDED",
          message:
            "Chỉ được gửi tối đa 3 mã OTP cho một Số điện thoại trong 10 phút.",
          retryAfter,
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }

  //  KIỂM TRA KHÓA OTP VÀ THỜI GIAN GỬI LẠI 

  private assertRequestAllowed(previous: Session | undefined, now: Date): void {
    if (previous?.locked_until && previous.locked_until > now)
      throw this.locked(previous.locked_until, now);
    if (
      previous &&
      previous.sent_at.getTime() + RESEND_SECONDS * 1000 > now.getTime()
    ) {
      throw new HttpException(
        {
          code: "OTP_RESEND_TOO_SOON",
          message: "Vui lòng chờ trước khi yêu cầu OTP mới.",
          retryAfter: Math.ceil(
            (previous.sent_at.getTime() +
              RESEND_SECONDS * 1000 -
              now.getTime()) /
              1000,
          ),
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }

  //  KHÓA THAO TÁC THEO EMAIL HOẶC SĐT

  private async lockContact(
    manager: EntityManager,
    email: string | null,
    phoneNumber: string | null,
  ): Promise<void> {
    await manager.query(
      "SELECT pg_advisory_xact_lock(hashtextextended($1, 0))",
      [email ? `register:email:${email}` : `register:phone:${phoneNumber}`],
    );
  }

  //  LẤY THỜI GIAN TỪ CƠ SỞ DỮ LIỆU 

  private async databaseNow(manager: EntityManager): Promise<Date> {
    const [row]: { now: Date }[] = await manager.query(
      "SELECT clock_timestamp() AS now",
    );
    return row.now;
  }

  //  KIỂM TRA EMAIL HOẶC SĐT ĐÃ ĐĂNG KÝ 

  private async assertContactAvailable(
    manager: EntityManager,
    email: string | null,
    phone: string | null,
  ): Promise<void> {
    const phoneVariants = phone?.startsWith("+84")
      ? [phone, `0${phone.slice(3)}`]
      : [phone];
    const users: unknown[] = await manager.query(
      "SELECT id FROM users WHERE LOWER(email) = $1 OR phone_number = ANY($2::varchar[]) LIMIT 1",
      [email, phoneVariants],
    );
    if (users.length) throw this.duplicateContact();
  }

  //  TẠO LỖI THÔNG TIN LIÊN HỆ TRÙNG 

  private duplicateContact(): ConflictException {
    return new ConflictException({
      code: "CONTACT_ALREADY_REGISTERED",
      message: DUPLICATE_MESSAGE,
    });
  }

  //  TẠO LỖI PHIÊN OTP KHÔNG HỢP LỆ 

  private invalidSession(): BadRequestException {
    return new BadRequestException({
      code: "OTP_SESSION_INVALID",
      message:
        "Phiên OTP không tồn tại, đã hết hạn hoặc đã được sử dụng. Vui lòng yêu cầu mã mới.",
    });
  }

  //  TẠO LỖI OTP ĐANG BỊ KHÓA 

  private locked(until: Date, now: Date): HttpException {
    return new HttpException(
      {
        code: "OTP_LOCKED",
        message:
          "OTP sai 5 lần. Vui lòng chờ 15 phút trước khi yêu cầu mã mới.",
        retryAfter: Math.max(
          1,
          Math.ceil((until.getTime() - now.getTime()) / 1000),
        ),
      },
      HttpStatus.TOO_MANY_REQUESTS,
    );
  }
}
