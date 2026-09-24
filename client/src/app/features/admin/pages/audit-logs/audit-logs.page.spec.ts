import { ComponentFixture, TestBed } from '@angular/core/testing';

import { AuditLogsPage } from './audit-logs.page';

describe('AuditLogsPage', () => {
  let fixture: ComponentFixture<AuditLogsPage>;
  let component: AuditLogsPage;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AuditLogsPage],
    }).compileComponents();

    fixture = TestBed.createComponent(AuditLogsPage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  afterEach(() => fixture.destroy());

  it('renders all required read-only columns without edit or delete controls', () => {
    const content = (fixture.nativeElement as HTMLElement).textContent ?? '';

    expect(content).toContain('Thời điểm (UTC+7)');
    expect(content).toContain('Tài khoản thực hiện');
    expect(content).toContain('Vai trò');
    expect(content).toContain('Thao tác');
    expect(content).toContain('Địa chỉ IP');
    expect(content).toContain('User-Agent');
    expect(content).not.toContain('Chỉnh sửa');
    expect(content).not.toContain('Xóa nhật ký');
  });

  it('offers the SRS-ADM-04 actions from the shared contract', () => {
    const values = Array.from(
      (fixture.nativeElement as HTMLElement).querySelectorAll(
        'select[formControlName="action"] option',
      ),
      (option) => (option as HTMLOptionElement).value,
    );

    expect(values).toEqual([
      '',
      'LOGIN',
      'VIEW_EMR',
      'UPDATE_RX',
      'CANCEL_APPT',
    ]);
  });

  it('validates that the start time precedes the end time', () => {
    component.filterForm.setValue({
      fromLocal: '2026-09-22T12:00',
      toLocal: '2026-09-22T11:00',
      action: '',
      search: '',
    });

    component.applyFilters();

    expect(component.validationError()).toContain('bắt đầu');
    expect(component.store.filter()).toBeNull();
  });

  it('applies a valid filter without persisting search in the URL or storage', () => {
    component.filterForm.setValue({
      fromLocal: '2026-09-22T00:00',
      toLocal: '2026-09-22T23:59',
      action: '',
      search: '  10.0.0.8 ',
    });

    component.applyFilters();

    expect(component.validationError()).toBeNull();
    expect(component.store.filter()?.search).toBe('10.0.0.8');
  });

  it('renders untrusted action and User-Agent as text, never HTML', () => {
    component.store.loadSuccess(
      [
        {
          id: 'audit-1',
          occurredAt: '2026-09-22T01:30:00.000Z',
          actorId: 'user-1',
          actorDisplayName: 'Quản trị viên',
          actorRole: 'ADMIN',
          action: '<script>alert(1)</script>',
          ipAddress: '2001:db8::1',
          userAgent: '<img src=x onerror=alert(1)>',
        },
      ],
      1,
      1,
    );
    fixture.detectChanges();

    const table = fixture.nativeElement.querySelector('table') as HTMLElement;
    expect(table.textContent).toContain('<script>alert(1)</script>');
    expect(table.textContent).toContain('<img src=x onerror=alert(1)>');
    expect(table.querySelector('script')).toBeNull();
    expect(table.querySelector('img')).toBeNull();
  });

  it('lets keyboard users reveal and collapse a long User-Agent', () => {
    const longUserAgent = `Mozilla/5.0 ${'EnterpriseBrowser/'.repeat(8)}`;
    component.store.loadSuccess(
      [
        {
          id: 'audit-long-user-agent',
          occurredAt: '2026-09-22T01:30:00.000Z',
          actorId: 'user-1',
          actorDisplayName: 'Quản trị viên',
          actorRole: 'ADMIN',
          action: 'LOGIN',
          ipAddress: '10.0.0.8',
          userAgent: longUserAgent,
        },
      ],
      1,
      1,
    );
    fixture.detectChanges();

    const trigger = fixture.nativeElement.querySelector(
      '.user-agent-trigger',
    ) as HTMLButtonElement;
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
    expect(fixture.nativeElement.querySelector('.user-agent-detail')).toBeNull();

    trigger.click();
    fixture.detectChanges();

    expect(trigger.getAttribute('aria-expanded')).toBe('true');
    expect(
      fixture.nativeElement.querySelector('.user-agent-detail').textContent,
    ).toContain(longUserAgent);
  });

  it('formats audit timestamps in UTC+7', () => {
    component.store.loadSuccess(
      [
        {
          id: 'audit-2',
          occurredAt: '2026-09-22T01:30:00.000Z',
          actorId: null,
          actorDisplayName: null,
          actorRole: null,
          action: 'LOGIN',
          ipAddress: null,
          userAgent: null,
        },
      ],
      1,
      1,
    );
    fixture.detectChanges();

    const content = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(content).toContain('08:30:00');
    expect(content).toContain('UTC+7');
  });
});
