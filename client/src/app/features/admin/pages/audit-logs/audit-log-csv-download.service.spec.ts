import { TestBed, fakeAsync, tick } from '@angular/core/testing';

import {
  AuditLogCsvDownloadService,
  sanitizeAuditCsvFilename,
} from './audit-log-csv-download.service';

describe('sanitizeAuditCsvFilename', () => {
  it('supports UTF-8 Content-Disposition filenames', () => {
    expect(
      sanitizeAuditCsvFilename(
        "attachment; filename*=UTF-8''nhat-ky%20kiem-toan.csv",
      ),
    ).toBe('nhat-ky kiem-toan.csv');
  });

  it('removes path traversal and forces a CSV extension', () => {
    expect(
      sanitizeAuditCsvFilename(
        'attachment; filename="../../audit-log<script>.exe"',
      ),
    ).toBe('audit-log_script_.exe.csv');
  });

  it('uses a safe fallback for missing or empty filenames', () => {
    expect(sanitizeAuditCsvFilename(null)).toBe('audit-logs.csv');
    expect(
      sanitizeAuditCsvFilename('attachment; filename=".."'),
    ).toBe('audit-logs.csv');
  });
});

describe('AuditLogCsvDownloadService', () => {
  let service: AuditLogCsvDownloadService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(AuditLogCsvDownloadService);
  });

  it('downloads the server Blob and revokes the object URL', fakeAsync(() => {
    spyOn(URL, 'createObjectURL').and.returnValue('blob:audit-export');
    const revokeSpy = spyOn(URL, 'revokeObjectURL');
    const clickSpy = spyOn(HTMLAnchorElement.prototype, 'click');

    service.download(
      new Blob(['server-generated-csv'], { type: 'text/csv' }),
      'attachment; filename="audit-20260922.csv"',
    );

    expect(clickSpy).toHaveBeenCalled();
    expect(URL.createObjectURL).toHaveBeenCalled();
    expect(revokeSpy).not.toHaveBeenCalled();

    tick();

    expect(revokeSpy).toHaveBeenCalledOnceWith('blob:audit-export');
  }));
});
