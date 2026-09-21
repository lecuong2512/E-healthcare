import { CommonModule } from '@angular/common';
import { Component, computed, signal } from '@angular/core';

export type VisitStatus = 'upcoming' | 'completed' | 'cancelled' | 'pending';

interface AppointmentRecord {
  id: string;
  doctorName: string;
  specialty: string;
  hospital: string;
  date: string;
  time: string;
  status: VisitStatus;
  price: number;
  note: string;
  type: 'Khám thường' | 'Tái khám' | 'Tư vấn' | 'Siêu âm';
}

@Component({
  selector: 'app-medical-history-page',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="min-h-screen bg-slate-100 px-3 py-4 sm:px-5 lg:px-8">
      <div class="mx-auto max-w-3xl space-y-5 sm:space-y-6">
        <header class="flex flex-col gap-4 rounded-3xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p class="text-[10px] font-semibold uppercase tracking-[0.2em] text-sky-600 sm:text-xs">Bệnh nhân</p>
            <h1 class="mt-2 text-xl font-bold text-slate-900 sm:text-2xl">Lịch sử khám</h1>
          </div>
          <button type="button" class="w-full rounded-xl bg-sky-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-sky-700 sm:w-auto">
            Đặt lịch mới
          </button>
        </header>

        <section class="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
          <div class="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <p class="text-[11px] text-slate-500 sm:text-xs">Tổng lịch hẹn</p>
            <p class="mt-3 text-xl font-bold text-slate-900 sm:text-2xl">{{ appointments.length }}</p>
          </div>
          <div class="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <p class="text-[11px] text-slate-500 sm:text-xs">Sắp tới</p>
            <p class="mt-3 text-xl font-bold text-sky-600 sm:text-2xl">{{ upcomingCount() }}</p>
          </div>
          <div class="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <p class="text-[11px] text-slate-500 sm:text-xs">Đã hoàn thành</p>
            <p class="mt-3 text-xl font-bold text-emerald-600 sm:text-2xl">{{ completedCount() }}</p>
          </div>
          <div class="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <p class="text-[11px] text-slate-500 sm:text-xs">Đã hủy</p>
            <p class="mt-3 text-xl font-bold text-rose-600 sm:text-2xl">{{ cancelledCount() }}</p>
          </div>
        </section>

        <section class="rounded-3xl border border-slate-200 bg-white p-3 shadow-sm sm:p-4">
          <div class="flex gap-2 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            @for (tab of tabs; track tab) {
              <button
                type="button"
                (click)="activeTab.set(tab)"
                class="whitespace-nowrap rounded-full px-3 py-2 text-xs font-medium transition sm:px-4 sm:text-sm"
                [class.bg-sky-600]="activeTab() === tab"
                [class.text-white]="activeTab() === tab"
                [class.bg-slate-100]="activeTab() !== tab"
                [class.text-slate-600]="activeTab() !== tab"
              >
                {{ tab }}
              </button>
            }
          </div>
        </section>

        <section class="space-y-4">
          @for (item of filteredAppointments(); track item.id) {
            <article class="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
              <div class="grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
                <div class="flex min-w-0 items-start gap-3 sm:gap-4">
                  <div class="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-sky-100 text-base text-sky-700 sm:h-12 sm:w-12 sm:text-lg">
                    🩺
                  </div>

                  <div class="min-w-0 flex-1">
                    <div class="flex flex-wrap items-center gap-2">
                      <h2 class="text-base font-bold text-slate-900 sm:text-lg">{{ item.doctorName }}</h2>
                      <span class="rounded-full bg-sky-50 px-2 py-1 text-[9px] font-semibold uppercase tracking-wide text-sky-700 sm:text-[10px]">
                        {{ item.specialty }}
                      </span>
                    </div>
                    <p class="mt-1 text-xs text-slate-500 sm:text-sm">{{ item.hospital }}</p>
                    <div class="mt-3 flex flex-wrap gap-2 text-[11px] text-slate-600 sm:gap-3 sm:text-sm">
                      <span>{{ item.date }}</span>
                      <span class="hidden sm:inline">•</span>
                      <span>{{ item.time }}</span>
                      <span class="hidden sm:inline">•</span>
                      <span>{{ item.type }}</span>
                    </div>
                  </div>
                </div>

                <div class="flex items-center justify-between gap-3 lg:flex-col lg:items-end lg:justify-center">
                  <span
                    class="inline-flex rounded-full px-2.5 py-1.5 text-[10px] font-semibold sm:text-xs"
                    [class.bg-emerald-100]="item.status === 'completed'"
                    [class.text-emerald-700]="item.status === 'completed'"
                    [class.bg-sky-100]="item.status === 'upcoming'"
                    [class.text-sky-700]="item.status === 'upcoming'"
                    [class.bg-amber-100]="item.status === 'pending'"
                    [class.text-amber-700]="item.status === 'pending'"
                    [class.bg-rose-100]="item.status === 'cancelled'"
                    [class.text-rose-700]="item.status === 'cancelled'"
                  >
                    {{ statusLabel(item.status) }}
                  </span>
                  <div class="text-right">
                    <p class="text-[10px] uppercase tracking-wide text-slate-400 sm:text-[11px]">Chi phí</p>
                    <p class="text-sm font-bold text-slate-900 sm:text-base">{{ item.price | number:'1.0-0' }}đ</p>
                  </div>
                </div>
              </div>

              <div class="mt-4 rounded-2xl bg-slate-50 p-3 sm:p-3.5">
                <p class="text-[10px] uppercase tracking-[0.14em] text-slate-400 sm:text-xs">Ghi chú</p>
                <p class="mt-2 text-xs leading-6 text-slate-700 sm:text-sm">{{ item.note }}</p>
              </div>
            </article>
          }

          @if (filteredAppointments().length === 0) {
            <div class="rounded-3xl border border-dashed border-slate-300 bg-white p-8 text-center shadow-sm sm:p-10">
              <div class="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-slate-100 text-2xl sm:h-16 sm:w-16">📋</div>
              <h3 class="mt-4 text-base font-bold text-slate-800 sm:text-lg">Chưa có lịch sử khám</h3>
              <p class="mt-2 text-xs text-slate-500 sm:text-sm">Bạn chưa có lịch hẹn nào trong nhóm này.</p>
            </div>
          }
        </section>
      </div>
    </div>
  `,
})
export class MedicalHistoryPage {
  readonly tabs = ['Tất cả', 'Sắp tới', 'Đã hoàn thành', 'Đã hủy'] as const;
  readonly activeTab = signal<(typeof this.tabs)[number]>('Tất cả');

  readonly appointments: AppointmentRecord[] = [
    {
      id: 'APT-20260908',
      doctorName: 'PGS.TS.BS Trần Văn Tiến',
      specialty: 'Tim mạch',
      hospital: 'BV Chợ Rẫy TP.HCM',
      date: '08/09/2026',
      time: '08:00 - 08:30',
      status: 'completed',
      price: 350000,
      note: 'Tổng hợp kết quả khám tim, huyết áp và tư vấn chế độ sinh hoạt.',
      type: 'Khám thường',
    },
    {
      id: 'APT-20260912',
      doctorName: 'TS.BS Nguyễn Thị Lan',
      specialty: 'Nội tổng quát',
      hospital: 'BV Bạch Mai Hà Nội',
      date: '12/09/2026',
      time: '09:30 - 10:00',
      status: 'upcoming',
      price: 280000,
      note: 'Khám định kỳ, kiểm tra cholesterol và bệnh nền.',
      type: 'Tái khám',
    },
    {
      id: 'APT-20260915',
      doctorName: 'BSCKII Lê Văn Nam',
      specialty: 'Ngoại khoa',
      hospital: 'BV 108 Hà Nội',
      date: '15/09/2026',
      time: '14:00 - 14:45',
      status: 'pending',
      price: 420000,
      note: 'Chờ xác nhận lịch tư vấn trước phẫu thuật.',
      type: 'Tư vấn',
    },
    {
      id: 'APT-20260918',
      doctorName: 'ThS.BS Phạm Minh Khoa',
      specialty: 'Nhi khoa',
      hospital: 'BV Nhi Trung Ương',
      date: '18/09/2026',
      time: '10:15 - 10:45',
      status: 'cancelled',
      price: 250000,
      note: 'Lịch khám bị hủy do bệnh nhân đổi thời gian.',
      type: 'Khám thường',
    },
  ];

  readonly filteredAppointments = computed(() => {
    const tab = this.activeTab();

    switch (tab) {
      case 'Sắp tới':
        return this.appointments.filter(item => item.status === 'upcoming');
      case 'Đã hoàn thành':
        return this.appointments.filter(item => item.status === 'completed');
      case 'Đã hủy':
        return this.appointments.filter(item => item.status === 'cancelled');
      default:
        return this.appointments;
    }
  });

  readonly upcomingCount = computed(() => this.appointments.filter(item => item.status === 'upcoming').length);
  readonly completedCount = computed(() => this.appointments.filter(item => item.status === 'completed').length);
  readonly cancelledCount = computed(() => this.appointments.filter(item => item.status === 'cancelled').length);

  statusLabel(status: VisitStatus): string {
    switch (status) {
      case 'upcoming':
        return 'Sắp tới';
      case 'completed':
        return 'Đã hoàn thành';
      case 'cancelled':
        return 'Đã hủy';
      default:
        return 'Chờ xác nhận';
    }
  }
}
