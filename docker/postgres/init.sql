-- ====================================================================
-- E-Healthcare Portal - PostgreSQL Initialization Script
-- Requirements: Section 2.1, Section 6.2 & NFR-SEC-01
-- ====================================================================

-- 1. Enable pgcrypto for AES-256 encryption on sensitive columns
-- Used for encrypting clinical_notes and vital_signs in MEDICAL_RECORDS (NFR-SEC-01)
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 2. Enable uuid-ossp for automatic UUIDv4 generation
-- Used for primary keys across system entities (Section 6.2)
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
