// Owner Reports & Backups — security, scheduling, and report math
// against the Firebase emulators (no real project, Stripe, or files).
//
//   firebase emulators:exec --project demo-unveiledassembly \
//     --only auth,firestore,storage,functions "node tests/owner-reports-emulator.mjs"
//
// Needs functions/.secret.local with local-only dummy values (see
// tests/digital-downloads-emulator.mjs).
import { createRequire } from 'node:module';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
const require = createRequire(new URL('../functions/package.json', import.meta.url));
const { initializeApp } = require('firebase-admin/app');
const { getFirestore, FieldValue, Timestamp } = require('firebase-admin/firestore');
const { getStorage } = require('firebase-admin/storage');
const { getAuth } = require('firebase-admin/auth');
const reportsLib = require('../functions/reports.js');

const PROJECT = process.env.GCLOUD_PROJECT || 'demo-unveiledassembly';
const BUCKET = PROJECT + '.appspot.com';
const AUTH = 'http://127.0.0.1:9099';
const FS = `http://127.0.0.1:8180/v1/projects/${PROJECT}/databases/(default)/documents`;
const ST = 'http://127.0.0.1:9199';
const FN = `http://127.0.0.1:5001/${PROJECT}/us-central1`;

initializeApp({ projectId: PROJECT, storageBucket: BUCKET });
const db = getFirestore();
const results = [];
async function test(name, fn){
  try { await fn(); results.push('PASS ' + name); }
  catch (err) { results.push('FAIL ' + name + ' — ' + (err && err.message ? err.message.split('\n')[0] : err)); }
}
async function user(email, role, uid){
  await getAuth().createUser({ uid, email, password: 'Password123' });
  const r = await fetch(`${AUTH}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=fake`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password: 'Password123', returnSecureToken: true }) });
  await db.doc('users/' + uid).set({ email, role, name: email.split('@')[0], createdAt: Timestamp.fromDate(new Date('2026-09-15T15:00:00Z')) });
  return { uid, token: (await r.json()).idToken };
}
async function callFn(name, data, token){
  const r = await fetch(`${FN}/${name}`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) }, body: JSON.stringify({ data }) });
  const j = await r.json();
  return j.error ? { error: j.error.status, message: j.error.message } : j.result;
}
const fsGet = async (path, token) => (await fetch(`${FS}/${path}`, { headers: token ? { Authorization: 'Bearer ' + token } : {} })).status;
// New York wall-clock time → Timestamp (EDT is UTC-4 until Nov 1, 2026 2:00 AM; EST is UTC-5 after).
const ny = (iso, offsetHours) => Timestamp.fromDate(new Date(new Date(iso + 'Z').getTime() + offsetHours * 3600000));

const owner = await user('contactunveiledassembly@example.com', 'admin', 'owner-1');
const member = await user('maya.johnson@example.com', 'member', 'member-a');

