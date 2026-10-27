/* ============================================================
   The Unveiled Assembly — trusted payment server
   Two Cloud Functions, and the ONLY code allowed to move a record to
   "paid":

   - createCheckoutSession (callable): the browser names WHAT it wants
     to pay for (a booking id, a registration id, a cart, a gift
     amount). The price is always recomputed here from Firestore —
     never taken from the browser, which can write any total it likes
     onto its own pending booking — and a Stripe-hosted Checkout page
     is returned for the browser to redirect to.
   - stripeWebhook (HTTPS): Stripe calls this after a payment
     succeeds, fails, expires, or is refunded. The signature is
     verified before anything is read, and only then is the matching
     record marked paid/cancelled/refunded with the Admin SDK.

   Secrets live in Google Secret Manager, never in this repo:
     firebase functions:secrets:set STRIPE_SECRET_KEY
     firebase functions:secrets:set STRIPE_WEBHOOK_SECRET
   ============================================================ */

const crypto = require('crypto');
const { onCall, onRequest, HttpsError } = require('firebase-functions/v2/https');
const { defineSecret } = require('firebase-functions/params');
const logger = require('firebase-functions/logger');
const admin = require('firebase-admin');
const Stripe = require('stripe');

admin.initializeApp();
const db = admin.firestore();
const { FieldValue } = admin.firestore;

const STRIPE_SECRET_KEY = defineSecret('STRIPE_SECRET_KEY');
const STRIPE_WEBHOOK_SECRET = defineSecret('STRIPE_WEBHOOK_SECRET');

// Checkout may only ever send a customer back to the real site. Matches
// PRODUCTION_HOSTS in app.js — every other host runs in DEMO_MODE and
// never calls this function at all.
const ALLOWED_RETURN_ORIGINS = ['https://theunveiledassembly.com', 'https://www.theunveiledassembly.com'];
const MINISTRY_NAME = 'The Unveiled Assembly';
// Stripe's own floor for a USD charge.
const STRIPE_MIN_CENTS = 50;
const DONATION_MAX_CENTS = 1000000;
const SHOP_MAX_LINES = 25;
// Stripe's minimum session lifetime. An abandoned checkout expires after
// this, and the webhook then frees the held time slot.
const CHECKOUT_TTL_SECONDS = 30 * 60;

let stripeClient = null;
function stripe(){
  if(!stripeClient) stripeClient = new Stripe(STRIPE_SECRET_KEY.value());
  return stripeClient;
}

function dollarsToCents(value){ return Math.max(0, Math.round((Number(value) || 0) * 100)); }

// Same normalization + hashing the browser uses (site-management.js) so
// a code typed at checkout maps to the same discountCodes/{hash} doc.
function normalizeCode(value){ return String(value || '').trim().toUpperCase().replace(/\s+/g, ''); }
function hashCode(code){ return crypto.createHash('sha256').update(normalizeCode(code)).digest('hex'); }

function safeReturnUrl(raw){
  let url;
  try { url = new URL(String(raw || '')); } catch (err) { throw new HttpsError('invalid-argument', 'A return address is required.'); }
  if(!ALLOWED_RETURN_ORIGINS.includes(url.origin)) throw new HttpsError('permission-denied', 'Checkout is only available on the ministry website.');
  url.hash = '';
  ['checkout', 'kind', 'ref', 'session_id'].forEach(key => url.searchParams.delete(key));
  return url;
}
function returnLink(base, params){
  const url = new URL(base.toString());
  Object.entries(params).forEach(([key, value]) => url.searchParams.set(key, value));
  // Stripe substitutes this placeholder itself, so it must survive unencoded.
  return url.toString().replace('SESSION_ID_PLACEHOLDER', '{CHECKOUT_SESSION_ID}');
}

/* ---------------------------------------------------------------
   Discounts. The browser claims a code and then confirms the claim
   against the booking/registration it created (see claimDiscount /
   confirmDiscountClaim in site-management.js, and the matching
   firestore.rules). A discount is honored here only when that
   confirmed redemption exists for this exact record and owner — the
   discountCode field on the record alone proves nothing.
   --------------------------------------------------------------- */
