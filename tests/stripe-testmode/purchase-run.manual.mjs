// Genuine Stripe TEST-MODE purchase run. Start it only through
//   zsh tests/stripe-testmode/run.sh
// (that script checks the key is a test key, hides secrets in all
// output, and cleans up). Runs against the local Firebase emulators,
// project demo-uastripetest: sample users, a TEST-ONLY sample PDF, no
// real database, files or ministry data.
//
// Stripe side: real test-mode Checkout Sessions, the real hosted
// checkout page with Stripe test cards, real test refunds and test
// disputes. Stripe can't call this computer, so the script reads the
// account's real test events from Stripe's API and delivers each one to
// the local webhook, signed with a one-run local secret — the same thing
// `stripe listen` does — so the real signature check runs.
import { createRequire } from 'node:module';
import assert from 'node:assert/strict';
import { chromium } from '/Users/yaunahlove/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
const require = createRequire(new URL('../../functions/package.json', import.meta.url));
const { initializeApp } = require('firebase-admin/app');
const { getFirestore, Timestamp } = require('firebase-admin/firestore');
const { getStorage } = require('firebase-admin/storage');
const { getAuth } = require('firebase-admin/auth');
const Stripe = require('stripe');

const KEY = process.env.STRIPE_API_KEY || '';
const RUN_SECRET = process.env.UA_RUN_WEBHOOK_SECRET || '';
if(!/^sk_test_/.test(KEY)){ console.log('Stopped: a Stripe TEST key is required (run through tests/stripe-testmode/run.sh).'); process.exit(1); }
if(process.env.FUNCTIONS_EMULATOR_HOST === undefined && !process.env.FIRESTORE_EMULATOR_HOST){ console.log('Stopped: must run inside the Firebase emulators.'); process.exit(1); }

const PROJECT = process.env.GCLOUD_PROJECT || 'demo-uastripetest';
if(!PROJECT.startsWith('demo-')){ console.log('Stopped: only a demo- emulator project may be used.'); process.exit(1); }
const BUCKET = PROJECT + '.appspot.com';
const AUTH = 'http://127.0.0.1:9099';
const FS = `http://127.0.0.1:8180/v1/projects/${PROJECT}/databases/(default)/documents`;
const FN = `http://127.0.0.1:5001/${PROJECT}/us-central1`;
// The sandbox return address the server accepts with test keys. The
// browser never actually reaches it: the test intercepts it locally.
const RETURN_HOST = 'unveiledassembly--stripe-sandbox-abc123.web.app';
const RETURN = `https://${RETURN_HOST}/shop/confirmation.html`;

initializeApp({ projectId: PROJECT, storageBucket: BUCKET });
const db = getFirestore();
const bucket = getStorage().bucket(BUCKET);
const stripe = new Stripe(KEY);

const results = [];
const realEvents = [];
async function test(name, fn){
  try { await fn(); results.push('PASS ' + name); }
  catch (err) { results.push('FAIL ' + name + ' — ' + String(err && err.message || err).split('\n')[0]); }
}
const skip = (name, why) => results.push('SKIP ' + name + ' — ' + why);
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function waitFor(label, fn, ms = 90000){
  const end = Date.now() + ms;
  while(Date.now() < end){ const v = await fn(); if(v) return v; await sleep(1500); }
  throw new Error('timed out waiting for ' + label);
}

// ---- safety checks before anything is created ----
const endpoints = await stripe.webhookEndpoints.list({ limit: 100 });
const enabled = endpoints.data.filter(e => e.status === 'enabled');
if(enabled.length){
  console.log('Stopped: this Stripe test environment has ' + enabled.length + ' enabled webhook endpoint(s). Test events would also be sent there ' +
    '(possibly to the deployed sandbox functions on the shared live Firebase project). Use a separate Stripe Sandbox with no webhook endpoints (see SETUP.md).');
  process.exit(1);
}

