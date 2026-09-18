import { Gender } from '../enums/gender.enum';

export interface PhrProfile {
  fullName: string;
  citizenId: string | null;
  gender: Gender;
  dateOfBirth: string;
  address: string | null;
  healthInsurance: string | null;
  bloodType: string | null;
  allergies: string | null;
  chronicDiseases: string | null;
  surgeryHistory: string | null;
}

export interface UpdatePhrProfileRequest {
  fullName: string;
  citizenId: string;
  gender: Gender;
  dateOfBirth: string;
  address: string;
  healthInsurance: string;
  bloodType: string;
  allergies: string;
  chronicDiseases: string;
  surgeryHistory: string;
}
