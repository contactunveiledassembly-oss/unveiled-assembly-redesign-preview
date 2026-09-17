# PROJECT-CONTEXT.md — The Unveiled Assembly Website

**Purpose of this file:** This is the permanent handoff document for this project. If an AI chat session is ever lost again, read this file first — it reflects what was actually VERIFIED in the code as of the date below, not what was merely discussed or planned.

**Verified on:** 2026-09-14
**Verified by:** direct inspection of the cloned repository files, GitHub's public API, and this Mac's local file system. Nothing in this document is guessed — anything not confirmed in code is explicitly marked PLANNED / NOT YET IMPLEMENTED.

---

## 1. Project / Repository Identity

- **This is now the MAIN working project** for The Unveiled Assembly website, per owner decision on 2026-09-14.
- **GitHub repo:** `contactunveiledassembly-oss/unveiled-assembly-redesign-preview` (public repo)
- **Local clone:** `/Users/yaunahlove/Projects/unveiled-assembly-redesign-preview`
- **Branch:** `main` (tracking `origin/main`, working tree clean at time of clone)
- **Not yet mapped to a custom domain** — no `CNAME` file in this repo. It is only reachable at `https://contactunveiledassembly-oss.github.io/unveiled-assembly-redesign-preview/`, not `theunveiledassembly.com`.

### Related, older/other locations (preserved — see Section 12)
- **Live public site** (older, simpler, single-page): repo `contactunveiledassembly-oss/unveiled-assembly-website`, live at `theunveiledassembly.com`. Local mirror at `~/Documents/Codex/2026-08-25/referenced-chatgpt-conversation-this-is-an-3/outputs/the-assembly-website/` (via the OneDrive-synced Documents folder). **This redesign-preview project is more advanced and is now the one to build on — the live site has not been touched.**
- **The Gathering entrance prototype** — separate standalone file, not part of this repo yet (see Section 9).
- **Crowd photo assets** — separate folder, not part of this repo yet (see Section 10).

---

## 2. Architecture

- Static multi-page site (plain HTML/CSS/JS — no build step, no framework, no `package.json`).
- One shared logic file, **`app.js`** (6,430 lines), loaded via `<script type="module">` on every page. Individual page HTML files (index, story, gather, etc.) are mostly thin shells (30–140 lines each) — app.js does the heavy lifting: rendering auth panels, member portal, booking wizard, admin tools, etc., across all pages.
- One shared stylesheet, **`styles.css`** (1,335 lines).
- Backend: **Firebase** (Authentication + Firestore). No custom server — everything runs client-side against Firebase.

---

## 3. Pages (entry point + all site pages, verified present)

| File | Role |
|---|---|
| `index.html` | **Main entry point / homepage** |
| `story.html` | Our Story |
| `beliefs.html` | Statement of beliefs |
| `teachings.html` | Teaching library listing |
| `teaching-detail.html` | Single teaching/class detail view |
| `prayer.html` | Prayer request page |
| `gather.html` | "Gather" page — community/gatherings info (see Section 9 — this is NOT the immersive crowd animation) |
| `one-on-one.html` | One-on-one booking page |
| `give.html` | Giving/donations |
| `connect.html` | Contact/connect |
| `testimonials.html` | Testimonies |
| `shop/index.html` | Shop (see Section 6 — UI shell only) |
| `README.md` | One-line repo description only, no build/setup instructions |
| `firestore.rules` | Firestore security rules |
| `assets/ua-logo-tight.png` | Site logo (only asset currently in the repo) |

---

## 4. Navigation (as coded in `index.html`)

Homepage links out to: Our Story, Beliefs, Gather, Teachings/Classes, Prayer, Testimonials, Shop, Give, Connect, plus a member sign-in entry point ("My Assembly" / member portal button appears on multiple pages, e.g. `gather.html`).

---

## 5. Firebase Configuration

- **ALREADY IMPLEMENTED.** Firebase is wired into `app.js` via the Firebase v10 modular Web SDK (`firebase-app.js` from `gstatic.com`).
- Firebase project id: `unveiledassembly` (visible in `app.js` around line 1854–1864, in a `firebaseConfig` object).
- Auth domain: `unveiledassembly.firebaseapp.com`.
- **No API keys, tokens, or secrets are reproduced in this document.** The Firebase client config lives only in `app.js` itself — that file is the source of truth for those values. (Note: a Firebase Web `apiKey` is a public client identifier by design, not a secret credential — but per instruction it is intentionally not copied into this file.)
- `firestore.rules` is present and defines real security rules (see Section 7).

