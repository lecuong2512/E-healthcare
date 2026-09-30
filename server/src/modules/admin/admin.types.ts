export enum AdminCatalogType {
  SPECIALTY = 'SPECIALTY',
  MEDICINE = 'MEDICINE',
  SERVICE = 'SERVICE',
  ICD10 = 'ICD10',
}

export interface CatalogListQuery {
  search?: string;
  page?: number;
  limit?: number;
  active?: boolean;
}

export interface CatalogPage<T> {
  data: T[];
  pagination: { page: number; limit: number; total: number; totalPages: number };
}
