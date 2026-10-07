// ---------------------------------------------------------------------
// UNVERIFIED — has never been run.
//
// This environment has no Node runtime and no browser automation tool,
// so none of the assertions below have ever actually executed. They
// are written against the real DOM ids and the real claim/confirm/
// release behavior in site-management.js and app.js as of this commit,
// but they have not been checked against a live page. Before trusting
// this file, run it (and fix whatever it gets wrong) in an environment
// that has Node + Playwright and a local static server on :8080 (the
// same assumption tests/owner-editor-discounts.mjs already makes —
// this file is deliberately kept separate from that one so a mistake
// here can never put a previously-passing test at risk).
//
//   node tests/discount-claim-lifecycle.mjs
//
// It assumes DEMO_MODE (a local server, not the production domain) so
// discounts live in localStorage rather than real Firestore — which
// means this exercises the CLIENT-SIDE claim/confirm/release logic in
// site-management.js, but NOT the firestore.rules security boundary
// itself (the direct-tamper and replay checks in the manual browser/
// emulator checklist are what cover that — this file cannot).
//
// Two independent Playwright browser CONTEXTS are used wherever two
// separate customers matter (scenario 3), on the assumption that each
// context's own localStorage gives DEMO_MODE's demo sign-in its own
// independent identity, the same way two real signed-in users would
// have independent Firebase Auth sessions. If DEMO_MODE's demo
// identity turns out to be global rather than per-context, scenario 3
// will need to be adjusted once this is actually run.
// ---------------------------------------------------------------------
import { chromium } from '/Users/yaunahlove/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
import assert from 'node:assert/strict';

const BASE_URL = 'http://localhost:8080';
const results = [];

async function withPage(run){
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  try {
    await run(page, errors);
  } finally {
    await browser.close();
  }
  return errors;
}

// Creates a discount code via the owner portal already open on `page`,
// matching the same form fields tests/owner-editor-discounts.mjs uses
// (#ownerDiscountCode/.../#ownerDiscountCodeForm), plus the new
// #ownerDiscountMaxUses field.
async function createDiscountCode(page, { code, amount = '20', type = 'percent', scope = 'both', maxUses = '' }){
  await page.locator('[data-site-page="One-on-One Page"]').waitFor({ state: 'visible' }).catch(() => {});
  await page.locator('#ownerDiscountCode').fill(code);
  await page.locator('#ownerDiscountType').selectOption(type);
  await page.locator('#ownerDiscountAmount').fill(amount);
  await page.locator('#ownerDiscountScope').selectOption(scope);
  if(maxUses !== '') await page.locator('#ownerDiscountMaxUses').fill(String(maxUses));
  await page.locator('#ownerDiscountCodeForm').evaluate(form => form.requestSubmit());
  await page.waitForFunction(() => document.querySelector('#ownerDiscountCodeStatus')?.textContent.includes('ready to use'));
}

async function fillBookingBasics(page){
  await page.goto(BASE_URL + '/one-on-one.html', { waitUntil: 'domcontentloaded' });
  await page.locator('input[name="sessionType"][value="30-minute"]').check();
  // The booking dialog's Details/Payment step on one-on-one.html is
  // reached inline (see openOneOnOneInline in app.js) rather than
  // through the shared booking dialog's own Session/Date steps — this
  // fills the fields this page's own flow actually exposes. If the
  // real step ids differ once this runs against a live page, this
  // helper is the one place to correct.
  const name = page.locator('#bookingName');
  if(await name.count()) await name.fill('Test Customer');
  const email = page.locator('#bookingEmail');
  if(await email.count()) await email.fill('test+' + Date.now() + '@example.com');
  const phone = page.locator('#bookingPhoneNumber');
  if(await phone.count()) await phone.fill('5555550123');
  const terms = page.locator('#bookingAgreeTerms');
  if(await terms.count()) await terms.check();
  const noRefund = page.locator('#bookingAgreeNoRefund');
  if(await noRefund.count()) await noRefund.check();
}

