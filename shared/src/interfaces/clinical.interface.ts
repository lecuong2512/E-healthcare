export interface VitalSigns {
  bloodPressure: string;
  pulse: number;
  temperature: number;
  respiratoryRate: number;
  weight: number;
  height: number;
  bmi: number;
}

export interface MedicalRecordData {
  id: string;
  appointmentId: string;
  patientId: string;
  doctorId: string;
  vitalSigns: VitalSigns;
  clinicalNotes: string;
  icd10PrimaryCode: string;
  icd10SecondaryCodes: string | null;
  doctorAdvice: string | null;
  followUpDate: string | null;
  isLocked: boolean;
  lockedAt: string | null;
  completedAt: string | null;
}

export interface PrescriptionItemData {
  id: string;
  prescriptionId: string;
  medicineName: string;
  activeIngredient: string | null;
  dosageMorning: string | null;
  dosageNoon: string | null;
  dosageAfternoon: string | null;
  dosageNight: string | null;
  totalQuantity: number;
  unit: string;
  usageInstructions: string | null;
}

export interface PrescriptionData {
  id: string;
  medicalRecordId: string;
  prescriptionCode: string;
  createdAt: string;
  items: PrescriptionItemData[];
}

export interface Icd10Item {
  code: string;
  nameVi: string;
  nameEn?: string;
  chapter?: string;
  isChronic?: boolean;
}

export interface DrugSafetyWarning {
  medicineName: string;
  matchedAllergy: string;
  warningMessage: string;
}

export interface DrugSafetyCheckResult {
  hasWarning: boolean;
  warnings: DrugSafetyWarning[];
}

export interface VitalSignsInput {
  bloodPressure: string;
  pulse: number;
  temperature: number;
  respiratoryRate: number;
  weight: number;
  height: number;
}

export interface PrescriptionItemInput {
  medicineName: string;
  activeIngredient?: string | null;
  dosageMorning?: string | null;
  dosageNoon?: string | null;
  dosageAfternoon?: string | null;
  dosageNight?: string | null;
  totalQuantity: number;
  unit: string;
  usageInstructions?: string | null;
  durationDays?: number | null;
}

export interface PrescriptionSafetyCheckRequest {
  appointmentId: string;
  icd10PrimaryCode?: string;
  items: PrescriptionItemInput[];
}

export interface CreateMedicalRecordRequest {
  appointmentId: string;
  vitalSigns: VitalSignsInput;
  clinicalNotes: string;
  icd10PrimaryCode: string;
  icd10SecondaryCodes?: string | null;
  doctorAdvice?: string | null;
  followUpDate?: string | null;
  prescriptionItems?: PrescriptionItemInput[];
}

export interface UpdateMedicalRecordRequest {
  vitalSigns?: VitalSignsInput;
  clinicalNotes?: string;
  icd10PrimaryCode?: string;
  icd10SecondaryCodes?: string | null;
  doctorAdvice?: string | null;
  followUpDate?: string | null;
  prescriptionItems?: PrescriptionItemInput[];
}

export interface MedicalRecordDetailResponse extends MedicalRecordData {
  prescription?: PrescriptionData | null;
  warnings?: DrugSafetyWarning[];
}