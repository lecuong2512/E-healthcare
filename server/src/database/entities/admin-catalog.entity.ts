import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

abstract class CatalogBaseEntity {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Column({ name: 'is_active', type: 'boolean', default: true }) isActive!: boolean;
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' }) createdAt!: Date;
  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' }) updatedAt!: Date;
}

@Entity('medicines')
export class MedicineEntity extends CatalogBaseEntity {
  @Column({ type: 'varchar', length: 32, unique: true }) code!: string;
  @Column({ name: 'brand_name', type: 'varchar', length: 255 }) brandName!: string;
  @Column({ name: 'active_ingredient', type: 'varchar', length: 255 }) activeIngredient!: string;
  @Column({ type: 'varchar', length: 100 }) strength!: string;
  @Column({ name: 'package_unit', type: 'varchar', length: 100 }) packageUnit!: string;
  @Column({ name: 'contraindications', type: 'text', nullable: true }) contraindications!: string | null;
  @Column({ name: 'reference_price', type: 'integer' }) referencePrice!: number;
}

@Entity('medical_services')
export class MedicalServiceEntity extends CatalogBaseEntity {
  @Column({ type: 'varchar', length: 32, unique: true }) code!: string;
  @Column({ type: 'varchar', length: 255 }) name!: string;
  @Column({ name: 'listed_price', type: 'integer' }) listedPrice!: number;
  @Column({ name: 'duration_minutes', type: 'integer' }) durationMinutes!: number;
  @Column({ type: 'text', nullable: true }) description!: string | null;
}

@Entity('icd10_catalogs')
export class Icd10CatalogEntity extends CatalogBaseEntity {
  @Column({ type: 'varchar', length: 16, unique: true }) code!: string;
  @Column({ type: 'varchar', length: 500 }) name!: string;
  @Column({ type: 'varchar', length: 500, nullable: true }) category!: string | null;
}
