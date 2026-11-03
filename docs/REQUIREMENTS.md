# BashaShift — Locked Requirements v1.0

**Roles:** Renter/tenant, property owner, independent moving worker, and moderator/admin (future). The same person may rent and own properties. Worker onboarding should be extremely simple and Bangla-friendly.

**Legend:** ✅ Browser-local prototype implemented · ⚠️ Partial / API endpoint only · ❌ Not implemented; required for multiuser product · ⏭️ Post-submission.

**Phase 2 implementation update (2026-11-04):** Supabase schema, Auth UI, owner-scoped properties, inquiries, moving requests, offers, booking transitions, and contact access policies are now implemented. Hosted setup and full end-to-end verification remain pending. See `SUPABASE_SETUP.md` and `PHASE2_QA.md`; browser-local checks are not hosted production proof.

## Core functional requirements

| ID | Priority | Requirement / acceptance criterion | Status |
|---|---|---|---|
| FR-01 | P0 | Public, responsive landing page with clearly labeled demo status | ✅ |
| FR-02 | P0 | Browse published rental listings | ✅ |
| FR-03 | P0 | Search rental properties by area, including Banasree/Bonosree spelling | ✅ |
| FR-04 | P0 | Filter by maximum monthly rent and minimum bedrooms | ✅ |
| FR-05 | P0 | Display property photo, rent, area, block, beds, baths, size, availability | ✅ (some fields only in React starter) |
| FR-06 | P0 | Owner creates listing with title, area, rent, contact and photo | ⚠️ Supabase implementation; see Phase 2 QA for tested vs unverified scope |
| FR-07 | P0 | Owner edits/unpublishes own listings only | ⚠️ Supabase implementation; see Phase 2 QA for tested vs unverified scope |
| FR-08 | P0 | Renter sends viewing inquiry to specific listing | ⚠️ Supabase implementation; see Phase 2 QA for tested vs unverified scope |
| FR-09 | P0 | Owner can view and acknowledge received inquiries | ⚠️ Supabase implementation; see Phase 2 QA for tested vs unverified scope |
| FR-10 | P0 | Renter initiates a move from selected listing (destination prefilled) | ✅ |
| FR-11 | P0 | Renter supplies origin, destination, move date and inventory | ✅ |
| FR-12 | P0 | Renter selects furniture counts manually and corrects any AI suggestion | ✅ |
| FR-13 | P0 | Transparent illustrative estimator based on inventory, floor, lift and approximate distance | ✅ React version (offline demo simpler) |
| FR-14 | P0 | Moving request published to relevant moving-service group | ⚠️ Supabase implementation; see Phase 2 QA for tested vs unverified scope |
| FR-15 | P0 | Worker registers a simple profile with name, phone and service area | ⚠️ Supabase implementation; see Phase 2 QA for tested vs unverified scope |
| FR-16 | P0 | Workers only see requests matching offered service and service area | ✅ area-based demo |
| FR-17 | P0 | Worker accepts default estimate or proposes an alternative price | ⚠️ Supabase implementation; see Phase 2 QA for tested vs unverified scope |
| FR-18 | P0 | Customer reviews competing worker offers and selects one | ⚠️ Supabase implementation; see Phase 2 QA for tested vs unverified scope |
| FR-19 | P0 | Worker acceptance **does not** finalize service; customer phone-confirms | ⚠️ Supabase implementation; see Phase 2 QA for tested vs unverified scope |
| FR-20 | P0 | Customer can decline selected worker and reopen request | ⚠️ Supabase implementation; see Phase 2 QA for tested vs unverified scope |
| FR-21 | P0 | Customer can mark a phone-agreed booking confirmed | ⚠️ Supabase implementation; see Phase 2 QA for tested vs unverified scope |
| FR-22 | P0 | Customer contact and sensitive details withheld from worker until selected and consented | ⚠️ Supabase implementation; see Phase 2 QA for tested vs unverified scope |
| FR-23 | P0 | Workers see large simple Bangla-focused job cards and one response action | ✅ |
| FR-24 | P0 | AI analyzes uploaded furniture photo to suggest visible inventory, reviewed by user | ⚠️ server route coded; key and live test needed |
| FR-25 | P0 | No invented properties, availability, worker phone numbers, AI results or price guarantees | ✅ honest display; live moderation still required |
| FR-26 | P0 | Real authentication with role-aware access controls | ⚠️ Supabase implementation; see Phase 2 QA for tested vs unverified scope |
| FR-27 | P0 | Shared persistent cloud database and real-time request updates across devices | ⚠️ Supabase implementation; see Phase 2 QA for tested vs unverified scope |
| FR-28 | P0 | Official organizer-provided buildathon sticker graphic visible near top | ❌ text placeholder only |
| FR-29 | P0 | Public production deployment with independently reachable URL | ❌ |
| FR-30 | P0 | Admin can remove/report unsafe or fake listings and accounts | ❌ |

