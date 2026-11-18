// Discount claim lifecycle in the browser (Preview / DEMO_MODE on
// localhost — sample data in browser storage, no real database).
//   python3 -m http.server 8080 &  node tests/discount-claim-lifecycle.mjs
//
// History: first written 2026-10-07 and marked "UNVERIFIED — has never
// been run". When it was finally run it failed on old assumptions
// (Owner Portal open without signing in, discount box on the page
// itself, separate browser contexts sharing Preview data, and
// monkeypatching a function that isn't on window). Rewritten
// 2026-11-18 to drive the current flow; every original scenario is
// kept, plus regression checks for the bugs found while doing so.
//
// How "two customers" work here: pages in ONE browser context share the
// Preview's storage (the Preview's stand-in for the shared database),
// so each customer is a separate page. The live site's real race
// safety is the Firestore transaction + rules, which
// tests/discount-rules-emulator.mjs checks against the emulator.
import { chromium } from '/Users/yaunahlove/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
import assert from 'node:assert/strict';
import {
  BASE_URL, OWNER_EMAIL, MEMBER_EMAIL, signIn, createDiscountCode, openOwnerDiscounts, openBookingDetails,
  applyBookingCode, submitBooking, waitForBookingConfirmed, asSeparateCustomer, storedCode, confirmedBooking
} from './helpers/discount-flow.mjs';

const browser = await chromium.launch({ headless: true });
const results = [];

// A fresh Preview (own storage) with the owner signed in on one page.
async function freshPreview(){
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const errors = [];
  const newPage = async () => {
    const p = await context.newPage();
    p.on('pageerror', e => errors.push(e.message));
    p.on('dialog', d => d.accept());
    return p;
  };
  const owner = await newPage();
  await owner.goto(BASE_URL + '/one-on-one.html', { waitUntil: 'domcontentloaded' });
  await owner.evaluate(() => localStorage.clear());
  await signIn(owner, OWNER_EMAIL);
  // A member page: signs the shared Preview session in as the member.
  const customer = async () => {
    const p = await newPage();
    await signIn(p, MEMBER_EMAIL);
    await asSeparateCustomer(p);
    return p;
  };
  // A second customer opened from the first one's window. Separate tabs
  // can see each other's Preview storage a moment late; a window opened
  // from another shares its browser process, so storage reads and writes
  // happen strictly one after another, like the live database's
  // transactions. (The live race guarantee itself is checked against
  // the emulator in tests/discount-rules-emulator.mjs.)
  const secondCustomer = async first => {
    const [p] = await Promise.all([context.waitForEvent('page'), first.evaluate(u => { window.open(u, '_blank'); }, BASE_URL + '/one-on-one.html')]);
    p.on('pageerror', e => errors.push(e.message));
    p.on('dialog', d => d.accept());
    await p.waitForLoadState('domcontentloaded');
    return p;
  };
  return { context, owner, customer, secondCustomer, errors };
}
async function scenario(name, run){
  let ctx;
  try {
    ctx = await freshPreview();
    await run(ctx);
    if(ctx.errors.length) throw new Error('page errors: ' + ctx.errors.join('; '));
    results.push('PASS ' + name);
  } catch (err) {
    results.push('FAIL ' + name + ' — ' + String(err && err.message || err).split('\n')[0]);
  } finally {
    if(ctx) await ctx.context.close();
  }
}
const confirmPayment = p => p.locator('#bookingConfirmPayment').textContent();
// The confirmation screen shows the payment status, not the amount, so
// the amount is checked on the saved booking (what checkout charges from).
const bookedTotal = async p => (await confirmedBooking(p)).totalAfterDiscount;
const priceChangeShown = p => p.locator('#bookingPriceChangeConfirm').evaluate(el => !el.hidden);

