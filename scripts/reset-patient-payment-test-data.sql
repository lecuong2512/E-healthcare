-- Executed inside the runner's transaction, only for its dedicated QA identity.
CREATE TEMP TABLE payment_qa_appointments ON COMMIT DROP AS
SELECT a.id, a.doctor_id, a.schedule_id, a.reservation_id FROM appointments a
JOIN users u ON u.id = a.patient_id
WHERE u.id = '90000000-0000-4000-8000-000000000001' AND u.email = 'runtime.payment.patient@ehealth.local';

UPDATE appointments SET canonical_payment_transaction_id = NULL WHERE id IN (SELECT id FROM payment_qa_appointments);
DELETE FROM payment_reconciliation_audits WHERE payment_transaction_id IN
 (SELECT id FROM payment_transactions WHERE appointment_id IN (SELECT id FROM payment_qa_appointments));
DELETE FROM refund_requests WHERE appointment_id IN (SELECT id FROM payment_qa_appointments);
DELETE FROM payment_transactions WHERE appointment_id IN (SELECT id FROM payment_qa_appointments);
DELETE FROM appointment_notifications WHERE appointment_id IN (SELECT id FROM payment_qa_appointments);
DELETE FROM vouchers WHERE user_id = '90000000-0000-4000-8000-000000000001';
-- Clinical/counter-payment/audit foreign keys deliberately abort this reset instead of deleting those records.
DELETE FROM appointments WHERE id IN (SELECT id FROM payment_qa_appointments);
UPDATE doctor_schedules SET status = 'AVAILABLE' WHERE id IN (SELECT schedule_id FROM payment_qa_appointments)
 AND status IN ('HOLDING', 'BOOKED')
 AND NOT EXISTS (SELECT 1 FROM appointments a WHERE a.schedule_id = doctor_schedules.id);
