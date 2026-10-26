import assert from 'node:assert/strict';

import {
  addCartProduct,
  cartSubtotalCents,
  normalizeProduct,
  productIsPublic,
  productIsPurchasable,
  updateCartQuantity,
} from '../shop-system.js';

function product(overrides = {}) {
  return normalizeProduct({
    id: 'physical-journal',
    title: 'Prayer Journal',
    description: 'A printed journal.',
    type: 'physical',
    category: 'books',
    status: 'published',
    priceCents: 2500,
    currency: 'usd',
    ...overrides,
  });
}

function quantityFor(cart, productId) {
  const item = cart.find(candidate => candidate.productId === productId || candidate.id === productId);
  return item ? item.quantity : 0;
}

const digital = product({
  id: 'digital-study-guide',
  title: 'Digital Study Guide',
  description: 'A downloadable study guide.',
  type: 'digital',
  category: 'digital',
  priceCents: 1200,
});
const physical = product();

assert.equal(digital.id, 'digital-study-guide');
assert.equal(digital.type, 'digital');
assert.equal(digital.priceCents, 1200);
assert.equal(productIsPublic(digital), true);
assert.equal(productIsPurchasable(digital), true);

// Digital products are single-license cart lines: adding the same product
// twice and trying to raise its quantity must both be strict value no-ops.
const firstDigitalAdd = addCartProduct([], digital);
assert.equal(firstDigitalAdd.added, true);
assert.equal(firstDigitalAdd.reason, 'added');
let digitalCart = firstDigitalAdd.cart;
assert.equal(digitalCart.length, 1);
assert.equal(quantityFor(digitalCart, digital.id), 1);
const digitalCartBeforeDuplicate = structuredClone(digitalCart);
const duplicateDigital = addCartProduct(digitalCart, digital);
assert.equal(duplicateDigital.added, false);
assert.equal(duplicateDigital.reason, 'digital-duplicate');
assert.deepEqual(duplicateDigital.cart, digitalCartBeforeDuplicate);
digitalCart = updateCartQuantity(duplicateDigital.cart, digitalCart[0].key, 4);
assert.deepEqual(digitalCart, digitalCartBeforeDuplicate);

// Physical products keep one line per product ID while their quantity can
// increase and decrease.
const firstPhysicalAdd = addCartProduct([], physical);
assert.equal(firstPhysicalAdd.added, true);
const secondPhysicalAdd = addCartProduct(firstPhysicalAdd.cart, physical);
assert.equal(secondPhysicalAdd.added, true);
assert.equal(secondPhysicalAdd.reason, 'incremented');
let physicalCart = secondPhysicalAdd.cart;
assert.equal(physicalCart.length, 1);
assert.equal(quantityFor(physicalCart, physical.id), 2);
const physicalLineKey = physicalCart[0].key;
physicalCart = updateCartQuantity(physicalCart, physicalLineKey, 3);
assert.equal(quantityFor(physicalCart, physical.id), 3);
physicalCart = updateCartQuantity(physicalCart, physicalLineKey, 2);
assert.equal(quantityFor(physicalCart, physical.id), 2);

let mixedCart = addCartProduct([], digital).cart;
mixedCart = addCartProduct(mixedCart, physical).cart;
mixedCart = addCartProduct(mixedCart, physical).cart;
assert.equal(mixedCart.length, 2);
assert.equal(cartSubtotalCents(mixedCart), 1200 + (2500 * 2));
const mixedPhysicalKey = mixedCart.find(line => line.productId === physical.id).key;
mixedCart = updateCartQuantity(mixedCart, mixedPhysicalKey, 1);
assert.equal(cartSubtotalCents(mixedCart), 1200 + 2500);

const draft = product({ id: 'draft-product', status: 'draft' });
const archived = product({ id: 'archived-product', status: 'archived' });
const comingSoon = product({
  id: 'coming-soon-product',
  status: 'coming_soon',
  priceCents: null,
});
const noPrice = product({ id: 'published-without-price', priceCents: null });
const placeholder = product({ id: 'published-placeholder', isPlaceholder: true });
const soldOut = product({ id: 'sold-out-product', trackInventory: true, stock: 0 });
const inStock = product({ id: 'in-stock-product', trackInventory: true, stock: 1 });
const untrackedStock = product({ id: 'untracked-stock-product', trackInventory: false, stock: 0 });

assert.equal(productIsPublic(draft), false);
assert.equal(productIsPurchasable(draft), false);
assert.equal(productIsPublic(archived), false);
assert.equal(productIsPurchasable(archived), false);
assert.equal(productIsPublic(comingSoon), true);
assert.equal(comingSoon.priceCents, null, 'missing price must stay distinct from a free product');
assert.equal(productIsPurchasable(comingSoon), false, 'coming-soon/no-price products cannot enter checkout');
assert.equal(productIsPublic(noPrice), true);
assert.equal(productIsPurchasable(noPrice), false);
assert.equal(productIsPurchasable(placeholder), false);
assert.equal(productIsPurchasable(soldOut), false);
assert.equal(productIsPurchasable(inStock), true);
assert.equal(productIsPurchasable(untrackedStock), true);

// Checkout remains a separate, globally disabled UI state. There is no
// per-product checkout flag in the normalized model or cart-eligibility rule.
const legacyCheckoutFlag = product({ id: 'legacy-checkout-flag', checkoutEnabled: false });
assert.equal(Object.hasOwn(legacyCheckoutFlag, 'checkoutEnabled'), false);
assert.equal(productIsPurchasable(legacyCheckoutFlag), true);

const rejectedDraft = addCartProduct(mixedCart, draft);
assert.equal(rejectedDraft.added, false);
assert.equal(rejectedDraft.reason, 'unavailable');
assert.deepEqual(rejectedDraft.cart, mixedCart);
const rejectedNoPrice = addCartProduct(mixedCart, noPrice);
assert.equal(rejectedNoPrice.added, false);
assert.equal(rejectedNoPrice.reason, 'unavailable');
assert.deepEqual(rejectedNoPrice.cart, mixedCart);

console.log('shop_phase1_helpers=ok');
