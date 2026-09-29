import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
export interface DashboardKpi { visits:number; revenue:number; completionRate:number; cancellationRate:number; noShowRate:number; trend:number[]; }
@Injectable({ providedIn: 'root' }) export class AdminDashboardApiService { private readonly http=inject(HttpClient); overview(days:number){return this.http.get<DashboardKpi>('/api/v1/admin/dashboard/overview',{params:{days}});} approve(days:number){return this.http.post<{status:string}>('/api/v1/admin/dashboard/approve',{days});} }
