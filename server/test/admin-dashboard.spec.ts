import { DataSource } from 'typeorm';
import { AdminDashboardService } from '../src/modules/admin/admin-dashboard.service';

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
  it('exports a standards-compliant XLSX workbook without an approval record', async () => {
    const dataSource = { query: jest.fn().mockResolvedValue([{ visits: '12', revenue: '4800000', completed: '9', cancelled: '2', noShows: '1' }]) } as unknown as DataSource;
    const file = await new AdminDashboardService(dataSource).exportXlsx(7);
    expect(file.subarray(0, 2).toString()).toBe('PK');
  });
  it('exports a PDF directly for an administrator', async () => {
    const dataSource = { query: jest.fn().mockResolvedValue([{ visits: '0', revenue: '0', completed: '0', cancelled: '0', noShows: '0' }]) } as unknown as DataSource;
    const file = await new AdminDashboardService(dataSource).exportPdf(7);
    expect(file.subarray(0, 4).toString()).toBe('%PDF');
  });
});
