// Owner Portal navigation — redesign (2026-11-17): seven sections.
// Overview and Bookings are single destinations; Classroom, Community,
// Resources, Website and Settings expand. Every pre-existing section id
// still exists exactly once and still opens its unchanged panel; groups
// start collapsed, toggle with aria-expanded, auto-open when you land on
// one of their sections some other way (search), and remember their
// open/closed state across a reload.
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
await page.waitForSelector('[data-dept-toggle="classroom"]', { timeout: 15000 });

const ALL_NAV_IDS = ['dashboard', 'people', 'teachings', 'paths', 'registrations', 'events', 'bookings',
  'prayer-requests', 'testimonials', 'class-reviews', 'store', 'payments', 'reports', 'communication', 'website', 'media', 'settings', 'policies'];
for (const id of ALL_NAV_IDS) {
  const count = await page.locator('[data-owner-nav="' + id + '"]').count();
  assert.equal(count, 1, 'nav item "' + id + '" should exist exactly once, got ' + count);
}
const GROUPS = { classroom: ['teachings', 'registrations', 'paths', 'class-reviews'], community: ['prayer-requests', 'testimonials', 'events', 'people'],
  resources: ['store', 'payments', 'reports'], website: ['website', 'media', 'policies'], settings: ['settings', 'communication'] };
for (const [group, ids] of Object.entries(GROUPS)) {
  assert.equal(await page.locator('[data-dept-items="' + group + '"]').isHidden(), true, group + ' starts collapsed');
  for (const id of ids) assert.equal(await page.locator('[data-dept-items="' + group + '"] [data-owner-nav="' + id + '"]').count(), 1, id + ' lives in ' + group);
}
for (const id of ['dashboard', 'bookings']) assert.equal(await page.locator('#ownerSidebar > [data-owner-nav="' + id + '"]').count(), 1, id + ' is top level');

// Toggle opens and closes; aria-expanded follows.
await page.locator('[data-dept-toggle="classroom"]').click();
assert.equal(await page.locator('[data-dept-items="classroom"]').isVisible(), true);
assert.equal(await page.locator('[data-dept-toggle="classroom"]').getAttribute('aria-expanded'), 'true');
await page.locator('[data-dept-toggle="classroom"]').click();
assert.equal(await page.locator('[data-dept-items="classroom"]').isHidden(), true, 'clicking again collapses it');

// Landing on a nested section another way (settings search) opens its group,
// and the breadcrumb names the group.
await page.fill('#ownerGlobalSearch', 'media');
await page.waitForTimeout(200);
await page.locator('#ownerGlobalSearchResults [data-search-idx]').first().click();
await page.waitForTimeout(200);
assert.equal(await page.locator('[data-dept-items="website"]').isVisible(), true, 'navigating to a nested item auto-expands its group');
assert.match(await page.locator('#ownerBreadcrumb').innerText(), /owner portal\s*\/\s*website\s*\/\s*media library/i);
assert.equal((await page.locator('#ownerPageTitle').innerText()).trim(), 'Media Library');

// Bookings is one click, no disclosure.
await page.locator('#ownerSidebar > [data-owner-nav="bookings"]').click();
assert.equal(await page.locator('[data-owner-section="bookings"]').isVisible(), true);
assert.match(await page.locator('#ownerBreadcrumb').innerText(), /owner portal\s*\/\s*bookings/i);

// Resources → Resources Shop still opens the real Store Management panel.
await page.locator('[data-dept-toggle="resources"]').click();
await page.locator('[data-owner-nav="store"]').click();
assert.equal(await page.locator('[data-owner-section="store"]').isVisible(), true);
await page.waitForSelector('#ownerStoreTabs', { timeout: 10000 });

// Disclosure state persists across a reload.
await page.locator('[data-dept-toggle="settings"]').click();
await page.reload({ waitUntil: 'domcontentloaded' });
await page.locator('#navMemberPortal').click();
await page.waitForSelector('[data-dept-toggle="settings"]', { timeout: 15000 });
assert.equal(await page.locator('[data-dept-items="settings"]').isVisible(), true, 'disclosure state survives a reload');

assert.deepEqual(errors, []);
await browser.close();
console.log('owner_portal_nav_restructure=ok');
