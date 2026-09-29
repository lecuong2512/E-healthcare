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
import request from 'supertest';
import { PaymentMethod, Role } from '@shared/enums';
import {
  PUBLIC_ROUTE,
  REQUIRED_ROLES,
} from '../src/common/decorators/auth.decorators';
import { configureApp } from '../src/configure-app';
import { PaymentController } from '../src/modules/payment/payment.controller';
import { PaymentService } from '../src/modules/payment/payment.service';
import { PaymentReconciliationService } from '../src/modules/payment/payment-reconciliation.service';

@Injectable()
class PaymentRoleTestGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    if (
      this.reflector.getAllAndOverride<boolean>(PUBLIC_ROUTE, [
        context.getHandler(),
        context.getClass(),
      ])
    ) {
      return true;
    }
    const request = context.switchToHttp().getRequest<{
      headers: Record<string, string | undefined>;
      auth?: { userId: string; role: Role };
    }>();
    const role = request.headers['x-test-role'] as Role | undefined;
    if (!role) throw new UnauthorizedException();
    const roles = this.reflector.getAllAndOverride<Role[]>(REQUIRED_ROLES, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (roles && !roles.includes(role)) throw new ForbiddenException();
    request.auth = { userId: 'patient-id', role };
    return true;
  }
}

describe('Payment HTTP authorization and DTO contract', () => {
  const appointmentId = '552f60d9-a1af-48c7-ad5e-06a707657847';
  const idempotencyKey = 'a752752f-190f-4307-b229-afb0b7ff609d';
  const transactionId = '652f60d9-a1af-48c7-ad5e-06a707657847';
  let app: INestApplication;
  const payments = {
    initiate: jest.fn().mockResolvedValue({
      transactionId: 'payment-id',
      appointmentId,
      provider: PaymentMethod.VNPAY,
      merchantTransactionId: 'PAY01',
      paymentUrl: 'https://sandbox.vnpayment.vn/paymentv2/vpcpay.html?signed=true',
      expiresAt: new Date().toISOString(),
    }),
    status: jest.fn().mockResolvedValue({}),
    handleVnpayIpn: jest.fn().mockResolvedValue('SUCCESS'),
    handleMomoIpn: jest.fn().mockResolvedValue('SUCCESS'),
    pendingRefunds: jest.fn().mockResolvedValue([]),
    resolveRefund: jest.fn().mockResolvedValue({ status: 'SUCCEEDED' }),
  };
  const reconciliation = {
    manualReviewTransactions: jest.fn().mockResolvedValue([]),
    manualReconcile: jest.fn().mockResolvedValue({}),
    resolveManual: jest.fn().mockResolvedValue({}),
  };

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [PaymentController],
      providers: [
        Reflector,
        { provide: PaymentService, useValue: payments },
        { provide: PaymentReconciliationService, useValue: reconciliation },
        { provide: APP_GUARD, useClass: PaymentRoleTestGuard },
      ],
    }).compile();
    app = module.createNestApplication();
    configureApp(app);
    await app.init();
  });

  beforeEach(() => jest.clearAllMocks());
  afterAll(async () => app.close());

  it('allows only an authenticated patient to initiate payment', async () => {
    const endpoint = `/api/v1/payments/${appointmentId}/initiate`;
    await request(app.getHttpServer())
      .post(endpoint)
      .set('idempotency-key', idempotencyKey)
      .send({ provider: PaymentMethod.VNPAY })
      .expect(401);
    await request(app.getHttpServer())
      .post(endpoint)
      .set('x-test-role', Role.DOCTOR)
      .set('idempotency-key', idempotencyKey)
      .send({ provider: PaymentMethod.VNPAY })
      .expect(403);
    await request(app.getHttpServer())
      .post(endpoint)
      .set('x-test-role', Role.PATIENT)
      .set('idempotency-key', idempotencyKey)
      .send({ provider: PaymentMethod.VNPAY })
      .expect(201);
    expect(payments.initiate).toHaveBeenCalledWith(
      appointmentId,
      'patient-id',
      idempotencyKey,
      { provider: PaymentMethod.VNPAY },
      expect.any(String),
    );
  });

  it('rejects unsupported providers and client-controlled payment fields', async () => {
    const endpoint = `/api/v1/payments/${appointmentId}/initiate`;
    await request(app.getHttpServer())
      .post(endpoint)
      .set('x-test-role', Role.PATIENT)
      .set('idempotency-key', idempotencyKey)
      .send({ provider: PaymentMethod.PAY_AT_CLINIC })
      .expect(400);
    await request(app.getHttpServer())
      .post(endpoint)
      .set('x-test-role', Role.PATIENT)
      .set('idempotency-key', idempotencyKey)
      .send({ provider: PaymentMethod.VNPAY, amount: 1, returnUrl: 'https://evil.test' })
      .expect(400);
  });

  it('protects payment status while allowing provider IPNs without login', async () => {
    await request(app.getHttpServer())
      .get(`/api/v1/payments/${appointmentId}/status`)
      .expect(401);
    await request(app.getHttpServer())
      .get(`/api/v1/payments/${appointmentId}/status`)
      .set('x-test-role', Role.PATIENT)
      .expect(200);
    await request(app.getHttpServer())
      .get('/api/v1/payments/vnpay/ipn?vnp_TxnRef=PAY01')
      .expect(200, { RspCode: '00', Message: 'Confirm Success' });
    await request(app.getHttpServer())
      .post('/api/v1/payments/momo/ipn')
      .send({ orderId: 'PAY01' })
      .expect(204, '');
  });

  it('restricts manual refund workflow to administrators', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/payments/refunds/pending')
      .set('x-test-role', Role.PATIENT)
      .expect(403);
    await request(app.getHttpServer())
      .get('/api/v1/payments/refunds/pending')
      .set('x-test-role', Role.ADMIN)
      .expect(200);
  });

  it('restricts reconciliation operations and validates controlled outcomes', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/payments/reconciliation/manual-review')
      .set('x-test-role', Role.PATIENT)
      .expect(403);
    await request(app.getHttpServer())
      .get('/api/v1/payments/reconciliation/manual-review')
      .set('x-test-role', Role.ADMIN)
      .expect(200);
    await request(app.getHttpServer())
      .post(`/api/v1/payments/${transactionId}/reconcile`)
      .set('x-test-role', Role.ADMIN)
      .expect(201);
    await request(app.getHttpServer())
      .post(`/api/v1/payments/${transactionId}/resolve-reconciliation`)
      .set('x-test-role', Role.ADMIN)
      .send({ outcome: 'MARK_PAID' })
      .expect(400);
    await request(app.getHttpServer())
      .post(`/api/v1/payments/${transactionId}/resolve-reconciliation`)
      .set('x-test-role', Role.ADMIN)
      .send({ outcome: 'MARK_FAILED' })
      .expect(201);
    expect(reconciliation.resolveManual).toHaveBeenCalledWith(
      transactionId,
      'patient-id',
      'MARK_FAILED',
    );
  });
});
