import {
  Injectable,
  HttpException,
  HttpStatus,
  UnauthorizedException,
  BadRequestException,
} from "@nestjs/common";
import { compare } from "bcrypt";
import { DataSource, IsNull } from "typeorm";
import { AuthSessionEntity } from "../../database/entities/auth.entity";
import { UserEntity } from "../../database/entities/user.entity";
import { LoginDto } from "./dto/login.dto";
import { SessionService, IssuedSession } from "./session.service";
import { UserStatus } from "@shared/enums";

@Injectable()
export class LoginService {
  constructor(
    private readonly database: DataSource,
    private readonly sessions: SessionService,
  ) {}

  async login(dto: LoginDto): Promise<IssuedSession> {
    if (Buffer.byteLength(dto.password) > 72 || dto.password.includes("\0"))
      throw new BadRequestException("Mật khẩu không hợp lệ.");

    const identifier = /^0[35789][0-9]{8}$/.test(dto.identifier)
      ? `+84${dto.identifier.slice(1)}`
      : dto.identifier;

    const localPhone = identifier.startsWith("+84")
      ? `0${identifier.slice(3)}`
      : identifier;
    
    const result = await this.database.transaction(
      async (manager): Promise<IssuedSession | HttpException> => {
        // Khóa user để các lần đăng nhập sai đồng thời không làm mất bộ đếm.
        const now = new Date();
        const users = manager.getRepository(UserEntity);
        const user = await users
          .createQueryBuilder("user")
          .setLock("pessimistic_write")
          .where("LOWER(user.email) = LOWER(:identifier)", { identifier })
          .orWhere("user.phoneNumber = :identifier", { identifier })
          .orWhere("user.phoneNumber = :localPhone", { localPhone })
          .getOne();

        if (!user || user.status !== UserStatus.ACTIVE) return this.invalidLogin();

        if (user.loginLockedUntil && user.loginLockedUntil > now)
          return this.locked(user.loginLockedUntil, now);

        const attempts = user.loginLockedUntil
          ? 0
          : user.failedLoginAttempts;

        if (!user.passwordHash ||!(await compare(dto.password, user.passwordHash))) {
          const failed = attempts + 1;
          const until =
            failed >= 5 ? new Date(now.getTime() + 1800000) : null;
          await users.update(user.id, {
            failedLoginAttempts: failed,
            loginLockedUntil: until,
          });


          if (until) {
            await manager.getRepository(AuthSessionEntity).update(
              { userId: user.id, revokedAt: IsNull() },
              { revokedAt: now },
            );
            return this.locked(until, now);
          }
          return this.invalidLogin();
        }
        await users.update(user.id, {
          failedLoginAttempts: 0,
          loginLockedUntil: null,
        });
        
        return this.sessions.issueSession(
          manager,
          user.id,
          await this.sessions.roleFor(manager, user.id),
        );
      },
    );
    if (result instanceof HttpException) throw result;
    return result;
  }

  private invalidLogin(): UnauthorizedException {
    return new UnauthorizedException({
      code: "LOGIN_INVALID",
      message: "Email/Số điện thoại hoặc mật khẩu không đúng.",
    });
  }
  private locked(until: Date, now: Date): HttpException {
    return new HttpException(
      {
        code: "LOGIN_LOCKED",
        message: "Tài khoản tạm khóa 30 phút do đăng nhập sai 5 lần liên tiếp.",
        retryAfter: Math.max(
          1,
          Math.ceil((until.getTime() - now.getTime()) / 1000),
        ),
      },
      HttpStatus.TOO_MANY_REQUESTS,
    );
  }
}
