import { Injectable, signal } from '@angular/core';

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
    this._messages.update((list) => list.filter((m) => m.id !== id));
  }

  private push(level: NotificationLevel, text: string): void {
    const id = this.nextId++;
    this._messages.update((list) => [...list, { id, level, text }]);
    setTimeout(() => this.dismiss(id), 5000);
  }
}
