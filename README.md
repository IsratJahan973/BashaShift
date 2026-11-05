# BashaShift

**Your Next Home. Your Next Move. Skip the Chaos.**

BashaShift connects **apartment discovery and relocation planning** in one mobile-friendly platform for Bangladesh. Renters can find owner-published homes, plan a move using AI-assisted furniture inventory, and compare independent moving quotations. Property owners manage listings and viewing requests; movers quote eligible jobs.

**[Try BashaShift](https://bashashift.onrender.com/)** · [Project QA](docs/ACCEPTANCE_QA.md) · [AI verification and setup](docs/AI_SETUP.md)

> **Project status:** Working hackathon prototype. Listings and service providers are user-submitted and **not identity- or availability-verified**. No online payments are collected.

## How it works

| User | What they can do |
| --- | --- |
| **Renter** | Browse published apartments, filter by area/budget/bedrooms, view explainable preference matches, request viewings, prepare a furniture inventory, compare mover quotations, select a mover and confirm by phone. |
| **Property owner** | Publish/edit/unpublish property details, upload and organize up to six room photos, and respond to viewing requests. |
| **Moving provider** | Configure their service area, discover eligible pickup-area requests, submit quotations and manage selected/confirmed jobs. |

### AI-assisted furniture inventory

Renters can **take a photo** on a supported phone or choose up to three images from their gallery. **Cloudflare Workers AI with Mistral Small 3.1 Vision** suggests furniture categories and quantities. Every suggestion must be reviewed and corrected by the renter before it enters their moving inventory; manual entry remains available.

The moving-budget range is calculated from reviewed inventory, distance, floors/lift access and **editable illustrative assumptions**. It is **not an AI market-price prediction, a verified local rate or a mover's quotation**. Apartment matching is similarly **deterministic and explainable**, not AI-generated.

For eligible configured accounts, a separate routing service can calculate an **approximate road distance between neighborhood centers** and display an optional map. Without routing credentials or for unsupported areas, users enter distance manually.

## Technology

- **Frontend:** React, Vite, JavaScript, responsive CSS.
- **Backend:** Node.js, Express, server-side validation and protected AI/routing endpoints.
- **Accounts and data:** Supabase Auth, PostgreSQL, Row Level Security (RLS), Storage.
- **AI:** Cloudflare Workers AI — Mistral Small 3.1 Vision, with image sanitization, consent and mandatory human review.
- **Optional routing:** HeiGIT/openrouteservice, Leaflet and OpenStreetMap tiles.
- **Hosting:** Render (one Node web service).

### Privacy and safeguards

The site uses three authenticated account roles. Contact details are protected by database policies and booking flows; only the selected mover receives authorized customer contact information. Uploaded AI photos are re-encoded to remove metadata, and model errors preserve the manual workflow. The app does not claim verified apartment availability, verified mover identity or guaranteed prices.

## Project verification

The current development report records **121 passing automated tests**, including a seven-actor owner/renter/mover acceptance matrix and mobile browser checks. The local suite exercises PostgreSQL RLS and booking transactions; **external Auth, Storage HTTP, Cloudflare AI and routing services are mocked in those automated browser scenarios**. A separate genuine AI furniture-recognition result was observed earlier on the hosted app. The latest gallery, camera and routing integrations still require individual live-device/provider verification.

See [acceptance results](docs/ACCEPTANCE_QA.md) for test scope and limitations.

## Run locally

**Prerequisites:** Node.js 24 and an authorized Supabase project.

```bash
git clone https://github.com/IsratJahan973/BashaShift.git
cd BashaShift
npm ci
cp .env.example .env
npm run dev
```

Add the public Supabase URL and publishable key to `.env`. Configure `CLOUDFLARE_ACCOUNT_ID` and `CLOUDFLARE_AI_TOKEN` **only on the server** to enable authenticated real furniture scans. Optional `HEIGIT_API_KEY` enables road routing. Never put server tokens in `VITE_*` variables or commit your `.env`.

```bash
npm test
npm run build
```

Browser tests and complete local integration require additional dependencies described in [AI setup](docs/AI_SETUP.md) and [Supabase setup](docs/SUPABASE_SETUP.md).

## Deployment

The production web application runs at **https://bashashift.onrender.com/**. Render currently deploys the `feat/production-release` branch with manual deployments. Its configuration is documented in [`render.yaml`](render.yaml). `/api/health` reports service readiness flags but does not by itself prove live model inference.

---

**BashaShift** — Built for Bangladesh. One connected journey from home search to moving day.
