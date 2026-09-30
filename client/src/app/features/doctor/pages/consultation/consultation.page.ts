import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, ActivatedRoute, RouterModule } from '@angular/router';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { PhrService } from '../../../../core/services/phr.service';
import { ClinicalService } from '../../../../core/services/clinical.service';
import { AllergyAlertModalComponent } from '../../../../shared/components/allergy-alert-modal/allergy-alert-modal.component';
import {
  CreateMedicalRecordRequest,
  EmrHistoryResponse,
  PrescriptionItemInput,
  UpdateMedicalRecordRequest,
  VitalSignsInput,
} from '@shared/interfaces';

interface Drug {
  name: string;
  ingredient: string;
  unit: string;
  allergyGroup?: string;
}

interface Rx {
  id: string;
  drugName: string;
  ingredient: string;
  doses: number[];
  timing: string;
  quantity: number;
  unit: string;
}

interface Icd {
  code: string;
  name: string;
}

const DRUGS: Drug[] = [
  { name: 'Amoxicillin 500mg', ingredient: 'Amoxicillin', unit: 'Viên', allergyGroup: 'Penicillin' },
  { name: 'Augmentin 1g', ingredient: 'Amoxicillin + Clavulanic acid', unit: 'Viên', allergyGroup: 'Penicillin' },
  { name: 'Paracetamol 500mg', ingredient: 'Paracetamol', unit: 'Viên' },
  { name: 'Aspirin 81mg', ingredient: 'Acetylsalicylic acid', unit: 'Viên', allergyGroup: 'Aspirin' },
  { name: 'Cefuroxime 500mg', ingredient: 'Cefuroxime axetil', unit: 'Viên' },
  { name: 'Salbutamol 2mg', ingredient: 'Salbutamol sulfate', unit: 'Viên' },
  { name: 'Amlodipine 5mg', ingredient: 'Amlodipine besylate', unit: 'Viên' },
];

const ICD: Icd[] = [
  { code: 'I10', name: 'Tăng huyết áp vô căn' },
  { code: 'I20.9', name: 'Đau thắt ngực, không đặc hiệu' },
  { code: 'J00', name: 'Viêm mũi họng cấp' },
  { code: 'E11.9', name: 'Đái tháo đường type 2' },
  { code: 'J45.9', name: 'Hen phế quản' },
  { code: 'R07.4', name: 'Đau ngực, không đặc hiệu' },
];

@Component({
  selector: 'app-consultation-page',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule, AllergyAlertModalComponent],
  templateUrl: './consultation.page.html',
})
export class ConsultationPage {
  private router = inject(Router);
  private route = inject(ActivatedRoute);
  private phr = inject(PhrService);
  private sanitizer = inject(DomSanitizer);
  private clinical = inject(ClinicalService);

  appointmentId = '';
  recordId = '';
  isLocked = false;
  lockedAt: string | null = null;
  completedAt: string | null = null;
  doctorAdvice = '';
  followUpDate = '';

  showAddendumModal = false;
  addendumReason = '';
  addendumClinicalNotes = '';
  addendumDoctorAdvice = '';
  addendumIcd10Secondary = '';
  addendumFollowUpDate = '';
  addendumError = '';
  isSubmittingAddendum = false;
  emrHistory: EmrHistoryResponse | null = null;

  showConfirmCompleteModal = false;
  showCompleteSuccessModal = false;
  isCompleting = false;
  prescriptionPdfLoading = false;

  patientName = 'Trần Văn A';
  patientGender = 'Nam';
  patientYear = 1995;
  recordCode = 'EMR-260908';
  bloodType = 'O+';
  allergies = 'Penicillin, Aspirin';
  chronicDiseases = 'Hen phế quản';
  surgeryHistory = 'Chưa ghi nhận';

  symptoms = '';
  onsetDuration = '';
  bp = '120/80';
  pulse = 76;
  temp = 36.8;
  respiratoryRate = 18;
  height = 170;
  weight = 65;
  bmi = '22.5';
  spo2 = 98;

  generalExam = '';
  specialtyExam = '';
  differentialDiagnosis = '';
  clinicalNotes = '';

  icdSearch = '';
  icdTags: Icd[] = [{ code: 'I20.9', name: 'Đau thắt ngực, không đặc hiệu' }];
  readonly icdCatalog = ICD;

