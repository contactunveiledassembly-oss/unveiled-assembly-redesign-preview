/* ============================================================
   The Unveiled Assembly — shared app shell + Firebase logic
   Loaded via <script type="module" src="app.js"> on every page.
   Injects the nav, footer, and the three dialogs (Member Portal,
   Booking, Share Your Story) so no markup is duplicated across
   pages. All Firebase/auth/booking/admin logic below is carried
   over unchanged from the original single-file build.
   ============================================================ */

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.13.2/firebase-app.js";
import {
  getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword,
  onAuthStateChanged, signOut, updateProfile, sendPasswordResetEmail,
  sendEmailVerification, RecaptchaVerifier, signInWithPhoneNumber, linkWithPhoneNumber
} from "https://www.gstatic.com/firebasejs/10.13.2/firebase-auth.js";
import {
  getFirestore, doc, setDoc, getDoc, collection, query, where,
  getDocs, updateDoc, deleteDoc, serverTimestamp, runTransaction
} from "https://www.gstatic.com/firebasejs/10.13.2/firebase-firestore.js";

/* ---------------------------------------------------------------
   Shared markup injection
   --------------------------------------------------------------- */
// Pages nested in a subdirectory (currently just /shop/) set
// <body data-base="../"> so every root-relative link/asset the injected
// nav/footer/dialogs use still resolves correctly from that depth.
const BASE = document.body.dataset.base || '';

const NAV_LINKS = [
  { page: 'story', href: 'story.html', label: 'Our Story' },
  { page: 'beliefs', href: 'beliefs.html', label: 'Beliefs' },
  { page: 'gather', href: 'gather.html', label: 'Gather' },
  { page: 'teachings', href: 'teachings.html', label: 'Teachings' },
  { page: 'prayer', href: 'prayer.html', label: 'Prayer' },
  { page: 'connect', href: 'connect.html', label: 'Connect' },
  { page: 'shop', href: 'shop/', label: 'Shop' },
];

// Real URL on file. Facebook/YouTube have no confirmed URL yet — marked
// coming-soon rather than guessed, per instruction not to invent links.
const SOCIAL_LINKS = [
  { name: 'Instagram', href: 'https://www.instagram.com/unveiledassembly?igsi=Y2RhZXdmcTRneHJn&amp;utm_source=qr', ready: true,
    icon: '<path d="M7 2h10a5 5 0 0 1 5 5v10a5 5 0 0 1-5 5H7a5 5 0 0 1-5-5V7a5 5 0 0 1 5-5z"/><circle cx="12" cy="12" r="4"/><circle cx="17.2" cy="6.8" r="1"/>' },
  { name: 'Facebook', href: '#', ready: false,
    icon: '<path d="M15 3h-2a5 5 0 0 0-5 5v2H6v4h2v7h4v-7h3l1-4h-4V8a1 1 0 0 1 1-1h3z"/>' },
  // The play triangle previously used a hardcoded dark fill as a
  // "cutout" against a filled background — but this icon has no fill
  // (matches the other outlined icons), so a hardcoded dark fill was
  // invisible against the dark nav. Uses currentColor like every other
  // icon here so it's always correctly visible against its background.
  { name: 'YouTube', href: '#', ready: false,
    icon: '<rect x="2" y="5" width="20" height="14" rx="4"/><path d="M10 9l6 3-6 3z" fill="currentColor" stroke="none"/>' },
];

function socialIconsHtml(extraClass){
  return SOCIAL_LINKS.map(s => {
    const common = s.ready
      ? `href="${s.href}" target="_blank" rel="noopener noreferrer" aria-label="${s.name}"`
      : `href="#" class="is-placeholder" data-social-placeholder="1" aria-label="${s.name} — coming soon" title="Coming soon" aria-disabled="true"`;
    return `<a class="icon-btn ${extraClass || ''}" ${common}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4">${s.icon}</svg></a>`;
  }).join('');
}

function navHtml(){
  const links = NAV_LINKS.map(l => `<a href="${BASE}${l.href}" data-page="${l.page}">${l.label}</a>`).join('');
  return `
  <nav class="nav" id="nav">
    <a href="${BASE}index.html" class="brand" aria-label="The Unveiled Assembly home">
      <span class="brand-badge"><img class="brand-logo" src="${BASE}assets/ua-logo-tight.png" alt="Unveiled Assembly logo" /></span>
      <span class="brand-text"><span class="line1">The Unveiled</span><span class="line2">Assembly of Christ Jesus</span></span>
    </a>

    <div class="nav-mobile-panel" id="navMobilePanel">
      <div class="links" id="links">${links}</div>
      <div class="nav-right-controls" id="navRightControls">
        <div class="social-links" aria-label="Social media">${socialIconsHtml()}</div>
        <button class="account-btn" id="navMemberPortal" type="button" aria-label="Sign In" title="Sign In">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/></svg>
          <span class="account-btn-label">Sign In</span>
        </button>
        <button class="cart-btn" id="cartBtn" type="button" title="Shop — coming soon" aria-disabled="true">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" style="width:13px;height:13px"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.6 13.4a2 2 0 0 0 2 1.6h9.8a2 2 0 0 0 2-1.6L23 6H6"/></svg>
          <span>Cart 0</span>
        </button>
      </div>
    </div>

    <button class="menu-btn" id="menuBtn" type="button" aria-label="Open menu" aria-expanded="false" aria-controls="navMobilePanel">☰</button>
  </nav>`;
}

function footerHtml(){
  return `
  <footer id="site-footer">
    <div class="footer-top">
      <div>
        <div class="footer-wordmark">THE<br>UNVEILED<br>ASSEMBLY</div>
        <div class="footer-social" aria-label="Social media">${socialIconsHtml('on-footer')}</div>
      </div>
      <div class="footer-identity">
        <p>Christ Revealed.<br>A People Unveiled.</p>
        <div class="copyright">© ${new Date().getFullYear()} The Unveiled Assembly of Christ Jesus</div>
      </div>
      <div class="footer-links">
        <a href="${BASE}story.html">Our Story</a>
        <a href="${BASE}beliefs.html">Beliefs</a>
        <a href="${BASE}prayer.html">Prayer</a>
        <a href="${BASE}connect.html">Contact</a>
        <a href="${BASE}shop/">Shop</a>
        <a href="https://www.instagram.com/unveiledassembly?igsi=Y2RhZXdmcTRneHJn&amp;utm_source=qr" target="_blank" rel="noopener noreferrer">Instagram</a>
      </div>
    </div>
    <div class="footer-bottom">Preview build — not the live site</div>
  </footer>`;
}

// Shared "eye" icon for password show/hide toggles.
const EYE_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" style="width:16px;height:16px"><path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7z"/><circle cx="12" cy="12" r="3"/></svg>';
const EYE_OFF_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" style="width:16px;height:16px"><path d="M3 3l18 18M10.6 10.6a3 3 0 0 0 4.24 4.24M9.9 4.24A11 11 0 0 1 12 4c7 0 11 8 11 8a17.7 17.7 0 0 1-3.15 4.15M6.5 6.5C3.6 8.3 2 12 2 12s2.5 5 7 6.6"/></svg>';

// A short, deliberately non-exhaustive list of common country codes. "Other"
// lets someone type a full E.164 number (+<country code><number>) directly
// if their country isn't listed, so no one is locked out.
const COUNTRY_CODES = [
  { code: '+1', label: 'US/CA +1' },
  { code: '+44', label: 'UK +44' },
  { code: '+234', label: 'Nigeria +234' },
  { code: '+91', label: 'India +91' },
  { code: '+254', label: 'Kenya +254' },
  { code: '+233', label: 'Ghana +233' },
  { code: '+27', label: 'South Africa +27' },
  { code: '+61', label: 'Australia +61' },
  { code: '+33', label: 'France +33' },
  { code: '+49', label: 'Germany +49' },
  { code: 'other', label: 'Other (type full number with +country code)' },
];
const COUNTRY_OPTIONS = COUNTRY_CODES.map(c => `<option value="${c.code}">${c.label}</option>`).join('');

