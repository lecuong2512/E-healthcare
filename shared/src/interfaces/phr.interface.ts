import { Gender } from "../enums/gender.enum";

export interface PhrProfile {
  fullName: string;
  citizenId: string;
  gender: Gender;
  dateOfBirth: string;
  address: string;
  healthInsurance: string;
  bloodType: string;
  drugAllergy: string;
  chronicDiseases: string;
  surgeryHistory: string;
}
