export const VNPAY_PROVIDER = Symbol('VNPAY_PROVIDER');
export const MOMO_PROVIDER = Symbol('MOMO_PROVIDER');

export const PAYMENT_TIMEOUT_SECONDS = 600;

export const TERMINAL_PAYMENT_STATUSES = [
  'SUCCESS',
  'FAILED',
  'TIMEOUT',
  'SUPERSEDED',
  'LATE_SUCCESS',
] as const;