// ---- event relay (what `stripe listen` would do) ----
const ours = { sessions: new Set(), intents: new Set() };
const delivered = new Set();
const runStart = Math.floor(Date.now() / 1000) - 5;
const RELAY_TYPES = new Set(['checkout.session.completed', 'checkout.session.async_payment_succeeded', 'checkout.session.async_payment_failed',
  'checkout.session.expired', 'charge.refunded', 'charge.dispute.created', 'charge.dispute.closed']);
function belongsToUs(evt){
  const o = evt.data.object;
  if(evt.type.startsWith('checkout.session.')) return ours.sessions.has(o.id);
  const pi = typeof o.payment_intent === 'string' ? o.payment_intent : o.payment_intent && o.payment_intent.id;
  return !!pi && ours.intents.has(pi);
}
async function deliver(evt){
  const payload = JSON.stringify(evt);
  const header = stripe.webhooks.generateTestHeaderString({ payload, secret: RUN_SECRET });
  const r = await fetch(`${FN}/stripeWebhook`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'stripe-signature': header }, body: payload });
  return r.status;
}
let relayOn = true;
async function relayOnce(){
  const list = await stripe.events.list({ created: { gte: runStart }, limit: 100 });
  for(const evt of list.data.slice().reverse()){
    if(delivered.has(evt.id) || !RELAY_TYPES.has(evt.type) || !belongsToUs(evt)) continue;
    if(evt.livemode !== false) throw new Error('refusing a live-mode event');
    delivered.add(evt.id);
    const status = await deliver(evt);
    realEvents.push(`${evt.id}  ${evt.type}  → HTTP ${status}`);
  }
}
const relayLoop = (async () => { while(relayOn){ try { await relayOnce(); } catch (err) { console.log('relay: ' + err.message); } await sleep(2000); } })();
async function trackSession(sessionId){
  ours.sessions.add(sessionId);
}
async function trackIntent(sessionId){
  const s = await stripe.checkout.sessions.retrieve(sessionId);
  if(s.payment_intent) ours.intents.add(typeof s.payment_intent === 'string' ? s.payment_intent : s.payment_intent.id);
  return s;
}

// ---- emulator setup: sample users and TEST-ONLY sample products ----
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
const get = async path => { const s = await db.doc(path).get(); return s.exists ? s.data() : null; };
const restStatus = async (path, token) => (await fetch(`${FS}/${path}`, { headers: token ? { Authorization: 'Bearer ' + token } : {} })).status;
const accessFor = async orderId => (await db.collection('digitalAccess').where('orderId', '==', orderId).get()).docs.map(d => ({ id: d.id, ...d.data() }));

const owner = await user('owner@example.com', 'admin', 'owner-1');
const memberA = await user('member.a@example.com', 'member', 'member-a');
const memberB = await user('member.b@example.com', 'member', 'member-b');
const PDF = Buffer.from('%PDF-1.4\n% TEST ONLY - Stripe test-mode sample file, not a ministry resource\n1 0 obj <<>> endobj\ntrailer <<>>\n%%EOF\n');
const PRODUCTS = ['success', 'refund', 'disputewin', 'disputelose', 'declined', 'cancelled', 'async'];
for(const key of PRODUCTS){
  const id = 'test-only-stripe-' + key;
  await db.doc('shopProducts/' + id).set({ id, title: 'TEST ONLY — Stripe test PDF (' + key + ')', subtitle: 'Not for sale', type: 'digital', category: 'digital', status: 'published',
    featured: false, priceCents: 500, availability: 'Available', collection: 'Test', image: '', images: [], description: 'Sample product for Stripe test mode only.',
    included: [], delivery: '', options: [], tags: ['test only'], trackInventory: false, stock: null, isPlaceholder: false, testOnly: true });
  await bucket.file(`private/digital-products/${id}/test.pdf`).save(PDF, { contentType: 'application/pdf' });
  await db.doc('shopDigitalFiles/' + id).set({ productId: id, storagePath: `private/digital-products/${id}/test.pdf`, fileName: 'Test-Only.pdf', sizeBytes: PDF.length, autoDelivery: true });
}