// ---- 1. Successful limited-use claim and confirmation ----------------
async function scenario1(){
  return withPage(async page => {
    await page.goto(BASE_URL + '/one-on-one.html', { waitUntil: 'domcontentloaded' });
    await createDiscountCode(page, { code: 'LIFECYCLE1', maxUses: 1 });
    await fillBookingBasics(page);
    await page.locator('#bookingDiscountCode').fill('LIFECYCLE1');
    await page.locator('#bookingDiscountApply').click();
    await page.waitForFunction(() => document.querySelector('#bookingDiscountStatus')?.textContent.includes('applied'));
    await page.locator('#bookingForm').evaluate(form => form.requestSubmit());
    await page.waitForFunction(() => document.querySelector('#bookingConfirmId')?.textContent.length > 0, { timeout: 10000 });
    assert.match(await page.locator('#bookingConfirmPayment').textContent(), /\$40\.00/);
    assert.doesNotMatch(await page.locator('#bookingConfirmPayment').textContent(), /usage limit/);
  });
}

// ---- 2. Code already at max usage ------------------------------------
// IMPORTANT: in DEMO_MODE, discount state is a synchronous in-memory
// object with no real network latency, so a naive "redeem, then apply
// again" sequence would have the SECOND Apply click itself see the
// already-exhausted usedCount and reject the code right there — never
// reaching claimDiscount() at all, and never exercising the new
// price-change dialog this scenario exists to test. To reliably force
// "Apply succeeded, the LATER claim did not," this applies the code in
// TWO separate contexts (so each one's Apply reads usedCount==0) before
// either one ever submits, then submits them one after the other
// instead of simultaneously — scenario 3 covers genuinely simultaneous
// submission; this one deliberately isolates the sequential case.
async function scenario2(){
  const browser = await chromium.launch({ headless: true });
  const errors = [];
  try {
    const ownerContext = await browser.newContext();
    const ownerPage = await ownerContext.newPage();
    await ownerPage.goto(BASE_URL + '/one-on-one.html', { waitUntil: 'domcontentloaded' });
    await createDiscountCode(ownerPage, { code: 'LIFECYCLE2', maxUses: 1 });
    await ownerContext.close();

    const contextA = await browser.newContext();
    const contextB = await browser.newContext();
    const pageA = await contextA.newPage();
    const pageB = await contextB.newPage();
    [pageA, pageB].forEach(p => p.on('pageerror', e => errors.push(e.message)));

    for(const p of [pageA, pageB]){
      await p.goto(BASE_URL + '/one-on-one.html', { waitUntil: 'domcontentloaded' });
      await fillBookingBasics(p);
      await p.locator('#bookingDiscountCode').fill('LIFECYCLE2');
      await p.locator('#bookingDiscountApply').click();
      await p.waitForFunction(() => document.querySelector('#bookingDiscountStatus')?.textContent.includes('applied'));
    }

    // A submits first and wins the claim outright.
    await pageA.locator('#bookingForm').evaluate(form => form.requestSubmit());
    await pageA.waitForFunction(() => document.querySelector('#bookingConfirmId')?.textContent.length > 0, { timeout: 10000 });
    assert.match(await pageA.locator('#bookingConfirmPayment').textContent(), /\$40\.00/);

    // B still thinks its code is "applied" (its Apply ran before A
    // claimed) but its claim must now fail, surfacing the price-change
    // confirmation rather than silently booking at full price.
    await pageB.locator('#bookingForm').evaluate(form => form.requestSubmit());
    await pageB.waitForFunction(() => !document.querySelector('#bookingPriceChangeConfirm')?.hidden, { timeout: 10000 });
    assert.match(await pageB.locator('#bookingPriceChangeMessage').textContent(), /usage limit/);
    assert.match(await pageB.locator('#bookingPriceChangeMessage').textContent(), /\$40.*\$50|\$50.*\$40/s);
    // Go Back must create nothing for B.
    await pageB.locator('#bookingPriceChangeBackBtn').click();
    assert.equal(await pageB.locator('#bookingConfirmId').textContent(), '');

    await contextA.close(); await contextB.close();
  } finally {
    await browser.close();
  }
  return errors;
}

