import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from "@nestjs/common";
import { OAuth2Client, CodeChallengeMethod } from "google-auth-library";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { DataSource, EntityManager } from "typeorm";
import { Role } from "../../../shared/src/enums/role.enum";
import { environment } from "../config/environment";
import { GoogleCompleteDto } from "./dto/google-complete.dto";
import { SessionService } from "./session.service";

export interface GoogleIssuedSession {
  accessToken: string;
  role: Role;
  refreshToken: string;
}
interface GoogleUser {
  id: string;
  google_subject: string | null;
  status: string;
  login_locked_until: Date | null;
}
const hash = (value: string): string =>
  createHash("sha256").update(value).digest("hex");
const secret = (): string => randomBytes(32).toString("base64url");

@Injectable()
export class GoogleAuthService {
  constructor(
    private readonly database: DataSource,
    private readonly sessions: SessionService,
  ) {}

  private client(): OAuth2Client {
    const id = environment["GOOGLE_CLIENT_ID"];
    const key = environment["GOOGLE_CLIENT_SECRET"];
    const redirect = environment["GOOGLE_REDIRECT_URI"];
    if (!id || !key || !redirect)
      throw new ServiceUnavailableException(
        "Đăng nhập Google chưa được cấu hình.",
      );
    let redirectUrl: URL;
    try {
      redirectUrl = new URL(redirect);
    } catch {
      throw new ServiceUnavailableException(
        "Địa chỉ callback Google không hợp lệ.",
      );
    }
    if (
      redirectUrl.username ||
      redirectUrl.password ||
      redirectUrl.search ||
      redirectUrl.hash ||
      redirectUrl.pathname !== "/api/v1/auth/google/callback" ||
      (environment["NODE_ENV"] === "production" &&
        redirectUrl.protocol !== "https:") ||
      !["https:", "http:"].includes(redirectUrl.protocol)
    )
      throw new ServiceUnavailableException(
        "Callback Google phải đúng đường dẫn API và dùng HTTPS khi triển khai.",
      );
    return new OAuth2Client(id, key, redirect);
  }
  //tạo Google login URL 
  async start(): Promise<{ url: string; browserToken: string }> {
    const client = this.client();
    const state = secret(),
      nonce = secret(),
      browserToken = secret();
    const verifier = await client.generateCodeVerifierAsync();
    const url = client.generateAuthUrl({
      scope: ["openid", "email", "profile"],
      state,
      nonce,
      code_challenge: verifier.codeChallenge,
      code_challenge_method: CodeChallengeMethod.S256,
    });
    await this.database.query(
      "DELETE FROM google_oauth_flows WHERE expires_at <= clock_timestamp()",
    );
    await this.database.query(
      `INSERT INTO google_oauth_flows
      (id, state_hash, browser_hash, nonce_hash, code_verifier, expires_at)
      VALUES ($1,$2,$3,$4,$5,clock_timestamp() + interval '5 minutes')`,
      [
        randomUUID(),
        hash(state),
        hash(browserToken),
        hash(nonce),
        verifier.codeVerifier,
      ],
    );
    return { url, browserToken };
  }

  //Google callback 
  async callback(
    code: string,
    state: string,
    browserToken: string,
  ): Promise<{ session?: GoogleIssuedSession; completionToken?: string }> {
    const client = this.client();
    if (
      !code ||
      !state ||
      !browserToken ||
      code.length > 4096 ||
      state.length > 256 ||
      browserToken.length > 256
    )
      throw new UnauthorizedException("Phiên đăng nhập Google không hợp lệ.");
    // Xóa nguyên tử trước khi trao đổi mã để mỗi phiên chỉ sử dụng một lần.
    const [flow]: { nonce_hash: string; code_verifier: string }[] =
      await this.database.query(
        `WITH consumed AS (DELETE FROM google_oauth_flows
      WHERE state_hash=$1 AND browser_hash=$2 AND expires_at > clock_timestamp() RETURNING nonce_hash,code_verifier)
      SELECT nonce_hash,code_verifier FROM consumed`,
        [hash(state), hash(browserToken)],
      );
    if (!flow)
      throw new UnauthorizedException(
        "Phiên đăng nhập Google đã hết hạn hoặc đã được sử dụng.",
      );
    let identity: {
      sub: string;
      email: string;
      name: string;
      authoritativeEmail: boolean;
    };
    try {
      const { tokens } = await client.getToken({
        code,
        codeVerifier: flow.code_verifier,
      });
      if (!tokens.id_token) throw new Error("Thiếu ID token");
      const ticket = await client.verifyIdToken({
        idToken: tokens.id_token,
        audience: environment["GOOGLE_CLIENT_ID"]!,
      });
      const payload = ticket.getPayload() as ReturnType<
        typeof ticket.getPayload
      > & { nonce?: string };
      if (
        !payload ||
        !payload.sub ||
        payload.sub.length > 255 ||
        !payload.email ||
        payload.email.length > 100 ||
        payload.email_verified !== true ||
        !["accounts.google.com", "https://accounts.google.com"].includes(
          payload.iss,
        ) ||
        payload.aud !== environment["GOOGLE_CLIENT_ID"] ||
        payload.exp <= Date.now() / 1000 ||
        !payload.nonce ||
        hash(payload.nonce) !== flow.nonce_hash
      )
        throw new Error("Danh tính Google không hợp lệ");
      const email = payload.email.trim().toLowerCase();
      identity = {
        sub: payload.sub,
        email,
        name: (payload.name ?? "").slice(0, 100),
        authoritativeEmail:
          email.endsWith("@gmail.com") ||
          (typeof payload.hd === "string" && payload.hd.length > 0),
      };
    } catch {
      throw new UnauthorizedException("Không thể xác thực danh tính Google.");
    }
    return this.database.transaction(async (manager) => {
      await this.lockIdentity(manager, identity.email, identity.sub);
      const [user]: GoogleUser[] = await manager.query(
        "SELECT id,google_subject,status,login_locked_until FROM users WHERE google_subject=$1 OR lower(email)=$2 ORDER BY (google_subject=$1) DESC NULLS LAST FOR UPDATE",
        [identity.sub, identity.email],
      );
      if (user) {
        await this.assertActive(manager, user);
        if (user.google_subject && user.google_subject !== identity.sub)
          throw new ConflictException(
            "Email đã liên kết với tài khoản Google khác.",
          );
        // Google chỉ bảo đảm quyền sở hữu email Gmail hoặc email thuộc Workspace có claim hd.
        if (!user.google_subject && !identity.authoritativeEmail)
          throw new ConflictException(
            "Email đã được đăng ký. Vui lòng đăng nhập bằng mật khẩu; không thể tự động liên kết email bên ngoài Google.",
          );
        const role = await this.sessions.roleFor(manager, user.id);
        await manager.query(
          "UPDATE users SET google_subject=$2,failed_login_attempts=0,login_locked_until=NULL WHERE id=$1",
          [user.id, identity.sub],
        );
        return {
          session: await this.sessions.issueSession(manager, user.id, role),
        };
      }
      const completionToken = secret();
      await manager.query(
        "DELETE FROM google_registration_sessions WHERE google_subject=$1 OR email=$2 OR expires_at<=clock_timestamp()",
        [identity.sub, identity.email],
      );
      await manager.query(
        `INSERT INTO google_registration_sessions (token_hash,google_subject,email,full_name,expires_at)
        VALUES ($1,$2,$3,$4,clock_timestamp() + interval '10 minutes')`,
        [hash(completionToken), identity.sub, identity.email, identity.name],
      );
      return { completionToken };
    });
  }

