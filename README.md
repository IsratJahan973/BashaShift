# BashaShift — Rental-to-Relocation B2C Prototype 🇧🇩

**Find a home. Arrange your move. Confirm by phone.**

BashaShift connects three roles in a single Bangladesh-specific journey: owner property posting → renter discovery and inquiry → moving inventory and quote request → nearby independent mover offers → customer chooses, calls, and confirms.

## Start here

### Option A — dependency-free interactive demo (works offline)

Open **`standalone-demo.html`** in a modern browser, keeping `src/styles.css` in the same extracted project folder. The offline demo supports rental search and filtering, owner property publishing, viewing inquiries, manual moving inventory and estimates, moving requests, area-matched worker offers, and customer booking confirmation. Records persist in that browser's `localStorage`.

The offline demo deliberately **does not** pretend to run AI. It is not a deployable public marketplace and does not synchronize between browsers.

### Option B — React + API project for development in Codex

Requires Node.js 24 and internet for dependencies.

```bash
npm ci
cp .env.example .env
# Set VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY for shared accounts
# Leave both blank to use the labeled local demo
npm run dev
```

Open `http://localhost:5173`. The `npm run dev` script starts both Vite frontend and Express backend. `npm test` runs domain, Auth/configuration, and embedded PostgreSQL migration/RLS tests. `npm run build` builds production frontend; `npm start` serves built assets with the Node API on port 8787.

Dependencies are locked in `package-lock.json`. Run `npm test` and `npm run build` after installation. See [`docs/PHASE3_QA.md`](docs/PHASE3_QA.md) for current validation results and [`docs/PHASE2_QA.md`](docs/PHASE2_QA.md) for the database foundation's verification scope.

## Render: one Web Service

`render.yaml` prepares a single Node 24 service on `feat/production-release` (Singapore, Starter, one instance, automatic deploys off). Build: `npm ci --include=dev && npm run build`; start: `npm start`; health check: `/api/health`. Render supplies `PORT`; Express binds `0.0.0.0` and serves `dist` plus `/api` on that port. No static-site service or database migration is needed.

Set `NODE_ENV=production`, `VITE_SUPABASE_URL` to the hosted project **API** origin, and `VITE_SUPABASE_PUBLISHABLE_KEY` to its public key **before building**. Rebuild after changing either public variable. The server reuses these public settings to verify renter tokens and protected roles. Production rejects missing/loopback configuration and mismatched backend project overrides. OpenAI uses only backend `OPENAI_API_KEY` (or `BASHASHIFT_OPENAI_API_KEY`); `OPENAI_MODEL` defaults to `gpt-4.1-mini`. An absent key disables scanning with a manual-entry fallback. Keep `AI_ALLOW_DEMO_SCAN=false`; production never permits the demo scan bypass.

Before live Auth verification, set Supabase Auth's Site URL and allowed signup/recovery redirect URLs to the chosen HTTPS Render origin; the app uses the current page origin. This PR does not apply these settings, deploy, or change Supabase data. Browser fixtures build with `--mode test` to exercise isolated demo/local mocks; release builds use the default production mode. [Render settings reference](https://render.com/docs/blueprint-spec).

## Phase 3: photo-assisted moving inventory

Renters can choose furniture photos, explicitly send them for analysis, review and correct suggested quantities, and apply the approved list before publishing a moving request. Manual entry remains available when AI fails or is unconfigured. The BDT estimate now shows furniture handling, vehicle base, distance, stairs, and rounding; it is an illustrative estimate, never a guaranteed moving price.

Follow [`docs/AI_SETUP.md`](docs/AI_SETUP.md) for backend-only OpenAI configuration, authenticated access, upload limits, the pricing formula, and the demo workflow. No database migration is needed for Phase 3. `npm run test:browser:ai` verifies the upload-to-request journey with **mocked OpenAI**; real-photo accuracy and hosted shared persistence still require separate verification.

## Supabase accounts and shared rentals

Follow [`docs/SUPABASE_SETUP.md`](docs/SUPABASE_SETUP.md) to create a project, apply the migration, configure email login and public environment variables, and run local integration tests. Owners, renters, and movers have separate account roles. Customer contacts stay private until an authorized selection with consent. Live mode never mixes fictional demo records into the shared database.

This release uses Node 24. Never use a service-role or secret key in frontend configuration. See [`docs/PHASE2_QA.md`](docs/PHASE2_QA.md) for implemented behavior and the distinction between local and hosted validation.

## Project layout

```text
src/                 React components, styles, demo data, and domain logic
server/              Express API, photo validation, renter verification, OpenAI integration
tests/               Domain tests and optional browser smoke tests
docs/                Requirements, architecture, handoff, QA, and screenshots
.env.example         Public Supabase configuration + server-only environment template
index.html           Vite frontend entry
standalone-demo.html Offline demo using src/styles.css
standalone-selfcontained.html  Offline demo with embedded styles
```

