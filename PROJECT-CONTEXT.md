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
- `bookings/{bookingId}` — booking requests with name/email/session type/date/time/status. **Corrected 2026-09-21: an account is now required to book** — a signed-in visitor can only create a pending booking with their own `uid`; only admin can create pre-confirmed ones or one with any other `uid` (used by manual "Add An Appointment"). A signed-in user can only cancel their own booking; admin can fully manage. **Correctly NOT publicly readable — this is exactly why the public booking page cannot and does not query this collection directly (see Section 8's Phase 1 fix).**

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
- **Built (added in the correction pass, 2026-09-21):** an account is now genuinely required before booking. `bookingStepSessionNext`'s click handler stops a signed-out visitor right after they choose a session (before date/time selection or any hold is created), via `requireAccountForBooking()`/`resumePendingBooking()` — the same established pattern this codebase already used for class registration (`requireAccountForTeachingRegister()`). The selected session survives the interruption; date/time do not need to (none had been picked yet), and continuing through the normal wizard after sign-in naturally recreates the hold and rechecks availability, so nothing extra had to be built for that part. `firestore.rules`' `bookings` create rule now independently enforces this too (`request.auth != null` and the submitted `uid` must equal the caller's own, unless admin) — a client-side gate alone was never enough, since a request could otherwise bypass the UI entirely. `createBooking()` can no longer be called with `uid: null` from the public form. Admin manual booking (`adminBookForm`) is untouched — it doesn't send `uid` at all, which is fine, since the rule's admin branch doesn't require one, and `isAdmin()` still bypasses the whole non-admin condition.
- The booking flow still doesn't attempt real payment (see 19.5) — "proceed to payment" after the hold is created continues to mean the existing pending/admin-managed flow, not a Stripe checkout, exactly as before this pass.

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

### 19.8 Prayer requests, testimonies, and class reviews — real Firestore storage, private/public split, awaited writes (corrected 2026-09-21)
- **Found this session:** `PRAYER_REQUESTS`, `TESTIMONIALS`, and `CLASS_REVIEWS` were **100% localStorage-only in every environment, including production** — unlike every other feature in this codebase, there was no `DEMO_MODE` split at all. A real visitor's prayer request or testimony submitted on the real production domain would never have reached the ministry — it just sat in that one visitor's own browser, invisible to the admin.
- **First fix (same day) had its own bug, since corrected:** the initial fix wrote submissions to Firestore but reported success to the visitor *before* actually confirming the write landed (unawaited, via `Promise.allSettled` over the whole in-memory array with no per-write error check) — a rejected write could still show "we received your request." It also made `testimonials`/`classReviews` publicly readable once `status == 'published'`, which is unsafe: a Firestore document comes back whole, so that rule exposed the *entire* document — email, phone, internal notes, raw private text — to anyone who queried it, not just the fields the UI chose to display.
- **Corrected:**
  - `submitMinistryRecord()` is the one place a new prayer request/testimony/review reaches Firestore — awaited, writes only the single new document, disables the submit button and guards against a second overlapping submit (`ministrySubmitInFlight`), and on failure leaves the visitor's typed form data intact with `We couldn't securely send your submission. Please try again.` instead of resetting/closing/claiming success. `saveMinistryRecordEdit()` is the equivalent for admin-inbox edits (status change, internal note, publish-text edit) — also awaited, also surfaces a failure instead of assuming it worked.
  - `testimonials`/`classReviews` are now **admin-only readable, full stop, even once published** (`firestore.rules`). What the public actually reads is a separate, deliberately narrow **sanitized mirror** — `publicTestimonials`/`publicClassReviews` — containing only `sourceId`, `displayName`, `publicText`, `title`/`className`, `rating`, `reviewDate`, `status`. `sanitizePublicMinistryRecord()` in `app.js` is the only place that mirror gets built, and `firestore.rules`' `validPublicMirror()` independently enforces the same field allowlist with `hasOnly` + type/length checks server-side — not just "the client UI happens to only copy safe fields." Publishing creates/updates the mirror doc (same id as the source); unpublishing or deleting the source removes it. This interim mechanism is a signed-in admin's browser performing the copy directly (this app has no Cloud Functions yet — see 19.5); a trusted server-side function doing this copy instead, once one exists, would be strictly more correct than trusting any admin's client.
  - A submission marked `visibility: 'private'` can never be published as-is — `setTestimonyStatus()`/`setReviewStatus()` block it with a clear message until the owner explicitly changes the visibility first, which they now can, via a real `<select>` in the admin detail dialog (previously a read-only display with no way to change it).
  - The testimony and class-review submission forms had **no way for the submitter to actually choose** public-with-name / public-anonymous / private — `visibility` was hardcoded to `'private'` even though the admin-side rendering already fully supported all three states. Added a real 3-option choice to both forms, and `firestore.rules` now validates it's one of exactly those three on create.
  - The testimony form's consent check used to accept either of two checkboxes (`!formData.get('permission') && !formData.get('terms')`) even though the form only presents one (`permission`) — a latent bug where a checkbox the form doesn't have could have silently substituted for the one it does. Now checks `permission` directly.
- **Second correction pass (same day) fixed three more problems found in review of the fix above:**
  - `publicTestimonials`/`publicClassReviews`' rule used one `allow write` for create/update/delete together, running `validPublicMirror(request.resource.data)` against a delete — but a delete has no `request.resource` (no replacement document), so that rejected every legitimate admin unpublish/delete. Split into `allow create, update: if isAdmin() && validPublicMirror(...)` and a separate `allow delete: if isAdmin()`.
  - Unpublishing used to save the private source's new status first and delete the public mirror after — if the mirror delete then failed, the source already said "not published" while the public copy was still live, and a retry could skip the mirror delete entirely because the code checked a (by-then-stale) `wasPublished` flag. `setTestimonyStatus()`/`setReviewStatus()` now delete the public mirror FIRST, unconditionally whenever the new status isn't `'published'` (not gated on `wasPublished` — Firestore's delete is a no-op on an already-gone doc, so this is safe and idempotent to retry), and only change/save the source's status once that's confirmed. On failure the in-memory item's status is never touched, so nothing shows an unsaved change and the same action is always safe to retry. Deleting a submission outright follows the same order — the public mirror is removed first; if that fails, the private source is deliberately left alone so the admin can retry rather than being left with an orphaned public copy and no source to retry from.
  - The three private submission collections' create rules validated only `hasAll` (required fields present) with no `hasOnly`, so a client could attach arbitrary extra fields. Added explicit `hasOnly` allowlists (`validPrayerSubmission()`/`validTestimonySubmission()`/`validClassReviewSubmission()` in `firestore.rules`) matching exactly what each of the three real forms sends, with type and max-length checks on every field, a `status`/`visibility` enum check, and `id` required to equal the document's own path id.
- **Retention (30 days private/unpublished, published kept until unpublished/deleted):** still not enforced by any code — Firestore doesn't have a security-rules mechanism for this; it needs a **Firestore TTL policy**, a Google Cloud Console / `gcloud` operation, not application code:
  - `gcloud firestore fields ttls update createdAt --collection-group=prayerRequests --enable-ttl`, and the same for `testimonials`/`classReviews` scoped to `status != 'published'` — TTL policies delete on a `timestamp`-typed field, so this needs `createdAt` stored as a Firestore Timestamp for the TTL-managed collections (currently an ISO string, for sort-compatibility with DEMO_MODE's arrays — reconcile this when actually setting up TTL).
  - Needs someone with Firebase Console/CLI access to configure; not something this session could apply from here.
- **Video attachments:** never durably stored (see 19.9) — production no longer even sets `hasVideoPreview: true` on a real submission (it used to, which was itself a small honesty bug: claiming a video was "attached" when only a tab-local object URL existed). DEMO_MODE still shows the in-session preview, clearly as a preview. The public mirror never carries video info at all.

### 19.9 Media uploads — production upload disabled with clear "coming soon" copy; storage backend not yet migrated
Limits decided: photos ≤10MB (JPG/JPEG/PNG/WebP), videos ≤250MB (MP4/MOV/WebM); validate before upload with clear rejection messages; store persistently (not `createObjectURL`); never commit user media into GitHub; preserve the submitter's visibility preference.
- **What's true today:** `wireAdminImageField()` (admin image uploads for teachings/session types) and the testimony/review media field both used `URL.createObjectURL()`/data-URL-style handling — genuinely temporary, browser-tab-scoped. `mediaLibrary` is a real Firestore collection already (public read, admin write), but images there are stored as inline data, not a real object-storage bucket.
- **Corrected this pass (2026-09-21):** rather than leave the testimony/review file input up and silently discard whatever a real visitor attaches (or keep claiming a "preview" that outlives the sentence it's described in), it's now **disabled outright on the production domain** with clear copy — "Photo and video attachments are coming soon — not available yet." — and DEMO_MODE alone still shows the in-session preview, explicitly labeled as such. This is the "disable with a clear coming-soon explanation" option from the two the owner offered, chosen over "label as local preview" because a submission's local-tab preview doesn't survive past that one browser session anyway, so labeling-without-disabling would have kept inviting an upload that was never going to reach anyone.
- **Not built this pass** (flagged rather than rushed, and explicitly out of scope for the correction pass that produced the fix above): client-side type/size validation with clear rejection messages on the *admin* upload inputs (`wireAdminImageField` etc. — separate from the now-disabled public testimony field), and migrating actual file bytes to Firebase Storage (`storageBucket` is already configured — `unveiledassembly.firebasestorage.app` — just not used for this) with Storage security rules mirroring the visibility rules already written for `mediaLibrary`/testimonials. Real, scoped follow-up work.

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

## 20. Session Log — 2026-09-24: cleanup/update pass (NOT YET COMMITTED — owner review pending)

**Everything in this section is sitting uncommitted on local branch `phase3-cleanup-pass`** in the clone at `/Users/yaunahlove/Projects/unveiled-assembly-redesign-preview` — per explicit instruction, nothing was committed or pushed. `main`/GitHub/the live preview are all untouched and still reflect the state as of Section 19. If this session is lost before the owner reviews and commits, `git diff main` on that branch is the complete list of what changed.

### 20.1 Beliefs page
Replaced the "Prayer" belief card with "Deliverance," using the owner's exact doctrinal statement and scripture list (John 8:31–36, Romans 12:2, Colossians 1:13–14, John 17:17, Romans 1:16, 2 Corinthians 3:17). No other belief card touched.

### 20.2 Header logo — real bug, found and fixed
**Root cause:** every page's favicon `<link>` and all three of `app.js`'s logo `<img>` tags (main nav, member-portal dialog header, member top-nav) pointed at `assets/ua-logo-original.png` — a file that has **never existed in this repository's git history at all** (confirmed via `git log --all`), not something that was deleted. The real, actually-committed logo asset is `assets/ua-logo-tight.png`/`.svg` (a genuine "UA" monogram, added via the "Seed logo asset" commit). All 16 references across every page + `app.js` now point at the real file.
- **Also found and fixed while investigating:** the existing "hide the image if it fails to load" fallback (`img.hidden = true`) silently never actually worked, because `.brand-logo{display:block}` in `styles.css` is an author-stylesheet rule, and author rules always beat the browser's own built-in `[hidden]{display:none}` styling regardless of selector specificity — so even when the error handler fired, nothing actually hid. Now sets `img.style.display='none'` instead, which does win. Also extended the same fallback to the two portal logo `<img>` tags that never had any error handling at all, and fixed the fallback text itself (was "UV", now "UA", matching the actual monogram).

### 20.3 One-on-One page photography placement
Added a large "atmospheric portrait" placeholder right after the hero and a 3-across detail grid (Bible/notebook, two-people-conversation, hands/chair detail) after "How It Works" — new `.photo-placeholder`/`.photo-placeholder-grid` CSS component (dark textured box + a caption describing the intended real shot, not a stock photo). The existing session-card grid and booking flow were not touched at all — this was purely additive. **Deferred per instruction:** the deeper page restructure is still to be discussed separately.

### 20.4 Connect page — Instagram preview + Gathering gateway
Added two new sections between the hero and the existing discover-list (which is unchanged): a "The Gathering" feature card (reuses the existing `.feature-card` component, links to `gather.html`) and an Instagram preview area (handle + real follow link + a 3-tile placeholder grid explicitly labeled "Feed Pending", reusing `.photo-placeholder-grid`). **No live Instagram data was faked** — see 20.11 below for exactly what a real integration needs. **Deferred per instruction:** the deeper Connect redesign is still to be discussed separately.

### 20.5 Site-wide color contrast audit
Read the entire stylesheet (2000+ lines, every button/hover/active/disabled/card/nav/both portals/form/booking-dialog/modal) plus every inline `style="color:...background:..."` combination in `app.js` and all HTML pages. **Finding: the color system was already remarkably well-maintained** — dedicated dark-context tokens (`--stone`/`--stone-dim`) vs. light-context tokens (`--ink-muted`/`--ink-dim`) are applied consistently everywhere, including deep, deliberate overrides for shared components reused in different contexts (`.portal-panel.wine`, `[data-portal-view="member"]`, `.classroom-dialog`, etc.) — evidence of real prior contrast work, not luck. The only two actual violations found were the header logo (20.2) and the two portal background photos (20.7) — both fixed. Added an explicit "DARK BACKGROUND = LIGHT TEXT, LIGHT BACKGROUND = DARK TEXT" rule as a comment directly at the `:root` token declarations so it's a documented contract for whoever adds the next component, not just an unwritten convention.

### 20.6 Give page — donation interface prepared, no fake payment processing
Built a real amount-selection UI (preset $25/$50/$100/$250 + custom amount, one-time/recurring toggle) that **actually works today** by constructing a `https://cash.app/$UnveiledAssemblyOCJ/<amount>` deep link — a real, documented Cash App URL pattern (not invented), not a simulation of anything. Donor information fields and the "Recurring" option are visibly present but disabled/labeled "Coming Soon" — genuinely not connected, and nothing pretends otherwise. **Confirmed:** the existing Cash App option was not removed. See 20.11 for exactly what's needed to connect real card/Apple Pay giving.

### 20.7 Member Portal + Ministry/Owner Portal background — real bug, found and fixed
**Root cause:** `.member-hero` (the member dashboard's hero band) and `.portal-view[data-portal-view="owner"]>.portal-head` (the Ministry/Owner header) both hotlinked full-color Unsplash photos with **no desaturation** — unlike every other `.member-*-art` spot in the file (all of which already had `filter:grayscale(1)`), these two were the one inconsistent, "colorful," off-brand background the owner was describing. Both replaced with the same subtle radial-gradient-on-black texture the main site `.hero` already uses — no photo dependency at all, matching "black, charcoal, subtle texture" exactly. The smaller, already-grayscale accent images elsewhere in the member portal (feature/session/quote/record thumbnails) were left as-is — they were already correctly desaturated and consistent, so touching them wasn't necessary or in scope.

### 20.8 Ministry Owner Portal — real member count
Added a "Members" stat tile to the People panel header (`#ownerMemberCount`), driven by `setOwnerMemberCount()` — called from both `loadOwnerMembers()` (production, reading the real `users` Firestore collection) and `renderOwnerPeopleList()` (DEMO_MODE). **Never hardcoded**, always `role !== 'admin'` filtered out of whichever real dataset is currently loaded, and reflects the *total* count even while the search box is filtering the visible list (a search narrowing what's shown doesn't make the total look smaller).

### 20.9 One-on-One date + time on the same screen
**Re-verified, not rebuilt** — this was already fully implemented in Phase 1 (Section 8/10): the Calendly-style calendar and the adjacent time-slot column live in the same wizard step, calendar clicks call the time-slot loader directly, and nothing in this pass touched that code. Confirmed no photography/placeholder additions (20.3) or other edits this session altered `#bookingDialog`'s markup or `app.js`'s booking wizard logic.

### 20.10 Testimony privacy/consent + Class Reviews
- **Visibility choice (public/anonymous/private) and the never-auto-publish approval workflow were already real**, built in Phase 2 (Section 19.8) — re-verified, not rebuilt.
- **What this pass actually added:** a redesigned, centered "Visibility & Consent" card (new `.consent-card`/`.consent-option` component) on both the testimony and class-review forms, replacing a plain checkbox at the bottom of the form — each option now shows the owner's exact wording (Public/Anonymous/Private descriptions) instead of a one-line label, and the terms checkbox restates "nothing publishes automatically" directly in its own copy.
- **Class Reviews specifically:** added a real "Leave A Class Review" entry point on the individual class page (`teaching-detail.html` — this only existed on `teachings.html`/`testimonials.html` before), which pre-selects the matching class in the review form when one exists. Added a one-click "Publish Anonymously" action to the owner's review/testimony management dialogs (previously required manually switching the visibility dropdown to Anonymous, then clicking Publish — same end result, now one click, matching the owner's example list exactly). The class list itself is still the same fixed set of options as before (Discernment, The Prophetic, etc.) — per instruction, the deeper "final class structure" work is still to be discussed separately, not built now.

### 20.11 What still needs the owner's decision or external setup
- **Photography:** every `.photo-placeholder` on One-on-One and Connect needs real photos shot and dropped in — each placeholder's caption is the shot direction for whoever does that.
- **Instagram:** the Connect page's feed grid is structural placeholder only. A real embed needs either Instagram's own Basic Display/Graph API (requires a Meta developer app + access token — a secret, needs a backend to hold it, same constraint as Stripe in Section 19.5) or a third-party embed service (e.g., SnapWidget, Elfsight) that doesn't need a backend but is a paid/external dependency the owner would need to choose and sign up for.
- **Give page card/Apple Pay + recurring + donor receipts:** blocked on the same Stripe backend decision already documented in Section 19.5 — nothing new needed beyond what's already written there.
- **Logo:** `ua-logo-tight.png`/`.svg` is what's actually live now (confirmed a real, deliberate "UA" monogram, not a placeholder) — if the owner has a different/newer logo file in mind, that's a separate "replace the logo" decision, not part of this bug fix.
- **Member count / roles:** the "Members" stat currently means "every `users` doc where `role !== 'admin'`" — if/when the full multi-role system in Section 19.11 (Booking Manager, Prayer Team, etc.) gets built, this count's definition of "member" should be revisited so a Booking Manager or Website Editor account doesn't skew it.

### 20.12 Not implemented this pass (explicitly deferred per instruction — documented, not built)
- Buying/enrolling in an entire Learning Path or course collection at once.
- Final class structure (the fixed Discernment/Prophetic/etc. list stays as-is for now).
- Deeper redesign of the One-on-One page (only photo placement was addressed).
- Deeper redesign of the Connect page (only the Gathering card + Instagram preview were added).

---

## 21. Session Log — 2026-09-24: One-on-One page full visual redesign (NOT YET COMMITTED — owner review pending)

**Everything in this section is sitting uncommitted on local branch `phase4-one-on-one-redesign`** (stacked on `phase3-cleanup-pass`, Section 20) in the clone at `/Users/yaunahlove/Projects/unveiled-assembly-redesign-preview`. Per explicit instruction, nothing was committed or pushed. `main`/GitHub/the live preview are all untouched. If this session is lost before review, `git diff phase3-cleanup-pass` on this branch is the complete list of what changed: `one-on-one.html` (full rewrite), `styles.css` (additive — new `.oo-*` component classes plus a `#bookingDialog`-scoped dark-theme override block), `app.js` (one function changed: `openBooking()`).

### 21.1 What this was, and an honest gap in it
The owner's message said a mockup image was attached as the primary visual reference and described it in ten detailed sections with exact copy for several specific lines. **No image file was actually visible/attached in what I received** — this was flagged at the time, before any work started, and this redesign was built entirely from the detailed text description, not from seeing the actual reference image. If the real mockup shows something the text didn't fully capture (exact spacing, a treatment I guessed at, a layout detail), it should be compared side-by-side once it's available.

**Second, more important gap:** by the time this task resumed after a context handoff mid-session, only fragments of the owner's exact specified copy survived in what carried forward — confirmed verbatim: the eyebrow "Personal Ministry," headline "One-On-One," the supporting line "Prayer. Direction. Discernment. Biblical Guidance.," the CTA "Book A Session →," the closing line "Come As You Are" / "Real Conversations. Real Direction.," and the four principle labels (Prayer/Direction/Discernment/Next Steps). **Everything else — the hero's supporting paragraph, each principle's one-line description, the "What To Expect" section's eyebrow/headline/five checklist items, and the booking-section microcopy — was written fresh in this pass, in the site's existing voice, not copied from the owner's original exact wording.** This needs to be checked against the owner's original message and swapped for the real copy anywhere it doesn't match.

### 21.2 The "stays on one screen" requirement — how it was interpreted
The spec called for session type, date, and available time to all be selectable "without navigating to another page." The existing booking mechanism (built in Phase 1, reused sitewide) is a single `<dialog id="bookingDialog">` overlay — the *same* modal every "Book A Session" entry point on the whole site already opens. Opening it never changes the URL and never leaves the page, so it was treated as already satisfying "no page navigation" (the same reasoning as a Calendly popup widget), and the fix was to **restyle** that dialog to match the new page rather than build a second, parallel inline calendar/time-picker. This is an interpretation, not something the owner confirmed directly — worth a quick "does this match what you had in mind" before treating it as settled.

### 21.3 What actually changed
- **`one-on-one.html`** — full rewrite: cinematic full-bleed hero (photo-placeholder background, headline/CTA overlay), a four-item "Ministry Principles" strip (numbered, restrained, no cards), the booking section (existing `renderOneOnOneCards()`/`#oneOnOneCardsList` reused as-is, just restyled into a responsive 2-up grid instead of a fixed single column), an editorial detail-image placeholder, a light-background "What To Expect" section with a five-item checklist, a dark closing section, and the existing three-photo detail grid kept at the bottom. Nothing about the nav/header/footer was touched.
- **`styles.css`** — additive only. New page-specific classes (`.oo-hero`, `.oo-principles`, `.oo-booking-section`, `.oo-expect-*`, `.oo-closing`, etc.) used only by this page, plus one line changing `.oneonone-cards-grid` from a fixed 1-column grid to `repeat(auto-fit,minmax(260px,1fr))`. Separately, a `#bookingDialog`-scoped block (~50 rules, every one ID-qualified) restyles the booking dialog's form side, session-option cards, calendar, and time buttons from the shared light checkout theme to black/charcoal-with-cream-selected-state. It's ID-scoped specifically because `#teachingRegisterDialog` and `#waitlistJoinDialog` share the exact same base `.checkout-dialog`/`.booking-option`/`.booking-field` classes and must keep their original light appearance — verified by grepping for every other consumer of those classes before touching them.
- **`app.js`** — `openBooking(service)` only: when a visitor clicks a specific session card **and is already signed in**, it now jumps straight to the date/time step instead of re-showing a redundant "confirm your session" step (the session was already implied by which card they clicked). A visitor who isn't signed in still lands on the session step exactly as before — the `requireAccountForBooking()` gate on the step's Continue button is completely untouched, so nobody gets to see date/time without hitting that same gate they always did. No availability, capacity, buffer, hold, or double-booking logic was touched anywhere.

### 21.4 Verification performed (and its limits)
No browser, screenshot tool, or Firebase emulator is available in this environment — same limitation as every prior phase. What was checked: HTML tag-balance (Python script, `one-on-one.html` balances clean), CSS brace-balance (`styles.css` balances clean, 1368/1368), a rough bracket-balance pass on `app.js` (all three pair types balance, consistent with a clean, additive insertion), and a manual read-through confirming every new class name is either genuinely new or, where an existing class was extended (`.oneonone-cards-grid`), that no other page depends on the value being changed. **Not verified:** actual rendered appearance at any viewport, real contrast-ratio measurement (colors were chosen from the site's own already-audited token pairs — `--ivory`/`--black` on dark, per the Section 20.5 contrast rule — not picked freestyle), and real interaction testing of the fast-path booking change (reasoned through against the current `openBooking()`/`requireAccountForBooking()`/`resumePendingBooking()` source, not click-tested in a browser).

### 21.5 Still needed before this is real (superseded by 21.6–21.9 below)
- ~~Real photography for the hero, the editorial detail shot, the closing section, and the existing three-shot detail grid~~ — done in the same-day follow-up pass; see 21.6.
- The owner's exact original copy for everything listed as "written fresh" in 21.1, once the original message/mockup can be re-checked — **still open**, unchanged by the photography pass.
- A visual/browser check once one is available — **still open**; no browser is available in this environment (see 21.8).

### 21.6 Real photography installed (same-day follow-up pass)
The owner supplied three approved photographs (`one-on-one-hero.png`, `one-on-one-booking.png`, `one-on-one-closing.png`, each 1536×~340px — wide editorial crops, not tall portrait shots) plus a README naming exactly which section each belongs to. Copied into a permanent, descriptively-named project location — **`assets/one-on-one/hero.png`, `assets/one-on-one/booking.png`, `assets/one-on-one/closing.png`** (not left in Downloads/temp/absolute-path) — and wired in via `background-image` on `.oo-hero-media`, `.oo-booking-image`, and `.oo-closing-media` respectively (`styles.css`), replacing every `.photo-placeholder` box that page had. The dark gradient overlays on hero/closing were lightened somewhat versus the placeholder version specifically so real photo detail (the room, the Bible, the light) stays visible instead of being crushed under a heavy black wash.
- **Because all three images are unusually wide/short (~4.5:1) rather than a typical photo shape**, every image layer uses `background-size:cover` with a hand-picked `background-position` (not a blind `center`) chosen from actually looking at each photo's subject placement, plus a separate mobile-breakpoint position for the hero specifically, per the owner's own instruction to use object-position intentionally at different sizes. **This is a judgment call made without a live browser to check it in** — see 21.8. If a subject looks clipped at a given width once this is actually viewed, the fix is a one-line `background-position` adjustment, not a rebuild.
- The old standalone "editorial detail" placeholder section and the bottom three-photo placeholder grid were both **removed**, per the owner's explicit "3 strong photographic moments over 6 weak image boxes" direction — the page's only photography now is the three real images above, each doing real work (hero, booking-panel, closing), not decoration.
- The "What To Expect" section's dark half (`.oo-expect-media`) reuses **`hero.png` again, at a different crop position** (`70% 60%` vs. the hero's own `32% 38%`) rather than inventing a fourth image — the owner supplied exactly three approved photos and asked for a "dark visual treatment that connects to the approved photography," not a new one, so this deliberately isn't a fourth distinct photo. Worth knowing if a dedicated fourth image is ever supplied later.

### 21.7 Booking section rebuilt as a 50/50 editorial split
`.oo-booking-image` (real photo, full-bleed, no card border) sits beside `.oo-booking-panel`, which now visibly shows "Step 1 — Select Session" (the real session-type cards, restyled smaller/inline — still `renderOneOnOneCards()`, nothing hardcoded) and non-interactive "Step 2 — Select A Date" / "Step 3 — Available Times" preview rows that explain what happens next before a visitor clicks anything.
- **The architecture decision, stated plainly:** date and time selection still happen inside the existing `#bookingDialog` (opened by a session card's Select button), not literally inline in the page's DOM. The owner's instructions explicitly allowed this ("If the existing architecture still requires the shared booking dialog/modal, visually integrate it as seamlessly as possible rather than rebuilding working backend behavior unnecessarily") — building a second, page-inline calendar/time-grid would mean duplicating the rendering layer for `bookingCalendarGrid`/`bookingTimeButtons`/etc., which every other page's booking button also depends on, for real risk of diverging the two copies. What's true today is unchanged from Phase 1: once the dialog opens, date and available times already live in one view and update together (calendar click → `loadTimeSlots()` → same screen) — that behavior was verified again, not touched.
- **A copy discrepancy, flagged rather than silently resolved:** the owner's message describes the two sessions as "15 MIN — Prayer + Direction" and "30 MIN — Extended Ministry Session." The cards actually shown pull their name/description live from `SESSION_TYPES` in `app.js` (currently: 15-Minute — "A focused conversation for one question, quick counsel, or a specific area of clarity"; 30-Minute — "A deeper conversation for discernment, prayer, guidance, and personal direction"). These were **not overwritten** with the message's wording, because the card renderer is intentionally data-driven from what the Owner configures in Owner → Bookings → Session Types (see the original code comment at `oneOnOneCardHtml()`) — hardcoding different text here would silently diverge from whatever the ministry actually has configured as the real, priced session description. If "Prayer + Direction" / "Extended Ministry Session" should become the official description text, that's a one-time edit in the Owner Portal, not a code change — happy to make it there if asked.

### 21.8 Verification performed this pass (and its limits)
Same no-browser/no-emulator constraint as every prior phase. Checked: HTML tag-balance and CSS brace-balance on the rewritten `one-on-one.html`/`styles.css` (both clean), that all three image files actually exist on disk at the referenced paths and are served with HTTP 200 by the local preview server, and that no element ID used by `app.js`'s booking/rendering code (`oneOnOneCardsList`, `oneOnOneEmptyState`, `bookingDialog`, etc.) was renamed or removed in the rewrite — `app.js` itself was not touched in this pass. **Not verified:** actual rendered appearance, whether the hand-picked `background-position` values actually keep each photo's subject in frame at every breakpoint (21.6), or real contrast measurement of text over the now-lighter photo overlays.

### 21.9 Local preview
A static file server is running for this branch's working tree (includes all uncommitted changes) at **http://localhost:8080/one-on-one.html** — refresh to see this pass's changes. Nothing in this section has been committed or pushed; `git status` on `phase4-one-on-one-redesign` still shows only uncommitted working-tree changes (now including the new `assets/one-on-one/` directory).

---

## 22. Standing requirement — owner-controlled media/content library (documented 2026-09-24, not built)

Raised while installing the One-on-One photography (Section 21.6): those three images are currently hardcoded `background-image` paths in `styles.css`, changeable only by editing code and redeploying. The owner's stated direction going forward:

> If we build something externally that reasonably needs to change over time, we should also build an internal owner control for it.

Concretely, this applies to (non-exhaustive, will grow): hero/section images (One-on-One and any future page built this way), Member/Ministry Owner Portal background imagery (Section 20.7), featured/class imagery, Gathering imagery, and eventually general editable website copy. The eventual shape described: an image/media library inside the Owner Portal where approved images can be uploaded, saved, reused, switched, and removed **without deleting the underlying approved asset** — i.e., swappable references, not destructive replacement.

**Explicitly not built in this pass or this branch** — this is a scoped future initiative (almost certainly needs Firebase Storage, which Section 19.5's "no Cloud Functions / no new paid services without a decision" constraint already flags as its own separate decision) — this section exists so the requirement isn't lost, not as a commitment to when it gets built.

---

## 23. Session Log — 2026-09-25: One-on-One "Option C" — approved mockup + inline booking (NOT YET COMMITTED — owner review pending)

Still entirely uncommitted on `phase4-one-on-one-redesign`. This pass replaced Section 21/22's earlier version of the page with a build against a specific approved mockup image (`APPROVED-option-c-reference.png`, supplied directly, not from a text description this time) plus four cropped photography extracts from it. Where this section conflicts with anything in Section 21, **this section is current.**

### 23.1 Photography — what's real vs. what needed cropping
The four "photography" files supplied with the mockup turned out to be screenshot crops of the mockup itself, each with a sliver of an adjacent section's UI text baked into the pixels (e.g. the "expect" crop had "Nothing is confirmed until you complete your booking." burned into its top ~30px) — not clean standalone photos. Handled per source:
- **Hero and Booking** photos matched what was already installed from the prior pass (`assets/one-on-one/hero.png`, `booking.png`) — reused as-is, no new file needed.
- **Closing and What-To-Expect** are genuinely new photos (a praying woman; a figure walking through a concrete archway toward stairs) that didn't exist before. Their baked-in text strips were removed with a centered `sips -c` crop (trims a little off both top and bottom rather than a precise top-only cut, since this machine has no ImageMagick/PIL and `sips --cropOffset` did not actually apply when tested) — verified afterward by viewing the result directly: no text remains, and the subject (praying hands; the walking figure and stairs) is fully intact in both. Installed as **`assets/one-on-one/closing.png`** (replaces the previous bible-on-table photo, which the new mockup doesn't use for this section) and the new **`assets/one-on-one/expect.png`**.

### 23.2 Session/date/time are now genuinely inline — not a dialog handoff
This is the significant architecture change this pass. Rather than the previous version's "real cards + a Continue button that opens the dialog" compromise, the dialog's own real elements — `#bookingOptions` (the session-type radio cards) and `.booking-date-time-layout` (the Calendly-style calendar + time-grid) — are now **physically relocated** into the page by `renderOneOnOnePage()` in `app.js`, using `appendChild` on nodes that already exist and are already fully wired (not clones, not a rewrite). Moving a DOM node preserves everything attached to it — event listeners, IDs, state — so every existing availability/capacity/buffer/hold/double-booking rule, and the calendar's own "pick a date → times update in the same view" behavior from Phase 1, kept working with no logic changes at all. `#bookingDialog` itself now only handles the Details/Payment and Confirmation steps, opened once a session and time are both chosen.
- **One real code change this required:** eight call sites that read the checked session-type radio via `bookingForm.querySelector('input[name="sessionType"]:checked')` were changed to `document.querySelector(...)` (same query, no `bookingForm` scoping) — necessary because the radio cards no longer live inside `<form id="bookingForm">` once relocated onto the page, and every page still has exactly one such radio group, so this is a behavior-neutral, mechanical fix, not a logic change. Verified by grepping every one of the 8 sites individually.
- **The dark booking theme** from the previous pass was renamed from an `#bookingDialog`-scoped ID selector to a `.oo-dark-booking-ui` class (applied both to `#bookingDialog` itself and to the page's inline panel), since the same dark styling now needs to reach elements in two different places in the DOM. `#teachingRegisterDialog`/`#waitlistJoinDialog` never carry this class, so they're exactly as unaffected as before.
- **Answering the "is it actually inline" question directly:** yes — session type, the calendar, and available times are real, live, on-page elements today, not a preview. Only Details/Payment/Confirmation still happen in `#bookingDialog`, which the mockup itself also implies (nothing in the reference shows payment fields on the page).
- **One honest tradeoff:** a signed-out visitor who picks a session, date, and time inline, then clicks "Continue To Confirm," still hits the existing Phase 2 auth gate (`requireAccountForBooking()`), completely unmodified. Their session/date/time selection is **not lost** across sign-in (a real improvement over the old dialog-reset behavior, since these elements now just stay put on the page throughout) — they land back on the same page with everything still selected and can click Continue again.

### 23.3 Ministry positioning — new, previously-absent content
Added a short, centered statement between the booking section and "What To Expect" (`.oo-support-band`) addressing the owner's explicit concern that One-on-One must never be marketed as "paying for prophecy." Current text: *"Your contribution supports the work of The Unveiled Assembly — helping fund ministry, outreach, and resources like food drives, gatherings, and community initiatives. A One-on-One is time for honest conversation, prayer, and biblical guidance — not the purchase of prophecy or a guaranteed prophetic word."* This preserves the meaning the owner gave verbatim as a "possible conceptual direction" — **the exact sentence is mine, refined from that direction, and per the owner's own instruction is not final until approved.**

### 23.4 Copy provenance — what came from where (owner asked for this explicitly)
**(A) The owner's own verbatim wording, unchanged:** "Personal Ministry," "One On One," "Prayer. Direction. Discernment. Biblical Guidance.," "Book A Session →," the 01–04 Prayer/Direction/Discernment/Next Steps labels, "Come As You Are," "Real Conversations. Real Direction.," and the ministry-support *meaning* (not its exact final sentence — see 23.3).
**(B) Adapted from the approved mockup's own on-image text** (provenance beyond the mockup itself is unknown — could be the owner's real copy, could be placeholder text from whatever produced the mockup): the hero's "A safe space to seek, listen, and walk in clarity" caption and its "Come / Seek / Listen / Discern / Find Direction" side list; all four principle descriptions ("Seek God. Bring it all before Him." etc.); the booking image's "Book Your Session / Choose Your Time / Select a session type and book a time that works for you"; the "What To Expect" headline and all five checklist lines; the closing section's "Whether you're seeking clarity, prayer, or biblical guidance, this is a space for you."
**(C) Still needs explicit approval before being treated as final ministry copy:** everything in (B), plus the ministry-support statement's exact sentence (23.3).

### 23.5 Typography correction
The 01/02/03/04 principle numbers were set in the site's monospace accent font in the previous pass — the approved mockup clearly shows them in the serif display font instead (numbers = serif/expressive, per the owner's explicit hybrid-typography instruction), with the PRAYER/DIRECTION/etc. labels in the regular site sans-serif, uppercase. Corrected to match.

### 23.6 Verification performed (and its limits)
Same no-browser/no-emulator constraint as every prior phase. Checked: HTML tag-balance and CSS brace-balance (both clean), a bracket-balance pass on `app.js` (clean), that all image assets exist on disk and are served with HTTP 200 by the local preview server, and a manual re-read of `renderOneOnOnePage()`/`openOneOnOneInline()`/`openBooking()` together tracing every path (deep link, signed-in fast path, signed-out gate, generic nav/hero/closing triggers) against the actual current source rather than from memory. A **dark-background/light-text contrast pass** was done by hand across every new text element on the page against the Section 20.5 token rule (dark surfaces → `--ivory`/`--stone`/`--stone-dim`; the one light surface, What To Expect, → `--ink-muted`/`--black`) — no violation found. **Not verified:** actual rendered appearance in a browser, in particular whether the relocated calendar+time-grid's internal 2-column layout feels cramped inside the narrower page panel at medium desktop widths (a targeted extra breakpoint was added defensively at 1180px, but its actual effect hasn't been seen).

### 23.7 Local preview
Still running at **http://localhost:8080/one-on-one.html** (same server as before, serving this branch's working tree directly — no restart needed). Nothing has been committed or pushed.

### 23.8 One-on-One booking card polish
Removed the description sentence from the session-type cards on this page specifically (`.oo-booking-panel .booking-option small{display:none}`) and loosened their padding — the extra sentence on top of duration/price/Select was what read as crowded. The dialog's own version of this card (used by `#teachingRegisterDialog`/`#waitlistJoinDialog` contexts elsewhere) is untouched; this only affects the One-on-One page.

---

## 24. Session Log — 2026-09-25: Member Portal reschedule policy + a real production data bug (NOT YET COMMITTED — owner review pending)

Still on `phase4-one-on-one-redesign`, per the owner's explicit choice to build this here rather than as a separate branch. This work is broader than the One-on-One page — it touches the Member Portal's booking-management code generally — but was done on this branch at the owner's request.

### 24.1 A real, pre-existing production bug found while investigating the reschedule request
While tracing how a member's own bookings reach their "My Sessions" list (needed to build the reschedule window below), found that `myBookings()` read **only** from `DEMO_BOOKINGS` — unconditionally, regardless of `DEMO_MODE`. Every other function in this file that touches booking data branches on `DEMO_MODE` and queries Firestore for real data in production; this one didn't. Net effect: **on the live production site, a signed-in member's "My Sessions" tab has never actually shown their real bookings** — it silently rendered "No upcoming sessions" for everyone, and reschedule/cancel were consequently unreachable in production even though the buttons themselves worked correctly. `firestore.rules` already correctly allows a signed-in user to read/cancel their own `bookings` docs (`resource.data.uid == request.auth.uid`) — the security rule was fine; the frontend simply never queried it.
**Fixed:** added `MEMBER_OWN_BOOKINGS` (production-only in-memory cache) and `loadMemberOwnBookings()`, which queries `collection(db,'bookings') where uid == currentUser.uid` and is called (a) right after sign-in and (b) optimistically appended to right after a new booking is created (with a local `createdAt` timestamp, since the server-resolved one isn't available yet client-side). `myBookings()` now returns `MEMBER_OWN_BOOKINGS` in production, and still returns the existing `DEMO_BOOKINGS`-based logic exactly as before for `DEMO_MODE` and for Owner Member View preview (which has no real production counterpart to preview against). `cancelOwnBooking()` now also updates the local cache's status after a successful Firestore write, so the sessions list reflects a cancel/reschedule immediately instead of only on the next reload.
**Known remaining limitation, not fixed in this pass:** Owner Member View preview, when used against a *real* member in production (not the demo scenario), would still show the owner's own bookings rather than the previewed member's — this preview feature has no production data path at all yet, a separate, smaller gap from the one just fixed. Flagging it rather than silently leaving it undocumented.

### 24.2 Reschedule policy — self-service window, then a request instead of a guarantee
Per the owner's explicit direction: self-service reschedule (the existing one-click "cancel + reopen booking wizard" behavior) now only appears within **2 hours of when the booking was originally made** (not 2 hours before the session — measured from `createdAt`/`bookedAt`). A booking with no recoverable creation timestamp (only possible on old seed/demo data) is treated as **outside** the window — a safe default, not an accidental self-service grant.
- **Within the window:** identical to the existing behavior — nothing changed there.
- **Outside the window:** the button becomes **"Request Reschedule"** — a plain `mailto:` link (to `contactunveiledassembly@gmail.com`, the same real address already used elsewhere on the site, e.g. `connect.html` — nothing invented) pre-filled with the confirmation ID, session type, and current date/time. Clicking it does **not** touch the booking at all — no auto-cancel, no auto-anything — it just opens the visitor's own email app so they can ask. A visible note explains that self-service has closed and rescheduling from here isn't guaranteed and depends on availability, matching the owner's explicit "not always a guarantee" instruction.
- **Deliberately not built:** real automatic email sending (the owner chose the `mailto:` option specifically over a "send email automatically" option, since that would need a real email-sending service connected — a separate infrastructure decision, same category as the Stripe/Twilio items already tracked in Section 19.5/19.7).

### 24.3 Button contrast — fixed in three places (Member Portal, Ministry/Owner Portal, Classroom dialog)
Root cause: `.admin-btn-solid` (the shared "primary action" button style — e.g. "Submit Question," "Publish to Website," "Save Policy") is defined with `background:var(--owner-accent)` / `border:1px solid var(--owner-accent)` / `color:var(--owner-accent-text)`, and `--owner-accent` is `#000000` (black) with white text — a fine combination against the light owner-dashboard background it was designed for, but every dark context that reuses this same class (`.classroom-dialog`, `[data-portal-view="member"]`, and — despite already redefining `--owner-bg`/`--owner-surface`/`--owner-border`/`--owner-text` for dark mode — even `[data-portal-view="owner"]` itself) never gave `--owner-accent`/`--owner-accent-text` a matching dark-mode value. The result: a black-filled, black-bordered button sitting directly on an already-black background — text technically visible, but the button's shape completely invisible, exactly matching the report of "buttons coming up black... looks like you can't see the button." `.admin-btn-ghost` had the equivalent gap in the Member Portal and Classroom dialog (it was already handled for the Owner Portal). Fixed all three scopes to use each area's existing ivory-fill/charcoal-outline dark-mode pattern (already established for other buttons in the same scopes, e.g. `.portal-primary`/`.portal-secondary`) rather than inventing a new treatment.

### 24.4 Confirmed already working (no code changes needed) — answers to direct questions this session
- **Per-session-type availability** (e.g., different hours for 15-minute vs. 30-minute One-on-Ones) — already fully built: the Owner Portal's "Add Availability Window" form has a "Session Types Allowed" checkbox group (`renderSessionTypeCheckboxes`/`checkedSessionTypeIds`), and every availability computation (`resolveAvailabilityWindows`, `calendarDatePotentiallyOpen`) already respects it. No new portal section needed — just add separate windows per session type when hours differ.
- **Class content editing** (file/resource links, class summary, class image) — already fully built in the Class editor: "Classroom Content" tab (resource links, lesson summaries, study guides, release timing), "Class Information" tab (short/full description), "Images" tab (upload any image, not tied to video, with focal-point/zoom controls).
- **Bulk "send-out" to everyone registered for a specific class** — already exists as each class's "Announcements" tab (one message → everyone currently registered for that class, no per-person clicking). Confirmed with the owner that in-portal-only (not a real email) is fine as-is; no changes made.
- **Owner control over what's built into the Member Portal** — largely real already (session types, pricing, availability, prayer/testimony/review moderation, real member count, class content as above). The one confirmed gap is page-level copy/photography (e.g. One-on-One's hero image/text) — already tracked as a future initiative in Section 22, not revisited here.

### 24.5 Verification performed (and its limits)
Same no-browser/no-emulator constraint as every prior phase. Checked: bracket-balance on `app.js` after each edit (clean throughout), that `firestore.rules` already permits the new `MEMBER_OWN_BOOKINGS` query before writing the frontend code that depends on it (rather than assuming), and a manual trace of every path touching `MEMBER_OWN_BOOKINGS` (sign-in load, optimistic post-booking append, cancel/reschedule local-cache update) against the actual current source. **Not verified:** actual behavior in a real signed-in production session (no Firebase emulator or browser available here) — this is the one change this session that touches real data-loading behavior rather than pure presentation, so it's worth a real test booking-and-reschedule pass in production (or at least the Firebase emulator, if that ever becomes available) before this ships.

### 24.6 Contrast round 2 — the Section 24.3 fix was real but incomplete
The owner reported the Classroom's "Open Zoom" link was still black-on-black, plus something unspecified still broken in the Owner Portal (not yet logged in to pin down exactly what). Rather than patch just those two reports, did a systematic sweep this time: grepped every class actually rendered inside `.classroom-dialog`, `[data-portal-view="member"]`, `[data-portal-view="owner"]`, and (from Section 21) `.oo-dark-booking-ui`, and cross-checked each one's base CSS for a hardcoded light-theme color with no matching dark-scope override — the exact same root cause as 24.3, just in classes 24.3 didn't cover. Found and fixed five more instances of the identical bug:
- **`.portal-secondary`** (defaults to black text, transparent background) — this was the confirmed "Open Zoom" bug, plus the same class is reused for the Owner Portal's Account "Sign Out" and the availability "Remove" buttons (Windows/Blocked Ranges/Date Overrides in Bookings). Fixed in both `.classroom-dialog` and `[data-portal-view="owner"]` (`[data-portal-view="member"]` already had it).
- **`.portal-primary`** (defaults to black fill/white text — invisible edge, same as `.admin-btn-solid`'s bug) — used by the Owner Portal's own Account-tab buttons. Fixed for `[data-portal-view="owner"]`.
- **`.portal-row` / `.portal-row small`** (border and secondary text both assume a light page) — this is the row wrapper around "Zoom Link" itself, and is reused extremely widely across the Owner Portal (availability rules, blocked dates, people list, activity timeline, and more — one shared component, so one fix covers all of them). Fixed for both `.classroom-dialog` and `[data-portal-view="owner"]`.
- **`.link-btn`** (defaults to black underlined text, no background — this one was actually-invisible text, not just an unclear button edge) — the Owner Portal Account tab's "Change Email" / "Add / Change Phone" links. Fixed for `[data-portal-view="owner"]`.
- **`.demo-badge`** (defaults to black text) — the Owner Portal's "Website Pages — Not Yet Connected" and "Notification Center — Visual Demonstration" labels, *and*, found only because the same class also appears inside the One-on-One booking dialog's "Payment Preview Only" legend — which is now dark-themed by this same branch's earlier work (Section 21) and had the identical gap. Fixed for both `[data-portal-view="owner"]` and `.oo-dark-booking-ui`.

**Confirmed NOT still broken** (checked directly, not just assumed): `.admin-status-pill` and its status variants (each one sets its own self-contained background + text color, so they're readable regardless of the surrounding page); `.text-link` (already defaults to ivory — the `on-light` modifier used alongside it in the Classroom is actually a no-op, harmless but not the bug); `.serif-heading` (no color of its own, correctly inherits from its dark ancestor). `.member-quick-links` was checked and found to not be used anywhere in the current markup at all — dead CSS, not a live bug, left alone.

**Not verified:** actual rendered appearance (still no browser here) — this was a source-level audit (grep every real usage, read every relevant base rule, confirm no scoped override already existed) rather than a click-through, so it's worth a real look at the Owner Portal's Account tab, Bookings → Availability screen, and the Classroom's Zoom section specifically, since those are where this round's fixes concentrate.

**Root-cause fix added alongside the class-by-class patches above:** `[data-portal-view="owner"]` redefines `--owner-bg`/`--owner-surface`/`--owner-border`/`--owner-text` for dark mode but had never redefined `--owner-accent`/`--owner-accent-text` — the pair `.admin-btn-solid` and `.admin-image-upload-btn` (used by the new Member/Owner profile-photo cards in Section 25) both read. Rather than keep patching one more class every time something else turns out to use this token pair, added `--owner-accent:#f5f3ee;--owner-accent-text:#080808;` directly to that scope's own token block — this fixes every current and future consumer of the token at once, including ones not individually found/patched. The earlier class-specific `.admin-btn-solid`/`.portal-primary` overrides were left in place (not redundant — they also carry hover-state colors this token redefinition doesn't provide on its own).

---

## 25. Session Log — 2026-09-25: Member Profile (photo, name, nickname, birthday) (NOT YET COMMITTED — owner review pending)

Still on `phase4-one-on-one-redesign`, per the owner's ongoing choice to keep building Member Portal work on this branch.

### 25.1 What was built
Added a "My Profile" card to the Member Portal's Profile tab (`data-member-panel="account"`, above the existing Account Settings card), with:
- **Photo upload** (optional) — same proven no-Storage-needed pattern already used for the Owner's own profile photo and every teaching image: resized/compressed client-side to a small JPEG data URL (`resizeImageToDataUrl`, capped at 400px/quality 0.82) and stored as a plain `photoURL` string field on the member's `users/{uid}` doc. No Firebase Storage involved, consistent with every other image in this app.
- **First / Last Name** — editable, updates both the Firebase Auth `displayName` and the Firestore doc's `firstName`/`lastName`/`name` fields, mirroring the Owner's own already-existing profile-name editor exactly (`renderOwnerAccountProfile`/`ownerProfileSaveBtn`).
- **Nickname** (optional, new field) and **Birthday** (optional, new field, plain `type="date"` input stored as `YYYY-MM-DD`) — both new fields on the same `users/{uid}` doc.
- Verified `firestore.rules`' existing `users/{userId}` update rule (`isSignedIn() && request.auth.uid == userId && request.resource.data.role == resource.data.role`) already permits all of this with no rule change needed — it only protects `role`, not an allowlist of fields.
- **Birthday automation (free one-on-ones, birthday email) was explicitly NOT built** — per the owner's own framing ("later down the line"), only the data field was added so it exists to build on. No email-sending, no scheduled job, nothing that reads this field yet.

### 25.2 "I'll be able to see it from my side" — a second production-only gap found and fixed
Wiring up "the Owner sees a member's photo when they click into that member's profile" surfaced another gap in the same family as Section 24.1's booking-list bug: in production, `loadOwnerMembers()` rendered the People list with a *different, simpler* row template than `DEMO_MODE` does — one with no `data-person-key` attribute at all. The click handler that opens a member's profile (`openPersonProfile`) only ever looks for that attribute, so **clicking any real member's row in production has been doing nothing** — the feature only ever appeared to work in the demo preview. `resolveAllMemberProfiles()` (which `openPersonProfile` reads from) also only ever read the `DEMO_*` sample arrays, with no production branch at all.
**Fixed the specific path this session's work depends on:** `loadOwnerMembers()` now caches the real fetched user docs (`PRODUCTION_MEMBERS_CACHE`, keyed by uid) and renders rows with `data-person-key`, so clicking a real member now actually opens their profile drawer; `openPersonProfile()` now branches to that cache in production instead of the demo-only resolver. The drawer's Overview tab now shows the member's real photo (or their initial, matching the Owner's own avatar-fallback convention), nickname, and birthday.
**Update — now fixed too (owner said "fix the bugs, do whatever you think is best"):** the Classes/Sessions/Payments/Activity tabs now run a real `where('uid','==',key)` query against `teachingRegistrations` and `bookings` (`fetchPersonRecordsForKey`, new) whenever a real member's profile is opened in production — `isAdmin()` in `firestore.rules` was confirmed to already permit this before writing the code, same as every other query added this session. The dialog opens immediately with a loading state rather than waiting on the fetch, and re-checks `personProfileKey` before rendering so a slow response can't land on whatever profile happens to be open by the time it resolves. Firestore Timestamp fields are normalized to the same plain ISO strings the existing render helpers (`classRegRowHtml`, `bookingsLookupRowHtml`, `personActivityTimeline`) already expect from `DEMO_MODE` data, so none of those needed to change. `memberRecordsForKey`/`DEMO_MODE` behavior is completely untouched — this only added the production branch that was missing.

**Correction to that gap, then fixed (owner said "go ahead"):** on closer inspection, only 2 of global search's 7 categories were actually broken in production, not 6 as first reported — Class, Prayer Request, Testimonial, and Class Review search were already reading `TEACHINGS`/`PRAYER_REQUESTS`/`TESTIMONIALS`/`CLASS_REVIEWS`, the real unprefixed module-level variables that `loadTeachingPageConfig()` (runs on every page load) and `loadMinistryInboxData()` (runs on dashboard entry) already populate with production data — those were never actually demo-only, the earlier read of the code was wrong. Only **Class Registration** and **One-on-One Booking** search were genuinely hardcoded to `DEMO_TEACHING_REGISTRATIONS`/`DEMO_BOOKINGS` specifically. Fixed both the same way as Member search: two new caches, `OWNER_ALL_REGISTRATIONS_CACHE` and `OWNER_ALL_BOOKINGS_CACHE`, populated once by `loadOwnerSearchCaches()` when the owner's dashboard loads (added to the same `loadOwnerData()` init sequence as every other `loadX()` call there), searched client-side from there. One existing function was reused as-is (`ownerAllBookingsEverything()`, already fetched all bookings for a different feature — the Clients tab); one new equivalent was added for registrations (`ownerAllRegistrationsEverything()`, no prior equivalent existed). Same caveat as Member search: reflects a snapshot from when the dashboard loaded, not truly live data — a live Firestore query per keystroke wasn't reasonable. **All 7 global search categories now search real production data.**

### 25.3 Contrast — kept the new UI from being bug report #4
Introducing `.admin-profile-photo`/`.admin-image-upload-btn`/`.admin-image-remove-btn` to the Member Portal for the first time would have repeated Section 24.3/24.6's exact bug (these classes read `--owner-*` tokens the Member Portal scope never defines) had they been left unstyled there — added `[data-portal-view="member"]`-scoped versions using this portal's own tokens (`--panel`/`--stone`/`--line-dark`/`--ivory`) before ever shipping the new card, rather than shipping first and waiting for a fifth report.

### 25.4 Verification performed (and its limits)
Same no-browser/no-emulator constraint as every prior phase. Checked: bracket-balance on `app.js` and brace-balance on `styles.css` after every edit (clean throughout); read `firestore.rules`' actual `users/{userId}` rule text before writing code that depends on it, rather than assuming; confirmed `personProfileDialog` (a `.detail-drawer`, not nested inside `[data-portal-view="owner"]`) is a separately/independently light-themed dialog, so the new photo/details markup added there needed no dark-mode override — verified by tracing the CSS `:has()` selector that makes the owner dashboard dark actually only applies to `#memberPortalDialog`, not to sibling dialogs like this one. **Not verified:** actual behavior in a real signed-in production session for either the photo upload or the People-list click-through — both are new/changed data-writing and data-loading paths, so worth a real test (upload a photo as a test member, then open that member's profile as the owner) before this ships.

