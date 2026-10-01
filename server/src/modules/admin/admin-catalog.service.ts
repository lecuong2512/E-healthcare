import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import * as ExcelJS from 'exceljs';
import { DataSource, EntityTarget, ObjectLiteral } from 'typeorm';
import { SpecialtyEntity } from '../../database/entities/specialty.entity';
import { DoctorEntity } from '../../database/entities/doctor.entity';
import { Icd10CatalogEntity, MedicalServiceEntity, MedicineEntity } from '../../database/entities/admin-catalog.entity';
import { AdminCatalogType, CatalogListQuery, CatalogPage } from './admin.types';
import { CatalogMutationDto } from './dto/catalog.dto';
import { Icd10Service } from '../clinical/icd10/icd10.service';

@Injectable()
export class CatalogAdminService {
  constructor(private readonly dataSource: DataSource, private readonly icd10: Icd10Service) {}

  async summary(): Promise<{ specialties: number; medicines: number; services: number; icd10: number }> {
    const types = [AdminCatalogType.SPECIALTY, AdminCatalogType.MEDICINE, AdminCatalogType.SERVICE, AdminCatalogType.ICD10];
    const [specialties, medicines, services, icd10] = await Promise.all(
      types.map(type => this.dataSource.getRepository(this.definition(type).entity).count({ where: { isActive: true } as never })),
    );
    return { specialties, medicines, services, icd10 };
  }

  async storeSpecialtyIcon(file?: { mimetype: string; buffer: Buffer; originalname: string; size: number }): Promise<{ url: string }> {
    if (!file) throw new BadRequestException('Vui lòng chọn ảnh biểu tượng.');
    const extensions: Record<string, string> = { 'image/png': '.png', 'image/jpeg': '.jpg', 'image/webp': '.webp' };
    const extension = extensions[file.mimetype];
    if (!extension) throw new BadRequestException('Tệp biểu tượng phải là ảnh PNG, JPG hoặc WebP.');
    if (file.size > 10 * 1024 * 1024) throw new BadRequestException('Ảnh biểu tượng không được vượt quá 10MB.');

    const directory = join(process.cwd(), 'uploads', 'specialty-icons');
    const filename = `${randomUUID()}${extension}`;
    await mkdir(directory, { recursive: true });
    await writeFile(join(directory, filename), file.buffer);
    return { url: `/uploads/specialty-icons/${filename}` };
  }

  async list(type: AdminCatalogType, input: CatalogListQuery = {}): Promise<CatalogPage<unknown>> {
    const page = Math.max(1, input.page ?? 1);
    const limit = Math.min(100, Math.max(1, input.limit ?? 20));
    const { entity, fields } = this.definition(type);
    const query = this.dataSource.getRepository(entity).createQueryBuilder('c');
    const search = input.search?.trim().toLowerCase();
    if (search) query.andWhere(`(${fields.map((field) => `LOWER(c.${field}) LIKE :search`).join(' OR ')})`, { search: `%${search}%` });
    if (input.active !== undefined) query.andWhere('c.is_active = :active', { active: input.active });
    query.orderBy('c.created_at', 'DESC').skip((page - 1) * limit).take(limit);
    const [data, total] = await query.getManyAndCount();
    return { data, pagination: { page, limit, total, totalPages: total ? Math.ceil(total / limit) : 0 } };
  }