function dialogsHtml(){
  return `
  <dialog class="portal-dialog" id="memberPortalDialog" aria-label="My Assembly">
    <div class="portal-bar">
      <div class="portal-brand">
        <img src="${BASE}assets/ua-logo-tight.png" alt="" />
        <span>The Unveiled Assembly<br>of Christ Jesus</span>
      </div>
      <div class="portal-switch" aria-label="My Assembly navigation">
        <button class="active" type="button" data-portal-target="prospect" id="tabProspect">Sign In</button>
        <button type="button" data-portal-target="member" id="tabMember" hidden>My Assembly</button>
        <button type="button" data-portal-target="owner" id="tabOwner" hidden>Ministry View</button>
      </div>
      <button class="portal-close" id="closeMemberPortal" type="button" aria-label="Close My Assembly">×</button>
    </div>

    <div class="portal-view" data-portal-view="prospect">
      <div class="portal-two">
        <div class="portal-welcome">
          <div class="kicker">My Assembly</div>
          <h3 id="memberPortalTitle">A place to continue growing.</h3>
          <p>People can create an account after joining a class or becoming involved with The Assembly.</p>
          <div class="portal-perks">
            <div class="portal-perk"><span>01</span>See upcoming classes, sessions, and prayer gatherings.</div>
            <div class="portal-perk"><span>02</span>Access private Zoom links, materials, and recordings.</div>
            <div class="portal-perk"><span>03</span>Manage bookings and follow learning progress.</div>
          </div>
        </div>
        <div class="portal-login">
          <div class="kicker on-light">Join or Sign In</div>

          <div class="auth-mode-tabs" role="tablist" aria-label="Sign in or create an account">
            <button type="button" class="auth-mode-tab active" data-auth-mode="signin" id="authTabSignIn" role="tab" aria-selected="true">Sign In</button>
            <button type="button" class="auth-mode-tab" data-auth-mode="register" id="authTabRegister" role="tab" aria-selected="false">Create Account</button>
          </div>

          <!-- ===== SIGN IN ===== -->
          <div class="auth-panel" data-auth-panel="signin">
            <div class="auth-method-tabs" role="tablist" aria-label="Sign-in method">
              <button type="button" class="auth-method-tab active" data-auth-method="email" id="signinMethodEmail" role="tab" aria-selected="true">Email</button>
              <button type="button" class="auth-method-tab" data-auth-method="phone" id="signinMethodPhone" role="tab" aria-selected="false">Phone Number</button>
            </div>

            <form id="emailSignInForm" data-auth-method-panel="email">
              <div class="portal-field">
                <label for="signinEmail">Email address</label>
                <input id="signinEmail" type="email" placeholder="you@example.com" autocomplete="email" required />
              </div>
              <div class="portal-field">
                <label for="signinPassword">Password</label>
                <div class="password-field">
                  <input id="signinPassword" type="password" placeholder="Enter your password" autocomplete="current-password" minlength="6" required />
                  <button type="button" class="password-toggle" data-toggle-for="signinPassword" aria-label="Show password">${EYE_ICON}</button>
                </div>
              </div>
              <button type="button" class="link-btn" id="showForgotPassword">Forgot Password?</button>
              <div class="portal-actions">
                <button class="portal-primary" type="submit" id="portalSignInBtn">Sign In</button>
              </div>
              <p class="auth-switch-line">Don't have an account? <button type="button" class="link-btn" data-switch-to="register">Create Account</button></p>
            </form>

            <div data-auth-method-panel="phone" hidden>
              <div class="portal-field phone-field">
                <label for="signinPhoneNumber">Phone number</label>
                <div class="phone-input-row">
                  <select id="signinPhoneCountry" aria-label="Country code">${COUNTRY_OPTIONS}</select>
                  <input id="signinPhoneNumber" type="tel" placeholder="Phone number" autocomplete="tel-national" />
                </div>
              </div>
              <button class="portal-primary" type="button" id="sendSigninCodeBtn">Send Verification Code</button>
              <div id="signinCodeStep" hidden>
                <div class="portal-field">
                  <label for="signinCode">6-digit code</label>
                  <input id="signinCode" type="text" inputmode="numeric" pattern="[0-9]*" maxlength="6" autocomplete="one-time-code" />
                </div>
                <div class="portal-actions">
                  <button class="portal-primary" type="button" id="verifySigninCodeBtn">Verify and Sign In</button>
                </div>
                <button type="button" class="link-btn" id="resendSigninCodeBtn">Resend Code</button>
              </div>
              <p class="auth-switch-line"><a class="link-btn" href="${BASE}connect.html">Trouble Signing In?</a></p>
              <div id="recaptcha-container-signin"></div>
            </div>

            <div class="portal-status" id="portalLoginStatus" role="status" aria-live="polite"></div>
          </div>

          <!-- ===== FORGOT PASSWORD ===== -->
          <div class="auth-panel" data-auth-panel="forgot" hidden>
            <p class="auth-panel-intro">Enter your email and we'll send a link to reset your password.</p>
            <div class="portal-field">
              <label for="forgotEmail">Email address</label>
              <input id="forgotEmail" type="email" placeholder="you@example.com" autocomplete="email" />
            </div>
            <div class="portal-actions">
              <button class="portal-primary" type="button" id="sendResetBtn">Send Reset Link</button>
            </div>
            <button type="button" class="link-btn" data-switch-to="signin">← Back to Sign In</button>
            <div class="portal-status" id="forgotPasswordStatus" role="status" aria-live="polite"></div>
          </div>

          <!-- ===== CREATE ACCOUNT ===== -->
          <div class="auth-panel" data-auth-panel="register" hidden>
            <form id="registerForm">
              <div class="portal-field-row">
                <div class="portal-field"><label for="regFirstName">First name</label><input id="regFirstName" type="text" autocomplete="given-name" required /></div>
                <div class="portal-field"><label for="regLastName">Last name</label><input id="regLastName" type="text" autocomplete="family-name" required /></div>
              </div>
              <div class="portal-field">
                <label for="regEmail">Email address</label>
                <input id="regEmail" type="email" placeholder="you@example.com" autocomplete="email" required />
              </div>
              <div class="portal-field phone-field">
                <label for="regPhoneNumber">Phone number</label>
                <div class="phone-input-row">
                  <select id="regPhoneCountry" aria-label="Country code">${COUNTRY_OPTIONS}</select>
                  <input id="regPhoneNumber" type="tel" placeholder="Phone number" autocomplete="tel-national" required />
                </div>
              </div>
              <div class="portal-field">
                <label for="regPassword">Password</label>
                <div class="password-field">
                  <input id="regPassword" type="password" placeholder="At least 8 characters" autocomplete="new-password" minlength="8" required />
                  <button type="button" class="password-toggle" data-toggle-for="regPassword" aria-label="Show password">${EYE_ICON}</button>
                </div>
              </div>
              <div class="portal-field">
                <label for="regConfirmPassword">Confirm password</label>
                <div class="password-field">
                  <input id="regConfirmPassword" type="password" placeholder="Re-enter your password" autocomplete="new-password" minlength="8" required />
                  <button type="button" class="password-toggle" data-toggle-for="regConfirmPassword" aria-label="Show password">${EYE_ICON}</button>
                </div>
              </div>
              <div class="portal-actions">
                <button class="portal-primary" type="submit" id="registerSubmitBtn">Create Account</button>
              </div>
              <p class="auth-switch-line">Already have an account? <button type="button" class="link-btn" data-switch-to="signin">Sign In</button></p>
            </form>
            <div class="portal-status" id="registerStatus" role="status" aria-live="polite"></div>
          </div>

          <!-- ===== POST-REGISTRATION VERIFICATION ===== -->
          <div class="auth-panel" data-auth-panel="verify" hidden>
            <h4>Verify your account</h4>
            <p class="auth-panel-intro">Your account was created. Verify by email or text to unlock full access — you can also do this later from My Assembly.</p>
            <div class="verify-options">
              <button class="portal-secondary" type="button" id="verifyByEmailBtn">Verify by Email</button>
              <button class="portal-secondary" type="button" id="verifyByTextBtn">Verify by Text</button>
            </div>
            <div id="verifyPhoneStep" hidden>
              <div class="portal-field">
                <label for="verifyPhoneCode">6-digit code</label>
                <input id="verifyPhoneCode" type="text" inputmode="numeric" pattern="[0-9]*" maxlength="6" autocomplete="one-time-code" />
              </div>
              <div class="portal-actions">
                <button class="portal-primary" type="button" id="confirmVerifyPhoneBtn">Confirm Code</button>
              </div>
            </div>
            <div id="recaptcha-container-verify"></div>
            <div class="portal-status" id="verifyStatus" role="status" aria-live="polite"></div>
            <button type="button" class="link-btn" id="skipVerifyBtn">Continue to My Assembly →</button>
          </div>

          <div class="portal-open-note">No account is needed to browse the website, give, request prayer, submit a testimony, or book an initial session.</div>
        </div>
      </div>
    </div>

    <div class="portal-view" data-portal-view="member" hidden>
      <div class="portal-head">
        <div>
          <div class="kicker on-light">My Assembly</div>
          <h3>Welcome back<span id="memberWelcomeName"></span>.</h3>
          <p>Your bookings and ministry resources in one place.</p>
        </div>
        <span class="portal-account" id="memberAccountLabel">Student Account</span>
      </div>
      <div class="verify-banner" id="verifyBanner" hidden>
        <span>Your account isn't verified yet — some features are limited.</span>
        <button type="button" class="link-btn" id="verifyBannerBtn">Verify Now</button>
      </div>
      <div class="portal-dashboard-grid">
        <article class="portal-panel wine">
          <span class="portal-label">My Bookings</span>
          <div id="memberBookingsList"><p style="color:#d7d7d7">Loading your bookings…</p></div>
          <div class="portal-inline-actions">
            <button class="portal-primary" type="button" id="memberBookNew">Book A Session</button>
          </div>
        </article>
        <article class="portal-panel">
          <span class="portal-label">Classes &amp; Materials</span>
          <p style="color:#656565">Class scheduling, Zoom links, and materials aren't connected yet — this is next on the build list. Your live bookings above are fully real.</p>
        </article>
        <article class="portal-panel">
          <span class="portal-label">Account</span>
          <div class="portal-row"><div><strong>Signed in as</strong><small id="memberAccountEmail">—</small></div></div>
          <button class="portal-secondary" type="button" id="memberSignOut" style="margin-top:16px">Sign Out</button>
        </article>
      </div>
      <div class="portal-status" id="portalMemberStatus" role="status" aria-live="polite"></div>
    </div>

    <div class="portal-view" data-portal-view="owner" hidden>
      <div class="portal-head">
        <div>
          <div class="kicker on-light">My Assembly Administration</div>
          <h3>Ministry Portal</h3>
          <p>Approve bookings and see who has created an account.</p>
        </div>
        <span class="portal-account">Private Owner View</span>
      </div>
      <div class="portal-owner-grid">
        <article class="portal-panel wine">
          <span class="portal-label">Pending Booking Requests</span>
          <div id="ownerBookingsList"><p style="color:#d7d7d7">Loading booking requests…</p></div>
        </article>
        <article class="portal-panel">
          <span class="portal-label">Confirmed Upcoming Appointments</span>
          <div id="ownerConfirmedList"><p style="color:#656565">Loading appointments…</p></div>
        </article>
        <article class="portal-panel">
          <span class="portal-label">Block A Date</span>
          <p style="color:#656565;margin-bottom:14px">Mark a date as unavailable (holidays, travel, etc). Blocked dates won't show any open times to visitors.</p>
          <form id="blockDateForm" style="display:flex;gap:8px;align-items:flex-end;flex-wrap:wrap">
            <div class="form-field" style="flex:1;min-width:160px">
              <label for="blockDateInput">Date</label>
              <input id="blockDateInput" type="date" required style="background:#fdfcfb;color:var(--black);border-color:#bfbfbf" />
            </div>
            <button class="portal-secondary" type="submit" id="blockDateSubmitBtn">Block This Date</button>
          </form>
          <div class="form-status" id="blockDateStatus" style="color:#6d6d6d;margin-top:8px"></div>
          <div id="blockedDatesList" style="margin-top:14px"></div>
        </article>
        <article class="portal-panel">
          <span class="portal-label">Add An Appointment</span>
          <p style="color:#656565;margin-bottom:14px">Manually schedule someone (phone-in requests, etc). This books and confirms in one step.</p>
          <form id="adminBookForm">
            <div class="story-form-grid">
              <div class="form-field">
                <label for="adminBookName">Name</label>
                <input id="adminBookName" type="text" placeholder="First and last name" required style="background:#fdfcfb;color:var(--black);border-color:#bfbfbf" />
              </div>
              <div class="form-field">
                <label for="adminBookEmail">Email</label>
                <input id="adminBookEmail" type="email" placeholder="Their email" required style="background:#fdfcfb;color:var(--black);border-color:#bfbfbf" />
              </div>
              <div class="form-field">
                <label for="adminBookType">Session</label>
                <select id="adminBookType" required style="background:#fdfcfb;color:var(--black);border-color:#bfbfbf">
                  <option value="30-minute">30-Minute One-on-One</option>
                  <option value="15-minute">15-Minute Pop-Up</option>
                </select>
              </div>
              <div class="form-field">
                <label for="adminBookDate">Date (Tue or Thu)</label>
                <input id="adminBookDate" type="date" required style="background:#fdfcfb;color:var(--black);border-color:#bfbfbf" />
              </div>
              <div class="form-field full">
                <label for="adminBookTime">Time</label>
                <select id="adminBookTime" required disabled style="background:#fdfcfb;color:var(--black);border-color:#bfbfbf">
                  <option value="">Choose a date first</option>
                </select>
              </div>
            </div>
            <div class="form-actions">
              <button class="btn" type="submit" id="adminBookSubmitBtn" style="background:var(--black);color:var(--ivory);border-color:var(--black)">Add &amp; Confirm</button>
              <div class="form-status" id="adminBookStatus" role="status" aria-live="polite" style="color:#6d6d6d"></div>
            </div>
          </form>
        </article>
        <article class="portal-panel">
          <span class="portal-label">Member Accounts</span>
          <div id="ownerMembersList"><p style="color:#656565">Loading member accounts…</p></div>
        </article>
        <article class="portal-panel">
          <span class="portal-label">Classes &amp; Materials</span>
          <p style="color:#656565">Publishing Zoom links, materials, and class recordings isn't connected yet — this panel is next on the build list.</p>
        </article>
        <article class="portal-panel">
          <span class="portal-label">Account</span>
          <div class="portal-row"><div><strong>Signed in as</strong><small id="ownerAccountEmail">—</small></div></div>
          <button class="portal-secondary" type="button" id="ownerSignOut" style="margin-top:16px">Sign Out</button>
        </article>
      </div>
      <div class="portal-status" id="portalOwnerStatus" role="status" aria-live="polite"></div>
      <div class="portal-mockup-note">This ministry view only appears to accounts marked as admin in the database, and is enforced by Firestore security rules — not just hidden in the page.</div>
    </div>
  </dialog>

  <dialog class="booking-dialog" id="bookingDialog" aria-labelledby="bookingTitle">
    <div class="booking-head">
      <div>
        <div class="kicker" style="margin-bottom:0">One-on-One Scheduling</div>
        <h3 id="bookingTitle">Choose your session.</h3>
      </div>
      <button class="booking-close" id="closeBooking" type="button" aria-label="Close scheduling">×</button>
    </div>
    <div class="booking-body">
      <p class="booking-intro">Choose a date and an open time below. Sessions are held Tuesdays &amp; Thursdays, 2:00–6:00 PM ET. Your request is sent for confirmation — you'll be contacted at the email you provide.</p>
      <form id="bookingForm">
        <div style="position:absolute;left:-9999px;width:1px;height:1px;overflow:hidden" aria-hidden="true">
          <label for="bookingWebsite">Leave this field blank</label>
          <input id="bookingWebsite" name="website" type="text" tabindex="-1" autocomplete="off" />
        </div>
        <div class="booking-options" aria-label="Choose a one-on-one service">
          <label class="booking-option">
            <input type="radio" name="sessionType" value="30-minute" checked />
            <span><strong>30-Minute One-on-One</strong><small>More time for conversation, guidance, and focused ministry.</small></span>
          </label>
          <label class="booking-option">
            <input type="radio" name="sessionType" value="15-minute" />
            <span><strong>15-Minute Pop-Up</strong><small>A shorter personal session for one focused need or question.</small></span>
          </label>
        </div>
        <div class="booking-grid">
          <div class="booking-field">
            <label for="bookingDate">Choose a date (Tue or Thu)</label>
            <input id="bookingDate" name="date" type="date" required />
          </div>
          <div class="booking-field">
            <label for="bookingTime">Choose an available time</label>
            <select id="bookingTime" name="time" required disabled>
              <option value="">Choose a date first</option>
            </select>
          </div>
          <div class="booking-field">
            <label for="bookingName">Your name</label>
            <input id="bookingName" name="name" type="text" placeholder="First and last name" autocomplete="name" required />
          </div>
          <div class="booking-field">
            <label for="bookingEmail">Email address</label>
            <input id="bookingEmail" name="email" type="email" placeholder="For confirmation and reminders" autocomplete="email" required />
          </div>
        </div>
        <div class="booking-actions">
          <button class="btn on-light fill" type="submit" id="bookingSubmitBtn">Request This Time</button>
          <div class="booking-status" id="bookingStatus" role="status" aria-live="polite"></div>
        </div>
        <div class="booking-note">Booking requests are held as pending until confirmed by The Assembly. This does not yet collect payment.</div>
      </form>
    </div>
  </dialog>

  <dialog class="story-dialog" id="storyDialog" aria-labelledby="storyDialogTitle">
    <div class="dialog-head">
      <div>
        <div class="kicker" style="margin-bottom:0">Share With The Assembly</div>
        <h3 id="storyDialogTitle">Tell us your story.</h3>
      </div>
      <button class="dialog-close" id="closeStoryForm" type="button" aria-label="Close testimony form">×</button>
    </div>
    <div class="dialog-body">
      <p class="dialog-intro">You may share a written testimony, a class review, a photograph, or a video. Your submission remains private until The Assembly reviews it and receives permission to publish it.</p>
      <div class="dialog-note"><strong>Preview only:</strong> submitting this example shows the confirmation experience, but it does not send or save your information yet.</div>
      <form id="testimonyForm">
        <div class="story-form-grid">
          <div class="form-field">
            <label for="storyName">Your name</label>
            <input id="storyName" name="name" type="text" placeholder="First and last name" required />
          </div>
          <div class="form-field">
            <label for="storyEmail">Email address</label>
            <input id="storyEmail" name="email" type="email" placeholder="For private follow-up" required />
          </div>
          <div class="form-field">
            <label for="storyType">What are you sharing?</label>
            <select id="storyType" name="storyType" required>
              <option value="">Choose one</option>
              <option>Class review</option>
              <option>Personal testimony</option>
              <option>Prayer testimony</option>
              <option>Ministry experience</option>
            </select>
          </div>
          <div class="form-field">
            <label for="storyClass">Class or gathering</label>
            <input id="storyClass" name="className" type="text" placeholder="Example: Discernment Class" />
          </div>
          <div class="form-field full">
            <label for="storyBefore">Before the experience</label>
            <textarea id="storyBefore" name="before" placeholder="What did you believe, understand, or experience before?"></textarea>
          </div>
          <div class="form-field full">
            <label for="storyAfter">After the experience</label>
            <textarea id="storyAfter" name="after" placeholder="What became clearer, changed, or helped you afterward?"></textarea>
          </div>
          <div class="form-field full">
            <label for="storyMessage">Your testimony or review</label>
            <textarea id="storyMessage" name="message" placeholder="Share the complete story in your own words" required></textarea>
          </div>
          <div class="form-field">
            <label for="storyMedia">Add a photo or video</label>
            <input id="storyMedia" name="media" type="file" accept="image/*,video/*" />
          </div>
          <div class="form-field">
            <label for="storyVideoLink">Or include a video link</label>
            <input id="storyVideoLink" name="videoLink" type="url" placeholder="YouTube, Vimeo, or shared link" />
          </div>
          <div class="form-field full">
            <label class="permission-label">
              <input name="permission" type="checkbox" required />
              <span>I give The Assembly permission to review this submission and contact me before anything is published.</span>
            </label>
          </div>
        </div>
        <div class="form-actions">
          <button class="btn" type="submit">Preview Submission</button>
          <div class="form-status" id="formStatus" role="status" aria-live="polite"></div>
        </div>
      </form>
    </div>
  </dialog>`;
}

