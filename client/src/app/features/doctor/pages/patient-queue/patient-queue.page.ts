import { Component, OnDestroy, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { Router, RouterModule } from '@angular/router';
import { Socket } from 'socket.io-client';
import {
  APPOINTMENT_STATUS_CHANGED_EVENT,
  QUEUE_NAMESPACE,
  QUEUE_SNAPSHOT_EVENT,
} from '@shared/constants/queue-socket.constants';
import { QueueSnapshot, QueueStatusChanged, QueueTicket } from '@shared/interfaces';
import { SocketService } from '../../../../core/services/socket.service';

export type QueueStatus =
  | 'PENDING_PAYMENT'
  | 'CONFIRMED'
  | 'CHECKED_IN'
  | 'IN_CONSULTATION'
  | 'COMPLETED'
  | 'NO_SHOW'
  | 'CANCELLED';

export interface QueuePatient {
  id?: string;
  stt: number;
  time: string;
  code: string;
  name: string;
  gender: string;
  year: number;
  symptoms: string;
  status: QueueStatus;
}

@Component({
  selector: 'app-patient-queue-page',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './patient-queue.page.html',
})
export class PatientQueuePage implements OnInit, OnDestroy {
  private readonly router = inject(Router);
  private readonly http = inject(HttpClient);
  private readonly socketService = inject(SocketService);

  readonly statusLabels: Record<string, string> = {
    CONFIRMED: 'Đã xác nhận',
    CHECKED_IN: 'Đã tiếp nhận',
    IN_CONSULTATION: 'Đang khám',
    COMPLETED: 'Đã hoàn tất',
    NO_SHOW: 'Vắng mặt',
    PENDING_PAYMENT: 'Chờ thanh toán',
    CANCELLED: 'Đã hủy',
  };

  readonly statusClasses: Record<string, string> = {
    CONFIRMED: 'bg-slate-100 text-slate-700',
    CHECKED_IN: 'bg-sky-100 text-sky-700',
    IN_CONSULTATION: 'bg-purple-100 text-purple-700',
    COMPLETED: 'bg-emerald-100 text-emerald-700',
    NO_SHOW: 'bg-red-100 text-red-700',
    PENDING_PAYMENT: 'bg-amber-100 text-amber-700',
    CANCELLED: 'bg-rose-100 text-rose-700',
  };

  patients: QueuePatient[] = [];
  doctorName = '';
  roomNumber = '';
  specialtyName = '';
  loading = false;
  private socket?: Socket;

  ngOnInit(): void {
    this.loadQueue();
    this.initSocket();
  }

  ngOnDestroy(): void {
    if (this.socket) {
      this.socket.off(QUEUE_SNAPSHOT_EVENT);
      this.socket.off('queue.snapshot');
      this.socket.off('queue.status_changed');
      this.socket.off(APPOINTMENT_STATUS_CHANGED_EVENT);
    }
  }

  get metrics() {
    return [
      { label: 'Tổng ca', value: this.patients.length, color: '#0F172A' },
      {
        label: 'Đang đợi',
        value: this.patients.filter(
          (p) => p.status === 'CHECKED_IN' || p.status === 'CONFIRMED',
        ).length,
        color: '#0284C7',
      },
      {
        label: 'Đang khám',
        value: this.patients.filter((p) => p.status === 'IN_CONSULTATION').length,
        color: '#7E22CE',
      },
      {
        label: 'Đã xong',
        value: this.patients.filter((p) => p.status === 'COMPLETED').length,
        color: '#047857',
      },
      {
        label: 'Vắng mặt',
        value: this.patients.filter((p) => p.status === 'NO_SHOW').length,
        color: '#B91C1C',
      },
    ];
  }

  loadQueue(): void {
    this.loading = true;
    this.http.get<QueueSnapshot>('/api/v1/doctor/queue').subscribe({
      next: (snapshot) => {
        this.loading = false;
        this.applySnapshot(snapshot);
      },
      error: (err) => {
        this.loading = false;
        console.error('Failed to load doctor queue snapshot:', err);
      },
    });
  }

  initSocket(): void {
    try {
      this.socket = this.socketService.connect(QUEUE_NAMESPACE);
      if (this.socket) {
        this.socket.on(QUEUE_SNAPSHOT_EVENT, (snapshot: QueueSnapshot) => {
          this.applySnapshot(snapshot);
        });
        this.socket.on('queue.snapshot', (snapshot: QueueSnapshot) => {
          this.applySnapshot(snapshot);
        });
        const handleStatusChanged = (event: QueueStatusChanged) => {
          this.handleStatusChanged(event);
        };
        this.socket.on('queue.status_changed', handleStatusChanged);
        this.socket.on(APPOINTMENT_STATUS_CHANGED_EVENT, handleStatusChanged);
      }
    } catch (err) {
      console.warn('Socket connect failed:', err);
    }
  }

  applySnapshot(snapshot: QueueSnapshot): void {
    if (!snapshot || !Array.isArray(snapshot.items)) return;
    this.patients = snapshot.items.map((item) => this.mapTicketToPatient(item));
    if (snapshot.items.length > 0) {
      this.doctorName = snapshot.items[0].doctorName;
      this.roomNumber = snapshot.items[0].roomNumber;
      this.specialtyName = snapshot.items[0].specialtyName;
    }
  }

  handleStatusChanged(event: QueueStatusChanged): void {
    if (!event) return;
    const index = this.patients.findIndex(
      (p) => (p.id && p.id === event.appointmentId) || p.code === event.appointmentCode,
    );
    if (index !== -1) {
      this.patients[index].status = event.status as QueueStatus;
      if (event.ticket) {
        this.patients[index] = {
          ...this.patients[index],
          ...this.mapTicketToPatient(event.ticket),
          status: event.status as QueueStatus,
        };
      }
    } else if (event.ticket) {
      this.patients.push(this.mapTicketToPatient(event.ticket));
      this.patients.sort((a, b) => a.stt - b.stt);
    }
  }

  mapTicketToPatient(ticket: QueueTicket): QueuePatient {
    let formattedTime = '08:00–08:30';
    if (ticket.checkedInAt) {
      const d = new Date(ticket.checkedInAt);
      if (!isNaN(d.getTime())) {
        formattedTime = d.toLocaleTimeString('vi-VN', {
          hour: '2-digit',
          minute: '2-digit',
        });
      }
    }
    return {
      id: ticket.appointmentId,
      stt: ticket.queueNumber,
      time: formattedTime,
      code: ticket.appointmentCode,
      name: ticket.patientName,
      gender: 'Chưa cập nhật',
      year: new Date().getFullYear() - 30,
      symptoms: 'Khám theo hẹn',
      status: ticket.status as QueueStatus,
    };
  }

  startConsultation(patient: QueuePatient): void {
    const targetId = patient.id || patient.code;
    if (patient.status === 'CHECKED_IN') {
      patient.status = 'IN_CONSULTATION';
      if (patient.id) {
        this.http
          .patch(`/api/v1/appointments/${patient.id}/status`, {
            status: 'IN_CONSULTATION',
          })
          .subscribe({
            next: () => {},
            error: (err) =>
              console.error('Failed to update status to IN_CONSULTATION:', err),
          });
      }
    }
    this.router.navigate(['/doctor/consultation', targetId]);
  }
}
