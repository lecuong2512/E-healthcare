import { BadGatewayException, BadRequestException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { PaymentMethod } from '@shared/enums';
import { PaymentTransactionEntity } from '../../../database/entities/payment-trans.entity';
import { PaymentProvider } from './payment-provider.interface';
import { PaymentContext } from '../types/payment-context';
import { PaymentInitResult } from '../types/payment-init-result';
import {
  VerifiedPaymentResult,
  VerifiedPaymentState,
} from '../types/verified-payment-result';
import { MomoCanonicalizer } from '../security/momo-canonicalizer';
import { MomoSignatureService } from '../security/momo-signature.service';
import { PaymentProviderError, PaymentProviderErrorKind } from './payment-provider.error';

export interface MomoConfig {
  partnerCode: string;
  accessKey: string;
  secretKey: string;
  endpoint: string;
  queryEndpoint: string;
  redirectUrl: string;
  ipnUrl: string;
  allowedPayHost: string;
}

type MomoPayload = Record<string, string | number | boolean | null>;

export class MomoProvider implements PaymentProvider {
  private readonly canonicalizer = new MomoCanonicalizer();
  private readonly signature: MomoSignatureService;

  constructor(private readonly config: MomoConfig) {
    this.signature = new MomoSignatureService(config.secretKey);
  }

  async initiate(context: PaymentContext): Promise<PaymentInitResult> {
    this.assertAmount(context.amountVnd);
    const payload: MomoPayload = {
      partnerCode: this.config.partnerCode,
      requestId: context.requestId,
      orderId: context.merchantTransactionId,
      amount: context.amountVnd,
      orderInfo: `Thanh toan lich hen ${context.merchantTransactionId}`,
      redirectUrl: this.config.redirectUrl,
      ipnUrl: this.config.ipnUrl,
      requestType: 'captureWallet',
      extraData: '',
      autoCapture: true,
      lang: 'vi',
    };
    payload.signature = this.signature.sign(
      this.canonicalizer.createRequest(payload, this.config.accessKey),
    );

    let response: Response;
    try {
      response = await fetch(this.config.endpoint, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(30_000),
      });
    } catch (error) {
      throw new PaymentProviderError(
        PaymentProviderErrorKind.TRANSIENT,
        'MoMo create payment request failed.',
        { cause: error },
      );
    }
    if (!response.ok) {
      throw new PaymentProviderError(
        response.status >= 400 && response.status < 500
          ? PaymentProviderErrorKind.REJECTED
          : PaymentProviderErrorKind.TRANSIENT,
        `MoMo create payment returned HTTP ${response.status}.`,
      );
    }
    let result: MomoPayload;
    try {
      result = this.toPayload(await response.json());
    } catch (error) {
      throw new PaymentProviderError(
        PaymentProviderErrorKind.INVALID_RESPONSE,
        'MoMo create payment returned an invalid response.',
        { cause: error },
      );
    }
    this.verifyCreateResponse(result, context);
    const payUrl = String(result.payUrl || '');
    this.assertPayUrl(payUrl);
    return {
      merchantTransactionId: context.merchantTransactionId,
      paymentUrl: payUrl,
      expiresAt: context.expiresAt,
      responseCode: String(result.resultCode),
      providerStatus: String(result.resultCode),
    };
  }

  async verifyCallback(payload: unknown): Promise<VerifiedPaymentResult> {
    const result = this.toPayload(payload);
    const actualSignature = String(result.signature || '');
    const canonical = this.canonicalizer.ipn(result, this.config.accessKey);
    if (!this.signature.verify(canonical, actualSignature)) {
      throw new BadRequestException('Invalid MoMo signature.');
    }
    if (result.partnerCode !== this.config.partnerCode) {
      throw new BadRequestException('Invalid MoMo partner code.');
    }
    if (!result.requestId) {
      throw new BadRequestException('Missing MoMo request ID.');
    }
    return this.normalize(result, true, true, true);
  }

  async queryStatus(
    transaction: PaymentTransactionEntity,
  ): Promise<VerifiedPaymentResult> {
    const payload: MomoPayload = {
      partnerCode: this.config.partnerCode,
      requestId: randomUUID(),
      orderId: transaction.merchantTransactionId,
      lang: 'vi',
    };
    payload.signature = this.signature.sign(
      this.canonicalizer.queryRequest(payload, this.config.accessKey),
    );
    const response = await fetch(this.config.queryEndpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(30_000),
    });
    if (!response.ok) throw new BadGatewayException('MoMo query failed.');
    const result = this.toPayload(await response.json());
    if (
      result.partnerCode !== this.config.partnerCode ||
      result.orderId !== transaction.merchantTransactionId ||
      result.requestId !== payload.requestId
    ) {
      throw new BadGatewayException('MoMo query response mismatch.');
    }
    if (
      result.amount !== undefined &&
      Number(result.amount) !== Number(transaction.amountVnd)
    ) {
      throw new BadGatewayException('MoMo query amount mismatch.');
    }
    return this.normalize(
      {
        ...result,
        amount: result.amount ?? Number(transaction.amountVnd),
        signature: '',
      },
      false,
      true,
      false,
    );
  }

  private verifyCreateResponse(result: MomoPayload, context: PaymentContext): void {
    const actualSignature = String(result.signature || '');
    const canonical = this.canonicalizer.createResponse(result, this.config.accessKey);
    if (!this.signature.verify(canonical, actualSignature)) {
      throw new PaymentProviderError(
        PaymentProviderErrorKind.INVALID_RESPONSE,
        'Invalid MoMo create response signature.',
      );
    }
    if (
      result.partnerCode !== this.config.partnerCode ||
      result.requestId !== context.requestId ||
      result.orderId !== context.merchantTransactionId ||
      Number(result.amount) !== context.amountVnd
    ) {
      throw new PaymentProviderError(
        PaymentProviderErrorKind.INVALID_RESPONSE,
        'MoMo create response mismatch.',
      );
    }
    if (Number(result.resultCode) !== 0) {
      throw new PaymentProviderError(
        PaymentProviderErrorKind.REJECTED,
        `MoMo rejected payment creation with code ${String(result.resultCode)}.`,
      );
    }
  }

  private normalize(
    payload: MomoPayload,
    signatureVerified: boolean,
    sourceValidated: boolean,
    includeRequestId: boolean,
  ): VerifiedPaymentResult {
    const resultCode = Number(payload.resultCode);
    const amountVnd = Number(payload.amount);
    if (!Number.isSafeInteger(resultCode) || !Number.isSafeInteger(amountVnd)) {
      throw new BadRequestException('Invalid MoMo callback values.');
    }
    const orderId = String(payload.orderId || '');
    if (!orderId) throw new BadRequestException('Missing MoMo order ID.');
    return {
      provider: PaymentMethod.MOMO,
      merchantTransactionId: orderId,
      providerTransactionId:
        payload.transId === undefined ? undefined : String(payload.transId),
      requestId: includeRequestId ? String(payload.requestId) : undefined,
      amountVnd,
      state: this.mapState(resultCode),
      responseCode: String(resultCode),
      rawProviderStatus: String(resultCode),
      signatureVerified,
      sourceValidated,
      sanitizedPayload: this.sanitize(payload),
    };
  }

  private mapState(resultCode: number): VerifiedPaymentState {
    if (resultCode === 0 || resultCode === 9000) return 'SUCCESS';
    if ([1000, 7000, 7002].includes(resultCode)) return 'PENDING';
    if ([10, 11, 12, 13, 20, 21, 22, 40, 41, 42, 43, 45, 47].includes(resultCode)) {
      return 'UNKNOWN';
    }
    return 'FINAL_FAILED';
  }

  private assertPayUrl(value: string): void {
    let url: URL;
    try {
      url = new URL(value);
    } catch {
      throw new PaymentProviderError(
        PaymentProviderErrorKind.INVALID_RESPONSE,
        'Invalid MoMo payment URL.',
      );
    }
    if (url.protocol !== 'https:' || url.hostname !== this.config.allowedPayHost) {
      throw new PaymentProviderError(
        PaymentProviderErrorKind.INVALID_RESPONSE,
        'Untrusted MoMo payment URL.',
      );
    }
  }

  private assertAmount(amountVnd: number): void {
    if (!Number.isSafeInteger(amountVnd) || amountVnd < 1_000 || amountVnd > 50_000_000) {
      throw new BadRequestException('MoMo amount must be an integer from 1,000 to 50,000,000 VND.');
    }
  }

  private toPayload(value: unknown): MomoPayload {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw new BadRequestException('Invalid MoMo payload.');
    }
    const result: MomoPayload = {};
    for (const [key, entry] of Object.entries(value)) {
      if (
        typeof entry !== 'string' &&
        typeof entry !== 'number' &&
        typeof entry !== 'boolean' &&
        entry !== null
      ) {
        continue;
      }
      result[key] = entry;
    }
    return result;
  }

  private sanitize(payload: MomoPayload): MomoPayload {
    const allowed = [
      'partnerCode',
      'orderId',
      'requestId',
      'amount',
      'transId',
      'resultCode',
      'responseTime',
      'payType',
      'orderType',
    ];
    return Object.fromEntries(
      allowed.filter((key) => payload[key] !== undefined).map((key) => [key, payload[key]]),
    );
  }
}
