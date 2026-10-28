/* ============================================================
   Owner Reports & Backups

   Builds printable ministry reports (PDF) from the payment and
   activity records, keeps them in private Cloud Storage, and hands
   them out only through owner-checked, short-lived links. Also makes
   a separate, passphrase-encrypted backup of the database on request.

   Money is always split by where it came from:
     live    — Stripe live mode (stripeSessionId cs_live_…)
     manual  — recorded by the owner outside Stripe
     test    — Stripe test mode (cs_test_…); never counted as income
   ============================================================ */

const crypto = require('crypto');
const PDFDocument = require('pdfkit');

const TZ = 'America/New_York';
const FILE_LINK_MINUTES = 5;
const EMAIL_LINK_DAYS = 7;
const MAX_CUSTOM_DAYS = 366;
const BACKUP_KDF_ITERATIONS = 600000;
// Never exported in a backup: these hold short-lived credentials.
const BACKUP_SKIP = new Set(['digitalDownloadTokens', 'reportFileTokens', 'reportLinks', 'digitalFileUploads']);
// The report email is not sent until a provider is connected
// (PROJECT-CONTEXT §38). Links can still be created and copied.
const EMAIL_PROVIDER_CONNECTED = false;
const SITE = 'https://theunveiledassembly.com';

/* ---------- dates (America/New_York) ---------- */
function tzOffsetMinutes(utcMs){
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: TZ, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' }).formatToParts(new Date(utcMs));
  const g = type => Number(parts.find(p => p.type === type).value);
  return (Date.UTC(g('year'), g('month') - 1, g('day'), g('hour'), g('minute'), g('second')) - utcMs) / 60000;
}
// UTC instant of 00:00 in New York on a YYYY-MM-DD date.
function nyMidnight(dateStr){
  const [y, m, d] = dateStr.split('-').map(Number);
  const guess = Date.UTC(y, m - 1, d);
  const first = guess - tzOffsetMinutes(guess) * 60000;
  return guess - tzOffsetMinutes(first) * 60000;
}
function nyDate(ms){
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(ms));
  return parts; // YYYY-MM-DD
}
function addDays(dateStr, n){
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}
function monthStart(y, m){ return new Date(Date.UTC(y, m - 1, 1)).toISOString().slice(0, 10); }
function daysBetween(a, b){ return Math.round((Date.UTC(...b.split('-').map((v, i) => i === 1 ? v - 1 : +v)) - Date.UTC(...a.split('-').map((v, i) => i === 1 ? v - 1 : +v))) / 86400000); }
// Previous `months` completed calendar months, as of `now` in New York.
function previousMonths(now, months){
  const [y, m] = nyDate(now.getTime()).split('-').map(Number);
  const end = addDays(monthStart(y, m), -1);
  const [sy, sm] = [new Date(Date.UTC(y, m - 1 - months, 1)).getUTCFullYear(), new Date(Date.UTC(y, m - 1 - months, 1)).getUTCMonth() + 1];
  return { start: monthStart(sy, sm), end };
}
function comparisonPeriod(kind, start, end){
  // Whole calendar months (scheduled, or a custom range that happens to
  // be whole months) compare with the same number of months before.
  const [sy, sm, sd] = start.split('-').map(Number), [ey, em] = end.split('-').map(Number);
  const wholeMonths = sd === 1 && addDays(end, 1).endsWith('-01');
  if(kind === 'monthly' || kind === 'quarterly' || wholeMonths){
    const months = kind === 'monthly' ? 1 : kind === 'quarterly' ? 3 : (ey * 12 + em) - (sy * 12 + sm) + 1;
    const [y, m] = start.split('-').map(Number);
    const s = new Date(Date.UTC(y, m - 1 - months, 1));
    return { start: s.toISOString().slice(0, 10), end: addDays(start, -1) };
  }
  const len = daysBetween(start, end) + 1;
  return { start: addDays(start, -len), end: addDays(start, -1) };
}
function periodLabel(start, end){
  const fmt = (d, opts) => new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', ...opts }).format(new Date(d + 'T12:00:00Z'));
  const [sy, sm, sd] = start.split('-').map(Number);
  const lastOfMonth = addDays(monthStart(+end.slice(0, 4), +end.slice(5, 7) + 1), -1) === end;
  if(sd === 1 && lastOfMonth && start.slice(0, 7) === end.slice(0, 7)) return fmt(start, { month: 'long', year: 'numeric' });
  if(sd === 1 && lastOfMonth) return fmt(start, { month: 'long' }) + ' – ' + fmt(end, { month: 'long', year: 'numeric' });
  return fmt(start, { month: 'short', day: 'numeric', year: 'numeric' }) + ' – ' + fmt(end, { month: 'short', day: 'numeric', year: 'numeric' });
}

