import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { NonNullableFormBuilder, ReactiveFormsModule } from '@angular/forms';
import { AdminCatalogApiService, CatalogRow, CatalogType } from '../../data-access/admin-catalog-api.service';
@Component({ selector: 'app-catalogs-page', standalone: true, imports: [CommonModule, ReactiveFormsModule], templateUrl: './catalogs.page.html', styleUrl: './catalogs.page.scss', changeDetection: ChangeDetectionStrategy.OnPush })
export class CatalogsPage {
  private readonly api = inject(AdminCatalogApiService); private readonly fb = inject(NonNullableFormBuilder);
  readonly selectedType = signal<CatalogType>('MEDICINE'); readonly rows = signal<readonly CatalogRow[]>([]); readonly total = signal(0); readonly loading = signal(false); readonly error = signal<string | null>(null); readonly showEditor = signal(false); readonly editing = signal<CatalogRow | null>(null);
  readonly types = [{ value: 'SPECIALTY' as const, label: 'Chuyên khoa' }, { value: 'MEDICINE' as const, label: 'Thuốc' }, { value: 'SERVICE' as const, label: 'Dịch vụ' }, { value: 'ICD10' as const, label: 'Mã ICD-10' }];
  readonly filterForm = this.fb.group({ search: '' }); readonly editorForm = this.fb.group({ code: '', name: '', brandName: '', activeIngredient: '', strength: '', packageUnit: '', referencePrice: 0, listedPrice: 0, durationMinutes: 30, description: '' });
  ngOnInit(): void { this.load(); }
  selectType(type: CatalogType): void { this.selectedType.set(type); this.filterForm.reset({ search: '' }); this.load(); }
  load(): void { this.loading.set(true); this.error.set(null); this.api.list(this.selectedType(), this.filterForm.controls.search.value).subscribe({ next: r => { this.rows.set(r.data); this.total.set(r.pagination.total); this.loading.set(false); }, error: () => { this.error.set('Không tải được danh mục. Hãy thử lại.'); this.loading.set(false); } }); }
  openCreate(): void { this.editing.set(null); this.editorForm.reset(); this.showEditor.set(true); }
  openEdit(row: CatalogRow): void { this.editing.set(row); this.editorForm.patchValue(row); this.showEditor.set(true); }
  save(): void { const value = this.editorForm.getRawValue(); const request = this.editing() ? this.api.update(this.selectedType(), this.editing()!.id, value) : this.api.create(this.selectedType(), value); request.subscribe({ next: () => { this.showEditor.set(false); this.load(); }, error: () => this.error.set('Không thể lưu danh mục.') }); }
  toggle(row: CatalogRow): void { this.api.setVisibility(this.selectedType(), row.id, !row.isActive).subscribe({ next: () => this.load(), error: () => this.error.set('Không thể đổi trạng thái.') }); }
  title(row: CatalogRow): string { return row.brandName || row.name || '—'; }
}
