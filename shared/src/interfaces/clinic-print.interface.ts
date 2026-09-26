/** Public clinic details supplied by system configuration, never invented by the UI. */
export interface ClinicPrintInfo {
  clinicName: string;
  address: string;
  phone?: string;
  taxCode?: string;
  licenseNumber?: string;
  logoUrl?: string;
}
