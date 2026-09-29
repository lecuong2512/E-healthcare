import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';

export interface StaffRow { id: string; fullName: string; email: string | null; status: string; }
export interface RecurringShiftRow { id: string; dayOfWeek: number; startTime: string; endTime: string; roomNumber: string; approvalStatus: 'PENDING' | 'APPROVED'; approvedAt: string | null; }

@Injectable({ providedIn: 'root' })
export class AdminStaffApiService {
  private readonly http = inject(HttpClient);

  list() { return this.http.get<{ data: StaffRow[]; summary: { active: number; pending: number; blocked: number } }>('/api/v1/admin/staff'); }
  create(body: Record<string, unknown>) { return this.http.post<StaffRow>('/api/v1/admin/staff', body); }
  changeStatus(userId: string, status: string) { return this.http.patch<StaffRow>(`/api/v1/admin/staff/${userId}/status`, { status }); }
  updateProfile(userId: string, body: Record<string, unknown>) { return this.http.patch<StaffRow>(`/api/v1/admin/staff/${userId}`, body); }
  listRecurringShifts() { return this.http.get<RecurringShiftRow[]>('/api/v1/admin/staff/recurring-shifts'); }
  approveRecurringShift(shiftId: string) { return this.http.post<RecurringShiftRow>(`/api/v1/admin/staff/recurring-shifts/${shiftId}/approve`, {}); }
}
