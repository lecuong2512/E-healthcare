import { Component, EventEmitter, Output } from '@angular/core';

/**
 * STUB — khung component quét QR check-in (SRS-REC-01). Triển khai đầy đủ
 * (camera access qua getUserMedia + decode, hoặc input passthrough cho máy
 * quét USB HID hoạt động như bàn phím) thuộc task riêng của phân hệ Receptionist.
 */
@Component({
  selector: 'app-qr-scanner',
  standalone: true,
  template: `<div class="text-sm text-slate-500">[TODO] QR Scanner — SRS-REC-01</div>`,
})
export class QrScannerComponent {
  @Output() scanned = new EventEmitter<string>();
}
