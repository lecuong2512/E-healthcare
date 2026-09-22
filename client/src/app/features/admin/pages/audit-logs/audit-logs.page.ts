import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { ReactiveFormsModule, NonNullableFormBuilder } from '@angular/forms';

import { AuditLogTimePipe } from './audit-log-time.pipe';
import {
  createDefaultVietnamRange,
  vietnamDateTimeToUtcIso,
} from './audit-log-time.util';
import { AuditLogsPresentationStore } from './audit-logs-presentation.store';

@Component({
  selector: 'app-audit-logs-page',
  standalone: true,
  imports: [ReactiveFormsModule, AuditLogTimePipe],
  templateUrl: './audit-logs.page.html',
  styleUrl: './audit-logs.page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [AuditLogsPresentationStore],
})
export class AuditLogsPage {
  private readonly formBuilder = inject(NonNullableFormBuilder);
  readonly store = inject(AuditLogsPresentationStore);
  private readonly defaultRange = createDefaultVietnamRange();

  /**
   * Populated from the shared AuditAction contract by the integration adapter.
   * Keeping this empty prevents a client-side duplicate enum.
   */
  readonly actionOptions = signal<readonly string[]>([]);
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
}
