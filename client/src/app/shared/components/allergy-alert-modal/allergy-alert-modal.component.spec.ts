import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FormsModule } from '@angular/forms';
import { AllergyAlertModalComponent } from './allergy-alert-modal.component';

describe('AllergyAlertModalComponent (SRS-DOC-04)', () => {
  let component: AllergyAlertModalComponent;
  let fixture: ComponentFixture<AllergyAlertModalComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AllergyAlertModalComponent, FormsModule],
    }).compileComponents();

    fixture = TestBed.createComponent(AllergyAlertModalComponent);
    component = fixture.componentInstance;
    component.drugName = 'Amoxicillin 500mg';
    component.allergyGroup = 'Penicillin';
    fixture.detectChanges();
  });

  it('TC-UI-ALLERGY-01: should create component with default or input props', () => {
    expect(component).toBeTruthy();
    expect(component.drugName).toBe('Amoxicillin 500mg');
    expect(component.allergyGroup).toBe('Penicillin');
  });

  it('TC-UI-ALLERGY-02: should render red warning title and matched drug/allergy in template', () => {
    const el = fixture.nativeElement as HTMLElement;
    const title = el.querySelector('#allergy-modal-title');
    expect(title?.textContent).toContain('CẢNH BÁO AN TOÀN Y TẾ');

    const bodyText = el.textContent || '';
    expect(bodyText).toContain('Penicillin');
    expect(bodyText).toContain('Amoxicillin 500mg');
  });

  it('TC-UI-ALLERGY-03: should emit cancel when clicking cancel button', () => {
    spyOn(component.cancel, 'emit');

    const cancelButton = fixture.nativeElement.querySelector('button[class*="bg-slate-700"]') as HTMLButtonElement;
    expect(cancelButton).toBeTruthy();
    cancelButton.click();

    expect(component.cancel.emit).toHaveBeenCalled();
  });

  it('TC-UI-ALLERGY-04: should emit cancel when clicking close (X) button', () => {
    spyOn(component.cancel, 'emit');

    const closeButton = fixture.nativeElement.querySelector('button[aria-label="Đóng"]') as HTMLButtonElement;
    expect(closeButton).toBeTruthy();
    closeButton.click();

    expect(component.cancel.emit).toHaveBeenCalled();
  });

  it('TC-UI-ALLERGY-05: should emit override with entered reason when confirmed', () => {
    spyOn(component.override, 'emit');

    component.overrideReason = 'Bệnh nhân cần dùng kháng sinh mạnh theo kháng sinh đồ';
    fixture.detectChanges();

    const overrideButton = fixture.nativeElement.querySelector('button[class*="bg-red-600"]') as HTMLButtonElement;
    expect(overrideButton).toBeTruthy();
    overrideButton.click();

    expect(component.override.emit).toHaveBeenCalledWith(
      'Bệnh nhân cần dùng kháng sinh mạnh theo kháng sinh đồ',
    );
  });

  it('TC-UI-ALLERGY-06: should fallback to default clinical reason if overrideReason is empty', () => {
    spyOn(component.override, 'emit');

    component.overrideReason = '';
    component.onConfirmOverride();

    expect(component.override.emit).toHaveBeenCalledWith(
      'Bác sĩ xác nhận chỉ định sau hội chẩn lâm sàng',
    );
  });
});
