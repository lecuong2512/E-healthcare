import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { Component, OnDestroy, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { MedicalRecordDetailResponse } from '@shared/interfaces';
import {
  AppointmentDoctorReview,
  CreateDoctorReviewRequest,
  DoctorReviewResponse,
} from '@shared/interfaces';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzInputModule } from 'ng-zorro-antd/input';
import { NzMessageModule, NzMessageService } from 'ng-zorro-antd/message';
import { NzModalModule } from 'ng-zorro-antd/modal';
import { NzRateModule } from 'ng-zorro-antd/rate';
import { toDataURL } from 'qrcode';
import { environment } from '../../../../../environments/environment';
import { ClinicalService } from '../../../../core/services/clinical.service';
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
    id?: string;
    ratingAverage?: number;
    academicTitle?: string;
    consultationFee?: number;
    roomNumber?: string;
    specialty?: { name?: string };
    user?: { fullName?: string };
  };
  schedule?: { date: string; startTime: string; endTime: string };
  review?: AppointmentDoctorReview | null;
}

interface CheckInQrResponse {
  qrToken: string;
  expiresAt: string;
}

interface QrState {
  loading: boolean;
  dataUrl?: string;
  error?: string;
}

interface CheckInQrResponse {
  qrToken: string;
  expiresAt: string;
}

interface QrState {
  loading: boolean;
  dataUrl?: string;
  error?: string;
}

@Component({
  selector: 'app-medical-history-page',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    RouterLink,
    PatientConsentCheckboxComponent,
    NzButtonModule,
    NzInputModule,
    NzMessageModule,
    NzModalModule,
    NzRateModule,
  ],
  templateUrl: './medical-history.page.html',
  styleUrls: ['./medical-history.page.scss'],
})
export class MedicalHistoryPage implements OnInit, OnDestroy {
  private readonly http = inject(HttpClient);
  private readonly clinical = inject(ClinicalService);
  private readonly message = inject(NzMessageService);

  readonly tabs: { id: Tab; label: string }[] = [
    { id: 'upcoming', label: 'Sắp tới' },
    { id: 'completed', label: 'Đã hoàn thành' },
    { id: 'cancelled', label: 'Đã hủy' },
  ];

  readonly activeTab = signal<Tab>('upcoming');
  readonly appointments = signal<Appointment[]>([]);
  readonly loading = signal(true);
  readonly error = signal('');
  readonly isMock = signal(false);

  readonly reviewTarget = signal<Appointment | null>(null);
  readonly reviewRating = signal(0);
  readonly reviewModalVisible = signal(false);
  readonly reviewSubmitting = signal(false);
  reviewComment = '';
  readonly qrStates = signal<Record<string, QrState>>({});

  readonly cancelTarget = signal<Appointment | null>(null);
  cancelReason = '';
  readonly reasonError = signal('');
  consentAccepted = false;
  consentError = false;
  readonly submitting = signal(false);

  readonly detail = signal<Appointment | null>(null);
  readonly detailRecord = signal<MedicalRecordDetailResponse | null>(null);
  readonly detailLoading = signal(false);
  readonly detailError = signal('');
  readonly pdfDownloading = signal(false);
  readonly pdfError = signal('');

  readonly toast = signal('');
  readonly toastType = signal<'success' | 'error'>('success');
  private toastTimer?: ReturnType<typeof setTimeout>;
  private tick?: ReturnType<typeof setInterval>;
  readonly clock = signal(Date.now());

