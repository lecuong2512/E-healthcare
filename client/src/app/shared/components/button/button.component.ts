import {
  AfterViewInit,
  Component,
  ElementRef,
  EventEmitter,
  Input,
  Output,
  inject,
} from '@angular/core';
import { NgClass } from '@angular/common';
import { environment } from '../../../../environments/environment';

export type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost';
export type ButtonSize = 'md' | 'lg';

/**
 * NFR-UX-02: kích thước nút bấm tối thiểu 44x44px trên giao diện cảm ứng mobile
 * (WCAG 2.1 AA - target size). Class `min-h-11 min-w-11` (Tailwind: 11 * 4px = 44px)
 * áp dụng mặc định; ở size="md" trên desktop có thể nhỏ hơn về mặt visual padding
 * nhưng vùng chạm (hit-area) không bao giờ dưới 44x44 nhờ padding + min-h/min-w.
 *
 * FIX theo review comment của team (2026-09):
 * 1. Output đổi tên onClick -> clicked. Lý do: "onClick" vi phạm Angular Style
 *    Guide (không prefix Output bằng "on")
 * 2. WCAG 4.1.3 (Status Messages): thêm aria-busy + vùng sr-only aria-live để
 *    screen reader thông báo khi chuyển sang trạng thái loading.
 * 3. WCAG 4.1.2 (Name, Role, Value): thêm Input `ariaLabel` bắt buộc dùng khi
 *    nút chỉ chứa icon (icon-only).
 */
@Component({
  selector: 'app-button',
  standalone: true,
  imports: [NgClass],
  template: `
    <button
      [type]="type"
      [disabled]="disabled || loading"
      [ngClass]="classes"
      [attr.aria-busy]="loading ? 'true' : null"
      [attr.aria-label]="ariaLabel || null"
      class="inline-flex items-center justify-center gap-2 min-h-11 min-w-11
             rounded-lg font-medium transition-colors duration-150
             focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2
             disabled:opacity-50 disabled:cursor-not-allowed
             px-4 py-2.5 text-sm sm:text-base"
      (click)="clicked.emit($event)"
    >
      @if (loading) {
        <span class="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" aria-hidden="true"></span>
        <span class="sr-only" aria-live="polite">{{ loadingText }}</span>
      }
      <ng-content></ng-content>
    </button>
  `,
})
export class ButtonComponent {
  @Input() variant: ButtonVariant = 'primary';
  @Input() size: ButtonSize = 'md';
  @Input() type: 'button' | 'submit' | 'reset' = 'button';
  @Input() disabled = false;
  @Input() loading = false;
  @Input() loadingText = 'Đang xử lý...';
  @Input() ariaLabel?: string;

  @Output() clicked = new EventEmitter<MouseEvent>();

  private readonly elementRef = inject(ElementRef<HTMLElement>);

  get classes(): Record<string, boolean> {
    return {
      'bg-sky-600 text-white hover:bg-sky-700 focus-visible:ring-sky-500': this.variant === 'primary',
      'bg-slate-100 text-slate-900 hover:bg-slate-200 focus-visible:ring-slate-400':
        this.variant === 'secondary',
      'bg-red-600 text-white hover:bg-red-700 focus-visible:ring-red-500': this.variant === 'danger',
      'bg-transparent text-sky-600 hover:bg-sky-50 focus-visible:ring-sky-500': this.variant === 'ghost',
      'text-base px-5 py-3 min-h-12': this.size === 'lg',
    };
  }
}