  readonly drugCatalog = DRUGS;
  drugSearch = '';
  selectedCatalogDrug: Drug | null = null;
  rxList: Rx[] = [];

  showAllergyModal = false;
  pendingDrug: Drug | null = null;
  attachments: { name: string; type: string; url: string }[] = [];
  preview: { name: string; type: string; url: string } | null = null;
  activeTab: 'record' | 'attachments' | 'history' = 'record';
  saveMessage = '';

  constructor() {
    this.route.paramMap.subscribe((p) => {
      const id = p.get('appointmentId');
      if (id) {
        this.appointmentId = id;
        this.recordCode = id;
        this.loadRecord(id);
      }
    });
    this.route.queryParams.subscribe((p) => {
      if (p['name']) this.patientName = p['name'];
      if (p['gender']) this.patientGender = p['gender'];
      if (p['year']) this.patientYear = Number(p['year']);
    });
    this.loadPhr();
  }

  get filteredDrugs() {
    const q = this.drugSearch.toLocaleLowerCase();
    return this.drugCatalog.filter(
      (d) => !q || `${d.name} ${d.ingredient}`.toLocaleLowerCase().includes(q),
    );
  }

  get filteredIcd() {
    const q = this.icdSearch.toLocaleLowerCase();
    return q
      ? this.icdCatalog.filter(
          (d) =>
            `${d.code} ${d.name}`.toLocaleLowerCase().includes(q) &&
            !this.icdTags.some((t) => t.code === d.code),
        )
      : [];
  }

  get vitalSignsPayload(): VitalSignsInput {
    const bpRegex = /^\d{2,3}\/\d{2,3}$/;
    const safeBp = bpRegex.test(this.bp?.trim() || '') ? this.bp.trim() : '120/80';
    return {
      bloodPressure: safeBp,
      pulse: Number(this.pulse) || 75,
      temperature: Number(this.temp) || 36.8,
      respiratoryRate: Number(this.respiratoryRate) || 18,
      weight: Number(this.weight) || 60,
      height: Number(this.height) || 165,
    };
  }

  get prescriptionItemsPayload(): PrescriptionItemInput[] {
    return this.rxList.map((rx) => ({
      medicineName: rx.drugName,
      activeIngredient: rx.ingredient || null,
      dosageMorning: rx.doses?.[0] ? `${rx.doses[0]} viên` : null,
      dosageNoon: rx.doses?.[1] ? `${rx.doses[1]} viên` : null,
      dosageAfternoon: rx.doses?.[2] ? `${rx.doses[2]} viên` : null,
      dosageNight: rx.doses?.[3] ? `${rx.doses[3]} viên` : null,
      totalQuantity: Number(rx.quantity) || 1,
      unit: rx.unit || 'Viên',
      usageInstructions: rx.timing || 'Sau ăn',
      durationDays: this.getRxDays(rx) || 7,
    }));
  }

  get clinicalNotesPayload(): string {
    if (this.clinicalNotes && this.clinicalNotes.trim()) {
      return this.clinicalNotes.trim();
    }
    const parts = [
      this.symptoms ? `Triệu chứng: ${this.symptoms}` : '',
      this.onsetDuration ? `Thời gian: ${this.onsetDuration}` : '',
      this.generalExam ? `Khám tổng quát: ${this.generalExam}` : '',
      this.specialtyExam ? `Khám chuyên khoa: ${this.specialtyExam}` : '',
      this.differentialDiagnosis ? `Chẩn đoán phân biệt: ${this.differentialDiagnosis}` : '',
    ].filter(Boolean);
    return parts.length > 0 ? parts.join('\n') : 'Khám lâm sàng chưa có bất thường.';
  }

  get icd10PrimaryPayload(): string {
    return this.icdTags.length > 0 ? this.icdTags[0].code : 'R07.4';
  }

  get icd10SecondaryPayload(): string | null {
    if (this.icdTags.length <= 1) return null;
    return this.icdTags.slice(1).map((t) => t.code).join(',');
  }

