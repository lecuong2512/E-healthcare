import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import {
  CreateEmrAddendumRequest,
  CreateMedicalRecordRequest,
  EmrAddendumData,
  EmrHistoryResponse,
  MedicalRecordDetailResponse,
  UpdateMedicalRecordRequest,
} from '@shared/interfaces';
import { TokenStoreService } from './token-store.service';

const API_BASE = '/api/v1/clinical';

@Injectable({ providedIn: 'root' })
export class ClinicalService {
  private readonly http = inject(HttpClient);
  private readonly tokenStore = inject(TokenStoreService);

  createMedicalRecord(
    request: CreateMedicalRecordRequest,
  ): Observable<MedicalRecordDetailResponse> {
    return this.http.post<MedicalRecordDetailResponse>(
      `${API_BASE}/medical-records`,
      request,
      { headers: this.authHeaders() },
    );
  }

  updateMedicalRecord(
    recordId: string,
    request: UpdateMedicalRecordRequest,
  ): Observable<MedicalRecordDetailResponse> {
    return this.http.patch<MedicalRecordDetailResponse>(
      `${API_BASE}/medical-records/${recordId}`,
      request,
      { headers: this.authHeaders() },
    );
  }

  completeConsultation(
    recordId: string,
  ): Observable<MedicalRecordDetailResponse> {
    return this.http.post<MedicalRecordDetailResponse>(
      `${API_BASE}/medical-records/${recordId}/complete`,
      {},
      { headers: this.authHeaders() },
    );
  }

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

  /**
   * Tải tệp PDF đơn thuốc điện tử cho một lịch hẹn đã hoàn thành.
   * Backend yêu cầu JWT Role PATIENT và kiểm tra sở hữu theo appointment ID.
   * SRS-PAT-04: "Tải tệp PDF đơn thuốc/kết quả khám có gắn chữ ký số".
   */
  downloadPrescriptionPdf(appointmentId: string): Observable<Blob> {
    return this.http.get(
      `${API_BASE}/appointments/${encodeURIComponent(appointmentId)}/prescription.pdf`,
      {
        headers: this.authHeaders(),
        responseType: 'blob',
      },
    );
  }

  private authHeaders(): HttpHeaders {
    const accessToken = this.tokenStore.accessToken();
    return new HttpHeaders({
      Authorization: `Bearer ${accessToken ?? ''}`,
    });
  }
}
