import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
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
  readonly store = inject(AuditLogsPresentationStore);
  private readonly defaultRange = createDefaultVietnamRange();

  readonly actionOptions: readonly AuditAction[] = Object.values(AuditAction);
  readonly validationError = signal<string | null>(null);

  readonly filterForm = this.formBuilder.group({
    fromLocal: this.defaultRange.fromLocal,
    toLocal: this.defaultRange.toLocal,
    action: '',
    search: '',
  });

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
  }

  /** Called by the future API adapter after receiving a server-generated CSV. */
  completeCsvExport(blob: Blob, contentDisposition: string | null): void {
    this.csvDownload.download(blob, contentDisposition);
    this.store.exportSuccess();
  }

  failCsvExport(message: string): void {
    this.store.exportError(message);
  }
}
