// Owner Portal review checks (Preview / DEMO_MODE on localhost — sample
// data only). Complements owner-portal-redesign.mjs and
// availability-workspace.mjs with what they don't already cover:
//   - every section and every tab inside it opens without script errors
//     and without sideways scrolling, on desktop and on a phone;
//   - a private prayer request's words never appear on the Overview;
//   - reduced-motion turns Owner Portal motion off;
//   - the production host shows no sample records. That check serves
//     this folder as theunveiledassembly.com inside the test browser
//     and BLOCKS every request to Firebase/Google back ends, so nothing
//     real is read or written.
//   python3 -m http.server 8080 &  node tests/owner-portal-review.mjs
import { chromium } from '/Users/yaunahlove/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const baseUrl = process.env.TEST_BASE_URL || 'http://localhost:8080';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const browser = await chromium.launch({ headless: true });
const results = [];
const errors = [];
async function test(name, fn){
  try { await fn(); results.push('PASS ' + name); }
  catch (err) { results.push('FAIL ' + name + ' — ' + String(err.message || err).split('\n')[0]); }
}
async function ownerPage(viewport, extra = {}){
  const context = await browser.newContext({ viewport, ...extra });
  const page = await context.newPage();
  page.on('pageerror', e => errors.push(viewport.width + 'px: ' + e.message));
  page.on('dialog', d => d.dismiss());
  await page.goto(`${baseUrl}/story.html`, { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#memberPortalDialog', { state: 'attached' });
  await page.evaluate(() => {
    const d = document.querySelector('#memberPortalDialog');
    if(!d.open) d.showModal();
    document.querySelectorAll('.portal-view').forEach(v => { v.hidden = v.dataset.portalView !== 'prospect'; });
  });
  await page.fill('#signinEmail', 'contactunveiledassembly@gmail.com');
  await page.fill('#signinPassword', 'preview-only-123');
  await page.locator('#emailSignInForm').evaluate(f => f.requestSubmit());
  await page.waitForSelector('#ownerSummaryCards .owner-summary-card', { timeout: 15000 });
  return page;
}
const SECTIONS = ['dashboard', 'bookings', 'teachings', 'registrations', 'paths', 'class-reviews', 'prayer-requests', 'testimonials',
  'events', 'people', 'store', 'payments', 'reports', 'website', 'media', 'policies', 'settings', 'communication'];
const overflow = page => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
// Tabs inside the open section: every visible tab-like button.
const tabSelector = '.admin-tab, [role="tab"]';

for(const [label, viewport] of [['desktop', { width: 1440, height: 1000 }], ['phone', { width: 390, height: 844 }]]){
  const page = await ownerPage(viewport);
  await test(`${label}: every section and tab opens with no sideways scrolling`, async () => {
    const problems = [];
    let tabsVisited = 0;
    for(const section of SECTIONS){
      await page.evaluate(n => document.querySelector('#ownerSidebar [data-owner-nav="' + n + '"]').click(), section);
      await page.waitForTimeout(250);
      const panel = page.locator('[data-owner-section="' + section + '"]').first();
      if(!(await panel.isVisible())) { problems.push(section + ' did not open'); continue; }
      if(await overflow(page) > 1) problems.push(section + ' scrolls sideways');
      const tabs = panel.locator(tabSelector);
      const n = await tabs.count();
      for(let i = 0; i < n; i++){
        const tab = tabs.nth(i);
        if(!(await tab.isVisible()) || await tab.isDisabled()) continue;
        await tab.evaluate(el => el.click());
        await page.waitForTimeout(120);
        tabsVisited++;
        if(await overflow(page) > 1) problems.push(section + ' › ' + (await tab.innerText()).trim() + ' scrolls sideways');
      }
    }
    assert.deepEqual(problems, []);
    assert.ok(tabsVisited > 20, 'tabs were actually exercised (' + tabsVisited + ')');
  });
  await test(`${label}: status labels are words, not colour alone`, async () => {
    await page.evaluate(() => document.querySelector('#ownerSidebar [data-owner-nav="dashboard"]').click());
    // Each alert carries its status as text (the coloured tone is extra).
    const tones = await page.$$eval('#ownerActionRequired .owner-alert-item', els => els.map(e => (e.querySelector('.owner-tone')?.textContent || '').trim()));
    assert.ok(tones.length > 0);
    assert.ok(tones.every(t => t.length > 2), JSON.stringify(tones));
    const pills = await page.$$eval('.portal-view[data-portal-view="owner"] .admin-status-pill', els => els.filter(e => e.offsetParent).map(e => e.textContent.trim()));
    assert.ok(pills.every(t => t.length > 0), 'every status pill has text');
  });
  await page.context().close();
}

await test('private prayer words never appear on the Overview', async () => {
  const page = await ownerPage({ width: 1440, height: 1000 });
  const secret = 'clarity and peace as I navigate a season of transition';
  await page.evaluate(() => document.querySelector('#ownerSidebar [data-owner-nav="prayer-requests"]').click());
  await page.waitForTimeout(300);
  await page.evaluate(() => document.querySelector('#ownerSidebar [data-owner-nav="dashboard"]').click());
  await page.waitForTimeout(300);
  const overview = await page.locator('[data-owner-section="dashboard"]').first().innerText();
  assert.match(overview, /prayer request/i, 'the alert itself is there');
  assert.ok(!overview.includes(secret), 'but not what was prayed for');
  assert.ok(!overview.includes('kendra@example.com') && !overview.includes('555-0100'), 'nor contact details');
  await page.context().close();
});

await test('reduced motion: Owner Portal transitions and animations are off', async () => {
  const page = await ownerPage({ width: 1440, height: 1000 }, { reducedMotion: 'reduce' });
  const moving = await page.evaluate(() => {
    const els = [...document.querySelectorAll('.portal-view[data-portal-view="owner"] *')].filter(e => e.offsetParent);
    return els.filter(e => {
      const cs = getComputedStyle(e);
      const t = cs.transitionDuration.split(',').some(v => parseFloat(v) > 0.01);
      const a = cs.animationName !== 'none' && cs.animationDuration.split(',').some(v => parseFloat(v) > 0.01);
      return t || a;
    }).length;
  });
  assert.equal(moving, 0);
  await page.context().close();
});

// ---- production host: real code path, back ends blocked ----
await test('production host: no sample records, no preview labels, nothing reaches Firebase', async () => {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const blocked = [];
  const allowedCdn = /^(www\.gstatic\.com|fonts\.googleapis\.com|fonts\.gstatic\.com)$/;
  await context.route('**/*', async route => {
    const url = new URL(route.request().url());
    if(url.hostname === 'theunveiledassembly.com'){
      const rel = decodeURIComponent(url.pathname).replace(/^\/+/, '') || 'index.html';
      const file = path.join(ROOT, rel.endsWith('/') ? rel + 'index.html' : rel);
      if(!file.startsWith(ROOT)) return route.abort();
      try {
        const body = await readFile(file);
        const type = file.endsWith('.html') ? 'text/html' : file.endsWith('.js') ? 'text/javascript' : file.endsWith('.css') ? 'text/css' : undefined;
        return route.fulfill({ status: 200, body, ...(type ? { contentType: type } : {}) });
      } catch (err) { return route.fulfill({ status: 404, body: 'not found' }); }
    }
    // Firebase SDK code and fonts only — no data endpoints.
    if(allowedCdn.test(url.hostname) && !/firestore|identitytoolkit|securetoken|cloudfunctions|firebaseinstallations/.test(url.hostname)) return route.continue();
    blocked.push(url.hostname);
    return route.abort();
  });
  const page = await context.newPage();
  const pageErrors = [];
  page.on('pageerror', e => pageErrors.push(e.message));
  const samples = /Maya Johnson|Jordan Lee|Sam Rivera|Kendra M|DEVELOPMENT PLACEHOLDER|Preview Sample|PREVIEWORDER|sample\.customer@example\.com|Owner preview — sample/i;
  for(const p of ['index.html', 'teachings.html', 'one-on-one.html', 'events.html', 'shop/index.html', 'prayer.html', 'testimonials.html']){
    await page.goto('https://theunveiledassembly.com/' + p, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1200);
    const text = await page.locator('body').innerText();
    assert.doesNotMatch(text, samples, p + ' shows sample data');
    assert.equal(await page.evaluate(() => document.body.classList.contains('demo-mode')), false, p + ' thinks it is the preview');
  }
  // www.google.com = reCAPTCHA for phone sign-in (also blocked here).
  const unexpected = blocked.filter(h => !/googleapis\.com|firebaseio\.com|cloudfunctions\.net|firebaseapp\.com|^www\.google\.com$/.test(h));
  assert.ok(blocked.length > 0, 'the real code path tried to reach Firebase (and was blocked)');
  assert.deepEqual([...new Set(unexpected)], [], 'no other outside hosts: ' + [...new Set(blocked)].join(', '));
  await context.close();
});

await test('no script errors in the Owner Portal', async () => assert.deepEqual([...new Set(errors)], []));
await browser.close();
console.log(results.join('\n'));
const failed = results.filter(r => r.startsWith('FAIL')).length;
console.log(`${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
