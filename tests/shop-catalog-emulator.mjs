// Catalog products against the Firebase emulators (a `demo-` project;
// Stripe offline — nothing is created in Stripe).
//   firebase emulators:exec --project demo-unveiledassembly \
//     --only auth,firestore,storage,functions "node tests/shop-catalog-emulator.mjs"
// Rules for the new product fields; audio products can't be bought yet;
// "customer chooses" products use only the existing Stripe price, alone,
// without discount codes; the amount the customer chose is recorded.
import { createRequire } from 'node:module';
import assert from 'node:assert/strict';
const require = createRequire(new URL('../functions/package.json', import.meta.url));
const { initializeApp } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const { getStorage } = require('firebase-admin/storage');
const { getAuth } = require('firebase-admin/auth');
const Stripe = require('stripe');

const PROJECT = process.env.GCLOUD_PROJECT || 'demo-unveiledassembly';
const BUCKET = PROJECT + '.appspot.com';
const AUTH = 'http://127.0.0.1:9099';
const FS = `http://127.0.0.1:8180/v1/projects/${PROJECT}/databases/(default)/documents`;
const FN = `http://127.0.0.1:5001/${PROJECT}/us-central1`;
const WEBHOOK_SECRET = 'whsec_local_emulator_test_only';
const RETURN = 'https://unveiledassembly--stripe-sandbox-abc123.web.app/shop/confirmation.html';
initializeApp({ projectId: PROJECT, storageBucket: BUCKET });
const db = getFirestore();
const bucket = getStorage().bucket(BUCKET);
const stripe = new Stripe('sk_test_unused');

const results = [];
async function test(name, fn){
  try { await fn(); results.push('PASS ' + name); }
  catch (err) { results.push('FAIL ' + name + ' — ' + (err && err.message ? err.message.split('\n')[0] : err)); }
}
async function user(email, role, uid){
  await getAuth().createUser({ uid, email, password: 'Password123' });
  const r = await fetch(`${AUTH}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=fake`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password: 'Password123', returnSecureToken: true }) });
  const j = await r.json();
  await db.doc('users/' + uid).set({ email, role, name: email.split('@')[0] });
  return { uid, token: j.idToken, email };
}
async function callFn(name, data, token){
  const r = await fetch(`${FN}/${name}`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) }, body: JSON.stringify({ data }) });
  const j = await r.json();
  return j.error ? { error: j.error.status, message: j.error.message } : j.result;
}
const value = v => v === null ? { nullValue: null } : Array.isArray(v) ? { arrayValue: { values: v.map(value) } } : typeof v === 'number' ? { integerValue: String(v) } : typeof v === 'boolean' ? { booleanValue: v } : { stringValue: String(v) };
async function ownerSave(id, obj, token){
  const r = await fetch(`${FS}:commit`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
    body: JSON.stringify({ writes: [{ update: { name: `projects/${PROJECT}/databases/(default)/documents/shopProducts/${id}`, fields: Object.fromEntries(Object.entries(obj).map(([k, v]) => [k, value(v)])) },
      updateTransforms: [{ fieldPath: 'updatedAt', setToServerValue: 'REQUEST_TIME' }] }] }) });
  return r.status;
}
async function webhook(type, object){
  const payload = JSON.stringify({ id: 'evt_' + Math.random().toString(36).slice(2), type, data: { object } });
  const header = stripe.webhooks.generateTestHeaderString({ payload, secret: WEBHOOK_SECRET });
  return (await fetch(`${FN}/stripeWebhook`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'stripe-signature': header }, body: payload })).status;
}
const ordersOf = async uid => (await db.collection('shopOrders').where('uid', '==', uid).get()).docs.map(d => ({ id: d.id, ...d.data() }));

const owner = await user('owner@example.com', 'admin', 'owner-1');
const member = await user('a@example.com', 'member', 'member-a');
const base = { subtitle: '', type: 'digital', category: 'audio', status: 'draft', featured: false, priceCents: 1800, availability: 'Not Published', collection: '',
  image: '', images: [], description: '', included: [], delivery: '', options: [], tags: [], trackInventory: false, stock: null, isPlaceholder: false };
const john = { id: 'john-1-18-the-son-has-declared-him', title: 'John 1:18: The Son Has Declared Him', ...base, format: 'audio_pdf', pricing: 'choose',
  stripeTestProductId: 'prod_VeYJxFAp7n57uL', stripeTestPriceId: 'price_1UdFCa0qZ7sPvfPOV5kmUefP', stripeLiveProductId: '', stripeLivePriceId: '' };

await test('owner can save a catalog product with format, pricing and Stripe ids', async () => {
  assert.equal(await ownerSave(john.id, john, owner.token), 200);
  const saved = (await db.doc('shopProducts/' + john.id).get()).data();
  assert.equal(saved.pricing, 'choose'); assert.equal(saved.stripeTestPriceId, 'price_1UdFCa0qZ7sPvfPOV5kmUefP');
});
await test('rules refuse bad format, category, pricing or Stripe ids — and members can’t write', async () => {
  for(const bad of [{ format: 'video' }, { category: 'music' }, { pricing: 'free' }, { stripeTestPriceId: 'prod_VeYJxFAp7n57uL' },
    { stripeLivePriceId: 'sk_live_notallowed' }, { stripeTestProductId: 'price_x' }]){
    assert.equal(await ownerSave(john.id, { ...john, ...bad }, owner.token), 403, JSON.stringify(bad));
  }
  assert.equal(await ownerSave('member-made', { ...john, id: 'member-made' }, member.token), 403);
  assert.equal(await ownerSave('plain-old', { id: 'plain-old', title: 'Old style product', ...base, category: 'digital' }, owner.token), 200, 'products without the new fields still save');
});