---

## 26. Session Log — 2026-09-25: Give page redesign (NOT YET COMMITTED — owner review pending)

**New branch: `phase5-give-page-redesign`**, created off `phase4-one-on-one-redesign` (not off `main`) specifically so the One-on-One branch's own uncommitted work wasn't touched or reset — since nothing had been committed on that branch yet (every prior pass ended with an explicit "do not commit" instruction), creating a new branch was the only way to keep this pass isolated without either committing One-on-One first (not asked for) or losing that work. Both branches currently share the same working-tree state as of this branch's creation; One-on-One's own files were not edited again after that point. Nothing in this section has been committed, pushed, merged, or opened as a PR.

### 26.1 Photography — installed, with an honest resolution caveat
All 8 supplied photos copied into a permanent location, **`assets/give/`**: `hero.png`, `donate-section.png`, `outreach.png`, `food-drives.png`, `gatherings.png`, `ministry-resources.png`, `thank-you.png`, `hands-prayer.png` — matching the README's own 01–08 naming exactly. Unlike the One-on-One "Option C" photos, none of these have baked-in mockup text, so no cropping was needed.
**Real limitation, flagged rather than hidden:** every one of these 8 files is small — 138×129px up to 377×155px, thumbnail resolution, not the 1200px+ a full-width hero or section background normally wants. Stretched via `background-size:cover` across a real hero or the Give Today photo panel, they will look visibly soft/slightly blurred rather than crisp, especially on a large desktop screen. This isn't a bug in the implementation — it's the actual resolution of what was supplied. The smaller 01–04 grid tiles (roughly image-native size in the actual layout) fare better. If sharper versions of any of these exist, swapping the file at the same path is a one-line change; nothing else would need to move.
**`hands-prayer.png` (the optional accent) was intentionally not used** — the approved reference itself doesn't have an obvious slot for a 9th photo without adding a section the reference doesn't show, and the instructions explicitly said not to force it in if it would clutter the design. The file is copied into `assets/give/` and ready if the owner wants it worked in somewhere specific.