/* ---------- record helpers ---------- */
function toMillis(v){
  if(!v) return 0;
  if(typeof v.toMillis === 'function') return v.toMillis();
  if(v instanceof Date) return v.getTime();
  const n = new Date(v).getTime();
  return Number.isNaN(n) ? 0 : n;
}
function recordMode(r){
  const s = String(r.stripeSessionId || '');
  if(s.startsWith('cs_live_')) return 'live';
  if(s.startsWith('cs_test_')) return 'test';
  return 'manual';
}
const cents = dollars => Math.round((Number(dollars) || 0) * 100);
function maskName(name){
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
  if(!parts.length) return 'Guest';
  return parts[0] + (parts.length > 1 ? ' ' + parts[parts.length - 1][0].toUpperCase() + '.' : '');
}
function maskEmail(email){
  const [user, domain] = String(email || '').split('@');
  if(!domain) return '—';
  return user.slice(0, 2) + '***@' + domain;
}
const orderNumber = id => 'UA-' + String(id || '').slice(0, 8).toUpperCase();
const money = c => (c < 0 ? '-$' : '$') + (Math.abs(c) / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function emptyBucket(){
  return {
    receivedCents: 0, payments: 0,
    bySource: { donations: 0, shopDigital: 0, shopPhysical: 0, classes: 0, oneOnOne: 0, events: 0 },
    refundsCents: 0, refunds: 0, cancelled: 0,
    unpaid: { count: 0, cents: 0 }, failed: { count: 0, cents: 0 },
    byProduct: {}
  };
}
function addProduct(bucket, label, type, amountCents, qty){
  const p = bucket.byProduct[label] || (bucket.byProduct[label] = { label, type, count: 0, cents: 0 });
  p.count += qty; p.cents += amountCents;
}

/* ---------- data gathering ---------- */
async function collect(db, startMs, endMs){
  const inRange = ms => ms >= startMs && ms < endMs;
  const all = async name => (await db.collection(name).get()).docs.map(d => ({ id: d.id, ...d.data() }));
  const [donations, shopOrders, bookings, registrations, access, users, events, prayers, testimonials, reviews] = await Promise.all(
    ['donations', 'shopOrders', 'bookings', 'teachingRegistrations', 'digitalAccess', 'users', 'events', 'prayerRequests', 'testimonials', 'classReviews'].map(all));
  const buckets = { live: emptyBucket(), manual: emptyBucket(), test: emptyBucket() };
  const orders = [];

  const paidIn = (r, field = 'paidAt') => inRange(toMillis(r[field]));
  const refundedIn = r => inRange(toMillis(r.refundedAt));

  for(const r of donations){
    const b = buckets[recordMode(r)];
    if(r.paymentStatus === 'paid' || /refunded/.test(r.paymentStatus || '')){
      if(paidIn(r)){ b.receivedCents += cents(r.amountPaid); b.payments++; b.bySource.donations += cents(r.amountPaid); addProduct(b, 'One-time gifts', 'Donation', cents(r.amountPaid), 1); }
    }
    if(refundedIn(r)){ b.refundsCents += cents(r.amountRefunded); b.refunds++; }
    if(inRange(toMillis(r.createdAt))){
      if(r.status === 'pending_payment') { b.unpaid.count++; b.unpaid.cents += Number(r.amountCents) || 0; }
      if(r.status === 'expired' || r.status === 'failed') { b.failed.count++; b.failed.cents += Number(r.amountCents) || 0; }
    }
  }
  for(const r of shopOrders){
    const mode = recordMode(r); const b = buckets[mode];
    const items = r.items || [];
    if((r.paymentStatus === 'paid' || /refunded/.test(r.paymentStatus || '')) && paidIn(r)){
      b.receivedCents += cents(r.amountPaid); b.payments++;
      for(const i of items){
        const line = (i.unitPriceCents || 0) * (i.quantity || 1);
        if(i.type === 'digital') b.bySource.shopDigital += line; else b.bySource.shopPhysical += line;
        addProduct(b, i.title || 'Shop item', i.type === 'digital' ? 'Digital resource' : 'Physical product', line, i.quantity || 1);
      }
      const digital = items.filter(i => i.type === 'digital').map(i => {
        const a = access.find(x => x.id === r.id + '_' + i.productId);
        return a ? `${i.title}: ${a.accessStatus === 'active' ? 'download open' : a.accessStatus.replace('_', ' ')}, ${Number(a.downloadCount) || 0} download${a.downloadCount === 1 ? '' : 's'}` : `${i.title}: no access record`;
      });
      orders.push({
        mode, number: orderNumber(r.id), when: toMillis(r.paidAt), customer: maskName(r.customerName || r.email), amountCents: cents(r.amountPaid),
        items: items.map(i => (i.quantity > 1 ? i.quantity + ' × ' : '') + (i.title || 'Item')).join(', '),
        status: r.paymentStatus === 'paid' ? 'Paid' : 'Refunded',
        fulfillment: [r.hasPhysical ? 'Physical: ' + String(r.fulfillmentStatus || 'unfulfilled').replace('_', ' ') : '', ...digital].filter(Boolean).join(' · ')
      });
    }
    if(refundedIn(r)){ b.refundsCents += cents(r.amountRefunded); b.refunds++; }
    if(inRange(toMillis(r.createdAt))){
      if(r.status === 'pending_payment'){ b.unpaid.count++; b.unpaid.cents += Number(r.totalCents) || 0; }
      if(r.status === 'expired' || r.status === 'failed'){ b.failed.count++; b.failed.cents += Number(r.totalCents) || 0; }
    }
  }
  for(const r of bookings){
    const b = buckets[recordMode(r)];
    if(cents(r.amountPaid) > 0 && (r.paymentStatus === 'paid' || r.transactionId) && paidIn(r, r.paidAt ? 'paidAt' : 'createdAt')){
      b.receivedCents += cents(r.amountPaid); b.payments++; b.bySource.oneOnOne += cents(r.amountPaid);
      addProduct(b, 'One-on-One session' + (r.sessionType ? ' (' + String(r.sessionType).replace('-', ' ') + ')' : ''), 'One-on-One', cents(r.amountPaid), 1);
    }
    if(refundedIn(r)){ b.refundsCents += cents(r.amountRefunded); b.refunds++; }
    if(inRange(toMillis(r.cancelledAt)) && r.status === 'cancelled'){
      if(r.cancelReason === 'payment-not-completed'){ b.failed.count++; } else { b.cancelled++; }
    }
    if(inRange(toMillis(r.createdAt)) && r.status === 'pending' && r.paymentStatus !== 'paid') b.unpaid.count++;
  }
  for(const r of registrations){
    const b = buckets[recordMode(r)];
    if(cents(r.amountPaid) > 0 && (r.paymentStatus === 'paid' || r.transactionId) && paidIn(r, r.paidAt ? 'paidAt' : 'registeredAt')){
      b.receivedCents += cents(r.amountPaid); b.payments++; b.bySource.classes += cents(r.amountPaid);
      addProduct(b, r.teachingTitle || 'Class registration', 'Class', cents(r.amountPaid), 1);
    }
    if(refundedIn(r)){ b.refundsCents += cents(r.amountRefunded); b.refunds++; }
    if(inRange(toMillis(r.cancelledAt)) && r.status === 'cancelled'){
      if(r.cancelReason === 'payment-not-completed'){ b.failed.count++; } else { b.cancelled++; }
    }
    if(inRange(toMillis(r.registeredAt || r.createdAt)) && r.status === 'pending_payment') b.unpaid.count++;
  }
  const complimentary = access.filter(a => a.paymentStatus === 'complimentary' && inRange(toMillis(a.purchasedAt)))
    .map(a => ({ when: toMillis(a.purchasedAt), product: a.productTitle || 'Digital resource', member: maskEmail(a.email) }));
  const downloads = access.filter(a => inRange(toMillis(a.lastDownloadAt))).length;
  const activity = {
    newMembers: users.filter(u => inRange(toMillis(u.createdAt))).length,
    totalMembers: users.filter(u => toMillis(u.createdAt) < endMs).length,
    events: events.filter(e => e.date && inRange(nyMidnight(String(e.date).slice(0, 10)))).length,
    prayerRequests: prayers.filter(p => inRange(toMillis(p.createdAt))).length,
    testimonials: testimonials.filter(p => inRange(toMillis(p.createdAt))).length,
    classReviews: reviews.filter(p => inRange(toMillis(p.createdAt))).length,
    digitalLibrariesUsed: downloads
  };
  orders.sort((a, b) => a.when - b.when);
  return { buckets, orders, complimentary, activity };
}

async function stripeBalance(stripe, startMs, endMs){
  try {
    let fees = 0, netAvail = 0, count = 0;
    for await (const bt of stripe.balanceTransactions.list({ created: { gte: Math.floor(startMs / 1000), lt: Math.floor(endMs / 1000) }, limit: 100 })){
      fees += bt.fee || 0; netAvail += bt.net || 0; count++;
    }
    const payouts = [];
    for await (const p of stripe.payouts.list({ created: { gte: Math.floor(startMs / 1000), lt: Math.floor(endMs / 1000) }, limit: 100 })){
      payouts.push({ when: p.arrival_date * 1000, cents: p.amount, status: p.status });
    }
    return { available: true, feesCents: fees, netCents: netAvail, transactions: count, payouts };
  } catch (err) {
    return { available: false, reason: 'Stripe balance details could not be loaded for this period.' };
  }
}

/* ---------- PDF ---------- */
const INK = '#111111', MUTED = '#555555', LINE = '#d6d6d6', SOFT = '#f3f2ee';
function renderPdf(report, { compress = true } = {}){
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'LETTER', margins: { top: 64, bottom: 64, left: 60, right: 60 }, bufferPages: true, compress, info: { Title: 'Ministry Report — ' + report.label, Author: 'The Unveiled Assembly' } });
    const chunks = []; doc.on('data', c => chunks.push(c)); doc.on('end', () => resolve(Buffer.concat(chunks))); doc.on('error', reject);
    const W = doc.page.width - 120;
    const ensure = h => { if(doc.y + h > doc.page.height - 80) doc.addPage(); };
    const h1 = t => { doc.font('Helvetica-Bold').fontSize(22).fillColor(INK).text(t); };
    const h2 = t => { ensure(60); doc.moveDown(0.8); doc.font('Helvetica-Bold').fontSize(13).fillColor(INK).text(t.toUpperCase(), { characterSpacing: 1 }); doc.moveTo(60, doc.y + 4).lineTo(60 + W, doc.y + 4).strokeColor(LINE).stroke(); doc.moveDown(0.7); };
    const p = (t, opts = {}) => { doc.font('Helvetica').fontSize(10.5).fillColor(opts.muted ? MUTED : INK).text(t, { width: W, lineGap: 2, ...opts }); };
    const table = (cols, rows, opts = {}) => {
      const widths = cols.map(c => c.w * W);
      const row = (cells, bold, fill) => {
        const height = Math.max(...cells.map((c, i) => doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(9.5).heightOfString(String(c), { width: widths[i] - 10 }))) + 10;
        ensure(height + 4);
        const y = doc.y;
        if(fill){ doc.rect(60, y, W, height).fill(fill); }
        let x = 60;
        cells.forEach((c, i) => {
          doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(9.5).fillColor(INK)
            .text(String(c), x + 5, y + 5, { width: widths[i] - 10, align: cols[i].align || 'left' });
          x += widths[i];
        });
        doc.moveTo(60, y + height).lineTo(60 + W, y + height).strokeColor(LINE).lineWidth(0.5).stroke();
        doc.x = 60; doc.y = y + height;
      };
      row(cols.map(c => c.label), true, SOFT);
      if(!rows.length) row([opts.empty || 'Nothing recorded in this period.', ...cols.slice(1).map(() => '')]);
      rows.forEach(r => row(r));
      if(opts.total) row(opts.total, true);
      doc.moveDown(0.6);
    };
    const live = report.data.buckets.live, manual = report.data.buckets.manual, test = report.data.buckets.test;
    const real = report.real;

    // ---- page 1: executive summary
    doc.font('Helvetica').fontSize(9).fillColor(MUTED).text('THE UNVEILED ASSEMBLY OF CHRIST JESUS  ·  MINISTRY REPORT', { characterSpacing: 1.2 });
    doc.moveDown(0.6);
    h1(report.label);
    doc.font('Helvetica').fontSize(10.5).fillColor(MUTED)
      .text(`${report.kindLabel} · ${report.periodStart} to ${report.periodEnd} (New York time) · Generated ${report.generatedLabel}`);
    doc.moveDown(0.8);
    const bannerY = doc.y;
    doc.rect(60, bannerY, W, 26).fill(report.stripeMode === 'live' ? INK : '#e8e5dc');
    doc.font('Helvetica-Bold').fontSize(9.5).fillColor(report.stripeMode === 'live' ? '#ffffff' : INK)
      .text(report.stripeMode === 'live' ? 'LIVE PAYMENTS — totals below are real income' : 'ONLINE PAYMENTS ARE IN TEST MODE — test transactions are listed separately and are NOT income', 70, bannerY + 8, { width: W - 20 });
    doc.x = 60; doc.y = bannerY + 40;
    h2('Executive summary');
    const kpis = [
      ['Money received', money(real.receivedCents)], ['Refunds', money(real.refundsCents)],
      ['Stripe fees', report.stripe.available && report.stripeMode === 'live' ? money(report.stripe.feesCents) : 'Not available'],
      ['Net after fees & refunds', money(real.receivedCents - real.refundsCents - (report.stripe.available && report.stripeMode === 'live' ? report.stripe.feesCents : 0))]
    ];
    const boxW = (W - 30) / 4, boxY = doc.y;
    kpis.forEach(([label, value], i) => {
      const x = 60 + i * (boxW + 10);
      doc.rect(x, boxY, boxW, 58).strokeColor(LINE).lineWidth(0.8).stroke();
      doc.font('Helvetica').fontSize(8).fillColor(MUTED).text(label.toUpperCase(), x + 8, boxY + 9, { width: boxW - 16, characterSpacing: 0.6 });
      doc.font('Helvetica-Bold').fontSize(15).fillColor(INK).text(value, x + 8, boxY + 28, { width: boxW - 16 });
    });
    doc.x = 60; doc.y = boxY + 72;
    p(report.narrative);
    doc.moveDown(0.6);
    table([{ label: 'Compared with ' + report.compare.label, w: 0.46 }, { label: 'This period', w: 0.18, align: 'right' }, { label: 'Previous', w: 0.18, align: 'right' }, { label: 'Change', w: 0.18, align: 'right' }],
      report.compare.rows);

    // ---- detail sections
    h2('1. Money received by source');
    const src = b => b.bySource;
    const srcRows = [['Donations', 'donations'], ['Shop — digital resources', 'shopDigital'], ['Shop — physical products', 'shopPhysical'], ['Classes', 'classes'], ['Events', 'events'], ['One-on-One sessions', 'oneOnOne']]
      .map(([label, key]) => [label, money(src(live)[key]), money(src(manual)[key]), money(src(live)[key] + src(manual)[key])]);
    table([{ label: 'Source', w: 0.4 }, { label: 'Online (Stripe live)', w: 0.2, align: 'right' }, { label: 'Recorded by owner', w: 0.2, align: 'right' }, { label: 'Total', w: 0.2, align: 'right' }],
      srcRows, { total: ['Total received', money(live.receivedCents), money(manual.receivedCents), money(real.receivedCents)] });
    p('“Recorded by owner” means a payment the owner marked as paid outside online checkout (for example cash or Cash App). Events do not take payments online yet.', { muted: true });

    h2('2. Refunds, cancellations and unpaid items');
    table([{ label: 'Item', w: 0.6 }, { label: 'Count', w: 0.15, align: 'right' }, { label: 'Amount', w: 0.25, align: 'right' }], [
      ['Refunds issued', String(real.refunds), money(real.refundsCents)],
      ['Cancelled sessions / registrations', String(real.cancelled), '—'],
      ['Checkouts started but not paid (still open)', String(real.unpaid.count), money(real.unpaid.cents)],
      ['Failed or expired checkouts (nothing charged)', String(real.failed.count), money(real.failed.cents)]
    ]);

    h2('3. Stripe fees, net and payouts');
    if(report.stripeMode !== 'live'){
      p('Online payments have not been switched to live mode, so there are no real Stripe fees or payouts for this period. Test-mode fees are shown in the Test Mode appendix.', { muted: true });
    } else if(!report.stripe.available){
      p(report.stripe.reason + ' Totals above are taken from the website’s own payment records.', { muted: true });
    } else {
      table([{ label: 'Item', w: 0.6 }, { label: 'Amount', w: 0.4, align: 'right' }], [
        ['Stripe processing fees', money(report.stripe.feesCents)],
        ['Net balance activity (after fees and refunds)', money(report.stripe.netCents)],
        ...report.stripe.payouts.map(po => ['Payout ' + new Date(po.when).toLocaleDateString('en-US', { timeZone: TZ }) + ' (' + po.status + ')', money(po.cents)])
      ]);
    }

    h2('4. Sales by product or service');
    const products = Object.values(live.byProduct).concat(Object.values(manual.byProduct)).reduce((acc, pr) => {
      const k = pr.label; acc[k] = acc[k] ? { ...acc[k], count: acc[k].count + pr.count, cents: acc[k].cents + pr.cents } : { ...pr }; return acc;
    }, {});
    const productRows = Object.values(products).sort((a, b) => b.cents - a.cents).map(pr => [pr.label, pr.type, String(pr.count), money(pr.cents)]);
    table([{ label: 'Product or service', w: 0.44 }, { label: 'Type', w: 0.2 }, { label: 'Qty', w: 0.12, align: 'right' }, { label: 'Amount', w: 0.24, align: 'right' }], productRows);

    h2('5. Shop orders and delivery status');
    const realOrders = report.data.orders.filter(o => o.mode !== 'test');
    table([{ label: 'Order', w: 0.18 }, { label: 'Date', w: 0.13 }, { label: 'Customer', w: 0.13 }, { label: 'Items', w: 0.18 }, { label: 'Amount', w: 0.12, align: 'right' }, { label: 'Status / delivery', w: 0.26 }],
      realOrders.map(o => [o.number, new Date(o.when).toLocaleDateString('en-US', { timeZone: TZ }), o.customer, o.items, money(o.amountCents), o.status + (o.fulfillment ? ' · ' + o.fulfillment : '')]));

    h2('6. Complimentary copies given by the owner');
    table([{ label: 'Date', w: 0.2 }, { label: 'Resource', w: 0.5 }, { label: 'Member', w: 0.3 }],
      report.data.complimentary.map(c => [new Date(c.when).toLocaleDateString('en-US', { timeZone: TZ }), c.product, c.member]), { empty: 'No complimentary copies in this period.' });

    h2('7. Members and ministry activity');
    const a = report.data.activity;
    table([{ label: 'Measure', w: 0.7 }, { label: 'This period', w: 0.3, align: 'right' }], [
      ['New member accounts', String(a.newMembers)], ['Member accounts at period end', String(a.totalMembers)],
      ['Events on the calendar', String(a.events)], ['Prayer requests received', String(a.prayerRequests)],
      ['Testimonies submitted', String(a.testimonials)], ['Class reviews submitted', String(a.classReviews)],
      ['Digital library downloads (latest activity in period)', String(a.digitalLibrariesUsed)]
    ]);

    // ---- appendix: test mode
    doc.addPage();
    const ty = doc.y;
    doc.rect(60, ty, W, 26).fill('#e8e5dc');
    doc.font('Helvetica-Bold').fontSize(9.5).fillColor(INK).text('APPENDIX — TEST MODE (NOT REAL INCOME)', 70, ty + 8, { width: W - 20 });
    doc.x = 60; doc.y = ty + 40;
    p('These transactions were made with Stripe test cards while the payment system was being set up. No money moved. They are listed only so the records are complete and are never included in the totals above.', { muted: true });
    doc.moveDown(0.5);
    table([{ label: 'Test item', w: 0.6 }, { label: 'Count', w: 0.15, align: 'right' }, { label: 'Amount', w: 0.25, align: 'right' }], [
      ['Test payments', String(test.payments), money(test.receivedCents)],
      ['Test refunds', String(test.refunds), money(test.refundsCents)],
      ['Test checkouts not completed', String(test.failed.count + test.unpaid.count), money(test.failed.cents + test.unpaid.cents)]
    ]);
    const testOrders = report.data.orders.filter(o => o.mode === 'test');
    if(testOrders.length) table([{ label: 'Test order', w: 0.2 }, { label: 'Date', w: 0.16 }, { label: 'Items', w: 0.34 }, { label: 'Amount', w: 0.12, align: 'right' }, { label: 'Status', w: 0.18 }],
      testOrders.map(o => [o.number, new Date(o.when).toLocaleDateString('en-US', { timeZone: TZ }), o.items, money(o.amountCents), o.status]));

    h2('Notes');
    p('Dates use New York time. A period includes its first day from midnight through the end of its last day. Payments are counted on the day they were paid; refunds on the day they were issued. Names and emails are shortened for privacy. This report contains no card numbers, passwords, or access codes. Report ID: ' + report.id + '.', { muted: true });

    const range = doc.bufferedPageRange();
    for(let i = 0; i < range.count; i++){
      doc.switchToPage(range.start + i);
      // The footer sits inside the bottom margin; without this PDFKit
      // would treat it as overflow and start a blank page.
      doc.page.margins.bottom = 0;
      doc.font('Helvetica').fontSize(8).fillColor(MUTED)
        .text(`Confidential ministry record · ${report.label} · Page ${i + 1} of ${range.count}`, 60, doc.page.height - 44, { width: W, align: 'center', lineBreak: false });
    }
    doc.end();
  });
}

