// Owner Portal — navigation map + action-required alert engine.
//
// Pure functions only (no DOM, no Firestore) so the rules can be unit
// tested in Node. app.js gathers the real records and hands them in.
//
// The key rule: an alert is DERIVED from a record's current state every
// time it is computed. Nothing here stores "seen", "read" or
// "dismissed" — so viewing or opening an item never clears it. It only
// disappears when the record itself changes (a booking is confirmed or
// declined, a prayer request is marked complete, a PDF is attached…).
// That is also why counts survive refreshes and new sign-ins: they are
// recomputed from the database each time.

export const OWNER_NAV_GROUPS = [
  { key: 'overview', label: 'Overview', nav: ['dashboard'] },
  { key: 'bookings', label: 'Bookings', nav: ['bookings'] },
  { key: 'classroom', label: 'Classroom', nav: ['teachings', 'registrations', 'paths', 'class-reviews'] },
  { key: 'community', label: 'Community', nav: ['prayer-requests', 'testimonials', 'events', 'people'] },
  { key: 'resources', label: 'Resources', nav: ['store', 'payments', 'reports'] },
  { key: 'website', label: 'Website', nav: ['website', 'media', 'policies'] },
  { key: 'settings', label: 'Settings', nav: ['settings', 'communication'] }
];

export function groupForNav(nav){
  return OWNER_NAV_GROUPS.find(g => g.nav.includes(nav)) || null;
}

// action  = red    — the owner must do something
// progress = amber — being handled / waiting on someone else
// info    = gray   — worth knowing, never counted as urgent
export const ALERT_LEVELS = ['action', 'progress', 'info'];
const LEVEL_ORDER = { action: 0, progress: 1, info: 2 };

export function toMs(value){
  if(value === null || value === undefined || value === '') return null;
  if(typeof value === 'number') return value;
  if(typeof value.toMillis === 'function') return value.toMillis();
  if(typeof value.toDate === 'function') return value.toDate().getTime();
  if(typeof value.seconds === 'number') return value.seconds * 1000;
  const ms = new Date(value).getTime();
  return Number.isNaN(ms) ? null : ms;
}

const personName = (r, fallback) => {
  if(!r) return fallback;
  if(r.anonymous || r.isAnonymous) return 'Anonymous';
  const full = [r.firstName, r.lastName].filter(Boolean).join(' ').trim();
  return (r.name || full || r.displayName || r.email || fallback).toString();
};

const SHOP_LEVEL = { urgent: 'action', warning: 'progress', info: 'info' };
const SHOP_STATUS = { urgent: 'Action required', warning: 'Check on it', info: 'For your information' };

