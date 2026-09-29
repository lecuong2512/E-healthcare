export interface CreateDoctorReviewRequest {
  appointmentId: string;
  rating: number;
  comment?: string | null;
}

export interface DoctorReviewResponse {
  id: string;
  appointmentId: string;
  doctorId: string;
  rating: number;
  comment: string | null;
  createdAt: Date | string;
  ratingAverage: number;
}

export interface AppointmentDoctorReview {
  id: string;
  rating: number;
  comment: string | null;
  createdAt: Date | string;
}
