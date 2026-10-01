import { Component, Input } from '@angular/core';
import { NgClass } from '@angular/common';

export type SkeletonShape = 'text' | 'title' | 'avatar' | 'card' | 'button';

/**
 * NFR-UX-03: Mọi async loading phải hiển thị Skeleton/Spinner, KHÔNG để màn
 * hình trống quá 300ms. Component này chỉ lo phần "vẽ" — logic quyết định
 * *khi nào* hiện nó nằm ở SkeletonUntilDirective cùng thư mục.
 */
@Component({
  selector: 'app-skeleton-loader',
  standalone: true,
  imports: [NgClass],
  template: `
    <div
      [ngClass]="shapeClasses"
      class="animate-pulse bg-slate-200 rounded-md"
      [style.width]="width"
      [style.height]="height"
      aria-hidden="true"
    ></div>
  `,
})
export class SkeletonLoaderComponent {
  @Input() shape: SkeletonShape = 'text';
  @Input() width?: string;
  @Input() height?: string;

  get shapeClasses(): Record<string, boolean> {
    return {
      'h-4 w-full': this.shape === 'text',
      'h-6 w-1/2': this.shape === 'title',
      'h-11 w-11 rounded-full': this.shape === 'avatar',
      'h-32 w-full rounded-xl': this.shape === 'card',
      'h-11 w-24 rounded-lg': this.shape === 'button',
    };
  }
}
