// Resources Shop — owner sections + customer discount/pause behavior in
// the preview build (DEMO_MODE). Nothing real is touched: the preview
// has no database and checkout is never opened.
//   python3 -m http.server 8080 &  node tests/resources-shop-ui.mjs
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
const GUIDE = {
  id: 'preview-demo-discernment-guide', title: 'Discernment Study Guide', subtitle: '', type: 'digital', category: 'digital', status: 'published',
  featured: true, priceCents: 2400, availability: 'Available', collection: '', image: 'assets/one-on-one/hero-v4.jpg', images: [],
  description: 'Sample.', included: [], delivery: '', options: [], tags: [], trackInventory: false, stock: null, isPlaceholder: false
};
const SECOND = { ...GUIDE, id: 'second-guide', title: 'Second Guide', priceCents: 1000, featured: false };
async function newPage(viewport, products = [GUIDE, SECOND]){
  const context = await browser.newContext({ viewport });
  const page = await context.newPage();
  page.on('pageerror', err => errors.push(err.message));
  page.on('dialog', dialog => dialog.type() === 'prompt' ? dialog.accept('Test note') : dialog.accept());
  await page.addInitScript(list => {
    if(sessionStorage.getItem('rs-seeded')) return;
    sessionStorage.setItem('rs-seeded', '1');
    localStorage.setItem('ua_preview_store_products_v1', JSON.stringify(list));
    localStorage.removeItem('ua_preview_store_controls_v1');
    localStorage.removeItem('ua_preview_shop_discounts_v1');
  }, products);
  return page;
}
async function signInOwner(page){
  await page.goto(`${baseUrl}/story.html`, { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => {
    const dialog = document.querySelector('#memberPortalDialog');
    if(!dialog.open) dialog.showModal();
    document.querySelectorAll('.portal-view').forEach(v => { v.hidden = v.dataset.portalView !== 'prospect'; });
  });
  await page.fill('#signinEmail', 'contactunveiledassembly@gmail.com');
  await page.fill('#signinPassword', 'whatever123');
  await page.locator('#emailSignInForm').evaluate(form => form.requestSubmit());
  await page.waitForSelector('[data-dept-toggle="resources"]', { timeout: 15000 });
  await page.locator('[data-dept-toggle="resources"]').evaluate(b => { if(b.getAttribute('aria-expanded') !== 'true') b.click(); });
  await page.locator('[data-owner-nav="store"]').click();
  await page.waitForSelector('#ownerStoreOverview .rs-alerts, #ownerStoreOverview .rs-empty', { timeout: 8000 });
}
const text = (page, sel) => page.locator(sel).innerText();

/* ---------- owner ---------- */
{
  const page = await newPage({ width: 1440, height: 1100 });
  await signInOwner(page);
  await test('sidebar section is named Resources Shop', async () => {
    assert.match(await text(page, '[data-owner-nav="store"]'), /Resources Shop/);
  });
  await test('all nine sections are present', async () => {
    const tabs = await page.locator('#ownerStoreTabs [data-store-tab]').allInnerTexts();
    assert.deepEqual(tabs, ['Overview', 'Products', 'Orders', 'Digital Files', 'Collections', 'Customers', 'Discounts', 'Reports', 'Store Settings']);
  });
  await test('Concealed is created as a Draft with every owner input flagged', async () => {
    await page.locator('[data-store-tab="products"]').click();
    const row = page.locator('[data-store-product-id="concealed"]');
    assert.equal(await row.count(), 1);
    const t = await row.innerText();
    assert.match(t, /Draft/i); assert.match(t, /Price to be announced/);
    assert.match(t, /Needs your input: price · description · cover · PDF/);
  });
  await test('Concealed draft is not public', async () => {
    const products = await page.evaluate(() => JSON.parse(localStorage.getItem('ua_preview_store_products_v1')));
    const c = products.find(p => p.id === 'concealed');
    assert.equal(c.status, 'draft'); assert.equal(c.priceCents, null); assert.equal(c.description, ''); assert.equal(c.image, '');
  });
  await test('product status buttons use Draft / Coming Soon / Set Active / Archive', async () => {
    await page.locator('[data-store-edit="concealed"]').click();
    const t = await text(page, '#ownerStoreProductForm .store-save-actions');
    for(const label of ['Save Draft', 'Mark Coming Soon', 'Set Active', 'Archive']) assert.ok(t.includes(label), label);
    assert.match(await text(page, '#ownerStoreProductForm'), /Changing the price only affects future purchases/);
    assert.equal(await page.locator('#storeProductTestOnly').count(), 1);
  });
  await test('Active is refused without a price', async () => {
    await page.locator('#ownerStorePublishBtn').click();
    assert.match(await text(page, '#ownerStoreProductStatus'), /Add an approved price/);
  });
  await page.locator('#ownerStoreCloseEditor').click();
  await page.locator('[data-store-tab="overview"]').click();
  await test('overview shows actionable alerts', async () => {
    const t = await text(page, '#ownerStoreOverview');
    assert.match(t, /waiting on the PDF for “Concealed”/);
    assert.match(t, /“Concealed” needs your input/);
    assert.match(t, /Active but has no PDF/);
    assert.ok(await page.locator('#ownerStoreOverview [data-rs-go="files"]').count() >= 1);
  });
  await test('an alert button takes the owner to the right place', async () => {
    await page.locator('#ownerStoreOverview [data-rs-edit="concealed"]').first().click();
    assert.equal(await page.locator('[data-store-panel="products"]').isVisible(), true);
    assert.equal(await page.locator('#ownerStoreProductForm[data-product-id="concealed"]').count(), 1);
  });
  if(shots){ await page.locator('[data-store-tab="overview"]').click(); await page.locator('#ownerStoreRoot').screenshot({ path: `${shots}/rs-overview.png` }); }

  await page.locator('[data-store-tab="orders"]').click();
  await test('orders show prices as sold, discount, payment and per-item access separately', async () => {
    const t = await text(page, '#ownerShopOrders');
    assert.match(t, /UA-PVSAMPL1/); assert.match(t, /SAMPLE10/); assert.match(t, /−\$2\.40/);
    assert.match(t, /Paid/i); assert.match(t, /Download Allowed/i); assert.match(t, /Waiting/i); assert.match(t, /No PDF attached yet/);
    assert.match(t, /Paid before a PDF was attached for Concealed/);
  });
  await test('needs-attention filter narrows to the flagged order', async () => {
    await page.locator('[data-rs-order-filter="attention"]').click();
    assert.equal(await page.locator('#ownerShopOrders [data-rs-order]').count(), 1);
    await page.locator('[data-rs-order-filter="all"]').click();
  });
  await test('refund needs explicit confirmation and is simulated in preview', async () => {
    await page.locator('[data-rs-refund="PVSAMPL1ORDER"]').click();
    assert.match(await text(page, '#rsRefundDialog'), /Refund \$21\.60/);
    assert.equal(await page.locator('#rsRefundSubmit').isDisabled(), true);
    await page.locator('#rsRefundConfirm').check();
    await page.locator('#rsRefundSubmit').click();
    assert.match(await text(page, '#rsRefundMessage'), /Preview only/);
    await page.locator('#rsRefundCancel').click();
  });
  await test('access changes ask first and are simulated in preview', async () => {
    await page.locator('#ownerShopOrders [data-rs-access="revoke"]').first().click();
    assert.match(await page.locator('#ownerShopOrders [data-rs-order] .dl-message').first().innerText(), /Preview only/);
  });
  await test('Download Access (complimentary grants) sits under Orders', async () => {
    assert.match(await text(page, '#ownerDigitalOrders'), /Give Access To A Member/i);
  });
  await test('test-records view is separate and empty', async () => {
    await page.locator('[data-rs-mode="test"]').click();
    assert.match(await text(page, '#ownerShopOrders'), /No test orders here/);
    assert.match(await text(page, '#ownerStoreModeBar'), /Test mode view/);
    await page.locator('[data-rs-mode="live"]').click();
  });
  if(shots) await page.locator('#ownerStoreRoot').screenshot({ path: `${shots}/rs-orders.png` });

  await page.locator('[data-store-tab="customers"]').click();
  await test('customers list who paid and what they can download', async () => {
    assert.equal(await page.locator('#ownerShopCustomers [data-rs-customer]').count(), 2);
    await page.locator('#ownerShopCustomers [data-rs-customer-toggle]').first().click();
    assert.match(await text(page, '#ownerShopCustomers'), /downloads/);
  });

  await page.locator('[data-store-tab="discounts"]').click();
  await test('invalid discount is refused with a reason', async () => {
    await page.fill('#rsCode', 'x'); await page.fill('#rsCodeAmount', '10');
    await page.locator('#rsCodeForm button[type="submit"]').click();
    assert.match(await text(page, '#rsCodeMessage'), /3–40 letters/);
  });
  await test('owner creates a product-scoped percentage code with a limit and end date', async () => {
    await page.fill('#rsCode', 'save20'); await page.selectOption('#rsCodeType', 'percent'); await page.fill('#rsCodeAmount', '20');
    await page.fill('#rsCodeMax', '5'); await page.fill('#rsCodeEnd', '2099-12-31');
    await page.locator('input[name="rsCodeScope"][value="some"]').check();
    await page.locator('[data-rs-code-product][value="preview-demo-discernment-guide"]').check();
    await page.locator('#rsCodeForm button[type="submit"]').click();
    const row = await text(page, '[data-rs-code="SAVE20"]');
    assert.match(row, /SAVE20/); assert.match(row, /Active/i); assert.match(row, /20% off · Discernment Study Guide/); assert.match(row, /0 used of 5/); assert.match(row, /ends 2099-12-31/);
  });
  await test('owner creates a fixed-amount code for all products', async () => {
    await page.fill('#rsCode', 'FIVE'); await page.selectOption('#rsCodeType', 'fixed'); await page.fill('#rsCodeAmount', '5');
    await page.locator('#rsCodeForm button[type="submit"]').click();
    assert.match(await text(page, '[data-rs-code="FIVE"]'), /\$5\.00 off · All products/);
  });
  await test('pause and resume a code', async () => {
    await page.locator('[data-rs-code="FIVE"] [data-rs-code-action="toggle"]').click();
    assert.match(await text(page, '[data-rs-code="FIVE"]'), /Paused/i);
  });
  await test('an expired code reads Expired', async () => {
    await page.fill('#rsCode', 'OLDCODE'); await page.selectOption('#rsCodeType', 'percent'); await page.fill('#rsCodeAmount', '10'); await page.fill('#rsCodeEnd', '2020-01-01');
    await page.locator('#rsCodeForm button[type="submit"]').click();
    assert.match(await text(page, '[data-rs-code="OLDCODE"]'), /Expired/i);
  });
  if(shots) await page.locator('#ownerStoreRoot').screenshot({ path: `${shots}/rs-discounts.png` });

  await page.locator('[data-store-tab="collections"]').click();
  await test('owner adds and renames a collection', async () => {
    await page.fill('#rsCollectionName', 'Hidden Things');
    await page.fill('#rsCollectionDescription', 'Studies on what God conceals and reveals.');
    await page.locator('#rsCollectionForm button[type="submit"]').click();
    assert.match(await text(page, '#ownerShopCollections'), /Hidden Things/);
    page.removeAllListeners('dialog');
    page.on('dialog', d => d.type() === 'prompt' ? d.accept('Hidden Things Series') : d.accept());
    await page.locator('[data-rs-col="rename"]').first().click();
    await page.waitForTimeout(200);
    assert.match(await text(page, '#ownerShopCollections'), /Hidden Things Series/);
    page.removeAllListeners('dialog');
    page.on('dialog', dialog => dialog.type() === 'prompt' ? dialog.accept('Test note') : dialog.accept());
  });

  await page.locator('[data-store-tab="reports"]').click();
  await test('reports are recalculated from order records', async () => {
    assert.equal(await text(page, '[data-rs-metric="gross"]'), '$45.60');
    assert.equal(await text(page, '[data-rs-metric="refunds"]'), '$0.00');
    assert.equal(await text(page, '[data-rs-metric="orders"]'), '2');
    const table = await page.locator('#ownerShopReports .rs-table').first().innerText();
    assert.match(table, /Discernment Study Guide/); assert.match(table, /Concealed/);
  });
  await test('test-mode reports exclude live orders', async () => {
    await page.locator('[data-rs-mode="test"]').click();
    assert.equal(await text(page, '[data-rs-metric="gross"]'), '$0.00');
    await page.locator('[data-rs-mode="live"]').click();
  });
  if(shots) await page.locator('#ownerStoreRoot').screenshot({ path: `${shots}/rs-reports.png` });

  await page.locator('[data-store-tab="settings"]').click();
  await test('store settings explain payments, test mode and the audit trail', async () => {
    const t = await text(page, '#ownerShopSettings');
    assert.match(t, /Open/); assert.match(t, /Public checkout/); assert.match(t, /4242 4242 4242 4242/); assert.match(t, /Audit Trail/i);
    assert.match(await text(page, '#ownerStoreAppearance'), /Shop Appearance/i);
  });
  await test('owner pauses new purchases', async () => {
    await page.fill('#rsPauseMessage', 'We are updating the collection. Your library is safe.');
    await page.locator('[data-rs-pause="pause"]').click();
    assert.equal(await page.locator('[data-rs-paused="true"]').count(), 1);
  });
  if(shots) await page.locator('#ownerStoreRoot').screenshot({ path: `${shots}/rs-settings.png` });

  await page.goto(`${baseUrl}/shop/product.html?id=preview-demo-discernment-guide`, { waitUntil: 'load' });
  await page.waitForTimeout(800);
  await test('while paused the product page says so and cannot be added', async () => {
    const t = await text(page, '#shopProductDetail');
    assert.match(t, /Purchases Paused/i); assert.match(t, /updating the collection/);
    assert.equal(await page.locator('#shopProductDetail [data-add-to-cart]').count(), 0);
  });
  await page.goto(`${baseUrl}/shop/`, { waitUntil: 'load' });
  await page.waitForTimeout(800);
  await test('shop shows owner collections as filters', async () => {
    // The renamed collection has no products yet, so no chip should show.
    assert.equal(await page.locator('#shopCollectionChips').count(), 0);
  });
  await page.close();
}

/* ---------- customer: discount in the bag ---------- */
for(const [label, viewport] of [['desktop', { width: 1440, height: 1000 }], ['mobile', { width: 390, height: 844 }]]){
  const page = await newPage(viewport, [{ ...GUIDE, collection: 'Hidden Things' }, SECOND]);
  await page.evaluate(() => {});
  await page.goto(`${baseUrl}/shop/`, { waitUntil: 'load' });
  await page.evaluate(() => {
    localStorage.setItem('ua_preview_shop_discounts_v1', JSON.stringify([
      { id: 'SAVE20', code: 'SAVE20', type: 'percent', amount: 20, scope: 'shop', productIds: ['preview-demo-discernment-guide'], active: true, usedCount: 0, maxUses: 5, expiresAt: '2099-12-31' },
      { id: 'USEDUP', code: 'USEDUP', type: 'fixed', amount: 5, scope: 'shop', productIds: [], active: true, usedCount: 3, maxUses: 3 },
      { id: 'PAUSED', code: 'PAUSED', type: 'fixed', amount: 5, scope: 'shop', productIds: [], active: false, usedCount: 0 }
    ]));
    localStorage.setItem('ua_preview_store_controls_v1', JSON.stringify({ purchasesPaused: false, pausedMessage: '', collections: [{ name: 'Hidden Things', description: 'A study series.', visible: true }] }));
  });
  await page.reload({ waitUntil: 'load' });
  await page.waitForTimeout(800);
  await test(label + ': visible collections appear as Shop filters', async () => {
    assert.match(await text(page, '#shopCollectionChips'), /Hidden Things/i);
    await page.locator('[data-shop-collection="Hidden Things"]').click();
    assert.equal(await page.locator('#shopProductGrid .shop-product-card').count(), 1);
    assert.match(await text(page, '#shopCollectionChips'), /A study series/);
  });
  await page.goto(`${baseUrl}/shop/product.html?id=preview-demo-discernment-guide`, { waitUntil: 'load' });
  await page.waitForTimeout(800);
  await page.locator('#shopProductDetail [data-add-to-cart]').click();
  await page.waitForSelector('#shopCartDialog.open');
  await test(label + ': unknown, used-up and paused codes are explained', async () => {
    for(const [code, re] of [['NOPE', /wasn’t found/], ['USEDUP', /usage limit/], ['PAUSED', /paused/]]){
      await page.fill('#shopDiscountInput', code); await page.locator('#shopDiscountApply').click();
      await page.waitForTimeout(150);
      assert.match(await text(page, '#shopDiscountStatus'), re, code);
      assert.equal(await page.locator('#shopCartDiscountRow').isHidden(), true);
    }
  });
  await test(label + ': a valid code shows the discount and estimated total', async () => {
    await page.fill('#shopDiscountInput', 'save20'); await page.locator('#shopDiscountApply').click();
    await page.waitForTimeout(150);
    assert.equal(await text(page, '#shopCartDiscount'), '−$4.80');
    assert.equal(await text(page, '#shopCartTotal'), '$19.20');
    assert.match(await text(page, '#shopDiscountStatus'), /confirmed on the secure checkout page/);
  });
  await test(label + ': cart drawer has no horizontal overflow', async () => {
    assert.equal(await page.evaluate(() => { const d = document.getElementById('shopCartDialog'); return d.scrollWidth <= d.clientWidth + 1; }), true);
  });
  if(shots) await page.locator('#shopCartDialog').screenshot({ path: `${shots}/rs-cart-${label}.png` });
  await page.close();
}

/* ---------- member library states ---------- */
{
  const page = await newPage({ width: 1440, height: 1000 });
  await page.goto(`${baseUrl}/story.html`, { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => {
    const dialog = document.querySelector('#memberPortalDialog');
    if(!dialog.open) dialog.showModal();
    document.querySelectorAll('.portal-view').forEach(v => { v.hidden = v.dataset.portalView !== 'prospect'; });
  });
  await page.fill('#signinEmail', 'demo@example.com'); await page.fill('#signinPassword', 'whatever123');
  await page.locator('#emailSignInForm').evaluate(form => form.requestSubmit());
  await page.locator('[data-portal-view="member"]').waitFor({ state: 'visible' });
  await page.locator('#memberTabs [data-member-tab="receipts"]').click();
  await page.waitForSelector('#memberDigitalLibrary .dl-item', { timeout: 8000 });
  await test('library distinguishes Payment Pending from Download Available', async () => {
    const t = await text(page, '#memberDigitalLibrary');
    assert.match(t, /PAYMENT PENDING/i); assert.match(t, /DOWNLOAD AVAILABLE/i);
    assert.match(t, /Payment: Waiting for Stripe/); assert.match(t, /Download: Not yet/); assert.match(t, /Download: Allowed/);
    assert.equal(await page.locator('[data-dl-pending] [data-dl-download]').count(), 0, 'pending payment has no download');
  });
  if(shots) await page.locator('#memberDigitalLibrary').screenshot({ path: `${shots}/rs-library.png` });
  await page.close();
}

await test('no page errors', async () => assert.deepEqual(errors, []));
await browser.close();
console.log(results.join('\n'));
const failed = results.filter(r => r.startsWith('FAIL')).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
