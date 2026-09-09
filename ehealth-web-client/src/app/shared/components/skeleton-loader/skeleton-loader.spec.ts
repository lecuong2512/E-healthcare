import { ComponentFixture, TestBed } from '@angular/core/testing';

import { SkeletonLoader } from './skeleton-loader';

describe('SkeletonLoader', () => {
  let component: SkeletonLoader;
  let fixture: ComponentFixture<SkeletonLoader>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [SkeletonLoader],
    }).compileComponents();

    fixture = TestBed.createComponent(SkeletonLoader);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