async function verifiedDiscountCents(record, recordId, sourceCollection, scope, subtotalCents){
  if(!record.discountCode || subtotalCents <= 0) return { discountCents: 0, code: null };
  const codeSnap = await db.doc('discountCodes/' + hashCode(record.discountCode)).get();
  if(!codeSnap.exists) return { discountCents: 0, code: null };
  const code = codeSnap.data();
  if(code.active === false || (code.scope !== 'both' && code.scope !== scope)) return { discountCents: 0, code: null };
  const redemptions = await db.collection('discountRedemptions')
    .where('sourceId', '==', recordId)
    .where('sourceCollection', '==', sourceCollection)
    .where('status', '==', 'confirmed')
    .limit(5).get();
  const owned = redemptions.docs.some(d => d.data().uid === record.uid && d.data().codeId === codeSnap.id);
  if(!owned) return { discountCents: 0, code: null };
  const value = Math.max(0, Number(code.amount) || 0);
  const discountCents = code.type === 'percent'
    ? Math.round(subtotalCents * Math.min(100, value) / 100)
    : Math.min(subtotalCents, dollarsToCents(value));
  return { discountCents, code: code.code || normalizeCode(record.discountCode) };
}

/* ---------------------------------------------------------------
   Pricing — one function per kind, each returning everything the
   Checkout session needs. Every price here comes from Firestore.
   --------------------------------------------------------------- */
// Same rule as loadSchedulingConfig() in app.js: once the owner has
// saved any session types, that collection is the whole list; until
// then the built-in defaults (SESSION_TYPES in app.js) are what the site
// shows, so they are what gets charged.
const DEFAULT_SESSION_TYPES = {
  '15-minute': { name: '15-Minute One-on-One', price: 30 },
  '30-minute': { name: '30-Minute One-on-One', price: 50 }
};
async function sessionTypeFor(id){
  const all = await db.collection('sessionTypes').get();
  if(all.empty) return DEFAULT_SESSION_TYPES[id] || null;
  const match = all.docs.find(d => d.id === id);
  return match ? match.data() : null;
}
async function priceBooking(id, uid){
  const ref = db.doc('bookings/' + id);
  const snap = await ref.get();
  if(!snap.exists) throw new HttpsError('not-found', 'That booking could not be found.');
  const booking = snap.data();
  if(booking.uid !== uid) throw new HttpsError('permission-denied', 'That booking belongs to another account.');
  if(booking.paymentStatus === 'paid') throw new HttpsError('failed-precondition', 'This session is already paid.');
  if(booking.status !== 'pending') throw new HttpsError('failed-precondition', 'This booking can no longer be paid for. Please book a new time.');
  const sessionType = await sessionTypeFor(booking.sessionType);
  if(!sessionType) throw new HttpsError('failed-precondition', 'This session type is no longer offered.');
  const subtotalCents = dollarsToCents(sessionType.price);
  const { discountCents, code } = await verifiedDiscountCents(booking, id, 'bookings', 'oneonone', subtotalCents);
  return {
    ref, record: booking, email: booking.email, code,
    lines: [{ name: sessionType.name || 'One-on-One Session', description: booking.date + ' at ' + booking.time + ' ET', unitCents: subtotalCents - discountCents, quantity: 1 }]
  };
}

async function priceTeaching(id, uid){
  const ref = db.doc('teachingRegistrations/' + id);
  const snap = await ref.get();
  if(!snap.exists) throw new HttpsError('not-found', 'That registration could not be found.');
  const reg = snap.data();
  if(reg.uid !== uid) throw new HttpsError('permission-denied', 'That registration belongs to another account.');
  if(reg.paymentStatus === 'paid') throw new HttpsError('failed-precondition', 'This class is already paid.');
  if(reg.status !== 'pending_payment') throw new HttpsError('failed-precondition', 'This registration can no longer be paid for. Please register again.');
  const teachingSnap = await db.doc('teachings/' + reg.teachingId).get();
  if(!teachingSnap.exists) throw new HttpsError('failed-precondition', 'This class is no longer available.');
  const teaching = teachingSnap.data();
  if(['cancelled', 'completed', 'draft'].includes(teaching.status)) throw new HttpsError('failed-precondition', 'Registration for this class is closed.');
  const subtotalCents = teaching.isFree ? 0 : dollarsToCents(teaching.price);
  const { discountCents, code } = await verifiedDiscountCents(reg, id, 'teachingRegistrations', 'teaching', subtotalCents);
  return {
    ref, record: reg, email: reg.email, code,
    lines: [{ name: teaching.title || 'Class Registration', description: [teaching.date, teaching.startTime].filter(Boolean).join(' at '), unitCents: subtotalCents - discountCents, quantity: 1 }]
  };
}

