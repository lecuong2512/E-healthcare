import { TestBed } from '@angular/core/testing';

import { AuditLogsPresentationStore } from './audit-logs-presentation.store';

describe('AuditLogsPresentationStore', () => {
  let store: AuditLogsPresentationStore;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [AuditLogsPresentationStore],
    });
    store = TestBed.inject(AuditLogsPresentationStore);
  });

  it('trims search and resets pagination when applying filters', () => {
    store.loadSuccess([], 100, 4);
    store.setPage(3);

    store.applyFilter({
      fromLocal: '2026-09-22T00:00',
      toLocal: '2026-09-22T23:59',
      action: '',
      search: '  2001:db8::1  ',
    });

    expect(store.page()).toBe(1);
    expect(store.filter()?.search).toBe('2001:db8::1');
    expect(store.requestRevision()).toBe(2);
  });

  it('bounds pagination and accepts only approved page sizes', () => {
    store.loadSuccess([], 100, 4);
    store.setPage(99);
    expect(store.page()).toBe(4);

    store.setPageSize(75);
    expect(store.pageSize()).toBe(25);

    store.setPageSize(50);
    expect(store.pageSize()).toBe(50);
    expect(store.page()).toBe(1);
  });

  it('stores loading, success and retry states without mutation controls', () => {
    store.startLoading();
    expect(store.state()).toBe('loading');

    store.loadError('Không thể tải dữ liệu.');
    expect(store.state()).toBe('error');
    expect(store.errorMessage()).toContain('Không thể tải');

    const revision = store.requestRevision();
    store.retry();
    expect(store.requestRevision()).toBe(revision + 1);
  });

  it('prevents duplicate exports and exposes recoverable export state', () => {
    store.applyFilter({
      fromLocal: '2026-09-22T00:00',
      toLocal: '2026-09-22T23:59',
      action: '',
      search: '',
    });

    store.requestExport();
    store.requestExport();
    expect(store.exportRevision()).toBe(1);
    expect(store.exportState()).toBe('exporting');

    store.exportError('Không thể xuất dữ liệu.');
    expect(store.exportState()).toBe('error');
    expect(store.exportErrorMessage()).toContain('Không thể xuất');

    store.requestExport();
    expect(store.exportRevision()).toBe(2);
    store.exportSuccess();
    expect(store.exportState()).toBe('idle');
    expect(store.exportErrorMessage()).toBeNull();
  });
});