// Inject nav (start of body), dialogs + footer (end of body), before
// anything below tries to query them.
document.body.insertAdjacentHTML('afterbegin', navHtml());
document.body.insertAdjacentHTML('beforeend', dialogsHtml() + footerHtml());

// Mark the current page's nav link, driven by <body data-page="...">.
const currentPage = document.body.dataset.page;
if(currentPage){
  const match = document.querySelector('#navMobilePanel [data-page="' + currentPage + '"]');
  if(match) match.classList.add('current');
}

/* ---------------------------------------------------------------
   Firebase
   --------------------------------------------------------------- */
const firebaseConfig = {
  apiKey: "AIzaSyBn7fbRhrTXcgeUrfiQjWZh0YDMg5Kr57Y",
  authDomain: "unveiledassembly.firebaseapp.com",
  projectId: "unveiledassembly",
  storageBucket: "unveiledassembly.firebasestorage.app",
  messagingSenderId: "566883024840",
  appId: "1:566883024840:web:69c1a65e3bfede28a04afd"
};
const ADMIN_EMAIL = 'contactunveiledassembly@gmail.com';

const fbApp = initializeApp(firebaseConfig);
const auth = getAuth(fbApp);
const db = getFirestore(fbApp);

let currentUser = null;
let currentProfile = null;

/* ---------------------------------------------------------------
   Nav / mobile menu
   --------------------------------------------------------------- */
const nav = document.getElementById('nav');
const btn = document.getElementById('menuBtn');
const links = document.getElementById('links');
const navMobilePanel = document.getElementById('navMobilePanel');
const navAccountBtn = document.getElementById('navMemberPortal');
const navAccountBtnLabel = navAccountBtn.querySelector('.account-btn-label');

