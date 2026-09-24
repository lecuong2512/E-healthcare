import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterModule } from '@angular/router';

type QueueStatus = 'CONFIRMED' | 'CHECKED_IN' | 'IN_CONSULTATION' | 'COMPLETED' | 'NO_SHOW';
interface QueuePatient { stt: number; time: string; code: string; name: string; gender: string; year: number; symptoms: string; status: QueueStatus; }

@Component({ selector: 'app-patient-queue-page', standalone: true, imports: [CommonModule, RouterModule], templateUrl: './patient-queue.page.html' })
export class PatientQueuePage {
  private router = inject(Router);
  readonly statusLabels: Record<QueueStatus, string> = { CONFIRMED: 'Đã xác nhận', CHECKED_IN: 'Đã tiếp nhận', IN_CONSULTATION: 'Đang khám', COMPLETED: 'Đã hoàn tất', NO_SHOW: 'Vắng mặt' };
  readonly statusClasses: Record<QueueStatus, string> = { CONFIRMED: 'bg-slate-100 text-slate-700', CHECKED_IN: 'bg-sky-100 text-sky-700', IN_CONSULTATION: 'bg-purple-100 text-purple-700', COMPLETED: 'bg-emerald-100 text-emerald-700', NO_SHOW: 'bg-red-100 text-red-700' };
  patients: QueuePatient[] = [
    { stt: 1, time: '08:00–08:30', code: 'APT-260907-8891', name: 'Nguyễn Thị Bình', gender: 'Nữ', year: 1978, symptoms: 'Đau ngực, khó thở nhẹ', status: 'COMPLETED' },
    { stt: 2, time: '08:30–09:00', code: 'APT-260907-8892', name: 'Trần Văn Đức', gender: 'Nam', year: 1990, symptoms: 'Huyết áp cao, hoa mắt', status: 'COMPLETED' },
    { stt: 3, time: '09:00–09:30', code: 'APT-260907-8893', name: 'Lê Thị Hoa', gender: 'Nữ', year: 1965, symptoms: 'Tim đập nhanh, hồi hộp', status: 'COMPLETED' },
    { stt: 4, time: '09:30–10:00', code: 'APT-260907-8894', name: 'Trần Văn A', gender: 'Nam', year: 1995, symptoms: 'Đau thắt ngực khi gắng sức', status: 'IN_CONSULTATION' },
    { stt: 5, time: '10:00–10:30', code: 'APT-260907-8895', name: 'Hoàng Minh Tuấn', gender: 'Nam', year: 1972, symptoms: 'Khó thở khi nằm đầu thấp', status: 'CHECKED_IN' },
    { stt: 6, time: '10:30–11:00', code: 'APT-260907-8896', name: 'Vũ Thị Lan', gender: 'Nữ', year: 1988, symptoms: 'Phù chân, mệt mỏi kéo dài', status: 'CHECKED_IN' },
    { stt: 7, time: '11:00–11:30', code: 'APT-260907-8897', name: 'Đặng Văn Khánh', gender: 'Nam', year: 1955, symptoms: 'Tái khám định kỳ sau đặt stent', status: 'CONFIRMED' },
    { stt: 8, time: '11:30–12:00', code: 'APT-260907-8898', name: 'Bùi Thị Mai', gender: 'Nữ', year: 1995, symptoms: 'Hồi hộp, đánh trống ngực', status: 'CONFIRMED' },
    { stt: 9, time: '08:00–08:30', code: 'APT-260907-8899', name: 'Ngô Văn Hùng', gender: 'Nam', year: 1968, symptoms: 'Đau tức ngực trái', status: 'NO_SHOW' },
  ];
  get metrics() { return [ { label: 'Tổng ca', value: this.patients.length, color: '#0F172A' }, { label: 'Đang đợi', value: this.patients.filter(p => p.status === 'CHECKED_IN' || p.status === 'CONFIRMED').length, color: '#0284C7' }, { label: 'Đang khám', value: this.patients.filter(p => p.status === 'IN_CONSULTATION').length, color: '#7E22CE' }, { label: 'Đã xong', value: this.patients.filter(p => p.status === 'COMPLETED').length, color: '#047857' }, { label: 'Vắng mặt', value: this.patients.filter(p => p.status === 'NO_SHOW').length, color: '#B91C1C' } ]; }
  startConsultation(patient: QueuePatient) {
    if (patient.status === 'CHECKED_IN') patient.status = 'IN_CONSULTATION';
    this.router.navigate(['/doctor/consultation', patient.code]);
  }
}
