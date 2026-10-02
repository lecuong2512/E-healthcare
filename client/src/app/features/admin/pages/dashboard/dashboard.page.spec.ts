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
  it('requests report exports through the authenticated dashboard API', () => {
    const api = { overview: jasmine.createSpy().and.returnValue(of({ visits: 0, revenue: 0, completionRate: 0, cancellationRate: 0, noShowRate: 0, trend: [], paymentBreakdown: [] })), export: jasmine.createSpy().and.returnValue(of(new Blob(['report']))) };
    TestBed.configureTestingModule({ providers: [{ provide: AdminDashboardApiService, useValue: api }] });
    const fixture = TestBed.createComponent(AdminDashboardPage);
    fixture.componentInstance.download('xlsx');
    expect(api.export).toHaveBeenCalledWith(7, 'xlsx');
  });
  it('switches time periods when select is called with 1, 7, and 30 days', () => {
    const api = { overview: jasmine.createSpy().and.returnValue(of({ visits: 5, revenue: 1000000, completionRate: 100, cancellationRate: 0, noShowRate: 0, trend: [{ day: '2026-10-02', visits: 5, revenue: 1000000 }], paymentBreakdown: [], doctorPerformance: [] })) };
    TestBed.configureTestingModule({ providers: [{ provide: AdminDashboardApiService, useValue: api }] });
    const fixture = TestBed.createComponent(AdminDashboardPage);
    fixture.detectChanges();

    // Select Hôm nay (1 day)
    fixture.componentInstance.select(1);
    fixture.detectChanges();
    expect(fixture.componentInstance.days()).toBe(1);
    expect(api.overview).toHaveBeenCalledWith(1);
    expect(fixture.componentInstance.periodLabel()).toBe('vs hôm qua');
    expect(fixture.componentInstance.chartHeading()).toContain('Hôm nay');

    // Select Tháng này (30 days)
    fixture.componentInstance.select(30);
    fixture.detectChanges();
    expect(fixture.componentInstance.days()).toBe(30);
    expect(api.overview).toHaveBeenCalledWith(30);
    expect(fixture.componentInstance.periodLabel()).toBe('vs tháng trước');
    expect(fixture.componentInstance.chartHeading()).toContain('Tháng này');

    // Select 7 ngày qua
    fixture.componentInstance.select(7);
    fixture.detectChanges();
    expect(fixture.componentInstance.days()).toBe(7);
    expect(fixture.componentInstance.periodLabel()).toBe('vs tuần trước');
  });
});
