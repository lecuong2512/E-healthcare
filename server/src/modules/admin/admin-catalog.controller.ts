import { BadRequestException, Body, Controller, Get, Param, Patch, Post, Query, Res, StreamableFile, UploadedFile, UseInterceptors } from '@nestjs/common';
import { Response } from 'express';
import { FileInterceptor } from '@nestjs/platform-express';
import { Role } from '@shared/enums';
import { Roles } from '../../common/decorators/auth.decorators';
import { CatalogAdminService } from './admin-catalog.service';
import { AdminCatalogType } from './admin.types';
import { CatalogListDto, CatalogMutationDto, CatalogVisibilityDto } from './dto/catalog.dto';

@Controller('admin/catalogs')
@Roles(Role.ADMIN)
export class CatalogAdminController {
  constructor(private readonly service: CatalogAdminService) {}

  @Get('summary') summary() { return this.service.summary(); }

  @Post('specialties/icon')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 10 * 1024 * 1024 } }))
  uploadSpecialtyIcon(@UploadedFile() file?: { mimetype: string; buffer: Buffer; originalname: string; size: number }) {
    return this.service.storeSpecialtyIcon(file);
  }

  @Get(':type/export/:format')
  async export(@Param('type') type: AdminCatalogType, @Param('format') format: string, @Query('search') search: string | undefined, @Res({ passthrough: true }) response: Response): Promise<StreamableFile> {
    if (format !== 'csv' && format !== 'xlsx') throw new BadRequestException('Định dạng xuất không được hỗ trợ.');
    const file = await this.service.export(type, format, { search });
    response.setHeader('Content-Type', file.contentType);
    response.setHeader('Content-Disposition', `attachment; filename="${file.filename}"`);
    return new StreamableFile(file.content);
  }

  @Get(':type')
  list(@Param('type') type: AdminCatalogType, @Query('search') search?: string, @Query('page') page?: number, @Query('limit') limit?: number, @Query('active') active?: boolean) {
    return this.service.list(type, { search, page, limit, active });
  }

  @Post(':type') create(@Param('type') type: AdminCatalogType, @Body() dto: CatalogMutationDto) { return this.service.create(type, dto); }
  @Patch(':type/:id') update(@Param('type') type: AdminCatalogType, @Param('id') id: string, @Body() dto: CatalogMutationDto) { return this.service.update(type, id, dto); }
  @Patch(':type/:id/visibility') visibility(@Param('type') type: AdminCatalogType, @Param('id') id: string, @Body() dto: CatalogVisibilityDto) { return this.service.setVisibility(type, id, dto.isActive); }
  @Post('icd10/sync') syncIcd10() { return this.service.syncIcd10(); }
}
