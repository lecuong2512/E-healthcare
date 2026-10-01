import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { AdminStaffApiService, ClinicRoomRow, RecurringShiftRow, SpecialtyOption, StaffRow } from '../../data-access/admin-staff-api.service';
import { Role } from '@shared/enums';

interface StaffView {
  id: string; code: string; name: string; email: string; role: string; roleValue: Role;
  phoneNumber: string; gender: string; dateOfBirth: string;
  facility: string; status: string; licenseNumber: string; academicTitle: string;
  yearsExperience: number; roomNumber: string; specialtyIds: string[];
  consultationFee?: number | null;
  avatarUrl?: string | null;
}
interface RoomCatalogView extends ClinicRoomRow {}

@Component({
  selector: 'app-staff-mgmt-page', standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './staff-mgmt.page.html', styleUrl: './staff-mgmt.page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class StaffMgmtPage {
  private readonly api = inject(AdminStaffApiService);
  private readonly formBuilder = inject(FormBuilder);
  readonly Role = Role;
  readonly showForm = signal(false);
  readonly showPassword = signal(false);
  readonly submitting = signal(false);
  readonly savingDetails = signal(false);
  readonly errorMessage = signal('');
  readonly staff = signal<StaffView[]>([]);
  readonly staffSummary = signal({ active: 0, pending: 0, blocked: 0 });
  readonly specialties = signal<SpecialtyOption[]>([]);
  readonly rooms = signal<string[]>([]);
  readonly roomCatalog = signal<RoomCatalogView[]>([]);
  readonly selectedRoom = signal<RoomCatalogView | null>(null);
  readonly editingRoom = signal<RoomCatalogView | null>(null);
  readonly savingRoom = signal(false);
  readonly activeTab = signal<'staff' | 'rooms' | 'shifts'>('staff');
  readonly roomMessage = signal('');
  readonly roomError = signal('');
  readonly recurringShifts = signal<RecurringShiftRow[]>([]);
  readonly selectedShift = signal<RecurringShiftRow | null>(null);
  readonly editingShift = signal<RecurringShiftRow | null>(null);
  readonly savingShift = signal(false);
  readonly searchTerm = signal('');
  readonly roleFilter = signal<Role | ''>('');
  readonly selectedStaff = signal<StaffView | null>(null);
  readonly staffAvatarPreview = signal<string | null>(null);
  readonly uploadingAvatar = signal(false);
  readonly avatarUploadError = signal('');
  readonly avatarUploadSuccess = signal('');
  readonly selectedCreateSpecialtyIds = signal<string[]>([]);
  readonly selectedDetailSpecialtyIds = signal<string[]>([]);
  readonly filteredStaff = computed(() => {
    const keyword = this.searchTerm().trim().toLocaleLowerCase('vi');
    const role = this.roleFilter();
    return this.staff().filter(person => {
      const matchesKeyword = !keyword || [person.code, person.name, person.email]
        .some(value => value.toLocaleLowerCase('vi').includes(keyword));
      return matchesKeyword && (!role || person.roleValue === role);
    });
  });
  readonly pendingShiftCount = computed(() => this.recurringShifts().filter(shift => shift.approvalStatus === 'PENDING').length);
  readonly staffCount = computed(() => this.staff().length);
  readonly roomCount = computed(() => this.roomCatalog().length);
  readonly pageSize = 10;
  readonly staffPage = signal(1);
  readonly roomPage = signal(1);
  readonly shiftPage = signal(1);
  readonly pagedStaff = computed(() => this.pageRows(this.filteredStaff(), this.staffPage()));
  readonly pagedRooms = computed(() => this.pageRows(this.roomCatalog(), this.roomPage()));
  readonly pagedRecurringShifts = computed(() => this.pageRows(this.recurringShifts(), this.shiftPage()));
  readonly staffPageCount = computed(() => this.pageCount(this.filteredStaff().length));
  readonly roomPageCount = computed(() => this.pageCount(this.roomCatalog().length));
  readonly shiftPageCount = computed(() => this.pageCount(this.recurringShifts().length));
  readonly availableRooms = computed<{ roomNumber: string; label: string }[]>(() => {
    if (this.roomCatalog().length > 0) {
      return this.roomCatalog().map(r => ({
        roomNumber: r.roomNumber,
        label: r.roomName ? `${r.roomNumber} — ${r.roomName}` : r.roomNumber,
      }));
    }
    return this.rooms().map(r => ({ roomNumber: r, label: r }));
  });

  readonly staffForm = this.formBuilder.nonNullable.group({
    fullName: ['', [Validators.required, Validators.maxLength(100)]],
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required, Validators.minLength(8)]],
    phoneNumber: [''], role: ['ROLE_DOCTOR'], gender: ['MALE'], dateOfBirth: ['', Validators.required],
    specialtyId: [''],
    licenseNumber: ['', [Validators.pattern(/^[A-Za-z0-9][A-Za-z0-9./-]{4,49}$/)]],
    roomNumber: [''], academicTitle: [''],
    yearsExperience: [0, [Validators.min(0)]],
    consultationFee: [200000, [Validators.min(0)]],
  });
  readonly detailForm = this.formBuilder.nonNullable.group({
    fullName: ['', [Validators.required, Validators.maxLength(100)]],
    phoneNumber: [''], gender: ['MALE'], dateOfBirth: ['', Validators.required],
    licenseNumber: ['', [Validators.pattern(/^[A-Za-z0-9][A-Za-z0-9./-]{4,49}$/)]],
    roomNumber: [''], academicTitle: [''],
    yearsExperience: [0, [Validators.min(0)]],
    consultationFee: [200000, [Validators.min(0)]],
  });
  readonly roomForm = this.formBuilder.nonNullable.group({ roomNumber: ['', Validators.required], roomName: [''], specialtyId: [''], roomType: ['CONSULTATION'], location: [''], notes: [''] });
  readonly roomEditForm = this.formBuilder.nonNullable.group({ roomName: [''], specialtyId: [''], roomType: ['CONSULTATION'], location: [''], notes: [''], isActive: [true] });
  readonly shiftForm = this.formBuilder.nonNullable.group({ userId: ['', Validators.required], roomId: ['', Validators.required], shiftDate: ['', Validators.required], startTime: ['08:00', Validators.required], endTime: ['12:00', Validators.required], notes: [''] });
  readonly shiftEditForm = this.formBuilder.nonNullable.group({ roomId: ['', Validators.required], shiftDate: ['', Validators.required], startTime: ['', Validators.required], endTime: ['', Validators.required], notes: [''], approvalStatus: ['PENDING' as 'PENDING' | 'APPROVED' | 'LOCKED'] });

  ngOnInit(): void {
    this.loadStaff();
    this.loadSpecialties();
    this.loadRooms();
    this.loadRoomCatalog();
    this.loadRecurringShifts();
  }

  onSearch(event: Event): void { this.searchTerm.set((event.target as HTMLInputElement).value); this.staffPage.set(1); }
  onRoleFilter(event: Event): void { this.roleFilter.set((event.target as HTMLSelectElement).value as Role | ''); this.staffPage.set(1); }
  changePage(type: 'staff' | 'room' | 'shift', page: number): void {
    const maxPage = type === 'staff' ? this.staffPageCount() : type === 'room' ? this.roomPageCount() : this.shiftPageCount();
    const target = Math.min(Math.max(page, 1), maxPage);
    if (type === 'staff') this.staffPage.set(target);
    else if (type === 'room') this.roomPage.set(target);
    else this.shiftPage.set(target);
  }
  openForm(): void { this.errorMessage.set(''); this.showPassword.set(false); this.selectedCreateSpecialtyIds.set([]); this.showForm.set(true); }

  toggleCreateSpecialty(id: string, checked: boolean): void {
    this.selectedCreateSpecialtyIds.update(values => checked ? [...values, id] : values.filter(value => value !== id));
  }

  onRoomSelected(roomNumber: string): void {
    if (!roomNumber) return;
    const room = this.roomCatalog().find(r => r.roomNumber === roomNumber);
    if (room?.specialtyId && !this.selectedCreateSpecialtyIds().includes(room.specialtyId)) {
      this.selectedCreateSpecialtyIds.update(ids => [...ids, room.specialtyId!]);
    }
  }

  getDoctorInRoom(roomNumber: string): string {
    const doctor = this.staff().find(s => s.roomNumber === roomNumber);
    return doctor ? doctor.name : '';
  }

  createStaff(): void {
    if (this.staffForm.invalid) {
      this.staffForm.markAllAsTouched();
      if (this.staffForm.controls.licenseNumber.invalid) {
        this.errorMessage.set('Số CCHN không đúng định dạng: chỉ gồm chữ, số, dấu chấm, gạch chéo hoặc gạch ngang (tối thiểu 5 ký tự).');
      } else {
        this.errorMessage.set('Vui lòng kiểm tra lại các trường thông tin bắt buộc (chữ đỏ).');
      }
      return;
    }
    const value = this.staffForm.getRawValue();
    if (value.phoneNumber?.trim() && !/^0[35789]\d{8}$/.test(value.phoneNumber.trim())) {
      this.errorMessage.set('Số điện thoại phải đúng định dạng 10 số di động Việt Nam (bắt đầu bằng 03, 05, 07, 08, 09).');
      return;
    }
    const typedIds = value.specialtyId.split(',').map(item => item.trim()).filter(Boolean);
    const specialtyIds = this.selectedCreateSpecialtyIds().length ? this.selectedCreateSpecialtyIds() : typedIds;
    if (value.role === Role.DOCTOR && (!specialtyIds.length || !value.licenseNumber || !value.roomNumber || value.yearsExperience == null)) {
      this.errorMessage.set('Bác sĩ cần chuyên khoa, CCHN, kinh nghiệm và phòng khám.'); return;
    }
    const consultationFee = value.role === Role.DOCTOR ? (Number(value.consultationFee) >= 0 ? Number(value.consultationFee) : 200000) : undefined;
    this.submitting.set(true); this.errorMessage.set('');
    this.api.create({ ...value, specialtyIds, consultationFee }).subscribe({
      next: () => {
        this.submitting.set(false); this.showForm.set(false); this.selectedCreateSpecialtyIds.set([]);
        this.staffForm.reset({ role: Role.DOCTOR, gender: 'MALE', fullName: '', email: '', phoneNumber: '', password: '', dateOfBirth: '', specialtyId: '', licenseNumber: '', roomNumber: '', academicTitle: '', yearsExperience: 0, consultationFee: 200000 });
        this.loadStaff();
        this.loadRooms();
        this.loadRoomCatalog();
      },
      error: (err) => {
        this.submitting.set(false);
        const msg = err?.error?.message;
        this.errorMessage.set(Array.isArray(msg) ? msg.join(', ') : (msg || 'Không thể tạo tài khoản. Vui lòng kiểm tra lại thông tin.'));
      },
    });
  }

  openDetails(person: StaffView): void {
    this.selectedStaff.set(person);
    this.staffAvatarPreview.set(person.avatarUrl || null);
    this.avatarUploadError.set('');
    this.avatarUploadSuccess.set('');
    this.selectedDetailSpecialtyIds.set([...person.specialtyIds]);
    this.detailForm.reset({ fullName: person.name, phoneNumber: person.phoneNumber, gender: person.gender, dateOfBirth: person.dateOfBirth, licenseNumber: person.licenseNumber, roomNumber: person.roomNumber, academicTitle: person.academicTitle, yearsExperience: person.yearsExperience, consultationFee: person.consultationFee ?? 200000 });
    this.errorMessage.set('');
  }

  onAvatarSelected(event: Event): void {
    const person = this.selectedStaff();
    if (!person) return;
    const input = event.target as HTMLInputElement;
    if (!input.files || input.files.length === 0) return;
    const file = input.files[0];
    if (file.size > 10 * 1024 * 1024) {
      this.avatarUploadError.set('Ảnh vượt quá dung lượng 10MB.');
      return;
    }
    const allowedTypes = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp'];
    if (!allowedTypes.includes(file.type)) {
      this.avatarUploadError.set('Chỉ chấp nhận file ảnh JPG, PNG, WEBP.');
      return;
    }
    this.uploadingAvatar.set(true);
    this.avatarUploadError.set('');
    this.avatarUploadSuccess.set('');
    this.api.uploadAvatar(person.id, file).subscribe({
      next: (res) => {
        this.uploadingAvatar.set(false);
        this.staffAvatarPreview.set(res.avatarUrl);
        this.avatarUploadSuccess.set('Tải lên ảnh đại diện thành công.');
        this.loadStaff();
      },
      error: (err) => {
        this.uploadingAvatar.set(false);
        this.avatarUploadError.set(err?.error?.message || 'Không thể tải lên ảnh đại diện.');
      },
    });
  }

  toggleDetailSpecialty(id: string, checked: boolean): void {
    this.selectedDetailSpecialtyIds.update(values => checked ? [...values, id] : values.filter(value => value !== id));
  }

  saveDetails(): void {
    const person = this.selectedStaff();
    if (!person || this.detailForm.invalid) {
      this.detailForm.markAllAsTouched();
      if (this.detailForm.controls.licenseNumber.invalid) {
        this.errorMessage.set('Số CCHN không đúng định dạng (tối thiểu 5 ký tự).');
      }
      return;
    }
    const rawDetails = this.detailForm.getRawValue();
    if (rawDetails.phoneNumber?.trim() && !/^0[35789]\d{8}$/.test(rawDetails.phoneNumber.trim())) {
      this.errorMessage.set('Số điện thoại phải đúng định dạng 10 số di động Việt Nam (bắt đầu bằng 03, 05, 07, 08, 09).');
      return;
    }
    const specialtyIds = this.selectedDetailSpecialtyIds();
    if (person.roleValue === Role.DOCTOR && !specialtyIds.length) {
      this.errorMessage.set('Bác sĩ phải thuộc ít nhất một chuyên khoa.'); return;
    }
    const consultationFee = person.roleValue === Role.DOCTOR ? (Number(rawDetails.consultationFee) >= 0 ? Number(rawDetails.consultationFee) : 200000) : undefined;
    this.savingDetails.set(true); this.errorMessage.set('');
    this.api.updateProfile(person.id, { ...rawDetails, specialtyIds, consultationFee }).subscribe({
      next: () => { this.savingDetails.set(false); this.selectedStaff.set(null); this.loadStaff(); this.loadRooms(); this.loadRoomCatalog(); },
      error: (err) => {
        this.savingDetails.set(false);
        const msg = err?.error?.message;
        this.errorMessage.set(Array.isArray(msg) ? msg.join(', ') : (msg || 'Không thể lưu hồ sơ nhân sự.'));
      },
    });
  }

  changeStatus(person: StaffView, status: 'ACTIVE' | 'BLOCKED' | 'SUSPENDED'): void {
    this.api.changeStatus(person.id, status).subscribe({ next: () => this.loadStaff() });
  }
  lockRoom(room: RoomCatalogView): void { this.api.updateRoom(room.id, { isActive: !room.isActive }).subscribe({ next: () => this.loadRoomCatalog() }); }
  createShift(): void {
    if (this.shiftForm.invalid) { this.shiftForm.markAllAsTouched(); return; }
    this.api.createShiftAssignment(this.shiftForm.getRawValue()).subscribe({ next: () => { this.shiftForm.reset({ userId: '', roomId: '', shiftDate: '', startTime: '08:00', endTime: '12:00', notes: '' }); this.loadRecurringShifts(); } });
  }
  openShiftEdit(shift: RecurringShiftRow): void {
    const room = this.roomCatalog().find(item => item.roomNumber === shift.roomNumber);
    this.editingShift.set(shift);
    this.shiftEditForm.reset({ roomId: room?.id ?? '', shiftDate: shift.shiftDate, startTime: shift.startTime, endTime: shift.endTime, notes: shift.notes ?? '', approvalStatus: shift.approvalStatus });
  }
  saveShift(): void {
    const shift = this.editingShift();
    if (!shift || this.shiftEditForm.invalid) return;
    this.savingShift.set(true);
    this.api.updateShiftAssignment(shift.id, this.shiftEditForm.getRawValue()).subscribe({ next: () => { this.savingShift.set(false); this.editingShift.set(null); this.loadRecurringShifts(); }, error: () => this.savingShift.set(false) });
  }
  lockShift(shift: RecurringShiftRow): void { this.api.updateShiftAssignment(shift.id, { approvalStatus: shift.approvalStatus === 'LOCKED' ? 'PENDING' : 'LOCKED' }).subscribe({ next: () => this.loadRecurringShifts() }); }

  private loadStaff(): void {
    this.api.list().subscribe({
      next: result => {
        this.staff.set(result.data.map((person, index) => this.toView(person, index)));
        this.staffSummary.set(result.summary);
        this.staffPage.set(1);
      },
      error: () => {
        this.staff.set([]);
        this.staffSummary.set({ active: 0, pending: 0, blocked: 0 });
      },
    });
  }
  private loadSpecialties(): void { this.api.listSpecialties().subscribe({ next: values => this.specialties.set(values), error: () => this.specialties.set([]) }); }
  private loadRooms(): void {
    this.api.listRooms?.().subscribe({ next: values => this.rooms.set(values), error: () => this.rooms.set([]) });
  }
  createRoom(): void {
    if (this.roomForm.invalid) { this.roomForm.markAllAsTouched(); this.roomError.set('Nhập mã phòng/buồng trước khi lưu.'); return; }
    this.roomMessage.set(''); this.roomError.set('');
    this.api.createRoom(this.roomForm.getRawValue()).subscribe({
      next: () => { this.roomForm.reset({ roomNumber: '', roomName: '', specialtyId: '', roomType: 'CONSULTATION', location: '', notes: '' }); this.roomMessage.set('Đã thêm phòng/buồng.'); this.loadRooms(); this.loadRoomCatalog(); },
      error: error => this.roomError.set(error?.error?.message || 'Không thể thêm phòng/buồng.'),
    });
  }
  openRoomDetails(room: RoomCatalogView): void { this.selectedRoom.set(room); }
  openRoomEdit(room: RoomCatalogView): void {
    this.editingRoom.set(room);
    this.roomEditForm.reset({ roomName: room.roomName ?? '', specialtyId: room.specialtyId ?? '', roomType: room.roomType ?? 'CONSULTATION', location: room.location ?? '', notes: room.notes ?? '', isActive: room.isActive });
    this.roomError.set('');
  }
  saveRoom(): void {
    const room = this.editingRoom();
    if (!room) return;
    this.savingRoom.set(true); this.roomError.set('');
    this.api.updateRoom(room.id, this.roomEditForm.getRawValue()).subscribe({
      next: () => { this.savingRoom.set(false); this.editingRoom.set(null); this.roomMessage.set('Đã cập nhật phòng/buồng.'); this.loadRooms(); this.loadRoomCatalog(); },
      error: error => { this.savingRoom.set(false); this.roomError.set(error?.error?.message || 'Không thể cập nhật phòng/buồng.'); },
    });
  }
  private loadRoomCatalog(): void { this.api.listRoomCatalog?.().subscribe({ next: values => { this.roomCatalog.set(values); this.roomPage.set(1); }, error: () => this.roomCatalog.set([]) }); }
  private loadRecurringShifts(): void { this.api.listRecurringShifts().subscribe({ next: shifts => { this.recurringShifts.set(shifts); this.shiftPage.set(1); }, error: () => this.recurringShifts.set([]) }); }
  private pageRows<T>(rows: T[], page: number): T[] { return rows.slice((page - 1) * this.pageSize, page * this.pageSize); }
  private pageCount(total: number): number { return Math.max(1, Math.ceil(total / this.pageSize)); }
  specialtyName(id: string | null): string { return this.specialties().find(item => item.id === id)?.name ?? '—'; }

  private toView(person: StaffRow, index: number): StaffView {
    return {
      id: person.id,
      code: person.code || `NV-${String(index + 1).padStart(5, '0')}`,
      name: person.fullName, email: person.email ?? '', phoneNumber: person.phoneNumber ?? '',
      gender: person.gender ?? 'MALE', dateOfBirth: person.dateOfBirth ?? '', role: this.roleLabel(person.role), roleValue: person.role,
      facility: person.roomNumber || 'Trung tâm',
      status: person.status === 'ACTIVE' ? 'Hoạt động' : person.status === 'BLOCKED' ? 'Đã khóa' : person.status === 'SUSPENDED' ? 'Tạm ngưng' : 'Chờ kích hoạt',
      licenseNumber: person.licenseNumber ?? '', academicTitle: person.academicTitle ?? '',
      yearsExperience: person.yearsExperience ?? 0, roomNumber: person.roomNumber ?? '',
      consultationFee: person.consultationFee ?? null,
      specialtyIds: person.specialtyIds ?? [],
      avatarUrl: person.avatarUrl ?? null,
    };
  }
  private roleLabel(role: Role): string {
    return { [Role.DOCTOR]: 'Bác sĩ', [Role.RECEPTIONIST]: 'Lễ tân', [Role.ADMIN]: 'Quản trị viên', [Role.PATIENT]: 'Bệnh nhân' }[role];
  }
}
