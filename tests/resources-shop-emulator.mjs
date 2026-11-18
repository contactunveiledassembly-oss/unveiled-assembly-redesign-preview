// Resources Shop — server rules against the Firebase emulators (a
// `demo-` project: no real database, Stripe account or files).
//
//   firebase emulators:exec --project demo-unveiledassembly \
//     --only auth,firestore,storage,functions "node tests/resources-shop-emulator.mjs"
//
// Same local-only setup as tests/digital-downloads-emulator.mjs
// (functions/.secret.local with dummy sk_test_/whsec_ values, and
// functions/.env.local with SANDBOX_TESTER_UIDS=member-a,member-b).
// The dummy key can't reach Stripe, which this test uses on purpose:
// it proves a checkout that never opens is closed and its discount
// use given back. $0 orders (100% codes) never call Stripe at all.
import { createRequire } from 'node:module';
import assert from 'node:assert/strict';
const require = createRequire(new URL('../functions/package.json', import.meta.url));
const crypto = require('crypto');
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
async function fsReq(method, path, token, body){
  const r = await fetch(`${FS}/${path}`, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
  return r.status;
}
const value = v => v === null ? { nullValue: null } : Array.isArray(v) ? { arrayValue: { values: v.map(value) } } : typeof v === 'number' ? { integerValue: String(v) } : typeof v === 'boolean' ? { booleanValue: v } : typeof v === 'object' ? { mapValue: { fields: Object.fromEntries(Object.entries(v).map(([k, x]) => [k, value(x)])) } } : { stringValue: String(v) };
const fields = obj => ({ fields: Object.fromEntries(Object.entries(obj).map(([k, v]) => [k, value(v)])) });
// A write with updatedAt = request.time (what the browser's serverTimestamp() sends).
async function fsCommit(path, obj, token){
  const r = await fetch(`${FS}:commit`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token }, body: JSON.stringify({ writes: [{ update: { name: `projects/${PROJECT}/databases/(default)/documents/${path}`, ...fields(obj) }, updateTransforms: [{ fieldPath: 'updatedAt', setToServerValue: 'REQUEST_TIME' }] }] }) });
  return r.status;
}
async function webhook(type, object){
  const payload = JSON.stringify({ id: 'evt_' + Math.random().toString(36).slice(2), type, data: { object } });
  const header = stripe.webhooks.generateTestHeaderString({ payload, secret: WEBHOOK_SECRET });
  const r = await fetch(`${FN}/stripeWebhook`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'stripe-signature': header }, body: payload });
  return r.status;
}
const hash = code => crypto.createHash('sha256').update(code.trim().toUpperCase().replace(/\s+/g, '')).digest('hex');
async function shopCode(code, over = {}){
  await db.doc('discountCodes/' + hash(code)).set({ code, type: 'percent', amount: 20, scope: 'shop', productIds: [], active: true, usedCount: 0, redeemedSourceIds: [], maxUses: null, startsAt: null, expiresAt: null, ...over });
}
const codeDoc = async code => (await db.doc('discountCodes/' + hash(code)).get()).data();
const buy = (member, productId, extra = {}) => callFn('createCheckoutSession', { kind: 'shop', items: [{ productId, quantity: 1 }], returnUrl: RETURN, ...extra }, member.token);
const ordersOf = async uid => (await db.collection('shopOrders').where('uid', '==', uid).get()).docs.map(d => ({ id: d.id, ...d.data() }));

