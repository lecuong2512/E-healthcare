import { Location } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { Component, OnInit, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';

import {
  PhrProfile,
  UpdatePhrProfileRequest,
} from '@shared/interfaces';
import { Gender } from '@shared/enums';
import { environment } from '../../../../../environments/environment';

import { ButtonComponent } from '../../../../shared/components/button/button.component';
import { PatientConsentCheckboxComponent } from '../../../../shared/components/patient-consent-checkbox/patient-consent-checkbox.component';
import { PhrService } from '../../../../core/services/phr.service';
import { TokenStoreService } from '../../../../core/services/token-store.service';

@Component({
  selector: 'app-phr-profile-page',
  standalone: true,
  imports: [FormsModule, ButtonComponent, PatientConsentCheckboxComponent],
  templateUrl: './phr-profile.page.html',
})
export class PhrProfilePage implements OnInit {
  private readonly phrService = inject(PhrService);
  private readonly http = inject(HttpClient, { optional: true });
  private readonly router = inject(Router, { optional: true });
  private readonly location = inject(Location, { optional: true });
  private readonly tokenStore = inject(TokenStoreService, { optional: true });

  protected readonly Gender = Gender;

  protected form: PhrProfile = this.emptyForm();
  protected savedForm: PhrProfile = this.emptyForm();

  protected isLoading = true;
  protected isSaving = false;
  protected isSaved = false;
  protected errorMessage = '';
  protected consentAccepted = false;
  protected consentError = false;

  protected fieldErrors: Record<string, string> = {};

  protected avatarPreview: string | null = null;
  protected selectedAvatarFile: File | null = null;
  protected isUploadingAvatar = false;
  protected avatarUploadSuccess = false;
  protected avatarUploadError = '';

  ngOnInit(): void {
    this.loadPhr();
  }

  protected validateFullName(): void {
    if (!this.form.fullName || !this.form.fullName.trim()) {
      this.fieldErrors['fullName'] = 'Vui lòng nhập họ và tên.';
    } else {
      delete this.fieldErrors['fullName'];
    }
  }

  protected validateCitizenId(): void {
    const val = this.form.citizenId ? this.form.citizenId.trim() : '';
    if (!val) {
      delete this.fieldErrors['citizenId'];
      return;
    }
    if (!/^\d+$/.test(val)) {
      this.fieldErrors['citizenId'] = 'Số CCCD/CMND chỉ được chứa chữ số.';
      return;
    }
    if (val.length !== 9 && val.length !== 12) {
      this.fieldErrors['citizenId'] = `Số CCCD/CMND phải gồm đúng 9 hoặc 12 chữ số (hiện có ${val.length} chữ số).`;
      return;
    }
    delete this.fieldErrors['citizenId'];
  }

  protected validateDateOfBirth(): void {
    if (!this.form.dateOfBirth) {
      this.fieldErrors['dateOfBirth'] = 'Vui lòng chọn ngày sinh.';
      return;
    }
    const dob = new Date(this.form.dateOfBirth);
    const now = new Date();
    if (isNaN(dob.getTime())) {
      this.fieldErrors['dateOfBirth'] = 'Ngày sinh không đúng định dạng.';
      return;
    }
    if (dob > now) {
      this.fieldErrors['dateOfBirth'] = 'Ngày sinh không thể ở thời điểm tương lai.';
      return;
    }
    delete this.fieldErrors['dateOfBirth'];
  }

  protected validateHealthInsurance(): void {
    const val = this.form.healthInsurance ? this.form.healthInsurance.trim().toUpperCase() : '';
    if (!val) {
      delete this.fieldErrors['healthInsurance'];
      return;
    }
    const bhytRegex = /^[A-Z]{2}\s?[1-5]\s?\d{2}\s?\d{9,10}$/;
    if (!bhytRegex.test(val)) {
      this.fieldErrors['healthInsurance'] = 'Mã thẻ BHYT phải đúng định dạng 15 ký tự chuẩn Việt Nam (VD: DN4010123456789).';
      return;
    }
    delete this.fieldErrors['healthInsurance'];
  }

  protected saveChanges(): void {
    this.validateFullName();
    this.validateCitizenId();
    this.validateDateOfBirth();
    this.validateHealthInsurance();

    if (Object.keys(this.fieldErrors).length > 0) {
      this.errorMessage = 'Vui lòng kiểm tra lại các trường thông tin sai định dạng bên dưới.';
      this.isSaving = false;
      return;
    }

    if (!this.consentAccepted) {
      this.consentError = true;
      this.errorMessage = 'Vui lòng xác nhận đồng ý xử lý thông tin sức khỏe cá nhân trước khi lưu hồ sơ.';
      return;
    }

    this.isSaving = true;
    this.isSaved = false;
    this.errorMessage = '';
    this.consentError = false;

    const consent_nd13_accepted_at = new Date().toISOString();

    const request: UpdatePhrProfileRequest & { consent_nd13_accepted_at?: string } = {
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
      consent_nd13_accepted_at,
    };

    this.phrService.updateMyPhr(request).subscribe({
      next: (profile) => {
        this.form = { ...profile };
        this.savedForm = { ...profile };
        this.fieldErrors = {};

        // Đồng bộ fullName vào tokenStore nếu cần
        const current = this.tokenStore?.currentUser();
        if (current && profile.fullName) {
          this.tokenStore?.setCurrentUser({
            ...current,
            fullName: profile.fullName,
          });
        }

        this.isSaved = true;
        this.isSaving = false;
      },
      error: (error) => {
        const rawMsg = error?.error?.message;
        if (Array.isArray(rawMsg)) {
          this.errorMessage = rawMsg.join('; ');
          for (const msg of rawMsg) {
            if (typeof msg === 'string') {
              if (msg.includes('CCCD') || msg.includes('citizenId')) {
                this.fieldErrors['citizenId'] = msg;
              } else if (msg.includes('BHYT') || msg.includes('healthInsurance')) {
                this.fieldErrors['healthInsurance'] = msg;
              } else if (msg.includes('dateOfBirth') || msg.includes('ngày sinh')) {
                this.fieldErrors['dateOfBirth'] = msg;
              } else if (msg.includes('fullName') || msg.includes('họ và tên')) {
                this.fieldErrors['fullName'] = msg;
              }
            }
          }
        } else if (typeof rawMsg === 'string') {
          this.errorMessage = rawMsg;
        } else {
          this.errorMessage = 'Không thể cập nhật hồ sơ sức khỏe. Vui lòng thử lại.';
        }

        this.isSaving = false;
      },
    });
  }

  protected cancelChanges(): void {
    this.form = { ...this.savedForm };
    this.fieldErrors = {};
    this.avatarPreview = this.resolveAvatarUrl(this.savedForm.avatarUrl);
    this.selectedAvatarFile = null;
    this.avatarUploadError = '';
    this.avatarUploadSuccess = false;
    this.isSaved = false;
    this.errorMessage = '';
    this.consentAccepted = false;
    this.consentError = false;

    if (this.location && typeof window !== 'undefined' && window.history.length > 1) {
      this.location.back();
    } else if (this.router) {
      void this.router.navigate(['/patient/doctor-search']);
    }
  }

  protected onAvatarFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (!input.files || input.files.length === 0) return;

    const file = input.files[0];
    if (file.size > 10 * 1024 * 1024) {
      this.avatarUploadError = 'Kích thước ảnh không được vượt quá 10MB.';
      return;
    }

    const allowedTypes = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp'];
    if (!allowedTypes.includes(file.type)) {
      this.avatarUploadError = 'Định dạng ảnh không hợp lệ. Chỉ chấp nhận JPG, PNG, WEBP.';
      return;
    }

    this.selectedAvatarFile = file;
    this.avatarUploadError = '';
    this.avatarUploadSuccess = false;

    const reader = new FileReader();
    reader.onload = () => {
      this.avatarPreview = reader.result as string;
    };
    reader.readAsDataURL(file);
  }

  /** Chuyển relative URL từ backend sang absolute URL để <img> có thể load được */
  protected resolveAvatarUrl(url: string | null | undefined): string | null {
    if (!url) return null;
    if (url.startsWith('http://') || url.startsWith('https://') || url.startsWith('data:')) {
      return url;
    }
    // relative path như /uploads/avatars/...
    const base = environment.apiBaseUrl.replace(/\/api\/v1$/, '').replace(/\/api$/, '');
    return `${base}${url.startsWith('/') ? '' : '/'}${url}`;
  }

  protected uploadAvatar(): void {
    if (!this.selectedAvatarFile || !this.http) return;

    this.isUploadingAvatar = true;
    this.avatarUploadError = '';
    this.avatarUploadSuccess = false;

    const formData = new FormData();
    formData.append('file', this.selectedAvatarFile);

    this.http.post<{ avatarUrl: string }>(`${environment.apiBaseUrl}/users/avatar`, formData).subscribe({
      next: (res) => {
        this.form.avatarUrl = res.avatarUrl;
        this.savedForm.avatarUrl = res.avatarUrl;
        // Dùng resolveAvatarUrl để hiển thị đúng ảnh sau khi upload
        this.avatarPreview = this.resolveAvatarUrl(res.avatarUrl);
        this.selectedAvatarFile = null;
        this.isUploadingAvatar = false;
        this.avatarUploadSuccess = true;

        // Đồng bộ avatar vào TokenStore để Header cập nhật ngay tức thì
        const current = this.tokenStore?.currentUser();
        if (current) {
          this.tokenStore?.setCurrentUser({
            ...current,
            avatarUrl: res.avatarUrl,
          });
        }
      },
      error: (err) => {
        this.avatarUploadError = err?.error?.message || 'Không thể tải lên ảnh đại diện.';
        this.isUploadingAvatar = false;
      },
    });
  }

  private loadPhr(): void {
    this.isLoading = true;
    this.errorMessage = '';

    this.phrService.getMyPhr().subscribe({
      next: (profile) => {
        this.form = { ...profile };
        this.savedForm = { ...profile };
        this.avatarPreview = this.resolveAvatarUrl(profile.avatarUrl);

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
      avatarUrl: null,
    };
  }
}
