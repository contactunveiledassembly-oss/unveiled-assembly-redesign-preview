// Digital resources catalog (2026-11-18): audio + Bible-study products,
// "customer chooses" pricing linked to an EXISTING Stripe test price,
// and planned drafts. Preview / DEMO_MODE on localhost — sample data
// only; nothing is created in Stripe and nothing is deployed.
//   node tests/shop-catalog.test.mjs   (no browser or server needed)
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import {
  normalizeProduct, productIsPurchasable, productIsPublic, missingProductInputs, addCartProduct,
  CATALOG_DRAFTS, JOHN_1_18_STRIPE_TEST, AUDIO_DELIVERY_READY
} from '../shop-system.js';
const require = createRequire(import.meta.url);
const pricing = require('../functions/shop-pricing.js');

const results = [];
async function test(name, fn){
  try { await fn(); results.push('PASS ' + name); }
  catch (err) { results.push('FAIL ' + name + ' — ' + String(err.message || err).split('\n')[0]); }
}
const JOHN = 'john-1-18-the-son-has-declared-him';
const john = over => normalizeProduct({ ...CATALOG_DRAFTS.find(d => d.id === JOHN), stripeTestProductId: JOHN_1_18_STRIPE_TEST.productId, stripeTestPriceId: JOHN_1_18_STRIPE_TEST.priceId, ...over });

/* ---------- data model (browser helpers) ---------- */
await test('John 1:18 links the existing Stripe test product and price (no new Stripe product)', async () => {
  assert.equal(JOHN_1_18_STRIPE_TEST.productId, 'prod_VeYJxFAp7n57uL');
  assert.equal(JOHN_1_18_STRIPE_TEST.priceId, 'price_1UdFCa0qZ7sPvfPOV5kmUefP');
  const p = john();
  assert.equal(p.title, 'John 1:18: The Son Has Declared Him');
  assert.equal(p.pricing, 'choose'); assert.equal(p.priceCents, 1800, '$18 minimum');
  assert.equal(p.format, 'audio_pdf'); assert.equal(p.status, 'draft');
  assert.equal(p.stripeLivePriceId, '', 'no live price until live payments are approved');
});
await test('John 1:18 is not for sale: draft, files not ready, audio delivery not built', async () => {
  assert.equal(productIsPublic(john()), false);
  assert.equal(productIsPurchasable(john()), false);
  assert.equal(AUDIO_DELIVERY_READY, false);
  // Even if someone set it Active, audio can't be sold yet.
  assert.equal(productIsPurchasable(john({ status: 'published' })), false);
  const missing = missingProductInputs(john(), false);
  assert.ok(missing.includes('PDF'));
  assert.ok(missing.some(m => m.startsWith('audio file')));
  assert.ok(missing.includes('description') && missing.includes('cover'));
});
await test('the four planned products are drafts with no invented price or details', async () => {
  const ideas = CATALOG_DRAFTS.filter(d => d.id !== JOHN).map(d => normalizeProduct(d));
  assert.deepEqual(ideas.map(p => p.title), ['Saved and Secure', 'Renewed in the Mind', 'Prayer When You Feel Stuck', 'Ecclesiastes Study']);
  for(const p of ideas){
    assert.equal(p.status, 'draft'); assert.equal(p.priceCents, null); assert.equal(p.description, ''); assert.equal(p.image, '');
    assert.equal(p.stripeTestPriceId, ''); assert.equal(productIsPurchasable(p), false);
  }
});
await test('formats, categories and Stripe ids are validated; old products are unchanged', async () => {
  const old = normalizeProduct({ id: 'x', title: 'Old PDF', type: 'digital', category: 'digital', status: 'published', priceCents: 1500 });
  assert.equal(old.format, 'pdf'); assert.equal(old.pricing, 'fixed'); assert.equal(productIsPurchasable(old), true);
  const bad = normalizeProduct({ id: 'y', title: 'Y', format: 'video', category: 'audio', stripeTestPriceId: 'prod_wrong', stripeTestProductId: 'price_wrong' });
  assert.equal(bad.format, 'pdf'); assert.equal(bad.category, 'audio');
  assert.equal(bad.stripeTestPriceId, ''); assert.equal(bad.stripeTestProductId, '');
  assert.equal(normalizeProduct({ id: 'z', title: 'Z', category: 'study' }).category, 'study');
  assert.equal(normalizeProduct({ id: 'b', title: 'Book', type: 'physical', category: 'books' }).format, '');
});
await test('a "choose your amount" PDF needs its Stripe price and is checked out on its own', async () => {
  const chooser = normalizeProduct({ id: 'c', title: 'Chooser', type: 'digital', status: 'published', priceCents: 1800, pricing: 'choose', format: 'pdf' });
  assert.equal(productIsPurchasable(chooser), false, 'no Stripe price yet');
  const linked = normalizeProduct({ ...chooser, stripeTestPriceId: 'price_abc123' });
  assert.equal(productIsPurchasable(linked), true);
  const other = normalizeProduct({ id: 'o', title: 'Other', type: 'digital', status: 'published', priceCents: 900 });
  let r = addCartProduct([], linked);
  assert.equal(r.added, true); assert.equal(r.cart[0].pricing, 'choose');
  assert.equal(addCartProduct(r.cart, other).reason, 'choose-alone');
  r = addCartProduct([], other);
  assert.equal(addCartProduct(r.cart, linked).reason, 'choose-alone');
});

/* ---------- server pricing rules (functions/shop-pricing.js) ---------- */
const stripePrice = over => ({ id: 'price_1UdFCa0qZ7sPvfPOV5kmUefP', active: true, livemode: false, currency: 'usd', product: 'prod_VeYJxFAp7n57uL', custom_unit_amount: { minimum: 1800, maximum: null, preset: null }, ...over });
await test('server accepts only the matching existing Stripe price', async () => {
  const p = john();
  assert.equal(pricing.stripePriceIdFor(p, false), 'price_1UdFCa0qZ7sPvfPOV5kmUefP');
  assert.equal(pricing.stripePriceIdFor(p, true), '', 'a test price is never used with live keys');
  assert.equal(pricing.customPriceProblem(stripePrice(), p, false), '');
  assert.equal(pricing.customPriceProblem(null, p, false), 'not-found');
  assert.equal(pricing.customPriceProblem(stripePrice({ active: false }), p, false), 'inactive');
  assert.equal(pricing.customPriceProblem(stripePrice({ livemode: true }), p, false), 'wrong-mode');
  assert.equal(pricing.customPriceProblem(stripePrice({ currency: 'eur' }), p, false), 'wrong-currency');
  assert.equal(pricing.customPriceProblem(stripePrice({ custom_unit_amount: null, unit_amount: 1800 }), p, false), 'not-customer-chooses');
  assert.equal(pricing.customPriceProblem(stripePrice({ custom_unit_amount: { minimum: 500 } }), p, false), 'minimum-mismatch');
  assert.equal(pricing.customPriceProblem(stripePrice({ product: 'prod_somethingElse' }), p, false), 'product-mismatch');
  assert.equal(pricing.formatIncludesAudio(p), true); assert.equal(pricing.AUDIO_DELIVERY_READY, false);
});

console.log(results.join('\n'));
const failed = results.filter(r => r.startsWith('FAIL')).length;
console.log(`${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