// ---- setup ----
const owner = await user('owner@example.com', 'admin', 'owner-1');
const memberA = await user('a@example.com', 'member', 'member-a');
const memberB = await user('b@example.com', 'member', 'member-b');
const PDF = Buffer.from('%PDF-1.4\n% Unveiled Assembly test file\n%%EOF\n');
const product = { id: 'concealed', title: 'Concealed', subtitle: '', type: 'digital', category: 'digital', status: 'published', featured: false, priceCents: 1800, availability: 'Available', collection: '', image: '', images: [], description: '', included: [], delivery: '', options: [], tags: [], trackInventory: false, stock: null, isPlaceholder: false };
await db.doc('shopProducts/concealed').set(product);
await db.doc('shopProducts/second').set({ ...product, id: 'second', title: 'Second', priceCents: 1000 });
await db.doc('shopProducts/draft-one').set({ ...product, id: 'draft-one', title: 'Draft One', status: 'draft' });
await db.doc('shopProducts/archived-one').set({ ...product, id: 'archived-one', title: 'Archived One', status: 'archived' });
await db.doc('shopProducts/waiting-file').set({ ...product, id: 'waiting-file', title: 'Waiting File' });
for(const id of ['concealed', 'second', 'draft-one', 'archived-one']){
  await bucket.file(`private/digital-products/${id}/1.pdf`).save(PDF, { contentType: 'application/pdf' });
  await db.doc('shopDigitalFiles/' + id).set({ productId: id, storagePath: `private/digital-products/${id}/1.pdf`, fileName: id + '.pdf', sizeBytes: PDF.length, autoDelivery: true });
}

// ---- availability + pause ----
await test('draft and archived products cannot be bought', async () => {
  assert.equal((await buy(memberA, 'draft-one')).error, 'FAILED_PRECONDITION');
  assert.equal((await buy(memberA, 'archived-one')).error, 'FAILED_PRECONDITION');
});
await test('paused purchases are refused on the server with the owner’s message', async () => {
  await db.doc('shopSettings/store').set({ purchasesPaused: true, pausedMessage: 'Back soon.', collections: [] });
  const r = await buy(memberA, 'concealed');
  assert.equal(r.error, 'FAILED_PRECONDITION'); assert.equal(r.message, 'Back soon.');
  assert.equal((await ordersOf(memberA.uid)).length, 0, 'no order is created');
  await db.doc('shopSettings/store').set({ purchasesPaused: false, pausedMessage: '', collections: [] });
});

// ---- discount validation (all before any order exists) ----
await shopCode('EXPIRED', { expiresAt: '2020-01-01' });
await shopCode('LATER', { startsAt: '2099-01-01' });
await shopCode('PAUSEDCODE', { active: false });
await shopCode('SECONDONLY', { productIds: ['second'] });
await shopCode('USEDUP', { maxUses: 2, usedCount: 2 });
await db.doc('discountCodes/' + hash('SESSIONS')).set({ code: 'SESSIONS', type: 'percent', amount: 50, scope: 'both', active: true, usedCount: 0, redeemedSourceIds: [] });
await test('expired / not-started / paused / used-up / wrong-scope / out-of-scope codes are refused', async () => {
  for(const [code, re] of [['EXPIRED', /expired/], ['LATER', /isn’t active yet/], ['PAUSEDCODE', /paused/], ['USEDUP', /usage limit/], ['SESSIONS', /can’t be used in the Shop/], ['SECONDONLY', /doesn’t apply/], ['NOSUCH', /wasn’t found/]]){
    const r = await buy(memberA, 'concealed', { discountCode: code });
    assert.ok(r.error, code + ' should fail'); assert.match(r.message, re, code);
  }
  assert.equal((await ordersOf(memberA.uid)).length, 0);
});

// ---- checkout that never opens is closed, discount returned ----
await shopCode('TWENTY', { maxUses: 10 });
await test('if Stripe never opens, the order is closed and the discount use given back', async () => {
  const r = await buy(memberA, 'concealed', { discountCode: 'twenty' });
  assert.ok(r.error, 'dummy key cannot reach Stripe');
  const [o] = await ordersOf(memberA.uid);
  assert.equal(o.status, 'expired'); assert.equal(o.closeReason, 'checkout-not-opened');
  assert.equal(o.discountCents, 360); assert.equal(o.totalCents, 1440); assert.equal(o.items[0].paidCents, 1440);
  const c = await codeDoc('TWENTY');
  assert.equal(c.usedCount, 0); assert.deepEqual(c.redeemedSourceIds, []);
  assert.equal((await db.doc('discountRedemptions/shop_' + o.id).get()).exists, false);
});

