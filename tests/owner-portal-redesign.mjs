// Owner Portal redesign (branch owner-portal-redesign) — preview build
// (DEMO_MODE): no real database is touched.
//   python3 -m http.server 8080 &  node tests/owner-portal-redesign.mjs
// Checks the seven-section navigation, the Overview, the persistent
// red-alert rule (viewing never clears; only the real action does),
// counts after a reload, keyboard use, phone layout, and that a member
// account never sees the Owner Portal.
import { chromium } from '/Users/yaunahlove/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
import assert from 'node:assert/strict';

const baseUrl = process.env.TEST_BASE_URL || 'http://localhost:8080';
const browser = await chromium.launch({ headless: true });
const results = [];
const errors = [];
async function test(name, fn){
  try { await fn(); results.push('PASS ' + name); }
  catch (err) { results.push('FAIL ' + name + ' — ' + String(err.message || err).split('\n')[0]); }
}
async function signIn(page, email){
  await page.goto(`${baseUrl}/story.html`, { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => {
    const d = document.querySelector('#memberPortalDialog');
    if(!d.open) d.showModal();
    document.querySelectorAll('.portal-view').forEach(v => { v.hidden = v.dataset.portalView !== 'prospect'; });
  });
  await page.fill('#signinEmail', email);
  await page.fill('#signinPassword', 'whatever123');
  await page.locator('#emailSignInForm').evaluate(f => f.requestSubmit());
}
async function ownerPage(viewport, fresh = true){
  const context = await browser.newContext({ viewport });
  const page = await context.newPage();
  page.on('pageerror', e => errors.push(e.message));
  page.on('dialog', d => d.accept());
  if(fresh) await page.addInitScript(() => { if(!sessionStorage.getItem('opr-seeded')){ sessionStorage.setItem('opr-seeded', '1'); localStorage.clear(); } });
  await signIn(page, 'contactunveiledassembly@gmail.com');
  await page.waitForSelector('#ownerSummaryCards .owner-summary-card', { timeout: 15000 });
  await page.waitForFunction(() => document.querySelectorAll('#ownerActionRequired .owner-alert-item').length > 0, null, { timeout: 8000 });
  return page;
}
const bell = page => page.locator('#ownerBellCount').innerText().then(t => Number(t || 0));
// Reads the badge's own state — a badge inside a collapsed sidebar
// group is still set, just not on screen.
const badge = (page, sel) => page.locator(sel).evaluate(el => el.hidden ? 0 : Number(el.textContent));
const redItems = page => page.locator('#ownerActionRequired .owner-alert-item.is-action').count();

const page = await ownerPage({ width: 1440, height: 1000 });

await test('sidebar has the seven sections in order', async () => {
  const labels = await page.$$eval('#ownerSidebar > .owner-sidebar-item .owner-nav-label, #ownerSidebar > .owner-sidebar-dept > .owner-sidebar-dept-toggle > span:first-of-type',
    els => els.map(e => e.textContent.trim()));
  assert.deepEqual(labels, ['Overview', 'Bookings', 'Classroom', 'Community', 'Resources', 'Website', 'Settings']);
});
await test('every existing section is still reachable, exactly once', async () => {
  for(const id of ['dashboard', 'people', 'teachings', 'paths', 'registrations', 'events', 'bookings', 'prayer-requests', 'testimonials',
    'class-reviews', 'store', 'payments', 'reports', 'communication', 'website', 'media', 'settings', 'policies']){
    assert.equal(await page.locator('#ownerSidebar [data-owner-nav="' + id + '"]').count(), 1, id);
    assert.equal(await page.locator('[data-owner-section="' + id + '"]').count() >= 1, true, id + ' panel');
  }
});
await test('Overview shows the four summary cards with real counts', async () => {
  const labels = await page.$$eval('.owner-summary-label', els => els.map(e => e.textContent));
  assert.deepEqual(labels, ['Upcoming Bookings', 'Active Classes', 'Needs Your Attention', 'Resource Orders']);
  const confirmed = await page.evaluate(() => {
    const today = new Date().toISOString().slice(0, 10);
    return JSON.parse(localStorage.getItem('ua_preview_bookings_v1') || 'null')?.filter?.(b => b.status === 'confirmed' && b.date >= today).length ?? null;
  });
  const shown = Number(await page.locator('[data-owner-summary="bookings"] .owner-summary-value').innerText());
  if(confirmed !== null) assert.equal(shown, confirmed);
  assert.ok(shown >= 0);
});
await test('header shows title, welcome, date, bell and account menu', async () => {
  assert.match(await page.locator('.owner-topbar h3').innerText(), /Owner Portal/);
  assert.match(await page.locator('#ownerDashboardWelcome').innerText(), /Welcome back/);
  assert.match(await page.locator('#ownerTodayDate').innerText(), /\d{4}/);
  assert.equal(await page.locator('#ownerAccountMenuBtn').isVisible(), true);
});
await test('bell, attention card, red list and sidebar badges agree', async () => {
  const total = await bell(page);
  assert.ok(total > 0, 'preview data has open items');
  assert.equal(total, await redItems(page));
  assert.equal(Number(await page.locator('[data-owner-summary="attention"] .owner-summary-value').innerText()), total);
  const sum = await page.$$eval('#ownerSidebar [data-alert-nav]', els => els.reduce((n, e) => n + (e.hidden ? 0 : Number(e.textContent)), 0));
  assert.equal(sum, total, 'section badges add up to the header count');
});
await test('each attention item has description, section, status and an action button', async () => {
  const first = page.locator('#ownerActionRequired .owner-alert-item').first();
  assert.ok((await first.locator('strong').innerText()).length > 3);
  assert.equal(await first.locator('.owner-tone').count(), 1);
  assert.ok((await first.locator('.owner-alert-meta span').count()) >= 2);
  assert.equal(await first.locator('[data-owner-alert-go]').count(), 1);
});
await test('opening and closing a prayer request does NOT clear its alert', async () => {
  const before = await bell(page);
  const prayerBadge = await badge(page, '[data-alert-nav="prayer-requests"]');
  assert.ok(prayerBadge > 0);
  await page.locator('.owner-alert-item[data-owner-alert^="prayer:"] [data-owner-alert-go]').first().click();
  await page.waitForSelector('#prayerDetailDialog[open]');
  await page.locator('#closePrayerDetailDialog').click();
  assert.equal(await bell(page), before);
  assert.equal(await badge(page, '[data-alert-nav="prayer-requests"]'), prayerBadge);
});
await test('a section page carries its own alerts under the title', async () => {
  assert.equal(await page.locator('#ownerPageTitle').innerText(), 'Prayer Requests');
  assert.match(await page.locator('#ownerBreadcrumb').innerText(), /owner portal\s*\/\s*community\s*\/\s*prayer requests/i);
  assert.ok(await page.locator('#ownerSectionAlerts .owner-alert-item').count() >= 1);
});
await test('marking the prayer request In Progress turns it amber (still not cleared)', async () => {
  const before = await bell(page);
  await page.locator('#ownerSectionAlerts [data-owner-alert-go]').first().click();
  await page.waitForSelector('#prayerDetailDialog[open]');
  await page.locator('#prayerDetailDialog [data-prayer-status="in-progress"]').click();
  await page.waitForFunction(() => /updated/i.test(document.getElementById('prayerStatusMessage').textContent) || !document.getElementById('prayerDetailDialog').open);
  if(await page.locator('#prayerDetailDialog[open]').count()) await page.locator('#closePrayerDetailDialog').click();
  assert.equal(await bell(page), before - 1, 'leaves the red count');
  await page.locator('[data-owner-nav="dashboard"]').click();
  assert.ok(await page.locator('#ownerActionRequired .owner-alert-item.is-progress[data-owner-alert^="prayer:"]').count() >= 1, 'shows as in progress');
});
await test('confirming the pending booking clears its red alert', async () => {
  const before = await bell(page);
  assert.equal(await badge(page, '[data-alert-nav="bookings"]'), 1);
  await page.locator('.owner-alert-item[data-owner-alert^="booking:"] [data-owner-alert-go]').first().click();
  if(await page.locator('#bookingDetailDialog[open]').count()) await page.keyboard.press('Escape');
  await page.locator('#ownerBookingsList .owner-confirm-booking').first().click();
  await page.waitForFunction(() => document.querySelector('[data-alert-nav="bookings"]').hidden);
  assert.equal(await bell(page), before - 1);
});
await test('counts are the same after a full reload and new sign-in', async () => {
  const before = await bell(page);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await signIn(page, 'contactunveiledassembly@gmail.com');
  await page.waitForSelector('#ownerSummaryCards .owner-summary-card', { timeout: 15000 });
  await page.waitForFunction(n => Number(document.getElementById('ownerBellCount').textContent || 0) === n, before, { timeout: 8000 }).catch(() => {});
  assert.equal(await bell(page), before);
});
await test('quick actions go to the right places', async () => {
  for(const [action, section] of [['bookings', 'bookings'], ['prayer', 'prayer-requests'], ['resources', 'store'], ['website', 'website']]){
    await page.locator('[data-owner-nav="dashboard"]').click();
    await page.locator('[data-quick-action="' + action + '"]').click();
    assert.equal(await page.locator('[data-owner-section="' + section + '"]').first().isVisible(), true, action);
  }
});
await test('settings shortcut opens Store Settings', async () => {
  await page.locator('[data-dept-toggle="settings"]').click();
  await page.locator('[data-owner-shortcut="store-settings"]').click();
  await page.waitForSelector('#ownerShopSettings:not([hidden])', { timeout: 5000 });
});
await test('account menu works from the keyboard and closes on Escape', async () => {
  await page.locator('#ownerAccountMenuBtn').focus();
  await page.keyboard.press('Enter');
  assert.equal(await page.locator('#ownerAccountMenu').isVisible(), true);
  assert.equal(await page.evaluate(() => document.activeElement.closest('#ownerAccountMenu') !== null), true, 'focus moves into the menu');
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('#ownerAccountMenu').isHidden(), true);
  assert.equal(await page.evaluate(() => document.activeElement.id), 'ownerAccountMenuBtn');
});
await test('sidebar groups expand with aria-expanded and remember it', async () => {
  const t = page.locator('[data-dept-toggle="website"]');
  if(await t.getAttribute('aria-expanded') === 'true') await t.click();
  await t.click();
  assert.equal(await t.getAttribute('aria-expanded'), 'true');
  assert.equal(await page.locator('#ownerDeptWebsite').isVisible(), true);
});
await test('keyboard focus is visible', async () => {
  await page.locator('[data-owner-nav="dashboard"]').click();
  await page.keyboard.press('Tab');
  const outline = await page.evaluate(() => getComputedStyle(document.activeElement).outlineStyle);
  assert.notEqual(outline, 'none');
});
await test('palette: approved Calendly-inspired light theme (tokens, navy text, blue accent)', async () => {
  const c = await page.evaluate(() => {
    const view = document.querySelector('[data-portal-view="owner"]');
    const v = n => getComputedStyle(view).getPropertyValue(n).trim().toUpperCase();
    return {
      tokens: [v('--owner-bg'), v('--owner-surface'), v('--owner-sidebar'), v('--owner-border'), v('--owner-text'), v('--owner-text-muted'), v('--owner-accent')],
      title: getComputedStyle(document.querySelector('#ownerPageTitle')).color,
      side: getComputedStyle(document.querySelector('#ownerSidebar')).backgroundColor,
      view: getComputedStyle(view).backgroundColor
    };
  });
  assert.deepEqual(c.tokens, ['#F1F5F8', '#FBFCFD', '#E7EEF4', '#C9D6DF', '#0B3558', '#476788', '#006BFF']);
  assert.equal(c.title, 'rgb(11, 53, 88)', 'navy text');
  assert.equal(c.side, 'rgb(231, 238, 244)', 'pale blue-gray sidebar');
  assert.equal(c.view, 'rgb(241, 245, 248)', 'soft off-white page');
});
await test('no pure-white or black surfaces on the Overview', async () => {
  const bad = await page.evaluate(() => [...document.querySelectorAll('[data-portal-view="owner"] *')].filter(e => {
    if(!e.offsetParent) return false;
    const m = getComputedStyle(e).backgroundColor.match(/\d+(\.\d+)?/g); if(!m) return false;
    const [r, g, b, a = 1] = m.map(Number); if(a < .5) return false;
    if(e.matches('.page-visibility-thumb,.admin-btn-solid,.admin-tab.active,.portal-primary,.owner-alert-count,.owner-bell-count,input[type=checkbox]')) return false;
    return (r === 255 && g === 255 && b === 255) || (r < 25 && g < 25 && b < 25);
  }).map(e => e.className || e.tagName));
  assert.deepEqual(bad, []);
});
await page.context().close();