// ---- the hosted Stripe checkout page ----
const browser = await chromium.launch({ headless: true });
const shots = process.env.UA_SHOTS || '';
async function newCheckoutPage(){
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: 'en-US' });
  // Return trips to the sandbox address are answered locally.
  await context.route(`https://${RETURN_HOST}/**`, route => route.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><title>Returned</title><p>Returned from Stripe (local stub).</p>' }));
  return context.newPage();
}
async function startCheckout(member, productKey){
  const r = await callFn('createCheckoutSession', { kind: 'shop', items: [{ productId: 'test-only-stripe-' + productKey, quantity: 1 }], returnUrl: RETURN }, member.token);
  if(!r || !r.url) throw new Error('checkout did not open: ' + JSON.stringify(r));
  const order = (await db.collection('shopOrders').where('uid', '==', member.uid).get()).docs
    .map(d => ({ id: d.id, ...d.data() })).find(o => o.items[0].productId === 'test-only-stripe-' + productKey && o.stripeSessionId);
  await trackSession(order.stripeSessionId);
  return { url: r.url, orderId: order.id, sessionId: order.stripeSessionId };
}
async function fillCard(page, number){
  const cardTab = page.locator('[data-testid="card-accordion-item-button"], button[aria-label*="Card" i]').first();
  if(await cardTab.isVisible().catch(() => false)) await cardTab.click();
  await page.locator('#cardNumber').waitFor({ timeout: 30000 });
  await page.locator('#cardNumber').fill(number);
  await page.locator('#cardExpiry').fill('12 / 34');
  await page.locator('#cardCvc').fill('123');
  if(await page.locator('#billingName').isVisible().catch(() => false)) await page.locator('#billingName').fill('Test Member');
  if(await page.locator('#billingPostalCode').isVisible().catch(() => false)) await page.locator('#billingPostalCode').fill('10001');
  const email = page.locator('#email');
  if(await email.isVisible().catch(() => false) && await email.isEditable().catch(() => false) && !(await email.inputValue())) await email.fill('member.a@example.com');
  // Never save card details to Stripe Link during tests.
  const link = page.locator('#enableStripePass');
  if(await link.isChecked().catch(() => false)) await link.uncheck();
  await page.locator('[data-testid="hosted-payment-submit-button"], .SubmitButton').first().click();
}
async function pay(page, url, number){
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await fillCard(page, number);
}
const returnedTo = page => page.waitForURL(u => u.hostname === RETURN_HOST, { timeout: 60000 }).then(() => new URL(page.url()));

// ---- the shared checks ----
await test('test mode only, no tax, no shipping address for a digital product', async () => {
  const c = await startCheckout(memberA, 'success');
  const s = await stripe.checkout.sessions.retrieve(c.sessionId);
  assert.equal(s.livemode, false);
  assert.equal(s.automatic_tax && s.automatic_tax.enabled, false);
  assert.equal(s.shipping_address_collection, null);
  assert.equal(s.amount_total, 500);
  assert.equal(s.currency, 'usd');
  assert.equal(s.metadata.kind, 'shop'); assert.equal(s.metadata.id, c.orderId); assert.equal(s.metadata.uid, memberA.uid);
  assert.equal(s.client_reference_id, c.orderId);
  globalThis.successCheckout = c;
});

