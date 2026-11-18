// Complete purchase flow, end to end, against the Firebase emulators
// (a `demo-` project: no real database, files, Stripe account or card).
//
//   firebase emulators:exec --project demo-unveiledassembly \
//     --only auth,firestore,storage,functions "node tests/stripe-purchase-emulator.mjs"
//
// Uses the same local-only setup as the other emulator tests
// (functions/.secret.local with dummy sk_test_/whsec_ values; never a
// real key). Stripe's servers are never contacted: every Stripe event
// below is built here and signed with the local test webhook secret, the
// same way Stripe signs real ones, so the real signature check runs.
// Event ids are printed at the end for the test record.
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
const FN = `http://127.0.0.1:5001/${PROJECT}/us-central1`;
const WEBHOOK_SECRET = 'whsec_local_emulator_test_only';
const RETURN = 'https://unveiledassembly--stripe-sandbox-abc123.web.app/shop/confirmation.html';

initializeApp({ projectId: PROJECT, storageBucket: BUCKET });
const db = getFirestore();
const bucket = getStorage().bucket(BUCKET);
const stripe = new Stripe('sk_test_unused');

const results = [];
const eventLog = [];
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
let evtSeq = 0;
async function webhook(type, object, { id } = {}){
  const eventId = id || 'evt_test_local_' + String(++evtSeq).padStart(3, '0');
  const payload = JSON.stringify({ id: eventId, object: 'event', livemode: false, type, data: { object } });
  const header = stripe.webhooks.generateTestHeaderString({ payload, secret: WEBHOOK_SECRET });
  const r = await fetch(`${FN}/stripeWebhook`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'stripe-signature': header }, body: payload });
  eventLog.push(`${eventId} ${type} → HTTP ${r.status}`);
  return r.status;
}
const get = async path => { const s = await db.doc(path).get(); return s.exists ? s.data() : null; };
const accessFor = async orderId => (await db.collection('digitalAccess').where('orderId', '==', orderId).get()).docs.map(d => ({ id: d.id, ...d.data() }));
const notices = async uid => (await db.collection('memberNotifications').where('uid', '==', uid).get()).size;

// A Checkout Session object as Stripe sends it in test mode.
const session = (kind, id, extra = {}) => ({
  id: 'cs_test_' + id, object: 'checkout.session', livemode: false, mode: 'payment', payment_status: 'paid', status: 'complete',
  amount_total: 1800, currency: 'usd', payment_intent: 'pi_test_' + id,
  customer_details: { email: 'a@example.com', name: 'Member A' }, metadata: { kind, id, uid: 'member-a' }, ...extra
});
async function pendingShopOrder(member, extra = {}){
  const ref = db.collection('shopOrders').doc();
  await ref.set({ uid: member.uid, email: member.email, status: 'pending_payment', paymentStatus: 'pending',
    items: [{ productId: 'concealed', title: 'Concealed', option: '', type: 'digital', trackInventory: false, unitPriceCents: 1800, quantity: 1, discountCents: 0, paidCents: 1800 }],
    subtotalCents: 1800, discountCents: 0, totalCents: 1800, hasPhysical: false, testMode: true, stripeSessionId: 'cs_test_' + ref.id, createdAt: new Date(), ...extra });
  return ref.id;
}

// ---- setup: the Concealed PDF, kept private ----
const owner = await user('owner@example.com', 'admin', 'owner-1');
const memberA = await user('a@example.com', 'member', 'member-a');
const memberB = await user('b@example.com', 'member', 'member-b');
const PDF = Buffer.from('%PDF-1.4\n% Concealed — emulator test copy\n1 0 obj <<>> endobj\ntrailer <<>>\n%%EOF\n');
await db.doc('shopProducts/concealed').set({ id: 'concealed', title: 'Concealed', subtitle: '', type: 'digital', category: 'digital', status: 'published', featured: false, priceCents: 1800, availability: 'Available', collection: 'Digital', image: '', images: [], description: '', included: [], delivery: '', options: [], tags: [], trackInventory: false, stock: null, isPlaceholder: false });
await bucket.file('private/digital-products/concealed/1-concealed.pdf').save(PDF, { contentType: 'application/pdf' });
await db.doc('shopDigitalFiles/concealed').set({ productId: 'concealed', storagePath: 'private/digital-products/concealed/1-concealed.pdf', fileName: 'Concealed.pdf', sizeBytes: PDF.length, autoDelivery: true });