Run Node commands from the repository root. The source files live in these tracked directories; no copied directory overlays are needed.

## Browser smoke tests

The optional browser tests require Python 3, Playwright, and Chromium:

```bash
python3 -m pip install -r tests/requirements.txt
python3 -m playwright install chromium
python3 tests/offline_smoke.py

# Start the production app in another terminal first:
npm run build
npm start
# Then run:
python3 tests/react_smoke.py
```

For an existing Chromium installation, set `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` to its executable instead of downloading a browser. The offline test starts and stops its own local HTTP server and tests both demo files. The React test uses a running app on port 8787 by default; pass `--base-url http://127.0.0.1:5173` to test `npm run dev` instead. Both tests use isolated browser contexts and real `localStorage`; they do not change your normal browser data or make phone calls.

## What exists now

Supabase behavior below is implemented in code; hosted Auth/Storage and the full multi-account live journey still require a configured project and integration verification. See `docs/PHASE2_QA.md`.

| Feature | React starter | Offline demo |
|---|---|---|
| Property search and filters | Shared Supabase records when configured; separate demo | Implemented (browser-local) |
| Owner publish property + photo | Owner-scoped database + private photo storage integration | Implemented (browser-local) |
| Owner/tenant viewing inquiry | Shared inquiries restricted to renter/property owner | Implemented (browser-local) |
| Manual moving inventory / indicative price | Implemented | Implemented |
| Location-matched worker job feed | Database area/availability matching; private contact excluded | Implemented (area match) |
| Accept or counteroffer | Database-backed authorized offers | Implemented |
| Customer chooses worker, phone confirm | Transactional selection/reopen/confirmation; self-reported call | Implemented workflow |
| AI photo furniture recognition | Photo upload, editable review, safe manual fallback; mocked workflow tested, **real API untested** | Not supported; truthfully disclosed |
| Real accounts and multi-device shared database | Supabase integration; project setup required | Not supported |
| Identity verification and payments | **Not implemented**; Phase 2 RLS is not a full production security audit | **Not implemented** |
| Mandatory official sticker graphic | **Not included**. Visible text placeholder only. | Same |

### Safety and honest presentation

- Sample rental listings and sample workers are fictional. Do not describe them as active inventory or service providers.
- Demo prices are **illustrative formula outputs**, not verified moving-market prices.
- New listings and worker profiles in this prototype are **unverified**.
- The demonstration stores phone numbers in local browser storage: use test numbers or controlled demo data until proper authentication and server-side access rules exist. Never publish someone else's phone number without consent.
- A phone call must happen *before* a customer marks a job confirmed. Workers must not see customers' phone numbers merely by receiving a broadcast; a renter shares contact after selecting a worker.
- A real AI scan requires `OPENAI_API_KEY` set server-side. Do **not** fake AI detections or upload private photos without clear consent.

## Technology stack

- Frontend: React 19, Vite, CSS (no full UI library), Lucide icons.
- API: Node.js + Express, server-side OpenAI Responses API for optional furniture identification.
- Shared mode: Supabase Auth, Postgres, private photo storage, and database-enforced access policies.
- Demo mode: separate, clearly labeled `localStorage` data.
- Phase 3 adds reviewed AI inventory and itemized estimates; payments remain outside scope.
- Deployment once database/auth are complete: a Node-hosted web service (e.g. Render) can run `npm run build` then `npm start` with the server-side API secret. Static-only hosting cannot run this Express API without a separate backend.

## Project handoff documents

1. [`docs/REQUIREMENTS.md`](docs/REQUIREMENTS.md) — complete functional and nonfunctional requirements with completion status.
2. [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — domain entities, privacy rules, business logic, and stack choices.
3. [`docs/CODEX_HANDOFF.md`](docs/CODEX_HANDOFF.md) — ordered Codex prompts and test gates.
4. [`docs/JUDGE_REVIEW.md`](docs/JUDGE_REVIEW.md) — strict competition review, current weaknesses and realistic upside.
5. [`docs/SUBMISSION.md`](docs/SUBMISSION.md) — judges' demo script, five-slide outline, and official compliance checklist.

## Suggested 90-second judge journey

1. Search “Banasree” and narrow the rent budget.
2. Open a property; show availability and send a viewing inquiry.
3. Move directly from property details to a prefilled moving request.
4. Add furniture or trigger **real** AI photo analysis (when configured); review and correct inventory.
5. Switch to mover account in the demo, send a quote, return to customer view, choose worker, call to confirm, and show booking status.

**Positioning:** Not “Bangladesh's first rental site.” Pitch it as a **rental-to-relocation workflow with transparent mover quotes and phone-confirmed service coordination**, designed for the local market.