let paidAccessId;
await test('successful payment (card 4242): one verified order, receipt, thank-you return, purchase history', async () => {
  const c = globalThis.successCheckout;
  const page = await newCheckoutPage();
  await pay(page, c.url, '4242 4242 4242 4242');
  const back = await returnedTo(page);
  if(shots) await page.screenshot({ path: shots + '/stripe-success-return.png' });
  assert.equal(back.searchParams.get('checkout'), 'success');
  assert.equal(back.searchParams.get('ref'), c.orderId);
  assert.match(back.searchParams.get('session_id') || '', /^cs_test_/);
  // Reaching the success page granted nothing by itself:
  // access appears only once the verified webhook is processed.
  await trackIntent(c.sessionId);
  const order = await waitFor('the verified payment', async () => { const o = await get('shopOrders/' + c.orderId); return o && o.paymentStatus === 'paid' ? o : null; });
  assert.equal(order.status, 'paid'); assert.equal(order.amountPaid, 5); assert.equal(order.testMode, true);
  assert.match(order.paymentIntentId, /^pi_/);
  const access = await accessFor(c.orderId);
  assert.equal(access.length, 1); assert.equal(access[0].accessStatus, 'active'); assert.equal(access[0].uid, memberA.uid);
  assert.equal(access[0].emailStatus, 'not_connected', 'the website does not claim to have emailed anything');
  paidAccessId = access[0].id;
  const receipt = await waitFor('the Stripe receipt link', async () => (await get('shopOrders/' + c.orderId)).receiptUrl, 30000);
  assert.match(receipt, /^https:\/\/pay\.stripe\.com\/receipts\//);
  const charge = (await stripe.paymentIntents.retrieve(order.paymentIntentId, { expand: ['latest_charge'] })).latest_charge;
  assert.equal(charge.receipt_email, memberA.email, 'Stripe was asked to email its receipt');
  const notes = (await db.collection('memberNotifications').where('uid', '==', memberA.uid).get()).docs.map(d => d.data());
  assert.equal(notes.filter(n => n.title === 'Order Received').length, 1, 'one thank-you notice in the member’s account');
  // Purchase history: the member can read their own order and access
  // record (what Purchases & Downloads shows); another member can't.
  assert.equal(await restStatus('shopOrders/' + c.orderId, memberA.token), 200);
  assert.equal(await restStatus('digitalAccess/' + paidAccessId, memberA.token), 200);
  assert.equal(await restStatus('shopOrders/' + c.orderId, memberB.token), 403);
  await page.context().close();
});

await test('duplicate delivery of the real Stripe event changes nothing', async () => {
  const completed = (await stripe.events.list({ type: 'checkout.session.completed', created: { gte: runStart }, limit: 20 })).data
    .find(e => e.data.object.id === globalThis.successCheckout.sessionId);
  assert.ok(completed, 'found the real event');
  const before = { access: (await accessFor(globalThis.successCheckout.orderId)).length, notes: (await db.collection('memberNotifications').where('uid', '==', memberA.uid).get()).size };
  for(let i = 0; i < 2; i++) assert.equal(await deliver(completed), 200);
  realEvents.push(`${completed.id}  checkout.session.completed  → delivered twice more (duplicate test)`);
  assert.equal((await accessFor(globalThis.successCheckout.orderId)).length, before.access);
  assert.equal((await db.collection('memberNotifications').where('uid', '==', memberA.uid).get()).size, before.notes);
});

await test('webhook signature is verified: a wrongly signed or unsigned copy is rejected', async () => {
  const completed = (await stripe.events.list({ type: 'checkout.session.completed', created: { gte: runStart }, limit: 5 })).data[0];
  const payload = JSON.stringify(completed);
  const forged = stripe.webhooks.generateTestHeaderString({ payload, secret: 'whsec_' + 'x'.repeat(32) });
  assert.equal((await fetch(`${FN}/stripeWebhook`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'stripe-signature': forged }, body: payload })).status, 400);
  assert.equal((await fetch(`${FN}/stripeWebhook`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: payload })).status, 400);
});

await test('secure PDF: owner downloads; signed out, another member, guessed and expired links are refused', async () => {
  const link = await callFn('createDigitalDownloadLink', { accessId: paidAccessId }, memberA.token);
  assert.ok(link.url && !link.url.includes('private/'));
  const r = await fetch(link.url);
  assert.equal(r.status, 200); assert.equal(r.headers.get('content-type'), 'application/pdf');
  assert.equal((await fetch(link.url)).status, 410, 'a link works once');
  const again = await callFn('createDigitalDownloadLink', { accessId: paidAccessId }, memberA.token);
  assert.equal((await fetch(again.url)).status, 200, 'unlimited downloads: a fresh link works');
  assert.equal((await get('digitalAccess/' + paidAccessId)).downloadCount, 2, 'downloads are counted');
  assert.equal((await callFn('createDigitalDownloadLink', { accessId: paidAccessId })).error, 'UNAUTHENTICATED');
  assert.equal((await callFn('createDigitalDownloadLink', { accessId: paidAccessId }, memberB.token)).error, 'NOT_FOUND');
  assert.equal((await fetch(`${FN}/digitalDownload?t=${'0'.repeat(64)}`)).status, 410);
  const expiring = await callFn('createDigitalDownloadLink', { accessId: paidAccessId }, memberA.token);
  const token = new URL(expiring.url).searchParams.get('t');
  await db.doc('digitalDownloadTokens/' + token).update({ expiresAt: Timestamp.fromMillis(Date.now() - 1000) });
  const expired = await fetch(expiring.url);
  assert.equal(expired.status, 410); assert.match(await expired.text(), /expired/i);
  assert.equal(await restStatus('digitalDownloadTokens/' + token, memberA.token), 403, 'members cannot read link records');
  assert.equal((await fetch(`http://127.0.0.1:9199/v0/b/${BUCKET}/o/${encodeURIComponent('private/digital-products/test-only-stripe-success/test.pdf')}?alt=media`, { headers: { Authorization: 'Bearer ' + memberA.token } })).status, 403, 'the file itself stays private');
});

