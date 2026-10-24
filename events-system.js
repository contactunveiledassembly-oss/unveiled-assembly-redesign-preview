const EVENTS_PREVIEW_KEY = 'ua_preview_events_v1';
const EVENT_ANNOUNCEMENTS_PREVIEW_KEY = 'ua_preview_event_announcements_v1';

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
  featured: true,
  posterUrl: '',
  ticketUrl: '',
  ticketLabel: 'Register',
  streamUrl: '',
  pressUrl: '',
  pressNotice: ''
};

function safeUrl(value){
  if(!value) return '';
  try {
    const url = new URL(value, window.location.href);
    return ['http:', 'https:'].includes(url.protocol) ? url.href : '';
  } catch (err) { return ''; }
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

export function initEventsSystem({ DEMO_MODE, db, firestore, escapeHtml }){
  let events = DEMO_MODE ? [{ ...DEFAULT_EVENT }] : [];
  let announcements = [];
  let countdownTimer = null;

  function savePreview(){
    if(!DEMO_MODE) return;
    try {
      localStorage.setItem(EVENTS_PREVIEW_KEY, JSON.stringify(events));
      localStorage.setItem(EVENT_ANNOUNCEMENTS_PREVIEW_KEY, JSON.stringify(announcements));
    } catch (err) { /* preview still works without storage */ }
  }

  async function load(){
    if(DEMO_MODE){
      try {
        const savedEvents = JSON.parse(localStorage.getItem(EVENTS_PREVIEW_KEY) || 'null');
        const savedAnnouncements = JSON.parse(localStorage.getItem(EVENT_ANNOUNCEMENTS_PREVIEW_KEY) || 'null');
        if(Array.isArray(savedEvents) && savedEvents.length) events = savedEvents;
        if(Array.isArray(savedAnnouncements)) announcements = savedAnnouncements;
      } catch (err) { /* keep defaults */ }
    } else {
      try {
        const eventSnap = await firestore.getDocs(firestore.collection(db, 'events'));
        events = [];
        eventSnap.forEach(row => events.push({ id: row.id, ...row.data() }));
      } catch (err) { console.error('[events] could not load events', err); }
      try {
        const announcementSnap = await firestore.getDocs(firestore.collection(db, 'eventAnnouncements'));
        announcements = [];
        announcementSnap.forEach(row => announcements.push({ id: row.id, ...row.data() }));
      } catch (err) { console.error('[events] could not load announcements', err); }
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
    const root = document.getElementById('eventsPageRoot');
    if(!root) return;
    const event = publicEvent();
    const title = event ? event.title : 'Assembly Nights';
    const titleEl = document.getElementById('eventsHeroTitle');
    const kickerEl = document.getElementById('eventsHeroKicker');
    const taglineEl = document.getElementById('eventsHeroTagline');
    if(titleEl) titleEl.textContent = title;
    if(kickerEl) kickerEl.textContent = event ? (event.kicker || 'A Special Gathering') : 'Gather With Us';
    if(taglineEl) taglineEl.textContent = event ? (event.tagline || '') : 'The next special gathering will be announced soon.';

    const poster = document.getElementById('eventsPoster');
    if(poster){
      poster.classList.toggle('has-image', !!(event && safeUrl(event.posterUrl)));
      poster.style.backgroundImage = event && safeUrl(event.posterUrl) ? 'url("' + safeUrl(event.posterUrl).replace(/"/g, '%22') + '")' : '';
      poster.innerHTML = '<div class="events-poster-grid" aria-hidden="true"></div>' +
        '<div class="events-poster-kicker">The Unveiled Assembly</div>' +
        '<div class="events-poster-word">' + title.split(/\s+/).map(escapeHtml).join('<br>') + '</div>' +
        '<div class="events-poster-meta"><span>' + escapeHtml(event ? dateLabel(event.date) : 'Date To Be Revealed') + '</span><span>' + escapeHtml(event && (event.venue || event.city) ? [event.venue, event.city].filter(Boolean).join(' · ') : 'Gathering Details To Come') + '</span></div>';
    }

    const status = document.getElementById('eventsStatusLine');
    if(status) status.textContent = event ? [dateLabel(event.date), timeLabel(event.time), event.venue, event.city].filter(Boolean).join(' · ') : 'The next gathering will be announced soon.';
    const description = document.getElementById('eventsDescription');
    if(description) description.textContent = event ? event.description : 'A set-apart gathering for worship, prayer, the Word, and the presence of Jesus.';

    const actions = document.getElementById('eventsActionRow');
    if(actions){
      const buttons = [];
      if(event && safeUrl(event.ticketUrl)) buttons.push('<a class="events-action primary" target="_blank" rel="noopener" href="' + escapeHtml(safeUrl(event.ticketUrl)) + '">' + escapeHtml(event.ticketLabel || 'Register') + ' ↗</a>');
      if(event && safeUrl(event.streamUrl)) buttons.push('<a class="events-action" target="_blank" rel="noopener" href="' + escapeHtml(safeUrl(event.streamUrl)) + '">Watch Online ↗</a>');
      if(event && safeUrl(event.pressUrl)) buttons.push('<a class="events-action" target="_blank" rel="noopener" href="' + escapeHtml(safeUrl(event.pressUrl)) + '">Media / Press ↗</a>');
      actions.innerHTML = buttons.join('');
      actions.hidden = buttons.length === 0;
    }

    const press = document.getElementById('eventsPressNotice');
    if(press){
      press.hidden = !(event && event.pressNotice);
      press.textContent = event ? event.pressNotice || '' : '';
    }

    const announcementWrap = document.getElementById('eventsAnnouncements');
    const publicAnnouncements = announcements
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
  }

  function renderAdmin(){
    const form = document.getElementById('eventDetailsForm');
    if(!form) return;
    const event = editableEvent();
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
    assign('eventAdminDescription', event.description);
    assign('eventAdminPosterUrl', event.posterUrl);
    assign('eventAdminTicketUrl', event.ticketUrl);
    assign('eventAdminTicketLabel', event.ticketLabel || 'Register');
    assign('eventAdminStreamUrl', event.streamUrl);
    assign('eventAdminPressUrl', event.pressUrl);
    assign('eventAdminPressNotice', event.pressNotice);
    document.getElementById('eventAdminFeatured').checked = event.featured !== false;

    const stats = document.getElementById('eventsAdminStats');
    if(stats){
      const published = events.filter(item => item.status === 'published').length;
      const drafts = events.filter(item => item.status === 'draft').length;
      stats.innerHTML = '<div class="admin-stat-tile"><span>Published Events</span><strong>' + published + '</strong></div>' +
        '<div class="admin-stat-tile"><span>Drafts</span><strong>' + drafts + '</strong></div>' +
        '<div class="admin-stat-tile"><span>Announcements</span><strong>' + announcements.length + '</strong></div>' +
        '<div class="admin-stat-tile admin-stat-tile-wide"><span>Featured Event</span><strong style="font-size:18px">' + escapeHtml(event.title || 'Not set') + '</strong></div>';
    }
    const preview = document.getElementById('eventsAdminPreview');
    if(preview){
      preview.innerHTML = '<div class="admin-teaching-row"><div class="admin-teaching-info"><div class="admin-teaching-title-row"><strong>' + escapeHtml(event.title || 'Untitled Event') + '</strong><span class="admin-status-pill ' + (event.status === 'published' ? 'published' : event.status === 'cancelled' ? 'cancelled' : 'draft') + '">' + escapeHtml(event.status || 'draft') + '</span></div><div class="admin-teaching-meta">' + escapeHtml(dateLabel(event.date)) + (event.venue ? ' · ' + escapeHtml(event.venue) : '') + '</div><p style="margin:8px 0 0;color:var(--owner-text-muted)">' + escapeHtml(event.tagline || '') + '</p></div><div class="admin-teaching-actions"><button class="admin-btn-ghost" type="button" data-event-edit>Open Event</button></div></div>';
    }
    const list = document.getElementById('eventAnnouncementsAdminList');
    if(list){
      list.innerHTML = announcements.length ? announcements.map(item =>
        '<div class="admin-teaching-row" data-event-announcement-id="' + escapeHtml(item.id) + '"><div class="admin-teaching-info"><div class="admin-teaching-title-row"><strong>' + escapeHtml(item.title) + '</strong><span class="admin-status-pill ' + (item.status === 'published' ? 'published' : 'draft') + '">' + escapeHtml(item.status) + '</span></div><p style="margin:7px 0 0;color:var(--owner-text-muted)">' + escapeHtml(item.body) + '</p></div><div class="admin-teaching-actions"><button class="admin-btn-ghost" type="button" data-event-announcement-toggle>' + (item.status === 'published' ? 'Move To Draft' : 'Publish') + '</button><button class="admin-btn-ghost" type="button" data-event-announcement-delete>Delete</button></div></div>'
      ).join('') : '<p class="admin-hint">No event announcements yet.</p>';
    }
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
  document.getElementById('eventDetailsForm')?.addEventListener('submit', async event => {
    event.preventDefault();
    const current = editableEvent();
    const title = document.getElementById('eventAdminTitle').value.trim();
    const item = {
      ...current,
      id: current.id || slugify(title),
      title,
      kicker: document.getElementById('eventAdminKicker').value.trim(),
      tagline: document.getElementById('eventAdminTagline').value.trim(),
      date: document.getElementById('eventAdminDate').value,
      time: document.getElementById('eventAdminTime').value,
      venue: document.getElementById('eventAdminVenue').value.trim(),
      city: document.getElementById('eventAdminCity').value.trim(),
      format: document.getElementById('eventAdminFormat').value,
      status: document.getElementById('eventAdminStatus').value,
      description: document.getElementById('eventAdminDescription').value.trim(),
      posterUrl: document.getElementById('eventAdminPosterUrl').value.trim(),
      featured: document.getElementById('eventAdminFeatured').checked,
      updatedAt: new Date().toISOString()
    };
    const status = document.getElementById('eventDetailsStatus');
    status.textContent = 'Saving…';
    try { await persistEvent(item); status.textContent = DEMO_MODE ? 'Saved to this preview.' : 'Event saved.'; }
    catch (err) { console.error(err); status.textContent = 'Could not save this event.'; }
  });
  document.getElementById('eventAccessForm')?.addEventListener('submit', async event => {
    event.preventDefault();
    const current = editableEvent();
    const item = {
      ...current,
      ticketUrl: document.getElementById('eventAdminTicketUrl').value.trim(),
      ticketLabel: document.getElementById('eventAdminTicketLabel').value.trim() || 'Register',
      streamUrl: document.getElementById('eventAdminStreamUrl').value.trim(),
      pressUrl: document.getElementById('eventAdminPressUrl').value.trim(),
      pressNotice: document.getElementById('eventAdminPressNotice').value.trim(),
      updatedAt: new Date().toISOString()
    };
    const status = document.getElementById('eventAccessStatus');
    status.textContent = 'Saving…';
    try { await persistEvent(item); status.textContent = DEMO_MODE ? 'Saved to this preview.' : 'Access links saved.'; }
    catch (err) { console.error(err); status.textContent = 'Could not save those links.'; }
  });
  document.getElementById('eventAnnouncementForm')?.addEventListener('submit', async event => {
    event.preventDefault();
    const title = document.getElementById('eventAnnouncementTitle').value.trim();
    const body = document.getElementById('eventAnnouncementBody').value.trim();
    const item = {
      id: 'event-ann-' + Date.now().toString(36),
      eventId: editableEvent().id,
      title,
      body,
      status: document.getElementById('eventAnnouncementStatus').value,
      pinned: document.getElementById('eventAnnouncementPinned').checked,
      createdAt: new Date().toISOString()
    };
    const status = document.getElementById('eventAnnouncementStatusMsg');
    status.textContent = 'Saving…';
    try {
      await persistAnnouncement(item);
      event.target.reset();
      status.textContent = DEMO_MODE ? 'Announcement saved to this preview.' : 'Announcement saved.';
    } catch (err) { console.error(err); status.textContent = 'Could not save that announcement.'; }
  });
  document.getElementById('eventAnnouncementsAdminList')?.addEventListener('click', async event => {
    const row = event.target.closest('[data-event-announcement-id]');
    if(!row) return;
    const item = announcements.find(entry => entry.id === row.dataset.eventAnnouncementId);
    if(!item) return;
    if(event.target.closest('[data-event-announcement-toggle]')){
      await persistAnnouncement({ ...item, status: item.status === 'published' ? 'draft' : 'published' });
    }
    if(event.target.closest('[data-event-announcement-delete]')){
      announcements = announcements.filter(entry => entry.id !== item.id);
      if(DEMO_MODE) savePreview();
      else await firestore.deleteDoc(firestore.doc(db, 'eventAnnouncements', item.id));
      renderAdmin();
      renderPublic();
    }
  });

  return { load, renderPublic, renderAdmin };
}
