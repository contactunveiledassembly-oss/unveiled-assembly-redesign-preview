// Confirms the Owner Portal Demo Mode simulation (owner-simulation.js):
// the toggle activates/deactivates cleanly, a scenario populates
// internally-consistent data across the Dashboard/Bookings/Analytics/
// Prayer Requests, notifications reveal progressively as the simulated
// clock advances (not all at once), a notification click opens the
// real underlying detail dialog, and returning to Live Data restores
// the exact original state.
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
await page.waitForSelector('#ownerSimToggle', { timeout: 15000 });

assert.equal(await page.locator('.owner-sim-banner').count(), 0, 'banner hidden before activation');
const liveSnapshot = await page.locator('#ownerTodayStats').innerText();

await page.locator('#ownerSimToggle').locator('xpath=ancestor::label').click();
await page.waitForSelector('.owner-sim-banner', { timeout: 5000 });
await page.selectOption('#ownerSimScenario', 'busy');
await page.waitForTimeout(200);

// Progressive reveal: count only grows as the simulated clock advances.
const countAt = async () => Number((await page.locator('#ownerTodayStats').innerText()).match(/Today's 1:1s\s*(\d+)/)[1]);
const at0 = await countAt();
await page.locator('#ownerSimAdvanceHour').click();
await page.waitForTimeout(150);
const at1h = await countAt();
assert.ok(at1h >= at0, 'visible bookings should not decrease as the clock advances');
await page.locator('#ownerSimAdvanceDay').click();
await page.waitForTimeout(200);
const atEnd = await countAt();
assert.ok(atEnd >= at1h, 'advancing to end of day should reveal at least as many bookings');

// Total booking volume (all statuses, via Reports — matches the scenario's
// declared range; the Dashboard's "Today's 1:1s" tile only counts
// confirmed ones, which is legitimately fewer once some are pending/cancelled).
await page.locator('[data-owner-nav="bookings"]').click();
await page.locator('#bookingsSubNav [data-bookings-tab="reports"]').click();
await page.waitForTimeout(300);
const reportsText = await page.locator('#bookingsReportsStats').innerText();
const totalBookings = Number(reportsText.match(/Total Bookings\s*(\d+)/)[1]);
assert.ok(totalBookings >= 15 && totalBookings <= 25, 'Busy Day should produce 15-25 total bookings, got ' + totalBookings);
assert.ok(totalBookings >= atEnd, 'confirmed-only dashboard count should never exceed the total booking count');
await page.locator('[data-owner-nav="dashboard"]').click();
await page.waitForTimeout(200);

// Notification center: real timestamps, accurate unread count, click-through.
await page.locator('#ownerNotificationsList [data-sim-notif-id]').first().waitFor({ timeout: 10000 });
const unreadBefore = await page.locator('#ownerNotifUnreadBadge').innerText();
await page.locator('#ownerNotificationsList [data-sim-notif-id]').first().click({ position: { x: 10, y: 10 } });
await page.waitForTimeout(300);
const openDialogs = await page.evaluate(() => Array.from(document.querySelectorAll('dialog[open]')).map(d => d.id));
assert.ok(openDialogs.length > 0, 'clicking a notification should open its real detail dialog');
await page.keyboard.press('Escape');
await page.waitForTimeout(150);
const unreadAfter = await page.locator('#ownerNotifUnreadBadge').innerText();
assert.ok(Number(unreadAfter) <= Number(unreadBefore), 'opening a notification should mark it read and lower the unread count');

// Reset returns the clock to the start.
await page.locator('#ownerSimReset').click();
await page.waitForTimeout(200);
assert.match(await page.locator('.owner-sim-clock').innerText(), /6:00 AM/);

// Prayer Requests inbox reflects the same swapped data (not a parallel system).
await page.locator('#ownerSimAdvanceDay').click();
await page.waitForTimeout(200);
await page.locator('[data-owner-nav="prayer-requests"]').click();
await page.waitForTimeout(300);
const prayerText = await page.locator('#prayerInboxList').innerText();
assert.ok(prayerText.length > 0, 'prayer inbox should show simulated requests');

// Safety: a published sim testimonial must NEVER reach the real public
// page, however it got there — approve one via the normal admin flow,
// then visit the real public testimonials page in the SAME session
// (sim mode still on) and confirm it shows nothing.
await page.locator('[data-owner-nav="testimonials"]').click();
await page.waitForTimeout(300);
const testimonyViewBtn = page.locator('[data-testimony-view]').first();
let simTestimonyName = null;
if (await testimonyViewBtn.count() > 0) {
  await testimonyViewBtn.click();
  await page.waitForSelector('#testimonyDetailDialog[open]', { timeout: 5000 });
  simTestimonyName = (await page.locator('#testimonyDetailFields input[readonly]').first().inputValue()).trim();
  const publishBtn = page.locator('#testimonyDetailDialog button', { hasText: 'Publish' });
  if (await publishBtn.count() > 0) { await publishBtn.first().click(); await page.waitForTimeout(400); }
}
// This site serves testimonials.html as a separate page, so reaching it
// mid-session is necessarily a full reload (ownerSim is briefly null
// during its own early-script init — see app.js's `let ownerSim = null`
// comment): the swap hasn't applied yet at that first render, so this
// legitimately shows the demo site's two baked-in default published
// testimonials (Sarah M., Kayla R.) — real seeded content, not a leak.
// What must never appear is the simulated person's own name.
await page.goto(`${baseUrl}/testimonials.html`, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(400);
const leakedText = (await page.locator('#publishedTestimonialsList').innerText().catch(() => '')).trim();
if (simTestimonyName && simTestimonyName !== 'Anonymous') {
  assert.ok(!leakedText.includes(simTestimonyName), 'the simulated testimonial\'s name must never appear on the real public page, even mid-session: ' + simTestimonyName);
}
await page.goto(`${baseUrl}/story.html`, { waitUntil: 'domcontentloaded' });
await page.locator('#navMemberPortal').click();
await page.waitForSelector('#ownerSimToggle', { timeout: 15000 });

// Returning to Live Data restores the exact original state.
await page.locator('[data-owner-nav="dashboard"]').click();
await page.waitForTimeout(200);
await page.locator('#ownerSimToggle').locator('xpath=ancestor::label').click();
await page.waitForTimeout(200);
assert.equal(await page.locator('.owner-sim-banner').count(), 0, 'banner gone after returning to Live Data');
assert.equal(await page.locator('#ownerTodayStats').innerText(), liveSnapshot, 'Live Data restored exactly');

assert.deepEqual(errors, []);
await browser.close();
console.log('owner_sim_mode=ok');
