import { ServiceUnavailableException } from '@nestjs/common';
import { environment } from '../src/config/environment';
import { clinicPrintProfile } from '../src/modules/reception/clinic-print-profile';

describe('Configured clinic print profile', () => {
  const keys = ['CLINIC_NAME', 'CLINIC_ADDRESS', 'CLINIC_PHONE', 'CLINIC_TAX_CODE', 'CLINIC_LICENSE_NUMBER', 'CLINIC_LOGO_URL'];
  let original: Record<string, string | undefined>;
  beforeEach(() => {
    original = Object.fromEntries(keys.map((key) => [key, environment[key]]));
    keys.forEach((key) => { delete environment[key]; });
  });
  afterEach(() => keys.forEach((key) => {
    if (original[key] === undefined) delete environment[key];
    else environment[key] = original[key];
  }));
  it('does not fabricate legal details when configuration is absent', () => {
    expect(() => clinicPrintProfile()).toThrow(ServiceUnavailableException);
    environment.CLINIC_NAME = '   ';
    environment.CLINIC_ADDRESS = 'Test address';
    expect(() => clinicPrintProfile()).toThrow(ServiceUnavailableException);
  });
  it('returns only configured public clinic fields', () => {
    environment.CLINIC_NAME = ' Test clinic ';
    environment.CLINIC_ADDRESS = ' Test address ';
    environment.CLINIC_TAX_CODE = ' TEST-TAX ';
    expect(clinicPrintProfile()).toEqual({ clinicName: 'Test clinic', address: 'Test address',
      taxCode: 'TEST-TAX', phone: undefined, licenseNumber: undefined, logoUrl: undefined });
  });
});