await test('cancelled checkout: nothing charged, nothing unlocked, order closed', async () => {
  const c = await startCheckout(memberA, 'cancelled');
  const page = await newCheckoutPage();
  await page.goto(c.url, { waitUntil: 'domcontentloaded' });
  await page.locator('#cardNumber, [data-testid="card-accordion-item-button"]').first().waitFor({ timeout: 30000 });
  const back = page.locator('a[href*="checkout=cancelled"], [data-testid="business-link"]').first();
  if(await back.isVisible().catch(() => false)) await back.click();
  else await page.goto((await stripe.checkout.sessions.retrieve(c.sessionId)).cancel_url);
  const url = await returnedTo(page);
  assert.equal(url.searchParams.get('checkout'), 'cancelled');
  await stripe.checkout.sessions.expire(c.sessionId);
  const o = await waitFor('the order to close', async () => { const x = await get('shopOrders/' + c.orderId); return x.status === 'expired' ? x : null; });
  assert.equal(o.paymentStatus, 'unpaid');
  assert.equal((await accessFor(c.orderId)).length, 0);
  await page.context().close();
});

await test('declined test card (4000 0000 0000 0002): nothing unlocked; the order closes', async () => {
  const c = await startCheckout(memberA, 'declined');
  const page = await newCheckoutPage();
  await pay(page, c.url, '4000 0000 0000 0002');
  await page.getByText(/declined/i).first().waitFor({ timeout: 45000 });
  if(shots) await page.screenshot({ path: shots + '/stripe-declined.png' });
  await sleep(4000);
  assert.equal((await get('shopOrders/' + c.orderId)).paymentStatus, 'pending');
  assert.equal((await accessFor(c.orderId)).length, 0);
  await stripe.checkout.sessions.expire(c.sessionId);
  await waitFor('the order to close', async () => (await get('shopOrders/' + c.orderId)).status === 'expired');
  assert.equal((await accessFor(c.orderId)).length, 0);
  await page.context().close();
});

await test('refund (issued by the owner through Stripe test mode): access closed, order and receipt kept', async () => {
  const c = await startCheckout(memberA, 'refund');
  const page = await newCheckoutPage();
  await pay(page, c.url, '4242 4242 4242 4242');
  await returnedTo(page);
  await trackIntent(c.sessionId);
  await waitFor('payment', async () => (await get('shopOrders/' + c.orderId)).paymentStatus === 'paid');
  const r = await callFn('manageShopOrder', { action: 'refund', orderId: c.orderId, confirmed: true, expectedAmountCents: 500 }, owner.token);
  assert.equal(r.ok, true, JSON.stringify(r)); assert.match(r.refundId, /^re_/);
  const o = await waitFor('the refund event', async () => { const x = await get('shopOrders/' + c.orderId); return x.paymentStatus === 'refunded' ? x : null; });
  assert.equal(o.status, 'refunded'); assert.ok(o.items.length === 1 && o.amountPaid === 5, 'history kept');
  const a = (await accessFor(c.orderId))[0];
  assert.equal(a.accessStatus, 'refunded');
  assert.match((await callFn('createDigitalDownloadLink', { accessId: a.id }, memberA.token)).message, /refunded/);
  await page.context().close();
});

