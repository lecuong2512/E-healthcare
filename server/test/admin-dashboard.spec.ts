import { DataSource } from 'typeorm';
import { AdminDashboardService } from '../src/modules/admin/admin-dashboard.service';

describe('AdminDashboardService', () => {
  it('maps aggregated appointment metrics to dashboard KPIs', async () => {
    const dataSource = { query: jest.fn().mockResolvedValue([{ visits: '12', revenue: '4800000', completed: '9', cancelled: '2', noShows: '1' }]) } as unknown as DataSource;
    const service = new AdminDashboardService(dataSource);
    await expect(service.overview(7)).resolves.toMatchObject({ visits: 12, revenue: 4800000, completionRate: 75, cancellationRate: 16.67, noShowRate: 8.33 });
  });
  it('stores the administrator confirmation before a report is issued', async () => {
    const repository = { create: jest.fn(value => value), save: jest.fn(value => Promise.resolve(value)) };
    const service = new AdminDashboardService({ getRepository: jest.fn(() => repository) } as unknown as DataSource);
    await service.approval(7, 'admin-1');
    expect(repository.save).toHaveBeenCalledWith(expect.objectContaining({ approvedBy: 'admin-1', days: 7 }));
  });
  it('exports a standards-compliant XLSX workbook', async () => {
    const dataSource = { query: jest.fn().mockResolvedValue([{ visits: '12', revenue: '4800000', completed: '9', cancelled: '2', noShows: '1' }]) } as unknown as DataSource;
    const file = await new AdminDashboardService(dataSource).exportXlsx(7);
    expect(file.subarray(0, 2).toString()).toBe('PK');
  });
});