// The account control is icon-only on desktop (accessible name via
// aria-label/title) and shows a visible text label only inside the
// mobile menu, where the icon-only circle would be ambiguous.
function setAccountControlLabel(text){
  navAccountBtn.setAttribute('aria-label', text);
  navAccountBtn.setAttribute('title', text);
  navAccountBtnLabel.textContent = text;
}

window.addEventListener('scroll', () => {
  nav.classList.toggle('scrolled', window.scrollY > 30);
});

function setMenuOpen(isOpen){
  nav.classList.toggle('open', isOpen);
  btn.textContent = isOpen ? '×' : '☰';
  btn.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
  btn.setAttribute('aria-label', isOpen ? 'Close menu' : 'Open menu');
}
btn.addEventListener('click', () => setMenuOpen(!nav.classList.contains('open')));
navMobilePanel.querySelectorAll('a:not(.is-placeholder)').forEach(a => a.addEventListener('click', () => setMenuOpen(false)));
document.getElementById('cartBtn').addEventListener('click', () => setMenuOpen(false));

// Social icons without a confirmed URL yet (Facebook, YouTube) are inert —
// prevent the "#" href from jumping the page.
document.addEventListener('click', event => {
  const placeholder = event.target.closest('.is-placeholder');
  if(placeholder) event.preventDefault();
});

/* ---------------------------------------------------------------
   Story / testimony dialog (not connected to storage — known gap,
   unchanged from the original build)
   --------------------------------------------------------------- */
const storyDialog = document.getElementById('storyDialog');
const openStoryForm = document.getElementById('openStoryForm');
const closeStoryForm = document.getElementById('closeStoryForm');
const testimonyForm = document.getElementById('testimonyForm');
const formStatus = document.getElementById('formStatus');

if(openStoryForm) openStoryForm.addEventListener('click', () => storyDialog.showModal());
closeStoryForm.addEventListener('click', () => storyDialog.close());
storyDialog.addEventListener('click', event => {
  if(event.target === storyDialog) storyDialog.close();
});
storyDialog.addEventListener('close', () => { formStatus.textContent = ''; });
testimonyForm.addEventListener('submit', event => {
  event.preventDefault();
  formStatus.textContent = "Thank you — this form isn't wired to storage yet, so nothing was saved. Please email your story to contactunveiledassembly@gmail.com for now.";
});

/* ---------------------------------------------------------------
   Helpers
   --------------------------------------------------------------- */
function escapeHtml(str){
  return String(str).replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
}
function minutesToLabel(mins){
  const h24 = Math.floor(mins / 60);
  const m = mins % 60;
  const period = h24 >= 12 ? 'PM' : 'AM';
  let h12 = h24 % 12; if(h12 === 0) h12 = 12;
  return h12 + ':' + String(m).padStart(2, '0') + ' ' + period;
}
function minutesToHHMM(mins){
  return String(Math.floor(mins / 60)).padStart(2, '0') + ':' + String(mins % 60).padStart(2, '0');
}
function hhmmToMinutes(hhmm){
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

const BUSINESS_TZ = 'America/New_York';
function etWallTimeToDate(dateStr, minutes){
  const [y, mo, d] = dateStr.split('-').map(Number);
  const hh = Math.floor(minutes / 60), mm = minutes % 60;
  let guess = new Date(Date.UTC(y, mo - 1, d, hh, mm));
  for(let i = 0; i < 2; i++){
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: BUSINESS_TZ, hour12: false,
      year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit'
    }).formatToParts(guess);
    const map = {};
    parts.forEach(p => { map[p.type] = p.value; });
    const hourVal = Number(map.hour) === 24 ? 0 : Number(map.hour);
    const asIfET = Date.UTC(Number(map.year), Number(map.month) - 1, Number(map.day), hourVal, Number(map.minute));
    const target = Date.UTC(y, mo - 1, d, hh, mm);
    guess = new Date(guess.getTime() + (target - asIfET));
  }
  return guess;
}
function formatLocalDateTime(dateStr, hhmm){
  try {
    const d = etWallTimeToDate(dateStr, hhmmToMinutes(hhmm));
    const datePart = new Intl.DateTimeFormat(undefined, { weekday: 'short', month: 'short', day: 'numeric' }).format(d);
    const timePart = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit', timeZoneName: 'short' }).format(d);
    return datePart + ' · ' + timePart;
  } catch (err) {
    return dateStr + ' · ' + minutesToLabel(hhmmToMinutes(hhmm)) + ' ET';
  }
}
function formatLocalTime(dateStr, hhmm){
  try {
    const d = etWallTimeToDate(dateStr, hhmmToMinutes(hhmm));
    return new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit', timeZoneName: 'short' }).format(d);
  } catch (err) {
    return minutesToLabel(hhmmToMinutes(hhmm)) + ' ET';
  }
}
function friendlyAuthError(err){
  const code = (err && err.code) || '';
  if(code.includes('wrong-password') || code.includes('invalid-credential')) return 'Incorrect email or password.';
  if(code.includes('user-not-found')) return 'No account found with that email — try Create an Account instead.';
  if(code.includes('email-already-in-use')) return 'An account with this email already exists — try signing in instead.';
  if(code.includes('weak-password')) return 'Password should be at least 6 characters.';
  if(code.includes('invalid-email')) return 'Enter a valid email address.';
  if(code.includes('too-many-requests')) return 'Too many attempts — please wait a moment and try again.';
  if(code.includes('invalid-phone-number') || code.includes('missing-phone-number')) return 'Enter a valid phone number, including country code.';
  if(code.includes('invalid-verification-code')) return 'That code is incorrect — check it and try again.';
  if(code.includes('code-expired')) return 'That code expired — request a new one.';
  if(code.includes('credential-already-in-use') || code.includes('phone-number-already-exists')) return 'That phone number is already linked to another account.';
  if(code.includes('quota-exceeded')) return 'Too many verification attempts right now — please try again later.';
  if(code.includes('captcha-check-failed')) return 'Verification check failed — please try again.';
  if(code.includes('requires-recent-login')) return 'Please sign in again to complete this action.';
  return 'Something went wrong. Please try again.';
}

/* ---------------------------------------------------------------
   Member portal dialog
   --------------------------------------------------------------- */
const memberPortalDialog = document.getElementById('memberPortalDialog');
const openMemberPortal = document.getElementById('openMemberPortal'); // optional, page-specific CTA
const navMemberPortal = document.getElementById('navMemberPortal');
const closeMemberPortal = document.getElementById('closeMemberPortal');
const portalViews = memberPortalDialog.querySelectorAll('[data-portal-view]');
const tabProspect = document.getElementById('tabProspect');
const tabMember = document.getElementById('tabMember');
const tabOwner = document.getElementById('tabOwner');
const portalTabs = [tabProspect, tabMember, tabOwner];
const portalMemberStatus = document.getElementById('portalMemberStatus');
const portalOwnerStatus = document.getElementById('portalOwnerStatus');
const portalLoginStatus = document.getElementById('portalLoginStatus');
const portalSignInBtn = document.getElementById('portalSignInBtn');

// Set while the post-registration "verify your account" panel is showing,
// so the auth-state listener doesn't yank the dialog straight to the
// dashboard the instant createUserWithEmailAndPassword signs the new
// account in underneath it.
let awaitingVerifyChoice = false;
// The E.164 phone number captured at registration (or loaded from the
// signed-in profile when re-entering verification later), used by
// "Verify by Text".
let pendingVerifyPhone = null;

function showPortalView(name){
  portalViews.forEach(view => { view.hidden = view.dataset.portalView !== name; });
  portalTabs.forEach(tabButton => {
    if(!tabButton) return;
    const selected = tabButton.dataset.portalTarget === name;
    tabButton.classList.toggle('active', selected);
    tabButton.setAttribute('aria-pressed', selected ? 'true' : 'false');
  });
}

function refreshPortalTabs(){
  if(currentUser && currentProfile){
    tabProspect.hidden = true;
    tabMember.hidden = false;
    tabOwner.hidden = currentProfile.role !== 'admin';
  } else {
    tabProspect.hidden = false;
    tabMember.hidden = true;
    tabOwner.hidden = true;
  }
}

// Shows the correct dashboard (member or admin) for the current session.
// Shared by the initial dialog open, the auth-state listener, and
// "Continue to My Assembly" at the end of the verify flow — one place
// that knows how to route a signed-in user, rather than duplicating it.
function enterDashboard(){
  showPortalView(currentProfile.role === 'admin' ? 'owner' : 'member');
  loadMemberBookings();
  if(currentProfile.role === 'admin') loadOwnerData();
  updateVerifyBanner();
}

function openPortal(){
  setMenuOpen(false);
  refreshPortalTabs();
  if(currentUser && currentProfile){
    enterDashboard();
  } else {
    showAuthPanel('signin');
    showPortalView('prospect');
  }
  memberPortalDialog.showModal();
}
if(openMemberPortal) openMemberPortal.addEventListener('click', openPortal);
navMemberPortal.addEventListener('click', openPortal);
closeMemberPortal.addEventListener('click', () => memberPortalDialog.close());
memberPortalDialog.addEventListener('click', event => {
  if(event.target === memberPortalDialog) memberPortalDialog.close();
});
portalTabs.forEach(tabButton => {
  if(!tabButton) return;
  tabButton.addEventListener('click', () => {
    showPortalView(tabButton.dataset.portalTarget);
    if(tabButton.dataset.portalTarget === 'member') loadMemberBookings();
    if(tabButton.dataset.portalTarget === 'owner') loadOwnerData();
  });
});

/* ---------------------------------------------------------------
   Auth panel/tab switching (Sign In / Create Account / Forgot / Verify,
   and the Email/Phone method tabs within Sign In)
   --------------------------------------------------------------- */
const authModeTabs = memberPortalDialog.querySelectorAll('.auth-mode-tab');
const authPanels = memberPortalDialog.querySelectorAll('.auth-panel');
function showAuthPanel(name){
  authPanels.forEach(p => { p.hidden = p.dataset.authPanel !== name; });
  authModeTabs.forEach(t => {
    const selected = t.dataset.authMode === name;
    t.classList.toggle('active', selected);
    t.setAttribute('aria-selected', selected ? 'true' : 'false');
  });
}
authModeTabs.forEach(t => t.addEventListener('click', () => showAuthPanel(t.dataset.authMode)));
memberPortalDialog.querySelectorAll('[data-switch-to]').forEach(btn => {
  btn.addEventListener('click', () => showAuthPanel(btn.dataset.switchTo));
});

