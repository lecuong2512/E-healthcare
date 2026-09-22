import { Injectable } from '@nestjs/common';
import { Icd10Item } from '@shared/interfaces';

/**
 * Standard baseline ICD-10 records according to Vietnam Ministry of Health (BYT) & WHO.
 * Note: Full persistent catalog synchronization belongs to Card 4.4 (Admin Medical Catalog).
 * This service provides the lookup abstraction and canonical baseline items for Clinical EMR.
 */
const BASELINE_ICD10_CATALOG: Icd10Item[] = [
  {
    code: 'J00',
    nameVi: 'Viêm mũi họng cấp (cảm thường)',
    nameEn: 'Acute nasopharyngitis [common cold]',
    chapter: 'Bệnh hệ hô hấp',
    isChronic: false,
  },
  {
    code: 'J02',
    nameVi: 'Viêm họng cấp',
    nameEn: 'Acute pharyngitis',
    chapter: 'Bệnh hệ hô hấp',
    isChronic: false,
  },
  {
    code: 'J03',
    nameVi: 'Viêm amidan cấp',
    nameEn: 'Acute tonsillitis',
    chapter: 'Bệnh hệ hô hấp',
    isChronic: false,
  },
  {
    code: 'J06',
    nameVi: 'Nhiễm trùng đường hô hấp trên cấp ở nhiều vị trí và không xác định',
    nameEn: 'Acute upper respiratory infections of multiple and unspecified sites',
    chapter: 'Bệnh hệ hô hấp',
    isChronic: false,
  },
  {
    code: 'J18',
    nameVi: 'Viêm phổi, không xác định vi sinh vật',
    nameEn: 'Pneumonia, organism unspecified',
    chapter: 'Bệnh hệ hô hấp',
    isChronic: false,
  },
  {
    code: 'J20',
    nameVi: 'Viêm phế quản cấp',
    nameEn: 'Acute bronchitis',
    chapter: 'Bệnh hệ hô hấp',
    isChronic: false,
  },
  {
    code: 'J45',
    nameVi: 'Bệnh hen (suyễn)',
    nameEn: 'Asthma',
    chapter: 'Bệnh hệ hô hấp',
    isChronic: true,
  },
  {
    code: 'J44',
    nameVi: 'Bệnh phổi tắc nghẽn mạn tính khác (COPD)',
    nameEn: 'Other chronic obstructive pulmonary disease',
    chapter: 'Bệnh hệ hô hấp',
    isChronic: true,
  },
  {
    code: 'I10',
    nameVi: 'Tăng huyết áp vô căn (nguyên phát)',
    nameEn: 'Essential (primary) hypertension',
    chapter: 'Bệnh hệ tuần hoàn',
    isChronic: true,
  },
  {
    code: 'I11',
    nameVi: 'Bệnh tim do tăng huyết áp',
    nameEn: 'Hypertensive heart disease',
    chapter: 'Bệnh hệ tuần hoàn',
    isChronic: true,
  },
  {
    code: 'I20',
    nameVi: 'Cơn đau thắt ngực',
    nameEn: 'Angina pectoris',
    chapter: 'Bệnh hệ tuần hoàn',
    isChronic: true,
  },
  {
    code: 'I25',
    nameVi: 'Bệnh tim thiếu máu cục bộ mạn',
    nameEn: 'Chronic ischaemic heart disease',
    chapter: 'Bệnh hệ tuần hoàn',
    isChronic: true,
  },
  {
    code: 'I50',
    nameVi: 'Suy tim',
    nameEn: 'Heart failure',
    chapter: 'Bệnh hệ tuần hoàn',
    isChronic: true,
  },
  {
    code: 'E10',
    nameVi: 'Bệnh đái tháo đường phụ thuộc insulin (Typ 1)',
    nameEn: 'Type 1 diabetes mellitus',
    chapter: 'Bệnh nội tiết, dinh dưỡng và chuyển hóa',
    isChronic: true,
  },
  {
    code: 'E11',
    nameVi: 'Bệnh đái tháo đường không phụ thuộc insulin (Typ 2)',
    nameEn: 'Type 2 diabetes mellitus',
    chapter: 'Bệnh nội tiết, dinh dưỡng và chuyển hóa',
    isChronic: true,
  },
  {
    code: 'E14',
    nameVi: 'Bệnh đái tháo đường không xác định',
    nameEn: 'Unspecified diabetes mellitus',
    chapter: 'Bệnh nội tiết, dinh dưỡng và chuyển hóa',
    isChronic: true,
  },
  {
    code: 'E78',
    nameVi: 'Rối loạn chuyển hóa lipoprotein và tình trạng tăng lipid máu khác',
    nameEn: 'Disorders of lipoprotein metabolism and other lipidaemias',
    chapter: 'Bệnh nội tiết, dinh dưỡng và chuyển hóa',
    isChronic: true,
  },
  {
    code: 'K21',
    nameVi: 'Bệnh trào ngược dạ dày - thực quản (GERD)',
    nameEn: 'Gastro-oesophageal reflux disease',
    chapter: 'Bệnh hệ tiêu hóa',
    isChronic: false,
  },
  {
    code: 'K29',
    nameVi: 'Viêm dạ dày và tá tràng',
    nameEn: 'Gastritis and duodenitis',
    chapter: 'Bệnh hệ tiêu hóa',
    isChronic: false,
  },
  {
    code: 'K30',
    nameVi: 'Chứng khó tiêu chức năng',
    nameEn: 'Dyspepsia',
    chapter: 'Bệnh hệ tiêu hóa',
    isChronic: false,
  },
  {
    code: 'M10',
    nameVi: 'Bệnh gút (Gout)',
    nameEn: 'Gout',
    chapter: 'Bệnh hệ cơ xương khớp và mô liên kết',
    isChronic: true,
  },
  {
    code: 'M54',
    nameVi: 'Đau lưng',
    nameEn: 'Dorsalgia',
    chapter: 'Bệnh hệ cơ xương khớp và mô liên kết',
    isChronic: false,
  },
  {
    code: 'N18',
    nameVi: 'Bệnh thận mạn tính',
    nameEn: 'Chronic kidney disease',
    chapter: 'Bệnh hệ sinh dục - tiết niệu',
    isChronic: true,
  },
  {
    code: 'R50',
    nameVi: 'Sốt không rõ nguyên nhân khác',
    nameEn: 'Fever of other and unknown origin',
    chapter: 'Các triệu chứng, dấu hiệu và kết quả lâm sàng bất thường',
    isChronic: false,
  },
  {
    code: 'R05',
    nameVi: 'Ho',
    nameEn: 'Cough',
    chapter: 'Các triệu chứng, dấu hiệu và kết quả lâm sàng bất thường',
    isChronic: false,
  },
];

