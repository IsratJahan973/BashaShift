# Phase 2 implementation and verification — 2026-11-04

## Implemented

- Supabase client configured with public environment variables. Runtime and
  build-time validation reject server secrets and incomplete configuration.
  Node 22+ is required by the pinned Supabase SDK.
- Email/password registration, confirmation-pending state, login/logout,
  restored sessions, and owner/renter/mover workspaces. One immutable role per
  account; provider/identity/phone verification is not claimed.
- Eight-table PostgreSQL migration with relationships, checks, indexes, RLS,
  explicit column grants, and authorized transaction functions.
- Owner-only listing creation/editing/publication/unpublication, private photo
  upload integration, published-property search, and participant-only inquiries.
- Shared moving requests/inventory, eligible mover offers, transactional
  selection/reopening/confirmation, and selected-party contact access.
- Separate, labeled demo mode. Shared records are not copied to the custom demo
  localStorage dataset. Supabase Auth persists its own session as usual.
- Public property Realtime subscription and authorized periodic/focus/manual
  refresh. Private contact tables are not published to Realtime.

## Passed checks

Validated with Node 24.19.0 and system Chromium using Python Playwright 1.62.0.

- Production frontend build; Express production startup/health.
- `npm test`: **22 tests passed, 0 failed, 0 skipped**:
  - 5 original domain tests;
  - 6 Auth/configuration contract tests (Auth calls mocked);
  - 1 build preflight test rejecting a server-secret key without logging it;
  - 10 migration/RLS tests executing the real migration in embedded PostgreSQL
    (PGlite), including ownership, roles, private photo policies, inquiry access,
    private column/profile/contact scraping, invalid-input rollback, offer
    eligibility, booking transitions, contact revocation, and uniqueness.
- `npm run test:browser:auth-ui`: all three role scenarios passed. The **real
  React UI and Supabase SDK use explicitly mocked HTTP responses**. Verified
  registration payloads, confirmation-required state without a session, failed
  login, successful login/logout, role workspaces, demo isolation, mobile width,
  and absence of page errors. This is not a live Auth/email test.
- Existing React **demo** owner/renter/mover regression journey passed.
- Both offline demo smoke tests passed.

The embedded database tests use small fixtures for Supabase's `auth`/`storage`
schemas and `auth.uid()` caller claims; they use PostgreSQL's actual constraints,
privilege checks, RLS, and PL/pgSQL execution. They do not verify Supabase JWT
signature validation, email delivery, Storage HTTP, or Realtime delivery. The
unique-index/state tests do not substitute for a parallel HTTP race test.

## Blocked or not executed

- **No hosted Supabase project was configured in this task.**
  The user requested new-project instructions. No cloud migration was applied,
  and hosted accounts/shared data have not been demonstrated across devices.
- The full local Supabase stack could not initialize in the managed Docker
  filesystem: the default ECR host was denied, and the supported Docker Hub
  source ultimately failed to register the database image with **no space left
  on device**. Both PostgreSQL 17 and the smaller supported 15 image were
  investigated. No health check was bypassed and RLS was never disabled.
- `npm run test:integration` contains real local Supabase Auth/PostgREST/Storage
  tests, including parallel offer selection. **Those tests remain unexecuted**
  because the stack never became ready. The helper refuses non-loopback targets.
- `npm run test:browser:live` contains the real multi-account browser journey.
  **It remains unexecuted** and must be run against a working local instance or
  adapted safely for a dedicated hosted test project.
- Hosted signup/confirmation emails, hosted login/session refresh, actual photo
  uploads/signed URLs, cross-device sharing, and Realtime transport still need
  project configuration and end-to-end verification.

## Next integration step

Follow `docs/SUPABASE_SETUP.md`: create a dedicated project, apply the migration,
enable/configure email authentication and redirect origins, set the public URL
and publishable key, allow the project hostname in restricted environments, and
rebuild. Test with separate owner, renter, eligible mover, and unrelated-user
sessions. Never provide service-role credentials to the browser or disable RLS
to make a failing check pass.

AI and payments were not implemented in this phase. The existing optional AI
endpoint was left unchanged and remains outside this verification scope. These
checks do not establish production readiness or replace a deployment review.
