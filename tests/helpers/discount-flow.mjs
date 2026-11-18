// Shared steps for the discount browser tests (Preview / DEMO_MODE —
// localhost only, sample data in the browser, no real database).
//
// The original discount tests were written on 2026-10-07 against an
// older page layout: the Owner Portal opened without signing in and the
// discount box sat on the One-on-One page itself. Since then the site
// requires the owner to sign in for the Owner Portal, and a session is
// booked through the step-by-step flow (session → date → time →
// Details & Payment). These helpers drive that real, current flow so
// the tests check the same discount behavior through the UI a member
// actually uses.
export const BASE_URL = process.env.TEST_BASE_URL || 'http://localhost:8080';
export const OWNER_EMAIL = 'contactunveiledassembly@gmail.com';
export const MEMBER_EMAIL = 'maya.member@example.com';

export async function signIn(page, email, path = '/one-on-one.html'){
  await page.goto(BASE_URL + path, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#memberPortalDialog', { state: 'attached' });
  await page.evaluate(() => {
    const d = document.querySelector('#memberPortalDialog');
    if(!d.open) d.showModal();
    document.querySelectorAll('.portal-view').forEach(v => { v.hidden = v.dataset.portalView !== 'prospect'; });
  });
  await page.fill('#signinEmail', email);
  await page.fill('#signinPassword', 'preview-only-123');
  await page.locator('#emailSignInForm').evaluate(f => f.requestSubmit());
  if(email === OWNER_EMAIL) await page.waitForSelector('#ownerSummaryCards .owner-summary-card', { timeout: 15000 });
  else {
    await page.waitForFunction(() => document.getElementById('memberAccountLabel')?.textContent === 'Student Account', null, { timeout: 15000 });
    await closePortal(page);
  }
}

export async function closePortal(page){
  await page.evaluate(() => { const d = document.querySelector('#memberPortalDialog'); if(d?.open) d.close(); });
}

// Owner Portal → Website → page list. Uses the sidebar like the owner would.
export async function openOwnerWebsite(page){
  await openOwnerPortal(page);
  await page.locator('[data-owner-nav="website"]').first().evaluate(el => el.click());
  await page.locator('[data-site-page="One-on-One Page"]').waitFor({ state: 'visible' });
}

// Opens the account window the way the owner does (any "Account" button).
export async function openOwnerPortal(page){
  if(await page.evaluate(() => document.querySelector('#memberPortalDialog')?.open)) return;
  await page.locator('#navMemberPortal').evaluate(el => el.click());
  await page.waitForSelector('#ownerSummaryCards .owner-summary-card', { timeout: 15000 });
}

// Owner Portal → Payments, where the Discount Codes manager lives.
export async function openOwnerDiscounts(page){
  await openOwnerPortal(page);
  await page.locator('[data-owner-nav="payments"]').first().evaluate(el => el.click());
  await page.locator('#ownerDiscountCode').waitFor({ state: 'visible' });
}

export async function createDiscountCode(page, { code, amount = '20', type = 'percent', scope = 'both', maxUses = '', expiresAt = '' }){
  await openOwnerDiscounts(page);
  await page.locator('#ownerDiscountCode').fill(code);
  await page.locator('#ownerDiscountType').selectOption(type);
  await page.locator('#ownerDiscountAmount').fill(String(amount));
  await page.locator('#ownerDiscountScope').selectOption(scope);
  await page.locator('#ownerDiscountMaxUses').fill(String(maxUses));
  const expires = page.locator('#ownerDiscountExpiry');
  if(await expires.count()) await expires.fill(expiresAt);
  await page.locator('#ownerDiscountCodeForm').evaluate(form => form.requestSubmit());
  await page.waitForFunction(c => document.querySelector('#ownerDiscountCodeStatus')?.textContent.includes('ready to use') &&
    document.querySelector('#ownerDiscountCodesList')?.textContent.includes(c), code);
}

// Each Playwright page in one browser context shares localStorage, which
// is how the Preview stands in for "two customers at the same time".
// The site's one-minute anti-spam cooldown is per browser; a second real
// customer would be on their own device, so tests clear it between them.
export async function asSeparateCustomer(page){
  await page.evaluate(() => { localStorage.removeItem('lastBookingSubmit'); localStorage.removeItem('lastTeachingRegisterSubmit'); });
}

// One-on-One page: pick the 30-minute session, the first open date and
// the time at `timeIndex`, then continue to Details & Payment.
export async function openBookingDetails(page, { timeIndex = 0, reload = true } = {}){
  if(reload) await page.goto(BASE_URL + '/one-on-one.html', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#bookingCalendarGrid', { state: 'attached' });
  await closePortal(page);
  await page.locator('input[name="sessionType"][value="30-minute"]').check();
  for(let i = 0; i < 4; i++){
    const open = page.locator('#bookingCalendarGrid [data-calendar-date]:not([disabled])');
    if(await open.count()){ await open.first().click(); break; }
    await page.locator('#bookingCalendarNext').click();
  }
  await page.waitForFunction(n => document.querySelectorAll('#bookingTimeButtons .booking-time-btn').length > n, timeIndex);
  const time = await page.locator('#bookingTimeButtons .booking-time-btn').nth(timeIndex).getAttribute('data-time');
  await page.locator('#bookingTimeButtons .booking-time-btn').nth(timeIndex).click();
  await page.locator('#oneOnOneContinueBtn').click();
  await page.locator('#bookingDialog [data-booking-step="details"]').waitFor({ state: 'visible' });
  await page.locator('#bookingName').fill('Test Customer');
  await page.locator('#bookingEmail').fill('test+' + Date.now() + '@example.com');
  await page.locator('#bookingPhoneNumber').fill('5555550123');
  await page.locator('#bookingReason').fill('Prayer and guidance (test booking).');
  await page.locator('#bookingAgreeTerms').check();
  await page.locator('#bookingAgreeNoRefund').check();
  return time;
}

export async function applyBookingCode(page, code){
  await page.locator('#bookingDiscountCode').fill(code);
  await page.locator('#bookingDiscountApply').click();
  await page.waitForFunction(() => {
    const t = document.querySelector('#bookingDiscountStatus')?.textContent || '';
    return t && t !== 'Checking code…';
  });
  return page.locator('#bookingDiscountStatus').textContent();
}

export async function submitBooking(page){
  await page.locator('#bookingForm').evaluate(form => form.requestSubmit());
}

export async function waitForBookingConfirmed(page){
  await page.waitForFunction(() => document.querySelector('#bookingConfirmId')?.textContent.length > 0 &&
    !document.querySelector('#bookingDialog [data-booking-step="confirm"]')?.hidden, null, { timeout: 10000 });
}

// The owner's stored copy of a code (usedCount etc.), read from the
// Preview's browser storage — the same place the Owner Portal list reads.
export async function storedCode(page, code){
  return page.evaluate(c => (JSON.parse(localStorage.getItem('uaDiscountCodes') || '[]')).find(x => x.code === c) || null, code);
}

// The booking just confirmed on this page, as saved (what checkout and
// the Owner Portal read): its total after any discount, and the code.
export async function confirmedBooking(page){
  return page.evaluate(() => {
    const id = document.querySelector('#bookingConfirmId')?.textContent;
    const list = JSON.parse(localStorage.getItem('ua_preview_bookings_v1') || '[]');
    return list.find(b => b.confirmationId === id) || null;
  });
}
