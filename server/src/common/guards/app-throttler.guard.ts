import { Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import { extractClientIp } from '../../modules/audit/audit-context';

@Injectable()
export class AppThrottlerGuard extends ThrottlerGuard {
  protected override async getTracker(req: Record<string, any>): Promise<string> {
    const clientIp = extractClientIp(req as any) || '127.0.0.1';

    // Per-account rate limiting for auth endpoints (login, password reset, register):
    // Key by client IP + target identifier so failed logins on one account NEVER block other users
    const identifier =
      typeof req.body?.identifier === 'string'
        ? req.body.identifier.toLowerCase().trim()
        : typeof req.body?.email === 'string'
        ? req.body.email.toLowerCase().trim()
        : typeof req.body?.phoneNumber === 'string'
        ? req.body.phoneNumber.trim()
        : typeof req.body?.phone === 'string'
        ? req.body.phone.trim()
        : '';

    if (identifier) {
      return `${clientIp}:${identifier}`;
    }

    return clientIp;
  }
}
