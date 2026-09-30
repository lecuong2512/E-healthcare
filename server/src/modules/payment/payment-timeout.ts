import { environment } from '../../config/environment';

export function paymentTimeoutSeconds(): number {
  const value = Number(environment.PAYMENT_TIMEOUT_SECONDS || '600');
  if (!Number.isSafeInteger(value) || value < 60 || value > 3600) {
    throw new Error('PAYMENT_TIMEOUT_SECONDS must be an integer from 60 to 3600.');
  }
  return value;
}
