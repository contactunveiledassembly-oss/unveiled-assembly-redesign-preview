import { chromium } from '/Users/yaunahlove/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
import assert from 'node:assert/strict';

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const errors = [];
page.on('pageerror', error => errors.push(error.message));

await page.goto('http://localhost:8080/one-on-one.html', { waitUntil: 'domcontentloaded' });
await page.waitForSelector('[data-site-page="One-on-One Page"]');
assert.match(await page.locator('.oo-hero-media').evaluate(el => getComputedStyle(el).backgroundImage), /hero-v4\.png/);

await page.locator('[data-site-page="One-on-One Page"]').evaluate(el => el.click());
await page.locator('#ooEditHeroEyebrow').fill('Personal Ministry Preview');
await page.locator('#ownerOneOnOneEditor').evaluate(form => form.requestSubmit());
await page.waitForFunction(() => document.querySelector('#ownerOneOnOneStatus')?.textContent.includes('Saved'));
await page.reload({ waitUntil: 'domcontentloaded' });
assert.equal(await page.locator('#ooHeroEyebrow').textContent(), 'Personal Ministry Preview');

await page.locator('input[name="sessionType"][value="30-minute"]').check();
await page.locator('#bookingDiscountCode').fill('GRACE20');
await page.locator('#bookingDiscountApply').click();
await page.waitForFunction(() => document.querySelector('#bookingDiscountStatus')?.textContent.includes('applied'));
assert.match(await page.locator('#bookingDiscountStatus').textContent(), /save \$10\.00/);
assert.match(await page.locator('#bookingOrderSummary').textContent(), /\$40\.00/);

await page.locator('#teachingRegisterForm').evaluate(form => { form.dataset.teachingId = 'demo-discernment'; });
await page.locator('#teachingRegisterDiscountCode').fill('GRACE20');
await page.locator('#teachingRegisterDiscountApply').click();
await page.waitForFunction(() => document.querySelector('#teachingRegisterDiscountStatus')?.textContent.includes('applied'));
assert.match(await page.locator('#teachingRegisterOrderSummary').textContent(), /\$20\.00/);

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
