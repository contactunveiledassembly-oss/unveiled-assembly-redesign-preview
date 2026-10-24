import { chromium } from '/Users/yaunahlove/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
import assert from 'node:assert/strict';

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1624, height: 954 } });

await page.goto('http://localhost:8080/story.html', { waitUntil: 'domcontentloaded' });
await page.waitForSelector('#schedRuleTypesCheckboxes', { state: 'attached' });
await page.evaluate(() => {
  document.querySelector('#memberPortalDialog').setAttribute('open', '');
  document.querySelectorAll('.portal-view').forEach(view => { view.hidden = view.dataset.portalView !== 'owner'; });
  document.querySelectorAll('[data-owner-section]').forEach(section => { section.hidden = false; });
  document.querySelector('[data-bookings-panel="availability"]').hidden = false;
  document.querySelector('[data-bookings-panel="blocked"]').hidden = false;
  const choices = ['15-Minute One-on-One', '30-Minute One-on-One'];
  for (const id of ['schedRuleTypesCheckboxes', 'schedOverrideTypesCheckboxes']) {
    document.querySelector(`#${id}`).innerHTML = choices.map(label =>
      `<label class="sched-session-type-option"><input type="checkbox"><span>${label}</span></label>`
    ).join('');
  }
});

for (const id of ['schedRuleTypesCheckboxes', 'schedOverrideTypesCheckboxes']) {
  const result = await page.locator(`#${id}`).evaluate(container => {
    const labels = [...container.querySelectorAll('.sched-session-type-option')];
    return {
      display: getComputedStyle(container).display,
      labelCount: labels.length,
      rows: labels.map(label => Math.round(label.getBoundingClientRect().top)),
      wrapping: labels.map(label => {
        const span = label.querySelector('span');
        return span.scrollWidth > span.clientWidth || span.scrollHeight > parseFloat(getComputedStyle(span).lineHeight) + 1;
      }),
    };
  });

  assert.equal(result.display, 'grid');
  assert.ok(result.labelCount >= 2);
  assert.equal(new Set(result.rows).size, result.labelCount);
  assert.deepEqual(result.wrapping, Array(result.labelCount).fill(false));
}

console.log('scheduling_label_layout=ok');
await browser.close();
