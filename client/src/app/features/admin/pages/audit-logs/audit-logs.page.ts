import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  inject,
  signal,
} from '@angular/core';
import { ReactiveFormsModule, NonNullableFormBuilder } from '@angular/forms';
import { AuditAction } from '@shared/enums';

import { AuditLogCsvDownloadService } from './audit-log-csv-download.service';
import { AuditLogTimePipe } from './audit-log-time.pipe';
import { AuditLogUserAgentComponent } from './audit-log-user-agent.component';
import {
  createDefaultVietnamRange,
  vietnamDateTimeToUtcIso,
} from './audit-log-time.util';
import { AuditLogsPresentationStore } from './audit-logs-presentation.store';
import { AuditLogsApiService } from './audit-logs-api.service';
import { Subscription } from 'rxjs';

@Component({
  selector: 'app-audit-logs-page',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    AuditLogTimePipe,
    AuditLogUserAgentComponent,
  ],
  templateUrl: './audit-logs.page.html',
  styleUrl: './audit-logs.page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [AuditLogsPresentationStore],
})
export class AuditLogsPage {
  private readonly formBuilder = inject(NonNullableFormBuilder);
  private readonly csvDownload = inject(AuditLogCsvDownloadService);
  private readonly api = inject(AuditLogsApiService);
  private readonly destroyRef = inject(DestroyRef);
  readonly store = inject(AuditLogsPresentationStore);
  private readonly defaultRange = createDefaultVietnamRange();

  readonly actionOptions: readonly AuditAction[] = Object.values(AuditAction);
  readonly validationError = signal<string | null>(null);
  private loadSubscription: Subscription | null = null;
  private exportSubscription: Subscription | null = null;

  readonly filterForm = this.formBuilder.group({
    fromLocal: this.defaultRange.fromLocal,
    toLocal: this.defaultRange.toLocal,
    action: '',
    search: '',
  });

  constructor() {
    this.destroyRef.onDestroy(() => {
      this.loadSubscription?.unsubscribe();
      this.exportSubscription?.unsubscribe();
    });
  }

  applyFilters(): void {
    const value = this.filterForm.getRawValue();
    const fromUtc = vietnamDateTimeToUtcIso(value.fromLocal);
    const toUtc = vietnamDateTimeToUtcIso(value.toLocal);

    if (!fromUtc || !toUtc) {
      this.validationError.set('Khoảng thời gian không hợp lệ.');
      return;
    }

    if (Date.parse(fromUtc) >= Date.parse(toUtc)) {
      this.validationError.set(
        'Thời điểm bắt đầu phải trước thời điểm kết thúc.',
      );
      return;
    }

    this.validationError.set(null);
    this.store.applyFilter(value);
    this.loadCurrentPage();
  }

  resetFilters(): void {
    const range = createDefaultVietnamRange();
    this.filterForm.reset({
      fromLocal: range.fromLocal,
      toLocal: range.toLocal,
      action: '',
      search: '',
    });
    this.validationError.set(null);
  }

  changePageSize(event: Event): void {
    const select = event.target as HTMLSelectElement;
    this.store.setPageSize(Number(select.value));
    this.loadCurrentPage();
  }

  changePage(page: number): void {
    this.store.setPage(page);
    this.loadCurrentPage();
  }

  retry(): void {
    this.store.retry();
    this.loadCurrentPage();
  }

  exportCsv(): void {
    const filter = this.store.filter();
    if (!filter || this.store.exportState() === 'exporting') return;
    this.store.requestExport();
    this.exportSubscription?.unsubscribe();
    this.exportSubscription = this.api.exportCsv(filter).subscribe({
      next: (response) =>
        this.completeCsvExport(
          response.body ?? new Blob([], { type: 'text/csv' }),
          response.headers.get('Content-Disposition'),
        ),
      error: () => this.failCsvExport('Không thể xuất nhật ký kiểm toán.'),
    });
  }

  /** Completes a server-generated, read-only CSV export. */
  completeCsvExport(blob: Blob, contentDisposition: string | null): void {
    this.csvDownload.download(blob, contentDisposition);
    this.store.exportSuccess();
  }

  failCsvExport(message: string): void {
    this.store.exportError(message);
  }

  private loadCurrentPage(): void {
    const filter = this.store.filter();
    if (!filter) return;
    this.loadSubscription?.unsubscribe();
    this.store.startLoading();
    this.loadSubscription = this.api
      .list(filter, this.store.page(), this.store.pageSize())
      .subscribe({
        next: (result) =>
          this.store.loadSuccess(
            result.rows,
            result.total,
            result.totalPages,
          ),
        error: () => this.store.loadError('Không thể tải nhật ký kiểm toán.'),
      });
  }
}
