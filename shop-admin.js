/* ============================================================
   The Unveiled Assembly — Owner Portal → Resources Shop
   Overview (actionable alerts), Orders (with refunds), Collections,
   Customers, Discounts, Reports and Store Settings.

   Products/Inventory/Appearance live in shop-system.js; Digital Files
   and Download Access in digital-library.js.

   Nothing in this file decides a payment, a refund, or who may
   download a file. Those are Cloud Functions that re-check the owner
   role on the server (manageShopOrder, manageDigitalAccess,
   shopStoreStatus) and the Stripe webhook. Orders, files and the audit
   log can't be written from any browser (firestore.rules). This page
   reads real records and recalculates every number from them each time
   it opens — nothing is cached in browser storage on the live site.

   Test mode: purchases made in the private Stripe sandbox are stored
   with testMode / a cs_test_ session id. They are shown only when the
   owner switches the view to "Test records", and never counted in live
   totals.
   ============================================================ */
import {
  normalizeProduct, missingProductInputs, shopDiscountProblem, easternToday,
  normalizeDiscountCode, hashDiscountCode, DEMO_SHOP_DISCOUNTS_KEY
} from './shop-system.js?v=6';

const RETIRED_TEST_PRODUCT_IDS = ['testing-mvquvmo1', 'testing-2-mvrl7vrr'];
const PAYMENT_LABELS = { paid: 'Paid', pending: 'Payment Pending', unpaid: 'Not Paid', refunded: 'Refunded', partially_refunded: 'Partly Refunded', complimentary: 'Complimentary' };
const ACCESS_LABELS = { active: 'Download Allowed', pending_delivery: 'Waiting', revoked: 'Turned Off', refunded: 'Closed · Refunded' };
const PERIODS = [['30', 'Last 30 days'], ['90', 'Last 90 days'], ['365', 'Last 12 months'], ['ytd', 'This year'], ['all', 'All time']];