// ---- seed: September 2026 (EDT) ----
await db.doc('donations/d-live-sep').set({ uid: 'member-a', email: 'maya.johnson@example.com', amountCents: 5000, amountPaid: 50, paymentStatus: 'paid', status: 'paid', stripeSessionId: 'cs_live_a1', paidAt: ny('2026-09-30T23:59:59', 4), createdAt: ny('2026-09-30T23:55:00', 4) });
await db.doc('donations/d-live-oct').set({ uid: 'member-a', amountCents: 7000, amountPaid: 70, paymentStatus: 'paid', status: 'paid', stripeSessionId: 'cs_live_a2', paidAt: ny('2026-10-01T00:00:00', 4), createdAt: ny('2026-10-01T00:00:00', 4) });
await db.doc('donations/d-test-sep').set({ uid: 'member-a', amountCents: 500, amountPaid: 5, paymentStatus: 'paid', status: 'paid', stripeSessionId: 'cs_test_x1', paidAt: ny('2026-09-10T12:00:00', 4) });
await db.doc('donations/d-expired-sep').set({ uid: 'member-a', amountCents: 2500, status: 'expired', paymentStatus: 'unpaid', stripeSessionId: 'cs_live_a3', createdAt: ny('2026-09-12T12:00:00', 4) });
await db.doc('shopOrders/o-live-sep').set({
  uid: 'member-a', email: 'maya.johnson@example.com', customerName: 'Maya Johnson', status: 'refunded', paymentStatus: 'refunded', amountPaid: 18, amountRefunded: 18,
  stripeSessionId: 'cs_live_b1', paidAt: ny('2026-09-05T10:00:00', 4), refundedAt: ny('2026-09-20T10:00:00', 4), createdAt: ny('2026-09-05T09:58:00', 4), hasPhysical: false,
  items: [{ productId: 'concealed', title: 'Concealed', type: 'digital', unitPriceCents: 1800, quantity: 1 }], digitalAccessIds: ['o-live-sep_concealed']
});
await db.doc('digitalAccess/o-live-sep_concealed').set({ orderId: 'o-live-sep', uid: 'member-a', email: 'maya.johnson@example.com', productId: 'concealed', productTitle: 'Concealed', accessStatus: 'refunded', paymentStatus: 'refunded', downloadCount: 2, purchasedAt: ny('2026-09-05T10:00:00', 4) });
await db.doc('digitalAccess/gift-concealed_member-b').set({ orderId: null, uid: 'member-b', email: 'renee.carter@example.com', productId: 'concealed', productTitle: 'Concealed', accessStatus: 'active', paymentStatus: 'complimentary', downloadCount: 0, purchasedAt: ny('2026-09-18T10:00:00', 4) });
await db.doc('bookings/b-manual-sep').set({ uid: 'member-a', status: 'confirmed', amountPaid: 30, paymentStatus: 'paid', transactionId: 'cash-0918', sessionType: '15-minute', createdAt: ny('2026-09-18T15:00:00', 4) });
await db.doc('teachingRegistrations/r-live-aug').set({ uid: 'member-a', status: 'confirmed', amountPaid: 25, paymentStatus: 'paid', stripeSessionId: 'cs_live_c1', teachingTitle: 'Discernment', paidAt: ny('2026-08-20T19:00:00', 4), registeredAt: ny('2026-08-20T18:59:00', 4) });
// DST boundary: 00:30 on Nov 1 New York (still EDT) belongs to November.
await db.doc('donations/d-live-nov').set({ uid: 'member-a', amountCents: 1000, amountPaid: 10, paymentStatus: 'paid', status: 'paid', stripeSessionId: 'cs_live_a4', paidAt: ny('2026-11-01T00:30:00', 4) });

// ---- authorization ----
await test('a member cannot generate a report', async () => assert.equal((await callFn('generateOwnerReport', { kind: 'monthly' }, member.token)).error, 'PERMISSION_DENIED'));
await test('a signed-out visitor cannot generate a report', async () => assert.equal((await callFn('generateOwnerReport', { kind: 'monthly' })).error, 'PERMISSION_DENIED'));
await test('a member cannot create a backup', async () => assert.equal((await callFn('createOwnerBackup', { passphrase: 'correct horse battery' }, member.token)).error, 'PERMISSION_DENIED'));
await test('custom range: start after end is refused', async () => assert.equal((await callFn('generateOwnerReport', { kind: 'custom', start: '2026-09-30', end: '2026-09-01' }, owner.token)).error, 'INVALID_ARGUMENT'));
await test('custom range: more than a year is refused', async () => assert.equal((await callFn('generateOwnerReport', { kind: 'custom', start: '2024-01-01', end: '2025-06-01' }, owner.token)).error, 'INVALID_ARGUMENT'));

