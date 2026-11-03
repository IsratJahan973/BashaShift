# BashaShift — Rental-to-Relocation B2C Prototype 🇧🇩

**Find a home. Arrange your move. Confirm by phone.**

BashaShift connects three roles in a single Bangladesh-specific journey: owner property posting → renter discovery and inquiry → moving inventory and quote request → nearby independent mover offers → customer chooses, calls, and confirms.

## Start here

### Option A — dependency-free interactive demo (works offline)

Open **`standalone-demo.html`** in a modern browser, keeping `src/styles.css` in the same extracted project folder. The offline demo supports rental search and filtering, owner property publishing, viewing inquiries, manual moving inventory and estimates, moving requests, area-matched worker offers, and customer booking confirmation. Records persist in that browser's `localStorage`.

The offline demo deliberately **does not** pretend to run AI. It is not a deployable public marketplace and does not synchronize between browsers.

### Option B — React + API project for development in Codex

Requires Node.js 20.19+ and internet for dependencies.

```bash
npm ci
cp .env.example .env
# Add OPENAI_API_KEY to the server's .env (not the frontend)
npm run dev
```

Open `http://localhost:5173`. The `npm run dev` script starts both Vite frontend and Express backend. `npm test` runs pure domain tests. `npm run build` builds production frontend; `npm start` serves built assets with the Node API on port 8787.

Dependencies are locked in `package-lock.json`. Run `npm test` and `npm run build` after installation. See [`docs/QA_RESULTS.md`](docs/QA_RESULTS.md) for validation results and remaining limitations; live AI still requires a server-side key and a separate real-photo test.

## Project layout

```text
src/                 React components, styles, demo data, and domain logic
server/index.mjs     Express API and production dist/ serving
tests/               Domain tests and optional browser smoke tests
docs/                Requirements, architecture, handoff, QA, and screenshots
.env.example         Server-only environment template
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

| Feature | React starter | Offline demo |
|---|---|---|
| Property search and filters | Implemented (browser-local) | Implemented (browser-local) |
| Owner publish property + photo | Implemented (browser-local) | Implemented (browser-local) |
| Owner/tenant viewing inquiry | Implemented (browser-local) | Implemented (browser-local) |
| Manual moving inventory / indicative price | Implemented | Implemented |
| Location-matched worker job feed | Implemented (area match, not GPS) | Implemented (area match) |
| Accept or counteroffer | Implemented | Implemented |
| Customer chooses worker, phone confirm | Implemented workflow | Implemented workflow |
| AI photo furniture recognition | Server endpoint implemented, **not live-tested**; requires API key | Not supported; truthfully disclosed |
| Real accounts and multi-device shared database | **Not implemented** | **Not implemented** |
| Identity verification, payments, production security | **Not implemented** | **Not implemented** |
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
- Current demo data: `localStorage` for one-browser interaction.
- Next production step: Supabase Postgres + Auth + Storage + RLS + realtime subscriptions.
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
