import { ComponentFixture, TestBed } from '@angular/core/testing';
import { PrintReceiptComponent } from './print-receipt.component';
import { APPOINTMENT, CHECK_IN, CLINIC, RECEIPT } from '../../../features/receptionist/testing/reception-print.fixtures';
import { mapCheckinTicketPrintData, mapPaymentReceiptPrintData } from '../../../features/receptionist/utils/reception-print.mapper';
import { PrintReceiptData } from '../../../features/receptionist/models/reception-print.model';
import { mapCheckInResult, mapReceptionAppointment } from '../../../features/receptionist/data-access/receptionist-mappers';

describe('PrintReceiptComponent', () => {
  let fixture: ComponentFixture<PrintReceiptComponent>;
  const appointment = mapReceptionAppointment(APPOINTMENT);
  const ticket = mapCheckinTicketPrintData(mapCheckInResult(appointment, CHECK_IN), CLINIC);
  const payment = mapPaymentReceiptPrintData(RECEIPT, CLINIC, appointment);
  function render(data: PrintReceiptData): HTMLElement {
    fixture.componentRef.setInput('data', data);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }
  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [PrintReceiptComponent] }).compileComponents();
    fixture = TestBed.createComponent(PrintReceiptComponent);
  });
  afterEach(() => fixture.destroy());

  it('renders K80 with Vietnamese patient, schedule, queue and safe QR', () => {
    const host = render(ticket);
    expect(host.querySelector('.receipt--k80')).not.toBeNull();
    for (const value of [APPOINTMENT.patientName, APPOINTMENT.doctorName, APPOINTMENT.specialtyName,
      APPOINTMENT.roomNumber, '22/09/2026', '09:00', '08:45', '150.000', 'Vui lòng đến trước giờ khám 15 phút']) {
      expect(host.textContent).toContain(value);
    }
    expect(host.querySelector('.queue strong')?.textContent).toBe('99');
    expect(host.querySelector('svg path')?.getAttribute('d')?.length).toBeGreaterThan(100);
    expect(host.querySelector('button, input, select')).toBeNull();
  });
  it('renders A5 legal configuration, payment audit fields and signatures', () => {
    const host = render(payment);
    expect(host.querySelector('.receipt--a5')).not.toBeNull();
    for (const value of [RECEIPT.receiptCode, RECEIPT.transactionCode, RECEIPT.collectedBy,
      CLINIC.taxCode!, CLINIC.licenseNumber!, '150.000', '200.000', '50.000', 'Tiền mặt', 'Người nộp tiền']) {
      expect(host.textContent).toContain(value);
    }
    expect(host.querySelector('svg')).toBeNull();
  });
  it('handles missing QR and broken clinic logo without losing clinic name', () => {
    const host = render({ ...ticket, qrValue: undefined, clinic: { ...CLINIC, logoUrl: '/missing-test-logo.png' } });
    expect(host.querySelector('svg')).toBeNull();
    const logo = host.querySelector('img')!;
    logo.dispatchEvent(new Event('error'));
    expect(logo.hidden).toBeTrue();
    expect(host.textContent).toContain(CLINIC.clinicName);
  });
  for (const queueNumber of [1, 99, 999, 1000]) {
    it(`renders queue ${queueNumber} with long Vietnamese names within K80`, () => {
      const host = render({ ...ticket, queueNumber, patientName: 'Nguyễn Thị '.repeat(18),
        specialtyName: 'Chuyên khoa Nội tổng quát '.repeat(10), roomNumber: 'PHONG'.repeat(30) });
      const article = host.querySelector('article')!;
      expect(article.scrollWidth).toBeLessThanOrEqual(Math.ceil(article.getBoundingClientRect().width));
      expect(host.querySelector('.queue strong')?.textContent).toBe(String(queueNumber));
    });
  }
  for (const amount of [0, 150000, 350000, 999999999999]) {
    it(`formats ${amount} VND without dropping zero values`, () => {
      expect(render({ ...ticket, paidAmount: amount }).textContent).toContain(
        new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(amount),
      );
    });
  }
  for (const data of [ticket, payment]) {
    it(`prints only the ${data.type} document with correct paper dimensions`, async () => {
      render(data);
      const printing = fixture.componentInstance.print();
      const frame = document.querySelector<HTMLIFrameElement>('iframe[title="Bản in phiếu"]')!;
      expect(frame).not.toBeNull();
      const print = spyOn(frame.contentWindow!, 'print');
      spyOn(frame.contentWindow!, 'focus');
      await printing;
      expect(print).toHaveBeenCalledTimes(1);
      expect(frame.contentDocument!.body.querySelectorAll('article').length).toBe(1);
      expect(frame.contentDocument!.querySelector('button, input, app-root')).toBeNull();
      expect(frame.contentDocument!.head.textContent).toContain(data.type === 'CHECKIN_TICKET' ? 'size:80mm' : 'size:A5 portrait');
      frame.contentWindow!.dispatchEvent(new Event('afterprint'));
      expect(frame.isConnected).toBeFalse();
    });
  }
  it('removes the print document when destroyed before printing', async () => {
    render(ticket);
    const printing = fixture.componentInstance.print();
    const frame = document.querySelector<HTMLIFrameElement>('iframe[title="Bản in phiếu"]')!;
    const print = spyOn(frame.contentWindow!, 'print');
    fixture.componentInstance.ngOnDestroy();
    await printing;
    expect(print).not.toHaveBeenCalled();
    expect(frame.isConnected).toBeFalse();
  });
});
