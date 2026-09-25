import { CommonModule } from '@angular/common';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Component, OnDestroy, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { TokenStoreService } from '../../../../core/services/token-store.service';
import { PatientConsentCheckboxComponent } from '../../../../shared/components/patient-consent-checkbox/patient-consent-checkbox.component';

type Tab = 'upcoming' | 'completed' | 'cancelled';

interface Appointment {
  id: string;
  appointmentCode?: string;
  status: string;
  reasonForVisit?: string;
  cancellationReason?: string | null;
  totalAmount?: number;
  refundAmount?: number;
  refundPercent?: number;
  doctor?: {
    academicTitle?: string;
    consultationFee?: number;
    roomNumber?: string;
    specialty?: { name?: string };
    user?: { fullName?: string };
  };
  schedule?: { date: string; startTime: string; endTime: string };
  medicalRecord?: MedicalRecord;
}

interface MedicalRecord {
  id?: string;
  clinicalNotes?: string;
  icd10PrimaryCode?: string;
  icd10SecondaryCodes?: string | null;
  doctorAdvice?: string | null;
  followUpDate?: string | null;
  primaryDiagnosis?: string;
  secondaryDiagnoses?: string[];
  dietAdvice?: string;
  prescription?: {
    prescriptionCode?: string;
    items?: PrescriptionItem[];
    pdfUrl?: string;
    digitallySigned?: boolean;
  };
  resultPdfUrl?: string;
  digitallySigned?: boolean;
}

interface PrescriptionItem {
  medicineName: string;
  activeIngredient?: string | null;
  totalQuantity: number;
  unit: string;
  usageInstructions?: string | null;
  dosageMorning?: string | null;
  dosageNoon?: string | null;
  dosageAfternoon?: string | null;
  dosageNight?: string | null;
}

@Component({
  selector: 'app-medical-history-page',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, PatientConsentCheckboxComponent],
  templateUrl: './medical-history.page.html',
  styleUrls: ['./medical-history.page.scss'],
})
export class MedicalHistoryPage implements OnInit, OnDestroy {
  private readonly http = inject(HttpClient);
  private readonly tokens = inject(TokenStoreService);

  readonly tabs: { id: Tab; label: string }[] = [
    { id: 'upcoming', label: 'Sắp tới' },
    { id: 'completed', label: 'Đã hoàn thành' },
    { id: 'cancelled', label: 'Đã hủy' },
  ];

  readonly activeTab = signal<Tab>('upcoming');
  readonly appointments = signal<Appointment[]>([]);
  readonly loading = signal(true);
  readonly error = signal('');
  readonly isMock = signal(true);

  readonly cancelTarget = signal<Appointment | null>(null);
  cancelReason = '';
  readonly reasonError = signal('');
  consentAccepted = false;
  consentError = false;
  readonly submitting = signal(false);

  readonly detail = signal<Appointment | null>(null);
  readonly detailRecord = signal<MedicalRecord | null>(null);
  readonly detailLoading = signal(false);
  readonly detailError = signal('');

  readonly toast = signal('');
  readonly toastType = signal<'success' | 'error'>('success');
  private toastTimer?: ReturnType<typeof setTimeout>;
  private tick?: ReturnType<typeof setInterval>;
  readonly clock = signal(Date.now());

  ngOnInit(): void {
    this.useMockData();
    this.tick = setInterval(() => this.clock.set(Date.now()), 1000);
  }

  ngOnDestroy(): void {
    if (this.tick) {
      clearInterval(this.tick);
    }
    if (this.toastTimer) {
      clearTimeout(this.toastTimer);
    }
  }

  private headers(): HttpHeaders {
    return new HttpHeaders({
      Authorization: `Bearer ${this.tokens.accessToken() ?? ''}`,
    });
  }

