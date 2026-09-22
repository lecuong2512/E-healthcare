import './test-environment';
import { INestApplication, UnauthorizedException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Role } from '@shared/enums';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/configure-app';
import { DatabaseModule } from '../src/database/database.module';
import { SessionService } from '../src/modules/auth/session.service';
import { QueueBoardTokenService } from '../src/modules/realtime/queue-board-token.service';

describe('Queue board token HTTP permissions', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideModule(DatabaseModule)
      .useModule({
        module: class NoDatabaseModule {},
        providers: [{ provide: DataSource, useValue: {} }],
        exports: [DataSource],
      })
      .overrideProvider(SessionService)
      .useValue({
        authenticate: jest.fn(async (token?: string) => {
          if (token === 'patient-token') return { userId: 'patient', role: Role.PATIENT };
          if (token === 'reception-token') return { userId: 'receptionist', role: Role.RECEPTIONIST };
          throw new UnauthorizedException();
        }),
      })
      .compile();
    app = module.createNestApplication();
    configureApp(app);
    await app.init();
  });

  afterAll(async () => {
    if (app) await app.close();
  });

  it('lets only reception staff issue a read-only TV token', async () => {
    const path = '/api/v1/reception/queue/board-token';
    await request(app.getHttpServer()).post(path).expect(401);
    await request(app.getHttpServer()).post(path)
      .set('Authorization', 'Bearer patient-token').expect(403);
    const response = await request(app.getHttpServer()).post(path)
      .set('Authorization', 'Bearer reception-token').expect(201);
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.body).toMatchObject({ token: expect.any(String), expiresAt: expect.any(String) });
    expect(app.get(QueueBoardTokenService).verify(response.body.token)).toMatchObject({
      tokenId: expect.any(String),
    });
  });
});