const authMethodTabs = memberPortalDialog.querySelectorAll('.auth-method-tab');
const authMethodPanels = memberPortalDialog.querySelectorAll('[data-auth-method-panel]');
function showAuthMethod(name){
  authMethodPanels.forEach(p => { p.hidden = p.dataset.authMethodPanel !== name; });
  authMethodTabs.forEach(t => {
    const selected = t.dataset.authMethod === name;
    t.classList.toggle('active', selected);
    t.setAttribute('aria-selected', selected ? 'true' : 'false');
  });
}
authMethodTabs.forEach(t => t.addEventListener('click', () => showAuthMethod(t.dataset.authMethod)));

// Password show/hide — delegated, works for every .password-toggle button.
memberPortalDialog.addEventListener('click', event => {
  const toggle = event.target.closest('.password-toggle');
  if(!toggle) return;
  const input = document.getElementById(toggle.dataset.toggleFor);
  if(!input) return;
  const showing = input.type === 'text';
  input.type = showing ? 'password' : 'text';
  toggle.innerHTML = showing ? EYE_ICON : EYE_OFF_ICON;
  toggle.setAttribute('aria-label', showing ? 'Show password' : 'Hide password');
});

/* ---------------------------------------------------------------
   Validation helpers
   --------------------------------------------------------------- */
function isValidEmail(email){
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}
// At least 8 characters with a letter and a number — deliberately stricter
// than Firebase's own 6-character minimum.
function isValidPassword(pw){
  return pw.length >= 8 && /[a-zA-Z]/.test(pw) && /[0-9]/.test(pw);
}
// Combines a country-code <select> and a national-number <input> into an
// E.164 string Firebase Phone Auth requires (e.g. "+15551234567"). The
// "other" option lets someone type the full +<country><number> themselves
// if their country isn't in the short list.
function toE164(countrySelectEl, numberInputEl){
  const country = countrySelectEl.value;
  const raw = numberInputEl.value.trim();
  if(!raw) return null;
  if(country === 'other') return raw.startsWith('+') ? raw : null;
  const digits = raw.replace(/[^0-9]/g, '');
  return digits ? country + digits : null;
}

/* ---------------------------------------------------------------
   Email sign-in
   --------------------------------------------------------------- */
const emailSignInForm = document.getElementById('emailSignInForm');
const signinEmailInput = document.getElementById('signinEmail');
const signinPasswordInput = document.getElementById('signinPassword');

emailSignInForm.addEventListener('submit', async event => {
  event.preventDefault();
  portalLoginStatus.textContent = 'Signing in…';
  portalSignInBtn.disabled = true;
  try {
    await signInWithEmailAndPassword(auth, signinEmailInput.value.trim(), signinPasswordInput.value);
    portalLoginStatus.textContent = '';
    emailSignInForm.reset();
  } catch (err) {
    portalLoginStatus.textContent = friendlyAuthError(err);
  } finally {
    portalSignInBtn.disabled = false;
  }
});

/* ---------------------------------------------------------------
   Forgot password — always shows the same neutral confirmation,
   regardless of whether the email is actually registered.
   --------------------------------------------------------------- */
document.getElementById('showForgotPassword').addEventListener('click', () => {
  document.getElementById('forgotEmail').value = signinEmailInput.value.trim();
  document.getElementById('forgotPasswordStatus').textContent = '';
  showAuthPanel('forgot');
});

document.getElementById('sendResetBtn').addEventListener('click', async () => {
  const statusEl = document.getElementById('forgotPasswordStatus');
  const btn = document.getElementById('sendResetBtn');
  const email = document.getElementById('forgotEmail').value.trim();
  if(!isValidEmail(email)){ statusEl.textContent = 'Enter a valid email address.'; return; }
  btn.disabled = true;
  statusEl.textContent = 'Sending…';
  try {
    await sendPasswordResetEmail(auth, email);
  } catch (err) {
    // auth/user-not-found is deliberately swallowed — surfacing it would
    // reveal whether an email is registered. Every other error still shows.
    if(err.code !== 'auth/user-not-found'){
      statusEl.textContent = friendlyAuthError(err);
      btn.disabled = false;
      return;
    }
  }
  statusEl.textContent = 'If an account exists for that email, a reset link has been sent.';
  btn.disabled = false;
});

/* ---------------------------------------------------------------
   Phone sign-in (existing, already-linked accounts only — see the
   duplicate-account guard in the confirm handler below)
   --------------------------------------------------------------- */
let signinRecaptcha = null;
let signinConfirmationResult = null;
let resendCooldownTimer = null;

function startResendCooldown(button, seconds){
  let remaining = seconds;
  button.disabled = true;
  button.textContent = 'Resend Code (' + remaining + 's)';
  if(resendCooldownTimer) clearInterval(resendCooldownTimer);
  resendCooldownTimer = setInterval(() => {
    remaining -= 1;
    if(remaining <= 0){
      clearInterval(resendCooldownTimer);
      button.disabled = false;
      button.textContent = 'Resend Code';
    } else {
      button.textContent = 'Resend Code (' + remaining + 's)';
    }
  }, 1000);
}

async function sendSigninCode(){
  const phone = toE164(document.getElementById('signinPhoneCountry'), document.getElementById('signinPhoneNumber'));
  if(!phone){ portalLoginStatus.textContent = 'Enter a valid phone number.'; return; }
  const sendBtn = document.getElementById('sendSigninCodeBtn');
  sendBtn.disabled = true;
  portalLoginStatus.textContent = 'Sending code…';
  try {
    if(!signinRecaptcha){
      signinRecaptcha = new RecaptchaVerifier(auth, 'recaptcha-container-signin', { size: 'invisible' });
    }
    signinConfirmationResult = await signInWithPhoneNumber(auth, phone, signinRecaptcha);
    document.getElementById('signinCodeStep').hidden = false;
    portalLoginStatus.textContent = 'Code sent to ' + phone + '.';
    startResendCooldown(document.getElementById('resendSigninCodeBtn'), 60);
  } catch (err) {
    portalLoginStatus.textContent = friendlyAuthError(err);
  } finally {
    sendBtn.disabled = false;
  }
}
document.getElementById('sendSigninCodeBtn').addEventListener('click', sendSigninCode);
document.getElementById('resendSigninCodeBtn').addEventListener('click', sendSigninCode);

document.getElementById('verifySigninCodeBtn').addEventListener('click', async () => {
  const code = document.getElementById('signinCode').value.trim();
  if(!signinConfirmationResult || !code){ portalLoginStatus.textContent = 'Enter the 6-digit code.'; return; }
  portalLoginStatus.textContent = 'Verifying…';
  try {
    const result = await signinConfirmationResult.confirm(code);
    // A phone credential with no matching Firestore profile means this
    // number was never linked to a real account (e.g. someone who never
    // registered trying phone sign-in cold). Rather than silently create
    // a blank membership record — a duplicate/orphan account — sign back
    // out and point them to registration instead.
    const profileSnap = await getDoc(doc(db, 'users', result.user.uid));
    if(!profileSnap.exists()){
      await signOut(auth);
      portalLoginStatus.textContent = "We don't have an account linked to that phone number yet. Use Create Account, or sign in by email and verify by text from My Assembly.";
      return;
    }
    portalLoginStatus.textContent = '';
  } catch (err) {
    portalLoginStatus.textContent = friendlyAuthError(err);
  }
});

/* ---------------------------------------------------------------
   Create Account — collects the full profile, creates the Firebase
   Auth account, writes the Firestore profile, then hands off to the
   verify panel. Phone is stored as data immediately; it isn't linked
   as a sign-in method until the person actually verifies by text.
   --------------------------------------------------------------- */
const registerForm = document.getElementById('registerForm');
const registerStatus = document.getElementById('registerStatus');
const registerSubmitBtn = document.getElementById('registerSubmitBtn');

registerForm.addEventListener('submit', async event => {
  event.preventDefault();
  const firstName = document.getElementById('regFirstName').value.trim();
  const lastName = document.getElementById('regLastName').value.trim();
  const email = document.getElementById('regEmail').value.trim();
  const phone = toE164(document.getElementById('regPhoneCountry'), document.getElementById('regPhoneNumber'));
  const password = document.getElementById('regPassword').value;
  const confirmPassword = document.getElementById('regConfirmPassword').value;

  if(!firstName || !lastName){ registerStatus.textContent = 'Enter your first and last name.'; return; }
  if(!isValidEmail(email)){ registerStatus.textContent = 'Enter a valid email address.'; return; }
  if(!phone){ registerStatus.textContent = 'Enter a valid phone number, including country code.'; return; }
  if(!isValidPassword(password)){ registerStatus.textContent = 'Password must be at least 8 characters and include a letter and a number.'; return; }
  if(password !== confirmPassword){ registerStatus.textContent = 'Passwords do not match.'; return; }

  registerSubmitBtn.disabled = true;
  registerStatus.textContent = 'Creating your account…';
  try {
    const cred = await createUserWithEmailAndPassword(auth, email, password);
    const fullName = firstName + ' ' + lastName;
    await updateProfile(cred.user, { displayName: fullName });
    const role = email.toLowerCase() === ADMIN_EMAIL ? 'admin' : 'member';
    await setDoc(doc(db, 'users', cred.user.uid), {
      firstName, lastName, name: fullName, email, phone, role,
      emailVerified: false, phoneVerified: false, createdAt: serverTimestamp()
    });
    try { await sendEmailVerification(cred.user); } catch (err) { /* non-fatal — they can resend from the verify panel */ }
    pendingVerifyPhone = phone;
    awaitingVerifyChoice = true;
    registerForm.reset();
    registerStatus.textContent = '';
    document.getElementById('verifyStatus').textContent = '';
    document.getElementById('verifyPhoneStep').hidden = true;
    showAuthPanel('verify');
  } catch (err) {
    registerStatus.textContent = friendlyAuthError(err);
  } finally {
    registerSubmitBtn.disabled = false;
  }
});

