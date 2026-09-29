import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { AdminDashboardPage } from './dashboard.page';
import { AdminDashboardApiService } from '../../data-access/admin-dashboard-api.service';

describe('AdminDashboardPage', () => {
  it('loads KPI overview for the selected period', () => {
    const api = { overview: jasmine.createSpy().and.returnValue(of({ visits: 12, revenue: 4800000, completionRate: 75, cancellationRate: 16.67, noShowRate: 8.33, trend: [], paymentBreakdown: [], doctorPerformance: [] })), approve: jasmine.createSpy().and.returnValue(of({ status: 'APPROVED' })) };
    TestBed.configureTestingModule({ providers: [{ provide: AdminDashboardApiService, useValue: api }] });
    const fixture = TestBed.createComponent(AdminDashboardPage); fixture.detectChanges();
    expect(api.overview).toHaveBeenCalledWith(7);
    expect(fixture.componentInstance.kpi().revenue).toBe(4800000);
  });
  it('formats API trend dates into compact Vietnamese weekday labels for the chart', () => {
    const api = { overview: jasmine.createSpy().and.returnValue(of({ visits: 0, revenue: 0, completionRate: 0, cancellationRate: 0, noShowRate: 0, trend: [] })), approve: jasmine.createSpy().and.returnValue(of({ status: 'APPROVED' })) };
    TestBed.configureTestingModule({ providers: [{ provide: AdminDashboardApiService, useValue: api }] });
    const fixture = TestBed.createComponent(AdminDashboardPage);
    expect(fixture.componentInstance.chartDay('2026-09-27')).toBe('CN');
    expect(fixture.componentInstance.chartDay('2026-09-28')).toBe('T2');
  });
  it('formats payment methods and totals for the payment breakdown card', () => {
    const api = { overview: jasmine.createSpy().and.returnValue(of({ visits: 0, revenue: 13500000, completionRate: 0, cancellationRate: 0, noShowRate: 0, trend: [], paymentBreakdown: [] })), approve: jasmine.createSpy().and.returnValue(of({ status: 'APPROVED' })) };
    TestBed.configureTestingModule({ providers: [{ provide: AdminDashboardApiService, useValue: api }] });
    const fixture = TestBed.createComponent(AdminDashboardPage); fixture.detectChanges();
    expect(fixture.componentInstance.paymentName('PAY_AT_CLINIC')).toBe('Tiền mặt tại quầy');
    expect(fixture.componentInstance.revenueMillions()).toBe('13.5tr');
  });
});
