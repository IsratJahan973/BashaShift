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
- Optional OpenAI backup is disabled unless `AI_ENABLE_OPENAI_FALLBACK=true` and a backend key are configured.

Health reports configuration, not successful inference. Scanning requires renter authentication, photo consent and human review. Failed recognition preserves manual inventory. Apartment ranking and illustrative moving estimates use deterministic calculations; assumptions are editable and are not verified market rates. Movers choose their own final prices. Contact access uses existing authorized Supabase transactions.

## Validation

```bash
npm test
npm run build
npm run test:browser:auth-ui
npm run test:browser:ai
```

Browser tests require Python dependencies from `tests/requirements.txt` and Playwright Chromium. Set `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` to use a system browser. The AI browser suite uses seven isolated accounts and the production SQL/RLS in embedded PostgreSQL, with **mocked Auth HTTP and Cloudflare**, never hosted customer data. It covers the full owner → renter → mover → confirmed booking flow, manual fallback and 360/390px layouts. Local Supabase integration commands remain available in `package.json`; they require a disposable local Supabase instance.

See [acceptance results](docs/ACCEPTANCE_QA.md) and [authenticated live scan steps](docs/AI_SETUP.md#minimal-live-check-after-an-owner-approved-deployment). No migrations or deployment are part of this change.
