import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
export type CatalogType = 'SPECIALTY' | 'MEDICINE' | 'SERVICE' | 'ICD10';
export interface CatalogRow { id: string; code?: string; name?: string; brandName?: string; activeIngredient?: string; strength?: string; packageUnit?: string; isActive: boolean; }
export interface CatalogResponse { data: CatalogRow[]; pagination: { page: number; limit: number; total: number; totalPages: number }; }
@Injectable({ providedIn: 'root' })
export class AdminCatalogApiService { private readonly http = inject(HttpClient); private readonly baseUrl = '/api/v1/admin/catalogs'; list(type: CatalogType, search = '') { return this.http.get<CatalogResponse>(`${this.baseUrl}/${type}`, { params: new HttpParams().set('search', search).set('page', '1').set('limit', '25') }); } create(type: CatalogType, body: Record<string, unknown>) { return this.http.post<CatalogRow>(`${this.baseUrl}/${type}`, body); } update(type: CatalogType, id: string, body: Record<string, unknown>) { return this.http.patch<CatalogRow>(`${this.baseUrl}/${type}/${id}`, body); } setVisibility(type: CatalogType, id: string, isActive: boolean) { return this.http.patch<CatalogRow>(`${this.baseUrl}/${type}/${id}/visibility`, { isActive }); } }
