-- Dedicated LOCAL QA accounts only. Run migrations first; never use in production.
-- Demo password: PaymentDemo123! (keep these users isolated from real patients).
INSERT INTO users (id, email, full_name, gender, date_of_birth, status, password_hash)
VALUES
 ('90000000-0000-4000-8000-000000000001', 'runtime.payment.patient@ehealth.local', 'Bệnh nhân Payment QA', 'OTHER', '1990-01-01', 'ACTIVE', crypt('PaymentDemo123!', gen_salt('bf'))),
 ('90000000-0000-4000-8000-000000000002', 'runtime.payment.doctor1@ehealth.local', 'Nguyễn Văn A - Payment QA', 'MALE', '1975-01-01', 'ACTIVE', NULL),
 ('90000000-0000-4000-8000-000000000003', 'runtime.payment.doctor2@ehealth.local', 'Trần Thị B - Payment QA', 'FEMALE', '1980-01-01', 'ACTIVE', NULL),
 ('90000000-0000-4000-8000-000000000004', 'runtime.payment.doctor3@ehealth.local', 'Lê Hoàng C - Payment QA', 'MALE', '1985-01-01', 'ACTIVE', NULL)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, status = EXCLUDED.status;

INSERT INTO user_roles (user_id, role) VALUES
 ('90000000-0000-4000-8000-000000000001', 'ROLE_PATIENT'),
 ('90000000-0000-4000-8000-000000000002', 'ROLE_DOCTOR'),
 ('90000000-0000-4000-8000-000000000003', 'ROLE_DOCTOR'),
 ('90000000-0000-4000-8000-000000000004', 'ROLE_DOCTOR')
ON CONFLICT DO NOTHING;

INSERT INTO specialties (id, name, is_active) VALUES
 ('90000000-0000-4000-8000-000000000010', 'Payment QA - Nội tổng quát', TRUE)
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, is_active = TRUE;

INSERT INTO doctors (id, user_id, specialty_id, license_number, academic_title, years_experience, consultation_fee, room_number, rating_average)
VALUES
 ('90000000-0000-4000-8000-000000000021', '90000000-0000-4000-8000-000000000002', '90000000-0000-4000-8000-000000000010', 'PAYMENT-QA-01', 'BS.CKII', 20, 300000, 'QA-01', 4.9),
 ('90000000-0000-4000-8000-000000000022', '90000000-0000-4000-8000-000000000003', '90000000-0000-4000-8000-000000000010', 'PAYMENT-QA-02', 'BS.CKI', 15, 250000, 'QA-02', 4.8),
 ('90000000-0000-4000-8000-000000000023', '90000000-0000-4000-8000-000000000004', '90000000-0000-4000-8000-000000000010', 'PAYMENT-QA-03', 'BS', 10, 200000, 'QA-03', 4.7)
ON CONFLICT (id) DO UPDATE SET years_experience = EXCLUDED.years_experience, consultation_fee = EXCLUDED.consultation_fee;

INSERT INTO doctor_schedules (id, doctor_id, date, start_time, end_time, status)
VALUES
 ('90000000-0000-4000-8000-000000000031', '90000000-0000-4000-8000-000000000021', (NOW() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date + 1, '08:00', '08:30', 'AVAILABLE'),
 ('90000000-0000-4000-8000-000000000032', '90000000-0000-4000-8000-000000000021', (NOW() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date + 2, '14:00', '14:30', 'AVAILABLE'),
 ('90000000-0000-4000-8000-000000000033', '90000000-0000-4000-8000-000000000022', (NOW() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date + 1, '08:00', '08:30', 'AVAILABLE'),
 ('90000000-0000-4000-8000-000000000034', '90000000-0000-4000-8000-000000000022', (NOW() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date + 2, '14:00', '14:30', 'AVAILABLE'),
 ('90000000-0000-4000-8000-000000000035', '90000000-0000-4000-8000-000000000023', (NOW() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date + 1, '08:00', '08:30', 'AVAILABLE'),
 ('90000000-0000-4000-8000-000000000036', '90000000-0000-4000-8000-000000000023', (NOW() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date + 2, '14:00', '14:30', 'AVAILABLE')
ON CONFLICT (id) DO UPDATE SET doctor_id = EXCLUDED.doctor_id, date = EXCLUDED.date,
 start_time = EXCLUDED.start_time, end_time = EXCLUDED.end_time, status = EXCLUDED.status
-- A plain re-seed never resurrects an existing appointment's slot. Use the scoped reset explicitly.
WHERE NOT EXISTS (SELECT 1 FROM appointments a WHERE a.schedule_id = doctor_schedules.id);
