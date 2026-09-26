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
import { CheckInQrService } from '../src/modules/reception/check-in-qr.service';

describe('QR check-in HTTP permissions', () => {
  const appointmentId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  const patientId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
  const issue = jest.fn(async () => ({ qrToken: 'signed-token', expiresAt: new Date().toISOString() }));
  const lookup = jest.fn(async () => ({ id: appointmentId }));
  const checkIn = jest.fn(async () => ({ appointmentId }));
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
          if (token === 'patient-token') return { userId: patientId, role: Role.PATIENT };
          if (token === 'reception-token') return { userId: 'receptionist', role: Role.RECEPTIONIST };
          throw new UnauthorizedException();
        }),
      })
      .overrideProvider(CheckInQrService)
      .useValue({ issue, lookup, checkIn })
      .compile();
    app = module.createNestApplication();
    configureApp(app);
    await app.init();
  });

  afterAll(async () => {
    if (app) await app.close();
  });

  beforeEach(() => jest.clearAllMocks());

  it('only lets the owning patient account request a QR', async () => {
    await request(app.getHttpServer())
      .get(`/api/v1/appointments/${appointmentId}/check-in-qr`)
      .expect(401);
    await request(app.getHttpServer())
      .get(`/api/v1/appointments/${appointmentId}/check-in-qr`)
      .set('Authorization', 'Bearer reception-token')
      .expect(403);
    const response = await request(app.getHttpServer())
      .get(`/api/v1/appointments/${appointmentId}/check-in-qr`)
      .set('Authorization', 'Bearer patient-token')
      .expect(200);
    expect(response.headers['cache-control']).toBe('no-store');
    expect(issue).toHaveBeenCalledWith(appointmentId, patientId);
  });

  it('only lets reception staff scan a QR', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/reception/qr/lookup')
      .set('Authorization', 'Bearer patient-token')
      .send({ qrToken: 'signed-token' })
      .expect(403);
    await request(app.getHttpServer())
      .post('/api/v1/reception/qr/lookup')
      .set('Authorization', 'Bearer reception-token')
      .send({ qrToken: 'signed-token' })
      .expect(200);
    expect(lookup).toHaveBeenCalledWith('signed-token', expect.objectContaining({ actorId: 'receptionist' }));
  });
});
