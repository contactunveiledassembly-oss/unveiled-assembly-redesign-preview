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
let DEMO_BOOKINGS = [
  { id: 'demo-1', slotId: DEMO_TUE1 + '_14:00', date: DEMO_TUE1, time: '14:00', sessionType: '30-minute', name: 'Jordan Lee', email: 'jordan@example.com', uid: null, status: 'pending' },
  { id: 'demo-2', slotId: DEMO_THU1 + '_15:00', date: DEMO_THU1, time: '15:00', sessionType: '15-minute', name: 'Amara Okafor', email: 'amara@example.com', uid: null, status: 'confirmed' },
  { id: 'demo-3', slotId: DEMO_TUE2 + '_16:00', date: DEMO_TUE2, time: '16:00', sessionType: '30-minute', name: 'Sam Rivera', email: 'sam@example.com', uid: null, status: 'confirmed' },
];
const DEMO_MEMBERS = [
  { id: 'demo-m1', name: 'Jordan Lee', email: 'jordan@example.com', role: 'member' },
  { id: 'demo-m2', name: 'Amara Okafor', email: 'amara@example.com', role: 'member' },
  { id: 'demo-m3', name: 'Sam Rivera', email: 'sam@example.com', role: 'member' },
];
let DEMO_BLOCKED_DATES = [demoNextWeekdayStr(4, 2)];
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
  { page: 'one-on-one', href: 'one-on-one.html', label: 'One-on-One' },
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
// A compact flag + dial code is the visible label (matches modern checkout
// phone fields — a small code chip, not a full-width country name that
// competes visually with the number field beside it); `full` is the
// complete name kept as a title attribute for screen readers/hover.
const COUNTRY_CODES = [
  { code: '+1', label: '🇺🇸 +1', full: 'United States / Canada +1' },
  { code: '+44', label: '🇬🇧 +44', full: 'United Kingdom +44' },
  { code: '+234', label: '🇳🇬 +234', full: 'Nigeria +234' },
  { code: '+91', label: '🇮🇳 +91', full: 'India +91' },
  { code: '+254', label: '🇰🇪 +254', full: 'Kenya +254' },
  { code: '+233', label: '🇬🇭 +233', full: 'Ghana +233' },
  { code: '+27', label: '🇿🇦 +27', full: 'South Africa +27' },
  { code: '+61', label: '🇦🇺 +61', full: 'Australia +61' },
  { code: '+33', label: '🇫🇷 +33', full: 'France +33' },
  { code: '+49', label: '🇩🇪 +49', full: 'Germany +49' },
  { code: 'other', label: '🌐 Other', full: 'Other — type your full number with +country code' },
];
const COUNTRY_OPTIONS = COUNTRY_CODES.map(c => `<option value="${c.code}" title="${c.full}">${c.label}</option>`).join('');

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
          <div class="admin-panel-head">
            <div>
              <span class="portal-label">Media</span>
              <p class="admin-panel-intro">Every image you've uploaded, in one place. Upload here first, then use "Use For Teaching" to put it on a class — or upload directly from Teachings → open a class → Images.</p>
            </div>
            <div class="admin-panel-head-actions">
              <label class="admin-btn-solid" id="ownerMediaUploadLabel" style="cursor:pointer">Upload New Image<input type="file" accept="image/*" id="ownerMediaUploadFile" hidden /></label>
            </div>
          </div>
          <div id="ownerMediaGallery" class="admin-media-gallery"></div>
        </article>
        <article class="portal-panel admin-panel" style="grid-column:1/-1" data-owner-section="bookings">
          <div class="admin-panel-head">
            <div>
              <span class="portal-label">Bookings</span>
              <p class="admin-panel-intro">1:1 appointment requests, your calendar, availability, session types, blocked dates, and reminders — all in one place.</p>
            </div>
          </div>
          <div class="admin-tabs" id="bookingsSubNav" role="tablist" style="margin:16px 0">
            <button type="button" class="admin-tab active" data-bookings-tab="overview">Overview</button>
            <button type="button" class="admin-tab" data-bookings-tab="appointments">Appointments</button>
            <button type="button" class="admin-tab" data-bookings-tab="calendar">Calendar</button>
            <button type="button" class="admin-tab" data-bookings-tab="availability">Availability</button>
            <button type="button" class="admin-tab" data-bookings-tab="types">Session Types</button>
            <button type="button" class="admin-tab" data-bookings-tab="blocked">Blocked Dates</button>
            <button type="button" class="admin-tab" data-bookings-tab="policies">Policies</button>
            <button type="button" class="admin-tab" data-bookings-tab="notifications">Notifications</button>
            <button type="button" class="admin-tab" data-bookings-tab="clients">Clients</button>
            <button type="button" class="admin-tab" data-bookings-tab="reports">Reports</button>
          </div>

          <div class="admin-edit-panel" data-bookings-panel="overview">
            <div class="admin-stat-row" id="bookingsOverviewStats"></div>
            <div style="display:grid;grid-template-columns:1.3fr 1fr;gap:20px;margin-top:22px" class="owner-dashboard-lower">
              <div>
                <div class="admin-subsection-label" style="border-top:0;padding-top:0">Today's Schedule</div>
                <div id="bookingsTodayList"></div>
                <div class="admin-subsection-label">Upcoming Appointments</div>
                <div id="bookingsUpcomingPreview"></div>
                <div class="admin-subsection-label">Calendar Preview <span class="admin-hint">— this week</span></div>
                <div id="bookingsCalendarPreview"></div>
              </div>
              <div>
                <div class="admin-subsection-label" style="border-top:0;padding-top:0">Quick Actions</div>
                <div style="display:flex;flex-direction:column;gap:8px" id="bookingsQuickActions">
                  <button type="button" class="admin-btn-ghost" data-bookings-quick-action="new-appointment" style="text-align:left">New Appointment</button>
                  <button type="button" class="admin-btn-ghost" data-bookings-quick-action="copy-link" style="text-align:left">Copy Booking Link</button>
                  <button type="button" class="admin-btn-ghost" data-bookings-quick-action="preview-page" style="text-align:left">Preview Booking Page ↗</button>
                  <button type="button" class="admin-btn-ghost" data-bookings-quick-action="availability" style="text-align:left">Manage Availability</button>
                  <button type="button" class="admin-btn-ghost" data-bookings-quick-action="blocked" style="text-align:left">Block A Date</button>
                  <button type="button" class="admin-btn-ghost" data-bookings-quick-action="types" style="text-align:left">Manage Session Types</button>
                  <button type="button" class="admin-btn-ghost" data-bookings-quick-action="reminder" style="text-align:left" title="Coming Later">Send Scheduling Reminder</button>
                  <button type="button" class="admin-btn-ghost" data-bookings-quick-action="notifications" style="text-align:left">Manage Notifications</button>
                </div>
                <div class="form-status" id="bookingsQuickActionStatus" style="color:var(--owner-text-muted);margin-top:8px"></div>
                <div class="admin-subsection-label">Ministry Insights</div>
                <div id="bookingsInsights"></div>
              </div>
            </div>
          </div>

          <div class="admin-edit-panel" data-bookings-panel="appointments" hidden>
            <div class="admin-tabs" id="bookingsApptFilterTabs" role="tablist" style="margin-bottom:16px">
              <button type="button" class="admin-tab active" data-appt-filter="all">All</button>
              <button type="button" class="admin-tab" data-appt-filter="upcoming">Upcoming</button>
              <button type="button" class="admin-tab" data-appt-filter="pending">Pending</button>
              <button type="button" class="admin-tab" data-appt-filter="completed">Completed</button>
              <button type="button" class="admin-tab" data-appt-filter="cancelled">Cancelled</button>
            </div>
            <div data-appt-section="pending">
              <div class="admin-subsection-label" style="border-top:0;padding-top:0">Pending Requests</div>
              <div id="ownerBookingsList"><p class="admin-hint">Loading booking requests…</p></div>
            </div>
            <div data-appt-section="upcoming">
              <div class="admin-subsection-label">Upcoming (Confirmed)</div>
              <div id="ownerConfirmedList"><p class="admin-hint">Loading appointments…</p></div>
            </div>
            <div data-appt-section="completed">
              <div class="admin-subsection-label">Completed</div>
              <div id="ownerCompletedList"><p class="admin-hint">Loading…</p></div>
            </div>
            <div data-appt-section="cancelled">
              <div class="admin-subsection-label">Cancelled / Declined</div>
              <div id="ownerCancelledList"><p class="admin-hint">Loading…</p></div>
            </div>
            <div class="admin-subsection-label">Add An Appointment</div>
            <p class="admin-hint" style="margin-bottom:14px">Manually schedule someone (phone-in requests, etc). This books and confirms in one step.</p>
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
                <button class="admin-btn-solid" type="submit" id="adminBookSubmitBtn">Add &amp; Confirm</button>
                <div class="form-status" id="adminBookStatus" role="status" aria-live="polite" style="color:var(--owner-text-muted)"></div>
              </div>
            </form>
          </div>

          <div class="admin-edit-panel" data-bookings-panel="calendar" hidden>
            <div class="admin-tabs" id="bookingsCalendarViewTabs" role="tablist" style="margin-bottom:10px">
              <button type="button" class="admin-tab" data-cal-view="day">Day</button>
              <button type="button" class="admin-tab active" data-cal-view="week">Week</button>
              <button type="button" class="admin-tab" data-cal-view="month">Month</button>
            </div>
            <p class="admin-hint" style="margin-bottom:16px">All booking times are shown in Eastern Time.</p>
            <div id="bookingsCalendarView"></div>
          </div>

          <div class="admin-edit-panel" data-bookings-panel="availability" hidden>
            <p class="admin-hint" style="margin-bottom:16px">Controls when visitors are allowed to request a 1:1 session — your time zone, how far ahead people can book, and how much notice you need.</p>
            <div style="display:flex;gap:24px;flex-wrap:wrap;align-items:flex-end;margin-bottom:16px">
              <div class="form-field" style="min-width:260px">
                <label for="schedTimezone">Ministry Time Zone</label>
                <select id="schedTimezone" style="background:#fdfcfb;color:var(--black);border-color:#bfbfbf">
                  <option value="America/New_York">Eastern (America/New_York)</option>
                  <option value="America/Chicago">Central (America/Chicago)</option>
                  <option value="America/Denver">Mountain (America/Denver)</option>
                  <option value="America/Los_Angeles">Pacific (America/Los_Angeles)</option>
                  <option value="America/Anchorage">Alaska (America/Anchorage)</option>
                  <option value="Pacific/Honolulu">Hawaii (Pacific/Honolulu)</option>
                </select>
              </div>
              <div class="form-field" style="flex:0 0 170px"><label for="schedMaxPerDay">Maximum Appointments Per Day</label><input id="schedMaxPerDay" type="number" min="0" placeholder="No limit" style="background:#fdfcfb;color:var(--black);border-color:#bfbfbf" /></div>
              <div class="form-field" style="flex:0 0 150px"><label for="schedMinNotice">Minimum Notice (hours)</label><input id="schedMinNotice" type="number" min="0" placeholder="None" style="background:#fdfcfb;color:var(--black);border-color:#bfbfbf" /></div>
              <div class="form-field" style="flex:0 0 170px"><label for="schedMaxAdvance">Maximum Advance Booking (days)</label><input id="schedMaxAdvance" type="number" min="0" placeholder="No limit" style="background:#fdfcfb;color:var(--black);border-color:#bfbfbf" /></div>
              <label style="display:flex;align-items:center;gap:8px;color:var(--owner-text);font-size:13px;padding-bottom:8px">
                <input id="schedBookingPaused" type="checkbox" style="accent-color:var(--owner-accent)" />
                Pause all new booking requests
              </label>
              <button class="admin-btn-solid" type="button" id="schedSettingsSaveBtn">Save Settings</button>
            </div>
            <div class="form-status" id="schedSettingsStatus" style="color:var(--owner-text-muted);margin-bottom:8px"></div>
            <p class="admin-hint" style="margin-bottom:20px">"Buffer Time" is set per Session Type (see the Session Types tab) since different session lengths often need different breathing room.</p>

            <div class="admin-subsection-label">Available Days &amp; Hours</div>
            <p class="admin-hint" style="margin-bottom:12px">These are the weekly windows visitors can request a time in. Add as many as you'd like — each one applies every week until removed.</p>
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
              <div class="form-field" style="flex:1;min-width:180px">
                <label>Session Types Allowed</label>
                <div id="schedRuleTypesCheckboxes" style="display:flex;gap:14px;flex-wrap:wrap;padding-top:11px"></div>
              </div>
              <div class="form-field" style="flex:1;min-width:160px"><label for="schedRuleNotes">Notes <span class="admin-hint">(optional)</span></label><input id="schedRuleNotes" type="text" placeholder="e.g. Prayer line only" style="background:#fdfcfb;color:var(--black);border-color:#bfbfbf" /></div>
              <button class="admin-btn-ghost" type="submit">Add Window</button>
            </form>
            <div class="form-status" id="schedRuleStatus" style="color:var(--owner-text-muted);margin-top:8px"></div>
            <p class="admin-hint" style="margin-top:8px">A new window applies to all session types, with the capacity you set (how many people can book the same exact time). Remove and re-add a window to change it.</p>
          </div>

          <div class="admin-edit-panel" data-bookings-panel="types" hidden>
            <p class="admin-hint" style="margin-bottom:8px">The kinds of 1:1 appointments visitors can request. These are exactly what shows up on the public One-on-One Sessions page — nothing here is a separate list.</p>
            <p class="admin-hint" style="margin-bottom:16px"><strong style="color:var(--owner-text)">Right now, only 15-Minute and 30-Minute One-on-One are active</strong> and shown publicly. You can add more below for later — a new one only appears on the public page once you mark it Active.</p>
            <div id="schedTypesList" style="margin-bottom:14px"></div>
            <div class="admin-subsection-label" style="border-top:0;padding-top:0">Add / Update A Session Type</div>
            <form id="schedTypeForm" style="display:flex;gap:8px;align-items:flex-end;flex-wrap:wrap">
              <div class="form-field" style="flex:1;min-width:130px"><label for="schedTypeId">ID</label><input id="schedTypeId" type="text" placeholder="e.g. 30-minute" required style="background:#fdfcfb;color:var(--black);border-color:#bfbfbf" /></div>
              <div class="form-field" style="flex:1;min-width:170px"><label for="schedTypeName">Name</label><input id="schedTypeName" type="text" placeholder="e.g. 30-Minute One-on-One" required style="background:#fdfcfb;color:var(--black);border-color:#bfbfbf" /></div>
              <div class="form-field" style="flex:0 0 100px"><label for="schedTypeDuration">Minutes</label><input id="schedTypeDuration" type="number" min="5" step="5" required style="background:#fdfcfb;color:var(--black);border-color:#bfbfbf" /></div>
              <div class="form-field" style="flex:0 0 120px"><label for="schedTypePrice">Price</label><input id="schedTypePrice" type="number" min="0" step="0.01" placeholder="No charge" style="background:#fdfcfb;color:var(--black);border-color:#bfbfbf" /></div>
              <div class="form-field" style="flex:0 0 130px"><label for="schedTypeFormat">Format</label>
                <select id="schedTypeFormat" style="background:#fdfcfb;color:var(--black);border-color:#bfbfbf">
                  <option value="zoom">Zoom</option><option value="phone">Phone</option><option value="in-person">In Person</option>
                </select>
              </div>
              <div class="form-field" style="flex:0 0 130px"><label for="schedTypeCapacity">Capacity <span class="admin-hint">(optional)</span></label><input id="schedTypeCapacity" type="number" min="1" placeholder="Unlimited" style="background:#fdfcfb;color:var(--black);border-color:#bfbfbf" /></div>
              <div class="form-field" style="flex:0 0 110px"><label for="schedTypeBufferBefore">Buffer before</label><input id="schedTypeBufferBefore" type="number" min="0" step="5" placeholder="0 min" style="background:#fdfcfb;color:var(--black);border-color:#bfbfbf" /></div>
              <div class="form-field" style="flex:0 0 110px"><label for="schedTypeBufferAfter">Buffer after</label><input id="schedTypeBufferAfter" type="number" min="0" step="5" placeholder="0 min" style="background:#fdfcfb;color:var(--black);border-color:#bfbfbf" /></div>
              <div class="form-field" style="flex:1;min-width:200px"><label for="schedTypeDescription">Description</label><input id="schedTypeDescription" type="text" style="background:#fdfcfb;color:var(--black);border-color:#bfbfbf" /></div>
              <div class="admin-image-field" data-image-field="session-type" style="max-width:280px">
                <span class="admin-microlabel">Session Image <span class="admin-hint">(optional — shown on the public One-on-One page)</span></span>
                <div class="admin-image-preview" id="schedTypeImagePreview"></div>
                <div class="admin-image-actions">
                  <label class="admin-image-upload-btn"><span class="admin-image-upload-btn-text">Upload Image</span><input type="file" accept="image/*" id="schedTypeImageFile" hidden /></label>
                  <button type="button" class="admin-image-remove-btn" id="schedTypeImageRemove">Remove Image</button>
                </div>
                <input type="hidden" id="schedTypeImage" />
              </div>
              <button class="admin-btn-solid" type="submit">Add / Update Type</button>
            </form>
            <div class="form-status" id="schedTypeStatus" style="color:var(--owner-text-muted);margin-top:8px"></div>
            <p class="admin-hint" style="margin-top:8px">Using an existing ID updates that type instead of creating a new one. Prices and descriptions here are placeholders until a real payment processor is connected.</p>
          </div>

          <div class="admin-edit-panel" data-bookings-panel="blocked" hidden>
            <div class="admin-subsection-label" style="border-top:0;padding-top:0">Single Date Block</div>
            <p class="admin-hint" style="margin-bottom:12px">Mark one date as fully unavailable — holidays, a personal day, travel. Visitors won't see any open times that day.</p>
            <form id="blockDateForm" style="display:flex;gap:8px;align-items:flex-end;flex-wrap:wrap">
              <div class="form-field" style="flex:1;min-width:160px">
                <label for="blockDateInput">Date</label>
                <input id="blockDateInput" type="date" required style="background:#fdfcfb;color:var(--black);border-color:#bfbfbf" />
              </div>
              <button class="admin-btn-ghost" type="submit" id="blockDateSubmitBtn">Block This Date</button>
            </form>
            <div class="form-status" id="blockDateStatus" style="color:var(--owner-text-muted);margin-top:8px"></div>
            <div id="blockedDatesList" style="margin-top:14px"></div>

            <div class="admin-subsection-label">Date Range Block</div>
            <p class="admin-hint" style="margin-bottom:12px">For vacations, holidays, or multi-day closures.</p>
            <div id="schedRangesList" style="margin-bottom:14px"></div>
            <form id="schedRangeForm" style="display:flex;gap:8px;align-items:flex-end;flex-wrap:wrap">
              <div class="form-field" style="flex:1;min-width:150px"><label for="schedRangeStart">Start date</label><input id="schedRangeStart" type="date" required style="background:#fdfcfb;color:var(--black);border-color:#bfbfbf" /></div>
              <div class="form-field" style="flex:1;min-width:150px"><label for="schedRangeEnd">End date</label><input id="schedRangeEnd" type="date" required style="background:#fdfcfb;color:var(--black);border-color:#bfbfbf" /></div>
              <div class="form-field" style="flex:1;min-width:160px"><label for="schedRangeReason">Reason (optional)</label><input id="schedRangeReason" type="text" placeholder="e.g. Vacation" style="background:#fdfcfb;color:var(--black);border-color:#bfbfbf" /></div>
              <button class="admin-btn-ghost" type="submit">Block Range</button>
            </form>
            <div class="form-status" id="schedRangeStatus" style="color:var(--owner-text-muted);margin-top:8px"></div>

            <div class="admin-subsection-label">Specific Time Block</div>
            <p class="admin-hint" style="margin-bottom:12px">Change just one date's hours — for example, open later than usual, close early, or fully closed for part of the day. Set a start and end time and the system automatically offers every bookable time inside it (no need to list each time by hand). Leave start/end blank and check "Fully closed" to block the whole date.</p>
            <div id="schedOverridesList" style="margin-bottom:14px"></div>
            <form id="schedOverrideForm" style="display:flex;gap:8px;align-items:flex-end;flex-wrap:wrap">
              <div class="form-field" style="flex:1;min-width:150px"><label for="schedOverrideDate">Date</label><input id="schedOverrideDate" type="date" required style="background:#fdfcfb;color:var(--black);border-color:#bfbfbf" /></div>
              <div class="form-field" style="flex:0 0 120px"><label for="schedOverrideStart">Start</label><input id="schedOverrideStart" type="time" style="background:#fdfcfb;color:var(--black);border-color:#bfbfbf" /></div>
              <div class="form-field" style="flex:0 0 120px"><label for="schedOverrideEnd">End</label><input id="schedOverrideEnd" type="time" style="background:#fdfcfb;color:var(--black);border-color:#bfbfbf" /></div>
              <div class="form-field" style="flex:1;min-width:180px">
                <label>Session Types Allowed</label>
                <div id="schedOverrideTypesCheckboxes" style="display:flex;gap:14px;flex-wrap:wrap;padding-top:11px"></div>
              </div>
              <div class="form-field" style="flex:1;min-width:160px"><label for="schedOverrideNotes">Notes <span class="admin-hint">(optional)</span></label><input id="schedOverrideNotes" type="text" placeholder="e.g. Ministry event" style="background:#fdfcfb;color:var(--black);border-color:#bfbfbf" /></div>
              <label style="display:flex;align-items:center;gap:6px;font-size:12px;color:var(--owner-text);padding-bottom:8px">
                <input id="schedOverrideClosed" type="checkbox" style="accent-color:var(--owner-accent)" /> Fully closed this date
              </label>
              <button class="admin-btn-ghost" type="submit">Save Override</button>
            </form>
            <div class="form-status" id="schedOverrideStatus" style="color:var(--owner-text-muted);margin-top:8px"></div>
          </div>

          <div class="admin-edit-panel" data-bookings-panel="policies" hidden>
            <p class="admin-hint" style="margin-bottom:20px">The exact wording shown to visitors at checkout. They must agree to both before completing a booking.</p>

            <div class="admin-image-card">
              <div class="admin-image-card-head">
                <span class="admin-image-card-title">Terms and Conditions</span>
                <p class="admin-hint">Shown as a required checkbox and a "Read Terms and Conditions" link at checkout.</p>
              </div>
              <div class="booking-grid">
                <div class="booking-field full"><label for="policyTermsTitle">Policy Title</label><input id="policyTermsTitle" type="text" style="background:#fdfcfb;color:var(--black);border-color:#bfbfbf" /></div>
                <div class="booking-field full"><label for="policyTermsText">Policy Text</label><textarea id="policyTermsText" rows="5" style="background:#fdfcfb;color:var(--black);border-color:#bfbfbf"></textarea></div>
              </div>
              <label class="admin-checkbox-field" style="padding-top:0;margin-top:4px"><input id="policyTermsActive" type="checkbox" /> Show this policy at checkout (turn off to hide it)</label>
              <p class="admin-hint" id="policyTermsUpdated" style="margin-top:8px"></p>
              <button class="admin-btn-solid" type="button" id="policyTermsSaveBtn" style="margin-top:12px">Save Changes</button>
              <div class="form-status" id="policyTermsStatus" style="color:var(--owner-text-muted);margin-top:8px"></div>
            </div>

            <div class="admin-image-card">
              <div class="admin-image-card-head">
                <span class="admin-image-card-title">No Refund Policy</span>
                <p class="admin-hint">Shown as a required checkbox and a "Read No Refund Policy" link at checkout.</p>
              </div>
              <div class="booking-grid">
                <div class="booking-field full"><label for="policyNoRefundTitle">Policy Title</label><input id="policyNoRefundTitle" type="text" style="background:#fdfcfb;color:var(--black);border-color:#bfbfbf" /></div>
                <div class="booking-field full"><label for="policyNoRefundText">Policy Text</label><textarea id="policyNoRefundText" rows="5" style="background:#fdfcfb;color:var(--black);border-color:#bfbfbf"></textarea></div>
              </div>
              <label class="admin-checkbox-field" style="padding-top:0;margin-top:4px"><input id="policyNoRefundActive" type="checkbox" /> Show this policy at checkout (turn off to hide it)</label>
              <p class="admin-hint" id="policyNoRefundUpdated" style="margin-top:8px"></p>
              <button class="admin-btn-solid" type="button" id="policyNoRefundSaveBtn" style="margin-top:12px">Save Changes</button>
              <div class="form-status" id="policyNoRefundStatus" style="color:var(--owner-text-muted);margin-top:8px"></div>
            </div>
          </div>

          <div class="admin-edit-panel" data-bookings-panel="notifications" hidden>
            <p class="admin-hint" style="margin-bottom:16px">Choose which messages you'd like sent around a 1:1 booking. <strong>These switches save your preference now — actual email/SMS delivery isn't connected yet</strong>, so nothing is sent until a real provider is wired up.</p>
            <label class="admin-checkbox-field" style="padding-top:0;margin-bottom:14px"><input id="bookingsNotifyConfirmation" type="checkbox" /> Booking Confirmation — sent when a request is confirmed <span class="admin-status-pill draft">Not Connected Yet</span></label>
            <label class="admin-checkbox-field" style="padding-top:0;margin-bottom:14px"><input id="bookingsNotifyReminder24" type="checkbox" /> 24-Hour Reminder — sent the day before the appointment <span class="admin-status-pill draft">Not Connected Yet</span></label>
            <label class="admin-checkbox-field" style="padding-top:0;margin-bottom:14px"><input id="bookingsNotifyReminder1" type="checkbox" /> 1-Hour Reminder — sent shortly before the session starts <span class="admin-status-pill draft">Not Connected Yet</span></label>
            <label class="admin-checkbox-field" style="padding-top:0;margin-bottom:14px"><input id="bookingsNotifyCancellation" type="checkbox" /> Cancellation Notice — sent if a booking is cancelled or declined <span class="admin-status-pill draft">Not Connected Yet</span></label>
            <label class="admin-checkbox-field" style="padding-top:0;margin-bottom:20px"><input id="bookingsNotifyReschedule" type="checkbox" /> Reschedule Notice — sent when a booking's time is changed <span class="admin-status-pill draft">Not Connected Yet</span></label>
            <button class="admin-btn-solid" type="button" id="bookingsNotifySaveBtn">Save Changes</button>
            <div class="form-status" id="bookingsNotifyStatus" style="color:var(--owner-text-muted);margin-top:10px"></div>
          </div>

          <div class="admin-edit-panel" data-bookings-panel="clients" hidden>
            <p class="admin-hint" style="margin-bottom:16px">Everyone who has requested or completed a 1:1 session, gathered from your bookings — not a separate contact list.</p>
            <div id="bookingsClientsList"></div>
          </div>

          <div class="admin-edit-panel" data-bookings-panel="reports" hidden>
            <p class="admin-hint" style="margin-bottom:16px">A simple look at booking activity. Revenue reporting will appear here honestly once a real payment processor is connected — these counts are real, drawn from your actual bookings.</p>
            <div class="admin-stat-row" id="bookingsReportsStats"></div>
            <div class="admin-subsection-label" style="border-top:0;padding-top:0">Most Requested Session Types</div>
            <div id="bookingsReportsTypes"></div>
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
                <label class="admin-image-upload-btn"><span class="admin-image-upload-btn-text">Upload Image</span><input type="file" accept="image/*" id="teachingSettingsScriptureImageFile" hidden /></label>
                <button type="button" class="admin-image-remove-btn" id="teachingSettingsScriptureImageRemove">Remove Image</button>
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
          <span class="portal-label">Account Profile</span>
          <p class="admin-panel-intro">Your name, photo, and role, as shown across the Owner dashboard.</p>
          <div class="admin-profile-photo-row">
            <div class="admin-profile-photo" id="ownerProfilePhotoPreview">?</div>
            <div class="admin-profile-photo-actions">
              <label class="admin-image-upload-btn" style="cursor:pointer">Upload Photo<input type="file" accept="image/*" id="ownerProfilePhotoFile" hidden /></label>
              <button type="button" class="admin-image-remove-btn" id="ownerProfilePhotoRemove">Remove Photo</button>
            </div>
          </div>
          <div class="booking-grid" style="margin-top:20px">
            <div class="booking-field"><label for="ownerProfileFirstName">First Name</label><input id="ownerProfileFirstName" type="text" /></div>
            <div class="booking-field"><label for="ownerProfileLastName">Last Name</label><input id="ownerProfileLastName" type="text" /></div>
            <div class="booking-field"><label for="ownerProfileEmailDisplay">Email</label><input id="ownerProfileEmailDisplay" type="text" readonly /></div>
            <div class="booking-field"><label for="ownerProfilePhoneDisplay">Phone</label><input id="ownerProfilePhoneDisplay" type="text" readonly /></div>
            <div class="booking-field"><label for="ownerProfileRoleDisplay">Role</label><input id="ownerProfileRoleDisplay" type="text" readonly value="Owner" /></div>
          </div>
          <p class="admin-hint" style="margin:10px 0 16px">To change your email or phone number, use Account Settings below.</p>
          <button class="admin-btn-solid" type="button" id="ownerProfileSaveBtn">Save Changes</button>
          <div class="form-status" id="ownerProfileStatus" style="color:var(--owner-text-muted);margin-top:10px"></div>
        </article>
        <article class="portal-panel" style="grid-column:1/-1" data-owner-section="settings">
          <span class="portal-label">Appearance</span>
          <p class="admin-panel-intro">This changes how your Owner dashboard looks on this device — it has no effect on the public website.</p>

          <div class="admin-subsection-label" style="border-top:0;padding-top:0;margin-top:18px">Owner Theme</div>
          <p class="admin-hint" style="margin-bottom:18px">Modern Light — a clean white-and-light-gray layout with a black sidebar. This is the Owner dashboard's only theme, so it always looks and feels the same.</p>

          <div class="admin-subsection-label">Accent Style</div>
          <p class="admin-hint" style="margin-bottom:14px">Only changes small details — the highlighted sidebar item, small badges, focus outlines, and thin accent lines. It never changes your page backgrounds or text color.</p>
          <div class="appearance-swatches" id="appearanceAccentRow" style="margin-bottom:22px">
            <button type="button" class="appearance-swatch" data-appearance-accent="ink" style="background:#000000" title="Neutral Black"></button>
            <button type="button" class="appearance-swatch" data-appearance-accent="gold" style="background:#a9782f" title="Soft Gold"></button>
            <button type="button" class="appearance-swatch" data-appearance-accent="taupe" style="background:#7a6552" title="Warm Taupe"></button>
            <button type="button" class="appearance-swatch" data-appearance-accent="bluegray" style="background:#3d4f68" title="Soft Blue Gray"></button>
          </div>

          <div class="admin-subsection-label">Preview</div>
          <div class="appearance-preview">
            <button type="button" class="admin-btn-solid">Primary Button</button>
            <button type="button" class="admin-btn-ghost">Outline Button</button>
            <input type="text" placeholder="Input field" style="max-width:160px;padding:9px 14px;border-radius:var(--owner-radius-pill);border:1px solid var(--owner-border-strong);background:var(--owner-surface);color:var(--owner-text)" readonly />
            <span class="admin-status-pill published">Badge</span>
            <div class="appearance-preview-sidebar">
              <div class="appearance-preview-sidebar-item">Dashboard</div>
              <div class="appearance-preview-sidebar-item active">Teachings</div>
            </div>
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

  <dialog class="booking-dialog checkout-dialog" id="bookingDialog" aria-labelledby="bookingTitle">
    <button class="booking-close checkout-close" id="closeBooking" type="button" aria-label="Close scheduling">×</button>
    <div class="checkout-grid">
      <div class="checkout-summary" id="bookingSummaryArt">
        <div class="checkout-summary-overlay"></div>
        <div class="checkout-summary-content">
          <div class="eyebrow">One-on-One Session</div>
          <h2 class="teaching-display" id="bookingTitle">Choose Your Session.</h2>
          <div class="checkout-summary-meta" id="bookingSummaryMeta"></div>
          <p class="checkout-summary-desc" id="bookingSummaryDesc">15 or 30 minutes of focused, personal time with The Unveiled Assembly.</p>
        </div>
      </div>
      <div class="checkout-form-side">
        <div class="oneonone-steps checkout-step-strip" id="bookingStepStrip">
          <div class="oneonone-step" data-step-indicator="session"><div class="oneonone-step-num">1</div><div class="oneonone-step-label">Session</div></div>
          <div class="oneonone-step" data-step-indicator="date"><div class="oneonone-step-num">2</div><div class="oneonone-step-label">Date &amp; Time</div></div>
          <div class="oneonone-step" data-step-indicator="details"><div class="oneonone-step-num">3</div><div class="oneonone-step-label">Details &amp; Payment</div></div>
          <div class="oneonone-step" data-step-indicator="confirm"><div class="oneonone-step-num">4</div><div class="oneonone-step-label">Confirmation</div></div>
        </div>
        <form id="bookingForm">
          <div style="position:absolute;left:-9999px;width:1px;height:1px;overflow:hidden" aria-hidden="true">
            <label for="bookingWebsite">Leave this field blank</label>
            <input id="bookingWebsite" name="website" type="text" tabindex="-1" autocomplete="off" />
          </div>

          <div class="booking-step" data-booking-step="session">
            <div class="admin-microlabel checkout-section-label">Select A Session</div>
            <p class="booking-intro" id="bookingIntro">Choose the kind of one-on-one you'd like.</p>
            <div class="booking-options" id="bookingOptions" aria-label="Choose a one-on-one service"></div>
            <div class="booking-step-actions">
              <button type="button" class="admin-btn-solid checkout-submit" id="bookingStepSessionNext">Continue</button>
            </div>
          </div>

          <div class="booking-step" data-booking-step="date" hidden>
            <div class="admin-microlabel checkout-section-label">Your Time Zone</div>
            <div class="booking-field full" style="margin-bottom:18px">
              <select id="bookingTimeZone" name="timeZone"></select>
            </div>
            <div class="booking-date-time-layout">
              <div>
                <div class="admin-microlabel checkout-section-label">Choose A Date</div>
                <div class="booking-field full">
                  <input id="bookingDate" name="date" type="date" required />
                </div>
              </div>
              <div>
                <div class="admin-microlabel checkout-section-label">Available Times</div>
                <p class="admin-hint" style="margin-bottom:14px">All times are shown in Eastern Time.</p>
                <div class="booking-time-grid" id="bookingTimeButtons"></div>
                <select id="bookingTime" name="time" required disabled style="position:absolute;left:-9999px;width:1px;height:1px;overflow:hidden" aria-hidden="true" tabindex="-1">
                  <option value="">Choose a date first</option>
                </select>
                <div class="booking-hold-notice" id="bookingHoldNotice" role="status" aria-live="polite"></div>
              </div>
            </div>
            <div class="booking-step-actions">
              <button type="button" class="admin-btn-ghost" data-booking-back="session">Back</button>
              <button type="button" class="admin-btn-solid checkout-submit" id="bookingStepDateNext" disabled>Continue</button>
            </div>
          </div>

          <div class="booking-step" data-booking-step="details" hidden>
            <div class="admin-microlabel checkout-section-label">Your Information</div>
            <div class="booking-grid">
              <div class="booking-field">
                <label for="bookingName">Your name</label>
                <input id="bookingName" name="name" type="text" placeholder="First and last name" autocomplete="name" required />
              </div>
              <div class="booking-field">
                <label for="bookingEmail">Email address</label>
                <input id="bookingEmail" name="email" type="email" placeholder="For confirmation and reminders" autocomplete="email" required />
              </div>
              <div class="booking-field full">
                <label for="bookingPhoneNumber">Phone number</label>
                <div class="phone-input-row">
                  <select id="bookingPhoneCountry" aria-label="Country code">${COUNTRY_OPTIONS}</select>
                  <input id="bookingPhoneNumber" type="tel" placeholder="Phone number" autocomplete="tel-national" required />
                </div>
              </div>
              <div class="booking-field full">
                <label for="bookingReason">What are you trusting God to reveal or do?</label>
                <input id="bookingReason" name="reason" type="text" placeholder="A brief note on what you'd like to talk through" required />
              </div>
            </div>

            <div class="admin-microlabel checkout-section-label" style="margin-top:20px">Payment</div>
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
            <fieldset class="payment-demo checkout-payment-demo" disabled>
              <legend class="demo-badge">Payment Preview Only — Not Yet Connected</legend>
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
              <p class="payment-demo-note">This shows how checkout will look once a real payment processor is connected. No card details are collected and no charge occurs today.</p>
            </fieldset>

            <div class="checkout-order-summary" id="bookingOrderSummary"></div>

            <div class="booking-policy-checks">
              <label class="booking-policy-check">
                <input type="checkbox" id="bookingAgreeTerms" required />
                <span>I agree to the <button type="button" class="link-btn" id="bookingViewTerms">Terms and Conditions</button>.</span>
              </label>
              <label class="booking-policy-check">
                <input type="checkbox" id="bookingAgreeNoRefund" required />
                <span>I understand that all bookings are final and non-refundable. <button type="button" class="link-btn" id="bookingViewNoRefund">Read No Refund Policy</button></span>
              </label>
            </div>

            <div class="booking-step-actions">
              <button type="button" class="admin-btn-ghost" data-booking-back="time">Back</button>
              <button class="btn on-light fill checkout-submit" type="submit" id="bookingSubmitBtn">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><rect x="4" y="10" width="16" height="10" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/></svg>
                <span>Complete Booking</span>
              </button>
            </div>
            <div class="booking-status" id="bookingStatus" role="status" aria-live="polite"></div>
            <div class="booking-note checkout-note">Your time is reserved now and confirmed once payment is connected. This does not yet collect real payment.</div>
          </div>

          <div class="booking-step booking-confirm-step" data-booking-step="confirm" hidden>
            <div class="booking-confirm-check">✓</div>
            <h3 class="serif-heading" style="margin-bottom:6px">You're Booked.</h3>
            <p class="admin-hint" style="margin-bottom:20px">Your session is reserved — here's a summary for your records.</p>
            <div class="checkout-order-summary" id="bookingConfirmSummary"></div>
            <div class="checkout-next-steps">
              <div class="admin-microlabel checkout-section-label">What Happens Next?</div>
              <div class="checkout-next-row">
                <span>Instant Confirmation</span>
                <span>Calendar Invite</span>
                <span>Prepare For Your Session</span>
              </div>
            </div>
            <button type="button" class="admin-btn-solid" id="bookingConfirmCloseBtn" style="margin-top:20px">Done</button>
          </div>
        </form>
      </div>
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
              <span>I agree to the Testimony Submission Terms and understand that publication requires ministry review.</span>
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
          <div class="oneonone-steps checkout-step-strip">
            <div class="oneonone-step"><div class="oneonone-step-num">1</div><div class="oneonone-step-label">Details</div></div>
            <div class="oneonone-step"><div class="oneonone-step-num">2</div><div class="oneonone-step-label">Payment</div></div>
            <div class="oneonone-step"><div class="oneonone-step-num">3</div><div class="oneonone-step-label">Confirmation</div></div>
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
              <div class="phone-input-row">
                <select id="teachingRegisterPhoneCountry" aria-label="Country code">${COUNTRY_OPTIONS}</select>
                <input id="teachingRegisterPhoneNumber" type="tel" placeholder="Phone number" autocomplete="tel-national" required />
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
          <div class="checkout-next-steps">
            <div class="admin-microlabel checkout-section-label">What Happens Next?</div>
            <div class="checkout-next-row">
              <span>Instant Confirmation</span>
              <span>Calendar Invite</span>
              <span>Prepare For Your Session</span>
            </div>
          </div>
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
          <div class="admin-image-card">
            <div class="admin-image-card-head">
              <span class="admin-image-card-title">Featured Teaching Image</span>
              <p class="admin-hint">This is the large picture that appears beside the class title at the top of the Teaching page — for example, this is the image next to "Discernment" on the live Teaching page.</p>
            </div>
            <div class="admin-image-field" data-image-field="hero">
              <div class="admin-image-preview" id="teachingEditArtHeroPreview"></div>
              <div class="admin-image-actions">
                <label class="admin-image-upload-btn"><span class="admin-image-upload-btn-text">Upload Image</span><input type="file" accept="image/*" id="teachingEditArtHeroFile" hidden /></label>
                <button type="button" class="admin-image-remove-btn" id="teachingEditArtHeroRemove">Remove Image</button>
              </div>
              <details class="admin-image-advanced"><summary>Advanced: paste an image URL instead</summary><input id="teachingEditArtHero" type="url" placeholder="https://…" /></details>
            </div>
            <div class="admin-subsection-label">Adjust This Image</div>
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
                <button type="button" class="admin-btn-ghost" id="teachingEditResetImageBtn">Reset</button>
              </div>
            </div>
          </div>

          <div class="admin-image-card">
            <div class="admin-image-card-head">
              <span class="admin-image-card-title">Class Card Image</span>
              <p class="admin-hint">This image appears on the smaller upcoming class cards.</p>
            </div>
            <div class="admin-image-field" data-image-field="card">
              <div class="admin-image-preview" id="teachingEditArtCardPreview"></div>
              <div class="admin-image-actions">
                <label class="admin-image-upload-btn"><span class="admin-image-upload-btn-text">Upload Image</span><input type="file" accept="image/*" id="teachingEditArtCardFile" hidden /></label>
                <button type="button" class="admin-image-remove-btn" id="teachingEditArtCardRemove">Remove Image</button>
              </div>
              <details class="admin-image-advanced"><summary>Advanced: paste an image URL instead</summary><input id="teachingEditArtCard" type="url" placeholder="https://… (blank = use Featured Teaching Image)" /></details>
            </div>
          </div>

          <div class="admin-image-card">
            <div class="admin-image-card-head">
              <span class="admin-image-card-title">Mobile Image <span class="admin-hint">(optional)</span></span>
              <p class="admin-hint">Optional. Use this if the phone version needs a different crop. If no mobile image is added, the Featured Teaching Image is used automatically.</p>
            </div>
            <div class="admin-image-field" data-image-field="mobile">
              <div class="admin-image-preview" id="teachingEditArtHeroMobilePreview"></div>
              <div class="admin-image-actions">
                <label class="admin-image-upload-btn"><span class="admin-image-upload-btn-text">Upload Image</span><input type="file" accept="image/*" id="teachingEditArtHeroMobileFile" hidden /></label>
                <button type="button" class="admin-image-remove-btn" id="teachingEditArtHeroMobileRemove">Remove Image</button>
              </div>
              <details class="admin-image-advanced"><summary>Advanced: paste an image URL instead</summary><input id="teachingEditArtHeroMobile" type="url" placeholder="https://… (blank = use Featured Teaching Image)" /></details>
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
  </dialog>

  <dialog class="booking-dialog admin-dialog" id="mediaUseDialog" aria-labelledby="mediaUseTitle" style="max-width:420px">
    <div class="booking-head">
      <div>
        <div class="kicker" style="margin-bottom:0">Media Library</div>
        <h3 id="mediaUseTitle">Use This Image For…</h3>
      </div>
    </div>
    <div class="booking-body">
      <div class="form-field" style="margin-bottom:14px">
        <label for="mediaUseTeachingSelect">Class</label>
        <select id="mediaUseTeachingSelect"></select>
      </div>
      <div class="form-field" style="margin-bottom:6px">
        <label for="mediaUseSlotSelect">Use As</label>
        <select id="mediaUseSlotSelect"></select>
      </div>
      <p class="admin-hint" style="margin-bottom:16px">This replaces whatever image is currently there for that class.</p>
      <div class="booking-actions">
        <button class="admin-btn-solid" type="button" id="mediaUseApplyBtn">Use This Image</button>
        <button class="admin-btn-ghost" type="button" id="mediaUseCancelBtn">Cancel</button>
      </div>
      <div class="booking-status" id="mediaUseStatus" role="status" aria-live="polite"></div>
    </div>
  </dialog>

  <dialog class="booking-dialog" id="policyViewDialog" aria-labelledby="policyViewTitle" style="max-width:520px">
    <div class="booking-head">
      <div>
        <div class="kicker" style="margin-bottom:0">Policy</div>
        <h3 id="policyViewTitle">Terms and Conditions</h3>
      </div>
      <button class="booking-close" id="closePolicyView" type="button" aria-label="Close policy">×</button>
    </div>
    <div class="booking-body">
      <p id="policyViewText" style="color:var(--ink-muted);line-height:1.7;white-space:pre-wrap"></p>
      <p class="admin-hint" id="policyViewUpdated" style="margin-top:14px"></p>
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
  backToBackAllowed: true,
  notifications: { confirmation: true, reminder24: true, reminder1: true, cancellation: true, reschedule: true }
};
// Public-facing booking policies (Terms & Conditions, No Refund Policy).
// A separate small collection from schedulingSettings since these are
// legal/consent text the Owner edits far less often, shown verbatim to
// visitors — not scheduling behavior.
let BOOKING_POLICIES = {
  terms: {
    title: 'Terms and Conditions',
    text: 'By booking a one-on-one session, you agree to arrive on time, provide accurate contact information, and communicate respectfully during your session. The Unveiled Assembly reserves the right to reschedule or cancel a session with reasonable notice.',
    lastUpdated: '', active: true
  },
  noRefund: {
    title: 'No Refund Policy',
    text: 'All one-on-one booking payments are final and non-refundable. If you are unable to attend, you may request a reschedule based on availability, but refunds are not guaranteed.',
    lastUpdated: '', active: true
  }
};
let SESSION_TYPES = {
  '15-minute': { name: '15-Minute One-on-One', durationMinutes: 15, price: 25, description: 'A focused conversation for one question, quick counsel, or a specific area of clarity.', active: true, order: 1, bufferBeforeMin: 0, bufferAfterMin: 0, format: 'zoom', capacity: null, imageUrl: '' },
  '30-minute': { name: '30-Minute One-on-One', durationMinutes: 30, price: 50, description: 'A deeper conversation for discernment, prayer, guidance, and personal direction.', active: true, order: 2, bufferBeforeMin: 0, bufferAfterMin: 0, format: 'zoom', capacity: null, imageUrl: '' }
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
  try {
    const [termsSnap, noRefundSnap] = await Promise.all([
      getDoc(doc(db, 'bookingPolicies', 'terms')),
      getDoc(doc(db, 'bookingPolicies', 'noRefund'))
    ]);
    if(termsSnap.exists()) BOOKING_POLICIES.terms = termsSnap.data();
    if(noRefundSnap.exists()) BOOKING_POLICIES.noRefund = noRefundSnap.data();
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
let MEDIA_LIBRARY = [];

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
  zoom: JSON.parse(JSON.stringify(DEMO_TEACHING_ZOOM)),
  media: [],
  profilePhoto: '',
  sessionTypes: JSON.parse(JSON.stringify(SESSION_TYPES)),
  schedulingSettings: JSON.parse(JSON.stringify(SCHEDULING_SETTINGS)),
  availabilityRules: JSON.parse(JSON.stringify(AVAILABILITY_RULES)),
  blockoutRanges: JSON.parse(JSON.stringify(BLOCKOUT_RANGES)),
  availabilityOverrides: JSON.parse(JSON.stringify(AVAILABILITY_OVERRIDES)),
  bookings: JSON.parse(JSON.stringify(DEMO_BOOKINGS)),
  blockedDates: JSON.parse(JSON.stringify(DEMO_BLOCKED_DATES)),
  policies: JSON.parse(JSON.stringify(BOOKING_POLICIES))
};
const PREVIEW_STORAGE_KEYS = {
  teachings: 'ua_preview_teachings_v1',
  settings: 'ua_preview_teaching_settings_v1',
  zoom: 'ua_preview_teaching_zoom_v1',
  media: 'ua_preview_media_v1',
  profilePhoto: 'ua_preview_profile_photo_v1',
  sessionTypes: 'ua_preview_session_types_v1',
  schedulingSettings: 'ua_preview_scheduling_settings_v1',
  availabilityRules: 'ua_preview_availability_rules_v1',
  blockoutRanges: 'ua_preview_blockout_ranges_v1',
  availabilityOverrides: 'ua_preview_availability_overrides_v1',
  bookings: 'ua_preview_bookings_v1',
  blockedDates: 'ua_preview_blocked_dates_v1',
  policies: 'ua_preview_booking_policies_v1'
};
function savePreviewToStorage(){
  if(!DEMO_MODE) return true;
  try {
    localStorage.setItem(PREVIEW_STORAGE_KEYS.teachings, JSON.stringify(TEACHINGS));
    localStorage.setItem(PREVIEW_STORAGE_KEYS.settings, JSON.stringify(TEACHING_PAGE_SETTINGS));
    localStorage.setItem(PREVIEW_STORAGE_KEYS.zoom, JSON.stringify(DEMO_TEACHING_ZOOM));
    localStorage.setItem(PREVIEW_STORAGE_KEYS.media, JSON.stringify(MEDIA_LIBRARY));
    return true;
  } catch (err) {
    console.error('Could not save preview data to this browser', err);
    return false;
  }
}
function saveBookingsPreviewToStorage(){
  if(!DEMO_MODE) return true;
  try {
    localStorage.setItem(PREVIEW_STORAGE_KEYS.sessionTypes, JSON.stringify(SESSION_TYPES));
    localStorage.setItem(PREVIEW_STORAGE_KEYS.schedulingSettings, JSON.stringify(SCHEDULING_SETTINGS));
    localStorage.setItem(PREVIEW_STORAGE_KEYS.availabilityRules, JSON.stringify(AVAILABILITY_RULES));
    localStorage.setItem(PREVIEW_STORAGE_KEYS.blockoutRanges, JSON.stringify(BLOCKOUT_RANGES));
    localStorage.setItem(PREVIEW_STORAGE_KEYS.availabilityOverrides, JSON.stringify(AVAILABILITY_OVERRIDES));
    localStorage.setItem(PREVIEW_STORAGE_KEYS.bookings, JSON.stringify(DEMO_BOOKINGS));
    localStorage.setItem(PREVIEW_STORAGE_KEYS.blockedDates, JSON.stringify(DEMO_BLOCKED_DATES));
    localStorage.setItem(PREVIEW_STORAGE_KEYS.policies, JSON.stringify(BOOKING_POLICIES));
    return true;
  } catch (err) {
    console.error('Could not save booking preview data to this browser', err);
    return false;
  }
}
function loadPreviewFromStorage(){
  try {
    const t = localStorage.getItem(PREVIEW_STORAGE_KEYS.teachings);
    const s = localStorage.getItem(PREVIEW_STORAGE_KEYS.settings);
    const z = localStorage.getItem(PREVIEW_STORAGE_KEYS.zoom);
    const m = localStorage.getItem(PREVIEW_STORAGE_KEYS.media);
    if(t) TEACHINGS = JSON.parse(t);
    if(s) TEACHING_PAGE_SETTINGS = JSON.parse(s);
    if(z) DEMO_TEACHING_ZOOM = JSON.parse(z);
    if(m) MEDIA_LIBRARY = JSON.parse(m);
    const st = localStorage.getItem(PREVIEW_STORAGE_KEYS.sessionTypes);
    const ss = localStorage.getItem(PREVIEW_STORAGE_KEYS.schedulingSettings);
    const ar = localStorage.getItem(PREVIEW_STORAGE_KEYS.availabilityRules);
    const br = localStorage.getItem(PREVIEW_STORAGE_KEYS.blockoutRanges);
    const ao = localStorage.getItem(PREVIEW_STORAGE_KEYS.availabilityOverrides);
    const bk = localStorage.getItem(PREVIEW_STORAGE_KEYS.bookings);
    const bd = localStorage.getItem(PREVIEW_STORAGE_KEYS.blockedDates);
    const pol = localStorage.getItem(PREVIEW_STORAGE_KEYS.policies);
    if(st) SESSION_TYPES = JSON.parse(st);
    if(ss) SCHEDULING_SETTINGS = JSON.parse(ss);
    if(ar) AVAILABILITY_RULES = JSON.parse(ar);
    if(br) BLOCKOUT_RANGES = JSON.parse(br);
    if(ao) AVAILABILITY_OVERRIDES = JSON.parse(ao);
    if(bk) DEMO_BOOKINGS = JSON.parse(bk);
    if(bd) DEMO_BLOCKED_DATES = JSON.parse(bd);
    if(pol) BOOKING_POLICIES = JSON.parse(pol);
  } catch (err) { /* keep current defaults if storage is corrupt/unavailable */ }
}
function resetPreviewData(){
  try {
    Object.values(PREVIEW_STORAGE_KEYS).forEach(key => localStorage.removeItem(key));
  } catch (err) { /* ignore */ }
  TEACHINGS = JSON.parse(JSON.stringify(TEACHING_PREVIEW_DEFAULTS.teachings));
  TEACHING_PAGE_SETTINGS = JSON.parse(JSON.stringify(TEACHING_PREVIEW_DEFAULTS.settings));
  DEMO_TEACHING_ZOOM = JSON.parse(JSON.stringify(TEACHING_PREVIEW_DEFAULTS.zoom));
  MEDIA_LIBRARY = JSON.parse(JSON.stringify(TEACHING_PREVIEW_DEFAULTS.media));
  SESSION_TYPES = JSON.parse(JSON.stringify(TEACHING_PREVIEW_DEFAULTS.sessionTypes));
  SCHEDULING_SETTINGS = JSON.parse(JSON.stringify(TEACHING_PREVIEW_DEFAULTS.schedulingSettings));
  AVAILABILITY_RULES = JSON.parse(JSON.stringify(TEACHING_PREVIEW_DEFAULTS.availabilityRules));
  BLOCKOUT_RANGES = JSON.parse(JSON.stringify(TEACHING_PREVIEW_DEFAULTS.blockoutRanges));
  AVAILABILITY_OVERRIDES = JSON.parse(JSON.stringify(TEACHING_PREVIEW_DEFAULTS.availabilityOverrides));
  DEMO_BOOKINGS = JSON.parse(JSON.stringify(TEACHING_PREVIEW_DEFAULTS.bookings));
  DEMO_BLOCKED_DATES = JSON.parse(JSON.stringify(TEACHING_PREVIEW_DEFAULTS.blockedDates));
  BOOKING_POLICIES = JSON.parse(JSON.stringify(TEACHING_PREVIEW_DEFAULTS.policies));
  BUSINESS_TZ = SCHEDULING_SETTINGS.ministryTimeZone || 'America/New_York';
  if(currentProfile) currentProfile.photoURL = '';
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

async function loadMediaLibrary(){
  if(DEMO_MODE) return;
  try {
    const snap = await getDocs(collection(db, 'mediaLibrary'));
    const items = [];
    snap.forEach(d => items.push({ id: d.id, ...d.data() }));
    items.sort((a, b) => (b.createdAtMs || 0) - (a.createdAtMs || 0));
    MEDIA_LIBRARY = items;
  } catch (err) { /* keep whatever we had */ }
}

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

const MINISTRY_STORAGE_KEYS = {
  prayerRequests: 'ua_ministry_prayer_requests_v1',
  testimonials: 'ua_ministry_testimonials_v1',
  classReviews: 'ua_ministry_class_reviews_v1',
  policies: 'ua_ministry_policies_v1'
};

const DEFAULT_MINISTRY_POLICIES = {
  prayerTerms: {
    title: 'Prayer Request Terms and Conditions',
    text: 'I agree that my prayer request is offered with a sincere heart and may be reviewed by the ministry team. I understand that a prayer request does not guarantee a personal response and may be handled publicly, anonymously, or privately depending on the option I selected. I understand that my submitted information is kept private when I choose privacy or anonymity.',
    lastUpdated: '2026-09-16', active: true
  },
  testimonyTerms: {
    title: 'Testimony Submission Terms',
    text: 'I agree that my testimony may be reviewed before publication. I understand that my information may be kept private or hidden in public or anonymous display. I understand that publication is at the discretion of The Unveiled Assembly and does not guarantee public posting.',
    lastUpdated: '2026-09-16', active: true
  },
  reviewTerms: {
    title: 'Class Review Terms',
    text: 'I agree that my class review may be reviewed before publication. I understand that public posting is optional and that The Unveiled Assembly may choose to keep a review private or anonymous.',
    lastUpdated: '2026-09-16', active: true
  },
  generalTerms: {
    title: 'General Terms and Conditions',
    text: 'All ministry forms are intended for prayer, testimony, and class feedback. Information is reviewed by The Unveiled Assembly and may be kept private or published only with ministry approval. No information submitted through these forms is a guarantee of pastoral response or publication.',
    lastUpdated: '2026-09-16', active: true
  },
  noRefund: {
    title: 'No Refund Policy',
    text: 'All one-on-one bookings and teaching purchases are final and non-refundable. Requests may be rescheduled only when the ministry approves a new time.',
    lastUpdated: '2026-09-16', active: true
  }
};

const DEFAULT_PRAYER_REQUESTS = [
  {
    id: 'prayer-demo-1',
    firstName: 'Kendra',
    lastName: 'M.',
    email: 'kendra@example.com',
    phone: '+1-555-0100',
    message: 'Please pray for clarity and peace as I navigate a season of transition and unanswered questions.',
    visibility: 'private',
    status: 'new',
    notes: 'Follow-up to be offered by the prayer team.',
    createdAt: '2026-09-12T10:15:00.000Z'
  },
  {
    id: 'prayer-demo-2',
    firstName: 'Anonymous',
    lastName: '',
    email: '',
    phone: '',
    message: 'I am asking for strength and protection during a difficult financial season.',
    visibility: 'anonymous',
    status: 'completed',
    notes: 'Prayer is complete and archived for follow-up.',
    createdAt: '2026-09-10T09:30:00.000Z'
  }
];

const DEFAULT_TESTIMONIALS = [
  {
    id: 'story-demo-1',
    firstName: 'Sarah',
    lastName: 'M.',
    email: 'sarah@example.com',
    phone: '+1-555-0311',
    message: 'During the teaching, I felt a deeper sense of peace and clarity about decisions I had been wrestling with for months.',
    visibility: 'public',
    status: 'published',
    publicDisplayText: 'Sarah M. — During the teaching, I felt a deeper sense of peace and clarity about decisions I had been wrestling with for months.',
    createdAt: '2026-09-08T17:00:00.000Z'
  },
  {
    id: 'story-demo-2',
    firstName: 'Anonymous',
    lastName: '',
    email: '',
    phone: '',
    message: 'I did not know how to pray for my situation until I heard the teaching and felt God direct my heart.',
    visibility: 'anonymous',
    status: 'private',
    publicDisplayText: 'Anonymous',
    createdAt: '2026-09-06T13:14:00.000Z'
  }
];

const DEFAULT_CLASS_REVIEWS = [
  {
    id: 'review-demo-1',
    className: 'Discernment',
    firstName: 'Marcus',
    lastName: 'R.',
    email: 'marcus@example.com',
    phone: '+1-555-0700',
    message: 'This class brought much-needed clarity to the way I pray and discern what God is speaking.',
    visibility: 'public',
    status: 'published',
    publicDisplayText: 'Marcus R. — This class brought much-needed clarity to the way I pray and discern what God is speaking.',
    rating: 5,
    recommendation: 'Yes',
    createdAt: '2026-09-04T08:20:00.000Z'
  }
];

let PRAYER_REQUESTS = loadStoredJson(MINISTRY_STORAGE_KEYS.prayerRequests, DEFAULT_PRAYER_REQUESTS);
let TESTIMONIALS = loadStoredJson(MINISTRY_STORAGE_KEYS.testimonials, DEFAULT_TESTIMONIALS);
let CLASS_REVIEWS = loadStoredJson(MINISTRY_STORAGE_KEYS.classReviews, DEFAULT_CLASS_REVIEWS);
let MINISTRY_POLICIES = loadStoredJson(MINISTRY_STORAGE_KEYS.policies, DEFAULT_MINISTRY_POLICIES);

function loadStoredJson(key, fallback){
  try {
    const raw = localStorage.getItem(key);
    if(!raw) return JSON.parse(JSON.stringify(fallback));
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) || parsed && typeof parsed === 'object' ? parsed : JSON.parse(JSON.stringify(fallback));
  } catch (err) {
    return JSON.parse(JSON.stringify(fallback));
  }
}

function persistMinistryData(){
  try {
    localStorage.setItem(MINISTRY_STORAGE_KEYS.prayerRequests, JSON.stringify(PRAYER_REQUESTS));
    localStorage.setItem(MINISTRY_STORAGE_KEYS.testimonials, JSON.stringify(TESTIMONIALS));
    localStorage.setItem(MINISTRY_STORAGE_KEYS.classReviews, JSON.stringify(CLASS_REVIEWS));
    localStorage.setItem(MINISTRY_STORAGE_KEYS.policies, JSON.stringify(MINISTRY_POLICIES));
  } catch (err) {
    console.warn('Preview ministry data could not be saved in localStorage.', err);
  }
}

function shortDate(dateText){
  if(!dateText) return 'Recently';
  const date = new Date(dateText);
  if(Number.isNaN(date.getTime())) return dateText;
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(date);
}

function getNameLabel(item, fallback = 'Anonymous'){
  if(!item) return fallback;
  const visibility = item.visibility || 'public';
  if(visibility === 'anonymous') return fallback;
  if(visibility === 'private') return item.firstName ? item.firstName + ' ' + (item.lastName || '').trim() : 'Private submission';
  return [item.firstName, item.lastName].filter(Boolean).join(' ') || fallback;
}

function getPublicPreviewLegacy(item){
  if(!item) return 'Anonymous';
  if(item.visibility === 'anonymous') return 'Anonymous';
  if(item.visibility === 'private') return 'Private';
  const name = [item.firstName, item.lastName].filter(Boolean).join(' ').trim();
  return name ? name : 'Anonymous';
}

function formatVisibilityBadge(visibility){
  const map = {
    public: 'Public',
    anonymous: 'Anonymous',
    private: 'Private'
  };
  return map[visibility] || 'Public';
}

function renderOwnerInboxBadges(){
  const countMap = {
    'prayer-requests': PRAYER_REQUESTS.length,
    'testimonials': TESTIMONIALS.length,
    'class-reviews': CLASS_REVIEWS.length
  };
  Object.entries(countMap).forEach(([key, count]) => {
    const badge = document.querySelector('[data-owner-nav="' + key + '"] .owner-nav-count');
    if(badge) badge.textContent = count;
  });
}

function initOwnerInboxNavigation(){
  const sidebar = document.getElementById('ownerSidebar');
  const content = document.querySelector('.owner-content');
  if(!sidebar || !content) return;
  if(!sidebar.querySelector('[data-owner-nav="prayer-requests"]')) {
    sidebar.insertAdjacentHTML('beforeend', '<button type="button" class="owner-sidebar-item" data-owner-nav="prayer-requests"><svg viewBox="0 0 24 24" stroke-width="1.8"><path d="M4 6.5A2.5 2.5 0 0 1 6.5 4h11A2.5 2.5 0 0 1 20 6.5v11A2.5 2.5 0 0 1 17.5 20H6.5A2.5 2.5 0 0 1 4 17.5zm0 0 8 6 8-6"/></svg>Prayer Requests<span class="owner-nav-count">0</span></button>');
  }
  if(!sidebar.querySelector('[data-owner-nav="testimonials"]')) {
    sidebar.insertAdjacentHTML('beforeend', '<button type="button" class="owner-sidebar-item" data-owner-nav="testimonials"><svg viewBox="0 0 24 24" stroke-width="1.8"><path d="M5 18.5V5.5A1.5 1.5 0 0 1 6.5 4h11A1.5 1.5 0 0 1 19 5.5v8A1.5 1.5 0 0 1 17.5 15H9l-4 3.5z"/><path d="M9 8h6M9 11h6"/></svg>Testimonials<span class="owner-nav-count">0</span></button>');
  }
  if(!sidebar.querySelector('[data-owner-nav="class-reviews"]')) {
    sidebar.insertAdjacentHTML('beforeend', '<button type="button" class="owner-sidebar-item" data-owner-nav="class-reviews"><svg viewBox="0 0 24 24" stroke-width="1.8"><path d="M12 3.5 14.7 8l5 .7-3.6 3.5 1 4.9-4.7-2.4-4.7 2.4 1-4.9L4.3 8.7l5-.7L12 3.5z"/></svg>Class Reviews<span class="owner-nav-count">0</span></button>');
  }

  if(!content.querySelector('[data-owner-section="prayer-requests"]')) {
    content.insertAdjacentHTML('beforeend', '<article class="portal-panel ministry-inbox" style="grid-column:1/-1" data-owner-section="prayer-requests"><div class="admin-panel-head"><div><span class="portal-label">Prayer Requests</span><p class="admin-panel-intro">Prayer submissions, status tracking, private handling, and ministry follow-up.</p></div></div><div class="admin-tabs" role="tablist" style="margin:16px 0"><button type="button" class="admin-tab active" data-prayer-filter="all">All</button><button type="button" class="admin-tab" data-prayer-filter="new">New</button><button type="button" class="admin-tab" data-prayer-filter="in-progress">In Progress</button><button type="button" class="admin-tab" data-prayer-filter="completed">Completed</button><button type="button" class="admin-tab" data-prayer-filter="archived">Archived</button></div><div id="prayerInboxList"></div></article>');
  }
  if(!content.querySelector('[data-owner-section="testimonials"]')) {
    content.insertAdjacentHTML('beforeend', '<article class="portal-panel ministry-inbox" style="grid-column:1/-1" data-owner-section="testimonials"><div class="admin-panel-head"><div><span class="portal-label">Testimonials</span><p class="admin-panel-intro">Review, publish, keep private, and manage personal testimony submissions.</p></div></div><div class="admin-tabs" role="tablist" style="margin:16px 0"><button type="button" class="admin-tab active" data-story-filter="all">All</button><button type="button" class="admin-tab" data-story-filter="pending">Pending</button><button type="button" class="admin-tab" data-story-filter="published">Published</button><button type="button" class="admin-tab" data-story-filter="private">Private</button><button type="button" class="admin-tab" data-story-filter="archived">Archived</button></div><div id="testimonyInboxList"></div></article>');
  }
  if(!content.querySelector('[data-owner-section="class-reviews"]')) {
    content.insertAdjacentHTML('beforeend', '<article class="portal-panel ministry-inbox" style="grid-column:1/-1" data-owner-section="class-reviews"><div class="admin-panel-head"><div><span class="portal-label">Class Reviews</span><p class="admin-panel-intro">Review class feedback, publish approved responses, and keep private entries out of sight.</p></div></div><div class="admin-tabs" role="tablist" style="margin:16px 0"><button type="button" class="admin-tab active" data-review-filter="all">All</button><button type="button" class="admin-tab" data-review-filter="pending">Pending</button><button type="button" class="admin-tab" data-review-filter="published">Published</button><button type="button" class="admin-tab" data-review-filter="private">Private</button><button type="button" class="admin-tab" data-review-filter="archived">Archived</button></div><div id="classReviewInboxList"></div></article>');
  }
  if(!content.querySelector('[data-ministry-policy-settings]')) {
    content.insertAdjacentHTML('beforeend', '<article class="portal-panel" style="grid-column:1/-1" data-owner-section="settings" data-ministry-policy-settings><div class="admin-panel-head"><div><span class="portal-label">Policies &amp; Agreements</span><p class="admin-panel-intro">Edit the terms visitors see on ministry forms. Preview changes persist in this browser only.</p></div></div><div id="ministryPolicySettings"></div></article>');
    renderMinistryPolicySettings();
  }
  renderOwnerInboxBadges();
}

function renderPrayerInbox(filter = 'all'){
  const wrap = document.getElementById('prayerInboxList');
  if(!wrap) return;
  const items = PRAYER_REQUESTS.filter(item => {
    if(filter === 'all') return true;
    if(filter === 'new') return item.status === 'new';
    if(filter === 'in-progress') return item.status === 'in-progress';
    if(filter === 'completed') return item.status === 'completed';
    if(filter === 'archived') return item.status === 'archived';
    return true;
  });
  if(items.length === 0){ wrap.innerHTML = '<p class="admin-hint">No prayer requests in this view yet.</p>'; return; }
  wrap.innerHTML = items.map(item => '<div class="admin-teaching-row"><div class="admin-teaching-info"><div class="admin-teaching-title-row"><strong>' + escapeHtml(getNameLabel(item, 'Anonymous')) + '</strong><span class="admin-status-pill ' + (item.status === 'completed' ? 'completed' : item.status === 'archived' ? 'cancelled' : 'published') + '">' + escapeHtml((item.status || 'new').replace('-', ' ')) + '</span></div><div class="admin-teaching-meta">' + escapeHtml(shortDate(item.createdAt)) + ' · ' + escapeHtml(formatVisibilityBadge(item.visibility)) + '</div><p style="margin:8px 0 0;color:var(--owner-text-muted);max-width:60ch">' + escapeHtml((item.message || '').slice(0, 130)) + (item.message && item.message.length > 130 ? '…' : '') + '</p></div><div class="admin-teaching-actions"><button type="button" class="admin-btn-ghost" data-prayer-view="' + item.id + '">View</button><button type="button" class="admin-btn-ghost" data-prayer-delete="' + item.id + '">Delete</button></div></div>').join('');
}

function renderTestimonyInbox(filter = 'all'){
  const wrap = document.getElementById('testimonyInboxList');
  if(!wrap) return;
  const items = TESTIMONIALS.filter(item => {
    if(filter === 'all') return true;
    return item.status === filter;
  });
  if(items.length === 0){ wrap.innerHTML = '<p class="admin-hint">No testimonies in this view yet.</p>'; return; }
  wrap.innerHTML = items.map(item => '<div class="admin-teaching-row"><div class="admin-teaching-info"><div class="admin-teaching-title-row"><strong>' + escapeHtml(getPublicPreviewLegacy(item)) + '</strong><span class="admin-status-pill ' + (item.status === 'published' ? 'published' : item.status === 'private' ? 'draft' : item.status === 'archived' ? 'cancelled' : 'draft') + '">' + escapeHtml((item.status || 'pending').replace('-', ' ')) + '</span></div><div class="admin-teaching-meta">' + escapeHtml(shortDate(item.createdAt)) + ' · ' + escapeHtml(formatVisibilityBadge(item.visibility)) + '</div><p style="margin:8px 0 0;color:var(--owner-text-muted);max-width:60ch">' + escapeHtml((item.message || '').slice(0, 150)) + (item.message && item.message.length > 150 ? '…' : '') + '</p></div><div class="admin-teaching-actions"><button type="button" class="admin-btn-ghost" data-testimony-view="' + item.id + '">View</button><button type="button" class="admin-btn-ghost" data-testimony-delete="' + item.id + '">Delete</button></div></div>').join('');
}

function renderClassReviewInbox(filter = 'all'){
  const wrap = document.getElementById('classReviewInboxList');
  if(!wrap) return;
  const items = CLASS_REVIEWS.filter(item => {
    if(filter === 'all') return true;
    return item.status === filter;
  });
  if(items.length === 0){ wrap.innerHTML = '<p class="admin-hint">No class reviews in this view yet.</p>'; return; }
  wrap.innerHTML = items.map(item => '<div class="admin-teaching-row"><div class="admin-teaching-info"><div class="admin-teaching-title-row"><strong>' + escapeHtml(item.className || 'Class Review') + '</strong><span class="admin-status-pill ' + (item.status === 'published' ? 'published' : item.status === 'private' ? 'draft' : item.status === 'archived' ? 'cancelled' : 'draft') + '">' + escapeHtml((item.status || 'pending').replace('-', ' ')) + '</span></div><div class="admin-teaching-meta">' + escapeHtml(shortDate(item.createdAt)) + ' · ' + escapeHtml(getPublicPreviewLegacy(item)) + ' · ' + escapeHtml(formatVisibilityBadge(item.visibility)) + '</div><p style="margin:8px 0 0;color:var(--owner-text-muted);max-width:60ch">' + escapeHtml((item.message || '').slice(0, 150)) + (item.message && item.message.length > 150 ? '…' : '') + '</p></div><div class="admin-teaching-actions"><button type="button" class="admin-btn-ghost" data-review-view="' + item.id + '">View</button><button type="button" class="admin-btn-ghost" data-review-delete="' + item.id + '">Delete</button></div></div>').join('');
}

function renderMinistryInboxViews(){
  renderPrayerInbox();
  renderTestimonyInbox();
  renderClassReviewInbox();
  renderOwnerInboxBadges();
}

function renderMinistryPolicySettings(){
  const wrap = document.getElementById('ministryPolicySettings');
  if(!wrap) return;
  const keys = ['prayerTerms', 'testimonyTerms', 'reviewTerms', 'noRefund', 'generalTerms'];
  wrap.innerHTML = keys.map(key => {
    const policy = MINISTRY_POLICIES[key] || { title: '', text: '', lastUpdated: '', active: true };
    return '<div class="ministry-policy-editor" data-policy-key="' + key + '">' +
      '<div class="ministry-policy-editor-head"><strong>' + escapeHtml(policy.title || key) + '</strong><label><input type="checkbox" data-policy-active ' + (policy.active !== false ? 'checked' : '') + ' /> Active</label></div>' +
      '<div class="booking-grid"><div class="booking-field"><label>Title</label><input data-policy-title value="' + escapeHtml(policy.title || '') + '" /></div><div class="booking-field"><label>Last Updated</label><input data-policy-date type="date" value="' + escapeHtml(policy.lastUpdated || '') + '" /></div><div class="booking-field full"><label>Policy Text</label><textarea data-policy-text rows="4">' + escapeHtml(policy.text || '') + '</textarea></div></div>' +
      '<button type="button" class="admin-btn-solid" data-policy-save="' + key + '">Save Policy</button><span class="form-status" data-policy-status></span></div>';
  }).join('');
}

function saveMinistryPolicy(key){
  const editor = document.querySelector('[data-policy-key="' + key + '"]');
  if(!editor) return;
  const policy = MINISTRY_POLICIES[key] || {};
  policy.title = editor.querySelector('[data-policy-title]').value.trim();
  policy.text = editor.querySelector('[data-policy-text]').value.trim();
  policy.lastUpdated = editor.querySelector('[data-policy-date]').value || new Date().toISOString().slice(0, 10);
  policy.active = editor.querySelector('[data-policy-active]').checked;
  MINISTRY_POLICIES[key] = policy;
  if(key === 'noRefund') BOOKING_POLICIES.noRefund = { ...policy };
  persistMinistryData();
  saveBookingsPreviewToStorage();
  const status = editor.querySelector('[data-policy-status]');
  if(status) status.textContent = 'Saved in preview.';
}

function setMinistryFilter(type, filter){
  if(type === 'prayer') renderPrayerInbox(filter);
  if(type === 'story') renderTestimonyInbox(filter);
  if(type === 'review') renderClassReviewInbox(filter);
}

function openPrayerDetailWindow(itemId){
  const item = PRAYER_REQUESTS.find(p => p.id === itemId);
  if(!item) return;
  const dialog = document.getElementById('prayerDetailDialog');
  const detailFields = document.getElementById('prayerDetailFields');
  if(!dialog || !detailFields) return;
  detailFields.innerHTML = '<div class="form-field full"><label>Name</label><input value="' + escapeHtml(getNameLabel(item, 'Anonymous')) + '" readonly /></div>' +
    '<div class="form-field"><label>Email</label><input value="' + escapeHtml(item.visibility === 'anonymous' ? 'Hidden for anonymous request' : (item.email || 'No email')) + '" readonly /></div>' +
    '<div class="form-field"><label>Phone</label><input value="' + escapeHtml(item.visibility === 'anonymous' ? 'Hidden for anonymous request' : (item.phone || 'No phone')) + '" readonly /></div>' +
    '<div class="form-field"><label>Visibility</label><input value="' + escapeHtml(formatVisibilityBadge(item.visibility)) + '" readonly /></div>' +
    '<div class="form-field"><label>Status</label><input value="' + escapeHtml((item.status || 'new').replace('-', ' ')) + '" readonly /></div>' +
    '<div class="form-field full"><label>Prayer Request</label><textarea readonly>' + escapeHtml(item.message || '') + '</textarea></div>' +
    '<div class="form-field full"><label>Internal Note</label><textarea id="prayerInternalNote">' + escapeHtml(item.notes || '') + '</textarea></div>';
  const saveNoteButton = document.getElementById('savePrayerNoteBtn');
  if(saveNoteButton) saveNoteButton.onclick = () => {
    item.notes = document.getElementById('prayerInternalNote').value;
    persistMinistryData();
    renderMinistryInboxViews();
    document.getElementById('prayerStatusMessage').textContent = 'Internal note saved.';
  };
  document.getElementById('prayerStatusMessage').textContent = '';
  dialog.dataset.prayerId = item.id;
  dialog.showModal();
}

function openTestimonyDetailWindow(itemId){
  const item = TESTIMONIALS.find(t => t.id === itemId);
  if(!item) return;
  const dialog = document.getElementById('testimonyDetailDialog');
  const fields = document.getElementById('testimonyDetailFields');
  if(!dialog || !fields) return;
  fields.innerHTML = '<div class="form-field full"><label>Display Name</label><input value="' + escapeHtml(item.visibility === 'anonymous' ? 'Anonymous' : getPublicPreviewLegacy(item)) + '" readonly /></div>' +
    '<div class="form-field"><label>Visibility</label><input value="' + escapeHtml(formatVisibilityBadge(item.visibility)) + '" readonly /></div>' +
    '<div class="form-field"><label>Status</label><input value="' + escapeHtml((item.status || 'pending').replace('-', ' ')) + '" readonly /></div>' +
    '<div class="form-field full"><label>Full Testimony</label><textarea readonly>' + escapeHtml(item.message || '') + '</textarea></div>' +
    '<div class="form-field full"><label>Public Display Text</label><textarea id="testimonyPublicDisplayText">' + escapeHtml(item.publicDisplayText || item.message || '') + '</textarea></div>';
  document.getElementById('testimonyStatusMessage').textContent = '';
  dialog.dataset.testimonyId = item.id;
  dialog.showModal();
}

function openReviewDetailWindow(itemId){
  const item = CLASS_REVIEWS.find(r => r.id === itemId);
  if(!item) return;
  const dialog = document.getElementById('reviewDetailDialog');
  const fields = document.getElementById('reviewDetailFields');
  if(!dialog || !fields) return;
  fields.innerHTML = '<div class="form-field"><label>Class</label><input value="' + escapeHtml(item.className || 'Class Review') + '" readonly /></div>' +
    '<div class="form-field"><label>Reviewer</label><input value="' + escapeHtml(item.visibility === 'anonymous' ? 'Anonymous' : getPublicPreviewLegacy(item)) + '" readonly /></div>' +
    '<div class="form-field"><label>Visibility</label><input value="' + escapeHtml(formatVisibilityBadge(item.visibility)) + '" readonly /></div>' +
    '<div class="form-field"><label>Status</label><input value="' + escapeHtml((item.status || 'pending').replace('-', ' ')) + '" readonly /></div>' +
    '<div class="form-field full"><label>Review</label><textarea readonly>' + escapeHtml(item.message || '') + '</textarea></div>' +
    '<div class="form-field full"><label>Public Display Text</label><textarea id="reviewPublicDisplayText">' + escapeHtml(item.publicDisplayText || item.message || '') + '</textarea></div>';
  document.getElementById('reviewStatusMessage').textContent = '';
  dialog.dataset.reviewId = item.id;
  dialog.showModal();
}

function setPrayerStatus(itemId, nextStatus){
  const item = PRAYER_REQUESTS.find(p => p.id === itemId);
  if(!item) return;
  item.status = nextStatus;
  persistMinistryData();
  renderMinistryInboxViews();
  if(document.getElementById('prayerDetailDialog')) document.getElementById('prayerDetailDialog').close();
}

function setTestimonyStatus(itemId, nextStatus){
  const item = TESTIMONIALS.find(t => t.id === itemId);
  if(!item) return;
  item.status = nextStatus;
  if(nextStatus === 'published') {
    item.publicDisplayText = item.publicDisplayText || item.message;
  }
  persistMinistryData();
  renderMinistryInboxViews();
  renderPublishedTestimonials();
  renderPublishedClassReviews();
  if(document.getElementById('testimonyDetailDialog')) document.getElementById('testimonyDetailDialog').close();
}

function setReviewStatus(itemId, nextStatus){
  const item = CLASS_REVIEWS.find(r => r.id === itemId);
  if(!item) return;
  item.status = nextStatus;
  if(nextStatus === 'published') {
    item.publicDisplayText = item.publicDisplayText || item.message;
  }
  persistMinistryData();
  renderMinistryInboxViews();
  renderPublishedTestimonials();
  renderPublishedClassReviews();
  if(document.getElementById('reviewDetailDialog')) document.getElementById('reviewDetailDialog').close();
}

function renderPublishedTestimonials(){
  const page = document.body.dataset.page;
  if(page !== 'testimonials' && !document.getElementById('publishedTestimonialsSection')) return;
  const section = document.getElementById('publishedTestimonialsSection');
  const list = document.getElementById('publishedTestimonialsList');
  if(!section || !list) return;
  const items = TESTIMONIALS.filter(t => t.status === 'published');
  if(items.length === 0){ list.innerHTML = '<p class="admin-hint">No published testimonies yet.</p>'; return; }
  list.innerHTML = items.map(item => '<article class="preview-card"><span>' + escapeHtml(item.visibility === 'anonymous' ? 'Anonymous' : getPublicPreviewLegacy(item)) + '</span><h4>' + escapeHtml((item.publicDisplayText || item.message || '').slice(0, 80)) + '</h4><p>' + escapeHtml((item.message || '').slice(0, 220)) + '</p></article>').join('');
}

function renderPublishedClassReviews(){
  const list = document.getElementById('publishedClassReviewsList');
  if(!list) return;
  const items = CLASS_REVIEWS.filter(r => r.status === 'published');
  if(items.length === 0){ list.innerHTML = '<p class="admin-hint">No published class reviews yet.</p>'; return; }
  list.innerHTML = items.map(item => '<article class="preview-card"><span>' + escapeHtml(item.className || 'Class Review') + '</span><h4>' + escapeHtml(item.visibility === 'anonymous' ? 'Anonymous' : getPublicPreviewLegacy(item)) + '</h4><p>' + escapeHtml((item.publicDisplayText || item.message || '').slice(0, 220)) + '</p></article>').join('');
}

function ensurePublicMinistrySections(){
  if(document.body.dataset.page === 'testimonials'){
    const hasSection = document.getElementById('publishedTestimonialsSection');
    if(!hasSection){
      const anchor = document.querySelector('section.on-light-section');
      const html = '<section class="on-light-section" id="publishedTestimonialsSection" style="padding-top:0"><div class="section-inner"><div class="eyebrow reveal" style="margin-bottom:24px">Published Stories</div><div class="preview-cards reveal" id="publishedTestimonialsList"></div></div></section>';
      if(anchor) anchor.insertAdjacentHTML('afterend', html); else document.body.insertAdjacentHTML('beforeend', html);
    }
  }
  const reviewSection = document.getElementById('publishedClassReviewsSection');
  if(!reviewSection && document.body.dataset.page === 'teachings'){
    const target = document.getElementById('teachingCardsSection');
    const html = '<section class="on-light-section" id="publishedClassReviewsSection" style="padding-top:0"><div class="section-inner"><div class="eyebrow reveal" style="margin-bottom:24px">Class Reviews</div><div class="preview-cards reveal" id="publishedClassReviewsList"></div></div></section>';
    if(target) target.insertAdjacentHTML('afterend', html); else document.body.insertAdjacentHTML('beforeend', html);
  }
  const reviewButtonArea = document.getElementById('classReviewButtonArea');
  if(!reviewButtonArea && document.body.dataset.page === 'teachings'){
    const before = document.getElementById('teachingCardsSection');
    if(before){ before.insertAdjacentHTML('beforeend', '<div class="reveal" style="margin-top:24px;display:flex;justify-content:flex-end"><button class="btn on-light fill" id="openClassReviewFromTeachings" type="button">Leave A Class Review</button></div>'); }
  }
  if(!document.getElementById('openClassReviewFromTestimonial')){
    const testimonialArea = document.querySelector('section.on-light-section:last-of-type .reveal');
    if(testimonialArea && document.body.dataset.page === 'testimonials'){
      testimonialArea.insertAdjacentHTML('beforeend', '<button class="btn on-light fill" id="openClassReviewFromTestimonial" type="button" style="margin-left:20px">Leave A Class Review</button>');
    }
  }
}

function bindMinistryFormDialogEvents(){
  const existingTestimonyForm = document.getElementById('testimonyForm');
  if(existingTestimonyForm && !existingTestimonyForm.querySelector('[name="visibility"]')){
    const messageField = existingTestimonyForm.querySelector('#storyMessage');
    if(messageField){
      messageField.closest('.form-field').insertAdjacentHTML('afterend', '<div class="form-field full"><label>How would you like this shared?</label><div class="option-card-grid"><label class="option-card"><input type="radio" name="visibility" value="public" checked /> <span><strong>Public</strong><small>Show my name and testimony on the website.</small></span></label><label class="option-card"><input type="radio" name="visibility" value="anonymous" /> <span><strong>Anonymous</strong><small>Hide my name and personal details.</small></span></label><label class="option-card"><input type="radio" name="visibility" value="private" /> <span><strong>Private</strong><small>Only visible to the ministry team.</small></span></label></div></div><div class="form-field full"><a class="text-link" href="#" id="testimonyTermsLink">Read Terms &amp; Conditions</a></div>');
    }
  }
  document.getElementById('testimonyTermsLink')?.addEventListener('click', event => {
    event.preventDefault();
    openPolicyView('testimonyTerms');
  });
  if(document.getElementById('prayerRequestForm')) {
    document.getElementById('prayerRequestForm').addEventListener('submit', event => {
      event.preventDefault();
      const form = event.currentTarget;
      const formData = new FormData(form);
      const request = {
        id: 'prayer-' + Date.now().toString(36),
        firstName: String(formData.get('firstName') || '').trim(),
        lastName: String(formData.get('lastName') || '').trim(),
        email: String(formData.get('email') || '').trim(),
        phone: String(formData.get('phone') || '').trim(),
        message: String(formData.get('message') || '').trim(),
        visibility: String(formData.get('visibility') || 'public'),
        status: 'new',
        notes: '',
        createdAt: new Date().toISOString()
      };
      if(!request.message || !formData.get('terms')){
        document.getElementById('prayerFormStatus').textContent = 'Please complete the form and agree to the terms.';
        return;
      }
      PRAYER_REQUESTS.unshift(request);
      persistMinistryData();
      renderMinistryInboxViews();
      form.reset();
      document.getElementById('prayerFormStatus').textContent = 'We received your prayer request and we are praying for you. Confirmation message shown. Email response will be enabled when email automation is connected.';
      const dialog = document.getElementById('prayerRequestDialog');
      if(dialog) setTimeout(() => dialog.close(), 1200);
    });
  }

  if(document.getElementById('testimonyForm')) {
    document.getElementById('testimonyForm').addEventListener('submit', event => {
      event.preventDefault();
      const form = event.currentTarget;
      const formData = new FormData(form);
      const item = {
        id: 'story-' + Date.now().toString(36),
        firstName: String(formData.get('firstName') || formData.get('name') || '').trim().split(/\s+/)[0],
        lastName: String(formData.get('lastName') || formData.get('name') || '').trim().split(/\s+/).slice(1).join(' '),
        email: String(formData.get('email') || '').trim(),
        phone: String(formData.get('phone') || '').trim(),
        message: String(formData.get('message') || '').trim(),
        visibility: String(formData.get('visibility') || 'public'),
        status: 'pending',
        publicDisplayText: '',
        createdAt: new Date().toISOString()
      };
      if(!item.message || (!formData.get('permission') && !formData.get('terms'))){
        document.getElementById('testimonyFormStatus').textContent = 'Please complete the form and agree to the terms.';
        return;
      }
      TESTIMONIALS.unshift(item);
      persistMinistryData();
      renderMinistryInboxViews();
      renderPublishedTestimonials();
      form.reset();
      document.getElementById('testimonyFormStatus').textContent = 'Thank you — your testimony was received and is now waiting for review.';
      const dialog = document.getElementById('storyDialog');
      if(dialog) setTimeout(() => dialog.close(), 1200);
    });
  }

  if(document.getElementById('classReviewForm')) {
    document.getElementById('classReviewForm').addEventListener('submit', event => {
      event.preventDefault();
      const form = event.currentTarget;
      const formData = new FormData(form);
      const item = {
        id: 'review-' + Date.now().toString(36),
        className: String(formData.get('className') || 'Other / type class name').trim(),
        firstName: String(formData.get('firstName') || '').trim(),
        lastName: String(formData.get('lastName') || '').trim(),
        email: String(formData.get('email') || '').trim(),
        phone: String(formData.get('phone') || '').trim(),
        message: String(formData.get('message') || '').trim(),
        visibility: String(formData.get('visibility') || 'public'),
        status: 'pending',
        publicDisplayText: '',
        rating: String(formData.get('rating') || ''),
        recommendation: String(formData.get('recommendation') || ''),
        createdAt: new Date().toISOString()
      };
      if(!item.message || !formData.get('terms')){
        document.getElementById('classReviewFormStatus').textContent = 'Please complete the form and agree to the review terms.';
        return;
      }
      CLASS_REVIEWS.unshift(item);
      persistMinistryData();
      renderMinistryInboxViews();
      renderPublishedClassReviews();
      form.reset();
      document.getElementById('classReviewFormStatus').textContent = 'Thank you — your class review was received and is waiting for review.';
      const dialog = document.getElementById('classReviewDialog');
      if(dialog) setTimeout(() => dialog.close(), 1200);
    });
  }

  document.addEventListener('click', event => {
    const prayerView = event.target.closest('[data-prayer-view]');
    if(prayerView){ openPrayerDetailWindow(prayerView.dataset.prayerView); return; }
    const testimonyView = event.target.closest('[data-testimony-view]');
    if(testimonyView){ openTestimonyDetailWindow(testimonyView.dataset.testimonyView); return; }
    const reviewView = event.target.closest('[data-review-view]');
    if(reviewView){ openReviewDetailWindow(reviewView.dataset.reviewView); return; }
    const prayerFilterBtn = event.target.closest('[data-prayer-filter]');
    if(prayerFilterBtn){
      document.querySelectorAll('[data-prayer-filter]').forEach(btn => btn.classList.toggle('active', btn === prayerFilterBtn));
      setMinistryFilter('prayer', prayerFilterBtn.dataset.prayerFilter);
    }
    const storyFilterBtn = event.target.closest('[data-story-filter]');
    if(storyFilterBtn){
      document.querySelectorAll('[data-story-filter]').forEach(btn => btn.classList.toggle('active', btn === storyFilterBtn));
      setMinistryFilter('story', storyFilterBtn.dataset.storyFilter);
    }
    const reviewFilterBtn = event.target.closest('[data-review-filter]');
    if(reviewFilterBtn){
      document.querySelectorAll('[data-review-filter]').forEach(btn => btn.classList.toggle('active', btn === reviewFilterBtn));
      setMinistryFilter('review', reviewFilterBtn.dataset.reviewFilter);
    }
    if(event.target.closest('[data-open-prayer-form]')){
      document.getElementById('prayerRequestDialog').showModal();
    }
    if(event.target.closest('[data-open-class-review-form]')){
      document.getElementById('classReviewDialog').showModal();
    }
  });
}

function setupPublicFormButtons(){
  const buttonTargets = [
    { page: 'prayer', buttonId: 'prayerOpenRequest', action: 'prayer' },
    { page: 'connect', buttonId: 'connectOpenPrayer', action: 'prayer' },
    { page: 'testimonials', buttonId: 'openClassReviewFromTestimonial', action: 'classReview' },
    { page: 'teachings', buttonId: 'openClassReviewFromTeachings', action: 'classReview' }
  ];
  buttonTargets.forEach(({ page, buttonId, action }) => {
    const pageMatch = document.body.dataset.page === page;
    const btn = document.getElementById(buttonId);
    if(pageMatch && btn){
      btn.addEventListener('click', () => {
        const dialog = action === 'prayer' ? document.getElementById('prayerRequestDialog') : document.getElementById('classReviewDialog');
        if(dialog) dialog.showModal();
      });
    }
  });
  if(document.body.dataset.page === 'connect'){
    const prayerButton = document.getElementById('connectOpenPrayer');
    if(prayerButton) prayerButton.addEventListener('click', () => document.getElementById('prayerRequestDialog').showModal());
  }
}

function addMinistryDialogs(){
  document.body.insertAdjacentHTML('beforeend', `
    <dialog class="story-dialog" id="prayerRequestDialog" aria-labelledby="prayerRequestTitle">
      <div class="dialog-head"><div><div class="kicker" style="margin-bottom:0">Prayer Request</div><h3 id="prayerRequestTitle">Request Prayer</h3></div><button class="dialog-close" id="closePrayerRequestDialog" type="button" aria-label="Close prayer form">×</button></div>
      <div class="dialog-body">
        <p class="dialog-intro">Share what is on your heart. Your choice of Public, Anonymous, or Private determines how visible it is.</p>
        <form id="prayerRequestForm">
          <div class="story-form-grid">
            <div class="form-field"><label for="prayerFirstName">First Name</label><input id="prayerFirstName" name="firstName" type="text" placeholder="First name" required /></div>
            <div class="form-field"><label for="prayerLastName">Last Name</label><input id="prayerLastName" name="lastName" type="text" placeholder="Last name" required /></div>
            <div class="form-field"><label for="prayerEmail">Email</label><input id="prayerEmail" name="email" type="email" placeholder="Email address" required /></div>
            <div class="form-field"><label for="prayerPhone">Phone</label><input id="prayerPhone" name="phone" type="tel" placeholder="Phone optional" /></div>
            <div class="form-field full"><label for="prayerMessage">Prayer Request</label><textarea id="prayerMessage" name="message" rows="5" placeholder="Tell us what you are carrying" required></textarea></div>
            <div class="form-field full">
              <label>How would you like this handled?</label>
              <div class="option-card-grid">
                <label class="option-card"><input type="radio" name="visibility" value="public" checked /> <span><strong>Public</strong><small>May be shared with the ministry community.</small></span></label>
                <label class="option-card"><input type="radio" name="visibility" value="anonymous" /> <span><strong>Anonymous</strong><small>Your name and personal details will be hidden.</small></span></label>
                <label class="option-card"><input type="radio" name="visibility" value="private" /> <span><strong>Private</strong><small>Only visible to the ministry team.</small></span></label>
              </div>
            </div>
            <div class="form-field full"><label class="permission-label"><input name="terms" type="checkbox" required /><span>I agree to the Prayer Request Terms and understand that a submission does not guarantee a personal response.</span></label></div>
            <div class="form-field full"><a class="text-link" href="#" id="prayerTermsLink" type="button">Read Terms &amp; Conditions</a></div>
          </div>
          <div class="form-actions"><button class="btn fill" type="submit">Submit Request</button><div class="form-status" id="prayerFormStatus" role="status" aria-live="polite"></div></div>
        </form>
      </div>
    </dialog>

    <dialog class="story-dialog" id="classReviewDialog" aria-labelledby="classReviewTitle">
      <div class="dialog-head"><div><div class="kicker" style="margin-bottom:0">Class Review</div><h3 id="classReviewTitle">Leave A Class Review</h3></div><button class="dialog-close" id="closeClassReviewDialog" type="button" aria-label="Close class review form">×</button></div>
      <div class="dialog-body">
        <form id="classReviewForm">
          <div class="story-form-grid">
            <div class="form-field"><label for="reviewClassName">Select Class</label><select id="reviewClassName" name="className"><option value="Discernment">Discernment</option><option value="The Prophetic">The Prophetic</option><option value="Hearing the Voice of God">Hearing the Voice of God</option><option value="Spiritual Warfare">Spiritual Warfare</option><option value="Identity in Christ">Identity in Christ</option><option value="Other / type class name">Other / type class name</option></select></div>
            <div class="form-field"><label for="reviewFirstName">Reviewer First Name</label><input id="reviewFirstName" name="firstName" type="text" placeholder="First name" required /></div>
            <div class="form-field"><label for="reviewLastName">Reviewer Last Name</label><input id="reviewLastName" name="lastName" type="text" placeholder="Last name" required /></div>
            <div class="form-field"><label for="reviewEmail">Email</label><input id="reviewEmail" name="email" type="email" placeholder="Email address" required /></div>
            <div class="form-field"><label for="reviewPhone">Phone</label><input id="reviewPhone" name="phone" type="tel" placeholder="Phone optional" /></div>
            <div class="form-field"><label for="reviewRating">Rating</label><select id="reviewRating" name="rating"><option value="">Optional</option><option>5</option><option>4</option><option>3</option><option>2</option><option>1</option></select></div>
            <div class="form-field"><label for="reviewRecommendation">Would You Recommend?</label><select id="reviewRecommendation" name="recommendation"><option value="">Optional</option><option>Yes</option><option>No</option><option>Maybe</option></select></div>
            <div class="form-field full"><label for="reviewMessage">Review Message</label><textarea id="reviewMessage" name="message" rows="6" placeholder="What changed for you?" required></textarea></div>
            <div class="form-field full">
              <label>How would you like this shared?</label>
              <div class="option-card-grid">
                <label class="option-card"><input type="radio" name="visibility" value="public" checked /> <span><strong>Public</strong><small>Show my name and review on the website.</small></span></label>
                <label class="option-card"><input type="radio" name="visibility" value="anonymous" /> <span><strong>Anonymous</strong><small>Hide my name and personal details.</small></span></label>
                <label class="option-card"><input type="radio" name="visibility" value="private" /> <span><strong>Private</strong><small>Only visible to the ministry team.</small></span></label>
              </div>
            </div>
            <div class="form-field full"><label class="permission-label"><input name="terms" type="checkbox" required /><span>I agree to the Review Submission Terms.</span></label></div>
          </div>
          <div class="form-actions"><button class="btn fill" type="submit">Submit Review</button><div class="form-status" id="classReviewFormStatus" role="status" aria-live="polite"></div></div>
        </form>
      </div>
    </dialog>

    <dialog class="booking-dialog" id="prayerDetailDialog" aria-labelledby="prayerDetailTitle" style="max-width:640px">
      <div class="dialog-head"><div><div class="kicker" style="margin-bottom:0">Prayer Request</div><h3 id="prayerDetailTitle">View Request</h3></div><button class="dialog-close" id="closePrayerDetailDialog" type="button" aria-label="Close prayer detail">×</button></div>
      <div class="dialog-body">
        <div class="story-form-grid" id="prayerDetailFields"></div>
        <div class="form-actions" style="margin-top:16px"><button class="admin-btn-solid" type="button" data-prayer-status="in-progress">Mark As In Progress</button><button class="admin-btn-solid" type="button" data-prayer-status="completed">Mark As Completed</button><button class="admin-btn-ghost" type="button" data-prayer-status="archived">Archive</button><button class="admin-btn-ghost" type="button" id="savePrayerNoteBtn">Save Note</button></div>
        <div class="form-status" id="prayerStatusMessage" role="status" aria-live="polite"></div>
      </div>
    </dialog>

    <dialog class="booking-dialog" id="testimonyDetailDialog" aria-labelledby="testimonyDetailTitle" style="max-width:640px">
      <div class="dialog-head"><div><div class="kicker" style="margin-bottom:0">Testimony</div><h3 id="testimonyDetailTitle">Review Submission</h3></div><button class="dialog-close" id="closeTestimonyDetailDialog" type="button" aria-label="Close testimony detail">×</button></div>
      <div class="dialog-body"><div class="story-form-grid" id="testimonyDetailFields"></div><div class="form-actions" style="margin-top:16px"><button class="admin-btn-solid" type="button" data-testimony-status="published">Publish to Website</button><button class="admin-btn-ghost" type="button" data-testimony-status="private">Keep Private</button><button class="admin-btn-ghost" type="button" data-testimony-status="archived">Archive</button><button class="admin-btn-ghost" type="button" data-testimony-status="pending">Set Pending</button></div><div class="form-status" id="testimonyStatusMessage"></div></div>
    </dialog>

    <dialog class="booking-dialog" id="reviewDetailDialog" aria-labelledby="reviewDetailTitle" style="max-width:640px">
      <div class="dialog-head"><div><div class="kicker" style="margin-bottom:0">Class Review</div><h3 id="reviewDetailTitle">Review Submission</h3></div><button class="dialog-close" id="closeReviewDetailDialog" type="button" aria-label="Close review detail">×</button></div>
      <div class="dialog-body"><div class="story-form-grid" id="reviewDetailFields"></div><div class="form-actions" style="margin-top:16px"><button class="admin-btn-solid" type="button" data-review-status="published">Publish to Website</button><button class="admin-btn-ghost" type="button" data-review-status="private">Keep Private</button><button class="admin-btn-ghost" type="button" data-review-status="archived">Archive</button><button class="admin-btn-ghost" type="button" data-review-status="pending">Set Pending</button></div><div class="form-status" id="reviewStatusMessage"></div></div>
    </dialog>
  `);

  const prayerTermsLink = document.getElementById('prayerTermsLink');
  if(prayerTermsLink) prayerTermsLink.addEventListener('click', (event) => {
    event.preventDefault();
    openPolicyView('prayerTerms');
  });

  const testimonyTermsLink = document.getElementById('testimonyTermsLink');
  if(testimonyTermsLink) testimonyTermsLink.addEventListener('click', (event) => {
    event.preventDefault();
    openPolicyView('testimonyTerms');
  });

  document.getElementById('closePrayerRequestDialog')?.addEventListener('click', () => document.getElementById('prayerRequestDialog').close());
  document.getElementById('closeClassReviewDialog')?.addEventListener('click', () => document.getElementById('classReviewDialog').close());
  document.getElementById('closePrayerDetailDialog')?.addEventListener('click', () => document.getElementById('prayerDetailDialog').close());
  document.getElementById('closeTestimonyDetailDialog')?.addEventListener('click', () => document.getElementById('testimonyDetailDialog').close());
  document.getElementById('closeReviewDetailDialog')?.addEventListener('click', () => document.getElementById('reviewDetailDialog').close());

  document.addEventListener('click', event => {
    const policySave = event.target.closest('[data-policy-save]');
    if(policySave){
      saveMinistryPolicy(policySave.dataset.policySave);
      return;
    }
    const prayerDelete = event.target.closest('[data-prayer-delete]');
    if(prayerDelete){
      PRAYER_REQUESTS = PRAYER_REQUESTS.filter(item => item.id !== prayerDelete.dataset.prayerDelete);
      persistMinistryData();
      renderMinistryInboxViews();
      return;
    }
    const testimonyDelete = event.target.closest('[data-testimony-delete]');
    if(testimonyDelete){
      TESTIMONIALS = TESTIMONIALS.filter(item => item.id !== testimonyDelete.dataset.testimonyDelete);
      persistMinistryData();
      renderMinistryInboxViews();
      renderPublishedTestimonials();
      return;
    }
    const reviewDelete = event.target.closest('[data-review-delete]');
    if(reviewDelete){
      CLASS_REVIEWS = CLASS_REVIEWS.filter(item => item.id !== reviewDelete.dataset.reviewDelete);
      persistMinistryData();
      renderMinistryInboxViews();
      renderPublishedClassReviews();
      return;
    }
    const prayerStatusBtn = event.target.closest('[data-prayer-status]');
    if(prayerStatusBtn){
      const id = document.getElementById('prayerDetailDialog').dataset.prayerId;
      setPrayerStatus(id, prayerStatusBtn.dataset.prayerStatus);
      document.getElementById('prayerStatusMessage').textContent = 'Status updated.';
    }
    const testimonyStatusBtn = event.target.closest('[data-testimony-status]');
    if(testimonyStatusBtn){
      const id = document.getElementById('testimonyDetailDialog').dataset.testimonyId;
      const item = TESTIMONIALS.find(t => t.id === id);
      if(item){
        item.publicDisplayText = document.getElementById('testimonyPublicDisplayText')?.value || item.publicDisplayText || item.message || '';
      }
      setTestimonyStatus(id, testimonyStatusBtn.dataset.testimonyStatus);
      document.getElementById('testimonyStatusMessage').textContent = 'Status updated.';
    }
    const reviewStatusBtn = event.target.closest('[data-review-status]');
    if(reviewStatusBtn){
      const id = document.getElementById('reviewDetailDialog').dataset.reviewId;
      const item = CLASS_REVIEWS.find(r => r.id === id);
      if(item){
        item.publicDisplayText = document.getElementById('reviewPublicDisplayText')?.value || item.publicDisplayText || item.message || '';
      }
      setReviewStatus(id, reviewStatusBtn.dataset.reviewStatus);
      document.getElementById('reviewStatusMessage').textContent = 'Status updated.';
    }
  });
}

if(openStoryForm) openStoryForm.addEventListener('click', () => storyDialog.showModal());
if(closeStoryForm) closeStoryForm.addEventListener('click', () => storyDialog.close());
if(storyDialog) storyDialog.addEventListener('click', event => {
  if(event.target === storyDialog) storyDialog.close();
});
if(storyDialog) storyDialog.addEventListener('close', () => { if(formStatus) formStatus.textContent = ''; });
addMinistryDialogs();
initOwnerInboxNavigation();
bindMinistryFormDialogEvents();
setupPublicFormButtons();
ensurePublicMinistrySections();
renderMinistryInboxViews();
renderPublishedTestimonials();
renderPublishedClassReviews();

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
    .filter(t => t.active !== false && (t.id === '15-minute' || t.id === '30-minute'))
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
  renderBookingTimeButtons();
}