// ---- 100% code: fulfilled on the server without a card ----
await shopCode('GIFTONE', { amount: 100, maxUses: 1, productIds: ['second'] });
let freeOrder;
await test('a verified 100% code fulfills the order on the server', async () => {
  const r = await buy(memberB, 'second', { discountCode: 'GIFTONE' });
  assert.equal(r.free, true); freeOrder = r.ref;
  const o = (await db.doc('shopOrders/' + freeOrder).get()).data();
  assert.equal(o.paymentStatus, 'paid'); assert.equal(o.amountPaid, 0); assert.equal(o.freeWithDiscount, true); assert.equal(o.testMode, true);
  const a = (await db.doc('digitalAccess/' + freeOrder + '_second').get()).data();
  assert.equal(a.accessStatus, 'active'); assert.equal(a.accessSource, 'discount-free'); assert.equal(a.amountPaidCents, 0);
  assert.equal((await codeDoc('GIFTONE')).usedCount, 1);
});
await test('the usage limit holds once the last use is taken', async () => {
  const r = await buy(memberA, 'second', { discountCode: 'GIFTONE' });
  assert.match(r.message, /usage limit/);
});

// ---- webhook: discounted price frozen, duplicates flagged, missing file flagged ----
async function pendingOrder(member, items, extra = {}){
  const ref = db.collection('shopOrders').doc();
  await ref.set({ uid: member.uid, email: member.email, status: 'pending_payment', paymentStatus: 'pending', items, subtotalCents: 1800, discountCents: 0, totalCents: 1800, hasPhysical: false, stripeSessionId: 'cs_test_' + ref.id, createdAt: new Date(), ...extra });
  return ref.id;
}
const paidSession = (id, amount) => ({ id: 'cs_test_' + id, object: 'checkout.session', livemode: false, payment_status: 'paid', amount_total: amount, currency: 'usd', payment_intent: 'pi_test_' + id, customer_details: { email: 'a@example.com', name: 'Member A' }, metadata: { kind: 'shop', id } });
const item = (productId, unit, discount = 0) => ({ productId, title: productId, option: '', type: 'digital', trackInventory: false, unitPriceCents: unit, quantity: 1, discountCents: discount, paidCents: unit - discount });
let orderA;
await test('access records what the customer actually paid, and a later price change leaves it alone', async () => {
  orderA = await pendingOrder(memberA, [item('concealed', 1800, 360)], { discountCents: 360, totalCents: 1440, discountCode: 'TWENTY' });
  assert.equal(await webhook('checkout.session.completed', paidSession(orderA, 1440)), 200);
  await db.doc('shopProducts/concealed').update({ priceCents: 2500 });
  const a = (await db.doc('digitalAccess/' + orderA + '_concealed').get()).data();
  const o = (await db.doc('shopOrders/' + orderA).get()).data();
  assert.equal(a.amountPaidCents, 1440); assert.equal(o.amountPaid, 14.4); assert.equal(o.items[0].unitPriceCents, 1800);
  assert.equal(o.testMode, true); assert.equal(o.reviewFlags, undefined);
});
await test('retried payment events never create a second grant', async () => {
  assert.equal(await webhook('checkout.session.completed', paidSession(orderA, 1440)), 200);
  assert.equal(await webhook('checkout.session.async_payment_succeeded', paidSession(orderA, 1440)), 200);
  assert.equal((await db.collection('digitalAccess').where('orderId', '==', orderA).get()).size, 1);
});
await test('paying twice for something already owned is flagged for the owner', async () => {
  const dupe = await pendingOrder(memberA, [item('concealed', 1800)]);
  assert.equal(await webhook('checkout.session.completed', paidSession(dupe, 1800)), 200);
  assert.deepEqual((await db.doc('shopOrders/' + dupe).get()).data().reviewFlags, ['duplicate-purchase:concealed']);
});
let waitingOrder;
await test('paid with no PDF attached → flagged and waiting, not downloadable', async () => {
  waitingOrder = await pendingOrder(memberA, [item('waiting-file', 1800)]);
  assert.equal(await webhook('checkout.session.completed', paidSession(waitingOrder, 1800)), 200);
  assert.deepEqual((await db.doc('shopOrders/' + waitingOrder).get()).data().reviewFlags, ['missing-file:waiting-file']);
  assert.equal((await db.doc('digitalAccess/' + waitingOrder + '_waiting-file').get()).data().accessStatus, 'pending_delivery');
  assert.equal((await callFn('createDigitalDownloadLink', { accessId: waitingOrder + '_waiting-file' }, memberA.token)).error, 'FAILED_PRECONDITION');
});
await test('attaching the PDF delivers waiting paid customers automatically', async () => {
  const started = await callFn('startDigitalFileUpload', { productId: 'waiting-file', fileName: 'w.pdf', sizeBytes: PDF.length }, owner.token);
  const put = await fetch(started.uploadUrl, { method: 'PUT', headers: { 'Content-Type': 'application/pdf' }, body: PDF });
  assert.ok(put.ok);
  const finished = await callFn('finishDigitalFileUpload', { uploadId: started.uploadId }, owner.token);
  assert.equal(finished.delivered, 1);
  assert.equal((await db.doc('digitalAccess/' + waitingOrder + '_waiting-file').get()).data().accessStatus, 'active');
  const log = await db.collection('shopAuditLog').where('productId', '==', 'waiting-file').get();
  assert.ok(log.docs.some(d => d.data().action === 'file-uploaded'));
});
await test('an expired checkout gives its reserved discount use back', async () => {
  await shopCode('RESERVED', { maxUses: 5, usedCount: 1, redeemedSourceIds: ['shop_x'] });
  const id = await pendingOrder(memberB, [item('concealed', 1800, 360)]);
  await db.doc('discountRedemptions/shop_' + id).set({ uid: memberB.uid, codeId: hash('RESERVED'), status: 'confirmed', sourceCollection: 'shopOrders', sourceId: id });
  await db.doc('discountCodes/' + hash('RESERVED')).update({ usedCount: 2, redeemedSourceIds: ['shop_x', 'shop_' + id] });
  assert.equal(await webhook('checkout.session.expired', { ...paidSession(id, 1440), payment_status: 'unpaid' }), 200);
  assert.equal((await db.doc('shopOrders/' + id).get()).data().status, 'expired');
  assert.equal((await codeDoc('RESERVED')).usedCount, 1);
});

