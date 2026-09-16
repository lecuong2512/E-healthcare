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
import { DataSource, EntityManager, MoreThan } from "typeorm";
import { Role } from "../../../../shared/src/enums/role.enum";
import {RegisterOtpResponse,RegisterVerifyResponse} from "../../../../shared/src/interfaces/auth.interface";
import { requiredEnvironment } from "../../config/environment";
import { hashPassword } from "../../common/utils/crypto.util";
import { RegisterDto, VerifyRegisterDto } from "./dto/register.dto";
import { OtpDeliveryService } from "./otp-delivery.service";
import {
  PersonalHealthProfileEntity,
  RegistrationOtpSendEntity,
  RegistrationSessionEntity,
  UserRoleEntity,
} from "../../database/entities/auth.entity";
import {
  UserEntity,
  UserStatus,
} from "../../database/entities/user.entity";
import { Gender } from "../../../../shared/src/enums/gender.enum";

const OTP_TTL_SECONDS = 180;
const RESEND_SECONDS = 60;
const SMS_SEND_WINDOW_SECONDS = 600;
const MAX_SMS_SENDS = 3;
const MAX_OTP_ATTEMPTS = 5;
const LOCK_SECONDS = 900;
const DUPLICATE_MESSAGE =
  "Email hoặc Số điện thoại đã được đăng ký. Vui lòng đăng nhập hoặc sử dụng chức năng quên mật khẩu.";

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
    if (!dto.email && !dto.phoneNumber) {
      throw new BadRequestException({
        code: "INVALID_CONTACT",
        message: "Vui lòng cung cấp Email hoặc Số điện thoại.",
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

    const pending = await this.database.manager
      .getRepository(RegistrationSessionEntity)
      .createQueryBuilder("session")
      .where("session.email = :email OR session.phoneNumber = :phoneNumber", {
        email,
        phoneNumber,
      })
      .getOne();

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
      const sessions = manager.getRepository(RegistrationSessionEntity);
      const previous = await sessions
        .createQueryBuilder("session")
        .setLock("pessimistic_write")
        .where("session.email = :email OR session.phoneNumber = :phoneNumber", {
          email,
          phoneNumber,
        })
        .getOne();

      const now = await this.databaseNow(manager);
      this.assertRequestAllowed(previous, now);

      await this.assertSmsSendAllowed(manager, phoneNumber);
      const registrationId = randomUUID();
      const otp = randomInt(0, 1000000).toString().padStart(6, "0");
      await this.delivery.send({ email, phoneNumber }, otp);
      if (phoneNumber) {
        // Lưu lịch sử gửi độc lập với phiên OTP để gửi lại không làm reset hạn mức.
        const receipts = manager.getRepository(RegistrationOtpSendEntity);
        await receipts
          .createQueryBuilder()
          .delete()
          .where("phone_number = :phoneNumber", { phoneNumber })
          .andWhere("sent_at <= :expiresAt", {
            expiresAt: new Date(now.getTime() - SMS_SEND_WINDOW_SECONDS * 1000),
          })
          .execute();
        await receipts.save(receipts.create({ phoneNumber, sentAt: now }));
      }
      if (previous) await sessions.remove(previous);
      // Gửi lại không reset số lần nhập sai; chỉ reset sau khi hết thời gian khóa.
      const attempts = previous?.lockedUntil
        ? 0
        : (previous?.failedAttempts ?? 0);
      await sessions.save(sessions.create({
        id: registrationId,
        email,
        phoneNumber,
        passwordHash,
        fullName: dto.fullName,
        gender: dto.gender as Gender,
        dateOfBirth: dto.dateOfBirth,
        otpHash: this.otpHash(registrationId, otp),
        expiresAt: new Date(now.getTime() + OTP_TTL_SECONDS * 1000),
        sentAt: now,
        failedAttempts: attempts,
        lockedUntil: null,
      }));
      return {
        registrationId,
        expiresIn: OTP_TTL_SECONDS,
        resendAfter: RESEND_SECONDS,
        channel: email && phoneNumber ? "both" : email ? "email" : "sms",
      };
    });
  }

  // XÁC MINH OTP VÀ TẠO TÀI KHOẢN

  async verifyRegistration(dto: VerifyRegisterDto): Promise<RegisterVerifyResponse> {
    // Luôn khóa thông tin liên hệ trước khi khóa bản ghi, cùng thứ tự với requestRegistration.
    const contact = await this.database.manager
      .getRepository(RegistrationSessionEntity)
      .findOneBy({ id: dto.registrationId });
    if (!contact) throw this.invalidSession();
    try {
      const result = await this.database.transaction(
        async (manager): Promise<RegisterVerifyResponse | HttpException> => {
          await this.lockContact(manager, contact.email, contact.phoneNumber);
          const sessions = manager.getRepository(RegistrationSessionEntity);
          const session = await sessions
            .createQueryBuilder("session")
            .setLock("pessimistic_write")
            .where("session.id = :id", { id: dto.registrationId })
            .getOne();
          if (!session) return this.invalidSession();
          const now = await this.databaseNow(manager);
          if (session.lockedUntil && session.lockedUntil > now)
            return this.locked(session.lockedUntil, now);
          if (session.lockedUntil || session.expiresAt <= now)
            return this.invalidSession();
          const actual = Buffer.from(
            this.otpHash(dto.registrationId, dto.otp),
            "hex",
          );
          const expected = Buffer.from(session.otpHash, "hex");
          if (!timingSafeEqual(actual, expected)) {
            const attempts = session.failedAttempts + 1;
            const lockUntil =
              attempts >= MAX_OTP_ATTEMPTS
                ? new Date(now.getTime() + LOCK_SECONDS * 1000)
                : null;
            await sessions.update(session.id, {
              failedAttempts: attempts,
              lockedUntil: lockUntil,
            });
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
            session.phoneNumber,
          );
          const users = manager.getRepository(UserEntity);
          const user = await users.save(users.create({
            email: session.email,
            phoneNumber: session.phoneNumber,
            passwordHash: session.passwordHash,
            fullName: session.fullName,
            gender: session.gender,
            dateOfBirth: session.dateOfBirth,
            status: UserStatus.ACTIVE,
            failedLoginAttempts: 0,
            loginLockedUntil: null,
            googleSubject: null,
          }));
          const roles = manager.getRepository(UserRoleEntity);
          await roles.save(roles.create({ userId: user.id, role: Role.PATIENT }));
          const profiles = manager.getRepository(PersonalHealthProfileEntity);
          const phr = await profiles.save(profiles.create({ userId: user.id }));
          await sessions.remove(session);
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
    const receipts = await manager.getRepository(RegistrationOtpSendEntity).find({
      where: {
        phoneNumber,
        sentAt: MoreThan(new Date(now.getTime() - SMS_SEND_WINDOW_SECONDS * 1000)),
      },
      order: { sentAt: "DESC" },
      take: MAX_SMS_SENDS,
    });
    if (receipts.length >= MAX_SMS_SENDS) {
      const retryAfter = Math.max(
        1,
        Math.ceil(
          (receipts[MAX_SMS_SENDS - 1].sentAt.getTime() +
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

  private assertRequestAllowed(
    previous: RegistrationSessionEntity | null,
    now: Date,
  ): void {
    if (previous?.lockedUntil && previous.lockedUntil > now)
      throw this.locked(previous.lockedUntil, now);
    if (
      previous &&
      previous.sentAt.getTime() + RESEND_SECONDS * 1000 > now.getTime()
    ) {
      throw new HttpException(
        {
          code: "OTP_RESEND_TOO_SOON",
          message: "Vui lòng chờ trước khi yêu cầu OTP mới.",
          retryAfter: Math.ceil(
            (previous.sentAt.getTime() +
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
    const contacts = [
      ...(email ? [`register:email:${email}`] : []),
      ...(phoneNumber ? [`register:phone:${phoneNumber}`] : []),
    ].sort();
    for (const contact of contacts)
      await manager.query(
        "SELECT pg_advisory_xact_lock(hashtextextended($1, 0))",
        [contact],
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
    const user = await manager
      .getRepository(UserEntity)
      .createQueryBuilder("user")
      .where("LOWER(user.email) = LOWER(:email)", { email })
      .orWhere("user.phoneNumber IN (:...phoneVariants)", { phoneVariants })
      .getOne();
    if (user) throw this.duplicateContact();
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
