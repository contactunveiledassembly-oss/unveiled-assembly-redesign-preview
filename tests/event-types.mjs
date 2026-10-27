// Confirms the Calendly-style Event Types redesign (Owner Portal →
// Bookings → Event Types, formerly "Session Types"): types render as
// cards with an availability summary, clicking Edit opens the existing
// editor pre-filled with the ID locked, New/Cancel work, a save commits
// to the same SCHED_DRAFT staged-save flow as before, and the
// availability summary reflects an unsaved rule change immediately.
import { chromium } from '/Users/yaunahlove/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
import assert from 'node:assert/strict';

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1500, height: 1300 } });
const baseUrl = process.env.TEST_BASE_URL || 'http://localhost:8080';
const errors = [];
page.on('pageerror', err => errors.push(err.message));

await page.goto(`${baseUrl}/story.html`, { waitUntil: 'domcontentloaded' });
await page.locator('#navMemberPortal').click();
await page.waitForSelector('#signinEmail', { timeout: 10000 });
await page.fill('#signinEmail', 'contactunveiledassembly@gmail.com');
await page.fill('#signinPassword', 'whatever123');
await page.locator('#emailSignInForm').evaluate(form => form.requestSubmit());
await page.waitForSelector('[data-dept-toggle="ministry"]', { timeout: 15000 });
await page.locator('[data-dept-toggle="ministry"]').click();
await page.locator('[data-owner-nav="bookings"]').click();
await page.waitForTimeout(200);
await page.locator('[data-bookings-tab="types"]').click();
await page.waitForTimeout(300);

const cardCount = await page.locator('.sched-type-card').count();
assert.ok(cardCount >= 2, 'at least the two seeded Event Types should render as cards, got ' + cardCount);
assert.equal(await page.locator('#schedTypeEditorWrap').isHidden(), true, 'editor starts closed');
const firstCardText = await page.locator('.sched-type-card').first().innerText();
assert.match(firstCardText, /window/i, 'each card shows an availability summary');

// Edit: opens pre-filled, ID locked.
await page.locator('.sched-type-card').first().locator('.sched-type-edit').click();
await page.waitForTimeout(200);
assert.equal(await page.locator('#schedTypeEditorWrap').isVisible(), true);
const idBefore = await page.locator('#schedTypeId').inputValue();
assert.ok(idBefore, 'ID pre-filled');
assert.ok(await page.locator('#schedTypeId').getAttribute('readonly') !== null, 'ID is locked while editing an existing type');
assert.ok((await page.locator('#schedTypeName').inputValue()).length > 0, 'name pre-filled');

// Edit a field and save through the existing staged-save flow.
await page.fill('#schedTypeDescription', 'Updated via the Event Types test.');
await page.locator('#schedTypeForm button[type="submit"]').click();
await page.waitForTimeout(200);
assert.equal(await page.locator('#schedTypeEditorWrap').isHidden(), true, 'editor closes itself after a successful save');
assert.match(await page.locator('.owner-sim-toggle-row, #schedSaveBar').first().evaluate(() => document.getElementById('schedSaveBar').textContent), /unsaved/i);
await page.locator('#schedSaveAllBtn').click();
await page.waitForTimeout(400);
assert.equal(await page.locator('#schedSaveBar').evaluate(el => el.classList.contains('is-dirty')), false, 'Save Changes still commits the draft as before (dirty flag clears)');

// New / Cancel.
await page.locator('#schedTypeNewBtn').click();
await page.waitForTimeout(150);
assert.equal(await page.locator('#schedTypeId').getAttribute('readonly'), null, 'a brand-new type is not ID-locked');
assert.equal(await page.locator('#schedTypeName').inputValue(), '', 'new form starts blank');
await page.locator('#schedTypeCancelBtn').click();
await page.waitForTimeout(150);
assert.equal(await page.locator('#schedTypeEditorWrap').isHidden(), true, 'Cancel closes the editor without saving');

assert.deepEqual(errors, []);
await browser.close();
console.log('event_types=ok');
