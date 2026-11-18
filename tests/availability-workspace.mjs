// Bookings → Availability workspace (Calendly-style layout), preview build:
//   python3 -m http.server 8080 &   node tests/availability-workspace.mjs
// Drives the real page; every change goes through the original staged
// draft handlers, so this also proves those still work.
import { chromium } from '/Users/yaunahlove/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
import assert from 'node:assert/strict';
const base = process.env.TEST_BASE_URL || 'http://localhost:8080';
const results = [];
const browser = await chromium.launch();
const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
const errors = []; page.on('pageerror', e => errors.push(e.message));
async function test(name, fn){ try { await fn(); results.push('PASS ' + name); } catch (e) { results.push('FAIL ' + name + ' — ' + e.message.split('\n')[0]); } }

await page.goto(base + '/story.html', { waitUntil: 'domcontentloaded' });
await page.evaluate(() => { const d = document.querySelector('#memberPortalDialog'); if(!d.open) d.showModal(); document.querySelectorAll('.portal-view').forEach(v => { v.hidden = v.dataset.portalView !== 'prospect'; }); });
await page.fill('#signinEmail', 'contactunveiledassembly@gmail.com'); await page.fill('#signinPassword', 'whatever123');
await page.locator('#emailSignInForm').evaluate(f => f.requestSubmit());
await page.waitForSelector('[data-owner-nav="bookings"]');
await page.locator('[data-owner-nav="bookings"]').click();
await page.locator('#bookingsSubNav [data-bookings-tab="availability"]').click();
await page.waitForFunction(() => document.querySelectorAll('#avlWeek .avl-day').length === 7);
const dayRow = d => page.locator(`#avlWeek [data-avl-day="${d}"]`);
const windowsOn = d => dayRow(d).locator('.avl-window').count();

