import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import {
  PhrProfile,
  UpdatePhrProfileRequest,
} from '@shared/interfaces';

import { TokenStoreService } from './token-store.service';

const API_BASE = '/api/v1';

@Injectable({ providedIn: 'root' })
export class PhrService {
  private readonly http = inject(HttpClient);
  private readonly tokenStore = inject(TokenStoreService);

  getMyPhr(): Observable<PhrProfile> {
    return this.http.get<PhrProfile>(
      `${API_BASE}/phr/me`,
      {
        headers: this.authHeaders(),
      },
    );
  }

  updateMyPhr(
    request: UpdatePhrProfileRequest,
  ): Observable<PhrProfile> {
    return this.http.patch<PhrProfile>(
      `${API_BASE}/phr/me`,
      request,
      {
        headers: this.authHeaders(),
      },
    );
  }

  private authHeaders(): HttpHeaders {
    const accessToken = this.tokenStore.accessToken();

    return new HttpHeaders({
      Authorization: `Bearer ${accessToken ?? ''}`,
    });
  }
}
