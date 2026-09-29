import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
export interface PaymentBreakdown { method: string; revenue: number; percentage: number; }
export interface TrendPoint { day: string; visits: number; revenue: number; }
export interface DoctorPerformance { name: string; specialty: string; completedCases: number; averageMinutes: number; rating: number; }
export interface KpiComparison { visits:number|null; revenue:number|null; completionRate:number; cancellationRate:number; noShowRate:number; }
export interface DashboardKpi { visits:number; revenue:number; completionRate:number; cancellationRate:number; noShowRate:number; comparison?:KpiComparison; trend:TrendPoint[]; paymentBreakdown: PaymentBreakdown[]; doctorPerformance: DoctorPerformance[]; }
@Injectable({ providedIn: 'root' }) export class AdminDashboardApiService { private readonly http=inject(HttpClient); overview(days:number){return this.http.get<DashboardKpi>('/api/v1/admin/dashboard/overview',{params:{days}});} approve(days:number){return this.http.post<{status:string}>('/api/v1/admin/dashboard/approve',{days});} }
