// import { Component } from '@angular/core';

// /**
//  * STUB — khung trang, thuộc phạm vi task nghiệp vụ riêng (không nằm trong
//  * 5 yêu cầu của task Base Architecture). Tạo sẵn để app.routes.ts / feature
//  * routes có thể lazy-load và build được ngay từ nhánh develop.
//  */
// @Component({
//   selector: 'app-consultation-page',
//   standalone: true,
//   template: `<div class="p-6 text-slate-500">[TODO] Buồng khám EMR — SRS-DOC-03/04</div>`,
// })
// export class ConsultationPage {}
import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, ActivatedRoute, RouterModule } from '@angular/router';
import { AllergyAlertModalComponent } from '../../../../shared/components/allergy-alert-modal/allergy-alert-modal.component';

interface PrescriptionItem {
  id: string;
  drugName: string;
  activeIngredient: string;
  dosage: string;
  quantity: number;
  unit: string;
  instructions: string;
}

interface DrugOption {
  name: string;
  ingredient: string;
  unit: string;
  allergyGroup?: string;
}

const DRUG_CATALOG: DrugOption[] = [
  { name: 'Amoxicillin 500mg', ingredient: 'Amoxicillin', unit: 'Viên', allergyGroup: 'Penicillin' },
  { name: 'Augmentin 1g', ingredient: 'Amoxicillin + Clavulanic acid', unit: 'Viên', allergyGroup: 'Penicillin' },
  { name: 'Paracetamol 500mg', ingredient: 'Paracetamol', unit: 'Viên' },
  { name: 'Aspirin 81mg', ingredient: 'Acetylsalicylic acid', unit: 'Viên', allergyGroup: 'Aspirin' },
  { name: 'Cefuroxime 500mg', ingredient: 'Cefuroxime axetil', unit: 'Viên' },
  { name: 'Salbutamol 2mg', ingredient: 'Salbutamol sulfate', unit: 'Viên' },
  { name: 'Amlodipine 5mg', ingredient: 'Amlodipine besylate', unit: 'Viên' },
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

  patientName = 'Trần Văn A';
  patientGender = 'Nam';
  patientYear = 1995;
  recordCode = 'EMR-260908';

  // Vitals
  bp = '120/80';
  pulse = 76;
  temp = 36.8;
  height = 170;
  weight = 65;
  bmi = '22.5';

  clinicalNotes =
    'Bệnh nhân tỉnh táo, tiếp xúc tốt. Đau thắt ngực nhẹ khi vận động thể thao, tim đều, phổi không rale rít. Đề nghị điện tâm đồ và điều trị hỗ trợ.';

  icdSearch = '';
  icdTags = [
    { code: 'J00', name: 'Viêm mũi họng cấp' },
    { code: 'I10', name: 'Tăng huyết áp vô căn' },
  ];

  drugCatalog = DRUG_CATALOG;
  selectedCatalogDrug: DrugOption | null = this.drugCatalog[0]; // Default Amoxicillin (triggers allergy!)

  rxList: PrescriptionItem[] = [
    {
      id: '123',
      drugName: 'Paracetamol 500mg',
      activeIngredient: 'Paracetamol',
      dosage: 'Sáng 1 - Tối 1',
      quantity: 10,
      unit: 'Viên',
      instructions: 'Uống sau ăn khi đau đầu hoặc sốt > 38.5°C',
    },
  ];

  // Allergy warning modal state (Screen 5)
  showAllergyModal = false;
  pendingDrugName = '';
  pendingAllergyGroup = '';

  constructor() {
    this.route.paramMap.subscribe((params) => {
      const appointmentId = params.get('appointmentId');
      if (appointmentId) this.recordCode = appointmentId;
    });

    this.route.queryParams.subscribe((p) => {
      if (p['name']) this.patientName = p['name'];
      if (p['gender']) this.patientGender = p['gender'];
      if (p['year']) this.patientYear = Number(p['year']);
    });
  }

  calcBmi() {
    if (this.height > 0 && this.weight > 0) {
      const hM = this.height / 100;
      this.bmi = (this.weight / (hM * hM)).toFixed(1);
    }
  }

  addIcdTag() {
    if (this.icdSearch.trim()) {
      this.icdTags.push({
        code: this.icdSearch.slice(0, 3).toUpperCase(),
        name: this.icdSearch.trim(),
      });
      this.icdSearch = '';
    }
  }

  removeIcd(index: number) {
    this.icdTags.splice(index, 1);
  }

  tryAddDrug() {
    if (!this.selectedCatalogDrug) return;

    // Check allergy group with patient profile (Penicillin, Aspirin)
    if (this.selectedCatalogDrug.allergyGroup === 'Penicillin' || this.selectedCatalogDrug.allergyGroup === 'Aspirin') {
      this.pendingDrugName = this.selectedCatalogDrug.name;
      this.pendingAllergyGroup = this.selectedCatalogDrug.allergyGroup;
      this.showAllergyModal = true;
      return;
    }

    this.addDrugDirectly(this.selectedCatalogDrug);
  }

  addDrugDirectly(drug: DrugOption) {
    this.rxList.push({
      id: 'rx-' + Date.now(),
      drugName: drug.name,
      activeIngredient: drug.ingredient,
      dosage: 'Sáng 1 viên - Tối 1 viên',
      quantity: 14,
      unit: drug.unit,
      instructions: 'Uống sau ăn 30 phút, đủ liệu trình 7 ngày',
    });
  }

  onModalCancel() {
    this.showAllergyModal = false;
  }

  onModalOverride(reason: string) {
    this.showAllergyModal = false;
    if (this.selectedCatalogDrug) {
      this.addDrugDirectly(this.selectedCatalogDrug);
    }
  }

  removeRx(index: number) {
    this.rxList.splice(index, 1);
  }

  saveDraft() {
    alert('Đã lưu nháp hồ sơ bệnh án thành công.');
  }

  completeConsultation() {
    alert('✓ Đã hoàn tất ca khám và khóa bệnh án EMR thành công!');
    this.router.navigate(['/doctor/queue']);
  }
}