// ---- report math ----
let sept;
await test('owner generates a September report', async () => {
  const r = await callFn('generateOwnerReport', { kind: 'custom', start: '2026-09-01', end: '2026-09-30' }, owner.token);
  assert.equal(r.status, 'ready', JSON.stringify(r));
  sept = (await db.doc('ownerReports/' + r.id).get()).data(); sept.id = r.id;
});
await test('date boundaries: 11:59:59 PM on Sep 30 is in, 12:00 AM Oct 1 is out', async () => {
  // live: $50 donation + $18 order; manual: $30 booking → $98
  assert.equal(sept.summary.receivedCents, 9800);
});
await test('refunds are counted on the day issued', async () => assert.equal(sept.summary.refundsCents, 1800));
await test('test-mode money is never counted as income', async () => { assert.equal(sept.summary.testPayments, 1); assert.equal(sept.summary.testReceivedCents, 500); });
await test('report is labeled test mode while Stripe uses test keys', async () => assert.equal(sept.stripeMode, 'test'));
await test('net = received − refunds (no live Stripe fees in test mode)', async () => assert.equal(sept.summary.netCents, 9800 - 1800));
await test('DST: a payment at 12:30 AM on Nov 1 belongs to November', async () => {
  const oct = (await reportsLib.collect(db, reportsLib.nyMidnight('2026-10-01'), reportsLib.nyMidnight('2026-11-01'))).buckets.live.receivedCents;
  const nov = (await reportsLib.collect(db, reportsLib.nyMidnight('2026-11-01'), reportsLib.nyMidnight('2026-12-01'))).buckets.live.receivedCents;
  assert.equal(oct, 7000); assert.equal(nov, 1000);
});
await test('complimentary copies, failed checkouts, and new members are counted', async () => {
  const d = await reportsLib.collect(db, reportsLib.nyMidnight('2026-09-01'), reportsLib.nyMidnight('2026-10-01'));
  assert.equal(d.complimentary.length, 1); assert.equal(d.complimentary[0].member, 're***@example.com');
  assert.equal(d.buckets.live.failed.count, 1);
  assert.equal(d.activity.newMembers, 2);
  assert.equal(d.orders[0].customer, 'Maya J.');
});
await test('an empty period still produces a report', async () => {
  const r = await callFn('generateOwnerReport', { kind: 'custom', start: '2025-01-01', end: '2025-01-31' }, owner.token);
  assert.equal(r.status, 'ready');
  assert.equal((await db.doc('ownerReports/' + r.id).get()).data().summary.receivedCents, 0);
});

