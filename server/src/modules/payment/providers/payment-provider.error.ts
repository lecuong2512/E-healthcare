import { BadGatewayException } from '@nestjs/common';

export enum PaymentProviderErrorKind {
  REJECTED = 'REJECTED',
  TRANSIENT = 'TRANSIENT',
  UNKNOWN = 'UNKNOWN',
  INVALID_RESPONSE = 'INVALID_RESPONSE',
}

export class PaymentProviderError extends BadGatewayException {
  constructor(
    readonly kind: PaymentProviderErrorKind,
    message: string,
    options?: ErrorOptions,
  ) {
    super({ code: kind === PaymentProviderErrorKind.REJECTED ? 'PROVIDER_REJECTED' : 'PAYMENT_RECONCILIATION_REQUIRED', message }, options);
    this.name = 'PaymentProviderError';
  }

  get isDefinitive(): boolean {
    return this.kind === PaymentProviderErrorKind.REJECTED;
  }
}
