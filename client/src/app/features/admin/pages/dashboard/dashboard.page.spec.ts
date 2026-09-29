import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { AdminDashboardPage } from './dashboard.page';
import { AdminDashboardApiService } from '../../data-access/admin-dashboard-api.service';

describe('AdminDashboardPage', () => {
  it('loads KPI overview for the selected period', () => {
    const api = { overview: jasmine.createSpy().and.returnValue(of({ visits: 12, revenue: 4800000, completionRate: 75, cancellationRate: 16.67, noShowRate: 8.33, trend: [] })), approve: jasmine.createSpy().and.returnValue(of({ status: 'APPROVED' })) };
    TestBed.configureTestingModule({ providers: [{ provide: AdminDashboardApiService, useValue: api }] });
    const fixture = TestBed.createComponent(AdminDashboardPage); fixture.detectChanges();
    expect(api.overview).toHaveBeenCalledWith(7);
    expect(fixture.componentInstance.kpi().revenue).toBe(4800000);
  });
});