  load(): void {
    this.isMock.set(false);
    this.loading.set(true);
    this.error.set('');

    this.http
      .get<Appointment[]>('/api/v1/appointments/me', { headers: this.headers() })
      .subscribe({
        next: (rows) => {
          this.appointments.set(rows);
          this.loading.set(false);
        },
        error: (e) => {
          this.error.set(
            e?.error?.message || 'Không thể tải lịch sử khám. Vui lòng thử lại.'
          );
          this.loading.set(false);
        },
      });
  }

  useMockData(): void {
    const date = (offset: number, time: string) => {
      const d = new Date(Date.now() + offset * 86400000);
      const yyyy = d.getFullYear();
      const mm = String(d.getMonth() + 1).padStart(2, '0');
      const dd = String(d.getDate()).padStart(2, '0');

      return {
        date: `${yyyy}-${mm}-${dd}`,
        startTime: time,
        endTime: `${String((Number(time.slice(0, 2)) + 1) % 24).padStart(2, '0')}:${time.slice(3, 5)}:00`,
      };
    };

    const relativeSchedule = (hoursFromNow: number) => {
      const start = new Date(Date.now() + hoursFromNow * 60 * 60 * 1000);
      const end = new Date(start.getTime() + 60 * 60 * 1000);

      const format = (value: Date) => {
        const yyyy = value.getFullYear();
        const mm = String(value.getMonth() + 1).padStart(2, '0');
        const dd = String(value.getDate()).padStart(2, '0');
        const hh = String(value.getHours()).padStart(2, '0');
        const min = String(value.getMinutes()).padStart(2, '0');

        return {
          date: `${yyyy}-${mm}-${dd}`,
          startTime: `${hh}:${min}:00`,
          endTime: `${String(end.getHours()).padStart(2, '0')}:${String(end.getMinutes()).padStart(2, '0')}:00`,
        };
      };

      return format(start);
    };

    const doctor = (
      name: string,
      title: string,
      specialty: string,
      room: string
    ) => ({
      academicTitle: title,
      roomNumber: room,
      specialty: { name: specialty },
      user: { fullName: name },
    });

    const prescription: PrescriptionItem[] = [
      {
        medicineName: 'Amlodipine 5 mg',
        activeIngredient: 'Amlodipine',
        totalQuantity: 30,
        unit: 'viên',
        usageInstructions: 'Uống 1 viên mỗi ngày, sau ăn sáng.',
        dosageMorning: '1 viên',
        dosageNoon: '—',
        dosageAfternoon: '—',
        dosageNight: '—',
      },
      {
        medicineName: 'Atorvastatin 10 mg',
        activeIngredient: 'Atorvastatin',
        totalQuantity: 30,
        unit: 'viên',
        usageInstructions: 'Uống buổi tối trước khi ngủ.',
        dosageMorning: '—',
        dosageNoon: '—',
        dosageAfternoon: '—',
        dosageNight: '1 viên',
      },
    ];

    this.appointments.set([
      {
        id: 'mock-upcoming-01',
        appointmentCode: 'APT-DEMO-2601',
        status: 'CONFIRMED',
        totalAmount: 350000,
        doctor: doctor('Trần Văn Tiến', 'PGS.TS.BS', 'Tim mạch', 'A203'),
        schedule: relativeSchedule(72),
      },
      {
        id: 'mock-upcoming-02',
        appointmentCode: 'APT-DEMO-2602',
        status: 'CONFIRMED',
        totalAmount: 280000,
        doctor: doctor('Trần Quốc Bảo', 'ThS.BS', 'Nội tổng quát', 'B105'),
        schedule: relativeSchedule(8),
      },
      {
        id: 'mock-upcoming-03',
        appointmentCode: 'APT-DEMO-2603',
        status: 'CONFIRMED',
        totalAmount: 260000,
        doctor: doctor('Phạm Hoàng Long', 'BSCKII', 'Da liễu', 'D108'),
        schedule: relativeSchedule(1.5),
      },
      {
        id: 'mock-completed-01',
        appointmentCode: 'APT-DEMO-2518',
        status: 'COMPLETED',
        totalAmount: 420000,
        doctor: doctor('Lê Thu Hà', 'BSCKII', 'Nội tiết', 'C312'),
        schedule: date(-12, '08:30:00'),
        medicalRecord: {
          clinicalNotes: 'Tăng huyết áp nguyên phát, hiện ổn định với điều trị.',
          icd10PrimaryCode: 'I10',
          icd10SecondaryCodes: 'E78.5',
          doctorAdvice:
            'Duy trì thuốc đều đặn, đo huyết áp tại nhà mỗi sáng. Tái khám sau 4 tuần.',
          followUpDate: date(16, '00:00:00').date,
          dietAdvice: 'Giảm muối, hạn chế thức ăn nhiều dầu mỡ.',
          digitallySigned: true,
          prescription: {
            prescriptionCode: 'RX-DEMO-771',
            digitallySigned: true,
            items: prescription,
          },
        },
      },
      {
        id: 'mock-cancelled-01',
        appointmentCode: 'APT-DEMO-2509',
        status: 'CANCELLED_BY_PATIENT',
        totalAmount: 250000,
        cancellationReason: 'Bệnh nhân có lịch công tác đột xuất.',
        doctor: doctor('Phạm Hoàng Long', 'ThS.BS', 'Nhi khoa', 'D108'),
        schedule: date(-4, '10:15:00'),
      },
    ]);

    this.error.set('');
    this.loading.set(false);
    this.isMock.set(true);
    this.activeTab.set('upcoming');
  }

