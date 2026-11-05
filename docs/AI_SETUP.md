# Phase 3: furniture photos and moving estimates

This phase extends `feat/supabase-auth-foundation`. It adds no database migration
and does not change RLS, contact permissions, offers, or booking transitions.

## Setup

1. Use Node 24, run `npm ci`, and copy `.env.example` to `.env`.
2. For shared accounts, follow `SUPABASE_SETUP.md`. Set the **base project URL**
   (`https://<project-ref>.supabase.co`, without a dashboard/API path) and its
   public publishable key in `VITE_SUPABASE_URL` and
   `VITE_SUPABASE_PUBLISHABLE_KEY`. The Node server needs these same public
   values to verify the renter's session and protected profile role. Server-only
   `SUPABASE_URL` / `SUPABASE_PUBLISHABLE_KEY` are supported alternatives. No
   service-role key is required. Do not change a hosted database for Phase 3.
3. Set server-only `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_AI_TOKEN` (Workers AI
   Read/Edit on that account), and
   `CLOUDFLARE_VISION_MODEL=@cf/mistralai/mistral-small-3.1-24b-instruct`.
   Mistral is also the default when the model variable is absent or blank.
   Its [documented schema](https://github.com/cloudflare/cloudflare-docs/blob/production/src/content/workers-ai-models/mistral-small-3.1-24b-instruct.json)
   uses a user `messages` entry with `text` and `image_url` content parts; the
   latter contains a sanitized `data:image/jpeg;base64,...` URI. Mistral's documented
   `guided_json` requests the inventory schema. The model schema describes
   `result.response` text; [structured output](https://developers.cloudflare.com/workers-ai/features/json-mode/)
   may already be an object. Both are strictly validated. A directly structured
   `result` inventory is also accepted only if its exact schema is valid.
   One JSON object inside prose/a fence is accepted; conflicting or incomplete
   JSON is rejected without repairing counts or inventing fields. Multiple photos are combined
   into one bounded contact sheet so views are considered together.
   Eligible accounts may explicitly select
   `CLOUDFLARE_VISION_MODEL=@cf/meta/llama-3.2-11b-vision-instruct`, which retains
   `prompt` plus raw base64 `image` input. Llama requires an authorized owner's
   Meta license/AUP agreement. The app never accepts terms or switches between
   Cloudflare models automatically after a failure. Unknown model names disable
   Cloudflare scanning instead of sending images to an untested endpoint.
4. OpenAI is optional backup only: set `AI_ENABLE_OPENAI_FALLBACK=true` and
   backend `OPENAI_API_KEY` (or `BASHASHIFT_OPENAI_API_KEY`) to opt in. A key alone
   never triggers OpenAI. `OPENAI_MODEL` defaults to `gpt-4.1-mini`. Both providers
   share the scan deadline; cancellation never starts a backup request. Never put
   any provider credentials in `VITE_*`, Git, frontend code, or browser storage.
   Allow HTTPS to `api.cloudflare.com`, the exact Supabase project hostname, and
   `api.openai.com` only if backup is enabled. Preserve proxy and TLS trust.
5. Run `npm run dev`, or `npm run build` followed by `npm start` (port 8787).
   Serve the frontend and `/api` together; Vite proxies `/api` during development.
   Restart Node after changing server variables; rebuild after changing public
   Vite variables. `/api/health` reports configuration flags, not key validity
   or provider connectivity.

Missing keys, expired sessions, unavailable providers, and failed scans leave
manual inventory usable. Incorrect Supabase public configuration intentionally
fails the build; correct it instead of bypassing validation.

All scans require an authenticated renter, including local development. No account bypass or production mock-response switch exists.

## Renter workflow

1. Sign in as a renter → Moving services; a property can prefill the destination.
2. Choose up to three JPEG, PNG, or WEBP photos (3 MiB each, 6 MiB combined).
3. Confirm permission to send photos to Cloudflare Workers AI (and optional OpenAI backup), then choose **Analyze photos**.
4. Review the suggested categories, confidence, and quantities. Use 0 to remove
   mistakes. **Apply reviewed inventory** replaces the current list to avoid
   counting the same furniture twice. Add missing items with the manual controls.
   **Keep manual inventory** discards suggestions without changing the list.
5. Set distance, floors, and lift availability. Check the itemized BDT estimate.
6. Enter contact details and consent, then publish through the existing authorized
   `create_moving_request` transaction. Approved inventory is saved; the illustrative
   estimate is not stored as a mover quotation.
7. Eligible movers may offer a price. Selection and phone confirmation remain
   separate actions; neither AI nor request submission creates a booking.

## Transparent illustrative pricing

The editable example assumptions remain base 850 BDT, 45/km, 150/effort unit,
20/stair-floor × unit, workload 1 and range ±20%. These are illustrative inputs,
not verified Bangladeshi market prices. The collapsed calculation shows the
formula and effort units. Distance, floors, lift and approved inventory update
the range automatically. Independent movers set their own final quotations.

## Photo and API safeguards

- Production requests require a Supabase-verified user and protected `renter`
  profile. Editable Auth metadata is not a source of authorization.
- The server checks consent, count, canonical base64, actual format signatures,
  decoded type, animation, file bytes, and a 20-megapixel input limit. Sharp fully
  decodes/re-encodes to bounded JPEGs and removes EXIF/location metadata.
- The browser also checks limits and resizes previews. Selected photos stay in
  page memory; the app does not save inventory photos to disk, localStorage, or
  Supabase. The backend sends sanitized photos to Cloudflare only after consent; optional OpenAI backup requires explicit server configuration.
  Responses use `store:false`; this is not a promise that the provider has zero
  retention. Review the provider's current data policy before using real homes.
- Strict response parsing accepts only catalog categories, integer counts, and
  confidence values. Empty/invalid responses never create invented detections.
- AI requests have a 25-second timeout and cancel on disconnect. Defaults are
  five scan attempts per user per minute, 40 pre-auth attempts per IP per minute,
  and two concurrent scans per Node process. Errors do not echo provider bodies
  or credentials. Limits are process-local; deployments with multiple instances
  need shared rate limiting and correctly configured edge/proxy limits.
- Existing database contact rules stay in place. Unselected movers receive no
  customer phone, exact address, or private notes from this feature.

## Verification

Run `npm test`, `npm run build`, `npm run test:browser:ai`, and
`npm run test:browser:auth-ui`. Browser tests need Python dependencies in
`tests/requirements.txt` plus Chromium; set
`PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` if using a system installation.
The AI browser test uses seven isolated authenticated browser contexts and real
production SQL/RLS in embedded PostgreSQL, with **mocked Auth HTTP and Cloudflare**.
It exercises sanitation, review, manual fallback, requests, independent quotations,
selection, contact privacy and confirmation. This does not establish hosted
Auth or live provider accuracy.

### Minimal live check after an owner-approved deployment

1. Manually deploy the reviewed fix on Render. Set server-only
   `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_AI_TOKEN` with Workers AI Read/Edit on that
   account, `CLOUDFLARE_VISION_MODEL=@cf/mistralai/mistral-small-3.1-24b-instruct`,
   and `AI_ENABLE_OPENAI_FALLBACK=false` to isolate Cloudflare. Existing Render
   services may need the model variable set manually; this does not require a
   Supabase change. Keep
   `AI_ALLOW_DEMO_SCAN=false` and the working Supabase public configuration.
   No Meta agreement is requested for Mistral; account API access must still be
   confirmed. Never accept terms or bypass eligibility to perform this check.
2. Sign in with an existing renter account at `https://bashashift.onrender.com`.
   In Moving services, upload one permissioned JPEG/PNG of a clearly visible
   supported item (such as a bed or sofa), consent, and click **Analyze photos**. Watch `/api/scan` in
   the browser Network panel; do not copy/share its Authorization header or image.
3. Require HTTP 200, `source:"cloudflare"`,
   `model:"@cf/mistralai/mistral-small-3.1-24b-instruct"`,
   `reviewRequired:true`, and sensible quantities for the actual photo. Suggestions
   must await **Apply reviewed inventory**; discard them to leave data unchanged.
   Do not publish a moving request or select a quotation to perform this check.
4. On failure, copy only the response's `X-Request-ID`. Find that ID in Render
   logs: diagnostics contain `httpStatus`, numerical `providerCode` (or null),
   and `requestId`. Parser failures also include `stage` (`provider_json`,
   `provider_envelope`, `response_shape`, `inventory_json`, or `inventory_schema`)
   and `responseShape` with type labels only. No provider content, keys, images,
   credentials, or personal data are logged. Per [Cloudflare's error reference](https://developers.cloudflare.com/workers-ai/platform/errors/),
   5016 means missing model agreement (owner action); 5004 means invalid image
   input; 401/403 can mean token/account permissions or eligibility; 429/3036
   means quota; 408/3007/3008 means timeout/abort. Null status means no HTTP
   response arrived. Check manual **Add** controls still work after failure.

Health configuration flags, Playground results, and mocked tests do not prove
authenticated inference. Confirm Mistral image inference with the production
account using the procedure above before claiming live AI success.