## Additional requirements for stronger competitive submission

| ID | Priority | Requirement / acceptance criterion | Status |
|---|---|---|---|
| FR-31 | P1 | Bangladesh phone OTP login or equivalent verified login | ❌ |
| FR-32 | P1 | User can edit/delete own profile and delete their data | ❌ |
| FR-33 | P1 | Real photo upload to private/permitted cloud storage | ⚠️ Supabase implementation; see Phase 2 QA for tested vs unverified scope |
| FR-34 | P1 | Worker available/offline toggle | ⚠️ Supabase implementation; see Phase 2 QA for tested vs unverified scope |
| FR-35 | P1 | Cancel expired requests; avoid accepting already-selected jobs (atomic backend transaction) | ⚠️ Supabase implementation; see Phase 2 QA for tested vs unverified scope |
| FR-36 | P1 | Quote includes item handling vs transport vs stairs breakdown; exclusions | ⚠️ total only in UI |
| FR-37 | P1 | Safe abuse report / suspicious listing report | ❌ |
| FR-38 | P1 | Confirm property and moving service availability manually before making claims | ⚠️ disclaimers only |
| FR-39 | P1 | Useful English/Bangla text for renter, full Bangla worker UX | ⚠️ mixed-language worker UI |
| FR-40 | P1 | Error, loading, empty, confirmation states and mobile accessibility | ⚠️ implemented for most paths; needs accessibility QA |
| FR-41 | P1 | Separate sample/demo data from actual users and never present fictional inventory as live | ✅ |
| FR-42 | P1 | Privacy notice and consent for personal phone numbers, home addresses and uploaded photos | ⚠️ contact consent; full policies missing |
| FR-43 | P1 | Server-side rate limits and abuse prevention on AI scanning and booking APIs | ❌ |

## Deferred features — do not implement during the 2-day sprint

FR-44 ⏭️ Live GPS tracking; FR-45 ⏭️ Online payments; FR-46 ⏭️ Automated phone calls/SMS; FR-47 ⏭️ Advanced property verification; FR-48 ⏭️ Worker reviews and reputation; FR-49 ⏭️ Multi-stop/multiworker fleets; FR-50 ⏭️ Full home-maintenance marketplace. These increase operational and safety complexity without improving the first end-to-end rental → move demonstration enough.

## Nonfunctional requirements

| ID | Priority | Nonfunctional acceptance criterion |
|---|---|---|
| NFR-01 | P0 | Works on mobile widths ~360px and desktop, with readable tap targets |
| NFR-02 | P0 | No OpenAI API keys or private credentials in client bundle or Git |
| NFR-03 | P0 | Ownership and role checks enforced server-side (not only hidden buttons) before opening public accounts |
| NFR-04 | P0 | Phone and exact address access restricted to authorized participants after consent |
| NFR-05 | P0 | Quote transitions prevent duplicate/contradictory selection under concurrent requests |
| NFR-06 | P0 | AI image recognition explicitly uncertain, user-editable; no guaranteed furniture count |
| NFR-07 | P0 | Cost is described as an estimate, not verified market price; agreed offers are recorded |
| NFR-08 | P0 | Uploaded images must meet size/type restrictions; malware scanning and storage policy before scale |
| NFR-09 | P0 | Judges can test workflows without sensitive personal details or buying anything |
| NFR-10 | P0 | Repository has README, setup instructions, environment sample, tests, and clear feature limitations |
| NFR-11 | P1 | Performance targets: initial page loads acceptably on ordinary phone/slow connection, image compression, lazy loading |
| NFR-12 | P1 | Semantic labels, keyboard navigation, contrast, error/status messages |
| NFR-13 | P1 | Privacy/data deletion policy and retention/deletion safeguards |
| NFR-14 | P1 | Error logging without storing API keys or raw personal content in logs |

## Core business and state rules (locked)

1. Rental browsing and moving service booking are connected, but owner and worker are different roles.
2. A worker's **acceptance/offer is not a confirmed booking**.
3. A request may have multiple offers. A customer selects at most one candidate at a time.
4. Only a customer may select/confirm/cancel the selected offer. Confirm **after** phone discussion.
5. Worker phone becomes visible to customer after response/selection; a customer phone must only become visible to the selected worker after explicit consent.
6. Counteroffer is a separate amount; the customer's approved amount is final only after phone confirmation. If rejected, reopen request.
7. A mock estimate is NOT a fixed nationwide tariff. Real providers confirm cost, labor, date and safety.
8. A submitted inquiry or request must not be displayed as confirmed merely because a button was clicked.
9. No real provider or property is represented by the sample seed dataset.
10. Future home-maintenance services are out of this buildathon MVP; focus on **moving**.

## Minimum proof for a “done” requirement

A requirement counts as done only if it is **implemented**, **manually tested end-to-end**, and **validated in the production deployment** if deployment is applicable. Browser-local demo ≠ production complete.
