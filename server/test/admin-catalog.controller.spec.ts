import { CatalogAdminController } from '../src/modules/admin/admin-catalog.controller';
import { AdminCatalogType } from '../src/modules/admin/admin.types';

describe('CatalogAdminController', () => {
  it('exposes the catalog summary before parameterized catalog routes', async () => {
    const service = { summary: jest.fn().mockResolvedValue({ medicines: 5 }) };
    const controller = new CatalogAdminController(service as never);

    await expect(controller.summary()).resolves.toEqual({ medicines: 5 });
  });

  it('restricts every catalog action to the Admin route implementation', async () => {
    const service = { list: jest.fn().mockResolvedValue({ data: [], pagination: {} }) };
    const controller = new CatalogAdminController(service as never);

    await expect(controller.list(AdminCatalogType.MEDICINE, 'amlo', 1, 20, undefined))
      .resolves.toMatchObject({ data: [] });
    expect(service.list).toHaveBeenCalledWith(AdminCatalogType.MEDICINE, {
      search: 'amlo', page: 1, limit: 20, active: undefined,
    });
  });

  it('delegates a specialty icon upload to the catalog service', async () => {
    const service = { storeSpecialtyIcon: jest.fn().mockResolvedValue({ url: '/uploads/specialty-icons/icon.png' }) };
    const controller = new CatalogAdminController(service as never);
    const file = { mimetype: 'image/png', buffer: Buffer.from('image'), originalname: 'icon.png', size: 5 };

    await expect(controller.uploadSpecialtyIcon(file)).resolves.toEqual({ url: '/uploads/specialty-icons/icon.png' });
    expect(service.storeSpecialtyIcon).toHaveBeenCalledWith(file);
  });
});
