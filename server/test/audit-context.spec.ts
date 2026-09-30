import { Request } from 'express';
import { auditTransportContextFromRequest } from '../src/modules/audit/audit-context';

describe('Audit transport context', () => {
  it('uses a stable server-generated request ID instead of a public client header', () => {
    const request = {
      ip: '203.0.113.11',
      headers: {
        'user-agent': 'audit-context-test',
        'x-request-id': 'client-controlled-id',
      },
    } as unknown as Request;

    const first = auditTransportContextFromRequest(request);
    const second = auditTransportContextFromRequest(request);

    expect(first.requestId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
    expect(first.requestId).not.toBe('client-controlled-id');
    expect(second.requestId).toBe(first.requestId);
  });

  it('removes control characters from User-Agent before audit persistence', () => {
    const request = {
      ip: '203.0.113.12',
      headers: { 'user-agent': '=formula\r\ninjected-row\u0000' },
    } as unknown as Request;

    expect(auditTransportContextFromRequest(request).userAgent).toBe(
      '=formula  injected-row ',
    );
  });
});
