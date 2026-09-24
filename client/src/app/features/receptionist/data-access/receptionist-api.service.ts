import { HttpClient, HttpHeaders, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import {
  AvailableWalkInDoctor,
  AvailableWalkInDoctorsRequest,
  CheckInResponse,
  ClinicPrintInfo,
  CollectCounterPaymentRequest,
  CounterPaymentReceipt,
  LookupAppointmentRequest,
  QueueSnapshot,
  ReceptionAppointment,
  WalkInBookingRequest,
  WalkInBookingResponse,
} from '@shared/interfaces';
import { environment } from '../../../../environments/environment';

@Injectable({ providedIn: 'root' })
export class ReceptionistApiService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${environment.apiBaseUrl}/reception`;

  getClinicProfile(): Observable<ClinicPrintInfo> {
    return this.http.get<ClinicPrintInfo>(`${this.baseUrl}/clinic-profile`);
  }

  lookupAppointments(
    request: LookupAppointmentRequest,
  ): Observable<ReceptionAppointment[]> {
    let params = new HttpParams();

    if (request.code) {
      params = params.set('code', request.code);
    }
    if (request.phone) {
      params = params.set('phone', request.phone);
    }

    return this.http.get<ReceptionAppointment[]>(
      `${this.baseUrl}/appointments/lookup`,
      { params },
    );
  }

  lookupQr(qrToken: string): Observable<ReceptionAppointment> {
    return this.http.post<ReceptionAppointment>(`${this.baseUrl}/qr/lookup`, {
      qrToken,
    });
  }

  checkInByQr(qrToken: string): Observable<CheckInResponse> {
    return this.http.post<CheckInResponse>(`${this.baseUrl}/qr/check-in`, {
      qrToken,
    });
  }

  checkIn(appointmentId: string): Observable<CheckInResponse> {
    return this.http.post<CheckInResponse>(
      `${this.baseUrl}/appointments/${encodeURIComponent(appointmentId)}/check-in`,
      {},
    );
  }

  collectPayment(
    appointmentId: string,
    request: CollectCounterPaymentRequest,
  ): Observable<CounterPaymentReceipt> {
    return this.http.post<CounterPaymentReceipt>(
      `${this.baseUrl}/appointments/${encodeURIComponent(appointmentId)}/collect-payment`,
      request,
    );
  }

  getReceipt(appointmentId: string): Observable<CounterPaymentReceipt> {
    return this.http.get<CounterPaymentReceipt>(
      `${this.baseUrl}/appointments/${encodeURIComponent(appointmentId)}/receipt`,
    );
  }

  getWalkInDoctors(
    request: AvailableWalkInDoctorsRequest = {},
  ): Observable<AvailableWalkInDoctor[]> {
    let params = new HttpParams();

    if (request.specialtyId) {
      params = params.set('specialtyId', request.specialtyId);
    }
    if (request.doctorName) {
      params = params.set('doctorName', request.doctorName);
    }

    return this.http.get<AvailableWalkInDoctor[]>(
      `${this.baseUrl}/walk-in/doctors`,
      { params },
    );
  }

  createWalkIn(
    request: WalkInBookingRequest,
    idempotencyKey: string,
  ): Observable<WalkInBookingResponse> {
    return this.http.post<WalkInBookingResponse>(
      `${this.baseUrl}/walk-in`,
      request,
      {
        headers: new HttpHeaders({ 'Idempotency-Key': idempotencyKey }),
      },
    );
  }

  getQueue(): Observable<QueueSnapshot> {
    return this.http.get<QueueSnapshot>(`${this.baseUrl}/queue`);
  }
}