/* ---------------------------------------------------------------
   Post-registration (and re-entered, via "Verify Now") verification
   --------------------------------------------------------------- */
document.getElementById('verifyByEmailBtn').addEventListener('click', async () => {
  const statusEl = document.getElementById('verifyStatus');
  if(!currentUser){ statusEl.textContent = 'Please sign in again.'; return; }
  statusEl.textContent = 'Sending verification email…';
  try {
    await sendEmailVerification(currentUser);
    statusEl.textContent = 'Verification email sent — check your inbox, then continue below.';
  } catch (err) {
    statusEl.textContent = friendlyAuthError(err);
  }
});

let verifyRecaptcha = null;
let verifyConfirmationResult = null;

document.getElementById('verifyByTextBtn').addEventListener('click', async () => {
  const statusEl = document.getElementById('verifyStatus');
  const phone = pendingVerifyPhone || currentProfile?.phone;
  if(!currentUser || !phone){ statusEl.textContent = 'No phone number on file — add one from My Assembly first.'; return; }
  statusEl.textContent = 'Sending code…';
  try {
    if(!verifyRecaptcha){
      verifyRecaptcha = new RecaptchaVerifier(auth, 'recaptcha-container-verify', { size: 'invisible' });
    }
    verifyConfirmationResult = await linkWithPhoneNumber(currentUser, phone, verifyRecaptcha);
    document.getElementById('verifyPhoneStep').hidden = false;
    statusEl.textContent = 'Code sent to ' + phone + '.';
  } catch (err) {
    statusEl.textContent = friendlyAuthError(err);
  }
});

document.getElementById('confirmVerifyPhoneBtn').addEventListener('click', async () => {
  const statusEl = document.getElementById('verifyStatus');
  const code = document.getElementById('verifyPhoneCode').value.trim();
  if(!verifyConfirmationResult || !code){ statusEl.textContent = 'Enter the 6-digit code.'; return; }
  statusEl.textContent = 'Verifying…';
  try {
    await verifyConfirmationResult.confirm(code);
    await updateDoc(doc(db, 'users', currentUser.uid), { phoneVerified: true });
    if(currentProfile) currentProfile.phoneVerified = true;
    statusEl.textContent = 'Phone verified.';
    updateVerifyBanner();
  } catch (err) {
    statusEl.textContent = friendlyAuthError(err);
  }
});

document.getElementById('skipVerifyBtn').addEventListener('click', () => {
  awaitingVerifyChoice = false;
  if(currentUser && currentProfile){
    enterDashboard();
  } else {
    showAuthPanel('signin');
    showPortalView('prospect');
  }
});

// Reopens the verify panel for an already-signed-in member from the
// dashboard banner (see updateVerifyBanner / the banner button below).
document.getElementById('verifyBannerBtn').addEventListener('click', () => {
  pendingVerifyPhone = currentProfile?.phone || null;
  awaitingVerifyChoice = true;
  document.getElementById('verifyStatus').textContent = '';
  document.getElementById('verifyPhoneStep').hidden = true;
  showPortalView('prospect');
  showAuthPanel('verify');
});

// Grandfathers every pre-upgrade account (emailVerified/phoneVerified were
// never set, so both read as `undefined`, not `false`) — only accounts
// that went through the new registration flow and explicitly haven't
// verified yet (both fields present and false) see the banner.
function updateVerifyBanner(){
  const banner = document.getElementById('verifyBanner');
  if(!banner || !currentProfile) return;
  const needsVerification = currentProfile.emailVerified === false && currentProfile.phoneVerified === false;
  banner.hidden = !needsVerification;
}

document.getElementById('memberSignOut').addEventListener('click', () => signOut(auth));
document.getElementById('ownerSignOut').addEventListener('click', () => signOut(auth));
document.getElementById('memberBookNew').addEventListener('click', () => {
  memberPortalDialog.close();
  openBooking('30-minute');
});

/* ---------------------------------------------------------------
   Booking: availability + Firestore-backed scheduling
   --------------------------------------------------------------- */
const AVAILABILITY_DAYS = [2, 4]; // Tue, Thu (Sunday = 0)
const AVAILABILITY_START_MIN = 14 * 60; // 2:00 PM
const AVAILABILITY_END_MIN = 18 * 60;   // 6:00 PM
const SESSION_MINUTES = { '30-minute': 30, '15-minute': 15 };

const bookingDialog = document.getElementById('bookingDialog');
const closeBooking = document.getElementById('closeBooking');
const bookingForm = document.getElementById('bookingForm');
const bookingStatus = document.getElementById('bookingStatus');
const bookingSubmitBtn = document.getElementById('bookingSubmitBtn');
const bookingDateInput = document.getElementById('bookingDate');
const bookingTimeSelect = document.getElementById('bookingTime');

bookingDateInput.min = new Date().toISOString().slice(0, 10);

async function bookedIntervalsForDate(dateStr){
  const snap = await getDocs(query(collection(db, 'bookings'), where('date', '==', dateStr)));
  const intervals = [];
  snap.forEach(docSnap => {
    const b = docSnap.data();
    if(b.status === 'declined') return;
    const start = hhmmToMinutes(b.time);
    const dur = SESSION_MINUTES[b.sessionType] || 30;
    intervals.push([start, start + dur]);
  });
  return intervals;
}

async function computeOpenSlots(dateStr, duration){
  if(!dateStr) return { ok: false, reason: 'Choose a date first' };
  const weekday = new Date(dateStr + 'T12:00:00').getDay();
  if(!AVAILABILITY_DAYS.includes(weekday)) return { ok: false, reason: 'No sessions on that day — pick a Tue or Thu' };
  try {
    const blockSnap = await getDoc(doc(db, 'blockouts', dateStr));
    if(blockSnap.exists()) return { ok: false, reason: 'Not available on that date — please choose another' };
  } catch (err) { /* fall through */ }
  let booked;
  try {
    booked = await bookedIntervalsForDate(dateStr);
  } catch (err) {
    return { ok: false, reason: 'Could not load availability — try again' };
  }
  const openStarts = [];
  for(let start = AVAILABILITY_START_MIN; start + duration <= AVAILABILITY_END_MIN; start += duration){
    const end = start + duration;
    const overlaps = booked.some(([bStart, bEnd]) => start < bEnd && end > bStart);
    if(!overlaps) openStarts.push(start);
  }
  if(openStarts.length === 0) return { ok: false, reason: 'No open times on that date' };
  return { ok: true, openStarts };
}

async function populateTimeSelect(selectEl, dateStr, duration){
  selectEl.innerHTML = '';
  selectEl.disabled = true;
  if(!dateStr){
    selectEl.appendChild(new Option('Choose a date first', ''));
    return;
  }
  selectEl.appendChild(new Option('Loading available times…', ''));
  const result = await computeOpenSlots(dateStr, duration);
  selectEl.innerHTML = '';
  if(!result.ok){
    selectEl.appendChild(new Option(result.reason, ''));
    return;
  }
  selectEl.appendChild(new Option('Choose a time', ''));
  result.openStarts.forEach(start => {
    const hhmm = minutesToHHMM(start);
    selectEl.appendChild(new Option(formatLocalTime(dateStr, hhmm) + ' (' + minutesToLabel(start) + ' ET)', hhmm));
  });
  selectEl.disabled = false;
}

async function loadTimeSlots(){
  const dateStr = bookingDateInput.value;
  const service = bookingForm.querySelector('input[name="sessionType"]:checked').value;
  await populateTimeSelect(bookingTimeSelect, dateStr, SESSION_MINUTES[service]);
}

function openBooking(service){
  bookingForm.reset();
  bookingStatus.textContent = '';
  if(service){
    const serviceChoice = bookingForm.querySelector('input[name="sessionType"][value="' + service + '"]');
    if(serviceChoice) serviceChoice.checked = true;
  }
  if(currentUser && currentProfile){
    document.getElementById('bookingName').value = currentProfile.name || '';
    document.getElementById('bookingEmail').value = currentProfile.email || '';
  }
  loadTimeSlots();
  bookingDialog.showModal();
}
window.openBooking = openBooking; // pages can trigger booking directly, e.g. Prayer CTAs

document.addEventListener('click', event => {
  const trigger = event.target.closest('.book-session');
  if(trigger) openBooking(trigger.dataset.service);
});
closeBooking.addEventListener('click', () => bookingDialog.close());
bookingDialog.addEventListener('click', event => {
  if(event.target === bookingDialog) bookingDialog.close();
});
bookingDateInput.addEventListener('change', loadTimeSlots);
bookingForm.querySelectorAll('input[name="sessionType"]').forEach(radio => {
  radio.addEventListener('change', loadTimeSlots);
});

async function createBooking({ name, email, sessionType, date, time, status, uid }){
  const slotId = date + '_' + time;
  await runTransaction(db, async (tx) => {
    const slotRef = doc(db, 'slots', slotId);
    const slotSnap = await tx.get(slotRef);
    if(slotSnap.exists()) throw new Error('slot-taken');
    tx.set(slotRef, { date, time, sessionType, uid: uid || null, createdAt: serverTimestamp() });
    const bookingRef = doc(collection(db, 'bookings'));
    tx.set(bookingRef, { slotId, date, time, sessionType, name, email, uid: uid || null, status, createdAt: serverTimestamp() });
  });
}

const BOOKING_COOLDOWN_MS = 60000;
function throttledRecently(storageKey){
  try {
    const last = Number(localStorage.getItem(storageKey) || 0);
    return Date.now() - last < BOOKING_COOLDOWN_MS;
  } catch (err) { return false; }
}
function markThrottled(storageKey){
  try { localStorage.setItem(storageKey, String(Date.now())); } catch (err) { /* ignore */ }
}

