import { Injectable, OnModuleInit, ServiceUnavailableException } from '@nestjs/common';
import { isIP } from 'node:net';
import { environment } from '../../config/environment';
import { MomoConfig } from './providers/momo.provider';
import { VnpayConfig } from './providers/vnpay.provider';
import { paymentTimeoutSeconds } from './payment-timeout';

type PaymentEnvironment = 'sandbox' | 'production';

@Injectable()
export class PaymentConfiguration implements OnModuleInit {
  onModuleInit(): void {
    const enabled = environment.PAYMENT_ENABLED;
    if (enabled !== 'true' && enabled !== 'false') {
      throw new Error('PAYMENT_ENABLED must be explicitly set to true or false.');
    }
    if (enabled === 'true') this.validateAll();
  }

  vnpay(): VnpayConfig {
    this.assertEnabled();
    const mode = this.mode();
    const config: VnpayConfig = {
      tmnCode: this.required('VNPAY_TMN_CODE'),
      hashSecret: this.required('VNPAY_HASH_SECRET'),
      payUrl: this.required('VNPAY_PAY_URL'),
      returnUrl: this.required('VNPAY_RETURN_URL'),
      ipnUrl: this.required('VNPAY_IPN_URL'),
      queryUrl: this.required('VNPAY_QUERY_URL'),
      serverIp: this.required('VNPAY_SERVER_IP'),
    };
    this.assertHttps(config.payUrl, 'VNPAY_PAY_URL');
    this.assertHttps(config.returnUrl, 'VNPAY_RETURN_URL');
    this.assertHttps(config.ipnUrl, 'VNPAY_IPN_URL');
    this.assertHttps(config.queryUrl, 'VNPAY_QUERY_URL');
    if (!isIP(config.serverIp)) {
      throw new Error('VNPAY_SERVER_IP must be a valid IPv4 or IPv6 address.');
    }
    this.assertEnvironmentHost(mode, config.payUrl, 'sandbox.vnpayment.vn', 'pay.vnpay.vn');
    this.assertEnvironmentHost(
      mode,
      config.queryUrl,
      'sandbox.vnpayment.vn',
      'merchant.vnpay.vn',
    );
    return config;
  }

  momo(): MomoConfig {
    this.assertEnabled();
    const mode = this.mode();
    const config: MomoConfig = {
      partnerCode: this.required('MOMO_PARTNER_CODE'),
      accessKey: this.required('MOMO_ACCESS_KEY'),
      secretKey: this.required('MOMO_SECRET_KEY'),
      endpoint: this.required('MOMO_ENDPOINT'),
      queryEndpoint: this.required('MOMO_QUERY_ENDPOINT'),
      redirectUrl: this.required('MOMO_REDIRECT_URL'),
      ipnUrl: this.required('MOMO_IPN_URL'),
      allowedPayHost:
        mode === 'sandbox' ? 'test-payment.momo.vn' : 'payment.momo.vn',
    };
    for (const [name, value] of [
      ['MOMO_ENDPOINT', config.endpoint],
      ['MOMO_QUERY_ENDPOINT', config.queryEndpoint],
      ['MOMO_REDIRECT_URL', config.redirectUrl],
      ['MOMO_IPN_URL', config.ipnUrl],
    ] as const) {
      this.assertHttps(value, name);
    }
    this.assertEnvironmentHost(
      mode,
      config.endpoint,
      'test-payment.momo.vn',
      'payment.momo.vn',
    );
    this.assertEnvironmentHost(
      mode,
      config.queryEndpoint,
      'test-payment.momo.vn',
      'payment.momo.vn',
    );
    return config;
  }

  timeoutSeconds(): number {
    return paymentTimeoutSeconds();
  }

  isEnabled(): boolean {
    return environment.PAYMENT_ENABLED === 'true';
  }

  ensureEnabled(): void {
    if (!this.isEnabled()) {
      throw new ServiceUnavailableException('Online payment is temporarily disabled.');
    }
  }

  private validateAll(): void {
    this.vnpay();
    this.momo();
    this.timeoutSeconds();
  }

  private mode(): PaymentEnvironment {
    const value = environment.PAYMENT_ENV;
    if (value !== 'sandbox' && value !== 'production') {
      throw new Error('PAYMENT_ENV must be sandbox or production.');
    }
    return value;
  }

  private required(name: string): string {
    const value = environment[name]?.trim();
    if (!value) throw new Error(`Missing required payment environment variable: ${name}`);
    return value;
  }

  private assertHttps(value: string, name: string): void {
    const url = new URL(value);
    if (url.protocol !== 'https:') throw new Error(`${name} must use HTTPS.`);
  }

  private assertEnvironmentHost(
    mode: PaymentEnvironment,
    value: string,
    sandboxHost: string,
    productionHost: string,
  ): void {
    const host = new URL(value).hostname;
    const expected = mode === 'sandbox' ? sandboxHost : productionHost;
    if (host !== expected) {
      throw new Error(`${mode} payment endpoint must use ${expected}.`);
    }
  }

  private assertEnabled(): void {
    this.ensureEnabled();
  }
}