  //Check infor, create patient user  
  async complete(
    token: string,
    dto: GoogleCompleteDto,
  ): Promise<GoogleIssuedSession> {
    if (!token || token.length > 256)
      throw new UnauthorizedException("Phiên đăng ký Google không hợp lệ.");
    if (dto.dateOfBirth > new Date().toISOString().slice(0, 10))
      throw new BadRequestException("Ngày sinh không được ở tương lai.");
    const [contact]: { email: string; google_subject: string }[] =
      await this.database.query(
        "SELECT email,google_subject FROM google_registration_sessions WHERE token_hash=$1",
        [hash(token)],
      );
    if (!contact)
      throw new UnauthorizedException("Phiên đăng ký Google không hợp lệ.");
    return this.database.transaction(async (manager) => {
      await this.lockIdentity(manager, contact.email, contact.google_subject);
      const [pending]: { email: string; google_subject: string }[] =
        await manager.query(
          "WITH consumed AS (DELETE FROM google_registration_sessions WHERE token_hash=$1 AND expires_at>clock_timestamp() RETURNING email,google_subject) SELECT email,google_subject FROM consumed",
          [hash(token)],
        );
      if (!pending)
        throw new UnauthorizedException(
          "Phiên đăng ký Google đã hết hạn hoặc đã được sử dụng.",
        );
      const [existing] = await manager.query(
        "SELECT id FROM users WHERE google_subject=$1 OR lower(email)=$2",
        [pending.google_subject, pending.email],
      );
      if (existing)
        throw new ConflictException(
          "Email đã được đăng ký. Vui lòng đăng nhập lại bằng Google.",
        );
      const [user]: { id: string }[] = await manager.query(
        `INSERT INTO users (email,full_name,gender,date_of_birth,status,google_subject)
        VALUES ($1,$2,$3,$4,'ACTIVE',$5) RETURNING id`,
        [
          pending.email,
          dto.fullName,
          dto.gender,
          dto.dateOfBirth,
          pending.google_subject,
        ],
      );
      await manager.query(
        "INSERT INTO user_roles (user_id,role) VALUES ($1,$2)",
        [user.id, Role.PATIENT],
      );
      await manager.query(
        "INSERT INTO personal_health_profiles (user_id) VALUES ($1)",
        [user.id],
      );
      return this.sessions.issueSession(manager, user.id, Role.PATIENT);
    });
  }

  private async lockIdentity(
    manager: EntityManager,
    email: string,
    sub: string,
  ): Promise<void> {
    await manager.query(
      "SELECT pg_advisory_xact_lock(hashtextextended($1, 0))",
      [`register:email:${email}`],
    );
    await manager.query(
      "SELECT pg_advisory_xact_lock(hashtextextended($1, 0))",
      [`google:subject:${sub}`],
    );
  }

  private async assertActive(
    manager: EntityManager,
    user: GoogleUser,
  ): Promise<void> {
    const [{ now }]: { now: Date }[] = await manager.query(
      "SELECT clock_timestamp() AS now",
    );
    if (user.status !== "ACTIVE")
      throw new ForbiddenException("Tài khoản chưa hoạt động hoặc đã bị khóa.");
    if (user.login_locked_until && user.login_locked_until > now)
      throw new ForbiddenException("Tài khoản đang tạm khóa đăng nhập.");
  }
}