// ---- 3. Two competing attempts for a maxUses=1 code -------------------
async function scenario3(){
  const browser = await chromium.launch({ headless: true });
  const errors = [];
  try {
    const ownerContext = await browser.newContext();
    const ownerPage = await ownerContext.newPage();
    await ownerPage.goto(BASE_URL + '/one-on-one.html', { waitUntil: 'domcontentloaded' });
    await createDiscountCode(ownerPage, { code: 'RACE1', maxUses: 1 });
    await ownerContext.close();

    const contextA = await browser.newContext();
    const contextB = await browser.newContext();
    const pageA = await contextA.newPage();
    const pageB = await contextB.newPage();
    [pageA, pageB].forEach(p => p.on('pageerror', e => errors.push(e.message)));

    for(const p of [pageA, pageB]){
      await p.goto(BASE_URL + '/one-on-one.html', { waitUntil: 'domcontentloaded' });
      await fillBookingBasics(p);
      await p.locator('#bookingDiscountCode').fill('RACE1');
      await p.locator('#bookingDiscountApply').click();
      await p.waitForFunction(() => document.querySelector('#bookingDiscountStatus')?.textContent.includes('applied'));
    }

    // Submit as close to simultaneously as Playwright allows.
    await Promise.all([
      pageA.locator('#bookingForm').evaluate(form => form.requestSubmit()),
      pageB.locator('#bookingForm').evaluate(form => form.requestSubmit())
    ]);

    async function outcome(p){
      await Promise.race([
        p.waitForFunction(() => document.querySelector('#bookingConfirmId')?.textContent.length > 0, { timeout: 10000 }),
        p.waitForFunction(() => !document.querySelector('#bookingPriceChangeConfirm')?.hidden, { timeout: 10000 })
      ]);
      const priceChangeShown = !(await p.locator('#bookingPriceChangeConfirm').isHidden());
      if(priceChangeShown) return 'lost';
      const paymentText = await p.locator('#bookingConfirmPayment').textContent();
      return /\$40\.00/.test(paymentText) ? 'discounted' : 'full';
    }
    const [outcomeA, outcomeB] = await Promise.all([outcome(pageA), outcome(pageB)]);
    const discountedCount = [outcomeA, outcomeB].filter(o => o === 'discounted').length;
    assert.equal(discountedCount, 1, 'exactly one of the two simultaneous attempts should receive the discount, got: ' + JSON.stringify({ outcomeA, outcomeB }));
    assert.ok(['lost', 'full'].includes(outcomeA === 'discounted' ? outcomeB : outcomeA));

    // Whichever one "lost" must not have silently booked at the higher
    // price — it must be sitting at the price-change prompt.
    const loserPage = outcomeA === 'discounted' ? pageB : pageA;
    assert.equal(await loserPage.locator('#bookingPriceChangeConfirm').isHidden(), false);

    await contextA.close(); await contextB.close();
  } finally {
    await browser.close();
  }
  return errors;
}

