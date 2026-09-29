import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { NonNullableFormBuilder, ReactiveFormsModule } from '@angular/forms';
import { debounceTime, distinctUntilChanged, finalize } from 'rxjs';
import {
  AdminCatalogApiService,
  CatalogRow,
  CatalogType,
  DoctorOption,
} from '../../data-access/admin-catalog-api.service';
import { NotificationService } from '../../../../core/services/notification.service';

@Component({
  selector: 'app-catalogs-page',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './catalogs.page.html',
  styleUrl: './catalogs.page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CatalogsPage {
  private readonly api = inject(AdminCatalogApiService);
  private readonly fb = inject(NonNullableFormBuilder);
  private readonly notify = inject(NotificationService);

  readonly selectedType = signal<CatalogType>('SPECIALTY');
  readonly rows = signal<readonly CatalogRow[]>([]);
  readonly total = signal(0);
  readonly page = signal(1);
  readonly totalPages = signal(1);
  readonly specialtyCount = signal(0);
  readonly medicineCount = signal(0);
  readonly serviceCount = signal(0);
  readonly icd10Count = signal(0);
  readonly doctors = signal<readonly DoctorOption[]>([]);
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  readonly showEditor = signal(false);
  readonly editing = signal<CatalogRow | null>(null);
  readonly detail = signal<CatalogRow | null>(null);
  readonly iconUploading = signal(false);
  readonly iconUploadError = signal<string | null>(null);

  readonly types = [
    { value: 'SPECIALTY' as const, label: 'Chuyên khoa' },
    { value: 'MEDICINE' as const, label: 'Thuốc' },
    { value: 'SERVICE' as const, label: 'Dịch vụ' },
    { value: 'ICD10' as const, label: 'Mã ICD-10' },
  ];

  readonly filterForm = this.fb.group({ search: '' });
  readonly editorForm = this.fb.group({
    code: '',
    name: '',
    brandName: '',
    activeIngredient: '',
    strength: '',
    packageUnit: '',
    contraindications: '',
    referencePrice: 0,
    listedPrice: 0,
    durationMinutes: 30,
    description: '',
    iconUrl: '',
    headDoctorId: '',
    category: '',
  });

  ngOnInit(): void {
    this.filterForm.controls.search.valueChanges
      .pipe(debounceTime(300), distinctUntilChanged())
      .subscribe(() => {
        this.page.set(1);
        this.load();
      });
    this.loadDoctors();
    this.load();
  }

  selectType(type: CatalogType): void {
    this.selectedType.set(type);
    this.page.set(1);
    this.filterForm.reset({ search: '' }, { emitEvent: false });
    this.load();
  }

  load(): void {
    this.loading.set(true);
    this.error.set(null);
    this.api.summary().subscribe({
      next: (summary) => {
        this.specialtyCount.set(summary.specialties);
        this.medicineCount.set(summary.medicines);
        this.serviceCount.set(summary.services);
        this.icd10Count.set(summary.icd10);
      },
      error: () => undefined,
    });
    this.api
      .list(this.selectedType(), this.filterForm.controls.search.value, this.page())
      .subscribe({
        next: (response) => {
          this.rows.set(response.data);
          this.total.set(response.pagination.total);
          this.totalPages.set(response.pagination.totalPages);
          this.loading.set(false);
        },
        error: () => {
          this.error.set('Không tải được danh mục. Hãy thử lại.');
          this.loading.set(false);
        },
      });
  }

  goToPage(page: number): void {
    if (page < 1 || page > this.totalPages() || page === this.page()) return;
    this.page.set(page);
    this.load();
  }

  openCreate(): void {
    this.editing.set(null);
    this.iconUploadError.set(null);
    this.editorForm.reset();
    this.showEditor.set(true);
  }

  openDetails(row: CatalogRow): void {
    this.detail.set(row);
  }

  openEdit(row: CatalogRow): void {
    this.detail.set(null);
    this.editing.set(row);
    this.editorForm.patchValue(row);
    this.showEditor.set(true);
  }

  onSpecialtyIconSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) {
      const message = 'Chỉ hỗ trợ ảnh PNG, JPG hoặc WebP.';
      this.iconUploadError.set(message);
      this.notify.warning(message);
      input.value = '';
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      const message = 'Ảnh biểu tượng không được vượt quá 2MB.';
      this.iconUploadError.set(message);
      this.notify.warning(message);
      input.value = '';
      return;
    }

    this.iconUploading.set(true);
    this.iconUploadError.set(null);
    this.api
      .uploadSpecialtyIcon(file)
      .pipe(finalize(() => this.iconUploading.set(false)))
      .subscribe({
        next: ({ url }) => {
          this.editorForm.controls.iconUrl.setValue(url);
          this.notify.success('Đã tải ảnh biểu tượng. Nhấn Lưu danh mục để áp dụng.');
        },
        error: () => {
          const message = 'Không thể tải ảnh biểu tượng. Hãy thử lại.';
          this.iconUploadError.set(message);
          this.notify.error(message);
        },
      });
  }

  save(): void {
    if (this.iconUploading()) {
      this.notify.warning('Vui lòng chờ ảnh biểu tượng tải xong.');
      return;
    }

    const value = this.editorForm.getRawValue();
    const payload = { ...value, headDoctorId: value.headDoctorId || undefined };
    const editing = this.editing();
    const request = editing
      ? this.api.update(this.selectedType(), editing.id, payload)
      : this.api.create(this.selectedType(), payload);

    request.subscribe({
      next: () => {
        this.showEditor.set(false);
        this.notify.success(
          editing ? 'Đã cập nhật danh mục thành công.' : 'Đã thêm danh mục thành công.',
        );
        this.load();
      },
      error: (error) => {
        const message = this.catalogErrorMessage(error);
        this.error.set(message);
        this.notify.error(message);
      },
    });
  }

  toggle(row: CatalogRow): void {
    this.api.setVisibility(this.selectedType(), row.id, !row.isActive).subscribe({
      next: () => {
        this.notify.success(row.isActive ? 'Đã ẩn danh mục.' : 'Đã hiển thị danh mục.');
        this.load();
      },
      error: () => {
        this.error.set('Không thể đổi trạng thái.');
        this.notify.error('Không thể đổi trạng thái.');
      },
    });
  }

  syncIcd10(): void {
    this.api.syncIcd10().subscribe({
      next: () => {
        this.notify.success('Đã đồng bộ danh mục ICD-10.');
        this.load();
      },
      error: () => {
        this.error.set('Không thể đồng bộ ICD-10.');
        this.notify.error('Không thể đồng bộ ICD-10.');
      },
    });
  }

  exportCatalog(format: 'csv' | 'xlsx'): void {
    this.api
      .export(this.selectedType(), format, this.filterForm.controls.search.value)
      .subscribe({
        next: (response) => {
          if (!response.body) return;
          const url = URL.createObjectURL(response.body);
          const anchor = document.createElement('a');
          anchor.href = url;
          anchor.download = this.exportFilename(
            response.headers.get('content-disposition'),
            format,
          );
          anchor.click();
          URL.revokeObjectURL(url);
          this.notify.success(`Đã xuất ${format === 'csv' ? 'CSV' : 'Excel'}.`);
        },
        error: () => {
          this.error.set('Không thể xuất danh mục.');
          this.notify.error('Không thể xuất danh mục.');
        },
      });
  }

  title(row: CatalogRow): string {
    return row.brandName || row.name || '—';
  }

  formatVnd(value: number | undefined): string {
    return value == null ? '—' : `${new Intl.NumberFormat('vi-VN').format(value)} VND`;
  }

  catalogListTitle(): string {
    return (
      {
        SPECIALTY: 'Danh sách chuyên khoa',
        MEDICINE: 'Danh sách thuốc',
        SERVICE: 'Danh sách dịch vụ',
        ICD10: 'Danh sách mã ICD-10',
      } as const
    )[this.selectedType()];
  }

  private loadDoctors(): void {
    this.api.listDoctors().subscribe({
      next: (response) => this.doctors.set(response.data),
      error: () => this.doctors.set([]),
    });
  }

  private catalogErrorMessage(error: unknown): string {
    const message = (error as { error?: { message?: string | string[] } })?.error?.message;
    return Array.isArray(message) ? message[0] : message || 'Không thể lưu danh mục.';
  }

  private exportFilename(contentDisposition: string | null, format: 'csv' | 'xlsx'): string {
    return (
      contentDisposition?.match(/filename="?([^";]+)"?/i)?.[1] || `danh-muc.${format}`
    );
  }
}
