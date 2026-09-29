import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AdminDashboardApiService, DashboardKpi } from '../../data-access/admin-dashboard-api.service';
const EMPTY: DashboardKpi={visits:0,revenue:0,completionRate:0,cancellationRate:0,noShowRate:0,trend:[]};
@Component({selector:'app-admin-dashboard-page',standalone:true,imports:[CommonModule],templateUrl:'./dashboard.page.html',styleUrl:'./dashboard.page.scss',changeDetection:ChangeDetectionStrategy.OnPush})
export class AdminDashboardPage { private readonly api=inject(AdminDashboardApiService); readonly days=signal(7); readonly kpi=signal<DashboardKpi>(EMPTY); readonly approved=signal(false); ngOnInit(){this.load();} select(days:number){this.days.set(days);this.approved.set(false);this.load();} load(){this.api.overview(this.days()).subscribe({next:value=>this.kpi.set(value)});} approve(){this.api.approve(this.days()).subscribe({next:()=>this.approved.set(true)});} exportUrl(type:'csv'|'pdf'){return `/api/v1/admin/dashboard/export/${type}?days=${this.days()}`;} }