// ---- 1. The server prices the order; the browser's numbers are ignored ----
await test('1 server recalculates name and price; browser values are ignored', async () => {
  const r = await callFn('createCheckoutSession', { kind: 'shop', items: [{ productId: 'concealed', quantity: 7, priceCents: 1, unitPriceCents: 1, title: 'Free Book' }], amountCents: 1, returnUrl: RETURN }, memberA.token);
  // The dummy key can't reach Stripe, so the order is created, priced,
  // then closed because the payment page never opened.
  assert.ok(r.error, 'no checkout page opens with the dummy key');
  const orders = (await db.collection('shopOrders').where('uid', '==', memberA.uid).get()).docs.map(d => ({ id: d.id, ...d.data() }));
  assert.equal(orders.length, 1);
  const o = orders[0];
  assert.equal(o.items[0].title, 'Concealed');
  assert.equal(o.items[0].unitPriceCents, 1800);
  assert.equal(o.items[0].quantity, 1, 'a PDF is always quantity 1');
  assert.equal(o.totalCents, 1800);
  assert.equal(o.uid, memberA.uid);
  assert.equal(o.testMode, true);
  assert.equal(o.status, 'expired', 'closed because Stripe never opened');
  assert.equal((await accessFor(orders[0].id)).length, 0);
});
await test('1b signed-out visitor cannot start a PDF purchase', async () => {
  const r = await callFn('createCheckoutSession', { kind: 'shop', items: [{ productId: 'concealed', quantity: 1 }], returnUrl: RETURN });
  assert.ok(r.error);
});

// ---- 2. Normal successful payment ----
const paidOrder = await pendingShopOrder(memberA);
await test('2 returning from Stripe alone unlocks nothing', async () => {
  // The success page only reads; until the verified webhook arrives
  // there is no access record and no link can be made.
  assert.equal((await accessFor(paidOrder)).length, 0);
  const link = await callFn('createDigitalDownloadLink', { accessId: paidOrder + '_concealed' }, memberA.token);
  assert.equal(link.error, 'NOT_FOUND');
});
await test('2 a verified payment creates exactly one paid order and one download', async () => {
  const before = await notices(memberA.uid);
  assert.equal(await webhook('checkout.session.completed', session('shop', paidOrder)), 200);
  const o = await get('shopOrders/' + paidOrder);
  assert.equal(o.paymentStatus, 'paid'); assert.equal(o.status, 'paid'); assert.equal(o.amountPaid, 18);
  assert.equal(o.paymentIntentId, 'pi_test_' + paidOrder); assert.equal(o.testMode, true);
  assert.equal(o.reviewFlags, undefined);
  const access = await accessFor(paidOrder);
  assert.equal(access.length, 1);
  assert.equal(access[0].uid, memberA.uid); assert.equal(access[0].accessStatus, 'active');
  assert.equal(access[0].amountPaidCents, 1800); assert.equal(access[0].emailStatus, 'not_connected');
  assert.equal(await notices(memberA.uid), before + 1, 'one “Order Received” notice');
});
await test('2 the owner of the order downloads the private PDF once per link', async () => {
  const link = await callFn('createDigitalDownloadLink', { accessId: paidOrder + '_concealed' }, memberA.token);
  assert.ok(link.url && !link.url.includes('private/'), 'the link never shows where the file is stored');
  const r = await fetch(link.url);
  assert.equal(r.status, 200);
  assert.equal(r.headers.get('content-type'), 'application/pdf');
  assert.match(Buffer.from(await r.arrayBuffer()).toString(), /Concealed — emulator test copy/);
  assert.equal((await fetch(link.url)).status, 410, 'the same link cannot be reused');
  assert.equal((await get('digitalAccess/' + paidOrder + '_concealed')).downloadCount, 1);
});
await test('2 another member, a signed-out visitor and a guessed link all get nothing', async () => {
  assert.equal((await callFn('createDigitalDownloadLink', { accessId: paidOrder + '_concealed' }, memberB.token)).error, 'NOT_FOUND');
  assert.equal((await callFn('createDigitalDownloadLink', { accessId: paidOrder + '_concealed' })).error, 'UNAUTHENTICATED');
  assert.equal((await fetch(`${FN}/digitalDownload?t=${'a'.repeat(64)}`)).status, 410);
  assert.equal((await fetch(`${FN}/digitalDownload?t=../../private`)).status, 404);
});

