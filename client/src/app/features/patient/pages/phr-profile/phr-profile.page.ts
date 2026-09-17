import { Component } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { PhrProfile } from '@shared/interfaces';
import { Gender } from '@shared/enums';
import { ButtonComponent } from '../../../../shared/components/button/button.component';

@Component({
  selector: 'app-phr-profile-page',
  standalone: true,
  imports: [FormsModule, ButtonComponent],
  templateUrl: './phr-profile.page.html',
})
export class PhrProfilePage {
  protected readonly Gender = Gender;

  protected readonly initialForm: PhrProfile = {
    fullName: 'Nguyễn Tùng',
    citizenId: '',
    gender: Gender.MALE,
    dateOfBirth: '1992-08-12',
    address: '',
    healthInsurance: 'DN 4 01 234567890',
    bloodType: 'O+',
    drugAllergy: 'Penicillin',
    chronicDiseases: 'Hen phế quản',
    surgeryHistory: 'Không có',
  };

  protected form: PhrProfile = { ...this.initialForm };

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
    this.form = { ...this.initialForm };
    this.isSaved = false;
  }
}