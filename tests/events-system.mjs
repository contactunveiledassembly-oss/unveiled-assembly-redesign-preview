import { chromium } from '/Users/yaunahlove/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
import assert from 'node:assert/strict';

const baseUrl = process.env.TEST_BASE_URL || 'http://localhost:8080';
const browser = await chromium.launch({ headless: true });
const errors = [];

try {
  const desktop = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
  desktop.on('pageerror', error => errors.push(error.message));
  await desktop.goto(`${baseUrl}/events.html`, { waitUntil: 'networkidle' });

  assert.equal(await desktop.locator('#eventsHeroTitle').textContent(), 'Assembly Nights');
  assert.match(await desktop.locator('#eventsPoster').textContent(), /AssemblyNights/i);
  assert.equal(await desktop.locator('#links [data-page="events"]').getAttribute('class'), 'current');

  await desktop.evaluate(() => {
    const dialog = document.querySelector('#memberPortalDialog');
    if (!dialog.open) dialog.showModal();
    document.querySelectorAll('.portal-view').forEach(view => { view.hidden = view.dataset.portalView !== 'owner'; });
    document.querySelectorAll('[data-owner-section]').forEach(section => { section.hidden = section.dataset.ownerSection !== 'events'; });
  });

  assert.equal(await desktop.locator('[data-owner-section="events"]').isVisible(), true);
  assert.equal(await desktop.locator('#eventAdminTitle').inputValue(), 'Assembly Nights');
  assert.equal(await desktop.locator('#eventAdminStatus').inputValue(), 'published');
  assert.equal(await desktop.locator('#eventAdminPageMode').inputValue(), 'live');

  await desktop.evaluate(() => {
    const events = JSON.parse(localStorage.getItem('ua_preview_events_v1')) || [];
    const fallback = { id:'assembly-nights', title:'Assembly Nights', status:'published', featured:true };
    localStorage.setItem('ua_preview_events_v1', JSON.stringify([{ ...(events[0] || fallback), pageMode:'empty' }]));
  });
  await desktop.reload({ waitUntil:'networkidle' });
  assert.equal(await desktop.locator('#eventsHeroTitle').textContent(), 'Stay Close');
  assert.equal(await desktop.locator('#eventsStatusLine').textContent(), 'No Upcoming Events');
  assert.equal(await desktop.locator('[data-events-nav-link]').first().isVisible(), true);

  await desktop.evaluate(() => {
    const events = JSON.parse(localStorage.getItem('ua_preview_events_v1'));
    events[0].pageMode = 'hidden';
    localStorage.setItem('ua_preview_events_v1', JSON.stringify(events));
  });
  await desktop.reload({ waitUntil:'networkidle' });
  assert.equal(await desktop.locator('[data-events-nav-link]').first().isHidden(), true);

  const tablet = await browser.newPage({ viewport: { width: 1024, height: 844 } });
  tablet.on('pageerror', error => errors.push(error.message));
  await tablet.goto(`${baseUrl}/events.html`, { waitUntil: 'networkidle' });
  assert.equal(await tablet.locator('.menu-btn').evaluate(element => getComputedStyle(element).display), 'block');
  assert.equal(await tablet.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);

  const mobile = await browser.newPage({ viewport: { width: 390, height: 844 } });
  mobile.on('pageerror', error => errors.push(error.message));
  await mobile.goto(`${baseUrl}/events.html`, { waitUntil: 'networkidle' });
  assert.equal(await mobile.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);
  assert.equal(await mobile.locator('#eventsHeroTitle').isVisible(), true);
  assert.equal(await mobile.locator('#eventsPoster').isVisible(), true);

  assert.deepEqual(errors, []);
  console.log('events_system=ok');
} finally {
  await browser.close();
}
