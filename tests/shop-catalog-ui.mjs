// Digital resources catalog (2026-11-18): audio + Bible-study products,
// "customer chooses" pricing linked to an EXISTING Stripe test price,
// and planned drafts. Preview / DEMO_MODE on localhost — sample data
// only; nothing is created in Stripe and nothing is deployed.
//   python3 -m http.server 8080 &  node tests/shop-catalog-ui.mjs
// (data-model and server-rule checks: tests/shop-catalog.test.mjs)
import { chromium } from '/Users/yaunahlove/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
import assert from 'node:assert/strict';

const baseUrl = process.env.TEST_BASE_URL || 'http://localhost:8080';
const results = [];
const errors = [];
async function test(name, fn){
  try { await fn(); results.push('PASS ' + name); }
  catch (err) { results.push('FAIL ' + name + ' — ' + String(err.message || err).split('\n')[0]); }
}
const JOHN = 'john-1-18-the-son-has-declared-him';
/* ---------- Owner Portal (preview) ---------- */
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 1100 } });
const page = await context.newPage();
page.on('pageerror', e => errors.push(e.message));
page.on('dialog', d => d.accept());
await page.goto(`${baseUrl}/story.html`, { waitUntil: 'domcontentloaded' });
await page.evaluate(() => localStorage.clear());
await page.reload({ waitUntil: 'domcontentloaded' });
await page.waitForSelector('#memberPortalDialog', { state: 'attached' });
await page.evaluate(() => { const d = document.querySelector('#memberPortalDialog'); if(!d.open) d.showModal(); document.querySelectorAll('.portal-view').forEach(v => { v.hidden = v.dataset.portalView !== 'prospect'; }); });
await page.fill('#signinEmail', 'contactunveiledassembly@gmail.com');
await page.fill('#signinPassword', 'preview-only-123');
await page.locator('#emailSignInForm').evaluate(f => f.requestSubmit());
await page.waitForSelector('[data-owner-nav="store"]', { state: 'attached', timeout: 15000 });
await page.locator('[data-owner-nav="store"]').evaluate(b => b.click());
await page.waitForSelector('#ownerStoreOverview .rs-alerts, #ownerStoreOverview .rs-empty', { timeout: 8000 });
await page.locator('[data-store-tab="products"]').click();

await test('owner sees John 1:18 and the four ideas as drafts with what is still needed', async () => {
  const row = page.locator(`[data-store-product-id="${JOHN}"]`);
  await row.waitFor({ state: 'visible' });
  assert.equal(await row.count(), 1);
  const t = await row.innerText();
  assert.match(t, /Draft/i, JSON.stringify(t.slice(0, 200))); assert.match(t, /From \$18\.00 · you choose the amount/); assert.match(t, /Audio \+ PDF/);
  assert.match(t, /Stripe test price linked/);
  assert.match(t, /PDF/); assert.match(t, /audio file \(audio delivery not built yet\)/);
  for(const id of ['saved-and-secure', 'renewed-in-the-mind', 'prayer-when-you-feel-stuck', 'ecclesiastes-study']){
    const r = await page.locator(`[data-store-product-id="${id}"]`).innerText();
    assert.match(r, /Draft/i, id + ': ' + JSON.stringify(r.slice(0, 160))); assert.match(r, /Price to be announced/i);
  }
});
await test('drafts are created once: reloading does not duplicate them', async () => {
  await page.reload({ waitUntil: 'domcontentloaded' });
  // After a reload the account window is closed; reopen it like the owner would.
  await page.waitForSelector('#navMemberPortal', { state: 'attached', timeout: 15000 });
  await page.locator('#navMemberPortal').evaluate(b => b.click());
  await page.waitForSelector('[data-owner-nav="store"]', { state: 'attached', timeout: 15000 });
  await page.locator('[data-owner-nav="store"]').evaluate(b => b.click());
  await page.waitForSelector('#ownerStoreOverview .rs-alerts, #ownerStoreOverview .rs-empty', { timeout: 8000 });
  const products = await page.evaluate(() => JSON.parse(localStorage.getItem('ua_preview_store_products_v1')));
  assert.equal(products.filter(p => p.id === JOHN).length, 1);
  assert.equal(products.filter(p => p.title === 'Ecclesiastes Study').length, 1);
  await page.locator('[data-store-tab="products"]').click();
  await page.locator(`[data-store-edit="${JOHN}"]`).waitFor({ state: 'visible' });
});
await test('editor shows format, pricing and the linked Stripe test ids; audio can’t be set Active', async () => {
  await page.locator(`[data-store-edit="${JOHN}"]`).click();
  assert.equal(await page.locator('#storeProductFormat').inputValue(), 'audio_pdf');
  assert.equal(await page.locator('#storeProductPricing').inputValue(), 'choose');
  assert.equal(await page.locator('#storeProductPrice').inputValue(), '18.00');
  assert.equal(await page.locator('#storeProductStripeTestProduct').inputValue(), 'prod_VeYJxFAp7n57uL');
  assert.equal(await page.locator('#storeProductStripeTestPrice').inputValue(), 'price_1UdFCa0qZ7sPvfPOV5kmUefP');
  assert.equal(await page.locator('#storeProductStripeLivePrice').inputValue(), '');
  await page.locator('#ownerStorePublishBtn').click();
  assert.match(await page.locator('#ownerStoreProductStatus').innerText(), /Audio delivery isn’t connected yet/);
  const stored = (await page.evaluate(() => JSON.parse(localStorage.getItem('ua_preview_store_products_v1')))).find(p => p.id === JOHN);
  assert.equal(stored.status, 'draft', 'still a draft');
});
await test('a wrongly pasted Stripe id is refused with a clear message', async () => {
  await page.locator('#ownerStoreProductForm .store-advanced-settings summary').click();
  await page.locator('#storeProductStripeTestPrice').fill('prod_VeYJxFAp7n57uL');
  await page.locator('#ownerStoreSaveDraftBtn').click();
  assert.match(await page.locator('#ownerStoreProductStatus').innerText(), /should start with “price_”/);
  await page.locator('#storeProductStripeTestPrice').fill('price_1UdFCa0qZ7sPvfPOV5kmUefP');
  await page.locator('#ownerStoreSaveDraftBtn').click();
  await page.waitForFunction(() => /saved/i.test(document.getElementById('ownerStoreProductStatus')?.textContent || ''));
});
await test('the new categories are offered', async () => {
  const cats = await page.locator('#storeProductCategory option').allInnerTexts();
  assert.ok(cats.includes('Audio Teachings') && cats.includes('Bible Studies'));
});
await test('drafts never appear in the public Shop or on a product page', async () => {
  const shop = await context.newPage();
  await shop.goto(`${baseUrl}/shop/`, { waitUntil: 'load' });
  await shop.waitForTimeout(1000);
  const t = await shop.locator('body').innerText();
  for(const title of ['John 1:18', 'Saved and Secure', 'Renewed in the Mind', 'Prayer When You Feel Stuck', 'Ecclesiastes']) assert.ok(!t.includes(title), title + ' is public');
  await shop.goto(`${baseUrl}/shop/product.html?id=${JOHN}`, { waitUntil: 'load' });
  await shop.waitForTimeout(800);
  assert.match(await shop.locator('body').innerText(), /not available/i);
  assert.equal(await shop.locator('[data-dl-download], a[href*="download"]').count(), 0, 'no download link exists');
  await shop.close();
});
await test('no page errors', async () => assert.deepEqual(errors, []));
await browser.close();
console.log(results.join('\n'));
const failed = results.filter(r => r.startsWith('FAIL')).length;
console.log(`${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