  loadPhr() {
    this.phr.getMyPhr().subscribe({
      next: (p) => {
        this.bloodType = p.bloodType || 'Chưa có';
        this.allergies = p.allergies || 'Chưa ghi nhận';
        this.chronicDiseases = p.chronicDiseases || 'Chưa ghi nhận';
        this.surgeryHistory = p.surgeryHistory || 'Chưa ghi nhận';
        if (p.fullName) this.patientName = p.fullName;
        if (p.dateOfBirth) this.patientYear = new Date(p.dateOfBirth).getFullYear();
      },
      error: () => {},
    });
  }

  loadRecord(id: string) {
    this.clinical.getMedicalRecordByAppointment(id).subscribe({
      next: (r) => {
        this.recordId = r.id;
        this.isLocked = r.isLocked;
        this.lockedAt = r.lockedAt;
        this.completedAt = r.completedAt;
        if (r.clinicalNotes) this.clinicalNotes = r.clinicalNotes;
        if (r.doctorAdvice) this.doctorAdvice = r.doctorAdvice;
        if (r.followUpDate) this.followUpDate = r.followUpDate;
        this.loadHistory(r.id);
      },
      error: () => {},
    });
  }

  loadHistory(id: string) {
    if (!id) return;
    this.clinical.getEmrHistory(id).subscribe({
      next: (h) => {
        this.emrHistory = h;
        this.isLocked = h.isLocked;
        this.lockedAt = h.lockedAt;
        this.completedAt = h.completedAt;
      },
      error: () => {},
    });
  }

  calcBmi() {
    if (this.height > 0 && this.weight > 0)
      this.bmi = (this.weight / (this.height / 100) ** 2).toFixed(1);
  }

  addIcd(tag: Icd) {
    this.icdTags.push(tag);
    this.icdSearch = '';
  }

  removeIcd(i: number) {
    this.icdTags.splice(i, 1);
  }

  selectDrug(d: Drug) {
    this.selectedCatalogDrug = d;
    this.drugSearch = d.name;
  }

  tryAddDrug() {
    const drug = this.selectedCatalogDrug;
    if (!drug) return;
    const patientAllergies = this.allergies.toLowerCase();
    if (drug.allergyGroup && patientAllergies.includes(drug.allergyGroup.toLowerCase())) {
      this.pendingDrug = drug;
      this.showAllergyModal = true;
      return;
    }
    this.addDrugDirectly(drug);
  }

  addDrugDirectly(d: Drug) {
    this.rxList.push({
      id: `rx-${Date.now()}`,
      drugName: d.name,
      ingredient: d.ingredient,
      doses: [1, 0, 0, 1],
      timing: 'Sau ăn',
      quantity: 14,
      unit: d.unit,
    });
    this.selectedCatalogDrug = null;
    this.drugSearch = '';
  }

  onModalCancel() {
    this.showAllergyModal = false;
    this.pendingDrug = null;
  }

  onModalOverride(_reason: string) {
    this.showAllergyModal = false;
    if (this.pendingDrug) this.addDrugDirectly(this.pendingDrug);
    this.pendingDrug = null;
  }

  removeRx(i: number) {
    this.rxList.splice(i, 1);
  }

  onFiles(event: Event) {
    const input = event.target as HTMLInputElement;
    for (const file of Array.from(input.files || [])) {
      if (file.size > 10 * 1024 * 1024) {
        this.saveMessage = `Tệp ${file.name} vượt quá giới hạn 10 MB.`;
        continue;
      }
      if (!['image/jpeg', 'image/png', 'application/pdf'].includes(file.type)) {
        this.saveMessage = `Định dạng ${file.name} không được hỗ trợ.`;
        continue;
      }
      this.attachments.push({
        name: file.name,
        type: file.type,
        url: URL.createObjectURL(file),
      });
    }
    input.value = '';
  }

  openPreview(file: { name: string; type: string; url: string }) {
    this.preview = file;
  }

  closePreview() {
    this.preview = null;
  }

  get safePreviewUrl(): SafeResourceUrl | null {
    return this.preview
      ? this.sanitizer.bypassSecurityTrustResourceUrl(this.preview.url)
      : null;
  }

