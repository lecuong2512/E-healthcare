import { DOCUMENT } from '@angular/common';
import { Inject, Injectable } from '@angular/core';

const DEFAULT_FILENAME = 'audit-logs.csv';

export function sanitizeAuditCsvFilename(
  contentDisposition: string | null,
): string {
  const encodedMatch = contentDisposition?.match(
    /filename\*\s*=\s*UTF-8''([^;]+)/i,
  );
  const regularMatch = contentDisposition?.match(
    /filename\s*=\s*(?:"([^"]*)"|([^;]*))/i,
  );
  const rawFilename = encodedMatch?.[1] ?? regularMatch?.[1] ?? regularMatch?.[2];

  if (!rawFilename) {
    return DEFAULT_FILENAME;
  }

  let decoded = rawFilename.trim();
  try {
    decoded = decodeURIComponent(decoded);
  } catch {
    // Keep the undecoded value and sanitize it below.
  }

  const basename = decoded.split(/[\\/]/).pop() ?? '';
  const safeName = basename
    .replace(/[\u0000-\u001f\u007f<>:"|?*]/g, '_')
    .replace(/^\.+/, '')
    .trim()
    .slice(0, 180);

  if (!safeName) {
    return DEFAULT_FILENAME;
  }

  return safeName.toLowerCase().endsWith('.csv')
    ? safeName
    : `${safeName}.csv`;
}

@Injectable({ providedIn: 'root' })
export class AuditLogCsvDownloadService {
  constructor(@Inject(DOCUMENT) private readonly document: Document) {}

  download(blob: Blob, contentDisposition: string | null): void {
    const objectUrl = URL.createObjectURL(blob);
    const anchor = this.document.createElement('a');
    anchor.href = objectUrl;
    anchor.download = sanitizeAuditCsvFilename(contentDisposition);
    anchor.rel = 'noopener';
    anchor.style.display = 'none';
    this.document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();

    setTimeout(() => URL.revokeObjectURL(objectUrl), 0);
  }
}
