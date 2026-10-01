import { Pipe, PipeTransform } from '@angular/core';

/**
 * {{ 350000 | currencyVnd }} -> "350.000 VND"  ₫(\u20ab)
 * Dùng riêng thay vì Angular CurrencyPipe mặc định vì team chỉ cần định dạng
 * VND đơn giản, không cần load toàn bộ locale data cho các currency khác.
 */
@Pipe({ name: 'currencyVnd', standalone: true })
export class CurrencyVndPipe implements PipeTransform {
  transform(value: number | null | undefined): string {
    if (value === null || value === undefined || Number.isNaN(value)) return '—';
    return new Intl.NumberFormat('vi-VN').format(value) + ' VND';
  }
}