  saveDraft() {
    if (this.isLocked) return;

    if (this.recordId) {
      const updateReq: UpdateMedicalRecordRequest = {
        vitalSigns: this.vitalSignsPayload,
        clinicalNotes: this.clinicalNotesPayload,
        icd10PrimaryCode: this.icd10PrimaryPayload,
        icd10SecondaryCodes: this.icd10SecondaryPayload,
        doctorAdvice: this.doctorAdvice || null,
        followUpDate: this.followUpDate || null,
        prescriptionItems: this.prescriptionItemsPayload,
      };

      this.clinical.updateMedicalRecord(this.recordId, updateReq).subscribe({
        next: (res) => {
          this.saveMessage = 'Đã lưu nháp bệnh án thành công vào cơ sở dữ liệu.';
          if (res?.id) this.recordId = res.id;
        },
        error: (err) => {
          this.saveMessage = err.error?.message || 'Có lỗi xảy ra khi lưu nháp bệnh án.';
        },
      });
    } else {
      const createReq: CreateMedicalRecordRequest = {
        appointmentId: this.appointmentId || this.recordCode,
        vitalSigns: this.vitalSignsPayload,
        clinicalNotes: this.clinicalNotesPayload,
        icd10PrimaryCode: this.icd10PrimaryPayload,
        icd10SecondaryCodes: this.icd10SecondaryPayload,
        doctorAdvice: this.doctorAdvice || null,
        followUpDate: this.followUpDate || null,
        prescriptionItems: this.prescriptionItemsPayload,
      };

      this.clinical.createMedicalRecord(createReq).subscribe({
        next: (res) => {
          this.saveMessage = 'Đã lưu nháp bệnh án thành công vào cơ sở dữ liệu.';
          if (res?.id) this.recordId = res.id;
        },
        error: (err) => {
          this.saveMessage = err.error?.message || 'Có lỗi xảy ra khi lưu nháp bệnh án.';
        },
      });
    }
  }

  completeConsultation() {
    if (this.isLocked) return;
    this.showConfirmCompleteModal = true;
  }

  cancelComplete() {
    this.showConfirmCompleteModal = false;
  }

  confirmCompleteConsultation() {
    this.showConfirmCompleteModal = false;
    this.isCompleting = true;

    if (!this.recordId) {
      const createReq: CreateMedicalRecordRequest = {
        appointmentId: this.appointmentId || this.recordCode,
        vitalSigns: this.vitalSignsPayload,
        clinicalNotes: this.clinicalNotesPayload,
        icd10PrimaryCode: this.icd10PrimaryPayload,
        icd10SecondaryCodes: this.icd10SecondaryPayload,
        doctorAdvice: this.doctorAdvice || null,
        followUpDate: this.followUpDate || null,
        prescriptionItems: this.prescriptionItemsPayload,
      };

      this.clinical.createMedicalRecord(createReq).subscribe({
        next: (created) => {
          this.recordId = created.id;
          this.executeComplete(created.id);
        },
        error: (err) => {
          this.isCompleting = false;
          this.saveMessage = err.error?.message || 'Không thể tạo bệnh án để hoàn tất.';
        },
      });
      return;
    }

    this.executeComplete(this.recordId);
  }

  private executeComplete(recordId: string) {
    this.clinical.completeConsultation(recordId).subscribe({
      next: (res) => {
        this.isCompleting = false;
        this.isLocked = res.isLocked;
        this.completedAt = res.completedAt;
        this.saveMessage = 'Ca khám đã hoàn tất và chốt bệnh án thành công.';
        this.showCompleteSuccessModal = true;
      },
      error: (err) => {
        this.isCompleting = false;
        this.saveMessage = err.error?.message || 'Có lỗi khi hoàn tất ca khám.';
      },
    });
  }

  downloadPrescription() {
    const aptId = this.appointmentId || this.recordCode;
    this.prescriptionPdfLoading = true;
    this.clinical.downloadPrescriptionPdf(aptId).subscribe({
      next: (blob) => {
        this.prescriptionPdfLoading = false;
        const blobUrl = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = blobUrl;
        a.download = `DonThuoc_${this.recordCode}.pdf`;
        a.click();
        window.URL.revokeObjectURL(blobUrl);
      },
      error: (err) => {
        this.prescriptionPdfLoading = false;
        console.error('Không thể tải đơn thuốc PDF:', err);
        this.saveMessage = 'Không thể tải đơn thuốc PDF. Vui lòng thử lại.';
      },
    });
  }