/* ---------------------------------------------------------------
   One-on-One booking wizard — Select Session → Choose Date → Choose
   Time → Details & Payment → Confirmation. One <form> the whole way
   through (so the existing submit handler/validation below is
   untouched); this layer only shows/hides panels and keeps the left
   summary panel in sync with what's been chosen so far.
   --------------------------------------------------------------- */
const BOOKING_WIZARD_STEPS = ['session', 'date', 'details', 'confirm'];
let bookingWizardStep = 'session';
function showBookingWizardStep(name){
  bookingWizardStep = name;
  document.querySelectorAll('.booking-step[data-booking-step]').forEach(el => { el.hidden = el.dataset.bookingStep !== name; });
  const idx = BOOKING_WIZARD_STEPS.indexOf(name);
  document.querySelectorAll('#bookingStepStrip .oneonone-step').forEach(el => {
    const stepIdx = BOOKING_WIZARD_STEPS.indexOf(el.dataset.stepIndicator);
    el.classList.toggle('active', stepIdx === idx);
    el.classList.toggle('completed', stepIdx < idx);
  });
}
function selectedSessionType(){
  const checked = bookingForm.querySelector('input[name="sessionType"]:checked');
  return checked ? SESSION_TYPES[checked.value] : null;
}
function updateBookingSummaryPanel(){
  const art = document.getElementById('bookingSummaryArt');
  const meta = document.getElementById('bookingSummaryMeta');
  const desc = document.getElementById('bookingSummaryDesc');
  const title = document.getElementById('bookingTitle');
  const t = selectedSessionType();
  if(!t){ return; }
  title.textContent = t.name;
  desc.textContent = t.description || '';
  art.className = 'checkout-summary' + (t.imageUrl ? '' : ' ' + teachingArtClass(t.name));
  art.style.backgroundImage = t.imageUrl ? "url('" + t.imageUrl.replace(/'/g, '%27') + "')" : '';
  const parts = [t.durationMinutes + ' Minutes', t.price ? '$' + Number(t.price).toFixed(0) : 'Free'];
  if(bookingDateInput.value) parts.push(formatTeachingDate ? formatTeachingDate(bookingDateInput.value) : bookingDateInput.value);
  if(bookingTimeSelect.value) parts.push(formatLocalTime(bookingDateInput.value, bookingTimeSelect.value, selectedBookingTimeZone()));
  meta.innerHTML = parts.map(p => '<span>' + escapeHtml(p) + '</span>').join('');
}
function renderBookingTimeButtons(){
  const wrap = document.getElementById('bookingTimeButtons');
  if(!wrap) return;
  const opts = Array.from(bookingTimeSelect.options).filter(o => o.value);
  if(bookingTimeSelect.disabled || opts.length === 0){
    const msg = bookingTimeSelect.options[0] ? bookingTimeSelect.options[0].text : 'Choose a date first';
    wrap.innerHTML = '<p class="admin-hint">' + escapeHtml(msg) + '</p>';
    document.getElementById('bookingStepDateNext').disabled = true;
    return;
  }
  wrap.innerHTML = opts.map(o => '<button type="button" class="booking-time-btn" data-time="' + escapeHtml(o.value) + '">' + escapeHtml(o.text.split(' (')[0]) + '</button>').join('');
  document.getElementById('bookingStepDateNext').disabled = true;
}
document.getElementById('bookingTimeButtons').addEventListener('click', event => {
  const btn = event.target.closest('.booking-time-btn');
  if(!btn) return;
  document.querySelectorAll('#bookingTimeButtons .booking-time-btn').forEach(b => b.classList.toggle('active', b === btn));
  bookingTimeSelect.value = btn.dataset.time;
  bookingTimeSelect.dispatchEvent(new Event('change'));
});
document.getElementById('bookingStepSessionNext').addEventListener('click', () => {
  if(!bookingForm.querySelector('input[name="sessionType"]:checked')){ bookingStatus.textContent = 'Choose a session to continue.'; return; }
  bookingStatus.textContent = '';
  updateBookingSummaryPanel();
  showBookingWizardStep('date');
  loadTimeSlots();
});
document.getElementById('bookingStepDateNext').addEventListener('click', () => {
  if(!bookingTimeSelect.value){
    bookingStatus.textContent = 'Choose an available time to continue.';
    return;
  }
  bookingStatus.textContent = '';
  updateBookingSummaryPanel();
  showBookingWizardStep('details');
  renderBookingOrderSummary();
});
bookingDateInput.addEventListener('input', () => {
  document.getElementById('bookingStepDateNext').disabled = true;
  loadTimeSlots();
});
document.querySelectorAll('[data-booking-back]').forEach(btn => {
  btn.addEventListener('click', () => showBookingWizardStep(btn.dataset.bookingBack));
});
function renderBookingOrderSummary(){
  const wrap = document.getElementById('bookingOrderSummary');
  if(!wrap) return;
  const t = selectedSessionType();
  if(!t) return;
  wrap.innerHTML =
    '<div class="checkout-order-row"><span>' + escapeHtml(t.name) + '</span><span>' + (t.price ? '$' + Number(t.price).toFixed(2) : 'Free') + '</span></div>' +
    '<div class="checkout-order-row"><span>' + escapeHtml(formatLocalDateTime(bookingDateInput.value, bookingTimeSelect.value, selectedBookingTimeZone())) + '</span><span></span></div>' +
    '<div class="checkout-order-total"><span>Total</span><span>' + (t.price ? '$' + Number(t.price).toFixed(2) : 'Free') + '</span></div>';
}
function openPolicyView(key){
  const p = BOOKING_POLICIES[key] || MINISTRY_POLICIES[key];
  if(!p) return;
  document.getElementById('policyViewTitle').textContent = p.title || (key === 'terms' ? 'Terms and Conditions' : 'No Refund Policy');
  document.getElementById('policyViewText').textContent = p.text || '';
  document.getElementById('policyViewUpdated').textContent = p.lastUpdated ? 'Last updated ' + p.lastUpdated : '';
  document.getElementById('policyViewDialog').showModal();
}
document.getElementById('bookingViewTerms').addEventListener('click', () => openPolicyView('terms'));
document.getElementById('bookingViewNoRefund').addEventListener('click', () => openPolicyView('noRefund'));
document.getElementById('closePolicyView').addEventListener('click', () => document.getElementById('policyViewDialog').close());
document.getElementById('bookingConfirmCloseBtn').addEventListener('click', () => bookingDialog.close());