// Mirrors productIsPurchasable() in shop-system.js.
function productPurchasable(p){
  if(!p || p.status !== 'published' || p.isPlaceholder || !Number.isInteger(p.priceCents) || p.priceCents <= 0) return false;
  if(p.type === 'physical' && p.trackInventory && !(Number.isInteger(p.stock) && p.stock > 0)) return false;
  return true;
}

async function priceShop(items, uid, email){
  if(!Array.isArray(items) || items.length === 0) throw new HttpsError('invalid-argument', 'Your bag is empty.');
  if(items.length > SHOP_MAX_LINES) throw new HttpsError('invalid-argument', 'Too many items in one order.');
  const lines = [];
  for(const item of items){
    const productId = String(item && item.productId || '');
    if(!productId) throw new HttpsError('invalid-argument', 'An item in your bag is missing.');
    const snap = await db.doc('shopProducts/' + productId).get();
    const p = snap.exists ? snap.data() : null;
    if(!productPurchasable(p)) throw new HttpsError('failed-precondition', (p && p.title ? p.title : 'An item') + ' is no longer available. Please remove it from your bag.');
    const option = String(item.option || '');
    const options = Array.isArray(p.options) ? p.options.map(String) : [];
    if(options.length && !options.includes(option)) throw new HttpsError('invalid-argument', 'Choose an option for ' + p.title + '.');
    let quantity = Math.max(1, Math.floor(Number(item.quantity) || 1));
    if(p.type === 'digital') quantity = 1;
    if(p.type === 'physical' && p.trackInventory && quantity > p.stock) throw new HttpsError('failed-precondition', 'Only ' + p.stock + ' of ' + p.title + ' left.');
    lines.push({ productId, name: p.title, description: option || p.subtitle || '', option, type: p.type, trackInventory: !!p.trackInventory, unitCents: p.priceCents, quantity });
  }
  const subtotalCents = lines.reduce((sum, l) => sum + l.unitCents * l.quantity, 0);
  const ref = db.collection('shopOrders').doc();
  await ref.set({
    uid: uid || null, email: email || null, status: 'pending_payment', paymentStatus: 'pending',
    items: lines.map(({ productId, name, option, type, trackInventory, unitCents, quantity }) => ({ productId, title: name, option, type, trackInventory, unitPriceCents: unitCents, quantity })),
    subtotalCents, totalCents: subtotalCents, hasPhysical: lines.some(l => l.type === 'physical'),
    createdAt: FieldValue.serverTimestamp()
  });
  return { ref, record: { uid: uid || null }, email, lines, code: null };
}

async function priceDonation(amountCents, uid, email){
  const cents = Math.floor(Number(amountCents) || 0);
  if(cents < 100 || cents > DONATION_MAX_CENTS) throw new HttpsError('invalid-argument', 'Choose a gift between $1 and $10,000.');
  const ref = db.collection('donations').doc();
  await ref.set({
    uid: uid || null, email: email || null, amountCents: cents, frequency: 'once',
    status: 'pending_payment', paymentStatus: 'pending', createdAt: FieldValue.serverTimestamp()
  });
  return { ref, record: { uid: uid || null }, email, lines: [{ name: 'Gift to ' + MINISTRY_NAME, description: 'Thank you for your generosity.', unitCents: cents, quantity: 1 }], code: null };
}

/* ---------------------------------------------------------------
   createCheckoutSession
   data: { kind: 'booking'|'teaching'|'shop'|'donation', id?, items?,
           amountCents?, returnUrl }
   returns: { url } — or { free: true } when a discount brings the
   total to $0, in which case the record simply stays pending for the
   owner, exactly as before payments existed.
   --------------------------------------------------------------- */
