import { TestBed } from '@angular/core/testing';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { provideHttpClient } from '@angular/common/http';
import { AuditOutcome, Role } from '@shared/enums';
import { AuditLogsApiService } from './audit-logs-api.service';

describe('AuditLogsApiService', () => {
  let service: AuditLogsApiService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        AuditLogsApiService,
        provideHttpClient(),
        provideHttpClientTesting(),
      ],
    });
    service = TestBed.inject(AuditLogsApiService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('maps local UTC+7 filters to the typed server contract', () => {
    service
      .list(
        {
          fromLocal: '2026-09-29T00:00',
          toLocal: '2026-09-30T00:00',
          action: 'VIEW_EMR',
          search: ' 10.0.0.8 ',
        },
        2,
        50,
      )
      .subscribe((result) => expect(result.total).toBe(1));

    const request = http.expectOne(
      (candidate) => candidate.url === '/api/v1/admin/audit-logs',
    );
    expect(request.request.params.get('from')).toBe('2026-09-28T17:00:00.000Z');
    expect(request.request.params.get('toExclusive')).toBe(
      '2026-09-29T17:00:00.000Z',
    );
    expect(request.request.params.get('page')).toBe('2');
    expect(request.request.params.get('pageSize')).toBe('50');
    expect(request.request.params.get('search')).toBe('10.0.0.8');
    request.flush({
      items: [
        {
          id: '1',
          occurredAt: '2026-09-29T01:00:00.000Z',
          actorId: 'actor',
          actorDisplayName: 'Admin',
          actorRole: Role.ADMIN,
          action: 'VIEW_EMR',
          outcome: AuditOutcome.SUCCESS,
          ipAddress: '10.0.0.8',
          userAgent: 'browser',
          resourceType: 'MEDICAL_RECORD',
          resourceId: 'record',
          requestId: null,
        },
      ],
      page: 2,
      pageSize: 50,
      total: 1,
      totalPages: 1,
    });
  });
});