// ---- 1. Successful limited-use claim and confirmation ----------------
await scenario('1 successful limited-use claim', async ({ owner, customer }) => {
  await createDiscountCode(owner, { code: 'LIFECYCLE1', maxUses: 1 });
  const a = await customer();
  await openBookingDetails(a);
  assert.match(await applyBookingCode(a, 'LIFECYCLE1'), /applied/);
  await submitBooking(a);
  await waitForBookingConfirmed(a);
  assert.equal(await bookedTotal(a), 40);
  assert.doesNotMatch(await confirmPayment(a), /usage limit/);
  assert.equal((await storedCode(a, 'LIFECYCLE1')).usedCount, 1);
});

// ---- 2. Code reaches its limit between Apply and submit ---------------
await scenario('2 code already at its limit when submitted', async ({ owner, customer }) => {
  await createDiscountCode(owner, { code: 'LIFECYCLE2', maxUses: 1 });
  const a = await customer(); const b = await customer();
  await openBookingDetails(a, { timeIndex: 0 });
  await openBookingDetails(b, { timeIndex: 1 });
  assert.match(await applyBookingCode(a, 'LIFECYCLE2'), /applied/);
  assert.match(await applyBookingCode(b, 'LIFECYCLE2'), /applied/);
  await submitBooking(a); await waitForBookingConfirmed(a);
  assert.equal(await bookedTotal(a), 40);
  await asSeparateCustomer(b);
  await submitBooking(b);
  await b.waitForFunction(() => !document.querySelector('#bookingPriceChangeConfirm')?.hidden, null, { timeout: 10000 });
  const msg = await b.locator('#bookingPriceChangeMessage').textContent();
  assert.match(msg, /usage limit/);
  assert.match(msg, /\$40.*\$50|\$50.*\$40/s);
  // Go Back creates nothing for B.
  await b.locator('#bookingPriceChangeBackBtn').click();
  assert.equal(await b.locator('#bookingConfirmId').textContent(), '');
  assert.match(await b.locator('#bookingStatus').textContent(), /not submitted/);
  assert.equal((await storedCode(b, 'LIFECYCLE2')).usedCount, 1);
});

// ---- 3. Two attempts submitted at the same moment --------------------
await scenario('3 two simultaneous attempts: exactly one discounted', async ({ owner, customer, secondCustomer }) => {
  await createDiscountCode(owner, { code: 'RACE1', maxUses: 1 });
  const a = await customer(); const b = await secondCustomer(a);
  await openBookingDetails(a, { timeIndex: 0 });
  await openBookingDetails(b, { timeIndex: 1 });
  await applyBookingCode(a, 'RACE1'); await applyBookingCode(b, 'RACE1');
  await asSeparateCustomer(a);
  // Both submits start in the same instant (one script, back to back),
  // before either booking finishes — the tightest race a browser allows.
  await b.evaluate(() => {
    window.opener.document.getElementById('bookingForm').requestSubmit();
    document.getElementById('bookingForm').requestSubmit();
  });
  async function outcome(p){
    await p.waitForFunction(() => document.querySelector('#bookingConfirmId')?.textContent.length > 0 ||
      !document.querySelector('#bookingPriceChangeConfirm')?.hidden, null, { timeout: 10000 });
    if(await priceChangeShown(p)) return 'lost';
    return (await bookedTotal(p)) === 40 ? 'discounted' : 'full';
  }
  const [oa, ob] = await Promise.all([outcome(a), outcome(b)]);
  assert.equal([oa, ob].filter(o => o === 'discounted').length, 1, JSON.stringify({ oa, ob }));
  // The other one is waiting at the price-change prompt, not booked at a higher price.
  assert.equal(oa === 'discounted' ? ob : oa, 'lost');
  assert.equal((await storedCode(a, 'RACE1')).usedCount, 1);
});

