import {
  ChangeDetectionStrategy,
  Component,
  Input,
  signal,
} from '@angular/core';

const USER_AGENT_PREVIEW_LENGTH = 48;

export interface UserAgentSummary {
  badge: string;
  isBot: boolean;
}

export function parseUserAgentFriendly(ua: string | null): UserAgentSummary {
  if (!ua) {
    return { badge: '—', isBot: false };
  }

  // Automated scripts / tools
  if (/python-requests/i.test(ua)) {
    const ver = ua.match(/python-requests\/([\d.]+)/i)?.[1] || '';
    return {
      badge: `🤖 Python Requests ${ver}`.trim(),
      isBot: true,
    };
  }
  if (/PostmanRuntime/i.test(ua)) {
    return {
      badge: '🚀 Postman Client',
      isBot: true,
    };
  }
  if (/curl/i.test(ua)) {
    return {
      badge: '💻 cURL Tool',
      isBot: true,
    };
  }

  // OS detection
  let os = 'OS khác';
  if (/Windows NT 10/i.test(ua)) os = 'Windows 10/11';
  else if (/Windows NT 6\.3/i.test(ua)) os = 'Windows 8.1';
  else if (/Windows NT 6\.1/i.test(ua)) os = 'Windows 7';
  else if (/Windows/i.test(ua)) os = 'Windows';
  else if (/iPhone|iPod/i.test(ua)) os = 'iPhone (iOS)';
  else if (/iPad/i.test(ua)) os = 'iPad (iPadOS)';
  else if (/Macintosh|Mac OS X/i.test(ua)) os = 'macOS';
  else if (/Android/i.test(ua)) os = 'Android';
  else if (/Linux/i.test(ua)) os = 'Linux';

  // Browser detection
  let browser = 'Web Browser';
  if (/Edg\/([\d.]+)/i.test(ua)) {
    const ver = ua.match(/Edg\/([\d.]+)/i)?.[1]?.split('.')[0] || '';
    browser = `Edge ${ver}`.trim();
  } else if (/OPR\/([\d.]+)|Opera/i.test(ua)) {
    browser = 'Opera';
  } else if (/Chrome\/([\d.]+)/i.test(ua)) {
    const ver = ua.match(/Chrome\/([\d.]+)/i)?.[1]?.split('.')[0] || '';
    browser = `Chrome ${ver}`.trim();
  } else if (/Firefox\/([\d.]+)/i.test(ua)) {
    const ver = ua.match(/Firefox\/([\d.]+)/i)?.[1]?.split('.')[0] || '';
    browser = `Firefox ${ver}`.trim();
  } else if (/Safari/i.test(ua) && !/Chrome/i.test(ua)) {
    browser = 'Safari';
  }

  return {
    badge: `🌐 ${browser} · ${os}`,
    isBot: false,
  };
}

@Component({
  selector: 'app-audit-log-user-agent',
  standalone: true,
  template: `
    @if (userAgent) {
      <div class="user-agent-cell">
        <span class="user-agent-pill" [class.user-agent-pill--bot]="summary.isBot">
          {{ summary.badge }}
        </span>
        <button
          type="button"
          class="user-agent-trigger"
          [attr.aria-expanded]="expanded()"
          (click)="toggle()"
          [title]="'Xem đầy đủ User-Agent'"
        >
          {{ preview }}
          <span class="sr-only">
            {{ expanded() ? 'Thu gọn User-Agent' : 'Xem đầy đủ User-Agent' }}
          </span>
        </button>
        @if (expanded()) {
          <p class="user-agent-detail" aria-live="polite">{{ userAgent }}</p>
        }
      </div>
    } @else {
      <span aria-label="Không có dữ liệu">—</span>
    }
  `,
  styles: `
    .user-agent-cell {
      display: flex;
      flex-direction: column;
      gap: 0.25rem;
    }

    .user-agent-pill {
      display: inline-flex;
      align-items: center;
      width: fit-content;
      font-size: 0.75rem;
      font-weight: 600;
      padding: 0.125rem 0.5rem;
      border-radius: 9999px;
      background-color: #f1f5f9;
      color: #334155;
      border: 1px solid #cbd5e1;
      white-space: nowrap;
    }

    .user-agent-pill--bot {
      background-color: #fef3c7;
      color: #92400e;
      border-color: #fde68a;
    }

    .user-agent-trigger {
      display: block;
      overflow: hidden;
      max-width: 22rem;
      border: 0;
      background: transparent;
      padding: 0;
      color: #64748b;
      font-size: 0.75rem;
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
      margin: .25rem 0 0;
      color: #334155;
      font-size: .75rem;
      line-height: 1.45;
      white-space: normal;
      background-color: #f8fafc;
      padding: 0.375rem 0.5rem;
      border-radius: 0.375rem;
      border: 1px solid #e2e8f0;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AuditLogUserAgentComponent {
  @Input() userAgent: string | null = null;

  readonly expanded = signal(false);

  get summary(): UserAgentSummary {
    return parseUserAgentFriendly(this.userAgent);
  }

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
