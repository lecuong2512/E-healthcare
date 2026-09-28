import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { CatalogsPage } from './catalogs.page';

describe('CatalogsPage', () => {
  let fixture: ComponentFixture<CatalogsPage>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [CatalogsPage], providers: [provideHttpClient()] }).compileComponents();
    fixture = TestBed.createComponent(CatalogsPage);
    fixture.detectChanges();
  });

  it('starts on the medicine catalog and exposes the Figma catalogue title', () => {
    expect(fixture.componentInstance.selectedType()).toBe('MEDICINE');
    expect(fixture.nativeElement.textContent).toContain('Quản lý danh mục y tế');
  });
});