// ---- archived product keeps prior access ----
await test('archiving a product keeps existing customers’ downloads', async () => {
  await db.doc('shopProducts/concealed').update({ status: 'archived' });
  const r = await callFn('createDigitalDownloadLink', { accessId: orderA + '_concealed' }, memberA.token);
  assert.ok(r.url, JSON.stringify(r));
  assert.equal((await buy(memberB, 'concealed')).error, 'FAILED_PRECONDITION', 'but nobody new can buy it');
  await db.doc('shopProducts/concealed').update({ status: 'published' });
});

// ---- owner order actions ----
await test('only the owner can use order actions and store status', async () => {
  assert.equal((await callFn('manageShopOrder', { action: 'note', orderId: orderA, note: 'x' }, memberA.token)).error, 'PERMISSION_DENIED');
  assert.equal((await callFn('shopStoreStatus', {}, memberA.token)).error, 'PERMISSION_DENIED');
  const s = await callFn('shopStoreStatus', {}, owner.token);
  assert.equal(s.stripeMode, 'test'); assert.equal(s.emailConnected, false);
});
await test('a refund must be confirmed and match the amount on screen', async () => {
  assert.match((await callFn('manageShopOrder', { action: 'refund', orderId: orderA, expectedAmountCents: 1440 }, owner.token)).message, /confirm/);
  assert.match((await callFn('manageShopOrder', { action: 'refund', orderId: orderA, expectedAmountCents: 999, confirmed: true }, owner.token)).message, /changed since/);
  assert.match((await callFn('manageShopOrder', { action: 'refund', orderId: freeOrder, expectedAmountCents: 0, confirmed: true }, owner.token)).message, /no card payment/);
});
// The charge.refunded webhook looks the payment up in Stripe, which the
// dummy key can't reach — that path is verified in the Stripe sandbox.
// "Close As Refunded" applies the same access change.
await test('a refunded purchase closes the download and says why', async () => {
  const r = await callFn('manageDigitalAccess', { action: 'refunded', accessId: orderA + '_concealed', note: 'Returned by phone' }, owner.token);
  assert.equal(r.ok, true);
  const link = await callFn('createDigitalDownloadLink', { accessId: orderA + '_concealed' }, memberA.token);
  assert.match(link.message, /refunded/, 'refunded purchases say so, not “not verified as paid”');
});
await test('notes and resolved alerts are kept in the audit trail', async () => {
  const dupe = (await ordersOf(memberA.uid)).find(o => (o.reviewFlags || []).length && o.reviewFlags[0].startsWith('duplicate'));
  assert.equal((await callFn('manageShopOrder', { action: 'note', orderId: dupe.id, note: 'Called the customer' }, owner.token)).ok, true);
  assert.equal((await callFn('manageShopOrder', { action: 'resolve-flag', orderId: dupe.id, flag: dupe.reviewFlags[0], note: 'Refunded in Stripe' }, owner.token)).ok, true);
  const o = (await db.doc('shopOrders/' + dupe.id).get()).data();
  assert.deepEqual(o.reviewFlags, []); assert.equal(o.ownerActions.length, 2); assert.equal(o.resolvedFlags[0].note, 'Refunded in Stripe');
  assert.ok((await db.collection('shopAuditLog').where('orderId', '==', dupe.id).get()).size >= 2);
});
await test('access changes from the portal are audited', async () => {
  await callFn('manageDigitalAccess', { action: 'revoke', accessId: freeOrder + '_second', note: 'Testing revoke' }, owner.token);
  const log = await db.collection('shopAuditLog').where('accessId', '==', freeOrder + '_second').get();
  assert.equal(log.docs[0].data().action, 'revoke'); assert.equal(log.docs[0].data().note, 'Testing revoke');
});

