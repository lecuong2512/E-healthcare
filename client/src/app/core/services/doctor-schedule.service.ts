import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { ShiftType, SlotStatus } from '@shared/enums';
import { environment } from '../../../environments/environment';

export interface CreateDoctorSchedulePayload {
  date: string;
  shiftType: ShiftType;
  slotDurationMinutes: number;
}

export interface DoctorScheduleSlot {
  id: string;
  doctorId: string;
  date: string;
  startTime: string;
  endTime: string;
  status: SlotStatus;
  version: number;
}

export interface ClinicRoomOption {
  id: string;
  roomNumber: string;
  roomName: string;
  location?: string;
}

export interface DoctorScheduleResult {
  doctorId: string;
  roomNumber: string;
  slots: DoctorScheduleSlot[];
}

@Injectable({ providedIn: 'root' })
export class DoctorScheduleService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${environment.apiBaseUrl}/doctor/schedules`;

  getMySchedules(from?: string, to?: string): Observable<DoctorScheduleResult> {
    let params = new HttpParams();
    if (from) params = params.set('from', from);
    if (to) params = params.set('to', to);
    return this.http.get<DoctorScheduleResult>(this.baseUrl, { params });
  }

  getClinicRooms(): Observable<ClinicRoomOption[]> {
    return this.http.get<ClinicRoomOption[]>(`${this.baseUrl}/rooms`);
  }

  createSchedule(payload: CreateDoctorSchedulePayload | any): Observable<DoctorScheduleResult> {
    return this.http.post<DoctorScheduleResult>(this.baseUrl, payload);
  }

  deleteSchedule(scheduleId: string): Observable<void> {
    return this.http.delete<void>(`${this.baseUrl}/${encodeURIComponent(scheduleId)}`);
  }
}
