// Digital downloads — security + delivery tests against the Firebase
// emulators (no real project, Stripe, or files are touched).
//
//   firebase emulators:exec --project demo-unveiledassembly \
//     --only auth,firestore,storage,functions "node tests/digital-downloads-emulator.mjs"
//
// Needs functions/.secret.local with local-only values (never real keys):
//   STRIPE_SECRET_KEY=sk_test_local_emulator_dummy_not_real
//   STRIPE_WEBHOOK_SECRET=whsec_local_emulator_test_only
import { createRequire } from 'node:module';
import assert from 'node:assert/strict';
const require = createRequire(new URL('../functions/package.json', import.meta.url));
const { initializeApp } = require('firebase-admin/app');
const { getFirestore, Timestamp } = require('firebase-admin/firestore');
const { getStorage } = require('firebase-admin/storage');
const Stripe = require('stripe');

const PROJECT = process.env.GCLOUD_PROJECT || 'demo-unveiledassembly';
const BUCKET = PROJECT + '.appspot.com';
const AUTH = 'http://127.0.0.1:9099';
const FS = `http://127.0.0.1:8180/v1/projects/${PROJECT}/databases/(default)/documents`;
const ST = 'http://127.0.0.1:9199';
const FN = `http://127.0.0.1:5001/${PROJECT}/us-central1`;
const WEBHOOK_SECRET = 'whsec_local_emulator_test_only';
const RETURN = 'https://theunveiledassembly.com/shop/confirmation.html';

initializeApp({ projectId: PROJECT, storageBucket: BUCKET });
const db = getFirestore();
const bucket = getStorage().bucket(BUCKET);
const stripe = new Stripe('sk_test_unused');

const results = [];
async function test(name, fn){
  try { await fn(); results.push('PASS ' + name); }
  catch (err) { results.push('FAIL ' + name + ' — ' + (err && err.message ? err.message.split('\n')[0] : err)); }
}

