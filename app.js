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
  getAuth,
  createUserWithEmailAndPassword as _createUserWithEmailAndPassword,
  signInWithEmailAndPassword as _signInWithEmailAndPassword,
  onAuthStateChanged as _onAuthStateChanged,
  signOut as _signOut,
  updateProfile as _updateProfile,
  sendPasswordResetEmail as _sendPasswordResetEmail,
  sendEmailVerification as _sendEmailVerification,
  RecaptchaVerifier as _RecaptchaVerifier,
  signInWithPhoneNumber as _signInWithPhoneNumber,
  linkWithPhoneNumber as _linkWithPhoneNumber,
  reauthenticateWithCredential as _reauthenticateWithCredential,
  EmailAuthProvider, verifyBeforeUpdateEmail as _verifyBeforeUpdateEmail, unlink as _unlink
} from "https://www.gstatic.com/firebasejs/10.13.2/firebase-auth.js";
import {
  getFirestore, doc, setDoc, getDoc, collection, query, where,
  getDocs, updateDoc, deleteDoc, serverTimestamp, runTransaction
} from "https://www.gstatic.com/firebasejs/10.13.2/firebase-firestore.js";

/* ---------------------------------------------------------------
   Preview-mode safety lock. Only the real production domain may
   perform actual Firebase sign-ins or database writes. Every other
   host (the GitHub preview, localhost, etc.) runs in DEMO_MODE: the
   auth functions below are replaced with sample, in-memory-only
   equivalents so the preview site can never touch the real
   ministry's users, bookings, or Firestore data. All the real
   sign-in/booking/admin logic further down is unchanged — these
   wrappers are the only interception point, and only take effect
   off the production domain.
   --------------------------------------------------------------- */
const PRODUCTION_HOSTS = ['theunveiledassembly.com', 'www.theunveiledassembly.com'];
const DEMO_MODE = !PRODUCTION_HOSTS.includes(window.location.hostname);
// Matches the real ADMIN_EMAIL constant declared further down (used here
// only so demo sign-in can show what the admin Ministry View looks like).
const DEMO_ADMIN_EMAIL = 'contactunveiledassembly@gmail.com';

let demoAuthCallback = null;
function demoUser(overrides){
  return Object.assign({
    uid: 'demo-' + Math.random().toString(36).slice(2, 10),
    email: 'demo@example.com',
    displayName: '',
    phoneNumber: null,
    emailVerified: true,
    role: 'member',
    reload: async () => {},
  }, overrides);
}
function demoSetUser(user){
  if(demoAuthCallback) demoAuthCallback(user);
}

async function createUserWithEmailAndPassword(authArg, email, password){
  if(DEMO_MODE){
    const user = demoUser({ email, role: email.toLowerCase() === DEMO_ADMIN_EMAIL ? 'admin' : 'member' });
    demoSetUser(user);
    return { user };
  }
  return _createUserWithEmailAndPassword(authArg, email, password);
}
async function signInWithEmailAndPassword(authArg, email, password){
  if(DEMO_MODE){
    const user = demoUser({ email, displayName: 'Demo Member', role: email.toLowerCase() === DEMO_ADMIN_EMAIL ? 'admin' : 'member' });
    demoSetUser(user);
    return { user };
  }
  return _signInWithEmailAndPassword(authArg, email, password);
}
function onAuthStateChanged(authArg, callback){
  if(DEMO_MODE){
    demoAuthCallback = callback;
    callback(null);
    return () => { demoAuthCallback = null; };
  }
  return _onAuthStateChanged(authArg, callback);
}
async function signOut(authArg){
  if(DEMO_MODE){ demoSetUser(null); return; }
  return _signOut(authArg);
}
async function updateProfile(user, data){
  if(DEMO_MODE){ Object.assign(user, data); return; }
  return _updateProfile(user, data);
}
async function sendPasswordResetEmail(authArg, email){
  if(DEMO_MODE) return;
  return _sendPasswordResetEmail(authArg, email);
}
async function sendEmailVerification(user){
  if(DEMO_MODE){ if(user) user.emailVerified = true; return; }
  return _sendEmailVerification(user);
}
function RecaptchaVerifier(...args){
  if(DEMO_MODE){
    return { render: async () => 'demo-widget', clear(){}, verify: async () => 'demo-token' };
  }
  return new _RecaptchaVerifier(...args);
}
async function signInWithPhoneNumber(authArg, phone, verifier){
  if(DEMO_MODE){
    return { confirm: async (code) => {
      const user = demoUser({ phoneNumber: phone, displayName: 'Demo Member' });
      demoSetUser(user);
      return { user };
    } };
  }
  return _signInWithPhoneNumber(authArg, phone, verifier);
}
async function linkWithPhoneNumber(user, phone, verifier){
  if(DEMO_MODE){
    return { confirm: async (code) => { user.phoneNumber = phone; return { user }; } };
  }
  return _linkWithPhoneNumber(user, phone, verifier);
}
async function reauthenticateWithCredential(user, credential){
  if(DEMO_MODE) return { user };
  return _reauthenticateWithCredential(user, credential);
}
async function verifyBeforeUpdateEmail(user, newEmail){
  if(DEMO_MODE){ user.email = newEmail; return; }
  return _verifyBeforeUpdateEmail(user, newEmail);
}
async function unlink(user, providerId){
  if(DEMO_MODE){ user.phoneNumber = null; return user; }
  return _unlink(user, providerId);
}

/* ---------------------------------------------------------------
   Demo-mode sample data. Only ever read/written when DEMO_MODE is
   true — the real booking/admin/member functions below read and
   write Firestore exactly as before on the production domain, and
   fall into these in-memory-only sample lists everywhere else. None
   of this persists past a page refresh, and none of it is real.
   --------------------------------------------------------------- */
function demoNextWeekdayStr(targetDow, weeksAhead){
  const d = new Date();
  d.setDate(d.getDate() + ((targetDow + 7 - d.getDay()) % 7 || 7) + (weeksAhead || 0) * 7);
  return d.toISOString().slice(0, 10);
}
const DEMO_TUE1 = demoNextWeekdayStr(2, 0);
const DEMO_THU1 = demoNextWeekdayStr(4, 0);
const DEMO_TUE2 = demoNextWeekdayStr(2, 1);
let DEMO_BOOKING_SEQ = 1;
const DEMO_BOOKINGS = [
  { id: 'demo-1', slotId: DEMO_TUE1 + '_14:00', date: DEMO_TUE1, time: '14:00', sessionType: '30-minute', name: 'Jordan Lee', email: 'jordan@example.com', uid: null, status: 'pending' },
  { id: 'demo-2', slotId: DEMO_THU1 + '_15:00', date: DEMO_THU1, time: '15:00', sessionType: '15-minute', name: 'Amara Okafor', email: 'amara@example.com', uid: null, status: 'confirmed' },
  { id: 'demo-3', slotId: DEMO_TUE2 + '_16:00', date: DEMO_TUE2, time: '16:00', sessionType: '30-minute', name: 'Sam Rivera', email: 'sam@example.com', uid: null, status: 'confirmed' },
];
const DEMO_MEMBERS = [
  { id: 'demo-m1', name: 'Jordan Lee', email: 'jordan@example.com', role: 'member' },
  { id: 'demo-m2', name: 'Amara Okafor', email: 'amara@example.com', role: 'member' },
  { id: 'demo-m3', name: 'Sam Rivera', email: 'sam@example.com', role: 'member' },
];
const DEMO_BLOCKED_DATES = [demoNextWeekdayStr(4, 2)];
// Temporary slot holds (Phase 6) — in demo mode these just live in this
// array; in real mode the equivalent lives in the bookingHolds collection.
let DEMO_HOLDS = [];

/* ---------------------------------------------------------------
   Teaching Manager sample data. Same shape as the real `teachings`
   collection's public-safe fields (no Zoom info ever lives here or
   in the real public collection — see loadTeachingPageConfig below).
   --------------------------------------------------------------- */
function demoTeachingDefaults(){
  return {
    subtitle: '', shortDescription: '', fullDescription: '', whatYouWillLearn: [],
    instructor: 'The Unveiled Assembly', category: '', endTime: null,
    timeZone: 'America/New_York', isFree: false, capacity: null, unlimitedCapacity: true,
    format: 'zoom', location: null, featured: false, archived: false,
    artwork: { hero: '', heroMobile: '', card: '', focalX: 50, focalY: 50, zoom: 100, overlayStrength: 45 }
  };
}
const DEMO_TEACHINGS = {
  'demo-discernment': { id: 'demo-discernment', ...demoTeachingDefaults(),
    title: 'Discernment', subtitle: 'The Ability to See Clearly', category: 'Discernment',
    shortDescription: 'A deep dive into spiritual discernment — what it is, how to recognize it, and how to sharpen it in a world full of confusion.',
    fullDescription: 'A deep dive into spiritual discernment — what it is, how to recognize it, and how to sharpen it in a world full of confusion.',
    whatYouWillLearn: ['What spiritual discernment is', 'Types of discernment', 'How to recognize what you are perceiving', 'Biblical examples', 'Discernment vs. assumption', 'Practical exercises'],
    date: demoNextWeekdayStr(4, 0), startTime: '19:30', price: 25, capacity: 50, unlimitedCapacity: false,
    status: 'registration-open', featured: true },
  'demo-prophetic': { id: 'demo-prophetic', ...demoTeachingDefaults(),
    title: 'The Prophetic', subtitle: 'Developing Prophetic Sensitivity', category: 'Prophetic',
    shortDescription: 'Understanding the prophetic gift and how to grow in spiritual sensitivity and maturity.',
    fullDescription: 'Understanding the prophetic gift and how to grow in spiritual sensitivity and maturity.',
    whatYouWillLearn: ['What the prophetic gift is', 'How prophetic sensitivity develops', 'Testing and confirming what you sense'],
    date: demoNextWeekdayStr(4, 1), startTime: '19:30', price: 25,
    status: 'published' },
  'demo-voice': { id: 'demo-voice', ...demoTeachingDefaults(),
    title: 'Hearing the Voice of God', subtitle: 'Recognizing How He Speaks', category: 'Hearing the Voice of God',
    shortDescription: 'Learning to recognize and respond to the voice of God in everyday life.',
    fullDescription: 'Learning to recognize and respond to the voice of God in everyday life.',
    date: demoNextWeekdayStr(4, 2), startTime: '19:30', price: 25,
    status: 'draft' },
  'demo-warfare': { id: 'demo-warfare', ...demoTeachingDefaults(),
    title: 'Spiritual Warfare', subtitle: 'Understanding The Invisible', category: 'Spiritual Warfare',
    shortDescription: 'A grounded look at spiritual warfare — what Scripture actually says, and how to stand without fear.',
    fullDescription: 'A grounded look at spiritual warfare — what Scripture actually says, and how to stand without fear.',
    date: demoNextWeekdayStr(4, 3), startTime: '19:30', price: 25,
    status: 'published' },
  'demo-identity': { id: 'demo-identity', ...demoTeachingDefaults(),
    title: 'Identity in Christ', subtitle: 'Know Who You Are', category: 'Identity',
    shortDescription: 'Rooting your sense of self in who God says you are, not in performance or circumstance.',
    fullDescription: 'Rooting your sense of self in who God says you are, not in performance or circumstance.',
    date: demoNextWeekdayStr(4, 4), startTime: '19:30', price: 25,
    status: 'published' },
};
let DEMO_TEACHING_ZOOM = {
  'demo-discernment': { zoomUrl: 'https://zoom.us/j/demo', meetingId: '000 000 0000', passcode: 'demo' }
};
let DEMO_TEACHING_REGISTRATIONS = [];
let DEMO_TEACHING_REG_SEQ = 1;
let DEMO_TEACHING_SEQ = 1;

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
        <button class="nav-book-btn book-session" type="button" data-service="" aria-label="Book a session">Book A Session</button>
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

