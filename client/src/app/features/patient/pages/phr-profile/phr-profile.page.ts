import { Component } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ButtonComponent } from '../../../../shared/components/button/button.component';

interface PhrForm {
  birthDate: string;
  gender: string;
  healthInsurance: string;
  bloodType: string;
  drugAllergy: string;
  chronicDiseases: string;
  surgeryHistory: string;
}

@Component({
  selector: 'app-phr-profile-page',
  standalone: true,
  imports: [FormsModule, ButtonComponent],
  templateUrl: '././phr-profile.page.html',
})
export class PhrProfilePage {
  protected readonly initialForm: PhrForm = {
    birthDate: '12/08/1992',
    gender: 'Nữ',
    healthInsurance: 'DN 4 01 234567890',
    bloodType: 'O+',
    drugAllergy: 'Penicillin',
    chronicDiseases: 'Hen phế quản',
    surgeryHistory: 'Không có',
  };

  protected form: PhrForm = {
    ...this.initialForm,
  };

  protected isSaved = false;

  protected saveChanges(): void {
    /*
     * TODO(SRS-AUTH-03):
     * Khi backend PHR API hoàn thiện, thay phần này bằng
     * API update PHR.
     *
     * Hiện tại chỉ cập nhật state ở frontend để hoàn thiện UI.
     */
    this.isSaved = true;
  }

  protected cancelChanges(): void {
    this.form = {
      ...this.initialForm,
    };

    this.isSaved = false;
  }
}