import {
  Injectable,
  HttpException,
  HttpStatus,
  UnauthorizedException,
  BadRequestException,
} from "@nestjs/common";
import { compare } from "bcrypt";
import { DataSource, EntityManager, IsNull } from "typeorm";
import { AuthSessionEntity } from "../../database/entities/auth.entity";
import { UserEntity } from "../../database/entities/user.entity";
import { LoginDto } from "./dto/login.dto";
import { SessionService, IssuedSession } from "./session.service";
import { AuditAction, AuditOutcome, Role, UserStatus } from "@shared/enums";
import { RedisService } from "../../common/redis/redis.service";
import { AuditService } from '../audit/audit.service';
import { AuditTransportContext } from '../audit/audit-context';

@Injectable()
export class LoginService {
  constructor(
    private readonly database: DataSource,
    private readonly sessions: SessionService,
    private readonly redis: RedisService,
    private readonly audit: AuditService,
  ) {}

  async login(
    dto: LoginDto,
    transport: AuditTransportContext = {
      ipAddress: null,
      userAgent: null,
      requestId: null,
    },
  ): Promise<IssuedSession> {
    if (Buffer.byteLength(dto.password) > 72 || dto.password.includes("\0"))
      throw new BadRequestException("Mật khẩu không hợp lệ.");

    const identifier = /^0[35789][0-9]{8}$/.test(dto.identifier)
      ? `+84${dto.identifier.slice(1)}`
      : dto.identifier;

    const localPhone = identifier.startsWith("+84")
      ? `0${identifier.slice(3)}`
      : identifier;
    
    const attemptKey = `login_attempts:${identifier}`;
    const result = await this.database.transaction(
      async (manager): Promise<IssuedSession | HttpException> => {
        // Khóa user để các lần đăng nhập sai đồng thời không làm mất bộ đếm.
        const now = new Date();
        const users = manager.getRepository(UserEntity);
        const user = await users
          .createQueryBuilder("user")
          .setLock("pessimistic_write")
          .where("user.passwordHash IS NOT NULL")
          .andWhere("(LOWER(user.email) = LOWER(:identifier) OR user.phoneNumber = :identifier OR user.phoneNumber = :localPhone)", {
            identifier,
            localPhone,
          })
          .getOne();

        if (!user) {
          await this.recordLogin(manager, transport, null, null, false, 'UNKNOWN_ACCOUNT');
          return this.invalidLogin();
        }

        if (user.status === UserStatus.BLOCKED) {
          await this.recordLogin(manager, transport, user.id, null, false, 'BLOCKED_ACCOUNT');
          return new UnauthorizedException({
            code: "ACCOUNT_BLOCKED",
            message: "Tài khoản của bạn đã bị khóa. Vui lòng liên hệ quản trị viên để được hỗ trợ.",
          });
        }

        if (user.status !== UserStatus.ACTIVE) {
          await this.recordLogin(
            manager,
            transport,
            user.id,
            null,
            false,
            'INACTIVE_ACCOUNT',
          );
          return this.invalidLogin();
        }

        if (user.loginLockedUntil && user.loginLockedUntil > now) {
          await this.recordLogin(manager, transport, user.id, null, false, 'LOCKED');
          return this.locked(user.loginLockedUntil, now);
        }

        const attempts = user.loginLockedUntil
          ? 0
          : user.failedLoginAttempts;

        if (!user.passwordHash ||!(await compare(dto.password, user.passwordHash))) {
          const redisAttempts = await this.redis.incrementWithTtl(attemptKey, 1800);
          const failed = Math.min(5, Math.max(attempts + 1, redisAttempts));
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
            await this.recordLogin(manager, transport, user.id, null, false, 'LOCKED');
            return this.locked(until, now);
          }
          await this.recordLogin(manager, transport, user.id, null, false, 'INVALID_CREDENTIALS');
          return this.invalidLogin();
        }
        await this.redis.del(attemptKey);
        await users.update(user.id, {
          failedLoginAttempts: 0,
          loginLockedUntil: null,
        });
        
        const role = await this.sessions.roleFor(manager, user.id);
        const session = await this.sessions.issueSession(
          manager,
          user.id,
          role,
        );
        await this.recordLogin(manager, transport, user.id, role, true);
        return session;
      },
    );
    if (result instanceof HttpException) throw result;
    return result;
  }

  private recordLogin(
    manager: EntityManager,
    transport: AuditTransportContext,
    actorId: string | null,
    actorRole: Role | null,
    success: boolean,
    reason?: string,
  ) {
    return this.audit.record(
      manager,
      { actorId, actorRole, ...transport },
      {
        action: success ? AuditAction.LOGIN : AuditAction.LOGIN_FAILED,
        outcome: success ? AuditOutcome.SUCCESS : AuditOutcome.DENIED,
        resourceType: 'AUTH_SESSION',
        metadata: reason ? { reason } : {},
      },
    );
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
