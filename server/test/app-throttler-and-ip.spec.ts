import './test-environment';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import request from 'supertest';
import { Request } from 'express';
import { AppModule } from '../src/app.module';
import { DatabaseModule } from '../src/database/database.module';
import { configureApp } from '../src/configure-app';
import { extractClientIp, normalizeIp } from '../src/modules/audit/audit-context';
import { LoginService } from '../src/modules/auth/login.service';
import { UnauthorizedException } from '@nestjs/common';

describe('AppThrottlerGuard and IP Extraction', () => {
  describe('extractClientIp and normalizeIp', () => {
    it('normalizes IPv6-mapped IPv4 addresses', () => {
      expect(normalizeIp('::ffff:127.0.0.1')).toBe('127.0.0.1');
      expect(normalizeIp('::ffff:14.232.208.5')).toBe('14.232.208.5');
      expect(normalizeIp('192.168.1.1')).toBe('192.168.1.1');
      expect(normalizeIp('2001:db8::1')).toBe('2001:db8::1');
    });

    it('extracts client IP from X-Forwarded-For first entry', () => {
      const req = {
        headers: {
          'x-forwarded-for': '14.232.208.5, 10.0.0.1',
        },
      } as unknown as Request;
      expect(extractClientIp(req)).toBe('14.232.208.5');
    });

    it('extracts client IP from X-Real-IP when X-Forwarded-For is missing', () => {
      const req = {
        headers: {
          'x-real-ip': '113.161.45.67',
        },
      } as unknown as Request;
      expect(extractClientIp(req)).toBe('113.161.45.67');
    });

    it('falls back to request.ip when headers are absent', () => {
      const req = {
        headers: {},
        ip: '::ffff:127.0.0.1',
      } as unknown as Request;
      expect(extractClientIp(req)).toBe('127.0.0.1');
    });
  });

  describe('Login Rate-Limiting Isolation', () => {
    let app: INestApplication;
    const loginMock = jest.fn();

    beforeAll(async () => {
      loginMock.mockImplementation(() => {
        throw new UnauthorizedException('Tài khoản hoặc mật khẩu không chính xác.');
      });

      const module = await Test.createTestingModule({ imports: [AppModule] })
        .overrideModule(DatabaseModule)
        .useModule({
          module: class NoDatabaseModule {},
          providers: [{ provide: DataSource, useValue: {} }],
          exports: [DataSource],
        })
        .overrideProvider(LoginService)
        .useValue({ login: loginMock })
        .compile();

      app = module.createNestApplication();
      configureApp(app);
      await app.init();
    });

    afterAll(async () => {
      if (app) await app.close();
    });

    it('isolates 10 login failures to target account without blocking other accounts on the same IP', async () => {
      const clientIp = '14.232.100.20';
      const accountA = { identifier: 'user_a@ehealth.local', password: 'WrongPassword1!' };
      const accountB = { identifier: 'user_b@ehealth.local', password: 'ValidPassword1!' };

      // 10 failed login attempts for Account A
      for (let i = 0; i < 10; i++) {
        await request(app.getHttpServer())
          .post('/api/v1/auth/login')
          .set('X-Forwarded-For', clientIp)
          .send(accountA)
          .expect(401);
      }

      // 11th request for Account A should be rejected with 429 Too Many Requests
      await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .set('X-Forwarded-For', clientIp)
        .send(accountA)
        .expect(429);

      // CRITICAL: Account B from the SAME clientIp MUST NOT be blocked by Account A's rate limit!
      await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .set('X-Forwarded-For', clientIp)
        .send(accountB)
        .expect(401); // 401 Unauthorized (allowed through to service), NOT 429 Too Many Requests!
    });
  });
});
