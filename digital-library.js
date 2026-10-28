/* ============================================================
   The Unveiled Assembly — Digital Library (paid PDF delivery)

   Member: My Assembly → Purchases & Downloads → "Your Digital Library".
   Shop:   shop/confirmation.html, where Stripe returns a digital order.
   Owner:  Owner Portal → Store → Digital Files and Orders.

   The browser never decides anything here. Access records
   (digitalAccess) are created only by the Stripe webhook or an owner
   action in Cloud Functions; a download is a short-lived, single-use
   link minted by createDigitalDownloadLink after the server re-checks
   the member, the order, the payment, and the access status. PDFs
   live in private Cloud Storage and are never at a public URL.

   Nothing here loads until the member opens Purchases & Downloads,
   the owner opens the Store, or the confirmation page is visited.
   ============================================================ */

// No transactional email provider is connected yet (PROJECT-CONTEXT
// §19.7). The email buttons stay visible but disabled and say so.
const EMAIL_CONNECTED = false;
const ACCESS_LABELS = {
  active: 'Payment Verified',
  pending_delivery: 'Being Prepared',
  revoked: 'Access Turned Off',
  refunded: 'Refunded'
};
const OWNER_ACCESS_LABELS = { active: 'Active', pending_delivery: 'Waiting For Owner', revoked: 'Turned Off', refunded: 'Refunded' };
const PAYMENT_LABELS = { paid: 'Paid', complimentary: 'Complimentary', refunded: 'Refunded', partially_refunded: 'Partly Refunded' };
const DEMO_FILES_KEY = 'ua_preview_digital_files_v1';

