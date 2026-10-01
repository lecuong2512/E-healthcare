import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Role } from '@shared/enums';

export interface StaffRow {
  id: string; code?: string; fullName: string; email: string | null; status: string; role: Role;
  phoneNumber?: string | null; gender?: string; dateOfBirth?: string;
  licenseNumber?: string | null; academicTitle?: string | null;
  yearsExperience?: number | null; consultationFee?: number | null; roomNumber?: string | null; specialtyIds?: string[];
  avatarUrl?: string | null;
}
export interface SpecialtyOption { id: string; name: string; }
export interface RecurringShiftRow { id: string; staffName: string; shiftDate: string; startTime: string; endTime: string; roomNumber: string; approvalStatus: 'PENDING' | 'APPROVED' | 'LOCKED'; approvedAt: string | null; notes: string | null; }
export interface ClinicRoomRow { id: string; roomNumber: string; roomName: string | null; specialtyId: string | null; roomType: string | null; location: string | null; notes: string | null; isActive: boolean; }

@Injectable({ providedIn: 'root' })
export class AdminStaffApiService {
  private readonly http = inject(HttpClient);

  list() { return this.http.get<{ data: StaffRow[]; summary: { active: number; pending: number; blocked: number } }>('/api/v1/admin/staff'); }
  listRooms() { return this.http.get<string[]>('/api/v1/admin/staff/rooms'); }
  listRoomCatalog() { return this.http.get<ClinicRoomRow[]>('/api/v1/admin/staff/room-catalog'); }
  createRoom(body: { roomNumber: string; roomName?: string; specialtyId?: string; roomType?: string; location?: string; notes?: string }) { return this.http.post('/api/v1/admin/staff/room-catalog', body); }
  updateRoom(roomId: string, body: { roomName?: string; specialtyId?: string; roomType?: string; location?: string; notes?: string; isActive?: boolean }) { return this.http.patch(`/api/v1/admin/staff/room-catalog/${roomId}`, body); }
  listSpecialties() { return this.http.get<SpecialtyOption[]>('/api/v1/doctors/specialties'); }
  create(body: Record<string, unknown>) { return this.http.post<StaffRow>('/api/v1/admin/staff', body); }
  changeStatus(userId: string, status: string) { return this.http.patch<StaffRow>(`/api/v1/admin/staff/${userId}/status`, { status }); }
  updateProfile(userId: string, body: Record<string, unknown>) { return this.http.patch<StaffRow>(`/api/v1/admin/staff/${userId}`, body); }
  uploadAvatar(userId: string, file: File) {
    const formData = new FormData();
    formData.append('file', file);
    return this.http.post<{ avatarUrl: string }>(`/api/v1/users/avatar?userId=${userId}`, formData);
  }
  listRecurringShifts() { return this.http.get<RecurringShiftRow[]>('/api/v1/admin/staff/recurring-shifts'); }
  createShiftAssignment(body: { userId: string; roomId: string; shiftDate: string; startTime: string; endTime: string; notes?: string }) { return this.http.post('/api/v1/admin/staff/shift-assignments', body); }
  updateShiftAssignment(shiftId: string, body: Partial<{ roomId: string; shiftDate: string; startTime: string; endTime: string; notes: string; approvalStatus: 'PENDING' | 'APPROVED' | 'LOCKED' }>) { return this.http.patch(`/api/v1/admin/staff/shift-assignments/${shiftId}`, body); }
  approveRecurringShift(shiftId: string) { return this.http.post<RecurringShiftRow>(`/api/v1/admin/staff/recurring-shifts/${shiftId}/approve`, {}); }
}
