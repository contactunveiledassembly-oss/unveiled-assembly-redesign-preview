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
  onAuthStateChanged, signOut, updateProfile
} from "https://www.gstatic.com/firebasejs/10.13.2/firebase-auth.js";
import {
  getFirestore, doc, setDoc, getDoc, collection, query, where,
  getDocs, updateDoc, deleteDoc, serverTimestamp, runTransaction
} from "https://www.gstatic.com/firebasejs/10.13.2/firebase-firestore.js";

/* ---------------------------------------------------------------
   Shared markup injection
   --------------------------------------------------------------- */
const NAV_LINKS = [
  { page: 'story', href: 'story.html', label: 'Story' },
  { page: 'beliefs', href: 'beliefs.html', label: 'Beliefs' },
  { page: 'gather', href: 'gather.html', label: 'Gather' },
  { page: 'teachings', href: 'teachings.html', label: 'Teachings' },
  { page: 'prayer', href: 'prayer.html', label: 'Prayer' },
  { page: 'connect', href: 'connect.html', label: 'Connect' },
];

function navHtml(){
  const links = NAV_LINKS.map(l => `<a href="${l.href}" data-page="${l.page}">${l.label}</a>`).join('');
  return `
  <nav class="nav" id="nav">
    <a href="index.html" class="brand" aria-label="The Unveiled Assembly home">
      <span class="brand-badge"><img class="brand-logo" src="assets/ua-logo-tight.png" alt="Unveiled Assembly logo" /></span>
      <span class="brand-text"><span class="line1">The Unveiled</span><span class="line2">Assembly of Christ Jesus</span></span>
    </a>
    <div class="links" id="links">${links}</div>
    <div class="nav-right">
      <div class="nav-controls">
        <button class="icon-btn" id="navMemberPortal" type="button" aria-label="Member account">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/></svg>
        </button>
        <button class="cart-btn" id="cartBtn" type="button" title="Shop — coming soon" aria-disabled="true">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" style="width:14px;height:14px"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.6 13.4a2 2 0 0 0 2 1.6h9.8a2 2 0 0 0 2-1.6L23 6H6"/></svg>
          <span>Cart 0</span>
        </button>
      </div>
      <button class="menu-btn" id="menuBtn" type="button" aria-label="Open menu" aria-expanded="false" aria-controls="links">☰</button>
    </div>
  </nav>`;
}

function footerHtml(){
  return `
  <footer id="site-footer">
    <div class="footer-top">
      <div>
        <div class="footer-wordmark">THE<br>UNVEILED<br>ASSEMBLY</div>
      </div>
      <div class="footer-identity">
        <p>Christ Revealed.<br>A People Unveiled.</p>
        <div class="copyright">© ${new Date().getFullYear()} The Unveiled Assembly of Christ Jesus</div>
      </div>
      <div class="footer-links">
        <a href="story.html">Story</a>
        <a href="beliefs.html">Beliefs</a>
        <a href="prayer.html">Prayer</a>
        <a href="connect.html">Contact</a>
        <a href="https://www.instagram.com/unveiledassembly?igsi=Y2RhZXdmcTRneHJn&amp;utm_source=qr" target="_blank" rel="noopener noreferrer">Instagram</a>
        <a href="#" aria-disabled="true" title="Coming soon">TikTok</a>
      </div>
    </div>
    <div class="footer-bottom">Preview build — not the live site</div>
  </footer>`;
}

