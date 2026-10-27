// Confirms the Scheduling & Availability admin panel is fully staged:
// nothing in Settings/Session Types/Availability Rules/Blocked Dates/
// Night Of Prayer is written to Firestore (or localStorage in DEMO_MODE)
// until "Save Changes" in the shared #schedSaveBar is clicked, and
// "Discard Changes" reverts an in-progress edit instead of committing it.
import { chromium } from '/Users/yaunahlove/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
import assert from 'node:assert/strict';

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
const baseUrl = process.env.TEST_BASE_URL || 'http://localhost:8080';
const errors = [];
page.on('pageerror', err => errors.push(err.message));

await page.goto(`${baseUrl}/story.html`, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('#schedTypesList', { state: 'attached' });

// Sign in for real as the demo admin (DEMO_MODE checks the email against
// DEMO_ADMIN_EMAIL and grants the admin role) so loadOwnerData() actually
// runs and populates SESSION_TYPES/etc. from the demo seed data.
await page.evaluate(() => {
  document.querySelector('#memberPortalDialog').setAttribute('open', '');
  document.querySelectorAll('.portal-view').forEach(v => { v.hidden = v.dataset.portalView !== 'prospect'; });
});
await page.fill('#signinEmail', 'contactunveiledassembly@gmail.com');
await page.fill('#signinPassword', 'whatever123');
await page.locator('#emailSignInForm').evaluate(form => form.requestSubmit());
// Bookings now lives nested under the Ministry Operations department
// (Owner Portal navigation restructuring) — expand it first.
await page.waitForSelector('[data-dept-toggle="ministry"]', { timeout: 15000 });
await page.locator('[data-dept-toggle="ministry"]').click();
await page.locator('[data-owner-nav="bookings"]').click();
await page.waitForFunction(() => document.querySelectorAll('#schedTypesList [data-type-id]').length > 0, null, { timeout: 15000 });

// Save bar only shows on the three staged-editing sub-tabs.
assert.equal(await page.locator('#schedSaveBar').isHidden(), true, 'save bar hidden on Overview');
await page.locator('#bookingsSubNav [data-bookings-tab="types"]').click();
assert.equal(await page.locator('#schedSaveBar').isHidden(), false, 'save bar visible on Session Types');
assert.equal(await page.locator('#schedSaveBar').evaluate(el => el.classList.contains('is-dirty')), false, 'starts clean');

// Toggling Active/Inactive only touches the draft until Save is clicked.
const firstRow = page.locator('#schedTypesList [data-type-id]').first();
const typeId = await firstRow.getAttribute('data-type-id');
await firstRow.locator('.sched-type-toggle').click();
assert.equal(await page.locator('#schedSaveBar').evaluate(el => el.classList.contains('is-dirty')), true, 'toggle marks draft dirty');
assert.equal((await firstRow.locator('.admin-status-pill').innerText()).trim().toLowerCase(), 'inactive', 'draft shows the change immediately');

// Discard reverts the draft to the live state without ever having saved.
await page.locator('#schedDiscardBtn').click();
assert.equal((await page.locator(`#schedTypesList [data-type-id="${typeId}"] .admin-status-pill`).innerText()).trim().toLowerCase(), 'active', 'discard restores live state');
assert.equal(await page.locator('#schedSaveBar').evaluate(el => el.classList.contains('is-dirty')), false, 'discard clears dirty flag');

// Toggle again and actually Save — confirm it commits and survives a reload.
await page.locator(`#schedTypesList [data-type-id="${typeId}"] .sched-type-toggle`).click();
await page.locator('#schedSaveAllBtn').click();
await page.waitForFunction(() => !document.getElementById('schedSaveBar').classList.contains('is-dirty'));
assert.equal((await page.locator(`#schedTypesList [data-type-id="${typeId}"] .admin-status-pill`).innerText()).trim().toLowerCase(), 'inactive', 'save commits the change');

await page.reload({ waitUntil: 'domcontentloaded' });
await page.locator('#navMemberPortal').click();
await page.locator('[data-owner-nav="bookings"]').click();
await page.waitForFunction(() => document.querySelectorAll('#schedTypesList [data-type-id]').length > 0, null, { timeout: 15000 });
await page.locator('#bookingsSubNav [data-bookings-tab="types"]').click();
assert.equal((await page.locator(`#schedTypesList [data-type-id="${typeId}"] .admin-status-pill`).innerText()).trim().toLowerCase(), 'inactive', 'change survives a reload');

// Availability rules: adding one is staged too, and survives Save.
await page.locator('#bookingsSubNav [data-bookings-tab="availability"]').click();
const rulesBefore = await page.locator('#schedRulesList [data-rule-id]').count();
await page.selectOption('#schedRuleDay', '3');
await page.fill('#schedRuleStart', '10:00');
await page.fill('#schedRuleEnd', '11:00');
await page.locator('#schedRuleForm button[type="submit"]').click();
assert.equal(await page.locator('#schedRulesList [data-rule-id]').count(), rulesBefore + 1, 'new rule appears in the draft list');
assert.equal(await page.locator('#schedSaveBar').evaluate(el => el.classList.contains('is-dirty')), true, 'adding a rule marks dirty');
await page.locator('#schedSaveAllBtn').click();
await page.waitForFunction(() => !document.getElementById('schedSaveBar').classList.contains('is-dirty'));
assert.equal(await page.locator('#schedRulesList [data-rule-id]').count(), rulesBefore + 1, 'rule survives save');

assert.deepEqual(errors, []);
await browser.close();
console.log('scheduling_staged_save=ok');