// sources: {
//   bookings, prayers, testimonials, reviews, registrations: arrays of records
//   classes: [{ id, title, seatsRemaining, waitlistWaiting }]
//   shop: alerts from shop-admin computeAlerts()
//   loadErrors: [{ source, label }]
// }
export function buildOwnerAlerts(sources = {}, today = new Date().toISOString().slice(0, 10)){
  const items = new Map();
  const add = item => { if(!items.has(item.key)) items.set(item.key, item); };

  (sources.bookings || []).filter(b => b && b.status === 'pending').forEach(b => {
    const past = b.date && b.date < today;
    add({ key: 'booking:' + b.id, level: 'action', nav: 'bookings',
      title: 'Booking request — ' + personName(b, 'Guest'),
      detail: [b.sessionLabel, b.dateLabel || b.date, b.time].filter(Boolean).join(' · '),
      at: toMs(b.createdAt) ?? toMs(b.date),
      status: past ? 'Date has passed — decline or reschedule' : 'Awaiting your confirmation',
      actionLabel: 'Review Request', target: { kind: 'booking', id: b.id } });
  });

  (sources.prayers || []).forEach(p => {
    if(!p) return;
    if(p.status === 'new') add({ key: 'prayer:' + p.id, level: 'action', nav: 'prayer-requests',
      title: 'New prayer request — ' + personName(p, 'Anonymous'), detail: '',
      at: toMs(p.createdAt), status: 'Not yet answered', actionLabel: 'Open Request', target: { kind: 'prayer', id: p.id } });
    else if(p.status === 'in-progress') add({ key: 'prayer:' + p.id, level: 'progress', nav: 'prayer-requests',
      title: 'Prayer request in progress — ' + personName(p, 'Anonymous'), detail: '',
      at: toMs(p.updatedAt) ?? toMs(p.createdAt), status: 'In progress', actionLabel: 'Open Request', target: { kind: 'prayer', id: p.id } });
  });

  (sources.testimonials || []).filter(t => t && t.status === 'pending').forEach(t => add({
    key: 'testimony:' + t.id, level: 'action', nav: 'testimonials',
    title: 'Testimony awaiting approval — ' + personName(t, 'Anonymous'), detail: '',
    at: toMs(t.createdAt), status: 'Awaiting approval', actionLabel: 'Review', target: { kind: 'testimony', id: t.id } }));

  (sources.reviews || []).filter(r => r && r.status === 'pending').forEach(r => add({
    key: 'review:' + r.id, level: 'action', nav: 'class-reviews',
    title: 'Class review awaiting approval — ' + (r.className || 'Class'), detail: '',
    at: toMs(r.createdAt), status: 'Awaiting approval', actionLabel: 'Review', target: { kind: 'review', id: r.id } }));

  (sources.registrations || []).filter(r => r && r.status === 'pending_payment' && (!r.teachingDate || r.teachingDate >= today)).forEach(r => add({
    key: 'registration:' + r.id, level: 'progress', nav: 'registrations',
    title: 'Waiting on payment — ' + personName(r, 'Guest'), detail: r.teachingTitle || 'Class',
    at: toMs(r.registeredAt), status: 'Waiting on the registrant', actionLabel: 'Open Registration', target: { kind: 'registration', id: r.id } }));

  (sources.classes || []).forEach(c => {
    if(!c || c.seatsRemaining === null || c.seatsRemaining === undefined || c.seatsRemaining <= 0) return;
    if(c.waitlistWaiting) add({ key: 'waitlist:' + c.id, level: 'action', nav: 'teachings',
      title: 'Seat open with a waitlist — ' + (c.title || 'Class'), detail: c.seatsRemaining + ' seat' + (c.seatsRemaining === 1 ? '' : 's') + ' available',
      at: null, status: 'Invite the next person', actionLabel: 'Open Waitlist', target: { kind: 'waitlist', id: c.id } });
    else if(c.seatsRemaining <= 2) add({ key: 'nearly-full:' + c.id, level: 'info', nav: 'teachings',
      title: 'Class nearly full — ' + (c.title || 'Class'), detail: c.seatsRemaining + ' seat' + (c.seatsRemaining === 1 ? '' : 's') + ' left',
      at: null, status: 'For your information', actionLabel: 'Open Class', target: { kind: 'class', id: c.id } });
  });

  (sources.shop || []).forEach(a => {
    if(!a || !a.key) return;
    add({ key: 'shop:' + a.key, level: SHOP_LEVEL[a.level] || 'info', nav: 'store',
      title: a.title, detail: a.detail || '', at: null, status: SHOP_STATUS[a.level] || 'For your information',
      actionLabel: a.action || 'Open', target: { kind: 'shop', alert: a } });
  });

  // Payments the server flagged on a booking or class registration:
  // a second charge, a payment after cancelling, or a chargeback. Stays
  // red until the owner has dealt with it and marks it reviewed.
  (sources.paymentReviews || []).filter(r => r && r.paymentNeedsReview === true).forEach(r => {
    const isClass = r.collection === 'teachingRegistrations';
    const reason = r.disputeStatus === 'open' ? 'Chargeback opened by the customer’s bank — respond in Stripe'
      : r.disputeStatus === 'lost' ? 'Chargeback lost — the bank returned this payment'
      : (r.duplicatePaymentSessionIds || []).length ? 'Paid twice — refund the extra payment in Stripe'
      : 'Payment arrived after it was cancelled — follow up with them';
    add({ key: 'payment-review:' + r.collection + ':' + r.id, level: 'action', nav: isClass ? 'registrations' : 'bookings',
      title: 'Payment needs review — ' + personName(r, 'Guest'),
      detail: isClass ? (r.teachingTitle || 'Class') : [r.sessionLabel, r.date, r.time].filter(Boolean).join(' · '),
      at: toMs(r.updatedAt) ?? toMs(r.paidAt), status: reason,
      actionLabel: 'Mark Reviewed', target: { kind: 'payment-review', collection: r.collection, id: r.id } });
  });

  (sources.failedReports || []).forEach(r => add({
    key: 'report:' + r.id, level: 'action', nav: 'reports',
    title: 'Report could not be generated — ' + (r.label || 'Report'), detail: 'Use “Try Again” in Reports & Backups.',
    at: toMs(r.at), status: 'System problem', actionLabel: 'Open Reports', target: { kind: 'reports' } }));

  (sources.loadErrors || []).forEach(e => add({
    key: 'load-error:' + e.source, level: 'action', nav: 'dashboard',
    title: 'Couldn’t load ' + e.label, detail: 'Counts for this area may be incomplete. Refresh the page; if it keeps happening, the database may be unreachable.',
    at: null, status: 'System problem', actionLabel: 'Refresh', target: { kind: 'reload' } }));

  return [...items.values()].sort((a, b) =>
    (LEVEL_ORDER[a.level] - LEVEL_ORDER[b.level]) ||
    ((a.at ?? Infinity) - (b.at ?? Infinity)) ||
    a.title.localeCompare(b.title));
}

// Only red (action) items are counted — amber and gray never inflate
// the badges, so a routine scheduled class is never an "emergency".
export function alertCounts(items){
  const byNav = {}, byGroup = {};
  let total = 0;
  items.filter(i => i.level === 'action').forEach(i => {
    total += 1;
    byNav[i.nav] = (byNav[i.nav] || 0) + 1;
    const g = groupForNav(i.nav);
    if(g) byGroup[g.key] = (byGroup[g.key] || 0) + 1;
  });
  return { total, byNav, byGroup, progress: items.filter(i => i.level === 'progress').length };
}

// Tone for any record shown in Recent Activity / Upcoming, using the
// same four-color rule as the alerts.
export function recordTone(kind, status){
  const s = String(status || '').toLowerCase();
  if(kind === 'booking' && s === 'pending') return 'action';
  if(kind === 'prayer' && s === 'new') return 'action';
  if((kind === 'testimony' || kind === 'review') && s === 'pending') return 'action';
  if(['in-progress', 'pending_payment', 'pending_payment_review', 'pending_delivery'].includes(s)) return 'progress';
  if(['confirmed', 'completed', 'paid', 'published', 'attended', 'answered', 'delivered', 'active'].includes(s)) return 'done';
  return 'info';
}