  async export(type: AdminCatalogType, format: 'csv' | 'xlsx', input: Pick<CatalogListQuery, 'search'> = {}): Promise<{ content: Buffer; contentType: string; filename: string }> {
    const { entity, fields } = this.definition(type);
    const query = this.dataSource.getRepository(entity).createQueryBuilder('c');
    const search = input.search?.trim().toLowerCase();
    if (search) query.andWhere(`(${fields.map((field) => `LOWER(c.${field}) LIKE :search`).join(' OR ')})`, { search: `%${search}%` });
    query.orderBy('c.created_at', 'DESC');
    const rows = (await query.getMany()) as Array<Record<string, unknown>>;
    const exportRows = rows.map(row => this.exportRow(type, row));
    const date = new Date().toISOString().slice(0, 10);
    const filename = `${this.exportSlug(type)}-${date}.${format}`;

    if (format === 'csv') {
      const headers = ['Mã', 'Tên danh mục', 'Thông tin', 'Trạng thái'];
      const content = Buffer.from(`\ufeff${[headers, ...exportRows.map(row => [row.code, row.name, row.info, row.status])].map(row => row.map(this.escapeCsv).join(',')).join('\r\n')}`, 'utf8');
      return { content, contentType: 'text/csv; charset=utf-8', filename };
    }

    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Danh mục');
    sheet.columns = [
      { header: 'Mã', key: 'code', width: 20 },
      { header: 'Tên danh mục', key: 'name', width: 32 },
      { header: 'Thông tin', key: 'info', width: 42 },
      { header: 'Trạng thái', key: 'status', width: 16 },
    ];
    sheet.getRow(1).font = { bold: true };
    sheet.addRows(exportRows);
    const content = Buffer.from(await workbook.xlsx.writeBuffer());
    return { content, contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', filename };
  }

  async setVisibility(type: AdminCatalogType, id: string, isActive: boolean): Promise<unknown> {
    const { entity } = this.definition(type);
    const repository = this.dataSource.getRepository(entity);
    const record = await repository.findOneBy({ id } as never);
    if (!record) throw new NotFoundException('Không tìm thấy danh mục.');
    (record as { isActive: boolean }).isActive = isActive;
    return repository.save(record);
  }

  async create(type: AdminCatalogType, input: CatalogMutationDto): Promise<unknown> {
    await this.validateInput(type, input, true);
    const repository = this.dataSource.getRepository(this.definition(type).entity);
    const values = this.mapInput(type, input);
    if ('code' in values && values.code) {
      const existing = await repository.findOneBy({ code: values.code } as never);
      if (existing) throw new ConflictException('Mã danh mục đã tồn tại.');
    }
    return repository.save(repository.create(values));
  }

  async update(type: AdminCatalogType, id: string, input: CatalogMutationDto): Promise<unknown> {
    await this.validateInput(type, input, false);
    const repository = this.dataSource.getRepository(this.definition(type).entity);
    const record = await repository.findOneBy({ id } as never);
    if (!record) throw new NotFoundException('Không tìm thấy danh mục.');
    return repository.save(Object.assign(record, this.mapInput(type, input)));
  }

  async syncIcd10(): Promise<{ synchronized: number }> {
    const canonical = await this.icd10.search('', 50);
    const records = canonical.map(item => ({ code: item.code, name: item.nameVi, category: item.chapter, isActive: true }));
    await this.dataSource.getRepository(Icd10CatalogEntity).upsert(records, ['code']);
    return { synchronized: records.length };
  }

  private mapInput(type: AdminCatalogType, input: CatalogMutationDto): Record<string, unknown> {
    const trim = (value?: string) => value?.trim() || undefined;
    if (type === AdminCatalogType.SPECIALTY) return { name: trim(input.name), description: trim(input.description), iconUrl: trim(input.iconUrl), headDoctorId: input.headDoctorId };
    if (type === AdminCatalogType.MEDICINE) return { code: trim(input.code), brandName: trim(input.brandName), activeIngredient: trim(input.activeIngredient), strength: trim(input.strength), packageUnit: trim(input.packageUnit), contraindications: trim(input.contraindications), referencePrice: input.referencePrice };
    if (type === AdminCatalogType.SERVICE) return { code: trim(input.code), name: trim(input.name), listedPrice: input.listedPrice, durationMinutes: input.durationMinutes, description: trim(input.description) };
    return { code: trim(input.code), name: trim(input.name), category: trim(input.category) };
  }

  private async validateInput(type: AdminCatalogType, input: CatalogMutationDto, isCreate: boolean): Promise<void> {
    const required = (value: string | undefined, label: string) => {
      if ((isCreate || value !== undefined) && !value?.trim()) throw new BadRequestException(`${label} là bắt buộc.`);
    };
    const nonNegative = (value: number | undefined, label: string) => {
      if ((isCreate || value !== undefined) && (!Number.isInteger(value) || (value ?? -1) < 0)) throw new BadRequestException(`${label} phải là số nguyên không âm.`);
    };

    if (type === AdminCatalogType.SPECIALTY) {
      required(input.name, 'Tên chuyên khoa');
      if (input.headDoctorId) {
        const doctor = await this.dataSource.getRepository(DoctorEntity).findOneBy({ id: input.headDoctorId });
        if (!doctor) throw new BadRequestException('Bác sĩ được chọn không tồn tại.');
      }
      return;
    }
    if (type === AdminCatalogType.MEDICINE) {
      required(input.code, 'Mã thuốc');
      required(input.brandName, 'Tên biệt dược');
      required(input.activeIngredient, 'Tên hoạt chất');
      required(input.strength, 'Hàm lượng');
      required(input.packageUnit, 'Đơn vị đóng gói');
      nonNegative(input.referencePrice, 'Giá tham chiếu');
      return;
    }
    if (type === AdminCatalogType.SERVICE) {
      required(input.code, 'Mã dịch vụ');
      required(input.name, 'Tên dịch vụ');
      nonNegative(input.listedPrice, 'Giá niêm yết');
      if ((isCreate || input.durationMinutes !== undefined) && (!Number.isInteger(input.durationMinutes) || input.durationMinutes! < 1)) {
        throw new BadRequestException('Thời lượng khám phải là số nguyên dương.');
      }
      return;
    }
    required(input.code, 'Mã ICD-10');
    required(input.name, 'Tên bệnh / chẩn đoán');
  }

  private exportRow(type: AdminCatalogType, row: Record<string, unknown>): { code: string; name: string; info: string; status: string } {
    const text = (value: unknown) => typeof value === 'string' ? value : value == null ? '' : String(value);
    const name = text(row.brandName || row.name);
    const info = type === AdminCatalogType.MEDICINE
      ? [text(row.activeIngredient), text(row.strength), text(row.packageUnit)].filter(Boolean).join(' · ')
      : type === AdminCatalogType.SERVICE
        ? [row.listedPrice ? `${text(row.listedPrice)} VND` : '', row.durationMinutes ? `${text(row.durationMinutes)} phút` : ''].filter(Boolean).join(' · ')
        : type === AdminCatalogType.SPECIALTY ? text(row.description) : text(row.category);
    return { code: text(row.code), name, info, status: row.isActive === false ? 'Tạm khóa' : 'Đang dùng' };
  }

  private exportSlug(type: AdminCatalogType): string {
    return ({ [AdminCatalogType.SPECIALTY]: 'danh-muc-chuyen-khoa', [AdminCatalogType.MEDICINE]: 'danh-muc-thuoc', [AdminCatalogType.SERVICE]: 'danh-muc-dich-vu', [AdminCatalogType.ICD10]: 'danh-muc-icd10' } as const)[type];
  }

  private escapeCsv(value: string): string { return `"${value.replace(/"/g, '""')}"`; }

  private definition(type: AdminCatalogType): { entity: EntityTarget<ObjectLiteral>; fields: string[] } {
    switch (type) {
      case AdminCatalogType.SPECIALTY: return { entity: SpecialtyEntity, fields: ['name', 'description'] };
      case AdminCatalogType.MEDICINE: return { entity: MedicineEntity, fields: ['brand_name', 'active_ingredient', 'code'] };
      case AdminCatalogType.SERVICE: return { entity: MedicalServiceEntity, fields: ['name', 'code'] };
      case AdminCatalogType.ICD10: return { entity: Icd10CatalogEntity, fields: ['name', 'code', 'category'] };
    }
  }
}