  count(tab: Tab): number {
    return this.appointments().filter((a) => this.tabFor(a.status) === tab).length;
  }

  itemsForTab(): Appointment[] {
    return this.appointments().filter((a) => this.tabFor(a.status) === this.activeTab());
  }

  emptyTitle(): string {
    return this.activeTab() === 'upcoming'
      ? 'Bạn chưa có lịch khám sắp tới'
      : this.activeTab() === 'completed'
        ? 'Chưa có lần khám hoàn thành'
        : 'Chưa có lịch đã hủy';
  }

  private tabFor(status: string): Tab | null {
    if (['CONFIRMED', 'CHECKED_IN'].includes(status)) {
      return 'upcoming';
    }
    if (status === 'COMPLETED') {
      return 'completed';
    }
    if (status.includes('CANCELLED')) {
      return 'cancelled';
    }
    return null;
  }

  doctorName(a: Appointment): string {
    const name = a.doctor?.user?.fullName || 'Bác sĩ';
    return `${a.doctor?.academicTitle ? `${a.doctor.academicTitle} ` : ''}${name}`;
  }

  statusLabel(status: string): string {
    return (
      {
        CONFIRMED: 'Đã xác nhận',
        CHECKED_IN: 'Đã check-in',
        COMPLETED: 'Đã hoàn thành',
        CANCELLED: 'Đã hủy',
        CANCELLED_BY_PATIENT: 'Đã hủy',
        CANCELLED_BY_CLINIC: 'Cơ sở đã hủy',
      } as Record<string, string>
    )[status] || status;
  }

  canCancel(a: Appointment): boolean {
    return ['CONFIRMED'].includes(a.status);
  }

  openCancel(a: Appointment): void {
    if (!this.canCancel(a)) {
      return;
    }

    this.cancelTarget.set(a);
    this.cancelReason = '';
    this.reasonError.set('');
    this.consentAccepted = false;
    this.consentError = false;
  }

  closeCancel(): void {
    if (!this.submitting()) {
      this.cancelTarget.set(null);
    }
  }

  scheduledAt(a: Appointment): number {
    return new Date(`${a.schedule?.date}T${a.schedule?.startTime}+07:00`).getTime();
  }

  remainingMs(): number {
    return this.cancelTarget() ? this.scheduledAt(this.cancelTarget()!) - this.clock() : 0;
  }

  remainingText(): string {
    const ms = Math.max(0, this.remainingMs());
    const d = Math.floor(ms / 86400000);
    const h = Math.floor((ms % 86400000) / 3600000);
    const m = Math.floor((ms % 3600000) / 60000);
    const s = Math.floor((ms % 60000) / 1000);

    return d ? `${d} ngày ${h} giờ` : `${h} giờ ${m} phút ${s} giây`;
  }

