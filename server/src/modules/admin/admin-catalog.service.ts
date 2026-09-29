import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { DataSource, EntityTarget, ObjectLiteral } from 'typeorm';
import { SpecialtyEntity } from '../../database/entities/specialty.entity';
import { Icd10CatalogEntity, MedicalServiceEntity, MedicineEntity } from '../../database/entities/admin-catalog.entity';
import { AdminCatalogType, CatalogListQuery, CatalogPage } from './admin.types';
import { CatalogMutationDto } from './dto/catalog.dto';
import { Icd10Service } from '../clinical/icd10/icd10.service';

@Injectable()
export class CatalogAdminService {
  constructor(private readonly dataSource: DataSource, private readonly icd10: Icd10Service) {}

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

  async setVisibility(type: AdminCatalogType, id: string, isActive: boolean): Promise<unknown> {
    const { entity } = this.definition(type);
    const repository = this.dataSource.getRepository(entity);
    const record = await repository.findOneBy({ id } as never);
    if (!record) throw new NotFoundException('Không tìm thấy danh mục.');
    (record as { isActive: boolean }).isActive = isActive;
    return repository.save(record);
  }

  async create(type: AdminCatalogType, input: CatalogMutationDto): Promise<unknown> {
    const repository = this.dataSource.getRepository(this.definition(type).entity);
    const values = this.mapInput(type, input);
    if ('code' in values && values.code) {
      const existing = await repository.findOneBy({ code: values.code } as never);
      if (existing) throw new ConflictException('Mã danh mục đã tồn tại.');
    }
    return repository.save(repository.create(values));
  }

  async update(type: AdminCatalogType, id: string, input: CatalogMutationDto): Promise<unknown> {
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

  private definition(type: AdminCatalogType): { entity: EntityTarget<ObjectLiteral>; fields: string[] } {
    switch (type) {
      case AdminCatalogType.SPECIALTY: return { entity: SpecialtyEntity, fields: ['name', 'description'] };
      case AdminCatalogType.MEDICINE: return { entity: MedicineEntity, fields: ['brand_name', 'active_ingredient', 'code'] };
      case AdminCatalogType.SERVICE: return { entity: MedicalServiceEntity, fields: ['name', 'code'] };
      case AdminCatalogType.ICD10: return { entity: Icd10CatalogEntity, fields: ['name', 'code', 'category'] };
    }
  }
}
