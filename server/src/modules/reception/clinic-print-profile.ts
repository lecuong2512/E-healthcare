import { ServiceUnavailableException } from '@nestjs/common';
import { ClinicPrintInfo } from '@shared/interfaces';
import { environment } from '../../config/environment';

export function clinicPrintProfile(): ClinicPrintInfo {
  const clinicName = environment.CLINIC_NAME?.trim();
  const address = environment.CLINIC_ADDRESS?.trim();
  if (!clinicName || !address) {
    throw new ServiceUnavailableException('Chưa cấu hình thông tin phòng khám để in phiếu.');
  }
  return {
    clinicName,
    address,
    phone: environment.CLINIC_PHONE?.trim() || undefined,
    taxCode: environment.CLINIC_TAX_CODE?.trim() || undefined,
    licenseNumber: environment.CLINIC_LICENSE_NUMBER?.trim() || undefined,
    logoUrl: environment.CLINIC_LOGO_URL?.trim() || undefined,
  };
}
