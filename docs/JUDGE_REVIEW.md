# Strict judge review — BashaShift prototype

Competition: [YUNet AIgnite Buildathon 2026](https://yunet-aignite26.devpost.com/). Official primary round scoring: Problem & User Value 12, Solution & Innovation 12, AI & Technical Implementation 10, UX & Product Readiness 16. This project is an individual-entry B2C web app with a mandatory visible sticker and meaningful AI.

## Current score if submitted *as-is* (hypothetical)

| Category | Estimate / max | Judge's reason |
|---|---:|---|
| Problem & User Value | 10 / 12 | Genuine linked problems of rental search and moving services in Bangladesh. |
| Solution & Innovation | 7 / 12 | Connected journey and simple phone-based worker flow are good; rental marketplaces and mover directories already exist. |
| AI & Technical Implementation | 3 / 10 | AI route coded but not tested/configured; offline demo intentionally has no AI. |
| UX & Product Readiness | 6 / 16 | Attractive clickable prototype, but all shared records are browser-local; real external user transactions do not work. |
| **Total** | **26 / 50** | **Not a Top-5-ready product as-is.** |

This is a **subjective conditional audit**, not an official score or an estimate of other entrants. If deployed with real permissions, reliable AI, an authentic cross-browser flow and excellent pitch, competitiveness could rise substantially, but no 40+/50 or Top-5 guarantee can be credibly given now.

## Biggest vulnerabilities if judges ask

**“Is this another rental listing website?”** The differentiator is the linked rental-to-move user journey, transparent independent mover quotes, and a phone-confirmed process with minimal worker UI. Do not claim exclusive novelty.

**“Do you have actual owners and workers?”** Not yet. Sample cards are fictional, and the MVP will be piloted and verified after the hackathon. Explain concrete onboarding and trust safeguards rather than fake traction.

**“Is your AI really working?”** At the moment the API route exists but has not been connected to a verified working key in this environment. Do not claim AI integration works until you personally test with actual photos.

**“What if a mover charges more on arrival?”** Quote changes require a new customer approval. The MVP stores a selected offer; production needs a documented change-request and escalation workflow. No payments are collected here.

**“Can a worker misuse home addresses or phone numbers?”** Prototype code is not secure against this across user accounts, because `localStorage` is not an authorization boundary. Production requires a shared secured database, user identity, per-role RLS and phone exposure only after explicit selection/consent.

**“Can two workers accept a booking?”** Multiple offers are allowed, only one selected candidate is shown in browser-local UI. Production must enforce uniqueness atomically in the database.

## Strengths worth keeping

- Real B2C market need with an obvious consumer user journey.
- Combines rental discovery and relocation rather than disconnected mini-apps.
- Worker UI respects local phone-first habits and reduces digital burden.
- Transparent, negotiable offers instead of a black-box “AI price.”
- Honest demo labels and price uncertainties make the product easier to trust.

## Honest priority order

1. Cross-device, role-secure transactional journey.
2. One genuinely working AI image → inventory feature.
3. Mandatory official sticker, production deployment, responsive polish.
4. Present a compelling 60–90-second demo with data and clear boundary between working features and roadmap.

**Final verdict:** Worth continuing *only* if the user can complete the cross-device working booking chain by the deadline. Otherwise, a smaller functional product is a more credible submission than a polished but fake marketplace. The app must not be presented as a live rental service until real inventory and safeguards exist.