function dialogsHtml(){
  return `
  <dialog class="portal-dialog" id="memberPortalDialog" aria-label="My Assembly">
    <div class="portal-bar">
      <div class="portal-brand">
        <img src="assets/ua-logo-tight.png" alt="" />
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
          <h4>Enter My Assembly</h4>
          <p>Students and ministry participants use one private account.</p>
          <form id="portalLoginForm">
            <div class="portal-field" id="portalNameField" hidden>
              <label for="portalName">Full name</label>
              <input id="portalName" type="text" placeholder="First and last name" autocomplete="name" />
            </div>
            <div class="portal-field">
              <label for="portalEmail">Email address</label>
              <input id="portalEmail" type="email" placeholder="you@example.com" autocomplete="email" required />
            </div>
            <div class="portal-field">
              <label for="portalPassword">Password</label>
              <input id="portalPassword" type="password" placeholder="Enter your password" autocomplete="current-password" minlength="6" required />
            </div>
            <div class="portal-actions">
              <button class="portal-primary" type="submit" id="portalSignInBtn">Sign In</button>
              <button class="portal-secondary" id="portalCreateAccount" type="button">Create an Account</button>
            </div>
          </form>
          <div class="portal-status" id="portalLoginStatus" role="status" aria-live="polite"></div>
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
  const match = document.querySelector('.links a[data-page="' + currentPage + '"]');
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
links.querySelectorAll('a').forEach(a => a.addEventListener('click', () => setMenuOpen(false)));

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
const portalLoginForm = document.getElementById('portalLoginForm');
const portalNameInput = document.getElementById('portalName');
const portalEmailInput = document.getElementById('portalEmail');
const portalPasswordInput = document.getElementById('portalPassword');
const portalSignInBtn = document.getElementById('portalSignInBtn');
const portalCreateAccountBtn = document.getElementById('portalCreateAccount');
const portalNameField = document.getElementById('portalNameField');

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

function openPortal(){
  setMenuOpen(false);
  refreshPortalTabs();
  if(currentUser && currentProfile){
    showPortalView(currentProfile.role === 'admin' ? 'owner' : 'member');
    loadMemberBookings();
    if(currentProfile.role === 'admin') loadOwnerData();
  } else {
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

portalLoginForm.addEventListener('submit', async event => {
  event.preventDefault();
  portalLoginStatus.textContent = 'Signing in…';
  portalSignInBtn.disabled = true;
  try {
    await signInWithEmailAndPassword(auth, portalEmailInput.value.trim(), portalPasswordInput.value);
    portalLoginStatus.textContent = '';
    portalLoginForm.reset();
    portalNameField.hidden = true;
  } catch (err) {
    portalLoginStatus.textContent = friendlyAuthError(err);
  } finally {
    portalSignInBtn.disabled = false;
  }
});

portalCreateAccountBtn.addEventListener('click', async () => {
  if(portalNameField.hidden){
    portalNameField.hidden = false;
    portalNameInput.focus();
    portalLoginStatus.textContent = 'Enter your name, then click Create an Account again.';
    return;
  }
  const name = portalNameInput.value.trim();
  const email = portalEmailInput.value.trim();
  const password = portalPasswordInput.value;
  if(!name){ portalLoginStatus.textContent = 'Enter your full name to create an account.'; portalNameInput.focus(); return; }
  if(!email || !password){ portalLoginStatus.textContent = 'Enter an email and password to create an account.'; return; }
  if(password.length < 6){ portalLoginStatus.textContent = 'Password should be at least 6 characters.'; return; }
  portalLoginStatus.textContent = 'Creating your account…';
  portalCreateAccountBtn.disabled = true;
  try {
    const cred = await createUserWithEmailAndPassword(auth, email, password);
    await updateProfile(cred.user, { displayName: name });
    const role = email.toLowerCase() === ADMIN_EMAIL ? 'admin' : 'member';
    await setDoc(doc(db, 'users', cred.user.uid), { name, email, role, createdAt: serverTimestamp() });
    portalLoginStatus.textContent = '';
    portalLoginForm.reset();
    portalNameField.hidden = true;
  } catch (err) {
    portalLoginStatus.textContent = friendlyAuthError(err);
  } finally {
    portalCreateAccountBtn.disabled = false;
  }
});

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
  } else {
    currentProfile = null;
  }
  refreshPortalTabs();
  if(memberPortalDialog.open){
    if(currentUser && currentProfile){
      showPortalView(currentProfile.role === 'admin' ? 'owner' : 'member');
      loadMemberBookings();
      if(currentProfile.role === 'admin') loadOwnerData();
    } else {
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
