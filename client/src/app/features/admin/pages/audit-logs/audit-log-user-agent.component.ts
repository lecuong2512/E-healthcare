import {
  ChangeDetectionStrategy,
  Component,
  Input,
  signal,
} from '@angular/core';

const USER_AGENT_PREVIEW_LENGTH = 48;

@Component({
  selector: 'app-audit-log-user-agent',
  standalone: true,
  template: `
    @if (userAgent) {
      <button
        type="button"
        class="user-agent-trigger"
        [attr.aria-expanded]="expanded()"
        (click)="toggle()"
      >
        {{ preview }}
        <span class="sr-only">
          {{ expanded() ? 'Thu gọn User-Agent' : 'Xem đầy đủ User-Agent' }}
        </span>
      </button>
      @if (expanded()) {
        <p class="user-agent-detail" aria-live="polite">{{ userAgent }}</p>
      }
    } @else {
      <span aria-label="Không có dữ liệu">—</span>
    }
  `,
  styles: `
    .user-agent-trigger {
      display: block;
      overflow: hidden;
      max-width: 22rem;
      border: 0;
      background: transparent;
      padding: 0;
      color: #475569;
      text-align: left;
      text-decoration: underline dotted;
      text-overflow: ellipsis;
      white-space: nowrap;
      cursor: pointer;
    }

    .user-agent-trigger:focus-visible {
      border-radius: .25rem;
      outline: 3px solid #bae6fd;
      outline-offset: 2px;
    }

    .user-agent-detail {
      overflow-wrap: anywhere;
      max-width: 32rem;
      margin: .5rem 0 0;
      color: #334155;
      font-size: .75rem;
      line-height: 1.45;
      white-space: normal;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AuditLogUserAgentComponent {
  @Input() userAgent: string | null = null;

  readonly expanded = signal(false);

  get preview(): string {
    if (!this.userAgent || this.userAgent.length <= USER_AGENT_PREVIEW_LENGTH) {
      return this.userAgent ?? '—';
    }
    return `${this.userAgent.slice(0, USER_AGENT_PREVIEW_LENGTH)}…`;
  }

  toggle(): void {
    this.expanded.update((value) => !value);
  }
}
