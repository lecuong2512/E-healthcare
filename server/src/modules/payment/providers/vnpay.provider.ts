import { BadGatewayException, BadRequestException } from '@nestjs/common';
import { createHmac, randomUUID } from 'node:crypto';
import { PaymentMethod } from '@shared/enums';
import { PaymentTransactionEntity } from '../../../database/entities/payment-trans.entity';
import { PaymentProvider } from './payment-provider.interface';
import { PaymentContext } from '../types/payment-context';
import { PaymentInitResult } from '../types/payment-init-result';
import { VerifiedPaymentResult } from '../types/verified-payment-result';
import { safeEqualHex } from '../security/safe-signature';
import { VnpayCanonicalizer } from '../security/vnpay-canonicalizer';
import { VnpaySignatureService } from '../security/vnpay-signature.service';

export interface VnpayConfig {
  tmnCode: string;
  hashSecret: string;
  payUrl: string;
  returnUrl: string;
  ipnUrl: string;
  queryUrl: string;
  serverIp: string;
}

type VnpayPayload = Record<string, string>;

export class VnpayProvider implements PaymentProvider {
  private readonly canonicalizer = new VnpayCanonicalizer();
  private readonly signature: VnpaySignatureService;

  constructor(private readonly config: VnpayConfig) {
    this.signature = new VnpaySignatureService(config.hashSecret, this.canonicalizer);
  }

  async initiate(context: PaymentContext): Promise<PaymentInitResult> {
    this.assertAmount(context.amountVnd);
    const params: VnpayPayload = {
      vnp_Version: '2.1.0',
      vnp_Command: 'pay',
      vnp_TmnCode: this.config.tmnCode,
      vnp_Amount: String(context.amountVnd * 100),
      vnp_CreateDate: this.formatDate(context.createdAt),
      vnp_CurrCode: 'VND',
      vnp_IpAddr: context.clientIp,
      vnp_Locale: 'vn',
      vnp_OrderInfo: `Thanh toan lich hen ${context.merchantTransactionId}`,
      vnp_OrderType: 'other',
      vnp_ReturnUrl: this.config.returnUrl,
      vnp_TxnRef: context.merchantTransactionId,
      vnp_ExpireDate: this.formatDate(context.expiresAt),
    };
    const secureHash = this.signature.sign(params);
    const query = this.canonicalizer.canonicalize(params);
    return {
      merchantTransactionId: context.merchantTransactionId,
      paymentUrl: `${this.config.payUrl}?${query}&vnp_SecureHash=${secureHash}`,
      expiresAt: context.expiresAt,
    };
  }

  async verifyCallback(payload: unknown): Promise<VerifiedPaymentResult> {
    const params = this.toStringRecord(payload);
    const secureHash = params.vnp_SecureHash;
    if (!secureHash || !this.signature.verify(params, secureHash)) {
      throw new BadRequestException('Invalid VNPAY signature.');
    }
    if (params.vnp_TmnCode !== this.config.tmnCode) {
      throw new BadRequestException('Invalid VNPAY merchant code.');
    }
    const amountVnd = this.parseProviderAmount(params.vnp_Amount);
    const responseCode = params.vnp_ResponseCode;
    const transactionStatus = params.vnp_TransactionStatus;
    if (!params.vnp_TxnRef || !responseCode || !transactionStatus) {
      throw new BadRequestException('Incomplete VNPAY callback.');
    }
    return {
      provider: PaymentMethod.VNPAY,
      merchantTransactionId: params.vnp_TxnRef,
      providerTransactionId: params.vnp_TransactionNo || undefined,
      amountVnd,
      state: this.mapPaymentIpnState(responseCode, transactionStatus),
      responseCode,
      rawProviderStatus: transactionStatus,
      signatureVerified: true,
      sourceValidated: true,
      sanitizedPayload: this.sanitize(params),
    };
  }

