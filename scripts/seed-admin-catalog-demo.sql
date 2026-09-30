-- Local ADM-01 demo catalog data. Safe to run repeatedly.
INSERT INTO specialties (name, description, is_active)
VALUES
  ('Tim mạch', 'Khám và điều trị bệnh lý tim mạch.', TRUE),
  ('Nội tổng quát', 'Khám nội khoa tổng quát.', TRUE),
  ('Ngoại khoa', 'Khám và điều trị ngoại khoa.', TRUE),
  ('Nhi khoa', 'Chăm sóc sức khỏe trẻ em.', TRUE),
  ('Da liễu', 'Khám và điều trị bệnh da liễu.', TRUE)
ON CONFLICT ((LOWER(name))) DO UPDATE
SET description = EXCLUDED.description, is_active = EXCLUDED.is_active;

INSERT INTO medicines (code, brand_name, active_ingredient, strength, package_unit, contraindications, reference_price, is_active)
VALUES
  ('ADMDEMO-MED-001', 'Amlodipine 5mg', 'Amlodipine', '5mg', 'Hộp 30 viên', 'Hạ huyết áp nặng, quá mẫn với amlodipine.', 42000, TRUE),
  ('ADMDEMO-MED-002', 'Losartan 50mg', 'Losartan potassium', '50mg', 'Hộp 30 viên', 'Phụ nữ có thai, quá mẫn với losartan.', 68000, TRUE),
  ('ADMDEMO-MED-003', 'Metformin 500mg', 'Metformin hydrochloride', '500mg', 'Hộp 60 viên', 'Suy thận nặng, nhiễm toan chuyển hóa.', 55000, TRUE),
  ('ADMDEMO-MED-004', 'Paracetamol 500mg', 'Paracetamol', '500mg', 'Hộp 100 viên', 'Suy gan nặng, quá mẫn với paracetamol.', 25000, TRUE),
  ('ADMDEMO-MED-005', 'Atorvastatin 20mg', 'Atorvastatin', '20mg', 'Hộp 30 viên', 'Bệnh gan tiến triển, phụ nữ có thai.', 95000, TRUE)
ON CONFLICT (code) DO UPDATE
SET brand_name = EXCLUDED.brand_name, active_ingredient = EXCLUDED.active_ingredient, strength = EXCLUDED.strength,
    package_unit = EXCLUDED.package_unit, contraindications = EXCLUDED.contraindications,
    reference_price = EXCLUDED.reference_price, is_active = EXCLUDED.is_active;

INSERT INTO medical_services (code, name, listed_price, duration_minutes, description, is_active)
VALUES
  ('ADMDEMO-SVC-001', 'Khám chuyên khoa', 200000, 20, 'Khám theo chuyên khoa.', TRUE),
  ('ADMDEMO-SVC-002', 'Khám nội tổng quát', 150000, 20, 'Khám nội tổng quát.', TRUE),
  ('ADMDEMO-SVC-003', 'Siêu âm tổng quát', 300000, 30, 'Siêu âm chẩn đoán tổng quát.', TRUE),
  ('ADMDEMO-SVC-004', 'Xét nghiệm công thức máu', 120000, 15, 'Xét nghiệm huyết học cơ bản.', TRUE)
ON CONFLICT (code) DO UPDATE
SET name = EXCLUDED.name, listed_price = EXCLUDED.listed_price, duration_minutes = EXCLUDED.duration_minutes,
    description = EXCLUDED.description, is_active = EXCLUDED.is_active;

INSERT INTO icd10_catalogs (code, name, category, is_active)
VALUES
  ('I10', 'Tăng huyết áp vô căn', 'Bệnh hệ tuần hoàn', TRUE),
  ('E11', 'Đái tháo đường không phụ thuộc insulin', 'Bệnh nội tiết, dinh dưỡng và chuyển hóa', TRUE),
  ('J06.9', 'Nhiễm trùng đường hô hấp trên cấp', 'Bệnh hệ hô hấp', TRUE),
  ('L20.9', 'Viêm da cơ địa, không đặc hiệu', 'Bệnh da và mô dưới da', TRUE)
ON CONFLICT (code) DO UPDATE
SET name = EXCLUDED.name, category = EXCLUDED.category, is_active = EXCLUDED.is_active;
