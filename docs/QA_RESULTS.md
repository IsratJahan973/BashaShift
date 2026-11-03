# Verification evidence (2026-11-04, Bangladesh time)

This is the historical structure-repair report for commit `1abb5ee`. For the
current Supabase/authentication work, see [PHASE2_QA.md](PHASE2_QA.md).

## Repository repair

The flattened upload was restored to its intended tracked layout: React code in
`src/`, the API in `server/`, tests in `tests/`, and handoff documents/screenshots
in `docs/`. `env.example` and `download` were restored to `.env.example` and
`.gitignore`. The original React, domain, and API source files and the five
domain tests were moved without changing their contents. No application features
were added. No temporary directory overlays are required.

## Checks completed

Validated with Node 24.19.0, npm 11.9.0, Python Playwright 1.62.0, and system
Chromium. Networking and browser processes required the supported command
sandbox escalation in this cloud instance; proxy settings and TLS verification
were preserved.

- `npm ci --no-audit --no-fund`: **PASS** from the committed lockfile. Every
  resolved package in the lockfile includes its registry URL and integrity hash.
- `npm test`: **PASS, 5 named tests**, 0 failed, 0 skipped: estimates/staircase
  charges, area matching, offer/selection/reopening, duplicate pending offers,
  and Bangladeshi phone validation. A sandboxed run reported only a file-level
  test; the full five-test result was verified outside that sandbox.
- `npm run build`: **PASS**, Vite production build.
- `npm start`: **PASS**, API and built frontend served on port 8787.
- `npm run dev`: **PASS**, Vite on 5173 and API on 8787.
- `GET /api/health`: **PASS**, HTTP 200 with `ok: true` and
  `aiConfigured: false`. The React dev smoke test also checks this through
  Vite's `/api` proxy.
- `POST /api/scan` without a key: **PASS**, HTTP 503 with the expected
  configuration error. This is not a live AI test.
- Production homepage and SPA fallback: **PASS**, HTTP 200 and built HTML.
- `python3 tests/offline_smoke.py`: **PASS for both offline HTML demos**:
  stylesheet loading, area/budget filters, request → offer → selection →
  confirmation, real browser-storage persistence after reload, 390px mobile
  width, and no JavaScript page errors. The test serves the existing files over
  a temporary local HTTP origin because managed Chromium blocks file URLs.
- `python3 tests/react_smoke.py`: **PASS against production**. Also passed
  against Vite with `--base-url http://127.0.0.1:5173`: filters, owner listing,
  viewing inquiry and acknowledgment, property-prefilled move, mover offer,
  decline/reoffer/confirmation, customer-contact visibility, real storage
  persistence after reload, 390px mobile width, stylesheet loading, and no
  JavaScript page errors.

Browser commands used
`PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium`. See the README for
Playwright installation and commands for other machines. The screenshot files
are the original illustrative offline previews; they were not regenerated as
evidence of these runs.

## Remaining limitations

- Live AI image analysis is **NOT TESTED**: no `OPENAI_API_KEY` is configured.
  The unconfigured response is verified; real furniture recognition is not.
- These checks cover the listed browser-local workflows. They do not establish
  real accounts, cross-device synchronization, database access controls,
  identity verification, payments, or production readiness; those capabilities
  remain unimplemented as described in the requirements.
- No public deployment, official organizer sticker, full accessibility audit,
  or cross-browser matrix was completed in this repair.
