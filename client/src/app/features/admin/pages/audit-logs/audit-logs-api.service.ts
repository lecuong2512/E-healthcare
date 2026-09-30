import { HttpClient, HttpParams, HttpResponse } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { AuditLogItem, AuditLogPage } from '@shared/interfaces';
import { Observable, map } from 'rxjs';
import { AuditLogFilterViewModel, AuditLogRowViewModel } from './audit-logs.models';
import { vietnamDateTimeToUtcIso } from './audit-log-time.util';

export interface AuditLogPageViewModel {
  readonly rows: readonly AuditLogRowViewModel[];
  readonly total: number;
  readonly totalPages: number;
}

@Injectable({ providedIn: 'root' })
export class AuditLogsApiService {
  private readonly endpoint = '/api/v1/admin/audit-logs';

  constructor(private readonly http: HttpClient) {}

  list(
    filter: AuditLogFilterViewModel,
    page: number,
    pageSize: number,
  ): Observable<AuditLogPageViewModel> {
    return this.http
      .get<AuditLogPage>(this.endpoint, {
        params: this.params(filter).set('page', page).set('pageSize', pageSize),
      })
      .pipe(
        map((response) => ({
          rows: response.items.map((item) => this.mapItem(item)),
          total: response.total,
          totalPages: response.totalPages,
        })),
      );
  }

  exportCsv(
    filter: AuditLogFilterViewModel,
  ): Observable<HttpResponse<Blob>> {
    return this.http.get(`${this.endpoint}/export`, {
      params: this.params(filter),
      observe: 'response',
      responseType: 'blob',
    });
  }

  private params(filter: AuditLogFilterViewModel): HttpParams {
    const from = vietnamDateTimeToUtcIso(filter.fromLocal);
    const toExclusive = vietnamDateTimeToUtcIso(filter.toLocal);
    let params = new HttpParams()
      .set('from', from ?? '')
      .set('toExclusive', toExclusive ?? '');
    if (filter.action) params = params.set('action', filter.action);
    if (filter.search.trim()) params = params.set('search', filter.search.trim());
    return params;
  }

  private mapItem(item: AuditLogItem): AuditLogRowViewModel {
    return {
      id: item.id,
      occurredAt: item.occurredAt,
      actorId: item.actorId,
      actorDisplayName: item.actorDisplayName,
      actorRole: item.actorRole,
      action: item.action,
      ipAddress: item.ipAddress,
      userAgent: item.userAgent,
    };
  }
}
