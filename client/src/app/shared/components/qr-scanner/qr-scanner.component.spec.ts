import { ComponentFixture, TestBed } from '@angular/core/testing';

import {
  QR_CODE_READER_FACTORY,
  QrScannerComponent,
} from './qr-scanner.component';

describe('QrScannerComponent', () => {
  let component: QrScannerComponent;
  let fixture: ComponentFixture<QrScannerComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [QrScannerComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(QrScannerComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  afterEach(() => fixture.destroy());

  it('emits a trimmed QR token submitted by a USB scanner', () => {
    const scannedSpy = jasmine.createSpy('scanned');
    component.scanned.subscribe(scannedSpy);
    component.keyboardValue = '  signed-token  ';

    component.submitKeyboardValue();

    expect(scannedSpy).toHaveBeenCalledOnceWith('signed-token');
    expect(component.keyboardValue).toBe('');
    expect(component.errorMessage()).toBeNull();
  });

  it('rejects empty and oversized values', () => {
    const scannedSpy = jasmine.createSpy('scanned');
    component.scanned.subscribe(scannedSpy);

    component.keyboardValue = '   ';
    component.submitKeyboardValue();
    expect(component.errorMessage()).toContain('không được để trống');

    component.keyboardValue = 'x'.repeat(2_049);
    component.submitKeyboardValue();
    expect(component.errorMessage()).toContain('2.048');
    expect(scannedSpy).not.toHaveBeenCalled();
  });

  it('deduplicates the same scanner value within two seconds', () => {
    const scannedSpy = jasmine.createSpy('scanned');
    component.scanned.subscribe(scannedSpy);

    component.keyboardValue = 'same-token';
    component.submitKeyboardValue();
    component.keyboardValue = 'same-token';
    component.submitKeyboardValue();

    expect(scannedSpy).toHaveBeenCalledTimes(1);
  });

  it('stops active scanner controls when destroyed', async () => {
    const stop = jasmine.createSpy('stop');
    const readerFactory = () => ({
      decodeFromConstraints: () =>
        Promise.resolve({
          stop,
          switchTorch: () => Promise.resolve(),
          streamVideoConstraintsApply: () => Promise.resolve(),
          streamVideoConstraintsGet: () => ({}),
          streamVideoSettingsGet: () => ({}),
          streamVideoCapabilitiesGet: () => ({}),
        }),
    });

    fixture.destroy();
    TestBed.resetTestingModule();
    await TestBed.configureTestingModule({
      imports: [QrScannerComponent],
      providers: [
        { provide: QR_CODE_READER_FACTORY, useValue: readerFactory },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(QrScannerComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();

    await component.startCamera();
    fixture.destroy();

    expect(stop).toHaveBeenCalled();
  });
});
