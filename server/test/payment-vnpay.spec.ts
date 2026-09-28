import { BadRequestException } from '@nestjs/common';
import { createHmac } from 'node:crypto';
import { PaymentMethod } from '@shared/enums';
import { VnpayProvider } from '../src/modules/payment/providers/vnpay.provider';
import { safeEqualHex } from '../src/modules/payment/security/safe-signature';
import { VnpayCanonicalizer } from '../src/modules/payment/security/vnpay-canonicalizer';
import { VnpaySignatureService } from '../src/modules/payment/security/vnpay-signature.service';

describe('VNPAY 2.1 sandbox provider', () => {
  const secret = 'sandbox-secret-never-log';
  const config = {
    tmnCode: 'DEMOV210',
    hashSecret: secret,
    payUrl: 'https://sandbox.vnpayment.vn/paymentv2/vpcpay.html',
    returnUrl: 'https://app.example.test/patient/payment-result',
    ipnUrl: 'https://api.example.test/api/v1/payments/vnpay/ipn',
    queryUrl: 'https://sandbox.vnpayment.vn/merchant_webapi/api/transaction',
  };

  it('canonicalizes sorted VNPAY fields and excludes secure hash fields', () => {
    const canonical = new VnpayCanonicalizer().canonicalize({
      vnp_TxnRef: 'PAY 01',
      ignored: 'secret',
      vnp_Amount: '100000',
      vnp_SecureHash: 'do-not-sign',
      vnp_OrderInfo: 'Thanh toan: lich hen',
    });

    expect(canonical).toBe(
      'vnp_Amount=100000&vnp_OrderInfo=Thanh+toan%3A+lich+hen&vnp_TxnRef=PAY+01',
    );
  });

  it('uses HMAC-SHA512 and constant-time compatible hex validation', () => {
    const payload = { vnp_Amount: '100000', vnp_TxnRef: 'PAY01' };
    const canonical = 'vnp_Amount=100000&vnp_TxnRef=PAY01';
    const expected = createHmac('sha512', secret).update(canonical).digest('hex');
    const signatures = new VnpaySignatureService(secret);

    expect(signatures.sign(payload)).toBe(expected);
    expect(signatures.verify(payload, expected)).toBe(true);
    expect(safeEqualHex(expected, 'not-hex', 128)).toBe(false);
  });

  it('creates a server-controlled payment URL without PHI', async () => {
    const result = await new VnpayProvider(config).initiate({
      provider: PaymentMethod.VNPAY,
      merchantTransactionId: 'PAY202609280001',
      requestId: 'request-1',
      amountVnd: 300_000,
      clientIp: '127.0.0.1',
      expiresAt: new Date('2026-09-28T14:00:00.000Z'),
    });
    const url = new URL(result.paymentUrl);

    expect(`${url.origin}${url.pathname}`).toBe(config.payUrl);
    expect(url.searchParams.get('vnp_Amount')).toBe('30000000');
    expect(url.searchParams.get('vnp_ReturnUrl')).toBe(config.returnUrl);
    expect(url.searchParams.get('vnp_SecureHash')).toMatch(/^[0-9a-f]{128}$/);
    expect(url.searchParams.get('vnp_OrderInfo')).toBe(
      'Thanh toan lich hen PAY202609280001',
    );
    expect(result.paymentUrl).not.toContain('reasonForVisit');
  });

  it('verifies callback signature and normalizes a successful transaction', async () => {
    const payload: Record<string, string> = {
      vnp_TmnCode: config.tmnCode,
      vnp_TxnRef: 'PAY202609280001',
      vnp_Amount: '30000000',
      vnp_ResponseCode: '00',
      vnp_TransactionStatus: '00',
      vnp_TransactionNo: '14500001',
      vnp_OrderInfo: 'Thanh toan lich hen PAY202609280001',
    };
    payload.vnp_SecureHash = new VnpaySignatureService(secret).sign(payload);

    await expect(new VnpayProvider(config).verifyCallback(payload)).resolves.toMatchObject({
      provider: PaymentMethod.VNPAY,
      merchantTransactionId: 'PAY202609280001',
      providerTransactionId: '14500001',
      amountVnd: 300_000,
      state: 'SUCCESS',
      signatureVerified: true,
    });
  });

  it('rejects tampering, malformed amounts, and invalid integer VND input', async () => {
    const provider = new VnpayProvider(config);
    const payload: Record<string, string> = {
      vnp_TmnCode: config.tmnCode,
      vnp_TxnRef: 'PAY01',
      vnp_Amount: '100000',
      vnp_ResponseCode: '00',
      vnp_TransactionStatus: '00',
    };
    payload.vnp_SecureHash = new VnpaySignatureService(secret).sign(payload);
    payload.vnp_Amount = '200000';

    await expect(provider.verifyCallback(payload)).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      provider.initiate({
        provider: PaymentMethod.VNPAY,
        merchantTransactionId: 'PAY01',
        requestId: 'request-1',
        amountVnd: 1.5,
        clientIp: '127.0.0.1',
        expiresAt: new Date(),
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
