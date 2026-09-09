import { ComponentFixture, TestBed } from '@angular/core/testing';

import { Receptionist } from './receptionist';

describe('Receptionist', () => {
  let component: Receptionist;
  let fixture: ComponentFixture<Receptionist>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Receptionist],
    }).compileComponents();

    fixture = TestBed.createComponent(Receptionist);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
