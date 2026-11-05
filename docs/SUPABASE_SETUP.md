# Phase 2: Supabase setup

Use a **new, dedicated BashaShift Supabase project**. No project keys or database
passwords belong in Git or chat. The application needs only a public publishable
key (or legacy `anon` key); it does not need a service-role key.

## Create the hosted project

1. Create a project in the Supabase dashboard and keep its database password in
   your password manager.
2. Apply `supabase/migrations/202611040001_phase2_foundation.sql` using the SQL
   Editor. It creates the eight tables, constraints/indexes, RLS policies,
   authorized transaction functions, and the private `property-images` bucket.
   Do not turn off RLS or make the bucket public.
3. In **Authentication → Providers**, enable email/password signup. Enable email
   confirmations for the hosted project and configure email delivery/SMTP before
   inviting real users. The app handles the confirmation-required response.
4. In **Authentication → URL Configuration**, set your production Site URL and
   allow the development origins you actually use (`http://localhost:5173`,
   `http://127.0.0.1:5173`, and optionally port 8787). Add the production origin
   when deploying. Confirm signup and password-recovery links return to an
   allowed app origin; password-reset emails redirect to the current app origin.
5. Copy the Project URL and **publishable** key from the project's API settings.
   Copy `.env.example` to `.env` and set:

   ```dotenv
   VITE_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
   VITE_SUPABASE_PUBLISHABLE_KEY=
   ```

   Enter your actual public key locally or in deployment environment settings.
   The legacy `VITE_SUPABASE_ANON_KEY` is also supported. Never put a secret key,
   service-role key, JWT signing secret, or database password into any `VITE_*`
   variable. Vite embeds public configuration at build time; rebuild after edits.
   If `.env.local` exists, it overrides `.env`; remove the generated local test
   configuration before switching to a hosted project.
6. In a restricted cloud environment, allow your exact project hostname for HTTPS
   and WebSocket access. Keep the managed proxy and TLS verification enabled.
7. Use Node 22+ (Node 24 recommended), then run `npm ci`, `npm test`, and
   `npm run build`. Start development with `npm run dev`, or serve the built app
   with `npm start`.

Instead of SQL Editor, developers with Supabase CLI can run `supabase login`,
`supabase link --project-ref YOUR_PROJECT_REF`, review `supabase db push --dry-run`,
then run `supabase db push`. **Choose one migration method.** If SQL Editor was
used first, record the migration as applied with CLI migration repair before
later CLI pushes, rather than applying the same table creation twice. Do not
apply this foundation blindly to a project already used by another application.

## User roles and application behavior

- Each account chooses Property Owner, Renter, or Moving Service Provider at
  signup. The database stores that role once. Changing Auth user metadata does
  not change authorization; clients cannot change the profile role.
- Users can request a password-recovery email from sign-in and set a new
  password from the secure Supabase recovery session. Hosted recovery links must
  use an allowed redirect origin, with email delivery configured for the project.
- Owners create/edit/publish/unpublish their own properties and acknowledge
  their properties' viewing inquiries. A failed photo upload leaves a new
  listing as a draft, not falsely published.
- Anyone can browse published rentals. Renters can send inquiries, access the
  contacted owner's phone, create moving requests/inventory, compare offers,
  choose a mover, reopen a selection, and confirm after a phone conversation.
- Movers maintain their own area/availability and offer on matching open
  requests. Before selection, the feed contains area/date/inventory/estimate
  only. Phone numbers, precise addresses, and private notes are excluded at the
  database privilege level. Only the selected mover with renter consent can
  retrieve the customer's contact details; reopening revokes that access.
- Email login is not identity, property ownership, or provider verification.
  Listings and providers remain explicitly unverified. No payment or new AI
  integration was added in this phase.
- Public visitors browse published database listings. Actions require the correct
  account role. Missing configuration shows an unavailable state; failed writes
  never fall back to local fake success. Legacy `?demo=1` URLs cannot change this.
- Published property changes use Realtime. Other authorized records refresh on
  focus, every 15 seconds, or via **Refresh listings**. Do not add profiles,
  inquiries, or moving requests with private columns to a Realtime publication.

## Local development and integration tests

Install Docker and a supported Supabase 2 CLI. The committed config was read by
CLI 2.75.0 during local startup attempts (see the QA report for their limit). The CLI
is a separate development tool, not an application runtime dependency. Official
install instructions: https://supabase.com/docs/guides/local-development/cli/getting-started

```bash
supabase start
# The committed local config disables email confirmation ONLY for local tests.
# Hosted email confirmation must remain enabled as described above.
npm run db:env
npm run test:integration
npm run build
npm start
# In another terminal with Python/Playwright and Chromium installed:
npm run test:browser:live
```

`db:env` refuses to overwrite an existing `.env.local`. It writes only the public
local URL/key to that ignored file. The test helper reads local credentials
directly from CLI output without printing them, refuses non-loopback endpoints,
and passes the local administrative test credential only to the test process.
No application client or committed environment template uses that credential.

Set `SUPABASE_CLI=/path/to/supabase` if the CLI is not on PATH. Use
`PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/path/to/chromium` for an existing browser.
If the default ECR image registry is unavailable, the CLI officially supports
`SUPABASE_INTERNAL_IMAGE_REGISTRY=docker.io supabase start`. Do not disable TLS
or bypass destination-policy denials. The cloud task may require its supported
command escalation for Docker, local networking, and browser processes.

The local PostgreSQL version is configured in `supabase/config.toml`. Match your
hosted version when using schema-diff tools. `supabase db reset --local` deletes
the local project's data; use it only on your disposable development instance.

Isolated automated checks:

```bash
npm test
PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/path/to/chromium npm run test:browser:auth-ui
PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/path/to/chromium npm run test:browser:ai
```

`npm test` includes real migration/RLS execution in embedded PostgreSQL, with
fixtures for Supabase platform schemas. `test:browser:auth-ui` deliberately mocks
Auth HTTP responses to check the account UI; it is not a hosted Auth test. These
fast checks do not require Docker or a cloud project. See the QA report for their
precise scope and the separate real integration commands above.

## Required hosted verification

Local tests cannot prove your hosted configuration, mail delivery, network
allowlist, or deployed environment variables. After setup, use separate browser
profiles for an owner, renter, eligible mover, and unrelated user. Verify signup
and confirmation email, login/logout, owner publication and photo visibility,
cross-device search/inquiry, unauthorized edits, matching requests, hidden
contact fields, selection/contact sharing, reopening, and final confirmation.
See `docs/PHASE2_QA.md` for exactly what was tested in this change.