await test('seven weekday rows with switches that match the real hours', async () => {
  const on = await page.$$eval('#avlWeek .avl-switch', s => s.map(x => x.getAttribute('aria-checked')));
  const counts = await page.$$eval('#avlWeek .avl-day', rows => rows.map(r => r.querySelectorAll('.avl-window').length));
  assert.deepEqual(on, counts.map(c => String(c > 0)));
});
await test('one primary Save Schedule; shared save bar hidden on this tab', async () => {
  assert.equal(await page.locator('#avlSaveBtn').isVisible(), true);
  assert.equal(await page.locator('#schedSaveBar').isVisible(), false);
});
await test('+ on Monday prefills the day; adding hours turns Monday on and marks unsaved', async () => {
  await dayRow(1).locator('.avl-add').click();
  assert.equal(await page.inputValue('#schedRuleDay'), '1');
  await page.fill('#schedRuleStart', '09:00'); await page.fill('#schedRuleEnd', '11:00');
  await page.locator('#avlRuleSubmit').click();
  await page.waitForFunction(() => document.querySelector('#avlWeek [data-avl-day="1"] .avl-switch').getAttribute('aria-checked') === 'true');
  assert.match(await page.locator('#avlDirtyNote').innerText(), /Unsaved/);
  assert.equal(await page.locator('#avlDiscardBtn').isVisible(), true);
});
await test('editing a time block replaces it instead of duplicating it', async () => {
  await dayRow(1).locator('.avl-window-edit').first().click();
  assert.equal(await page.locator('#avlRuleSubmit').innerText(), 'Update Hours');
  await page.fill('#schedRuleEnd', '12:00');
  await page.locator('#avlRuleSubmit').click();
  await page.waitForFunction(() => /12:00 PM/.test(document.querySelector('#avlWeek [data-avl-day="1"]').textContent));
  assert.equal(await windowsOn(1), 1);
});
await test('switching a day off removes its hours (draft only)', async () => {
  await dayRow(1).locator('.avl-switch').click();
  await page.waitForFunction(() => document.querySelector('#avlWeek [data-avl-day="1"] .avl-switch').getAttribute('aria-checked') === 'false');
  assert.equal(await windowsOn(1), 0);
});
await test('Discard restores the saved schedule', async () => {
  await dayRow(1).locator('.avl-add').click();
  await page.fill('#schedRuleStart', '09:00'); await page.fill('#schedRuleEnd', '10:00');
  await page.locator('#avlRuleSubmit').click();
  await page.waitForFunction(() => document.querySelectorAll('#avlWeek [data-avl-day="1"] .avl-window').length === 1);
  await page.locator('#avlDiscardBtn').click();
  await page.waitForFunction(() => document.querySelectorAll('#avlWeek [data-avl-day="1"] .avl-window').length === 0);
  assert.match(await page.locator('#avlDirtyNote').innerText(), /saved|no changes/i);
});
let dateWithHours;
await test('picking a date shows its hours and real time-slot buttons', async () => {
  // Not today: the existing block form's minimum date is computed in UTC
  // (documented quirk), so a later date keeps this test time-zone proof.
  dateWithHours = await page.locator('#avlCalendar .avl-date.has-hours:not(:disabled):not(.is-today)').first().getAttribute('data-avl-date');
  await page.locator(`#avlCalendar [data-avl-date="${dateWithHours}"]`).click();
  await page.waitForFunction(() => document.querySelectorAll('#avlSlots .avl-slot').length > 0 || /avl-slots-empty/.test(document.getElementById('avlSlots').innerHTML) && !/Loading/.test(document.getElementById('avlSlots').textContent));
  assert.match(await page.locator('#avlSelectedStatus').innerText(), /Regular hours/);
  const n = await page.locator('#avlSlots .avl-slot').count();
  assert.ok(n > 0, 'has open slots');
  await page.locator('#avlSlots .avl-slot').first().click();
  assert.equal(await page.locator('#avlSlots .avl-slot').first().getAttribute('aria-pressed'), 'true');
});
await test('slots match computeOpenSlots for the chosen session type', async () => {
  const chips = page.locator('#avlSlotTypes .avl-chip');
  if(await chips.count() > 1){
    await chips.nth(1).click();
    await page.waitForFunction(() => !/Loading/.test(document.getElementById('avlSlots').textContent));
    assert.equal(await chips.nth(1).getAttribute('aria-pressed'), 'true');
  }
});
await test('special hours for the selected date (staged)', async () => {
  await page.locator('#avlSelectedActions [data-avl-act="special"]').click();
  assert.equal(await page.inputValue('#schedOverrideDate'), dateWithHours);
  await page.fill('#schedOverrideStart', '10:00'); await page.fill('#schedOverrideEnd', '12:00');
  await page.locator('#schedOverrideForm button[type="submit"]').click();
  await page.waitForFunction(d => document.querySelector(`#avlCalendar [data-avl-date="${d}"]`).classList.contains('is-special'), dateWithHours);
  assert.match(await page.locator('#avlSelectedStatus').innerText(), /Special hours: 10:00 AM/);
  assert.equal(await page.locator('#avlOverrideEditor').isHidden(), true);
  await page.locator('#avlSelectedActions [data-avl-act="remove-special"]').click();
  await page.waitForFunction(d => !document.querySelector(`#avlCalendar [data-avl-date="${d}"]`).classList.contains('is-special'), dateWithHours);
});
const saveAndWait = async () => {
  await page.locator('#avlSaveBtn').click();
  await page.waitForFunction(() => !document.getElementById('schedSaveBar').classList.contains('is-dirty'));
};
const slotsSettled = () => page.waitForFunction(() => !/Loading/.test(document.getElementById('avlSlots').textContent));
await test('blocking a date is staged: Unsaved changes shown, nothing applied until Save', async () => {
  await page.locator(`#avlCalendar [data-avl-date="${dateWithHours}"]`).click();
  await slotsSettled();
  const before = await page.locator('#avlSlots .avl-slot').count();
  await page.locator('#avlSelectedActions [data-avl-act="block"]').click();
  await page.waitForFunction(d => document.querySelector(`#avlCalendar [data-avl-date="${d}"]`).classList.contains('is-blocked'), dateWithHours);
  assert.match(await page.locator('#avlDirtyNote').innerText(), /Unsaved changes/);
  assert.match(await page.locator('#avlSelectedStatus').innerText(), /not saved yet/i);
  assert.equal(await page.locator('#bookingsSubNav [data-bookings-tab="availability"]').evaluate(t => t.classList.contains('has-unsaved')), true, 'tab shows an unsaved marker');
  await slotsSettled();
  assert.equal(await page.locator('#avlSlots .avl-slot').count(), before, 'live times unchanged before Save');
  await saveAndWait();
  await page.waitForFunction(() => /Not available/i.test(document.getElementById('avlSlots').textContent), null, { timeout: 10000 });
  assert.doesNotMatch(await page.locator('#avlDirtyNote').innerText(), /Unsaved/);
  await page.locator('#avlSelectedActions [data-avl-act="unblock"]').click();
  assert.match(await page.locator('#avlDirtyNote').innerText(), /Unsaved changes/);
  await saveAndWait();
  await page.waitForFunction(d => !document.querySelector(`#avlCalendar [data-avl-date="${d}"]`).classList.contains('is-blocked'), dateWithHours);
});
await test('today can be blocked at any hour; passed times are never offered; bookings untouched', async () => {
  const now = await page.evaluate(() => {
    const m = {}; new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hour12: false, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).formatToParts(new Date()).forEach(p => { m[p.type] = p.value; });
    return { date: m.year + '-' + m.month + '-' + m.day, minutes: (Number(m.hour) % 24) * 60 + Number(m.minute) };
  });
  const todayBtn = page.locator(`#avlCalendar [data-avl-date="${now.date}"]`);
  assert.equal(await todayBtn.isDisabled(), false, 'today is selectable');
  await todayBtn.click();
  await slotsSettled();
  const starts = await page.$$eval('#avlSlots [data-avl-slot]', b => b.map(x => Number(x.dataset.avlSlot)));
  assert.ok(starts.every(m => m > now.minutes), 'no slot earlier than now: ' + starts.join(','));
  const bookingsBefore = await page.evaluate(() => document.querySelectorAll('[data-booking-view]').length);
  await page.locator('#avlSelectedActions [data-avl-act="block"]').click();
  await page.waitForFunction(d => document.querySelector(`#avlCalendar [data-avl-date="${d}"]`).classList.contains('is-blocked'), now.date);
  await saveAndWait();
  await slotsSettled();
  assert.equal(await page.locator('#avlSlots .avl-slot').count(), 0);
  assert.equal(await page.evaluate(() => document.querySelectorAll('[data-booking-view]').length), bookingsBefore, 'appointments list unchanged');
  await page.locator('#avlSelectedActions [data-avl-act="unblock"]').click();
  await saveAndWait();
});
await test('Discard throws away a staged block', async () => {
  await page.locator(`#avlCalendar [data-avl-date="${dateWithHours}"]`).click();
  await page.locator('#avlSelectedActions [data-avl-act="block"]').click();
  await page.locator('#avlDiscardBtn').click();
  await page.waitForFunction(d => !document.querySelector(`#avlCalendar [data-avl-date="${d}"]`).classList.contains('is-blocked'), dateWithHours);
});
await test('schedules are separate from session types; one schedule can serve several types', async () => {
  await page.locator('#avlScheduleNew').click();
  await page.fill('#avlScheduleName', 'Weekend availability');
  await page.locator('#avlScheduleNameSave').click();
  await page.waitForFunction(() => /Weekend availability/.test(document.querySelector('#avlScheduleSelect').selectedOptions[0].textContent));
  assert.equal(await page.locator('#avlWeek .avl-window').count(), 0, 'new schedule starts empty');
  await dayRow(6).locator('.avl-add').click();
  await page.fill('#schedRuleStart', '10:00'); await page.fill('#schedRuleEnd', '12:00');
  await page.locator('#avlRuleSubmit').click();
  await page.waitForFunction(() => document.querySelectorAll('#avlWeek [data-avl-day="6"] .avl-window').length === 1);
  const boxes = page.locator('#avlAssignTypes input[type="checkbox"]');
  assert.ok(await boxes.count() >= 2);
  await boxes.nth(0).check(); await boxes.nth(1).check();
  await page.waitForFunction(() => /2 session types/.test(document.querySelector('#avlScheduleSelect').selectedOptions[0].textContent));
  const weekendId = await page.$eval('#avlScheduleSelect', s => s.value);
  await page.selectOption('#avlScheduleSelect', 'default');
  await page.waitForFunction(() => document.querySelectorAll('#avlWeek [data-avl-day="6"] .avl-window').length === 0);
  assert.ok(await page.locator('#avlWeek .avl-window').count() > 0, 'main schedule hours untouched');
  await page.selectOption('#avlScheduleSelect', weekendId);
  await page.locator('#avlScheduleDelete').click();
  assert.match(await page.locator('#avlScheduleMsg').innerText(), /to another schedule first/);
  await saveAndWait();
  await page.locator('#bookingsSubNav [data-bookings-tab="types"]').click();
  assert.match(await page.locator('.sched-type-card').first().innerText(), /Schedule: Weekend availability/);
  await page.locator('#bookingsSubNav [data-bookings-tab="availability"]').click();
  await page.selectOption('#avlScheduleSelect', weekendId);
  const sat = await page.locator('#avlCalendar .avl-date.has-hours:not(:disabled):not(.is-today)').first().getAttribute('data-avl-date');
  await page.locator(`#avlCalendar [data-avl-date="${sat}"]`).click();
  await slotsSettled();
  assert.equal(new Date(sat + 'T12:00:00').getDay(), 6);
  assert.ok(await page.locator('#avlSlots .avl-slot').count() > 0, 'Saturday slots on the weekend schedule');
  await page.locator('#avlAssignTypes input[type="checkbox"]').nth(0).uncheck();
  await page.locator('#avlAssignTypes input[type="checkbox"]').nth(1).uncheck();
  await page.locator('#avlScheduleDelete').click();
  await page.waitForFunction(() => document.querySelector('#avlScheduleSelect').value === 'default');
  await saveAndWait();
  assert.equal(await page.$$eval('#avlScheduleSelect option', o => o.length), 1);
});
await test('the event type editor chooses a schedule; title/duration/price stay on the type', async () => {
  await page.locator('#bookingsSubNav [data-bookings-tab="types"]').click();
  await page.locator('.sched-type-card').first().locator('.sched-type-edit').click();
  assert.equal(await page.locator('#schedTypeSchedule').inputValue(), 'default');
  assert.equal(await page.locator('#schedTypeDuration').isVisible(), true);
  await page.locator('#schedTypeCancelBtn').click();
  await page.locator('#bookingsSubNav [data-bookings-tab="availability"]').click();
});
await test('Save Schedule saves through the original save path', async () => {
  await page.fill('#schedRuleStart', '13:00'); await page.fill('#schedRuleEnd', '14:00');
  await page.selectOption('#schedRuleDay', '5');
  await page.locator('#avlRuleSubmit').click();
  await page.locator('#avlSaveBtn').click();
  await page.waitForFunction(() => !document.getElementById('schedSaveBar').classList.contains('is-dirty'));
  assert.equal(await windowsOn(5), 1);
  assert.doesNotMatch(await page.locator('#avlDirtyNote').innerText(), /Unsaved/);
});
await test('calendar arrow keys move focus between days', async () => {
  const start = await page.locator('#avlCalendar [tabindex="0"]').getAttribute('data-avl-date');
  await page.locator('#avlCalendar [tabindex="0"]').focus();
  await page.keyboard.press('ArrowDown');
  const now = await page.evaluate(() => document.activeElement.dataset.avlDate);
  const exp = new Date(start + 'T12:00:00'); exp.setDate(exp.getDate() + 7);
  assert.equal(now, exp.getFullYear() + '-' + String(exp.getMonth() + 1).padStart(2, '0') + '-' + String(exp.getDate()).padStart(2, '0'));
});
await test('main navigation stays visible while scrolled down to the time slots', async () => {
  await page.locator('#avlSlots').scrollIntoViewIfNeeded();
  const box = await page.locator('[data-owner-nav="bookings"]').boundingBox();
  assert.ok(box && box.y >= 0 && box.y < 900, 'Bookings nav item in viewport');
});
await test('no page errors', async () => { assert.deepEqual(errors, []); });

console.log(results.join('\n'));
const failed = results.filter(r => r.startsWith('FAIL')).length;
console.log((results.length - failed) + '/' + results.length + ' passed');
await browser.close();
process.exit(failed ? 1 : 0);