// ---- 4. A booking that fails after its claim gives the use back -------
// Forced the realistic way: B is on the same time as A; A books it
// first, so B's booking fails "slot taken" after B's claim succeeded.
await scenario('4 failed booking releases its claim', async ({ owner, customer }) => {
  await createDiscountCode(owner, { code: 'RELEASE1', maxUses: 1 });
  const a = await customer(); const b = await customer();
  await openBookingDetails(b, { timeIndex: 0 });
  await openBookingDetails(a, { timeIndex: 0 });
  await submitBooking(a); await waitForBookingConfirmed(a);       // A books the time, no code
  assert.match(await applyBookingCode(b, 'RELEASE1'), /applied/);
  await asSeparateCustomer(b);
  await submitBooking(b);
  await b.waitForFunction(() => document.querySelector('#bookingStatus')?.textContent.includes('just taken'), null, { timeout: 10000 });
  assert.equal((await storedCode(b, 'RELEASE1')).usedCount, 0);
  assert.deepEqual((await storedCode(b, 'RELEASE1')).redeemedSourceIds, []);
  // A second attempt still finds the code available.
  await openBookingDetails(b, { timeIndex: 1 });
  assert.match(await applyBookingCode(b, 'RELEASE1'), /applied/);
});

// ---- 5. A confirmed redemption stays counted --------------------------
// (Direct tampering with a confirmed ticket is a database-rules matter:
// see tests/discount-rules-emulator.mjs.)
await scenario('5 confirmed redemption stays counted', async ({ owner, customer }) => {
  await createDiscountCode(owner, { code: 'LOCKED1', maxUses: 5 });
  const a = await customer();
  await openBookingDetails(a);
  await applyBookingCode(a, 'LOCKED1');
  await submitBooking(a); await waitForBookingConfirmed(a);
  await a.locator('#bookingConfirmCloseBtn').click();
  await a.reload({ waitUntil: 'domcontentloaded' });
  const stored = await storedCode(a, 'LOCKED1');
  assert.equal(stored.usedCount, 1);
  assert.equal(stored.redeemedSourceIds.length, 1);
});

// ---- 6. Unlimited codes -----------------------------------------------
await scenario('6 unlimited code works repeatedly', async ({ owner, customer }) => {
  await createDiscountCode(owner, { code: 'UNLIMITED1', maxUses: '' });
  const a = await customer();
  for(let i = 0; i < 3; i++){
    await asSeparateCustomer(a);
    await openBookingDetails(a, { timeIndex: i });
    assert.match(await applyBookingCode(a, 'UNLIMITED1'), /applied/);
    await submitBooking(a); await waitForBookingConfirmed(a);
    assert.equal(await bookedTotal(a), 40);
    await a.locator('#bookingConfirmCloseBtn').click();
  }
  assert.equal((await storedCode(a, 'UNLIMITED1')).usedCount, 3);
});

// ---- 7. Price-change confirmation: exact wording and Continue ---------
await scenario('7 price-change prompt and Continue at full price', async ({ owner, customer }) => {
  await createDiscountCode(owner, { code: 'PRICECHANGE1', amount: '20', maxUses: 1 });
  const a = await customer(); const b = await customer();
  await openBookingDetails(a, { timeIndex: 0 });
  await openBookingDetails(b, { timeIndex: 1 });
  await applyBookingCode(a, 'PRICECHANGE1'); await applyBookingCode(b, 'PRICECHANGE1');
  await submitBooking(a); await waitForBookingConfirmed(a);
  await asSeparateCustomer(b);
  await submitBooking(b);
  await b.waitForFunction(() => !document.querySelector('#bookingPriceChangeConfirm')?.hidden, null, { timeout: 10000 });
  assert.equal(await b.locator('#bookingPriceChangeMessage').textContent(),
    'This discount code just reached its usage limit. Your total has changed from $40.00 to $50.00.');
  assert.equal(await b.locator('#bookingPriceChangeContinueBtn').textContent(), 'Continue at $50.00');
  await b.locator('#bookingPriceChangeContinueBtn').click();
  await waitForBookingConfirmed(b);
  assert.equal(await bookedTotal(b), 50);
  assert.equal((await confirmedBooking(b)).discountCode, null);
  assert.match(await confirmPayment(b), /usage limit — full price applied/);
});