  viewPrescriptionPdf() {
    const aptId = this.appointmentId || this.recordCode;
    this.prescriptionPdfLoading = true;
    this.clinical.downloadPrescriptionPdf(aptId).subscribe({
      next: (blob) => {
        this.prescriptionPdfLoading = false;
        const blobUrl = window.URL.createObjectURL(blob);
        this.openPreview({
          name: `Đơn thuốc điện tử - ${this.recordCode}`,
          type: 'application/pdf',
          url: blobUrl,
        });
      },
      error: (err) => {
        this.prescriptionPdfLoading = false;
        console.error('Không thể xem đơn thuốc PDF:', err);
        this.saveMessage = 'Không thể xem đơn thuốc PDF. Vui lòng thử lại.';
      },
    });
  }

  finishAndNavigateToQueue() {
    this.showCompleteSuccessModal = false;
    this.router.navigate(['/doctor/queue']);
  }

  get isChronicPatient(): boolean {
    const c = (this.chronicDiseases || '').toLowerCase();
    const hasPhrChronic = !!c && !c.includes('chưa') && !c.includes('không');
    const hasChronicIcd = this.icdTags.some((t) =>
      ['i10', 'i20', 'e11', 'j45'].some((code) => t.code.toLowerCase().startsWith(code)),
    );
    return hasPhrChronic || hasChronicIcd;
  }

  getRxDailyDose(rx: Rx): number {
    return (rx.doses || []).reduce((sum, d) => sum + (Number(d) || 0), 0);
  }

  getRxDays(rx: Rx): number {
    const daily = this.getRxDailyDose(rx);
    if (daily <= 0 || !rx.quantity) return 0;
    return Math.ceil(rx.quantity / daily);
  }

  get hasChronicOver30Warning(): boolean {
    if (!this.isChronicPatient) return false;
    return this.rxList.some((rx) => this.getRxDays(rx) > 30);
  }

  getBmiColor(bmiInput: number | null | undefined | string): string {
    const bmi = typeof bmiInput === 'string' ? parseFloat(bmiInput) : bmiInput;
    if (bmi == null) return 'inherit';
    if (bmi < 18.5) return '#F59E0B';
    if (bmi < 25) return '#22C55E';
    if (bmi < 30) return '#F97316';
    return '#EF4444';
  }

  openAddendumModal() {
    this.addendumReason = '';
    this.addendumClinicalNotes = this.clinicalNotes;
    this.addendumDoctorAdvice = this.doctorAdvice;
    this.addendumIcd10Secondary = '';
    this.addendumFollowUpDate = this.followUpDate;
    this.addendumError = '';
    this.showAddendumModal = true;
  }

  closeAddendumModal() {
    this.showAddendumModal = false;
    this.addendumError = '';
  }

  submitAddendum() {
    if (!this.addendumReason.trim()) {
      this.addendumError = 'Vui lòng nhập lý do y khoa tạo phụ lục.';
      return;
    }
    if (this.addendumReason.trim().length > 1000) {
      this.addendumError = 'Lý do không được vượt quá 1000 ký tự.';
      return;
    }
    this.isSubmittingAddendum = true;
    this.addendumError = '';
    this.clinical
      .createEmrAddendum(this.recordId, {
        reason: this.addendumReason.trim(),
        clinicalNotes: this.addendumClinicalNotes,
        doctorAdvice: this.addendumDoctorAdvice || null,
        icd10SecondaryCodes: this.addendumIcd10Secondary || null,
        followUpDate: this.addendumFollowUpDate || null,
      })
      .subscribe({
        next: (res) => {
          this.isSubmittingAddendum = false;
          this.showAddendumModal = false;
          this.saveMessage = 'Đã lưu phụ lục bệnh án thành công.';
          if (res.updatedContent) {
            this.clinicalNotes = res.updatedContent.clinicalNotes;
            this.doctorAdvice = res.updatedContent.doctorAdvice || '';
            this.followUpDate = res.updatedContent.followUpDate || '';
          }
          this.loadHistory(this.recordId);
          this.activeTab = 'history';
        },
        error: (err) => {
          this.isSubmittingAddendum = false;
          this.addendumError = err.error?.message || 'Có lỗi xảy ra khi tạo phụ lục.';
        },
      });
  }
}