// ---- storage + links ----
await test('the PDF is not readable from storage, even by the owner', async () => {
  const path = encodeURIComponent('private/reports/' + sept.id + '.pdf');
  assert.equal((await fetch(`${ST}/v0/b/${BUCKET}/o/${path}?alt=media`, { headers: { Authorization: 'Firebase ' + owner.token } })).status, 403);
  assert.equal((await fetch(`${ST}/v0/b/${BUCKET}/o/${path}?alt=media`)).status, 403);
});
let viewUrl;
await test('owner views the PDF through a single-use link', async () => {
  const r = await callFn('createOwnerReportLink', { reportId: sept.id, disposition: 'inline' }, owner.token);
  viewUrl = r.url;
  const res = await fetch(r.url);
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('content-type'), 'application/pdf');
  assert.match(res.headers.get('content-disposition'), /^inline/);
  const pdf = Buffer.from(await res.arrayBuffer());
  assert.equal(pdf.subarray(0, 5).toString('latin1'), '%PDF-');
  const pages = Number((pdf.toString('latin1').match(/\/Count (\d+)/) || [])[1]);
  assert.ok(pages >= 3, 'pages: ' + pages);
  if(process.env.REPORT_SAMPLE_OUT) (await import('node:fs')).writeFileSync(process.env.REPORT_SAMPLE_OUT, pdf);
});
await test('a view link cannot be reused', async () => assert.equal((await fetch(viewUrl)).status, 410));
await test('owner downloads the PDF (attachment)', async () => {
  const r = await callFn('createOwnerReportLink', { reportId: sept.id, disposition: 'attachment' }, owner.token);
  const res = await fetch(r.url);
  assert.match(res.headers.get('content-disposition'), /^attachment/);
});
await test('an expired file link is refused', async () => {
  const token = 'f'.repeat(64);
  await db.doc('reportFileTokens/' + token).set({ reportId: sept.id, type: 'report', disposition: 'inline', uid: 'owner-1', used: false, expiresAt: Timestamp.fromMillis(Date.now() - 1000) });
  assert.equal((await fetch(`${FN}/ownerReportFile?t=${token}`)).status, 410);
});
await test('a member cannot get a file link', async () => assert.equal((await callFn('createOwnerReportLink', { reportId: sept.id }, member.token)).error, 'PERMISSION_DENIED'));
let firstKey, secondKey;
await test('owner creates a 7-day email link; email is honestly not connected', async () => {
  const r = await callFn('issueOwnerReportEmailLink', { reportId: sept.id }, owner.token);
  assert.equal(r.emailStatus, 'not_connected'); assert.equal(r.expiresInDays, 7);
  assert.match(r.url, /^https:\/\/theunveiledassembly\.com\/owner-report\.html\?r=/);
  firstKey = new URL(r.url).searchParams.get('k');
  const details = await callFn('ownerReportLinkDetails', { reportId: sept.id, linkKey: firstKey }, owner.token);
  assert.equal(details.reportId, sept.id);
  const key = (await db.doc('reportLinks/' + firstKey).get()).data();
  assert.ok(Math.abs(key.expiresAt.toMillis() - Date.now() - 7 * 86400000) < 60000);
});
await test('the emailed link still requires the owner (wrong account refused)', async () => {
  assert.equal((await callFn('ownerReportLinkDetails', { reportId: sept.id, linkKey: firstKey }, member.token)).error, 'PERMISSION_DENIED');
  assert.equal((await callFn('createOwnerReportLink', { reportId: sept.id, linkKey: firstKey }, member.token)).error, 'PERMISSION_DENIED');
  assert.equal((await callFn('ownerReportLinkDetails', { reportId: sept.id, linkKey: firstKey })).error, 'PERMISSION_DENIED');
});
await test('a new link replaces the old one', async () => {
  const r = await callFn('issueOwnerReportEmailLink', { reportId: sept.id }, owner.token);
  secondKey = new URL(r.url).searchParams.get('k');
  assert.equal((await callFn('ownerReportLinkDetails', { reportId: sept.id, linkKey: firstKey }, owner.token)).error, 'PERMISSION_DENIED');
  assert.equal((await callFn('createOwnerReportLink', { reportId: sept.id, linkKey: secondKey }, owner.token)).url.includes('ownerReportFile?t='), true);
});
await test('an expired email link is refused', async () => {
  await db.doc('reportLinks/' + secondKey).update({ expiresAt: Timestamp.fromMillis(Date.now() - 1000) });
  assert.equal((await callFn('ownerReportLinkDetails', { reportId: sept.id, linkKey: secondKey }, owner.token)).error, 'DEADLINE_EXCEEDED');
  assert.equal((await callFn('createOwnerReportLink', { reportId: sept.id, linkKey: secondKey }, owner.token)).error, 'DEADLINE_EXCEEDED');
});