function openBooking(service){
  bookingForm.reset();
  bookingStatus.textContent = '';
  document.getElementById('bookingStepDateNext').disabled = true;
  if(service){
    const serviceChoice = bookingForm.querySelector('input[name="sessionType"][value="' + service + '"]');
    if(serviceChoice) serviceChoice.checked = true;
  }
  if(currentUser && currentProfile){
    document.getElementById('bookingName').value = currentProfile.name || '';
    document.getElementById('bookingEmail').value = currentProfile.email || '';
  }
  setDetectedTimeZoneDefault();
  updateBookingSummaryPanel();
  showBookingWizardStep('session');
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
    bookingHoldNotice.textContent = "We're holding this time for you — " + m + ':' + String(s).padStart(2, '0') + ' remaining.';
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
    const nextBtn = document.getElementById('bookingStepDateNext');
    if(nextBtn) nextBtn.disabled = false;
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
    saveBookingsPreviewToStorage();
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
  if(!document.getElementById('bookingAgreeTerms').checked || !document.getElementById('bookingAgreeNoRefund').checked){
    bookingStatus.textContent = 'Please agree to the Terms and Conditions and the No Refund Policy to continue.';
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
    const bookingRef = 'UA-' + Date.now().toString(36).toUpperCase();
    document.getElementById('bookingConfirmSummary').innerHTML =
      '<div class="checkout-order-row"><span>Session</span><span>' + escapeHtml(sessionTypeName(service)) + '</span></div>' +
      '<div class="checkout-order-row"><span>When</span><span>' + escapeHtml(formatLocalDateTime(dateStr, time, clientTimeZone)) + '</span></div>' +
      '<div class="checkout-order-row"><span>Email</span><span>' + escapeHtml(email) + '</span></div>' +
      '<div class="checkout-order-row"><span>Phone</span><span>' + escapeHtml(phone) + '</span></div>' +
      '<div class="checkout-order-total"><span>Booking Reference</span><span>' + bookingRef + '</span></div>';
    bookingStatus.textContent = '';
    showBookingWizardStep('confirm');
    bookingForm.reset();
    loadTimeSlots();
    if(currentUser) loadMemberBookings();
  } catch (err) {
    if(err.message === 'slot-taken'){
      bookingStatus.textContent = 'That time was just taken by someone else — pick another.';
      showBookingWizardStep('date');
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
    renderBookingsOverviewStats();
    renderBookingsToday();
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
  const formatLabel = f => f === 'phone' ? 'Phone' : f === 'in-person' ? 'In Person' : 'Zoom';
  schedTypesList.innerHTML = ids.map(id => {
    const t = SESSION_TYPES[id];
    const buffer = (t.bufferBeforeMin || t.bufferAfterMin) ? ' · buffer ' + (t.bufferBeforeMin || 0) + '/' + (t.bufferAfterMin || 0) + ' min' : '';
    const capacity = t.capacity ? ' · capacity ' + t.capacity : '';
    const thumb = t.imageUrl
      ? '<div class="admin-teaching-thumb" style="background-image:url(\'' + t.imageUrl.replace(/'/g, '%27') + '\')"></div>'
      : '<div class="admin-teaching-thumb ' + teachingArtClass(t.name) + '"></div>';
    return '<div class="admin-teaching-row" data-type-id="' + escapeHtml(id) + '">' +
      thumb +
      '<div class="admin-teaching-info"><div class="admin-teaching-title-row"><strong>' + escapeHtml(t.name) + '</strong>' +
      (t.active === false ? '<span class="admin-status-pill cancelled">Inactive</span>' : '<span class="admin-status-pill published">Active</span>') + '</div>' +
      '<div class="admin-teaching-meta">' + t.durationMinutes + ' min · ' + formatLabel(t.format) +
      (t.price ? ' · $' + Number(t.price).toFixed(2) : ' · No Charge') + buffer + capacity + '</div></div>' +
      '<div class="admin-teaching-actions">' +
      '<button class="admin-btn-ghost sched-type-copy-link" type="button">Copy Link</button>' +
      '<button class="admin-btn-ghost sched-type-toggle" type="button">' +
        (t.active === false ? 'Activate' : 'Deactivate') + '</button>' +
      '<button class="admin-btn-ghost sched-type-delete" type="button">Delete</button>' +
      '</div></div>';
  }).join('');
}

function sessionTypesAllowedLabel(ids){
  if(!ids || ids.length === 0) return 'All session types';
  return ids.map(sessionTypeName).join(', ');
}
function renderSessionTypeCheckboxes(containerId, checkedIds){
  const el = document.getElementById(containerId);
  if(!el) return;
  const checked = checkedIds && checkedIds.length ? checkedIds : Object.keys(SESSION_TYPES);
  el.innerHTML = Object.keys(SESSION_TYPES).map(id =>
    '<label style="display:flex;align-items:center;gap:6px;font-size:12px;color:var(--owner-text)">' +
    '<input type="checkbox" value="' + escapeHtml(id) + '"' + (checked.includes(id) ? ' checked' : '') + ' /> ' + escapeHtml(SESSION_TYPES[id].name) +
    '</label>'
  ).join('');
}
function checkedSessionTypeIds(containerId){
  const el = document.getElementById(containerId);
  if(!el) return [];
  const all = Object.keys(SESSION_TYPES);
  const checked = Array.from(el.querySelectorAll('input[type="checkbox"]:checked')).map(c => c.value);
  return checked.length === all.length ? [] : checked;
}
function renderSchedRulesList(){
  if(!schedRulesList) return;
  renderSessionTypeCheckboxes('schedRuleTypesCheckboxes');
  if(AVAILABILITY_RULES.length === 0){
    schedRulesList.innerHTML = '<p style="color:#8a8a8a;font-size:12px">No availability windows yet — booking is effectively closed until you add one.</p>';
    return;
  }
  schedRulesList.innerHTML = AVAILABILITY_RULES.map(r => {
    return '<div class="portal-row" data-rule-id="' + escapeHtml(r.id || '') + '" style="padding:8px 0">' +
      '<div><strong>' + DAY_NAMES[r.dayOfWeek] + '</strong><small>' + minutesToLabel(hhmmToMinutes(r.startTime)) + '–' + minutesToLabel(hhmmToMinutes(r.endTime)) +
      ' · capacity ' + (r.capacity || 1) + ' · ' + escapeHtml(sessionTypesAllowedLabel(r.sessionTypeIds)) +
      (r.notes ? ' · ' + escapeHtml(r.notes) : '') + '</small></div>' +
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
  renderSessionTypeCheckboxes('schedOverrideTypesCheckboxes');
  const dates = Object.keys(AVAILABILITY_OVERRIDES).sort();
  if(dates.length === 0){
    schedOverridesList.innerHTML = '<p style="color:#8a8a8a;font-size:12px">No special-date overrides.</p>';
    return;
  }
  schedOverridesList.innerHTML = dates.map(d => {
    const o = AVAILABILITY_OVERRIDES[d];
    const desc = o.closed ? 'Fully closed' : (o.windows || []).map(w => minutesToLabel(hhmmToMinutes(w.startTime)) + '–' + minutesToLabel(hhmmToMinutes(w.endTime)) +
      ' (' + sessionTypesAllowedLabel(w.sessionTypeIds) + ')').join(', ');
    return '<div class="portal-row" data-override-date="' + escapeHtml(d) + '" style="padding:8px 0">' +
      '<div><strong>' + escapeHtml(d) + '</strong><small>' + escapeHtml(desc) + (o.notes ? ' · ' + escapeHtml(o.notes) : '') + '</small></div>' +
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
      saveBookingsPreviewToStorage();
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
    const format = document.getElementById('schedTypeFormat').value || 'zoom';
    const capacityRaw = document.getElementById('schedTypeCapacity').value;
    const imageUrl = document.getElementById('schedTypeImage').value.trim();
    if(!id || !name || !duration){ schedTypeStatus.textContent = 'ID, name, and minutes are required.'; return; }
    const existing = SESSION_TYPES[id] || {};
    const data = {
      name, durationMinutes: duration,
      price: priceRaw ? Number(priceRaw) : null,
      bufferBeforeMin, bufferAfterMin, format,
      capacity: capacityRaw ? Number(capacityRaw) : null,
      imageUrl,
      description, active: existing.active !== false,
      order: existing.order || (Object.keys(SESSION_TYPES).length + 1)
    };
    schedTypeStatus.textContent = 'Saving…';
    if(DEMO_MODE){
      SESSION_TYPES[id] = data;
      saveBookingsPreviewToStorage();
    } else {
      try { await setDoc(doc(db, 'sessionTypes', id), data); await loadSchedulingConfig(); }
      catch (err) { schedTypeStatus.textContent = 'Could not save that session type.'; return; }
    }
    renderSchedTypesList();
    renderBookingOptions();
    populateAdminBookTypeSelect();
    renderBookingsOverviewStats();
    schedTypeForm.reset();
    adminImagePreviewRefreshers.forEach(fn => fn());
    schedTypeStatus.textContent = SCHED_SAVE_NOTE;
  });

  schedTypesList.addEventListener('click', async event => {
    const toggleBtn = event.target.closest('.sched-type-toggle');
    const deleteBtn = event.target.closest('.sched-type-delete');
    const copyBtn = event.target.closest('.sched-type-copy-link');
    if(!toggleBtn && !deleteBtn && !copyBtn) return;
    const row = event.target.closest('[data-type-id]');
    const id = row.dataset.typeId;
    if(copyBtn){
      const link = new URL(BASE + 'one-on-one.html?service=' + encodeURIComponent(id), window.location.href).href;
      if(navigator.clipboard && navigator.clipboard.writeText){
        navigator.clipboard.writeText(link).then(() => { schedTypeStatus.textContent = 'Link copied for "' + SESSION_TYPES[id].name + '".'; })
          .catch(() => { schedTypeStatus.textContent = 'The link is: ' + link; });
      } else {
        schedTypeStatus.textContent = 'The link is: ' + link;
      }
      return;
    }
    if(DEMO_MODE){
      if(toggleBtn) SESSION_TYPES[id].active = SESSION_TYPES[id].active === false;
      else delete SESSION_TYPES[id];
      saveBookingsPreviewToStorage();
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
    const notes = document.getElementById('schedRuleNotes').value.trim();
    if(!startTime || !endTime || endTime <= startTime){ schedRuleStatus.textContent = 'Choose a valid start and end time.'; return; }
    const sessionTypeIds = checkedSessionTypeIds('schedRuleTypesCheckboxes');
    const data = { dayOfWeek, startTime, endTime, sessionTypeIds, capacity, notes };
    schedRuleStatus.textContent = 'Saving…';
    if(DEMO_MODE){
      AVAILABILITY_RULES.push({ id: 'preview-rule-' + (schedRuleSeq++), ...data });
      saveBookingsPreviewToStorage();
    } else {
      try { await setDoc(doc(collection(db, 'availabilityRules')), data); await loadSchedulingConfig(); }
      catch (err) { schedRuleStatus.textContent = 'Could not add that window.'; return; }
    }
    renderSchedRulesList();
    if(bookingIntroEl) bookingIntroEl.textContent = availabilitySummaryText();
    schedRuleForm.reset();
    renderSessionTypeCheckboxes('schedRuleTypesCheckboxes');
    schedRuleStatus.textContent = SCHED_SAVE_NOTE;
  });

  schedRulesList.addEventListener('click', async event => {
    const deleteBtn = event.target.closest('.sched-rule-delete');
    if(!deleteBtn) return;
    const row = event.target.closest('[data-rule-id]');
    if(DEMO_MODE){
      const idx = AVAILABILITY_RULES.findIndex(r => r.id === row.dataset.ruleId);
      if(idx !== -1) AVAILABILITY_RULES.splice(idx, 1);
      saveBookingsPreviewToStorage();
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
      saveBookingsPreviewToStorage();
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
      saveBookingsPreviewToStorage();
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
    const notes = document.getElementById('schedOverrideNotes').value.trim();
    if(!date){ schedOverrideStatus.textContent = 'Choose a date.'; return; }
    let data;
    if(closed){
      data = { closed: true, windows: [], notes };
    } else {
      if(!start || !end || end <= start){ schedOverrideStatus.textContent = 'Set a valid start and end time, or check "Fully closed".'; return; }
      const sessionTypeIds = checkedSessionTypeIds('schedOverrideTypesCheckboxes');
      data = { closed: false, windows: [{ startTime: start, endTime: end, capacity: 1, sessionTypeIds }], notes };
    }
    schedOverrideStatus.textContent = 'Saving…';
    if(DEMO_MODE){
      AVAILABILITY_OVERRIDES[date] = data;
      saveBookingsPreviewToStorage();
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
      saveBookingsPreviewToStorage();
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
  const avatar = document.getElementById('ownerSidebarAvatar');
  const photo = getOwnerProfilePhoto();
  if(photo){
    avatar.style.backgroundImage = "url('" + photo.replace(/'/g, '%27') + "')";
    avatar.textContent = '';
  } else {
    avatar.style.backgroundImage = '';
    avatar.textContent = name.trim().charAt(0).toUpperCase() || '?';
  }
}

/* ---------------------------------------------------------------
   Owner profile photo. In preview mode this lives in localStorage
   only (per the "preview should feel real" requirement); on the real
   site it's a `photoURL` field on the owner's own `users/{uid}` doc —
   the same plain-string-field pattern already used for every other
   uploaded image in this app, so no Firebase Storage is needed here
   either.
   --------------------------------------------------------------- */
function getOwnerProfilePhoto(){
  if(DEMO_MODE){
    try { return localStorage.getItem(PREVIEW_STORAGE_KEYS.profilePhoto) || ''; } catch (err) { return ''; }
  }
  return (currentProfile && currentProfile.photoURL) || '';
}
async function setOwnerProfilePhoto(dataUrl){
  if(DEMO_MODE){
    try {
      if(dataUrl) localStorage.setItem(PREVIEW_STORAGE_KEYS.profilePhoto, dataUrl);
      else localStorage.removeItem(PREVIEW_STORAGE_KEYS.profilePhoto);
    } catch (err) {
      throw new Error("This browser's preview storage is full — try a smaller image.");
    }
  } else if(currentUser) {
    await updateDoc(doc(db, 'users', currentUser.uid), { photoURL: dataUrl || null });
  }
  if(currentProfile) currentProfile.photoURL = dataUrl || '';
}
function renderOwnerProfilePhotoPreview(){
  const el = document.getElementById('ownerProfilePhotoPreview');
  if(!el) return;
  const photo = getOwnerProfilePhoto();
  const name = (currentProfile && (currentProfile.name || currentProfile.email)) || '';
  if(photo){ el.style.backgroundImage = "url('" + photo.replace(/'/g, '%27') + "')"; el.textContent = ''; }
  else { el.style.backgroundImage = ''; el.textContent = name.trim().charAt(0).toUpperCase() || '?'; }
}
const ownerProfilePhotoFile = document.getElementById('ownerProfilePhotoFile');
if(ownerProfilePhotoFile){
  ownerProfilePhotoFile.addEventListener('change', async () => {
    const file = ownerProfilePhotoFile.files[0];
    ownerProfilePhotoFile.value = '';
    if(!file) return;
    if(!file.type || !file.type.startsWith('image/')){ alert('Please choose an image file.'); return; }
    try {
      const dataUrl = await resizeImageToDataUrl(file, 400, 0.82);
      await setOwnerProfilePhoto(dataUrl);
      renderOwnerProfilePhotoPreview();
      updateOwnerSidebarProfile();
    } catch (err) {
      console.error('profile photo upload failed', err);
      alert(err && err.message ? err.message : 'Could not use that image — try a different file.');
    }
  });
}
document.getElementById('ownerProfilePhotoRemove').addEventListener('click', async () => {
  await setOwnerProfilePhoto('');
  renderOwnerProfilePhotoPreview();
  updateOwnerSidebarProfile();
});

/* ---------------------------------------------------------------
   Account Profile — first/last name and a read-only summary of
   email/phone/role (those are changed from Account Settings below,
   which already has the verification flow for each).
   --------------------------------------------------------------- */
function renderOwnerAccountProfile(){
  if(!currentProfile) return;
  const parts = (currentProfile.name || '').split(' ');
  document.getElementById('ownerProfileFirstName').value = currentProfile.firstName || parts[0] || '';
  document.getElementById('ownerProfileLastName').value = currentProfile.lastName || parts.slice(1).join(' ') || '';
  document.getElementById('ownerProfileEmailDisplay').value = currentProfile.email || '';
  document.getElementById('ownerProfilePhoneDisplay').value = currentProfile.phone || 'Not added';
  document.getElementById('ownerProfileRoleDisplay').value = 'Owner';
  renderOwnerProfilePhotoPreview();
}
document.getElementById('ownerProfileSaveBtn').addEventListener('click', async () => {
  const status = document.getElementById('ownerProfileStatus');
  const firstName = document.getElementById('ownerProfileFirstName').value.trim();
  const lastName = document.getElementById('ownerProfileLastName').value.trim();
  if(!firstName || !lastName){ status.textContent = 'Enter your first and last name.'; return; }
  const fullName = firstName + ' ' + lastName;
  status.textContent = 'Saving…';
  try {
    if(DEMO_MODE){
      if(currentUser) currentUser.displayName = fullName;
    } else {
      await updateProfile(currentUser, { displayName: fullName });
      await updateDoc(doc(db, 'users', currentUser.uid), { firstName, lastName, name: fullName });
    }
    if(currentProfile){ currentProfile.name = fullName; currentProfile.firstName = firstName; currentProfile.lastName = lastName; }
    updateOwnerSidebarProfile();
    status.textContent = 'Saved.';
  } catch (err) {
    console.error('save owner profile failed', err);
    status.textContent = 'Could not save changes — try again.';
  }
});

/* ---------------------------------------------------------------
   Media Library — independently uploaded images, separate from the
   images already attached to a specific teaching. Reusable later for
   a Featured Teaching Image, Class Card Image, or Scripture Image via
   "Use For Teaching". Preview mode keeps this in localStorage; the
   real site keeps it in a small `mediaLibrary` Firestore collection,
   storing images the same resized-base64 way as everywhere else in
   this app (no Firebase Storage required).
   --------------------------------------------------------------- */
async function addMediaLibraryItem(dataUrl, label){
  const id = 'media-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8);
  const item = { id, url: dataUrl, label: label || 'Uploaded Image', createdAtMs: Date.now() };
  MEDIA_LIBRARY.unshift(item);
  if(DEMO_MODE) savePreviewToStorage();
  else await setDoc(doc(db, 'mediaLibrary', id), { url: dataUrl, label: item.label, createdAtMs: item.createdAtMs, createdAt: serverTimestamp() });
  return item;
}
async function updateMediaLibraryItem(id, fields){
  const item = MEDIA_LIBRARY.find(m => m.id === id);
  if(!item) return;
  Object.assign(item, fields);
  if(DEMO_MODE) savePreviewToStorage();
  else await updateDoc(doc(db, 'mediaLibrary', id), fields);
}
async function deleteMediaLibraryItem(id){
  MEDIA_LIBRARY = MEDIA_LIBRARY.filter(m => m.id !== id);
  if(DEMO_MODE) savePreviewToStorage();
  else await deleteDoc(doc(db, 'mediaLibrary', id));
}
const MEDIA_ARTWORK_SLOTS = [
  { field: 'hero', label: 'Featured Teaching Image' },
  { field: 'card', label: 'Class Card Image' },
  { field: 'heroMobile', label: 'Mobile Image' }
];
function renderOwnerMediaGallery(){
  const wrap = document.getElementById('ownerMediaGallery');
  if(!wrap) return;
  const usedItems = [];
  Object.values(TEACHINGS).forEach(t => {
    const art = t.artwork || {};
    if(art.hero) usedItems.push({ url: art.hero, label: (t.title || 'Untitled') + ' — Featured Teaching Image' });
    if(art.card) usedItems.push({ url: art.card, label: (t.title || 'Untitled') + ' — Class Card Image' });
    if(art.heroMobile) usedItems.push({ url: art.heroMobile, label: (t.title || 'Untitled') + ' — Mobile Image' });
  });
  if(TEACHING_PAGE_SETTINGS.scriptureImage) usedItems.push({ url: TEACHING_PAGE_SETTINGS.scriptureImage, label: 'Scripture Section' });

  const libraryHtml = MEDIA_LIBRARY.map(item =>
    '<div class="admin-media-item">' +
      '<div class="admin-media-thumb" style="background-image:url(\'' + item.url.replace(/'/g, '%27') + '\')"></div>' +
      '<span>' + escapeHtml(item.label || 'Uploaded Image') + '</span>' +
      '<div class="admin-media-item-actions">' +
        '<button type="button" class="admin-btn-ghost" data-media-action="use" data-media-id="' + item.id + '">Use For Teaching</button>' +
        '<button type="button" class="admin-btn-ghost" data-media-action="view" data-media-id="' + item.id + '">View</button>' +
        '<label class="admin-btn-ghost" style="cursor:pointer">Replace<input type="file" accept="image/*" hidden data-media-replace="' + item.id + '" /></label>' +
        '<button type="button" class="admin-btn-ghost" data-media-action="delete" data-media-id="' + item.id + '">Delete</button>' +
      '</div>' +
    '</div>'
  ).join('');
  const usedHtml = usedItems.map(i =>
    '<div class="admin-media-item">' +
      '<div class="admin-media-thumb" style="background-image:url(\'' + i.url.replace(/'/g, '%27') + '\')"></div>' +
      '<span>' + escapeHtml(i.label) + '</span>' +
      '<div class="admin-media-item-actions"><span class="admin-microlabel">Already In Use</span></div>' +
    '</div>'
  ).join('');
  wrap.innerHTML = (libraryHtml + usedHtml) ||
    '<p class="admin-hint">No images yet — click "Upload New Image" above, or add one from Teachings → open a class → Images.</p>';
}
const ownerMediaUploadFile = document.getElementById('ownerMediaUploadFile');
if(ownerMediaUploadFile){
  ownerMediaUploadFile.addEventListener('change', async () => {
    const file = ownerMediaUploadFile.files[0];
    ownerMediaUploadFile.value = '';
    if(!file) return;
    if(!file.type || !file.type.startsWith('image/')){ alert('Please choose an image file.'); return; }
    try {
      const dataUrl = await resizeImageToDataUrl(file, 1600, 0.75);
      await addMediaLibraryItem(dataUrl, file.name ? file.name.replace(/\.[^.]+$/, '') : 'Uploaded Image');
      renderOwnerMediaGallery();
    } catch (err) {
      console.error('media upload failed', err);
      alert(err && err.message ? err.message : 'Could not use that image — try a different file.');
    }
  });
}
let pendingMediaUseId = null;
document.getElementById('ownerMediaGallery').addEventListener('click', async event => {
  const useBtn = event.target.closest('[data-media-action="use"]');
  const viewBtn = event.target.closest('[data-media-action="view"]');
  const deleteBtn = event.target.closest('[data-media-action="delete"]');
  if(useBtn){
    pendingMediaUseId = useBtn.dataset.mediaId;
    openMediaUseDialog();
    return;
  }
  if(viewBtn){
    const item = MEDIA_LIBRARY.find(m => m.id === viewBtn.dataset.mediaId);
    if(item) window.open(item.url, '_blank');
    return;
  }
  if(deleteBtn){
    if(!confirm('Delete this image from your Media Library? This cannot be undone.')) return;
    await deleteMediaLibraryItem(deleteBtn.dataset.mediaId);
    renderOwnerMediaGallery();
  }
});
document.getElementById('ownerMediaGallery').addEventListener('change', async event => {
  const input = event.target.closest('[data-media-replace]');
  if(!input) return;
  const file = input.files[0];
  const id = input.dataset.mediaReplace;
  input.value = '';
  if(!file) return;
  if(!file.type || !file.type.startsWith('image/')){ alert('Please choose an image file.'); return; }
  try {
    const dataUrl = await resizeImageToDataUrl(file, 1600, 0.75);
    await updateMediaLibraryItem(id, { url: dataUrl });
    renderOwnerMediaGallery();
  } catch (err) {
    console.error('media replace failed', err);
    alert('Could not use that image — try a different file.');
  }
});
function openMediaUseDialog(){
  const teachingSelect = document.getElementById('mediaUseTeachingSelect');
  const slotSelect = document.getElementById('mediaUseSlotSelect');
  teachingSelect.innerHTML = Object.values(TEACHINGS)
    .map(t => '<option value="' + t.id + '">' + escapeHtml(t.title || 'Untitled') + '</option>').join('');
  slotSelect.innerHTML = MEDIA_ARTWORK_SLOTS
    .map(s => '<option value="' + s.field + '">' + escapeHtml(s.label) + '</option>').join('');
  document.getElementById('mediaUseStatus').textContent = '';
  document.getElementById('mediaUseDialog').showModal();
}
document.getElementById('mediaUseCancelBtn').addEventListener('click', () => document.getElementById('mediaUseDialog').close());
document.getElementById('mediaUseApplyBtn').addEventListener('click', async () => {
  const item = MEDIA_LIBRARY.find(m => m.id === pendingMediaUseId);
  const teachingId = document.getElementById('mediaUseTeachingSelect').value;
  const slotField = document.getElementById('mediaUseSlotSelect').value;
  const status = document.getElementById('mediaUseStatus');
  if(!item || !teachingId || !slotField) return;
  status.textContent = 'Applying…';
  try {
    const t = TEACHINGS[teachingId];
    if(!t) throw new Error('not-found');
    t.artwork = t.artwork || {};
    t.artwork[slotField] = item.url;
    if(DEMO_MODE) savePreviewToStorage();
    else await updateDoc(doc(db, 'teachings', teachingId), { ['artwork.' + slotField]: item.url });
    renderTeachingManager();
    renderOwnerMediaGallery();
    status.textContent = 'Done.';
    setTimeout(() => document.getElementById('mediaUseDialog').close(), 500);
  } catch (err) {
    console.error('use for teaching failed', err);
    status.textContent = 'Could not apply that image — try again.';
  }
});

/* ---------------------------------------------------------------
   Owner Appearance — a per-browser preference for how the OWNER
   DASHBOARD looks (not the public website). There's only one theme
   (Modern Light); the only real choice is a small accent color,
   applied via data-owner-accent on <body>, which every owner- and
   admin- prefixed CSS rule reads through the --owner-* custom
   properties defined in styles.css. Stored in localStorage only.
   Old saved preferences from an earlier version of this screen (which
   also had a Dark Mode and a Classic layout option) are migrated to
   the closest accent so nobody's saved pick just disappears.
   --------------------------------------------------------------- */
const OWNER_APPEARANCE_KEY = 'ua_owner_appearance_v1';
const OWNER_APPEARANCE_ACCENT_MIGRATION = { slate: 'bluegray', espresso: 'taupe' };
function loadOwnerAppearance(){
  let accent = 'ink';
  try {
    const raw = localStorage.getItem(OWNER_APPEARANCE_KEY);
    if(raw){
      const parsed = JSON.parse(raw);
      accent = OWNER_APPEARANCE_ACCENT_MIGRATION[parsed.accent] || parsed.accent || 'ink';
    }
  } catch (err) { /* ignore */ }
  return { accent };
}
function saveOwnerAppearance(pref){
  try { localStorage.setItem(OWNER_APPEARANCE_KEY, JSON.stringify(pref)); } catch (err) { /* ignore */ }
}
function renderOwnerAppearanceControls(pref){
  document.querySelectorAll('#appearanceAccentRow [data-appearance-accent]').forEach(b => b.classList.toggle('active', b.dataset.appearanceAccent === pref.accent));
}
function applyOwnerAppearance(){
  const pref = loadOwnerAppearance();
  document.body.dataset.ownerAccent = pref.accent || 'ink';
  renderOwnerAppearanceControls(pref);
}
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

async function loadOwnerData(){
  if(!currentProfile || currentProfile.role !== 'admin') return;
  updateOwnerSidebarProfile();
  applyOwnerAppearance();
  if(!DEMO_MODE){ try { await loadSchedulingConfig(); } catch (err) { /* keep whatever is already loaded */ } }
  if(!DEMO_MODE){ try { await loadTeachingPageConfig(); } catch (err) { /* keep whatever is already loaded */ } }
  if(!DEMO_MODE){ try { await loadMediaLibrary(); } catch (err) { /* keep whatever is already loaded */ } }
  renderOwnerProfilePhotoPreview();
  renderOwnerAccountProfile();
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
  renderBookingsPanels();
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
    if(b){ b.date = newDate; b.time = newTime; b.slotId = newSlotId; b.startAtUTC = startAtUTC; b.rescheduled = true; }
    saveBookingsPreviewToStorage();
    return;
  }
  await runTransaction(db, async (tx) => {
    const newSlotRef = doc(db, 'slots', newSlotId);
    const newSlotSnap = await tx.get(newSlotRef);
    if(newSlotSnap.exists()) throw new Error('slot-taken');
    if(oldSlotId) tx.delete(doc(db, 'slots', oldSlotId));
    tx.set(newSlotRef, { date: newDate, time: newTime, sessionType, uid: uid || null, createdAt: serverTimestamp() });
    tx.update(doc(db, 'bookings', bookingId), { date: newDate, time: newTime, slotId: newSlotId, startAtUTC, rescheduled: true });
  });
}

function ownerConfirmedRowHtml(b){
  const label = sessionTypeName(b.sessionType);
  const format = (SESSION_TYPES[b.sessionType] && SESSION_TYPES[b.sessionType].format) || 'zoom';
  const formatLabel = format === 'phone' ? 'Phone' : format === 'in-person' ? 'In Person' : 'Zoom';
  return '<div class="portal-request" data-booking-id="' + b.id + '" data-slot-id="' + escapeHtml(b.slotId || '') +
    '" data-uid="' + escapeHtml(b.uid || '') + '" data-session-type="' + escapeHtml(b.sessionType) + '">' +
    '<div style="flex:1;min-width:0">' +
    '<div style="display:flex;justify-content:space-between;gap:14px;flex-wrap:wrap">' +
    '<div><strong>' + escapeHtml(b.name) + '</strong> <span class="admin-status-pill published">Confirmed</span>' +
    (b.rescheduled ? ' <span class="admin-status-pill draft">Rescheduled</span>' : '') +
    '<p>' + escapeHtml(label) + ' · ' + formatLabel + ' · ' + escapeHtml(ownerBookingTimeLine(b)) +
    ' · ' + escapeHtml(b.email) + (b.phone ? ' · ' + escapeHtml(b.phone) : '') + (b.reason ? '<br>“' + escapeHtml(b.reason) + '”' : '') + '</p></div>' +
    '<div style="display:flex;gap:6px;flex-wrap:wrap;flex:0 0 auto">' +
    '<button class="admin-btn-ghost owner-reschedule-toggle" type="button">Reschedule</button>' +
    '<button class="admin-btn-ghost owner-cancel-confirmed" type="button">Cancel</button>' +
    '<button class="admin-btn-ghost" type="button" disabled title="Coming Later">Message Client</button>' +
    '</div></div>' +
    '<div class="owner-reschedule-panel" hidden style="display:flex;gap:8px;align-items:flex-end;flex-wrap:wrap;margin-top:10px;padding-top:10px;border-top:1px dashed #c7c7c7">' +
    '<div class="form-field" style="flex:1;min-width:140px"><label>New date</label><input type="date" class="owner-resched-date" style="background:#fdfcfb;color:var(--black);border-color:#bfbfbf" /></div>' +
    '<div class="form-field" style="flex:1;min-width:160px"><label>New time</label><select class="owner-resched-time" disabled style="background:#fdfcfb;color:var(--black);border-color:#bfbfbf"><option value="">Choose a date first</option></select></div>' +
    '<button class="admin-btn-ghost owner-resched-save" type="button">Save</button>' +
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
  const cancelBtn = event.target.closest('.owner-cancel-confirmed');
  if(!toggleBtn && !saveBtn && !cancelBtn) return;
  const row = event.target.closest('[data-booking-id]');
  if(toggleBtn){
    row.querySelector('.owner-reschedule-panel').hidden = !row.querySelector('.owner-reschedule-panel').hidden;
    return;
  }
  if(cancelBtn){
    if(!confirm('Cancel this confirmed appointment? The client will need a new booking if they want to reschedule.')) return;
    cancelBtn.disabled = true;
    try {
      if(DEMO_MODE){
        const b = DEMO_BOOKINGS.find(x => x.id === row.dataset.bookingId);
        if(b) b.status = 'cancelled';
        saveBookingsPreviewToStorage();
      } else {
        await updateDoc(doc(db, 'bookings', row.dataset.bookingId), { status: 'cancelled' });
      }
      portalOwnerStatus.textContent = 'Appointment cancelled.';
      loadOwnerConfirmed();
      loadOwnerCancelled();
      renderBookingsOverviewStats();
      renderBookingsToday();
    } catch (err) {
      portalOwnerStatus.textContent = 'Could not cancel that appointment.';
      cancelBtn.disabled = false;
    }
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
    renderBookingsOverviewStats();
    renderBookingsToday();
  } catch (err) {
    portalOwnerStatus.textContent = err.message === 'slot-taken' ? 'That new time is already booked.' : 'Could not reschedule.';
    saveBtn.disabled = false;
  }
});

function ownerPendingRowHtml(b){
  const label = sessionTypeName(b.sessionType);
  const format = (SESSION_TYPES[b.sessionType] && SESSION_TYPES[b.sessionType].format) || 'zoom';
  const formatLabel = format === 'phone' ? 'Phone' : format === 'in-person' ? 'In Person' : 'Zoom';
  return '<div class="portal-request" data-booking-id="' + b.id + '" data-slot-id="' + escapeHtml(b.slotId || '') + '">' +
    '<div><strong>' + escapeHtml(b.name) + '</strong> <span class="admin-status-pill draft">Pending</span>' +
    '<p>' + escapeHtml(label) + ' · ' + formatLabel + ' · ' + escapeHtml(ownerBookingTimeLine(b)) +
    ' · ' + escapeHtml(b.email) + (b.phone ? ' · ' + escapeHtml(b.phone) : '') + (b.reason ? '<br>“' + escapeHtml(b.reason) + '”' : '') + '</p></div>' +
    '<div class="portal-inline-actions">' +
    '<button class="admin-btn-ghost owner-confirm-booking" type="button">Confirm</button>' +
    '<button class="admin-btn-ghost owner-decline-booking" type="button">Cancel</button>' +
    '<button class="admin-btn-ghost" type="button" disabled title="Coming Later">Message Client</button>' +
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
        loadOwnerCancelled();
      }
      saveBookingsPreviewToStorage();
      loadOwnerBookings();
      renderBookingsOverviewStats();
      renderBookingsToday();
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
      loadOwnerCancelled();
    }
    loadOwnerBookings();
    renderBookingsOverviewStats();
    renderBookingsToday();
  } catch (err) {
    portalOwnerStatus.textContent = 'Could not update that booking.';
    event.target.disabled = false;
  }
});

function ownerCompletedRowHtml(b){
  const label = sessionTypeName(b.sessionType);
  return '<div class="portal-request" data-booking-id="' + b.id + '">' +
    '<div><strong>' + escapeHtml(b.name) + '</strong><p>' + escapeHtml(label) + ' · ' + escapeHtml(ownerBookingTimeLine(b)) +
    ' · ' + escapeHtml(b.email) + (b.phone ? ' · ' + escapeHtml(b.phone) : '') + '</p></div>' +
    '<span class="admin-status-pill completed">Completed</span></div>';
}
async function loadOwnerCompleted(){
  const container = document.getElementById('ownerCompletedList');
  if(!container) return;
  container.innerHTML = '<p class="admin-hint">Loading…</p>';
  const today = new Date().toISOString().slice(0, 10);
  if(DEMO_MODE){
    const items = DEMO_BOOKINGS.filter(b => b.status === 'confirmed' && b.date < today)
      .sort((a, b) => (b.date + b.time).localeCompare(a.date + a.time));
    container.innerHTML = items.length === 0 ? '<p class="admin-hint">No completed appointments yet.</p>' : items.map(ownerCompletedRowHtml).join('');
    return;
  }
  try {
    const snap = await getDocs(query(collection(db, 'bookings'), where('status', '==', 'confirmed')));
    const items = [];
    snap.forEach(docSnap => { const b = docSnap.data(); if(b.date < today) items.push({ id: docSnap.id, ...b }); });
    items.sort((a, b) => (b.date + b.time).localeCompare(a.date + a.time));
    container.innerHTML = items.length === 0 ? '<p class="admin-hint">No completed appointments yet.</p>' : items.map(ownerCompletedRowHtml).join('');
  } catch (err) {
    container.innerHTML = '<p class="admin-hint">Could not load completed appointments.</p>';
  }
}

function ownerCancelledRowHtml(b){
  const label = sessionTypeName(b.sessionType);
  const pillLabel = b.status === 'cancelled' ? 'Cancelled' : 'Declined';
  return '<div class="portal-request" data-booking-id="' + b.id + '">' +
    '<div><strong>' + escapeHtml(b.name) + '</strong><p>' + escapeHtml(label) + ' · ' + escapeHtml(ownerBookingTimeLine(b)) +
    ' · ' + escapeHtml(b.email) + '</p></div>' +
    '<span class="admin-status-pill cancelled">' + pillLabel + '</span></div>';
}
async function loadOwnerCancelled(){
  const container = document.getElementById('ownerCancelledList');
  if(!container) return;
  container.innerHTML = '<p class="admin-hint">Loading…</p>';
  if(DEMO_MODE){
    const items = DEMO_BOOKINGS.filter(b => b.status === 'declined' || b.status === 'cancelled')
      .sort((a, b) => (b.date + b.time).localeCompare(a.date + a.time));
    container.innerHTML = items.length === 0 ? '<p class="admin-hint">Nothing cancelled or declined.</p>' : items.map(ownerCancelledRowHtml).join('');
    return;
  }
  try {
    const items = [];
    for (const status of ['declined', 'cancelled']) {
      const snap = await getDocs(query(collection(db, 'bookings'), where('status', '==', status)));
      snap.forEach(docSnap => items.push({ id: docSnap.id, ...docSnap.data() }));
    }
    items.sort((a, b) => (b.date + b.time).localeCompare(a.date + a.time));
    container.innerHTML = items.length === 0 ? '<p class="admin-hint">Nothing cancelled or declined.</p>' : items.map(ownerCancelledRowHtml).join('');
  } catch (err) {
    container.innerHTML = '<p class="admin-hint">Could not load cancelled appointments.</p>';
  }
}

/* ---------------------------------------------------------------
   Bookings Overview — sub-nav, stat tiles, Today's Schedule, and
   Quick Actions. Reuses the same DEMO_BOOKINGS/`bookings` collection
   and SESSION_TYPES/AVAILABILITY_RULES already loaded above — this is
   a read-only summary layer, not a second data source.
   --------------------------------------------------------------- */
async function ownerAllConfirmedBookings(){
  if(DEMO_MODE) return DEMO_BOOKINGS.filter(b => b.status === 'confirmed');
  try {
    const snap = await getDocs(query(collection(db, 'bookings'), where('status', '==', 'confirmed')));
    const items = [];
    snap.forEach(docSnap => items.push({ id: docSnap.id, ...docSnap.data() }));
    return items;
  } catch (err) { return []; }
}
async function ownerPendingCount(){
  if(DEMO_MODE) return DEMO_BOOKINGS.filter(b => b.status === 'pending').length;
  try {
    const snap = await getDocs(query(collection(db, 'bookings'), where('status', '==', 'pending')));
    return snap.size;
  } catch (err) { return 0; }
}
async function renderBookingsOverviewStats(){
  const wrap = document.getElementById('bookingsOverviewStats');
  if(!wrap) return;
  const today = new Date();
  const todayStr = today.toISOString().slice(0, 10);
  const weekAhead = new Date(today.getTime() + 7 * 86400000).toISOString().slice(0, 10);
  const [confirmed, pendingCount] = await Promise.all([ownerAllConfirmedBookings(), ownerPendingCount()]);
  const upcomingWeek = confirmed.filter(b => b.date >= todayStr && b.date <= weekAhead).length;
  wrap.innerHTML =
    '<div class="admin-stat-tile"><span>Upcoming This Week</span><strong>' + upcomingWeek + '</strong></div>' +
    '<div class="admin-stat-tile"><span>Pending Requests</span><strong>' + pendingCount + '</strong></div>' +
    '<div class="admin-stat-tile"><span>Available Slots</span><strong>' + AVAILABILITY_RULES.length + '</strong><em>Weekly windows open</em></div>' +
    '<div class="admin-stat-tile"><span>Booked Sessions</span><strong>' + confirmed.length + '</strong><em>All confirmed, all-time</em></div>';
}
async function renderBookingsToday(){
  const wrap = document.getElementById('bookingsTodayList');
  const previewWrap = document.getElementById('bookingsUpcomingPreview');
  if(!wrap && !previewWrap) return;
  const todayStr = new Date().toISOString().slice(0, 10);
  const confirmed = (await ownerAllConfirmedBookings()).sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
  if(wrap){
    const todayItems = confirmed.filter(b => b.date === todayStr);
    wrap.innerHTML = todayItems.length === 0
      ? '<p class="admin-hint">Nothing on the calendar for today.</p>'
      : todayItems.map(b => '<div class="admin-teaching-row"><div class="admin-teaching-info"><strong>' + escapeHtml(b.name) +
          '</strong><div class="admin-teaching-meta">' + escapeHtml(sessionTypeName(b.sessionType)) + ' · ' + escapeHtml(formatLocalDateTime(b.date, b.time, BUSINESS_TZ)) +
          '</div></div><span class="admin-status-pill published">Confirmed</span></div>').join('');
  }
  if(previewWrap){
    const upcoming = confirmed.filter(b => b.date >= todayStr).slice(0, 5);
    previewWrap.innerHTML = upcoming.length === 0
      ? '<p class="admin-hint">No upcoming confirmed appointments.</p>'
      : upcoming.map(b => '<div class="admin-teaching-row"><div class="admin-teaching-info"><strong>' + escapeHtml(b.name) +
          '</strong><div class="admin-teaching-meta">' + escapeHtml(sessionTypeName(b.sessionType)) + ' · ' + escapeHtml(formatLocalDateTime(b.date, b.time, BUSINESS_TZ)) +
          '</div></div><span class="admin-status-pill published">Confirmed</span></div>').join('');
  }
}
document.getElementById('bookingsQuickActions').addEventListener('click', event => {
  const btn = event.target.closest('[data-bookings-quick-action]');
  if(!btn) return;
  const status = document.getElementById('bookingsQuickActionStatus');
  const action = btn.dataset.bookingsQuickAction;
  if(action === 'copy-link'){
    const link = new URL(BASE + 'one-on-one.html', window.location.href).href;
    if(navigator.clipboard && navigator.clipboard.writeText){
      navigator.clipboard.writeText(link).then(() => { status.textContent = 'Booking link copied — this opens the One-on-One Sessions page.'; })
        .catch(() => { status.textContent = 'Could not copy — the link is: ' + link; });
    } else {
      status.textContent = 'The link is: ' + link;
    }
    return;
  }
  if(action === 'preview-page'){
    window.open(new URL(BASE + 'one-on-one.html', window.location.href).href, '_blank');
    return;
  }
  if(action === 'new-appointment'){
    showBookingsTab('appointments');
    setTimeout(() => { const el = document.getElementById('adminBookName'); if(el) el.focus(); }, 50);
    return;
  }
  if(action === 'reminder'){
    status.textContent = 'Sending reminders isn\'t connected yet — this is coming later.';
    return;
  }
  const tabMap = { availability: 'availability', calendar: 'calendar', blocked: 'blocked', types: 'types', notifications: 'notifications' };
  if(tabMap[action]) showBookingsTab(tabMap[action]);
});

function showBookingsTab(name){
  document.querySelectorAll('#bookingsSubNav .admin-tab').forEach(b => b.classList.toggle('active', b.dataset.bookingsTab === name));
  document.querySelectorAll('[data-bookings-panel]').forEach(p => { p.hidden = p.dataset.bookingsPanel !== name; });
  if(name === 'overview'){ renderBookingsOverviewStats(); renderBookingsToday(); renderBookingsCalendarPreview(); renderBookingsInsights(); }
  if(name === 'calendar') renderBookingsCalendar();
  if(name === 'clients') renderBookingsClients();
  if(name === 'reports') renderBookingsReports();
  if(name === 'policies') renderBookingPolicies();
}
document.getElementById('bookingsSubNav').addEventListener('click', event => {
  const btn = event.target.closest('.admin-tab');
  if(btn) showBookingsTab(btn.dataset.bookingsTab);
});

function applyAppointmentsFilter(filter){
  const sections = { pending: 'pending', upcoming: 'upcoming', completed: 'completed', cancelled: 'cancelled' };
  document.querySelectorAll('[data-appt-section]').forEach(el => {
    const key = el.dataset.apptSection;
    el.hidden = filter !== 'all' && sections[filter] !== key;
  });
}
document.getElementById('bookingsApptFilterTabs').addEventListener('click', event => {
  const btn = event.target.closest('.admin-tab');
  if(!btn) return;
  document.querySelectorAll('#bookingsApptFilterTabs .admin-tab').forEach(b => b.classList.toggle('active', b === btn));
  applyAppointmentsFilter(btn.dataset.apptFilter);
});

let bookingsCalendarActiveView = 'week';
async function renderBookingsCalendar(){
  const wrap = document.getElementById('bookingsCalendarView');
  if(!wrap) return;
  const confirmed = await ownerAllConfirmedBookings();
  const today = new Date();
  const todayStr = today.toISOString().slice(0, 10);
  let items;
  if(bookingsCalendarActiveView === 'day'){
    items = confirmed.filter(b => b.date === todayStr);
  } else if(bookingsCalendarActiveView === 'week'){
    const dow = today.getDay();
    const start = new Date(today.getTime() - dow * 86400000).toISOString().slice(0, 10);
    const end = new Date(today.getTime() + (6 - dow) * 86400000).toISOString().slice(0, 10);
    items = confirmed.filter(b => b.date >= start && b.date <= end);
  } else {
    const monthKey = todayStr.slice(0, 7);
    items = confirmed.filter(b => b.date.slice(0, 7) === monthKey);
  }
  items = items.sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
  if(items.length === 0){ wrap.innerHTML = '<p class="admin-hint">Nothing confirmed in this view.</p>'; return; }
  const byDate = {};
  items.forEach(b => { (byDate[b.date] = byDate[b.date] || []).push(b); });
  wrap.innerHTML = Object.keys(byDate).sort().map(date => {
    const weekday = new Intl.DateTimeFormat(undefined, { weekday: 'long', month: 'short', day: 'numeric' }).format(new Date(date + 'T12:00:00'));
    const rows = byDate[date].map(b =>
      '<div class="admin-teaching-row admin-cal-row-confirmed"><div class="admin-teaching-info"><strong>' + escapeHtml(b.name) +
      (b.rescheduled ? ' <span class="admin-status-pill draft">Rescheduled</span>' : '') + '</strong>' +
      '<div class="admin-teaching-meta">' + escapeHtml(sessionTypeName(b.sessionType)) + ' · ' + escapeHtml(formatLocalDateTime(b.date, b.time, BUSINESS_TZ)) + '</div></div>' +
      '<span class="admin-status-pill published">Confirmed</span></div>'
    ).join('');
    return '<div style="margin-bottom:14px"><div class="admin-microlabel" style="margin-bottom:6px">' + weekday.toUpperCase() + '</div>' + rows + '</div>';
  }).join('');
}
document.getElementById('bookingsCalendarViewTabs').addEventListener('click', event => {
  const btn = event.target.closest('.admin-tab');
  if(!btn) return;
  document.querySelectorAll('#bookingsCalendarViewTabs .admin-tab').forEach(b => b.classList.toggle('active', b === btn));
  bookingsCalendarActiveView = btn.dataset.calView;
  renderBookingsCalendar();
});
async function renderBookingsCalendarPreview(){
  const wrap = document.getElementById('bookingsCalendarPreview');
  if(!wrap) return;
  const confirmed = await ownerAllConfirmedBookings();
  const today = new Date();
  const dow = today.getDay();
  const start = new Date(today.getTime() - dow * 86400000).toISOString().slice(0, 10);
  const end = new Date(today.getTime() + (6 - dow) * 86400000).toISOString().slice(0, 10);
  const items = confirmed.filter(b => b.date >= start && b.date <= end).sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time)).slice(0, 4);
  wrap.innerHTML = items.length === 0
    ? '<p class="admin-hint">No confirmed appointments this week.</p>'
    : items.map(b => '<div class="admin-teaching-row admin-cal-row-confirmed"><div class="admin-teaching-info"><strong>' + escapeHtml(b.name) +
        '</strong><div class="admin-teaching-meta">' + escapeHtml(sessionTypeName(b.sessionType)) + ' · ' + escapeHtml(formatLocalDateTime(b.date, b.time, BUSINESS_TZ)) +
        '</div></div><span class="admin-status-pill published">Confirmed</span></div>').join('');
}
async function renderBookingsInsights(){
  const wrap = document.getElementById('bookingsInsights');
  if(!wrap) return;
  const all = await ownerAllBookingsEverything();
  if(all.length === 0){ wrap.innerHTML = '<p class="admin-hint">Not enough booking activity yet for insights.</p>'; return; }
  const counts = {};
  all.forEach(b => { counts[b.sessionType] = (counts[b.sessionType] || 0) + 1; });
  const topId = Object.keys(counts).sort((a, b) => counts[b] - counts[a])[0];
  const confirmedCount = all.filter(b => b.status === 'confirmed').length;
  const completionRate = all.length ? Math.round((confirmedCount / all.length) * 100) : 0;
  wrap.innerHTML =
    '<p class="admin-hint" style="margin-bottom:8px">Most requested: <strong style="color:var(--owner-text)">' + escapeHtml(sessionTypeName(topId)) + '</strong></p>' +
    '<p class="admin-hint">' + completionRate + '% of requests have been confirmed (' + confirmedCount + ' of ' + all.length + ').</p>';
}

function renderBookingPolicies(){
  const terms = BOOKING_POLICIES.terms || {};
  const noRefund = BOOKING_POLICIES.noRefund || {};
  document.getElementById('policyTermsTitle').value = terms.title || '';
  document.getElementById('policyTermsText').value = terms.text || '';
  document.getElementById('policyTermsActive').checked = terms.active !== false;
  document.getElementById('policyTermsUpdated').textContent = terms.lastUpdated ? 'Last updated ' + terms.lastUpdated : 'Not saved yet.';
  document.getElementById('policyNoRefundTitle').value = noRefund.title || '';
  document.getElementById('policyNoRefundText').value = noRefund.text || '';
  document.getElementById('policyNoRefundActive').checked = noRefund.active !== false;
  document.getElementById('policyNoRefundUpdated').textContent = noRefund.lastUpdated ? 'Last updated ' + noRefund.lastUpdated : 'Not saved yet.';
}
async function saveBookingPolicy(key, idPrefix){
  const status = document.getElementById(idPrefix + 'Status');
  const title = document.getElementById(idPrefix + 'Title').value.trim();
  const text = document.getElementById(idPrefix + 'Text').value.trim();
  const active = document.getElementById(idPrefix + 'Active').checked;
  if(!title || !text){ status.textContent = 'Both a title and policy text are required.'; return; }
  const lastUpdated = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(new Date());
  const data = { title, text, active, lastUpdated };
  status.textContent = 'Saving…';
  if(DEMO_MODE){
    BOOKING_POLICIES[key] = data;
    saveBookingsPreviewToStorage();
  } else {
    try { await setDoc(doc(db, 'bookingPolicies', key), data); }
    catch (err) { status.textContent = 'Could not save that policy.'; return; }
  }
  renderBookingPolicies();
  status.textContent = SCHED_SAVE_NOTE;
}
document.getElementById('policyTermsSaveBtn').addEventListener('click', () => saveBookingPolicy('terms', 'policyTerms'));
document.getElementById('policyNoRefundSaveBtn').addEventListener('click', () => saveBookingPolicy('noRefund', 'policyNoRefund'));

function renderBookingsNotifications(){
  const n = SCHEDULING_SETTINGS.notifications || {};
  document.getElementById('bookingsNotifyConfirmation').checked = n.confirmation !== false;
  document.getElementById('bookingsNotifyReminder24').checked = n.reminder24 !== false;
  document.getElementById('bookingsNotifyReminder1').checked = n.reminder1 !== false;
  document.getElementById('bookingsNotifyCancellation').checked = n.cancellation !== false;
  document.getElementById('bookingsNotifyReschedule').checked = n.reschedule !== false;
}
document.getElementById('bookingsNotifySaveBtn').addEventListener('click', async () => {
  const status = document.getElementById('bookingsNotifyStatus');
  const notifications = {
    confirmation: document.getElementById('bookingsNotifyConfirmation').checked,
    reminder24: document.getElementById('bookingsNotifyReminder24').checked,
    reminder1: document.getElementById('bookingsNotifyReminder1').checked,
    cancellation: document.getElementById('bookingsNotifyCancellation').checked,
    reschedule: document.getElementById('bookingsNotifyReschedule').checked
  };
  const updated = { ...SCHEDULING_SETTINGS, notifications };
  status.textContent = 'Saving…';
  if(DEMO_MODE){
    SCHEDULING_SETTINGS = updated;
    saveBookingsPreviewToStorage();
  } else {
    try { await setDoc(doc(db, 'schedulingSettings', 'global'), updated); await loadSchedulingConfig(); }
    catch (err) { status.textContent = 'Could not save.'; return; }
  }
  status.textContent = SCHED_SAVE_NOTE;
});

async function ownerAllBookingsEverything(){
  if(DEMO_MODE) return DEMO_BOOKINGS;
  try {
    const snap = await getDocs(collection(db, 'bookings'));
    const items = [];
    snap.forEach(docSnap => items.push({ id: docSnap.id, ...docSnap.data() }));
    return items;
  } catch (err) { return []; }
}
async function renderBookingsClients(){
  const wrap = document.getElementById('bookingsClientsList');
  if(!wrap) return;
  const all = await ownerAllBookingsEverything();
  const byEmail = {};
  all.forEach(b => {
    if(!b.email) return;
    const key = b.email.toLowerCase();
    if(!byEmail[key]) byEmail[key] = { name: b.name, email: b.email, phone: b.phone, count: 0, lastDate: '' };
    byEmail[key].count += 1;
    if(b.date > byEmail[key].lastDate) byEmail[key].lastDate = b.date;
  });
  const clients = Object.values(byEmail).sort((a, b) => b.count - a.count);
  wrap.innerHTML = clients.length === 0 ? '<p class="admin-hint">No one has booked a session yet.</p>' : clients.map(c =>
    '<div class="admin-teaching-row"><div class="admin-teaching-info"><strong>' + escapeHtml(c.name || 'Unnamed') + '</strong>' +
    '<div class="admin-teaching-meta">' + escapeHtml(c.email) + (c.phone ? ' · ' + escapeHtml(c.phone) : '') + ' · Most recent: ' + escapeHtml(c.lastDate ? formatTeachingDate(c.lastDate) : '—') + '</div></div>' +
    '<span class="admin-status-pill published">' + c.count + (c.count === 1 ? ' Session' : ' Sessions') + '</span></div>'
  ).join('');
}
async function renderBookingsReports(){
  const statsWrap = document.getElementById('bookingsReportsStats');
  const typesWrap = document.getElementById('bookingsReportsTypes');
  if(!statsWrap) return;
  const all = await ownerAllBookingsEverything();
  const total = all.length;
  const confirmed = all.filter(b => b.status === 'confirmed').length;
  const pending = all.filter(b => b.status === 'pending').length;
  const cancelled = all.filter(b => b.status === 'declined' || b.status === 'cancelled').length;
  statsWrap.innerHTML =
    '<div class="admin-stat-tile"><span>Total Bookings</span><strong>' + total + '</strong></div>' +
    '<div class="admin-stat-tile"><span>Confirmed</span><strong>' + confirmed + '</strong></div>' +
    '<div class="admin-stat-tile"><span>Pending</span><strong>' + pending + '</strong></div>' +
    '<div class="admin-stat-tile"><span>Cancelled / Declined</span><strong>' + cancelled + '</strong></div>';
  const counts = {};
  all.forEach(b => { counts[b.sessionType] = (counts[b.sessionType] || 0) + 1; });
  const rows = Object.keys(counts).sort((a, b) => counts[b] - counts[a]);
  typesWrap.innerHTML = rows.length === 0 ? '<p class="admin-hint">No bookings yet.</p>' : rows.map(id =>
    '<div class="admin-teaching-row"><div class="admin-teaching-info"><strong>' + escapeHtml(sessionTypeName(id)) + '</strong></div>' +
    '<span class="admin-status-pill published">' + counts[id] + (counts[id] === 1 ? ' Booking' : ' Bookings') + '</span></div>'
  ).join('');
}

function renderBookingsPanels(){
  if(!document.getElementById('bookingsSubNav')) return;
  renderBookingsOverviewStats();
  renderBookingsToday();
  renderBookingsCalendarPreview();
  renderBookingsInsights();
  loadOwnerCompleted();
  loadOwnerCancelled();
  renderBookingsNotifications();
  applyAppointmentsFilter('all');
}

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
      saveBookingsPreviewToStorage();
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
      saveBookingsPreviewToStorage();
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
function wireAdminImageField(fieldId, previewId, fileId, removeId, label, maxDim, categoryFieldId){
  const input = document.getElementById(fieldId);
  const preview = document.getElementById(previewId);
  const fileInput = document.getElementById(fileId);
  const removeBtn = document.getElementById(removeId);
  if(!input || !preview || !fileInput || !removeBtn) return;
  const uploadLabel = fileInput.closest('label');
  const uploadLabelText = uploadLabel ? uploadLabel.querySelector('.admin-image-upload-btn-text') : null;
  function refresh(){
    const val = input.value.trim();
    preview.className = preview.className.replace(/\bteaching-art-\S+/g, '').trim();
    if(val){
      preview.style.backgroundImage = "url('" + val.replace(/'/g, "%27") + "')";
      preview.innerHTML = '';
    } else {
      preview.style.backgroundImage = '';
      const category = categoryFieldId && document.getElementById(categoryFieldId) ? document.getElementById(categoryFieldId).value : '';
      if(categoryFieldId) preview.classList.add(teachingArtClass(category));
      preview.innerHTML = '<span class="admin-image-empty">Drop an image here, or use Upload</span>';
    }
    if(uploadLabelText) uploadLabelText.textContent = val ? 'Replace Image' : 'Upload Image';
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
wireAdminImageField('teachingEditArtHero', 'teachingEditArtHeroPreview', 'teachingEditArtHeroFile', 'teachingEditArtHeroRemove', 'Hero', 1600, 'teachingEditCategory');
wireAdminImageField('teachingEditArtCard', 'teachingEditArtCardPreview', 'teachingEditArtCardFile', 'teachingEditArtCardRemove', 'Card', 1200, 'teachingEditCategory');
wireAdminImageField('teachingEditArtHeroMobile', 'teachingEditArtHeroMobilePreview', 'teachingEditArtHeroMobileFile', 'teachingEditArtHeroMobileRemove', 'Mobile', 1000, 'teachingEditCategory');
wireAdminImageField('teachingSettingsScriptureImage', 'teachingSettingsScriptureImagePreview', 'teachingSettingsScriptureImageFile', 'teachingSettingsScriptureImageRemove', 'Scripture', 1400);
wireAdminImageField('schedTypeImage', 'schedTypeImagePreview', 'schedTypeImageFile', 'schedTypeImageRemove', 'SessionType', 1200);
document.getElementById('teachingEditCategory').addEventListener('input', () => adminImagePreviewRefreshers.forEach(fn => fn()));

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
  if(!confirm('Reset all preview Teaching data in this browser back to the original samples? This also removes any uploaded Media Library images and your profile photo. This cannot be undone.')) return;
  resetPreviewData();
  renderTeachingManager();
  renderPublicTeachingPages();
  renderOwnerMediaGallery();
  renderOwnerProfilePhotoPreview();
  updateOwnerSidebarProfile();
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
  if(c.includes('dream')) return 'teaching-art-dreams';
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
  } else if(page === 'one-on-one'){
    renderOneOnOnePage();
  }
}
renderPublicTeachingPages();

/* ---------------------------------------------------------------
   One-on-One Sessions — public selection page. Renders a card per
   active session type (the SAME `SESSION_TYPES` the Owner manages in
   Bookings → Session Types — nothing here is a separate data source),
   with a search box and Format/Time pill filters. "Select" reuses the
   site's existing `.book-session` + `openBooking(service)` mechanism,
   so it opens the exact same booking dialog everywhere else on the
   site already uses — this page is a nicer front door to it, not a
   second checkout system.
   --------------------------------------------------------------- */
function oneOnOneCardHtml(t){
  const artClass = t.imageUrl ? '' : teachingArtClass(t.name);
  const imageStyle = t.imageUrl ? ' style="background-image:url(\'' + t.imageUrl.replace(/'/g, '%27') + '\')"' : '';
  return '<article class="oneonone-card">' +
    '<div class="oneonone-card-image ' + artClass + '"' + imageStyle + '></div>' +
    '<div class="oneonone-card-body">' +
    '<h3 class="oneonone-card-name">' + escapeHtml(t.name) + '</h3>' +
    '<div class="oneonone-card-meta"><span>' + t.durationMinutes + ' Minutes</span></div>' +
    '<p class="oneonone-card-desc">' + escapeHtml(t.description || '') + '</p>' +
    '<div class="oneonone-card-footer">' +
    '<div class="oneonone-card-price">' + (t.price ? '$' + Number(t.price).toFixed(0) : 'Free') + (t.price ? '<small> one-time</small>' : '') + '</div>' +
    '<button type="button" class="oneonone-select-btn book-session" data-service="' + escapeHtml(t.id) + '">Select</button>' +
    '</div></div></article>';
}
// Only 15-Minute and 30-Minute One-on-One are active public options right
// now — this renders whatever is marked Active in Owner → Bookings →
// Session Types, so it stays correct automatically if that ever changes,
// without a second list of session types to keep in sync.
function renderOneOnOneCards(){
  const wrap = document.getElementById('oneOnOneCardsList');
  const empty = document.getElementById('oneOnOneEmptyState');
  if(!wrap) return;
  const types = Object.keys(SESSION_TYPES)
    .map(id => ({ id, ...SESSION_TYPES[id] }))
    .filter(t => t.active !== false)
    .sort((a, b) => (a.order || 0) - (b.order || 0));
  wrap.innerHTML = types.map(oneOnOneCardHtml).join('');
  if(empty) empty.hidden = types.length > 0;
}
function renderOneOnOnePage(){
  renderOneOnOneCards();
  // Deep link from Owner → Session Types → "Copy Link" (?service=30-minute)
  // opens straight to that session's booking dialog, pre-selected.
  const params = new URLSearchParams(window.location.search);
  const preselect = params.get('service');
  if(preselect && SESSION_TYPES[preselect] && window.openBooking) window.openBooking(preselect);
}

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
