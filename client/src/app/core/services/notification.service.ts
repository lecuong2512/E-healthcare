import { DestroyRef, Injectable, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NavigationStart, Router } from '@angular/router';

export type NotificationLevel = 'success' | 'error' | 'warning' | 'info';

export interface NotificationMessage {
  id: number;
  level: NotificationLevel;
  text: string;
}

/**
 * Wrapper tối giản để error.interceptor và các feature khác không phụ thuộc
 * trực tiếp vào 1 thư viện toast cụ thể. Khi team chọn lib UI (vd. Angular
 * Material Snackbar) thì chỉ cần đổi implementation bên trong service này,
 * không phải sửa lại chỗ gọi (error.interceptor, feature pages...).
 */
@Injectable({ providedIn: 'root' })
export class NotificationService {
  private nextId = 0;
  private readonly _messages = signal<NotificationMessage[]>([]);
  readonly messages = this._messages.asReadonly();
  private readonly timers = new Map<number, ReturnType<typeof setTimeout>>();

  constructor() {
    const destroyRef = inject(DestroyRef);
    inject(Router).events.pipe(takeUntilDestroyed(destroyRef)).subscribe(event => {
      if (event instanceof NavigationStart) this.clear();
    });
    destroyRef.onDestroy(() => this.clear());
  }

  clear(): void {
    this.timers.forEach(timer => clearTimeout(timer));
    this.timers.clear();
    this._messages.set([]);
  }

  success(text: string): void {
    this.push('success', text);
  }
  error(text: string): void {
    this.push('error', text);
  }
  warning(text: string): void {
    this.push('warning', text);
  }
  info(text: string): void {
    this.push('info', text);
  }

  dismiss(id: number): void {
    clearTimeout(this.timers.get(id));
    this.timers.delete(id);
    this._messages.update((list) => list.filter((m) => m.id !== id));
  }

  private push(level: NotificationLevel, text: string): void {
    const id = this.nextId++;
    this._messages.update((list) => [...list, { id, level, text }]);
    this.timers.set(id, setTimeout(() => this.dismiss(id), 5000));
  }
}