function removeVietnameseDiacritics(str: string): string {
  return str
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D');
}

@Injectable()
export class Icd10Service {
  private readonly catalog: Icd10Item[] = BASELINE_ICD10_CATALOG;

  async search(query: string, limit = 20): Promise<Icd10Item[]> {
    if (!query || !query.trim()) {
      return this.catalog.slice(0, Math.min(limit, 50));
    }

    const trimmed = query.trim().toLowerCase();
    const queryNormalized = removeVietnameseDiacritics(trimmed);

    const matches = this.catalog.filter((item) => {
      const codeMatch = item.code.toLowerCase().includes(trimmed);
      const nameVi = item.nameVi.toLowerCase();
      const nameViNormalized = removeVietnameseDiacritics(nameVi);
      const nameMatch =
        nameVi.includes(trimmed) || nameViNormalized.includes(queryNormalized);
      const nameEnMatch = item.nameEn
        ? item.nameEn.toLowerCase().includes(trimmed)
        : false;

      return codeMatch || nameMatch || nameEnMatch;
    });

    const safeLimit = Math.max(1, Math.min(limit, 50));
    return matches.slice(0, safeLimit);
  }

  async findByCode(code: string): Promise<Icd10Item | null> {
    if (!code) return null;
    const normalized = code.trim().toUpperCase();
    const found = this.catalog.find(
      (item) => item.code.toUpperCase() === normalized,
    );
    return found ?? null;
  }

  isChronicCode(code: string): boolean {
    if (!code) return false;
    const normalized = code.trim().toUpperCase();
    const item = this.catalog.find(
      (entry) => entry.code.toUpperCase() === normalized,
    );
    if (item?.isChronic) return true;

    // Check by standard ICD-10 chronic prefix ranges:
    // E10-E14: Diabetes
    // I10-I15: Hypertensive diseases
    // I20-I25: Ischaemic heart diseases
    // I50: Heart failure
    // J44-J45: Chronic lower respiratory diseases (COPD, Asthma)
    // M10: Gout
    // N18: Chronic kidney disease
    const prefix2 = normalized.slice(0, 2);
    const prefix3 = normalized.slice(0, 3);

    if (['E10', 'E11', 'E12', 'E13', 'E14'].includes(prefix3)) return true;
    if (['I10', 'I11', 'I12', 'I13', 'I15'].includes(prefix3)) return true;
    if (['I20', 'I21', 'I22', 'I23', 'I24', 'I25'].includes(prefix3)) return true;
    if (prefix3 === 'I50') return true;
    if (['J44', 'J45'].includes(prefix3)) return true;
    if (prefix3 === 'M10') return true;
    if (prefix3 === 'N18') return true;

    return false;
  }
}