// ---- 3. Cancelled checkout ----
const cancelledOrder = await pendingShopOrder(memberB);
await test('3 a cancelled checkout charges nothing, grants nothing and closes', async () => {
  // Leaving Stripe sends the member back with ?checkout=cancelled; the
  // session then expires and Stripe reports that.
  assert.equal(await webhook('checkout.session.expired', session('shop', cancelledOrder, { payment_status: 'unpaid', status: 'expired', payment_intent: null })), 200);
  const o = await get('shopOrders/' + cancelledOrder);
  assert.equal(o.status, 'expired'); assert.equal(o.paymentStatus, 'unpaid');
  assert.equal((await accessFor(cancelledOrder)).length, 0);
});

// ---- 4. Declined card ----
const declinedOrder = await pendingShopOrder(memberB);
await test('4 a declined card grants nothing; the order closes when the session expires', async () => {
  // A declined card (test card 4000 0000 0000 0002) never completes the
  // session — Stripe reports the failed attempt, which is ignored.
  assert.equal(await webhook('payment_intent.payment_failed', { id: 'pi_test_declined', object: 'payment_intent', status: 'requires_payment_method', last_payment_error: { code: 'card_declined' }, metadata: { kind: 'shop', id: declinedOrder } }), 200);
  assert.equal((await get('shopOrders/' + declinedOrder)).status, 'pending_payment');
  assert.equal((await accessFor(declinedOrder)).length, 0);
  assert.equal(await webhook('checkout.session.expired', session('shop', declinedOrder, { payment_status: 'unpaid', status: 'expired', payment_intent: null })), 200);
  assert.equal((await get('shopOrders/' + declinedOrder)).status, 'expired');
  assert.equal((await accessFor(declinedOrder)).length, 0);
});

// ---- 5. Repeated webhook delivery ----
await test('5 the same event delivered three times changes nothing after the first', async () => {
  const before = await notices(memberA.uid);
  for(let i = 0; i < 3; i++) assert.equal(await webhook('checkout.session.completed', session('shop', paidOrder), { id: 'evt_test_local_repeat' }), 200);
  assert.equal((await accessFor(paidOrder)).length, 1);
  assert.equal(await notices(memberA.uid), before);
  assert.equal((await get('digitalAccess/' + paidOrder + '_concealed')).downloadCount, 1, 'download history is kept');
});
await test('5 a second, different paid checkout for the same order is flagged, not doubled', async () => {
  assert.equal(await webhook('checkout.session.completed', session('shop', paidOrder, { id: 'cs_test_second_tab', payment_intent: 'pi_test_second_tab' })), 200);
  const o = await get('shopOrders/' + paidOrder);
  assert.deepEqual(o.duplicatePaymentSessionIds, ['cs_test_second_tab']);
  assert.ok(o.reviewFlags.includes('duplicate-payment:cs_test_second_tab'));
  assert.equal(o.paymentIntentId, 'pi_test_' + paidOrder, 'the original payment stays the order’s payment');
  assert.equal((await accessFor(paidOrder)).length, 1);
});

// ---- 6. Delayed (asynchronous) payment ----
const asyncOrder = await pendingShopOrder(memberB);
await test('6 a delayed payment unlocks only when Stripe confirms it', async () => {
  assert.equal(await webhook('checkout.session.completed', session('shop', asyncOrder, { payment_status: 'unpaid' })), 200);
  assert.equal((await accessFor(asyncOrder)).length, 0);
  assert.equal((await get('shopOrders/' + asyncOrder)).paymentStatus, 'pending');
  assert.equal(await webhook('checkout.session.async_payment_succeeded', session('shop', asyncOrder)), 200);
  assert.equal((await accessFor(asyncOrder))[0].accessStatus, 'active');
});
const asyncFail = await pendingShopOrder(memberB);
await test('6 a delayed payment that fails unlocks nothing', async () => {
  assert.equal(await webhook('checkout.session.completed', session('shop', asyncFail, { payment_status: 'unpaid' })), 200);
  assert.equal(await webhook('checkout.session.async_payment_failed', session('shop', asyncFail, { payment_status: 'unpaid' })), 200);
  assert.equal((await get('shopOrders/' + asyncFail)).status, 'expired');
  assert.equal((await accessFor(asyncFail)).length, 0);
});
await test('6 a charged total that differs from the order is flagged for the owner', async () => {
  const id = await pendingShopOrder(memberB);
  assert.equal(await webhook('checkout.session.completed', session('shop', id, { amount_total: 900 })), 200);
  assert.ok((await get('shopOrders/' + id)).reviewFlags.includes('amount-mismatch'));
});

