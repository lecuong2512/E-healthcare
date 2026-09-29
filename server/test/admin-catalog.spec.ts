import { DataSource } from 'typeorm';
import { CatalogAdminService } from '../src/modules/admin/admin-catalog.service';
import { AdminCatalogType } from '../src/modules/admin/admin.types';

describe('CatalogAdminService', () => {
  function createService() {
    const query = {
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      getManyAndCount: jest.fn().mockResolvedValue([[], 0]),
    };
    const repository = {
      createQueryBuilder: jest.fn(() => query),
      create: jest.fn((value: unknown) => value),
      findOneBy: jest.fn(),
      save: jest.fn(),
    };
    const dataSource = { getRepository: jest.fn(() => repository) } as unknown as DataSource;
    return { service: new CatalogAdminService(dataSource, { search: jest.fn() } as never), query, repository };
  }

  it('normalizes the search term and returns a paginated medicine list', async () => {
    const { service, query } = createService();

    await expect(service.list(AdminCatalogType.MEDICINE, { search: '  Amlodipine  ', page: 2, limit: 10 }))
      .resolves.toEqual({ data: [], pagination: { page: 2, limit: 10, total: 0, totalPages: 0 } });

    expect(query.andWhere).toHaveBeenCalledWith(
      expect.stringContaining('LOWER(c.brand_name)'),
      { search: '%amlodipine%' },
    );
    expect(query.skip).toHaveBeenCalledWith(10);
  });

  it('hides a catalog record instead of deleting it', async () => {
    const { service, repository } = createService();
    const medicine = { id: 'medicine-1', isActive: true };
    repository.findOneBy.mockResolvedValue(medicine);
    repository.save.mockImplementation(async (value) => value);

    await expect(service.setVisibility(AdminCatalogType.MEDICINE, 'medicine-1', false))
      .resolves.toMatchObject({ id: 'medicine-1', isActive: false });

    expect(repository.save).toHaveBeenCalledWith({ id: 'medicine-1', isActive: false });
  });

  it('keeps icon and head doctor when saving a specialty', async () => {
    const { service, repository } = createService();
    repository.save.mockImplementation(async (value) => value);

    await expect(service.create(AdminCatalogType.SPECIALTY, { name: 'Tim mạch', iconUrl: 'https://cdn.example/heart.svg', headDoctorId: '11111111-1111-4111-8111-111111111111' } as never))
      .resolves.toMatchObject({ iconUrl: 'https://cdn.example/heart.svg', headDoctorId: '11111111-1111-4111-8111-111111111111' });
  });

  it('synchronizes the canonical ICD-10 lookup catalog', async () => {
    const repository = { upsert: jest.fn().mockResolvedValue(undefined) };
    const dataSource = { getRepository: jest.fn(() => repository) } as unknown as DataSource;
    const icd10 = { search: jest.fn().mockResolvedValue([{ code: 'I10', nameVi: 'Tang huyet ap', chapter: 'Tuan hoan' }]) };
    const service = new CatalogAdminService(dataSource, icd10 as never);

    await expect(service.syncIcd10()).resolves.toEqual({ synchronized: 1 });
    expect(repository.upsert).toHaveBeenCalledWith(expect.arrayContaining([expect.objectContaining({ code: 'I10' })]), ['code']);
  });
});
