const EVENTS_PREVIEW_KEY = 'ua_preview_events_v1';
const EVENT_ANNOUNCEMENTS_PREVIEW_KEY = 'ua_preview_event_announcements_v1';
const DEFAULT_POSTER_URL = 'assets/assembly-nights-concept-v2.jpg';

const DEFAULT_EVENT = {
  id: 'assembly-nights',
  title: 'Assembly Nights',
  kicker: 'A Special Gathering',
  tagline: 'A night of worship, prayer, and encounter.',
  description: 'A set-apart gathering created for worship, prayer, the Word, and room to respond to the presence of Jesus.',
  date: '',
  time: '',
  timeZone: 'America/New_York',
  venue: '',
  city: '',
  format: 'hybrid',
  status: 'published',
  pageMode: 'live',
  featured: true,
  posterUrl: '',
  ticketUrl: '',
  ticketLabel: 'Register',
  streamUrl: ''
};

function safeUrl(value){
  if(!value) return '';
  try {
    const url = new URL(value, window.location.href);
    return ['http:', 'https:'].includes(url.protocol) ? url.href : '';
  } catch (err) { return ''; }
}

function safeImageUrl(value){
  if(!value) return '';
  if(/^data:image\/(?:jpeg|png|webp);base64,[a-z0-9+/=\r\n]+$/i.test(value)) return value;
  return safeUrl(value);
}

function slugify(value){
  return (value || 'event').toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'event';
}

function dateLabel(date){
  if(!date) return 'Date To Be Revealed';
  try {
    const [year, month, day] = date.split('-').map(Number);
    return new Intl.DateTimeFormat('en-US', { weekday:'long', month:'long', day:'numeric', year:'numeric' }).format(new Date(year, month - 1, day));
  } catch (err) { return date; }
}

function timeLabel(time){
  if(!time) return '';
  const [hour, minute] = time.split(':').map(Number);
  const stamp = new Date(2000, 0, 1, hour, minute);
  return new Intl.DateTimeFormat('en-US', { hour:'numeric', minute: minute ? '2-digit' : undefined }).format(stamp) + ' ET';
}