// ---- rules ----
await test('nobody (owner included) can write an order from the browser', async () => {
  assert.equal(await fsReq('PATCH', 'shopOrders/forged', owner.token, fields({ uid: owner.uid, status: 'paid', paymentStatus: 'paid' })), 403);
  assert.equal(await fsReq('PATCH', 'shopOrders/' + orderA + '?updateMask.fieldPaths=paymentStatus', owner.token, fields({ paymentStatus: 'refunded' })), 403);
});
await test('the owner can switch auto-delivery but not point a file at another object', async () => {
  assert.equal(await fsReq('PATCH', 'shopDigitalFiles/second?updateMask.fieldPaths=autoDelivery', owner.token, fields({ autoDelivery: false })), 200);
  assert.equal(await fsReq('PATCH', 'shopDigitalFiles/second?updateMask.fieldPaths=storagePath', owner.token, fields({ storagePath: 'private/other.pdf' })), 403);
});
await test('store settings: public read, owner-only valid write', async () => {
  assert.equal(await fsReq('GET', 'shopSettings/store'), 200);
  assert.equal(await fsCommit('shopSettings/store', { purchasesPaused: true, pausedMessage: '', collections: [] }, memberA.token), 403);
  assert.equal(await fsCommit('shopSettings/store', { purchasesPaused: false, pausedMessage: '', collections: [{ name: 'Series', description: '', visible: true }] }, owner.token), 200);
  assert.equal(await fsCommit('shopSettings/store', { purchasesPaused: false, pausedMessage: '', collections: [], extra: 'x' }, owner.token), 403);
});
await test('audit log is owner-read, never browser-written', async () => {
  assert.equal(await fsReq('GET', 'shopAuditLog/x', memberA.token), 403);
  assert.equal(await fsReq('PATCH', 'shopAuditLog/forged', owner.token, fields({ action: 'refund' })), 403);
});
await test('a member cannot claim a Shop code through the browser claim path', async () => {
  assert.equal(await fsReq('PATCH', 'discountRedemptions/claim-1', memberA.token, fields({ uid: memberA.uid, codeId: hash('TWENTY'), status: 'claimed', sourceCollection: null, sourceId: null })), 403);
});
await test('products may carry a test-only flag; it must be true/false', async () => {
  const ok = { ...product, id: 'test-prod', title: 'Test Product', testOnly: true };
  assert.equal(await fsCommit('shopProducts/test-prod', ok, owner.token), 200);
  assert.equal(await fsCommit('shopProducts/test-prod2', { ...ok, id: 'test-prod2', testOnly: 'yes' }, owner.token), 403);
});

console.log(results.join('\n'));
const failed = results.filter(r => r.startsWith('FAIL')).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
