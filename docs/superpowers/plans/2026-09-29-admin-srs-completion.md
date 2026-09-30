# ADM SRS Completion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete every unchecked SRS-ADM-02 and SRS-ADM-03 requirement on their dedicated feature branches.

**Architecture:** `feature/admin-staff` gains a doctor-specialty assignment model, credential/profile update APIs, and approval state for recurring schedules. `feature/admin-dashboard-kpi` aggregates reporting data from appointments and requires persisted admin approval before producing report files.

**Tech Stack:** NestJS, TypeORM/PostgreSQL migrations, Angular standalone components, Jest, Angular Karma/ChromeHeadless, ExcelJS, PDFKit.

**Spec:** `docs/superpowers/specs/2026-09-29-admin-remaining-srs-design.md`

## Global Constraints

- Keep ADM-02 changes on `feature/admin-staff` and ADM-03 changes on `feature/admin-dashboard-kpi`.
- All endpoints require `ROLE_ADMIN`; use authenticated request claims rather than client-supplied user IDs.
- Preserve the Figma medical-clean layout and Vietnamese UI.
- The PDF approval block is a persisted review confirmation, not a cryptographic signature.

## Review Focus

- A duplicate specialty ID must not create duplicate assignments.
- A doctor with no specialty, CCHN, room, or valid experience must be rejected.
- An unapproved report export must return 403 even if the client manually invokes the URL.
- Revenue must exclude unpaid and refunded appointments.
- A doctor without completed/check-in timestamps must not make average-duration calculation fail.

---

### Task 1: Complete doctor professional profile and specialty assignment

**Files:**
- Create: `server/src/database/entities/doctor-specialty.entity.ts`
- Create: `server/src/database/migrations/1790310000000-add-doctor-specialties.ts`
- Modify: `server/src/database/database-options.ts`
- Modify: `server/src/modules/admin/staff-admin.service.ts`
- Modify: `server/src/modules/admin/staff-admin.controller.ts`
- Test: `server/test/admin-staff.spec.ts`

**Interfaces:**
- Consumes: `CreateStaffInput`, `DoctorEntity`, `SpecialtyEntity`.
- Produces: `specialtyIds: string[]`, `yearsExperience: number`, and `PATCH /admin/staff/:userId`.

- [ ] Write failing tests for multiple unique specialty saves and rejected incomplete doctor input.
- [ ] Run `npm.cmd test --workspace=@ehealth/server -- admin-staff.spec.ts`; confirm the tests fail for the missing model/validation.
- [ ] Add the migration/entity and transactional create/update service methods; validate specialty existence and persist exactly one primary specialty.
- [ ] Add protected controller methods and run the focused backend test until green.
- [ ] Commit: `feat(admin): manage doctor credentials and specialties`.

### Task 2: Add recurring shift approval for administrators

**Files:**
- Create: `server/src/database/entities/doctor-shift-approval.entity.ts`
- Create: `server/src/database/migrations/1790311000000-add-doctor-shift-approvals.ts`
- Modify: `server/src/database/database-options.ts`
- Modify: `server/src/modules/admin/staff-admin.service.ts`
- Modify: `server/src/modules/admin/staff-admin.controller.ts`
- Test: `server/test/admin-staff.spec.ts`

**Interfaces:**
- Consumes: `DoctorScheduleEntity`, authenticated administrator ID.
- Produces: pending approvals and `approveSchedule(scheduleId, adminId)`.

- [ ] Write a failing service test that saves an immutable approval for a pending recurring schedule and rejects an unknown schedule.
- [ ] Implement entity/migration and service/controller endpoints.
- [ ] Run focused backend tests and build.
- [ ] Commit: `feat(admin): approve recurring doctor shifts`.

### Task 3: Bind staff profile editing and shift approval UI

