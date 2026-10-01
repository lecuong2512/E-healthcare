import { BadRequestException } from '@nestjs/common';

export function normalizeVietnamesePhone(input: string): string {
  const compact = input.replace(/[\s.-]/g, '');
  const withCountryCode = compact.startsWith('84') ? `+${compact}` : compact;
  if (!/^(?:0[35789]\d{8}|\+84[35789]\d{8})$/.test(withCountryCode)) {
    throw new BadRequestException('Số điện thoại không hợp lệ.');
  }
  return withCountryCode.startsWith('0')
    ? `+84${withCountryCode.slice(1)}`
    : withCountryCode;
}

export function vietnamesePhoneVariants(input: string): string[] {
  const canonical = normalizeVietnamesePhone(input);
  return [canonical, `0${canonical.slice(3)}`];
}
