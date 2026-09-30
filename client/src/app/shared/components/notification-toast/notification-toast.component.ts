import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { NotificationService } from '../../../core/services/notification.service';

@Component({
  selector: 'app-notification-toast',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="toast-stack" aria-live="polite" aria-atomic="true">
      @for (message of notification.messages(); track message.id) {
        <div class="toast" [class]="'toast toast-' + message.level" role="status">
          <span>{{ message.text }}</span>
          <button type="button" aria-label="Đóng thông báo" (click)="notification.dismiss(message.id)">×</button>
        </div>
      }
    </div>
  `,
  styles: [`
    .toast-stack { position: fixed; z-index: 100; top: 18px; right: 18px; display: grid; gap: 10px; width: min(360px, calc(100vw - 36px)); }
    .toast { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; border: 1px solid; border-radius: 8px; padding: 12px 14px; box-shadow: 0 10px 28px #10243b26; font-size: 14px; line-height: 1.4; }
    .toast button { margin: -3px -4px -3px 0; border: 0; background: transparent; color: inherit; font-size: 20px; line-height: 1; cursor: pointer; }
    .toast-success { border-color: #9ee2be; background: #ecfdf3; color: #087a48; }
    .toast-error { border-color: #f5b3b3; background: #fff2f2; color: #b42318; }
    .toast-warning { border-color: #f2d287; background: #fffae8; color: #8a5a00; }
    .toast-info { border-color: #9fccec; background: #eef8ff; color: #086caa; }
  `],
})
export class NotificationToastComponent {
  readonly notification = inject(NotificationService);
}