function compareRows(cur, prev){
  const change = (a, b) => b === 0 ? (a === 0 ? '—' : 'new') : ((a - b) / b * 100 >= 0 ? '+' : '') + ((a - b) / b * 100).toFixed(0) + '%';
  return [
    ['Money received', money(cur.receivedCents), money(prev.receivedCents), change(cur.receivedCents, prev.receivedCents)],
    ['Payments', String(cur.payments), String(prev.payments), change(cur.payments, prev.payments)],
    ['Refunds', money(cur.refundsCents), money(prev.refundsCents), change(cur.refundsCents, prev.refundsCents)],
    ['New members', String(cur.newMembers), String(prev.newMembers), change(cur.newMembers, prev.newMembers)]
  ];
}
function combine(a, b){
  const out = emptyBucket();
  for(const k of ['receivedCents', 'payments', 'refundsCents', 'refunds', 'cancelled']) out[k] = a[k] + b[k];
  out.unpaid = { count: a.unpaid.count + b.unpaid.count, cents: a.unpaid.cents + b.unpaid.cents };
  out.failed = { count: a.failed.count + b.failed.count, cents: a.failed.cents + b.failed.cents };
  return out;
}

/* ---------- factory ---------- */
function createReports({ db, FieldValue, Timestamp, getStorage, HttpsError, logger, stripe, stripeLiveMode, callerIsOwner }){
  const bucket = () => getStorage().bucket();
  const reportPath = id => 'private/reports/' + id + '.pdf';
  const backupPath = id => 'private/backups/' + id + '.uabk';
  const logEvent = (action, data) => db.collection('ownerReportEvents').add({ action, ...data, at: FieldValue.serverTimestamp() });

  async function buildReport({ id, kind, start, end, requestedBy }){
    const startMs = nyMidnight(start), endMs = nyMidnight(addDays(end, 1));
    const cmp = comparisonPeriod(kind, start, end);
    const [data, prevData] = await Promise.all([collect(db, startMs, endMs), collect(db, nyMidnight(cmp.start), nyMidnight(addDays(cmp.end, 1)))]);
    let mode = 'test';
    try { mode = stripeLiveMode() ? 'live' : 'test'; } catch (err) { mode = 'test'; }
    let stripeInfo = { available: false, reason: 'Stripe is not connected.' };
    try { stripeInfo = await stripeBalance(stripe(), startMs, endMs); } catch (err) { /* keep not available */ }
    const real = combine(data.buckets.live, data.buckets.manual);
    const prevReal = combine(prevData.buckets.live, prevData.buckets.manual);
    const label = periodLabel(start, end);
    const fees = stripeInfo.available && mode === 'live' ? stripeInfo.feesCents : 0;
    const net = real.receivedCents - real.refundsCents - fees;
    const narrative = real.payments
      ? `During ${label} the ministry received ${money(real.receivedCents)} from ${real.payments} payment${real.payments === 1 ? '' : 's'}. After ${money(real.refundsCents)} in refunds${fees ? ' and ' + money(fees) + ' in Stripe fees' : ''}, the net is ${money(net)}. ${data.activity.newMembers} new member account${data.activity.newMembers === 1 ? ' was' : 's were'} created.`
      : `No real payments were recorded during ${label}. ${mode === 'live' ? '' : 'Online payments are still in test mode, so test transactions appear only in the appendix. '}${data.activity.newMembers} new member account${data.activity.newMembers === 1 ? ' was' : 's were'} created.`;
    const report = {
      id, kind, label, periodStart: start, periodEnd: end, stripeMode: mode, stripe: stripeInfo,
      kindLabel: kind === 'monthly' ? 'Monthly report' : kind === 'quarterly' ? 'Quarterly rollup' : 'Custom date range',
      generatedLabel: new Intl.DateTimeFormat('en-US', { timeZone: TZ, dateStyle: 'medium', timeStyle: 'short' }).format(new Date()) + ' ET',
      data, real, narrative,
      compare: { label: periodLabel(cmp.start, cmp.end), rows: compareRows({ ...real, newMembers: data.activity.newMembers }, { ...prevReal, newMembers: prevData.activity.newMembers }) }
    };
    const pdf = await renderPdf(report);
    await bucket().file(reportPath(id)).save(pdf, { contentType: 'application/pdf', resumable: false, metadata: { cacheControl: 'private, no-store' } });
    const summary = {
      receivedCents: real.receivedCents, refundsCents: real.refundsCents, feesCents: fees, netCents: net, payments: real.payments,
      testPayments: data.buckets.test.payments, testReceivedCents: data.buckets.test.receivedCents, newMembers: data.activity.newMembers
    };
    return { pdf, summary, mode, label, requestedBy };
  }

  async function generate({ id, kind, start, end, requestedBy, scheduled }){
    const ref = db.doc('ownerReports/' + id);
    const claimed = await db.runTransaction(async tx => {
      const snap = await tx.get(ref);
      // A scheduled job that runs twice finds its report already made
      // (or being made) and stops; only a failed run may be retried.
      if(snap.exists && snap.data().status !== 'failed') return false;
      tx.set(ref, {
        kind, periodStart: start, periodEnd: end, timezone: TZ, status: 'generating', requestedBy, scheduled: !!scheduled,
        label: periodLabel(start, end), createdAt: FieldValue.serverTimestamp(), error: null,
        emailStatus: EMAIL_PROVIDER_CONNECTED ? 'pending' : 'not_connected'
      }, { merge: true });
      return true;
    });
    if(!claimed) return { id, skipped: true };
    try {
      const { pdf, summary, mode, label } = await buildReport({ id, kind, start, end, requestedBy });
      await ref.update({ status: 'ready', generatedAt: FieldValue.serverTimestamp(), sizeBytes: pdf.length, stripeMode: mode, summary, label });
      await logEvent('generated', { reportId: id, by: requestedBy });
      return { id, status: 'ready' };
    } catch (err) {
      logger.error('report generation failed', id, err.message);
      await ref.update({ status: 'failed', error: 'The report could not be generated. Try again, and contact support if it keeps failing.', failedAt: FieldValue.serverTimestamp() });
      await logEvent('failed', { reportId: id, by: requestedBy });
      return { id, status: 'failed' };
    }
  }

  async function runScheduled(kind, now = new Date()){
    const { start, end } = previousMonths(now, kind === 'monthly' ? 1 : 3);
    const id = kind === 'monthly' ? 'monthly-' + start.slice(0, 7) : 'quarterly-' + start.slice(0, 7) + '-to-' + end.slice(0, 7);
    return generate({ id, kind, start, end, requestedBy: 'schedule', scheduled: true });
  }

  async function requireOwner(request){
    const uid = request.auth ? request.auth.uid : null;
    if(!(await callerIsOwner(uid))) throw new HttpsError('permission-denied', 'Only the ministry owner can use reports.');
    return uid;
  }

  async function generateNow(request){
    const uid = await requireOwner(request);
    const data = request.data || {};
    const kind = String(data.kind || '');
    let start, end;
    if(kind === 'monthly') ({ start, end } = previousMonths(new Date(), 1));
    else if(kind === 'quarterly') ({ start, end } = previousMonths(new Date(), 3));
    else if(kind === 'custom'){
      start = String(data.start || ''); end = String(data.end || '');
      if(!/^\d{4}-\d{2}-\d{2}$/.test(start) || !/^\d{4}-\d{2}-\d{2}$/.test(end)) throw new HttpsError('invalid-argument', 'Choose a start and end date.');
      if(start > end) throw new HttpsError('invalid-argument', 'The start date must be on or before the end date.');
      if(daysBetween(start, end) + 1 > MAX_CUSTOM_DAYS) throw new HttpsError('invalid-argument', 'Choose a range of one year or less.');
      if(start > nyDate(Date.now())) throw new HttpsError('invalid-argument', 'The range cannot start in the future.');
    } else throw new HttpsError('invalid-argument', 'Choose a report type.');
    const id = 'manual-' + kind + '-' + start + '_' + end + '-' + Date.now().toString(36);
    return generate({ id, kind, start, end, requestedBy: uid });
  }

  // View or download: a single-use link that lasts a few minutes. When
  // opened from an emailed link, its 7-day key must also be valid.
  async function fileLink(request){
    const uid = await requireOwner(request);
    const data = request.data || {};
    const reportId = String(data.reportId || '');
    const disposition = data.disposition === 'attachment' ? 'attachment' : 'inline';
    const isBackup = data.type === 'backup';
    const snap = reportId ? await db.doc((isBackup ? 'ownerBackups/' : 'ownerReports/') + reportId).get() : null;
    if(!snap || !snap.exists || snap.data().status !== 'ready') throw new HttpsError('not-found', 'That file is not available.');
    if(data.linkKey){
      const key = await db.doc('reportLinks/' + String(data.linkKey)).get();
      if(!key.exists || key.data().reportId !== reportId || key.data().revoked) throw new HttpsError('permission-denied', 'This report link is no longer valid. Open Owner Portal → Reports & Backups to send a new one.');
      if(key.data().expiresAt.toMillis() < Date.now()) throw new HttpsError('deadline-exceeded', 'This report link expired. Open Owner Portal → Reports & Backups to send a new one.');
    }
    const token = crypto.randomBytes(32).toString('hex');
    await db.doc('reportFileTokens/' + token).set({
      reportId, type: isBackup ? 'backup' : 'report', disposition, uid, used: false,
      expiresAt: Timestamp.fromMillis(Date.now() + FILE_LINK_MINUTES * 60000)
    });
    return { url: fileBaseUrl() + '?t=' + token, expiresInMinutes: FILE_LINK_MINUTES };
  }
  function fileBaseUrl(){
    const project = process.env.GCLOUD_PROJECT || 'unveiledassembly';
    return process.env.FUNCTIONS_EMULATOR === 'true'
      ? 'http://127.0.0.1:5001/' + project + '/us-central1/ownerReportFile'
      : 'https://us-central1-' + project + '.cloudfunctions.net/ownerReportFile';
  }

  async function serveFile(req, res){
    if(req.method !== 'GET'){ res.status(405).send('Method Not Allowed'); return; }
    const token = String(req.query.t || '');
    const deny = (status, msg) => res.status(status).set('Cache-Control', 'no-store').type('text/plain').send(msg);
    if(!/^[a-f0-9]{64}$/.test(token)){ deny(404, 'This link is not valid.'); return; }
    const ref = db.doc('reportFileTokens/' + token);
    const grant = await db.runTransaction(async tx => {
      const t = await tx.get(ref);
      if(!t.exists) return { error: 'This link is not valid.' };
      const d = t.data();
      if(d.used) return { error: 'This link has already been used. Open Owner Portal → Reports & Backups for a fresh one.' };
      if(d.expiresAt.toMillis() < Date.now()) return { error: 'This link expired. Open Owner Portal → Reports & Backups for a fresh one.' };
      tx.update(ref, { used: true, usedAt: FieldValue.serverTimestamp() });
      return d;
    });
    if(grant.error){ deny(410, grant.error); return; }
    const isBackup = grant.type === 'backup';
    const path = isBackup ? backupPath(grant.reportId) : reportPath(grant.reportId);
    await logEvent(isBackup ? 'backup-downloaded' : (grant.disposition === 'attachment' ? 'downloaded' : 'viewed'), { reportId: grant.reportId, by: grant.uid });
    res.set({
      'Content-Type': isBackup ? 'application/octet-stream' : 'application/pdf',
      'Content-Disposition': (isBackup ? 'attachment' : grant.disposition) + '; filename="' + (isBackup ? 'unveiled-assembly-backup-' + grant.reportId + '.uabk' : 'Unveiled-Assembly-Report-' + grant.reportId + '.pdf') + '"',
      'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff', 'X-Frame-Options': 'DENY'
    });
    bucket().file(path).createReadStream()
      .on('error', err => { logger.error('report stream failed', err.message); if(!res.headersSent) deny(500, 'The file could not be read.'); else res.end(); })
      .pipe(res);
  }

  // A 7-day link for the owner's email. Issuing a new one replaces the
  // old. The link still requires the owner to sign in.
  async function issueEmailLink(request){
    const uid = await requireOwner(request);
    const reportId = String((request.data || {}).reportId || '');
    const snap = reportId ? await db.doc('ownerReports/' + reportId).get() : null;
    if(!snap || !snap.exists || snap.data().status !== 'ready') throw new HttpsError('not-found', 'That report is not ready.');
    const old = await db.collection('reportLinks').where('reportId', '==', reportId).where('revoked', '==', false).get();
    const batch = db.batch();
    old.forEach(d => batch.update(d.ref, { revoked: true, revokedAt: FieldValue.serverTimestamp() }));
    const key = crypto.randomBytes(24).toString('hex');
    batch.set(db.doc('reportLinks/' + key), { reportId, createdBy: uid, revoked: false, createdAt: FieldValue.serverTimestamp(), expiresAt: Timestamp.fromMillis(Date.now() + EMAIL_LINK_DAYS * 86400000) });
    batch.update(snap.ref, { lastLinkIssuedAt: FieldValue.serverTimestamp(), emailStatus: EMAIL_PROVIDER_CONNECTED ? 'queued' : 'not_connected' });
    await batch.commit();
    await logEvent('link-issued', { reportId, by: uid });
    return { url: SITE + '/owner-report.html?r=' + encodeURIComponent(reportId) + '&k=' + key, expiresInDays: EMAIL_LINK_DAYS, emailStatus: EMAIL_PROVIDER_CONNECTED ? 'queued' : 'not_connected' };
  }

  async function linkDetails(request){
    await requireOwner(request);
    const data = request.data || {};
    const key = await db.doc('reportLinks/' + String(data.linkKey || '')).get();
    if(!key.exists || key.data().reportId !== String(data.reportId || '') || key.data().revoked) throw new HttpsError('permission-denied', 'This report link is no longer valid. Open Owner Portal → Reports & Backups to send a new one.');
    if(key.data().expiresAt.toMillis() < Date.now()) throw new HttpsError('deadline-exceeded', 'This report link expired. Open Owner Portal → Reports & Backups to send a new one.');
    const report = await db.doc('ownerReports/' + key.data().reportId).get();
    if(!report.exists) throw new HttpsError('not-found', 'That report is not available.');
    const r = report.data();
    return { reportId: report.id, label: r.label, kind: r.kind, periodStart: r.periodStart, periodEnd: r.periodEnd, stripeMode: r.stripeMode, summary: r.summary || null, expiresAt: key.data().expiresAt.toMillis() };
  }

  // Full ministry-data backup: every collection except short-lived
  // credentials, encrypted with AES-256-GCM under a key derived from the
  // owner's passphrase (PBKDF2-SHA256). The passphrase is never stored.
  async function createBackup(request){
    const uid = await requireOwner(request);
    const passphrase = String((request.data || {}).passphrase || '');
    if(passphrase.length < 12) throw new HttpsError('invalid-argument', 'Use a passphrase of at least 12 characters.');
    const ref = db.collection('ownerBackups').doc();
    await ref.set({ status: 'creating', requestedBy: uid, createdAt: FieldValue.serverTimestamp() });
    try {
      const collections = await db.listCollections();
      const out = { format: 'unveiled-assembly-backup', version: 1, createdAt: new Date().toISOString(), collections: {} };
      const counts = {};
      const plain = v => v && typeof v.toDate === 'function' ? v.toDate().toISOString() : Array.isArray(v) ? v.map(plain) : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, plain(x)])) : v;
      for(const c of collections){
        if(BACKUP_SKIP.has(c.id)) continue;
        const snap = await c.get();
        out.collections[c.id] = snap.docs.map(d => ({ id: d.id, data: plain(d.data()) }));
        counts[c.id] = snap.size;
      }
      const salt = crypto.randomBytes(16), iv = crypto.randomBytes(12);
      const key = crypto.pbkdf2Sync(passphrase, salt, BACKUP_KDF_ITERATIONS, 32, 'sha256');
      const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
      const body = Buffer.concat([cipher.update(JSON.stringify(out), 'utf8'), cipher.final()]);
      const file = Buffer.concat([Buffer.from('UABK1'), salt, iv, cipher.getAuthTag(), body]);
      await bucket().file(backupPath(ref.id)).save(file, { contentType: 'application/octet-stream', resumable: false });
      await ref.update({ status: 'ready', sizeBytes: file.length, counts, completedAt: FieldValue.serverTimestamp() });
      await logEvent('backup-created', { reportId: ref.id, by: uid });
      return { id: ref.id, sizeBytes: file.length, collections: Object.keys(counts).length };
    } catch (err) {
      logger.error('backup failed', err.message);
      await ref.update({ status: 'failed', error: 'The backup could not be created.' });
      throw new HttpsError('internal', 'The backup could not be created. Please try again.');
    }
  }

  return { generate, generateNow, runScheduled, fileLink, serveFile, issueEmailLink, linkDetails, createBackup, buildReport };
}

module.exports = { createReports, renderPdf, collect, previousMonths, comparisonPeriod, nyMidnight, addDays, periodLabel, maskEmail, maskName, BACKUP_KDF_ITERATIONS };
