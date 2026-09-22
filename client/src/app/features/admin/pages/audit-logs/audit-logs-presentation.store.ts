import { Injectable, computed, signal } from '@angular/core';

import {
  AuditLogFilterViewModel,
  AuditLogExportState,
  AuditLogRowViewModel,
  AuditLogViewState,
} from './audit-logs.models';

@Injectable()
export class AuditLogsPresentationStore {
  private readonly _rows = signal<readonly AuditLogRowViewModel[]>([]);
  private readonly _state = signal<AuditLogViewState>('idle');
  private readonly _errorMessage = signal<string | null>(null);
  private readonly _filter = signal<AuditLogFilterViewModel | null>(null);
  private readonly _page = signal(1);
  private readonly _pageSize = signal(25);
  private readonly _totalItems = signal(0);
  private readonly _totalPages = signal(0);
  private readonly _requestRevision = signal(0);
  private readonly _exportRevision = signal(0);
  private readonly _exportState = signal<AuditLogExportState>('idle');
  private readonly _exportErrorMessage = signal<string | null>(null);

  readonly rows = this._rows.asReadonly();
  readonly state = this._state.asReadonly();
  readonly errorMessage = this._errorMessage.asReadonly();
  readonly filter = this._filter.asReadonly();
  readonly page = this._page.asReadonly();
  readonly pageSize = this._pageSize.asReadonly();
  readonly totalItems = this._totalItems.asReadonly();
  readonly totalPages = this._totalPages.asReadonly();
  readonly requestRevision = this._requestRevision.asReadonly();
  readonly exportRevision = this._exportRevision.asReadonly();
  readonly exportState = this._exportState.asReadonly();
  readonly exportErrorMessage = this._exportErrorMessage.asReadonly();
  readonly canGoPrevious = computed(() => this._page() > 1);
  readonly canGoNext = computed(
    () => this._totalPages() > 0 && this._page() < this._totalPages(),
  );

  applyFilter(filter: AuditLogFilterViewModel): void {
    this._filter.set({ ...filter, search: filter.search.trim() });
    this._page.set(1);
    this.requestData();
  }

  setPage(page: number): void {
    const boundedPage = Math.max(
      1,
      this._totalPages() ? Math.min(page, this._totalPages()) : page,
    );
    if (boundedPage === this._page()) {
      return;
    }
    this._page.set(boundedPage);
    this.requestData();
  }

  setPageSize(pageSize: number): void {
    if (![25, 50, 100].includes(pageSize)) {
      return;
    }
    this._pageSize.set(pageSize);
    this._page.set(1);
    this.requestData();
  }

  startLoading(): void {
    this._state.set('loading');
    this._errorMessage.set(null);
  }

  loadSuccess(
    rows: readonly AuditLogRowViewModel[],
    totalItems: number,
    totalPages: number,
  ): void {
    this._rows.set([...rows]);
    this._totalItems.set(Math.max(0, totalItems));
    this._totalPages.set(Math.max(0, totalPages));
    this._state.set('loaded');
    this._errorMessage.set(null);
  }

  loadError(message: string): void {
    this._rows.set([]);
    this._state.set('error');
    this._errorMessage.set(message);
  }

  retry(): void {
    this.requestData();
  }

  requestExport(): void {
    if (this._filter() && this._exportState() !== 'exporting') {
      this._exportState.set('exporting');
      this._exportErrorMessage.set(null);
      this._exportRevision.update((revision) => revision + 1);
    }
  }

  exportSuccess(): void {
    this._exportState.set('idle');
    this._exportErrorMessage.set(null);
  }

  exportError(message: string): void {
    this._exportState.set('error');
    this._exportErrorMessage.set(message);
  }

  private requestData(): void {
    this._requestRevision.update((revision) => revision + 1);
  }
}
