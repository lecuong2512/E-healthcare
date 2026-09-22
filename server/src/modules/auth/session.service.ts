import { Injectable, UnauthorizedException } from "@nestjs/common";
import { createHash, randomUUID } from "node:crypto";
import { sign, verify, JwtPayload, TokenExpiredError } from "jsonwebtoken";
import { DataSource, EntityManager } from "typeorm";
import { Role } from "../../../../shared/src/enums/role.enum";
import { requiredEnvironment } from "../../config/environment";
import { AuthSessionEntity, UserRoleEntity } from "../../database/entities/auth.entity";
import { UserEntity } from "../../database/entities/user.entity";
import { UserStatus } from "@shared/enums";

export const ACCESS_TTL = 900;
export const REFRESH_TTL = 604800;
const ISSUER = "ehealth-api";

export interface IssuedSession {
  accessToken: string;
  role: Role;
  refreshToken: string;
  refreshExpiresIn?: number;
}
export interface AccessClaims {
  userId: string;
  role: Role;
  sessionId: string;
}
interface TokenClaims extends JwtPayload {
  userId: string;
  role: Role;
  sid: string;
  type: "access" | "refresh";
}

@Injectable()
export class SessionService {
  private readonly accessSecret: string;
  private readonly refreshSecret: string;

  constructor(private readonly database: DataSource) {
    this.accessSecret = requiredEnvironment("JWT_ACCESS_SECRET");
    this.refreshSecret = requiredEnvironment("JWT_REFRESH_SECRET");
    if (
      [this.accessSecret, this.refreshSecret].some(
        (secret) =>
          Buffer.byteLength(secret) < 32 || secret.startsWith("your_"),
      ) ||
      this.accessSecret === this.refreshSecret
    ) {
      throw new Error(
        "JWT yêu cầu hai secret khác nhau, ngẫu nhiên, ít nhất 32 byte và không dùng mẫu mặc định.",
      );
    }
  }

  async roleFor(manager: EntityManager, userId: string): Promise<Role> {
    const roles = await manager.getRepository(UserRoleEntity).findBy({ userId });
    const role = [
      Role.ADMIN,
      Role.RECEPTIONIST,
      Role.DOCTOR,
      Role.PATIENT,
    ].find((value) => roles.some((row) => row.role === value));
    if (!role) throw this.unauthorized();
    return role;
  }

  async issueSession(
    manager: EntityManager,
    userId: string,
    role: Role,
  ): Promise<IssuedSession> {
    const id = randomUUID();
    const tokens = this.tokens(userId, role, id);
    const sessions = manager.getRepository(AuthSessionEntity);
    await sessions.save(sessions.create({
      id,
      userId,
      refreshTokenHash: this.digest(tokens.refreshToken),
      expiresAt: new Date(Date.now() + REFRESH_TTL * 1000),
      revokedAt: null,
    }));
    return tokens;
  }

  async refresh(token: string | undefined): Promise<IssuedSession> {
    const claims = this.verifyToken(token, "refresh");
    const result = await this.database.transaction(
      async (manager): Promise<IssuedSession | UnauthorizedException> => {
        // Cùng thứ tự khóa user -> session với đăng nhập/đăng xuất để tránh deadlock.
        const now = new Date();
        const user = await manager
          .getRepository(UserEntity)
          .createQueryBuilder("user")
          .setLock("pessimistic_write")
          .where("user.id = :id", { id: claims.userId })
          .getOne();
        const sessions = manager.getRepository(AuthSessionEntity);
        const session = await sessions
          .createQueryBuilder("session")
          .setLock("pessimistic_write")
          .where("session.id = :id AND session.userId = :userId", {
            id: claims.sid,
            userId: claims.userId,
          })
          .getOne();
        if (!session || session.revokedAt || session.expiresAt <= now)
          return this.unauthorized();
        if (session.refreshTokenHash !== this.digest(token!)) {
          // Token cũ bị dùng lại: thu hồi cả phiên, kể cả token mới đã cấp.
          await sessions.update(session.id, { revokedAt: now });
          return this.unauthorized();
        }
        if (
          !user ||
          user.status !== UserStatus.ACTIVE ||
          (user.loginLockedUntil && user.loginLockedUntil > now)
        )
          return this.unauthorized();
        const role = await this.roleFor(manager, user.id);
        const tokens = this.tokens(
          user.id,
          role,
          session.id,
          Math.min(
            REFRESH_TTL,
            Math.floor((session.expiresAt.getTime() - now.getTime()) / 1000),
          ),
        );
        await sessions.update(session.id, {
          refreshTokenHash: this.digest(tokens.refreshToken),
        });
        return tokens;
      },
    );
    if (result instanceof UnauthorizedException) throw result;
    return result;
  }