// ---- 7. Refunds and chargebacks ----
await test('7 a partial refund keeps the download', async () => {
  assert.equal(await webhook('charge.refunded', { id: 'ch_test_partial', object: 'charge', payment_intent: 'pi_test_' + asyncOrder, refunded: false, amount_refunded: 500 }), 200);
  const a = (await accessFor(asyncOrder))[0];
  assert.equal(a.accessStatus, 'active'); assert.equal(a.refundStatus, 'partially_refunded');
  assert.equal((await get('shopOrders/' + asyncOrder)).paymentStatus, 'partially_refunded');
});
await test('7 a full refund made in Stripe closes the download and says why', async () => {
  const link = await callFn('createDigitalDownloadLink', { accessId: asyncOrder + '_concealed' }, memberB.token);
  assert.ok(link.url, 'a link issued before the refund');
  assert.equal(await webhook('charge.refunded', { id: 'ch_test_full', object: 'charge', payment_intent: 'pi_test_' + asyncOrder, refunded: true, amount_refunded: 1800 }), 200);
  const a = (await accessFor(asyncOrder))[0];
  assert.equal(a.accessStatus, 'refunded'); assert.equal(a.paymentStatus, 'refunded');
  assert.equal((await get('shopOrders/' + asyncOrder)).status, 'refunded');
  const again = await callFn('createDigitalDownloadLink', { accessId: asyncOrder + '_concealed' }, memberB.token);
  assert.match(again.message, /refunded/);
  assert.equal((await fetch(link.url)).status, 410, 'the earlier link stops working too');
});
const disputed = await pendingShopOrder(memberB);
await webhook('checkout.session.completed', session('shop', disputed));
await test('7 a chargeback pauses the download; winning it restores access', async () => {
  const dispute = { id: 'dp_test_1', object: 'dispute', payment_intent: 'pi_test_' + disputed, charge: 'ch_test_d1', amount: 1800, reason: 'fraudulent' };
  assert.equal(await webhook('charge.dispute.created', { ...dispute, status: 'needs_response' }), 200);
  assert.equal(await webhook('charge.dispute.created', { ...dispute, status: 'needs_response' }), 200, 'repeat is harmless');
  let a = (await accessFor(disputed))[0];
  assert.equal(a.accessStatus, 'revoked'); assert.equal(a.revokedReason, 'chargeback'); assert.equal(a.accessBeforeDispute, 'active');
  const o = await get('shopOrders/' + disputed);
  assert.equal(o.disputeStatus, 'open'); assert.ok(o.reviewFlags.includes('chargeback-open'));
  assert.equal((await callFn('createDigitalDownloadLink', { accessId: a.id }, memberB.token)).error, 'PERMISSION_DENIED');
  assert.equal(await webhook('charge.dispute.closed', { ...dispute, status: 'won' }), 200);
  a = (await accessFor(disputed))[0];
  assert.equal(a.accessStatus, 'active'); assert.equal(a.disputeStatus, 'won');
  assert.ok((await callFn('createDigitalDownloadLink', { accessId: a.id }, memberB.token)).url);
});
await test('7 a lost chargeback keeps the download off', async () => {
  const id = await pendingShopOrder(memberB);
  await webhook('checkout.session.completed', session('shop', id));
  const dispute = { id: 'dp_test_2', object: 'dispute', payment_intent: 'pi_test_' + id, amount: 1800, reason: 'fraudulent' };
  await webhook('charge.dispute.created', { ...dispute, status: 'needs_response' });
  assert.equal(await webhook('charge.dispute.closed', { ...dispute, status: 'lost' }), 200);
  const a = (await accessFor(id))[0];
  assert.equal(a.accessStatus, 'revoked'); assert.equal(a.disputeStatus, 'lost');
  assert.equal((await get('shopOrders/' + id)).paymentNeedsReview, true);
});

