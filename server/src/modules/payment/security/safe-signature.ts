import { timingSafeEqual } from 'node:crypto';

export function safeEqualHex(
  expectedHex: string,
  actualHex: string,
  expectedLength: number,
): boolean {
  const pattern = new RegExp(`^[0-9a-fA-F]{${expectedLength}}$`);
  if (!pattern.test(expectedHex) || !pattern.test(actualHex)) return false;
  const expected = Buffer.from(expectedHex, 'hex');
  const actual = Buffer.from(actualHex, 'hex');
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}
