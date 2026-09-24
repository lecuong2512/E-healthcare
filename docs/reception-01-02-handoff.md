# REC-01 / REC-02 handoff

Updated: 24 September 2026. Branch: `feature/SRS-REC-01-02-reception-integration`.

## Implemented

| Area | State | Evidence |
| --- | --- | --- |
| Existing appointment lookup, payment and check-in | Implemented | Reception facade and check-in desk |
| Payment commit consistency | Implemented | Receipt is stored when POST succeeds; a failed refresh keeps it and blocks a second collection |
| Receipt reload | Implemented | Paid appointment calls `GET /reception/appointments/:id/receipt` before printing |
| Walk-in quick modal | Implemented | `/receptionist/checkin` opens a modal and submits `POST /reception/walk-in` directly |
| Patient selection and CCCD conflicts | Implemented | Candidate selection retries with the same idempotency key; server conflict message is shown |
| Walk-in session isolation | Implemented | Opening, closing and starting another booking clear transient state |
| Queue realtime recovery | Implemented | `auth.expired` persists until a new access token reconnects the socket and requests `queue.sync` |
| Queue summary | Implemented | Displays waiting and consultation counts without a false global queue number |

The full-page `/receptionist/walkin` route remains a fallback using the same presentation component and facade.

## Verification

- Shared type-check: passed.
- Frontend production build: passed.
- Frontend ChromeHeadless suite: 91 passed.
- Backend build: passed.
- Backend unit suite: 205 passed.
- PostgreSQL reception integration: not run; no dedicated `TEST_DATABASE_URL` is available.
- Runtime E2E smoke: not run; no reception test stack or test accounts are available.
- Backend owner, Tech Lead, Test Lead and Mentor review: pending.

The card is ready for the remaining environment-dependent gates and review; it is not marked merged or fully signed off.
