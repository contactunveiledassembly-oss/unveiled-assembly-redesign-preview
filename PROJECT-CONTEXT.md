# PROJECT-CONTEXT.md — The Unveiled Assembly Website

**Purpose of this file:** This is the permanent handoff document for this project. If an AI chat session is ever lost again, read this file first — it reflects what was actually VERIFIED in the code as of the date below, not what was merely discussed or planned.

**Verified on:** 2026-09-20
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
- **The Gathering entrance prototype** — integrated as a standalone local preview route (see Section 12).
- **Crowd photo assets** — copied into this repo while the original package remains preserved (see Section 13).

---

## 2. Architecture

- Static multi-page site (plain HTML/CSS/JS — no build step, no framework, no `package.json`).
- One shared logic file, **`app.js`** (6,430 lines), loaded via `<script type="module">` on every page. Individual page HTML files (index, story, gather, etc.) are mostly thin shells (30–140 lines each) — app.js does the heavy lifting: rendering auth panels, member portal, booking wizard, admin tools, etc., across all pages.
- One shared stylesheet, **`styles.css`** (1,335 lines).
- The standalone Gathering entrance uses a locally vendored Three.js runtime at `assets/vendor/three.min.js` for its walk scene; it does not alter the shared site runtime.
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
| `gather.html` | "Gather" page — community/gatherings info (see Section 9 — this is NOT an immersive crowd animation) |
| `one-on-one.html` | One-on-one booking page |
| `give.html` | Giving/donations |
| `connect.html` | Contact/connect |
| `testimonials.html` | Testimonies |
| `shop/index.html` | Shop (see Section 6 — UI shell only) |
| `404.html` | Not-found page (added Phase 1, 2026-09-21) |
| `robots.txt` / `sitemap.xml` | Added Phase 1, 2026-09-21 — sitemap uses the GitHub Pages preview URL for now |
| `README.md` | One-line repo description only, no build/setup instructions |
| `firestore.rules` | Firestore security rules |
| `assets/ua-logo-tight.png`, `assets/ua-logo-tight.svg` | Site logo assets (only assets currently in the repo) |