### 26.2 What's used where
- **Hero** (`.gv-hero`) → `hero.png`
- **Give Today** left panel (`.gv-donate-image`) → `donate-section.png`
- **Your Generosity At Work** 01–04 tiles → `outreach.png` / `food-drives.png` / `gatherings.png` / `ministry-resources.png`, in that order
- **Closing / Thank You** (`.gv-closing`) → `thank-you.png`
- **Not used:** `hands-prayer.png` (see 26.1) and `APPROVED-give-page-reference.png` (the mockup itself — reference only, never meant to render on the page)

### 26.3 Existing working functionality — preserved exactly, not rebuilt
The real amount-selection → Cash App deep-link logic (`.give-amount-btn`, `#giveCustomAmount`, `#giveSubmitBtn`, and the inline `<script>` at the bottom of `give.html` that builds `https://cash.app/$UnveiledAssemblyOCJ/<amount>`) is **byte-for-byte the same script** as before this pass — only the HTML around it changed (new classes, new section layout), never its IDs, its classes, or its logic. Same for the frequency toggle (`.give-frequency-toggle`, `data-freq`) and the disabled donor-info fields (`.give-donor-fields`) — Monthly and card/Apple Pay still can't be selected/still show "Coming Soon," exactly as before. Verified none of `styles.css`'s existing `.give-*` rules needed a contrast fix — they were already built dark-theme-correct from the Phase 3 pass, unlike several other components found broken this session.

