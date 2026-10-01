import { SetMetadata } from '@nestjs/common';

export const OWN_DOCTOR_PARAM = 'auth:own-doctor-param';
export const OwnDoctor = (paramName: string = 'doctorId') =>
  SetMetadata(OWN_DOCTOR_PARAM, paramName);