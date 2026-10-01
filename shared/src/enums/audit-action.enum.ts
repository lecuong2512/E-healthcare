/**
 * Security-sensitive actions required by SRS-ADM-04.
 *
 * Domain owners can extend this catalogue without changing the audit viewer,
 * which continues to render unknown action values returned by the API.
 */
export enum AuditAction {
  LOGIN = "LOGIN",
  LOGIN_FAILED = "LOGIN_FAILED",
  LOGOUT = "LOGOUT",
  PASSWORD_RESET = "PASSWORD_RESET",
  CREATE_EMR = "CREATE_EMR",
  VIEW_EMR = "VIEW_EMR",
  EXPORT_EMR = "EXPORT_EMR",
  UPDATE_EMR = "UPDATE_EMR",
  UPDATE_RX = "UPDATE_RX",
  EXPORT_RX = "EXPORT_RX",
  CREATE_EMR_ADDENDUM = "CREATE_EMR_ADDENDUM",
  CANCEL_APPT = "CANCEL_APPT",
  REFUND_PAYMENT = "REFUND_PAYMENT",
  EXPORT_PATIENT_LIST = "EXPORT_PATIENT_LIST",
  VIEW_AUDIT_LOGS = "VIEW_AUDIT_LOGS",
  EXPORT_AUDIT_LOGS = "EXPORT_AUDIT_LOGS",
}