  refundBand(): 'green' | 'yellow' | 'red' {
    const hours = this.remainingMs() / 3600000;

    if (hours > 24) {
      return 'green';
    }

    if (hours > 2) {
      return 'yellow';
    }

    return 'red';
  }

  refundMessage(): string {
    const band = this.refundBand();

    if (band === 'green') {
      return 'Được hoàn 100% chi phí khám';
    }

    if (band === 'yellow') {
      return 'Được hoàn 70% chi phí khám (khấu trừ 30% phí điều phối ca trực)';
    }

    return 'Hủy trong vòng dưới 2 giờ trước khám không được hoàn phí';
  }

  submitCancel(): void {
    const a = this.cancelTarget();

    if (!a || this.submitting()) {
      return;
    }

    if (!this.cancelReason.trim()) {
      this.reasonError.set('Vui lòng nhập lý do hủy.');
      return;
    }

    if (!this.consentAccepted) {
      this.consentError = true;
      return;
    }

    this.submitting.set(true);
    const reason = this.cancelReason.trim();
    const consent_nd13_accepted_at = new Date().toISOString();
    const payload = {
      cancelReason: reason,
      consent_nd13_accepted_at,
    };

    const success = (updated: object = {}) => {
      this.appointments.update((rows) =>
        rows.map((row) =>
          row.id === a.id
            ? { ...row, ...updated, status: 'CANCELLED_BY_PATIENT', cancellationReason: reason }
            : row
        )
      );

      this.cancelTarget.set(null);
      this.submitting.set(false);
      this.showToast('Đã hủy lịch khám thành công.', 'success');

      if (!this.isMock()) {
        this.load();
      }
    };

    if (this.isMock()) {
      setTimeout(() => success(payload), 500);
      return;
    }

    this.http
      .post(`/api/v1/appointments/${a.id}/cancel`, payload, { headers: this.headers() })
      .subscribe({
        next: (updated) => success(updated as object),
        error: (e) => {
          this.submitting.set(false);
          this.showToast(
            e?.error?.message || 'Không thể hủy lịch. Vui lòng thử lại.',
            'error'
          );
        },
      });
  }

  showToast(text: string, type: 'success' | 'error'): void {
    this.toast.set(text);
    this.toastType.set(type);

    if (this.toastTimer) {
      clearTimeout(this.toastTimer);
    }

    this.toastTimer = setTimeout(() => this.toast.set(''), 4500);
  }

  directions(a: Appointment): void {
    const query = encodeURIComponent(`phòng khám ${a.doctor?.roomNumber || ''}`);
    window.open(`https://www.google.com/maps/search/?api=1&query=${query}`, '_blank', 'noopener');
  }

  showDetails(a: Appointment): void {
    this.detail.set(a);
    this.detailRecord.set(a.medicalRecord || null);
    this.detailError.set('');

    if (a.medicalRecord) {
      return;
    }

    this.detailLoading.set(true);

    this.http
      .get<MedicalRecord>(`/api/v1/clinical/medical-records/appointment/${a.id}`, {
        headers: this.headers(),
      })
      .subscribe({
        next: (r) => {
          this.detailRecord.set(r);
          this.detailLoading.set(false);
        },
        error: (e) => {
          this.detailError.set(
            e?.error?.message || 'Chưa có dữ liệu hồ sơ khám cho lần khám này.'
          );
          this.detailLoading.set(false);
        },
      });
  }

  secondaryDiagnosis(): string {
    const r = this.detailRecord();
    return r?.secondaryDiagnoses?.join(', ') || r?.icd10SecondaryCodes || 'Không có';
  }

  download(url?: string): void {
    if (!url) {
      return;
    }

    const a = document.createElement('a');
    a.href = url;
    a.download = '';
    a.rel = 'noopener';
    a.click();
  }
}