exports.createCheckoutSession = onCall({ secrets: [STRIPE_SECRET_KEY], cors: ALLOWED_RETURN_ORIGINS }, async request => {
  const data = request.data || {};
  const kind = String(data.kind || '');
  const uid = request.auth ? request.auth.uid : null;
  const authEmail = request.auth && request.auth.token ? request.auth.token.email || null : null;
  const returnBase = safeReturnUrl(data.returnUrl);

  if((kind === 'booking' || kind === 'teaching') && !uid) throw new HttpsError('unauthenticated', 'Please sign in to continue.');

  let priced;
  if(kind === 'booking') priced = await priceBooking(String(data.id || ''), uid);
  else if(kind === 'teaching') priced = await priceTeaching(String(data.id || ''), uid);
  else if(kind === 'shop') priced = await priceShop(data.items, uid, authEmail);
  else if(kind === 'donation') priced = await priceDonation(data.amountCents, uid, authEmail);
  else throw new HttpsError('invalid-argument', 'Unknown checkout type.');

  const totalCents = priced.lines.reduce((sum, l) => sum + l.unitCents * l.quantity, 0);
  if(totalCents <= 0) return { free: true };
  if(totalCents < STRIPE_MIN_CENTS) throw new HttpsError('failed-precondition', 'The total is below the $0.50 card minimum.');

  // A visitor who backs out of Stripe and clicks "Resume payment" gets
  // the same still-open session rather than a second one for one record.
  const existingId = priced.record.stripeSessionId;
  if(existingId){
    try {
      const existing = await stripe().checkout.sessions.retrieve(existingId);
      if(existing.status === 'open' && existing.amount_total === totalCents) return { url: existing.url };
      if(existing.status === 'complete') throw new HttpsError('failed-precondition', 'This is already paid.');
    } catch (err) {
      if(err instanceof HttpsError) throw err;
      logger.warn('could not reuse checkout session', existingId, err.message);
    }
  }

  const id = priced.ref.id;
  const metadata = { kind, id, uid: uid || '' };
  if(priced.code) metadata.discountCode = priced.code;
  const hasPhysical = priced.lines.some(l => l.type === 'physical');
  const session = await stripe().checkout.sessions.create({
    mode: 'payment',
    submit_type: kind === 'donation' ? 'donate' : kind === 'shop' ? 'pay' : 'book',
    line_items: priced.lines.map(l => ({
      quantity: l.quantity,
      price_data: { currency: 'usd', unit_amount: l.unitCents, product_data: { name: l.name, ...(l.description ? { description: l.description } : {}) } }
    })),
    ...(priced.email ? { customer_email: priced.email } : {}),
    client_reference_id: id,
    metadata,
    payment_intent_data: { metadata, description: MINISTRY_NAME + ' — ' + priced.lines[0].name },
    ...(hasPhysical ? { shipping_address_collection: { allowed_countries: ['US'] } } : {}),
    expires_at: Math.floor(Date.now() / 1000) + CHECKOUT_TTL_SECONDS,
    success_url: returnLink(returnBase, { checkout: 'success', kind, ref: id, session_id: 'SESSION_ID_PLACEHOLDER' }),
    cancel_url: returnLink(returnBase, { checkout: 'cancelled', kind, ref: id })
  });
  await priced.ref.update({ stripeSessionId: session.id, checkoutStartedAt: FieldValue.serverTimestamp() });
  return { url: session.url };
});

/* ---------------------------------------------------------------
   Webhook handlers. Each is idempotent — Stripe retries deliveries,
   so a second "paid" for an already-paid record changes nothing.
   --------------------------------------------------------------- */
const COLLECTIONS = { booking: 'bookings', teaching: 'teachingRegistrations', shop: 'shopOrders', donation: 'donations' };

function paymentFields(session){
  const paymentIntentId = typeof session.payment_intent === 'string' ? session.payment_intent : (session.payment_intent && session.payment_intent.id) || null;
  return {
    paymentStatus: 'paid',
    amountPaid: (session.amount_total || 0) / 100,
    paymentIntentId,
    transactionId: paymentIntentId,
    stripeSessionId: session.id,
    paidAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp()
  };
}

function memberNotice(tx, uid, type, title, detail, deepLink){
  if(!uid) return;
  tx.set(db.collection('memberNotifications').doc(), { uid, type, title, detail, deepLink, read: false, createdAt: FieldValue.serverTimestamp() });
}

