// Confirms the Owner Portal navigation restructuring (7-department
// sidebar: Dashboard, People, Ministry Operations, Finances,
// Communications, Website & Settings — Shop & Resources added in a later
// stage): every pre-existing nav item still exists and still works, the
// two expandable departments (Ministry Operations, Website & Settings)
// disclose their sub-items on click and persist that choice across a
// reload, items start collapsed by default, auto-expand when navigated
// to directly, and the breadcrumb grows a middle segment for nested
// items. Nothing here changes any existing data-owner-section id, so
// this is purely a navigation-layer check.
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
await page.waitForSelector('[data-dept-toggle="ministry"]', { timeout: 15000 });

// Every old nav id survives the restructuring, exactly once.
const ALL_NAV_IDS = ['dashboard', 'people', 'teachings', 'paths', 'registrations', 'events', 'bookings',
  'prayer-requests', 'testimonials', 'class-reviews', 'payments', 'communication', 'website', 'media', 'settings', 'policies'];
for (const id of ALL_NAV_IDS) {
  const count = await page.locator('[data-owner-nav="' + id + '"]').count();
  assert.equal(count, 1, 'nav item "' + id + '" should exist exactly once, got ' + count);
}

// Both expandable departments start collapsed.
assert.equal(await page.locator('[data-dept-items="ministry"]').isHidden(), true, 'Ministry Operations starts collapsed');
assert.equal(await page.locator('[data-dept-items="website-settings"]').isHidden(), true, 'Website & Settings starts collapsed');

// Clicking a toggle discloses its items; the chevron rotates (aria-expanded flips).
await page.locator('[data-dept-toggle="ministry"]').click();
assert.equal(await page.locator('[data-dept-items="ministry"]').isVisible(), true);
assert.equal(await page.locator('[data-dept-toggle="ministry"]').getAttribute('aria-expanded'), 'true');
await page.locator('[data-dept-toggle="ministry"]').click();
assert.equal(await page.locator('[data-dept-items="ministry"]').isHidden(), true, 'clicking again collapses it');

// Navigating straight to a nested item through another real feature (the
// settings directory, same mechanism a notification click-through uses)
// auto-expands its department without the sidebar being touched directly,
// and the breadcrumb grows a middle segment.
await page.locator('[data-dept-toggle="ministry"]').click(); // leaves it collapsed again below
await page.locator('[data-dept-toggle="ministry"]').click();
assert.equal(await page.locator('[data-dept-items="ministry"]').isHidden(), true, 'collapsed again before the auto-expand check');
await page.fill('#ownerGlobalSearch', 'availability');
await page.waitForTimeout(200);
await page.locator('#ownerGlobalSearchResults [data-search-idx]').first().click();
await page.waitForTimeout(200);
assert.equal(await page.locator('[data-dept-items="ministry"]').isVisible(), true, 'navigating to a nested item auto-expands its department');
assert.match(await page.locator('#ownerBreadcrumb').innerText(), /owner portal\s*\/\s*ministry operations\s*\/\s*one-on-one scheduling/i);

// Finances (relabeled from Payments) and Communications (relabeled from
// Communication) are direct, single-click top-level items — no disclosure.
await page.locator('[data-owner-nav="payments"]').click();
assert.equal(await page.locator('[data-owner-section="payments"]').isVisible(), true);
assert.match(await page.locator('#ownerBreadcrumb').innerText(), /owner portal\s*\/\s*finances/i);
assert.match(await page.locator('[data-owner-section="payments"] .portal-label').first().innerText(), /finances/i);

// Disclosure state persists across a reload.
await page.locator('[data-dept-toggle="website-settings"]').click();
await page.reload({ waitUntil: 'domcontentloaded' });
await page.locator('#navMemberPortal').click();
await page.waitForSelector('[data-dept-toggle="website-settings"]', { timeout: 15000 });
assert.equal(await page.locator('[data-dept-items="website-settings"]').isVisible(), true, 'disclosure state survives a reload');

assert.deepEqual(errors, []);
await browser.close();
console.log('owner_portal_nav_restructure=ok');