async function disputeRun(productKey, evidence, expected){
  const c = await startCheckout(memberA, productKey);
  const page = await newCheckoutPage();
  await pay(page, c.url, '4000 0000 0000 0259');   // Stripe test card that is disputed
  await returnedTo(page);
  await trackIntent(c.sessionId);
  await waitFor('payment', async () => (await get('shopOrders/' + c.orderId)).paymentStatus === 'paid');
  let a = await waitFor('the dispute to pause access', async () => { const x = (await accessFor(c.orderId))[0]; return x && x.accessStatus === 'suspended' ? x : null; }, 180000);
  assert.equal(a.suspendedReason, 'chargeback');
  const o = await get('shopOrders/' + c.orderId);
  assert.equal(o.disputeStatus, 'open'); assert.ok(o.reviewFlags.includes('chargeback-open'));
  assert.equal((await callFn('createDigitalDownloadLink', { accessId: a.id }, memberA.token)).error, 'PERMISSION_DENIED');
  const dispute = (await stripe.disputes.list({ payment_intent: o.paymentIntentId, limit: 1 })).data[0];
  await stripe.disputes.update(dispute.id, { evidence: { uncategorized_text: evidence } });
  a = await waitFor('the dispute to close', async () => { const x = (await accessFor(c.orderId))[0]; return x.disputeStatus === expected ? x : null; }, 240000);
  await page.context().close();
  return { access: a, order: await get('shopOrders/' + c.orderId) };
}
await test('chargeback (card 0259) pauses access; a won dispute restores it automatically', async () => {
  const { access, order } = await disputeRun('disputewin', 'winning_evidence', 'won');
  assert.equal(access.accessStatus, 'active');
  assert.equal(order.paymentNeedsReview, false); assert.ok(order.reviewFlags.includes('chargeback-won'));
  assert.ok((await callFn('createDigitalDownloadLink', { accessId: access.id }, memberA.token)).url);
});
await test('chargeback lost: access permanently revoked; order, receipt and download history kept', async () => {
  const { access, order } = await disputeRun('disputelose', 'losing_evidence', 'lost');
  assert.equal(access.accessStatus, 'revoked'); assert.equal(access.revokedReason, 'chargeback-lost');
  assert.equal(order.paymentNeedsReview, true); assert.ok(order.reviewFlags.includes('chargeback-lost'));
  assert.equal(order.items.length, 1);
  assert.equal((await callFn('createDigitalDownloadLink', { accessId: access.id }, memberA.token)).error, 'PERMISSION_DENIED');
});

// Delayed (bank) payments appear only if this Stripe account offers them
// in Checkout; card payments are always immediate.
{
  const c = await startCheckout(memberB, 'async');
  const page = await newCheckoutPage();
  await page.goto(c.url, { waitUntil: 'domcontentloaded' });
  await page.locator('#cardNumber, [data-testid="card-accordion-item-button"]').first().waitFor({ timeout: 30000 }).catch(() => {});
  const bank = await page.locator('[data-testid="us_bank_account-accordion-item-button"]').isVisible().catch(() => false);
  if(!bank) skip('delayed (bank) payment success/failure', 'this Stripe test environment does not offer a delayed payment method in Checkout; covered by tests/stripe-purchase-emulator.mjs');
  else skip('delayed (bank) payment success/failure', 'offered, but the bank test flow is not automated here; covered by tests/stripe-purchase-emulator.mjs');
  await stripe.checkout.sessions.expire(c.sessionId).catch(() => {});
  await page.context().close();
}

await sleep(5000);
relayOn = false; await relayLoop;
await browser.close();
console.log(results.join('\n'));
console.log('\nReal Stripe test-mode events delivered to the local webhook:\n' + realEvents.join('\n'));
const failed = results.filter(r => r.startsWith('FAIL')).length;
const passed = results.filter(r => r.startsWith('PASS')).length;
console.log(`\n${passed} passed, ${failed} failed, ${results.length - passed - failed} skipped`);
process.exit(failed ? 1 : 0);
