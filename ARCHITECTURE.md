# BashaShift — Architecture and implementation choices

## The value proposition

Unlike a standalone property classified or mover directory, BashaShift carries a renter's selected home and destination into a **single moving-request workflow**. Workers get locally relevant, itemized requests; customers compare quotes and complete the final agreement by phone, fitting existing communication habits.

Don't claim to invent any of the individual components. The innovation claim is **coordination, low-friction worker participation, inventory-assisted quoting, and transparent customer control**.

## Stack: minimal, credible, upgradeable

- **Client:** React + Vite + ordinary CSS; React Router optional later. Current starter uses page state so it is simple to understand.
- **Server API:** Node 20+ + Express. API secret kept in environment only.
- **AI:** Vision-enabled OpenAI Responses API (`POST /api/scan`): extracts visible furniture categories with bounded quantities and explicit uncertainty. User edits. The AI does not set prices or assign workers.
- **Database to add in Codex:** Supabase Postgres. Tables: `profiles`, `properties`, `viewing_inquiries`, `worker_profiles`, `moving_requests`, `moving_items`, `moving_offers`, `booking_events`, `reports`.
- **Authentication:** Supabase Auth. Owners and renters may share one profile. Workers are separate verified service role. Consider OTP carefully based on available provider; never fake verification.
- **Photo storage:** Supabase Storage. Public property photos only if consented; moving-inventory photos should be private and accessed via signed URLs.
- **Notifications:** Realtime subscriptions / in-app badges (P1). No SMS integration in MVP.
- **Hosting:** Node-enabled host for Express + React build; `.env` set through server environment. Use separate frontend/API if static hosting is desired.

## Data model (conceptual)

```text
auth.users (id)
  ├─ profiles (id, display_name, phone, role)
  ├─ properties (id, owner_id, title, area, rent, bedrooms, image_urls, status)
  │   └─ viewing_inquiries (id, property_id, renter_id, preferred_date, status)
  ├─ worker_profiles (user_id, service_areas[], categories[], availability, verification_status)
  └─ moving_requests (id, renter_id, from_area, to_area, moving_date, contact_consent, status)
       ├─ moving_items (id, request_id, category, quantity)
       ├─ moving_offers (id, request_id, worker_id, amount, status)
       └─ booking_events (id, actor_id, event, timestamp)
```

## Booking lifecycle

```text
DRAFT → OPEN (visible only to eligible area/category workers)
  OPEN → OFFERED (0..N accepted/counterpriced worker offers)
  OFFERED → AWAITING_CALL (renter selects exactly one offer)
  AWAITING_CALL → CONFIRMED (renter confirms *after* phone call)
  AWAITING_CALL → OPEN (renter declines and reopens)
  OPEN → CANCELLED
  CONFIRMED → COMPLETED / CANCELLED [post-MVP]
```

**Concurrency:** implement a Postgres transaction or RPC to select an offer only if the moving request is `OPEN`. Don't rely on reading state from the browser to block a second booking.

**Worker privacy:** Workers see general origin area, moving date, basic item inventory and indicative price before selection. Do not expose customer name, exact address, or phone. After the renter selects the worker and consents, the worker can access the contact. The selected worker's phone is made available to the renter, with a visible warning if the account isn't verified.

**Owner privacy:** Full property address is optional and should not be public by default; neighborhood/block is sufficient until an inquiry or owner-approved conversation.

## AI endpoint behavior

`POST /api/scan` takes `{ "image": "data:image/jpeg;base64,..." }` with a size and MIME check. Response:

```json
{
  "source": "live-ai",
  "model": "gpt-4.1-mini",
  "items": [ { "name": "Bed", "qty": 1, "confidence": "high" } ]
}
```

These are **suggestions**, not verified detection counts. The user reviews every item. Empty recognized list, invalid input, unavailable API key, or provider errors produce honest messages and manual input fallback.

**Testing mandatory:** test with owned/permissioned furniture photographs, including multiple beds, boxes, irrelevant photos, poor lighting, and a photo with no furniture. Log expected vs recognized categories without claiming medical-grade/object-detection reliability. Check API cost and any provider image-retention policies.

## Important real-world risks

1. Need verified owner inventory (otherwise empty marketplace).
2. Worker fraud/safety risk: profiles cannot be presumed checked.
3. Approximate pricing requires reliable exclusions (truck size, fragile items, disassembly, lift, distance, traffic and timing).
4. Worker response must be phone-first but **not** legally or technically assumed confirmed.
5. Two-sided supply and demand creates cold-start challenges. For the hackathon, label sample records and show a prototype, not fake user traction.