### 26.4 New UI added beyond what already existed
The approved reference showed a "Secure and encrypted giving" note and a row of payment-method indicators (Cash App / Card / Apple Pay) that didn't exist in the prior version at all — added as `.gv-payment-note`/`.gv-payment-methods`, with Cash App shown active/available and Card/Apple Pay shown visibly dimmed with a "Soon" tag, matching instruction #5's "display as unavailable/coming soon rather than pretending to process payments." The Cash App icon is a generic dollar-in-rounded-square glyph (not Cash App's actual trademarked logomark, to avoid misrepresenting an official brand mark); the Apple Pay icon reuses the exact Apple logo path already present elsewhere in this codebase (the booking dialog's own payment-method row), not a new addition.

**Follow-up (same day):** the owner asked for the card-payment area to follow "the same structure and setup" as everywhere else on the site a card payment will eventually happen. Added the identical card-entry preview fieldset already used in the booking dialog's Details & Payment step — same classes (`.payment-demo`, `.checkout-payment-demo`, `.demo-badge`, `.payment-demo-note`, `.booking-grid`/`.booking-field`), same dummy readonly values (card number, expiry, CVC, name on card), same "Payment Preview Only — Not Yet Connected" badge and explanatory note, genuinely disabled (`<fieldset disabled>` + `readonly` inputs) — no card data collected, no charge occurs. To make this render correctly (dark text-on-dark would otherwise repeat this session's whole run of contrast bugs — see Section 24), `.gv-donate-panel` now also carries the `.oo-dark-booking-ui` class, the same reusable dark-payment-UI class built for One-on-One's booking dialog (Section 21.7/23.2) — checked first that none of the classes it styles collide with anything else already on the Give page before adding it, so this was a safe, zero-side-effect reuse rather than new CSS.

