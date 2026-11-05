# BashaShift

Find a home. Plan your move. Compare independent mover quotations and confirm by phone.

React + Vite, Express, Supabase Auth/PostgreSQL/Storage/RLS, and server-only Cloudflare Mistral furniture recognition. Public visitors browse published listings; owner, renter and mover actions require the appropriate authenticated account. There is no public demo mode or local fake-data fallback.

## Development

Requires Node.js 24. Copy `.env.example` to `.env`, set the Supabase project API URL and public key, then run:

```bash
npm ci
npm run dev
```

Vite runs on port 5173 and proxies `/api` to Express. Never use service-role, OpenAI or Cloudflare secrets in `VITE_*` variables.

## Render

`render.yaml` keeps one **Free** Node Web Service in Singapore on `feat/production-release`, with automatic deploys off.

- Build: `npm ci --include=dev && npm run build`
- Start: `npm start`
- Health: `/api/health`; Render supplies `PORT`.
- Public build configuration: `VITE_SUPABASE_URL` (project API origin), `VITE_SUPABASE_PUBLISHABLE_KEY`.
- Backend only: `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_AI_TOKEN`, `CLOUDFLARE_VISION_MODEL=@cf/mistralai/mistral-small-3.1-24b-instruct`.
- Optional driving routes: backend-only `HEIGIT_API_KEY`. Missing keys, unsupported areas and same-neighborhood moves use explicit manual distance; no road kilometers are invented. The provider uses the [current HeiGIT endpoint](https://ask.openrouteservice.org/t/deprecating-api-openrouteservice-org-in-favour-of-api-heigit-org/7912).
- Optional OpenAI backup is disabled unless `AI_ENABLE_OPENAI_FALLBACK=true` and a backend key are configured.

Renters can take photos or choose from their gallery (up to three); rear-camera capture is a browser hint. Owners can upload/reorder up to six room photos using the existing private bucket and image table. Text edits retain existing photos. New files upload before metadata changes; failed changes attempt metadata rollback and retain original files when recovery cannot be confirmed.

Health reports configuration, not successful inference. Scanning requires renter authentication, photo consent and human review. Failed recognition preserves manual inventory. Apartment ranking and illustrative moving estimates use deterministic calculations; assumptions are editable and are not verified market rates. Movers choose their own final prices. Contact access uses existing authorized Supabase transactions.

## Validation

```bash
npm test
npm run build
npm run test:browser:auth-ui
npm run test:browser:ai
# Routing-only subset:
npm run test:browser:routes
```

Browser tests require Python dependencies from `tests/requirements.txt` and Playwright Chromium. Set `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` to use a system browser. The AI browser suite uses seven isolated accounts and the production SQL/RLS in embedded PostgreSQL, with **mocked Auth/Storage HTTP, Cloudflare, routing and map tiles**, never hosted customer data. It covers the full owner → renter → mover → confirmed booking flow, manual fallback and 360/390px layouts. Local Supabase integration commands remain available in `package.json`; they require a disposable local Supabase instance.

See [acceptance results](docs/ACCEPTANCE_QA.md) and [authenticated live scan steps](docs/AI_SETUP.md#minimal-live-check-after-an-owner-approved-deployment). No migrations or deployment are part of this change.
