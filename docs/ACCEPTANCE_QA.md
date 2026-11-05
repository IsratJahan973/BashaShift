# Submission acceptance: issues #10, #11 and #14

Base: merged production commit `69b0cb8`. Branch: `feat/mobile-gallery-routing`,
targeting `feat/production-release` in one new PR. No merge or deployment.
Existing ranking, pricing, Cloudflare provider and Supabase SQL/RLS/booking
functions are unchanged.

## Evidence boundaries

The seven actors and every `TEST` property/request live only in a fresh in-memory
PGlite database. The suite executes the existing migration, PostgreSQL roles,
RLS policies, triggers and booking/contact RPCs. Hosted Auth/Storage HTTP, Cloudflare, routing and map tiles are mocked. No hosted accounts, listings, schema or customer records
were created or modified. No production mocks or application features were added.
The browser suite also uses the real SQL/RLS in a separate disposable database
with seven HTTP-authenticated contexts; its Auth/Storage adapters and providers
are fixtures. Storage object and image metadata RLS still execute in PostgreSQL.

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
| Camera affordance | PASS (simulated files) | Rear-camera hint, distinct camera/gallery pickers, sequential additions, max-three enforcement, removable previews, consent and review; hardware capture remains NOT TESTED |
| Six-photo gallery | PASS | Unit tests cover six uploads/limits. Browser covers three JPEG uploads, metadata reorder, retained images on editing, replacement/removal, arrows/keyboard/swipe/count and mobile previews. Signed-URL failures retain paths in unit tests |
| Storage failure/recovery | PASS (local adapters) | Upload and metadata failures roll back; original objects retained on uncertain recovery. Failed removals remain listed for retry; successful removal makes the object unavailable. No RLS grant changes |
| Single apartment search | PASS | One primary area dropdown, maximum rent, bedrooms and optional preferences; keyword searches removed; mixed-case/trimmed areas match |
| Automatic road distance | PASS (mocked service) | Current HeiGIT POST contract, allowlisted neighborhood centers, validated meter summary/GeoJSON, timeout, rate limit, bounded cache, safe errors, no old/invented distance, manual override |
| Route concurrency and fallback | PASS (mocked service) | Distinct Banasree→Mirpur/Mohammadpur calls update budget; stale responses ignored; manual distance retained across steps/navigation; missing key, same-area, Other and service failures fall back |
| Optional map | PASS (mocked tiles) | Leaflet loads only when opened, markers/returned line/visible OSM attribution, keyboard zoom/reset, tile failure and route-change cleanup, 360/390/1440px |
| Authenticated live HeiGIT route | NOT TESTED | No HEIGIT_API_KEY or provider egress in this environment; automatic routing is not claimed live-verified |
| Physical-phone camera capture | NOT TESTED | Needs an existing renter on an actual Android/iOS phone; capture is a browser hint |
| Hosted gallery upload/edit/removal | NOT TESTED | No authorized hosted session/Storage integration access; all test photos stayed in local fixtures |
| Genuine authenticated hosted AI scan | NOT TESTED | No authorized hosted session/provider credentials or service egress in this environment |
| Organizer sticker | NOT TESTED | Actual organizer-provided asset unavailable; placeholder removed, no imitation created |

Confirmed defect fixed: owner editing an unspecified floor area (stored as 0)
failed native minimum validation. The edit form now displays an empty optional
field; the browser suite publishes, edits and unpublishes that exact case.
Final application FAIL results: none.

## Repeatable checks

Final results: **121 automated tests PASS, 0 FAIL**; production build PASS;
five AI browser scenarios PASS; all three Auth roles PASS; seven-actor authenticated
browser booking journey PASS; guidance at 360/390px PASS. Auth HTTP and AI are
mocked, including routing and map tiles; production SQL/RLS executes in embedded PostgreSQL. Retired demo-reducer
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

## Minimal release checks for issue #14

After an approved manual deployment, add server-only `HEIGIT_API_KEY` in Render
and permit outbound `api.heigit.org`. Use an existing renter to select
Banasree→Mirpur, then Banasree→Mohammadpur. Require authenticated `/api/route`
HTTP 200 with `source: heigit`, `approximate: true`, a positive provider distance
and a valid road LineString; check budget/map updates and manual override. A
missing key must leave manual distance usable. OSM attribution remains visible.

On a real phone, verify Take Photo opens the rear camera where supported and
Gallery remains usable; inspect consent, review and manual fallback. Hosted owner
photo upload/reorder/edit/removal should use explicitly approved isolated test
listings only. This task created no hosted accounts or property data.

Gallery metadata uses the existing INSERT/DELETE grants with compensating rollback;
it is not a new database transaction. Original objects are retained if rollback
cannot be confirmed, and errors request refresh. Removed objects are confirmed
deleted before their metadata is cleared, making a failed removal retryable.
