import { Component, EventEmitter, Input, Output } from '@angular/core';
import { NgClass } from '@angular/common';

export type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost';
export type ButtonSize = 'md' | 'lg';

/**
 * NFR-UX-02: kích thước nút bấm tối thiểu 44x44px trên giao diện cảm ứng mobile
 * (WCAG 2.1 AA - target size). Class `min-h-11 min-w-11` (Tailwind: 11 * 4px = 44px)
 * ở size="md" trên desktop có thể nhỏ hơn về mặt visual padding
 * nhưng vùng chạm (hit-area) không bao giờ dưới 44x44 nhờ padding + min-h/min-w.
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
      class="inline-flex items-center justify-center gap-2 min-h-11 min-w-11
             rounded-lg font-medium transition-colors duration-150
             focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2
             disabled:opacity-50 disabled:cursor-not-allowed
             px-4 py-2.5 text-sm sm:text-base"
      (click)="onClick.emit($event)"
    >
      @if (loading) {
        <span class="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent"></span>
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
  @Output() onClick = new EventEmitter<MouseEvent>();

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
