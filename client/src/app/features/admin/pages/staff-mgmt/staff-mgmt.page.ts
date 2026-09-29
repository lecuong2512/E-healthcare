import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { AdminStaffApiService, RecurringShiftRow, StaffRow } from '../../data-access/admin-staff-api.service';

interface StaffView { id: string; code: string; name: string; role: string; facility: string; status: string; }

@Component({ selector: 'app-staff-mgmt-page', standalone: true, imports: [CommonModule, ReactiveFormsModule], templateUrl: './staff-mgmt.page.html', styleUrl: './staff-mgmt.page.scss', changeDetection: ChangeDetectionStrategy.OnPush })
export class StaffMgmtPage {
  private readonly api = inject(AdminStaffApiService);
  private readonly formBuilder = inject(FormBuilder);
  readonly showForm = signal(false);
  readonly submitting = signal(false);
  readonly errorMessage = signal('');
  readonly staff = signal<StaffView[]>([]);
  readonly recurringShifts = signal<RecurringShiftRow[]>([]);
  readonly staffForm = this.formBuilder.nonNullable.group({
    fullName: ['', [Validators.required, Validators.maxLength(100)]], email: ['', [Validators.required, Validators.email]], password: ['', [Validators.required, Validators.minLength(8)]], role: ['ROLE_DOCTOR'], gender: ['MALE'], dateOfBirth: ['', Validators.required], specialtyId: [''], licenseNumber: [''], roomNumber: [''], academicTitle: [''], yearsExperience: [0, [Validators.min(0)]],
  });

  ngOnInit(): void { this.loadStaff(); this.loadRecurringShifts(); }
  openForm(): void { this.errorMessage.set(''); this.showForm.set(true); }
  createStaff(): void {
    if (this.staffForm.invalid) { this.staffForm.markAllAsTouched(); return; }
    const value = this.staffForm.getRawValue();
    const specialtyIds = value.specialtyId.split(',').map(item => item.trim()).filter(Boolean);
    if (value.role === 'ROLE_DOCTOR' && (!specialtyIds.length || !value.licenseNumber || !value.roomNumber || value.yearsExperience == null)) { this.errorMessage.set('Bác sĩ cần chuyên khoa, CCHN, kinh nghiệm và phòng khám.'); return; }
    this.submitting.set(true); this.errorMessage.set('');
    this.api.create({ ...value, specialtyIds }).subscribe({
      next: () => { this.submitting.set(false); this.showForm.set(false); this.staffForm.reset({ role: 'ROLE_DOCTOR', gender: 'MALE', fullName: '', email: '', password: '', dateOfBirth: '', specialtyId: '', licenseNumber: '', roomNumber: '', academicTitle: '', yearsExperience: 0 }); this.loadStaff(); },
      error: () => { this.submitting.set(false); this.errorMessage.set('Không thể tạo tài khoản. Vui lòng kiểm tra lại thông tin.'); },
    });
  }
  changeStatus(person: StaffView, status: 'ACTIVE' | 'BLOCKED' | 'SUSPENDED'): void { this.api.changeStatus(person.id, status).subscribe({ next: () => this.loadStaff() }); }
  approveRecurringShift(shift: RecurringShiftRow): void { this.api.approveRecurringShift(shift.id).subscribe({ next: () => this.loadRecurringShifts() }); }
  private loadStaff(): void { this.api.list().subscribe({ next: result => this.staff.set(result.data.map((person, index) => this.toView(person, index))), error: () => this.staff.set([]) }); }
  private loadRecurringShifts(): void { this.api.listRecurringShifts().subscribe({ next: shifts => this.recurringShifts.set(shifts), error: () => this.recurringShifts.set([]) }); }
  private toView(person: StaffRow, index: number): StaffView { return { id: person.id, code: `NV-${String(index + 1).padStart(5, '0')}`, name: person.fullName, role: person.email ? 'Nhân sự y tế' : 'Nhân sự', facility: 'Trung tâm', status: person.status === 'ACTIVE' ? 'Hoạt động' : person.status === 'BLOCKED' ? 'Đã khóa' : person.status === 'SUSPENDED' ? 'Tạm ngưng' : 'Chờ kích hoạt' }; }
}
