import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { of } from 'rxjs';
import { CatalogsPage } from './catalogs.page';
import { NotificationService } from '../../../../core/services/notification.service';

describe('CatalogsPage', () => {
  let fixture: ComponentFixture<CatalogsPage>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [CatalogsPage], providers: [provideHttpClient()] }).compileComponents();
    fixture = TestBed.createComponent(CatalogsPage);
    fixture.detectChanges();
  });

  it('starts on the specialty catalog and exposes the Figma catalogue title', () => {
    expect(fixture.componentInstance.selectedType()).toBe('SPECIALTY');
    expect(fixture.nativeElement.textContent).toContain('Quản lý danh mục y tế');
  });

  it('does not render the internal SRS code above the catalog heading', () => {
    expect(fixture.nativeElement.querySelector('.section-code')).toBeNull();
  });

  it('labels the table with the selected catalog type', () => {
    fixture.componentInstance.selectType('SPECIALTY');
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.table-title h2')?.textContent.trim())
      .toBe('Danh sách chuyên khoa');
  });

  it('labels the action column', () => {
    fixture.componentInstance.loading.set(false);
    fixture.componentInstance.error.set(null);
    fixture.detectChanges();
    const headers = Array.from(fixture.nativeElement.querySelectorAll('thead th')) as HTMLElement[];

    expect(headers.at(-1)?.textContent?.trim()).toBe('Hành động');
  });

  it('renders the fields relevant to each selected catalog in the list header', () => {
    const headers = (type: 'SPECIALTY' | 'MEDICINE' | 'SERVICE' | 'ICD10') => {
      fixture.componentInstance.selectType(type);
      fixture.componentInstance.loading.set(false);
      fixture.detectChanges();
      return Array.from(fixture.nativeElement.querySelectorAll('thead th') as NodeListOf<HTMLElement>)
        .map(header => header.textContent?.trim());
    };

    expect(headers('SPECIALTY')).toEqual(['Tên khoa', 'Mô tả', 'Biểu tượng', 'Trưởng khoa phụ trách', 'Trạng thái', 'Hành động']);
    expect(headers('MEDICINE')).toEqual(['Mã thuốc', 'Tên biệt dược', 'Tên hoạt chất', 'Hàm lượng', 'Đơn vị đóng gói', 'Giá tham chiếu', 'Trạng thái', 'Hành động']);
    expect(headers('SERVICE')).toEqual(['Mã dịch vụ', 'Tên dịch vụ', 'Giá niêm yết', 'Thời lượng khám', 'Trạng thái', 'Hành động']);
    expect(headers('ICD10')).toEqual(['Mã ICD-10', 'Tên bệnh / chẩn đoán', 'Nhóm ICD-10', 'Trạng thái', 'Hành động']);
  });

  it('offers CSV and Excel downloads below the catalog table', () => {
    fixture.componentInstance.loading.set(false);
    fixture.componentInstance.error.set(null);
    fixture.detectChanges();
    const actions = fixture.nativeElement.querySelector('.catalog-export-actions') as HTMLElement;

    expect(actions.textContent).toContain('Xuất CSV');
    expect(actions.textContent).toContain('Xuất Excel');
  });

  it('shows page navigation when the catalog has more than one page', () => {
    const component = fixture.componentInstance as any;
    component.page.set(2);
    component.totalPages.set(3);
    fixture.componentInstance.loading.set(false);
    fixture.detectChanges();

    const pagination = fixture.nativeElement.querySelector('.catalog-pagination') as HTMLElement;
    expect(pagination.textContent).toContain('Trang 2 / 3');
    expect(pagination.querySelectorAll('button')).toHaveSize(2);
  });

  it('keeps page navigation visible when every catalog item fits on one page', () => {
    const component = fixture.componentInstance as any;
    component.page.set(1);
    component.totalPages.set(1);
    fixture.componentInstance.loading.set(false);
    fixture.detectChanges();

    const pagination = fixture.nativeElement.querySelector('.catalog-pagination') as HTMLElement;
    expect(pagination.textContent).toContain('Trang 1 / 1');
    expect((pagination.querySelector('button') as HTMLButtonElement).disabled).toBeTrue();
  });

  it('shows every metric supplied by the catalog summary', () => {
    fixture.componentInstance.specialtyCount.set(11);
    fixture.componentInstance.medicineCount.set(7);
    fixture.componentInstance.serviceCount.set(4);
    fixture.componentInstance.icd10Count.set(12);
    fixture.detectChanges();
    const metrics = fixture.nativeElement.querySelectorAll('.metrics article');

    expect(metrics[0].textContent).toContain('11');
    expect(metrics[1].textContent).toContain('7');
    expect(metrics[2].textContent).toContain('4');
    expect(metrics[3].textContent).toContain('12');
  });

  it('announces a successful catalog save and prevents saving while an icon is uploading', () => {
    const notify = TestBed.inject(NotificationService);
    spyOn(notify, 'success');
    spyOn((fixture.componentInstance as any).api, 'create').and.returnValue(of({ id: 'medicine-1' }));

    fixture.componentInstance.openCreate();
    fixture.componentInstance.save();

    expect(notify.success).toHaveBeenCalledWith('Đã thêm danh mục thành công.');

    fixture.componentInstance.openCreate();
    fixture.componentInstance.iconUploading.set(true);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.modal .primary')?.disabled).toBeTrue();
  });

  it('shows fields that match the selected catalog type in the editor', () => {
    const editorText = () => fixture.nativeElement.querySelector('.modal')?.textContent ?? '';

    fixture.componentInstance.selectType('SPECIALTY');
    fixture.componentInstance.openCreate();
    fixture.detectChanges();
    expect(editorText()).toContain('Mô tả');
    expect(editorText()).not.toContain('Hoạt chất');

    fixture.componentInstance.selectType('MEDICINE');
    fixture.componentInstance.openCreate();
    fixture.detectChanges();
    expect(editorText()).toContain('Tên biệt dược');
    expect(editorText()).not.toContain('Thời lượng');

    fixture.componentInstance.selectType('SERVICE');
    fixture.componentInstance.openCreate();
    fixture.detectChanges();
    expect(editorText()).toContain('Giá niêm yết');
    expect(editorText()).not.toContain('Hoạt chất');

    fixture.componentInstance.selectType('ICD10');
    fixture.componentInstance.openCreate();
    fixture.detectChanges();
    expect(editorText()).toContain('Nhóm ICD-10');
    expect(editorText()).not.toContain('Giá niêm yết');
  });

  it('shows an image upload control for a specialty instead of an icon URL field', () => {
    fixture.componentInstance.selectType('SPECIALTY');
    fixture.componentInstance.openCreate();
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('input[type="file"]')).not.toBeNull();
    expect(fixture.nativeElement.querySelector('.modal')?.textContent).not.toContain('Biểu tượng (URL)');
  });

  it('keeps the specialty icon preview inside the upload field', () => {
    fixture.componentInstance.selectType('SPECIALTY');
    fixture.componentInstance.openCreate();
    fixture.componentInstance.editorForm.controls.iconUrl.setValue('/uploads/specialty-icons/cardiology.webp');
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.specialty-icon-field img')?.getAttribute('src'))
      .toBe('/uploads/specialty-icons/cardiology.webp');
    expect(fixture.nativeElement.querySelector('.form-grid > .icon-upload-status')).toBeNull();
  });

  it('opens a read-only detail dialog for a catalog row', () => {
    fixture.componentInstance.selectType('MEDICINE');
    fixture.componentInstance.openDetails({ id: 'medicine-1', code: 'MED-001', brandName: 'Amlodipine 5mg', activeIngredient: 'Amlodipine', isActive: true });
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.detail-modal')?.textContent).toContain('Amlodipine 5mg');
  });

  it('shows the required fields for each catalog type in its detail dialog', () => {
    fixture.componentInstance.selectType('SPECIALTY');
    fixture.componentInstance.openDetails({ id: 'specialty-1', name: 'Tim mạch', description: 'Khám và điều trị bệnh tim', iconUrl: '/uploads/heart.png', headDoctorId: 'doctor-1', isActive: true });
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.detail-modal')?.textContent).toContain('Trưởng khoa phụ trách');
    expect(fixture.nativeElement.querySelector('.detail-modal img')?.getAttribute('src')).toBe('/uploads/heart.png');

    fixture.componentInstance.selectType('MEDICINE');
    fixture.componentInstance.openDetails({ id: 'medicine-1', code: 'MED-001', brandName: 'Amlodipine', activeIngredient: 'Amlodipine besylate', strength: '5mg', packageUnit: 'Hộp 30 viên', contraindications: 'Không dùng khi dị ứng', referencePrice: 24000, isActive: true });
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.detail-modal')?.textContent).toContain('Giá tham chiếu');

    fixture.componentInstance.selectType('SERVICE');
    fixture.componentInstance.openDetails({ id: 'service-1', code: 'SV-001', name: 'Khám tổng quát', listedPrice: 350000, durationMinutes: 30, isActive: true });
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.detail-modal')?.textContent).toContain('Thời lượng khám dự kiến');

    fixture.componentInstance.selectType('ICD10');
    fixture.componentInstance.openDetails({ id: 'icd-1', code: 'I10', name: 'Tăng huyết áp', category: 'Chương IX', isActive: true });
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.detail-modal')?.textContent).toContain('Nhóm ICD-10');
  });

  it('reloads the catalog after the search text stops changing', fakeAsync(() => {
    const load = spyOn(fixture.componentInstance, 'load');

    fixture.componentInstance.filterForm.controls.search.setValue('amlodipine');
    tick(299);
    expect(load).not.toHaveBeenCalled();

    tick(1);
    expect(load).toHaveBeenCalledTimes(1);
  }));
});
