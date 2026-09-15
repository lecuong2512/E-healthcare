import {
  Injectable,
  HttpException,
  HttpStatus,
  UnauthorizedException,
  BadRequestException,
} from "@nestjs/common";
import { compare } from "bcrypt";
import { DataSource } from "typeorm";
import { LoginDto } from "./dto/login.dto";
import { SessionService, IssuedSession } from "./session.service";

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
        const [user] = await manager.query(
          `SELECT *,clock_timestamp() AS now FROM users
        WHERE LOWER(email)=$1 OR phone_number=$1 OR phone_number=$2 FOR UPDATE`,
          [identifier, localPhone],
        );

        if (!user || user.status !== "ACTIVE") return this.invalidLogin();

        if (user.login_locked_until && user.login_locked_until > user.now)
          return this.locked(user.login_locked_until, user.now);

        const attempts = user.login_locked_until
          ? 0
          : user.failed_login_attempts;

        if (!user.password_hash ||!(await compare(dto.password, user.password_hash))) {
          const failed = attempts + 1;
          const until =
            failed >= 5 ? new Date(user.now.getTime() + 1800000) : null;
          await manager.query(
            "UPDATE users SET failed_login_attempts=$2,login_locked_until=$3 WHERE id=$1",
            [user.id, failed, until],
          );


          if (until) {
            await manager.query(
              "UPDATE auth_sessions SET revoked_at=clock_timestamp() WHERE user_id=$1 AND revoked_at IS NULL",
              [user.id],
            );
            return this.locked(until, user.now);
          }
          return this.invalidLogin();
        }
        await manager.query(
          "UPDATE users SET failed_login_attempts=0,login_locked_until=NULL WHERE id=$1",
          [user.id],
        );
        
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