bookingForm.addEventListener('submit', async event => {
  event.preventDefault();
  const honeypot = document.getElementById('bookingWebsite').value;
  if(honeypot){
    bookingStatus.textContent = 'Request received.';
    bookingForm.reset();
    return;
  }
  if(throttledRecently('lastBookingSubmit')){
    bookingStatus.textContent = 'Please wait a moment before submitting another request.';
    return;
  }
  const service = bookingForm.querySelector('input[name="sessionType"]:checked').value;
  const dateStr = bookingDateInput.value;
  const time = bookingTimeSelect.value;
  const name = document.getElementById('bookingName').value.trim();
  const email = document.getElementById('bookingEmail').value.trim();
  if(!dateStr || !time){
    bookingStatus.textContent = 'Choose a date and an available time.';
    return;
  }
  bookingSubmitBtn.disabled = true;
  bookingStatus.textContent = 'Requesting your session…';
  try {
    await createBooking({
      name, email, sessionType: service, date: dateStr, time,
      status: 'pending', uid: currentUser ? currentUser.uid : null
    });
    markThrottled('lastBookingSubmit');
    bookingStatus.textContent = 'Request received — your ' + (service === '30-minute' ? '30-minute' : '15-minute') +
      ' session on ' + formatLocalDateTime(dateStr, time) + ' is pending confirmation. You will be contacted at ' + email + '.';
    bookingForm.reset();
    loadTimeSlots();
    if(currentUser) loadMemberBookings();
  } catch (err) {
    if(err.message === 'slot-taken'){
      bookingStatus.textContent = 'That time was just taken by someone else — pick another.';
      loadTimeSlots();
    } else {
      bookingStatus.textContent = 'Could not submit your request. Please try again.';
    }
  } finally {
    bookingSubmitBtn.disabled = false;
  }
});

/* ---------------------------------------------------------------
   Admin: manually add + auto-confirm an appointment
   --------------------------------------------------------------- */
const adminBookForm = document.getElementById('adminBookForm');
const adminBookDateInput = document.getElementById('adminBookDate');
const adminBookTimeSelect = document.getElementById('adminBookTime');
const adminBookTypeSelect = document.getElementById('adminBookType');
const adminBookSubmitBtn = document.getElementById('adminBookSubmitBtn');
const adminBookStatus = document.getElementById('adminBookStatus');
adminBookDateInput.min = new Date().toISOString().slice(0, 10);

async function loadAdminTimeSlots(){
  await populateTimeSelect(adminBookTimeSelect, adminBookDateInput.value, SESSION_MINUTES[adminBookTypeSelect.value]);
}
adminBookDateInput.addEventListener('change', loadAdminTimeSlots);
adminBookTypeSelect.addEventListener('change', loadAdminTimeSlots);

adminBookForm.addEventListener('submit', async event => {
  event.preventDefault();
  const name = document.getElementById('adminBookName').value.trim();
  const email = document.getElementById('adminBookEmail').value.trim();
  const service = adminBookTypeSelect.value;
  const dateStr = adminBookDateInput.value;
  const time = adminBookTimeSelect.value;
  if(!dateStr || !time){
    adminBookStatus.textContent = 'Choose a date and an available time.';
    return;
  }
  adminBookSubmitBtn.disabled = true;
  adminBookStatus.textContent = 'Adding appointment…';
  try {
    await createBooking({ name, email, sessionType: service, date: dateStr, time, status: 'confirmed' });
    adminBookStatus.textContent = 'Added and confirmed.';
    adminBookForm.reset();
    adminBookTimeSelect.innerHTML = '';
    adminBookTimeSelect.appendChild(new Option('Choose a date first', ''));
    adminBookTimeSelect.disabled = true;
    loadOwnerConfirmed();
  } catch (err) {
    adminBookStatus.textContent = err.message === 'slot-taken'
      ? 'That time is already booked — pick another.'
      : 'Could not add that appointment. Please try again.';
  } finally {
    adminBookSubmitBtn.disabled = false;
  }
});

/* ---------------------------------------------------------------
   Member dashboard: real bookings
   --------------------------------------------------------------- */
async function loadMemberBookings(){
  const container = document.getElementById('memberBookingsList');
  if(!currentUser){ container.innerHTML = ''; return; }
  container.innerHTML = '<p style="color:#d7d7d7">Loading your bookings…</p>';
  try {
    const snap = await getDocs(query(collection(db, 'bookings'), where('uid', '==', currentUser.uid)));
    if(snap.empty){
      container.innerHTML = '<p style="color:#d7d7d7">No bookings yet — request a session below.</p>';
      return;
    }
    const rows = [];
    snap.forEach(docSnap => rows.push({ id: docSnap.id, ...docSnap.data() }));
    rows.sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
    const today = new Date().toISOString().slice(0, 10);
    container.innerHTML = rows.map(b => {
      const label = b.sessionType === '30-minute' ? '30-Minute One-on-One' : '15-Minute Pop-Up';
      const statusLabel = b.status === 'confirmed' ? 'Confirmed' : b.status === 'declined' ? 'Declined' : b.status === 'cancelled' ? 'Cancelled' : 'Pending';
      const canCancel = (b.status === 'pending' || b.status === 'confirmed') && b.date >= today;
      return '<div class="portal-row" data-booking-id="' + b.id + '" data-slot-id="' + escapeHtml(b.slotId || '') + '" data-session-type="' + escapeHtml(b.sessionType) + '">' +
        '<div><strong>' + escapeHtml(label) + '</strong><small>' + escapeHtml(formatLocalDateTime(b.date, b.time)) + '</small></div>' +
        '<div style="display:flex;align-items:center;gap:10px">' +
        '<span class="portal-access">' + statusLabel + '</span>' +
        (canCancel ? '<button class="portal-secondary member-reschedule-booking" type="button" style="min-height:32px;padding:0 10px;font-size:9px">Reschedule</button>' +
          '<button class="portal-secondary member-cancel-booking" type="button" style="min-height:32px;padding:0 10px;font-size:9px">Cancel</button>' : '') +
        '</div></div>';
    }).join('');
  } catch (err) {
    container.innerHTML = '<p style="color:#d7d7d7">Could not load your bookings.</p>';
  }
}

async function cancelOwnBooking(bookingId, slotId){
  await updateDoc(doc(db, 'bookings', bookingId), { status: 'cancelled' });
  if(slotId){
    try { await deleteDoc(doc(db, 'slots', slotId)); } catch (err) { /* admin can clean up if this ever fails */ }
  }
}

document.getElementById('memberBookingsList').addEventListener('click', async event => {
  const cancelBtn = event.target.closest('.member-cancel-booking');
  const reschedBtn = event.target.closest('.member-reschedule-booking');
  if(!cancelBtn && !reschedBtn) return;
  const row = event.target.closest('[data-booking-id]');
  const bookingId = row.dataset.bookingId;
  const slotId = row.dataset.slotId;
  const sessionType = row.dataset.sessionType;
  event.target.disabled = true;
  try {
    await cancelOwnBooking(bookingId, slotId);
    loadMemberBookings();
    if(reschedBtn){
      memberPortalDialog.close();
      openBooking(sessionType);
      bookingStatus.textContent = 'Your old time was cancelled — pick a new one below.';
    } else {
      portalMemberStatus.textContent = 'Booking cancelled.';
    }
  } catch (err) {
    portalMemberStatus.textContent = 'Could not update that booking.';
    event.target.disabled = false;
  }
});

/* ---------------------------------------------------------------
   Ministry (admin) view: pending bookings, roster, blockouts
   --------------------------------------------------------------- */
async function loadOwnerData(){
  if(!currentProfile || currentProfile.role !== 'admin') return;
  await Promise.all([loadOwnerBookings(), loadOwnerConfirmed(), loadOwnerMembers(), loadBlockedDates()]);
}

async function rescheduleBooking(bookingId, oldSlotId, newDate, newTime, sessionType, uid){
  const newSlotId = newDate + '_' + newTime;
  if(newSlotId === oldSlotId) return;
  await runTransaction(db, async (tx) => {
    const newSlotRef = doc(db, 'slots', newSlotId);
    const newSlotSnap = await tx.get(newSlotRef);
    if(newSlotSnap.exists()) throw new Error('slot-taken');
    if(oldSlotId) tx.delete(doc(db, 'slots', oldSlotId));
    tx.set(newSlotRef, { date: newDate, time: newTime, sessionType, uid: uid || null, createdAt: serverTimestamp() });
    tx.update(doc(db, 'bookings', bookingId), { date: newDate, time: newTime, slotId: newSlotId });
  });
}

async function loadOwnerConfirmed(){
  const container = document.getElementById('ownerConfirmedList');
  if(!container) return;
  container.innerHTML = '<p style="color:#656565">Loading appointments…</p>';
  try {
    const snap = await getDocs(query(collection(db, 'bookings'), where('status', '==', 'confirmed')));
    const today = new Date().toISOString().slice(0, 10);
    const items = [];
    snap.forEach(docSnap => {
      const b = docSnap.data();
      if(b.date >= today) items.push({ id: docSnap.id, ...b });
    });
    if(items.length === 0){
      container.innerHTML = '<p style="color:#656565">No upcoming confirmed appointments.</p>';
      return;
    }
    items.sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
    container.innerHTML = items.map(b => {
      const label = b.sessionType === '30-minute' ? '30-Minute One-on-One' : '15-Minute Pop-Up';
      return '<div class="portal-request" data-booking-id="' + b.id + '" data-slot-id="' + escapeHtml(b.slotId || '') +
        '" data-uid="' + escapeHtml(b.uid || '') + '" data-session-type="' + escapeHtml(b.sessionType) + '">' +
        '<div style="flex:1;min-width:0">' +
        '<div style="display:flex;justify-content:space-between;gap:14px">' +
        '<div><strong>' + escapeHtml(b.name) + '</strong><p>' + escapeHtml(label) + ' · ' + escapeHtml(formatLocalDateTime(b.date, b.time)) +
        ' · ' + escapeHtml(b.email) + '</p></div>' +
        '<button class="portal-secondary owner-reschedule-toggle" type="button" style="min-height:32px;padding:0 10px;font-size:9px;flex:0 0 auto">Reschedule</button>' +
        '</div>' +
        '<div class="owner-reschedule-panel" hidden style="display:flex;gap:8px;align-items:flex-end;flex-wrap:wrap;margin-top:10px;padding-top:10px;border-top:1px dashed #c7c7c7">' +
        '<div class="form-field" style="flex:1;min-width:140px"><label>New date</label><input type="date" class="owner-resched-date" style="background:#fdfcfb;color:var(--black);border-color:#bfbfbf" /></div>' +
        '<div class="form-field" style="flex:1;min-width:160px"><label>New time</label><select class="owner-resched-time" disabled style="background:#fdfcfb;color:var(--black);border-color:#bfbfbf"><option value="">Choose a date first</option></select></div>' +
        '<button class="portal-secondary owner-resched-save" type="button" style="min-height:32px;padding:0 10px;font-size:9px">Save</button>' +
        '</div></div></div>';
    }).join('');
  } catch (err) {
    container.innerHTML = '<p style="color:#656565">Could not load appointments.</p>';
  }
}