async function user(email, role){
  const r = await fetch(`${AUTH}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password: 'Password123', returnSecureToken: true }) });
  const j = await r.json();
  await db.doc('users/' + j.localId).set({ email, role, name: email.split('@')[0] });
  return { uid: j.localId, token: j.idToken, email };
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
const fields = obj => ({ fields: Object.fromEntries(Object.entries(obj).map(([k, v]) => [k, typeof v === 'number' ? { integerValue: String(v) } : typeof v === 'boolean' ? { booleanValue: v } : { stringValue: String(v) }])) });
async function webhook(type, object){
  const payload = JSON.stringify({ id: 'evt_' + Math.random().toString(36).slice(2), type, data: { object } });
  const header = stripe.webhooks.generateTestHeaderString({ payload, secret: WEBHOOK_SECRET });
  const r = await fetch(`${FN}/stripeWebhook`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'stripe-signature': header }, body: payload });
  return r.status;
}
async function pendingOrder(member, productId, title){
  const ref = db.collection('shopOrders').doc();
  await ref.set({ uid: member.uid, email: member.email, status: 'pending_payment', paymentStatus: 'pending', items: [{ productId, title, option: '', type: 'digital', trackInventory: false, unitPriceCents: 1800, quantity: 1 }], subtotalCents: 1800, totalCents: 1800, hasPhysical: false, stripeSessionId: 'cs_test_' + ref.id });
  return ref.id;
}
const session = (orderId, extra = {}) => ({ id: 'cs_test_' + orderId, object: 'checkout.session', payment_status: 'paid', amount_total: 1800, currency: 'usd', payment_intent: 'pi_test_' + orderId, customer_details: { email: 'a@example.com', name: 'Member A' }, metadata: { kind: 'shop', id: orderId }, ...extra });

// ---- setup ----
const owner = await user('owner@example.com', 'admin');
const memberA = await user('a@example.com', 'member');
const memberB = await user('b@example.com', 'member');
const PDF = Buffer.from('%PDF-1.4\n% Unveiled Assembly test file\n1 0 obj <<>> endobj\ntrailer <<>>\n%%EOF\n');
const product = { id: 'concealed', title: 'Concealed', subtitle: '', type: 'digital', category: 'digital', status: 'published', featured: false, priceCents: 1800, availability: 'Available', collection: 'Digital', image: '', images: [], description: '', included: [], delivery: '', options: [], tags: [], trackInventory: false, stock: null, isPlaceholder: false };
await db.doc('shopProducts/concealed').set(product);
await db.doc('shopProducts/manual-study').set({ ...product, id: 'manual-study', title: 'Manual Study' });
await db.doc('shopProducts/no-file-yet').set({ ...product, id: 'no-file-yet', title: 'No File Yet' });
await bucket.file('private/digital-products/concealed/1-concealed.pdf').save(PDF, { contentType: 'application/pdf' });
await bucket.file('private/digital-products/manual-study/1-manual.pdf').save(PDF, { contentType: 'application/pdf' });
await db.doc('shopDigitalFiles/concealed').set({ productId: 'concealed', storagePath: 'private/digital-products/concealed/1-concealed.pdf', fileName: 'Concealed.pdf', sizeBytes: PDF.length, autoDelivery: true });
await db.doc('shopDigitalFiles/manual-study').set({ productId: 'manual-study', storagePath: 'private/digital-products/manual-study/1-manual.pdf', fileName: 'Manual.pdf', sizeBytes: PDF.length, autoDelivery: false });

// ---- checkout gate (rejected before any Stripe call) ----
await test('signed-out visitor cannot check out a digital product', async () => {
  const r = await callFn('createCheckoutSession', { kind: 'shop', items: [{ productId: 'concealed', quantity: 1 }], returnUrl: RETURN });
  assert.equal(r.error, 'UNAUTHENTICATED');
});
await test('digital product without an uploaded PDF cannot be bought', async () => {
  const r = await callFn('createCheckoutSession', { kind: 'shop', items: [{ productId: 'no-file-yet', quantity: 1 }], returnUrl: RETURN }, memberA.token);
  assert.equal(r.error, 'FAILED_PRECONDITION');
});

// ---- webhook → access ----
const orderA = await pendingOrder(memberA, 'concealed', 'Concealed');
const accessA = orderA + '_concealed';
await test('webhook with a bad signature is rejected', async () => {
  const r = await fetch(`${FN}/stripeWebhook`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'stripe-signature': 't=1,v1=bad' }, body: JSON.stringify({ type: 'checkout.session.completed', data: { object: session(orderA) } }) });
  assert.equal(r.status, 400);
  assert.equal((await db.doc('digitalAccess/' + accessA).get()).exists, false);
});
await test('verified payment grants access with full receipt fields', async () => {
  assert.equal(await webhook('checkout.session.completed', session(orderA)), 200);
  const a = (await db.doc('digitalAccess/' + accessA).get()).data();
  assert.equal(a.accessStatus, 'active'); assert.equal(a.paymentStatus, 'paid'); assert.equal(a.uid, memberA.uid);
  assert.equal(a.productTitle, 'Concealed'); assert.equal(a.amountPaidCents, 1800); assert.equal(a.currency, 'usd');
  assert.equal(a.paymentIntentId, 'pi_test_' + orderA); assert.equal(a.stripeSessionId, 'cs_test_' + orderA);
  assert.equal(a.refundStatus, 'none'); assert.equal(a.emailStatus, 'not_connected'); assert.equal(a.downloadCount, 0);
  const o = (await db.doc('shopOrders/' + orderA).get()).data();
  assert.equal(o.paymentStatus, 'paid'); assert.deepEqual(o.digitalAccessIds, [accessA]);
});
await test('duplicate webhook delivery changes nothing', async () => {
  const before = (await db.collection('memberNotifications').where('uid', '==', memberA.uid).get()).size;
  assert.equal(await webhook('checkout.session.completed', session(orderA)), 200);
  const after = (await db.collection('memberNotifications').where('uid', '==', memberA.uid).get()).size;
  assert.equal(after, before);
  assert.equal((await db.collection('digitalAccess').where('orderId', '==', orderA).get()).size, 1);
});
await test('buying something you already own is refused', async () => {
  const r = await callFn('createCheckoutSession', { kind: 'shop', items: [{ productId: 'concealed', quantity: 1 }], returnUrl: RETURN }, memberA.token);
  assert.equal(r.error, 'ALREADY_EXISTS');
});

// ---- downloads ----
let firstUrl;
await test('member downloads their own PDF through a one-time link', async () => {
  const r = await callFn('createDigitalDownloadLink', { accessId: accessA }, memberA.token);
  assert.ok(r.url && r.url.includes('/digitalDownload?t='), JSON.stringify(r));
  firstUrl = r.url;
  const res = await fetch(r.url);
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('content-type'), 'application/pdf');
  assert.match(res.headers.get('content-disposition'), /attachment; filename="Concealed\.pdf"/);
  assert.equal(res.headers.get('cache-control'), 'private, no-store');
  assert.deepEqual(Buffer.from(await res.arrayBuffer()), PDF);
});
await test('the same link cannot be used twice', async () => {
  assert.equal((await fetch(firstUrl)).status, 410);
});
await test('download count, last download, and activity are recorded', async () => {
  const a = (await db.doc('digitalAccess/' + accessA).get()).data();
  assert.equal(a.downloadCount, 1); assert.ok(a.lastDownloadAt);
  const events = await db.collection('digitalDownloadEvents').where('accessId', '==', accessA).get();
  assert.equal(events.size, 1);
  assert.equal(JSON.stringify(events.docs[0].data()).includes('private/'), false, 'event must not expose the file location');
});
await test('the link response never reveals the storage path', async () => {
  const r = await callFn('createDigitalDownloadLink', { accessId: accessA }, memberA.token);
  assert.equal(JSON.stringify(r).includes('private/'), false);
});
await test('expired link is refused', async () => {
  const token = 'e'.repeat(64);
  await db.doc('digitalDownloadTokens/' + token).set({ accessId: accessA, uid: memberA.uid, productId: 'concealed', used: false, expiresAt: Timestamp.fromMillis(Date.now() - 1000) });
  assert.equal((await fetch(`${FN}/digitalDownload?t=${token}`)).status, 410);
});
await test('another member cannot get a link for your purchase', async () => {
  const r = await callFn('createDigitalDownloadLink', { accessId: accessA }, memberB.token);
  assert.equal(r.error, 'NOT_FOUND');
});
await test('signed-out request for a link is refused', async () => {
  const r = await callFn('createDigitalDownloadLink', { accessId: accessA });
  assert.equal(r.error, 'UNAUTHENTICATED');
});
await test('member email request is recorded honestly as not connected', async () => {
  const r = await callFn('requestDigitalAccessEmail', { accessId: accessA }, memberA.token);
  assert.equal(r.sent, false); assert.equal(r.emailStatus, 'not_connected');
});

// ---- Firestore rules ----
await test('member reads their own access record', async () => assert.equal(await fsReq('GET', 'digitalAccess/' + accessA, memberA.token), 200));
await test("member cannot read another member's access record", async () => assert.equal(await fsReq('GET', 'digitalAccess/' + accessA, memberB.token), 403));
await test('member cannot grant themselves access', async () => assert.equal(await fsReq('PATCH', 'digitalAccess/fake_concealed', memberB.token, fields({ uid: memberB.uid, productId: 'concealed', accessStatus: 'active', paymentStatus: 'paid' })), 403));
await test('member cannot change their own access record', async () => assert.equal(await fsReq('PATCH', 'digitalAccess/' + accessA + '?updateMask.fieldPaths=downloadCount', memberA.token, fields({ downloadCount: 0 })), 403));
await test('member cannot create a paid order', async () => assert.equal(await fsReq('PATCH', 'shopOrders/forged-order', memberB.token, fields({ uid: memberB.uid, status: 'paid', paymentStatus: 'paid' })), 403));
await test('member cannot read private file settings', async () => assert.equal(await fsReq('GET', 'shopDigitalFiles/concealed', memberA.token), 403));
await test('nobody can read download tokens from the browser', async () => assert.equal(await fsReq('GET', 'digitalDownloadTokens/' + 'e'.repeat(64), owner.token), 403));
await test('member cannot read download activity', async () => assert.equal(await fsReq('GET', 'digitalDownloadEvents/x', memberA.token), 403));
await test('owner can read private file settings', async () => assert.equal(await fsReq('GET', 'shopDigitalFiles/concealed', owner.token), 200));

// ---- Storage rules ----
const filePath = encodeURIComponent('private/digital-products/concealed/1-concealed.pdf');
await test('member cannot read the PDF from storage directly', async () => assert.equal((await fetch(`${ST}/v0/b/${BUCKET}/o/${filePath}?alt=media`, { headers: { Authorization: 'Firebase ' + memberA.token } })).status, 403));
await test('signed-out visitor cannot read the PDF', async () => assert.equal((await fetch(`${ST}/v0/b/${BUCKET}/o/${filePath}?alt=media`)).status, 403));
await test('member cannot upload a PDF', async () => assert.equal((await fetch(`${ST}/v0/b/${BUCKET}/o?name=${encodeURIComponent('private/digital-products/concealed/evil.pdf')}`, { method: 'POST', headers: { Authorization: 'Firebase ' + memberA.token, 'Content-Type': 'application/pdf' }, body: PDF })).status, 403));
await test('storage stays closed to the owner too (uploads go through the server)', async () => assert.equal((await fetch(`${ST}/v0/b/${BUCKET}/o?name=${encodeURIComponent('private/digital-products/concealed/2-new.pdf')}`, { method: 'POST', headers: { Authorization: 'Firebase ' + owner.token, 'Content-Type': 'application/pdf' }, body: PDF })).status, 403));
await test('even the owner cannot read files publicly (downloads only via the server)', async () => assert.equal((await fetch(`${ST}/v0/b/${BUCKET}/o/${filePath}?alt=media`, { headers: { Authorization: 'Firebase ' + owner.token } })).status, 403));

// ---- owner actions ----
await test('a member cannot use owner actions', async () => assert.equal((await callFn('manageDigitalAccess', { action: 'grant', accessId: accessA }, memberA.token)).error, 'PERMISSION_DENIED'));
await test('owner turns access off → member can no longer download', async () => {
  assert.deepEqual(await callFn('manageDigitalAccess', { action: 'revoke', accessId: accessA }, owner.token), { ok: true });
  assert.equal((await callFn('createDigitalDownloadLink', { accessId: accessA }, memberA.token)).error, 'PERMISSION_DENIED');
});
await test('a link issued before access was turned off stops working', async () => {
  await callFn('manageDigitalAccess', { action: 'grant', accessId: accessA }, owner.token);
  const r = await callFn('createDigitalDownloadLink', { accessId: accessA }, memberA.token);
  await callFn('manageDigitalAccess', { action: 'revoke', accessId: accessA }, owner.token);
  assert.equal((await fetch(r.url)).status, 410);
});
await test('owner gives access back → download works again', async () => {
  await callFn('manageDigitalAccess', { action: 'grant', accessId: accessA }, owner.token);
  const r = await callFn('createDigitalDownloadLink', { accessId: accessA }, memberA.token);
  assert.equal((await fetch(r.url)).status, 200);
});
await test('owner records a refund → download closes and refund is recorded', async () => {
  await callFn('manageDigitalAccess', { action: 'refunded', accessId: accessA }, owner.token);
  const a = (await db.doc('digitalAccess/' + accessA).get()).data();
  assert.equal(a.accessStatus, 'refunded'); assert.equal(a.refundStatus, 'refunded');
  assert.equal((await callFn('createDigitalDownloadLink', { accessId: accessA }, memberA.token)).error, 'FAILED_PRECONDITION');
  assert.ok(Array.isArray(a.ownerActions) && a.ownerActions.length >= 4);
});
await test('owner resend is recorded honestly as not connected', async () => {
  const r = await callFn('manageDigitalAccess', { action: 'resend', accessId: accessA }, owner.token);
  assert.equal(r.emailStatus, 'not_connected');
});
await test('owner gives a complimentary copy to a member by email', async () => {
  const r = await callFn('manageDigitalAccess', { action: 'grant-new', productId: 'concealed', email: 'b@example.com' }, owner.token);
  assert.ok(r.accessId);
  const link = await callFn('createDigitalDownloadLink', { accessId: r.accessId }, memberB.token);
  assert.equal((await fetch(link.url)).status, 200);
});

// ---- owner upload + replacement (server-side session) ----
const PDF_V2 = Buffer.from('%PDF-1.7\n% Concealed second edition\n%%EOF\n');
async function ownerUpload(token, productId, bytes, name){
  const started = await callFn('startDigitalFileUpload', { productId, fileName: name, sizeBytes: bytes.length }, token);
  if(started.error) return started;
  const put = await fetch(started.uploadUrl, { method: 'PUT', headers: { 'Content-Type': 'application/pdf' }, body: bytes });
  if(!put.ok) return { error: 'PUT ' + put.status };
  return { started, finished: await callFn('finishDigitalFileUpload', { uploadId: started.uploadId }, token) };
}
await test('a member cannot start an upload', async () => {
  assert.equal((await callFn('startDigitalFileUpload', { productId: 'concealed', fileName: 'x.pdf', sizeBytes: 10 }, memberA.token)).error, 'PERMISSION_DENIED');
});
await test('owner replaces the PDF; the path is chosen by the server and never returned', async () => {
  const before = (await db.doc('shopDigitalFiles/concealed').get()).data();
  const r = await ownerUpload(owner.token, 'concealed', PDF_V2, 'Concealed.pdf');
  assert.ok(r.finished && r.finished.file, JSON.stringify(r));
  assert.equal(JSON.stringify(r.finished).includes('private/'), false);
  const after = (await db.doc('shopDigitalFiles/concealed').get()).data();
  assert.notEqual(after.storagePath, before.storagePath);
  assert.equal(after.previousStoragePath, before.storagePath, 'replaced file kept for rollback');
  assert.equal(after.sizeBytes, PDF_V2.length); assert.equal(after.uploadedBy, owner.uid);
});
await test('after replacement, customers download the new edition', async () => {
  const link = await callFn('createDigitalDownloadLink', { accessId: accessA }, memberA.token);
  // accessA was refunded above; use the complimentary copy instead
  const gift = (await db.collection('digitalAccess').where('uid', '==', memberB.uid).where('productId', '==', 'concealed').get()).docs[0].id;
  const l2 = await callFn('createDigitalDownloadLink', { accessId: gift }, memberB.token);
  assert.equal(link.error, 'FAILED_PRECONDITION');
  assert.deepEqual(Buffer.from(await (await fetch(l2.url)).arrayBuffer()), PDF_V2);
});
await test('a non-PDF upload is rejected and deleted', async () => {
  const r = await ownerUpload(owner.token, 'concealed', Buffer.from('<html>not a pdf</html>'), 'fake.pdf');
  assert.equal(r.finished.error, 'INVALID_ARGUMENT');
  const [files] = await bucket.getFiles({ prefix: 'private/digital-products/concealed/' });
  assert.equal(files.length, 2, 'only the original and the replacement remain');
});
await test('an upload id cannot be reused or finished by a member', async () => {
  const started = await callFn('startDigitalFileUpload', { productId: 'concealed', fileName: 'x.pdf', sizeBytes: 10 }, owner.token);
  assert.equal((await callFn('finishDigitalFileUpload', { uploadId: started.uploadId }, memberA.token)).error, 'PERMISSION_DENIED');
});

// ---- automatic delivery off ----
const orderM = await pendingOrder(memberA, 'manual-study', 'Manual Study');
await test('with automatic delivery off, a paid order waits for the owner', async () => {
  assert.equal(await webhook('checkout.session.completed', session(orderM)), 200);
  const a = (await db.doc('digitalAccess/' + orderM + '_manual-study').get()).data();
  assert.equal(a.accessStatus, 'pending_delivery'); assert.equal(a.paymentStatus, 'paid');
  assert.equal((await callFn('createDigitalDownloadLink', { accessId: orderM + '_manual-study' }, memberA.token)).error, 'FAILED_PRECONDITION');
  await callFn('manageDigitalAccess', { action: 'grant', accessId: orderM + '_manual-study' }, owner.token);
  const link = await callFn('createDigitalDownloadLink', { accessId: orderM + '_manual-study' }, memberA.token);
  assert.equal((await fetch(link.url)).status, 200);
});

// ---- cancelled / unpaid ----
const orderX = await pendingOrder(memberB, 'manual-study', 'Manual Study');
await test('an unpaid (async pending) checkout grants nothing', async () => {
  assert.equal(await webhook('checkout.session.completed', session(orderX, { payment_status: 'unpaid' })), 200);
  assert.equal((await db.doc('digitalAccess/' + orderX + '_manual-study').get()).exists, false);
});
await test('an expired checkout grants nothing and closes the order', async () => {
  assert.equal(await webhook('checkout.session.expired', session(orderX, { payment_status: 'unpaid' })), 200);
  assert.equal((await db.doc('digitalAccess/' + orderX + '_manual-study').get()).exists, false);
  assert.equal((await db.doc('shopOrders/' + orderX).get()).data().status, 'expired');
});

// ---- delayed (async) payments ----
const orderAsync = await pendingOrder(memberB, 'manual-study', 'Manual Study');
await test('a delayed payment that later succeeds grants access then', async () => {
  assert.equal(await webhook('checkout.session.completed', session(orderAsync, { payment_status: 'unpaid' })), 200);
  assert.equal((await db.doc('digitalAccess/' + orderAsync + '_manual-study').get()).exists, false);
  assert.equal(await webhook('checkout.session.async_payment_succeeded', session(orderAsync)), 200);
  assert.equal((await db.doc('digitalAccess/' + orderAsync + '_manual-study').get()).data().paymentStatus, 'paid');
});
const orderFail = await pendingOrder(memberA, 'concealed', 'Concealed');
await test('a delayed payment that fails grants nothing', async () => {
  assert.equal(await webhook('checkout.session.async_payment_failed', session(orderFail, { payment_status: 'unpaid' })), 200);
  assert.equal((await db.doc('digitalAccess/' + orderFail + '_concealed').get()).exists, false);
  assert.equal((await db.doc('shopOrders/' + orderFail).get()).data().status, 'expired');
});

// ---- archived products, later sign-in, unverified accounts ----
await test('an archived product cannot be bought, but past buyers keep their download', async () => {
  await db.doc('shopProducts/manual-study').update({ status: 'archived' });
  const memberC = await user('c@example.com', 'member');
  assert.equal((await callFn('createCheckoutSession', { kind: 'shop', items: [{ productId: 'manual-study', quantity: 1 }], returnUrl: RETURN }, memberC.token)).error, 'FAILED_PRECONDITION');
  const link = await callFn('createDigitalDownloadLink', { accessId: orderM + '_manual-study' }, memberA.token);
  assert.equal((await fetch(link.url)).status, 200);
});
await test('access survives signing out and back in (fresh session token)', async () => {
  const r = await fetch(`${AUTH}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=fake`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'a@example.com', password: 'Password123', returnSecureToken: true }) });
  const fresh = (await r.json()).idToken;
  assert.notEqual(fresh, memberA.token);
  assert.equal(await fsReq('GET', 'digitalAccess/' + orderM + '_manual-study', fresh), 200);
  const link = await callFn('createDigitalDownloadLink', { accessId: orderM + '_manual-study' }, fresh);
  assert.equal((await fetch(link.url)).status, 200);
});
await test('unverified-email accounts can buy and download their own purchase (intentional, same as classes/bookings)', async () => {
  const lookup = await fetch(`${AUTH}/identitytoolkit.googleapis.com/v1/accounts:lookup?key=fake`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ idToken: memberA.token }) });
  assert.equal((await lookup.json()).users[0].emailVerified, false);
  const link = await callFn('createDigitalDownloadLink', { accessId: orderM + '_manual-study' }, memberA.token);
  assert.ok(link.url);
});

console.log(results.join('\n'));
const failed = results.filter(r => r.startsWith('FAIL')).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
