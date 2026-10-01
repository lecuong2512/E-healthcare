export class VnpayCanonicalizer {
  canonicalize(input: Record<string, unknown>): string {
    return Object.entries(input)
      .filter(
        ([key, value]) =>
          key.startsWith('vnp_') &&
          key !== 'vnp_SecureHash' &&
          key !== 'vnp_SecureHashType' &&
          value !== undefined &&
          value !== null &&
          String(value).length > 0,
      )
      .sort(([left], [right]) => left.localeCompare(right, 'en'))
      .map(([key, value]) => `${this.encode(key)}=${this.encode(String(value))}`)
      .join('&');
  }

  private encode(value: string): string {
    return encodeURIComponent(value).replace(/%20/g, '+');
  }
}
