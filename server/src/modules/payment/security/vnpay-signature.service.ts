import { createHmac } from 'node:crypto';
import { VnpayCanonicalizer } from './vnpay-canonicalizer';
import { safeEqualHex } from './safe-signature';

export class VnpaySignatureService {
  constructor(
    private readonly secret: string,
    private readonly canonicalizer = new VnpayCanonicalizer(),
  ) {}

  sign(payload: Record<string, unknown>): string {
    return createHmac('sha512', this.secret)
      .update(this.canonicalizer.canonicalize(payload), 'utf8')
      .digest('hex');
  }

  verify(payload: Record<string, unknown>, signature: string): boolean {
    return safeEqualHex(this.sign(payload), signature, 128);
  }
}
