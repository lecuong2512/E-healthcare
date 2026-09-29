import { DataSource } from 'typeorm';
import { AdminDashboardService } from '../src/modules/admin/admin-dashboard.service';
import { ReportApprovalEntity } from '../src/database/entities/report-approval.entity';

describe('AdminDashboardService', () => {
  it('maps aggregated appointment metrics to dashboard KPIs', async () => {
    const dataSource = { query: jest.fn().mockResolvedValueOnce([{ visits: '12', revenue: '4800000', completed: '9', cancelled: '2', noShows: '1' }]).mockResolvedValueOnce([{ visits: '0', revenue: '0', completed: '0', cancelled: '0', noShows: '0' }]).mockResolvedValueOnce([]).mockResolvedValueOnce([{ day: '2026-09-29', visits: '3', revenue: '1200000' }]).mockResolvedValueOnce([]) } as unknown as DataSource;
    const service = new AdminDashboardService(dataSource);
    await expect(service.overview(7)).resolves.toMatchObject({ visits: 12, revenue: 4800000, completionRate: 75, cancellationRate: 16.67, noShowRate: 8.33, paymentBreakdown: [], trend: [{ day: '2026-09-29', visits: 3, revenue: 1200000 }] });
  });
  it('uses a non-reserved alias for the doctor performance user join', async () => {
    const query = jest.fn()
      .mockResolvedValueOnce([{ visits: '0', revenue: '0', completed: '0', cancelled: '0', noShows: '0' }])
      .mockResolvedValueOnce([{ visits: '0', revenue: '0', completed: '0', cancelled: '0', noShows: '0' }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);
    await new AdminDashboardService({ query } as unknown as DataSource).overview(7);
    expect(query.mock.calls[4][0]).toContain('JOIN users staff_user');
  });
  it('applies the appointment-duration filter to AVG before rounding it', async () => {
    const query = jest.fn()
      .mockResolvedValueOnce([{ visits: '0', revenue: '0', completed: '0', cancelled: '0', noShows: '0' }])
      .mockResolvedValueOnce([{ visits: '0', revenue: '0', completed: '0', cancelled: '0', noShows: '0' }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);
    await new AdminDashboardService({ query } as unknown as DataSource).overview(7);
    expect(query.mock.calls[4][0]).toContain('ROUND(AVG(EXTRACT(EPOCH FROM (appointment.completed_at - appointment.checked_in_at)) / 60) FILTER');
  });
  it('counts every appointment cancellation status in the cancellation KPI', async () => {
    const query = jest.fn()
      .mockResolvedValueOnce([{ visits: '0', revenue: '0', completed: '0', cancelled: '0', noShows: '0' }])
      .mockResolvedValueOnce([{ visits: '0', revenue: '0', completed: '0', cancelled: '0', noShows: '0' }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);
    await new AdminDashboardService({ query } as unknown as DataSource).overview(7);
    expect(query.mock.calls[0][0]).toContain("status IN ('CANCELLED', 'CANCELLED_BY_PATIENT', 'CANCELLED_BY_CLINIC')");
  });
  it('asks PostgreSQL for ISO trend dates so chart labels remain stable across time zones', async () => {
    const query = jest.fn()
      .mockResolvedValueOnce([{ visits: '0', revenue: '0', completed: '0', cancelled: '0', noShows: '0' }])
      .mockResolvedValueOnce([{ visits: '0', revenue: '0', completed: '0', cancelled: '0', noShows: '0' }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);
    await new AdminDashboardService({ query } as unknown as DataSource).overview(7);
    expect(query.mock.calls[3][0]).toContain("TO_CHAR(DATE(created_at), 'YYYY-MM-DD') AS day");
  });
  it('returns comparisons against the preceding period for KPI cards', async () => {
    const query = jest.fn()
      .mockResolvedValueOnce([{ visits: '12', revenue: '4800000', completed: '9', cancelled: '2', noShows: '1' }])
      .mockResolvedValueOnce([{ visits: '10', revenue: '4000000', completed: '7', cancelled: '1', noShows: '2' }])
      .mockResolvedValueOnce([]).mockResolvedValueOnce([]).mockResolvedValueOnce([]);
    await expect(new AdminDashboardService({ query } as unknown as DataSource).overview(7)).resolves.toMatchObject({ comparison: { visits: 20, revenue: 20, completionRate: 5, noShowRate: -11.67, cancellationRate: 6.67 } });
  });
  it('stores the administrator confirmation before a report is issued', async () => {
    const repository = { create: jest.fn(value => value), save: jest.fn(value => Promise.resolve(value)) };
    const service = new AdminDashboardService({ getRepository: jest.fn(() => repository) } as unknown as DataSource);
    await service.approval(7, 'admin-1');
    expect(repository.save).toHaveBeenCalledWith(expect.objectContaining({ approvedBy: 'admin-1', days: 7 }));
  });
  it('exports a standards-compliant XLSX workbook', async () => {
    const dataSource = { query: jest.fn().mockResolvedValue([{ visits: '12', revenue: '4800000', completed: '9', cancelled: '2', noShows: '1' }]), getRepository: jest.fn(() => ({ findOne: jest.fn().mockResolvedValue({ approvedBy: 'admin-1', approvedAt: new Date() }) })) } as unknown as DataSource;
    const file = await new AdminDashboardService(dataSource).exportXlsx(7);
    expect(file.subarray(0, 2).toString()).toBe('PK');
  });
  it('refuses report exports until an administrator has approved the selected period', async () => {
    const dataSource = { query: jest.fn().mockResolvedValue([{ visits: '0', revenue: '0', completed: '0', cancelled: '0', noShows: '0' }]), getRepository: jest.fn((entity) => entity === ReportApprovalEntity ? { findOne: jest.fn().mockResolvedValue(null) } : undefined) } as unknown as DataSource;
    await expect(new AdminDashboardService(dataSource).exportPdf(7)).rejects.toThrow('phe duyet');
  });
});
