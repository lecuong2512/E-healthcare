/**
 * Security-sensitive actions required by SRS-ADM-04.
 *
 * Domain owners can extend this catalogue without changing the audit viewer,
 * which continues to render unknown action values returned by the API.
 */
export enum AuditAction {
  LOGIN = "LOGIN",
  VIEW_EMR = "VIEW_EMR",
  UPDATE_RX = "UPDATE_RX",
  CANCEL_APPT = "CANCEL_APPT",
}