// ---- Regression: code deleted after Apply (used to be kept silently) --
await scenario('R1 code deleted after Apply is not honored', async ({ owner, customer }) => {
  await createDiscountCode(owner, { code: 'GONE1' });
  const a = await customer();
  await openBookingDetails(a);
  assert.match(await applyBookingCode(a, 'GONE1'), /applied/);
  await openOwnerDiscounts(owner);
  await owner.locator('[data-discount-id="demo-gone1"] [data-discount-action="delete"]').click();
  await submitBooking(a);
  await a.waitForFunction(() => !document.querySelector('#bookingPriceChangeConfirm')?.hidden, null, { timeout: 10000 });
  assert.equal(await a.locator('#bookingPriceChangeMessage').textContent(),
    'This discount code is no longer available. Your total has changed from $40.00 to $50.00.');
  await a.locator('#bookingPriceChangeContinueBtn').click();
  await waitForBookingConfirmed(a);
  assert.equal(await bookedTotal(a), 50);
  assert.match(await confirmPayment(a), /no longer available — full price applied/);
});

// ---- Regression: code paused after Apply ------------------------------
await scenario('R2 code paused after Apply is not honored', async ({ owner, customer }) => {
  await createDiscountCode(owner, { code: 'PAUSED1' });
  const a = await customer();
  await openBookingDetails(a);
  await applyBookingCode(a, 'PAUSED1');
  await openOwnerDiscounts(owner);
  await owner.locator('[data-discount-id="demo-paused1"] [data-discount-action="toggle"]').click();
  await submitBooking(a);
  await a.waitForFunction(() => !document.querySelector('#bookingPriceChangeConfirm')?.hidden, null, { timeout: 10000 });
  assert.match(await a.locator('#bookingPriceChangeMessage').textContent(), /no longer available/);
  await a.locator('#bookingPriceChangeBackBtn').click();
  assert.equal(await a.locator('#bookingConfirmId').textContent(), '');
  assert.equal((await storedCode(a, 'PAUSED1')).usedCount, 0);
});

// ---- Regression: owner edit must not lower the usage count ------------
// The owner's page loaded before the member used the code; saving an
// edit used to write the old count (0) back, re-opening a used-up code.
await scenario('R3 owner edit keeps the current usage count', async ({ owner, customer }) => {
  await createDiscountCode(owner, { code: 'EDITME', maxUses: 1 });
  const a = await customer();
  await openBookingDetails(a);
  await applyBookingCode(a, 'EDITME');
  await submitBooking(a); await waitForBookingConfirmed(a);
  // Owner's page is still the one loaded before the claim.
  await createDiscountCode(owner, { code: 'EDITME', amount: '25', maxUses: 1 });
  const stored = await storedCode(owner, 'EDITME');
  assert.equal(stored.amount, 25);
  assert.equal(stored.usedCount, 1);
  assert.equal(stored.redeemedSourceIds.length, 1);
  assert.match(await owner.locator('[data-discount-id="demo-editme"]').textContent(), /1 \/ 1 used/);
  const b = await customer();
  await openBookingDetails(b, { timeIndex: 1 });
  assert.match(await applyBookingCode(b, 'EDITME'), /usage limit/);
});

