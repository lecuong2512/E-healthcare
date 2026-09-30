import { createHmac } from 'node:crypto';
import { safeEqualHex } from './safe-signature';

export class MomoSignatureService {
  constructor(private readonly secret: string) {}

  sign(canonical: string): string {
    return createHmac('sha256', this.secret).update(canonical, 'utf8').digest('hex');
  }

  verify(canonical: string, signature: string): boolean {
    return safeEqualHex(this.sign(canonical), signature, 64);
  }
}
