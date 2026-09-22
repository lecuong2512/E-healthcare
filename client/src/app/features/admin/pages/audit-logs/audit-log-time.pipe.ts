import { Pipe, PipeTransform } from '@angular/core';

const formatter = new Intl.DateTimeFormat('vi-VN', {
  timeZone: 'Asia/Ho_Chi_Minh',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
});

@Pipe({ name: 'auditLogTime', standalone: true })
export class AuditLogTimePipe implements PipeTransform {
  transform(value: string): string {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? '—' : `${formatter.format(date)} UTC+7`;
  }
}