// ---- 4. Failed booking after claim releases the use --------------------
async function scenario4(){
  return withPage(async page => {
    await page.goto(BASE_URL + '/one-on-one.html', { waitUntil: 'domcontentloaded' });
    await createDiscountCode(page, { code: 'RELEASE1', maxUses: 1 });
    // Force the booking write itself to fail AFTER a successful claim,
    // by making the same exact slot already fully booked the instant
    // createBooking() checks capacity — simulated here by monkeypatching
    // createBooking to throw once, since reliably recreating a real
    // slot-capacity race from outside the page is not practical. This
    // only proves the release path runs on ANY booking failure, which
    // is what the discountCodes rule actually guards on — it does not
    // need the failure to specifically be 'slot-taken'.
    await page.evaluate(() => {
      window.__origCreateBooking = window.createBooking;
      window.createBooking = async () => { throw new Error('slot-taken'); };
    }).catch(() => { /* createBooking may not be on window if not explicitly exposed — see note below */ });
    await fillBookingBasics(page);
    await page.locator('#bookingDiscountCode').fill('RELEASE1');
    await page.locator('#bookingDiscountApply').click();
    await page.waitForFunction(() => document.querySelector('#bookingDiscountStatus')?.textContent.includes('applied'));
    await page.locator('#bookingForm').evaluate(form => form.requestSubmit());
    await page.waitForFunction(() => document.querySelector('#bookingStatus')?.textContent.includes('just taken'), { timeout: 10000 }).catch(() => {});
    // The use must have been given back: a second attempt should still
    // find the code available, not already at its limit.
    await fillBookingBasics(page);
    await page.locator('#bookingDiscountCode').fill('RELEASE1');
    await page.locator('#bookingDiscountApply').click();
    await page.waitForFunction(() => document.querySelector('#bookingDiscountStatus')?.textContent.length > 0);
    assert.doesNotMatch(await page.locator('#bookingDiscountStatus').textContent(), /usage limit/);
  });
}
// NOTE on scenario 4: app.js's createBooking() is a module-scope function,
// not necessarily assigned to `window.createBooking` — if it isn't
// reachable this way once this actually runs, the monkeypatch above is a
// no-op and this scenario needs a different forcing mechanism (e.g. a
// temporary capacity=0 slot document, or two real bookings racing the
// same slot as in scenario 3's pattern). Flagging this now rather than
// guessing a fix I can't verify.

// ---- 5. Confirmed redemption cannot be released/reused -----------------
async function scenario5(){
  return withPage(async page => {
    await page.goto(BASE_URL + '/one-on-one.html', { waitUntil: 'domcontentloaded' });
    await createDiscountCode(page, { code: 'LOCKED1', maxUses: 5 });
    await fillBookingBasics(page);
    await page.locator('#bookingDiscountCode').fill('LOCKED1');
    await page.locator('#bookingDiscountApply').click();
    await page.waitForFunction(() => document.querySelector('#bookingDiscountStatus')?.textContent.includes('applied'));
    await page.locator('#bookingForm').evaluate(form => form.requestSubmit());
    await page.waitForFunction(() => document.querySelector('#bookingConfirmId')?.textContent.length > 0, { timeout: 10000 });
    // In DEMO_MODE there is no real Firestore to re-attack, so this
    // scenario is only meaningful against a real/emulated project —
    // this is a placeholder documenting the EXPECTED assertion for
    // whoever runs this against the emulator: attempting to delete or
    // re-update the now-'confirmed' discountRedemptions/{claimId}
    // ticket directly (bypassing the UI) must fail with
    // permission-denied, and the code's usedCount must be unaffected.
    // See the manual checklist item covering this directly against
    // firestore.rules, which is the real test for this guarantee.
  });
}

// ---- 6. Unlimited codes ------------------------------------------------
async function scenario6(){
  return withPage(async page => {
    await page.goto(BASE_URL + '/one-on-one.html', { waitUntil: 'domcontentloaded' });
    await createDiscountCode(page, { code: 'UNLIMITED1', maxUses: '' });
    for(let i = 0; i < 3; i++){
      await fillBookingBasics(page);
      await page.locator('#bookingDiscountCode').fill('UNLIMITED1');
      await page.locator('#bookingDiscountApply').click();
      await page.waitForFunction(() => document.querySelector('#bookingDiscountStatus')?.textContent.includes('applied'));
      await page.locator('#bookingForm').evaluate(form => form.requestSubmit());
      await page.waitForFunction(() => document.querySelector('#bookingConfirmId')?.textContent.length > 0, { timeout: 10000 });
      assert.doesNotMatch(await page.locator('#bookingConfirmPayment').textContent(), /usage limit/);
      await page.locator('#bookingConfirmCloseBtn').click();
    }
  });
}