**Second follow-up (same day):** the owner clarified the interaction model further — the card fields shouldn't just sit there always visible; clicking "Card" should be what reveals them, Apple Pay needed its own equivalent spot, and Cash App should work as "its own button" that goes straight to Cash App when clicked. Restructured the three payment-method indicators from decorative `<span>`s into real `<button role="tab">`s (`.gv-payment-methods`), each controlling its own panel (`.gv-payment-panel`, `role="tabpanel"`) below: **Cash App** (selected by default) shows the real, working `#giveSubmitBtn` link — the one actual action on this page, unchanged; **Card** shows the donor-info fields + the card-preview fieldset from the pass above; **Apple Pay** shows a plain "not connected yet, use Cash App" note (it has no form to preview — Apple Pay is normally a single native payment-sheet button, not a fillable form, so there was nothing honest to mock up beyond that note). Clicking a method toggles `.active`/`aria-selected` on the buttons and shows/hides the matching panel via a small new script block appended after the existing (untouched) amount-selection script. No new element IDs were reused or renamed — `#giveSubmitBtn` and its amount-sync logic are exactly what they were before this note.

### 26.5 Copy — what's verbatim from the owner vs. written this pass
**(A) The owner's own exact wording:** "Give," "Generosity That Moves Beyond The Walls," "Give Today," "People / Community / Outreach / Resources / A Greater Work," "Your Generosity At Work," the four 01–04 labels (Outreach / Food Drives / Gatherings / Ministry Resources) and their purpose lines (lightly smoothed into sentence form, meaning unchanged), "Choose an amount or enter a custom amount," "Make A Difference," "More Than a Donation," "Together, We Go Further," "Thank You For Helping Us Serve," "Serve / Give / Love / People / Community," "Faith / People / Presence / Purpose."
**(B) Adapted from the approved mockup's own body copy** (same caveat as the One-on-One pass — provenance beyond the mockup image itself isn't known): the "Your Generosity At Work" supporting sentence ("Every seed sown helps us continue the work God has called us to...") and the closing paragraph ("Your generosity makes this work possible...") were both visible, close to verbatim, in the mockup image and carried over with only minor contractions.
**(C) Written fresh this pass, needs approval:** the hero's supporting paragraph and the "More Than a Donation" supporting sentence — both adapted from the *meaning* the instructions described (generosity serving people/ministry resources/outreach/gatherings/practical needs), not quoted from anywhere. **One deliberate, flagged deviation:** the main CTA button reads "Give $[amount] via Cash App →" (dynamic, already-existing, working text) rather than the mockup's plain "Give →" — kept because it's more honest about what actually happens when clicked (opens Cash App with that amount), consistent with the "do not fake payment functionality" instruction; happy to switch to generic "Give →" if preferred.