// A published PDF product for the checkout checks (file attached).
const PDF = Buffer.from('%PDF-1.4\n% test\n%%EOF\n');
async function publishWithFile(p){
  await db.doc('shopProducts/' + p.id).set(p);
  await bucket.file(`private/digital-products/${p.id}/t.pdf`).save(PDF, { contentType: 'application/pdf' });
  await db.doc('shopDigitalFiles/' + p.id).set({ productId: p.id, storagePath: `private/digital-products/${p.id}/t.pdf`, fileName: 't.pdf', sizeBytes: PDF.length, autoDelivery: true });
}
const buy = (items, extra = {}) => callFn('createCheckoutSession', { kind: 'shop', items, returnUrl: RETURN, ...extra }, member.token);

await test('an audio product can’t be bought even if set Active with a file', async () => {
  await publishWithFile({ ...john, status: 'published' });
  const r = await buy([{ productId: john.id, quantity: 1 }]);
  assert.equal(r.error, 'FAILED_PRECONDITION'); assert.match(r.message, /no longer available/);
  assert.equal((await ordersOf(member.uid)).length, 0);
});
const chooser = { ...john, id: 'choose-pdf', title: 'Choose PDF', category: 'study', format: 'pdf', status: 'published' };
const fixed = { id: 'fixed-pdf', title: 'Fixed PDF', ...base, category: 'study', status: 'published', priceCents: 900, format: 'pdf', pricing: 'fixed' };
await publishWithFile(chooser); await publishWithFile(fixed);
await test('a "customer chooses" item can’t share a checkout or take a discount code', async () => {
  const mixed = await buy([{ productId: chooser.id, quantity: 1 }, { productId: fixed.id, quantity: 1 }]);
  assert.equal(mixed.error, 'FAILED_PRECONDITION'); assert.match(mixed.message, /on its own/);
  const coded = await buy([{ productId: chooser.id, quantity: 1 }], { discountCode: 'ANYCODE' });
  assert.equal(coded.error, 'FAILED_PRECONDITION'); assert.match(coded.message, /Discount codes can’t be used/);
  assert.equal((await ordersOf(member.uid)).length, 0, 'no order was created');
});
await test('if the existing Stripe price can’t be confirmed, nothing is sold and no order is made', async () => {
  // Offline emulator: Stripe can't be reached, so the price can't be checked.
  const r = await buy([{ productId: chooser.id, quantity: 1 }]);
  assert.equal(r.error, 'FAILED_PRECONDITION'); assert.match(r.message, /not available to buy right now/);
  assert.equal((await ordersOf(member.uid)).length, 0);
});
async function pendingChooseOrder(){
  const ref = db.collection('shopOrders').doc();
  await ref.set({ uid: member.uid, email: member.email, status: 'pending_payment', paymentStatus: 'pending', customerChoosesAmount: true,
    items: [{ productId: chooser.id, title: chooser.title, option: '', type: 'digital', trackInventory: false, unitPriceCents: 1800, quantity: 1, discountCents: 0, paidCents: 1800, pricing: 'choose', minimumCents: 1800, stripePriceId: chooser.stripeTestPriceId }],
    subtotalCents: 1800, discountCents: 0, totalCents: 1800, hasPhysical: false, testMode: true, stripeSessionId: 'cs_test_' + ref.id, createdAt: new Date() });
  return ref.id;
}
const session = (id, amount) => ({ id: 'cs_test_' + id, object: 'checkout.session', payment_status: 'paid', amount_total: amount, currency: 'usd', payment_intent: 'pi_test_' + id, customer_details: { email: member.email, name: 'Member A' }, metadata: { kind: 'shop', id } });
await test('the amount the customer chose is recorded; above the minimum is not flagged', async () => {
  const id = await pendingChooseOrder();
  assert.equal(await webhook('checkout.session.completed', session(id, 2500)), 200);
  const o = (await db.doc('shopOrders/' + id).get()).data();
  assert.equal(o.amountPaid, 25); assert.equal(o.reviewFlags, undefined);
  const a = (await db.doc('digitalAccess/' + id + '_' + chooser.id).get()).data();
  assert.equal(a.amountPaidCents, 2500); assert.equal(a.accessStatus, 'active');
});
await test('a charge below the minimum is flagged for the owner', async () => {
  await db.collection('digitalAccess').where('uid', '==', member.uid).get().then(s => Promise.all(s.docs.map(d => d.ref.update({ accessStatus: 'refunded' }))));
  const id = await pendingChooseOrder();
  assert.equal(await webhook('checkout.session.completed', session(id, 1000)), 200);
  assert.ok((await db.doc('shopOrders/' + id).get()).data().reviewFlags.includes('amount-mismatch'));
});

console.log(results.join('\n'));
const failed = results.filter(r => r.startsWith('FAIL')).length;
console.log(`${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
