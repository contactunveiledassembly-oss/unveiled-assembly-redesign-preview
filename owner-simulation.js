/* ---------------------------------------------------------------
   Owner Portal Demo Mode — a self-contained, additive simulation
   layer. This never touches DEMO_MODE or any real Firestore write
   path. When active, it swaps the CONTENTS of the same live arrays
   every existing admin view/detail-dialog already reads (DEMO_BOOKINGS,
   DEMO_TEACHING_REGISTRATIONS, DEMO_MEMBERS, PRAYER_REQUESTS,
   TESTIMONIALS, CLASS_REVIEWS, and the production-cache equivalents),
   backs up whatever was there first, and restores it exactly on exit.
   This is why existing dialogs/lists/analytics need no changes to
   read simulated data correctly — they already read these exact
   variables. Only the WRITE paths need an explicit guard (see
   `simGuardWrite` and its call sites in app.js).
   --------------------------------------------------------------- */
export function initOwnerSimulation({ SESSION_TYPES, getTeachings }){
  const STORAGE_KEY = 'ua_owner_sim_state_v1';
  const DAY_START_HOUR = 6;   // simulated day runs 6:00 AM -> 10:00 PM
  const DAY_END_HOUR = 22;
  const DAY_MS = (DAY_END_HOUR - DAY_START_HOUR) * 60 * 60 * 1000;

  const SCENARIOS = {
    quiet: { label: 'Quiet Day', bookings: [1, 3], prayer: [1, 2], registrations: [0, 2], cancellations: [0, 1] },
    normal: { label: 'Normal Day', bookings: [5, 10], prayer: [2, 5], registrations: [2, 5], cancellations: [0, 2] },
    busy: { label: 'Busy Day', bookings: [15, 25], prayer: [5, 10], registrations: [5, 10], cancellations: [1, 3] },
    major: { label: 'Major Event Day', bookings: [10, 20], prayer: [5, 10], registrations: [10, 20], cancellations: [1, 3] }
  };

  const FIRST_NAMES = ['Jasmine', 'Marcus', 'Ashley', 'Daniel', 'Kendra', 'Jordan', 'Amara', 'Sam', 'Renee', 'Terrence',
    'Danielle', 'Alicia', 'Kevin', 'Patrice', 'Devon', 'Yolanda', 'Isaiah', 'Brianna', 'Trevon', 'Simone',
    'Gregory', 'Faith', 'Bryce', 'Nadia', 'Elijah', 'Camille', 'Anthony', 'Tasha', 'Micah', 'Destiny'];
  const LAST_NAMES = ['Williams', 'Johnson', 'Carter', 'Brooks', 'Lee', 'Okafor', 'Rivera', 'Foster', 'Whitfield', 'Byrd',
    'Dunbar', 'Holloway', 'Lattimore', 'Pierce', 'Monroe', 'Cole', 'Ashby', 'Adeyemi', 'Hutchins', 'Vance'];
  const PRAYER_TOPICS = [
    'strength and peace during a difficult season', 'healing for a family member', 'clarity about a big decision',
    'protection and provision for my household', 'restoration in a broken relationship', 'direction about a new job opportunity',
    'my children as they navigate school and friendships', 'financial breakthrough and wisdom with money',
    'patience and faith while waiting on God’s timing', 'a close friend going through a hard diagnosis'
  ];
  const TESTIMONY_LINES = [
    'I came in carrying so much weight and walked out lighter than I’ve felt in months.',
    'God met me in that room in a way I did not expect.',
    'The teaching answered a question I had been sitting with for years.',
    'I finally understood something about my own story that I had never been able to name before.',
    'What started as just showing up turned into one of the most honest conversations I’ve had with God.'
  ];

  function mulberry32(seed){
    let a = seed >>> 0;
    return function(){
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function hashStr(str){
    let h = 1779033703;
    for(let i = 0; i < str.length; i++){ h = Math.imul(h ^ str.charCodeAt(i), 3432918353); h = (h << 13) | (h >>> 19); }
    return h >>> 0;
  }

  let state = null; // the whole simulation state, see resetState()
  let backup = null; // original live-array contents, restored on exit
  let clockTimer = null;
  const listeners = []; // re-render hooks registered by app.js

  function onChange(fn){ listeners.push(fn); }
  function notify(){ listeners.forEach(fn => { try { fn(); } catch (err) { console.error('[owner-sim] listener failed', err); } }); }

  function randInt(rng, min, max){ return min + Math.floor(rng() * (max - min + 1)); }
  function pick(rng, arr){ return arr[Math.floor(rng() * arr.length)]; }
  function fullName(rng){ return pick(rng, FIRST_NAMES) + ' ' + pick(rng, LAST_NAMES); }
  function emailFor(name, idx){ return name.toLowerCase().replace(/[^a-z]+/g, '.').replace(/^\.|\.$/g, '') + idx + '@example.com'; }
  function pad2(n){ return String(n).padStart(2, '0'); }
  function msToClock(ms){
    const totalMin = Math.round(ms / 60000);
    const h = DAY_START_HOUR + Math.floor(totalMin / 60);
    const m = totalMin % 60;
    const h12 = ((h + 11) % 12) + 1;
    return h12 + ':' + pad2(m) + ' ' + (h >= 12 ? 'PM' : 'AM');
  }

  function activeSessionTypeIds(){
    return Object.keys(SESSION_TYPES).filter(id => SESSION_TYPES[id].active !== false);
  }

  function buildDay(scenarioKey, runId){
    const scenario = SCENARIOS[scenarioKey] || SCENARIOS.normal;
    const rng = mulberry32(hashStr(scenarioKey + ':' + runId));
    const today = new Date();
    const dateStr = today.toISOString().slice(0, 10);

    const members = [];
    const bookings = [];
    const registrations = [];
    const prayerRequests = [];
    const testimonials = [];
    const classReviews = [];
    const payments = [];
    const notifications = [];
    const usedSlots = new Set();
    let notifSeq = 1;
    function addNotif(atMs, type, title, detail, targetKind, targetId){
      notifications.push({ id: 'sim-notif-' + (notifSeq++), atMs, type, title, detail, targetKind, targetId, read: false });
    }
    function makeMember(){
      const name = fullName(rng);
      const idx = members.length + 1;
      const email = emailFor(name, idx);
      // id intentionally == the email a booking/registration/prayer request
      // for this person will carry (uid: null, so app.js's
      // resolveAllMemberProfiles() keys those by normalizeEmail(email)) —
      // using a separate synthetic id here would make that merge treat the
      // same simulated person as two different members.
      const member = { id: email, name, email, role: 'member',
        state: 'Georgia', city: 'Macon', createdAt: new Date(today.getTime() - randInt(rng, 0, 5000) * 60000).toISOString() };
      members.push(member);
      return member;
    }

    // --- Bookings ---
    const typeIds = activeSessionTypeIds().length ? activeSessionTypeIds() : ['15-minute', '30-minute'];
    const bookingCount = randInt(rng, scenario.bookings[0], scenario.bookings[1]);
    for(let i = 0; i < bookingCount; i++){
      const member = makeMember();
      const typeId = pick(rng, typeIds);
      const type = SESSION_TYPES[typeId] || { price: 0, name: 'One-on-One' };
      let hour, slotKey, tries = 0;
      do { hour = randInt(rng, 9, 17); slotKey = hour + ':00'; tries++; } while(usedSlots.has(slotKey) && tries < 20);
      usedSlots.add(slotKey);
      const atMs = randInt(rng, 0, DAY_MS);
      const willCancel = i < (scenario.cancellations ? randInt(rng, scenario.cancellations[0], scenario.cancellations[1]) : 0);
      const status = willCancel ? 'cancelled' : (rng() < 0.85 ? 'confirmed' : 'pending');
      const paid = status === 'confirmed' && Number(type.price) > 0;
      const booking = {
        id: 'sim-booking-' + (i + 1), atMs, slotId: dateStr + '_' + pad2(hour) + ':00', date: dateStr, time: pad2(hour) + ':00',
        sessionType: typeId, name: member.name, email: member.email, uid: null, status,
        amountPaid: paid ? Number(type.price) : 0, transactionId: paid ? 'SIM-' + hashStr(member.email + i).toString(36).toUpperCase() : '',
        confirmationId: 'TUA-SIM' + (1000 + i), bookedAt: new Date(today.getTime() - randInt(rng, 60, 4000) * 60000).toISOString(),
        notes: '', notificationLog: [{ type: 'booking-confirmation', channel: 'email', at: new Date(today.getTime() - randInt(rng, 60, 4000) * 60000).toISOString(), status: 'sent' }]
      };
      bookings.push(booking);
      addNotif(atMs, 'booking', willCancel ? 'Appointment cancelled' : 'New booking request',
        member.name + (willCancel ? ' cancelled their ' : ' requested a ') + (type.name || 'One-on-One') + '.', 'booking', booking.id);
      if(paid){
        const paymentAtMs = Math.min(DAY_MS, atMs + randInt(rng, 5, 40) * 60000);
        payments.push({ id: 'sim-pay-' + (i + 1), kind: 'booking', label: (type.name || 'One-on-One') + ' — ' + member.name,
          amount: Number(type.price), status: 'paid', atMs: paymentAtMs, createdAtMs: paymentAtMs, targetKind: 'booking', targetId: booking.id });
        addNotif(paymentAtMs, 'payment', 'Payment received', '$' + Number(type.price).toFixed(2) + ' from ' + member.name + '.', 'booking', booking.id);
      } else if(status === 'confirmed'){
        payments.push({ id: 'sim-pay-' + (i + 1), kind: 'booking', label: (type.name || 'One-on-One') + ' — ' + member.name,
          amount: Number(type.price) || 0, status: 'pending', atMs, createdAtMs: atMs, targetKind: 'booking', targetId: booking.id });
      }
    }

    // --- Prayer requests ---
    const prayerCount = randInt(rng, scenario.prayer[0], scenario.prayer[1]);
    const prayerStatusPool = ['new', 'new', 'in-progress', 'completed'];
    for(let i = 0; i < prayerCount; i++){
      const member = makeMember();
      const atMs = randInt(rng, 0, DAY_MS);
      const anon = rng() < 0.25;
      const pr = {
        id: 'sim-prayer-' + (i + 1), atMs, firstName: anon ? 'Anonymous' : member.name.split(' ')[0], lastName: anon ? '' : member.name.split(' ')[1],
        email: anon ? '' : member.email, phone: anon ? '' : '+1-555-' + (1000 + i),
        message: 'Please pray for ' + pick(rng, PRAYER_TOPICS) + '.', visibility: anon ? 'anonymous' : 'private',
        status: pick(rng, prayerStatusPool), notes: '', createdAt: new Date(today.getTime() - (DAY_MS - atMs) / 2).toISOString()
      };
      prayerRequests.push(pr);
      addNotif(atMs, 'prayer', 'New prayer request received', (anon ? 'A member' : member.name) + ' submitted a prayer request.', 'prayer', pr.id);
    }

    // --- Testimonials (a light trickle, not scaled with scenario size) ---
    const testimonyCount = randInt(rng, 0, scenarioKey === 'quiet' ? 1 : 2);
    for(let i = 0; i < testimonyCount; i++){
      const member = makeMember();
      const atMs = randInt(rng, 0, DAY_MS);
      const t = {
        id: 'sim-testimony-' + (i + 1), atMs, firstName: member.name.split(' ')[0], lastName: member.name.split(' ')[1],
        email: member.email, phone: '', message: pick(rng, TESTIMONY_LINES), visibility: 'public', status: 'pending',
        title: '', publicDisplayText: '', hasVideoPreview: false, createdAt: new Date(today.getTime() - (DAY_MS - atMs) / 2).toISOString()
      };
      testimonials.push(t);
      addNotif(atMs, 'testimony', 'Testimony awaiting approval', member.name + ' submitted a testimony.', 'testimony', t.id);
    }

    // --- Class registrations (against real published/upcoming classes when available) ---
    const teachings = typeof getTeachings === 'function' ? Object.values(getTeachings() || {}) : [];
    const openClasses = teachings.filter(t => t.status === 'published' && !t.archived);
    const regCount = randInt(rng, scenario.registrations[0], scenario.registrations[1]);
    const regCountByClass = {};
    for(let i = 0; i < regCount; i++){
      const member = makeMember();
      const atMs = randInt(rng, 0, DAY_MS);
      const cls = openClasses.length ? pick(rng, openClasses) : null;
      const capacity = cls && cls.unlimitedCapacity === false && cls.capacity ? Number(cls.capacity) : null;
      const classKey = cls ? cls.id : 'sim-class';
      regCountByClass[classKey] = (regCountByClass[classKey] || 0) + 1;
      if(capacity && regCountByClass[classKey] > capacity) continue; // respect real class capacity
      const reg = {
        id: 'sim-reg-' + (i + 1), atMs, teachingId: classKey, teachingTitle: cls ? cls.title : 'The Prophetic',
        teachingDate: cls ? cls.date : dateStr,
        firstName: member.name.split(' ')[0], lastName: member.name.split(' ')[1], email: member.email, phone: '',
        uid: null, status: 'confirmed', attendanceStatus: 'not-marked', amountPaid: 25,
        confirmationId: 'TUA-SIMR' + (1000 + i), notes: '', registeredAt: new Date(today.getTime() - (DAY_MS - atMs) / 2).toISOString()
      };
      registrations.push(reg);
      addNotif(atMs, 'registration', 'New class registration', member.name + ' registered for ' + reg.teachingTitle + '.', 'registration', reg.id);
    }

    notifications.sort((a, b) => a.atMs - b.atMs);
    return { scenarioKey, runId, dateStr, members, bookings, registrations, prayerRequests, testimonials, classReviews, payments, notifications };
  }

  function loadPersisted(){
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if(!raw) return null;
      const parsed = JSON.parse(raw);
      if(!parsed || !parsed.day) return null;
      return parsed;
    } catch (err) { return null; }
  }
  function persist(){
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ active: state.active, clockMs: state.clockMs, day: state.day, running: state.running, speed: state.speed }));
    } catch (err) { /* ignore */ }
  }

  function freshDay(scenarioKey){
    return buildDay(scenarioKey, Date.now().toString(36) + Math.random().toString(36).slice(2, 6));
  }

  function ensureState(){
    if(state) return;
    const persisted = loadPersisted();
    if(persisted){
      state = { active: !!persisted.active, clockMs: persisted.clockMs || 0, day: persisted.day, running: false, speed: persisted.speed || 1 };
    } else {
      state = { active: false, clockMs: 0, day: freshDay('normal'), running: false, speed: 1 };
    }
  }

  function visible(list){ return list.filter(item => item.atMs === undefined || item.atMs <= state.clockMs); }
  function visibleNotifications(){ return visible(state.day.notifications); }
  function visibleBookings(){ return visible(state.day.bookings); }
  function visibleRegistrations(){ return visible(state.day.registrations); }
  function visiblePrayerRequests(){ return visible(state.day.prayerRequests); }
  function visibleTestimonials(){ return visible(state.day.testimonials); }
  function visiblePayments(){ return visible(state.day.payments); }
  function visibleMembers(){
    // Members "exist" once any of their events have fired.
    const activeIds = new Set();
    visibleBookings().forEach(b => activeIds.add(b.email));
    visibleRegistrations().forEach(r => activeIds.add(r.email));
    visiblePrayerRequests().forEach(p => activeIds.add(p.email));
    return state.day.members.filter(m => activeIds.has(m.email));
  }

  // --- Swap machinery -------------------------------------------------
  function swapIn(refs){
    backup = {
      DEMO_BOOKINGS: refs.getDemoBookings(), DEMO_TEACHING_REGISTRATIONS: refs.getDemoRegistrations(),
      DEMO_MEMBERS: refs.getDemoMembers(), PRAYER_REQUESTS: refs.getPrayerRequests(),
      TESTIMONIALS: refs.getTestimonials(), CLASS_REVIEWS: refs.getClassReviews(),
      OWNER_ALL_BOOKINGS_CACHE: refs.getOwnerAllBookingsCache(), OWNER_ALL_REGISTRATIONS_CACHE: refs.getOwnerAllRegistrationsCache(),
      PRODUCTION_MEMBERS_CACHE: refs.getProductionMembersCache()
    };
    refs.setDemoBookings(visibleBookings());
    refs.setDemoRegistrations(visibleRegistrations());
    refs.setDemoMembers(visibleMembers());
    refs.setPrayerRequests(visiblePrayerRequests());
    refs.setTestimonials(visibleTestimonials());
    refs.setClassReviews(state.day.classReviews);
    refs.setOwnerAllBookingsCache(visibleBookings());
    refs.setOwnerAllRegistrationsCache(visibleRegistrations());
    refs.setProductionMembersCache(visibleMembers());
  }
  function refreshSwap(refs){
    if(!state.active) return;
    refs.setDemoBookings(visibleBookings());
    refs.setDemoRegistrations(visibleRegistrations());
    refs.setDemoMembers(visibleMembers());
    refs.setPrayerRequests(visiblePrayerRequests());
    refs.setTestimonials(visibleTestimonials());
    refs.setOwnerAllBookingsCache(visibleBookings());
    refs.setOwnerAllRegistrationsCache(visibleRegistrations());
    refs.setProductionMembersCache(visibleMembers());
  }
  function swapOut(refs){
    if(!backup) return;
    refs.setDemoBookings(backup.DEMO_BOOKINGS); refs.setDemoRegistrations(backup.DEMO_TEACHING_REGISTRATIONS);
    refs.setDemoMembers(backup.DEMO_MEMBERS); refs.setPrayerRequests(backup.PRAYER_REQUESTS);
    refs.setTestimonials(backup.TESTIMONIALS); refs.setClassReviews(backup.CLASS_REVIEWS);
    refs.setOwnerAllBookingsCache(backup.OWNER_ALL_BOOKINGS_CACHE); refs.setOwnerAllRegistrationsCache(backup.OWNER_ALL_REGISTRATIONS_CACHE);
    refs.setProductionMembersCache(backup.PRODUCTION_MEMBERS_CACHE);
    backup = null;
  }

  let dataRefs = null;
  function bindDataRefs(refs){ dataRefs = refs; }

  function isActive(){ ensureState(); return state.active; }
  function setActive(next){
    ensureState();
    state.active = next;
    if(next) swapIn(dataRefs); else swapOut(dataRefs);
    persist();
    notify();
  }
  function setScenario(key){
    ensureState();
    state.day = freshDay(key);
    state.clockMs = 0;
    state.running = false;
    if(clockTimer){ clearInterval(clockTimer); clockTimer = null; }
    if(state.active) refreshSwap(dataRefs);
    persist();
    notify();
  }
  function reset(){ setScenario(state.day.scenarioKey); }
  function advanceMs(ms){
    ensureState();
    state.clockMs = Math.min(DAY_MS, state.clockMs + ms);
    if(state.active) refreshSwap(dataRefs);
    persist();
    notify();
  }
  function advanceHour(){ advanceMs(60 * 60 * 1000); }
  function advanceDay(){
    if(state.clockMs < DAY_MS){ advanceMs(DAY_MS); }
    else { setScenario(state.day.scenarioKey); }
  }
  function setSpeed(mult){ ensureState(); state.speed = mult; persist(); }
  function start(){
    ensureState();
    if(state.running) return;
    state.running = true;
    persist(); notify();
    clockTimer = setInterval(() => {
      if(state.clockMs >= DAY_MS){ pause(); return; }
      advanceMs(2 * 60 * 1000 * state.speed); // ~2 simulated minutes per real tick, scaled by speed
    }, 1000);
  }
  function pause(){
    ensureState();
    state.running = false;
    if(clockTimer){ clearInterval(clockTimer); clockTimer = null; }
    persist(); notify();
  }
  function markNotificationRead(id, read){
    ensureState();
    const n = state.day.notifications.find(x => x.id === id);
    if(n) n.read = read !== false;
    persist(); notify();
  }
  function clockLabel(){ ensureState(); return msToClock(state.clockMs) + ' — ' + state.day.dateStr; }
  function scenarioLabel(){ ensureState(); return (SCENARIOS[state.day.scenarioKey] || SCENARIOS.normal).label; }

  return {
    SCENARIOS, bindDataRefs, isActive, setActive, setScenario, reset, advanceHour, advanceDay, setSpeed,
    start, pause, markNotificationRead, onChange,
    get running(){ ensureState(); return state.running; },
    get clockMs(){ ensureState(); return state.clockMs; },
    get dayMs(){ return DAY_MS; },
    get scenarioKey(){ ensureState(); return state.day.scenarioKey; },
    clockLabel, scenarioLabel,
    visibleNotifications: () => { ensureState(); return visibleNotifications(); },
    visiblePayments: () => { ensureState(); return visiblePayments(); },
    visibleBookings: () => { ensureState(); return visibleBookings(); },
    visiblePrayerRequests: () => { ensureState(); return visiblePrayerRequests(); },
    visibleTestimonials: () => { ensureState(); return visibleTestimonials(); },
    visibleRegistrations: () => { ensureState(); return visibleRegistrations(); },
    visibleMembers: () => { ensureState(); return visibleMembers(); }
  };
}
