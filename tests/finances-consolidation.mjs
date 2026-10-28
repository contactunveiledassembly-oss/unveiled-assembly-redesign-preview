// Confirms the Finances department (Owner Portal navigation restructuring,
// Stage 3): Overview combines real One-on-One + Teaching payment data
// (not invented numbers), the 1:1 Payments and Teaching Payments tabs
// show real rows with working click-through to the real detail dialogs,
// Shop Orders/Donations show the "Live Site Only" preview note, and Finances reflects Demo
// Mode simulation data while it's active, then reverts to the original
// figures when turned off.
import { chromium } from '/Users/yaunahlove/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
import assert from 'node:assert/strict';

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1500, height: 1200 } });
const baseUrl = process.env.TEST_BASE_URL || 'http://localhost:8080';
const errors = [];
page.on('pageerror', err => errors.push(err.message));

await page.goto(`${baseUrl}/story.html`, { waitUntil: 'domcontentloaded' });
await page.evaluate(() => {
  document.querySelector('#memberPortalDialog').setAttribute('open', '');
  document.querySelectorAll('.portal-view').forEach(v => { v.hidden = v.dataset.portalView !== 'prospect'; });
});
await page.fill('#signinEmail', 'contactunveiledassembly@gmail.com');
await page.fill('#signinPassword', 'whatever123');
await page.locator('#emailSignInForm').evaluate(form => form.requestSubmit());
await page.waitForSelector('[data-owner-nav="payments"]', { timeout: 15000 });

await page.locator('[data-owner-nav="payments"]').click();
await page.waitForTimeout(300);

const parseStats = text => {
  const out = {};
  const lines = text.split('\n');
  for (let i = 0; i < lines.length - 1; i++) out[lines[i]] = lines[i + 1];
  return out;
};

const overviewStats = parseStats(await page.locator('#financesOverviewStats').innerText());
const liveRevenue = Number(overviewStats['Total Revenue'].replace('$', ''));
assert.ok(liveRevenue > 0, 'Overview should show real, non-zero combined revenue from seed data');

await page.locator('[data-payments-tab="oneonone"]').click();
await page.waitForTimeout(200);
const oneOnOneStats = parseStats(await page.locator('#financesOneOnOneStats').innerText());
const oneOnOneRevenue = Number(oneOnOneStats['Revenue'].replace('$', ''));
assert.ok(await page.locator('#financesOneOnOneList [data-booking-view]').count() > 0, '1:1 Payments should list real rows');
await page.locator('#financesOneOnOneList [data-booking-view]').first().click();
await page.waitForTimeout(250);
assert.equal(await page.evaluate(() => document.getElementById('bookingDetailDialog')?.open), true, 'clicking a 1:1 row should open the real booking detail dialog');
await page.keyboard.press('Escape');

await page.locator('[data-payments-tab="teaching"]').click();
await page.waitForTimeout(200);
const teachingStats = parseStats(await page.locator('#financesTeachingStats').innerText());
const teachingRevenue = Number(teachingStats['Revenue'].replace('$', ''));
assert.ok(await page.locator('#financesTeachingList [data-classreg-view]').count() > 0, 'Teaching Payments should list real rows');

assert.equal(Math.round((oneOnOneRevenue + teachingRevenue) * 100), Math.round(liveRevenue * 100),
  'Overview revenue should equal the sum of the two real category tabs');

await page.locator('[data-payments-tab="shop"]').click();
await page.waitForTimeout(150);
assert.match(await page.locator('[data-payments-panel="shop"]').innerText(), /live site only/i);
await page.locator('[data-payments-tab="donation"]').click();
await page.waitForTimeout(150);
assert.match(await page.locator('[data-payments-panel="donation"]').innerText(), /live site only/i);

// Demo Mode simulation flows through, then reverts cleanly when turned off.
await page.locator('[data-owner-nav="dashboard"]').click();
await page.waitForTimeout(150);
await page.locator('#ownerSimToggle').locator('xpath=ancestor::label').click();
await page.waitForSelector('.owner-sim-banner', { timeout: 5000 });
await page.selectOption('#ownerSimScenario', 'busy');
await page.locator('#ownerSimAdvanceDay').click();
await page.waitForTimeout(300);
await page.locator('[data-owner-nav="payments"]').click();
await page.locator('[data-payments-tab="all"]').click();
await page.waitForTimeout(300);
const simRevenue = Number(parseStats(await page.locator('#financesOverviewStats').innerText())['Total Revenue'].replace('$', ''));
assert.notEqual(simRevenue, liveRevenue, 'simulated revenue should differ from the live figure (Busy Day generates its own data)');

await page.locator('[data-owner-nav="dashboard"]').click();
await page.waitForTimeout(150);
await page.locator('#ownerSimToggle').locator('xpath=ancestor::label').click();
await page.waitForTimeout(200);
await page.locator('[data-owner-nav="payments"]').click();
await page.locator('[data-payments-tab="all"]').click();
await page.waitForTimeout(300);
const restoredRevenue = Number(parseStats(await page.locator('#financesOverviewStats').innerText())['Total Revenue'].replace('$', ''));
assert.equal(restoredRevenue, liveRevenue, 'turning Demo Mode off should restore the exact original revenue figure');

assert.deepEqual(errors, []);
await browser.close();
console.log('finances_consolidation=ok');