  async queryStatus(
    transaction: PaymentTransactionEntity,
  ): Promise<VerifiedPaymentResult> {
    const requestId = randomUUID().replace(/-/g, '').slice(0, 32);
    const createdAt = new Date();
    const orderInfo = `Query ${transaction.merchantTransactionId}`;
    const payload: VnpayPayload = {
      vnp_RequestId: requestId,
      vnp_Version: '2.1.0',
      vnp_Command: 'querydr',
      vnp_TmnCode: this.config.tmnCode,
      vnp_TxnRef: transaction.merchantTransactionId,
      vnp_TransactionDate: this.formatDate(transaction.createdAt),
      vnp_CreateDate: this.formatDate(createdAt),
      vnp_IpAddr: this.config.serverIp,
      vnp_OrderInfo: orderInfo,
    };
    const signData = [
      payload.vnp_RequestId,
      payload.vnp_Version,
      payload.vnp_Command,
      payload.vnp_TmnCode,
      payload.vnp_TxnRef,
      payload.vnp_TransactionDate,
      payload.vnp_CreateDate,
      payload.vnp_IpAddr,
      payload.vnp_OrderInfo,
    ].join('|');
    payload.vnp_SecureHash = createHmac('sha512', this.config.hashSecret)
      .update(signData, 'utf8')
      .digest('hex');

    const response = await fetch(this.config.queryUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(30_000),
    });
    if (!response.ok) throw new BadGatewayException('VNPAY query failed.');
    const result = this.toStringRecord(await response.json());
    if (!this.verifyQueryResponse(result)) {
      throw new BadGatewayException('Invalid VNPAY query signature.');
    }
    if (
      result.vnp_TxnRef !== transaction.merchantTransactionId ||
      result.vnp_TmnCode !== this.config.tmnCode ||
      !result.vnp_Amount ||
      this.parseProviderAmount(result.vnp_Amount) !== Number(transaction.amountVnd)
    ) {
      throw new BadGatewayException('VNPAY query response mismatch.');
    }
    const responseCode = result.vnp_ResponseCode || '99';
    const providerStatus = result.vnp_TransactionStatus || '';
    const transactionType = result.vnp_TransactionType || '';
    if (transactionType !== '01') {
      throw new BadGatewayException(
        `Unexpected VNPAY transaction type: ${transactionType || 'missing'}`,
      );
    }
    const amountVnd = this.parseProviderAmount(result.vnp_Amount);
    return {
      provider: PaymentMethod.VNPAY,
      merchantTransactionId: result.vnp_TxnRef,
      providerTransactionId: result.vnp_TransactionNo || undefined,
      amountVnd,
      state: this.mapPaymentQueryState(responseCode, providerStatus),
      responseCode,
      rawProviderStatus: providerStatus,
      signatureVerified: true,
      sourceValidated: true,
      sanitizedPayload: this.sanitize(result),
    };
  }

  private verifyQueryResponse(payload: VnpayPayload): boolean {
    const actual = payload.vnp_SecureHash || '';
    const signData = [
      payload.vnp_ResponseId,
      payload.vnp_Command,
      payload.vnp_ResponseCode,
      payload.vnp_Message,
      payload.vnp_TmnCode,
      payload.vnp_TxnRef,
      payload.vnp_Amount,
      payload.vnp_BankCode,
      payload.vnp_PayDate,
      payload.vnp_TransactionNo,
      payload.vnp_TransactionType,
      payload.vnp_TransactionStatus,
      payload.vnp_OrderInfo,
      payload.vnp_PromotionCode,
      payload.vnp_PromotionAmount,
    ]
      .map((value) => value || '')
      .join('|');
    const expected = createHmac('sha512', this.config.hashSecret)
      .update(signData, 'utf8')
      .digest('hex');
    return safeEqualHex(expected, actual, 128);
  }

  private parseProviderAmount(value: string | undefined): number {
    if (!value || !/^\d+$/.test(value)) {
      throw new BadRequestException('Invalid VNPAY amount.');
    }
    const scaled = Number(value);
    if (!Number.isSafeInteger(scaled) || scaled % 100 !== 0) {
      throw new BadRequestException('Invalid VNPAY amount.');
    }
    return scaled / 100;
  }

  private mapPaymentIpnState(
    responseCode: string,
    transactionStatus: string,
  ): VerifiedPaymentResult['state'] {
    if (responseCode === '00' && transactionStatus === '00') return 'SUCCESS';
    switch (transactionStatus) {
      case '01':
        return 'PENDING';
      case '02':
        return 'FINAL_FAILED';
      default:
        return 'UNKNOWN';
    }
  }

  private mapPaymentQueryState(
    responseCode: string,
    transactionStatus: string,
  ): VerifiedPaymentResult['state'] {
    if (responseCode !== '00') return 'UNKNOWN';
    switch (transactionStatus) {
      case '00':
        return 'SUCCESS';
      case '01':
        return 'PENDING';
      case '02':
        return 'FINAL_FAILED';
      default:
        return 'UNKNOWN';
    }
  }

  private assertAmount(amountVnd: number): void {
    if (!Number.isSafeInteger(amountVnd) || amountVnd <= 0) {
      throw new BadRequestException('Payment amount must be a positive integer VND value.');
    }
    if (!Number.isSafeInteger(amountVnd * 100)) {
      throw new BadRequestException('Payment amount exceeds VNPAY limits.');
    }
  }

  private formatDate(date: Date): string {
    const vietnam = new Date(date.getTime() + 7 * 60 * 60 * 1000);
    return vietnam.toISOString().replace(/[-:T]/g, '').slice(0, 14);
  }

  private toStringRecord(value: unknown): VnpayPayload {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw new BadRequestException('Invalid VNPAY payload.');
    }
    const result: VnpayPayload = {};
    for (const [key, entry] of Object.entries(value)) {
      if (!key.startsWith('vnp_')) continue;
      if (typeof entry !== 'string' && typeof entry !== 'number') {
        throw new BadRequestException('Invalid VNPAY payload field.');
      }
      result[key] = String(entry);
    }
    return result;
  }

  private sanitize(payload: VnpayPayload): Record<string, string> {
    const allowed = [
      'vnp_TxnRef',
      'vnp_TransactionNo',
      'vnp_ResponseCode',
      'vnp_TransactionStatus',
      'vnp_TransactionType',
      'vnp_Amount',
      'vnp_BankCode',
      'vnp_PayDate',
    ];
    return Object.fromEntries(
      allowed.filter((key) => payload[key] !== undefined).map((key) => [key, payload[key]]),
    );
  }
}
