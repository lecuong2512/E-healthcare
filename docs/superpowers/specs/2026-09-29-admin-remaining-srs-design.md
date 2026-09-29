# ADM-02 and ADM-03 SRS Completion Design

## Goal

Complete the unchecked administrative requirements in SRS-ADM-02 and SRS-ADM-03 without introducing digital signatures. Report release is controlled by a persisted administrator approval.

## ADM-02: Staff and Doctor Credentials

### Scope

- Create and edit medical staff accounts.
- Store a doctor professional profile: license number (CCHN), academic title, primary examination room, and assigned specialties.
- A doctor has one or more specialties. The existing `doctors.specialty_id` remains the primary specialty for backwards compatibility; `doctor_specialties` stores all assignments including the primary one.
- Administrators can activate, suspend, or block an account. No staff record is deleted by this feature.

### Data Model

`doctor_specialties` has `doctor_id`, `specialty_id`, `is_primary`, timestamps, a unique `(doctor_id, specialty_id)` constraint, and one partial unique primary-specialty index per doctor.

### API

- `GET /api/v1/admin/staff`: list staff with role and doctor profile summary.
- `POST /api/v1/admin/staff`: create account and doctor profile; doctor input requires CCHN, room, and one or more valid specialty IDs.
- `PATCH /api/v1/admin/staff/:userId`: edit professional profile and specialty assignments transactionally.
- `PATCH /api/v1/admin/staff/:userId/status`: change only the account state.

All endpoints require `ROLE_ADMIN`. Duplicate email, missing professional data, invalid specialties, and duplicate assignments return 4xx errors.

### UI

The staff screen retains the supplied Figma composition. The create/edit modal includes full name, email, temporary password for create, role, CCHN, academic title, room, and a multiple-specialty selector. Doctors display their CCHN and assigned specialty names in the list.

## ADM-03: Operational KPI and Approved Exports

### KPI Sources

- Appointment totals, completed, cancelled, and no-show counts come from `appointments` in the requested time window.
- Revenue comes only from paid appointments.
- Payment classification is grouped by appointment payment method and uses paid appointments only.
- Doctor performance groups completed appointments by doctor, joins specialty and user profile, and calculates completed cases and average completion duration from `completed_at - checked_in_at` where both timestamps exist.

### API

- `GET /api/v1/admin/dashboard/overview?days=1|7|30`: returns KPI cards, weekly trend, payment breakdown, and doctor-performance rows.
- `POST /api/v1/admin/dashboard/approve`: persists an approval for the authenticated administrator and selected period.
- `GET /api/v1/admin/dashboard/export/xlsx` and `/pdf`: require an approval by the authenticated admin for the requested period before returning a file; otherwise return 403.

### UI

The Figma layout stays unchanged. Cards, chart bars, payment donut legend, and performance table bind to the API response. Export links are disabled until approval succeeds; the approved-state block identifies the release control.

## Testing

- Service tests cover multiple specialty persistence, validation of doctor data, profile update, KPI aggregation, payment grouping, performance mapping, approval persistence, blocked export, and valid XLSX/PDF output.
- Angular tests cover staff edit form serialization, dashboard render of dynamic payment/performance data, approval state, and disabled export controls.
- Run full backend Jest suite, full Angular ChromeHeadless suite, both builds, migration, and authenticated API smoke tests against local PostgreSQL.

## Constraints

- Keep changes isolated to `feature/admin-staff` and `feature/admin-dashboard-kpi`.
- Reuse TypeORM, NestJS, Angular standalone components, and existing authentication/role guards.
- Do not implement digital signatures.