  async authenticate(token: string | undefined): Promise<AccessClaims> {
    const claims = this.verifyToken(token, "access");
    const now = new Date();
    const session = await this.database.manager
      .getRepository(AuthSessionEntity)
      .findOneBy({ id: claims.sid, userId: claims.userId });
    const user = await this.database.manager
      .getRepository(UserEntity)
      .findOneBy({ id: claims.userId });
    if (
      !session ||
      session.revokedAt ||
      session.expiresAt <= now ||
      !user ||
      user.status !== UserStatus.ACTIVE ||
      (user.loginLockedUntil && user.loginLockedUntil > now)
    )
      throw this.unauthorized();
    const role = await this.roleFor(this.database.manager, user.id);
    if (role !== claims.role) throw this.unauthorized();
    return { userId: user.id, role, sessionId: claims.sid };
  }

  async logout(token: string | undefined): Promise<void> {
    if (!token) return;
    let claims: TokenClaims;
    try {
      claims = this.verifyToken(token, "refresh");
    } catch {
      return;
    }

    
    await this.database.manager.getRepository(AuthSessionEntity).update(
      { id: claims.sid, userId: claims.userId },
      { revokedAt: new Date() },
    );
  }

  private tokens(
    userId: string,
    role: Role,
    sid: string,
    refreshTtl = REFRESH_TTL,
  ): IssuedSession {
    const base = { userId, role, sid };
    return {
      accessToken: sign({ ...base, type: "access" }, this.accessSecret, {
        algorithm: "HS256",
        issuer: ISSUER,
        audience: "ehealth-client",
        subject: userId,
        expiresIn: ACCESS_TTL,
        jwtid: randomUUID(),
      }),
      refreshToken: sign({ ...base, type: "refresh" }, this.refreshSecret, {
        algorithm: "HS256",
        issuer: ISSUER,
        audience: "ehealth-refresh",
        subject: userId,
        expiresIn: refreshTtl,
        jwtid: randomUUID(),
      }),
      role,
      refreshExpiresIn: refreshTtl,
    };
  }

  private verifyToken(
    token: string | undefined,
    type: "access" | "refresh",
  ): TokenClaims {
    if (!token || token.length > 4096) throw this.unauthorized();
    try {
      const claims = verify(
        token,
        type === "access" ? this.accessSecret : this.refreshSecret,
        {
          algorithms: ["HS256"],
          issuer: ISSUER,
          audience: type === "access" ? "ehealth-client" : "ehealth-refresh",
        },
      ) as TokenClaims;
      if (
        claims.type !== type ||
        typeof claims.userId !== "string" ||
        claims.sub !== claims.userId ||
        !Object.values(Role).includes(claims.role) ||
        typeof claims.sid !== "string" ||
        !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
          claims.sid,
        ) ||
        !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
          claims.userId,
        ) ||
        typeof claims.exp !== "number" ||
        typeof claims.iat !== "number"
      )
        throw new Error();
      return claims;
    } catch (error) {
      if (error instanceof TokenExpiredError) {
        throw new UnauthorizedException({
          code: "SESSION_EXPIRED",
          message: "Phiên đăng nhập đã hết hạn.",
        });
      }
      throw this.unauthorized();
    }
  }

  private digest(value: string): string {
    return createHash("sha256").update(value).digest("hex");
  }
  private unauthorized(): UnauthorizedException {
    return new UnauthorizedException({
      code: "SESSION_INVALID",
      message: "Phiên đăng nhập không hợp lệ hoặc đã hết hạn.",
    });
  }
}
