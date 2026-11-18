// Owner Portal alert rules (pure, no browser):
//   node tests/owner-alerts.test.mjs
import assert from 'node:assert/strict';
import { buildOwnerAlerts, alertCounts, groupForNav, OWNER_NAV_GROUPS, recordTone, toMs } from '../owner-portal-alerts.js';

const results = [];
function test(name, fn){
  try { fn(); results.push('PASS ' + name); }
  catch (err) { results.push('FAIL ' + name + ' — ' + err.message.split('\n')[0]); }
}
const TODAY = '2026-11-17';

test('every existing section lives in exactly one of the seven groups', () => {
  assert.equal(OWNER_NAV_GROUPS.length, 7);
  const all = OWNER_NAV_GROUPS.flatMap(g => g.nav);
  assert.equal(new Set(all).size, all.length);
  for(const nav of ['dashboard', 'people', 'teachings', 'paths', 'registrations', 'events', 'bookings', 'prayer-requests',
    'testimonials', 'class-reviews', 'store', 'payments', 'reports', 'communication', 'website', 'media', 'settings', 'policies']){
    assert.ok(groupForNav(nav), nav + ' has a home');
  }
});

test('pending booking is red; confirmed is not an alert', () => {
  const items = buildOwnerAlerts({ bookings: [{ id: 'b1', status: 'pending', name: 'Ann', date: '2026-11-20' }, { id: 'b2', status: 'confirmed', date: '2026-11-21' }] }, TODAY);
  assert.equal(items.length, 1);
  assert.equal(items[0].level, 'action');
  assert.equal(items[0].nav, 'bookings');
  assert.match(items[0].status, /confirmation/);
});

test('a pending booking whose date passed stays red with a clear status', () => {
  const [item] = buildOwnerAlerts({ bookings: [{ id: 'b1', status: 'pending', date: '2026-11-01' }] }, TODAY);
  assert.equal(item.level, 'action');
  assert.match(item.status, /passed/);
});

test('alert clears only when the record changes (no seen/dismissed state)', () => {
  const prayer = { id: 'p1', status: 'new', name: 'Kendra' };
  const before = buildOwnerAlerts({ prayers: [prayer] }, TODAY);
  prayer.viewedAt = Date.now(); prayer.opened = true; // viewing changes nothing
  assert.equal(buildOwnerAlerts({ prayers: [prayer] }, TODAY).length, before.length);
  prayer.status = 'in-progress';
  const during = buildOwnerAlerts({ prayers: [prayer] }, TODAY);
  assert.equal(during[0].level, 'progress', 'in progress turns amber');
  prayer.status = 'completed';
  assert.equal(buildOwnerAlerts({ prayers: [prayer] }, TODAY).length, 0, 'completed clears it');
});

test('testimonies and class reviews awaiting approval are red', () => {
  const items = buildOwnerAlerts({ testimonials: [{ id: 't1', status: 'pending' }, { id: 't2', status: 'published' }], reviews: [{ id: 'r1', status: 'pending', className: 'Discernment' }] }, TODAY);
  assert.deepEqual(items.map(i => i.nav).sort(), ['class-reviews', 'testimonials']);
  assert.ok(items.every(i => i.level === 'action'));
});

test('unpaid upcoming registration is amber; past ones are dropped', () => {
  const items = buildOwnerAlerts({ registrations: [
    { id: 'g1', status: 'pending_payment', teachingDate: '2026-11-30', firstName: 'Jas' },
    { id: 'g2', status: 'pending_payment', teachingDate: '2026-10-01' }] }, TODAY);
  assert.equal(items.length, 1);
  assert.equal(items[0].level, 'progress');
});

test('class seats: waitlist with an open seat is red, nearly full is gray', () => {
  const items = buildOwnerAlerts({ classes: [
    { id: 'c1', title: 'A', seatsRemaining: 1, waitlistWaiting: true },
    { id: 'c2', title: 'B', seatsRemaining: 2, waitlistWaiting: false },
    { id: 'c3', title: 'C', seatsRemaining: 10, waitlistWaiting: false },
    { id: 'c4', title: 'D', seatsRemaining: 0, waitlistWaiting: true }] }, TODAY);
  assert.deepEqual(items.map(i => [i.key, i.level]), [['waitlist:c1', 'action'], ['nearly-full:c2', 'info']]);
});