### 26.5b Give was missing from the site navigation entirely — added
The owner asked for "Give" to be its own nav button. Checked first: `give.html` has existed since Phase 3 but was **never actually added to `NAV_LINKS`** (the array `app.js` builds both the desktop and mobile nav from — one shared list, so this one fix covers both automatically) — the page was only ever reachable by typing the URL directly. Added `{ page: 'give', href: 'give.html', label: 'Give' }` to `NAV_LINKS` in `app.js`, positioned right after Connect and before Shop (the existing order of every other item was left untouched — the approved mockup's nav has a materially different order and even drops "Beliefs" entirely, which reads as that mockup's own layout choice for illustration, not a request to reorder the live site's navigation, so only the one missing item was added, nothing reordered or removed). The current-page highlight mechanism already keys off `<body data-page="give">` matching a nav link's `data-page`, which `give.html` already had — so this was a pure one-line addition, nothing else needed to change for it to work correctly.

### 26.6 Owner control principle — documented per instruction #11, not built
Per the standing Section 22 principle, the following on this page would eventually belong in a future Website Settings / Give Navigation Center, none of it built now: Give-page photography (currently hardcoded `background-image` paths, same as One-on-One's), the four preset donation amounts ($25/$50/$100/$250, currently hardcoded in `give.html`), the "Your Generosity At Work" category descriptions, and the hero/statement/closing copy itself. No infrastructure for this exists yet; this is a documentation-only entry, matching the instruction not to build it unless trivial (it isn't).

### 26.7 Verification performed (and its limits)
Same no-browser/no-emulator constraint as every prior phase. Checked: HTML tag-balance on `give.html` (clean) and CSS brace-balance on `styles.css` (clean); confirmed every image file exists on disk at its referenced path and is served with HTTP 200 by the local preview server; confirmed the Cash App script block is unmodified character-for-character from the pre-existing version; grepped for every other page/system referencing `give.html` or its specific element IDs to confirm nothing outside this one file was touched (Section 12's "do not touch" list — One-on-One, Member Portal, Classes, etc. — none of those files were opened or edited this pass). **Not verified:** actual rendered appearance, and specifically how soft the low-resolution photography (26.1) actually looks at real desktop hero size — that's the one thing most worth a close look during visual review.

### 26.8 Local preview
Serving at **http://localhost:8080/give.html** — same local server as the One-on-One work, already running, serving this branch's working tree directly. Nothing has been committed, pushed, merged, or opened as a PR.

---

## 27. Session Log — 2026-09-25: Committed, pushed, and merged to main; demo member quick sign-in

Sections 21–26 (the whole One-on-One redesign, Member/Owner Portal fixes, and Give redesign) were committed as a single commit, pushed on `phase5-give-page-redesign`, opened as PR #4, and **merged into `main`** at the owner's explicit request ("you can merge all that in"). The live preview site (`https://contactunveiledassembly-oss.github.io/unveiled-assembly-redesign-preview/`, confirmed via the GitHub Pages API to be exactly what serves from `main`) now reflects everything through Section 26.

### 27.1 Demo member quick sign-in
The owner asked to make the existing "Maya Johnson" demo member (`uid: 'demo-member'`, already seeded with a confirmed one-on-one booking, 4 class registrations, and several notifications — see the `DEMO_BOOKINGS`/`DEMO_TEACHING_REGISTRATIONS` entries) usable as a one-click demo account on the preview site's Member Portal. It already technically worked — `DEMO_MODE`'s `signInWithEmailAndPassword()` fakes success for any email/password that isn't the ministry's real admin address, always landing on this same Maya Johnson identity — but nothing on the page surfaced that, so a visitor would have had no reason to know it existed. Added a **"Try A Demo Member Account →"** button directly on the Sign In screen, calling the exact same `signInWithEmailAndPassword(auth, 'demo@example.com', 'preview-demo')` real Sign In uses (not a separate shortcut path), so it goes through the same `onAuthStateChanged` handling as any real sign-in — nothing about "what happens after sign-in" was duplicated. The button is hidden by a `DEMO_MODE` check and will never appear on the real production site, since it would otherwise try to sign in with credentials that don't exist there.

### 27.2 Verification and status
Bracket-balance checked clean. This was committed on a fresh branch (`demo-member-quick-signin`, branched from the just-merged `main`, not stacked on the already-merged `phase5-give-page-redesign`) and **also pushed, opened as PR #5, and merged into `main`** — continuing the same explicit merge authorization from the same conversation, for the same "get it onto the preview site" request. No browser was available to click-test the actual sign-in flow; the code path is identical to the existing, already-relied-upon demo sign-in mechanism, just newly exposed via a visible button.

---

*This file should be updated any time a feature moves from PLANNED to IMPLEMENTED, or when architecture changes — so the next AI session (or the next person) can trust it again.*
