import { BadGatewayException, BadRequestException } from '@nestjs/common';
import { PaymentMethod } from '@shared/enums';
import { MomoProvider } from '../src/modules/payment/providers/momo.provider';
import { MomoCanonicalizer } from '../src/modules/payment/security/momo-canonicalizer';
import { MomoSignatureService } from '../src/modules/payment/security/momo-signature.service';

describe('MoMo sandbox provider', () => {
  const config = {
    partnerCode: 'MOMOTEST',
    accessKey: 'sandbox-access-key',
    secretKey: 'sandbox-secret-key',
    endpoint: 'https://test-payment.momo.vn/v2/gateway/api/create',
    queryEndpoint: 'https://test-payment.momo.vn/v2/gateway/api/query',
    redirectUrl: 'https://app.example.test/patient/payment-result',
    ipnUrl: 'https://api.example.test/api/v1/payments/momo/ipn',
    allowedPayHost: 'test-payment.momo.vn',
  };
  const canonicalizer = new MomoCanonicalizer();
  const signatures = new MomoSignatureService(config.secretKey);

  afterEach(() => jest.restoreAllMocks());

  function signedCreateResponse(overrides: Record<string, unknown> = {}) {
    const payload: Record<string, unknown> = {
      partnerCode: config.partnerCode,
      orderId: 'PAY202609280001',
      requestId: 'request-1',
      amount: 300_000,
      responseTime: 1_800_000_000_000,
      message: 'Successful.',
      resultCode: 0,
      payUrl: 'https://test-payment.momo.vn/v2/gateway/pay?t=sandbox',
      ...overrides,
    };
    payload.signature = signatures.sign(
      canonicalizer.createResponse(payload, config.accessKey),
    );
    return payload;
  }

  it('uses the documented create request field order', () => {
    expect(
      canonicalizer.createRequest(
        {
          amount: 1000,
          extraData: '',
          ipnUrl: 'https://api.test/ipn',
          orderId: 'ORDER1',
          orderInfo: 'Payment ORDER1',
          partnerCode: 'MOMO',
          redirectUrl: 'https://app.test/result',
          requestId: 'REQUEST1',
          requestType: 'captureWallet',
        },
        'ACCESS',
      ),
    ).toBe(
      'accessKey=ACCESS&amount=1000&extraData=&ipnUrl=https://api.test/ipn' +
        '&orderId=ORDER1&orderInfo=Payment ORDER1&partnerCode=MOMO' +
        '&redirectUrl=https://app.test/result&requestId=REQUEST1&requestType=captureWallet',
    );
  });

  it('verifies create response identity/signature and accepts only sandbox payUrl', async () => {
    const fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => signedCreateResponse(),
    } as Response);
    const result = await new MomoProvider(config).initiate({
      provider: PaymentMethod.MOMO,
      merchantTransactionId: 'PAY202609280001',
      requestId: 'request-1',
      amountVnd: 300_000,
      clientIp: '127.0.0.1',
      createdAt: new Date('2026-09-28T13:50:00.000Z'),
      expiresAt: new Date('2026-09-28T14:00:00.000Z'),
    });

    const request = JSON.parse(String(fetchSpy.mock.calls[0][1]?.body));
    expect(request.redirectUrl).toBe(config.redirectUrl);
    expect(request.ipnUrl).toBe(config.ipnUrl);
    expect(request.orderInfo).toBe('Thanh toan lich hen PAY202609280001');
    expect(request).not.toHaveProperty('patientId');
    expect(result.paymentUrl).toContain('https://test-payment.momo.vn/');
  });

  it('rejects a signed create response containing an attacker payUrl', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => signedCreateResponse({ payUrl: 'https://evil.example/pay' }),
    } as Response);

    await expect(
      new MomoProvider(config).initiate({
        provider: PaymentMethod.MOMO,
        merchantTransactionId: 'PAY202609280001',
        requestId: 'request-1',
        amountVnd: 300_000,
        clientIp: '127.0.0.1',
        createdAt: new Date(),
        expiresAt: new Date(),
      }),
    ).rejects.toBeInstanceOf(BadGatewayException);
  });

  it('rejects an unsigned create response', async () => {
    const payload = signedCreateResponse();
    delete payload.signature;
    jest.spyOn(global, 'fetch').mockResolvedValue({ ok: true, json: async () => payload } as Response);
    await expect(new MomoProvider(config).initiate({
      provider: PaymentMethod.MOMO, merchantTransactionId: 'PAY202609280001',
      requestId: 'request-1', amountVnd: 300_000, clientIp: '127.0.0.1',
      createdAt: new Date(), expiresAt: new Date(),
    })).rejects.toBeInstanceOf(BadGatewayException);
  });

  it.each([
    { signature: 'invalid' }, { orderId: 'OTHER' }, { amount: 1 },
    { resultCode: null }, { resultCode: '' }, { resultCode: 'invalid' },
    { payUrl: 'https://evil.example/pay' },
  ])('rejects invalid create response %j', async overrides => {
    const payload = signedCreateResponse(overrides);
    if ('signature' in overrides) payload.signature = overrides.signature;
    jest.spyOn(global, 'fetch').mockResolvedValue({ ok: true, json: async () => payload } as Response);
    await expect(new MomoProvider(config).initiate({
      provider: PaymentMethod.MOMO, merchantTransactionId: 'PAY202609280001',
      requestId: 'request-1', amountVnd: 300_000, clientIp: '127.0.0.1',
      createdAt: new Date(), expiresAt: new Date(),
    })).rejects.toBeInstanceOf(BadGatewayException);
  });

  it('rejects unsigned IPN', async () => {
    const payload = signedCreateResponse();
    delete payload.signature;
    await expect(new MomoProvider(config).verifyCallback(payload)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('reports MoMo HTTP 400 code 13 as a definitive configuration error', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: false, status: 400,
      json: async () => ({ resultCode: 13, message: 'Invalid merchant configuration', secret: 'must-not-expose' }),
    } as Response);
    try {
      await new MomoProvider(config).initiate({
        provider: PaymentMethod.MOMO, merchantTransactionId: 'PAY202609280001',
        requestId: 'request-1', amountVnd: 300_000, clientIp: '127.0.0.1',
        createdAt: new Date(), expiresAt: new Date(),
      });
      throw new Error('Expected initiation to fail');
    } catch (error: any) {
      expect(error.isDefinitive).toBe(true);
      expect(error.getResponse()).toMatchObject({ code: 'MOMO_CONFIGURATION_ERROR' });
      expect(error.message).toContain('mã 13');
      expect(error.message).not.toContain('must-not-expose');
    }
  });

  it.each([
    [0, 'SUCCESS'],
    [9000, 'SUCCESS'],
    [1000, 'PENDING'],
    [7000, 'PENDING'],
    [7002, 'PENDING'],
    [10, 'UNKNOWN'],
    [40, 'UNKNOWN'],
    [42, 'UNKNOWN'],
    [43, 'UNKNOWN'],
    [1006, 'FINAL_FAILED'],
  ])('maps MoMo result code %s to %s', async (resultCode, state) => {
    const payload: Record<string, unknown> = {
      partnerCode: config.partnerCode,
      orderId: 'PAY202609280001',
      requestId: 'request-1',
      amount: 300_000,
      orderInfo: 'Thanh toan lich hen PAY202609280001',
      orderType: 'momo_wallet',
      transId: 4088878653,
      resultCode,
      message: 'Sandbox result',
      payType: 'qr',
      responseTime: 1_800_000_000_000,
      extraData: '',
    };
    payload.signature = signatures.sign(canonicalizer.ipn(payload, config.accessKey));

    await expect(new MomoProvider(config).verifyCallback(payload)).resolves.toMatchObject({
      merchantTransactionId: 'PAY202609280001',
      requestId: 'request-1',
      amountVnd: 300_000,
      state,
      signatureVerified: true,
      sourceValidated: true,
    });
  });

  it('records query identity validation without claiming a response signature', async () => {
    jest.spyOn(global, 'fetch').mockImplementationOnce(async (_url, init) => {
      const request = JSON.parse(String(init?.body));
      return {
        ok: true,
        json: async () => ({
          partnerCode: config.partnerCode,
          orderId: 'PAY-QUERY',
          requestId: request.requestId,
          amount: 300_000,
          transId: 123,
          resultCode: 0,
        }),
      } as Response;
    });
    const provider = new MomoProvider(config);

    await expect(
      provider.queryStatus({
        merchantTransactionId: 'PAY-QUERY',
        amountVnd: 300_000,
      } as never),
    ).resolves.toMatchObject({ signatureVerified: false, sourceValidated: true });
  });

  it('rejects invalid IPN signatures and malformed amounts', async () => {
    const payload = {
      partnerCode: config.partnerCode,
      orderId: 'PAY1',
      requestId: 'request-1',
      amount: 300_000,
      resultCode: 0,
      signature: '0'.repeat(64),
    };
    await expect(new MomoProvider(config).verifyCallback(payload)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    await expect(
      new MomoProvider(config).initiate({
        provider: PaymentMethod.MOMO,
        merchantTransactionId: 'PAY1',
        requestId: 'request-1',
        amountVnd: 1.5,
        clientIp: '127.0.0.1',
        createdAt: new Date(),
        expiresAt: new Date(),
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects a signed IPN without a request ID', async () => {
    const payload: Record<string, unknown> = {
      partnerCode: config.partnerCode,
      orderId: 'PAY1',
      amount: 300_000,
      resultCode: 0,
      extraData: '',
    };
    payload.signature = signatures.sign(canonicalizer.ipn(payload, config.accessKey));

    await expect(new MomoProvider(config).verifyCallback(payload)).rejects.toThrow(
      'Missing MoMo request ID.',
    );
  });
});
