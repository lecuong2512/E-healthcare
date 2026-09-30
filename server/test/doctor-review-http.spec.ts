import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  INestApplication,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { APP_GUARD, Reflector } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { Role } from '@shared/enums';
import request from 'supertest';
import { REQUIRED_ROLES } from '../src/common/decorators/auth.decorators';
import { configureApp } from '../src/configure-app';
import { DoctorReviewController } from '../src/modules/doctor/doctor-review.controller';
import { DoctorReviewService } from '../src/modules/doctor/doctor-review.service';

@Injectable()
class ReviewRoleTestGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<{
      headers: Record<string, string | undefined>;
      auth?: { userId: string; role: Role };
    }>();
    const role = request.headers['x-test-role'] as Role | undefined;
    if (!role) throw new UnauthorizedException();
    const required = this.reflector.getAllAndOverride<Role[]>(REQUIRED_ROLES, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required?.includes(role)) throw new ForbiddenException();
    request.auth = { userId: 'patient-id', role };
    return true;
  }
}

describe('Doctor review HTTP contract', () => {
  let app: INestApplication;
  const doctorId = '0f415e3c-7307-45db-bb18-202bf63d42bf';
  const appointmentId = '552f60d9-a1af-48c7-ad5e-06a707657847';
  const create = jest.fn().mockResolvedValue({
    id: 'a752752f-190f-4307-b229-afb0b7ff609d',
    appointmentId,
    doctorId,
    rating: 5,
    comment: null,
    createdAt: '2026-09-28T06:00:00.000Z',
    ratingAverage: 5,
  });

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [DoctorReviewController],
      providers: [
        Reflector,
        { provide: DoctorReviewService, useValue: { create } },
        { provide: APP_GUARD, useClass: ReviewRoleTestGuard },
      ],
    }).compile();
    app = module.createNestApplication();
    configureApp(app);
    await app.init();
  });

  beforeEach(() => create.mockClear());

  afterAll(async () => app.close());

  const post = (role?: Role, body: Record<string, unknown> = {}) => {
    const call = request(app.getHttpServer())
      .post(`/api/v1/doctors/${doctorId}/reviews`)
      .send({ appointmentId, rating: 5, ...body });
    return role ? call.set('x-test-role', role) : call;
  };

  it.each([1, 5])('accepts boundary rating %s for a patient', async (rating) => {
    await post(Role.PATIENT, { rating }).expect(201);
    expect(create).toHaveBeenLastCalledWith(
      doctorId,
      'patient-id',
      expect.objectContaining({ appointmentId, rating }),
    );
  });

  it.each([0, 6, 1.5])('rejects invalid rating %s', async (rating) => {
    await post(Role.PATIENT, { rating }).expect(400);
    expect(create).not.toHaveBeenCalled();
  });

  it('enforces appointment UUID, comment length, and unknown-field rejection', async () => {
    await post(Role.PATIENT, { appointmentId: 'not-a-uuid' }).expect(400);
    await post(Role.PATIENT, { comment: 'a'.repeat(500) }).expect(201);
    await post(Role.PATIENT, { comment: 'a'.repeat(501) }).expect(400);
    await post(Role.PATIENT, { patientId: 'forged-patient' }).expect(400);
  });

  it('rejects unauthenticated and non-patient roles', async () => {
    await post().expect(401);
    await post(Role.DOCTOR).expect(403);
    await post(Role.ADMIN).expect(403);
    await post(Role.RECEPTIONIST).expect(403);
    expect(create).not.toHaveBeenCalled();
  });
});
