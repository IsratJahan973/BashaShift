# Phase 3 verification — 2026-11-04

## Implemented

- Optional multi-photo furniture analysis through the Node backend and OpenAI
  Responses API; keys stay on the server.
- Explicit photo consent, editable suggested quantities, removal of mistakes,
  manual additions, and approval before publishing. Applying the reviewed list
  replaces example inventory rather than adding duplicate counts.
- Itemized BDT estimates using the existing furniture, distance, floor, and lift
  formula; estimates are illustrative and never guaranteed provider prices.
- Approved inventory and estimate connect to the existing moving-request RPC.
  Authentication, RLS, contact privacy, offers, and booking transitions remain
  unchanged. No database migrations or hosted database changes were made.
- Verified renter checks for production scans; validated and re-encoded photos,
  stripped metadata, upload limits, timeouts, rate limits, bounded concurrency,
  and honest manual fallback.

## Passed verification

Validated using Node 24.19.0 and system Chromium with Playwright 1.62.0.

- `npm test`: **38 passed, 0 failed, 0 skipped**. This includes the 22 existing
  Auth/configuration, domain, and embedded PostgreSQL/RLS checks, plus 16 new
  recognition, pricing, request-payload, and mocked AI API checks.
- Final `npm run build` passed with Supabase public variables explicitly blank
  for demo mode. Saved environment values were not changed; the supplied live
  configuration remains invalid as described below.
- `npm run test:browser:ai`: production frontend fixture build and both browser
  scenarios passed. The real UI and upload route use **mocked OpenAI output**.
  Verified photo consent, review before publishing, correction/removal, manual
  additions, a transparent BDT 3,800 estimate, and an open browser-local moving
  request without invented offers/bookings. Mobile widths 360/390px passed.
- The second browser scenario verified that unavailable AI leaves manual
  inventory unchanged, editable, and publishable.
- The browser fixture explicitly clears Supabase public configuration only in
  its child build environment. It does not alter saved environment settings or
  connect to a hosted project.

## Remaining blockers and untested behavior

- No real OpenAI key was available. Real photo-recognition accuracy, provider
  account/model access, billing, and live network behavior remain unverified.
- The supplied Supabase URL fails the existing base-project-URL validation.
  Use a project URL such as `https://<project-ref>.supabase.co`, without a
  dashboard/API path, plus a public publishable key. This validation was kept.
- Hosted login, storage, cross-device persistence, and the complete shared
  upload-to-moving-request journey remain unverified. The shared request
  payload is tested with a mocked RPC; PostgreSQL/RLS tests use local embedded
  fixtures, not hosted Supabase.
- Existing Phase 2 browser Auth and owner/renter/mover regressions were not
  rerun as part of the final save-only task. Their earlier results are recorded
  in `PHASE2_QA.md`; do not present them as new Phase 3 runs.
- No Docker operations or hosted Supabase changes were performed in Phase 3.
  Process-local AI limits need a shared limiter for a multi-instance deployment.

Follow `AI_SETUP.md` for configuration, the exact pricing formula, safeguards,
and the permissioned real-photo checks needed before the judge demonstration.
