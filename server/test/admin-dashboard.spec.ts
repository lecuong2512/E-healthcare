import { DataSource } from 'typeorm';
import { AdminDashboardService } from '../src/modules/admin/admin-dashboard.service';
import { ReportApprovalEntity } from '../src/database/entities/report-approval.entity';

describe('AdminDashboardService', () => {
  it('maps aggregated appointment metrics to dashboard KPIs', async () => {
    const dataSource = { query: jest.fn().mockResolvedValueOnce([{ visits: '12', revenue: '4800000', completed: '9', cancelled: '2', noShows: '1' }]).mockResolvedValueOnce([]).mockResolvedValueOnce([]).mockResolvedValueOnce([]) } as unknown as DataSource;
    const service = new AdminDashboardService(dataSource);
    await expect(service.overview(7)).resolves.toMatchObject({ visits: 12, revenue: 4800000, completionRate: 75, cancellationRate: 16.67, noShowRate: 8.33, paymentBreakdown: [], trend: [] });
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