// ---- Owner controls: create, edit, pause/activate, expiry, delete -----
await scenario('O1 owner discount controls', async ({ owner, customer }) => {
  const yesterday = new Date(Date.now() - 86400000).toLocaleDateString('en-CA');
  await createDiscountCode(owner, { code: 'OLDCODE', expiresAt: yesterday });
  await createDiscountCode(owner, { code: 'FIVEOFF', type: 'fixed', amount: '5', scope: 'oneonone', maxUses: 2 });
  const list = owner.locator('#ownerDiscountCodesList');
  assert.match(await list.textContent(), /FIVEOFF.*\$5\.00 off · One-on-Ones · 0 \/ 2 used/s);
  assert.match(await list.textContent(), new RegExp('OLDCODE.*Ends ' + yesterday, 's'));
  // invalid input is refused with a clear message
  await owner.locator('#ownerDiscountCode').fill('x');
  await owner.locator('#ownerDiscountAmount').fill('10');
  await owner.locator('#ownerDiscountCodeForm').evaluate(f => f.requestSubmit());
  assert.match(await owner.locator('#ownerDiscountCodeStatus').textContent(), /3–30 letters/);
  await owner.locator('#ownerDiscountCode').fill('BIGPCT');
  await owner.locator('#ownerDiscountType').selectOption('percent');
  await owner.locator('#ownerDiscountAmount').fill('150');
  await owner.locator('#ownerDiscountCodeForm').evaluate(f => f.requestSubmit());
  assert.match(await owner.locator('#ownerDiscountCodeStatus').textContent(), /1 to 100/);

  const a = await customer();
  await openBookingDetails(a);
  assert.match(await applyBookingCode(a, 'OLDCODE'), /expired/);
  assert.match(await applyBookingCode(a, 'NOSUCHCODE'), /not found/);
  assert.match(await applyBookingCode(a, 'FIVEOFF'), /save \$5\.00/);
  assert.match(await a.locator('#bookingOrderSummary').textContent(), /\$45\.00/);
  // a One-on-One-only code is refused for a class
  await a.locator('#bookingDialog').evaluate(d => d.close());
  await a.evaluate(() => window.openTeachingRegister('demo-discernment'));
  await a.locator('#teachingRegisterDiscountCode').fill('FIVEOFF');
  await a.locator('#teachingRegisterDiscountApply').click();
  await a.waitForFunction(() => /not available/.test(document.querySelector('#teachingRegisterDiscountStatus')?.textContent || ''));

  // pause → refused; activate → works again
  // (The owner page is not reloaded: the Preview's one shared sign-in is
  // the member's now. Pause/Delete re-read the stored codes anyway.)
  await openOwnerDiscounts(owner);
  const row = owner.locator('[data-discount-id="demo-fiveoff"]');
  await row.locator('[data-discount-action="toggle"]').click();
  await owner.waitForFunction(() => /Activate/.test(document.querySelector('[data-discount-id="demo-fiveoff"]')?.textContent || ''));
  await openBookingDetails(a);
  assert.match(await applyBookingCode(a, 'FIVEOFF'), /not active/);
  await owner.locator('[data-discount-id="demo-fiveoff"] [data-discount-action="toggle"]').click();
  await openBookingDetails(a);
  assert.match(await applyBookingCode(a, 'FIVEOFF'), /applied/);
  // delete → gone from the list and from checkout
  await owner.locator('[data-discount-id="demo-fiveoff"] [data-discount-action="delete"]').click();
  assert.doesNotMatch(await list.textContent(), /FIVEOFF/);
  await openBookingDetails(a);
  assert.match(await applyBookingCode(a, 'FIVEOFF'), /not found/);
});

// ---- Regression: two tabs can't book the same time in the Preview ----
await scenario('R4 two tabs cannot double-book one time', async ({ customer }) => {
  const a = await customer(); const b = await customer();
  const ta = await openBookingDetails(a, { timeIndex: 0 });
  const tb = await openBookingDetails(b, { timeIndex: 0 });
  assert.equal(ta, tb);
  await submitBooking(a); await waitForBookingConfirmed(a);
  await asSeparateCustomer(b);
  await submitBooking(b);
  await b.waitForFunction(() => document.querySelector('#bookingStatus')?.textContent.includes('just taken'), null, { timeout: 10000 });
  const stored = await b.evaluate(() => JSON.parse(localStorage.getItem('ua_preview_bookings_v1') || '[]'));
  const ids = stored.map(x => x.id);
  assert.equal(new Set(ids).size, ids.length, 'booking ids are unique');
  assert.equal(stored.filter(x => x.time === ta && x.uid === 'demo-member' && x.name === 'Test Customer').length, 1);
});

await browser.close();
console.log(results.join('\n'));
const failed = results.filter(r => r.startsWith('FAIL')).length;
console.log(`${results.length - failed}/${results.length} passed`);
if(failed) process.exitCode = 1;
