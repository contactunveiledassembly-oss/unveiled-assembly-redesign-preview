/* ============================================================
   Owner Portal → Reports & Backups

   Lists the owner's ministry reports and backups, starts new ones,
   and opens them through owner-checked, single-use links minted by
   Cloud Functions (functions/reports.js). Nothing here can read a
   report file directly — Cloud Storage is closed to every browser.
   Also renders owner-report.html, where an emailed 7-day link lands.
   ============================================================ */

// No transactional email provider is connected yet (PROJECT-CONTEXT §38).
const EMAIL_CONNECTED = false;
const KIND_LABELS = { monthly: 'Monthly report', quarterly: 'Quarterly rollup', custom: 'Custom date range' };
const ACTION_LABELS = {
  generated: 'Report generated', failed: 'Report failed', viewed: 'Report viewed', downloaded: 'Report downloaded',
  'link-issued': 'Secure link created', 'backup-created': 'Encrypted backup created', 'backup-downloaded': 'Backup downloaded'
};
const BACKUP_MAGIC = 'UABK1';
const BACKUP_KDF_ITERATIONS = 600000;

export function initOwnerReports(context){
  const { DEMO_MODE, db, firestore, call, escapeHtml: esc, getUser, isOwner, openAccount } = context;
  let state = { loaded: false, reports: [], events: [], backups: [], message: '' };

  const money = c => '$' + ((Number(c) || 0) / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const toDate = v => v && typeof v.toDate === 'function' ? v.toDate() : v ? new Date(v) : null;
  const when = v => { const d = toDate(v); return d && !Number.isNaN(d.getTime()) ? d.toLocaleString(undefined, { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }) : '—'; };
  const shortDay = s => s ? new Date(s + 'T12:00:00Z').toLocaleDateString(undefined, { timeZone: 'UTC', month: 'short', day: 'numeric', year: 'numeric' }) : '';
  const friendly = err => (err && err.message ? String(err.message).replace(/^Firebase: /, '') : 'Something went wrong. Please try again.');
  const monthName = (y, m) => new Date(Date.UTC(y, m - 1, 15)).toLocaleDateString(undefined, { timeZone: 'UTC', month: 'long', year: 'numeric' });
  function previousLabels(){
    const now = new Date(); const y = now.getFullYear(), m = now.getMonth() + 1;
    const pm = m === 1 ? [y - 1, 12] : [y, m - 1];
    const qs = new Date(y, m - 4, 1), qe = new Date(y, m - 2, 1);
    return { month: monthName(...pm), quarter: qs.toLocaleDateString(undefined, { month: 'long' }) + ' – ' + qe.toLocaleDateString(undefined, { month: 'long', year: 'numeric' }) };
  }

  function demoState(){
    const day = 86400000;
    return {
      loaded: true, message: '',
      reports: [
        { id: 'monthly-2026-09', kind: 'monthly', label: 'September 2026', periodStart: '2026-09-01', periodEnd: '2026-09-30', status: 'ready', requestedBy: 'schedule', generatedAt: new Date(Date.now() - 27 * day), stripeMode: 'test', summary: { receivedCents: 0, refundsCents: 0, netCents: 0, payments: 0, testPayments: 3 }, emailStatus: 'not_connected' },
        { id: 'quarterly-2026-07-to-2026-09', kind: 'quarterly', label: 'July – September 2026', periodStart: '2026-07-01', periodEnd: '2026-09-30', status: 'ready', requestedBy: 'schedule', generatedAt: new Date(Date.now() - 27 * day), stripeMode: 'test', summary: { receivedCents: 0, refundsCents: 0, netCents: 0, payments: 0, testPayments: 3 }, emailStatus: 'not_connected' },
        { id: 'monthly-2026-08', kind: 'monthly', label: 'August 2026', periodStart: '2026-08-01', periodEnd: '2026-08-31', status: 'failed', requestedBy: 'schedule', createdAt: new Date(Date.now() - 58 * day), error: 'The report could not be generated. Try again, and contact support if it keeps failing.' }
      ],
      events: [
        { action: 'generated', reportId: 'monthly-2026-09', by: 'schedule', at: new Date(Date.now() - 27 * day) },
        { action: 'viewed', reportId: 'monthly-2026-09', by: 'owner', at: new Date(Date.now() - 26 * day) }
      ],
      backups: []
    };
  }

  async function load(force = false){
    if(state.loaded && !force) return;
    if(DEMO_MODE){ state = demoState(); return; }
    try {
      const { collection, getDocs } = firestore;
      const [r, e, b] = await Promise.all(['ownerReports', 'ownerReportEvents', 'ownerBackups'].map(name => getDocs(collection(db, name))));
      const rows = snap => { const out = []; snap.forEach(d => out.push({ id: d.id, ...d.data() })); return out; };
      const sortBy = field => (a, b) => (toDate(b[field] || b.createdAt) || 0) - (toDate(a[field] || a.createdAt) || 0);
      state = { loaded: true, message: '', reports: rows(r).sort(sortBy('generatedAt')), events: rows(e).sort(sortBy('at')).slice(0, 20), backups: rows(b).sort(sortBy('createdAt')) };
    } catch (err) {
      console.error('[reports] load failed', err);
      state = { loaded: true, message: 'Reports could not be loaded. Please refresh.', reports: [], events: [], backups: [] };
    }
  }

  function reportRowHtml(r){
    const ready = r.status === 'ready';
    const s = r.summary || {};
    const statusPill = r.status === 'ready' ? '<span class="admin-status-pill confirmed">Ready</span>'
      : r.status === 'failed' ? '<span class="admin-status-pill cancelled">Failed</span>' : '<span class="admin-status-pill pending">Generating…</span>';
    const mode = !ready ? '' : r.stripeMode === 'live' ? '<span class="rb-mode rb-mode-live">Live income</span>' : '<span class="rb-mode">Test mode · no real income</span>';
    return `<article class="rb-report" data-report-id="${esc(r.id)}">
      <div class="rb-report-main">
        <strong>${esc(r.label || (r.periodStart + ' – ' + r.periodEnd))}</strong>
        <span>${esc(KIND_LABELS[r.kind] || 'Report')} · ${esc(shortDay(r.periodStart))} – ${esc(shortDay(r.periodEnd))}</span>
        <span>Generated ${esc(when(r.generatedAt || r.createdAt))} · ${r.requestedBy === 'schedule' ? 'Automatic' : 'By you'}</span>
        ${r.status === 'failed' ? `<p class="rb-error">${esc(r.error || 'This report failed.')}</p>` : ''}
      </div>
      <div class="rb-report-summary">${statusPill} ${mode}${ready ? `<small>Received ${esc(money(s.receivedCents))} · Net ${esc(money(s.netCents))}${s.testPayments ? ' · ' + s.testPayments + ' test payment' + (s.testPayments === 1 ? '' : 's') + ' listed separately' : ''}</small>` : ''}</div>
      <div class="rb-report-actions">
        <button type="button" class="admin-btn-solid" data-rb-view="${esc(r.id)}"${ready ? '' : ' disabled'}>View PDF</button>
        <button type="button" class="admin-btn-ghost" data-rb-download="${esc(r.id)}"${ready ? '' : ' disabled'}>Download PDF</button>
        <button type="button" class="admin-btn-ghost" data-rb-link="${esc(r.id)}"${ready ? '' : ' disabled'}>Email Secure Link Again</button>
        ${r.status === 'failed' ? `<button type="button" class="admin-btn-ghost" data-rb-retry="${esc(r.kind)}" data-rb-start="${esc(r.periodStart)}" data-rb-end="${esc(r.periodEnd)}">Try Again</button>` : ''}
      </div>
      <p class="rb-message" role="status" aria-live="polite"></p>
    </article>`;
  }

  function render(){
    const root = document.getElementById('ownerReportsRoot');
    if(!root) return;
    const labels = previousLabels();
    const failed = state.reports.filter(r => r.status === 'failed');
    const today = new Date().toISOString().slice(0, 10);
    root.innerHTML = `<div class="admin-panel-head"><div><span class="portal-label">Reports &amp; Backups</span><p class="admin-panel-intro">Printable ministry reports and encrypted backups. Files are stored privately; only you can open them, and every view and download is recorded.</p></div></div>
      ${DEMO_MODE ? '<p class="dl-preview-flag">Preview: sample reports. Buttons here are simulated.</p>' : ''}
      ${state.message ? `<p class="admin-hint">${esc(state.message)}</p>` : ''}
      ${failed.length ? `<div class="rb-alert" role="alert"><strong>${failed.length} report${failed.length === 1 ? '' : 's'} could not be generated.</strong> Use “Try Again” below.</div>` : ''}
      <div class="rb-email-status"><strong>Email Service Not Connected.</strong> Reports are still created on schedule and saved here. Automatic emails will start once an email service is connected.</div>

      <section class="rb-card" aria-labelledby="rbGenerateTitle">
        <h4 id="rbGenerateTitle">Generate a report</h4>
        <p class="admin-hint">Automatic: monthly on the 1st at 8:00 AM, and a quarterly rollup on Jan 1, Apr 1, Jul 1 and Oct 1 at 8:00 AM (New York time).</p>
        <div class="rb-generate">
          <button type="button" class="admin-btn-solid" data-rb-generate="monthly">Generate Monthly Report<small>${esc(labels.month)}</small></button>
          <button type="button" class="admin-btn-solid" data-rb-generate="quarterly">Generate Quarterly Rollup<small>${esc(labels.quarter)}</small></button>
        </div>
        <form class="rb-custom" id="rbCustomForm">
          <span class="admin-microlabel">Custom Date Range</span>
          <div class="booking-grid">
            <div class="booking-field"><label for="rbStart">From</label><input id="rbStart" type="date" max="${today}" required /></div>
            <div class="booking-field"><label for="rbEnd">To</label><input id="rbEnd" type="date" max="${today}" required /></div>
          </div>
          <button type="submit" class="admin-btn-ghost">Generate Now</button>
        </form>
        <p class="rb-message" id="rbGenerateStatus" role="status" aria-live="polite"></p>
      </section>

      <section class="rb-card" aria-labelledby="rbHistoryTitle">
        <h4 id="rbHistoryTitle">Report history</h4>
        ${!state.loaded ? '<p class="admin-hint">Loading reports…</p>' : state.reports.length ? state.reports.map(reportRowHtml).join('') : '<p class="admin-hint">No reports yet. The first monthly report will appear automatically on the 1st, or generate one above.</p>'}
      </section>

      <section class="rb-card" aria-labelledby="rbBackupTitle">
        <h4 id="rbBackupTitle">Encrypted backup</h4>
        <p class="admin-hint">A full copy of the website's records (members, registrations, orders, settings), separate from the financial report. It is locked with a passphrase you choose. The passphrase is never saved anywhere — if it is lost, the backup cannot be opened.</p>
        <form class="rb-backup" id="rbBackupForm" autocomplete="off">
          <div class="booking-grid">
            <div class="booking-field"><label for="rbPass">Backup passphrase (12+ characters)</label><input id="rbPass" type="password" minlength="12" autocomplete="new-password" required /></div>
            <div class="booking-field"><label for="rbPass2">Type it again</label><input id="rbPass2" type="password" minlength="12" autocomplete="new-password" required /></div>
          </div>
          <button type="submit" class="admin-btn-solid">Create Encrypted Backup</button>
          <p class="rb-message" id="rbBackupStatus" role="status" aria-live="polite"></p>
        </form>
        ${state.backups.length ? state.backups.map(b => `<div class="rb-backup-row"><span>${esc(when(b.createdAt))} · ${b.status === 'ready' ? (b.sizeBytes ? (b.sizeBytes / 1048576).toFixed(1) + ' MB' : '') : esc(b.status)}</span><button type="button" class="admin-btn-ghost" data-rb-backup="${esc(b.id)}"${b.status === 'ready' ? '' : ' disabled'}>Download Backup</button></div>`).join('') : ''}
        <details class="rb-open-backup"><summary>Open a backup file</summary>
          <p class="admin-hint">Unlocks a backup on this computer only — nothing is uploaded. You'll get a readable JSON file.</p>
          <div class="booking-grid">
            <div class="booking-field"><label for="rbOpenFile">Backup file (.uabk)</label><input id="rbOpenFile" type="file" accept=".uabk" /></div>
            <div class="booking-field"><label for="rbOpenPass">Passphrase</label><input id="rbOpenPass" type="password" autocomplete="off" /></div>
          </div>
          <button type="button" class="admin-btn-ghost" id="rbOpenBtn">Unlock Backup</button>
          <p class="rb-message" id="rbOpenStatus" role="status" aria-live="polite"></p>
        </details>
      </section>

      <section class="rb-card" aria-labelledby="rbLogTitle">
        <h4 id="rbLogTitle">Recent activity</h4>
        ${state.events.length ? state.events.map(e => `<div class="rb-log-row"><span>${esc(ACTION_LABELS[e.action] || e.action)}</span><span>${esc(e.reportId || '')}</span><span>${esc(e.by === 'schedule' ? 'Automatic' : 'Owner')}</span><span>${esc(when(e.at))}</span></div>`).join('') : '<p class="admin-hint">Nothing yet.</p>'}
      </section>`;
  }

  async function openFile(reportId, disposition, node, extra = {}){
    if(DEMO_MODE){ node.textContent = 'Preview only — on the live site this opens the private PDF after checking that you are the owner.'; return; }
    // Open the tab first so the browser doesn't treat it as a pop-up.
    const tab = disposition === 'inline' ? window.open('', '_blank') : null;
    node.textContent = 'Preparing a secure link…';
    try {
      const res = await call('createOwnerReportLink')({ reportId, disposition, ...extra });
      if(tab){ tab.location = res.data.url; node.textContent = 'Opened in a new tab.'; }
      else { window.location.assign(res.data.url); node.textContent = 'Downloading…'; }
    } catch (err) { if(tab) tab.close(); node.textContent = friendly(err); }
  }

  async function generate(kind, start, end, statusNode){
    if(DEMO_MODE){ statusNode.textContent = 'Preview only — on the live site this creates the PDF in about a minute.'; return; }
    statusNode.textContent = 'Generating the report… this can take up to a minute.';
    try {
      const res = await call('generateOwnerReport')({ kind, start, end });
      statusNode.textContent = res.data.status === 'ready' ? 'Report ready.' : 'The report could not be generated. Please try again.';
      await load(true); render();
    } catch (err) { statusNode.textContent = friendly(err); }
  }

  async function decryptBackup(file, passphrase){
    const bytes = new Uint8Array(await file.arrayBuffer());
    if(new TextDecoder().decode(bytes.slice(0, 5)) !== BACKUP_MAGIC) throw new Error('That is not an Unveiled Assembly backup file.');
    const salt = bytes.slice(5, 21), iv = bytes.slice(21, 33), tag = bytes.slice(33, 49), body = bytes.slice(49);
    const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(passphrase), 'PBKDF2', false, ['deriveKey']);
    const key = await crypto.subtle.deriveKey({ name: 'PBKDF2', salt, iterations: BACKUP_KDF_ITERATIONS, hash: 'SHA-256' }, base, { name: 'AES-GCM', length: 256 }, false, ['decrypt']);
    const joined = new Uint8Array(body.length + tag.length); joined.set(body); joined.set(tag, body.length);
    try { return await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, joined); }
    catch (err) { throw new Error('Wrong passphrase, or the file is damaged.'); }
  }

  document.addEventListener('click', async event => {
    const t = event.target;
    const row = t.closest('[data-report-id]');
    const msg = row ? row.querySelector('.rb-message') : null;
    if(t.closest('[data-rb-view]')) return openFile(t.closest('[data-rb-view]').dataset.rbView, 'inline', msg);
    if(t.closest('[data-rb-download]')) return openFile(t.closest('[data-rb-download]').dataset.rbDownload, 'attachment', msg);
    if(t.closest('[data-rb-link]')){
      const reportId = t.closest('[data-rb-link]').dataset.rbLink;
      if(DEMO_MODE){ msg.textContent = 'Preview only. Email Service Not Connected — on the live site a new 7-day secure link is created for you to copy.'; return; }
      msg.textContent = 'Creating a new secure link…';
      try {
        const res = await call('issueOwnerReportEmailLink')({ reportId });
        msg.innerHTML = (EMAIL_CONNECTED ? 'Sent. ' : '<strong>Email Service Not Connected.</strong> ') + 'A new secure link was created (works for 7 days, sign-in required; the previous link no longer works): ' +
          `<input class="rb-link-copy" readonly value="${esc(res.data.url)}" aria-label="Secure report link" /> <button type="button" class="admin-btn-ghost" data-rb-copy>Copy</button>`;
      } catch (err) { msg.textContent = friendly(err); }
      return;
    }
    if(t.closest('[data-rb-copy]')){
      const input = t.closest('.rb-message').querySelector('.rb-link-copy');
      try { await navigator.clipboard.writeText(input.value); t.textContent = 'Copied'; } catch (err) { input.select(); }
      return;
    }
    const gen = t.closest('[data-rb-generate]');
    if(gen) return generate(gen.dataset.rbGenerate, null, null, document.getElementById('rbGenerateStatus'));
    const retry = t.closest('[data-rb-retry]');
    if(retry) return generate(retry.dataset.rbRetry === 'custom' ? 'custom' : retry.dataset.rbRetry, retry.dataset.rbStart, retry.dataset.rbEnd, msg);
    const backup = t.closest('[data-rb-backup]');
    if(backup){
      const node = document.getElementById('rbBackupStatus');
      return openFile(backup.dataset.rbBackup, 'attachment', node, { type: 'backup' });
    }
    if(t.closest('#rbOpenBtn')){
      const node = document.getElementById('rbOpenStatus');
      const file = document.getElementById('rbOpenFile').files[0];
      const pass = document.getElementById('rbOpenPass').value;
      if(!file || !pass){ node.textContent = 'Choose the backup file and enter its passphrase.'; return; }
      node.textContent = 'Unlocking…';
      try {
        const plain = await decryptBackup(file, pass);
        const url = URL.createObjectURL(new Blob([plain], { type: 'application/json' }));
        const a = document.createElement('a'); a.href = url; a.download = file.name.replace(/\.uabk$/i, '') + '.json'; a.click();
        setTimeout(() => URL.revokeObjectURL(url), 10000);
        node.textContent = 'Unlocked. The readable file was saved to this computer.';
      } catch (err) { node.textContent = err.message; }
    }
  });
  document.addEventListener('submit', async event => {
    if(event.target.id === 'rbCustomForm'){
      event.preventDefault();
      const start = document.getElementById('rbStart').value, end = document.getElementById('rbEnd').value;
      const node = document.getElementById('rbGenerateStatus');
      if(!start || !end || start > end){ node.textContent = 'Choose a start date on or before the end date.'; return; }
      return generate('custom', start, end, node);
    }
    if(event.target.id === 'rbBackupForm'){
      event.preventDefault();
      const node = document.getElementById('rbBackupStatus');
      const pass = document.getElementById('rbPass').value, pass2 = document.getElementById('rbPass2').value;
      if(pass.length < 12){ node.textContent = 'Use at least 12 characters.'; return; }
      if(pass !== pass2){ node.textContent = 'The two passphrases do not match.'; return; }
      if(DEMO_MODE){ node.textContent = 'Preview only — on the live site this creates an encrypted backup.'; return; }
      node.textContent = 'Creating the encrypted backup… this can take a few minutes.';
      try {
        await call('createOwnerBackup')({ passphrase: pass });
        event.target.reset();
        node.textContent = 'Backup created. Download it below and keep the passphrase somewhere safe.';
        await load(true); render();
      } catch (err) { node.textContent = friendly(err); }
    }
  });

  /* ---------- owner-report.html (emailed link landing page) ---------- */
  async function renderLinkPage(){
    const root = document.getElementById('ownerReportLinkRoot');
    if(!root) return;
    const params = new URLSearchParams(window.location.search);
    const reportId = params.get('r'), linkKey = params.get('k');
    const shell = inner => { root.innerHTML = `<section class="dl-confirm"><div class="dl-confirm-inner">${inner}</div></section>`; };
    if(!reportId || !linkKey){ shell('<span class="shop-micro">Reports</span><h1>Link Incomplete.</h1><p class="dl-confirm-lead">Open Owner Portal → Reports &amp; Backups to view your reports.</p>'); return; }
    if(!getUser()){ shell('<span class="shop-micro">Ministry Report</span><h1>Sign In To View.</h1><p class="dl-confirm-lead">This report is private. Sign in with the ministry owner account to open it.</p><div class="dl-confirm-links"><button type="button" class="shop-primary-action" data-rb-sign-in>Sign In</button></div>'); return; }
    if(!isOwner()){ shell('<span class="shop-micro">Ministry Report</span><h1>Owner Only.</h1><p class="dl-confirm-lead">This report can only be opened with the ministry owner account.</p>'); return; }
    if(DEMO_MODE){ shell('<p class="dl-preview-flag">Preview only.</p><h1>Ministry Report.</h1>'); return; }
    shell('<span class="shop-micro">Ministry Report</span><h1>Checking Link…</h1>');
    try {
      const res = await call('ownerReportLinkDetails')({ reportId, linkKey });
      const r = res.data; const s = r.summary || {};
      shell(`<span class="shop-micro">${esc(KIND_LABELS[r.kind] || 'Ministry Report')}</span><h1>${esc(r.label)}.</h1>
        <p class="dl-confirm-lead">${r.stripeMode === 'live' ? 'Live income' : 'Online payments were in test mode; test transactions are listed separately and are not income.'}</p>
        <dl class="dl-confirm-facts"><div><dt>Received</dt><dd>${esc(money(s.receivedCents))}</dd></div><div><dt>Net</dt><dd>${esc(money(s.netCents))}</dd></div><div><dt>Link expires</dt><dd>${esc(new Date(r.expiresAt).toLocaleDateString())}</dd></div></dl>
        <div class="dl-confirm-links" data-report-id="${esc(r.reportId)}"><button type="button" class="shop-primary-action" data-rb-link-view>View PDF</button><button type="button" class="shop-outline-action" data-rb-link-download>Download PDF</button><p class="rb-message" role="status" aria-live="polite"></p></div>`);
    } catch (err) {
      shell(`<span class="shop-micro">Ministry Report</span><h1>Link Unavailable.</h1><p class="dl-confirm-lead">${esc(friendly(err))}</p>`);
    }
  }
  document.addEventListener('click', event => {
    if(event.target.closest('[data-rb-sign-in]')) return openAccount();
    const params = new URLSearchParams(window.location.search);
    const box = event.target.closest('[data-report-id]');
    if(event.target.closest('[data-rb-link-view]')) return openFile(params.get('r'), 'inline', box.querySelector('.rb-message'), { linkKey: params.get('k') });
    if(event.target.closest('[data-rb-link-download]')) return openFile(params.get('r'), 'attachment', box.querySelector('.rb-message'), { linkKey: params.get('k') });
  });

  return {
    render: async () => { render(); await load(); render(); },
    renderLinkPage
  };
}
