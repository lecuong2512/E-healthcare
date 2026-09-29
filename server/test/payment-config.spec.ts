import { PaymentConfiguration } from '../src/modules/payment/payment-config';

describe('PaymentConfiguration isolation', () => {
  const keys = [
    'PAYMENT_ENABLED',
    'PAYMENT_ENV',
    'PAYMENT_TIMEOUT_SECONDS',
    'VNPAY_TMN_CODE',
    'VNPAY_HASH_SECRET',
    'VNPAY_PAY_URL',
    'VNPAY_QUERY_URL',
    'VNPAY_SERVER_IP',
    'VNPAY_RETURN_URL',
    'VNPAY_IPN_URL',
    'MOMO_PARTNER_CODE',
    'MOMO_ACCESS_KEY',
    'MOMO_SECRET_KEY',
    'MOMO_ENDPOINT',
    'MOMO_QUERY_ENDPOINT',
    'MOMO_REDIRECT_URL',
    'MOMO_IPN_URL',
  ] as const;
  const original = Object.fromEntries(keys.map((key) => [key, process.env[key]]));

  beforeEach(() => {
    Object.assign(process.env, {
      PAYMENT_ENABLED: 'true',
      PAYMENT_ENV: 'sandbox',
      PAYMENT_TIMEOUT_SECONDS: '600',
      VNPAY_TMN_CODE: 'TESTCODE',
      VNPAY_HASH_SECRET: 'vnpay-secret',
      VNPAY_PAY_URL: 'https://sandbox.vnpayment.vn/paymentv2/vpcpay.html',
      VNPAY_QUERY_URL: 'https://sandbox.vnpayment.vn/merchant_webapi/api/transaction',
      VNPAY_SERVER_IP: '203.0.113.10',
      VNPAY_RETURN_URL: 'https://app.example.test/patient/payment-result',
      VNPAY_IPN_URL: 'https://api.example.test/api/v1/payments/vnpay/ipn',
      MOMO_PARTNER_CODE: 'MOMOTEST',
      MOMO_ACCESS_KEY: 'momo-access',
      MOMO_SECRET_KEY: 'momo-secret',
      MOMO_ENDPOINT: 'https://test-payment.momo.vn/v2/gateway/api/create',
      MOMO_QUERY_ENDPOINT: 'https://test-payment.momo.vn/v2/gateway/api/query',
      MOMO_REDIRECT_URL: 'https://app.example.test/patient/payment-result',
      MOMO_IPN_URL: 'https://api.example.test/api/v1/payments/momo/ipn',
    });
  });

  afterAll(() => {
    for (const key of keys) {
      const value = original[key];
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  it('accepts a complete sandbox-only configuration', () => {
    expect(() => new PaymentConfiguration().onModuleInit()).not.toThrow();
  });

  it('rejects arbitrary or production payment endpoints in sandbox mode', () => {
    process.env.VNPAY_PAY_URL = 'https://evil.example/payment';
    expect(() => new PaymentConfiguration().vnpay()).toThrow(/sandbox\.vnpayment\.vn/i);

    process.env.MOMO_ENDPOINT = 'https://payment.momo.vn/v2/gateway/api/create';
    expect(() => new PaymentConfiguration().momo()).toThrow(/test-payment\.momo\.vn/i);
  });

  it('rejects sandbox endpoints when production mode is selected', () => {
    process.env.PAYMENT_ENV = 'production';
    expect(() => new PaymentConfiguration().vnpay()).toThrow(/production/i);
    expect(() => new PaymentConfiguration().momo()).toThrow(/production/i);
  });

  it('accepts only exact production provider hosts', () => {
    Object.assign(process.env, {
      PAYMENT_ENV: 'production',
      VNPAY_PAY_URL: 'https://pay.vnpay.vn/vpcpay.html',
      VNPAY_QUERY_URL: 'https://merchant.vnpay.vn/merchant_webapi/api/transaction',
      MOMO_ENDPOINT: 'https://payment.momo.vn/v2/gateway/api/create',
      MOMO_QUERY_ENDPOINT: 'https://payment.momo.vn/v2/gateway/api/query',
    });
    expect(() => new PaymentConfiguration().onModuleInit()).not.toThrow();

    process.env.VNPAY_PAY_URL = 'https://payments.attacker.example/vpcpay.html';
    expect(() => new PaymentConfiguration().vnpay()).toThrow(/pay\.vnpay\.vn/i);
  });

  it('requires an explicit enable or disable switch', () => {
    delete process.env.PAYMENT_ENABLED;
    expect(() => new PaymentConfiguration().onModuleInit()).toThrow(/PAYMENT_ENABLED/);

    process.env.PAYMENT_ENABLED = 'false';
    delete process.env.VNPAY_HASH_SECRET;
    expect(() => new PaymentConfiguration().onModuleInit()).not.toThrow();
    expect(() => new PaymentConfiguration().vnpay()).toThrow(/disabled/i);
  });

  it('fails closed for missing secrets, non-HTTPS URLs, and unsafe timeout values', () => {
    delete process.env.MOMO_SECRET_KEY;
    expect(() => new PaymentConfiguration().momo()).toThrow(/MOMO_SECRET_KEY/);

    process.env.VNPAY_RETURN_URL = 'http://app.example.test/payment-result';
    expect(() => new PaymentConfiguration().vnpay()).toThrow(/HTTPS/);

    process.env.PAYMENT_TIMEOUT_SECONDS = '10';
    expect(() => new PaymentConfiguration().timeoutSeconds()).toThrow(/60 to 3600/);
  });

  it('rejects an invalid VNPAY server IP at startup', () => {
    process.env.VNPAY_SERVER_IP = 'localhost';
    expect(() => new PaymentConfiguration().onModuleInit()).toThrow(/VNPAY_SERVER_IP/);
  });
});