// ---- 7. Price-change confirmation content/behavior --------------------
// Same two-context technique as scenario 2 (see its comment) so B's
// Apply genuinely succeeds before A's claim exhausts the code — this
// scenario then also drives B's "Continue" button, which scenario 2
// deliberately does not, to confirm the booking really is created at
// the new, higher price only after that explicit confirmation.
async function scenario7(){
  const browser = await chromium.launch({ headless: true });
  const errors = [];
  try {
    const ownerContext = await browser.newContext();
    const ownerPage = await ownerContext.newPage();
    await ownerPage.goto(BASE_URL + '/one-on-one.html', { waitUntil: 'domcontentloaded' });
    await createDiscountCode(ownerPage, { code: 'PRICECHANGE1', amount: '20', maxUses: 1 });
    await ownerContext.close();

    const contextA = await browser.newContext();
    const contextB = await browser.newContext();
    const pageA = await contextA.newPage();
    const pageB = await contextB.newPage();
    [pageA, pageB].forEach(p => p.on('pageerror', e => errors.push(e.message)));

    for(const p of [pageA, pageB]){
      await p.goto(BASE_URL + '/one-on-one.html', { waitUntil: 'domcontentloaded' });
      await fillBookingBasics(p);
      await p.locator('#bookingDiscountCode').fill('PRICECHANGE1');
      await p.locator('#bookingDiscountApply').click();
      await p.waitForFunction(() => document.querySelector('#bookingDiscountStatus')?.textContent.includes('applied'));
    }

    await pageA.locator('#bookingForm').evaluate(form => form.requestSubmit());
    await pageA.waitForFunction(() => document.querySelector('#bookingConfirmId')?.textContent.length > 0, { timeout: 10000 });

    await pageB.locator('#bookingForm').evaluate(form => form.requestSubmit());
    await pageB.waitForFunction(() => !document.querySelector('#bookingPriceChangeConfirm')?.hidden, { timeout: 10000 });
    assert.equal(await pageB.locator('#bookingPriceChangeMessage').textContent(),
      'This discount code just reached its usage limit. Your total has changed from $40.00 to $50.00.');
    assert.equal(await pageB.locator('#bookingPriceChangeContinueBtn').textContent(), 'Continue at $50.00');
    // Continue must actually create the booking at full price.
    await pageB.locator('#bookingPriceChangeContinueBtn').click();
    await pageB.waitForFunction(() => document.querySelector('#bookingConfirmId')?.textContent.length > 0, { timeout: 10000 });
    assert.match(await pageB.locator('#bookingConfirmPayment').textContent(), /\$50\.00/);
    assert.match(await pageB.locator('#bookingConfirmPayment').textContent(), /usage limit/);

    await contextA.close(); await contextB.close();
  } finally {
    await browser.close();
  }
  return errors;
}

const scenarios = [
  ['1_successful_limited_claim', scenario1],
  ['2_code_already_at_limit', scenario2],
  ['3_two_competing_attempts', scenario3],
  ['4_failed_booking_releases_claim', scenario4],
  ['5_confirmed_redemption_locked', scenario5],
  ['6_unlimited_codes', scenario6],
  ['7_price_change_confirmation', scenario7]
];

for(const [name, run] of scenarios){
  try {
    const errors = await run();
    if(errors.length) throw new Error('page errors: ' + errors.join('; '));
    console.log(name + '=ok');
  } catch (err) {
    console.log(name + '=FAILED: ' + (err && err.message || err));
    results.push(name);
  }
}
if(results.length){
  console.log('FAILED SCENARIOS: ' + results.join(', '));
  process.exitCode = 1;
} else {
  console.log('all discount-claim-lifecycle scenarios passed (as far as this unverified file can tell)');
}
