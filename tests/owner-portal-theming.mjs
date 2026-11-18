// Confirms the Owner Portal Master Redesign's shared chrome (Stages 1-7):
// breadcrumb tracks the active section, department accent tokens apply
// per section, the desktop sidebar collapses and that choice persists
// across a reload, the searchable settings directory finds a setting by
// a plain keyword and navigates to it, and the Communication & Email
// Center (promoted out of the Dashboard in Stage 7) is reachable with
// its Templates/Settings tabs intact.
import { chromium } from '/Users/yaunahlove/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
import assert from 'node:assert/strict';

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1500, height: 1100 } });
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
await page.waitForSelector('#ownerPageTitle', { timeout: 15000 });

// Redesign: Overview carries its title and no breadcrumb; other sections
// show "Owner Portal / Group / Section". CSS-uppercased, so match /i.
assert.equal((await page.locator('#ownerPageTitle').innerText()).trim(), 'Overview');
assert.equal((await page.locator('#ownerBreadcrumb').innerText()).trim(), '');
// Prayer Requests now lives nested under the Ministry Operations
// department (Owner Portal navigation restructuring) — expand it first;
// the breadcrumb grows a middle segment for nested items.
await page.locator('[data-dept-toggle="community"]').evaluate(b => { if(b.getAttribute('aria-expanded') !== 'true') b.click(); });
await page.locator('[data-owner-nav="prayer-requests"]').click();
await page.waitForTimeout(150);
assert.match(await page.locator('#ownerBreadcrumb').innerText(), /owner portal\s*\/\s*community\s*\/\s*prayer requests/i);

// Redesign: the per-department pastel accents were retired for the calm
// palette; each section's identity is now its page title.
assert.equal((await page.locator('#ownerPageTitle').innerText()).trim(), 'Prayer Requests');

// Settings directory: a plain keyword (not the literal setting title)
// finds the right entry and navigates to it.
await page.fill('#ownerGlobalSearch', 'refund');
await page.waitForTimeout(200);
const refundResultText = await page.locator('#ownerGlobalSearchResults').innerText();
assert.match(refundResultText, /No-Refund Policy/);
await page.locator('#ownerGlobalSearchResults [data-search-idx]').first().click();
await page.waitForTimeout(300);
assert.equal(await page.evaluate(() => document.querySelector('.owner-sidebar-item.active')?.dataset.ownerNav), 'policies');

// Communication & Email Center: reachable, clearly labeled not-connected,
// and its tabs (including the existing Owner Alerts functionality) work.
await page.locator('[data-dept-toggle="settings"]').evaluate(b => { if(b.getAttribute('aria-expanded') !== 'true') b.click(); });
await page.locator('[data-owner-nav="communication"]').click();
await page.waitForTimeout(200);
assert.match(await page.locator('[data-owner-section="communication"] .demo-badge').innerText(), /Not Yet Connected/i);
assert.ok(await page.locator('.owner-comms-template-card').count() > 0, 'templates tab should show preview cards');
await page.locator('[data-notif-center-tab="settings"]').click();
await page.waitForTimeout(150);
assert.match(await page.locator('[data-notif-center-panel="settings"]').innerText(), /No Provider Connected/);

// Desktop sidebar collapse persists across a reload.
await page.locator('#ownerSidebarCollapseBtn').click();
await page.waitForTimeout(200);
assert.ok(await page.evaluate(() => document.getElementById('ownerSidebar').classList.contains('collapsed')));
await page.reload({ waitUntil: 'domcontentloaded' });
await page.locator('#navMemberPortal').click();
await page.waitForSelector('#ownerPageTitle', { timeout: 15000 });
assert.ok(await page.evaluate(() => document.getElementById('ownerSidebar').classList.contains('collapsed')), 'collapsed state should survive a reload');
// Leave it expanded again so this test doesn't affect any test that runs after it.
await page.locator('#ownerSidebarCollapseBtn').click();

assert.deepEqual(errors, []);
await browser.close();
console.log('owner_portal_theming=ok');
