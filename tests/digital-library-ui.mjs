// Digital library UI in the preview build (DEMO_MODE): member library,
// confirmation page, owner Digital Files + Orders, Shop product note.
import { chromium } from '/Users/yaunahlove/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
import assert from 'node:assert/strict';

const baseUrl = process.env.TEST_BASE_URL || 'http://localhost:8080';
const shots = process.env.SHOT_DIR || '';
const browser = await chromium.launch({ headless: true });
const results = [];
const errors = [];
async function test(name, fn){
  try { await fn(); results.push('PASS ' + name); }
  catch (err) { results.push('FAIL ' + name + ' — ' + (err.message || err).split('\n')[0]); }
}
async function newPage(viewport){
  const page = await browser.newPage({ viewport });
  page.on('pageerror', err => errors.push(err.message));
  await page.addInitScript(() => {
    // A published, purchasable digital product so the owner tools and the
    // product page have something real-looking to work with.
    localStorage.setItem('ua_preview_store_products_v1', JSON.stringify([{
      id: 'concealed', title: 'Concealed', subtitle: 'A study', type: 'digital', category: 'digital', status: 'published',
      featured: true, priceCents: 1800, availability: 'Available', collection: 'Digital Study Resources', image: '', images: [],
      description: 'Test product.', included: ['PDF study'], delivery: '', options: [], tags: [], trackInventory: false, stock: null, isPlaceholder: false
    }]));
  });
  return page;
}
async function signIn(page, email){
  await page.goto(`${baseUrl}/story.html`, { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => {
    const dialog = document.querySelector('#memberPortalDialog');
    if(!dialog.open) dialog.showModal();
    document.querySelectorAll('.portal-view').forEach(v => { v.hidden = v.dataset.portalView !== 'prospect'; });
  });
  await page.fill('#signinEmail', email);
  await page.fill('#signinPassword', 'whatever123');
  await page.locator('#emailSignInForm').evaluate(form => form.requestSubmit());
}

for(const [label, viewport] of [['desktop', { width: 1440, height: 1000 }], ['mobile', { width: 390, height: 844 }]]){
  const page = await newPage(viewport);
  await signIn(page, 'demo@example.com');
  await page.locator('[data-portal-view="member"]').waitFor({ state: 'visible' });
  if(label === 'mobile') await page.selectOption('#memberMobileNavSelect', 'receipts');
  else await page.locator('#memberTabs [data-member-tab="receipts"]').click();
  await page.waitForSelector('#memberDigitalLibrary .dl-item', { timeout: 8000 }).catch(() => {});
  await test(label + ': library shows the purchase with verified status', async () => {
    const text = await page.locator('#memberDigitalLibrary').innerText();
    assert.match(text, /YOUR DIGITAL LIBRARY/i); assert.match(text, /CONCEALED/i); assert.match(text, /PAYMENT VERIFIED/i);
  });
  await test(label + ': preview sample is clearly marked, never a real paid receipt', async () => {
    const text = await page.locator('#memberDigitalLibrary').innerText();
    assert.match(text, /SAMPLE/i); assert.doesNotMatch(text, /\bPaid\b/);
  });
  await test(label + ': email button is disabled and says Not Connected Yet', async () => {
    assert.equal(await page.locator('[data-dl-email]').isDisabled(), true);
    assert.match(await page.locator('.dl-not-connected').innerText(), /NOT CONNECTED YET/i);
  });
  await test(label + ': Download PDF explains preview instead of faking a file', async () => {
    await page.locator('[data-dl-download]').click();
    assert.match(await page.locator('.dl-item .dl-message').innerText(), /Preview only/);
  });
  await test(label + ': receipt details open', async () => {
    await page.locator('.dl-receipt summary').click();
    assert.match(await page.locator('.dl-receipt').innerText(), /ORDER NUMBER/i);
  });
  await test(label + ': records counter matches ledger rows (library card not double-counted)', async () => {
    const rows = await page.locator('#memberPurchasesList .member-transaction-row').count();
    const counter = Number((await page.locator('#memberPurchasesCount').innerText()).trim());
    assert.equal(counter, rows);
  });
  await test(label + ': no horizontal overflow', async () => {
    assert.equal(await page.evaluate(() => [...document.querySelectorAll('.dl-item')].every(el => el.scrollWidth <= el.clientWidth + 1)), true);
  });
  if(shots) await page.locator('#memberDigitalLibrary').screenshot({ path: `${shots}/library-${label}.png` });
  await page.close();
}

{
  const page = await newPage({ width: 1440, height: 1000 });
  await page.goto(`${baseUrl}/shop/confirmation.html`, { waitUntil: 'load' });
  await page.waitForTimeout(800);
  await test('confirmation page shows Payment Verified, order number, product, receipt, download', async () => {
    const text = await page.locator('#shopConfirmationRoot').innerText();
    assert.match(text, /PAYMENT VERIFIED/i); assert.match(text, /ORDER NUMBER/i); assert.match(text, /CONCEALED/i);
    assert.match(text, /VIEW RECEIPT/i); assert.match(text, /PURCHASES & DOWNLOADS/i);
    assert.equal(await page.locator('[data-dl-download]').isDisabled(), true, 'preview download stays inactive');
    assert.match(text, /OWNER PREVIEW/i);
  });
  if(shots) await page.screenshot({ path: `${shots}/confirmation.png`, fullPage: true });
  await page.goto(`${baseUrl}/shop/product.html?id=concealed`, { waitUntil: 'load' });
  await page.waitForTimeout(1200);
  await test('product page tells buyers the PDF goes to their account', async () => {
    assert.match(await page.locator('body').innerText(), /Purchases & Downloads after payment/);
  });
  await page.close();
}

{
  const page = await newPage({ width: 1500, height: 1200 });
  await signIn(page, 'contactunveiledassembly@gmail.com');
  await page.waitForSelector('[data-owner-nav="store"]', { timeout: 15000 });
  await page.locator('[data-owner-nav="store"]').click();
  await page.waitForTimeout(500);
  await page.locator('[data-store-tab="files"]').click();
  await test('owner Digital Files lists the digital product', async () => {
    assert.match(await page.locator('#ownerDigitalFiles').innerText(), /Concealed/);
    assert.match(await page.locator('#ownerDigitalFiles').innerText(), /No PDF uploaded yet/);
  });
  await test('owner uploads a PDF (simulated in preview) and sees it attached', async () => {
    await page.locator('[data-dl-upload="concealed"]').setInputFiles({ name: 'Concealed.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4\n%%EOF') });
    await page.waitForTimeout(300);
    const text = await page.locator('#ownerDigitalFiles').innerText();
    assert.match(text, /Private PDF: Concealed\.pdf/);
    assert.doesNotMatch(text, /private\/digital-products/, 'file location must not be shown');
    assert.equal(await page.locator('[data-dl-auto="concealed"]').isDisabled(), false);
  });
  await test('owner has a Preview Customer View link', async () => {
    assert.equal(await page.locator('a[href*="confirmation.html?preview=concealed"]').count(), 1);
  });
  if(shots) await page.locator('#ownerDigitalFiles').screenshot({ path: `${shots}/owner-files.png` });
  await page.locator('[data-store-tab="orders"]').click();
  await test('owner Orders shows payment, access, email, downloads, and actions', async () => {
    const text = await page.locator('#ownerDigitalOrders').innerText();
    for(const label of ['Digital Orders', 'Payment', 'Access', 'Refund', 'Email', 'Downloads', 'Give Access To A Member', 'Not Connected Yet']) assert.ok(text.toLowerCase().includes(label.toLowerCase()), 'missing ' + label);
    assert.equal(await page.locator('[data-dl-owner="resend"]').first().isDisabled(), true);
  });
  await test('owner actions in preview are simulated, not faked', async () => {
    await page.locator('[data-dl-owner="revoke"]').first().click();
    assert.match(await page.locator('[data-dl-order] .dl-message').first().innerText(), /Preview only/);
  });
  if(shots) await page.locator('#ownerDigitalOrders').screenshot({ path: `${shots}/owner-orders.png` });
  await page.close();
}

await test('no page errors', async () => assert.deepEqual(errors, []));
await browser.close();
console.log(results.join('\n'));
const failed = results.filter(r => r.startsWith('FAIL')).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