**Files:**
- Modify: `client/src/app/features/admin/data-access/admin-staff-api.service.ts`
- Modify: `client/src/app/features/admin/pages/staff-mgmt/staff-mgmt.page.ts`
- Modify: `client/src/app/features/admin/pages/staff-mgmt/staff-mgmt.page.html`
- Modify: `client/src/app/features/admin/pages/staff-mgmt/staff-mgmt.page.scss`
- Test: `client/src/app/features/admin/pages/staff-mgmt/staff-mgmt.page.spec.ts`

**Interfaces:**
- Consumes: staff profile and shift approval endpoints from Tasks 1–2.
- Produces: edit serialization with specialty IDs and administrator approval action.

- [ ] Write failing Angular tests for profile update payload and approved shift reload.
- [ ] Add an edit mode to the supplied modal, multiple-specialty controls, experience input, and pending-shift panel.
- [ ] Run focused Angular tests and the Angular build.
- [ ] Commit: `feat(admin): edit staff credentials and approve shifts`.

### Task 4: Make dashboard aggregation complete and data-backed

**Files:**
- Modify: `server/src/modules/admin/admin-dashboard.service.ts`
- Modify: `server/src/modules/admin/admin-dashboard.controller.ts`
- Test: `server/test/admin-dashboard.spec.ts`

**Interfaces:**
- Consumes: appointments, doctors, users, specialties, and report approvals.
- Produces: `overview(days)` with payment, specialty, doctor revenue, and doctor productivity arrays.

- [ ] Write failing tests for paid-only payment grouping, specialty/doctor revenue, and null-safe productivity mapping.
- [ ] Replace static trend/table data with parameterized aggregate queries.
- [ ] Run focused backend tests and build.
- [ ] Commit: `feat(admin): aggregate operational reporting metrics`.

### Task 5: Enforce approval and render approval block in exports

**Files:**
- Modify: `server/src/modules/admin/admin-dashboard.service.ts`
- Modify: `server/src/modules/admin/admin-dashboard.controller.ts`
- Test: `server/test/admin-dashboard.spec.ts`

**Interfaces:**
- Consumes: `ReportApprovalEntity`, authenticated admin ID.
- Produces: 403 before approval; XLSX/PDF bearing review identity and time after approval.

- [ ] Write failing tests for 403 without approval and a PDF payload containing approval data.
- [ ] Implement latest-period approval lookup and gate both export routes.
- [ ] Run focused backend tests and build.
- [ ] Commit: `feat(admin): require approved KPI exports`.

### Task 6: Bind dashboard visualizations and export state

**Files:**
- Modify: `client/src/app/features/admin/data-access/admin-dashboard-api.service.ts`
- Modify: `client/src/app/features/admin/pages/dashboard/dashboard.page.ts`
- Modify: `client/src/app/features/admin/pages/dashboard/dashboard.page.html`
- Modify: `client/src/app/features/admin/pages/dashboard/dashboard.page.scss`
- Test: `client/src/app/features/admin/pages/dashboard/dashboard.page.spec.ts`

**Interfaces:**
- Consumes: enriched overview and approval endpoints.
- Produces: data-bound payment legend/performance table and export controls disabled until approval.

- [ ] Write failing Angular tests for the dynamic legend, doctor rows, and disabled export links before approval.
- [ ] Bind dashboard components to API data without altering approved Figma layout.
- [ ] Run focused Angular tests and the Angular build.
- [ ] Commit: `feat(admin): bind reporting dashboard to live metrics`.

### Task 7: Verify migrations and full regression suites

**Files:**
- Modify: no production files expected.

- [ ] Run each branch migration against local PostgreSQL.
- [ ] Run `npm.cmd test --workspace=@ehealth/server` and `npm.cmd test --workspace=ehealth-web-client -- --watch=false --browsers=ChromeHeadless`.
- [ ] Run both workspace builds and authenticated smoke tests for overview, approval, XLSX, and PDF.
- [ ] Record any existing warnings separately from failures.
