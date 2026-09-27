import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import {
  CreateEmrAddendumRequest,
  EmrAddendumData,
  EmrHistoryResponse,
  MedicalRecordDetailResponse,
} from '@shared/interfaces';
import { TokenStoreService } from './token-store.service';

const API_BASE = '/api/v1/clinical';

@Injectable({ providedIn: 'root' })
export class ClinicalService {
  private readonly http = inject(HttpClient);
  private readonly tokenStore = inject(TokenStoreService);

  getMedicalRecord(recordId: string): Observable<MedicalRecordDetailResponse> {
    return this.http.get<MedicalRecordDetailResponse>(
      `${API_BASE}/medical-records/${recordId}`,
      { headers: this.authHeaders() },
    );
  }

  getMedicalRecordByAppointment(
    appointmentId: string,
  ): Observable<MedicalRecordDetailResponse> {
    return this.http.get<MedicalRecordDetailResponse>(
      `${API_BASE}/medical-records/appointment/${appointmentId}`,
      { headers: this.authHeaders() },
    );
  }

  getEmrHistory(recordId: string): Observable<EmrHistoryResponse> {
    return this.http.get<EmrHistoryResponse>(
      `${API_BASE}/records/${recordId}/history`,
      { headers: this.authHeaders() },
    );
  }

  createEmrAddendum(
    recordId: string,
    request: CreateEmrAddendumRequest,
  ): Observable<EmrAddendumData> {
    return this.http.post<EmrAddendumData>(
      `${API_BASE}/records/${recordId}/addendums`,
      request,
      { headers: this.authHeaders() },
    );
  }

  private authHeaders(): HttpHeaders {
    const accessToken = this.tokenStore.accessToken();
    return new HttpHeaders({
      Authorization: `Bearer ${accessToken ?? ''}`,
    });
  }
}