export function initDigitalLibrary(context){
  const { DEMO_MODE, db, firestore, call, getUser, escapeHtml: esc, base, openAccount, getProducts, loadStorage } = context;
  const productCache = new Map();
  let memberState = { uid: null, loading: false, access: [], orders: [], error: '' };
  let ownerState = { loaded: false, files: {}, access: [], events: [], message: '' };

  /* ---------- shared helpers ---------- */
  const money = cents => '$' + ((Number(cents) || 0) / 100).toFixed(2);
  const toDate = value => {
    if(!value) return null;
    if(typeof value.toDate === 'function') return value.toDate();
    const d = new Date(value); return Number.isNaN(d.getTime()) ? null : d;
  };
  const shortDate = value => { const d = toDate(value); return d ? d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : '—'; };
  const orderNumber = id => id ? 'UA-' + String(id).slice(0, 8).toUpperCase() : 'Complimentary';
  const reference = id => id ? '…' + String(id).slice(-8) : '—';
  const assetUrl = url => !url ? '' : /^(https?:|data:)/.test(url) ? url : base + url.replace(/^\//, '');
  const coverStyle = url => url ? ` style="background-image:url('${esc(assetUrl(url))}')"` : '';
  const sizeLabel = bytes => !bytes ? '' : bytes > 1048576 ? (bytes / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(bytes / 1024)) + ' KB';
  const friendlyError = err => (err && err.message) ? String(err.message).replace(/^Firebase: /, '') : 'Something went wrong. Please try again.';

  async function productFor(id){
    if(productCache.has(id)) return productCache.get(id);
    const fromShop = (getProducts() || []).find(p => p.id === id);
    if(fromShop){ productCache.set(id, fromShop); return fromShop; }
    let product = null;
    if(!DEMO_MODE){
      try { const snap = await firestore.getDoc(firestore.doc(db, 'shopProducts', id)); if(snap.exists()) product = { id, ...snap.data() }; }
      catch (err) { /* archived products aren't publicly readable — the card falls back to a plain cover */ }
    }
    productCache.set(id, product);
    return product;
  }

  async function downloadAccess(accessId, statusNode, button){
    if(DEMO_MODE){ statusNode.textContent = 'Preview only — downloads work on the live site after a verified purchase.'; return; }
    button.disabled = true;
    statusNode.textContent = 'Preparing your secure download…';
    try {
      const result = await call('createDigitalDownloadLink')({ accessId });
      statusNode.textContent = 'Your download is starting. The link expires in ' + result.data.expiresInMinutes + ' minutes.';
      window.location.assign(result.data.url);
    } catch (err) {
      statusNode.textContent = friendlyError(err);
    } finally {
      setTimeout(() => { button.disabled = false; }, 2500);
    }
  }

  /* ---------- member: Your Digital Library ---------- */
  function demoMemberData(){
    return {
      access: [{ id: 'preview-concealed', productId: 'preview-concealed', productTitle: 'Concealed', orderId: 'PREVIEWORDER1', amountPaidCents: 1800, currency: 'usd', paymentStatus: 'paid', accessStatus: 'active', paymentIntentId: 'pi_preview00000000', purchasedAt: new Date().toISOString(), downloadCount: 0, emailStatus: 'not_connected', preview: true }],
      orders: []
    };
  }

  async function loadMember(force = false){
    const user = getUser();
    const uid = user ? user.uid : null;
    if(!uid){ memberState = { uid: null, loading: false, access: [], orders: [], error: '' }; return; }
    if(!force && memberState.uid === uid && !memberState.error && (memberState.loading || memberState.loadedAt)) return;
    memberState = { uid, loading: true, access: [], orders: [], error: '' };
    renderMember();
    try {
      if(DEMO_MODE){
        Object.assign(memberState, demoMemberData());
      } else {
        const { collection, query, where, getDocs } = firestore;
        const [accessSnap, orderSnap] = await Promise.all([
          getDocs(query(collection(db, 'digitalAccess'), where('uid', '==', uid))),
          getDocs(query(collection(db, 'shopOrders'), where('uid', '==', uid)))
        ]);
        accessSnap.forEach(d => memberState.access.push({ id: d.id, ...d.data() }));
        orderSnap.forEach(d => memberState.orders.push({ id: d.id, ...d.data() }));
        memberState.access.sort((a, b) => (toDate(b.purchasedAt) || 0) - (toDate(a.purchasedAt) || 0));
      }
      await Promise.all(memberState.access.map(a => productFor(a.productId)));
      memberState.loadedAt = Date.now();
    } catch (err) {
      console.error('[library] could not load purchases', err);
      memberState.error = 'We could not load your purchases right now. Please try again.';
    }
    memberState.loading = false;
    renderMember();
  }

  function libraryItemHtml(a){
    const product = productCache.get(a.productId) || null;
    const status = a.accessStatus || 'pending_delivery';
    const canDownload = status === 'active';
    const statusText = (a.paymentStatus === 'complimentary' && status === 'active' ? 'Access Granted' : (ACCESS_LABELS[status] || 'Pending')) + (a.preview ? ' · Sample' : '');
    const note = status === 'pending_delivery' ? 'Your payment is verified. The ministry is preparing this file — it will be ready here shortly.'
      : status === 'refunded' ? 'This purchase was refunded, so the download is closed.'
      : status === 'revoked' ? 'Access to this download is turned off. Please contact the ministry if this is unexpected.'
      : '';
    return `<article class="dl-item" data-dl-access="${esc(a.id)}">
      <div class="dl-cover"${coverStyle(product && product.image)}>${product && product.image ? '' : `<span>${esc(a.productTitle || 'Digital Resource')}</span>`}</div>
      <div class="dl-body">
        <span class="dl-status dl-status-${esc(status)}">${esc(statusText)}</span>
        <h4>${esc(a.productTitle || (product && product.title) || 'Digital Resource')}</h4>
        <p class="dl-meta">PDF · ${a.orderId ? 'Purchased' : 'Added'} ${esc(shortDate(a.purchasedAt))}${a.downloadCount ? ' · Downloaded ' + Number(a.downloadCount) + (a.downloadCount === 1 ? ' time' : ' times') : ''}</p>
        ${note ? `<p class="dl-note">${esc(note)}</p>` : ''}
        <div class="dl-actions">
          <button type="button" class="portal-primary" data-dl-download="${esc(a.id)}"${canDownload ? '' : ' disabled'}>Download PDF</button>
          <button type="button" class="portal-secondary" data-dl-email="${esc(a.id)}"${EMAIL_CONNECTED && canDownload ? '' : ' disabled'}>Email Link Again</button>
          ${EMAIL_CONNECTED ? '' : '<span class="dl-not-connected">Email: Not Connected Yet</span>'}
        </div>
        <p class="dl-message" role="status" aria-live="polite"></p>
        <details class="dl-receipt">
          <summary>Receipt Details</summary>
          <dl>
            <div><dt>Order Number</dt><dd>${esc(orderNumber(a.orderId))}</dd></div>
            <div><dt>Date</dt><dd>${esc(shortDate(a.purchasedAt))}</dd></div>
            <div><dt>Amount</dt><dd>${esc(money(a.amountPaidCents))} ${esc(String(a.currency || 'usd').toUpperCase())}</dd></div>
            <div><dt>Payment</dt><dd>${esc(a.preview ? 'Sample — no payment' : (PAYMENT_LABELS[a.paymentStatus] || a.paymentStatus || '—'))}</dd></div>
            <div><dt>Payment Reference</dt><dd>${esc(a.preview ? '—' : reference(a.paymentIntentId))}</dd></div>
          </dl>
          <p>Stripe also emails a payment receipt to the address used at checkout.</p>
        </details>
      </div>
    </article>`;
  }

  function shopOrderRowHtml(o){
    const items = (o.items || []).map(i => i.title + (i.quantity > 1 ? ' × ' + i.quantity : '')).join(', ');
    const label = o.paymentStatus === 'paid' ? (o.fulfillmentStatus === 'unfulfilled' ? 'Paid · Preparing To Ship' : 'Paid') : o.paymentStatus === 'refunded' ? 'Refunded' : 'Payment Pending';
    return `<div class="dl-order-row"><div><strong>${esc(items || 'Shop Order')}</strong><span>${esc(orderNumber(o.id))} · ${esc(shortDate(o.paidAt || o.createdAt))}</span></div><div><span class="admin-status-pill ${o.paymentStatus === 'paid' ? 'confirmed' : 'pending'}">${esc(label)}</span><small>${esc(o.amountPaid ? '$' + Number(o.amountPaid).toFixed(2) : money(o.totalCents))}</small></div></div>`;
  }

  function renderMember(){
    const wrap = document.getElementById('memberDigitalLibrary');
    if(!wrap) return;
    const head = `<div class="dl-library-head"><div><span class="member-page-kicker">Private Library</span><h3>Your Digital Library</h3><p>Resources you've purchased, kept privately on your account. Download them any time.</p></div>${memberState.uid ? '<button type="button" class="portal-secondary" data-dl-refresh>Refresh</button>' : ''}</div>`;
    if(!memberState.uid){ wrap.innerHTML = ''; return; }
    if(memberState.loading){ wrap.innerHTML = head + '<div class="dl-loading" role="status">Loading your library…</div>'; return; }
    if(memberState.error){ wrap.innerHTML = head + `<div class="member-empty-state"><strong>${esc(memberState.error)}</strong><span><button type="button" class="link-btn" data-dl-refresh>Try again</button></span></div>`; return; }
    const paidPhysical = memberState.orders.filter(o => o.paymentStatus === 'paid' || o.paymentStatus === 'refunded').filter(o => (o.items || []).some(i => i.type !== 'digital'));
    wrap.innerHTML = head +
      (memberState.access.length
        ? `<div class="dl-list">${memberState.access.map(libraryItemHtml).join('')}</div><p class="dl-private">Your files are private to your account. Each download uses a secure link that works once and expires after a few minutes, so it can't be shared or reused.</p>`
        : `<div class="member-empty-state"><strong>No digital resources yet.</strong><span>PDF studies you purchase from the <a href="${esc(base)}shop/">Shop</a> will appear here after payment is verified.</span></div>`) +
      (paidPhysical.length ? `<div class="dl-orders"><span class="member-page-kicker">Shop Orders</span>${paidPhysical.map(shopOrderRowHtml).join('')}</div>` : '') +
      (DEMO_MODE ? '<p class="dl-preview-flag">Preview: this sample shows how a verified purchase appears. Real downloads only work on the live site.</p>' : '');
  }

  document.addEventListener('click', event => {
    const dl = event.target.closest('[data-dl-download]');
    if(dl){
      const item = dl.closest('[data-dl-access], [data-confirm-item]');
      const statusNode = item ? item.querySelector('.dl-message') : null;
      if(statusNode) void downloadAccess(dl.dataset.dlDownload, statusNode, dl);
      return;
    }
    if(event.target.closest('[data-dl-refresh]')) void loadMember(true);
  });

  /* ---------- shop/confirmation.html ---------- */
  let confirmTimer = null;
  function confirmShell(inner){
    const root = document.getElementById('shopConfirmationRoot');
    if(root) root.innerHTML = `<section class="dl-confirm"><div class="dl-confirm-inner reveal visible">${inner}</div></section>`;
  }
  function confirmActionsHtml(){
    return `<div class="dl-confirm-links"><button type="button" class="shop-outline-action" data-dl-open-library>Go To Purchases &amp; Downloads</button><a class="shop-text-link" href="${esc(base)}shop/">Return To The Shop</a></div>`;
  }
  function confirmedHtml(order, accessList, { preview = false } = {}){
    const items = accessList.map(a => {
      const product = productCache.get(a.productId);
      const ready = a.accessStatus === 'active';
      return `<div class="dl-confirm-item" data-confirm-item>
        <div class="dl-cover dl-cover-small"${coverStyle(product && product.image)}>${product && product.image ? '' : `<span>${esc(a.productTitle)}</span>`}</div>
        <div><strong>${esc(a.productTitle)}</strong><span>PDF · ${ready ? 'Ready to download' : 'Being prepared by the ministry'}</span>
          <div class="dl-actions"><button type="button" class="shop-primary-action" data-dl-download="${esc(a.id)}"${ready ? '' : ' disabled'}>Download PDF</button></div>
          <p class="dl-message" role="status" aria-live="polite"></p></div></div>`;
    }).join('');
    const physical = (order.items || []).filter(i => i.type !== 'digital');
    return `${preview ? '<p class="dl-preview-flag">Owner preview — sample order. Buttons are inactive.</p>' : ''}
      <span class="shop-micro">Order Complete</span>
      <h1>Payment Verified.</h1>
      <p class="dl-confirm-lead">Thank you. Stripe confirmed your payment and your purchase is saved to your account.</p>
      <dl class="dl-confirm-facts">
        <div><dt>Order Number</dt><dd>${esc(orderNumber(order.id))}</dd></div>
        <div><dt>Amount</dt><dd>${esc(order.amountPaid != null ? '$' + Number(order.amountPaid).toFixed(2) : money(order.totalCents))}</dd></div>
        <div><dt>Date</dt><dd>${esc(shortDate(order.paidAt || new Date()))}</dd></div>
      </dl>
      ${items ? `<div class="dl-confirm-items">${items}</div>` : ''}
      ${physical.length ? `<p class="dl-note">${esc(physical.map(i => i.title).join(', '))} will ship to the address you entered at checkout.</p>` : ''}
      <details class="dl-receipt"><summary>View Receipt</summary><dl>
        <div><dt>Order Number</dt><dd>${esc(orderNumber(order.id))}</dd></div>
        ${(order.items || []).map(i => `<div><dt>${esc(i.title)}${i.quantity > 1 ? ' × ' + i.quantity : ''}</dt><dd>${esc(money((i.unitPriceCents || 0) * (i.quantity || 1)))}</dd></div>`).join('')}
        <div><dt>Total Paid</dt><dd>${esc(order.amountPaid != null ? '$' + Number(order.amountPaid).toFixed(2) : money(order.totalCents))}</dd></div>
        <div><dt>Payment Reference</dt><dd>${esc(reference(order.paymentIntentId))}</dd></div>
      </dl><p>Stripe also emails a payment receipt to the address used at checkout.</p></details>
      ${confirmActionsHtml()}`;
  }

  async function renderConfirmation(){
    const root = document.getElementById('shopConfirmationRoot');
    if(!root) return;
    clearTimeout(confirmTimer);
    const params = new URLSearchParams(window.location.search);
    const previewId = params.get('preview');
    if(previewId || (DEMO_MODE && !params.get('ref'))){
      const product = previewId ? await productFor(previewId) : null;
      const title = product ? product.title : 'Concealed';
      if(product) productCache.set(product.id, product);
      confirmShell(confirmedHtml(
        { id: 'PREVIEW0ORDER', amountPaid: product && product.priceCents ? product.priceCents / 100 : 18, items: [{ title, type: 'digital', unitPriceCents: product ? product.priceCents : 1800, quantity: 1 }], paymentIntentId: 'pi_preview00000000' },
        [{ id: 'preview', productId: product ? product.id : 'preview', productTitle: title, accessStatus: 'active' }], { preview: true }));
      root.querySelectorAll('[data-dl-download]').forEach(b => { b.disabled = true; });
      return;
    }
    const outcome = params.get('checkout');
    const orderId = params.get('ref');
    if(outcome === 'cancel'){
      confirmShell(`<span class="shop-micro">Checkout</span><h1>Payment Not Completed.</h1><p class="dl-confirm-lead">Nothing was charged. Your bag is saved if you'd like to try again.</p>${confirmActionsHtml()}`);
      return;
    }
    if(!orderId){
      confirmShell(`<span class="shop-micro">Purchases</span><h1>Your Library.</h1><p class="dl-confirm-lead">Your purchases live in My Assembly → Purchases &amp; Downloads.</p>${confirmActionsHtml()}`);
      return;
    }
    const user = getUser();
    if(!user){
      confirmShell(`<span class="shop-micro">Order ${esc(orderNumber(orderId))}</span><h1>Sign In To Continue.</h1><p class="dl-confirm-lead">Sign in to the My Assembly account you used at checkout to see your order and download your purchase.</p><div class="dl-confirm-links"><button type="button" class="shop-primary-action" data-dl-sign-in>Sign In</button></div>`);
      return;
    }
    const started = Date.now();
    const check = async () => {
      let order = null;
      try {
        const snap = await firestore.getDoc(firestore.doc(db, 'shopOrders', orderId));
        if(snap.exists()) order = { id: snap.id, ...snap.data() };
      } catch (err) { /* not this member's order, or not readable yet */ }
      if(order && order.paymentStatus === 'paid'){
        const accessList = [];
        for(const accessId of order.digitalAccessIds || []){
          try {
            const a = await firestore.getDoc(firestore.doc(db, 'digitalAccess', accessId));
            if(a.exists()) accessList.push({ id: a.id, ...a.data() });
          } catch (err) { /* skip */ }
        }
        await Promise.all(accessList.map(a => productFor(a.productId)));
        confirmShell(confirmedHtml(order, accessList));
        return;
      }
      if(order && ['refunded', 'expired', 'cancelled'].includes(order.status)){
        confirmShell(`<span class="shop-micro">Order ${esc(orderNumber(orderId))}</span><h1>Payment Not Completed.</h1><p class="dl-confirm-lead">This checkout didn't go through, so nothing was charged.</p>${confirmActionsHtml()}`);
        return;
      }
      const waited = Date.now() - started;
      if(waited > 90000){
        confirmShell(`<span class="shop-micro">Order ${esc(orderNumber(orderId))}</span><h1>Still Confirming.</h1><p class="dl-confirm-lead">Stripe hasn't confirmed this payment yet. It can take a minute. Your purchase will appear in Purchases &amp; Downloads as soon as it's verified — you won't be charged twice.</p><div class="dl-confirm-links"><button type="button" class="shop-primary-action" data-dl-check-again>Check Again</button></div>${confirmActionsHtml()}`);
        return;
      }
      confirmShell(`<span class="shop-micro">Order ${esc(orderNumber(orderId))}</span><h1>Verifying Payment…</h1><p class="dl-confirm-lead" role="status">We're waiting for Stripe to confirm your payment. Your download unlocks the moment it does — please keep this page open.</p><div class="dl-confirm-spinner" aria-hidden="true"></div>`);
      confirmTimer = setTimeout(check, 2000);
    };
    await check();
  }
  document.addEventListener('click', event => {
    if(event.target.closest('[data-dl-open-library]')) openAccount('receipts');
    else if(event.target.closest('[data-dl-sign-in]')) openAccount();
    else if(event.target.closest('[data-dl-check-again]')) void renderConfirmation();
  });

  /* ---------- owner: Store → Digital Files ---------- */
  function demoFiles(){ try { return JSON.parse(localStorage.getItem(DEMO_FILES_KEY) || '{}'); } catch (err) { return {}; } }
  function saveDemoFiles(files){ try { localStorage.setItem(DEMO_FILES_KEY, JSON.stringify(files)); } catch (err) { /* preview only */ } }

  async function loadOwner(force = false){
    if(ownerState.loaded && !force) return;
    if(DEMO_MODE){
      ownerState = { loaded: true, files: demoFiles(), access: demoOwnerOrders(), events: [], message: '' };
      return;
    }
    const { collection, getDocs } = firestore;
    try {
      const [fileSnap, accessSnap, eventSnap] = await Promise.all([
        getDocs(collection(db, 'shopDigitalFiles')),
        getDocs(collection(db, 'digitalAccess')),
        getDocs(collection(db, 'digitalDownloadEvents'))
      ]);
      const files = {}; fileSnap.forEach(d => { files[d.id] = d.data(); });
      const access = []; accessSnap.forEach(d => access.push({ id: d.id, ...d.data() }));
      const events = []; eventSnap.forEach(d => events.push({ id: d.id, ...d.data() }));
      access.sort((a, b) => (toDate(b.purchasedAt) || 0) - (toDate(a.purchasedAt) || 0));
      events.sort((a, b) => (toDate(b.at) || 0) - (toDate(a.at) || 0));
      ownerState = { loaded: true, files, access, events: events.slice(0, 25), message: '' };
    } catch (err) {
      console.error('[library] owner load failed', err);
      ownerState = { loaded: true, files: {}, access: [], events: [], message: 'Digital files and orders could not be loaded. Please refresh.' };
    }
  }

  function demoOwnerOrders(){
    return [{ id: 'preview-order_concealed', orderId: 'PREVIEWORDER1', uid: 'demo-member', email: 'demo@example.com', productId: 'concealed', productTitle: 'Concealed (sample)', amountPaidCents: 1800, currency: 'usd', paymentStatus: 'paid', accessStatus: 'active', emailStatus: 'not_connected', downloadCount: 2, lastDownloadAt: new Date().toISOString(), purchasedAt: new Date(Date.now() - 86400000).toISOString(), refundStatus: 'none', preview: true }];
  }

  function digitalProducts(){ return (getProducts() || []).filter(p => p.type === 'digital' && !p.isPlaceholder); }

  function ownerFileRowHtml(p){
    const f = ownerState.files[p.id] || {};
    const hasFile = !!(f.storagePath || f.previewFileName);
    return `<article class="dl-owner-file" data-dl-product="${esc(p.id)}">
      <div class="dl-cover dl-cover-small"${coverStyle(p.image)}>${p.image ? '' : `<span>${esc(p.title)}</span>`}</div>
      <div class="dl-owner-file-main">
        <strong>${esc(p.title)}</strong>
        <span>${esc(money(p.priceCents))} · ${esc(p.status === 'published' ? 'Published' : p.status === 'coming_soon' ? 'Coming Soon' : p.status === 'archived' ? 'Archived' : 'Draft')}</span>
        <p class="dl-file-state ${hasFile ? 'is-ready' : 'is-missing'}">${hasFile
          ? `Private PDF: ${esc(f.fileName || f.previewFileName)}${f.sizeBytes ? ' · ' + esc(sizeLabel(f.sizeBytes)) : ''} · Updated ${esc(shortDate(f.uploadedAt))}`
          : 'No PDF uploaded yet — customers can’t buy this until one is added.'}</p>
        <label class="admin-checkbox-field"><input type="checkbox" data-dl-auto="${esc(p.id)}"${f.autoDelivery === false ? '' : ' checked'}${hasFile ? '' : ' disabled'} /> Deliver automatically after payment</label>
        <p class="admin-hint">When this is off, paid orders wait in Orders until you choose “Give Access”.</p>
        <p class="dl-message" role="status" aria-live="polite"></p>
      </div>
      <div class="dl-owner-file-actions">
        <label class="admin-btn-solid dl-upload">${hasFile ? 'Replace PDF' : 'Upload PDF'}<input type="file" accept="application/pdf" data-dl-upload="${esc(p.id)}" hidden /></label>
        <a class="admin-btn-ghost" href="${esc(base)}shop/confirmation.html?preview=${encodeURIComponent(p.id)}" target="_blank" rel="noopener">Preview Customer View ↗</a>
      </div>
    </article>`;
  }

  function renderOwnerFiles(){
    const wrap = document.getElementById('ownerDigitalFiles');
    if(!wrap) return;
    const items = digitalProducts();
    wrap.innerHTML = `<div class="store-products-head"><div><h4>Digital Files</h4><p>Attach the private PDF for each digital product. Files are stored privately — customers only receive a secure link after a verified payment, and the file location is never shown.</p></div></div>` +
      (ownerState.message ? `<p class="admin-hint">${esc(ownerState.message)}</p>` : '') +
      (DEMO_MODE ? '<p class="dl-preview-flag">Preview: uploads here are simulated in this browser and no file is stored.</p>' : '') +
      (items.length ? items.map(ownerFileRowHtml).join('') : '<p class="admin-hint">No digital products yet. Create one under Products (choose “Digital Resource”), then come back here to attach its PDF.</p>');
  }

  async function uploadPdf(productId, file, row){
    const msg = row.querySelector('.dl-message');
    if(!file) return;
    if(file.type !== 'application/pdf' && !/\.pdf$/i.test(file.name)){ msg.textContent = 'Please choose a PDF file.'; return; }
    if(file.size > 200 * 1024 * 1024){ msg.textContent = 'That PDF is larger than 200 MB. Please compress it and try again.'; return; }
    const existing = ownerState.files[productId] || {};
    if(DEMO_MODE){
      ownerState.files[productId] = { ...existing, previewFileName: file.name, fileName: file.name, sizeBytes: file.size, uploadedAt: new Date().toISOString(), autoDelivery: existing.autoDelivery !== false };
      saveDemoFiles(ownerState.files);
      renderOwnerFiles();
      return;
    }
    msg.textContent = 'Uploading privately…';
    try {
      const { storage, ref, uploadBytes } = await loadStorage();
      const safe = file.name.replace(/[^\w.-]+/g, '-').slice(-80);
      const storagePath = 'private/digital-products/' + productId + '/' + Date.now() + '-' + safe;
      await uploadBytes(ref(storage, storagePath), file, { contentType: 'application/pdf' });
      const record = { productId, storagePath, fileName: file.name, sizeBytes: file.size, contentType: 'application/pdf', autoDelivery: existing.autoDelivery !== false, uploadedAt: firestore.serverTimestamp() };
      await firestore.setDoc(firestore.doc(db, 'shopDigitalFiles', productId), record);
      ownerState.files[productId] = { ...record, uploadedAt: new Date().toISOString() };
      renderOwnerFiles();
    } catch (err) {
      console.error('[library] upload failed', err);
      const code = err && err.code ? String(err.code) : '';
      msg.textContent = /bucket|not-found|unknown|no-default-bucket/.test(code)
        ? 'Private file storage isn’t turned on for this website yet. See “Required setup” in the project notes.'
        : code === 'storage/unauthorized' ? 'Only the ministry owner can upload files.' : 'The PDF could not be uploaded. Please try again.';
    }
  }

  async function setAutoDelivery(productId, on, row){
    const existing = ownerState.files[productId] || {};
    if(DEMO_MODE){ ownerState.files[productId] = { ...existing, autoDelivery: on }; saveDemoFiles(ownerState.files); return; }
    try {
      await firestore.setDoc(firestore.doc(db, 'shopDigitalFiles', productId), { autoDelivery: on }, { merge: true });
      ownerState.files[productId] = { ...existing, autoDelivery: on };
      row.querySelector('.dl-message').textContent = on ? 'Paid orders will unlock automatically.' : 'Paid orders will wait for you in Orders.';
    } catch (err) { row.querySelector('.dl-message').textContent = 'Could not save. Please try again.'; }
  }

  /* ---------- owner: Store → Orders ---------- */
  function ownerOrderRowHtml(a){
    const status = a.accessStatus || 'pending_delivery';
    const actions = [
      status !== 'active' && status !== 'refunded' ? `<button type="button" class="admin-btn-solid" data-dl-owner="grant" data-dl-id="${esc(a.id)}">Give Access</button>` : '',
      status === 'active' || status === 'pending_delivery' ? `<button type="button" class="admin-btn-ghost" data-dl-owner="revoke" data-dl-id="${esc(a.id)}">Turn Off Access</button>` : '',
      status !== 'refunded' && a.paymentStatus === 'paid' ? `<button type="button" class="admin-btn-ghost" data-dl-owner="refunded" data-dl-id="${esc(a.id)}">Record Refund</button>` : '',
      `<button type="button" class="admin-btn-ghost" data-dl-owner="resend" data-dl-id="${esc(a.id)}"${EMAIL_CONNECTED ? '' : ' disabled'}>Resend Access Email</button>`
    ].join('');
    return `<article class="dl-owner-order" data-dl-order="${esc(a.id)}">
      <div class="dl-owner-order-main">
        <strong>${esc(a.productTitle || 'Digital Resource')}</strong>
        <span>${esc(a.email || 'No email')} · ${esc(orderNumber(a.orderId))} · ${esc(shortDate(a.purchasedAt))}</span>
      </div>
      <dl class="dl-owner-facts">
        <div><dt>Amount</dt><dd>${esc(money(a.amountPaidCents))}</dd></div>
        <div><dt>Payment</dt><dd>${esc(PAYMENT_LABELS[a.paymentStatus] || a.paymentStatus || '—')}</dd></div>
        <div><dt>Access</dt><dd><span class="admin-status-pill ${status === 'active' ? 'confirmed' : status === 'pending_delivery' ? 'pending' : 'cancelled'}">${esc(OWNER_ACCESS_LABELS[status] || status)}</span></dd></div>
        <div><dt>Refund</dt><dd>${esc(a.refundStatus === 'refunded' ? 'Refunded' : a.refundStatus === 'partially_refunded' ? 'Partly refunded' : 'None')}</dd></div>
        <div><dt>Email</dt><dd>${esc(a.emailStatus === 'not_connected' || !EMAIL_CONNECTED ? 'Not Connected Yet' : a.emailStatus)}</dd></div>
        <div><dt>Downloads</dt><dd>${Number(a.downloadCount) || 0}${a.lastDownloadAt ? ' · last ' + esc(shortDate(a.lastDownloadAt)) : ''}</dd></div>
      </dl>
      <div class="dl-owner-order-actions">${actions}</div>
      <p class="dl-message" role="status" aria-live="polite"></p>
    </article>`;
  }

  function renderOwnerOrders(){
    const wrap = document.getElementById('ownerDigitalOrders');
    if(!wrap) return;
    const products = digitalProducts();
    const waiting = ownerState.access.filter(a => a.accessStatus === 'pending_delivery').length;
    wrap.innerHTML = `<div class="store-products-head"><div><h4>Digital Orders</h4><p>Every digital purchase, its payment, and whether the customer can download it. Payments are confirmed by Stripe — nothing here can mark an order paid.</p></div></div>
      ${DEMO_MODE ? '<p class="dl-preview-flag">Preview: sample order. Actions here are simulated and change nothing.</p>' : ''}
      ${ownerState.message ? `<p class="admin-hint">${esc(ownerState.message)}</p>` : ''}
      <div class="admin-stat-row store-stat-row"><div class="admin-stat-tile"><span>Digital Orders</span><strong>${ownerState.access.filter(a => a.orderId).length}</strong></div><div class="admin-stat-tile"><span>Waiting For You</span><strong>${waiting}</strong></div><div class="admin-stat-tile"><span>Downloads</span><strong>${ownerState.access.reduce((n, a) => n + (Number(a.downloadCount) || 0), 0)}</strong></div></div>
      ${ownerState.access.length ? ownerState.access.map(ownerOrderRowHtml).join('') : '<p class="admin-hint">No digital orders yet. They appear here as soon as Stripe confirms a payment.</p>'}
      <form class="dl-grant-form" id="ownerDigitalGrantForm">
        <span class="portal-label">Give Access To A Member</span>
        <p class="admin-hint">Add a complimentary copy to someone's library. They need a My Assembly account first.</p>
        <div class="booking-grid">
          <div class="booking-field"><label for="ownerDigitalGrantProduct">Digital Product</label><select id="ownerDigitalGrantProduct">${products.map(p => `<option value="${esc(p.id)}">${esc(p.title)}</option>`).join('')}</select></div>
          <div class="booking-field"><label for="ownerDigitalGrantEmail">Member Email</label><input id="ownerDigitalGrantEmail" type="email" autocomplete="off" /></div>
        </div>
        <button type="submit" class="admin-btn-solid"${products.length ? '' : ' disabled'}>Give Access</button>
        <p class="dl-message" role="status" aria-live="polite"></p>
      </form>
      ${ownerState.events.length ? `<div class="dl-activity"><span class="portal-label">Recent Download Activity</span>${ownerState.events.map(e => `<div class="dl-activity-row"><span>${esc(e.productTitle || 'Download')}</span><span>${esc(orderNumber(e.orderId))}</span><span>${esc(shortDate(e.at))}</span></div>`).join('')}</div>` : ''}`;
  }

  async function ownerAction(action, accessId, row){
    const msg = row.querySelector('.dl-message');
    if(DEMO_MODE){ msg.textContent = 'Preview only — on the live site this ' + (action === 'grant' ? 'gives access' : action === 'revoke' ? 'turns access off' : action === 'refunded' ? 'records the refund and closes the download' : 'emails the customer') + '.'; return; }
    if((action === 'revoke' || action === 'refunded') && !window.confirm(action === 'revoke' ? 'Turn off this customer’s download access?' : 'Record this order as refunded and close the download? (Return the money itself from the Stripe Dashboard.)')) return;
    msg.textContent = 'Saving…';
    try {
      await call('manageDigitalAccess')({ action, accessId });
      await loadOwner(true); renderOwnerOrders();
    } catch (err) { msg.textContent = friendlyError(err); }
  }

  document.addEventListener('change', event => {
    const upload = event.target.closest('[data-dl-upload]');
    if(upload){ void uploadPdf(upload.dataset.dlUpload, upload.files && upload.files[0], upload.closest('[data-dl-product]')); upload.value = ''; return; }
    const auto = event.target.closest('[data-dl-auto]');
    if(auto) void setAutoDelivery(auto.dataset.dlAuto, auto.checked, auto.closest('[data-dl-product]'));
  });
  document.addEventListener('click', event => {
    const btn = event.target.closest('[data-dl-owner]');
    if(btn) void ownerAction(btn.dataset.dlOwner, btn.dataset.dlId, btn.closest('[data-dl-order]'));
  });
  document.addEventListener('submit', async event => {
    if(event.target.id !== 'ownerDigitalGrantForm') return;
    event.preventDefault();
    const form = event.target;
    const msg = form.querySelector('.dl-message');
    const email = document.getElementById('ownerDigitalGrantEmail').value.trim();
    const productId = document.getElementById('ownerDigitalGrantProduct').value;
    if(!email){ msg.textContent = 'Enter the member’s email.'; return; }
    if(DEMO_MODE){ msg.textContent = 'Preview only — on the live site this adds the PDF to that member’s library.'; return; }
    msg.textContent = 'Saving…';
    try {
      await call('manageDigitalAccess')({ action: 'grant-new', productId, email });
      await loadOwner(true); renderOwnerOrders();
    } catch (err) { msg.textContent = friendlyError(err); }
  });

  async function renderOwner(){
    await loadOwner();
    renderOwnerFiles();
    renderOwnerOrders();
  }

  return {
    renderMember: () => { renderMember(); void loadMember(); },
    resetMember: () => { memberState = { uid: null, loading: false, access: [], orders: [], error: '' }; },
    renderConfirmation,
    renderOwner,
    renderOwnerFiles,
    renderOwnerOrders
  };
}
