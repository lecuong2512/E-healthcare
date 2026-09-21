import { Component, OnInit, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';

import {
  PhrProfile,
  UpdatePhrProfileRequest,
} from '@shared/interfaces';
import { Gender } from '@shared/enums';

import { ButtonComponent } from '../../../../shared/components/button/button.component';
import { PhrService } from '../../../../core/services/phr.service';

@Component({
  selector: 'app-phr-profile-page',
  standalone: true,
  imports: [FormsModule, ButtonComponent],
  templateUrl: './phr-profile.page.html',
})
export class PhrProfilePage implements OnInit {
  private readonly phrService = inject(PhrService);

  protected readonly Gender = Gender;

  protected form: PhrProfile = this.emptyForm();
  protected savedForm: PhrProfile = this.emptyForm();

  protected isLoading = true;
  protected isSaving = false;
  protected isSaved = false;
  protected errorMessage = '';

  ngOnInit(): void {
    this.loadPhr();
  }

  protected saveChanges(): void {
    this.isSaving = true;
    this.isSaved = false;
    this.errorMessage = '';

    const request: UpdatePhrProfileRequest = {
      fullName: this.form.fullName.trim(),
      citizenId: this.form.citizenId?.trim() ?? '',
      gender: this.form.gender,
      dateOfBirth: this.form.dateOfBirth,
      address: this.form.address?.trim() ?? '',
      healthInsurance: this.form.healthInsurance?.trim() ?? '',
      bloodType: this.form.bloodType ?? '',
      allergies: this.form.allergies?.trim() ?? '',
      chronicDiseases: this.form.chronicDiseases?.trim() ?? '',
      surgeryHistory: this.form.surgeryHistory?.trim() ?? '',
    };

    this.phrService.updateMyPhr(request).subscribe({
      next: (profile) => {
        this.form = { ...profile };
        this.savedForm = { ...profile };

        this.isSaved = true;
        this.isSaving = false;
      },
      error: (error) => {
        this.errorMessage =
          error?.error?.message ??
          'Không thể cập nhật hồ sơ sức khỏe. Vui lòng thử lại.';

        this.isSaving = false;
      },
    });
  }

  protected cancelChanges(): void {
    this.form = { ...this.savedForm };
    this.isSaved = false;
    this.errorMessage = '';
  }

  private loadPhr(): void {
    this.isLoading = true;
    this.errorMessage = '';

    this.phrService.getMyPhr().subscribe({
      next: (profile) => {
        this.form = { ...profile };
        this.savedForm = { ...profile };

        this.isLoading = false;
      },
      error: (error) => {
        this.errorMessage =
          error?.error?.message ??
  'Không thể cập nhật hồ sơ sức khỏe. Vui lòng thử lại.';

        this.isLoading = false;
      },
    });
  }

  private emptyForm(): PhrProfile {
    return {
      fullName: '',
      citizenId: null,
      gender: Gender.OTHER,
      dateOfBirth: '',
      address: null,
      healthInsurance: null,
      bloodType: null,
      allergies: null,
      chronicDiseases: null,
      surgeryHistory: null,
    };
  }
}