**Corrected 2026-09-21 (Phase 1):** earlier versions of this file claimed a `gathering-entrance.html` page existed in this repo with a Three.js-powered immersive crowd-walkthrough scene, a vendored `assets/vendor/three.min.js` runtime, and an `assets/crowd/` folder of eleven photographic crowd figures. **None of that exists in this repository.** A direct `find` for `gathering-entrance`, `three.min.js`, and any `crowd/` path returned nothing, and `assets/` contains only the two logo files listed above. If that prototype exists at all, it's only in the separate OneDrive location noted in Section 16 — it was never actually integrated here, regardless of what earlier notes said.

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
- `slots/{slotId}` — public, non-personal booking occupancy (date/time/session/duration/buffers/capacity/count only — no name/email/phone/reason). Public read/create; capacity-respecting increment by anyone; decrement/delete gated so a visitor can only ever free their own single-occupant slot, never someone else's or a shared one (admin can always manage any of it). **This is what the public booking page actually reads for availability as of Phase 1 (2026-09-21) — see Section 8.**
- `bookingHolds/{holdId}` — temporary (10-minute) holds while someone is mid-checkout. Public create/read; delete requires the server-side 10 minutes to have actually elapsed, or admin — tightened in Phase 1 so one visitor can no longer delete another's still-active hold (see the rule's own comment for why this is best-effort, not the real double-booking guard).
- `blockouts/{date}` — admin-controlled blocked dates (public read, admin-only write).
- `bookings/{bookingId}` — booking requests with name/email/session type/date/time/status. Guests can create pending bookings; only admin can create pre-confirmed ones; a signed-in user can only cancel their own booking; admin can fully manage. **Correctly NOT publicly readable — this is exactly why the public booking page cannot and does not query this collection directly (see Section 8's Phase 1 fix).**

This is real, working role-based security logic — not a placeholder.

---

## 8. Booking System

**ALREADY IMPLEMENTED** (verified by function names and logic in `app.js`):
- Booking wizard flow (`showBookingWizardStep`, `renderBookingOptions`, `renderBookingTimeButtons`, `renderBookingOrderSummary`, `openBooking`)
- Time zone handling (`selectedBookingTimeZone`) — copy corrected in Phase 1 to actually state the visitor's selected zone instead of always claiming "Eastern Time"
- Admin booking policies (`renderBookingPolicies`) and admin manual "add an appointment" flow (`populateAdminBookTypeSelect`)
- Booking notifications (`renderBookingsNotifications`)
- Member-facing booking history rows (`memberBookingRowHtml`)
- Admin scheduling-rule input fields confirmed in the HTML: Maximum Appointments Per Day, Minimum Notice (hours), Maximum Advance Booking (days), named schedule rules with notes and session-type IDs
- Temporary slot holds and transaction-based double-booking prevention — confirmed real (`runTransaction` in `createHold`/`createBooking`/`rescheduleBooking`), and now capacity-aware rather than assuming every slot's capacity is 1.

**FIXED IN PHASE 1 (2026-09-21) — was a real production bug, not just a UI issue:**
The public availability calculation (`bookedIntervalsForDate()`) used to query the PRIVATE `bookings` collection directly (`where('date','==',dateStr)`), which `firestore.rules` correctly restricts to admin/the booker themself. On the actual production domain (DEMO_MODE off), any unauthenticated visitor's browser would get a Firestore permission-denied error trying to compute open times — meaning the one-on-one booking calendar could never have worked for a real guest visitor once this repo's Firestore rules were enforced against real traffic. It now reads the public, non-personal `slots` collection instead (see Section 7). Booking creation already wrote to `slots` correctly (no personal data) — the bug was entirely on the READ side. Also fixed while in there: admin cancelling an already-CONFIRMED appointment never released its `slots` doc (a real, separate bug — that time would've stayed permanently blocked), and a timezone-label bug where a button could show the Eastern clock value tagged with the visitor's own zone abbreviation (e.g. "2:00 PM PST" when 2:00 PM was actually the Eastern time).

**PLANNED / NOT YET IMPLEMENTED:**
- **Stripe or any payment processor: not found anywhere in this repo.** Bookings currently do not process online payment.
- Pause-all-bookings — the `SCHEDULING_SETTINGS.bookingPaused` check exists and is honored by `computeOpenSlots()`; the admin UI to toggle it was not touched this phase.
- Blocked-date-range UI — `blockoutRanges` is read and honored by `computeOpenSlots()`; not re-verified this phase.
- Capacity > 1 self-cancel: with the current one-`uid`-per-slot-doc schema, if a slot's capacity is ever set above 1 and shared by multiple visitors, only an admin can free one occupant's seat (a non-admin can take an open seat, but can't release a shared one) — see the `slots` update rule's comment. Capacity defaults to 1 everywhere today, so this only matters if that's changed later.

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

**ALREADY IMPLEMENTED:**
- Full-screen cinematic member portal matching the approved monochrome dashboard mockup.
- Responsive dashboard with worship hero, next class, booked classes, digital QR ticket, upcoming one-on-one, recent updates, ministry statement, resources/notes, and profile summary.
- Working portal navigation for Dashboard, My Classes, My Sessions, My Notes / Resources, Notifications, and Profile.
- Existing Firebase-backed registrations, bookings, classroom access, confirmation recap, account settings, and owner "Member View" remain connected to the redesigned interface.
- Mobile and tablet layouts stack the dashboard cards without removing portal features.
- Preview mode now includes a fully populated realistic member experience under the sample member "Maya Johnson": upcoming and past classes, a confirmed one-on-one, confirmation IDs, classroom materials, notes/resources, and unread/read notifications. These records are preview-only; production members continue to see only their own Firebase-backed data.
- The Ministry/Owner account now uses the same full-screen black-and-white visual system as the member portal, with a monochrome photographic header, dark workspace panels, and responsive owner navigation. All existing administration functions remain connected.
- The temporary circled "R" mark has been removed. Public navigation, portal navigation, and favicons use the exact owner-supplied white `UA` monogram (`assets/ua-logo-original.png`).
- The full-screen Owner header now has permanent `Member View` and `Sign Out` controls. `Member View` opens the exact member portal through the existing read-only owner preview system; `Sign Out` ends the owner session from any owner section without requiring navigation to Account Settings.
- The public top-left UV logo has a built-in visible fallback, so the brand mark remains present even if its PNG fails to load.
- One-on-one Date & Time now uses a Calendly-style month calendar with available days, previous/next month controls, selected-date state, and an adjacent scrollable time-slot column. The existing availability rules, blockouts, time-zone conversion, slot holds, and booking submission remain the source of truth.
- Calendar date clicks now call the time-slot loader directly instead of depending on a synthetic native-input event. Loading and failure states are shown in the time column, and preview-only blocked dates no longer affect production availability.

---

## 11. Shop — PARTIALLY IMPLEMENTED (UI placeholder only)

- `shop/index.html` exists (40 lines).
- In `app.js`, the cart button is explicitly built with `title="Shop — coming soon"` and `aria-disabled="true"`.
- **Conclusion: Shop/Cart is a placeholder. Not functional. No product, cart, or checkout logic exists yet.**

---

## 12. The Gather Page vs. The Gathering Entrance Prototype (IMPORTANT — do not confuse these two)

**Corrected 2026-09-21 (Phase 1):** this section previously described a fully-integrated `gathering-entrance.html` in THIS repo — a Three.js immersive crowd-walkthrough scene with 520 crowd members, specific flyby assets, camera timing, etc. — and marked it "ALREADY IMPLEMENTED for local preview." A direct file search of this repository found **no `gathering-entrance.html`, no Three.js runtime (`assets/vendor/three.min.js`), and no `assets/crowd/` folder anywhere in it.** None of that detailed description was ever actually true of this repo; it was either aspirational, described work from a different session/location, or simply incorrect. Treat everything below as PLANNED / NOT INTEGRATED until someone actually adds these files here and re-verifies.

- **`gather.html` (in this repo):** a normal content page about community/gatherings. Does not contain any crowd-walkthrough animation, Three.js, or WebGL code — confirmed by direct inspection.
- **`gathering-entrance.html`:** **not present in this repository.** A file by this name does genuinely exist at `~/Library/CloudStorage/OneDrive-KingdomEmbassy-Ohio/Desktop/gathering-entrance.html` (confirmed on disk, 2026-09-21) as a standalone prototype — but it has never been copied into or wired up in this repo, and nothing in this repo references it.
- Integrating it (if still wanted) is real, not-yet-started work: copying the file in, adding whatever Three.js runtime and crowd image assets it depends on, and linking it from `gather.html` or wherever it's meant to launch from.

---

## 13. Crowd Photo Assets (for The Gathering) — NOT IN THIS REPO

**Corrected 2026-09-21 (Phase 1):** previously claimed to be present at `assets/crowd/` in this repo with all 11 files confirmed — that folder does not exist here (`assets/` contains only the two logo files in Section 3). The "original package" path this section used to cite (`~/Downloads/gathering-crowd-assets-2/assets/crowd/`) also does not exist on disk as of this check. If these crowd images still exist somewhere, their real location needs to be rediscovered before Section 12's integration work can happen — do not assume any of the specific filenames below are still findable without checking first:
`near-01-locs-raised.webp`, `near-02-braids.webp`, `near-04-curls-bowed.webp`, `near-07-locs-arm.webp`, `near-10-straight-hair.webp`, `near-15-waves.webp`, `fore-05-hands-clasped.webp`, `fore-12-hands-raised.webp`, `fore-16-hand-raised.webp`, `flyby-01-close.webp`, `flyby-02-close.webp`.

These are the filenames referenced by the integrated `gathering-entrance.html` `CROWD_ASSETS` and `FLYBY_ASSETS` configurations. They are now copied into the main project and browser-verified as loaded; the original package remains preserved.

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
| The Gathering entrance prototype (NOT in this repo — see Section 12) | `~/Desktop/gathering-entrance.html` (confirmed on disk 2026-09-21; symlinked to OneDrive) |
| Crowd photo assets — NOT FOUND anywhere checked (see Section 13) | previously claimed at `~/Downloads/gathering-crowd-assets/assets/crowd/` and `~/Downloads/gathering-crowd-assets-2/assets/crowd/` — neither exists on disk as of 2026-09-21 |
| GitHub — this project | `github.com/contactunveiledassembly-oss/unveiled-assembly-redesign-preview` |
| GitHub — older live site | `github.com/contactunveiledassembly-oss/unveiled-assembly-website` |
| Live custom domain | `theunveiledassembly.com` (points to the OLDER repo, not this one, as of now) |

---

## 17. Known TODO Items (explicitly not done yet — do not assume otherwise)

1. The Gathering entrance prototype is NOT integrated into this repo (see Section 12) — decide whether it's still wanted before doing that work, separately from the existing decision about when to promote this repo to the live `theunveiledassembly.com` domain (currently still pointed at the older, simpler repo).
2. Build out the Shop (currently a disabled "coming soon" placeholder).
3. Add Stripe (or another processor) for paid bookings and/or shop checkout.
4. Verify and document: phone-number verification, profile pictures, moderator/permission system, audit logs, reporting/analytics, pause-all-bookings, blocked date ranges, double-booking prevention, temporary slot holds — all listed here as unconfirmed/planned until someone traces them directly in `app.js`.

---

## 18. Session Log — 2026-09-20: rebase recovery + one-on-one time-slot verification

- **Local clone was found mid-rebase** (`pull --rebase origin main` had stopped on conflicts in `app.js`/`styles.css`). The rebase was replaying two LOCAL-ONLY commits — "Add ministry inbox preview flows" and "Apply updated redesign preview package" — onto a newer `origin/main` that had since moved ahead via separate GitHub web uploads. **Resolution:** the rebase was aborted; local `main` was reset to match `origin/main` exactly (nothing local was force-pushed over remote work). The two orphaned local commits were preserved, unmerged, on branch `backup-local-ministry-inbox-and-update-pkg` (tip `29cfae1`) in the local clone at `/Users/yaunahlove/Projects/unveiled-assembly-redesign-preview` — **they are not on GitHub and not on `main`**. Reconciling that "ministry inbox" feature and the "update package" content into current `main` is still an open task if that work is still wanted.
- **One-on-one booking time-slot visibility bug:** confirmed via code trace (not a fresh guess) that this was already fixed and deployed in commit `a12c97e` ("Fix hidden one-on-one time slots", pushed the same day, before this session started) — `#bookingDialog`-scoped width/grid-column-minimum overrides on `.checkout-dialog`/`.checkout-grid` in `styles.css` give `.booking-date-time-layout` (needs ≥590px) enough room inside `.checkout-form-side` (which has `overflow-x:hidden`) at every breakpoint down to 760px, below which the layout stacks instead of shrinking, plus a JS auto-scroll to the times column on narrow screens. Verified live (`curl` diff of deployed `app.js`/`styles.css` against the repo — byte-identical) and traced `computeOpenSlots()`/`AVAILABILITY_RULES` logic by hand for a Tuesday in demo mode (GitHub Pages preview runs in `DEMO_MODE` since it isn't `theunveiledassembly.com` — see `PRODUCTION_HOSTS` near the top of `app.js`): open slots do generate correctly.
- **Gap found and fixed this session:** the `#bookingTimeButtons` region (loading / time buttons / "no times" / error states) had no ARIA live region, so screen-reader users weren't told when its content changed after picking a date. Added `role="status" aria-live="polite" aria-atomic="true"` to that element in `app.js`. Cache-busting `?v=` bumped to `booking-a11y-verify-20260920` on every page. Committed as `ccc3a65` and pushed straight to `main`; confirmed redeployed live via polling GitHub Pages.
- **Known limitation of this verification:** this session had no browser/screenshot tool available (no built-in browser, no Chrome extension, no local headless browser) — everything above was verified by reading the deployed source and hand-tracing the layout math and booking logic, not by an actual rendered screenshot. A real click-through on a phone/tablet is still worth doing to be fully sure, especially for the two-line "Continue" click states.

---

## 19. OFFICIAL PROJECT CONFIGURATION (set 2026-09-21 — read this before making any product/config decision)

The owner set these as final decisions on 2026-09-21. **Do not reconfirm these with the owner and do not invent conflicting settings** — this section is the single source of truth for them. Each subsection below also says what's actually built vs. still needed.

### 19.1 Ministry identity
- Official name: **The Unveiled Assembly of Christ Jesus**. Public site (target): `https://theunveiledassembly.com`. Contact email: `contactunveiledassembly@gmail.com`. Location: **Georgia, United States** (state-level only — no city, no physical mailing address anywhere on the site). Minimum account age: **16**, self-attested only (not ID-verified).
- **Built:** registration now has a required "I confirm I am at least 16 years old" checkbox (`app.js`, `regAgeConfirm`), stored as `ageConfirmed16Plus: true` on the user's profile doc. `connect.html` already used the contact email correctly (`mailto:contactunveiledassembly@gmail.com`) and no address is displayed anywhere. The homepage's old Night of Prayer card hardcoded "Macon, Georgia" — removed (see 19.6).

### 19.2 Domain / Cloudflare — DNS records and GitHub Pages settings needed (not applied automatically, per instruction)
This repo is still only reachable at `https://contactunveiledassembly-oss.github.io/unveiled-assembly-redesign-preview/` (see Section 1) — no `CNAME` file exists yet. To point `theunveiledassembly.com` (canonical) and `www.theunveiledassembly.com` (redirecting to canonical) at this repo via Cloudflare:
1. **Add a `CNAME` file** to the repo root containing exactly: `theunveiledassembly.com`
2. **In this repo's GitHub Settings → Pages:** set Custom domain to `theunveiledassembly.com`, wait for DNS check to pass, then enable "Enforce HTTPS".
3. **In Cloudflare DNS** for `theunveiledassembly.com`:
   - Four `A` records at the apex (`@`) pointing to GitHub Pages' IPs: `185.199.108.153`, `185.199.109.153`, `185.199.110.153`, `185.199.111.153`.
   - One `CNAME` record: `www` → `contactunveiledassembly-oss.github.io`
   - Set the proxy status ("orange cloud") to **DNS only (grey cloud)** for these records while first verifying — GitHub's own HTTPS cert issuance can fail behind Cloudflare's proxy. Once the custom domain is verified and HTTPS is enforced on the GitHub Pages side, the records can be switched to proxied if the owner wants Cloudflare's CDN/WAF in front of it — not required either way.
4. **Redirect `www` → apex:** either let GitHub Pages' own www→apex redirect handle it (it does this automatically once the custom domain is set, no Cloudflare Page Rule needed), or add a Cloudflare Bulk Redirect if proxying `www`.
5. This point-of-no-return step (actually changing DNS / the custom domain) needs the owner or someone with Cloudflare/GitHub access to execute — an AI session should not do this without being explicitly asked to, since it affects the live custom domain that currently serves the OLDER, different repo (`unveiled-assembly-website`, see Section 1).
- Member/Ministry portals stay inside the main site (no portal subdomain) — already true, no change needed; they're dialogs rendered by `app.js` on the same pages.

### 19.3 Booking — pricing, "no fake availability," auth-before-booking
- Session prices: **15-Minute One-on-One is now $30** (was $25 — fixed in `app.js` `SESSION_TYPES`), **30-Minute One-on-One stays $50** (already correct). Ministry time zone: Eastern (`America/New_York`) — already correct (`BUSINESS_TZ`).
- **Built — real bug fix:** `AVAILABILITY_RULES` used to default to a hardcoded Tue/Thu 2–6pm schedule **even in production**, with no way to tell "the owner configured this" from "nobody's configured anything yet." Production now starts with zero rules, and `computeOpenSlots()` shows the exact required message — `No booking times are currently available. Please check back soon.` — until the owner adds real weekly hours in Ministry Portal → Bookings → Availability. DEMO_MODE/preview keeps the Tue/Thu sample (clearly labeled "Preview build" in the footer).
- **NOT built — real follow-up work, not just documentation:** "An authenticated account is required before completing a booking," with the specific resume-after-sign-in flow (preserve selection → open sign-in/create-account → resume → recheck availability → recreate hold → proceed to payment). This is intentionally not implemented yet because the LAST step of that flow is a real Stripe payment, and building the auth-gate now would mean shipping a dead end (sign in, then... nothing to pay with). Build this together with 19.5 once the Stripe backend exists, not before — otherwise it has to be built twice.

### 19.4 Booking policies
- Full payment required, non-refundable, one reschedule allowed with owner/authorized-team approval, no-show ≠ reschedule-eligible, never expose one customer's booking to another: **the last of these is already true** (`bookings` read rule is admin-or-owner-of-the-booking-only — see Section 7). The others depend on real payment existing (19.5) — can't meaningfully enforce "full payment required" with no payment processor connected.
- Slot release on cancel/reschedule-approval: **already correct** — Phase 1 (Section 18 above) fixed the one place this was silently broken (admin cancelling an already-confirmed appointment), and `cancelOwnBooking`/`rescheduleBooking`/decline all correctly free the slot via `releaseSlotOccupancy()`.
- **Not built:** a *customer-initiated* "request a reschedule" flow with owner approval — today, reschedule is entirely owner-initiated from the Ministry portal (`rescheduleBooking`). A member has no "request reschedule" button anywhere. This is real, scoped, buildable follow-up work (a `rescheduleRequests` collection + member-facing UI + owner approve/deny), just not done in this pass.

### 19.5 Stripe — frontend integration points prepared; backend is real, separate work
Owner already has a Stripe account (`princessmyauna428@gmail.com` — kept out of any public page). Cards + Apple Pay, statement descriptor `UNVEILED ASSEMBLY`, one account for both 1:1 sessions and classes.
- **What's true today:** no Stripe code exists anywhere in this repo (confirmed in Section 8/14 already). Nothing was added that pretends otherwise — no fake "payment successful" state exists or was added.
- **Why this isn't built yet:** "never place secret keys in GitHub or frontend JS" + "verify payment success securely before confirming" together mean this genuinely needs a small backend/serverless function (Firebase Cloud Functions on the **Blaze** plan, or an external serverless host like Vercel/Netlify functions) that holds the Stripe secret key and verifies webhook signatures — that's infrastructure and an account-level decision (which host, whether to upgrade the Firebase plan) that has to be made by the owner, not invented by an AI session.
- **What to build once that decision is made** (a concrete, scoped plan for whoever picks this up):
  1. A `POST /create-checkout-session` (or PaymentIntent) endpoint on the chosen backend, given `{ sessionType, date, time, holdId, customerEmail }` — looks up the real price server-side from `sessionTypes` (never trusts a client-supplied amount).
  2. Frontend calls that endpoint after the existing hold is created, redirects to Stripe Checkout (cards + Apple Pay enabled in the Stripe Dashboard, statement descriptor set there too).
  3. A Stripe webhook endpoint on the same backend verifies the signature, and only THEN flips the booking to `status: 'confirmed'`/`amountPaid` — never the client.
  4. The existing `bookingHolds`/`slots` transaction logic from Phase 1 (Section 18) needs no change — it already exists specifically so a hold survives the trip to Stripe and back.

### 19.6 Night of Prayer — built, real, dynamic
No date is scheduled — confirmed, and now enforced in code rather than just written down.
- **Built:** a `nightOfPrayer/config` Firestore doc (public read, admin write — see `firestore.rules`), a small admin form under Ministry Portal → Bookings → Availability ("Night Of Prayer") to set/clear a date+time, and a homepage card (`#nightOfPrayerCard` in `index.html`, rendered by `renderNightOfPrayerCard()` in `app.js`) that shows the neutral message — *"The next Night of Prayer will be announced soon."* — whenever no date is set, and only shows real details (date, time, Zoom, Free, No Registration Required — all fixed per the decided config, not admin-editable yet) once one is. The old hardcoded "7:00 PM, Macon, Georgia, Save Your Spot" markup is gone.

### 19.7 Email and SMS
Official/reply-to: `contactunveiledassembly@gmail.com`. Required transactional emails: booking/payment/reschedule/cancellation/class-registration confirmations, 24-hour and 1-hour reminders. SMS via Twilio once the owner finishes setting up that account; explicit opt-in required.
- **What's true today:** no email-sending code exists anywhere in this repo (client-side JS can't send email directly — this always needed a backend). No Twilio code exists either. The SMS opt-in CHECKBOX already exists on the booking form (`bookingAgreeSms`) and is already stored on the booking doc (`smsConsent`) — that part is real.
- **Not built, needs the same backend as 19.5:** actually sending any of these. Once a backend exists for Stripe, the natural place to send these is the same webhook/Cloud Function (e.g., trigger a transactional email on `bookings` doc write via a Firestore-triggered Function, using something like Firebase Extensions' "Trigger Email" + SendGrid/Mailgun, or a Twilio SendGrid call). Do not invent Twilio credentials or wire up fake success — genuinely not connected yet.

### 19.8 Prayer requests, testimonies, and class reviews — real Firestore storage (this was a severe pre-existing bug, now fixed)
- **Found this session:** `PRAYER_REQUESTS`, `TESTIMONIALS`, and `CLASS_REVIEWS` were **100% localStorage-only in every environment, including production** — unlike every other feature in this codebase (bookings, users, scheduling, etc.), there was no `DEMO_MODE` split at all. A real visitor's prayer request or testimony submitted on the real production domain would never have reached the ministry — it just sat in that one visitor's own browser, invisible to the admin. This was not caught by the earlier sections of this document because nobody had traced these three specific features before.
- **Fixed:** all three now write to real Firestore collections (`prayerRequests`, `testimonials`, `classReviews` — see `firestore.rules`) in production, while DEMO_MODE/preview keeps the exact same in-browser sample behavior as before. Prayer requests are admin-only readable (never public, anonymous submission already worked — name/email/phone were already optional on the form). Testimonies/reviews start `pending` and are never publicly readable until an admin sets `status: 'published'`; a guest can only ever read published ones.
- **Also found and fixed:** the testimony and class-review submission forms had **no way for the submitter to choose** public-with-name / public-anonymous / private — `visibility` was hardcoded to `'private'` in the JS even though the admin-side rendering already fully supported all three states. Added a real 3-option choice to both forms.
- **Retention (30 days private/unpublished, published kept until unpublished/deleted):** not enforced by any code — Firestore doesn't have a security-rules mechanism for this; it needs a **Firestore TTL policy**, which is a Google Cloud Console / `gcloud` operation, not application code:
  - `gcloud firestore fields ttls update createdAt --collection-group=prayerRequests --enable-ttl`, and the same for `testimonials`/`classReviews` scoped to `status != 'published'` — TTL policies delete on a `timestamp`-typed field, so this needs `createdAt` stored as a Firestore Timestamp for the TTL-managed collections (currently stored as an ISO string for sort-compatibility with the DEMO_MODE arrays — reconcile this when actually setting up TTL, e.g. add a parallel `expiresAt` Timestamp field computed at write time for prayer requests, and only set it on testimonials/reviews while `status` is still `pending`/`private`, clearing it on publish).
  - This needs someone with Firebase Console/CLI access to actually configure; not something this session could apply from here.
- **Still not built (video specifically):** a testimony's video attachment is still preview-only (`URL.createObjectURL`, dies with the browser tab) — this was already true before this session and is flagged again under 19.9 since it's the same underlying gap as photo/video uploads generally.

### 19.9 Media uploads — validation not yet added, storage backend not yet migrated
Limits decided: photos ≤10MB (JPG/JPEG/PNG/WebP), videos ≤250MB (MP4/MOV/WebM); validate before upload with clear rejection messages; store persistently (not `createObjectURL`); never commit user media into GitHub; preserve the submitter's visibility preference.
- **What's true today:** `wireAdminImageField()` (admin image uploads for teachings/session types) and the testimony video field both use `URL.createObjectURL()`/data-URL-style handling — genuinely temporary, browser-tab-scoped, exactly what the new requirement says not to rely on. `mediaLibrary` is a real Firestore collection already (public read, admin write), but images there are stored as inline data, not in a real object-storage bucket.
- **Not built this session** (flagged rather than rushed): client-side type/size validation with clear rejection messages on every upload input, and migrating actual file bytes to Firebase Storage (`storageBucket` is already configured — `unveiledassembly.firebasestorage.app` — just not used for this) with Storage security rules mirroring the visibility rules already written for `mediaLibrary`/testimonials. This touches several upload call sites (`wireAdminImageField`, the testimony video input, and any future class-recording upload) and is real, scoped follow-up work.

### 19.10 Classes/classroom, Shop, Giving
- Classroom access rules (paid-or-comp, Zoom visible 1hr before, study guides, per-class recording toggle, cancel = lose access): **already implemented and unchanged** — see Section 9/12 of this file and `classEnrollments`/`teachingZoomInfo`/`classroomContent` rules. Paid-class access still depends on 19.5 (no real payment processor connected yet, so "paid" access today is admin-granted only, same caveat as bookings).
- Shop: **unchanged, left exactly as "Coming Soon"** per instruction — cart stays hidden/disabled, no ecommerce built.
- Giving: **unchanged** — Cash App (`$UnveiledAssemblyOCJ`) preserved on `give.html`. Stripe donations / recurring giving / receipts are not implemented and the page does not claim they are.

### 19.11 Roles and permissions — schema/rules ready for one, full enforcement is the next real project
Decided roles: Owner, Booking Manager, Class Manager, Prayer Team, Testimony Reviewer, Website Editor, Member Support, Member. Owner has full control; no other role can self-promote, change the Owner, view unrelated private data, touch Stripe secrets, change global security settings, or grant itself permissions.
- **What's true today:** `users.role` is still binary (`'member'` / `'admin'`) everywhere — in `firestore.rules`' `isAdmin()` and every single admin-only check across `app.js`. There is no code anywhere that reads or enforces a `'booking-manager'`/`'prayer-team'`/etc. value.
- **Built this session (a real, working, but intentionally narrow foundation):**
  - A new `auditLog` collection (`firestore.rules`): write-only (nobody, including the writer, can edit or delete an entry — that's the point of an audit trail), admin-read-only, and the write rule requires `actorUid == request.auth.uid` so an entry can't be forged as someone else.
  - `logAdminAction(action, details)` in `app.js`, wired into the highest-value actions that were already being touched this session: booking confirm/decline/admin-cancel, and prayer/testimony/class-review status changes. This is a real, working audit trail for those specific actions — not a stub.
- **Not built (the actual multi-role system):** rewriting `isAdmin()`-style checks into a real permission matrix, adding the 6 new role values to `users.role`, building a role-management UI (only the Owner can assign roles, matching the "no self-promotion" rule), and extending `logAdminAction()` to every other admin action across the app (teaching management, scheduling changes, member management, etc.). This is large — touches most of `app.js`'s ~40 admin-only functions and every corresponding rule — and deliberately scoped out of this pass rather than done partially/inconsistently, which would be worse than not starting it (a permission check that LOOKS like it restricts a Booking Manager but doesn't, in 30 places, is worse than no restriction at all, because it looks done). Recommended next step: pick ONE role (e.g., Prayer Team) and build its full restricted view end-to-end as the template for the rest, rather than adding all 6 role names everywhere at once.

### 19.12 Social media
- Instagram is the only active account, preserved everywhere it already appeared. Facebook and YouTube are now **fully hidden** (not rendered at all — previously shown as disabled/greyed-out placeholder icons with `href="#"`, which is also what Phase 1's "no href=#" fix had partially addressed). No social URLs were invented; Facebook/YouTube stay in `SOCIAL_LINKS` in `app.js` with `ready: false` so re-enabling one later, once a real URL exists, is a one-line change.

---

*This file should be updated any time a feature moves from PLANNED to IMPLEMENTED, or when architecture changes — so the next AI session (or the next person) can trust it again.*