// ---- scheduling ----
const reports = reportsLib.createReports({
  db, FieldValue, Timestamp, getStorage, HttpsError: Error, logger: { info(){}, warn(){}, error(){} },
  stripe: () => { throw new Error('no stripe in tests'); }, stripeLiveMode: () => false,
  callerIsOwner: async uid => uid === 'owner-1'
});
await test('a scheduled monthly job that runs twice makes one report', async () => {
  const runAt = new Date('2026-11-01T12:00:00Z'); // 8:00 AM New York
  const [a, b] = await Promise.all([reports.runScheduled('monthly', runAt), reports.runScheduled('monthly', runAt)]);
  assert.deepEqual([a, b].map(x => !!x.skipped).sort(), [false, true]);
  const doc = (await db.doc('ownerReports/monthly-2026-10').get()).data();
  assert.equal(doc.status, 'ready'); assert.equal(doc.periodStart, '2026-10-01'); assert.equal(doc.periodEnd, '2026-10-31');
  assert.equal(doc.summary.receivedCents, 7000);
  assert.equal((await db.collection('ownerReportEvents').where('reportId', '==', 'monthly-2026-10').where('action', '==', 'generated').get()).size, 1);
});
await test('the quarterly job covers the previous three completed months', async () => {
  const r = await reports.runScheduled('quarterly', new Date('2026-10-01T12:00:00Z'));
  assert.equal(r.id, 'quarterly-2026-07-to-2026-09');
  const doc = (await db.doc('ownerReports/' + r.id).get()).data();
  assert.equal(doc.periodStart, '2026-07-01'); assert.equal(doc.periodEnd, '2026-09-30');
  assert.equal(doc.summary.receivedCents, 9800 + 2500); // September + the August class
});
await test('January 1 rollup covers October–December of the prior year', async () => {
  assert.deepEqual(reportsLib.previousMonths(new Date('2027-01-01T13:00:00Z'), 3), { start: '2026-10-01', end: '2026-12-31' });
  assert.deepEqual(reportsLib.previousMonths(new Date('2027-01-01T13:00:00Z'), 1), { start: '2026-12-01', end: '2026-12-31' });
});
await test('a failed scheduled report is retried on the next run', async () => {
  await db.doc('ownerReports/monthly-2026-10').update({ status: 'failed' });
  const r = await reports.runScheduled('monthly', new Date('2026-11-01T12:05:00Z'));
  assert.equal(r.status, 'ready');
});

// ---- backups ----
await test('a short backup passphrase is refused', async () => assert.equal((await callFn('createOwnerBackup', { passphrase: 'short' }, owner.token)).error, 'INVALID_ARGUMENT'));
await test('owner creates an encrypted backup that only the passphrase opens', async () => {
  const pass = 'correct horse battery staple';
  const r = await callFn('createOwnerBackup', { passphrase: pass }, owner.token);
  assert.ok(r.id, JSON.stringify(r));
  const link = await callFn('createOwnerReportLink', { reportId: r.id, type: 'backup' }, owner.token);
  const file = Buffer.from(await (await fetch(link.url)).arrayBuffer());
  assert.equal(file.subarray(0, 5).toString(), 'UABK1');
  assert.equal(file.includes(Buffer.from('maya.johnson')), false, 'backup is not readable without the passphrase');
  const open = p => {
    const key = crypto.pbkdf2Sync(p, file.subarray(5, 21), reportsLib.BACKUP_KDF_ITERATIONS, 32, 'sha256');
    const d = crypto.createDecipheriv('aes-256-gcm', key, file.subarray(21, 33)); d.setAuthTag(file.subarray(33, 49));
    return JSON.parse(Buffer.concat([d.update(file.subarray(49)), d.final()]).toString());
  };
  const data = open(pass);
  assert.ok(data.collections.users && data.collections.donations);
  for(const secretish of ['reportFileTokens', 'reportLinks', 'digitalDownloadTokens']) assert.equal(data.collections[secretish], undefined, secretish + ' must not be backed up');
  assert.throws(() => open('wrong passphrase entirely'));
});

// ---- rules + audit log ----
await test('members cannot read reports or the activity log', async () => {
  assert.equal(await fsGet('ownerReports/' + sept.id, member.token), 403);
  assert.equal(await fsGet('ownerReportEvents/x', member.token), 403);
});
await test('owner can read the report list; nobody can read link keys', async () => {
  assert.equal(await fsGet('ownerReports/' + sept.id, owner.token), 200);
  assert.equal(await fsGet('reportLinks/' + firstKey, owner.token), 403);
});
await test('views, downloads, links, and backups are recorded', async () => {
  const actions = (await db.collection('ownerReportEvents').get()).docs.map(d => d.data().action);
  for(const a of ['generated', 'viewed', 'downloaded', 'link-issued', 'backup-created', 'backup-downloaded']) assert.ok(actions.includes(a), 'missing ' + a);
});

console.log(results.join('\n'));
const failed = results.filter(r => r.startsWith('FAIL')).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
