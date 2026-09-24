import { DOCUMENT } from '@angular/common';
import { Component, ElementRef, OnDestroy, computed, inject, input } from '@angular/core';
import { create } from 'qrcode';
import { PrintReceiptData } from '../../../features/receptionist/models/reception-print.model';

@Component({
  selector: 'app-print-receipt',
  standalone: true,
  templateUrl: './print-receipt.component.html',
  styleUrl: './print-receipt.component.scss',
})
export class PrintReceiptComponent implements OnDestroy {
  readonly data = input.required<PrintReceiptData>();
  private readonly document = inject(DOCUMENT);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private printFrame?: HTMLIFrameElement;
  private printing = false;
  private cancelPrintWait?: () => void;

  readonly qr = computed(() => {
    const data = this.data();
    if (data.type !== 'CHECKIN_TICKET' || !data.qrValue) return null;
    const { modules } = create(data.qrValue, { errorCorrectionLevel: 'M' });
    const paths: string[] = [];
    for (let row = 0; row < modules.size; row++) {
      for (let col = 0; col < modules.size; col++) {
        if (modules.get(row, col)) paths.push(`M${col + 4},${row + 4}h1v1h-1z`);
      }
    }
    return { path: paths.join(''), size: modules.size + 8 };
  });

  money(amount: number): string {
    return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(amount);
  }

  date(value: string): string {
    const [year, month, day] = value.slice(0, 10).split('-');
    return `${day}/${month}/${year}`;
  }

  timestamp(value: string): string {
    return new Intl.DateTimeFormat('vi-VN', {
      timeZone: 'Asia/Ho_Chi_Minh', dateStyle: 'short', timeStyle: 'short',
    }).format(new Date(value));
  }

  hideBrokenLogo(event: Event): void {
    (event.target as HTMLImageElement).hidden = true;
  }

  /** An isolated document avoids printing the app shell or hidden layout whitespace. */
  async print(): Promise<void> {
    if (this.printing) return;
    const article = this.host.nativeElement.querySelector('article');
    if (!article) throw new Error('Chưa có dữ liệu phiếu để in.');
    const receiptType = this.data().type;
    let resourceTimeout: ReturnType<typeof setTimeout> | undefined;
    this.printing = true;
    this.printFrame?.remove();
    const frame = this.document.createElement('iframe');
    this.printFrame = frame;
    frame.title = 'Bản in phiếu';
    frame.setAttribute('aria-hidden', 'true');
    frame.style.cssText = 'position:fixed;width:800px;height:0;border:0;bottom:0;left:0;';
    this.document.body.appendChild(frame);
    try {
      const doc = frame.contentDocument;
      const win = frame.contentWindow;
      if (!doc || !win) throw new Error('Trình duyệt không mở được cửa sổ in.');
      const base = doc.createElement('base');
      base.href = this.document.baseURI;
      doc.head.appendChild(base);
      doc.documentElement.lang = 'vi';
      doc.title = receiptType === 'CHECKIN_TICKET' ? 'Phiếu tiếp đón' : 'Phiếu thu viện phí';
      const loads: Promise<unknown>[] = [];
      this.document.querySelectorAll('style, link[rel="stylesheet"]').forEach((style) => {
        const copy = style.cloneNode(true) as HTMLElement;
        if (copy.tagName === 'LINK') {
          loads.push(new Promise<void>((resolve, reject) => {
            copy.onload = () => resolve();
            copy.onerror = () => reject(new Error('Không tải được định dạng phiếu in.'));
          }));
        }
        doc.head.appendChild(copy);
      });
      const copy = article.cloneNode(true) as HTMLElement;
      doc.body.appendChild(copy);
      const pageStyle = doc.createElement('style');
      pageStyle.textContent = 'html,body { margin:0!important; padding:0!important; background:white!important; }';
      doc.head.appendChild(pageStyle);
      for (const img of Array.from(copy.querySelectorAll('img'))) {
        loads.push(img.decode().catch(() => { img.hidden = true; }));
      }
      // External stylesheet links must finish before checking or loading fonts.
      // fonts.ready by itself can resolve early while a cloned link is pending.
      await Promise.race([
        Promise.all(loads).then(async () => {
          const sample = 'Tiếng Việt: Nguyễn Thị Ánh — Số thứ tự khám';
          const [regular, bold] = await Promise.all([
            doc.fonts.load('400 11px "Noto Sans"', sample),
            doc.fonts.load('700 11px "Noto Sans"', sample),
          ]);
          if (!regular.length || !bold.length ||
            [...regular, ...bold].some((font) => font.status !== 'loaded')) {
            throw new Error('Chưa tải được font tiếng Việt cho phiếu in.');
          }
          await doc.fonts.ready;
        }),
        new Promise<void>((resolve) => { this.cancelPrintWait = resolve; }),
        new Promise<void>((_, reject) => {
          resourceTimeout = setTimeout(() => reject(new Error('Hết thời gian chuẩn bị bản in.')), 5000);
        }),
      ]);
      // Do not print if this component was destroyed while resources were loading.
      if (!frame.isConnected) return;
      const isTicket = receiptType === 'CHECKIN_TICKET';
      const heightMm = Math.ceil(copy.getBoundingClientRect().height * 25.4 / 96) + 8;
      pageStyle.textContent += isTicket
        ? `@page { size:80mm ${Math.max(heightMm, 80)}mm; margin:4mm; }`
        : '@page { size:A5 portrait; margin:10mm 12mm; }';
      win.addEventListener('afterprint', () => frame.remove(), { once: true });
      win.focus();
      win.print();
    } catch (error) {
      frame.remove();
      throw error;
    } finally {
      clearTimeout(resourceTimeout);
      this.cancelPrintWait = undefined;
      this.printing = false;
    }
  }

  ngOnDestroy(): void {
    this.printFrame?.remove();
    this.cancelPrintWait?.();
  }
}
