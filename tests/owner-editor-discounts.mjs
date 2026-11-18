// Owner page editor + discount codes (Preview / DEMO_MODE on localhost —
// sample data only, nothing real is touched).
//   python3 -m http.server 8080 &  node tests/owner-editor-discounts.mjs
//
// Same checks as the original 2026-10-07 test. Updated 2026-11-18 for
// the current site: the owner signs in before the Owner Portal opens,
// Discount Codes sit under Payments, booking goes session → date → time → Details & Payment, and the
// One-on-One hero photo is a .jpg since commit 76215de.
import { chromium } from '/Users/yaunahlove/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
import assert from 'node:assert/strict';
import { BASE_URL, OWNER_EMAIL, signIn, openOwnerWebsite, openOwnerDiscounts, openBookingDetails, applyBookingCode } from './helpers/discount-flow.mjs';

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
const page = await context.newPage();
const errors = [];
page.on('pageerror', error => errors.push(error.message));
page.on('dialog', d => d.accept());

await page.goto(BASE_URL + '/one-on-one.html', { waitUntil: 'domcontentloaded' });
await page.evaluate(() => localStorage.clear());
assert.match(await page.locator('.oo-hero-media').evaluate(el => getComputedStyle(el).backgroundImage), /hero-v4\.jpg/);

// Owner edits the One-on-One page and the change survives a reload.
await signIn(page, OWNER_EMAIL);
await openOwnerWebsite(page);
await page.locator('[data-site-page="One-on-One Page"]').click();
await page.locator('#ooEditHeroEyebrow').fill('Personal Ministry Preview');
await page.locator('#ownerOneOnOneEditor').evaluate(form => form.requestSubmit());
await page.waitForFunction(() => document.querySelector('#ownerOneOnOneStatus')?.textContent.includes('Saved'));
await page.reload({ waitUntil: 'domcontentloaded' });
assert.equal(await page.locator('#ooHeroEyebrow').textContent(), 'Personal Ministry Preview');

// One-on-One checkout: the sample GRACE20 code takes 20% off $50.
await openBookingDetails(page);
assert.match(await applyBookingCode(page, 'GRACE20'), /applied/);
assert.match(await page.locator('#bookingDiscountStatus').textContent(), /save \$10\.00/);
assert.match(await page.locator('#bookingOrderSummary').textContent(), /\$40\.00/);
await page.locator('#bookingDialog').evaluate(d => d.close());

// Class registration checkout: 20% off the $25 sample class.
await page.evaluate(() => window.openTeachingRegister('demo-discernment'));
await page.locator('#teachingRegisterDiscountCode').fill('GRACE20');
await page.locator('#teachingRegisterDiscountApply').click();
await page.waitForFunction(() => document.querySelector('#teachingRegisterDiscountStatus')?.textContent.includes('applied'));
assert.match(await page.locator('#teachingRegisterOrderSummary').textContent(), /\$20\.00/);
await page.locator('#teachingRegisterDialog').evaluate(d => d.close());

// Owner creates a new code (Owner Portal → Payments → Discount Codes).
await openOwnerDiscounts(page);
await page.locator('#ownerDiscountCode').fill('TEST10');
await page.locator('#ownerDiscountAmount').fill('10');
await page.locator('#ownerDiscountCodeForm').evaluate(form => form.requestSubmit());
await page.waitForFunction(() => document.querySelector('#ownerDiscountCodeStatus')?.textContent.includes('ready to use'));
assert.match(await page.locator('#ownerDiscountCodesList').textContent(), /TEST10/);

assert.deepEqual(errors, []);
console.log('owner_editor=ok');
console.log('one_on_one_discount=ok');
console.log('teaching_discount=ok');
console.log('owner_discount_manager=ok');
await browser.close();