async function markPaid(session){
  const { kind, id } = session.metadata || {};
  const collectionName = COLLECTIONS[kind];
  if(!collectionName || !id) { logger.warn('paid session without metadata', session.id); return; }
  const ref = db.doc(collectionName + '/' + id);
  const paid = paymentFields(session);
  await db.runTransaction(async tx => {
    const snap = await tx.get(ref);
    if(!snap.exists){ logger.error('paid session for missing record', kind, id, session.id); return; }
    const record = snap.data();
    if(record.paymentStatus === 'paid') return;
    // Stock reads must happen before any write in a transaction.
    const stockRefs = kind === 'shop'
      ? (record.items || []).filter(i => i.type === 'physical' && i.trackInventory).map(i => ({ item: i, ref: db.doc('shopProducts/' + i.productId) }))
      : [];
    const stockSnaps = await Promise.all(stockRefs.map(s => tx.get(s.ref)));

    if(kind === 'booking'){
      // A member could cancel in another tab while Stripe was charging.
      // Keep the money visible to the owner rather than silently
      // reviving the appointment.
      const stillOpen = record.status === 'pending';
      tx.update(ref, { ...paid, paymentRefunded: false, ...(stillOpen ? { status: 'confirmed' } : { paymentNeedsReview: true }) });
      memberNotice(tx, record.uid, 'registration-confirmed', stillOpen ? 'Session Confirmed' : 'Payment Received',
        (stillOpen ? 'Your payment was received and your session is confirmed.' : 'Your payment was received after this booking was cancelled. The ministry will follow up.') +
        (record.confirmationId ? ' Confirmation: ' + record.confirmationId : ''), 'sessions');
    } else if(kind === 'teaching'){
      const stillOpen = record.status === 'pending_payment';
      tx.update(ref, { ...paid, ...(stillOpen ? { status: 'confirmed', accessGranted: true } : { paymentNeedsReview: true }) });
      if(stillOpen && record.uid){
        // Same enrollment record the owner's manual confirm writes —
        // this is what actually unlocks the private classroom.
        tx.set(db.doc('classEnrollments/' + record.teachingId + '_' + record.uid), {
          memberUid: record.uid, teachingId: record.teachingId, registrationId: id,
          confirmationId: record.confirmationId || '', status: 'confirmed', paymentStatus: 'paid',
          accessSource: 'stripe-payment', enrolledAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp()
        });
      }
      memberNotice(tx, record.uid, 'registration-confirmed', stillOpen ? 'Classroom Access Ready' : 'Payment Received',
        (record.teachingTitle || 'Your class') + (stillOpen ? ' — payment received, your classroom is now available.' : ' — payment received after cancellation. The ministry will follow up.'),
        stillOpen ? 'classes' : 'receipts');
    } else if(kind === 'shop'){
      const shipping = session.shipping_details || (session.collected_information && session.collected_information.shipping_details) || null;
      tx.update(ref, {
        ...paid, status: 'paid', fulfillmentStatus: record.hasPhysical ? 'unfulfilled' : 'digital',
        email: (session.customer_details && session.customer_details.email) || record.email || null,
        customerName: (session.customer_details && session.customer_details.name) || null,
        shipping: shipping ? { name: shipping.name || null, address: shipping.address || null } : null
      });
      stockRefs.forEach((s, i) => {
        const current = stockSnaps[i].exists ? Number(stockSnaps[i].data().stock) || 0 : 0;
        tx.update(s.ref, { stock: Math.max(0, current - s.item.quantity), updatedAt: FieldValue.serverTimestamp() });
      });
      memberNotice(tx, record.uid, 'order-paid', 'Order Received', 'Thank you — your Shop order is paid.', 'receipts');
    } else if(kind === 'donation'){
      tx.update(ref, {
        ...paid, status: 'paid',
        email: (session.customer_details && session.customer_details.email) || record.email || null,
        donorName: (session.customer_details && session.customer_details.name) || null
      });
    }
  });
  logger.info('payment recorded', kind, id, session.id);
}

// Gives a confirmed discount use back to its code when the booking or
// registration it paid for was never actually paid. Inverse of the
// claim in site-management.js.
async function releaseDiscountFor(sourceCollection, id){
  const redemptions = await db.collection('discountRedemptions').where('sourceId', '==', id).where('sourceCollection', '==', sourceCollection).get();
  for(const r of redemptions.docs){
    const codeRef = db.doc('discountCodes/' + r.data().codeId);
    await db.runTransaction(async tx => {
      const codeSnap = await tx.get(codeRef);
      if(codeSnap.exists){
        const code = codeSnap.data();
        tx.update(codeRef, {
          usedCount: Math.max(0, (Number(code.usedCount) || 0) - 1),
          redeemedSourceIds: FieldValue.arrayRemove(r.id)
        });
      }
      tx.delete(r.ref);
    });
  }
}