---

## 6. Authentication — ALREADY IMPLEMENTED

Verified in `app.js`:
- Email/password sign in
- Registration (first/last name, phone, password + confirm password fields present)
- "Forgot password" flow
- Change email (with re-authentication)
- Auth state handling (`onAuthStateChanged`)
- Friendly auth error messages (`friendlyAuthError`)

**PARTIALLY IMPLEMENTED / UNCONFIRMED:**
- Phone-number-based login/verification: phone number *fields* exist in the UI, but no SMS/phone verification provider code was found — needs closer review before assuming it's functional.
- Profile pictures: not confirmed in this pass — needs a follow-up check.

---

## 7. Database / Firestore — ALREADY IMPLEMENTED

`firestore.rules` (present, reviewed) defines:
- `users/{userId}` — member/admin profiles. Only one hardcoded ministry email is allowed to self-assign the `admin` role at account creation. Admins can read/manage any profile.
- `slots/{slotId}` — booking availability slots (public read, open create, admin/owner-only delete).
- `blockouts/{date}` — admin-controlled blocked dates (public read, admin-only write).
- `bookings/{bookingId}` — booking requests with name/email/session type/date/time/status. Guests can create pending bookings; only admin can create pre-confirmed ones; a signed-in user can only cancel their own booking; admin can fully manage.

This is real, working role-based security logic — not a placeholder.

---

## 8. Booking System

**ALREADY IMPLEMENTED** (verified by function names and logic in `app.js`):
- Booking wizard flow (`showBookingWizardStep`, `renderBookingOptions`, `renderBookingTimeButtons`, `renderBookingOrderSummary`, `openBooking`)
- Time zone handling (`selectedBookingTimeZone`)
- Admin booking policies (`renderBookingPolicies`) and admin manual "add an appointment" flow (`populateAdminBookTypeSelect`)
- Booking notifications (`renderBookingsNotifications`)
- Member-facing booking history rows (`memberBookingRowHtml`)
- Admin scheduling-rule input fields confirmed in the HTML: Maximum Appointments Per Day, Minimum Notice (hours), Maximum Advance Booking (days), named schedule rules with notes and session-type IDs

**PLANNED / NOT YET IMPLEMENTED:**
- **Stripe or any payment processor: not found anywhere in this repo.** Bookings currently do not process online payment.
- Pause-all-bookings / blocked-date-range UI — not confirmed yet, needs a closer read of `renderBookingsPanels`.
- Double-booking prevention and temporary slot holds — plausible given the `slots` collection design, but not yet traced through the code to confirm behavior.

---

## 9. Admin System

**ALREADY IMPLEMENTED:**
- Role-based admin check pattern (`role == 'admin'`) enforced both in Firestore rules and reflected in UI logic.
- Admin scheduling/policy configuration UI (booking rules, blockouts).
- Admin image-field management tool (`wireAdminImageField`) — likely used for managing photos on teachings/shop/etc.
- Admin manual booking entry.

**PLANNED / NOT YET IMPLEMENTED (not found in code):**
- Moderator/co-admin accounts with owner-granted permission subsets — no evidence of a permissions/roles system beyond a single `admin` vs `member` flag.
- Audit/activity logs (who-changed-what-when) — not found.
- Reporting (monthly/yearly booking totals, per-class totals) — not confirmed; needs a closer pass through `app.js`.

---

## 10. Member Functionality ("My Assembly")

**ALREADY IMPLEMENTED (at least the entry point):**
- "Sign In / Create Account" member portal button present on multiple pages (e.g. `gather.html`).
- `gather.html` describes the intent: one private account for classes, bookings, Zoom links, materials, recordings, and learning progress.

**PARTIALLY IMPLEMENTED / NEEDS VERIFICATION:**
- The actual "My Assembly" dashboard contents (saved teachings, announcements, etc.) exist as UI/strings in `app.js` but were not individually traced in this pass — treat as unconfirmed until reviewed line-by-line.

---

## 11. Shop — PARTIALLY IMPLEMENTED (UI placeholder only)

- `shop/index.html` exists (40 lines).
- In `app.js`, the cart button is explicitly built with `title="Shop — coming soon"` and `aria-disabled="true"`.
- **Conclusion: Shop/Cart is a placeholder. Not functional. No product, cart, or checkout logic exists yet.**

---

## 12. The Gather Page vs. The Gathering Entrance Prototype (IMPORTANT — do not confuse these two)

