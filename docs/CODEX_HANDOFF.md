# Codex handoff — execute in this order

## First prompt to paste into Codex

> You are my strict senior full-stack engineer and reviewer for BashaShift, a Bangladesh rental-to-relocation B2C hackathon project. Read README.md, docs/REQUIREMENTS.md, docs/ARCHITECTURE.md, docs/JUDGE_REVIEW.md, and inspect the source before editing. We have under two days before submission. Preserve all working demo flows and the simple Bangla mover UX. Make small verified changes, run tests and the build, and show me exact changes and failures. No fake AI results, fake verified worker identities, or claims of live sample listings. The P0 goal is a secure working cross-device owner→renter→mover journey with one real AI furniture photo feature. Start by running `npm install`, `npm test`, and `npm run build`, then report any issues and a prioritized fix list. Do not rewrite the whole app.

## Sprint 1 — establish a working codebase (first)

- [ ] Run Node 20.19+; `npm install` successfully; `npm test`; `npm run build`.
- [ ] Fix any runtime/build issues, accessibility or form bugs, and check mobile 360px width.
- [ ] Test the offline `standalone-demo.html` as a reference if React flow is broken.
- [ ] Add a repeatable Playwright smoke test for the main React user journey.

**Gate:** homepage, owner, moving, worker and activity all load with zero console errors. Zero fake “verified” claims.

## Sprint 2 — make it a real web app, not browser-local

> Integrate Supabase Auth, Postgres, and Storage using safe RLS. Preserve page designs. Implement owner-create/read property, renter viewing inquiry, mover profile, area-matched moving request feed, offers and selection from real database; migrate demo seed records to clearly labeled data. Ensure users on separate browsers see live changes and the same phone contact only becomes available when authorized. Add minimal SQL migration(s) in supabase/migrations, explain roles, and test RLS as owner, renter, and unrelated worker. Do not put the service-role secret in the browser.

Recommended order: properties/inquiries → worker profiles/requests → offers/selection/contact security. Do not attempt payments, SMS, reviews or GPS.

**Gate:** Owner on browser A creates a property; renter on B sees it. Renter on A makes request; matching worker on B responds; renter on A selects; only then contact info appears to appropriate participants. Competing offers cannot both be confirmed.

## Sprint 3 — real and demonstrable AI (one feature only)

> Connect the existing Express `/api/scan` endpoint to OpenAI using a securely configured server key. Test real furniture photographs with consent; extract only visible objects, return structured labels and confidence, allow user editing, and calculate prices with deterministic rules. Handle timeouts, API errors, file size, rate limits and costs. Put the exact model/configuration in documentation. DO NOT show mock furniture results as if AI recognized them.

**Gate:** Upload 3 different owned furniture photos; server produces different sensible category suggestions; user can correct quantities, submit move request, and show items to worker. Clearly label price as illustrative.

## Sprint 4 — competition compliance and polish

> Replace the temporary Buildathon text placeholder with the **organizer-provided official sticker image**, visibly near top. Add clear bilingual worker labels, loading/empty/error states, a demo walkthrough, responsive and accessibility fixes, and production env setup. Deploy and verify from an incognito window/mobile. Make the live link public and test every flow after deployment. Prepare a <=5-slide deck and optionally an English 60–90s product demo.

**Gate:** No console errors on production, AI key unavailable in JS bundle, all judge links open without private permissions, official sticker present, sample records conspicuously labeled.

## Stop rule

If database/auth integration is not passing the cross-device gate by the end of Day 1, lock scope: finish a smaller but reliable production experience (owner properties + one move flow) and keep limitations clear. Do not introduce untested complexity to impress judges.

## Suggested QA commands

```bash
npm test
npm run build
npm run dev
# In another terminal check backend health:
curl http://localhost:8787/api/health
```

## What to report back after every Codex task

1. Files changed.
2. Requirements IDs implemented and tested.
3. Screenshots or exact steps proving the user journey.
4. Remaining bugs, blockers and security gaps.
5. Whether `npm test` and `npm run build` pass.

A feature is not finished merely because Codex says it is.