document.getElementById('ownerConfirmedList').addEventListener('change', async event => {
  if(!event.target.classList.contains('owner-resched-date')) return;
  const row = event.target.closest('[data-booking-id]');
  const timeSelect = row.querySelector('.owner-resched-time');
  await populateTimeSelect(timeSelect, event.target.value, SESSION_MINUTES[row.dataset.sessionType]);
});

document.getElementById('ownerConfirmedList').addEventListener('click', async event => {
  const toggleBtn = event.target.closest('.owner-reschedule-toggle');
  const saveBtn = event.target.closest('.owner-resched-save');
  if(!toggleBtn && !saveBtn) return;
  const row = event.target.closest('[data-booking-id]');
  if(toggleBtn){
    row.querySelector('.owner-reschedule-panel').hidden = !row.querySelector('.owner-reschedule-panel').hidden;
    return;
  }
  const dateVal = row.querySelector('.owner-resched-date').value;
  const timeVal = row.querySelector('.owner-resched-time').value;
  if(!dateVal || !timeVal){ portalOwnerStatus.textContent = 'Choose a new date and time first.'; return; }
  saveBtn.disabled = true;
  try {
    await rescheduleBooking(
      row.dataset.bookingId, row.dataset.slotId, dateVal, timeVal,
      row.dataset.sessionType, row.dataset.uid || null
    );
    portalOwnerStatus.textContent = 'Appointment rescheduled.';
    loadOwnerConfirmed();
  } catch (err) {
    portalOwnerStatus.textContent = err.message === 'slot-taken' ? 'That new time is already booked.' : 'Could not reschedule.';
    saveBtn.disabled = false;
  }
});

async function loadOwnerBookings(){
  const container = document.getElementById('ownerBookingsList');
  container.innerHTML = '<p style="color:#d7d7d7">Loading booking requests…</p>';
  try {
    const snap = await getDocs(query(collection(db, 'bookings'), where('status', '==', 'pending')));
    if(snap.empty){
      container.innerHTML = '<p style="color:#d7d7d7">No pending booking requests.</p>';
      return;
    }
    const items = [];
    snap.forEach(docSnap => items.push({ id: docSnap.id, ...docSnap.data() }));
    items.sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
    container.innerHTML = items.map(b => {
      const label = b.sessionType === '30-minute' ? '30-Minute One-on-One' : '15-Minute Pop-Up';
      return '<div class="portal-request" data-booking-id="' + b.id + '" data-slot-id="' + escapeHtml(b.slotId || '') + '">' +
        '<div><strong>' + escapeHtml(b.name) + '</strong><p>' + escapeHtml(label) + ' · ' + escapeHtml(formatLocalDateTime(b.date, b.time)) +
        ' · ' + escapeHtml(b.email) + '</p></div>' +
        '<div class="portal-inline-actions">' +
        '<button class="portal-secondary owner-confirm-booking" type="button">Confirm</button>' +
        '<button class="portal-secondary owner-decline-booking" type="button">Decline</button>' +
        '</div></div>';
    }).join('');
  } catch (err) {
    container.innerHTML = '<p style="color:#d7d7d7">Could not load booking requests.</p>';
  }
}

document.getElementById('ownerBookingsList').addEventListener('click', async event => {
  const confirmBtn = event.target.closest('.owner-confirm-booking');
  const declineBtn = event.target.closest('.owner-decline-booking');
  if(!confirmBtn && !declineBtn) return;
  const row = event.target.closest('[data-booking-id]');
  const bookingId = row.dataset.bookingId;
  const slotId = row.dataset.slotId;
  event.target.disabled = true;
  try {
    if(confirmBtn){
      await updateDoc(doc(db, 'bookings', bookingId), { status: 'confirmed' });
      portalOwnerStatus.textContent = 'Booking confirmed.';
      loadOwnerConfirmed();
    } else {
      await updateDoc(doc(db, 'bookings', bookingId), { status: 'declined' });
      if(slotId) await deleteDoc(doc(db, 'slots', slotId));
      portalOwnerStatus.textContent = 'Booking declined and the time was freed up.';
    }
    loadOwnerBookings();
  } catch (err) {
    portalOwnerStatus.textContent = 'Could not update that booking.';
    event.target.disabled = false;
  }
});

/* ---------------------------------------------------------------
   Admin: block out a date
   --------------------------------------------------------------- */
const blockDateForm = document.getElementById('blockDateForm');
const blockDateInput = document.getElementById('blockDateInput');
const blockDateStatus = document.getElementById('blockDateStatus');
const blockDateSubmitBtn = document.getElementById('blockDateSubmitBtn');
blockDateInput.min = new Date().toISOString().slice(0, 10);

async function loadBlockedDates(){
  const container = document.getElementById('blockedDatesList');
  if(!container) return;
  container.innerHTML = '<p style="color:#656565">Loading blocked dates…</p>';
  try {
    const snap = await getDocs(collection(db, 'blockouts'));
    const today = new Date().toISOString().slice(0, 10);
    const dates = [];
    snap.forEach(docSnap => { if(docSnap.id >= today) dates.push(docSnap.id); });
    dates.sort();
    if(dates.length === 0){
      container.innerHTML = '<p style="color:#656565">No upcoming dates are blocked.</p>';
      return;
    }
    container.innerHTML = dates.map(d =>
      '<div class="portal-row" data-blocked-date="' + escapeHtml(d) + '"><div><strong>' + escapeHtml(d) + '</strong></div>' +
      '<button class="portal-secondary owner-unblock-date" type="button" style="min-height:32px;padding:0 10px;font-size:9px">Unblock</button></div>'
    ).join('');
  } catch (err) {
    container.innerHTML = '<p style="color:#656565">Could not load blocked dates.</p>';
  }
}

blockDateForm.addEventListener('submit', async event => {
  event.preventDefault();
  const dateStr = blockDateInput.value;
  if(!dateStr) return;
  blockDateSubmitBtn.disabled = true;
  blockDateStatus.textContent = 'Blocking…';
  try {
    await setDoc(doc(db, 'blockouts', dateStr), { date: dateStr, createdAt: serverTimestamp() });
    blockDateStatus.textContent = 'Blocked.';
    blockDateForm.reset();
    loadBlockedDates();
  } catch (err) {
    blockDateStatus.textContent = 'Could not block that date.';
  } finally {
    blockDateSubmitBtn.disabled = false;
  }
});

document.getElementById('blockedDatesList').addEventListener('click', async event => {
  const btn = event.target.closest('.owner-unblock-date');
  if(!btn) return;
  const row = event.target.closest('[data-blocked-date]');
  btn.disabled = true;
  try {
    await deleteDoc(doc(db, 'blockouts', row.dataset.blockedDate));
    loadBlockedDates();
  } catch (err) {
    blockDateStatus.textContent = 'Could not unblock that date.';
    btn.disabled = false;
  }
});

async function loadOwnerMembers(){
  const container = document.getElementById('ownerMembersList');
  container.innerHTML = '<p style="color:#656565">Loading member accounts…</p>';
  try {
    const snap = await getDocs(collection(db, 'users'));
    if(snap.empty){
      container.innerHTML = '<p style="color:#656565">No member accounts yet.</p>';
      return;
    }
    const items = [];
    snap.forEach(docSnap => items.push(docSnap.data()));
    items.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
    container.innerHTML = items.map(u =>
      '<div class="portal-row"><div><strong>' + escapeHtml(u.name || u.email) + '</strong><small>' + escapeHtml(u.email) +
      '</small></div><span class="portal-access">' + (u.role === 'admin' ? 'Admin' : 'Member') + '</span></div>'
    ).join('');
  } catch (err) {
    container.innerHTML = '<p style="color:#656565">Could not load member accounts.</p>';
  }
}

/* ---------------------------------------------------------------
   Auth state
   --------------------------------------------------------------- */
onAuthStateChanged(auth, async (user) => {
  currentUser = user;
  if(user){
    try {
      const profileSnap = await getDoc(doc(db, 'users', user.uid));
      currentProfile = profileSnap.exists() ? profileSnap.data() : { name: user.displayName || '', email: user.email, role: 'member' };
    } catch (err) {
      currentProfile = { name: user.displayName || '', email: user.email, role: 'member' };
    }
    document.getElementById('memberWelcomeName').textContent = currentProfile.name ? ', ' + currentProfile.name.split(' ')[0] : '';
    document.getElementById('memberAccountLabel').textContent = currentProfile.role === 'admin' ? 'Admin Account' : 'Student Account';
    document.getElementById('memberAccountEmail').textContent = currentProfile.email || user.email;
    const ownerEmailEl = document.getElementById('ownerAccountEmail');
    if(ownerEmailEl) ownerEmailEl.textContent = currentProfile.email || user.email;
    setAccountControlLabel(currentProfile.role === 'admin' ? 'Ministry' : 'My Account');
  } else {
    currentProfile = null;
    setAccountControlLabel('Sign In');
  }
  refreshPortalTabs();
  if(memberPortalDialog.open){
    if(currentUser && currentProfile){
      // Right after registration, createUserWithEmailAndPassword signs the
      // account in and fires this listener immediately — without this
      // guard it would yank the dialog straight to the dashboard before
      // the person ever sees the verify-by-email/text choice.
      if(!awaitingVerifyChoice) enterDashboard();
    } else {
      showAuthPanel('signin');
      showPortalView('prospect');
    }
  }
});

/* ---------------------------------------------------------------
   Scroll reveal
   --------------------------------------------------------------- */
const observer = new IntersectionObserver((entries) => {
  entries.forEach(entry => {
    if(entry.isIntersecting) entry.target.classList.add('visible');
  });
}, { threshold: .12 });

document.querySelectorAll('.reveal').forEach(el => observer.observe(el));
setTimeout(() => document.querySelector('.reveal')?.classList.add('visible'), 100);