async function markAbandoned(session){
  const { kind, id } = session.metadata || {};
  const collectionName = COLLECTIONS[kind];
  if(!collectionName || !id) return;
  const ref = db.doc(collectionName + '/' + id);
  let released = false;
  await db.runTransaction(async tx => {
    const snap = await tx.get(ref);
    if(!snap.exists) return;
    const record = snap.data();
    if(record.paymentStatus === 'paid' || record.stripeSessionId !== session.id) return;
    if(kind === 'booking'){
      if(record.status !== 'pending') return;
      const slotRef = record.slotId ? db.doc('slots/' + record.slotId) : null;
      const slotSnap = slotRef ? await tx.get(slotRef) : null;
      tx.update(ref, { status: 'cancelled', cancelReason: 'payment-not-completed', cancelledAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
      // Free the time for everyone else — same count-then-delete rule
      // as releaseSlotOccupancy() in app.js.
      if(slotSnap && slotSnap.exists){
        const count = Number(slotSnap.data().count) || 1;
        if(count <= 1) tx.delete(slotRef);
        else tx.update(slotRef, { count: count - 1, updatedAt: FieldValue.serverTimestamp() });
      }
      released = true;
    } else if(kind === 'teaching'){
      if(record.status !== 'pending_payment') return;
      tx.update(ref, { status: 'cancelled', cancelReason: 'payment-not-completed', cancelledAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
      released = true;
    } else {
      tx.update(ref, { status: 'expired', paymentStatus: 'unpaid', updatedAt: FieldValue.serverTimestamp() });
    }
  });
  if(released) await releaseDiscountFor(collectionName, id);
  logger.info('checkout not completed', kind, id, session.id);
}

async function markRefunded(charge){
  if(!charge.payment_intent) return;
  const paymentIntentId = typeof charge.payment_intent === 'string' ? charge.payment_intent : charge.payment_intent.id;
  const intent = await stripe().paymentIntents.retrieve(paymentIntentId);
  const { kind, id } = intent.metadata || {};
  const collectionName = COLLECTIONS[kind];
  if(!collectionName || !id) return;
  const ref = db.doc(collectionName + '/' + id);
  const full = charge.refunded === true;
  const refundFields = {
    paymentStatus: full ? 'refunded' : 'partially_refunded',
    amountRefunded: (charge.amount_refunded || 0) / 100,
    refundedAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp()
  };
  await db.runTransaction(async tx => {
    const snap = await tx.get(ref);
    if(!snap.exists) return;
    const record = snap.data();
    if(kind === 'booking'){
      tx.update(ref, { ...refundFields, ...(full ? { paymentRefunded: true } : {}) });
    } else if(kind === 'teaching'){
      // Matches the owner's manual "refunded" action: access is removed.
      tx.update(ref, { ...refundFields, ...(full ? { status: 'refunded', accessGranted: false } : {}) });
      if(full && record.uid) tx.delete(db.doc('classEnrollments/' + record.teachingId + '_' + record.uid));
    } else {
      tx.update(ref, { ...refundFields, ...(full ? { status: 'refunded' } : {}) });
    }
  });
  logger.info('refund recorded', kind, id, full ? 'full' : 'partial');
}

exports.stripeWebhook = onRequest({ secrets: [STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET] }, async (req, res) => {
  if(req.method !== 'POST'){ res.status(405).send('Method Not Allowed'); return; }
  let event;
  try {
    event = stripe().webhooks.constructEvent(req.rawBody, req.get('stripe-signature'), STRIPE_WEBHOOK_SECRET.value());
  } catch (err) {
    logger.warn('rejected webhook with bad signature', err.message);
    res.status(400).send('Invalid signature');
    return;
  }
  try {
    const object = event.data.object;
    switch(event.type){
      case 'checkout.session.completed':
        // Card payments are 'paid' here. Delayed methods (bank debits)
        // arrive as 'unpaid' and settle via async_payment_succeeded.
        if(object.payment_status === 'paid') await markPaid(object);
        break;
      case 'checkout.session.async_payment_succeeded':
        await markPaid(object);
        break;
      case 'checkout.session.expired':
      case 'checkout.session.async_payment_failed':
        await markAbandoned(object);
        break;
      case 'charge.refunded':
        await markRefunded(object);
        break;
      default:
        break;
    }
    res.json({ received: true });
  } catch (err) {
    // A 500 makes Stripe retry, which is what we want for a transient
    // Firestore failure — every handler above is safe to run twice.
    logger.error('webhook handler failed', event.type, event.id, err);
    res.status(500).send('Handler failed');
  }
});