  ngOnInit(): void {
    this.load();
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

  load(): void {
    this.loading.set(true);
    this.error.set('');

    this.http
      .get<Appointment[]>(`${environment.apiBaseUrl}/appointments/me`)
      .subscribe({
        next: (rows) => {
          const appointments = rows ?? [];
          this.appointments.set(appointments);
          this.loading.set(false);
          appointments
            .filter((appointment) => appointment.status === 'CONFIRMED')
            .forEach((appointment) => this.loadQr(appointment));
        },
        error: (e) => {
          this.error.set(
            this.apiError(e, 'Không thể tải lịch sử khám. Vui lòng thử lại.'),
          );
          this.loading.set(false);
        },
      });
  }

  loadQr(appointment: Appointment): void {
    if (appointment.status !== 'CONFIRMED') return;

    this.qrStates.update((states) => ({
      ...states,
      [appointment.id]: { loading: true },
    }));

    this.http
      .get<CheckInQrResponse>(
        `${environment.apiBaseUrl}/appointments/${encodeURIComponent(appointment.id)}/check-in-qr`,
      )
      .subscribe({
        next: ({ qrToken }) => {
          void toDataURL(qrToken, { width: 160, margin: 1, errorCorrectionLevel: 'M' })
            .then((dataUrl: string) => {
              this.qrStates.update((states) => ({
                ...states,
                [appointment.id]: { loading: false, dataUrl },
              }));
            })
            .catch(() => this.setQrError(appointment.id));
        },
        error: () => this.setQrError(appointment.id),
      });
  }

  private setQrError(appointmentId: string): void {
    this.qrStates.update((states) => ({
      ...states,
      [appointmentId]: {
        loading: false,
        error: 'Không thể tải mã QR. Vui lòng thử lại.',
      },
    }));
  }

  private apiError(error: unknown, fallback: string): string {
    const response = error as { error?: { message?: string } };
    return response?.error?.message || fallback;
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
    return a.status === 'CONFIRMED';
  }

  canReview(a: Appointment): boolean {
    return a.status === 'COMPLETED' && !a.review;
  }

  openReview(a: Appointment): void {
    if (!this.canReview(a)) return;
    this.reviewTarget.set(a);
    this.reviewRating.set(0);
    this.reviewComment = '';
    this.reviewModalVisible.set(true);
  }

  closeReview(): void {
    if (this.reviewSubmitting()) return;
    this.reviewModalVisible.set(false);
    this.reviewTarget.set(null);
  }

  submitReview(): void {
    const appointment = this.reviewTarget();
    const doctorId = appointment?.doctor?.id;
    const rating = this.reviewRating();
    if (!appointment || !doctorId || rating < 1 || this.reviewSubmitting()) return;

    const payload: CreateDoctorReviewRequest = {
      appointmentId: appointment.id,
      rating,
      comment: this.reviewComment.trim() || null,
    };
    this.reviewSubmitting.set(true);

    const success = (response: DoctorReviewResponse) => {
      this.appointments.update((rows) =>
        rows.map((row) =>
          row.id === appointment.id
            ? {
                ...row,
                doctor: row.doctor
                  ? { ...row.doctor, ratingAverage: response.ratingAverage }
                  : row.doctor,
                review: {
                  id: response.id,
                  rating: response.rating,
                  comment: response.comment,
                  createdAt: response.createdAt,
                },
              }
            : row
        )
      );
      this.reviewSubmitting.set(false);
      this.reviewModalVisible.set(false);
      this.reviewTarget.set(null);
      this.message.success('Đã gửi đánh giá bác sĩ. Cảm ơn phản hồi của bạn!');
    };

    if (this.isMock()) {
      success({
        id: `mock-review-${appointment.id}`,
        appointmentId: appointment.id,
        doctorId,
        rating,
        comment: payload.comment ?? null,
        createdAt: new Date().toISOString(),
        ratingAverage: rating,
      });
      return;
    }

    this.http
      .post<DoctorReviewResponse>(`/api/v1/doctors/${doctorId}/reviews`, payload)
      .subscribe({
        next: success,
        error: (error) => {
          this.reviewSubmitting.set(false);
          this.message.error(
            error?.error?.message || 'Không thể gửi đánh giá. Vui lòng thử lại.'
          );
        },
      });
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

    if (hours >= 24) {
      return 'green';
    }

    if (hours >= 2) {
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
    const payload = {
      reason,
      consentAccepted: true,
    };

    const success = (updated: Partial<Appointment>) => {
      this.appointments.update((rows) =>
        rows.map((row) =>
          row.id === a.id
            ? {
                ...row,
                ...updated,
                status: updated.status || 'CANCELLED_BY_PATIENT',
                cancellationReason: updated.cancellationReason ?? reason,
              }
            : row
        )
      );

      this.cancelTarget.set(null);
      this.submitting.set(false);
      this.showToast('Đã hủy lịch khám thành công.', 'success');
    };

    this.http
      .post(`${environment.apiBaseUrl}/appointments/${encodeURIComponent(a.id)}/cancel`, payload)
      .subscribe({
        next: (updated) => {
          success(updated as Partial<Appointment>);
          this.load();
        },
        error: (e) => {
          this.submitting.set(false);
          this.showToast(
            this.apiError(e, 'Không thể hủy lịch. Vui lòng thử lại.'),
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
    this.detailRecord.set(null);
    this.detailError.set('');
    this.detailLoading.set(true);
    this.pdfError.set('');

    this.clinical
      .getMedicalRecordByAppointment(a.id)
      .subscribe({
        next: (r) => {
          this.detailRecord.set(r);
          this.detailLoading.set(false);
        },
        error: (e) => {
          this.detailError.set(this.apiError(e, 'Chưa có dữ liệu hồ sơ khám cho lần khám này.'));
          this.detailLoading.set(false);
        },
      });
  }

  /**
   * SRS-PAT-04: Tải tệp PDF đơn thuốc điện tử có gắn mã băm SHA-256 và mã QR xác thực.
   * Backend kiểm tra JWT Role PATIENT và sở hữu appointment trước khi trả PDF.
   */
  downloadPrescriptionPdf(a: Appointment): void {
    if (this.pdfDownloading()) return;
    this.pdfDownloading.set(true);
    this.pdfError.set('');

    const prescriptionCode = this.detailRecord()?.prescription?.prescriptionCode;
    const filename = prescriptionCode
      ? `don-thuoc-${prescriptionCode.replace(/[^a-zA-Z0-9_-]/g, '_')}.pdf`
      : `don-thuoc-${a.appointmentCode ?? a.id}.pdf`;

    this.clinical.downloadPrescriptionPdf(a.id).subscribe({
      next: (blob) => {
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement('a');
        anchor.href = url;
        anchor.download = filename;
        anchor.click();
        setTimeout(() => URL.revokeObjectURL(url), 10_000);
        this.pdfDownloading.set(false);
      },
      error: (e) => {
        this.pdfDownloading.set(false);
        this.pdfError.set(
          this.apiError(e, 'Không thể tải đơn thuốc PDF. Vui lòng thử lại sau.')
        );
      },
    });
  }
}
