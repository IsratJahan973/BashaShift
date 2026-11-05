# Submission acceptance: issues #10 and #11

PR #13 targets `feat/production-release` from `8ddee44`. No merge or deployment.
Public demo paths have been retired; existing ranking, pricing, Cloudflare provider
and Supabase SQL/RLS/booking functions are unchanged.

## Evidence boundaries

The seven actors and every `TEST` property/request live only in a fresh in-memory
PGlite database. The suite executes the existing migration, PostgreSQL roles,
RLS policies, triggers and booking/contact RPCs. Hosted Auth and Cloudflare HTTP
responses are mocked. No hosted accounts, listings, schema or customer records
were created or modified. No production mocks or application features were added.
The browser suite also uses the real SQL/RLS in a separate disposable database
with seven HTTP-authenticated contexts; its Auth service and provider are fixtures.

## Actor results

| Actor | Local acceptance | Evidence | Hosted acceptance |
|---|---|---|---|
| R1 | PASS | Banasree, ≤20,000, ≥2 beds, required lift → P1 only; reviewed inventory; three offers; chooses M2 and confirms | NOT TESTED |
| R2 | PASS | Banasree, ≤25,000, ≥3 beds, required parking → P2 only; Banasree→Rampura request excluded from all Rampura movers | NOT TESTED |
| R3 | PASS | Mirpur, ≤14,000, ≥1 bed → P4 only; independent request; decline/reopen revokes contact; new M3 booking | NOT TESTED |
| O1 | PASS | Creates seven clearly marked fixtures (five matrix homes, draft and demo cases); edits/unpublishes; acknowledges R1 viewing; cannot quote | NOT TESTED |
| M1 | PASS | Only Rampura pickups; own 2,500 TEST quotation; unselected on R1; no R1 contact; R3 contact revoked after reopen | NOT TESTED |
| M2 | PASS | Own 3,000 TEST quotation; selected although not cheapest; exclusive R1 contact; cannot confirm on renter's behalf | NOT TESTED |
| M3 | PASS | Own 3,400 TEST quotation; unselected on R1; no R1 contact; independently selected/confirmed for R3 afterward | NOT TESTED |

## Recommendation and privacy results

| Scenario | Local result | Expected behavior |
|---|---|---|
| Hard rental requirements | PASS | R1/P1, R2/P2, R3/P4 across every ranking priority; P5 fails R1's lift requirement |
| Missing/unknown facilities, draft/demo and zero listings | PASS | No invented matches; unpublished/demo records excluded; empty result remains empty |
| Preference ordering | PASS | Separate eligible P1/P2 comparison: Banasree, budget 22,500, ≥2 beds, required lift, optional parking. Affordability → P1; facilities → P2. Hard filters stay unchanged |
| Honest explanations | PASS | UI says matches your filters; optional preferences alone show exact/partial; at most two short reasons, collapsed plain-English explanation, no visible score or weights |
| Pickup eligibility | PASS | M1/M2/M3 see Rampura→Banasree and Rampura→Mirpur, never Banasree→Rampura; ineligible insertion rejected by RLS/trigger |
| Zero/one/multiple offers and missing reviews | PASS | Regression suite covers empty/single/tied/invalid offers; matrix orders actual fixture quotes 2,500/3,000/3,400; no verified reliability synthesized |
| Renter selection and confirmation | PASS | M2 chosen freely, M1/M3 marked not selected atomically; stored quotation remains 3,000; only R1 confirms |
| Contact privacy | PASS | Raw request contact columns denied; unrelated renters/owner/movers cannot obtain contacts; only selected mover and owning renter have authorized contact access |
| Reopen and isolation | PASS | R3 reopen declines prior offer and revokes M1 contact; new M3 booking leaves R1/M2 confirmation unchanged |
| Owner controls | PASS | Other actors cannot edit O1 listings or scrape contacts; owner contact available to R1 only after a viewing request |
| AI → reviewed inventory → budget | PASS (mocked AI) | Sanitized JPEG uses the existing Mistral request. Other quantity corrected 4→1, Boxes manually added. Approved 11 effort units produce illustrative 3,168–4,752 BDT using the editable illustrative assumptions; no automatic inventory acceptance or quote override |
| Scan protections | PASS (mocked Auth/AI) | Protected database role defeats forged Auth metadata; wrong role 403, expired session 401, missing consent 400, oversized photo 413, per-actor limit 429, malformed output 502/manual fallback. Existing regressions also cover timeouts and image validation |
| Desktop/mobile | PASS | 1440/390/360px captures; Bangla labels, mobile navigation, readable forms, no horizontal overflow, step/data preservation |
| Genuine authenticated hosted AI scan | NOT TESTED | No authorized hosted session/provider credentials or service egress in this environment |
| Organizer sticker | NOT TESTED | Actual organizer-provided asset unavailable; placeholder removed, no imitation created |

Confirmed defect fixed: owner editing an unspecified floor area (stored as 0)
failed native minimum validation. The edit form now displays an empty optional
field; the browser suite publishes, edits and unpublishes that exact case.
Final application FAIL results: none.

## Repeatable checks

Final results: **100 automated tests PASS, 0 FAIL**; production build PASS;
five AI browser scenarios PASS; all three Auth roles PASS; seven-actor authenticated
browser booking journey PASS; guidance at 360/390px PASS. Auth HTTP and AI are
mocked; production SQL/RLS executes in embedded PostgreSQL. Retired demo-reducer
checks are replaced by the authenticated transaction/browser scenarios.

`node --test tests/acceptance-matrix.test.mjs` runs the 14-scenario matrix without
hosted credentials. `npm test` includes it automatically. Also run `npm run build`,
`npm run test:browser:ai` and `npm run test:browser:auth-ui`; the existing guidance
component browser script covers matching, quotes, budgets and mobile layouts.
The seven-actor browser suite replaces the removed local-storage/offline journeys;
it checks `?demo=1`, legacy fake local storage, public published listings, account
gates, strict ranking, reactive budget inputs, quotes, selection and contact privacy.
Optional `BASHASHIFT_SCREENSHOT_DIR` captures test screenshots with phone/email/
password fields and contact links masked. All pictured data/results are synthetic.

## Final live check after an approved manual deployment

Use an **existing renter account**. Plan a move → Route & date → Furniture.
Upload one permitted furniture photo, consent, and Analyze. Require HTTP 200,
`source: cloudflare`, the Mistral model, `reviewRequired: true`, and credible
photo-specific detections. Correct wrong Other quantities and explicitly Apply.
Continue to Estimate & submit: the illustrative range must appear without typing
rates; verify editable assumptions and Back/Next retention. Stop before Publish
for a check that does not write a production request. If scan fails, correlate
only `X-Request-ID` with safe Render diagnostics. Never present mocked evidence
or deterministic matching/pricing as genuine AI inference.

Hosted Auth/Storage/AI checks remain NOT TESTED here: there is no authorized hosted
session, backend AI credential or provider egress. The optional full local Supabase
REST/Storage suite is NOT TESTED because the Supabase CLI/instance is unavailable.
The organizer sticker asset is still missing; none was invented.