// Account Settings block — identical markup used inside both the member
// and admin dashboards (they coexist in the DOM, just one hidden at a
// time), so every id is prefixed to stay unique. wireAccountSettings(p)
// below attaches the exact same JS logic to whichever prefix is used,
// so this isn't duplicated in two places.
function accountSettingsHtml(p){
  return `
        <article class="portal-panel" ${p === 'owner' ? 'data-owner-section="settings"' : ''}>
          <span class="portal-label">Account Settings</span>
          <div class="settings-row">
            <div class="settings-row-main">
              <strong>Email</strong>
              <small id="${p}AccountEmail">—</small>
            </div>
            <span class="verify-badge" id="${p}EmailBadge">Not Verified</span>
          </div>
          <button class="link-btn" type="button" id="${p}ChangeEmailBtn">Change Email</button>
          <div class="settings-subform" id="${p}ChangeEmailForm" hidden>
            <div class="portal-field">
              <label for="${p}ReauthPassword">Confirm your current password</label>
              <div class="password-field">
                <input id="${p}ReauthPassword" type="password" autocomplete="current-password" />
                <button type="button" class="password-toggle" data-toggle-for="${p}ReauthPassword" aria-label="Show password">${EYE_ICON}</button>
              </div>
            </div>
            <div class="portal-field">
              <label for="${p}NewEmail">New email address</label>
              <input id="${p}NewEmail" type="email" autocomplete="email" />
            </div>
            <button class="portal-primary" type="button" id="${p}SubmitChangeEmailBtn">Send Verification To New Email</button>
          </div>

          <div class="settings-row" style="margin-top:18px">
            <div class="settings-row-main">
              <strong>Phone</strong>
              <small id="${p}AccountPhone">Not added</small>
            </div>
            <span class="verify-badge" id="${p}PhoneBadge">Not Verified</span>
          </div>
          <button class="link-btn" type="button" id="${p}ChangePhoneBtn">Add / Change Phone</button>
          <div class="settings-subform" id="${p}ChangePhoneForm" hidden>
            <div class="portal-field phone-field">
              <label for="${p}NewPhoneNumber">New phone number</label>
              <div class="phone-input-row">
                <select id="${p}NewPhoneCountry" aria-label="Country code">${COUNTRY_OPTIONS}</select>
                <input id="${p}NewPhoneNumber" type="tel" placeholder="Phone number" autocomplete="tel-national" />
              </div>
            </div>
            <button class="portal-primary" type="button" id="${p}SendPhoneCodeBtn">Send Verification Code</button>
            <div id="${p}PhoneCodeStep" hidden>
              <div class="portal-field">
                <label for="${p}PhoneCode">6-digit code</label>
                <input id="${p}PhoneCode" type="text" inputmode="numeric" pattern="[0-9]*" maxlength="6" autocomplete="one-time-code" />
              </div>
              <button class="portal-primary" type="button" id="${p}ConfirmPhoneCodeBtn">Confirm Code</button>
            </div>
            <div id="recaptcha-container-${p}settings"></div>
          </div>

          <div class="portal-status" id="${p}SettingsStatus" role="status" aria-live="polite"></div>
          <button class="portal-secondary" type="button" id="${p}SignOut" style="margin-top:16px">Sign Out</button>
        </article>`;
}

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
            <!-- Step 1: phone (mandatory, blocking — shown first) -->
            <div data-verify-step="phone">
              <h4>Verify your phone number</h4>
              <p class="auth-panel-intro">We sent a 6-digit code to <strong id="verifyPhoneNumberLabel"></strong>. Enter it below to continue.</p>
              <div class="portal-field">
                <label for="verifyPhoneCode">6-digit code</label>
                <input id="verifyPhoneCode" type="text" inputmode="numeric" pattern="[0-9]*" maxlength="6" autocomplete="one-time-code" />
              </div>
              <div class="portal-actions">
                <button class="portal-primary" type="button" id="confirmVerifyPhoneBtn">Verify Code</button>
              </div>
              <div class="verify-panel-links">
                <button type="button" class="link-btn" id="resendVerifyPhoneBtn">Resend Code</button>
                <button type="button" class="link-btn" id="changePhoneBtn">Wrong number? Change it</button>
              </div>
              <div id="changePhoneStep" hidden>
                <div class="portal-field phone-field">
                  <label for="changePhoneNumber">New phone number</label>
                  <div class="phone-input-row">
                    <select id="changePhoneCountry" aria-label="Country code">${COUNTRY_OPTIONS}</select>
                    <input id="changePhoneNumber" type="tel" placeholder="Phone number" autocomplete="tel-national" />
                  </div>
                </div>
                <button class="portal-primary" type="button" id="sendToNewPhoneBtn">Send Code To This Number</button>
              </div>
              <div id="recaptcha-container-verify"></div>
            </div>

            <!-- Step 2: email (shown once phone is verified) -->
            <div data-verify-step="email" hidden>
              <h4>Check your email</h4>
              <p class="auth-panel-intro">We sent a verification link to <strong id="verifyEmailLabel"></strong>. Click it, then continue below — your current email stays active until then.</p>
              <div class="portal-actions">
                <button class="portal-primary" type="button" id="checkEmailVerifiedBtn">I've Verified — Continue</button>
              </div>
              <div class="verify-panel-links">
                <button type="button" class="link-btn" id="resendVerifyEmailBtn">Resend Verification Email</button>
                <button type="button" class="link-btn" id="changeEmailInVerifyBtn">Wrong email? Change it</button>
              </div>
              <div id="changeEmailInVerifyStep" hidden>
                <div class="portal-field">
                  <label for="changeEmailNewAddress">New email address</label>
                  <input id="changeEmailNewAddress" type="email" placeholder="you@example.com" autocomplete="email" />
                </div>
                <button class="portal-primary" type="button" id="sendToNewEmailBtn">Send Verification To This Address</button>
              </div>
            </div>

            <div class="portal-status" id="verifyStatus" role="status" aria-live="polite"></div>
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
        ${accountSettingsHtml('member')}
      </div>
      <div class="portal-status" id="portalMemberStatus" role="status" aria-live="polite"></div>
    </div>

    <div class="portal-view" data-portal-view="owner" hidden>
      <div class="portal-head">
        <div>
          <div class="kicker on-light">My Assembly Administration</div>
          <h3>Ministry Portal</h3>
          <p id="ownerSectionDescription">Everything you need to run the website, in one place.</p>
        </div>
        <span class="portal-account">Private Owner View</span>
      </div>
      <div class="owner-shell">
        <button type="button" class="owner-sidebar-toggle" id="ownerSidebarToggle">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" style="width:16px;height:16px"><path d="M3 6h18M3 12h18M3 18h18"/></svg>
          Menu
        </button>
        <div class="owner-sidebar-backdrop" id="ownerSidebarBackdrop"></div>
        <nav class="owner-sidebar" id="ownerSidebar">
          <button type="button" class="owner-sidebar-item active" data-owner-nav="dashboard">
            <svg viewBox="0 0 24 24" stroke-width="1.8"><rect x="3" y="3" width="7" height="9" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="12" width="7" height="9" rx="1.5"/><rect x="3" y="16" width="7" height="5" rx="1.5"/></svg>
            Dashboard
          </button>
          <button type="button" class="owner-sidebar-item" data-owner-nav="teachings">
            <svg viewBox="0 0 24 24" stroke-width="1.8"><path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v15H6.5A2.5 2.5 0 0 0 4 20.5z"/><path d="M20 18H6.5A2.5 2.5 0 0 0 4 20.5"/></svg>
            Teachings
          </button>
          <button type="button" class="owner-sidebar-item" data-owner-nav="bookings">
            <svg viewBox="0 0 24 24" stroke-width="1.8"><rect x="3" y="4.5" width="18" height="16" rx="2"/><path d="M3 9.5h18M8 3v3M16 3v3"/></svg>
            Bookings
          </button>
          <button type="button" class="owner-sidebar-item" data-owner-nav="people">
            <svg viewBox="0 0 24 24" stroke-width="1.8"><circle cx="9" cy="8" r="3.2"/><path d="M2.5 20c0-3.6 2.9-6 6.5-6s6.5 2.4 6.5 6"/><path d="M16 4.2c1.7.4 3 2 3 3.8s-1.3 3.4-3 3.8M21.5 20c0-3-2-5.2-5-5.8"/></svg>
            People
          </button>
          <button type="button" class="owner-sidebar-item" data-owner-nav="payments">
            <svg viewBox="0 0 24 24" stroke-width="1.8"><rect x="2.5" y="5.5" width="19" height="13" rx="2"/><path d="M2.5 10h19"/></svg>
            Payments
          </button>
          <button type="button" class="owner-sidebar-item" data-owner-nav="media">
            <svg viewBox="0 0 24 24" stroke-width="1.8"><rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="8.5" cy="9.5" r="1.7"/><path d="M21 16l-5.5-5.5a1.5 1.5 0 0 0-2 0L4 20"/></svg>
            Media
          </button>
          <button type="button" class="owner-sidebar-item" data-owner-nav="website">
            <svg viewBox="0 0 24 24" stroke-width="1.8"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.5 2.6 3.8 5.7 3.8 9s-1.3 6.4-3.8 9c-2.5-2.6-3.8-5.7-3.8-9S9.5 5.6 12 3z"/></svg>
            Website
          </button>
          <button type="button" class="owner-sidebar-item" data-owner-nav="settings">
            <svg viewBox="0 0 24 24" stroke-width="1.8"><circle cx="12" cy="12" r="3.2"/><path d="M19.4 13.5a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.7 1.7 0 0 0-1.87-.34 1.7 1.7 0 0 0-1.04 1.56V19.5a2 2 0 1 1-4 0v-.09a1.7 1.7 0 0 0-1.11-1.56 1.7 1.7 0 0 0-1.87.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.7 1.7 0 0 0 .34-1.87 1.7 1.7 0 0 0-1.56-1.04H4.5a2 2 0 1 1 0-4h.09a1.7 1.7 0 0 0 1.56-1.11 1.7 1.7 0 0 0-.34-1.87l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.7 1.7 0 0 0 1.87.34H10.5a1.7 1.7 0 0 0 1.04-1.56V4.5a2 2 0 1 1 4 0v.09a1.7 1.7 0 0 0 1.04 1.56 1.7 1.7 0 0 0 1.87-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.7 1.7 0 0 0-.34 1.87v.09a1.7 1.7 0 0 0 1.56 1.04H19.5a2 2 0 1 1 0 4h-.09a1.7 1.7 0 0 0-1.56 1.04z"/></svg>
            Settings
          </button>
          <div class="owner-sidebar-profile">
            <div class="owner-sidebar-avatar" id="ownerSidebarAvatar">?</div>
            <div class="owner-sidebar-profile-text">
              <strong id="ownerSidebarName">Signed in</strong>
              <span>Owner</span>
            </div>
          </div>
        </nav>
        <div class="owner-content">
      <div class="portal-owner-grid">
        <article class="portal-panel" style="grid-column:1/-1" data-owner-section="dashboard">
          <h3 style="font-family:var(--serif);font-size:26px;font-weight:600;color:var(--owner-text);margin:0 0 4px" id="ownerDashboardWelcome">Welcome back.</h3>
          <p class="admin-panel-intro" style="margin-bottom:18px">Here's what's happening with your ministry.</p>
          <div class="admin-stat-row" id="ownerDashboardStats"></div>
          <div style="display:grid;grid-template-columns:1.3fr 1fr;gap:20px;margin-top:22px" class="owner-dashboard-lower">
            <div>
              <div class="admin-subsection-label" style="border-top:0;padding-top:0">Recent Activity</div>
              <div id="ownerRecentActivity"></div>
            </div>
            <div>
              <div class="admin-subsection-label" style="border-top:0;padding-top:0">Quick Actions</div>
              <div style="display:flex;flex-direction:column;gap:8px" id="ownerQuickActions">
                <button type="button" class="admin-btn-ghost" data-quick-action="new-teaching" style="text-align:left">+ Create A Teaching Class</button>
                <button type="button" class="admin-btn-ghost" data-quick-action="media" style="text-align:left">Upload Media</button>
                <button type="button" class="admin-btn-ghost" data-quick-action="bookings" style="text-align:left">Manage Bookings</button>
                <button type="button" class="admin-btn-ghost" data-quick-action="registrants" style="text-align:left">View Registrations</button>
                <button type="button" class="admin-btn-ghost" data-quick-action="website" style="text-align:left">Edit Website</button>
              </div>
            </div>
          </div>
        </article>
        <article class="portal-panel" style="grid-column:1/-1" data-owner-section="website">
          <span class="portal-label">Website Pages <span class="demo-badge">Not Yet Connected</span></span>
          <p class="admin-panel-intro">Click a page to see what will be editable here. Nothing below is live yet — the words and images on these pages still need a developer change until this is wired up. Ask for this to be connected whenever you're ready to start editing pages yourself.</p>
          <div id="ownerWebsitePagesList" class="admin-website-pages"></div>
        </article>
        <article class="portal-panel" style="grid-column:1/-1" data-owner-section="payments">
          <span class="portal-label">Payments</span>
          <p class="admin-panel-intro">Every payment collected through the website will appear here, in one place.</p>
          <div class="admin-tabs" id="ownerPaymentsTabs" role="tablist" style="margin:16px 0">
            <button type="button" class="admin-tab active" data-payments-tab="all">Overview</button>
            <button type="button" class="admin-tab" data-payments-tab="teaching">Teaching Payments</button>
            <button type="button" class="admin-tab" data-payments-tab="oneonone">1:1 Payments</button>
            <button type="button" class="admin-tab" data-payments-tab="shop">Shop Orders</button>
            <button type="button" class="admin-tab" data-payments-tab="donation">Donations</button>
            <button type="button" class="admin-tab" data-payments-tab="refund">Refunds</button>
          </div>
          <div class="admin-payments-empty">
            <strong>Payments Not Connected</strong>
            <p>There's no real payment processor connected to the website yet, so there's no transaction history to show. Once one is connected, every teaching payment, one-on-one booking payment, shop order, donation, and refund will show up here automatically — with totals for this month, this year, and by category.</p>
          </div>
        </article>
        <article class="portal-panel" style="grid-column:1/-1" data-owner-section="media">
          <span class="portal-label">Media</span>
          <p class="admin-panel-intro">Every image currently uploaded to a teaching, gathered in one place. Images are added and replaced from Teachings → open a class → Images — this is where you can see everything at a glance.</p>
          <div id="ownerMediaGallery" class="admin-media-gallery"></div>
        </article>
        <article class="portal-panel wine" data-owner-section="bookings">
          <span class="portal-label">Pending Booking Requests</span>
          <div id="ownerBookingsList"><p style="color:#d7d7d7">Loading booking requests…</p></div>
        </article>
        <article class="portal-panel" data-owner-section="bookings">
          <span class="portal-label">Confirmed Upcoming Appointments</span>
          <div id="ownerConfirmedList"><p style="color:#656565">Loading appointments…</p></div>
        </article>
        <article class="portal-panel" data-owner-section="bookings">
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
        <article class="portal-panel" data-owner-section="bookings">
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
                </select>
              </div>
              <div class="form-field">
                <label for="adminBookDate">Date</label>
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
        <article class="portal-panel" style="grid-column:1/-1" data-owner-section="bookings">
          <span class="portal-label">Scheduling Settings</span>
          <p style="color:#656565;margin-bottom:14px">Controls what visitors see on the booking form — time zone, whether booking is open, the services offered, and when sessions can be requested. On the preview site this only edits sample data; on the live site it's real and applies immediately.</p>
          <div style="display:flex;gap:24px;flex-wrap:wrap;align-items:flex-end;margin-bottom:16px">
            <div class="form-field" style="min-width:260px">
              <label for="schedTimezone">Ministry time zone</label>
              <select id="schedTimezone" style="background:#fdfcfb;color:var(--black);border-color:#bfbfbf">
                <option value="America/New_York">Eastern (America/New_York)</option>
                <option value="America/Chicago">Central (America/Chicago)</option>
                <option value="America/Denver">Mountain (America/Denver)</option>
                <option value="America/Los_Angeles">Pacific (America/Los_Angeles)</option>
                <option value="America/Anchorage">Alaska (America/Anchorage)</option>
                <option value="Pacific/Honolulu">Hawaii (Pacific/Honolulu)</option>
              </select>
            </div>
            <div class="form-field" style="flex:0 0 150px"><label for="schedMaxPerDay">Max bookings/day</label><input id="schedMaxPerDay" type="number" min="0" placeholder="No limit" style="background:#fdfcfb;color:var(--black);border-color:#bfbfbf" /></div>
            <div class="form-field" style="flex:0 0 150px"><label for="schedMinNotice">Min notice (hours)</label><input id="schedMinNotice" type="number" min="0" placeholder="None" style="background:#fdfcfb;color:var(--black);border-color:#bfbfbf" /></div>
            <div class="form-field" style="flex:0 0 150px"><label for="schedMaxAdvance">Max advance (days)</label><input id="schedMaxAdvance" type="number" min="0" placeholder="No limit" style="background:#fdfcfb;color:var(--black);border-color:#bfbfbf" /></div>
            <label style="display:flex;align-items:center;gap:8px;color:#3a3a3a;font-size:13px;padding-bottom:8px">
              <input id="schedBookingPaused" type="checkbox" style="accent-color:var(--black)" />
              Pause all new booking requests
            </label>
            <button class="portal-secondary" type="button" id="schedSettingsSaveBtn">Save Settings</button>
          </div>
          <div class="form-status" id="schedSettingsStatus" style="color:#6d6d6d;margin-bottom:20px"></div>

          <div style="border-top:1px dashed #c7c7c7;padding-top:16px;margin-bottom:20px">
            <strong style="display:block;margin-bottom:10px;font-size:13px;letter-spacing:.04em">Session Types</strong>
            <div id="schedTypesList" style="margin-bottom:14px"></div>
            <form id="schedTypeForm" style="display:flex;gap:8px;align-items:flex-end;flex-wrap:wrap">
              <div class="form-field" style="flex:1;min-width:130px"><label for="schedTypeId">ID</label><input id="schedTypeId" type="text" placeholder="e.g. 30-minute" required style="background:#fdfcfb;color:var(--black);border-color:#bfbfbf" /></div>
              <div class="form-field" style="flex:1;min-width:170px"><label for="schedTypeName">Display name</label><input id="schedTypeName" type="text" required style="background:#fdfcfb;color:var(--black);border-color:#bfbfbf" /></div>
              <div class="form-field" style="flex:0 0 100px"><label for="schedTypeDuration">Minutes</label><input id="schedTypeDuration" type="number" min="5" step="5" required style="background:#fdfcfb;color:var(--black);border-color:#bfbfbf" /></div>
              <div class="form-field" style="flex:0 0 120px"><label for="schedTypePrice">Price</label><input id="schedTypePrice" type="number" min="0" step="0.01" placeholder="No charge" style="background:#fdfcfb;color:var(--black);border-color:#bfbfbf" /></div>
              <div class="form-field" style="flex:0 0 110px"><label for="schedTypeBufferBefore">Buffer before</label><input id="schedTypeBufferBefore" type="number" min="0" step="5" placeholder="0 min" style="background:#fdfcfb;color:var(--black);border-color:#bfbfbf" /></div>
              <div class="form-field" style="flex:0 0 110px"><label for="schedTypeBufferAfter">Buffer after</label><input id="schedTypeBufferAfter" type="number" min="0" step="5" placeholder="0 min" style="background:#fdfcfb;color:var(--black);border-color:#bfbfbf" /></div>
              <div class="form-field" style="flex:1;min-width:200px"><label for="schedTypeDescription">Description</label><input id="schedTypeDescription" type="text" style="background:#fdfcfb;color:var(--black);border-color:#bfbfbf" /></div>
              <button class="portal-secondary" type="submit">Add / Update Type</button>
            </form>
            <div class="form-status" id="schedTypeStatus" style="color:#6d6d6d;margin-top:8px"></div>
            <p style="color:#8a8a8a;font-size:11px;margin-top:8px">Using an existing ID updates that type instead of creating a new one. Prices, descriptions, and policies here are placeholders until you provide the real Calendly information.</p>
          </div>

          <div style="border-top:1px dashed #c7c7c7;padding-top:16px;margin-bottom:20px">
            <strong style="display:block;margin-bottom:10px;font-size:13px;letter-spacing:.04em">Weekly Availability Windows</strong>
            <div id="schedRulesList" style="margin-bottom:14px"></div>
            <form id="schedRuleForm" style="display:flex;gap:8px;align-items:flex-end;flex-wrap:wrap">
              <div class="form-field" style="flex:1;min-width:130px">
                <label for="schedRuleDay">Day</label>
                <select id="schedRuleDay" style="background:#fdfcfb;color:var(--black);border-color:#bfbfbf">
                  <option value="0">Sunday</option><option value="1">Monday</option><option value="2" selected>Tuesday</option>
                  <option value="3">Wednesday</option><option value="4">Thursday</option><option value="5">Friday</option><option value="6">Saturday</option>
                </select>
              </div>
              <div class="form-field" style="flex:0 0 120px"><label for="schedRuleStart">Start</label><input id="schedRuleStart" type="time" required style="background:#fdfcfb;color:var(--black);border-color:#bfbfbf" /></div>
              <div class="form-field" style="flex:0 0 120px"><label for="schedRuleEnd">End</label><input id="schedRuleEnd" type="time" required style="background:#fdfcfb;color:var(--black);border-color:#bfbfbf" /></div>
              <div class="form-field" style="flex:0 0 110px"><label for="schedRuleCapacity">Capacity</label><input id="schedRuleCapacity" type="number" min="1" value="1" style="background:#fdfcfb;color:var(--black);border-color:#bfbfbf" /></div>
              <button class="portal-secondary" type="submit">Add Window</button>
            </form>
            <div class="form-status" id="schedRuleStatus" style="color:#6d6d6d;margin-top:8px"></div>
            <p style="color:#8a8a8a;font-size:11px;margin-top:8px">A new window applies to all session types, with the capacity you set (how many people can book the same exact time). Remove and re-add a window to change it.</p>
          </div>

          <div style="border-top:1px dashed #c7c7c7;padding-top:16px;margin-bottom:20px">
            <strong style="display:block;margin-bottom:10px;font-size:13px;letter-spacing:.04em">Block A Date Range</strong>
            <p style="color:#656565;margin-bottom:12px">For vacations, holidays, or multi-day closures. Single individual dates can still be blocked from the "Block A Date" panel above.</p>
            <div id="schedRangesList" style="margin-bottom:14px"></div>
            <form id="schedRangeForm" style="display:flex;gap:8px;align-items:flex-end;flex-wrap:wrap">
              <div class="form-field" style="flex:1;min-width:150px"><label for="schedRangeStart">Start date</label><input id="schedRangeStart" type="date" required style="background:#fdfcfb;color:var(--black);border-color:#bfbfbf" /></div>
              <div class="form-field" style="flex:1;min-width:150px"><label for="schedRangeEnd">End date</label><input id="schedRangeEnd" type="date" required style="background:#fdfcfb;color:var(--black);border-color:#bfbfbf" /></div>
              <div class="form-field" style="flex:1;min-width:160px"><label for="schedRangeReason">Reason (optional)</label><input id="schedRangeReason" type="text" placeholder="e.g. Vacation" style="background:#fdfcfb;color:var(--black);border-color:#bfbfbf" /></div>
              <button class="portal-secondary" type="submit">Block Range</button>
            </form>
            <div class="form-status" id="schedRangeStatus" style="color:#6d6d6d;margin-top:8px"></div>
          </div>

          <div style="border-top:1px dashed #c7c7c7;padding-top:16px">
            <strong style="display:block;margin-bottom:10px;font-size:13px;letter-spacing:.04em">Special Availability For A Specific Date</strong>
            <p style="color:#656565;margin-bottom:12px">Overrides the normal weekly windows for just one date — extra hours, reduced hours, or fully closed that day.</p>
            <div id="schedOverridesList" style="margin-bottom:14px"></div>
            <form id="schedOverrideForm" style="display:flex;gap:8px;align-items:flex-end;flex-wrap:wrap">
              <div class="form-field" style="flex:1;min-width:150px"><label for="schedOverrideDate">Date</label><input id="schedOverrideDate" type="date" required style="background:#fdfcfb;color:var(--black);border-color:#bfbfbf" /></div>
              <div class="form-field" style="flex:0 0 120px"><label for="schedOverrideStart">Start</label><input id="schedOverrideStart" type="time" style="background:#fdfcfb;color:var(--black);border-color:#bfbfbf" /></div>
              <div class="form-field" style="flex:0 0 120px"><label for="schedOverrideEnd">End</label><input id="schedOverrideEnd" type="time" style="background:#fdfcfb;color:var(--black);border-color:#bfbfbf" /></div>
              <label style="display:flex;align-items:center;gap:6px;font-size:12px;color:#3a3a3a;padding-bottom:8px">
                <input id="schedOverrideClosed" type="checkbox" style="accent-color:var(--black)" /> Fully closed this date
              </label>
              <button class="portal-secondary" type="submit">Save Override</button>
            </form>
            <div class="form-status" id="schedOverrideStatus" style="color:#6d6d6d;margin-top:8px"></div>
            <p style="color:#8a8a8a;font-size:11px;margin-top:8px">Leave start/end blank and check "Fully closed" to close a date entirely; otherwise set a start and end to replace that date's normal hours.</p>
          </div>
        </article>
        <article class="portal-panel" data-owner-section="dashboard">
          <span class="portal-label">Notification Center <span class="demo-badge">Visual Demonstration — Not Yet Connected</span></span>
          <p style="color:#656565;margin-bottom:14px">A preview of what admin alerts will look like once real email/SMS notifications are connected. These are sample entries, not live activity.</p>
          <div id="ownerNotificationsList"></div>
        </article>
        <article class="portal-panel" data-owner-section="people">
          <span class="portal-label">Member Accounts</span>
          <div id="ownerMembersList"><p style="color:#656565">Loading member accounts…</p></div>
        </article>
        <article class="portal-panel admin-panel" style="grid-column:1/-1" data-owner-section="teachings">
          <div class="admin-panel-head">
            <div>
              <span class="portal-label">Teaching Manager</span>
              <p class="admin-panel-intro">Create and run the weekly Teaching classes — the public Teaching page updates automatically from what's here.</p>
            </div>
            <div class="admin-panel-head-actions">
              <button class="admin-btn-ghost" type="button" id="teachingMgrPreviewPageBtn">Preview Page ↗</button>
              <button class="admin-btn-ghost" type="button" id="teachingMgrResetPreviewBtn">Reset Preview Data</button>
            </div>
          </div>
          <div id="teachingMgrModeNotice" class="admin-mode-notice"></div>
          <div class="admin-stat-row" id="teachingMgrOverview"></div>
          <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px;margin-bottom:14px">
            <div class="admin-tabs" id="teachingMgrTabs" role="tablist">
              <button type="button" class="admin-tab active" data-teaching-tab="upcoming">Upcoming</button>
              <button type="button" class="admin-tab" data-teaching-tab="drafts">Drafts</button>
              <button type="button" class="admin-tab" data-teaching-tab="completed">Completed</button>
              <button type="button" class="admin-tab" data-teaching-tab="cancelled">Cancelled</button>
              <button type="button" class="admin-tab" data-teaching-tab="all">All</button>
            </div>
            <div style="display:flex;gap:8px">
              <button class="admin-btn-ghost" type="button" id="teachingMgrViewList">List</button>
              <button class="admin-btn-ghost" type="button" id="teachingMgrViewCalendar">Calendar</button>
              <button class="admin-btn-solid" type="button" id="teachingMgrNewBtn">+ New Teaching</button>
            </div>
          </div>
          <div id="teachingMgrList"></div>
          <div id="teachingMgrCalendar" hidden></div>

          <div style="border-top:1px solid var(--owner-border);padding-top:20px;margin-top:24px">
            <span class="portal-label">Teaching Page Settings</span>
            <p class="admin-panel-intro" style="margin-bottom:10px">Controls what visitors see on the public Teaching page.</p>

            <div class="admin-subsection-label" style="border-top:0;padding-top:0">Featured Teaching</div>
            <p class="admin-hint" style="margin-bottom:12px">Choose which class appears in the large section at the top of the Teaching page.</p>
            <div style="display:flex;gap:20px;flex-wrap:wrap;align-items:center;margin-bottom:18px">
              <div class="form-field" style="min-width:240px">
                <label for="teachingSettingsFeatured">Select Teaching</label>
                <select id="teachingSettingsFeatured" style="background:var(--owner-surface);color:var(--owner-text);border-color:var(--owner-border-strong);border-radius:var(--owner-radius-sm)"></select>
              </div>
              <div class="admin-teaching-row" id="teachingSettingsFeaturedPreview" style="flex:1;min-width:220px;margin-bottom:0"></div>
            </div>

            <div class="admin-subsection-label">Upcoming Classes</div>
            <div style="display:flex;gap:20px;flex-wrap:wrap;align-items:flex-end;margin-bottom:8px">
              <label class="admin-checkbox-field" style="padding-top:0"><input id="teachingSettingsShowUpcoming" type="checkbox" /> Show Upcoming Classes</label>
              <div class="form-field" style="flex:0 0 220px">
                <label for="teachingSettingsUpcomingCount">Number Of Upcoming Classes To Show</label>
                <select id="teachingSettingsUpcomingCount" style="background:var(--owner-surface);color:var(--owner-text);border-color:var(--owner-border-strong);border-radius:var(--owner-radius-sm)">
                  <option value="3">3</option><option value="6">6</option><option value="9">9</option>
                </select>
              </div>
              <div class="form-field" style="flex:0 0 170px">
                <label for="teachingSettingsDefaultTime">Default Class Time</label>
                <input id="teachingSettingsDefaultTime" type="time" style="background:var(--owner-surface);color:var(--owner-text);border-color:var(--owner-border-strong);border-radius:var(--owner-radius-sm)" />
              </div>
            </div>
            <p class="admin-hint" style="margin-bottom:20px">Turn this off to hide future classes from the public page. Choose 6 to show the next six scheduled classes. Times are scheduled in Eastern Time.</p>

            <div class="admin-subsection-label">Scripture Section</div>
            <label class="admin-checkbox-field" style="padding-top:0;margin-bottom:8px"><input id="teachingSettingsShowScripture" type="checkbox" /> Show Scripture Section</label>
            <p class="admin-hint" style="margin-bottom:14px">Show or hide the Scripture/Foundation section near the bottom of the Teaching page.</p>
            <div class="booking-grid" style="margin-bottom:14px">
              <div class="booking-field full"><label for="teachingSettingsScriptureText">Scripture Text</label><textarea id="teachingSettingsScriptureText" rows="2"></textarea></div>
              <div class="booking-field"><label for="teachingSettingsScriptureRef">Scripture Reference</label><input id="teachingSettingsScriptureRef" type="text" placeholder="e.g. 1 Corinthians 2:14" /></div>
            </div>
            <div class="admin-image-field" data-image-field="scripture" style="max-width:340px;margin-bottom:20px">
              <span class="admin-microlabel">Scripture Image <span class="admin-hint">(optional)</span></span>
              <div class="admin-image-preview" id="teachingSettingsScriptureImagePreview"></div>
              <div class="admin-image-actions">
                <label class="admin-image-upload-btn">Upload Image<input type="file" accept="image/*" id="teachingSettingsScriptureImageFile" hidden /></label>
                <button type="button" class="admin-image-remove-btn" id="teachingSettingsScriptureImageRemove">Remove</button>
              </div>
              <details class="admin-image-advanced"><summary>Advanced: paste an image URL instead</summary><input id="teachingSettingsScriptureImage" type="url" /></details>
            </div>

            <div class="admin-subsection-label">Stay Connected</div>
            <label class="admin-checkbox-field" style="padding-top:0;margin-bottom:20px"><input id="teachingSettingsShowNewsletter" type="checkbox" /> Show Stay Connected</label>
            <p class="admin-hint" style="margin-top:-14px;margin-bottom:20px">Show or hide the email signup section at the bottom of the Teaching page.</p>

            <div class="admin-subsection-label">Teaching Library</div>
            <label class="admin-checkbox-field" style="padding-top:0"><input id="teachingSettingsShowLibrary" type="checkbox" /> Show Teaching Library</label>
            <p class="admin-hint" style="margin-bottom:8px">Keep this off until you have class videos to show — the page stays completely hidden from visitors while it's off, not shown as "coming soon."</p>
            <label class="admin-checkbox-field" style="padding-top:0;margin-bottom:20px"><input id="teachingSettingsAutoArchive" type="checkbox" /> Automatically Archive Completed Classes</label>

            <button class="admin-btn-solid" type="button" id="teachingSettingsSaveBtn">Save Changes</button>
            <div class="form-status" id="teachingSettingsStatus" style="color:var(--owner-text-muted);margin-top:10px"></div>
          </div>
        </article>
        <article class="portal-panel" style="grid-column:1/-1" data-owner-section="settings">
          <span class="portal-label">Appearance</span>
          <p class="admin-panel-intro">This changes how your Owner dashboard looks on this device — it has no effect on the public website.</p>

          <div class="admin-subsection-label" style="border-top:0;padding-top:0;margin-top:18px">Interface Style</div>
          <div class="appearance-option-row" id="appearanceStyleRow">
            <button type="button" class="admin-tab" data-appearance-style="modern">Rounded / Modern</button>
            <button type="button" class="admin-tab" data-appearance-style="classic">Classic</button>
          </div>

          <div class="admin-subsection-label">Color Mode</div>
          <div class="appearance-option-row" id="appearanceModeRow">
            <button type="button" class="admin-tab" data-appearance-mode="light">Light</button>
            <button type="button" class="admin-tab" data-appearance-mode="dark">Dark</button>
            <button type="button" class="admin-tab" data-appearance-mode="system">System</button>
          </div>

          <div class="admin-subsection-label">Accent</div>
          <div class="appearance-swatches" id="appearanceAccentRow" style="margin-bottom:22px">
            <button type="button" class="appearance-swatch" data-appearance-accent="ink" style="background:#18181b" title="Ink"></button>
            <button type="button" class="appearance-swatch" data-appearance-accent="slate" style="background:#33435c" title="Slate"></button>
            <button type="button" class="appearance-swatch" data-appearance-accent="espresso" style="background:#4d3826" title="Espresso"></button>
          </div>

          <div class="admin-subsection-label">Preview</div>
          <div class="appearance-preview">
            <button type="button" class="admin-btn-solid">Primary Button</button>
            <button type="button" class="admin-btn-ghost">Outline Button</button>
            <input type="text" placeholder="Input field" style="max-width:160px;padding:9px 14px;border-radius:var(--owner-radius-pill);border:1px solid var(--owner-border-strong);background:var(--owner-surface);color:var(--owner-text)" readonly />
            <label class="admin-checkbox-field" style="padding-top:0"><input type="checkbox" checked readonly /> Toggle</label>
            <div class="appearance-preview-card"><strong>Sample Card</strong>This is what a card looks like.</div>
          </div>
        </article>
        ${accountSettingsHtml('owner')}
      </div>
        </div>
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
      <p class="booking-intro" id="bookingIntro">Choose a date and an open time below.</p>
      <form id="bookingForm">
        <div style="position:absolute;left:-9999px;width:1px;height:1px;overflow:hidden" aria-hidden="true">
          <label for="bookingWebsite">Leave this field blank</label>
          <input id="bookingWebsite" name="website" type="text" tabindex="-1" autocomplete="off" />
        </div>
        <div class="booking-options" id="bookingOptions" aria-label="Choose a one-on-one service"></div>
        <div class="booking-grid">
          <div class="booking-field full">
            <label for="bookingTimeZone">Your time zone</label>
            <select id="bookingTimeZone" name="timeZone"></select>
          </div>
          <div class="booking-field">
            <label for="bookingDate">Choose a date</label>
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
          <div class="booking-field">
            <label for="bookingPhoneNumber">Phone number</label>
            <div style="display:flex;gap:8px">
              <select id="bookingPhoneCountry" aria-label="Country code" style="flex:0 0 auto">${COUNTRY_OPTIONS}</select>
              <input id="bookingPhoneNumber" type="tel" placeholder="Phone number" autocomplete="tel-national" required style="flex:1" />
            </div>
          </div>
          <div class="booking-field full">
            <label for="bookingReason">What are you trusting God to reveal or do?</label>
            <input id="bookingReason" name="reason" type="text" placeholder="A brief note on what you'd like to talk through" required />
          </div>
        </div>
        <fieldset class="payment-demo" disabled>
          <legend>Payment <span class="demo-badge">Visual Demonstration — Not Yet Connected</span></legend>
          <div class="booking-grid">
            <div class="booking-field full">
              <label>Card number</label>
              <input type="text" value="4242 4242 4242 4242" readonly />
            </div>
            <div class="booking-field">
              <label>Expiry</label>
              <input type="text" value="12 / 29" readonly />
            </div>
            <div class="booking-field">
              <label>CVC</label>
              <input type="text" value="123" readonly />
            </div>
          </div>
          <p class="payment-demo-note">This is a preview of what payment will look like once a real processor is connected. No card details are collected and no charge occurs today.</p>
        </fieldset>
        <div class="booking-hold-notice" id="bookingHoldNotice" role="status" aria-live="polite"></div>
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
  </dialog>

  <dialog class="booking-dialog checkout-dialog" id="teachingRegisterDialog" aria-labelledby="teachingRegisterTitle">
    <button class="booking-close checkout-close" id="closeTeachingRegister" type="button" aria-label="Close registration">×</button>
    <div class="checkout-grid">
      <div class="checkout-summary" id="teachingRegisterSummaryArt">
        <div class="checkout-summary-overlay"></div>
        <div class="checkout-summary-content">
          <div class="eyebrow" id="teachingRegisterKicker">Teaching Registration</div>
          <h2 class="teaching-display" id="teachingRegisterTitle">Reserve your seat.</h2>
          <div class="checkout-summary-meta" id="teachingRegisterMeta"></div>
          <p class="checkout-summary-desc" id="teachingRegisterIntro"></p>
        </div>
      </div>
      <div class="checkout-form-side">
        <form id="teachingRegisterForm">
          <div style="position:absolute;left:-9999px;width:1px;height:1px;overflow:hidden" aria-hidden="true">
            <label for="teachingRegisterWebsite">Leave this field blank</label>
            <input id="teachingRegisterWebsite" type="text" tabindex="-1" autocomplete="off" />
          </div>
          <div class="admin-microlabel checkout-section-label">Your Information</div>
          <div class="booking-grid">
            <div class="booking-field">
              <label for="teachingRegisterFirstName">First name</label>
              <input id="teachingRegisterFirstName" type="text" autocomplete="given-name" required />
            </div>
            <div class="booking-field">
              <label for="teachingRegisterLastName">Last name</label>
              <input id="teachingRegisterLastName" type="text" autocomplete="family-name" required />
            </div>
            <div class="booking-field full">
              <label for="teachingRegisterEmail">Email address</label>
              <input id="teachingRegisterEmail" type="email" placeholder="For confirmation and class access" autocomplete="email" required />
            </div>
            <div class="booking-field full">
              <label for="teachingRegisterPhoneNumber">Phone number</label>
              <div style="display:flex;gap:8px">
                <select id="teachingRegisterPhoneCountry" aria-label="Country code" style="flex:0 0 auto">${COUNTRY_OPTIONS}</select>
                <input id="teachingRegisterPhoneNumber" type="tel" placeholder="Phone number" autocomplete="tel-national" required style="flex:1" />
              </div>
            </div>
          </div>

          <div class="admin-microlabel checkout-section-label">Payment</div>
          <div class="checkout-payment-methods" aria-hidden="true">
            <span class="checkout-payment-method active">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20"/></svg>
              Card
            </span>
            <span class="checkout-payment-method">
              <svg viewBox="0 0 24 24" fill="currentColor"><path d="M16.5 6.9c-.8 1-2.1 1.7-3.3 1.6-.2-1.2.4-2.5 1.1-3.3.8-1 2.2-1.7 3.3-1.8.1 1.3-.4 2.6-1.1 3.5zm1.1 1.8c-1.8-.1-3.4 1-4.2 1-.9 0-2.2-1-3.7-.9-1.9 0-3.6 1.1-4.6 2.7-2 3.4-.5 8.5 1.4 11.3.9 1.4 2 2.9 3.5 2.8 1.4-.1 1.9-.9 3.6-.9s2.1.9 3.6.8c1.5 0 2.5-1.3 3.4-2.8.9-1.4 1.3-2.8 1.3-2.9-.1 0-2.7-1-2.7-4 0-2.5 2.1-3.7 2.2-3.8-1.2-1.7-3-1.9-3.6-2z"/></svg>
              Apple Pay
            </span>
            <span class="checkout-payment-method">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M21 12a9 9 0 1 1-2.6-6.4"/><path d="M12 12h9"/></svg>
              Google Pay
            </span>
          </div>
          <fieldset class="payment-demo checkout-payment-demo" id="teachingRegisterPaymentFieldset" disabled>
            <legend class="demo-badge">Visual Demonstration — Not Yet Connected</legend>
            <div class="booking-grid">
              <div class="booking-field full">
                <label>Card number</label>
                <input type="text" value="4242 4242 4242 4242" readonly />
              </div>
              <div class="booking-field">
                <label>Expiry</label>
                <input type="text" value="12 / 29" readonly />
              </div>
              <div class="booking-field">
                <label>CVC</label>
                <input type="text" value="123" readonly />
              </div>
              <div class="booking-field full">
                <label>Name on card</label>
                <input type="text" value="Full name as shown on card" readonly />
              </div>
            </div>
          </fieldset>
          <p class="payment-demo-note checkout-payment-note">Card, Apple Pay, and Google Pay are shown as a preview of what will be available once a real payment processor is connected. No card details are collected and no charge occurs today.</p>

          <div class="checkout-order-summary" id="teachingRegisterOrderSummary"></div>

          <div class="booking-actions checkout-actions">
            <button class="btn on-light fill checkout-submit" type="submit" id="teachingRegisterSubmitBtn">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><rect x="4" y="10" width="16" height="10" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/></svg>
              <span id="teachingRegisterSubmitLabel">Continue To Payment</span>
            </button>
            <div class="booking-status" id="teachingRegisterStatus" role="status" aria-live="polite"></div>
          </div>
          <div class="booking-note checkout-note">Your seat is requested now and confirmed once payment is connected. Private class access details are never posted publicly — only sent to confirmed registrants.</div>
        </form>
      </div>
    </div>
  </dialog>

  <dialog class="booking-dialog admin-dialog" id="teachingEditDialog" aria-labelledby="teachingEditTitle" style="max-width:820px">
    <div class="booking-head admin-editor-head">
      <div>
        <div class="admin-microlabel" style="color:var(--stone)">Teaching Manager</div>
        <h3 id="teachingEditTitle">New Teaching</h3>
      </div>
      <div class="admin-editor-head-right">
        <span class="admin-status-pill" id="teachingEditStatusPill">Draft</span>
        <button class="booking-close" id="closeTeachingEdit" type="button" aria-label="Close teaching editor">×</button>
      </div>
    </div>
    <div class="booking-body">
      <form id="teachingEditForm">
        <input type="hidden" id="teachingEditId" />
        <div class="admin-editor-body">
        <div class="admin-steps" id="teachingEditTabs" role="tablist">
          <button type="button" class="admin-step active" data-edit-tab="content"><span class="admin-step-num">1</span> Class Information</button>
          <button type="button" class="admin-step" data-edit-tab="datetime"><span class="admin-step-num">2</span> Date &amp; Time</button>
          <button type="button" class="admin-step" data-edit-tab="pricing"><span class="admin-step-num">3</span> Price</button>
          <button type="button" class="admin-step" data-edit-tab="appearance"><span class="admin-step-num">4</span> Images</button>
          <button type="button" class="admin-step" data-edit-tab="registration"><span class="admin-step-num">5</span> Registration</button>
          <button type="button" class="admin-step" data-edit-tab="zoomlocation"><span class="admin-step-num">6</span> Zoom &amp; Location</button>
          <button type="button" class="admin-step" data-edit-tab="preview"><span class="admin-step-num">7</span> Preview</button>
        </div>
        <div class="admin-editor-panels">

        <div class="admin-edit-panel" data-edit-panel="content">
          <div class="booking-grid">
            <div class="booking-field full"><label for="teachingEditTitleInput">Class Title</label><input id="teachingEditTitleInput" type="text" required /></div>
            <div class="booking-field full"><label for="teachingEditSubtitle">Subtitle</label><input id="teachingEditSubtitle" type="text" /></div>
            <div class="booking-field full"><label for="teachingEditShortDesc">Short Description <span class="admin-hint">— shown on cards and the hero banner</span></label><textarea id="teachingEditShortDesc" rows="2"></textarea></div>
            <div class="booking-field full"><label for="teachingEditFullDesc">Full Description <span class="admin-hint">— shown under "About This Teaching" on the class page</span></label><textarea id="teachingEditFullDesc" rows="4"></textarea></div>
            <div class="booking-field full"><label for="teachingEditLearn">What You Will Learn <span class="admin-hint">— one per line</span></label><textarea id="teachingEditLearn" rows="4" placeholder="What spiritual discernment is&#10;Types of discernment&#10;..."></textarea></div>
            <div class="booking-field"><label for="teachingEditInstructor">Instructor</label><input id="teachingEditInstructor" type="text" /></div>
            <div class="booking-field"><label for="teachingEditCategory">Category</label><input id="teachingEditCategory" type="text" placeholder="e.g. Discernment" /></div>
          </div>
        </div>

        <div class="admin-edit-panel" data-edit-panel="datetime" hidden>
          <div class="booking-grid">
            <div class="booking-field"><label for="teachingEditDate">Date</label><input id="teachingEditDate" type="date" required /></div>
            <div class="booking-field"><label for="teachingEditStartTime">Start Time</label><input id="teachingEditStartTime" type="time" required /></div>
            <div class="booking-field"><label for="teachingEditEndTime">End Time <span class="admin-hint">(optional)</span></label><input id="teachingEditEndTime" type="time" /></div>
            <input type="hidden" id="teachingEditTimeZone" value="America/New_York" />
          </div>
          <p class="admin-hint" style="margin-top:12px">Times are scheduled in Eastern Time. The public website automatically shows EST or EDT depending on the date, so you never have to think about daylight saving.</p>
        </div>

        <div class="admin-edit-panel" data-edit-panel="pricing" hidden>
          <div class="admin-tabs" id="teachingEditFreePaidRow" style="margin-bottom:16px">
            <button type="button" class="admin-tab active" data-free-paid="free">Free</button>
            <button type="button" class="admin-tab" data-free-paid="paid">Paid</button>
          </div>
          <div class="booking-grid" id="teachingEditPriceFieldWrap" hidden>
            <div class="booking-field"><label for="teachingEditPrice">Price <span class="admin-hint">example: $25.00</span></label><input id="teachingEditPrice" type="number" min="0" step="0.01" placeholder="25.00" /></div>
          </div>
        </div>

        <div class="admin-edit-panel" data-edit-panel="appearance" hidden>
          <div class="admin-image-grid">
            <div class="admin-image-field" data-image-field="hero">
              <span class="admin-microlabel">Hero Image — Featured Teaching banner &amp; class page</span>
              <div class="admin-image-preview" id="teachingEditArtHeroPreview"></div>
              <div class="admin-image-actions">
                <label class="admin-image-upload-btn">Upload Image<input type="file" accept="image/*" id="teachingEditArtHeroFile" hidden /></label>
                <button type="button" class="admin-image-remove-btn" id="teachingEditArtHeroRemove">Remove</button>
              </div>
              <details class="admin-image-advanced"><summary>Advanced: paste an image URL instead</summary><input id="teachingEditArtHero" type="url" placeholder="https://…" /></details>
            </div>
            <div class="admin-image-field" data-image-field="card">
              <span class="admin-microlabel">Card Image — Upcoming Teachings grid</span>
              <div class="admin-image-preview" id="teachingEditArtCardPreview"></div>
              <div class="admin-image-actions">
                <label class="admin-image-upload-btn">Upload Image<input type="file" accept="image/*" id="teachingEditArtCardFile" hidden /></label>
                <button type="button" class="admin-image-remove-btn" id="teachingEditArtCardRemove">Remove</button>
              </div>
              <details class="admin-image-advanced"><summary>Advanced: paste an image URL instead</summary><input id="teachingEditArtCard" type="url" placeholder="https://… (blank = use hero image)" /></details>
            </div>
            <div class="admin-image-field" data-image-field="mobile">
              <span class="admin-microlabel">Mobile Image <span class="admin-hint">(optional)</span></span>
              <div class="admin-image-preview" id="teachingEditArtHeroMobilePreview"></div>
              <div class="admin-image-actions">
                <label class="admin-image-upload-btn">Upload Image<input type="file" accept="image/*" id="teachingEditArtHeroMobileFile" hidden /></label>
                <button type="button" class="admin-image-remove-btn" id="teachingEditArtHeroMobileRemove">Remove</button>
              </div>
              <details class="admin-image-advanced"><summary>Advanced: paste an image URL instead</summary><input id="teachingEditArtHeroMobile" type="url" placeholder="https://… (blank = use hero image)" /></details>
            </div>
          </div>
          <div class="admin-subsection-label">Adjust The Hero Image <span class="admin-hint">— this is the image beside the Featured Teaching, like the one next to "Discernment"</span></div>
          <input type="hidden" id="teachingEditFocalX" value="50" />
          <input type="hidden" id="teachingEditFocalY" value="50" />
          <input type="hidden" id="teachingEditZoom" value="100" />
          <input type="hidden" id="teachingEditOverlayStrength" value="45" />
          <div class="admin-image-adjust">
            <div class="admin-image-adjust-preview-wrap">
              <div class="admin-image-adjust-preview" id="teachingEditHeroLivePreview">
                <div class="teaching-hero-overlay" id="teachingEditHeroLiveOverlay"></div>
                <span class="admin-image-adjust-preview-label">Live Preview</span>
              </div>
            </div>
            <div class="admin-image-adjust-controls">
              <div class="admin-adjust-group">
                <span class="admin-microlabel">Move Image</span>
                <div class="admin-dpad">
                  <button type="button" class="admin-btn-ghost" data-nudge="up">Move Up</button>
                  <div class="admin-dpad-row">
                    <button type="button" class="admin-btn-ghost" data-nudge="left">Move Left</button>
                    <button type="button" class="admin-btn-ghost" data-nudge="center">Center</button>
                    <button type="button" class="admin-btn-ghost" data-nudge="right">Move Right</button>
                  </div>
                  <button type="button" class="admin-btn-ghost" data-nudge="down">Move Down</button>
                </div>
              </div>
              <div class="admin-adjust-group">
                <span class="admin-microlabel">Zoom</span>
                <div class="admin-adjust-btn-row">
                  <button type="button" class="admin-btn-ghost" data-zoom="out">Zoom Out</button>
                  <button type="button" class="admin-btn-ghost" data-zoom="in">Zoom In</button>
                </div>
              </div>
              <div class="admin-adjust-group">
                <span class="admin-microlabel">Image Brightness</span>
                <div class="admin-adjust-btn-row">
                  <button type="button" class="admin-btn-ghost" data-brightness="lighten">Lighten Image</button>
                  <button type="button" class="admin-btn-ghost" data-brightness="darken">Darken Image</button>
                </div>
                <p class="admin-hint">Darkening makes the title easier to read over a busy photo.</p>
              </div>
              <button type="button" class="admin-btn-ghost" id="teachingEditResetImageBtn">Reset Image Position</button>
            </div>
          </div>
        </div>

        <div class="admin-edit-panel" data-edit-panel="registration" hidden>
          <div class="admin-stat-row">
            <div class="admin-stat-tile"><span>Status</span><strong id="teachingEditRegStatus">—</strong></div>
            <div class="admin-stat-tile"><span>Registered</span><strong id="teachingEditRegCount">—</strong></div>
            <div class="admin-stat-tile"><span>Capacity</span><strong id="teachingEditRegCapacity">—</strong></div>
            <div class="admin-stat-tile"><span>Revenue (once paid)</span><strong id="teachingEditRegRevenue">—</strong></div>
          </div>
          <button class="admin-btn-ghost" type="button" id="teachingEditOpenRegistrantsBtn" style="margin-top:16px">View Registrants</button>
          <p class="admin-hint" style="margin-top:14px">Registration opens to visitors once this teaching's status is "Registration Open" — set that at the bottom of this window.</p>
        </div>

        <div class="admin-edit-panel" data-edit-panel="zoomlocation" hidden>
          <div class="booking-grid">
            <div class="booking-field"><label for="teachingEditFormat">Format</label>
              <select id="teachingEditFormat">
                <option value="zoom">Zoom</option><option value="in-person">In Person</option>
                <option value="hybrid">Hybrid</option><option value="other">Other</option>
              </select>
            </div>
            <div class="booking-field"><label for="teachingEditLocation">Location <span class="admin-hint">(if in person/hybrid)</span></label><input id="teachingEditLocation" type="text" /></div>
            <div class="booking-field"><label for="teachingEditCapacity">Capacity</label><input id="teachingEditCapacity" type="number" min="1" /></div>
            <label class="admin-checkbox-field"><input id="teachingEditUnlimited" type="checkbox" /> Unlimited capacity</label>
          </div>
          <div class="admin-subsection-label">Zoom Details <span class="admin-hint">— private, never shown publicly before someone registers</span></div>
          <div class="booking-grid">
            <div class="booking-field full"><label for="teachingEditZoomUrl">Private Zoom Link</label><input id="teachingEditZoomUrl" type="url" placeholder="https://zoom.us/j/..." /></div>
            <div class="booking-field"><label for="teachingEditZoomId">Meeting ID</label><input id="teachingEditZoomId" type="text" /></div>
            <div class="booking-field"><label for="teachingEditZoomPasscode">Passcode</label><input id="teachingEditZoomPasscode" type="text" /></div>
          </div>
        </div>

        <div class="admin-edit-panel" data-edit-panel="preview" hidden>
          <p class="admin-hint" style="margin-bottom:14px">This is what the Featured Teaching section looks like with your current changes — before you publish.</p>
          <div id="teachingEditFullPreview"></div>
        </div>

        </div>
        </div>

        <div class="admin-editor-footer">
          <label class="admin-checkbox-field"><input id="teachingEditFeatured" type="checkbox" /> Make this the Featured Teaching</label>
          <div class="booking-field" style="max-width:220px">
            <label for="teachingEditStatus">Status</label>
            <select id="teachingEditStatus">
              <option value="draft">Draft</option>
              <option value="published">Published</option>
              <option value="registration-open">Registration Open</option>
              <option value="sold-out">Sold Out</option>
              <option value="completed">Completed</option>
              <option value="cancelled">Cancelled</option>
            </select>
          </div>
        </div>

        <div class="booking-actions admin-editor-actions">
          <button class="btn on-light" type="button" id="teachingEditSaveDraftBtn">Save Draft</button>
          <button class="btn on-light" type="button" id="teachingEditPreviewBtn">Preview Class</button>
          <button class="btn on-light fill" type="submit" id="teachingEditSubmitBtn">Publish Class</button>
          <button class="btn on-light" type="button" id="teachingEditDuplicateBtn">Duplicate As New</button>
          <div class="booking-status" id="teachingEditStatusMsg" role="status" aria-live="polite"></div>
        </div>
      </form>
    </div>
  </dialog>

  <dialog class="booking-dialog" id="teachingRegistrantsDialog" aria-labelledby="teachingRegistrantsTitle">
    <div class="booking-head">
      <div>
        <div class="kicker" style="margin-bottom:0">Registrations</div>
        <h3 id="teachingRegistrantsTitle">Registrants</h3>
      </div>
      <button class="booking-close" id="closeTeachingRegistrants" type="button" aria-label="Close registrants list">×</button>
    </div>
    <div class="booking-body">
      <div id="teachingRegistrantsSummary" style="margin-bottom:14px;color:var(--ink-muted)"></div>
      <input id="teachingRegistrantsSearch" type="text" placeholder="Search registrants…" style="width:100%;margin-bottom:14px" />
      <div id="teachingRegistrantsList"></div>
    </div>
  </dialog>`;
}

// Inject nav (start of body), dialogs + footer (end of body), before
// anything below tries to query them.
document.body.insertAdjacentHTML('afterbegin', navHtml());
document.body.insertAdjacentHTML('beforeend', dialogsHtml() + footerHtml());
if(DEMO_MODE){
  document.body.classList.add('demo-mode');
  document.body.insertAdjacentHTML('afterbegin',
    '<div class="preview-banner">Preview Site — Sign-in, booking, and account activity here use sample data only. Nothing is saved to the real ministry database.</div>');
}

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
// Ministry's scheduling timezone. The Scheduling Settings panel (below)
// can change this in-memory for preview purposes; loadSchedulingConfig()
// would also assign it once that panel is reconnected to Firestore.
let BUSINESS_TZ = 'America/New_York';

/* ---------------------------------------------------------------
   Admin-controlled scheduling configuration (Firestore-backed).
   These defaults exactly match today's hardcoded behavior (Tue/Thu
   2-6PM ET, 30/15-minute sessions) — so until an admin actually opens
   Scheduling Settings and saves something, the booking system behaves
   identically to before. Nothing regresses if the collections are
   still empty on first load.
   --------------------------------------------------------------- */
let SCHEDULING_SETTINGS = {
  ministryTimeZone: 'America/New_York',
  bookingPaused: false,
  defaultCapacityPerSlot: 1,
  minNoticeHours: null,
  maxAdvanceDays: null,
  maxBookingsPerDay: null,
  backToBackAllowed: true
};
let SESSION_TYPES = {
  '30-minute': { name: '30-Minute One-on-One', durationMinutes: 30, price: null, description: 'More time for conversation, guidance, and focused ministry.', active: true, order: 1, bufferBeforeMin: 0, bufferAfterMin: 0 },
  '15-minute': { name: '15-Minute Pop-Up', durationMinutes: 15, price: null, description: 'A shorter personal session for one focused need or question.', active: true, order: 2, bufferBeforeMin: 0, bufferAfterMin: 0 }
};
let AVAILABILITY_RULES = [
  { id: 'default-tue', dayOfWeek: 2, startTime: '14:00', endTime: '18:00', sessionTypeIds: [], capacity: 1 },
  { id: 'default-thu', dayOfWeek: 4, startTime: '14:00', endTime: '18:00', sessionTypeIds: [], capacity: 1 }
];
// Vacations/holidays spanning multiple days (single-day blocks still use
// the existing `blockouts` collection/DEMO_BLOCKED_DATES unchanged).
let BLOCKOUT_RANGES = [];
// One-off overrides: a date present here replaces that date's normal
// weekly windows entirely — used for "special availability for a
// specific date" (extra hours, or reduced/closed for part of a day).
let AVAILABILITY_OVERRIDES = {};

async function loadSchedulingConfig(){
  try {
    const settingsSnap = await getDoc(doc(db, 'schedulingSettings', 'global'));
    if(settingsSnap.exists()) SCHEDULING_SETTINGS = { ...SCHEDULING_SETTINGS, ...settingsSnap.data() };
  } catch (err) { /* keep defaults */ }
  try {
    const typesSnap = await getDocs(collection(db, 'sessionTypes'));
    if(!typesSnap.empty){
      const types = {};
      typesSnap.forEach(d => { types[d.id] = d.data(); });
      SESSION_TYPES = types;
    }
  } catch (err) { /* keep defaults */ }
  try {
    const rulesSnap = await getDocs(collection(db, 'availabilityRules'));
    if(!rulesSnap.empty){
      const rules = [];
      rulesSnap.forEach(d => rules.push({ id: d.id, ...d.data() }));
      AVAILABILITY_RULES = rules;
    }
  } catch (err) { /* keep defaults */ }
  try {
    const rangesSnap = await getDocs(collection(db, 'blockoutRanges'));
    const ranges = [];
    rangesSnap.forEach(d => ranges.push({ id: d.id, ...d.data() }));
    BLOCKOUT_RANGES = ranges;
  } catch (err) { /* keep defaults */ }
  try {
    const overridesSnap = await getDocs(collection(db, 'availabilityOverrides'));
    const overrides = {};
    overridesSnap.forEach(d => { overrides[d.id] = d.data(); });
    AVAILABILITY_OVERRIDES = overrides;
  } catch (err) { /* keep defaults */ }
  BUSINESS_TZ = SCHEDULING_SETTINGS.ministryTimeZone || 'America/New_York';
}
// Only ever reads real Firestore on the production domain — the preview
// safety lock (DEMO_MODE) keeps this panel fully local/sample on every
// other host, same as every other admin feature.
if(!DEMO_MODE) await loadSchedulingConfig();

/* ---------------------------------------------------------------
   Teaching Manager configuration + public teaching data. Same
   real/demo split as scheduling above. Zoom details are deliberately
   NOT part of this public load — they live in a separate admin-only
   `teachingZoomInfo` collection so a public page read can never see
   them, and are fetched only when the admin opens a teaching to edit
   it (see wireTeachingManager below).
   --------------------------------------------------------------- */
let TEACHING_PAGE_SETTINGS = {
  featuredTeachingId: 'demo-discernment', showUpcoming: true, upcomingCount: 6,
  showLibrary: false, showScripture: true, showNewsletter: true,
  defaultThursdayTime: '19:30', defaultTimeZone: 'America/New_York', autoArchiveCompleted: true,
  scriptureText: 'But the natural man receiveth not the things of the Spirit of God: for they are foolishness unto him: neither can he know them, because they are spiritually discerned.',
  scriptureReference: '1 Corinthians 2:14', scriptureImage: ''
};
let TEACHINGS = DEMO_TEACHINGS;

/* ---------------------------------------------------------------
   Preview persistence (DEMO_MODE only). Saves Teaching Manager edits
   into this browser's localStorage — never the network, never the
   real database — so a preview session survives navigating around
   the site and reloading the page, the way editing on the real site
   would feel, without writing anywhere outside this one browser.
   "Reset Preview Data" clears it and returns to the original sample
   content. Snapshotting the defaults has to happen right here, before
   anything can mutate TEACHINGS in place — TEACHINGS *is* DEMO_TEACHINGS
   (same object), so editing one edits the other unless we keep a
   separate deep-cloned copy purely for resetting back to.
   --------------------------------------------------------------- */
const TEACHING_PREVIEW_DEFAULTS = {
  teachings: JSON.parse(JSON.stringify(DEMO_TEACHINGS)),
  settings: JSON.parse(JSON.stringify(TEACHING_PAGE_SETTINGS)),
  zoom: JSON.parse(JSON.stringify(DEMO_TEACHING_ZOOM))
};
const PREVIEW_STORAGE_KEYS = {
  teachings: 'ua_preview_teachings_v1',
  settings: 'ua_preview_teaching_settings_v1',
  zoom: 'ua_preview_teaching_zoom_v1'
};
function savePreviewToStorage(){
  if(!DEMO_MODE) return true;
  try {
    localStorage.setItem(PREVIEW_STORAGE_KEYS.teachings, JSON.stringify(TEACHINGS));
    localStorage.setItem(PREVIEW_STORAGE_KEYS.settings, JSON.stringify(TEACHING_PAGE_SETTINGS));
    localStorage.setItem(PREVIEW_STORAGE_KEYS.zoom, JSON.stringify(DEMO_TEACHING_ZOOM));
    return true;
  } catch (err) {
    console.error('Could not save preview data to this browser', err);
    return false;
  }
}
function loadPreviewFromStorage(){
  try {
    const t = localStorage.getItem(PREVIEW_STORAGE_KEYS.teachings);
    const s = localStorage.getItem(PREVIEW_STORAGE_KEYS.settings);
    const z = localStorage.getItem(PREVIEW_STORAGE_KEYS.zoom);
    if(t) TEACHINGS = JSON.parse(t);
    if(s) TEACHING_PAGE_SETTINGS = JSON.parse(s);
    if(z) DEMO_TEACHING_ZOOM = JSON.parse(z);
  } catch (err) { /* keep current defaults if storage is corrupt/unavailable */ }
}
function resetPreviewData(){
  try {
    localStorage.removeItem(PREVIEW_STORAGE_KEYS.teachings);
    localStorage.removeItem(PREVIEW_STORAGE_KEYS.settings);
    localStorage.removeItem(PREVIEW_STORAGE_KEYS.zoom);
  } catch (err) { /* ignore */ }
  TEACHINGS = JSON.parse(JSON.stringify(TEACHING_PREVIEW_DEFAULTS.teachings));
  TEACHING_PAGE_SETTINGS = JSON.parse(JSON.stringify(TEACHING_PREVIEW_DEFAULTS.settings));
  DEMO_TEACHING_ZOOM = JSON.parse(JSON.stringify(TEACHING_PREVIEW_DEFAULTS.zoom));
}
if(DEMO_MODE) loadPreviewFromStorage();

async function loadTeachingPageConfig(){
  try {
    const settingsSnap = await getDoc(doc(db, 'teachingPageSettings', 'global'));
    if(settingsSnap.exists()) TEACHING_PAGE_SETTINGS = { ...TEACHING_PAGE_SETTINGS, ...settingsSnap.data() };
  } catch (err) { /* keep defaults */ }
  try {
    const snap = await getDocs(collection(db, 'teachings'));
    const map = {};
    snap.forEach(d => { map[d.id] = { id: d.id, ...d.data() }; });
    TEACHINGS = map;
  } catch (err) { /* keep whatever we had */ }
}
if(!DEMO_MODE) await loadTeachingPageConfig();

function teachingIsPast(t){
  if(!t.date) return false;
  const end = t.date + 'T' + (t.endTime || t.startTime || '23:59');
  return new Date(end) < new Date();
}
function visibleTeachingsList(){
  // Drafts never render publicly even in demo mode, so the preview
  // behaves the same as production would for a non-admin visitor.
  return Object.values(TEACHINGS).filter(t => t.status !== 'draft' && t.status !== 'cancelled');
}
function upcomingTeachingsList(){
  return visibleTeachingsList().filter(t => !teachingIsPast(t)).sort((a, b) => (a.date + (a.startTime || '')).localeCompare(b.date + (b.startTime || '')));
}
function featuredTeaching(){
  const id = TEACHING_PAGE_SETTINGS.featuredTeachingId;
  return (id && TEACHINGS[id] && TEACHINGS[id].status !== 'draft') ? TEACHINGS[id] : upcomingTeachingsList()[0] || null;
}
function teachingStatusButtonLabel(t){
  if(t.status === 'sold-out') return 'SOLD OUT';
  if(t.status === 'completed') return 'CLASS COMPLETED';
  if(t.status === 'cancelled') return 'CANCELLED';
  return 'REGISTER NOW';
}
function teachingStatusButtonDisabled(t){
  return t.status === 'sold-out' || t.status === 'completed' || t.status === 'cancelled';
}
function formatTeachingDate(dateStr){
  try {
    const [y, m, d] = dateStr.split('-').map(Number);
    return new Intl.DateTimeFormat(undefined, { month: 'long', day: 'numeric', year: 'numeric' }).format(new Date(y, m - 1, d));
  } catch (err) { return dateStr; }
}
function formatTeachingDateShort(dateStr){
  try {
    const [y, m, d] = dateStr.split('-').map(Number);
    return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(new Date(y, m - 1, d));
  } catch (err) { return dateStr; }
}
function formatTeachingTime(hhmm, tz){
  if(!hhmm) return '';
  const [h, m] = hhmm.split(':').map(Number);
  const label = minutesToLabel(h * 60 + m);
  const abbr = tz ? tzAbbrFor(tz) : '';
  return label + (abbr ? ' ' + abbr : '');
}
function teachingArtworkUrl(t, key){
  return (t.artwork && t.artwork[key]) || (t.artwork && t.artwork.hero) || '';
}
function teachingCardArt(t){
  return (t.artwork && (t.artwork.card || t.artwork.hero)) || '';
}

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
// `tz` is optional everywhere it's used elsewhere in the file — when
// omitted, Intl falls back to the browser's own local time zone exactly
// as before. The booking dialog is the one place that passes an explicit
// (possibly visitor-overridden) zone.
function formatLocalDateTime(dateStr, hhmm, tz){
  try {
    const d = etWallTimeToDate(dateStr, hhmmToMinutes(hhmm));
    const datePart = new Intl.DateTimeFormat(undefined, { timeZone: tz, weekday: 'short', month: 'short', day: 'numeric' }).format(d);
    const timePart = new Intl.DateTimeFormat(undefined, { timeZone: tz, hour: 'numeric', minute: '2-digit', timeZoneName: 'short' }).format(d);
    return datePart + ' · ' + timePart;
  } catch (err) {
    return dateStr + ' · ' + minutesToLabel(hhmmToMinutes(hhmm)) + ' ET';
  }
}
function formatLocalTime(dateStr, hhmm, tz){
  try {
    const d = etWallTimeToDate(dateStr, hhmmToMinutes(hhmm));
    return new Intl.DateTimeFormat(undefined, { timeZone: tz, hour: 'numeric', minute: '2-digit', timeZoneName: 'short' }).format(d);
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
// The phone number / email captured at registration (or loaded from the
// signed-in profile when re-entering verification later via the banner).
let pendingVerifyPhone = null;
let pendingVerifyEmail = null;

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
    // out and point them to registration instead. Demo mode has no real
    // profile database to check, so it always treats the code as valid.
    if(!DEMO_MODE){
      const profileSnap = await getDoc(doc(db, 'users', result.user.uid));
      if(!profileSnap.exists()){
        await signOut(auth);
        portalLoginStatus.textContent = "We don't have an account linked to that phone number yet. Use Create Account, or sign in by email and verify by text from My Assembly.";
        return;
      }
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
    if(!DEMO_MODE){
      await setDoc(doc(db, 'users', cred.user.uid), {
        firstName, lastName, name: fullName, email, phone, role,
        emailVerified: false, phoneVerified: false, createdAt: serverTimestamp()
      });
    }
    pendingVerifyPhone = phone;
    pendingVerifyEmail = email;
    awaitingVerifyChoice = true;
    registerForm.reset();
    registerStatus.textContent = '';
    showAuthPanel('verify');
    await startPhoneVerifyStep(); // auto-sends the SMS code — no extra click required
  } catch (err) {
    registerStatus.textContent = friendlyAuthError(err);
  } finally {
    registerSubmitBtn.disabled = false;
  }
});

/* ---------------------------------------------------------------
   Post-registration verification — mandatory phone step first
   (blocking: cannot proceed without the correct code), then email
   (real, non-fakeable: only proceeds once Firebase's own reload()
   confirms emailVerified is actually true).
   --------------------------------------------------------------- */
function showVerifyStep(step){
  memberPortalDialog.querySelectorAll('[data-verify-step]').forEach(el => {
    el.hidden = el.dataset.verifyStep !== step;
  });
  document.getElementById('verifyStatus').textContent = '';
}

let verifyRecaptcha = null;
let verifyConfirmationResult = null;
let verifyPhoneResendTimer = null;

async function startPhoneVerifyStep(){
  const statusEl = document.getElementById('verifyStatus');
  const phone = pendingVerifyPhone || currentProfile?.phone;
  if(!currentUser || !phone){ statusEl.textContent = 'No phone number on file.'; return; }
  document.getElementById('verifyPhoneNumberLabel').textContent = phone;
  statusEl.textContent = 'Sending code…';
  try {
    if(!verifyRecaptcha){
      verifyRecaptcha = new RecaptchaVerifier(auth, 'recaptcha-container-verify', { size: 'invisible' });
    }
    verifyConfirmationResult = await linkWithPhoneNumber(currentUser, phone, verifyRecaptcha);
    statusEl.textContent = 'Code sent to ' + phone + '.';
    startResendCooldown(document.getElementById('resendVerifyPhoneBtn'), 60);
  } catch (err) {
    // A phone already linked to this account (e.g. re-entering after a
    // partial signup) isn't an error the person needs to see — it just
    // means this step is already done; move on to email.
    if(err.code === 'auth/provider-already-linked'){
      if(!DEMO_MODE) await updateDoc(doc(db, 'users', currentUser.uid), { phoneVerified: true });
      currentProfile.phoneVerified = true;
      startEmailVerifyStep();
      return;
    }
    statusEl.textContent = friendlyAuthError(err);
  }
}

document.getElementById('resendVerifyPhoneBtn').addEventListener('click', startPhoneVerifyStep);

document.getElementById('changePhoneBtn').addEventListener('click', () => {
  document.getElementById('changePhoneStep').hidden = false;
});
document.getElementById('sendToNewPhoneBtn').addEventListener('click', async () => {
  const phone = toE164(document.getElementById('changePhoneCountry'), document.getElementById('changePhoneNumber'));
  const statusEl = document.getElementById('verifyStatus');
  if(!phone){ statusEl.textContent = 'Enter a valid phone number, including country code.'; return; }
  pendingVerifyPhone = phone;
  if(!DEMO_MODE) await updateDoc(doc(db, 'users', currentUser.uid), { phone });
  currentProfile.phone = phone;
  document.getElementById('changePhoneStep').hidden = true;
  document.getElementById('changePhoneNumber').value = '';
  await startPhoneVerifyStep();
});

document.getElementById('confirmVerifyPhoneBtn').addEventListener('click', async () => {
  const statusEl = document.getElementById('verifyStatus');
  const code = document.getElementById('verifyPhoneCode').value.trim();
  if(!verifyConfirmationResult || !code){ statusEl.textContent = 'Enter the 6-digit code.'; return; }
  statusEl.textContent = 'Verifying…';
  try {
    await verifyConfirmationResult.confirm(code);
    if(!DEMO_MODE) await updateDoc(doc(db, 'users', currentUser.uid), { phoneVerified: true });
    currentProfile.phoneVerified = true;
    updateVerifyBanner();
    updateAccountSettingsDisplay('member');
    updateAccountSettingsDisplay('owner');
    document.getElementById('verifyPhoneCode').value = '';
    startEmailVerifyStep();
  } catch (err) {
    statusEl.textContent = friendlyAuthError(err); // covers incorrect/expired/quota/etc — see friendlyAuthError
  }
});

async function startEmailVerifyStep(){
  const statusEl = document.getElementById('verifyStatus');
  const email = pendingVerifyEmail || currentProfile?.email || currentUser?.email;
  document.getElementById('verifyEmailLabel').textContent = email;
  showVerifyStep('email');
  try {
    await sendEmailVerification(currentUser);
    statusEl.textContent = 'Verification email sent.';
    startResendCooldown(document.getElementById('resendVerifyEmailBtn'), 60);
  } catch (err) {
    statusEl.textContent = friendlyAuthError(err);
  }
}
document.getElementById('resendVerifyEmailBtn').addEventListener('click', async () => {
  const statusEl = document.getElementById('verifyStatus');
  try {
    await sendEmailVerification(currentUser);
    statusEl.textContent = 'Verification email re-sent.';
    startResendCooldown(document.getElementById('resendVerifyEmailBtn'), 60);
  } catch (err) {
    statusEl.textContent = friendlyAuthError(err);
  }
});

document.getElementById('changeEmailInVerifyBtn').addEventListener('click', () => {
  document.getElementById('changeEmailInVerifyStep').hidden = false;
});
document.getElementById('sendToNewEmailBtn').addEventListener('click', async () => {
  const statusEl = document.getElementById('verifyStatus');
  const newEmail = document.getElementById('changeEmailNewAddress').value.trim();
  if(!isValidEmail(newEmail)){ statusEl.textContent = 'Enter a valid email address.'; return; }
  statusEl.textContent = 'Sending…';
  try {
    // At this point in registration the account's own email hasn't been
    // verified yet, so Firebase doesn't require reauthentication here —
    // it does for changing an already-verified email later (see
    // Account Settings, which does reauthenticate).
    await verifyBeforeUpdateEmail(currentUser, newEmail);
    if(!DEMO_MODE) await updateDoc(doc(db, 'users', currentUser.uid), { email: newEmail });
    currentProfile.email = newEmail;
    pendingVerifyEmail = newEmail;
    document.getElementById('verifyEmailLabel').textContent = newEmail;
    document.getElementById('changeEmailInVerifyStep').hidden = true;
    statusEl.textContent = 'Verification link sent to ' + newEmail + '.';
  } catch (err) {
    statusEl.textContent = friendlyAuthError(err);
  }
});

document.getElementById('checkEmailVerifiedBtn').addEventListener('click', async () => {
  const statusEl = document.getElementById('verifyStatus');
  statusEl.textContent = 'Checking…';
  try {
    await currentUser.reload();
    if(currentUser.emailVerified){
      if(!DEMO_MODE) await updateDoc(doc(db, 'users', currentUser.uid), { emailVerified: true });
      currentProfile.emailVerified = true;
      awaitingVerifyChoice = false;
      updateVerifyBanner();
      updateAccountSettingsDisplay('member');
      updateAccountSettingsDisplay('owner');
      enterDashboard();
    } else {
      statusEl.textContent = "We haven't detected your email verification yet — click the link in your inbox, then try again.";
    }
  } catch (err) {
    statusEl.textContent = friendlyAuthError(err);
  }
});

// Reopens the verify flow for an already-signed-in member from the
// dashboard banner (see updateVerifyBanner). Resumes at whichever step
// still isn't verified.
document.getElementById('verifyBannerBtn').addEventListener('click', async () => {
  pendingVerifyPhone = currentProfile?.phone || null;
  pendingVerifyEmail = currentProfile?.email || null;
  awaitingVerifyChoice = true;
  showPortalView('prospect');
  showAuthPanel('verify');
  document.getElementById('changePhoneStep').hidden = true;
  document.getElementById('changeEmailInVerifyStep').hidden = true;
  if(currentProfile?.phoneVerified !== true){
    showVerifyStep('phone');
    await startPhoneVerifyStep();
  } else {
    await startEmailVerifyStep();
  }
});

// Grandfathers every pre-upgrade account (emailVerified/phoneVerified were
// never set, so both read as `undefined`, not `false`) — only accounts
// that went through the new registration flow and explicitly haven't
// verified yet (both fields present and false) see the banner.
function updateVerifyBanner(){
  const banner = document.getElementById('verifyBanner');
  if(!banner || !currentProfile) return;
  // Grandfathers pre-upgrade accounts (fields never set at all — both read
  // `undefined`). Any account that has these fields (went through the new
  // registration flow) needs BOTH email and phone verified, not just one.
  const hasVerificationFields = currentProfile.emailVerified !== undefined || currentProfile.phoneVerified !== undefined;
  const needsVerification = hasVerificationFields &&
    !(currentProfile.emailVerified === true && currentProfile.phoneVerified === true);
  banner.hidden = !needsVerification;
}

document.getElementById('memberBookNew').addEventListener('click', () => {
  memberPortalDialog.close();
  openBooking('30-minute');
});

/* ---------------------------------------------------------------
   Account Settings — identical wiring for the 'member' and 'owner'
   dashboard copies of the settings panel (see accountSettingsHtml above).
   --------------------------------------------------------------- */
function updateAccountSettingsDisplay(p){
  if(!currentProfile) return;
  const emailEl = document.getElementById(p + 'AccountEmail');
  const phoneEl = document.getElementById(p + 'AccountPhone');
  const emailBadge = document.getElementById(p + 'EmailBadge');
  const phoneBadge = document.getElementById(p + 'PhoneBadge');
  if(emailEl) emailEl.textContent = currentProfile.email || (currentUser && currentUser.email) || '—';
  if(phoneEl) phoneEl.textContent = currentProfile.phone || 'Not added';
  if(emailBadge){
    const verified = currentProfile.emailVerified === true;
    emailBadge.textContent = verified ? 'Verified' : 'Not Verified';
    emailBadge.classList.toggle('is-verified', verified);
  }
  if(phoneBadge){
    const verified = currentProfile.phoneVerified === true;
    phoneBadge.textContent = currentProfile.phone ? (verified ? 'Verified' : 'Not Verified') : 'Not Added';
    phoneBadge.classList.toggle('is-verified', verified);
  }
}

function wireAccountSettings(p){
  document.getElementById(p + 'SignOut').addEventListener('click', () => signOut(auth));

  // ---- Change email (requires reauthentication) ----
  const changeEmailBtn = document.getElementById(p + 'ChangeEmailBtn');
  const changeEmailForm = document.getElementById(p + 'ChangeEmailForm');
  changeEmailBtn.addEventListener('click', () => { changeEmailForm.hidden = !changeEmailForm.hidden; });

  document.getElementById(p + 'SubmitChangeEmailBtn').addEventListener('click', async () => {
    const statusEl = document.getElementById(p + 'SettingsStatus');
    const password = document.getElementById(p + 'ReauthPassword').value;
    const newEmail = document.getElementById(p + 'NewEmail').value.trim();
    if(!password){ statusEl.textContent = 'Enter your current password to confirm this change.'; return; }
    if(!isValidEmail(newEmail)){ statusEl.textContent = 'Enter a valid new email address.'; return; }
    const btn = document.getElementById(p + 'SubmitChangeEmailBtn');
    btn.disabled = true;
    statusEl.textContent = 'Confirming your identity…';
    try {
      const credential = EmailAuthProvider.credential(currentUser.email, password);
      await reauthenticateWithCredential(currentUser, credential);
      statusEl.textContent = 'Sending verification to the new address…';
      await verifyBeforeUpdateEmail(currentUser, newEmail);
      statusEl.textContent = 'Check ' + newEmail + ' for a verification link. Your current email stays active until you confirm it.';
      document.getElementById(p + 'ReauthPassword').value = '';
      document.getElementById(p + 'NewEmail').value = '';
      changeEmailForm.hidden = true;
    } catch (err) {
      statusEl.textContent = friendlyAuthError(err);
    } finally {
      btn.disabled = false;
    }
  });

  // ---- Add / change phone ----
  const changePhoneBtn = document.getElementById(p + 'ChangePhoneBtn');
  const changePhoneForm = document.getElementById(p + 'ChangePhoneForm');
  changePhoneBtn.addEventListener('click', () => { changePhoneForm.hidden = !changePhoneForm.hidden; });

  let settingsRecaptcha = null;
  let settingsConfirmationResult = null;

  async function linkNewPhone(phone){
    if(!settingsRecaptcha){
      settingsRecaptcha = new RecaptchaVerifier(auth, 'recaptcha-container-' + p + 'settings', { size: 'invisible' });
    }
    try {
      return await linkWithPhoneNumber(currentUser, phone, settingsRecaptcha);
    } catch (err) {
      // A phone is already linked — unlink it first, then link the new one.
      if(err.code === 'auth/provider-already-linked'){
        await unlink(currentUser, 'phone');
        return await linkWithPhoneNumber(currentUser, phone, settingsRecaptcha);
      }
      throw err;
    }
  }

  document.getElementById(p + 'SendPhoneCodeBtn').addEventListener('click', async () => {
    const statusEl = document.getElementById(p + 'SettingsStatus');
    const phone = toE164(document.getElementById(p + 'NewPhoneCountry'), document.getElementById(p + 'NewPhoneNumber'));
    if(!phone){ statusEl.textContent = 'Enter a valid phone number, including country code.'; return; }
    const btn = document.getElementById(p + 'SendPhoneCodeBtn');
    btn.disabled = true;
    statusEl.textContent = 'Sending code…';
    try {
      settingsConfirmationResult = await linkNewPhone(phone);
      document.getElementById(p + 'PhoneCodeStep').hidden = false;
      statusEl.textContent = 'Code sent to ' + phone + '.';
    } catch (err) {
      statusEl.textContent = friendlyAuthError(err);
    } finally {
      btn.disabled = false;
    }
  });

  document.getElementById(p + 'ConfirmPhoneCodeBtn').addEventListener('click', async () => {
    const statusEl = document.getElementById(p + 'SettingsStatus');
    const code = document.getElementById(p + 'PhoneCode').value.trim();
    const phone = toE164(document.getElementById(p + 'NewPhoneCountry'), document.getElementById(p + 'NewPhoneNumber'));
    if(!settingsConfirmationResult || !code){ statusEl.textContent = 'Enter the 6-digit code.'; return; }
    statusEl.textContent = 'Verifying…';
    try {
      await settingsConfirmationResult.confirm(code);
      if(!DEMO_MODE) await updateDoc(doc(db, 'users', currentUser.uid), { phone, phoneVerified: true });
      currentProfile.phone = phone;
      currentProfile.phoneVerified = true;
      statusEl.textContent = 'Phone verified and updated.';
      updateAccountSettingsDisplay(p);
      updateVerifyBanner();
      changePhoneForm.hidden = true;
      document.getElementById(p + 'PhoneCodeStep').hidden = true;
      document.getElementById(p + 'PhoneCode').value = '';
    } catch (err) {
      statusEl.textContent = friendlyAuthError(err);
    }
  });
}
wireAccountSettings('member');
wireAccountSettings('owner');

/* ---------------------------------------------------------------
   Booking: availability + Firestore-backed scheduling
   --------------------------------------------------------------- */
const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
function sessionTypeName(id){
  return (SESSION_TYPES[id] && SESSION_TYPES[id].name) || id;
}
// Admin views always show the ministry's own time zone explicitly (not
// just whatever zone the admin's own browser happens to be in), plus the
// booker's selected zone when it's on record and different.
function ownerBookingTimeLine(b){
  let line = formatLocalDateTime(b.date, b.time, BUSINESS_TZ) + ' (Ministry time)';
  if(b.clientTimeZone && b.clientTimeZone !== BUSINESS_TZ){
    line += ' · ' + formatLocalDateTime(b.date, b.time, b.clientTimeZone) + ' (' + tzAbbrFor(b.clientTimeZone) + ', booker’s time zone)';
  }
  return line;
}
function tzAbbrFor(tz){
  try {
    const part = new Intl.DateTimeFormat('en-US', { timeZone: tz, timeZoneName: 'short' })
      .formatToParts(new Date()).find(p => p.type === 'timeZoneName');
    return part ? part.value : '';
  } catch (err) { return ''; }
}
function businessTzAbbr(){ return tzAbbrFor(BUSINESS_TZ); }

// A short, common-case list (like the country-code list above) rather
// than every IANA zone — "Other" lets someone type any valid IANA name
// directly so nobody is locked out.
const COMMON_TIMEZONES = [
  { tz: 'America/New_York', label: 'Eastern Time (US & Canada)' },
  { tz: 'America/Chicago', label: 'Central Time (US & Canada)' },
  { tz: 'America/Denver', label: 'Mountain Time (US & Canada)' },
  { tz: 'America/Phoenix', label: 'Arizona (no DST)' },
  { tz: 'America/Los_Angeles', label: 'Pacific Time (US & Canada)' },
  { tz: 'America/Anchorage', label: 'Alaska Time' },
  { tz: 'Pacific/Honolulu', label: 'Hawaii Time' },
  { tz: 'America/Puerto_Rico', label: 'Atlantic Time (Puerto Rico)' },
  { tz: 'Europe/London', label: 'London' },
  { tz: 'Europe/Paris', label: 'Central Europe' },
  { tz: 'Africa/Lagos', label: 'West Africa (Lagos)' },
  { tz: 'Africa/Nairobi', label: 'East Africa (Nairobi)' },
  { tz: 'Africa/Johannesburg', label: 'South Africa' },
  { tz: 'Asia/Kolkata', label: 'India' },
  { tz: 'Asia/Dubai', label: 'Gulf (Dubai)' },
  { tz: 'Australia/Sydney', label: 'Sydney' },
];
function availabilitySummaryText(){
  if(AVAILABILITY_RULES.length === 0) return 'Please contact us to schedule a session.';
  const byWindow = {};
  AVAILABILITY_RULES.forEach(r => {
    const key = r.startTime + '-' + r.endTime;
    (byWindow[key] = byWindow[key] || []).push(DAY_NAMES[r.dayOfWeek]);
  });
  const tzAbbr = businessTzAbbr();
  const parts = Object.keys(byWindow).map(key => {
    const [start, end] = key.split('-');
    return byWindow[key].join(' & ') + ', ' + minutesToLabel(hhmmToMinutes(start)) + '–' + minutesToLabel(hhmmToMinutes(end)) + (tzAbbr ? ' ' + tzAbbr : '');
  });
  return 'Sessions are held ' + parts.join('; ') + '. Your request is sent for confirmation — you\'ll be contacted at the email you provide.';
}

const bookingDialog = document.getElementById('bookingDialog');
const closeBooking = document.getElementById('closeBooking');
const bookingForm = document.getElementById('bookingForm');
const bookingStatus = document.getElementById('bookingStatus');
const bookingSubmitBtn = document.getElementById('bookingSubmitBtn');
const bookingDateInput = document.getElementById('bookingDate');
const bookingTimeSelect = document.getElementById('bookingTime');
const bookingOptionsEl = document.getElementById('bookingOptions');
const bookingIntroEl = document.getElementById('bookingIntro');
const bookingTimeZoneSelect = document.getElementById('bookingTimeZone');

bookingDateInput.min = new Date().toISOString().slice(0, 10);

if(bookingTimeZoneSelect){
  bookingTimeZoneSelect.innerHTML = COMMON_TIMEZONES.map(z =>
    '<option value="' + z.tz + '">' + escapeHtml(z.label) + ' (' + tzAbbrFor(z.tz) + ')</option>'
  ).join('') + '<option value="__other__">Other — type your time zone</option>';
}
function setDetectedTimeZoneDefault(){
  if(!bookingTimeZoneSelect) return;
  let detected = 'America/New_York';
  try { detected = Intl.DateTimeFormat().resolvedOptions().timeZone || detected; } catch (err) { /* keep default */ }
  const match = COMMON_TIMEZONES.find(z => z.tz === detected);
  bookingTimeZoneSelect.value = match ? detected : '__other__';
  if(!match){
    const opt = bookingTimeZoneSelect.querySelector('option[value="__other__"]');
    if(opt) opt.textContent = detected + ' (detected)';
    bookingTimeZoneSelect.dataset.otherTz = detected;
  }
}
function selectedBookingTimeZone(){
  if(!bookingTimeZoneSelect) return undefined;
  if(bookingTimeZoneSelect.value === '__other__') return bookingTimeZoneSelect.dataset.otherTz || undefined;
  return bookingTimeZoneSelect.value;
}
if(bookingTimeZoneSelect){
  bookingTimeZoneSelect.addEventListener('change', () => {
    if(bookingTimeZoneSelect.value === '__other__' && !bookingTimeZoneSelect.dataset.otherTz){
      const typed = window.prompt('Type your time zone (example: Europe/Berlin):', 'America/New_York');
      if(typed){
        try {
          new Intl.DateTimeFormat('en-US', { timeZone: typed }); // throws if invalid
          bookingTimeZoneSelect.dataset.otherTz = typed;
          const opt = bookingTimeZoneSelect.querySelector('option[value="__other__"]');
          if(opt) opt.textContent = typed;
        } catch (err) {
          bookingStatus.textContent = "That doesn't look like a valid time zone — try a format like Europe/Berlin.";
        }
      }
    }
    loadTimeSlots();
  });
}

function renderBookingOptions(){
  if(!bookingOptionsEl) return;
  const types = Object.keys(SESSION_TYPES)
    .map(id => ({ id, ...SESSION_TYPES[id] }))
    .filter(t => t.active !== false)
    .sort((a, b) => (a.order || 0) - (b.order || 0));
  bookingOptionsEl.innerHTML = types.map((t, i) => (
    '<label class="booking-option">' +
      '<input type="radio" name="sessionType" value="' + escapeHtml(t.id) + '"' + (i === 0 ? ' checked' : '') + ' />' +
      '<span><strong>' + escapeHtml(t.name) + '</strong><small>' + escapeHtml(t.description || '') +
      (t.price ? ' — $' + Number(t.price).toFixed(2) : '') + '</small></span>' +
    '</label>'
  )).join('');
  bookingOptionsEl.querySelectorAll('input[name="sessionType"]').forEach(radio => {
    radio.addEventListener('change', loadTimeSlots);
  });
}
renderBookingOptions();
if(bookingIntroEl) bookingIntroEl.textContent = availabilitySummaryText();

// Returns one entry per active (non-declined/cancelled) booking on that
// date: { time, start, end, bufferBefore, bufferAfter }. Buffer minutes
// come from THAT booking's own session type, so a booked session keeps
// its configured breathing room regardless of what's being checked
// against it.
async function bookedIntervalsForDate(dateStr){
  function toInterval(b){
    const start = hhmmToMinutes(b.time);
    const type = SESSION_TYPES[b.sessionType] || {};
    const dur = type.durationMinutes || 30;
    return { time: b.time, start, end: start + dur, bufferBefore: type.bufferBeforeMin || 0, bufferAfter: type.bufferAfterMin || 0 };
  }
  if(DEMO_MODE){
    return DEMO_BOOKINGS.filter(b => b.date === dateStr && b.status !== 'declined' && b.status !== 'cancelled').map(toInterval);
  }
  const snap = await getDocs(query(collection(db, 'bookings'), where('date', '==', dateStr)));
  const intervals = [];
  snap.forEach(docSnap => {
    const b = docSnap.data();
    if(b.status === 'declined' || b.status === 'cancelled') return;
    intervals.push(toInterval(b));
  });
  return intervals;
}

// Active (non-expired) temporary holds for a date — see "Temporary slot
// holds" below. A hold occupies its exact slot the same way a booking
// occupies it for capacity purposes, but carries no buffer of its own.
async function activeHoldsForDate(dateStr){
  const now = Date.now();
  if(DEMO_MODE){
    return DEMO_HOLDS.filter(h => h.date === dateStr && h.expiresAt > now);
  }
  try {
    const snap = await getDocs(query(collection(db, 'bookingHolds'), where('date', '==', dateStr)));
    const holds = [];
    snap.forEach(d => { const h = d.data(); if((h.expiresAt || 0) > now) holds.push({ id: d.id, ...h }); });
    return holds;
  } catch (err) { return []; }
}

function dateInAnyBlockoutRange(dateStr){
  return BLOCKOUT_RANGES.some(r => dateStr >= r.startDate && dateStr <= r.endDate);
}

async function computeOpenSlots(dateStr, duration, sessionTypeId){
  if(!dateStr) return { ok: false, reason: 'Choose a date first' };
  if(SCHEDULING_SETTINGS.bookingPaused) return { ok: false, reason: 'Booking is temporarily paused — please check back soon' };
  if(SCHEDULING_SETTINGS.minNoticeHours){
    const earliestDateStr = new Date(Date.now() + SCHEDULING_SETTINGS.minNoticeHours * 3600000).toISOString().slice(0, 10);
    if(dateStr < earliestDateStr) return { ok: false, reason: 'That date is too soon — please choose a later date' };
  }
  if(SCHEDULING_SETTINGS.maxAdvanceDays){
    const maxDateStr = new Date(Date.now() + SCHEDULING_SETTINGS.maxAdvanceDays * 86400000).toISOString().slice(0, 10);
    if(dateStr > maxDateStr) return { ok: false, reason: 'That date is too far out — please choose a closer date' };
  }
  // Single-date blocks (existing mechanism) and multi-day blockout ranges
  // (vacations/holidays) both rule a date out entirely.
  if(DEMO_MODE){
    if(DEMO_BLOCKED_DATES.includes(dateStr)) return { ok: false, reason: 'Not available on that date — please choose another' };
  } else {
    try {
      const blockSnap = await getDoc(doc(db, 'blockouts', dateStr));
      if(blockSnap.exists()) return { ok: false, reason: 'Not available on that date — please choose another' };
    } catch (err) { /* fall through */ }
  }
  if(dateInAnyBlockoutRange(dateStr)) return { ok: false, reason: 'Not available on that date — please choose another' };

  // A one-off override for this exact date replaces the normal weekly
  // windows entirely (extra hours, reduced hours, or fully closed).
  const override = AVAILABILITY_OVERRIDES[dateStr];
  let windows;
  if(override){
    if(override.closed) return { ok: false, reason: 'Not available on that date — please choose another' };
    windows = (override.windows || []).filter(w => !w.sessionTypeIds || w.sessionTypeIds.length === 0 || !sessionTypeId || w.sessionTypeIds.includes(sessionTypeId));
  } else {
    const weekday = new Date(dateStr + 'T12:00:00').getDay();
    windows = AVAILABILITY_RULES.filter(r => r.dayOfWeek === weekday &&
      (!r.sessionTypeIds || r.sessionTypeIds.length === 0 || !sessionTypeId || r.sessionTypeIds.includes(sessionTypeId)));
  }
  if(windows.length === 0) return { ok: false, reason: 'No sessions available on that day — please try another date' };

  let booked, holds;
  try {
    [booked, holds] = await Promise.all([bookedIntervalsForDate(dateStr), activeHoldsForDate(dateStr)]);
  } catch (err) {
    return { ok: false, reason: 'Could not load availability — try again' };
  }
  if(SCHEDULING_SETTINGS.maxBookingsPerDay && booked.length >= SCHEDULING_SETTINGS.maxBookingsPerDay){
    return { ok: false, reason: 'No open times on that date — the daily appointment limit has been reached' };
  }
  const heldTimes = new Set(holds.map(h => h.time));
  const sameSlotCounts = {};
  booked.forEach(b => { sameSlotCounts[b.time] = (sameSlotCounts[b.time] || 0) + 1; });

  const openStarts = new Set();
  windows.forEach(win => {
    const capacity = win.capacity || SCHEDULING_SETTINGS.defaultCapacityPerSlot || 1;
    const winStart = hhmmToMinutes(win.startTime);
    const winEnd = hhmmToMinutes(win.endTime);
    for(let start = winStart; start + duration <= winEnd; start += duration){
      const end = start + duration;
      const hhmm = minutesToHHMM(start);
      if(heldTimes.has(hhmm)) continue;
      const atCapacity = (sameSlotCounts[hhmm] || 0) >= capacity;
      if(atCapacity) continue;
      const bufferConflict = booked.some(b => {
        if(b.time === hhmm) return false; // same-slot sharing is governed by capacity, not buffer
        const bStart = b.start - b.bufferBefore;
        const bEnd = b.end + b.bufferAfter;
        return start < bEnd && end > bStart;
      });
      if(bufferConflict) continue;
      openStarts.add(start);
    }
  });
  if(openStarts.size === 0) return { ok: false, reason: 'No open times on that date' };
  return { ok: true, openStarts: Array.from(openStarts).sort((a, b) => a - b) };
}

async function populateTimeSelect(selectEl, dateStr, duration, sessionTypeId, tz){
  selectEl.innerHTML = '';
  selectEl.disabled = true;
  if(!dateStr){
    selectEl.appendChild(new Option('Choose a date first', ''));
    return;
  }
  selectEl.appendChild(new Option('Loading available times…', ''));
  const result = await computeOpenSlots(dateStr, duration, sessionTypeId);
  selectEl.innerHTML = '';
  if(!result.ok){
    selectEl.appendChild(new Option(result.reason, ''));
    return;
  }
  selectEl.appendChild(new Option('Choose a time', ''));
  const tzAbbr = tz ? tzAbbrFor(tz) : businessTzAbbr();
  result.openStarts.forEach(start => {
    const hhmm = minutesToHHMM(start);
    selectEl.appendChild(new Option(formatLocalTime(dateStr, hhmm, tz) + ' (' + minutesToLabel(start) + (tzAbbr ? ' ' + tzAbbr : '') + ')', hhmm));
  });
  selectEl.disabled = false;
}

async function loadTimeSlots(){
  await releaseCurrentHold();
  const dateStr = bookingDateInput.value;
  const checkedInput = bookingForm.querySelector('input[name="sessionType"]:checked');
  if(!checkedInput) return;
  const service = checkedInput.value;
  await populateTimeSelect(bookingTimeSelect, dateStr, SESSION_TYPES[service] && SESSION_TYPES[service].durationMinutes, service, selectedBookingTimeZone());
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
  setDetectedTimeZoneDefault();
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
// Fires on the X button, backdrop click, and Esc — one place to always
// release whatever slot hold this visitor was sitting on.
bookingDialog.addEventListener('close', () => { releaseCurrentHold(); });
bookingDateInput.addEventListener('change', loadTimeSlots);

/* ---------------------------------------------------------------
   Temporary slot holds — while someone has an open time selected in
   the booking dialog, nobody else can take it. Released automatically
   when they pick a different time/date, close the dialog, finish
   booking, or after HOLD_DURATION_MS with no action. This is real
   (Firestore-backed) on the production domain and demo-only (in
   memory) everywhere else, same split as the rest of the system.
   --------------------------------------------------------------- */
const HOLD_DURATION_MS = 10 * 60 * 1000;
let currentHoldDate = null;
let currentHoldTime = null;
let holdCountdownTimer = null;
const bookingHoldNotice = document.getElementById('bookingHoldNotice');

function holdIdFor(dateStr, time){ return dateStr + '_' + time + '_hold'; }

async function createHold(dateStr, time, sessionTypeId){
  const expiresAt = Date.now() + HOLD_DURATION_MS;
  const holdId = holdIdFor(dateStr, time);
  if(DEMO_MODE){
    const existing = DEMO_HOLDS.find(h => h.id === holdId && h.expiresAt > Date.now());
    if(existing) throw new Error('slot-taken');
    DEMO_HOLDS = DEMO_HOLDS.filter(h => h.id !== holdId);
    DEMO_HOLDS.push({ id: holdId, date: dateStr, time, sessionTypeId, expiresAt });
    return { expiresAt };
  }
  const holdRef = doc(db, 'bookingHolds', holdId);
  await runTransaction(db, async (tx) => {
    const holdSnap = await tx.get(holdRef);
    if(holdSnap.exists() && (holdSnap.data().expiresAt || 0) > Date.now()) throw new Error('slot-taken');
    const slotSnap = await tx.get(doc(db, 'slots', dateStr + '_' + time));
    if(slotSnap.exists()) throw new Error('slot-taken');
    tx.set(holdRef, { date: dateStr, time, sessionTypeId, expiresAt, createdAt: serverTimestamp() });
  });
  return { expiresAt };
}

async function releaseHold(dateStr, time){
  const holdId = holdIdFor(dateStr, time);
  if(DEMO_MODE){
    DEMO_HOLDS = DEMO_HOLDS.filter(h => h.id !== holdId);
    return;
  }
  try { await deleteDoc(doc(db, 'bookingHolds', holdId)); } catch (err) { /* ok if already gone */ }
}

function clearHoldCountdown(){
  if(holdCountdownTimer){ clearInterval(holdCountdownTimer); holdCountdownTimer = null; }
  if(bookingHoldNotice) bookingHoldNotice.textContent = '';
}

function startHoldCountdown(expiresAt){
  clearHoldCountdown();
  if(!bookingHoldNotice) return;
  const tick = () => {
    const secondsLeft = Math.max(0, Math.round((expiresAt - Date.now()) / 1000));
    if(secondsLeft <= 0){
      clearHoldCountdown();
      currentHoldDate = null; currentHoldTime = null;
      bookingStatus.textContent = 'Your hold on that time expired — please choose a time again.';
      loadTimeSlots();
      return;
    }
    const m = Math.floor(secondsLeft / 60), s = secondsLeft % 60;
    bookingHoldNotice.textContent = 'This time is held for you: ' + m + ':' + String(s).padStart(2, '0');
  };
  tick();
  holdCountdownTimer = setInterval(tick, 1000);
}

async function releaseCurrentHold(){
  clearHoldCountdown();
  if(currentHoldDate && currentHoldTime){
    const d = currentHoldDate, t = currentHoldTime;
    currentHoldDate = null; currentHoldTime = null;
    try { await releaseHold(d, t); } catch (err) { /* ignore */ }
  }
}

bookingTimeSelect.addEventListener('change', async () => {
  await releaseCurrentHold();
  const dateStr = bookingDateInput.value;
  const time = bookingTimeSelect.value;
  if(!dateStr || !time) return;
  const checkedInput = bookingForm.querySelector('input[name="sessionType"]:checked');
  const sessionTypeId = checkedInput ? checkedInput.value : null;
  try {
    const hold = await createHold(dateStr, time, sessionTypeId);
    currentHoldDate = dateStr; currentHoldTime = time;
    startHoldCountdown(hold.expiresAt);
  } catch (err) {
    bookingStatus.textContent = 'That time was just taken by someone else — please choose another.';
    loadTimeSlots();
  }
});

async function createBooking({ name, email, phone, reason, sessionType, date, time, status, uid, clientTimeZone }){
  const slotId = date + '_' + time;
  const startAtUTC = etWallTimeToDate(date, hhmmToMinutes(time));
  if(DEMO_MODE){
    if(DEMO_BOOKINGS.some(b => b.slotId === slotId && b.status !== 'declined' && b.status !== 'cancelled')){
      throw new Error('slot-taken');
    }
    DEMO_BOOKINGS.push({ id: 'demo-' + (++DEMO_BOOKING_SEQ), slotId, date, time, sessionType, name, email, phone: phone || null, reason: reason || null, uid: uid || null, status, startAtUTC, clientTimeZone });
    DEMO_HOLDS = DEMO_HOLDS.filter(h => h.id !== holdIdFor(date, time));
    return;
  }
  await runTransaction(db, async (tx) => {
    const slotRef = doc(db, 'slots', slotId);
    const slotSnap = await tx.get(slotRef);
    if(slotSnap.exists()) throw new Error('slot-taken');
    tx.set(slotRef, { date, time, sessionType, uid: uid || null, createdAt: serverTimestamp() });
    const bookingRef = doc(collection(db, 'bookings'));
    tx.set(bookingRef, { slotId, date, time, sessionType, name, email, phone: phone || null, reason: reason || null, uid: uid || null, status, startAtUTC, clientTimeZone: clientTimeZone || null, createdAt: serverTimestamp() });
  });
  try { await deleteDoc(doc(db, 'bookingHolds', holdIdFor(date, time))); } catch (err) { /* ok if already gone */ }
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
  const phone = toE164(document.getElementById('bookingPhoneCountry'), document.getElementById('bookingPhoneNumber'));
  const reason = document.getElementById('bookingReason').value.trim();
  if(!dateStr || !time){
    bookingStatus.textContent = 'Choose a date and an available time.';
    return;
  }
  if(!phone){
    bookingStatus.textContent = 'Enter a valid phone number, including country code.';
    return;
  }
  bookingSubmitBtn.disabled = true;
  bookingStatus.textContent = 'Requesting your session…';
  const clientTimeZone = selectedBookingTimeZone();
  try {
    await createBooking({
      name, email, phone, reason, sessionType: service, date: dateStr, time,
      status: 'pending', uid: currentUser ? currentUser.uid : null, clientTimeZone
    });
    markThrottled('lastBookingSubmit');
    bookingStatus.textContent = 'Request received — your ' + sessionTypeName(service) +
      ' session on ' + formatLocalDateTime(dateStr, time, clientTimeZone) + ' is pending confirmation. You will be contacted at ' + email + '.';
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

function populateAdminBookTypeSelect(){
  const current = adminBookTypeSelect.value;
  const ids = Object.keys(SESSION_TYPES).filter(id => SESSION_TYPES[id].active !== false)
    .sort((a, b) => (SESSION_TYPES[a].order || 0) - (SESSION_TYPES[b].order || 0));
  adminBookTypeSelect.innerHTML = ids.map(id => '<option value="' + escapeHtml(id) + '">' + escapeHtml(SESSION_TYPES[id].name) + '</option>').join('');
  if(ids.includes(current)) adminBookTypeSelect.value = current;
}

async function loadAdminTimeSlots(){
  const service = adminBookTypeSelect.value;
  await populateTimeSelect(adminBookTimeSelect, adminBookDateInput.value, SESSION_TYPES[service] && SESSION_TYPES[service].durationMinutes, service);
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
   Admin: scheduling settings (timezone, pause, session types,
   weekly availability windows). This panel is a VISUAL DEMONSTRATION
   ONLY for now, on every host including production — it is not yet
   approved to write to Firestore. Every save/add/delete below only
   mutates the in-memory SESSION_TYPES/AVAILABILITY_RULES/
   SCHEDULING_SETTINGS state that already drives the real booking
   system's defaults; nothing here is ever persisted, and a page
   refresh resets it back to the shipped defaults (Tue/Thu 2-6pm,
   30/15-minute sessions) — so the real booking system's behavior
   can never drift from what it is today. Reconnecting this panel to
   Firestore is a later, separately-approved phase.
   --------------------------------------------------------------- */
const schedTimezoneSelect = document.getElementById('schedTimezone');
const schedBookingPausedInput = document.getElementById('schedBookingPaused');
const schedMaxPerDayInput = document.getElementById('schedMaxPerDay');
const schedMinNoticeInput = document.getElementById('schedMinNotice');
const schedMaxAdvanceInput = document.getElementById('schedMaxAdvance');
const schedSettingsStatus = document.getElementById('schedSettingsStatus');
const schedTypesList = document.getElementById('schedTypesList');
const schedTypeForm = document.getElementById('schedTypeForm');
const schedTypeStatus = document.getElementById('schedTypeStatus');
const schedRulesList = document.getElementById('schedRulesList');
const schedRuleForm = document.getElementById('schedRuleForm');
const schedRuleStatus = document.getElementById('schedRuleStatus');
const schedRangesList = document.getElementById('schedRangesList');
const schedRangeForm = document.getElementById('schedRangeForm');
const schedRangeStatus = document.getElementById('schedRangeStatus');
const schedOverridesList = document.getElementById('schedOverridesList');
const schedOverrideForm = document.getElementById('schedOverrideForm');
const schedOverrideStatus = document.getElementById('schedOverrideStatus');
// A short "saved where" note so it's always clear whether an edit is
// real (production) or sample-only (every other host).
const SCHED_SAVE_NOTE = DEMO_MODE ? 'Saved to this preview only — sample data, not connected to the live scheduling system.' : 'Saved.';

function renderSchedSettingsForm(){
  if(!schedTimezoneSelect) return;
  schedTimezoneSelect.value = SCHEDULING_SETTINGS.ministryTimeZone || 'America/New_York';
  schedBookingPausedInput.checked = !!SCHEDULING_SETTINGS.bookingPaused;
  schedMaxPerDayInput.value = SCHEDULING_SETTINGS.maxBookingsPerDay || '';
  schedMinNoticeInput.value = SCHEDULING_SETTINGS.minNoticeHours || '';
  schedMaxAdvanceInput.value = SCHEDULING_SETTINGS.maxAdvanceDays || '';
}

function renderSchedTypesList(){
  if(!schedTypesList) return;
  const ids = Object.keys(SESSION_TYPES);
  if(ids.length === 0){
    schedTypesList.innerHTML = '<p style="color:#8a8a8a;font-size:12px">No session types yet — add one below.</p>';
    return;
  }
  schedTypesList.innerHTML = ids.map(id => {
    const t = SESSION_TYPES[id];
    const buffer = (t.bufferBeforeMin || t.bufferAfterMin) ? ' · buffer ' + (t.bufferBeforeMin || 0) + '/' + (t.bufferAfterMin || 0) + ' min' : '';
    return '<div class="portal-row" data-type-id="' + escapeHtml(id) + '" style="padding:8px 0">' +
      '<div><strong>' + escapeHtml(t.name) + '</strong><small>' + t.durationMinutes + ' min' +
      (t.price ? ' · $' + Number(t.price).toFixed(2) : ' · no charge') + buffer + (t.active === false ? ' · inactive' : '') + '</small></div>' +
      '<div style="display:flex;gap:8px">' +
      '<button class="portal-secondary sched-type-toggle" type="button" style="min-height:28px;padding:0 10px;font-size:9px">' +
        (t.active === false ? 'Activate' : 'Deactivate') + '</button>' +
      '<button class="portal-secondary sched-type-delete" type="button" style="min-height:28px;padding:0 10px;font-size:9px">Delete</button>' +
      '</div></div>';
  }).join('');
}

function renderSchedRulesList(){
  if(!schedRulesList) return;
  if(AVAILABILITY_RULES.length === 0){
    schedRulesList.innerHTML = '<p style="color:#8a8a8a;font-size:12px">No availability windows yet — booking is effectively closed until you add one.</p>';
    return;
  }
  schedRulesList.innerHTML = AVAILABILITY_RULES.map(r => {
    return '<div class="portal-row" data-rule-id="' + escapeHtml(r.id || '') + '" style="padding:8px 0">' +
      '<div><strong>' + DAY_NAMES[r.dayOfWeek] + '</strong><small>' + minutesToLabel(hhmmToMinutes(r.startTime)) + '–' + minutesToLabel(hhmmToMinutes(r.endTime)) +
      ' · capacity ' + (r.capacity || 1) + '</small></div>' +
      '<button class="portal-secondary sched-rule-delete" type="button" style="min-height:28px;padding:0 10px;font-size:9px">Remove</button>' +
      '</div>';
  }).join('');
}

function renderSchedRangesList(){
  if(!schedRangesList) return;
  if(BLOCKOUT_RANGES.length === 0){
    schedRangesList.innerHTML = '<p style="color:#8a8a8a;font-size:12px">No blocked date ranges.</p>';
    return;
  }
  schedRangesList.innerHTML = BLOCKOUT_RANGES.map(r =>
    '<div class="portal-row" data-range-id="' + escapeHtml(r.id || '') + '" style="padding:8px 0">' +
    '<div><strong>' + escapeHtml(r.startDate) + ' – ' + escapeHtml(r.endDate) + '</strong>' +
    (r.reason ? '<small>' + escapeHtml(r.reason) + '</small>' : '') + '</div>' +
    '<button class="portal-secondary sched-range-delete" type="button" style="min-height:28px;padding:0 10px;font-size:9px">Remove</button></div>'
  ).join('');
}

function renderSchedOverridesList(){
  if(!schedOverridesList) return;
  const dates = Object.keys(AVAILABILITY_OVERRIDES).sort();
  if(dates.length === 0){
    schedOverridesList.innerHTML = '<p style="color:#8a8a8a;font-size:12px">No special-date overrides.</p>';
    return;
  }
  schedOverridesList.innerHTML = dates.map(d => {
    const o = AVAILABILITY_OVERRIDES[d];
    const desc = o.closed ? 'Fully closed' : (o.windows || []).map(w => minutesToLabel(hhmmToMinutes(w.startTime)) + '–' + minutesToLabel(hhmmToMinutes(w.endTime))).join(', ');
    return '<div class="portal-row" data-override-date="' + escapeHtml(d) + '" style="padding:8px 0">' +
      '<div><strong>' + escapeHtml(d) + '</strong><small>' + escapeHtml(desc) + '</small></div>' +
      '<button class="portal-secondary sched-override-delete" type="button" style="min-height:28px;padding:0 10px;font-size:9px">Remove</button></div>';
  }).join('');
}

if(schedTimezoneSelect){
  let schedRuleSeq = 1, schedRangeSeq = 1;

  document.getElementById('schedSettingsSaveBtn').addEventListener('click', async () => {
    const updated = {
      ...SCHEDULING_SETTINGS,
      ministryTimeZone: schedTimezoneSelect.value,
      bookingPaused: schedBookingPausedInput.checked,
      maxBookingsPerDay: schedMaxPerDayInput.value ? Number(schedMaxPerDayInput.value) : null,
      minNoticeHours: schedMinNoticeInput.value ? Number(schedMinNoticeInput.value) : null,
      maxAdvanceDays: schedMaxAdvanceInput.value ? Number(schedMaxAdvanceInput.value) : null
    };
    schedSettingsStatus.textContent = 'Saving…';
    if(DEMO_MODE){
      SCHEDULING_SETTINGS = updated;
    } else {
      try { await setDoc(doc(db, 'schedulingSettings', 'global'), updated); await loadSchedulingConfig(); }
      catch (err) { schedSettingsStatus.textContent = 'Could not save settings.'; return; }
    }
    BUSINESS_TZ = SCHEDULING_SETTINGS.ministryTimeZone || 'America/New_York';
    if(bookingIntroEl) bookingIntroEl.textContent = availabilitySummaryText();
    schedSettingsStatus.textContent = SCHED_SAVE_NOTE;
  });

  schedTypeForm.addEventListener('submit', async event => {
    event.preventDefault();
    const id = document.getElementById('schedTypeId').value.trim();
    const name = document.getElementById('schedTypeName').value.trim();
    const duration = Number(document.getElementById('schedTypeDuration').value);
    const priceRaw = document.getElementById('schedTypePrice').value;
    const bufferBeforeMin = Number(document.getElementById('schedTypeBufferBefore').value || 0);
    const bufferAfterMin = Number(document.getElementById('schedTypeBufferAfter').value || 0);
    const description = document.getElementById('schedTypeDescription').value.trim();
    if(!id || !name || !duration){ schedTypeStatus.textContent = 'ID, name, and minutes are required.'; return; }
    const existing = SESSION_TYPES[id] || {};
    const data = {
      name, durationMinutes: duration,
      price: priceRaw ? Number(priceRaw) : null,
      bufferBeforeMin, bufferAfterMin,
      description, active: existing.active !== false,
      order: existing.order || (Object.keys(SESSION_TYPES).length + 1)
    };
    schedTypeStatus.textContent = 'Saving…';
    if(DEMO_MODE){
      SESSION_TYPES[id] = data;
    } else {
      try { await setDoc(doc(db, 'sessionTypes', id), data); await loadSchedulingConfig(); }
      catch (err) { schedTypeStatus.textContent = 'Could not save that session type.'; return; }
    }
    renderSchedTypesList();
    renderBookingOptions();
    populateAdminBookTypeSelect();
    schedTypeForm.reset();
    schedTypeStatus.textContent = SCHED_SAVE_NOTE;
  });

  schedTypesList.addEventListener('click', async event => {
    const toggleBtn = event.target.closest('.sched-type-toggle');
    const deleteBtn = event.target.closest('.sched-type-delete');
    if(!toggleBtn && !deleteBtn) return;
    const row = event.target.closest('[data-type-id]');
    const id = row.dataset.typeId;
    if(DEMO_MODE){
      if(toggleBtn) SESSION_TYPES[id].active = SESSION_TYPES[id].active === false;
      else delete SESSION_TYPES[id];
    } else {
      try {
        if(toggleBtn) await setDoc(doc(db, 'sessionTypes', id), { ...SESSION_TYPES[id], active: SESSION_TYPES[id].active === false });
        else await deleteDoc(doc(db, 'sessionTypes', id));
        await loadSchedulingConfig();
      } catch (err) { return; }
    }
    renderSchedTypesList();
    renderBookingOptions();
    populateAdminBookTypeSelect();
  });

  schedRuleForm.addEventListener('submit', async event => {
    event.preventDefault();
    const dayOfWeek = Number(document.getElementById('schedRuleDay').value);
    const startTime = document.getElementById('schedRuleStart').value;
    const endTime = document.getElementById('schedRuleEnd').value;
    const capacity = Math.max(1, Number(document.getElementById('schedRuleCapacity').value || 1));
    if(!startTime || !endTime || endTime <= startTime){ schedRuleStatus.textContent = 'Choose a valid start and end time.'; return; }
    const data = { dayOfWeek, startTime, endTime, sessionTypeIds: [], capacity };
    schedRuleStatus.textContent = 'Saving…';
    if(DEMO_MODE){
      AVAILABILITY_RULES.push({ id: 'preview-rule-' + (schedRuleSeq++), ...data });
    } else {
      try { await setDoc(doc(collection(db, 'availabilityRules')), data); await loadSchedulingConfig(); }
      catch (err) { schedRuleStatus.textContent = 'Could not add that window.'; return; }
    }
    renderSchedRulesList();
    if(bookingIntroEl) bookingIntroEl.textContent = availabilitySummaryText();
    schedRuleForm.reset();
    schedRuleStatus.textContent = SCHED_SAVE_NOTE;
  });

  schedRulesList.addEventListener('click', async event => {
    const deleteBtn = event.target.closest('.sched-rule-delete');
    if(!deleteBtn) return;
    const row = event.target.closest('[data-rule-id]');
    if(DEMO_MODE){
      const idx = AVAILABILITY_RULES.findIndex(r => r.id === row.dataset.ruleId);
      if(idx !== -1) AVAILABILITY_RULES.splice(idx, 1);
    } else {
      try { await deleteDoc(doc(db, 'availabilityRules', row.dataset.ruleId)); await loadSchedulingConfig(); }
      catch (err) { return; }
    }
    renderSchedRulesList();
    if(bookingIntroEl) bookingIntroEl.textContent = availabilitySummaryText();
  });

  schedRangeForm.addEventListener('submit', async event => {
    event.preventDefault();
    const startDate = document.getElementById('schedRangeStart').value;
    const endDate = document.getElementById('schedRangeEnd').value;
    const reason = document.getElementById('schedRangeReason').value.trim();
    if(!startDate || !endDate || endDate < startDate){ schedRangeStatus.textContent = 'Choose a valid date range.'; return; }
    const data = { startDate, endDate, reason };
    schedRangeStatus.textContent = 'Saving…';
    if(DEMO_MODE){
      BLOCKOUT_RANGES.push({ id: 'preview-range-' + (schedRangeSeq++), ...data });
    } else {
      try { await setDoc(doc(collection(db, 'blockoutRanges')), data); await loadSchedulingConfig(); }
      catch (err) { schedRangeStatus.textContent = 'Could not save that range.'; return; }
    }
    renderSchedRangesList();
    schedRangeForm.reset();
    schedRangeStatus.textContent = SCHED_SAVE_NOTE;
  });

  schedRangesList.addEventListener('click', async event => {
    const deleteBtn = event.target.closest('.sched-range-delete');
    if(!deleteBtn) return;
    const row = event.target.closest('[data-range-id]');
    if(DEMO_MODE){
      const idx = BLOCKOUT_RANGES.findIndex(r => r.id === row.dataset.rangeId);
      if(idx !== -1) BLOCKOUT_RANGES.splice(idx, 1);
    } else {
      try { await deleteDoc(doc(db, 'blockoutRanges', row.dataset.rangeId)); await loadSchedulingConfig(); }
      catch (err) { return; }
    }
    renderSchedRangesList();
  });

  schedOverrideForm.addEventListener('submit', async event => {
    event.preventDefault();
    const date = document.getElementById('schedOverrideDate').value;
    const start = document.getElementById('schedOverrideStart').value;
    const end = document.getElementById('schedOverrideEnd').value;
    const closed = document.getElementById('schedOverrideClosed').checked;
    if(!date){ schedOverrideStatus.textContent = 'Choose a date.'; return; }
    let data;
    if(closed){
      data = { closed: true, windows: [] };
    } else {
      if(!start || !end || end <= start){ schedOverrideStatus.textContent = 'Set a valid start and end time, or check "Fully closed".'; return; }
      data = { closed: false, windows: [{ startTime: start, endTime: end, capacity: 1, sessionTypeIds: [] }] };
    }
    schedOverrideStatus.textContent = 'Saving…';
    if(DEMO_MODE){
      AVAILABILITY_OVERRIDES[date] = data;
    } else {
      try { await setDoc(doc(db, 'availabilityOverrides', date), data); await loadSchedulingConfig(); }
      catch (err) { schedOverrideStatus.textContent = 'Could not save that override.'; return; }
    }
    renderSchedOverridesList();
    schedOverrideForm.reset();
    schedOverrideStatus.textContent = SCHED_SAVE_NOTE;
  });

  schedOverridesList.addEventListener('click', async event => {
    const deleteBtn = event.target.closest('.sched-override-delete');
    if(!deleteBtn) return;
    const row = event.target.closest('[data-override-date]');
    const date = row.dataset.overrideDate;
    if(DEMO_MODE){
      delete AVAILABILITY_OVERRIDES[date];
    } else {
      try { await deleteDoc(doc(db, 'availabilityOverrides', date)); await loadSchedulingConfig(); }
      catch (err) { return; }
    }
    renderSchedOverridesList();
  });
}

/* ---------------------------------------------------------------
   Member dashboard: real bookings
   --------------------------------------------------------------- */
function memberBookingRowHtml(b, today){
  const label = sessionTypeName(b.sessionType);
  const statusLabel = b.status === 'confirmed' ? 'Confirmed' : b.status === 'declined' ? 'Declined' : b.status === 'cancelled' ? 'Cancelled' : 'Pending';
  const canCancel = (b.status === 'pending' || b.status === 'confirmed') && b.date >= today;
  const tzNote = b.clientTimeZone ? ' (' + tzAbbrFor(b.clientTimeZone) + ')' : '';
  return '<div class="portal-row" data-booking-id="' + b.id + '" data-slot-id="' + escapeHtml(b.slotId || '') + '" data-session-type="' + escapeHtml(b.sessionType) + '">' +
    '<div><strong>' + escapeHtml(label) + '</strong><small>' + escapeHtml(formatLocalDateTime(b.date, b.time, b.clientTimeZone) + tzNote) + '</small></div>' +
    '<div style="display:flex;align-items:center;gap:10px">' +
    '<span class="portal-access">' + statusLabel + '</span>' +
    (canCancel ? '<button class="portal-secondary member-reschedule-booking" type="button" style="min-height:32px;padding:0 10px;font-size:9px">Reschedule</button>' +
      '<button class="portal-secondary member-cancel-booking" type="button" style="min-height:32px;padding:0 10px;font-size:9px">Cancel</button>' : '') +
    '</div></div>';
}

async function loadMemberBookings(){
  const container = document.getElementById('memberBookingsList');
  if(!currentUser){ container.innerHTML = ''; return; }
  container.innerHTML = '<p style="color:#d7d7d7">Loading your bookings…</p>';
  const today = new Date().toISOString().slice(0, 10);
  if(DEMO_MODE){
    const rows = DEMO_BOOKINGS.filter(b => b.uid === null || b.uid === currentUser.uid)
      .sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
    container.innerHTML = rows.length === 0
      ? '<p style="color:#d7d7d7">No bookings yet — request a session below.</p>'
      : rows.map(b => memberBookingRowHtml(b, today)).join('');
    return;
  }
  try {
    const snap = await getDocs(query(collection(db, 'bookings'), where('uid', '==', currentUser.uid)));
    if(snap.empty){
      container.innerHTML = '<p style="color:#d7d7d7">No bookings yet — request a session below.</p>';
      return;
    }
    const rows = [];
    snap.forEach(docSnap => rows.push({ id: docSnap.id, ...docSnap.data() }));
    rows.sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
    container.innerHTML = rows.map(b => memberBookingRowHtml(b, today)).join('');
  } catch (err) {
    container.innerHTML = '<p style="color:#d7d7d7">Could not load your bookings.</p>';
  }
}

async function cancelOwnBooking(bookingId, slotId){
  if(DEMO_MODE){
    const b = DEMO_BOOKINGS.find(x => x.id === bookingId);
    if(b) b.status = 'cancelled';
    return;
  }
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
   Admin Notification Center — visual demonstration only, on every
   host including production. Sample entries only; real email/SMS
   alerts are a later, separately-approved phase (SMS specifically
   needs a real provider like Twilio — Firebase Phone Auth is only
   ever for sign-in verification, never general notifications).
   --------------------------------------------------------------- */
const DEMO_NOTIFICATIONS = [
  { id: 'n1', title: 'New booking request', detail: 'Jordan Lee requested a 30-Minute One-on-One.', read: false },
  { id: 'n2', title: 'Payment received (sample)', detail: "Sample payment confirmation for Amara Okafor's session.", read: false },
  { id: 'n3', title: 'Class registration (sample)', detail: 'Sam Rivera registered for Learning to Discern.', read: true },
];
function renderOwnerNotifications(){
  const container = document.getElementById('ownerNotificationsList');
  if(!container) return;
  container.innerHTML = DEMO_NOTIFICATIONS.map(n =>
    '<div class="portal-row" data-notif-id="' + n.id + '" style="opacity:' + (n.read ? '.55' : '1') + '">' +
    '<div><strong>' + escapeHtml(n.title) + '</strong><small>' + escapeHtml(n.detail) + '</small></div>' +
    '<button class="portal-secondary owner-notif-toggle" type="button" style="min-height:28px;padding:0 10px;font-size:9px">' +
    (n.read ? 'Mark Unread' : 'Mark Read') + '</button></div>'
  ).join('');
}
document.addEventListener('click', event => {
  const btn = event.target.closest('.owner-notif-toggle');
  if(!btn) return;
  const row = event.target.closest('[data-notif-id]');
  const n = DEMO_NOTIFICATIONS.find(x => x.id === row.dataset.notifId);
  if(n) n.read = !n.read;
  renderOwnerNotifications();
});

/* ---------------------------------------------------------------
   Ministry (admin) view: pending bookings, roster, blockouts
   --------------------------------------------------------------- */
/* ---------------------------------------------------------------
   Owner dashboard — main navigation. Existing panels (Bookings,
   Teaching Manager, Member Accounts, Account Settings) are untouched
   — they're just tagged with data-owner-section and shown/hidden by
   the sidebar below, so nothing about how they work changed, only
   where they live.
   --------------------------------------------------------------- */
const OWNER_SECTION_DESCRIPTIONS = {
  dashboard: "A quick look at what's happening across the site.",
  teachings: 'Create, edit, and publish the weekly Teaching classes.',
  website: 'Control the words and images visitors see on each page.',
  payments: 'Every payment collected through the website, in one place.',
  bookings: 'Manage one-on-one session requests and your weekly availability.',
  people: 'Everyone who has created an account.',
  media: 'Every image currently uploaded to the website.',
  settings: 'Your sign-in email, phone, and password.'
};
function showOwnerSection(name){
  document.querySelectorAll('#ownerSidebar .owner-sidebar-item').forEach(b => b.classList.toggle('active', b.dataset.ownerNav === name));
  document.querySelectorAll('[data-owner-section]').forEach(p => { p.hidden = p.dataset.ownerSection !== name; });
  const desc = document.getElementById('ownerSectionDescription');
  if(desc) desc.textContent = OWNER_SECTION_DESCRIPTIONS[name] || '';
  closeOwnerSidebarDrawer();
}
function openOwnerSidebarDrawer(){
  document.getElementById('ownerSidebar').classList.add('open');
  document.getElementById('ownerSidebarBackdrop').classList.add('open');
}
function closeOwnerSidebarDrawer(){
  document.getElementById('ownerSidebar').classList.remove('open');
  document.getElementById('ownerSidebarBackdrop').classList.remove('open');
}
document.getElementById('ownerSidebar').addEventListener('click', event => {
  const btn = event.target.closest('.owner-sidebar-item');
  if(btn) showOwnerSection(btn.dataset.ownerNav);
});
document.getElementById('ownerSidebarToggle').addEventListener('click', openOwnerSidebarDrawer);
document.getElementById('ownerSidebarBackdrop').addEventListener('click', closeOwnerSidebarDrawer);
showOwnerSection('dashboard');

function updateOwnerSidebarProfile(){
  if(!currentProfile) return;
  const name = currentProfile.name || currentProfile.email || 'Signed in';
  document.getElementById('ownerSidebarName').textContent = name;
  document.getElementById('ownerSidebarAvatar').textContent = name.trim().charAt(0).toUpperCase() || '?';
}

/* ---------------------------------------------------------------
   Owner Appearance — a per-browser preference for how the OWNER
   DASHBOARD looks (not the public website). Stored in localStorage
   only; applied via data-owner-style/data-owner-mode/data-owner-accent
   on <body>, which every owner- and admin- prefixed CSS rule reads through the
   --owner-* custom properties defined in styles.css.
   --------------------------------------------------------------- */
const OWNER_APPEARANCE_KEY = 'ua_owner_appearance_v1';
function loadOwnerAppearance(){
  try {
    const raw = localStorage.getItem(OWNER_APPEARANCE_KEY);
    if(raw) return { style: 'modern', mode: 'light', accent: 'ink', ...JSON.parse(raw) };
  } catch (err) { /* ignore */ }
  return { style: 'modern', mode: 'light', accent: 'ink' };
}
function saveOwnerAppearance(pref){
  try { localStorage.setItem(OWNER_APPEARANCE_KEY, JSON.stringify(pref)); } catch (err) { /* ignore */ }
}
function renderOwnerAppearanceControls(pref){
  document.querySelectorAll('#appearanceStyleRow [data-appearance-style]').forEach(b => b.classList.toggle('active', b.dataset.appearanceStyle === pref.style));
  document.querySelectorAll('#appearanceModeRow [data-appearance-mode]').forEach(b => b.classList.toggle('active', b.dataset.appearanceMode === pref.mode));
  document.querySelectorAll('#appearanceAccentRow [data-appearance-accent]').forEach(b => b.classList.toggle('active', b.dataset.appearanceAccent === pref.accent));
}
function applyOwnerAppearance(){
  const pref = loadOwnerAppearance();
  let effectiveMode = pref.mode;
  if(effectiveMode === 'system'){
    effectiveMode = (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) ? 'dark' : 'light';
  }
  document.body.dataset.ownerStyle = pref.style === 'classic' ? 'classic' : 'modern';
  document.body.dataset.ownerMode = effectiveMode === 'dark' ? 'dark' : 'light';
  document.body.dataset.ownerAccent = pref.accent || 'ink';
  renderOwnerAppearanceControls(pref);
}
document.getElementById('appearanceStyleRow').addEventListener('click', event => {
  const btn = event.target.closest('[data-appearance-style]');
  if(!btn) return;
  const pref = loadOwnerAppearance();
  pref.style = btn.dataset.appearanceStyle;
  saveOwnerAppearance(pref);
  applyOwnerAppearance();
});
document.getElementById('appearanceModeRow').addEventListener('click', event => {
  const btn = event.target.closest('[data-appearance-mode]');
  if(!btn) return;
  const pref = loadOwnerAppearance();
  pref.mode = btn.dataset.appearanceMode;
  saveOwnerAppearance(pref);
  applyOwnerAppearance();
});
document.getElementById('appearanceAccentRow').addEventListener('click', event => {
  const btn = event.target.closest('[data-appearance-accent]');
  if(!btn) return;
  const pref = loadOwnerAppearance();
  pref.accent = btn.dataset.appearanceAccent;
  saveOwnerAppearance(pref);
  applyOwnerAppearance();
});
applyOwnerAppearance();

async function renderOwnerDashboardStats(){
  const wrap = document.getElementById('ownerDashboardStats');
  if(!wrap) return;
  const welcome = document.getElementById('ownerDashboardWelcome');
  if(welcome && currentProfile){
    const firstName = (currentProfile.name || '').split(' ')[0];
    welcome.textContent = 'Welcome back' + (firstName ? ', ' + firstName : '') + '.';
  }
  let memberCount = '—', pendingBookings = [];
  try {
    if(DEMO_MODE){
      memberCount = String(DEMO_MEMBERS.length);
      pendingBookings = DEMO_BOOKINGS.filter(b => b.status === 'pending');
    } else {
      const [usersSnap, bookingsSnap] = await Promise.all([
        getDocs(collection(db, 'users')),
        getDocs(query(collection(db, 'bookings'), where('status', '==', 'pending')))
      ]);
      memberCount = String(usersSnap.size);
      bookingsSnap.forEach(d => pendingBookings.push({ id: d.id, ...d.data() }));
    }
  } catch (err) { /* leave placeholders */ }
  const upcomingClassCount = teachingsForTab('upcoming').length;
  const draftCount = Object.values(TEACHINGS).filter(t => t.status === 'draft').length;
  wrap.innerHTML =
    '<div class="admin-stat-tile"><span>Total Members</span><strong>' + memberCount + '</strong></div>' +
    '<div class="admin-stat-tile"><span>Upcoming Classes</span><strong>' + upcomingClassCount + '</strong><em>' + draftCount + ' in drafts</em></div>' +
    '<div class="admin-stat-tile"><span>1:1 Bookings Pending</span><strong>' + pendingBookings.length + '</strong></div>' +
    '<div class="admin-stat-tile"><span>Revenue</span><strong style="font-size:14px;color:var(--owner-text-muted)">Payment system not connected</strong></div>';

  const activityWrap = document.getElementById('ownerRecentActivity');
  if(activityWrap){
    const lines = [];
    pendingBookings.slice(0, 4).forEach(b => lines.push('New booking request from ' + (b.name || 'a visitor') + (b.date ? ' — ' + formatTeachingDateShort(b.date) : '')));
    if(draftCount > 0) lines.push(draftCount + ' teaching' + (draftCount === 1 ? '' : 's') + ' saved as draft, not yet published');
    if(lines.length === 0) lines.push('Nothing new right now — you\'re all caught up.');
    activityWrap.innerHTML = lines.map(l => '<div class="admin-hint" style="padding:9px 0;border-bottom:1px solid var(--owner-border)">' + escapeHtml(l) + '</div>').join('');
  }
}
document.getElementById('ownerQuickActions').addEventListener('click', event => {
  const btn = event.target.closest('[data-quick-action]');
  if(!btn) return;
  const action = btn.dataset.quickAction;
  if(action === 'new-teaching'){ showOwnerSection('teachings'); openTeachingEditor(null); }
  else if(action === 'media'){ showOwnerSection('media'); }
  else if(action === 'bookings'){ showOwnerSection('bookings'); }
  else if(action === 'registrants'){ showOwnerSection('teachings'); }
  else if(action === 'website'){ showOwnerSection('website'); }
});

const OWNER_WEBSITE_PAGES = ['Home Page', 'Teaching Page', 'Prayer Page', 'Our Story', 'Beliefs', 'Gather', 'Connect', 'Give', 'Shop', 'Navigation', 'Footer'];
function renderOwnerWebsitePages(){
  const wrap = document.getElementById('ownerWebsitePagesList');
  if(!wrap) return;
  wrap.innerHTML = OWNER_WEBSITE_PAGES.map(name =>
    '<div class="admin-website-page-row"><span>' + escapeHtml(name) + '</span><span class="demo-badge">Not Yet Connected</span></div>'
  ).join('');
}

// No real payment processor is connected anywhere in this project yet
// (one-on-one booking, Teaching registration, and Shop all remain
// unpaid/placeholder) — so this section is honestly empty rather than
// showing invented transactions. The category tabs still switch (so
// the intended structure is visible), they just all show the same
// honest "not connected" message underneath since there's nothing to
// filter yet.
document.getElementById('ownerPaymentsTabs').addEventListener('click', event => {
  const btn = event.target.closest('.admin-tab');
  if(!btn) return;
  document.querySelectorAll('#ownerPaymentsTabs .admin-tab').forEach(b => b.classList.toggle('active', b === btn));
});

function renderOwnerMediaGallery(){
  const wrap = document.getElementById('ownerMediaGallery');
  if(!wrap) return;
  const items = [];
  Object.values(TEACHINGS).forEach(t => {
    const art = t.artwork || {};
    if(art.hero) items.push({ url: art.hero, label: (t.title || 'Untitled') + ' — Hero' });
    if(art.card) items.push({ url: art.card, label: (t.title || 'Untitled') + ' — Card' });
    if(art.heroMobile) items.push({ url: art.heroMobile, label: (t.title || 'Untitled') + ' — Mobile' });
  });
  if(TEACHING_PAGE_SETTINGS.scriptureImage) items.push({ url: TEACHING_PAGE_SETTINGS.scriptureImage, label: 'Scripture Section' });
  wrap.innerHTML = items.length === 0
    ? '<p style="color:#8a8578;font-size:13px">No images uploaded yet — add one from Teachings → open a class → Images.</p>'
    : items.map(i => '<div class="admin-media-item"><div class="admin-media-thumb" style="background-image:url(\'' + i.url.replace(/'/g, '%27') + '\')"></div><span>' + escapeHtml(i.label) + '</span></div>').join('');
}

async function loadOwnerData(){
  if(!currentProfile || currentProfile.role !== 'admin') return;
  updateOwnerSidebarProfile();
  applyOwnerAppearance();
  if(!DEMO_MODE){ try { await loadSchedulingConfig(); } catch (err) { /* keep whatever is already loaded */ } }
  if(!DEMO_MODE){ try { await loadTeachingPageConfig(); } catch (err) { /* keep whatever is already loaded */ } }
  renderSchedSettingsForm();
  renderSchedTypesList();
  renderSchedRulesList();
  renderSchedRangesList();
  renderSchedOverridesList();
  populateAdminBookTypeSelect();
  renderOwnerNotifications();
  renderTeachingManager();
  renderOwnerWebsitePages();
  renderOwnerMediaGallery();
  await Promise.all([loadOwnerBookings(), loadOwnerConfirmed(), loadOwnerMembers(), loadBlockedDates(), renderOwnerDashboardStats()]);
}

async function rescheduleBooking(bookingId, oldSlotId, newDate, newTime, sessionType, uid){
  const newSlotId = newDate + '_' + newTime;
  if(newSlotId === oldSlotId) return;
  const startAtUTC = etWallTimeToDate(newDate, hhmmToMinutes(newTime));
  if(DEMO_MODE){
    if(DEMO_BOOKINGS.some(b => b.slotId === newSlotId && b.id !== bookingId && b.status !== 'declined' && b.status !== 'cancelled')){
      throw new Error('slot-taken');
    }
    const b = DEMO_BOOKINGS.find(x => x.id === bookingId);
    if(b){ b.date = newDate; b.time = newTime; b.slotId = newSlotId; b.startAtUTC = startAtUTC; }
    return;
  }
  await runTransaction(db, async (tx) => {
    const newSlotRef = doc(db, 'slots', newSlotId);
    const newSlotSnap = await tx.get(newSlotRef);
    if(newSlotSnap.exists()) throw new Error('slot-taken');
    if(oldSlotId) tx.delete(doc(db, 'slots', oldSlotId));
    tx.set(newSlotRef, { date: newDate, time: newTime, sessionType, uid: uid || null, createdAt: serverTimestamp() });
    tx.update(doc(db, 'bookings', bookingId), { date: newDate, time: newTime, slotId: newSlotId, startAtUTC });
  });
}

function ownerConfirmedRowHtml(b){
  const label = sessionTypeName(b.sessionType);
  return '<div class="portal-request" data-booking-id="' + b.id + '" data-slot-id="' + escapeHtml(b.slotId || '') +
    '" data-uid="' + escapeHtml(b.uid || '') + '" data-session-type="' + escapeHtml(b.sessionType) + '">' +
    '<div style="flex:1;min-width:0">' +
    '<div style="display:flex;justify-content:space-between;gap:14px">' +
    '<div><strong>' + escapeHtml(b.name) + '</strong><p>' + escapeHtml(label) + ' · ' + escapeHtml(ownerBookingTimeLine(b)) +
    ' · ' + escapeHtml(b.email) + (b.phone ? ' · ' + escapeHtml(b.phone) : '') + (b.reason ? '<br>“' + escapeHtml(b.reason) + '”' : '') + '</p></div>' +
    '<button class="portal-secondary owner-reschedule-toggle" type="button" style="min-height:32px;padding:0 10px;font-size:9px;flex:0 0 auto">Reschedule</button>' +
    '</div>' +
    '<div class="owner-reschedule-panel" hidden style="display:flex;gap:8px;align-items:flex-end;flex-wrap:wrap;margin-top:10px;padding-top:10px;border-top:1px dashed #c7c7c7">' +
    '<div class="form-field" style="flex:1;min-width:140px"><label>New date</label><input type="date" class="owner-resched-date" style="background:#fdfcfb;color:var(--black);border-color:#bfbfbf" /></div>' +
    '<div class="form-field" style="flex:1;min-width:160px"><label>New time</label><select class="owner-resched-time" disabled style="background:#fdfcfb;color:var(--black);border-color:#bfbfbf"><option value="">Choose a date first</option></select></div>' +
    '<button class="portal-secondary owner-resched-save" type="button" style="min-height:32px;padding:0 10px;font-size:9px">Save</button>' +
    '</div></div></div>';
}

async function loadOwnerConfirmed(){
  const container = document.getElementById('ownerConfirmedList');
  if(!container) return;
  container.innerHTML = '<p style="color:#656565">Loading appointments…</p>';
  const today = new Date().toISOString().slice(0, 10);
  if(DEMO_MODE){
    const items = DEMO_BOOKINGS.filter(b => b.status === 'confirmed' && b.date >= today)
      .sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
    container.innerHTML = items.length === 0
      ? '<p style="color:#656565">No upcoming confirmed appointments.</p>'
      : items.map(ownerConfirmedRowHtml).join('');
    return;
  }
  try {
    const snap = await getDocs(query(collection(db, 'bookings'), where('status', '==', 'confirmed')));
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
    container.innerHTML = items.map(ownerConfirmedRowHtml).join('');
  } catch (err) {
    container.innerHTML = '<p style="color:#656565">Could not load appointments.</p>';
  }
}

document.getElementById('ownerConfirmedList').addEventListener('change', async event => {
  if(!event.target.classList.contains('owner-resched-date')) return;
  const row = event.target.closest('[data-booking-id]');
  const timeSelect = row.querySelector('.owner-resched-time');
  const sType = row.dataset.sessionType;
  await populateTimeSelect(timeSelect, event.target.value, SESSION_TYPES[sType] && SESSION_TYPES[sType].durationMinutes, sType);
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

function ownerPendingRowHtml(b){
  const label = sessionTypeName(b.sessionType);
  return '<div class="portal-request" data-booking-id="' + b.id + '" data-slot-id="' + escapeHtml(b.slotId || '') + '">' +
    '<div><strong>' + escapeHtml(b.name) + '</strong><p>' + escapeHtml(label) + ' · ' + escapeHtml(ownerBookingTimeLine(b)) +
    ' · ' + escapeHtml(b.email) + (b.phone ? ' · ' + escapeHtml(b.phone) : '') + (b.reason ? '<br>“' + escapeHtml(b.reason) + '”' : '') + '</p></div>' +
    '<div class="portal-inline-actions">' +
    '<button class="portal-secondary owner-confirm-booking" type="button">Confirm</button>' +
    '<button class="portal-secondary owner-decline-booking" type="button">Decline</button>' +
    '</div></div>';
}

async function loadOwnerBookings(){
  const container = document.getElementById('ownerBookingsList');
  container.innerHTML = '<p style="color:#d7d7d7">Loading booking requests…</p>';
  if(DEMO_MODE){
    const items = DEMO_BOOKINGS.filter(b => b.status === 'pending').sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
    container.innerHTML = items.length === 0
      ? '<p style="color:#d7d7d7">No pending booking requests.</p>'
      : items.map(ownerPendingRowHtml).join('');
    return;
  }
  try {
    const snap = await getDocs(query(collection(db, 'bookings'), where('status', '==', 'pending')));
    if(snap.empty){
      container.innerHTML = '<p style="color:#d7d7d7">No pending booking requests.</p>';
      return;
    }
    const items = [];
    snap.forEach(docSnap => items.push({ id: docSnap.id, ...docSnap.data() }));
    items.sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
    container.innerHTML = items.map(ownerPendingRowHtml).join('');
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
    if(DEMO_MODE){
      const b = DEMO_BOOKINGS.find(x => x.id === bookingId);
      if(confirmBtn){
        if(b) b.status = 'confirmed';
        portalOwnerStatus.textContent = 'Booking confirmed.';
        loadOwnerConfirmed();
      } else {
        if(b) b.status = 'declined';
        portalOwnerStatus.textContent = 'Booking declined and the time was freed up.';
      }
      loadOwnerBookings();
      return;
    }
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

function blockedDateRowHtml(d){
  return '<div class="portal-row" data-blocked-date="' + escapeHtml(d) + '"><div><strong>' + escapeHtml(d) + '</strong></div>' +
    '<button class="portal-secondary owner-unblock-date" type="button" style="min-height:32px;padding:0 10px;font-size:9px">Unblock</button></div>';
}

async function loadBlockedDates(){
  const container = document.getElementById('blockedDatesList');
  if(!container) return;
  container.innerHTML = '<p style="color:#656565">Loading blocked dates…</p>';
  const today = new Date().toISOString().slice(0, 10);
  if(DEMO_MODE){
    const dates = DEMO_BLOCKED_DATES.filter(d => d >= today).sort();
    container.innerHTML = dates.length === 0
      ? '<p style="color:#656565">No upcoming dates are blocked.</p>'
      : dates.map(blockedDateRowHtml).join('');
    return;
  }
  try {
    const snap = await getDocs(collection(db, 'blockouts'));
    const dates = [];
    snap.forEach(docSnap => { if(docSnap.id >= today) dates.push(docSnap.id); });
    dates.sort();
    if(dates.length === 0){
      container.innerHTML = '<p style="color:#656565">No upcoming dates are blocked.</p>';
      return;
    }
    container.innerHTML = dates.map(blockedDateRowHtml).join('');
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
    if(DEMO_MODE){
      if(!DEMO_BLOCKED_DATES.includes(dateStr)) DEMO_BLOCKED_DATES.push(dateStr);
    } else {
      await setDoc(doc(db, 'blockouts', dateStr), { date: dateStr, createdAt: serverTimestamp() });
    }
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
    if(DEMO_MODE){
      const idx = DEMO_BLOCKED_DATES.indexOf(row.dataset.blockedDate);
      if(idx !== -1) DEMO_BLOCKED_DATES.splice(idx, 1);
    } else {
      await deleteDoc(doc(db, 'blockouts', row.dataset.blockedDate));
    }
    loadBlockedDates();
  } catch (err) {
    blockDateStatus.textContent = 'Could not unblock that date.';
    btn.disabled = false;
  }
});

async function loadOwnerMembers(){
  const container = document.getElementById('ownerMembersList');
  container.innerHTML = '<p style="color:#656565">Loading member accounts…</p>';
  if(DEMO_MODE){
    const items = [...DEMO_MEMBERS].sort((a, b) => (a.name || '').localeCompare(b.name || ''));
    container.innerHTML = items.map(u =>
      '<div class="portal-row"><div><strong>' + escapeHtml(u.name || u.email) + '</strong><small>' + escapeHtml(u.email) +
      '</small></div><span class="portal-access">' + (u.role === 'admin' ? 'Admin' : 'Member') + '</span></div>'
    ).join('');
    return;
  }
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
   Teaching registration — public. Mirrors the one-on-one booking
   dialog's pattern exactly: the registration itself is written for
   real right now (pending payment), and only the payment step is a
   visual demonstration until a real processor is connected.
   --------------------------------------------------------------- */
async function createTeachingRegistration({ teachingId, firstName, lastName, email, phone, uid }){
  const t = TEACHINGS[teachingId] || {};
  const data = {
    teachingId, teachingTitle: t.title || '', teachingDate: t.date || '',
    firstName, lastName, email, phone, status: 'pending_payment', uid: uid || null
  };
  if(DEMO_MODE){
    DEMO_TEACHING_REGISTRATIONS.push({ id: 'demo-reg-' + (++DEMO_TEACHING_REG_SEQ), ...data });
    return;
  }
  await setDoc(doc(collection(db, 'teachingRegistrations')), { ...data, registeredAt: serverTimestamp() });
}

async function fetchTeachingRegistrations(teachingId){
  if(DEMO_MODE) return DEMO_TEACHING_REGISTRATIONS.filter(r => r.teachingId === teachingId);
  try {
    const snap = await getDocs(query(collection(db, 'teachingRegistrations'), where('teachingId', '==', teachingId)));
    const rows = [];
    snap.forEach(d => rows.push({ id: d.id, ...d.data() }));
    return rows;
  } catch (err) { return []; }
}

const teachingRegisterDialog = document.getElementById('teachingRegisterDialog');
const teachingRegisterForm = document.getElementById('teachingRegisterForm');
const teachingRegisterStatus = document.getElementById('teachingRegisterStatus');
const teachingRegisterSubmitBtn = document.getElementById('teachingRegisterSubmitBtn');

function openTeachingRegister(teachingId){
  const t = TEACHINGS[teachingId];
  if(!t) return;
  teachingRegisterForm.reset();
  teachingRegisterStatus.textContent = '';
  teachingRegisterForm.dataset.teachingId = teachingId;
  document.getElementById('teachingRegisterTitle').textContent = t.title || 'Reserve your seat.';
  document.getElementById('teachingRegisterIntro').textContent = t.shortDescription || '';
  const formatLabel = t.format === 'zoom' ? 'Live On Zoom' : t.format === 'in-person' ? ('In Person' + (t.location ? ' — ' + t.location : '')) : t.format === 'hybrid' ? 'Hybrid' : 'Class';
  document.getElementById('teachingRegisterMeta').innerHTML =
    '<span>' + escapeHtml(formatTeachingDate(t.date || '')) + '</span>' +
    '<span>' + escapeHtml(formatTeachingTime(t.startTime, t.timeZone)) + '</span>' +
    '<span>' + escapeHtml(formatLabel) + '</span>';
  const artEl = document.getElementById('teachingRegisterSummaryArt');
  const art = teachingCardArt(t);
  artEl.className = 'checkout-summary' + (art ? '' : ' ' + teachingArtClass(t.category));
  artEl.style.backgroundImage = art ? "url('" + art + "')" : '';
  document.getElementById('teachingRegisterOrderSummary').innerHTML =
    '<div class="checkout-order-row"><span>' + escapeHtml(t.title || 'Teaching') + '</span><span>' + (t.price ? '$' + Number(t.price).toFixed(2) : 'Free') + '</span></div>' +
    '<div class="checkout-order-total"><span>Total</span><span>' + (t.price ? '$' + Number(t.price).toFixed(2) : '$0.00') + '</span></div>';
  document.getElementById('teachingRegisterSubmitLabel').textContent = t.price ? 'Continue To Payment' : 'Reserve My Seat';
  if(currentUser && currentProfile){
    const parts = (currentProfile.name || '').split(' ');
    document.getElementById('teachingRegisterFirstName').value = parts[0] || '';
    document.getElementById('teachingRegisterLastName').value = parts.slice(1).join(' ') || '';
    document.getElementById('teachingRegisterEmail').value = currentProfile.email || '';
  }
  teachingRegisterDialog.showModal();
}
window.openTeachingRegister = openTeachingRegister;

document.addEventListener('click', event => {
  const trigger = event.target.closest('.teaching-register-btn');
  if(trigger && trigger.dataset.teachingId) openTeachingRegister(trigger.dataset.teachingId);
});
document.getElementById('closeTeachingRegister').addEventListener('click', () => teachingRegisterDialog.close());
teachingRegisterDialog.addEventListener('click', event => {
  if(event.target === teachingRegisterDialog) teachingRegisterDialog.close();
});

teachingRegisterForm.addEventListener('submit', async event => {
  event.preventDefault();
  const honeypot = document.getElementById('teachingRegisterWebsite').value;
  const teachingId = teachingRegisterForm.dataset.teachingId;
  const t = TEACHINGS[teachingId];
  if(honeypot || !t) return;
  if(throttledRecently('lastTeachingRegisterSubmit')){
    teachingRegisterStatus.textContent = 'Please wait a moment before submitting another request.';
    return;
  }
  const firstName = document.getElementById('teachingRegisterFirstName').value.trim();
  const lastName = document.getElementById('teachingRegisterLastName').value.trim();
  const email = document.getElementById('teachingRegisterEmail').value.trim();
  const phone = toE164(document.getElementById('teachingRegisterPhoneCountry'), document.getElementById('teachingRegisterPhoneNumber'));
  if(!phone){ teachingRegisterStatus.textContent = 'Enter a valid phone number, including country code.'; return; }
  teachingRegisterSubmitBtn.disabled = true;
  teachingRegisterStatus.textContent = 'Reserving your seat…';
  try {
    await createTeachingRegistration({ teachingId, firstName, lastName, email, phone, uid: currentUser ? currentUser.uid : null });
    markThrottled('lastTeachingRegisterSubmit');
    teachingRegisterStatus.textContent = "YOU'RE REGISTERED — " + t.title + ', ' + formatTeachingDate(t.date) + ' · ' +
      formatTeachingTime(t.startTime, t.timeZone) + '. Your class access information will be sent to ' + email + ' before the class.';
    teachingRegisterForm.reset();
  } catch (err) {
    teachingRegisterStatus.textContent = 'Could not submit your registration. Please try again.';
  } finally {
    teachingRegisterSubmitBtn.disabled = false;
  }
});

/* ---------------------------------------------------------------
   Teaching Manager — admin. Same real/demo split as the rest of the
   admin dashboard. Zoom fields are written to a separate admin-only
   collection (teachingZoomInfo) and are never merged into the public
   TEACHINGS map, so a public page can never see them (Section 6/8 of
   the request this was built from).
   --------------------------------------------------------------- */
async function fetchTeachingZoomInfo(id){
  if(DEMO_MODE) return DEMO_TEACHING_ZOOM[id] || {};
  try {
    const snap = await getDoc(doc(db, 'teachingZoomInfo', id));
    return snap.exists() ? snap.data() : {};
  } catch (err) { return {}; }
}

async function saveTeaching(publicFields, zoomFields, existingId, makeFeatured){
  const id = existingId || ('teaching-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6));
  if(DEMO_MODE){
    TEACHINGS[id] = { ...(TEACHINGS[id] || demoTeachingDefaults()), ...publicFields, id };
    if(zoomFields.zoomUrl || zoomFields.meetingId || zoomFields.passcode) DEMO_TEACHING_ZOOM[id] = zoomFields;
    if(makeFeatured) TEACHING_PAGE_SETTINGS.featuredTeachingId = id;
    if(!savePreviewToStorage()) throw new Error('This browser\'s preview storage is full — try smaller images, or use Reset Preview Data.');
    return id;
  }
  await setDoc(doc(db, 'teachings', id), { ...publicFields, updatedAt: serverTimestamp() }, { merge: true });
  if(zoomFields.zoomUrl || zoomFields.meetingId || zoomFields.passcode){
    await setDoc(doc(db, 'teachingZoomInfo', id), zoomFields, { merge: true });
  }
  if(makeFeatured){
    await setDoc(doc(db, 'teachingPageSettings', 'global'), { ...TEACHING_PAGE_SETTINGS, featuredTeachingId: id }, { merge: true });
  }
  await loadTeachingPageConfig();
  return id;
}

async function setTeachingArchived(id, archived){
  if(DEMO_MODE){
    if(TEACHINGS[id]) TEACHINGS[id].archived = archived;
    savePreviewToStorage();
    return;
  }
  await updateDoc(doc(db, 'teachings', id), { archived });
  await loadTeachingPageConfig();
}

/* ---------------------------------------------------------------
   Owner image uploads. No Firebase Storage is connected in this
   project yet — rather than block real "upload a file" on that (a
   separate setup/possibly-billing decision), an uploaded image is
   resized and compressed client-side into a compact data URL and
   stored directly in the same URL field the "advanced" paste-a-link
   option already uses. Everything downstream (saving, rendering,
   preview) treats it exactly like any other image URL — the only
   difference is where the string came from. Kept deliberately small
   (max ~1400px, JPEG ~70%) so a teaching's images stay well inside
   both Firestore's 1MB-per-document limit and this browser's
   localStorage quota in preview mode.
   --------------------------------------------------------------- */
function resizeImageToDataUrl(file, maxDim, quality){
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error || new Error('Could not read that file.'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('Could not read that image.'));
      img.onload = () => {
        let width = img.naturalWidth, height = img.naturalHeight;
        if(width > maxDim || height > maxDim){
          if(width >= height){ height = Math.round(height * maxDim / width); width = maxDim; }
          else { width = Math.round(width * maxDim / height); height = maxDim; }
        }
        const canvas = document.createElement('canvas');
        canvas.width = width; canvas.height = height;
        canvas.getContext('2d').drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

let adminImagePreviewRefreshers = [];
function wireAdminImageField(fieldId, previewId, fileId, removeId, label, maxDim){
  const input = document.getElementById(fieldId);
  const preview = document.getElementById(previewId);
  const fileInput = document.getElementById(fileId);
  const removeBtn = document.getElementById(removeId);
  if(!input || !preview || !fileInput || !removeBtn) return;
  function refresh(){
    const val = input.value.trim();
    if(val){
      preview.style.backgroundImage = "url('" + val.replace(/'/g, "%27") + "')";
      preview.innerHTML = '';
    } else {
      preview.style.backgroundImage = '';
      preview.innerHTML = '<span class="admin-image-empty">Drop an image here, or use Upload</span>';
    }
    // The Hero field also drives the plain-language position/zoom/
    // brightness live preview below it — keep that in sync too.
    if(fieldId === 'teachingEditArtHero' && typeof updateHeroLivePreview === 'function') updateHeroLivePreview();
  }
  async function handleFile(file){
    if(!file || !file.type || !file.type.startsWith('image/')){ alert('Please choose an image file.'); return; }
    preview.innerHTML = '<span class="admin-image-empty">Processing…</span>';
    try {
      input.value = await resizeImageToDataUrl(file, maxDim || 1400, 0.72);
    } catch (err) {
      console.error('image resize failed', err);
      alert('Could not use that image — try a different file.');
    }
    refresh();
  }
  refresh();
  input.addEventListener('input', refresh);
  fileInput.addEventListener('change', () => { handleFile(fileInput.files[0]); fileInput.value = ''; });
  removeBtn.addEventListener('click', () => { input.value = ''; refresh(); });
  preview.addEventListener('dragover', event => { event.preventDefault(); preview.classList.add('is-drag-over'); });
  preview.addEventListener('dragleave', () => preview.classList.remove('is-drag-over'));
  preview.addEventListener('drop', event => {
    event.preventDefault();
    preview.classList.remove('is-drag-over');
    handleFile(event.dataTransfer.files && event.dataTransfer.files[0]);
  });
  adminImagePreviewRefreshers.push(refresh);
}
wireAdminImageField('teachingEditArtHero', 'teachingEditArtHeroPreview', 'teachingEditArtHeroFile', 'teachingEditArtHeroRemove', 'Hero', 1600);
wireAdminImageField('teachingEditArtCard', 'teachingEditArtCardPreview', 'teachingEditArtCardFile', 'teachingEditArtCardRemove', 'Card', 1200);
wireAdminImageField('teachingEditArtHeroMobile', 'teachingEditArtHeroMobilePreview', 'teachingEditArtHeroMobileFile', 'teachingEditArtHeroMobileRemove', 'Mobile', 1000);
wireAdminImageField('teachingSettingsScriptureImage', 'teachingSettingsScriptureImagePreview', 'teachingSettingsScriptureImageFile', 'teachingSettingsScriptureImageRemove', 'Scripture', 1400);

/* ---------------------------------------------------------------
   Plain-language image position/zoom/brightness controls for the
   Hero image — "the image beside Discernment." Nudges a focal point
   (0-100% across, 0-100% down), a zoom amount, and how dark the
   overlay is, all in plain button clicks with a live preview —
   no crop tool, no "object-position" terminology anywhere in the UI.
   --------------------------------------------------------------- */
function updateHeroLivePreview(){
  const preview = document.getElementById('teachingEditHeroLivePreview');
  if(!preview) return;
  const heroUrl = document.getElementById('teachingEditArtHero').value.trim();
  const focalX = Number(document.getElementById('teachingEditFocalX').value) || 50;
  const focalY = Number(document.getElementById('teachingEditFocalY').value) || 50;
  const zoom = Number(document.getElementById('teachingEditZoom').value) || 100;
  const overlayStrength = Number(document.getElementById('teachingEditOverlayStrength').value) || 0;
  const category = document.getElementById('teachingEditCategory').value;
  preview.className = 'admin-image-adjust-preview' + (heroUrl ? '' : ' ' + teachingArtClass(category));
  preview.style.backgroundImage = heroUrl ? "url('" + heroUrl.replace(/'/g, '%27') + "')" : '';
  preview.style.backgroundPosition = focalX + '% ' + focalY + '%';
  preview.style.transform = 'scale(' + (zoom / 100) + ')';
  preview.style.transformOrigin = focalX + '% ' + focalY + '%';
  const overlay = document.getElementById('teachingEditHeroLiveOverlay');
  if(overlay) overlay.style.opacity = overlayStrength / 100;
}
document.getElementById('teachingEditArtHero').addEventListener('input', updateHeroLivePreview);
document.getElementById('teachingEditCategory').addEventListener('input', updateHeroLivePreview);

document.querySelector('.admin-image-adjust-controls').addEventListener('click', event => {
  const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
  const fx = document.getElementById('teachingEditFocalX');
  const fy = document.getElementById('teachingEditFocalY');
  const zoomInput = document.getElementById('teachingEditZoom');
  const overlayInput = document.getElementById('teachingEditOverlayStrength');
  const nudgeBtn = event.target.closest('[data-nudge]');
  const zoomBtn = event.target.closest('[data-zoom]');
  const brightBtn = event.target.closest('[data-brightness]');
  const resetBtn = event.target.closest('#teachingEditResetImageBtn');
  if(nudgeBtn){
    const dir = nudgeBtn.dataset.nudge;
    if(dir === 'center'){ fx.value = 50; fy.value = 50; }
    else if(dir === 'left') fx.value = clamp(Number(fx.value) - 10, 0, 100);
    else if(dir === 'right') fx.value = clamp(Number(fx.value) + 10, 0, 100);
    else if(dir === 'up') fy.value = clamp(Number(fy.value) - 10, 0, 100);
    else if(dir === 'down') fy.value = clamp(Number(fy.value) + 10, 0, 100);
  } else if(zoomBtn){
    zoomInput.value = clamp(Number(zoomInput.value) + (zoomBtn.dataset.zoom === 'in' ? 10 : -10), 100, 160);
  } else if(brightBtn){
    overlayInput.value = clamp(Number(overlayInput.value) + (brightBtn.dataset.brightness === 'darken' ? 10 : -10), 0, 85);
  } else if(resetBtn){
    fx.value = 50; fy.value = 50; zoomInput.value = 100; overlayInput.value = 45;
  } else {
    return;
  }
  updateHeroLivePreview();
});

function collectTeachingEditForm(){
  const whatYouWillLearn = document.getElementById('teachingEditLearn').value.split('\n').map(s => s.trim()).filter(Boolean);
  const priceRaw = document.getElementById('teachingEditPrice').value;
  const publicFields = {
    title: document.getElementById('teachingEditTitleInput').value.trim(),
    subtitle: document.getElementById('teachingEditSubtitle').value.trim(),
    shortDescription: document.getElementById('teachingEditShortDesc').value.trim(),
    fullDescription: document.getElementById('teachingEditFullDesc').value.trim(),
    whatYouWillLearn,
    instructor: document.getElementById('teachingEditInstructor').value.trim(),
    category: document.getElementById('teachingEditCategory').value.trim(),
    date: document.getElementById('teachingEditDate').value,
    startTime: document.getElementById('teachingEditStartTime').value,
    endTime: document.getElementById('teachingEditEndTime').value || null,
    timeZone: document.getElementById('teachingEditTimeZone').value,
    price: priceRaw ? Number(priceRaw) : null,
    isFree: !priceRaw,
    capacity: document.getElementById('teachingEditUnlimited').checked ? null : (Number(document.getElementById('teachingEditCapacity').value) || null),
    unlimitedCapacity: document.getElementById('teachingEditUnlimited').checked,
    format: document.getElementById('teachingEditFormat').value,
    location: document.getElementById('teachingEditLocation').value.trim() || null,
    artwork: {
      hero: document.getElementById('teachingEditArtHero').value.trim(),
      heroMobile: document.getElementById('teachingEditArtHeroMobile').value.trim(),
      card: document.getElementById('teachingEditArtCard').value.trim(),
      focalX: Number(document.getElementById('teachingEditFocalX').value) || 50,
      focalY: Number(document.getElementById('teachingEditFocalY').value) || 50,
      zoom: Number(document.getElementById('teachingEditZoom').value) || 100,
      overlayStrength: Number(document.getElementById('teachingEditOverlayStrength').value)
    },
    status: document.getElementById('teachingEditStatus').value
  };
  const zoomFields = {
    zoomUrl: document.getElementById('teachingEditZoomUrl').value.trim(),
    meetingId: document.getElementById('teachingEditZoomId').value.trim(),
    passcode: document.getElementById('teachingEditZoomPasscode').value.trim()
  };
  return { publicFields, zoomFields, makeFeatured: document.getElementById('teachingEditFeatured').checked };
}

const TEACHING_STATUS_LABELS = {
  draft: 'Draft', published: 'Published', 'registration-open': 'Registration Open',
  'sold-out': 'Sold Out', completed: 'Completed', cancelled: 'Cancelled'
};
function updateTeachingEditStatusPill(){
  const pill = document.getElementById('teachingEditStatusPill');
  const status = document.getElementById('teachingEditStatus').value || 'draft';
  pill.textContent = TEACHING_STATUS_LABELS[status] || status;
  pill.className = 'admin-status-pill ' + status;
}

async function populateTeachingEditRegistrationTab(t){
  const statusEl = document.getElementById('teachingEditRegStatus');
  const countEl = document.getElementById('teachingEditRegCount');
  const capEl = document.getElementById('teachingEditRegCapacity');
  const revEl = document.getElementById('teachingEditRegRevenue');
  statusEl.textContent = t ? (TEACHING_STATUS_LABELS[t.status] || t.status) : '—';
  capEl.textContent = t ? (t.unlimitedCapacity !== false ? 'Unlimited' : (t.capacity || '—')) : '—';
  if(!t){ countEl.textContent = '—'; revEl.textContent = '—'; return; }
  countEl.textContent = 'Loading…';
  const rows = await fetchTeachingRegistrations(t.id);
  const active = rows.filter(r => r.status !== 'cancelled');
  countEl.textContent = String(active.length);
  revEl.textContent = t.price ? '$' + (active.length * Number(t.price)).toFixed(2) : 'Free class';
}

function fillTeachingEditForm(t, zoom){
  const g = id => document.getElementById(id);
  g('teachingEditId').value = t ? t.id : '';
  g('teachingEditTitle').textContent = t ? 'Edit Teaching' : 'New Teaching';
  g('teachingEditTitleInput').value = t ? t.title || '' : '';
  g('teachingEditSubtitle').value = t ? t.subtitle || '' : '';
  g('teachingEditShortDesc').value = t ? t.shortDescription || '' : '';
  g('teachingEditFullDesc').value = t ? t.fullDescription || '' : '';
  g('teachingEditLearn').value = t && t.whatYouWillLearn ? t.whatYouWillLearn.join('\n') : '';
  g('teachingEditInstructor').value = t ? (t.instructor || 'The Unveiled Assembly') : 'The Unveiled Assembly';
  g('teachingEditCategory').value = t ? t.category || '' : '';
  g('teachingEditDate').value = t ? t.date || '' : '';
  g('teachingEditStartTime').value = t ? t.startTime || TEACHING_PAGE_SETTINGS.defaultThursdayTime : TEACHING_PAGE_SETTINGS.defaultThursdayTime;
  g('teachingEditEndTime').value = t ? t.endTime || '' : '';
  g('teachingEditTimeZone').value = 'America/New_York';
  g('teachingEditPrice').value = t && t.price ? t.price : '';
  const isPaid = !!(t && t.price);
  document.querySelectorAll('#teachingEditFreePaidRow .admin-tab').forEach(b => b.classList.toggle('active', (b.dataset.freePaid === 'paid') === isPaid));
  document.getElementById('teachingEditPriceFieldWrap').hidden = !isPaid;
  g('teachingEditCapacity').value = t && t.capacity ? t.capacity : '';
  g('teachingEditUnlimited').checked = t ? !!t.unlimitedCapacity : true;
  g('teachingEditFormat').value = t ? t.format || 'zoom' : 'zoom';
  g('teachingEditLocation').value = t ? t.location || '' : '';
  g('teachingEditZoomUrl').value = zoom ? zoom.zoomUrl || '' : '';
  g('teachingEditZoomId').value = zoom ? zoom.meetingId || '' : '';
  g('teachingEditZoomPasscode').value = zoom ? zoom.passcode || '' : '';
  const art = (t && t.artwork) || {};
  g('teachingEditArtHero').value = art.hero || '';
  g('teachingEditArtHeroMobile').value = art.heroMobile || '';
  g('teachingEditArtCard').value = art.card || '';
  g('teachingEditFocalX').value = art.focalX != null ? art.focalX : 50;
  g('teachingEditFocalY').value = art.focalY != null ? art.focalY : 50;
  g('teachingEditZoom').value = art.zoom != null ? art.zoom : 100;
  g('teachingEditOverlayStrength').value = art.overlayStrength != null ? art.overlayStrength : 45;
  updateHeroLivePreview();
  g('teachingEditStatus').value = t ? t.status || 'draft' : 'draft';
  g('teachingEditFeatured').checked = t ? TEACHING_PAGE_SETTINGS.featuredTeachingId === t.id : false;
  updateTeachingEditStatusPill();
  adminImagePreviewRefreshers.forEach(fn => fn());
  populateTeachingEditRegistrationTab(t);
  showTeachingEditTab('content');
}

function showTeachingEditTab(name){
  document.querySelectorAll('#teachingEditTabs .admin-step').forEach(b => b.classList.toggle('active', b.dataset.editTab === name));
  document.querySelectorAll('.admin-edit-panel').forEach(p => { p.hidden = p.dataset.editPanel !== name; });
  if(name === 'preview') renderTeachingEditFullPreview();
}
document.getElementById('teachingEditTabs').addEventListener('click', event => {
  const btn = event.target.closest('.admin-step');
  if(btn) showTeachingEditTab(btn.dataset.editTab);
});
document.getElementById('teachingEditFreePaidRow').addEventListener('click', event => {
  const btn = event.target.closest('[data-free-paid]');
  if(!btn) return;
  document.querySelectorAll('#teachingEditFreePaidRow .admin-tab').forEach(b => b.classList.toggle('active', b === btn));
  const isPaid = btn.dataset.freePaid === 'paid';
  document.getElementById('teachingEditPriceFieldWrap').hidden = !isPaid;
  if(!isPaid) document.getElementById('teachingEditPrice').value = '';
});
function renderTeachingEditFullPreview(){
  const wrap = document.getElementById('teachingEditFullPreview');
  if(!wrap) return;
  const { publicFields } = collectTeachingEditForm();
  const previewTeaching = { ...publicFields, id: document.getElementById('teachingEditId').value || 'preview' };
  wrap.innerHTML = '<div style="border-radius:var(--owner-radius);overflow:hidden;box-shadow:var(--owner-shadow)">' + teachingHeroMediaHtml(previewTeaching).replace('teaching-hero-media', 'teaching-hero-media admin-preview-embed') +
    '<div style="background:#0c0c0e;color:#fff;padding:28px;margin-top:-1px">' +
    '<div class="admin-microlabel" style="color:#9a9aa2">Upcoming Class</div>' +
    '<h3 style="font-family:var(--serif);font-size:28px;margin:8px 0 4px">' + escapeHtml(publicFields.title || 'Untitled Class') + '</h3>' +
    (publicFields.subtitle ? '<p style="font-family:var(--serif);font-style:italic;color:#c7c7cc;margin:0 0 12px">' + escapeHtml(publicFields.subtitle) + '</p>' : '') +
    '<p style="color:#a6a6ae;font-size:13.5px;max-width:52ch">' + escapeHtml(publicFields.shortDescription || '') + '</p>' +
    '<div style="display:flex;gap:16px;flex-wrap:wrap;margin-top:14px;font-family:var(--mono);font-size:11px;color:#fff">' +
    '<span>' + escapeHtml(publicFields.date ? formatTeachingDate(publicFields.date) : 'No date set') + '</span>' +
    '<span>' + escapeHtml(publicFields.startTime ? formatTeachingTime(publicFields.startTime, 'America/New_York') : '') + '</span>' +
    '<span>' + (publicFields.price ? '$' + Number(publicFields.price).toFixed(2) : 'Free') + '</span>' +
    '</div></div></div>';
}
document.getElementById('teachingEditStatus').addEventListener('change', updateTeachingEditStatusPill);

const teachingEditDialog = document.getElementById('teachingEditDialog');
const teachingEditForm = document.getElementById('teachingEditForm');
const teachingEditStatusMsg = document.getElementById('teachingEditStatusMsg');

async function openTeachingEditor(id){
  const t = id ? TEACHINGS[id] : null;
  const zoom = id ? await fetchTeachingZoomInfo(id) : {};
  fillTeachingEditForm(t, zoom);
  teachingEditStatusMsg.textContent = '';
  teachingEditDialog.showModal();
}
document.getElementById('teachingMgrNewBtn').addEventListener('click', () => openTeachingEditor(null));
document.getElementById('closeTeachingEdit').addEventListener('click', () => teachingEditDialog.close());
teachingEditDialog.addEventListener('click', event => {
  if(event.target === teachingEditDialog) teachingEditDialog.close();
});

async function performTeachingSave(mode){
  const existingId = document.getElementById('teachingEditId').value || null;
  const { publicFields, zoomFields, makeFeatured } = collectTeachingEditForm();
  if(!publicFields.title || !publicFields.date || !publicFields.startTime){
    teachingEditStatusMsg.textContent = 'Title, date, and start time are required.';
    return null;
  }
  if(mode === 'draft') publicFields.status = 'draft';
  if(mode === 'publish' && publicFields.status === 'draft') publicFields.status = 'published';
  teachingEditStatusMsg.textContent = mode === 'preview' ? 'Saving preview…' : 'Saving…';
  try {
    const id = await saveTeaching(publicFields, zoomFields, existingId, makeFeatured);
    document.getElementById('teachingEditId').value = id;
    document.getElementById('teachingEditStatus').value = publicFields.status;
    updateTeachingEditStatusPill();
    renderTeachingManager();
    renderPublicTeachingPages();
    return id;
  } catch (err) {
    console.error('saveTeaching failed', err);
    teachingEditStatusMsg.textContent = 'Could not save that teaching — ' + (err && err.message ? err.message : 'please try again.');
    return null;
  }
}

document.getElementById('teachingEditSaveDraftBtn').addEventListener('click', async () => {
  const id = await performTeachingSave('draft');
  if(id) teachingEditStatusMsg.textContent = DEMO_MODE ? 'Draft saved to preview.' : 'Draft saved.';
});

document.getElementById('teachingEditPreviewBtn').addEventListener('click', async () => {
  const id = await performTeachingSave('preview');
  if(!id) return;
  teachingEditStatusMsg.textContent = 'Opening preview…';
  window.open(BASE + 'teaching-detail.html?id=' + encodeURIComponent(id), '_blank');
  teachingEditStatusMsg.textContent = DEMO_MODE
    ? 'Saved to this browser\'s preview and opened in a new tab.'
    : 'Saved and opened in a new tab.';
});

teachingEditForm.addEventListener('submit', async event => {
  event.preventDefault();
  const id = await performTeachingSave('publish');
  if(!id) return;
  teachingEditStatusMsg.textContent = DEMO_MODE
    ? 'Saved to preview — stays in this browser as you navigate and reload.'
    : 'Published — live on the public Teaching page now.';
});

document.getElementById('teachingEditOpenRegistrantsBtn').addEventListener('click', () => {
  const id = document.getElementById('teachingEditId').value;
  if(id) openTeachingRegistrants(id);
});

async function duplicateTeachingRecord(publicSource, zoomSource){
  const publicFields = JSON.parse(JSON.stringify(publicSource));
  delete publicFields.id;
  publicFields.title = (publicFields.title || 'Untitled') + ' (Copy)';
  publicFields.status = 'draft';
  const zoomFields = zoomSource ? JSON.parse(JSON.stringify(zoomSource)) : { zoomUrl: '', meetingId: '', passcode: '' };
  return saveTeaching(publicFields, zoomFields, null, false);
}

document.getElementById('teachingEditDuplicateBtn').addEventListener('click', async () => {
  const { publicFields, zoomFields } = collectTeachingEditForm();
  if(!publicFields.title){ teachingEditStatusMsg.textContent = 'Enter a title before duplicating.'; return; }
  teachingEditStatusMsg.textContent = 'Duplicating…';
  try {
    const newId = await duplicateTeachingRecord(publicFields, zoomFields);
    renderTeachingManager();
    renderPublicTeachingPages();
    await openTeachingEditor(newId);
    teachingEditStatusMsg.textContent = 'Duplicated as a new draft — adjust the date and publish when ready.';
  } catch (err) {
    console.error('duplicate teaching failed', err);
    teachingEditStatusMsg.textContent = 'Could not duplicate that teaching — ' + (err && err.message ? err.message : 'please try again.');
  }
});

/* ---- Registrants dialog ---- */
const teachingRegistrantsDialog = document.getElementById('teachingRegistrantsDialog');
let teachingRegistrantsCache = [];

function teachingRegistrantRowHtml(r){
  return '<div class="portal-row" style="padding:8px 0">' +
    '<div><strong>' + escapeHtml(r.firstName + ' ' + r.lastName) + '</strong><small>' + escapeHtml(r.email) +
    (r.phone ? ' · ' + escapeHtml(r.phone) : '') + '</small></div>' +
    '<span class="portal-access">' + escapeHtml(r.status === 'confirmed' ? 'Confirmed' : r.status === 'cancelled' ? 'Cancelled' : 'Pending Payment') + '</span>' +
    '</div>';
}

async function openTeachingRegistrants(id){
  const t = TEACHINGS[id];
  if(!t) return;
  document.getElementById('teachingRegistrantsTitle').textContent = t.title || 'Registrants';
  document.getElementById('teachingRegistrantsList').innerHTML = '<p style="color:#656565">Loading…</p>';
  document.getElementById('teachingRegistrantsSearch').value = '';
  teachingRegistrantsDialog.showModal();
  teachingRegistrantsCache = await fetchTeachingRegistrations(id);
  const revenue = teachingRegistrantsCache.filter(r => r.status !== 'cancelled').length * (t.price || 0);
  document.getElementById('teachingRegistrantsSummary').textContent =
    'Registered: ' + teachingRegistrantsCache.length +
    (t.unlimitedCapacity ? '' : ' · Capacity: ' + (t.capacity || '—')) +
    (t.price ? ' · Revenue (once paid): $' + revenue.toFixed(2) : '');
  renderTeachingRegistrantsList(teachingRegistrantsCache);
}
function renderTeachingRegistrantsList(rows){
  const container = document.getElementById('teachingRegistrantsList');
  container.innerHTML = rows.length === 0
    ? '<p style="color:#8a8a8a;font-size:12px">No registrations yet.</p>'
    : rows.map(teachingRegistrantRowHtml).join('');
}
document.getElementById('closeTeachingRegistrants').addEventListener('click', () => teachingRegistrantsDialog.close());
teachingRegistrantsDialog.addEventListener('click', event => {
  if(event.target === teachingRegistrantsDialog) teachingRegistrantsDialog.close();
});
document.getElementById('teachingRegistrantsSearch').addEventListener('input', event => {
  const q = event.target.value.trim().toLowerCase();
  renderTeachingRegistrantsList(!q ? teachingRegistrantsCache : teachingRegistrantsCache.filter(r =>
    (r.firstName + ' ' + r.lastName + ' ' + r.email).toLowerCase().includes(q)));
});

/* ---- List / calendar / tabs ---- */
let teachingMgrActiveTab = 'upcoming';

function teachingsForTab(tab){
  const all = Object.values(TEACHINGS);
  if(tab === 'drafts') return all.filter(t => t.status === 'draft');
  if(tab === 'cancelled') return all.filter(t => t.status === 'cancelled');
  if(tab === 'completed') return all.filter(t => t.status === 'completed' || (teachingIsPast(t) && t.status !== 'cancelled' && t.status !== 'draft'));
  if(tab === 'all') return all;
  return all.filter(t => t.status !== 'draft' && t.status !== 'cancelled' && t.status !== 'completed' && !teachingIsPast(t));
}

function teachingMgrRowHtml(t){
  const featured = TEACHING_PAGE_SETTINGS.featuredTeachingId === t.id;
  const art = teachingCardArt(t);
  const status = t.status || 'draft';
  return '<div class="admin-teaching-row" data-teaching-id="' + escapeHtml(t.id) + '">' +
    '<div class="admin-teaching-thumb' + (art ? '' : ' ' + teachingArtClass(t.category)) + '"' +
      (art ? ' style="background-image:url(\'' + escapeHtml(art) + '\')"' : '') + '></div>' +
    '<div class="admin-teaching-info">' +
    '<div class="admin-teaching-title-row"><strong>' + escapeHtml(t.title || '(untitled)') + '</strong>' +
    (featured ? '<span class="admin-featured-badge">★ Featured</span>' : '') + '</div>' +
    '<div class="admin-teaching-meta">' + escapeHtml(formatTeachingDate(t.date || '')) + ' · ' + escapeHtml(formatTeachingTime(t.startTime, t.timeZone)) +
    ' · ' + (t.price ? '$' + Number(t.price).toFixed(2) : 'Free') + '</div>' +
    '</div>' +
    '<span class="admin-status-pill ' + status + '">' + (TEACHING_STATUS_LABELS[status] || status) + '</span>' +
    '<div class="admin-teaching-actions">' +
    '<button class="admin-btn-ghost teaching-mgr-edit" type="button">Edit</button>' +
    '<button class="admin-btn-ghost teaching-mgr-preview" type="button">Preview</button>' +
    '<button class="admin-btn-ghost teaching-mgr-registrants" type="button">Registrants</button>' +
    '<button class="admin-btn-ghost teaching-mgr-duplicate" type="button">Duplicate</button>' +
    '<button class="admin-btn-ghost teaching-mgr-archive" type="button">' + (t.archived ? 'Unarchive' : 'Archive') + '</button>' +
    '</div></div>';
}

function renderTeachingMgrOverview(){
  const wrap = document.getElementById('teachingMgrOverview');
  if(!wrap) return;
  const all = Object.values(TEACHINGS);
  const counts = {
    upcoming: teachingsForTab('upcoming').length,
    drafts: all.filter(t => t.status === 'draft').length,
    completed: teachingsForTab('completed').length,
    cancelled: all.filter(t => t.status === 'cancelled').length
  };
  const featured = featuredTeaching();
  wrap.innerHTML =
    '<div class="admin-stat-tile"><span>Upcoming</span><strong>' + counts.upcoming + '</strong></div>' +
    '<div class="admin-stat-tile"><span>Drafts</span><strong>' + counts.drafts + '</strong></div>' +
    '<div class="admin-stat-tile"><span>Completed</span><strong>' + counts.completed + '</strong></div>' +
    '<div class="admin-stat-tile"><span>Cancelled</span><strong>' + counts.cancelled + '</strong></div>' +
    '<div class="admin-stat-tile admin-stat-tile-wide"><span>Featured Teaching</span><strong>' + (featured ? escapeHtml(featured.title) : 'None set') + '</strong></div>';
}

function renderTeachingManagerList(){
  const container = document.getElementById('teachingMgrList');
  if(!container) return;
  const items = teachingsForTab(teachingMgrActiveTab).sort((a, b) => ((a.date || '') + (a.startTime || '')).localeCompare((b.date || '') + (b.startTime || '')));
  container.innerHTML = items.length === 0
    ? '<p style="color:#8a8a8a;font-size:12px">No teachings in this view yet.</p>'
    : items.map(teachingMgrRowHtml).join('');
}

function renderTeachingManagerCalendar(){
  const container = document.getElementById('teachingMgrCalendar');
  if(!container) return;
  const items = Object.values(TEACHINGS).filter(t => t.date).sort((a, b) => (a.date + (a.startTime || '')).localeCompare(b.date + (b.startTime || '')));
  if(items.length === 0){ container.innerHTML = '<p style="color:#8a8a8a;font-size:12px">No teachings scheduled yet.</p>'; return; }
  const byMonth = {};
  items.forEach(t => { const key = t.date.slice(0, 7); (byMonth[key] = byMonth[key] || []).push(t); });
  container.innerHTML = Object.keys(byMonth).sort().map(key => {
    const [y, m] = key.split('-').map(Number);
    const monthLabel = new Intl.DateTimeFormat(undefined, { month: 'long', year: 'numeric' }).format(new Date(y, m - 1, 1)).toUpperCase();
    const rows = byMonth[key].map(t => {
      const weekday = new Intl.DateTimeFormat(undefined, { weekday: 'long' }).format(new Date(t.date + 'T12:00:00'));
      const day = Number(t.date.split('-')[2]);
      const status = t.status || 'draft';
      return '<div class="admin-teaching-row teaching-mgr-cal-row" data-teaching-id="' + escapeHtml(t.id) + '" style="cursor:pointer">' +
        '<div class="admin-teaching-info"><div class="admin-teaching-title-row"><strong>' + escapeHtml(t.title || '(untitled)') + '</strong></div>' +
        '<div class="admin-teaching-meta">' + weekday + ' ' + day + '</div></div>' +
        '<span class="admin-status-pill ' + status + '">' + (TEACHING_STATUS_LABELS[status] || status) + '</span></div>';
    }).join('');
    return '<div style="margin-bottom:8px"><div class="admin-microlabel" style="margin-bottom:4px">' + monthLabel + '</div>' + rows + '</div>';
  }).join('');
}

function renderFeaturedTeachingPreview(){
  const wrap = document.getElementById('teachingSettingsFeaturedPreview');
  if(!wrap) return;
  const t = featuredTeaching();
  wrap.innerHTML = t ? teachingMgrRowHtml(t).replace('<div class="admin-teaching-actions">', '<div class="admin-teaching-actions" style="display:none">')
    : '<div class="admin-hint">No teaching is featured yet.</div>';
}

function populateFeaturedTeachingSelect(){
  const select = document.getElementById('teachingSettingsFeatured');
  if(!select) return;
  const current = TEACHING_PAGE_SETTINGS.featuredTeachingId;
  const items = Object.values(TEACHINGS).filter(t => t.status !== 'cancelled');
  select.innerHTML = '<option value="">None (defaults to next upcoming)</option>' +
    items.map(t => '<option value="' + escapeHtml(t.id) + '">' + escapeHtml(t.title || t.id) + ' — ' + escapeHtml(formatTeachingDateShort(t.date || '')) + '</option>').join('');
  select.value = current && items.some(t => t.id === current) ? current : '';
  renderFeaturedTeachingPreview();
}
document.getElementById('teachingSettingsFeatured').addEventListener('change', () => {
  const wrap = document.getElementById('teachingSettingsFeaturedPreview');
  const id = document.getElementById('teachingSettingsFeatured').value;
  const t = id ? TEACHINGS[id] : upcomingTeachingsList()[0];
  wrap.innerHTML = t ? teachingMgrRowHtml(t).replace('<div class="admin-teaching-actions">', '<div class="admin-teaching-actions" style="display:none">')
    : '<div class="admin-hint">No teaching is featured yet.</div>';
});

function renderTeachingManager(){
  if(!document.getElementById('teachingMgrList')) return;
  const notice = document.getElementById('teachingMgrModeNotice');
  if(notice){
    notice.innerHTML = DEMO_MODE
      ? '<strong>Preview Mode.</strong> Changes save to this browser only (not the real database) and stick around as you navigate and reload — use "Preview Page" to see them live, and "Reset Preview Data" to start over. Nothing here is visible to real visitors, and "Publish" only appears once this runs on theunveiledassembly.com.'
      : '<strong>Live Site.</strong> Save Draft and Publish write to the real database and update the public Teaching page immediately.';
  }
  const resetBtn = document.getElementById('teachingMgrResetPreviewBtn');
  if(resetBtn) resetBtn.hidden = !DEMO_MODE;
  renderTeachingMgrOverview();
  renderTeachingManagerList();
  renderTeachingManagerCalendar();
  populateFeaturedTeachingSelect();
  document.getElementById('teachingSettingsUpcomingCount').value = String(TEACHING_PAGE_SETTINGS.upcomingCount || 6);
  document.getElementById('teachingSettingsDefaultTime').value = TEACHING_PAGE_SETTINGS.defaultThursdayTime || '19:30';
  document.getElementById('teachingSettingsShowUpcoming').checked = TEACHING_PAGE_SETTINGS.showUpcoming !== false;
  document.getElementById('teachingSettingsShowLibrary').checked = !!TEACHING_PAGE_SETTINGS.showLibrary;
  document.getElementById('teachingSettingsShowScripture').checked = TEACHING_PAGE_SETTINGS.showScripture !== false;
  document.getElementById('teachingSettingsShowNewsletter').checked = TEACHING_PAGE_SETTINGS.showNewsletter !== false;
  document.getElementById('teachingSettingsAutoArchive').checked = TEACHING_PAGE_SETTINGS.autoArchiveCompleted !== false;
  document.getElementById('teachingSettingsScriptureText').value = TEACHING_PAGE_SETTINGS.scriptureText || '';
  document.getElementById('teachingSettingsScriptureRef').value = TEACHING_PAGE_SETTINGS.scriptureReference || '';
  document.getElementById('teachingSettingsScriptureImage').value = TEACHING_PAGE_SETTINGS.scriptureImage || '';
  adminImagePreviewRefreshers.forEach(fn => fn());
}

document.getElementById('teachingMgrTabs').addEventListener('click', event => {
  const btn = event.target.closest('.admin-tab');
  if(!btn) return;
  teachingMgrActiveTab = btn.dataset.teachingTab;
  document.querySelectorAll('#teachingMgrTabs .admin-tab').forEach(b => b.classList.toggle('active', b === btn));
  renderTeachingManagerList();
});

document.getElementById('teachingMgrPreviewPageBtn').addEventListener('click', () => {
  window.open(BASE + 'teachings.html', '_blank');
});
document.getElementById('teachingMgrResetPreviewBtn').addEventListener('click', () => {
  if(!confirm('Reset all preview Teaching data in this browser back to the original samples? This cannot be undone.')) return;
  resetPreviewData();
  renderTeachingManager();
  renderPublicTeachingPages();
  portalOwnerStatus.textContent = 'Preview data has been reset to the original samples.';
});
document.getElementById('teachingMgrViewList').addEventListener('click', () => {
  document.getElementById('teachingMgrList').hidden = false;
  document.getElementById('teachingMgrCalendar').hidden = true;
});
document.getElementById('teachingMgrViewCalendar').addEventListener('click', () => {
  document.getElementById('teachingMgrList').hidden = true;
  document.getElementById('teachingMgrCalendar').hidden = false;
});

document.getElementById('teachingMgrList').addEventListener('click', async event => {
  const row = event.target.closest('[data-teaching-id]');
  if(!row) return;
  const id = row.dataset.teachingId;
  if(event.target.closest('.teaching-mgr-edit')) return openTeachingEditor(id);
  if(event.target.closest('.teaching-mgr-registrants')) return openTeachingRegistrants(id);
  if(event.target.closest('.teaching-mgr-preview')){
    window.open(BASE + 'teaching-detail.html?id=' + encodeURIComponent(id), '_blank');
    return;
  }
  if(event.target.closest('.teaching-mgr-duplicate')){
    try {
      const zoom = await fetchTeachingZoomInfo(id);
      await duplicateTeachingRecord(TEACHINGS[id], zoom);
      renderTeachingManager();
      renderPublicTeachingPages();
      portalOwnerStatus.textContent = 'Duplicated as a new draft.';
    } catch (err) {
      console.error('duplicate from list failed', err);
      portalOwnerStatus.textContent = 'Could not duplicate that teaching — ' + (err && err.message ? err.message : 'please try again.');
    }
    return;
  }
  if(event.target.closest('.teaching-mgr-archive')){
    try {
      await setTeachingArchived(id, !TEACHINGS[id].archived);
      renderTeachingManagerList();
      renderPublicTeachingPages();
    } catch (err) {
      console.error('archive toggle failed', err);
      portalOwnerStatus.textContent = 'Could not update that teaching — ' + (err && err.message ? err.message : 'please try again.');
    }
  }
});
document.getElementById('teachingMgrCalendar').addEventListener('click', event => {
  const row = event.target.closest('.teaching-mgr-cal-row');
  if(row) openTeachingEditor(row.dataset.teachingId);
});

document.getElementById('teachingSettingsSaveBtn').addEventListener('click', async () => {
  const status = document.getElementById('teachingSettingsStatus');
  const updated = {
    ...TEACHING_PAGE_SETTINGS,
    featuredTeachingId: document.getElementById('teachingSettingsFeatured').value || null,
    upcomingCount: Number(document.getElementById('teachingSettingsUpcomingCount').value) || 6,
    defaultThursdayTime: document.getElementById('teachingSettingsDefaultTime').value || '19:30',
    showUpcoming: document.getElementById('teachingSettingsShowUpcoming').checked,
    showLibrary: document.getElementById('teachingSettingsShowLibrary').checked,
    showScripture: document.getElementById('teachingSettingsShowScripture').checked,
    showNewsletter: document.getElementById('teachingSettingsShowNewsletter').checked,
    autoArchiveCompleted: document.getElementById('teachingSettingsAutoArchive').checked,
    scriptureText: document.getElementById('teachingSettingsScriptureText').value.trim(),
    scriptureReference: document.getElementById('teachingSettingsScriptureRef').value.trim(),
    scriptureImage: document.getElementById('teachingSettingsScriptureImage').value.trim()
  };
  status.textContent = 'Saving…';
  if(DEMO_MODE){
    TEACHING_PAGE_SETTINGS = updated;
    if(!savePreviewToStorage()){
      status.textContent = "This browser's preview storage is full — try smaller images, or use Reset Preview Data.";
      return;
    }
  } else {
    try { await setDoc(doc(db, 'teachingPageSettings', 'global'), updated); await loadTeachingPageConfig(); }
    catch (err) {
      console.error('save teaching settings failed', err);
      status.textContent = 'Could not save settings — ' + (err && err.message ? err.message : 'please try again.');
      return;
    }
  }
  renderPublicTeachingPages();
  status.textContent = DEMO_MODE
    ? 'Saved to preview — stays in this browser as you navigate and reload. Not visible to real visitors.'
    : 'Saved and live on the public Teaching page.';
});

/* ---------------------------------------------------------------
   Public Teaching page rendering (teachings.html) and detail page
   (teaching-detail.html) — both no-op harmlessly on every other page.
   --------------------------------------------------------------- */
/* ---- Signature art (fallback when no real artwork URL is set yet) ----
   Five distinct abstract/atmospheric treatments, one per named teaching
   category from the request this was built from, plus a generic
   fallback — pure CSS gradients rather than sourced photography, so
   nothing here carries any licensing/rights question and every class
   still looks intentional and finished before the admin uploads real
   artwork. Matched by keyword against whatever the admin typed as the
   category, so it degrades gracefully for categories not in the list. */
function teachingArtClass(category){
  const c = (category || '').toLowerCase();
  if(c.includes('discern')) return 'teaching-art-discernment';
  if(c.includes('prophet')) return 'teaching-art-prophetic';
  if(c.includes('voice') || c.includes('hearing') || c.includes('prayer')) return 'teaching-art-voice';
  if(c.includes('warfare') || c.includes('battle')) return 'teaching-art-warfare';
  if(c.includes('identity')) return 'teaching-art-identity';
  return 'teaching-art-default';
}

const TEACHING_META_ICONS = {
  calendar: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M8 3v4M16 3v4M3 10h18"/></svg>',
  video: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4"><rect x="2" y="6" width="14" height="12" rx="2"/><path d="M16 10l6-3v10l-6-3"/></svg>',
  people: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4"><circle cx="9" cy="8" r="3"/><path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6"/><circle cx="17" cy="9" r="2.4"/><path d="M15.5 20c.2-2.4 1.6-4.4 3.6-5.4"/></svg>',
  pin: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4"><path d="M12 21s7-6.3 7-11.5A7 7 0 0 0 5 9.5C5 14.7 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.4"/></svg>'
};
function teachingMetaItem(icon, lines){
  const text = (Array.isArray(lines) ? lines : [lines]).filter(Boolean).map(l => '<span>' + escapeHtml(l) + '</span>').join('');
  return '<div class="teaching-meta-item">' + (TEACHING_META_ICONS[icon] || '') + '<div class="teaching-meta-text">' + text + '</div></div>';
}
function teachingFormatMeta(t){
  if(t.format === 'zoom') return teachingMetaItem('video', 'LIVE ON ZOOM');
  if(t.format === 'in-person') return teachingMetaItem('pin', ['IN PERSON', t.location || ''].filter(Boolean));
  if(t.format === 'hybrid') return teachingMetaItem('pin', 'HYBRID');
  return teachingMetaItem('video', 'CLASS');
}
function teachingCapacityMeta(t){
  return teachingMetaItem('people', t.unlimitedCapacity !== false ? 'OPEN TO ALL' : (t.capacity ? t.capacity + ' SEATS' : 'OPEN TO ALL'));
}

// Shared by the main hero and the detail-page hero — a media panel
// (real artwork if set, otherwise the signature art fallback) plus the
// dark overlay the admin controls from Teaching Manager.
function teachingHeroMediaHtml(t){
  const heroArt = teachingArtworkUrl(t, 'hero');
  const art = t.artwork || {};
  const overlayStrength = art.overlayStrength != null ? art.overlayStrength : 45;
  const focalX = art.focalX != null ? art.focalX : 50;
  const focalY = art.focalY != null ? art.focalY : 50;
  const zoom = art.zoom != null ? art.zoom : 100;
  const fallbackClass = heroArt ? '' : ' ' + teachingArtClass(t.category);
  const style = heroArt
    ? ' style="background-image:url(\'' + escapeHtml(heroArt) + '\');background-position:' + focalX + '% ' + focalY + '%;' +
      'transform:scale(' + (zoom / 100) + ');transform-origin:' + focalX + '% ' + focalY + '%"'
    : '';
  return '<div class="teaching-hero-media' + fallbackClass + '"' + style + '>' +
    '<div class="teaching-hero-overlay" style="opacity:' + (overlayStrength / 100) + '"></div></div>';
}

function teachingCardHtml(t){
  const art = teachingCardArt(t);
  const fallbackClass = art ? '' : ' ' + teachingArtClass(t.category);
  const style = art ? ' style="background-image:linear-gradient(190deg,rgba(10,10,10,.1),rgba(10,10,10,.72)),url(\'' + escapeHtml(art) + '\')"' : '';
  return '<a class="teaching-card' + fallbackClass + '" href="' + BASE + 'teaching-detail.html?id=' + encodeURIComponent(t.id) + '"' + style + '>' +
    '<div class="teaching-card-art-text">' +
    '<span class="teaching-card-eyebrow">' + escapeHtml(t.category || 'Teaching') + '</span>' +
    '<h3>' + escapeHtml(t.title || '') + '</h3>' +
    (t.subtitle ? '<p class="teaching-card-subtitle">' + escapeHtml(t.subtitle) + '</p>' : '') +
    '</div>' +
    '<div class="teaching-card-footer">' +
    '<div><strong>' + escapeHtml(t.title || '') + '</strong><span>' + escapeHtml(formatTeachingDate(t.date || '')) + ' · ' + escapeHtml(formatTeachingTime(t.startTime, t.timeZone)) + '</span></div>' +
    '<span class="teaching-card-arrow" aria-hidden="true">→</span>' +
    '</div></a>';
}

function renderTeachingHero(){
  const wrap = document.getElementById('teachingHero');
  if(!wrap) return;
  const t = featuredTeaching();
  if(!t){
    wrap.className = 'teaching-hero teaching-hero-empty';
    wrap.innerHTML = '<div class="teaching-hero-content reveal"><div class="eyebrow">Teachings</div><h1 class="teaching-display">New Teachings<br>Coming Soon.</h1></div>';
    return;
  }
  wrap.className = 'teaching-hero';
  wrap.innerHTML = teachingHeroMediaHtml(t) +
    '<div class="teaching-hero-content reveal">' +
    '<div class="eyebrow">Upcoming Class</div>' +
    '<h1 class="teaching-display">' + escapeHtml(t.title || '') + '</h1>' +
    (t.subtitle ? '<p class="teaching-subtitle">' + escapeHtml(t.subtitle) + '</p>' : '') +
    '<p class="teaching-hero-desc">' + escapeHtml(t.shortDescription || '') + '</p>' +
    '<div class="teaching-meta-row">' +
    teachingMetaItem('calendar', [formatTeachingDate(t.date || '').toUpperCase(), formatTeachingTime(t.startTime, t.timeZone)]) +
    teachingFormatMeta(t) + teachingCapacityMeta(t) +
    '</div>' +
    '<div class="teaching-price-line">' + (t.price ? '$' + Number(t.price).toFixed(2) : 'FREE') + '</div>' +
    '<div class="teaching-hero-actions">' +
    '<button class="btn fill teaching-register-btn" type="button" data-teaching-id="' + escapeHtml(t.id) + '"' +
      (teachingStatusButtonDisabled(t) ? ' disabled' : '') + '>' + teachingStatusButtonLabel(t) + '</button>' +
    '<a class="btn" href="' + BASE + 'teaching-detail.html?id=' + encodeURIComponent(t.id) + '">View Details</a>' +
    '</div></div>';
}

function renderTeachingCards(){
  const wrap = document.getElementById('teachingCardsList');
  const section = document.getElementById('teachingCardsSection');
  if(!wrap || !section) return;
  if(!TEACHING_PAGE_SETTINGS.showUpcoming){ section.hidden = true; return; }
  const subhead = document.getElementById('teachingCardsSubhead');
  if(subhead) subhead.textContent = 'Every Thursday · ' + formatTeachingTime(TEACHING_PAGE_SETTINGS.defaultThursdayTime, TEACHING_PAGE_SETTINGS.defaultTimeZone);
  const featuredId = featuredTeaching() ? featuredTeaching().id : null;
  const items = upcomingTeachingsList().filter(t => t.id !== featuredId).slice(0, TEACHING_PAGE_SETTINGS.upcomingCount || 6);
  section.hidden = items.length === 0;
  wrap.innerHTML = items.map(teachingCardHtml).join('');
}

function renderTeachingLibrarySection(){
  const section = document.getElementById('teachingLibrarySection');
  if(!section) return;
  section.hidden = !TEACHING_PAGE_SETTINGS.showLibrary;
}
function renderTeachingScriptureSection(){
  const section = document.getElementById('teachingScriptureSection');
  if(!section) return;
  section.hidden = !TEACHING_PAGE_SETTINGS.showScripture;
  const verseEl = document.getElementById('teachingScriptureVerse');
  const refEl = document.getElementById('teachingScriptureRef');
  const artEl = section.querySelector('.teaching-scripture-art');
  if(verseEl) verseEl.textContent = '"' + (TEACHING_PAGE_SETTINGS.scriptureText || '') + '"';
  if(refEl) refEl.textContent = TEACHING_PAGE_SETTINGS.scriptureReference || '';
  if(artEl){
    const img = TEACHING_PAGE_SETTINGS.scriptureImage;
    const t = featuredTeaching();
    artEl.className = 'teaching-scripture-art' + (img ? '' : ' ' + teachingArtClass(t && t.category));
    artEl.style.backgroundImage = img ? "url('" + img + "')" : '';
  }
}
function renderTeachingNewsletterSection(){
  const section = document.getElementById('teachingNewsletterSection');
  if(section) section.hidden = !TEACHING_PAGE_SETTINGS.showNewsletter;
}

function renderTeachingDetailPage(){
  const wrap = document.getElementById('teachingDetailRoot');
  if(!wrap) return;
  const id = new URLSearchParams(window.location.search).get('id');
  const t = id ? TEACHINGS[id] : null;
  const viewerIsAdmin = !!(currentProfile && currentProfile.role === 'admin');
  if(!t || (t.status === 'draft' && !viewerIsAdmin)){
    wrap.innerHTML = '<div class="section-inner reveal" style="padding-top:160px;text-align:center">' +
      '<div class="eyebrow">Teachings</div><h1 class="teaching-display" style="margin-bottom:24px">Not Available</h1>' +
      '<p style="color:var(--stone);margin-bottom:30px">This teaching isn\'t available right now.</p>' +
      '<a class="btn" href="' + BASE + 'teachings.html">← Back To Teachings</a></div>';
    return;
  }
  const draftNoticeHtml = (t.status === 'draft')
    ? '<div class="admin-preview-flag">You\'re viewing this as a draft — it isn\'t visible to the public yet.</div>' : '';
  const learnHtml = (t.whatYouWillLearn || []).map(li => '<li>' + escapeHtml(li) + '</li>').join('');
  wrap.innerHTML = draftNoticeHtml +
    '<header class="teaching-hero teaching-detail-hero">' + teachingHeroMediaHtml(t) +
    '<div class="teaching-hero-content reveal">' +
    '<div class="eyebrow">' + escapeHtml(t.category || 'Teaching') + '</div>' +
    '<h1 class="teaching-display">' + escapeHtml(t.title || '') + '</h1>' +
    (t.subtitle ? '<p class="teaching-subtitle">' + escapeHtml(t.subtitle) + '</p>' : '') +
    '</div></header>' +
    '<section class="on-light-section">' +
    '<div class="teaching-detail-grid reveal">' +
    '<div class="teaching-detail-facts">' +
    '<div><span>Date</span><strong>' + escapeHtml(formatTeachingDate(t.date || '')) + '</strong></div>' +
    '<div><span>Time</span><strong>' + escapeHtml(formatTeachingTime(t.startTime, t.timeZone)) + '</strong></div>' +
    '<div><span>Format</span><strong>' + (t.format === 'zoom' ? 'Live on Zoom' : t.format === 'in-person' ? ('In Person' + (t.location ? ' — ' + escapeHtml(t.location) : '')) : t.format === 'hybrid' ? 'Hybrid' : 'Other') + '</strong></div>' +
    '<div><span>Price</span><strong>' + (t.price ? '$' + Number(t.price).toFixed(2) : 'Free') + '</strong></div>' +
    '<div><span>Instructor</span><strong>' + escapeHtml(t.instructor || 'The Unveiled Assembly') + '</strong></div>' +
    '<button class="btn on-light fill teaching-register-btn" type="button" data-teaching-id="' + escapeHtml(t.id) + '"' +
      (teachingStatusButtonDisabled(t) ? ' disabled' : '') + '>' + teachingStatusButtonLabel(t) + '</button>' +
    '</div>' +
    '<div class="teaching-detail-copy">' +
    '<h2 class="teaching-subtitle-heading">About This Teaching</h2>' +
    '<p>' + escapeHtml(t.fullDescription || t.shortDescription || '') + '</p>' +
    (learnHtml ? '<h2 class="teaching-subtitle-heading" style="margin-top:36px">What You Will Learn</h2><ul class="teaching-learn-list">' + learnHtml + '</ul>' : '') +
    '</div></div></section>';
}

function renderPublicTeachingPages(){
  const page = document.body.dataset.page;
  if(page === 'teachings'){
    renderTeachingHero();
    renderTeachingCards();
    renderTeachingLibrarySection();
    renderTeachingScriptureSection();
    renderTeachingNewsletterSection();
  } else if(page === 'teaching-detail'){
    renderTeachingDetailPage();
  }
}
renderPublicTeachingPages();

/* ---------------------------------------------------------------
   Auth state
   --------------------------------------------------------------- */
onAuthStateChanged(auth, async (user) => {
  currentUser = user;
  if(user){
    if(DEMO_MODE){
      // Never touch real Firestore in demo mode — the profile is built
      // straight from the sample user object the demo sign-in created.
      currentProfile = { name: user.displayName || '', email: user.email, role: user.role || 'member' };
    } else {
      try {
        const profileSnap = await getDoc(doc(db, 'users', user.uid));
        currentProfile = profileSnap.exists() ? profileSnap.data() : { name: user.displayName || '', email: user.email, role: 'member' };
      } catch (err) {
        currentProfile = { name: user.displayName || '', email: user.email, role: 'member' };
      }
    }
    document.getElementById('memberWelcomeName').textContent = currentProfile.name ? ', ' + currentProfile.name.split(' ')[0] : '';
    document.getElementById('memberAccountLabel').textContent = currentProfile.role === 'admin' ? 'Admin Account' : 'Student Account';
    updateAccountSettingsDisplay('member');
    updateAccountSettingsDisplay('owner');
    setAccountControlLabel(currentProfile.role === 'admin' ? 'Ministry' : 'My Account');
  } else {
    currentProfile = null;
    setAccountControlLabel('Sign In');
  }
  refreshPortalTabs();
  // A signed-in admin can preview their own drafts on the public
  // Teaching detail page — re-render now that we actually know who's
  // viewing (this listener resolves after the page's first paint).
  renderPublicTeachingPages();
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