- **`gather.html` (in this repo):** a normal content page about community/gatherings. **Does not contain** the immersive crowd-walkthrough animation. Confirmed by direct inspection — no crowd/flyby/cross-light code present.
- **"The Gathering" immersive entrance experience** (first-person walk through a crowd toward a lit cross) is a **separate, standalone prototype file, NOT part of this repo:**
  - `/Users/yaunahlove/Library/CloudStorage/OneDrive-KingdomEmbassy-Ohio/Desktop/gathering-entrance.html` (also mirrored in this session's scratchpad as `gathering-entrance-standalone.html`)
  - Contains working procedural far/mid/near crowd layers, flyby figures, camera weave, and the cross-light finale, with a `CROWD_ASSETS` object already coded to reference the real crowd photos below by filename.
  - **Status: PLANNED / NOT YET INTEGRATED.** It has never been linked into either website. Integrating it into `gather.html` (or a new dedicated entrance route) is future work — explicitly not done in this session per instruction.

---

## 13. Crowd Photo Assets (for The Gathering)

Location (not yet copied into this project — left in place per instruction):
`/Users/yaunahlove/Downloads/gathering-crowd-assets/assets/crowd/`

All 11 expected files confirmed present:
- `near-01-locs-raised.webp`, `near-02-braids.webp`, `near-04-curls-bowed.webp`, `near-07-locs-arm.webp`, `near-10-straight-hair.webp`, `near-15-waves.webp`
- `fore-05-hands-clasped.webp`, `fore-12-hands-raised.webp`, `fore-16-hand-raised.webp`
- `flyby-01-close.webp`, `flyby-02-close.webp`

These are exactly the filenames already referenced inside `gathering-entrance.html`'s `CROWD_ASSETS` config, so once copied into a project's `assets/crowd/` folder alongside that HTML file, they should "just work" with no code changes — but that step has intentionally not been done yet.

---

## 14. Stripe / Payment Status

**PLANNED / NOT YET IMPLEMENTED.** No Stripe SDK, keys, or checkout code found anywhere in this repository. All booking flows are currently free / admin-managed (pending → confirmed), with no online payment step.

---

## 15. Deployment Information (safe, non-sensitive)

- This repo auto-publishes to GitHub Pages at `https://contactunveiledassembly-oss.github.io/unveiled-assembly-redesign-preview/` on push to `main`. Confirmed live (HTTP 200) as of 2026-09-14.
- It is **not** connected to the `theunveiledassembly.com` custom domain — that domain currently points at the older `unveiled-assembly-website` repo instead.
- No CI/CD, build pipeline, or `package.json` — deployment is just "push to `main`, GitHub Pages serves the static files directly."

---

## 16. Important File Locations (quick reference)

| What | Where |
|---|---|
| **Main working project (this repo)** | `/Users/yaunahlove/Projects/unveiled-assembly-redesign-preview` |
| Older live site source (mirror) | `~/Documents/Codex/2026-08-25/referenced-chatgpt-conversation-this-is-an-3/outputs/the-assembly-website/` (via OneDrive) |
| The Gathering entrance prototype | `~/Desktop/gathering-entrance.html` (via OneDrive) |
| Crowd photo assets (11 files) | `~/Downloads/gathering-crowd-assets/assets/crowd/` |
| GitHub — this project | `github.com/contactunveiledassembly-oss/unveiled-assembly-redesign-preview` |
| GitHub — older live site | `github.com/contactunveiledassembly-oss/unveiled-assembly-website` |
| Live custom domain | `theunveiledassembly.com` (points to the OLDER repo, not this one, as of now) |

---

## 17. Known TODO Items (explicitly not done yet — do not assume otherwise)

1. Integrate `gathering-entrance.html` into this project and connect it to (or replace) `gather.html`.
2. Copy the 11 crowd `.webp` assets into this project's `assets/crowd/` folder.
3. Build out the Shop (currently a disabled "coming soon" placeholder).
4. Add Stripe (or another processor) for paid bookings and/or shop checkout.
5. Verify and document: phone-number verification, profile pictures, moderator/permission system, audit logs, reporting/analytics, pause-all-bookings, blocked date ranges, double-booking prevention, temporary slot holds — all listed here as unconfirmed/planned until someone traces them directly in `app.js`.
6. Decide when/whether to promote this redesign to the live `theunveiledassembly.com` domain (currently still pointed at the older, simpler repo).

---

*This file should be updated any time a feature moves from PLANNED to IMPLEMENTED, or when architecture changes — so the next AI session (or the next person) can trust it again.*