test('shop alert levels map urgent→red, warning→amber, info→gray', () => {
  const items = buildOwnerAlerts({ shop: [
    { key: 'missing-file-x', level: 'urgent', title: 'Paid order waiting', action: 'Upload PDF', go: 'files' },
    { key: 'stale', level: 'warning', title: 'Checkouts never closed' },
    { key: 'payments-off', level: 'info', title: 'Public checkout is off' }] }, TODAY);
  assert.deepEqual(items.map(i => i.level), ['action', 'progress', 'info']);
  assert.ok(items.every(i => i.nav === 'store'));
});

test('duplicate records produce one alert', () => {
  const b = { id: 'b1', status: 'pending' };
  assert.equal(buildOwnerAlerts({ bookings: [b, { ...b }] }, TODAY).length, 1);
});

test('a failed report is a red system alert until a retry replaces it', () => {
  const [item] = buildOwnerAlerts({ failedReports: [{ id: 'monthly-2026-08', label: 'August 2026' }] }, TODAY);
  assert.equal(item.level, 'action'); assert.equal(item.nav, 'reports');
  assert.equal(buildOwnerAlerts({ failedReports: [] }, TODAY).length, 0);
});

test('a load failure is a red system alert', () => {
  const [item] = buildOwnerAlerts({ loadErrors: [{ source: 'bookings', label: 'booking requests' }] }, TODAY);
  assert.equal(item.level, 'action');
  assert.equal(item.status, 'System problem');
});

test('counts include only red items, per section and per group', () => {
  const items = buildOwnerAlerts({
    bookings: [{ id: 'b1', status: 'pending' }],
    prayers: [{ id: 'p1', status: 'new' }, { id: 'p2', status: 'in-progress' }],
    testimonials: [{ id: 't1', status: 'pending' }],
    shop: [{ key: 'payments-off', level: 'info', title: 'x' }] }, TODAY);
  const c = alertCounts(items);
  assert.equal(c.total, 3);
  assert.deepEqual(c.byNav, { bookings: 1, 'prayer-requests': 1, testimonials: 1 });
  assert.deepEqual(c.byGroup, { bookings: 1, community: 2 });
  assert.equal(c.progress, 1);
});

test('red items sort first, oldest waiting first', () => {
  const items = buildOwnerAlerts({
    prayers: [{ id: 'p2', status: 'in-progress', createdAt: '2026-11-01' }, { id: 'p1', status: 'new', createdAt: '2026-11-16' }],
    bookings: [{ id: 'b1', status: 'pending', createdAt: '2026-11-10' }] }, TODAY);
  assert.deepEqual(items.map(i => i.key), ['booking:b1', 'prayer:p1', 'prayer:p2']);
});

test('record tones follow the four-color rule', () => {
  assert.equal(recordTone('booking', 'pending'), 'action');
  assert.equal(recordTone('booking', 'confirmed'), 'done');
  assert.equal(recordTone('registration', 'pending_payment'), 'progress');
  assert.equal(recordTone('class', 'scheduled'), 'info');
});

test('timestamps from Firestore, strings and numbers all read', () => {
  assert.equal(toMs({ seconds: 10 }), 10000);
  assert.equal(toMs({ toMillis: () => 5 }), 5);
  assert.equal(toMs('2026-01-01T00:00:00Z'), Date.UTC(2026, 0, 1));
  assert.equal(toMs(''), null);
});

test('a flagged payment stays red until marked reviewed, with the reason', () => {
  const base = { id: 'b1', collection: 'bookings', name: 'Jordan Lee', paymentNeedsReview: true, date: '2026-11-20', time: '2:00 PM' };
  const twice = buildOwnerAlerts({ paymentReviews: [{ ...base, duplicatePaymentSessionIds: ['cs_test_2'] }] }, '2026-11-18');
  assert.equal(twice.length, 1);
  assert.equal(twice[0].level, 'action');
  assert.equal(twice[0].nav, 'bookings');
  assert.match(twice[0].status, /Paid twice/);
  const dispute = buildOwnerAlerts({ paymentReviews: [{ ...base, collection: 'teachingRegistrations', teachingTitle: 'Discernment', disputeStatus: 'open' }] }, '2026-11-18');
  assert.equal(dispute[0].nav, 'registrations');
  assert.match(dispute[0].status, /Chargeback opened/);
  assert.match(buildOwnerAlerts({ paymentReviews: [base] }, '2026-11-18')[0].status, /after it was cancelled/);
  assert.equal(buildOwnerAlerts({ paymentReviews: [{ ...base, paymentNeedsReview: false }] }, '2026-11-18').length, 0);
});

console.log(results.join('\n'));
const failed = results.filter(r => r.startsWith('FAIL')).length;
console.log((results.length - failed) + '/' + results.length + ' passed');
process.exit(failed ? 1 : 0);
