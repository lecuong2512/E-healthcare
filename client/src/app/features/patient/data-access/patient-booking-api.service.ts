import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { PaymentMethod } from '@shared/enums';
import {
  AppointmentResponse,
  ConfirmBookingRequest,
  InitiatePaymentResponse,
  PaymentStatusResponse,
  ReleaseSlotRequest,
  ReleaseSlotResponse,
  ReserveSlotRequest,
  ReserveSlotResponse,
} from '@shared/interfaces';
import { environment } from '../../../../environments/environment';

export interface PatientDoctorSummary {
  id: string;
  fullName: string;
  academicTitle: string | null;
  specialty: { id: string; name: string };
  consultationFee: number;
  bioDescription: string | null;
  roomNumber: string;
  ratingAverage: number;
}

export interface PatientDoctorSchedule {
  id: string;
  doctorId: string;
  date: string;
  startTime: string;
  endTime: string;
  status: string;
}

export interface PatientDoctorDetail extends PatientDoctorSummary {
  availableSchedules: PatientDoctorSchedule[];
}

export interface PatientDoctorSearchResponse {
  data: PatientDoctorSummary[];
  pagination: { page: number; limit: number; total: number; totalPages: number };
}

export interface PatientVoucher {
  id: string;
  code: string;
  discountPercent: number;
  isUsed: boolean;
  expiresAt: string;
}

export interface VoucherValidationResponse {
  code: string;
  discountPercent: number;
  discountAmount: number;
  finalAmount: number;
}

@Injectable({ providedIn: 'root' })
export class PatientBookingApiService {
  private readonly http = inject(HttpClient);
  private readonly api = environment.apiBaseUrl;

  searchDoctors(): Observable<PatientDoctorSearchResponse> {
    return this.http.get<PatientDoctorSearchResponse>(`${this.api}/doctors/search`, {
      params: { page: 1, limit: 100 },
    });
  }

  getDoctor(doctorId: string): Observable<PatientDoctorDetail> {
    return this.http.get<PatientDoctorDetail>(
      `${this.api}/doctors/${encodeURIComponent(doctorId)}`,
    );
  }

  reserveSlot(request: ReserveSlotRequest): Observable<ReserveSlotResponse> {
    return this.http.post<ReserveSlotResponse>(`${this.api}/booking/reserve-slot`, request);
  }

  releaseSlot(request: ReleaseSlotRequest): Observable<ReleaseSlotResponse> {
    return this.http.post<ReleaseSlotResponse>(`${this.api}/booking/release-slot`, request);
  }

  confirmBooking(request: ConfirmBookingRequest): Observable<AppointmentResponse> {
    return this.http.post<AppointmentResponse>(
      `${this.api}/booking/confirm-booking`,
      request,
    );
  }

  initiatePayment(
    appointmentId: string,
    provider: PaymentMethod.VNPAY | PaymentMethod.MOMO,
    idempotencyKey: string,
    supersedeActive?: boolean,
  ): Observable<InitiatePaymentResponse> {
    const body: { provider: PaymentMethod.VNPAY | PaymentMethod.MOMO; supersedeActive?: boolean } = { provider };
    if (supersedeActive) {
      body.supersedeActive = true;
    }
    return this.http.post<InitiatePaymentResponse>(
      `${this.api}/payments/${encodeURIComponent(appointmentId)}/initiate`,
      body,
      { headers: new HttpHeaders({ 'Idempotency-Key': idempotencyKey }) },
    );
  }

  cancelAppointment(
    appointmentId: string,
    reason?: string,
  ): Observable<{ success: boolean; message?: string }> {
    return this.http.post<{ success: boolean; message?: string }>(
      `${this.api}/appointments/${encodeURIComponent(appointmentId)}/cancel`,
      {
        reason: reason || 'Hủy giao dịch chờ thanh toán để đặt lại',
        consentAccepted: true,
      },
    );
  }

  getPaymentStatus(appointmentId: string): Observable<PaymentStatusResponse> {
    return this.http.get<PaymentStatusResponse>(
      `${this.api}/payments/${encodeURIComponent(appointmentId)}/status`,
    );
  }

  getVouchers(): Observable<PatientVoucher[]> {
    return this.http.get<PatientVoucher[]>(`${this.api}/appointments/me/vouchers`);
  }

  validateVoucher(code: string, totalAmount: number): Observable<VoucherValidationResponse> {
    return this.http.get<VoucherValidationResponse>(`${this.api}/appointments/vouchers/validate`, {
      params: { code, totalAmount },
    });
  }
}
