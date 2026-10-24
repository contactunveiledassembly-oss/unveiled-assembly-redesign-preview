import { chromium } from '/Users/yaunahlove/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
import assert from 'node:assert/strict';

const browser = await chromium.launch({ headless: true });
const baseUrl = process.env.TEST_BASE_URL || 'http://localhost:8080';
const auditAtWidth = async width => {
  const page = await browser.newPage({ viewport: { width, height: 954 } });
  await page.goto(`${baseUrl}/story.html`, { waitUntil: 'domcontentloaded' });
  const findings = await page.evaluate(() => {
  const dialog = document.querySelector('#memberPortalDialog');
  if (dialog) dialog.setAttribute('open', '');
  document.querySelectorAll('.portal-view').forEach(view => { view.hidden = view.dataset.portalView !== 'owner'; });
  document.querySelectorAll('[data-owner-section], .admin-edit-panel').forEach(panel => { panel.hidden = false; });
  const renderedTextLines = element => {
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
    const tops = [];
    let node;
    while ((node = walker.nextNode())) {
      if (!node.textContent.trim() || node.parentElement?.closest('option, script, style')) continue;
      const range = document.createRange();
      range.selectNodeContents(node);
      for (const rect of range.getClientRects()) {
        if (rect.width > 0 && rect.height > 0) tops.push(Math.round(rect.top));
      }
    }
    return new Set(tops).size;
  };

  return [...document.querySelectorAll('.portal-view[data-portal-view="owner"] label, .portal-view[data-portal-view="owner"] button')]
    .map(element => {
      const rect = element.getBoundingClientRect();
      const text = element.textContent.replace(/\s+/g, ' ').trim();
      return {
        text,
        id: element.id,
        className: element.className,
        width: Math.round(rect.width),
        height: Math.round(rect.height),
        lines: renderedTextLines(element),
      };
    })
    .filter(item => item.text.length >= 14 && item.text.length <= 100 && item.width > 0 && item.width < 220 && item.lines >= 3)
    .sort((a, b) => b.lines - a.lines || a.width - b.width);
  });
  await page.close();
  return findings.map(item => ({ viewport: width, ...item }));
};

const findings = (await Promise.all([1624, 1280, 1024, 821].map(auditAtWidth))).flat();
assert.deepEqual(findings, []);
console.log('admin_label_audit=ok');
await browser.close();
