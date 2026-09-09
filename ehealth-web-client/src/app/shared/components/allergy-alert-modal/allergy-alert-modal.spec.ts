import { ComponentFixture, TestBed } from '@angular/core/testing';

import { AllergyAlertModal } from './allergy-alert-modal';

describe('AllergyAlertModal', () => {
  let component: AllergyAlertModal;
  let fixture: ComponentFixture<AllergyAlertModal>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AllergyAlertModal],
    }).compileComponents();

    fixture = TestBed.createComponent(AllergyAlertModal);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