export function initEventsSystem({ DEMO_MODE, db, firestore, escapeHtml, resizeImage }){
  let events = DEMO_MODE ? [{ ...DEFAULT_EVENT }] : [];
  let announcements = [];
  let countdownTimer = null;
  // Staged editing — Event Details/Announcements/Tickets & Stream all
  // write into these drafts, not straight to events/announcements, so
  // nothing reaches Firestore (or localStorage in DEMO_MODE) until
  // "Save Changes" in the shared #eventsSaveBar is clicked. Previously
  // each of the 3 forms saved immediately on its own submit, and an
  // announcement's Publish/Delete button committed instantly too.
  let EVENT_DRAFT = null;
  let ANNOUNCEMENTS_DRAFT = [];
  let eventsDirty = false;
  let eventsDraftSeq = 1;
  function cloneEventsDraftFromLive(){
    EVENT_DRAFT = JSON.parse(JSON.stringify(editableEvent()));
    ANNOUNCEMENTS_DRAFT = JSON.parse(JSON.stringify(announcements));
  }
  function markEventsDirty(){
    eventsDirty = true;
    const bar = document.getElementById('eventsSaveBar');
    if(bar){ bar.classList.add('is-dirty'); document.getElementById('eventsSaveBarStatus').textContent = 'You have unsaved changes.'; }
  }
  function markEventsClean(){
    eventsDirty = false;
    const bar = document.getElementById('eventsSaveBar');
    if(bar){ bar.classList.remove('is-dirty'); document.getElementById('eventsSaveBarStatus').textContent = 'No changes to save.'; }
  }

  function savePreview(){
    if(!DEMO_MODE) return;
    try {
      localStorage.setItem(EVENTS_PREVIEW_KEY, JSON.stringify(events));
      localStorage.setItem(EVENT_ANNOUNCEMENTS_PREVIEW_KEY, JSON.stringify(announcements));
    } catch (err) { /* preview still works without storage */ }
  }

  function loadPreview(){
    try {
      const savedEvents = JSON.parse(localStorage.getItem(EVENTS_PREVIEW_KEY) || 'null');
      const savedAnnouncements = JSON.parse(localStorage.getItem(EVENT_ANNOUNCEMENTS_PREVIEW_KEY) || 'null');
      if(Array.isArray(savedEvents) && savedEvents.length) events = savedEvents;
      if(Array.isArray(savedAnnouncements)) announcements = savedAnnouncements;
    } catch (err) { /* keep defaults */ }
  }

  async function load(){
    if(DEMO_MODE){
      loadPreview();
    } else {
      try {
        const eventSnap = await firestore.getDocs(firestore.collection(db, 'events'));
        events = [];
        eventSnap.forEach(row => events.push({ id: row.id, ...row.data() }));
      } catch (err) { console.error('[events] could not load events', err); }
      try {
        const announcementSnap = await firestore.getDocs(firestore.query(
          firestore.collection(db, 'eventAnnouncements'),
          firestore.where('status', '==', 'published')
        ));
        announcements = [];
        announcementSnap.forEach(row => announcements.push({ id: row.id, ...row.data() }));
      } catch (err) { console.error('[events] could not load announcements', err); }
    }
    renderAdmin();
    renderPublic();
  }

  async function loadAdmin(){
    if(DEMO_MODE){
      // load() only runs on events.html itself (see the bottom of this
      // file's caller in app.js) — an admin opening the portal from any
      // other page would otherwise see/edit the hardcoded DEFAULT_EVENT
      // instead of whatever was actually last saved to this preview.
      loadPreview();
      renderAdmin();
      return;
    }
    try {
      const [eventSnap, announcementSnap] = await Promise.all([
        firestore.getDocs(firestore.collection(db, 'events')),
        firestore.getDocs(firestore.collection(db, 'eventAnnouncements'))
      ]);
      events = [];
      eventSnap.forEach(row => events.push({ id: row.id, ...row.data() }));
      announcements = [];
      announcementSnap.forEach(row => announcements.push({ id: row.id, ...row.data() }));
    } catch (err) {
      console.error('[events] could not load owner event data', err);
    }
    renderAdmin();
    renderPublic();
  }

  function editableEvent(){
    return events.find(event => event.featured) || events[0] || { ...DEFAULT_EVENT, status: 'draft' };
  }

  function publicEvent(){
    return events.find(event => event.featured && event.status === 'published') ||
      events.find(event => event.status === 'published') || null;
  }

  function eventTargetDate(event){
    if(!event || !event.date) return null;
    const value = event.date + 'T' + (event.time || '00:00') + ':00';
    const target = new Date(value);
    return Number.isNaN(target.getTime()) ? null : target;
  }

  function renderCountdown(event){
    const wrap = document.getElementById('eventsCountdown');
    const note = document.getElementById('eventsCountdownNote');
    if(!wrap || !note) return;
    if(countdownTimer) clearInterval(countdownTimer);
    const target = eventTargetDate(event);
    if(!target){
      wrap.innerHTML = '<div class="events-countdown-unannounced">The next date will be revealed soon.</div>';
      note.textContent = 'Stay close. Details will appear here as soon as they are released.';
      return;
    }
    const update = () => {
      const remaining = target.getTime() - Date.now();
      if(remaining <= 0){
        wrap.innerHTML = '<div class="events-countdown-unannounced">The gathering is here.</div>';
        note.textContent = event.venue || event.city || 'Event details are shown below.';
        clearInterval(countdownTimer);
        return;
      }
      const days = Math.floor(remaining / 86400000);
      const hours = Math.floor((remaining % 86400000) / 3600000);
      const minutes = Math.floor((remaining % 3600000) / 60000);
      wrap.innerHTML = [
        [String(days).padStart(2,'0'), 'Days'],
        [String(hours).padStart(2,'0'), 'Hours'],
        [String(minutes).padStart(2,'0'), 'Minutes']
      ].map(item => '<div><strong>' + item[0] + '</strong><span>' + item[1] + '</span></div>').join('');
      note.textContent = dateLabel(event.date) + (event.time ? ' · ' + timeLabel(event.time) : '');
    };
    update();
    countdownTimer = setInterval(update, 30000);
  }

  function renderPublic(){
    const config = editableEvent();
    const pageMode = config.pageMode || 'live';
    // The owner's site-wide page-visibility toggle (app.js) can also hide
    // this same link — only ever claim/release the hide this function's
    // own pageMode is responsible for, never clear a hide the other
    // system owns (marked with data-hidden-by-page-visibility).
    document.querySelectorAll('[data-events-nav-link]').forEach(link => {
      if(pageMode === 'hidden') link.hidden = true;
      else if(!link.dataset.hiddenByPageVisibility) link.hidden = false;
    });
    const root = document.getElementById('eventsPageRoot');
    if(!root) return;
    const event = pageMode === 'live' ? publicEvent() : null;
    const title = event ? event.title : 'Stay Close';
    const titleEl = document.getElementById('eventsHeroTitle');
    const kickerEl = document.getElementById('eventsHeroKicker');
    const taglineEl = document.getElementById('eventsHeroTagline');
    if(titleEl) titleEl.textContent = title;
    if(kickerEl) kickerEl.textContent = event ? (event.kicker || 'A Special Gathering') : 'Upcoming Gatherings';
    if(taglineEl) taglineEl.textContent = event ? (event.tagline || '') : 'No event is currently scheduled. When the next gathering is ready, every detail will appear here.';

    const poster = document.getElementById('eventsPoster');
    if(poster){
      const posterUrl = event && safeImageUrl(event.posterUrl) ? safeImageUrl(event.posterUrl) : safeUrl(DEFAULT_POSTER_URL);
      poster.classList.add('has-image');
      poster.style.backgroundImage = 'url("' + posterUrl.replace(/"/g, '%22') + '")';
      poster.innerHTML = '<div class="events-poster-grid" aria-hidden="true"></div>' +
        '<div class="events-poster-kicker">The Unveiled Assembly</div>' +
        '<div class="events-poster-word">' + title.split(/\s+/).map(escapeHtml).join('<br>') + '</div>' +
        '<div class="events-poster-meta"><span>' + escapeHtml(event ? dateLabel(event.date) : 'Date To Be Revealed') + '</span><span>' + escapeHtml(event && (event.venue || event.city) ? [event.venue, event.city].filter(Boolean).join(' · ') : 'Gathering Details To Come') + '</span></div>';
    }

    const status = document.getElementById('eventsStatusLine');
    if(status) status.textContent = event ? [dateLabel(event.date), timeLabel(event.time), event.venue, event.city].filter(Boolean).join(' · ') : 'No Upcoming Events';
    const description = document.getElementById('eventsDescription');
    if(description) description.textContent = event ? event.description : 'This space will hold the next special gathering while keeping the same quiet, intentional flow of the page.';

    const actions = document.getElementById('eventsActionRow');
    if(actions){
      const buttons = [];
      if(event && safeUrl(event.ticketUrl)) buttons.push('<a class="events-action primary" target="_blank" rel="noopener" href="' + escapeHtml(safeUrl(event.ticketUrl)) + '">' + escapeHtml(event.ticketLabel || 'Register') + ' ↗</a>');
      if(event && safeUrl(event.streamUrl)) buttons.push('<a class="events-action" target="_blank" rel="noopener" href="' + escapeHtml(safeUrl(event.streamUrl)) + '">Watch Online ↗</a>');
      actions.innerHTML = buttons.join('');
      actions.hidden = buttons.length === 0;
    }

    const announcementWrap = document.getElementById('eventsAnnouncements');
    const publicAnnouncements = (event ? announcements : [])
      .filter(item => item.status === 'published')
      .sort((a,b) => Number(b.pinned) - Number(a.pinned) || String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
    if(announcementWrap){
      announcementWrap.closest('.events-announcements-section').hidden = publicAnnouncements.length === 0;
      announcementWrap.innerHTML = publicAnnouncements.map((item, index) =>
        '<article class="events-announcement"><span>' + String(index + 1).padStart(2,'0') + (item.pinned ? ' / Pinned' : ' / Update') + '</span><div><h3>' + escapeHtml(item.title) + '</h3><p>' + escapeHtml(item.body) + '</p></div></article>'
      ).join('');
    }
    renderCountdown(event);
  }

  function showAdminTab(name){
    document.querySelectorAll('#eventsAdminTabs [data-events-tab]').forEach(button => button.classList.toggle('active', button.dataset.eventsTab === name));
    document.querySelectorAll('[data-events-panel]').forEach(panel => { panel.hidden = panel.dataset.eventsPanel !== name; });
    const saveBar = document.getElementById('eventsSaveBar');
    if(saveBar) saveBar.hidden = !['details', 'announcements', 'access'].includes(name);
  }

  function refreshPosterPreview(){
    const input = document.getElementById('eventAdminPosterUrl');
    const preview = document.getElementById('eventAdminPosterPreview');
    const uploadText = document.getElementById('eventAdminPosterUploadText');
    if(!input || !preview) return;
    const custom = safeImageUrl(input.value.trim());
    const url = custom || safeUrl(DEFAULT_POSTER_URL);
    preview.style.backgroundImage = 'linear-gradient(rgba(0,0,0,.08),rgba(0,0,0,.2)),url("' + url.replace(/"/g, '%22') + '")';
    preview.innerHTML = custom ? '' : '<span class="admin-image-empty">Approved event artwork</span>';
    if(uploadText) uploadText.textContent = custom ? 'Replace Image' : 'Upload Image';
  }

  function renderAdminDetailsForm(){
    const form = document.getElementById('eventDetailsForm');
    if(!form || !EVENT_DRAFT) return;
    const event = EVENT_DRAFT;
    const assign = (id, value) => { const el = document.getElementById(id); if(el) el.value = value || ''; };
    assign('eventAdminTitle', event.title);
    assign('eventAdminKicker', event.kicker);
    assign('eventAdminTagline', event.tagline);
    assign('eventAdminDate', event.date);
    assign('eventAdminTime', event.time);
    assign('eventAdminVenue', event.venue);
    assign('eventAdminCity', event.city);
    assign('eventAdminFormat', event.format || 'in-person');
    assign('eventAdminStatus', event.status || 'draft');
    assign('eventAdminPageMode', event.pageMode || 'live');
    assign('eventAdminDescription', event.description);
    assign('eventAdminPosterUrl', event.posterUrl);
    refreshPosterPreview();
    assign('eventAdminTicketUrl', event.ticketUrl);
    assign('eventAdminTicketLabel', event.ticketLabel || 'Register');
    assign('eventAdminStreamUrl', event.streamUrl);
    document.getElementById('eventAdminFeatured').checked = event.featured !== false;
  }
  function renderAdminOverview(){
    const event = editableEvent();
    const stats = document.getElementById('eventsAdminStats');
    if(stats){
      const published = events.filter(item => item.status === 'published').length;
      const drafts = events.filter(item => item.status === 'draft').length;
      const pageModeLabel = event.pageMode === 'hidden' ? 'Hidden From Navigation' : event.pageMode === 'empty' ? 'No Upcoming Events' : 'Showing Published Event';
      stats.innerHTML = '<div class="admin-stat-tile"><span>Published Events</span><strong>' + published + '</strong></div>' +
        '<div class="admin-stat-tile"><span>Drafts</span><strong>' + drafts + '</strong></div>' +
        '<div class="admin-stat-tile"><span>Announcements</span><strong>' + announcements.length + '</strong></div>' +
        '<div class="admin-stat-tile admin-stat-tile-wide"><span>Featured Event</span><strong style="font-size:18px">' + escapeHtml(event.title || 'Not set') + '</strong></div>' +
        '<div class="admin-stat-tile admin-stat-tile-wide"><span>Event Page</span><strong style="font-size:16px">' + escapeHtml(pageModeLabel) + '</strong></div>';
    }
    const preview = document.getElementById('eventsAdminPreview');
    if(preview){
      preview.innerHTML = '<div class="admin-teaching-row"><div class="admin-teaching-info"><div class="admin-teaching-title-row"><strong>' + escapeHtml(event.title || 'Untitled Event') + '</strong><span class="admin-status-pill ' + (event.status === 'published' ? 'published' : event.status === 'cancelled' ? 'cancelled' : 'draft') + '">' + escapeHtml(event.status || 'draft') + '</span></div><div class="admin-teaching-meta">' + escapeHtml(dateLabel(event.date)) + (event.venue ? ' · ' + escapeHtml(event.venue) : '') + '</div><p style="margin:8px 0 0;color:var(--owner-text-muted)">' + escapeHtml(event.tagline || '') + '</p></div><div class="admin-teaching-actions"><button class="admin-btn-ghost" type="button" data-event-edit>Open Event</button></div></div>';
    }
  }
  function renderAdminAnnouncementsList(){
    const list = document.getElementById('eventAnnouncementsAdminList');
    if(!list) return;
    list.innerHTML = ANNOUNCEMENTS_DRAFT.length ? ANNOUNCEMENTS_DRAFT.map(item =>
      '<div class="admin-teaching-row" data-event-announcement-id="' + escapeHtml(item.id) + '"><div class="admin-teaching-info"><div class="admin-teaching-title-row"><strong>' + escapeHtml(item.title) + '</strong><span class="admin-status-pill ' + (item.status === 'published' ? 'published' : 'draft') + '">' + escapeHtml(item.status) + '</span></div><p style="margin:7px 0 0;color:var(--owner-text-muted)">' + escapeHtml(item.body) + '</p></div><div class="admin-teaching-actions"><button class="admin-btn-ghost" type="button" data-event-announcement-toggle>' + (item.status === 'published' ? 'Move To Draft' : 'Publish') + '</button><button class="admin-btn-ghost" type="button" data-event-announcement-delete>Delete</button></div></div>'
    ).join('') : '<p class="admin-hint">No event announcements yet.</p>';
  }
  function renderAdmin(){
    if(!document.getElementById('eventDetailsForm')) return;
    if(!EVENT_DRAFT || !eventsDirty) cloneEventsDraftFromLive();
    renderAdminOverview();
    renderAdminDetailsForm();
    renderAdminAnnouncementsList();
  }

  async function persistEvent(event){
    events = events.filter(item => item.id !== event.id);
    if(event.featured) events = events.map(item => ({ ...item, featured:false }));
    events.unshift(event);
    if(DEMO_MODE) savePreview();
    else await firestore.setDoc(firestore.doc(db, 'events', event.id), { ...event, updatedAt: firestore.serverTimestamp() }, { merge:true });
    renderAdmin();
    renderPublic();
  }

  async function persistAnnouncement(item){
    announcements = announcements.filter(existing => existing.id !== item.id);
    announcements.unshift(item);
    if(DEMO_MODE) savePreview();
    else await firestore.setDoc(firestore.doc(db, 'eventAnnouncements', item.id), { ...item, updatedAt: firestore.serverTimestamp() }, { merge:true });
    renderAdmin();
    renderPublic();
  }

  document.getElementById('eventsAdminTabs')?.addEventListener('click', event => {
    const button = event.target.closest('[data-events-tab]');
    if(button) showAdminTab(button.dataset.eventsTab);
  });
  document.getElementById('eventsAdminPreview')?.addEventListener('click', event => {
    if(event.target.closest('[data-event-edit]')) showAdminTab('details');
  });
  document.getElementById('eventAdminPosterUrl')?.addEventListener('input', refreshPosterPreview);
  document.getElementById('eventAdminPosterRemove')?.addEventListener('click', () => {
    const input = document.getElementById('eventAdminPosterUrl');
    if(input) input.value = '';
    refreshPosterPreview();
  });
  const posterFile = document.getElementById('eventAdminPosterFile');
  if(posterFile){
    posterFile.addEventListener('change', async () => {
      const file = posterFile.files && posterFile.files[0];
      posterFile.value = '';
      if(!file) return;
      const status = document.getElementById('eventDetailsStatus');
      if(!file.type || !file.type.startsWith('image/')){ if(status) status.textContent = 'Please choose an image file.'; return; }
      if(status) status.textContent = 'Preparing image…';
      try {
        document.getElementById('eventAdminPosterUrl').value = await resizeImage(file, 1600, .75);
        refreshPosterPreview();
        if(status) status.textContent = 'Image ready — save the event when finished.';
      } catch (err) {
        console.error('[events] image upload failed', err);
        if(status) status.textContent = 'That image could not be prepared. Try a JPG, PNG, or WebP.';
      }
    });
    const preview = document.getElementById('eventAdminPosterPreview');
    preview?.addEventListener('dragover', event => { event.preventDefault(); preview.classList.add('is-drag-over'); });
    preview?.addEventListener('dragleave', () => preview.classList.remove('is-drag-over'));
    preview?.addEventListener('drop', event => {
      event.preventDefault(); preview.classList.remove('is-drag-over');
      const file = event.dataTransfer.files && event.dataTransfer.files[0];
      if(file){
        const transfer = new DataTransfer(); transfer.items.add(file); posterFile.files = transfer.files;
        posterFile.dispatchEvent(new Event('change'));
      }
    });
  }
  document.getElementById('eventDetailsForm')?.addEventListener('submit', event => {
    event.preventDefault();
    const title = document.getElementById('eventAdminTitle').value.trim();
    EVENT_DRAFT = {
      ...EVENT_DRAFT,
      id: EVENT_DRAFT.id || slugify(title),
      title,
      kicker: document.getElementById('eventAdminKicker').value.trim(),
      tagline: document.getElementById('eventAdminTagline').value.trim(),
      date: document.getElementById('eventAdminDate').value,
      time: document.getElementById('eventAdminTime').value,
      venue: document.getElementById('eventAdminVenue').value.trim(),
      city: document.getElementById('eventAdminCity').value.trim(),
      format: document.getElementById('eventAdminFormat').value,
      status: document.getElementById('eventAdminStatus').value,
      pageMode: document.getElementById('eventAdminPageMode').value,
      description: document.getElementById('eventAdminDescription').value.trim(),
      posterUrl: document.getElementById('eventAdminPosterUrl').value.trim(),
      featured: document.getElementById('eventAdminFeatured').checked
    };
    document.getElementById('eventDetailsStatus').textContent = 'Updated in this draft — click Save Changes above to publish.';
    markEventsDirty();
  });
  document.getElementById('eventAccessForm')?.addEventListener('submit', event => {
    event.preventDefault();
    EVENT_DRAFT = {
      ...EVENT_DRAFT,
      ticketUrl: document.getElementById('eventAdminTicketUrl').value.trim(),
      ticketLabel: document.getElementById('eventAdminTicketLabel').value.trim() || 'Register',
      streamUrl: document.getElementById('eventAdminStreamUrl').value.trim()
    };
    document.getElementById('eventAccessStatus').textContent = 'Updated in this draft — click Save Changes above to publish.';
    markEventsDirty();
  });
  document.getElementById('eventAnnouncementForm')?.addEventListener('submit', event => {
    event.preventDefault();
    const title = document.getElementById('eventAnnouncementTitle').value.trim();
    const body = document.getElementById('eventAnnouncementBody').value.trim();
    ANNOUNCEMENTS_DRAFT.unshift({
      id: 'draft-ann-' + (eventsDraftSeq++),
      eventId: EVENT_DRAFT.id,
      title,
      body,
      status: document.getElementById('eventAnnouncementStatus').value,
      pinned: document.getElementById('eventAnnouncementPinned').checked,
      createdAt: new Date().toISOString()
    });
    renderAdminAnnouncementsList();
    event.target.reset();
    document.getElementById('eventAnnouncementStatusMsg').textContent = 'Added to this draft — click Save Changes above to publish.';
    markEventsDirty();
  });
  document.getElementById('eventAnnouncementsAdminList')?.addEventListener('click', event => {
    const row = event.target.closest('[data-event-announcement-id]');
    if(!row) return;
    const item = ANNOUNCEMENTS_DRAFT.find(entry => entry.id === row.dataset.eventAnnouncementId);
    if(!item) return;
    if(event.target.closest('[data-event-announcement-toggle]')){
      item.status = item.status === 'published' ? 'draft' : 'published';
    }
    if(event.target.closest('[data-event-announcement-delete]')){
      ANNOUNCEMENTS_DRAFT = ANNOUNCEMENTS_DRAFT.filter(entry => entry.id !== item.id);
    }
    renderAdminAnnouncementsList();
    markEventsDirty();
  });

  document.getElementById('eventsSaveAllBtn')?.addEventListener('click', async () => {
    const saveBtn = document.getElementById('eventsSaveAllBtn');
    const discardBtn = document.getElementById('eventsDiscardBtn');
    const statusEl = document.getElementById('eventsSaveBarStatus');
    saveBtn.disabled = true; discardBtn.disabled = true;
    statusEl.textContent = 'Saving…';
    try {
      const liveEvent = editableEvent();
      if(JSON.stringify(EVENT_DRAFT) !== JSON.stringify(liveEvent)){
        await persistEvent({ ...EVENT_DRAFT, updatedAt: new Date().toISOString() });
      }
      const liveIds = new Set(announcements.map(a => a.id));
      const draftIds = new Set(ANNOUNCEMENTS_DRAFT.map(a => a.id));
      for(const item of ANNOUNCEMENTS_DRAFT){
        if(item.id.startsWith('draft-ann-')){
          const { id, ...data } = item;
          const realId = 'event-ann-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
          await persistAnnouncement({ id: realId, ...data });
        } else {
          const live = announcements.find(a => a.id === item.id);
          if(!live || JSON.stringify(live) !== JSON.stringify(item)) await persistAnnouncement(item);
        }
      }
      for(const id of liveIds){
        if(!draftIds.has(id)){
          announcements = announcements.filter(entry => entry.id !== id);
          if(DEMO_MODE) savePreview();
          else await firestore.deleteDoc(firestore.doc(db, 'eventAnnouncements', id));
        }
      }
      cloneEventsDraftFromLive();
      markEventsClean();
      renderAdmin();
      renderPublic();
      statusEl.textContent = DEMO_MODE ? 'Saved to this preview.' : 'Saved.';
    } catch (err) {
      console.error('[events] save all failed', err);
      statusEl.textContent = 'Could not save — please try again.';
    } finally {
      saveBtn.disabled = false; discardBtn.disabled = false;
    }
  });
  document.getElementById('eventsDiscardBtn')?.addEventListener('click', () => {
    cloneEventsDraftFromLive();
    renderAdminDetailsForm();
    renderAdminAnnouncementsList();
    ['eventDetailsStatus', 'eventAccessStatus', 'eventAnnouncementStatusMsg'].forEach(id => {
      const el = document.getElementById(id); if(el) el.textContent = '';
    });
    markEventsClean();
  });

  function openEditor(){ showAdminTab('details'); renderAdmin(); }

  return { load, loadAdmin, renderPublic, renderAdmin, openEditor };
}