// ---- the same server path for sessions and classes ----
await test('booking: verified payment confirms it once; paid after cancelling is flagged', async () => {
  await db.doc('bookings/bk-1').set({ uid: memberA.uid, name: 'Member A', email: memberA.email, sessionType: '30-minute', date: '2026-12-01', time: '14:00', status: 'pending', paymentStatus: 'pending', stripeSessionId: 'cs_test_bk-1', confirmationId: '1ON1-TEST01' });
  assert.equal(await webhook('checkout.session.completed', session('booking', 'bk-1', { amount_total: 5000 })), 200);
  assert.equal(await webhook('checkout.session.completed', session('booking', 'bk-1', { amount_total: 5000 })), 200);
  let b = await get('bookings/bk-1');
  assert.equal(b.status, 'confirmed'); assert.equal(b.paymentStatus, 'paid'); assert.equal(b.amountPaid, 50);
  assert.equal(b.paymentNeedsReview, undefined);
  await db.doc('bookings/bk-2').set({ uid: memberA.uid, name: 'Member A', email: memberA.email, sessionType: '30-minute', date: '2026-12-02', time: '14:00', status: 'cancelled', paymentStatus: 'pending', stripeSessionId: 'cs_test_bk-2' });
  assert.equal(await webhook('checkout.session.completed', session('booking', 'bk-2', { amount_total: 5000 })), 200);
  b = await get('bookings/bk-2');
  assert.equal(b.status, 'cancelled', 'a cancelled booking is not revived'); assert.equal(b.paymentNeedsReview, true);
  assert.equal(await webhook('charge.refunded', { id: 'ch_test_bk1', object: 'charge', payment_intent: 'pi_test_bk-1', refunded: true, amount_refunded: 5000 }), 200);
  b = await get('bookings/bk-1');
  assert.equal(b.paymentStatus, 'refunded'); assert.equal(b.paymentRefunded, true);
});
await test('class: verified payment opens the classroom; a full refund closes it', async () => {
  await db.doc('teachingRegistrations/reg-1').set({ uid: memberA.uid, teachingId: 'class-1', teachingTitle: 'Discernment', firstName: 'Member', lastName: 'A', email: memberA.email, status: 'pending_payment', paymentStatus: 'pending', stripeSessionId: 'cs_test_reg-1', confirmationId: 'CLS-TEST01' });
  assert.equal(await webhook('checkout.session.completed', session('teaching', 'reg-1', { amount_total: 2500 })), 200);
  assert.equal((await get('teachingRegistrations/reg-1')).status, 'confirmed');
  assert.equal((await get('classEnrollments/class-1_' + memberA.uid)).paymentStatus, 'paid');
  assert.equal(await webhook('charge.refunded', { id: 'ch_test_reg1', object: 'charge', payment_intent: 'pi_test_reg-1', refunded: true, amount_refunded: 2500 }), 200);
  assert.equal((await get('teachingRegistrations/reg-1')).status, 'refunded');
  assert.equal(await get('classEnrollments/class-1_' + memberA.uid), null);
});
await test('a forged or unsigned event changes nothing', async () => {
  const id = await pendingShopOrder(memberB);
  const payload = JSON.stringify({ id: 'evt_forged', type: 'checkout.session.completed', data: { object: session('shop', id) } });
  const forged = stripe.webhooks.generateTestHeaderString({ payload, secret: 'whsec_not_the_real_secret' });
  assert.equal((await fetch(`${FN}/stripeWebhook`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'stripe-signature': forged }, body: payload })).status, 400);
  assert.equal((await fetch(`${FN}/stripeWebhook`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: payload })).status, 400);
  assert.equal((await get('shopOrders/' + id)).paymentStatus, 'pending');
  assert.equal((await accessFor(id)).length, 0);
});

console.log(results.join('\n'));
console.log('\nTest events sent (local test signatures, never sent to Stripe):\n' + eventLog.join('\n'));
const failed = results.filter(r => r.startsWith('FAIL')).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
