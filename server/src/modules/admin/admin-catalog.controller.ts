import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { Role } from '@shared/enums';
import { Roles } from '../../common/decorators/auth.decorators';
import { CatalogAdminService } from './admin-catalog.service';
import { AdminCatalogType } from './admin.types';
import { CatalogListDto, CatalogMutationDto, CatalogVisibilityDto } from './dto/catalog.dto';

@Controller('api/v1/admin/catalogs')
@Roles(Role.ADMIN)
export class CatalogAdminController {
  constructor(private readonly service: CatalogAdminService) {}

  @Get(':type')
  list(@Param('type') type: AdminCatalogType, @Query('search') search?: string, @Query('page') page?: number, @Query('limit') limit?: number, @Query('active') active?: boolean) {
    return this.service.list(type, { search, page, limit, active });
  }

  @Post(':type') create(@Param('type') type: AdminCatalogType, @Body() dto: CatalogMutationDto) { return this.service.create(type, dto); }
  @Patch(':type/:id') update(@Param('type') type: AdminCatalogType, @Param('id') id: string, @Body() dto: CatalogMutationDto) { return this.service.update(type, id, dto); }
  @Patch(':type/:id/visibility') visibility(@Param('type') type: AdminCatalogType, @Param('id') id: string, @Body() dto: CatalogVisibilityDto) { return this.service.setVisibility(type, id, dto.isActive); }
}
