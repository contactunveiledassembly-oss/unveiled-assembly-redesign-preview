import { chromium } from '/Users/yaunahlove/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
import assert from 'node:assert/strict';

const baseUrl = process.env.TEST_BASE_URL || 'http://localhost:8080';
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1500, height: 1050 } });
const errors = [];
page.on('pageerror', error => errors.push(error.message));

try {
  await page.goto(`${baseUrl}/story.html`, { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => {
    const dialog = document.querySelector('#memberPortalDialog');
    if (!dialog.open) dialog.showModal();
    document.querySelectorAll('.portal-view').forEach(view => {
      view.hidden = view.dataset.portalView !== 'prospect';
    });
  });
  await page.fill('#signinEmail', 'demo@example.com');
  await page.fill('#signinPassword', 'whatever123');
  await page.locator('#emailSignInForm').evaluate(form => form.requestSubmit());
  await page.locator('[data-portal-view="member"]').waitFor({ state: 'visible' });
  assert.equal(await page.locator('#memberPreviewBar').isHidden(), true, 'owner-only preview controls must stay hidden for members');
  assert.equal((await page.locator('#memberWelcomeName').innerText()).trim(), 'Maya');

  const memberNavLabels = (await page.locator('#memberTabs [data-member-tab]').allInnerTexts())
    .map(label => label.replace(/\d+$/, '').trim());
  assert.deepEqual(memberNavLabels,
    ['Home', 'My Learning', 'My Schedule', 'Purchases & Downloads', 'My Submissions', 'Notifications', 'My Account']);
  assert.equal(await page.locator('#memberMobileNavSelect option').count(), 7);
  assert.match(await page.locator('[data-member-panel="dashboard"]').innerText(), /Continue Learning/i);
  assert.match(await page.locator('[data-member-panel="dashboard"]').innerText(), /Your Space/i);

  const panels = ['classes', 'sessions', 'receipts', 'submissions', 'notifications', 'account'];
  for (const panel of panels) {
    await page.locator(`#memberTabs [data-member-tab="${panel}"]`).click();
    assert.equal(await page.locator(`[data-member-panel="${panel}"]`).isVisible(), true, `${panel} panel should be visible`);
  }

  await page.locator('#memberTabs [data-member-tab="classes"]').click();
  assert.ok(await page.locator('#memberClassesList [data-member-view-classroom]').count() > 0, 'confirmed demo registrations should retain classroom access');

  await page.locator('#memberTabs [data-member-tab="receipts"]').click();
  const paymentLabels = await page.locator('#memberPurchasesList .admin-status-pill').allInnerTexts();
  assert.ok(paymentLabels.length > 0, 'member account history should contain records');
  assert.equal(paymentLabels.includes('Paid'), false, 'demo amounts without a verified transaction must not be called paid receipts');

  await page.locator('#memberTabs [data-member-tab="submissions"]').click();
  assert.equal(await page.locator('[data-open-prayer-form]').isVisible(), true);
  assert.equal(await page.locator('[data-open-story-form]').isVisible(), true);

  await page.locator('#memberTabs [data-member-tab="notifications"]').click();
  assert.deepEqual(
    await page.locator('#memberNotificationFilters [data-member-notification-filter]').allInnerTexts(),
    ['All', 'Classes', 'Appointments', 'Account']
  );

  assert.deepEqual(errors, []);
  console.log('member_portal_phase1=ok');
} finally {
  await browser.close();
}