export function initShopAdmin(context){
  const { DEMO_MODE, db, firestore, call, escapeHtml: esc, base, shop, library, publicPaymentsEnabled = false, sandbox = false, onAlertsChanged = null } = context;
  const state = {
    loaded: false, loading: null, mode: sandbox ? 'test' : 'live',
    orders: [], access: [], files: {}, codes: [], audit: [], status: null, message: '',
    orderFilter: 'all', orderSearch: '', orderLimit: 30, period: '90', editingCode: null, openCustomer: null
  };

  /* ---------- helpers ---------- */
  const money = cents => '$' + ((Number(cents) || 0) / 100).toFixed(2);
  const dollarsToCents = v => Math.round((Number(v) || 0) * 100);
  const toDate = value => {
    if(!value) return null;
    if(typeof value.toDate === 'function') return value.toDate();
    const d = new Date(value); return Number.isNaN(d.getTime()) ? null : d;
  };
  const shortDate = value => { const d = toDate(value); return d ? d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : '—'; };
  const dateTime = value => { const d = toDate(value); return d ? d.toLocaleString(undefined, { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }) : '—'; };
  const orderNumber = id => id ? 'UA-' + String(id).slice(0, 8).toUpperCase() : 'Complimentary';
  const isTest = r => !!r && (r.testMode === true || /^cs_test_/.test(r.stripeSessionId || ''));
  const inMode = r => isTest(r) === (state.mode === 'test');
  const friendlyError = err => (err && err.message) ? String(err.message).replace(/^Firebase: /, '') : 'Something went wrong. Please try again.';
  const products = () => (shop.getProducts() || []).map(normalizeProduct);
  const productTitle = id => (products().find(p => p.id === id) || {}).title || 'Product';
  const hasFile = id => { const f = state.files[id]; return !!(f && (f.storagePath || f.previewFileName)); };
  const isPaid = o => ['paid', 'partially_refunded', 'refunded'].includes(o.paymentStatus);
  const paidCents = o => dollarsToCents(o.amountPaid);
  const refundedCents = o => dollarsToCents(o.amountRefunded);
  const remainingCents = o => Math.max(0, paidCents(o) - refundedCents(o));
  const orderAccess = o => state.access.filter(a => a.orderId === o.id);
  const itemPaidCents = i => Number.isInteger(i.paidCents) ? i.paidCents : (Number(i.unitPriceCents) || 0) * (Number(i.quantity) || 1);
  const pill = (label, tone) => `<span class="admin-status-pill ${tone}">${esc(label)}</span>`;
  const paymentTone = s => s === 'paid' || s === 'complimentary' ? 'confirmed' : s === 'refunded' || s === 'unpaid' ? 'cancelled' : 'pending';
  const accessTone = s => s === 'active' ? 'confirmed' : s === 'pending_delivery' ? 'pending' : 'cancelled';
  function storageGet(key, fallback){ try { const v = JSON.parse(localStorage.getItem(key)); return v ?? fallback; } catch (err) { return fallback; } }
  function storageSet(key, value){ try { localStorage.setItem(key, JSON.stringify(value)); } catch (err) { /* preview only */ } }
  function el(id){ return document.getElementById(id); }
  function setMsg(node, text){ if(node) node.textContent = text; }

  /* ---------- preview (localhost) sample records ----------
     The preview build has no database. These two clearly labeled
     samples exist only so the screens can be reviewed; they never reach
     the live site. */
  function demoData(){
    const now = Date.now();
    const orders = [
      { id: 'PVSAMPL1ORDER', preview: true, uid: 'demo-member', email: 'sample.customer@example.com', customerName: 'Preview Sample', status: 'paid', paymentStatus: 'paid', amountPaid: 21.6, subtotalCents: 2400, discountCents: 240, totalCents: 2160, discountCode: 'SAMPLE10', items: [{ productId: 'preview-demo-discernment-guide', title: 'Discernment Study Guide', type: 'digital', unitPriceCents: 2400, quantity: 1, discountCents: 240, paidCents: 2160 }], paymentIntentId: 'pi_preview_sample', stripeSessionId: 'cs_preview_sample', paidAt: new Date(now - 3 * 86400000).toISOString(), createdAt: new Date(now - 3 * 86400000).toISOString(), digitalAccessIds: ['PVSAMPL1ORDER_preview-demo-discernment-guide'], ownerActions: [] },
      { id: 'PVSAMPL2ORDER', preview: true, uid: 'demo-member-2', email: 'second.sample@example.com', customerName: 'Preview Sample 2', status: 'paid', paymentStatus: 'paid', amountPaid: 24, subtotalCents: 2400, discountCents: 0, totalCents: 2400, items: [{ productId: 'concealed', title: 'Concealed', type: 'digital', unitPriceCents: 2400, quantity: 1, discountCents: 0, paidCents: 2400 }], paymentIntentId: 'pi_preview_sample2', stripeSessionId: 'cs_preview_sample2', reviewFlags: ['missing-file:concealed'], paidAt: new Date(now - 86400000).toISOString(), createdAt: new Date(now - 86400000).toISOString(), digitalAccessIds: ['PVSAMPL2ORDER_concealed'], ownerActions: [] }
    ];
    const access = [
      { id: 'PVSAMPL1ORDER_preview-demo-discernment-guide', preview: true, orderId: 'PVSAMPL1ORDER', uid: 'demo-member', email: 'sample.customer@example.com', productId: 'preview-demo-discernment-guide', productTitle: 'Discernment Study Guide', amountPaidCents: 2160, paymentStatus: 'paid', accessStatus: 'active', downloadCount: 2, purchasedAt: orders[0].paidAt, stripeSessionId: 'cs_preview_sample' },
      { id: 'PVSAMPL2ORDER_concealed', preview: true, orderId: 'PVSAMPL2ORDER', uid: 'demo-member-2', email: 'second.sample@example.com', productId: 'concealed', productTitle: 'Concealed', amountPaidCents: 2400, paymentStatus: 'paid', accessStatus: 'pending_delivery', downloadCount: 0, purchasedAt: orders[1].paidAt, stripeSessionId: 'cs_preview_sample2' }
    ];
    return { orders, access };
  }

  /* ---------- loading ---------- */
  async function load(force = false){
    if(state.loaded && !force) return;
    if(state.loading && !force) return state.loading;
    state.loading = (async () => {
      state.message = '';
      if(DEMO_MODE){
        const sample = demoData();
        state.orders = sample.orders; state.access = sample.access;
        state.files = (library.getFileState && library.getFileState()) || {};
        state.codes = storageGet(DEMO_SHOP_DISCOUNTS_KEY, []).map(c => ({ id: c.id || c.code, ...c }));
        state.audit = [];
        state.status = { stripeMode: 'preview', emailConnected: false, sandboxTesterCount: 0 };
      } else {
        const { collection, getDocs, query, orderBy, limit } = firestore;
        try {
          const [orderSnap, accessSnap, fileSnap, codeSnap, auditSnap] = await Promise.all([
            getDocs(collection(db, 'shopOrders')),
            getDocs(collection(db, 'digitalAccess')),
            getDocs(collection(db, 'shopDigitalFiles')),
            getDocs(collection(db, 'discountCodes')),
            getDocs(query(collection(db, 'shopAuditLog'), orderBy('at', 'desc'), limit(40))).catch(() => ({ forEach(){} }))
          ]);
          state.orders = []; orderSnap.forEach(d => state.orders.push({ id: d.id, ...d.data() }));
          state.access = []; accessSnap.forEach(d => state.access.push({ id: d.id, ...d.data() }));
          state.files = {}; fileSnap.forEach(d => { state.files[d.id] = d.data(); });
          state.codes = []; codeSnap.forEach(d => { const c = d.data(); if(c.scope === 'shop') state.codes.push({ id: d.id, ...c }); });
          state.audit = []; auditSnap.forEach(d => state.audit.push({ id: d.id, ...d.data() }));
        } catch (err) {
          console.error('[resources-shop] load failed', err);
          state.message = 'Some Shop records could not be loaded. Please refresh.';
        }
        call('shopStoreStatus')({}).then(r => { state.status = r.data || null; if(!el('ownerShopSettings')?.closest('[hidden]')) renderSettings(); renderModeBar(); })
          .catch(() => { state.status = { stripeMode: 'unknown' }; });
      }
      state.orders.sort((a, b) => (toDate(b.paidAt || b.createdAt) || 0) - (toDate(a.paidAt || a.createdAt) || 0));
      state.loaded = true;
      state.loading = null;
      // Owner Portal header/sidebar badges recompute from these records.
      if(onAlertsChanged) try { onAlertsChanged(); } catch (err) { /* badges refresh on next load */ }
    })();
    return state.loading;
  }
  async function reload(){
    await load(true);
    if(library.reloadOwner) await library.reloadOwner();
    renderAll();
  }

  /* ---------- mode bar (Live / Test records) ---------- */
  function renderModeBar(){
    const bar = el('ownerStoreModeBar'); if(!bar) return;
    const testCount = state.orders.filter(isTest).length;
    const keyMode = state.status && state.status.stripeMode;
    bar.innerHTML = `<div class="rs-mode-switch" role="group" aria-label="Which records to show">
        <button type="button" class="rs-mode-btn${state.mode === 'live' ? ' active' : ''}" data-rs-mode="live" aria-pressed="${state.mode === 'live'}">Live records</button>
        <button type="button" class="rs-mode-btn${state.mode === 'test' ? ' active' : ''}" data-rs-mode="test" aria-pressed="${state.mode === 'test'}">Test records${testCount ? ' (' + testCount + ')' : ''}</button>
      </div>
      <p class="rs-mode-note">${state.mode === 'test'
        ? '<strong>Test mode view.</strong> Sandbox purchases made with Stripe test cards. No real money moved; these never count toward live totals.'
        : 'Showing real customers and real payments only. Test purchases are kept separately.'}${keyMode === 'test' ? ' Payment keys loaded: <strong>Stripe test</strong>.' : keyMode === 'live' ? ' Payment keys loaded: <strong>Stripe live</strong>.' : ''}${DEMO_MODE ? ' <span class="dl-preview-flag">Preview build — sample records only.</span>' : ''}</p>`;
  }

  /* ---------- alerts ---------- */
  function computeAlerts(){
    const alerts = [];
    const live = state.mode === 'live';
    const access = state.access.filter(inMode);
    const orders = state.orders.filter(inMode);
    const byProduct = list => list.reduce((m, a) => { (m[a.productId] = m[a.productId] || []).push(a); return m; }, {});

    const missingFile = byProduct(access.filter(a => a.accessStatus === 'pending_delivery' && a.paymentStatus === 'paid' && !hasFile(a.productId)));
    Object.entries(missingFile).forEach(([pid, list]) => alerts.push({ level: 'urgent', key: 'missing-file-' + pid,
      title: list.length + ' paid ' + (list.length === 1 ? 'order is' : 'orders are') + ' waiting on the PDF for “' + productTitle(pid) + '”',
      detail: 'The customer paid but there is no file to deliver. Upload the PDF — waiting orders unlock automatically once it is attached.',
      action: 'Upload PDF', go: 'files' }));

    const waiting = access.filter(a => a.accessStatus === 'pending_delivery' && a.paymentStatus === 'paid' && hasFile(a.productId));
    if(waiting.length) alerts.push({ level: 'urgent', key: 'waiting',
      title: waiting.length + ' paid ' + (waiting.length === 1 ? 'customer is' : 'customers are') + ' waiting for you to give access',
      detail: 'Automatic delivery is off for ' + [...new Set(waiting.map(a => productTitle(a.productId)))].join(', ') + '.', action: 'Review Orders', go: 'orders', filter: 'attention' });

    const dupes = orders.filter(o => (o.reviewFlags || []).some(f => f.startsWith('duplicate-purchase:')));
    if(dupes.length) alerts.push({ level: 'urgent', key: 'dupes',
      title: dupes.length + ' possible duplicate ' + (dupes.length === 1 ? 'purchase' : 'purchases'),
      detail: 'A customer paid for a resource they already owned. Review and refund if appropriate.', action: 'Review Orders', go: 'orders', filter: 'attention' });

    const noAccess = orders.filter(o => o.paymentStatus === 'paid' && (o.items || []).some(i => i.type === 'digital') && !orderAccess(o).length);
    if(noAccess.length) alerts.push({ level: 'urgent', key: 'no-access',
      title: noAccess.length + ' paid ' + (noAccess.length === 1 ? 'order has' : 'orders have') + ' no download record',
      detail: 'Payment is recorded but no library entry exists. Give access from Customers, or check the webhook.', action: 'Review Orders', go: 'orders', filter: 'attention' });

    const refundStuck = orders.filter(o => o.refundRequestedAt && o.paymentStatus === 'paid' && (Date.now() - (toDate(o.refundRequestedAt) || new Date()).getTime()) > 30 * 60000);
    if(refundStuck.length) alerts.push({ level: 'warning', key: 'refund-stuck',
      title: refundStuck.length + ' refund ' + (refundStuck.length === 1 ? 'request has' : 'requests have') + ' not been confirmed by Stripe yet',
      detail: 'Check the refund in the Stripe Dashboard and that the webhook is receiving charge.refunded.', action: 'Review Orders', go: 'orders', filter: 'attention' });

    const stale = orders.filter(o => o.status === 'pending_payment' && (Date.now() - (toDate(o.createdAt) || new Date()).getTime()) > 2 * 3600000);
    if(stale.length) alerts.push({ level: 'warning', key: 'stale',
      title: stale.length + ' checkout' + (stale.length === 1 ? '' : 's') + ' never closed',
      detail: 'Stripe normally closes an unpaid checkout after 30 minutes. If this keeps growing, check that the webhook endpoint is receiving checkout.session.expired.', action: 'View Orders', go: 'orders', filter: 'pending' });

    if(live){
      products().filter(p => p.type === 'digital' && p.status === 'published' && !p.isPlaceholder && !hasFile(p.id)).forEach(p => alerts.push({ level: 'warning', key: 'nofile-' + p.id,
        title: '“' + p.title + '” is Active but has no PDF', detail: 'Customers can’t buy it until a file is attached.', action: 'Upload PDF', go: 'files' }));
      products().filter(p => p.status !== 'archived' && !p.isPlaceholder && !RETIRED_TEST_PRODUCT_IDS.includes(p.id)).forEach(p => {
        // An Active product with no PDF already has its own alert above.
        const missing = missingProductInputs(p, p.type === 'digital' ? hasFile(p.id) : undefined).filter(m => !(m === 'PDF' && p.status === 'published'));
        if(missing.length) alerts.push({ level: 'info', key: 'input-' + p.id, title: '“' + p.title + '” needs your input', detail: 'Missing: ' + missing.join(', ') + '.', action: 'Edit Product', edit: p.id });
      });
      const retired = products().filter(p => RETIRED_TEST_PRODUCT_IDS.includes(p.id) && p.status !== 'archived');
      if(retired.length) alerts.push({ level: 'info', key: 'retired', title: retired.length + ' old sandbox test ' + (retired.length === 1 ? 'product is' : 'products are') + ' not archived',
        detail: retired.map(p => p.title).join(', ') + ' — hidden from the public Shop by code. Archive them in Products.', action: 'Open Products', go: 'products' });
    }
    const today = easternToday();
    const soon = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
    state.codes.filter(c => (c.testOnly === true) === !live).forEach(c => {
      if(c.active === false) return;
      const problem = shopDiscountProblem(c, today);
      if(/usage limit/.test(problem)) alerts.push({ level: 'info', key: 'code-used-' + c.id, title: 'Discount ' + c.code + ' has used all its uses', detail: 'Raise the limit or pause it.', action: 'Open Discounts', go: 'discounts' });
      else if(!problem && c.expiresAt && c.expiresAt <= soon) alerts.push({ level: 'info', key: 'code-exp-' + c.id, title: 'Discount ' + c.code + ' ends ' + c.expiresAt, detail: 'Extend the end date if it should keep working.', action: 'Open Discounts', go: 'discounts' });
    });
    const store = shop.getStore();
    if(store.purchasesPaused) alerts.push({ level: 'warning', key: 'paused', title: 'New purchases are paused', detail: 'Customers keep their existing downloads. Resume in Store Settings.', action: 'Store Settings', go: 'settings' });
    if(live && !publicPaymentsEnabled) alerts.push({ level: 'info', key: 'payments-off', title: 'Public checkout is off', detail: 'The public Shop shows “Purchases Coming Soon”. Turning on real payments is a separate, approved step (live Stripe keys + webhook).', action: 'Store Settings', go: 'settings' });
    return alerts;
  }
  function alertHtml(a){
    const attrs = a.edit ? `data-rs-edit="${esc(a.edit)}"` : `data-rs-go="${esc(a.go)}"${a.filter ? ` data-rs-filter="${esc(a.filter)}"` : ''}`;
    return `<article class="rs-alert rs-alert-${a.level}" data-rs-alert="${esc(a.key)}"><div><strong>${esc(a.title)}</strong><p>${esc(a.detail)}</p></div><button type="button" class="admin-btn-ghost" ${attrs}>${esc(a.action)}</button></article>`;
  }

  /* ---------- overview ---------- */
  function renderOverview(){
    renderModeBar();
    const wrap = el('ownerStoreOverview'); if(!wrap) return;
    if(!state.loaded){ wrap.innerHTML = '<p class="admin-hint">Loading the Resources Shop…</p>'; void load().then(renderOverview); return; }
    const all = products();
    const count = s => all.filter(p => p.status === s).length;
    const since = Date.now() - 30 * 86400000;
    const recent = state.orders.filter(o => inMode(o) && isPaid(o) && (toDate(o.paidAt) || new Date(0)).getTime() >= since);
    const net = recent.reduce((sum, o) => sum + paidCents(o) - refundedCents(o), 0);
    const alerts = computeAlerts();
    const urgent = alerts.filter(a => a.level !== 'info').length;
    wrap.innerHTML = `${state.message ? `<p class="admin-hint">${esc(state.message)}</p>` : ''}
      <div class="admin-stat-row store-stat-row rs-stat-row">
        <div class="admin-stat-tile"><span>Active</span><strong>${count('published')}</strong></div>
        <div class="admin-stat-tile"><span>Drafts</span><strong>${count('draft')}</strong></div>
        <div class="admin-stat-tile"><span>Paid Orders · 30 Days</span><strong>${recent.length}</strong></div>
        <div class="admin-stat-tile"><span>Net Sales · 30 Days</span><strong>${money(net)}</strong></div>
        <div class="admin-stat-tile"><span>Needs Attention</span><strong>${urgent}</strong></div>
      </div>
      <div class="rs-section-head"><h4>What needs you</h4><button type="button" class="admin-btn-ghost" data-rs-refresh>Refresh</button></div>
      ${alerts.length ? `<div class="rs-alerts">${alerts.map(alertHtml).join('')}</div>` : '<div class="rs-empty"><strong>Nothing needs your attention.</strong><p>Paid orders, files and access all line up.</p></div>'}
      <p class="admin-hint">Every number here is recalculated from the order records when this page opens.</p>`;
  }

  /* ---------- orders ---------- */
  function orderNeedsAttention(o){
    if((o.reviewFlags || []).length) return true;
    if(o.paymentStatus === 'paid' && orderAccess(o).some(a => a.accessStatus === 'pending_delivery')) return true;
    if(o.paymentStatus === 'paid' && (o.items || []).some(i => i.type === 'digital') && !orderAccess(o).length) return true;
    return !!(o.refundRequestedAt && o.paymentStatus === 'paid');
  }
  function filteredOrders(){
    const q = state.orderSearch.trim().toLowerCase();
    return state.orders.filter(inMode).filter(o => {
      if(state.orderFilter === 'paid' && o.paymentStatus !== 'paid') return false;
      if(state.orderFilter === 'pending' && o.status !== 'pending_payment') return false;
      if(state.orderFilter === 'refunded' && !['refunded', 'partially_refunded'].includes(o.paymentStatus)) return false;
      if(state.orderFilter === 'closed' && !['expired', 'cancelled'].includes(o.status)) return false;
      if(state.orderFilter === 'attention' && !orderNeedsAttention(o)) return false;
      if(!q) return true;
      return [orderNumber(o.id), o.id, o.email, o.customerName, o.discountCode, ...(o.items || []).map(i => i.title)].filter(Boolean).join(' ').toLowerCase().includes(q);
    });
  }
  function flagLabel(flag){
    const [kind, pid] = flag.split(':');
    if(kind === 'missing-file') return 'Paid before a PDF was attached for ' + productTitle(pid);
    if(kind === 'duplicate-purchase') return 'Customer already owned ' + productTitle(pid) + ' — possible duplicate';
    return flag;
  }
  function auditTrailHtml(o, accessList){
    const entries = [
      ...(o.ownerActions || []).map(e => ({ ...e, where: 'Order' })),
      ...accessList.flatMap(a => (a.ownerActions || []).map(e => ({ ...e, where: a.productTitle || 'Access' })))
    ].sort((a, b) => String(b.at).localeCompare(String(a.at)));
    if(!entries.length) return '';
    const label = e => ({ refund: 'Refund issued' + (e.amountCents ? ' · ' + money(e.amountCents) : ''), grant: 'Access given', revoke: 'Access turned off', refunded: 'Closed as refunded', resend: 'Access email requested', note: 'Note', 'resolve-flag': 'Alert resolved', 'grant-new': 'Complimentary access given' })[e.action] || e.action;
    return `<details class="rs-audit"><summary>Audit trail (${entries.length})</summary><ul>${entries.map(e => `<li><span>${esc(dateTime(e.at))}</span><strong>${esc(label(e))}</strong><em>${esc(e.where)}</em>${e.note ? `<q>${esc(e.note)}</q>` : ''}</li>`).join('')}</ul></details>`;
  }
  function orderCardHtml(o){
    const accessList = orderAccess(o);
    const refundable = ['paid', 'partially_refunded'].includes(o.paymentStatus) && o.paymentIntentId && remainingCents(o) > 0;
    const items = (o.items || []).map(i => {
      const a = accessList.find(x => x.productId === i.productId);
      const accessActions = a ? [
        a.accessStatus !== 'active' && a.accessStatus !== 'refunded' && ['paid', 'complimentary'].includes(a.paymentStatus) ? `<button type="button" class="admin-btn-ghost rs-small" data-rs-access="grant" data-rs-id="${esc(a.id)}">Give Access</button>` : '',
        a.accessStatus === 'active' || a.accessStatus === 'pending_delivery' ? `<button type="button" class="admin-btn-ghost rs-small" data-rs-access="revoke" data-rs-id="${esc(a.id)}">Turn Off Access</button>` : ''
      ].join('') : '';
      return `<li class="rs-order-item"><div><strong>${esc(i.title)}${i.quantity > 1 ? ' × ' + Number(i.quantity) : ''}</strong><span>${esc(money((Number(i.unitPriceCents) || 0) * (Number(i.quantity) || 1)))}${i.discountCents ? ' − ' + esc(money(i.discountCents)) + ' discount' : ''} = ${esc(money(itemPaidCents(i)))} paid</span></div>
        <div class="rs-order-item-access">${i.type === 'digital'
          ? (a ? pill(ACCESS_LABELS[a.accessStatus] || a.accessStatus, accessTone(a.accessStatus)) + (a.accessStatus === 'pending_delivery' && !hasFile(i.productId) ? '<small>No PDF attached yet</small>' : '') + `<small>${Number(a.downloadCount) || 0} download${Number(a.downloadCount) === 1 ? '' : 's'}</small>` : (isPaid(o) ? pill('No access record', 'cancelled') : '<small>Unlocks after payment</small>'))
          : pill(o.fulfillmentStatus === 'unfulfilled' ? 'To ship' : (o.fulfillmentStatus || 'Physical'), 'pending')}${accessActions}</div></li>`;
    }).join('');
    return `<article class="rs-order" data-rs-order="${esc(o.id)}">
      <header class="rs-order-head">
        <div><strong>${esc(orderNumber(o.id))}</strong>${isTest(o) ? ' ' + pill('Test payment', 'pending') : ''}${o.preview ? ' ' + pill('Preview sample', 'pending') : ''}<span>${esc(o.customerName ? o.customerName + ' · ' : '')}${esc(o.email || 'No email')}</span><span>${esc(dateTime(o.paidAt || o.createdAt))}</span></div>
        <div class="rs-order-pills">${pill(PAYMENT_LABELS[o.paymentStatus] || o.paymentStatus || 'Unknown', paymentTone(o.paymentStatus))}${o.status === 'expired' ? pill('Checkout closed', 'draft') : ''}${o.freeWithDiscount ? pill('Free with code', 'draft') : ''}</div>
      </header>
      <ul class="rs-order-items">${items}</ul>
      <dl class="rs-order-totals">
        <div><dt>Subtotal</dt><dd>${esc(money(o.subtotalCents))}</dd></div>
        ${o.discountCents ? `<div><dt>Discount${o.discountCode ? ' · ' + esc(o.discountCode) : ''}</dt><dd>−${esc(money(o.discountCents))}</dd></div>` : ''}
        <div><dt>${isPaid(o) ? 'Charged' : 'Total'}</dt><dd>${esc(isPaid(o) ? money(paidCents(o)) : money(o.totalCents ?? o.subtotalCents))}</dd></div>
        ${refundedCents(o) ? `<div><dt>Refunded</dt><dd>−${esc(money(refundedCents(o)))}</dd></div>` : ''}
        ${o.paymentIntentId ? `<div><dt>Stripe ref.</dt><dd>…${esc(String(o.paymentIntentId).slice(-8))}</dd></div>` : ''}
      </dl>
      ${(o.reviewFlags || []).map(f => `<div class="rs-flag"><span>${esc(flagLabel(f))}</span><button type="button" class="admin-btn-ghost rs-small" data-rs-resolve="${esc(f)}">Mark Resolved</button></div>`).join('')}
      ${o.refundRequestedAt && o.paymentStatus === 'paid' ? `<p class="rs-flag"><span>Refund requested ${esc(dateTime(o.refundRequestedAt))} — waiting for Stripe to confirm.</span></p>` : ''}
      <div class="rs-order-actions">
        ${refundable ? `<button type="button" class="admin-btn-ghost" data-rs-refund="${esc(o.id)}">Issue Refund…</button>` : ''}
        <button type="button" class="admin-btn-ghost" data-rs-note="${esc(o.id)}">Add Note</button>
      </div>
      <p class="dl-message" role="status" aria-live="polite"></p>
      ${auditTrailHtml(o, accessList)}
    </article>`;
  }
  function renderOrders(){
    const wrap = el('ownerShopOrders'); if(!wrap) return;
    if(!state.loaded){ wrap.innerHTML = '<p class="admin-hint">Loading orders…</p>'; void load().then(renderOrders); return; }
    const list = filteredOrders();
    const filters = [['all', 'All'], ['attention', 'Needs attention'], ['paid', 'Paid'], ['pending', 'Payment pending'], ['refunded', 'Refunded'], ['closed', 'Not completed']];
    wrap.innerHTML = `<div class="store-products-head"><div><h4>Orders</h4><p>Each order keeps the prices it was sold at. Payment status comes only from verified Stripe events; download permission is shown separately for every item.</p></div><button type="button" class="admin-btn-ghost" data-rs-export>Export CSV</button></div>
      <div class="rs-toolbar">
        <div class="rs-chips" role="group" aria-label="Filter orders">${filters.map(([id, label]) => `<button type="button" class="rs-chip${state.orderFilter === id ? ' active' : ''}" data-rs-order-filter="${id}">${esc(label)}</button>`).join('')}</div>
        <label class="rs-search"><span class="store-visually-hidden">Search orders</span><input type="search" id="rsOrderSearch" placeholder="Search name, email, order, product, code" value="${esc(state.orderSearch)}" /></label>
      </div>
      ${list.length ? list.slice(0, state.orderLimit).map(orderCardHtml).join('') : `<div class="rs-empty"><strong>No ${state.mode === 'test' ? 'test ' : ''}orders here.</strong><p>Orders appear as soon as a customer opens secure checkout.</p></div>`}
      ${list.length > state.orderLimit ? `<button type="button" class="admin-btn-ghost" data-rs-more>Show more (${list.length - state.orderLimit})</button>` : ''}`;
  }

  /* refund dialog — the consequential action, so it is explicit */
  function openRefund(orderId){
    const o = state.orders.find(x => x.id === orderId); if(!o) return;
    let dialog = el('rsRefundDialog');
    if(!dialog){
      dialog = document.createElement('dialog');
      dialog.id = 'rsRefundDialog'; dialog.className = 'rs-dialog';
      dialog.setAttribute('aria-labelledby', 'rsRefundTitle');
      document.body.appendChild(dialog);
    }
    const amount = remainingCents(o);
    dialog.innerHTML = `<form method="dialog" id="rsRefundForm">
      <span class="portal-label">Confirm Refund</span>
      <h3 id="rsRefundTitle">Refund ${esc(money(amount))} to ${esc(o.customerName || o.email || 'this customer')}?</h3>
      <p>Order ${esc(orderNumber(o.id))} · ${esc((o.items || []).map(i => i.title).join(', '))}</p>
      <ul class="rs-dialog-list"><li>Stripe returns ${esc(money(amount))} to the original payment method.${isTest(o) ? ' <strong>Test payment — no real money moves.</strong>' : ''}</li><li>When Stripe confirms, the order is marked Refunded and the download closes.</li><li>This can’t be undone.</li></ul>
      <label class="booking-field"><span>Reason (saved in the audit trail)</span><input id="rsRefundNote" maxlength="300" /></label>
      <label class="admin-checkbox-field"><input type="checkbox" id="rsRefundConfirm" required /> I understand this returns the money and closes this customer’s download.</label>
      <p class="dl-message" id="rsRefundMessage" role="status" aria-live="polite"></p>
      <div class="rs-dialog-actions"><button type="button" class="admin-btn-ghost" value="cancel" id="rsRefundCancel">Cancel</button><button type="submit" class="admin-btn-solid" id="rsRefundSubmit" disabled>Issue Refund</button></div>
    </form>`;
    const confirmBox = el('rsRefundConfirm');
    confirmBox.addEventListener('change', () => { el('rsRefundSubmit').disabled = !confirmBox.checked; });
    el('rsRefundCancel').addEventListener('click', () => dialog.close());
    el('rsRefundForm').addEventListener('submit', async event => {
      event.preventDefault();
      if(!confirmBox.checked) return;
      const msg = el('rsRefundMessage');
      if(DEMO_MODE || o.preview){ msg.textContent = 'Preview only — on the live site this asks Stripe to refund ' + money(amount) + '.'; return; }
      el('rsRefundSubmit').disabled = true;
      msg.textContent = 'Asking Stripe to refund…';
      try {
        const r = await call('manageShopOrder')({ action: 'refund', orderId: o.id, expectedAmountCents: amount, confirmed: true, note: el('rsRefundNote').value });
        msg.textContent = 'Refund ' + ((r.data && r.data.status) || 'requested') + '. The order updates when Stripe confirms.';
        await reload();
        setTimeout(() => dialog.close(), 1200);
      } catch (err) { msg.textContent = friendlyError(err); el('rsRefundSubmit').disabled = false; }
    });
    dialog.showModal();
  }
  async function orderAction(orderId, payload, row){
    const msg = row ? row.querySelector('.dl-message') : null;
    if(DEMO_MODE){ setMsg(msg, 'Preview only — on the live site this is saved to the order and the audit trail.'); return; }
    setMsg(msg, 'Saving…');
    try { await call('manageShopOrder')({ orderId, ...payload }); await reload(); }
    catch (err) { setMsg(msg, friendlyError(err)); }
  }
  async function accessAction(action, accessId, row){
    const msg = row ? row.querySelector('.dl-message') : null;
    if(!window.confirm(action === 'revoke' ? 'Turn off download access for this item? The customer will see “Access Unavailable”. This is recorded in the audit trail.' : 'Give this customer download access? This is recorded in the audit trail.')) return;
    const note = window.prompt('Reason (saved in the audit trail, optional):', '') || '';
    if(DEMO_MODE){ setMsg(msg, 'Preview only — on the live site this ' + (action === 'revoke' ? 'turns access off' : 'gives access') + ' on the server.'); return; }
    setMsg(msg, 'Saving…');
    try { await call('manageDigitalAccess')({ action, accessId, note }); await reload(); }
    catch (err) { setMsg(msg, friendlyError(err)); }
  }
  function exportCsv(){
    const rows = [['Order', 'Date', 'Customer', 'Email', 'Items', 'Subtotal', 'Discount', 'Code', 'Charged', 'Refunded', 'Payment', 'Mode']];
    filteredOrders().forEach(o => rows.push([orderNumber(o.id), shortDate(o.paidAt || o.createdAt), o.customerName || '', o.email || '', (o.items || []).map(i => i.title + (i.quantity > 1 ? ' x' + i.quantity : '')).join('; '),
      ((o.subtotalCents || 0) / 100).toFixed(2), ((o.discountCents || 0) / 100).toFixed(2), o.discountCode || '', isPaid(o) ? (paidCents(o) / 100).toFixed(2) : '0.00', (refundedCents(o) / 100).toFixed(2), PAYMENT_LABELS[o.paymentStatus] || o.paymentStatus || '', isTest(o) ? 'test' : 'live']));
    const csv = rows.map(r => r.map(v => '"' + String(v).replace(/"/g, '""') + '"').join(',')).join('\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    const a = document.createElement('a');
    a.href = url; a.download = 'resources-shop-orders-' + state.mode + '-' + easternToday() + '.csv';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  /* ---------- customers ---------- */
  function customers(){
    const map = new Map();
    const keyOf = r => r.uid || (r.email ? 'email:' + String(r.email).toLowerCase() : null);
    const entry = (r) => {
      const key = keyOf(r); if(!key) return null;
      if(!map.has(key)) map.set(key, { key, uid: r.uid || null, email: r.email || '', name: '', orders: [], access: [], last: 0 });
      const c = map.get(key);
      if(!c.email && r.email) c.email = r.email;
      return c;
    };
    state.orders.filter(inMode).filter(o => isPaid(o) || o.status === 'pending_payment').forEach(o => {
      const c = entry(o); if(!c) return;
      c.orders.push(o); if(o.customerName) c.name = o.customerName;
      c.last = Math.max(c.last, (toDate(o.paidAt || o.createdAt) || new Date(0)).getTime());
    });
    state.access.filter(a => a.paymentStatus === 'complimentary' ? state.mode === 'live' : inMode(a)).forEach(a => {
      const c = entry(a); if(!c) return;
      c.access.push(a); c.last = Math.max(c.last, (toDate(a.purchasedAt) || new Date(0)).getTime());
    });
    return [...map.values()].sort((a, b) => b.last - a.last);
  }
  function renderCustomers(){
    const wrap = el('ownerShopCustomers'); if(!wrap) return;
    if(!state.loaded){ wrap.innerHTML = '<p class="admin-hint">Loading customers…</p>'; void load().then(renderCustomers); return; }
    const list = customers();
    wrap.innerHTML = `<div class="store-products-head"><div><h4>Customers</h4><p>Everyone who has bought or been given a resource, with what they paid and what they can download right now.</p></div></div>
      ${list.length ? list.map(c => {
        const paid = c.orders.filter(isPaid);
        const spent = paid.reduce((s, o) => s + paidCents(o) - refundedCents(o), 0);
        const issues = c.access.filter(a => a.accessStatus !== 'active').length;
        const open = state.openCustomer === c.key;
        return `<article class="rs-customer" data-rs-customer="${esc(c.key)}">
          <button type="button" class="rs-customer-head" data-rs-customer-toggle="${esc(c.key)}" aria-expanded="${open}">
            <span><strong>${esc(c.name || c.email || 'Member')}</strong><small>${esc(c.name ? c.email : '')}</small></span>
            <span>${paid.length} paid order${paid.length === 1 ? '' : 's'}</span><span>${esc(money(spent))} net</span>
            <span>${c.access.length} in library${issues ? ' · ' + issues + ' unavailable' : ''}</span>
          </button>
          ${open ? `<div class="rs-customer-body">
            ${c.access.length ? `<ul class="rs-order-items">${c.access.map(a => `<li class="rs-order-item"><div><strong>${esc(a.productTitle || productTitle(a.productId))}</strong><span>${esc(a.orderId ? orderNumber(a.orderId) : 'Complimentary')} · ${esc(shortDate(a.purchasedAt))} · ${esc(PAYMENT_LABELS[a.paymentStatus] || a.paymentStatus || '')}</span></div><div class="rs-order-item-access">${pill(ACCESS_LABELS[a.accessStatus] || a.accessStatus, accessTone(a.accessStatus))}<small>${Number(a.downloadCount) || 0} downloads${a.lastDownloadAt ? ' · last ' + esc(shortDate(a.lastDownloadAt)) : ''}</small>
              ${a.accessStatus !== 'active' && a.accessStatus !== 'refunded' && ['paid', 'complimentary'].includes(a.paymentStatus) ? `<button type="button" class="admin-btn-ghost rs-small" data-rs-access="grant" data-rs-id="${esc(a.id)}">Give Access</button>` : ''}
              ${a.accessStatus === 'active' || a.accessStatus === 'pending_delivery' ? `<button type="button" class="admin-btn-ghost rs-small" data-rs-access="revoke" data-rs-id="${esc(a.id)}">Turn Off Access</button>` : ''}</div></li>`).join('')}</ul>` : '<p class="admin-hint">No library items.</p>'}
            ${c.email ? `<button type="button" class="admin-btn-ghost" data-rs-customer-orders="${esc(c.email)}">View Their Orders</button>` : ''}
            <p class="dl-message" role="status" aria-live="polite"></p>
          </div>` : ''}
        </article>`;
      }).join('') : `<div class="rs-empty"><strong>No ${state.mode === 'test' ? 'test ' : ''}customers yet.</strong><p>Customers appear here after their first checkout. To give someone a complimentary copy, use Orders → Download Access.</p></div>`}`;
  }

  /* ---------- collections ---------- */
  function collectionList(){
    const store = shop.getStore();
    const defined = (store.collections || []).map(c => ({ ...c, defined: true }));
    const names = new Set(defined.map(c => c.name));
    products().forEach(p => { if(p.collection && !names.has(p.collection)){ names.add(p.collection); defined.push({ name: p.collection, description: '', visible: true, defined: false }); } });
    return defined;
  }
  async function saveCollections(list, msg){
    setMsg(msg, 'Saving…');
    try {
      await shop.saveStore({ ...shop.getStore(), collections: list.map(({ name, description, visible }) => ({ name, description, visible })) });
      setMsg(msg, 'Collections saved.');
      renderCollections();
    } catch (err) { setMsg(msg, 'Could not save collections. Please try again.'); }
  }
  function renderCollections(){
    const wrap = el('ownerShopCollections'); if(!wrap) return;
    const list = collectionList();
    const all = products();
    wrap.innerHTML = `<div class="store-products-head"><div><h4>Collections</h4><p>Group resources (for example a study series). Visible collections with at least one public product appear as filters on the Shop.</p></div></div>
      ${list.length ? list.map((c, i) => {
        const inIt = all.filter(p => p.collection === c.name);
        return `<article class="rs-collection" data-rs-collection="${i}">
          <div class="rs-collection-main"><strong>${esc(c.name)}</strong>${c.defined ? '' : ' ' + pill('Not listed yet', 'pending')}<span>${inIt.filter(p => p.status === 'published').length} active · ${inIt.length} total${c.visible === false ? ' · hidden from the Shop' : ''}</span>${c.description ? `<p>${esc(c.description)}</p>` : ''}</div>
          <div class="rs-collection-actions">
            ${c.defined ? `<button type="button" class="admin-btn-ghost rs-small" data-rs-col="up" data-rs-index="${i}"${i === 0 ? ' disabled' : ''} aria-label="Move ${esc(c.name)} up">↑</button><button type="button" class="admin-btn-ghost rs-small" data-rs-col="down" data-rs-index="${i}" aria-label="Move ${esc(c.name)} down">↓</button><button type="button" class="admin-btn-ghost rs-small" data-rs-col="visible" data-rs-index="${i}">${c.visible === false ? 'Show' : 'Hide'}</button>` : `<button type="button" class="admin-btn-ghost rs-small" data-rs-col="adopt" data-rs-index="${i}">Add To List</button>`}
            <button type="button" class="admin-btn-ghost rs-small" data-rs-col="rename" data-rs-index="${i}">Rename</button>
            <button type="button" class="admin-btn-ghost rs-small" data-rs-col="delete" data-rs-index="${i}">Remove</button>
          </div>
        </article>`;
      }).join('') : '<div class="rs-empty"><strong>No collections yet.</strong><p>Add one below, then choose it on a product.</p></div>'}
      <form class="rs-form" id="rsCollectionForm">
        <span class="portal-label">New Collection</span>
        <div class="booking-grid">
          <div class="booking-field"><label for="rsCollectionName">Name</label><input id="rsCollectionName" maxlength="120" required /></div>
          <div class="booking-field full"><label for="rsCollectionDescription">Short description (optional)</label><input id="rsCollectionDescription" maxlength="600" /></div>
        </div>
        <button type="submit" class="admin-btn-solid">Add Collection</button>
        <p class="dl-message" id="rsCollectionMessage" role="status" aria-live="polite"></p>
      </form>`;
  }
  async function collectionAction(action, index){
    const msg = el('rsCollectionMessage');
    const list = collectionList();
    const c = list[index]; if(!c) return;
    const defined = list.filter(x => x.defined);
    const di = defined.indexOf(c);
    if(action === 'up' && di > 0){ [defined[di - 1], defined[di]] = [defined[di], defined[di - 1]]; return saveCollections(defined, msg); }
    if(action === 'down' && di >= 0 && di < defined.length - 1){ [defined[di + 1], defined[di]] = [defined[di], defined[di + 1]]; return saveCollections(defined, msg); }
    if(action === 'visible'){ c.visible = c.visible === false; return saveCollections(defined, msg); }
    if(action === 'adopt'){ defined.push({ ...c, defined: true }); return saveCollections(defined, msg); }
    if(action === 'rename'){
      const next = (window.prompt('Rename “' + c.name + '” to:', c.name) || '').trim();
      if(!next || next === c.name) return;
      if(list.some(x => x.name === next)){ setMsg(msg, 'A collection with that name already exists.'); return; }
      setMsg(msg, 'Renaming…');
      try {
        const moved = await shop.moveCollection(c.name, next);
        if(c.defined) c.name = next;
        await saveCollections(defined, msg);
        setMsg(msg, 'Renamed. ' + moved + ' product' + (moved === 1 ? '' : 's') + ' updated.');
      } catch (err) { setMsg(msg, 'Could not rename. Please try again.'); }
      return;
    }
    if(action === 'delete'){
      const count = products().filter(p => p.collection === c.name).length;
      if(!window.confirm('Remove the collection “' + c.name + '”?' + (count ? ' ' + count + ' product' + (count === 1 ? '' : 's') + ' will no longer be in a collection. The products themselves are not changed otherwise.' : ''))) return;
      try {
        if(count) await shop.moveCollection(c.name, '');
        await saveCollections(defined.filter(x => x !== c), msg);
      } catch (err) { setMsg(msg, 'Could not remove. Please try again.'); }
    }
  }

  /* ---------- discounts ---------- */
  function codeStatus(c){
    if(c.active === false) return ['Paused', 'draft'];
    const problem = shopDiscountProblem(c, easternToday());
    if(/expired/.test(problem)) return ['Expired', 'cancelled'];
    if(/usage limit/.test(problem)) return ['Used up', 'cancelled'];
    if(/isn’t active yet/.test(problem)) return ['Scheduled', 'pending'];
    return ['Active', 'confirmed'];
  }
  function codeRowHtml(c){
    const [label, tone] = codeStatus(c);
    const scope = Array.isArray(c.productIds) && c.productIds.length ? c.productIds.map(productTitle).join(', ') : 'All products';
    const used = Number(c.usedCount) || 0;
    return `<article class="rs-code" data-rs-code="${esc(c.id)}">
      <div class="rs-code-main"><strong>${esc(c.code)}</strong> ${pill(label, tone)}${c.testOnly ? ' ' + pill('Test only', 'pending') : ''}
        <span>${c.type === 'percent' ? Number(c.amount) + '% off' : money(dollarsToCents(c.amount)) + ' off'} · ${esc(scope)}</span>
        <span>${used} used${c.maxUses !== null && c.maxUses !== undefined && c.maxUses !== '' ? ' of ' + Number(c.maxUses) : ' · no limit'}${c.startsAt ? ' · starts ' + esc(c.startsAt) : ''}${c.expiresAt ? ' · ends ' + esc(c.expiresAt) : ' · no end date'}</span></div>
      <div class="rs-collection-actions">
        <button type="button" class="admin-btn-ghost rs-small" data-rs-code-action="toggle">${c.active === false ? 'Resume' : 'Pause'}</button>
        <button type="button" class="admin-btn-ghost rs-small" data-rs-code-action="edit">Edit</button>
        <button type="button" class="admin-btn-ghost rs-small" data-rs-code-action="delete">Delete</button>
      </div>
    </article>`;
  }
  function renderDiscounts(){
    const wrap = el('ownerShopDiscounts'); if(!wrap) return;
    if(!state.loaded){ wrap.innerHTML = '<p class="admin-hint">Loading discounts…</p>'; void load().then(renderDiscounts); return; }
    const editing = state.editingCode ? state.codes.find(c => c.id === state.editingCode) : null;
    const scoped = editing && Array.isArray(editing.productIds) ? editing.productIds : [];
    const sellable = products().filter(p => !p.isPlaceholder && p.status !== 'archived');
    const codes = [...state.codes].sort((a, b) => String(a.code).localeCompare(String(b.code)));
    wrap.innerHTML = `<div class="store-products-head"><div><h4>Discounts</h4><p>Shop codes are checked and counted on the server at checkout — limits, dates, product scope and pauses can’t be bypassed from a browser. Session and class codes stay in Website Content → Discounts.</p></div></div>
      ${codes.length ? codes.map(codeRowHtml).join('') : '<div class="rs-empty"><strong>No Shop discount codes yet.</strong><p>Create one below.</p></div>'}
      <form class="rs-form" id="rsCodeForm">
        <span class="portal-label">${editing ? 'Edit ' + esc(editing.code) : 'New Discount Code'}</span>
        <div class="booking-grid">
          <div class="booking-field"><label for="rsCode">Code</label><input id="rsCode" maxlength="40" autocomplete="off" value="${esc(editing ? editing.code : '')}"${editing ? ' readonly' : ''} required /></div>
          <div class="booking-field"><label for="rsCodeType">Type</label><select id="rsCodeType"><option value="percent"${!editing || editing.type === 'percent' ? ' selected' : ''}>Percentage off</option><option value="fixed"${editing && editing.type === 'fixed' ? ' selected' : ''}>Fixed amount off ($)</option></select></div>
          <div class="booking-field"><label for="rsCodeAmount">Amount</label><input id="rsCodeAmount" type="number" min="0" step="0.01" value="${editing ? esc(editing.amount) : ''}" required /></div>
          <div class="booking-field"><label for="rsCodeMax">Usage limit</label><input id="rsCodeMax" type="number" min="1" step="1" placeholder="No limit" value="${editing && editing.maxUses !== null && editing.maxUses !== undefined ? esc(editing.maxUses) : ''}" /></div>
          <div class="booking-field"><label for="rsCodeStart">Starts (optional)</label><input id="rsCodeStart" type="date" value="${esc(editing && editing.startsAt || '')}" /></div>
          <div class="booking-field"><label for="rsCodeEnd">Last day (optional)</label><input id="rsCodeEnd" type="date" value="${esc(editing && editing.expiresAt || '')}" /></div>
          <fieldset class="booking-field full rs-scope"><legend>Applies to</legend>
            <label class="admin-checkbox-field"><input type="radio" name="rsCodeScope" value="all"${scoped.length ? '' : ' checked'} /> Every product</label>
            <label class="admin-checkbox-field"><input type="radio" name="rsCodeScope" value="some"${scoped.length ? ' checked' : ''} /> Only these products:</label>
            <div class="rs-scope-list">${sellable.map(p => `<label class="admin-checkbox-field"><input type="checkbox" data-rs-code-product value="${esc(p.id)}"${scoped.includes(p.id) ? ' checked' : ''} /> ${esc(p.title)}</label>`).join('') || '<span class="admin-hint">No products yet.</span>'}</div>
          </fieldset>
          <label class="admin-checkbox-field full"><input type="checkbox" id="rsCodeTest"${editing && editing.testOnly ? ' checked' : ''} /> Test code — only works in the private test sandbox, never with live payments</label>
        </div>
        <div class="rs-form-actions"><button type="submit" class="admin-btn-solid">${editing ? 'Save Changes' : 'Create Code'}</button>${editing ? '<button type="button" class="admin-btn-ghost" data-rs-code-cancel>Cancel</button>' : ''}</div>
        <p class="dl-message" id="rsCodeMessage" role="status" aria-live="polite"></p>
      </form>`;
  }
  function saveDemoCodes(){ storageSet(DEMO_SHOP_DISCOUNTS_KEY, state.codes); }
  async function submitCode(event){
    event.preventDefault();
    const msg = el('rsCodeMessage');
    const code = normalizeDiscountCode(el('rsCode').value);
    const type = el('rsCodeType').value === 'fixed' ? 'fixed' : 'percent';
    const amount = Number(el('rsCodeAmount').value);
    const maxRaw = el('rsCodeMax').value;
    const startsAt = el('rsCodeStart').value || null;
    const expiresAt = el('rsCodeEnd').value || null;
    const some = document.querySelector('input[name="rsCodeScope"]:checked')?.value === 'some';
    const productIds = some ? [...document.querySelectorAll('[data-rs-code-product]:checked')].map(n => n.value) : [];
    if(!/^[A-Z0-9_-]{3,40}$/.test(code)){ setMsg(msg, 'Use 3–40 letters, numbers, dashes or underscores.'); return; }
    if(!(amount > 0) || (type === 'percent' && amount > 100)){ setMsg(msg, type === 'percent' ? 'Enter a percentage between 1 and 100.' : 'Enter an amount above $0.'); return; }
    if(some && !productIds.length){ setMsg(msg, 'Choose at least one product, or choose “Every product”.'); return; }
    if(startsAt && expiresAt && expiresAt < startsAt){ setMsg(msg, 'The last day is before the start date.'); return; }
    const maxUses = maxRaw === '' ? null : Math.max(1, Math.floor(Number(maxRaw)));
    const editing = state.editingCode ? state.codes.find(c => c.id === state.editingCode) : null;
    if(editing && maxUses !== null && maxUses < (Number(editing.usedCount) || 0)){ setMsg(msg, 'It has already been used ' + editing.usedCount + ' times — the limit can’t be lower than that.'); return; }
    const fields = { code, type, amount, productIds, startsAt, expiresAt, maxUses, testOnly: el('rsCodeTest').checked, scope: 'shop' };
    setMsg(msg, 'Saving…');
    try {
      if(DEMO_MODE){
        if(editing) Object.assign(editing, fields);
        else if(state.codes.some(c => c.code === code)){ setMsg(msg, 'That code already exists.'); return; }
        else state.codes.push({ id: code, ...fields, active: true, usedCount: 0, redeemedSourceIds: [] });
        saveDemoCodes();
      } else {
        const id = editing ? editing.id : await hashDiscountCode(code);
        const ref = firestore.doc(db, 'discountCodes', id);
        if(editing){
          await firestore.setDoc(ref, { ...fields, updatedAt: firestore.serverTimestamp() }, { merge: true });
          Object.assign(editing, fields);
        } else {
          const existing = await firestore.getDoc(ref);
          if(existing.exists()){ setMsg(msg, existing.data().scope === 'shop' ? 'That code already exists.' : 'That code is already used for sessions or classes. Choose a different code.'); return; }
          await firestore.setDoc(ref, { ...fields, active: true, usedCount: 0, redeemedSourceIds: [], createdAt: firestore.serverTimestamp() });
          state.codes.push({ id, ...fields, active: true, usedCount: 0 });
        }
      }
      state.editingCode = null;
      renderDiscounts();
      setMsg(el('rsCodeMessage'), (editing ? 'Saved ' : 'Created ') + code + '.');
    } catch (err) { console.error('[resources-shop] code save failed', err); setMsg(msg, 'Could not save this code. Please try again.'); }
  }
  async function codeAction(action, id){
    const c = state.codes.find(x => x.id === id); if(!c) return;
    const msg = el('rsCodeMessage');
    if(action === 'edit'){ state.editingCode = id; renderDiscounts(); el('rsCodeForm')?.scrollIntoView({ behavior: 'smooth', block: 'start' }); return; }
    try {
      if(action === 'toggle'){
        const active = c.active === false;
        if(!DEMO_MODE) await firestore.setDoc(firestore.doc(db, 'discountCodes', id), { active, updatedAt: firestore.serverTimestamp() }, { merge: true });
        c.active = active;
      } else if(action === 'delete'){
        if(!window.confirm('Delete ' + c.code + '? It stops working immediately.' + (Number(c.usedCount) ? ' Past orders keep the discount they received.' : ''))) return;
        if(!DEMO_MODE) await firestore.deleteDoc(firestore.doc(db, 'discountCodes', id));
        state.codes = state.codes.filter(x => x.id !== id);
      }
      if(DEMO_MODE) saveDemoCodes();
      renderDiscounts();
    } catch (err) { setMsg(msg, 'Could not update this code. Please try again.'); }
  }

  /* ---------- reports ---------- */
  function periodStart(){
    if(state.period === 'all') return 0;
    if(state.period === 'ytd') return new Date(new Date().getFullYear(), 0, 1).getTime();
    return Date.now() - Number(state.period) * 86400000;
  }
  function reportData(){
    const start = periodStart();
    const orders = state.orders.filter(inMode).filter(o => isPaid(o) && (toDate(o.paidAt) || new Date(0)).getTime() >= start);
    const gross = orders.reduce((s, o) => s + paidCents(o), 0);
    const refunds = orders.reduce((s, o) => s + refundedCents(o), 0);
    const discounts = orders.reduce((s, o) => s + (Number(o.discountCents) || 0), 0);
    const perProduct = new Map();
    orders.forEach(o => {
      const paid = paidCents(o);
      const share = paid > 0 ? refundedCents(o) / paid : 0;
      (o.items || []).forEach(i => {
        const row = perProduct.get(i.productId) || { productId: i.productId, title: i.title, units: 0, gross: 0, refunded: 0, orders: 0 };
        const cents = itemPaidCents(i);
        row.units += Number(i.quantity) || 1; row.gross += cents; row.refunded += Math.round(cents * share); row.orders += 1;
        perProduct.set(i.productId, row);
      });
    });
    const access = state.access.filter(inMode);
    perProduct.forEach(row => { row.downloads = access.filter(a => a.productId === row.productId).reduce((s, a) => s + (Number(a.downloadCount) || 0), 0); });
    const codes = new Map();
    orders.filter(o => o.discountCode).forEach(o => { const r = codes.get(o.discountCode) || { code: o.discountCode, uses: 0, cents: 0 }; r.uses += 1; r.cents += Number(o.discountCents) || 0; codes.set(o.discountCode, r); });
    const issues = {
      waitingFile: access.filter(a => a.accessStatus === 'pending_delivery' && !hasFile(a.productId)).length,
      waitingOwner: access.filter(a => a.accessStatus === 'pending_delivery' && hasFile(a.productId)).length,
      turnedOff: access.filter(a => a.accessStatus === 'revoked').length,
      refunded: access.filter(a => a.accessStatus === 'refunded').length,
      duplicates: state.orders.filter(inMode).filter(o => (o.reviewFlags || []).some(f => f.startsWith('duplicate'))).length
    };
    return { orders, gross, refunds, net: gross - refunds, discounts, products: [...perProduct.values()].sort((a, b) => b.gross - a.gross), codes: [...codes.values()], issues };
  }
  function renderReports(){
    const wrap = el('ownerShopReports'); if(!wrap) return;
    if(!state.loaded){ wrap.innerHTML = '<p class="admin-hint">Loading reports…</p>'; void load().then(renderReports); return; }
    const r = reportData();
    const avg = r.orders.length ? Math.round(r.gross / r.orders.length) : 0;
    wrap.innerHTML = `<div class="store-products-head"><div><h4>Reports</h4><p>Recalculated from the order records every time — ${state.mode === 'test' ? 'test payments only' : 'real payments only; test payments are excluded'}.</p></div>
        <label class="rs-period"><span>Period</span><select id="rsReportPeriod">${PERIODS.map(([v, l]) => `<option value="${v}"${state.period === v ? ' selected' : ''}>${l}</option>`).join('')}</select></label></div>
      <div class="admin-stat-row store-stat-row rs-stat-row">
        <div class="admin-stat-tile"><span>Gross Sales</span><strong data-rs-metric="gross">${money(r.gross)}</strong></div>
        <div class="admin-stat-tile"><span>Refunds</span><strong data-rs-metric="refunds">${money(r.refunds)}</strong></div>
        <div class="admin-stat-tile"><span>Net Sales</span><strong data-rs-metric="net">${money(r.net)}</strong></div>
        <div class="admin-stat-tile"><span>Paid Orders</span><strong data-rs-metric="orders">${r.orders.length}</strong></div>
        <div class="admin-stat-tile"><span>Average Order</span><strong>${money(avg)}</strong></div>
        <div class="admin-stat-tile"><span>Discounts Given</span><strong>${money(r.discounts)}</strong></div>
      </div>
      <h4 class="rs-h">Product performance</h4>
      ${r.products.length ? `<div class="rs-table-wrap"><table class="rs-table"><thead><tr><th scope="col">Product</th><th scope="col">Sold</th><th scope="col">Gross</th><th scope="col">Refunded</th><th scope="col">Net</th><th scope="col">Downloads</th></tr></thead><tbody>${r.products.map(p => `<tr><th scope="row">${esc(p.title)}</th><td>${p.units}</td><td>${money(p.gross)}</td><td>${money(p.refunded)}</td><td>${money(p.gross - p.refunded)}</td><td>${p.downloads}</td></tr>`).join('')}</tbody></table></div>` : '<p class="admin-hint">No paid orders in this period.</p>'}
      <h4 class="rs-h">Discount codes used</h4>
      ${r.codes.length ? `<div class="rs-table-wrap"><table class="rs-table"><thead><tr><th scope="col">Code</th><th scope="col">Orders</th><th scope="col">Discount given</th></tr></thead><tbody>${r.codes.map(c => `<tr><th scope="row">${esc(c.code)}</th><td>${c.uses}</td><td>${money(c.cents)}</td></tr>`).join('')}</tbody></table></div>` : '<p class="admin-hint">No discounted orders in this period.</p>'}
      <h4 class="rs-h">Access issues (right now)</h4>
      <div class="admin-stat-row store-stat-row rs-stat-row">
        <div class="admin-stat-tile"><span>Paid, No PDF Yet</span><strong>${r.issues.waitingFile}</strong></div>
        <div class="admin-stat-tile"><span>Waiting For You</span><strong>${r.issues.waitingOwner}</strong></div>
        <div class="admin-stat-tile"><span>Turned Off</span><strong>${r.issues.turnedOff}</strong></div>
        <div class="admin-stat-tile"><span>Closed By Refund</span><strong>${r.issues.refunded}</strong></div>
        <div class="admin-stat-tile"><span>Possible Duplicates</span><strong>${r.issues.duplicates}</strong></div>
      </div>
      <p class="admin-hint">Monthly and quarterly PDF reports for the whole ministry are in Reports &amp; Backups.</p>`;
  }

  /* ---------- store settings ---------- */
  function renderSettings(){
    const wrap = el('ownerShopSettings'); if(!wrap) return;
    const store = shop.getStore();
    const s = state.status || {};
    const keyLabel = { live: 'Stripe live keys', test: 'Stripe test keys (sandbox only)', 'not-configured': 'Not configured', preview: 'Preview build — no payments', unknown: 'Could not check' }[s.stripeMode] || 'Checking…';
    wrap.innerHTML = `<div class="store-products-head"><div><h4>Store Settings</h4><p>How purchasing works right now, and the controls that change it.</p></div></div>
      <form class="rs-form rs-settings-card" id="rsPauseForm">
        <span class="portal-label">New Purchases</span>
        <p class="rs-big-status" data-rs-paused="${store.purchasesPaused ? 'true' : 'false'}">${store.purchasesPaused ? 'Paused' : 'Open'}</p>
        <p class="admin-hint">Pausing stops new checkouts on the server. Everyone who already bought keeps their downloads; nothing about past orders changes.</p>
        <div class="booking-field full"><label for="rsPauseMessage">Message customers see while paused (optional)</label><textarea id="rsPauseMessage" rows="2" maxlength="400" placeholder="New purchases are paused right now. Anything you already own is still in My Assembly → Purchases & Downloads.">${esc(store.pausedMessage || '')}</textarea></div>
        <div class="rs-form-actions"><button type="button" class="admin-btn-solid" data-rs-pause="${store.purchasesPaused ? 'resume' : 'pause'}">${store.purchasesPaused ? 'Resume Purchases' : 'Pause New Purchases'}</button><button type="submit" class="admin-btn-ghost">Save Message</button></div>
        <p class="dl-message" id="rsPauseStatus" role="status" aria-live="polite"></p>
      </form>
      <div class="rs-settings-card">
        <span class="portal-label">Payments</span>
        <dl class="rs-facts">
          <div><dt>Public checkout</dt><dd>${publicPaymentsEnabled ? 'On' : 'Off — the public Shop shows “Purchases Coming Soon”'}</dd></div>
          <div><dt>Payment keys loaded</dt><dd>${esc(keyLabel)}</dd></div>
          <div><dt>Payment confirmation</dt><dd>Only verified Stripe webhook events mark orders paid or refunded</dd></div>
          <div><dt>Download links</dt><dd>Private, single-use, expire after 5 minutes</dd></div>
          <div><dt>Access emails</dt><dd>${s.emailConnected ? 'Connected' : 'Not connected yet — Stripe still emails a payment receipt'}</dd></div>
          <div><dt>Taxes &amp; shipping</dt><dd>Not charged. Digital resources only need an account; physical items collect a US address on Stripe.</dd></div>
        </dl>
      </div>
      <div class="rs-settings-card rs-test-card">
        <span class="portal-label">Test Mode</span>
        <p>Test product changes, discounts, purchases, refunds and download access without real money or real customers:</p>
        <ol>
          <li>Mark a product or discount code <strong>Test only</strong> (in its editor). It works only in the private sandbox and never on the public site.</li>
          <li>Open the private sandbox site (a Firebase preview channel). Only you${s.sandboxTesterCount ? ' and ' + Number(s.sandboxTesterCount) + ' named test account' + (s.sandboxTesterCount === 1 ? '' : 's') : ''} can check out there, and only while test keys are loaded.</li>
          <li>Pay with Stripe’s test card <code>4242 4242 4242 4242</code>, any future date, any CVC.</li>
          <li>Switch this page to <strong>Test records</strong> to see those orders, refund them, and turn access on and off. They are never counted in live totals.</li>
        </ol>
        <p class="admin-hint">The sandbox shares the ministry database, so test purchases are real records labeled “Test payment”. Live payments can’t be refunded from test mode, and test payments can’t be refunded once live keys are loaded.</p>
      </div>
      <div class="rs-settings-card">
        <span class="portal-label">Audit Trail</span>
        ${state.audit.length ? `<ul class="rs-audit-list">${state.audit.map(e => `<li><span>${esc(dateTime(e.at))}</span><strong>${esc(({ refund: 'Refund issued', grant: 'Access given', revoke: 'Access turned off', refunded: 'Closed as refunded', 'grant-new': 'Complimentary access', note: 'Note', 'resolve-flag': 'Alert resolved', 'file-uploaded': 'PDF uploaded', 'file-replaced': 'PDF replaced', resend: 'Email requested' })[e.action] || e.action)}</strong><em>${esc(e.orderId ? orderNumber(e.orderId) : e.productId ? productTitle(e.productId) : '')}${e.amountCents ? ' · ' + money(e.amountCents) : ''}${e.testMode ? ' · test' : ''}</em>${e.note ? `<q>${esc(e.note)}</q>` : ''}</li>`).join('')}</ul>` : '<p class="admin-hint">No owner actions recorded yet. Access changes, refunds and file uploads are logged here by the server.</p>'}
      </div>`;
  }
  async function setPaused(paused, message){
    const status = el('rsPauseStatus');
    if(paused !== null && !window.confirm(paused ? 'Pause all new purchases? Existing customers keep their downloads.' : 'Resume purchases? Customers can buy again immediately.')) return;
    setMsg(status, 'Saving…');
    try {
      const store = shop.getStore();
      await shop.saveStore({ ...store, purchasesPaused: paused === null ? store.purchasesPaused : paused, pausedMessage: message });
      renderSettings(); renderOverview();
      setMsg(el('rsPauseStatus'), paused === null ? 'Message saved.' : paused ? 'New purchases are paused.' : 'Purchases are open.');
    } catch (err) { setMsg(status, 'Could not save. Please try again.'); }
  }

  /* ---------- routing + events ---------- */
  function renderTab(tab){
    renderModeBar();
    if(tab === 'overview') renderOverview();
    else if(tab === 'orders') renderOrders();
    else if(tab === 'customers') renderCustomers();
    else if(tab === 'collections') renderCollections();
    else if(tab === 'discounts') renderDiscounts();
    else if(tab === 'reports') renderReports();
    else if(tab === 'settings') renderSettings();
  }
  function renderAll(){
    renderModeBar(); renderOverview(); renderOrders(); renderCustomers(); renderCollections(); renderDiscounts(); renderReports(); renderSettings();
    if(shop.renderOwnerProducts) shop.renderOwnerProducts();
  }

  let wired = false;
  function wire(){
    if(wired) return; wired = true;
    document.addEventListener('click', event => {
      const root = event.target.closest('#ownerStoreRoot'); if(!root) return;
      const t = event.target;
      const mode = t.closest('[data-rs-mode]');
      if(mode){ state.mode = mode.dataset.rsMode; renderAll(); return; }
      const go = t.closest('[data-rs-go]');
      if(go){ if(go.dataset.rsFilter) state.orderFilter = go.dataset.rsFilter; shop.showStoreTab(go.dataset.rsGo); return; }
      const edit = t.closest('[data-rs-edit]');
      if(edit){ shop.openEditor(edit.dataset.rsEdit); return; }
      if(t.closest('[data-rs-refresh]')){ void reload(); return; }
      const f = t.closest('[data-rs-order-filter]');
      if(f){ state.orderFilter = f.dataset.rsOrderFilter; state.orderLimit = 30; renderOrders(); return; }
      if(t.closest('[data-rs-more]')){ state.orderLimit += 30; renderOrders(); return; }
      if(t.closest('[data-rs-export]')){ exportCsv(); return; }
      const refund = t.closest('[data-rs-refund]');
      if(refund){ openRefund(refund.dataset.rsRefund); return; }
      const note = t.closest('[data-rs-note]');
      if(note){ const text = (window.prompt('Note for this order (saved in the audit trail):', '') || '').trim(); if(text) void orderAction(note.dataset.rsNote, { action: 'note', note: text }, note.closest('[data-rs-order]')); return; }
      const resolve = t.closest('[data-rs-resolve]');
      if(resolve){
        const row = resolve.closest('[data-rs-order]');
        if(!window.confirm('Mark this alert resolved? It stays in the audit trail.')) return;
        const text = window.prompt('What did you do? (optional)', '') || '';
        void orderAction(row.dataset.rsOrder, { action: 'resolve-flag', flag: resolve.dataset.rsResolve, note: text }, row); return;
      }
      const access = t.closest('[data-rs-access]');
      if(access){ void accessAction(access.dataset.rsAccess, access.dataset.rsId, access.closest('[data-rs-order], [data-rs-customer]')); return; }
      const toggle = t.closest('[data-rs-customer-toggle]');
      if(toggle){ state.openCustomer = state.openCustomer === toggle.dataset.rsCustomerToggle ? null : toggle.dataset.rsCustomerToggle; renderCustomers(); return; }
      const viewOrders = t.closest('[data-rs-customer-orders]');
      if(viewOrders){ state.orderSearch = viewOrders.dataset.rsCustomerOrders; state.orderFilter = 'all'; shop.showStoreTab('orders'); return; }
      const col = t.closest('[data-rs-col]');
      if(col){ void collectionAction(col.dataset.rsCol, Number(col.dataset.rsIndex)); return; }
      const codeBtn = t.closest('[data-rs-code-action]');
      if(codeBtn){ void codeAction(codeBtn.dataset.rsCodeAction, codeBtn.closest('[data-rs-code]').dataset.rsCode); return; }
      if(t.closest('[data-rs-code-cancel]')){ state.editingCode = null; renderDiscounts(); return; }
      const pause = t.closest('[data-rs-pause]');
      if(pause){ void setPaused(pause.dataset.rsPause === 'pause', el('rsPauseMessage').value); }
    });
    document.addEventListener('input', event => {
      if(event.target.id === 'rsOrderSearch'){
        state.orderSearch = event.target.value;
        clearTimeout(wire.searchTimer);
        wire.searchTimer = setTimeout(() => { renderOrders(); const input = el('rsOrderSearch'); if(input){ input.focus(); input.setSelectionRange(input.value.length, input.value.length); } }, 250);
      }
    });
    document.addEventListener('change', event => {
      if(event.target.id === 'rsReportPeriod'){ state.period = event.target.value; renderReports(); }
    });
    document.addEventListener('submit', event => {
      if(event.target.id === 'rsCodeForm') void submitCode(event);
      else if(event.target.id === 'rsCollectionForm'){
        event.preventDefault();
        const name = el('rsCollectionName').value.trim();
        const msg = el('rsCollectionMessage');
        if(!name){ setMsg(msg, 'Enter a name.'); return; }
        const list = collectionList();
        if(list.some(c => c.name.toLowerCase() === name.toLowerCase())){ setMsg(msg, 'That collection already exists.'); return; }
        void saveCollections([...list.filter(c => c.defined), { name, description: el('rsCollectionDescription').value.trim(), visible: true }], msg);
      } else if(event.target.id === 'rsPauseForm'){
        event.preventDefault();
        void setPaused(null, el('rsPauseMessage').value);
      }
    });
  }

  return {
    async open(){ wire(); renderModeBar(); await load(); renderAll(); },
    // For the Owner Portal Overview + alert badges (owner-portal-alerts.js).
    async alerts(){ await load(); return computeAlerts(); },
    summary(){
      if(!state.loaded) return null;
      const since = Date.now() - 30 * 86400000;
      const orders = state.orders.filter(inMode);
      return {
        mode: state.mode,
        paid30: orders.filter(o => isPaid(o) && (toDate(o.paidAt) || new Date(0)).getTime() >= since).length,
        attention: computeAlerts().filter(a => a.level === 'urgent').length
      };
    },
    recentOrders(n = 8){
      if(!state.loaded) return [];
      return state.orders.filter(inMode).filter(o => isPaid(o) || o.status === 'pending_payment').slice(0, n).map(o => ({
        at: (toDate(o.paidAt || o.createdAt) || new Date(0)).getTime(),
        status: o.paymentStatus === 'paid' ? 'paid' : o.paymentStatus === 'refunded' ? 'refunded' : o.status === 'pending_payment' ? 'pending_payment' : (o.paymentStatus || o.status),
        who: o.customerName || o.email || 'Customer',
        summary: (o.items || []).map(i => i.title).filter(Boolean).join(', ') || orderNumber(o.id)
      }));
    },
    goTo(alert){
      wire();
      if(!alert) return;
      if(alert.edit){ shop.openEditor(alert.edit); return; }
      if(alert.filter) state.orderFilter = alert.filter;
      shop.showStoreTab(alert.go || 'overview');
    },
    renderOverview: () => { wire(); renderOverview(); },
    renderTab: tab => { wire(); renderTab(tab); },
    reload,
    getFileState: () => state.loaded ? state.files : null
  };
}
