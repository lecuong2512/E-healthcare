import { randomUUID } from 'node:crypto';
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PublicQueueBoardToken } from '@shared/interfaces';
import { sign, TokenExpiredError, verify } from 'jsonwebtoken';
import { environment, requiredEnvironment } from '../../config/environment';

const BOARD_TTL_SECONDS = 8 * 60 * 60;
const ISSUER = 'ehealth-api';
const AUDIENCE = 'ehealth-public-queue';

@Injectable()
export class QueueBoardTokenService {
  private readonly secret: string;

  constructor() {
    this.secret = requiredEnvironment('QUEUE_BOARD_SECRET');
    if (
      Buffer.byteLength(this.secret) < 32 ||
      this.secret.startsWith('your_') ||
      [environment.JWT_ACCESS_SECRET, environment.JWT_REFRESH_SECRET,
        environment.QR_CHECKIN_SECRET].includes(this.secret)
    ) {
      throw new Error('QUEUE_BOARD_SECRET phải là secret riêng, ngẫu nhiên và dài ít nhất 32 byte.');
    }
  }

  issue(): PublicQueueBoardToken {
    const issuedAt = Math.floor(Date.now() / 1000);
    const expiresAt = issuedAt + BOARD_TTL_SECONDS;
    const token = sign({ type: 'queue_board', iat: issuedAt, exp: expiresAt }, this.secret, {
      algorithm: 'HS256', issuer: ISSUER, audience: AUDIENCE, jwtid: randomUUID(),
    });
    return { token, expiresAt: new Date(expiresAt * 1000).toISOString() };
  }

  verify(token: string): { tokenId: string; expiresAt: number } {
    if (token.length > 4096) throw this.invalid();
    try {
      const claims = verify(token, this.secret, {
        algorithms: ['HS256'], issuer: ISSUER, audience: AUDIENCE,
      });
      if (
        typeof claims === 'string' || claims.type !== 'queue_board' ||
        typeof claims.jti !== 'string' || typeof claims.iat !== 'number' ||
        typeof claims.exp !== 'number' || claims.exp <= claims.iat ||
        claims.exp - claims.iat > BOARD_TTL_SECONDS ||
        claims.iat > Math.floor(Date.now() / 1000)
      ) throw new Error('Invalid board claims');
      return { tokenId: claims.jti, expiresAt: claims.exp * 1000 };
    } catch (error) {
      if (error instanceof TokenExpiredError) {
        throw new UnauthorizedException({ code: 'SESSION_EXPIRED', message: 'Token bảng hàng đợi đã hết hạn.' });
      }
      throw this.invalid();
    }
  }

  private invalid(): UnauthorizedException {
    return new UnauthorizedException({ code: 'BOARD_TOKEN_INVALID', message: 'Token bảng hàng đợi không hợp lệ.' });
  }
}
