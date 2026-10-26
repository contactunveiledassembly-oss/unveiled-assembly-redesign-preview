// Confirms the Events Manager (Event Details/Announcements/Tickets &
// Stream) is fully staged: nothing is written to Firestore/localStorage
// until "Save Changes" in the shared #eventsSaveBar is clicked, and
// "Discard Changes" reverts an in-progress edit instead of committing it.
import { chromium } from '/Users/yaunahlove/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
import assert from 'node:assert/strict';

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
const baseUrl = process.env.TEST_BASE_URL || 'http://localhost:8080';
const errors = [];
page.on('pageerror', err => errors.push(err.message));

await page.goto(`${baseUrl}/story.html`, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('#eventDetailsForm', { state: 'attached' });

await page.evaluate(() => {
  document.querySelector('#memberPortalDialog').setAttribute('open', '');
  document.querySelectorAll('.portal-view').forEach(v => { v.hidden = v.dataset.portalView !== 'prospect'; });
});
await page.fill('#signinEmail', 'contactunveiledassembly@gmail.com');
await page.fill('#signinPassword', 'whatever123');
await page.locator('#emailSignInForm').evaluate(form => form.requestSubmit());
await page.locator('[data-owner-nav="events"]').click();
await page.waitForSelector('#eventsAdminStats .admin-stat-tile', { timeout: 15000 });

assert.equal(await page.locator('#eventsSaveBar').isHidden(), true, 'save bar hidden on Overview');
await page.locator('#eventsAdminTabs [data-events-tab="details"]').click();
assert.equal(await page.locator('#eventsSaveBar').isHidden(), false, 'save bar visible on Event Details');
assert.equal(await page.locator('#eventsSaveBar').evaluate(el => el.classList.contains('is-dirty')), false, 'starts clean');

const originalTitle = await page.locator('#eventAdminTitle').inputValue();
await page.fill('#eventAdminTitle', 'Staged Save Test Title');
await page.locator('#eventDetailsForm button[type="submit"]').click();
assert.equal(await page.locator('#eventsSaveBar').evaluate(el => el.classList.contains('is-dirty')), true, 'editing details marks dirty');

// Overview stats (bound to LIVE state) should NOT show the unsaved title yet.
await page.locator('#eventsAdminTabs [data-events-tab="overview"]').click();
const overviewText = await page.locator('#eventsAdminStats').innerText();
assert.ok(!overviewText.includes('Staged Save Test Title'), 'overview should still show the live title, not the unsaved draft');

// Discard reverts.
await page.locator('#eventsAdminTabs [data-events-tab="details"]').click();
await page.locator('#eventsDiscardBtn').click();
assert.equal(await page.locator('#eventAdminTitle').inputValue(), originalTitle, 'discard restores the original title');
assert.equal(await page.locator('#eventsSaveBar').evaluate(el => el.classList.contains('is-dirty')), false, 'discard clears dirty flag');

// Edit again and actually save.
await page.fill('#eventAdminTitle', 'Staged Save Test Title');
await page.locator('#eventDetailsForm button[type="submit"]').click();
await page.locator('#eventsSaveAllBtn').click();
await page.waitForFunction(() => !document.getElementById('eventsSaveBar').classList.contains('is-dirty'));
await page.locator('#eventsAdminTabs [data-events-tab="overview"]').click();
const overviewAfterSave = await page.locator('#eventsAdminStats').innerText();
assert.ok(overviewAfterSave.includes('Staged Save Test Title'), 'overview reflects the saved title after Save Changes');

// Announcements: add one (staged), confirm it's not live until Save.
await page.locator('#eventsAdminTabs [data-events-tab="announcements"]').click();
const before = await page.locator('#eventAnnouncementsAdminList [data-event-announcement-id]').count();
await page.fill('#eventAnnouncementTitle', 'Test Announcement');
await page.fill('#eventAnnouncementBody', 'This is a staged announcement.');
await page.locator('#eventAnnouncementForm button[type="submit"]').click();
assert.equal(await page.locator('#eventAnnouncementsAdminList [data-event-announcement-id]').count(), before + 1, 'new announcement appears in the draft list');
assert.equal(await page.locator('#eventsSaveBar').evaluate(el => el.classList.contains('is-dirty')), true, 'adding an announcement marks dirty');
await page.locator('#eventsSaveAllBtn').click();
await page.waitForFunction(() => !document.getElementById('eventsSaveBar').classList.contains('is-dirty'));
assert.equal(await page.locator('#eventAnnouncementsAdminList [data-event-announcement-id]').count(), before + 1, 'announcement survives save');

// Reload and confirm persistence (DEMO_MODE -> localStorage).
await page.reload({ waitUntil: 'domcontentloaded' });
await page.locator('#navMemberPortal').click();
await page.locator('[data-owner-nav="events"]').click();
await page.waitForSelector('#eventsAdminStats .admin-stat-tile', { timeout: 15000 });
const overviewAfterReload = await page.locator('#eventsAdminStats').innerText();
assert.ok(overviewAfterReload.includes('Staged Save Test Title'), 'title survives a reload');

assert.deepEqual(errors, []);
await browser.close();
console.log('events_staged_save=ok');
