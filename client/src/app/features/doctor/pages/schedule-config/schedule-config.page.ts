// import { Component } from '@angular/core';

// /**
//  * STUB — khung trang, thuộc phạm vi task nghiệp vụ riêng (không nằm trong
//  * 5 yêu cầu của task Base Architecture). Tạo sẵn để app.routes.ts / feature
//  * routes có thể lazy-load và build được ngay từ nhánh develop.
//  */
// @Component({
//   selector: 'app-schedule-config-page',
//   standalone: true,
//   template: `<div class="p-6 text-slate-500">[TODO] Đăng ký ca trực — SRS-DOC-01</div>`,
// })
// export class ScheduleConfigPage {}
import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';

type CellState = 'available' | 'booked' | 'blocked' | 'break';

interface CellConfig {
  bg: string;
  text: string;
  label: string;
}

const CELL: Record<CellState, CellConfig> = {
  available: { bg: '#DCFCE7', text: '#15803D', label: 'Còn trống' },
  booked: { bg: '#E0F2FE', text: '#0284C7', label: 'Đã đặt' },
  blocked: { bg: '#FEE2E2', text: '#B91C1C', label: 'Khóa slot' },
  break: { bg: '#F1F5F9', text: '#94A3B8', label: 'Nghỉ' },
};

@Component({
  selector: 'app-schedule-config-page',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './schedule-config.page.html',
})
export class ScheduleConfigPage {
  readonly days = ['Thứ 2 (08/09)', 'Thứ 3 (09/09)', 'Thứ 4 (10/09)', 'Thứ 5 (11/09)', 'Thứ 6 (12/09)', 'Thứ 7 (13/09)', 'CN (14/09)'];
  readonly hours = ['08:00', '08:30', '09:00', '09:30', '10:00', '10:30', '11:00', '11:30', '13:30', '14:00', '14:30', '15:00', '15:30', '16:00', '16:30'];

  readonly cellLegend = [
    { key: 'available', config: CELL.available },
    { key: 'booked', config: CELL.booked },
    { key: 'blocked', config: CELL.blocked },
    { key: 'break', config: CELL.break },
  ];

  scheduleMap: Record<string, CellState> = {
    '0-08:00': 'booked',
    '0-08:30': 'booked',
    '0-09:00': 'booked',
    '0-09:30': 'available',
    '0-10:00': 'available',
    '1-08:00': 'available',
    '1-08:30': 'booked',
    '1-09:00': 'booked',
    '2-08:00': 'booked',
    '2-08:30': 'blocked',
    '3-09:00': 'available',
    '4-08:00': 'booked',
    '4-08:30': 'booked',
    '5-08:00': 'available',
    '6-08:00': 'break',
  };

  getCell(dayIdx: number, hour: string): CellConfig {
    const key = `${dayIdx}-${hour}`;
    const state = this.scheduleMap[key] || (hour === '11:30' || hour === '16:30' ? 'break' : 'available');
    return CELL[state];
  }

  toggleCell(dayIdx: number, hour: string) {
    const key = `${dayIdx}-${hour}`;
    const current = this.scheduleMap[key] || 'available';
    if (current === 'available') this.scheduleMap[key] = 'blocked';
    else if (current === 'blocked') this.scheduleMap[key] = 'available';
  }
}