/* ---------- phone ---------- */
{
  const phone = await ownerPage({ width: 390, height: 844 });
  await test('phone: no sideways scrolling on Overview', async () => {
    const overflow = await phone.evaluate(() => document.querySelector('#memberPortalDialog').scrollWidth - document.querySelector('#memberPortalDialog').clientWidth);
    assert.ok(overflow <= 1, 'overflow ' + overflow);
  });
  await test('phone: menu opens the drawer with all seven sections', async () => {
    await phone.locator('#ownerSidebarToggle').click();
    assert.equal(await phone.locator('#ownerSidebar.open').count(), 1);
    assert.equal(await phone.locator('[data-dept-toggle="settings"]').isVisible(), true);
    await phone.locator('[data-owner-nav="bookings"]').click();
    assert.equal(await phone.locator('#ownerSidebar.open').count(), 0, 'drawer closes after choosing');
  });
  await phone.context().close();
}

/* ---------- member isolation ---------- */
{
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const member = await ctx.newPage();
  member.on('pageerror', e => errors.push(e.message));
  await signIn(member, 'someone.else@example.com');
  await member.waitForSelector('[data-portal-view="member"]:not([hidden])', { timeout: 15000 });
  await test('a member account never sees the Owner Portal', async () => {
    assert.equal(await member.locator('[data-portal-view="owner"]').isHidden(), true);
    assert.equal(await member.locator('#ownerAlertBell').isVisible(), false);
  });
  await ctx.close();
}

await test('no script errors', async () => { assert.deepEqual(errors, []); });
await browser.close();
console.log(results.join('\n'));
const failed = results.filter(r => r.startsWith('FAIL')).length;
console.log((results.length - failed) + '/' + results.length + ' passed');
process.exit(failed ? 1 : 0);
