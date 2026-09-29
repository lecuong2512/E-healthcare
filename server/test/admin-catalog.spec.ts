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
      getMany: jest.fn().mockResolvedValue([]),
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

  it('returns active record counts for every catalog metric', async () => {
    const counts = [11, 5, 4, 4];
    const dataSource = {
      getRepository: jest.fn(() => ({ count: jest.fn().mockResolvedValue(counts.shift()) })),
    } as unknown as DataSource;
    const service = new CatalogAdminService(dataSource, { search: jest.fn() } as never);

    await expect(service.summary()).resolves.toEqual({
      specialties: 11,
      medicines: 5,
      services: 4,
      icd10: 4,
    });
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
    repository.findOneBy.mockResolvedValueOnce({ id: '11111111-1111-4111-8111-111111111111' });
    repository.save.mockImplementation(async (value) => value);

    await expect(service.create(AdminCatalogType.SPECIALTY, { name: 'Tim mạch', iconUrl: 'https://cdn.example/heart.svg', headDoctorId: '11111111-1111-4111-8111-111111111111' } as never))
      .resolves.toMatchObject({ iconUrl: 'https://cdn.example/heart.svg', headDoctorId: '11111111-1111-4111-8111-111111111111' });
  });

  it('rejects a medicine that omits the SRS-required active ingredient', async () => {
    const { service } = createService();

    await expect(service.create(AdminCatalogType.MEDICINE, {
      code: 'MED-001', brandName: 'Amlodipine', strength: '5mg', packageUnit: 'Hộp 30 viên', referencePrice: 24000,
    })).rejects.toThrow('Tên hoạt chất là bắt buộc.');
  });

  it('rejects an assigned specialty head that is not an existing doctor', async () => {
    const { service } = createService();

    await expect(service.create(AdminCatalogType.SPECIALTY, {
      name: 'Tim mạch', headDoctorId: '11111111-1111-4111-8111-111111111111',
    })).rejects.toThrow('Bác sĩ được chọn không tồn tại.');
  });

  it('rejects a specialty icon that is not an allowed image type', async () => {
    const { service } = createService();

    await expect(service.storeSpecialtyIcon({
      mimetype: 'application/pdf', buffer: Buffer.from('not-an-image'), originalname: 'document.pdf', size: 12,
    })).rejects.toThrow('Tệp biểu tượng phải là ảnh PNG, JPG hoặc WebP.');
  });

  it('synchronizes the canonical ICD-10 lookup catalog', async () => {
    const repository = { upsert: jest.fn().mockResolvedValue(undefined) };
    const dataSource = { getRepository: jest.fn(() => repository) } as unknown as DataSource;
    const icd10 = { search: jest.fn().mockResolvedValue([{ code: 'I10', nameVi: 'Tang huyet ap', chapter: 'Tuan hoan' }]) };
    const service = new CatalogAdminService(dataSource, icd10 as never);

    await expect(service.syncIcd10()).resolves.toEqual({ synchronized: 1 });
    expect(repository.upsert).toHaveBeenCalledWith(expect.arrayContaining([expect.objectContaining({ code: 'I10' })]), ['code']);
  });

  it('exports every matching medicine as an UTF-8 CSV file', async () => {
    const { service, query } = createService();
    query.getMany = jest.fn().mockResolvedValue([
      { code: 'MED-001', brandName: 'Amlodipine 5mg', activeIngredient: 'Amlodipine', isActive: true },
    ]);

    const result = await service.export(AdminCatalogType.MEDICINE, 'csv', { search: 'amlo' });

    expect(result.filename).toMatch(/^danh-muc-thuoc-.*\.csv$/);
    expect(result.contentType).toBe('text/csv; charset=utf-8');
    expect(result.content.toString('utf8')).toContain('Amlodipine 5mg');
    expect(query.andWhere).toHaveBeenCalledWith(expect.stringContaining('LOWER(c.brand_name)'), { search: '%amlo%' });
  });

  it('exports a valid XLSX workbook for the selected catalog', async () => {
    const { service, query } = createService();
    query.getMany = jest.fn().mockResolvedValue([{ code: 'MED-001', brandName: 'Amlodipine 5mg', isActive: true }]);

    const result = await service.export(AdminCatalogType.MEDICINE, 'xlsx');

    expect(result.filename).toMatch(/^danh-muc-thuoc-.*\.xlsx$/);
    expect(result.contentType).toBe('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    expect(result.content.subarray(0, 2).toString()).toBe('PK');
  });
});
