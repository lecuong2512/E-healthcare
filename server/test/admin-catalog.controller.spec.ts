import { CatalogAdminController } from '../src/modules/admin/admin-catalog.controller';
import { AdminCatalogType } from '../src/modules/admin/admin.types';

describe('CatalogAdminController', () => {
  it('restricts every catalog action to the Admin route implementation', async () => {
    const service = { list: jest.fn().mockResolvedValue({ data: [], pagination: {} }) };
    const controller = new CatalogAdminController(service as never);

    await expect(controller.list(AdminCatalogType.MEDICINE, 'amlo', 1, 20, undefined))
      .resolves.toMatchObject({ data: [] });
    expect(service.list).toHaveBeenCalledWith(AdminCatalogType.MEDICINE, {
      search: 'amlo', page: 1, limit: 20, active: undefined,
    });
  });
});
