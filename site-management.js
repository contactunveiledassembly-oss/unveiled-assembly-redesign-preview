const ONE_ON_ONE_DEFAULTS = {
  hero: {
    eyebrow: 'Personal Ministry', title: 'One\nOn One',
    subtitle: 'Prayer. Direction. Discernment.\nBiblical Guidance.',
    button: 'Book A Session →', description: 'A safe space to seek, listen,\nand walk in clarity.',
    words: 'Come\nSeek\nListen\nDiscern\nFind Direction'
  },
  principles: [
    { label: 'Prayer', description: 'Seek God. Bring it all before Him.' },
    { label: 'Direction', description: 'Gain clarity. Discern next steps.' },
    { label: 'Discernment', description: 'Receive biblical insight and wisdom.' },
    { label: 'Next Steps', description: 'Leave with practical guidance.' }
  ],
  booking: { eyebrow: 'Book Your Session', title: 'Choose\nYour Time', description: 'Select a session type and book a time that works for you.' },
  support: 'Your contribution supports the work of The Unveiled Assembly — helping fund ministry, outreach, and resources like food drives, gatherings, and community initiatives. A One-on-One is time for honest conversation, prayer, and biblical guidance — not the purchase of prophecy or a guaranteed prophetic word.',
  expect: {
    eyebrow: 'What To Expect', title: 'A Safe &\nFocused Space.',
    items: [
      'A private, confidential conversation.',
      'A Christ-centered, Bible-based approach.',
      'Prayer, guidance, and practical insight.',
      'A listening ear and honest direction.',
      'Leave with clarity and next steps.'
    ]
  },
  closing: {
    eyebrow: 'Come As You Are', title: 'Real Conversations.\nReal Direction.',
    description: "Whether you're seeking clarity, prayer, or biblical guidance, this is a space for you.",
    button: 'Book A Session →'
  },
  images: {
    hero: 'assets/one-on-one/hero-v4.png', booking: 'assets/one-on-one/booking-v2.png',
    expect: 'assets/one-on-one/expect-v3.png', closing: 'assets/one-on-one/closing-v3.png'
  }
};

const HOME_DEFAULTS = {
  eyebrow: 'Prayer · Teaching · Presence',
  headlineMain: 'Christ Revealed.',
  headlineSub: 'A People Unveiled.',
  copy: 'Gathering hearts in prayer, teaching, and the presence of Jesus.',
  primaryButton: 'Enter The Assembly',
  secondaryButton: 'Explore Teachings'
};

// Keyed by the belief card's existing id="" attribute in beliefs.html
// (jesus-christ, salvation, …) — the same ids the page's own script
// already uses to reorder the grid, so no new markup hooks were
// needed to make each card editable.
const BELIEFS_DEFAULTS = {
  hero: {
    eyebrow: 'Beliefs',
    title: 'What We\nBelieve',
    sub: 'Jesus at the center. Grace as the promise. Identity as the fruit.'
  },
  intro: "At The Assembly, our beliefs are centered on Jesus Christ, His finished work, and the identity we have received through Him.",
  order: ['jesus-christ', 'triune-god', 'scriptures', 'salvation', 'repentance', 'baptism', 'church', 'spiritual-gifts', 'deliverance', 'approach'],
  beliefs: {
    'jesus-christ': {
      title: 'Jesus Christ',
      body: "We believe in the Lord Jesus Christ, the Son of God, born of a virgin, who lived without sin and gave His life on the cross for humanity. We believe He rose again and is seated at the right hand of the Father. He is the King of Kings and Lord of Lords, and His name is above every name.",
      scripture: 'Matthew 1:23 • Hebrews 4:15 • Philippians 2:8–11 • Hebrews 12:2'
    },
    'salvation': {
      title: 'Salvation',
      body: "We believe salvation is an eternal promise established and kept by Jesus Christ. Salvation is not earned or maintained through human behavior, but received through Christ and His finished work. We believe salvation establishes a new identity in Him, secured by His promise rather than our own ability to preserve ourselves.",
      scripture: 'John 10:27–29 • Ephesians 2:8–9 • Hebrews 10:14 • Romans 8:38–39'
    },
    'triune-god': {
      title: 'The Triune God',
      body: "We believe in one eternal God revealed in three distinct persons: Father, Son, and Holy Spirit. We receive and honor the fullness of who God has revealed Himself to be.",
      scripture: 'Matthew 28:19 • 2 Corinthians 13:14 • Matthew 3:16–17'
    },
    'scriptures': {
      title: 'The Scriptures',
      body: "We believe the Bible is the true Word of God, given for His people and profitable for teaching, correction, instruction, and spiritual maturity. Scripture provides a trustworthy testimony of God's character and serves as a dependable reference for the life we live unto Him.",
      scripture: '2 Timothy 3:16–17 • 2 Peter 1:20–21 • Psalm 119:105'
    },
    'spiritual-gifts': {
      title: 'Spiritual Gifts',
      body: "We believe the gifts of the Holy Spirit remain active today, including prophecy, teaching, healing, deliverance, tongues, and other spiritual gifts. We believe these gifts are expressions of God's love, mercy, power, and glory through His people, demonstrating that Jesus Christ is still alive and active among us.",
      scripture: '1 Corinthians 12:4–11 • Acts 2:17–18 • Romans 12:6–8 • 1 Corinthians 14:1'
    },
    'church': {
      title: 'The Church',
      body: "We believe the Church is the Body of Christ, the gathering and community of those who are in Him. The Church is not ultimately a building, location, or event, but a people who share an identity and life in Christ.",
      scripture: '1 Corinthians 12:27 • Ephesians 2:19–22 • Ephesians 4:4–6'
    },
    'repentance': {
      title: 'Repentance',
      body: "We believe repentance begins with a change of mind, a turning from false conclusions and returning to the truth revealed in Christ. As our minds are renewed toward God and our identity in Him, our lives progressively mature and our behavior increasingly reflects the Christ we have come to know.",
      scripture: 'Romans 12:2 • Acts 2:38 • 2 Corinthians 3:18 • Colossians 3:9–10'
    },
    'baptism': {
      title: 'Baptism',
      body: "We believe baptism is an outward expression of faith in Christ. Baptism does not save a person, but it is a meaningful act of obedience, identification, and public witness. It symbolizes the believer's union with Christ in His death, burial, and resurrection.",
      scripture: 'Romans 6:3–4 • Colossians 2:12 • Acts 2:38 • 1 Peter 3:21'
    },
    'deliverance': {
      title: 'Deliverance',
      body: "We believe true deliverance is found in Jesus Christ and the truth of His Word. Freedom begins through believing the Gospel, the renewing of the mind, and a transformed posture of the heart toward Christ. Practices such as renouncing, denouncing, or casting out demons may have a place in ministry, but the practice itself is not what saves or guarantees freedom. Our confidence is not in a formula or ritual, but in Christ, His finished work, and the truth that makes us free.",
      scripture: 'John 8:31–36 • Romans 12:2 • Colossians 1:13–14 • John 17:17 • Romans 1:16 • 2 Corinthians 3:17'
    },
    'approach': {
      title: 'Our Approach to Scripture',
      body: "We believe Scripture should be studied within its proper context. This includes examining the original languages in which the biblical texts were written, particularly Hebrew, Aramaic, and Greek, when necessary to better understand the meaning of words, phrases, and passages within their historical and literary context. Our desire is not simply to read words from Scripture, but to understand as accurately as possible what was being communicated and how it reveals the character and purposes of God.",
      scripture: '2 Timothy 2:15 • Nehemiah 8:8 • Acts 17:11'
    }
  }
};

const GIVE_DEFAULTS = {
  hero: {
    eyebrow: 'Generosity In Action', title: 'Give', kicker: 'Generosity That Moves Beyond The Walls.',
    copy: 'Your generosity helps The Unveiled Assembly serve people, strengthen outreach, create ministry resources, and meet practical needs throughout our community.',
    words: 'People\nCommunity\nOutreach\nResources\nA Greater Work'
  },
  event: {
    enabled: true, label: 'Community Giving Event', title: 'Autumn Food Drive', date: '', startTime: '', endTime: '',
    locationEnabled: true, location: 'Location to be announced',
    details: 'Help us prepare shelf-stable groceries and meal bags for neighbors experiencing homelessness.',
    button: 'Support The Drive'
  },
  community: {
    eyebrow: 'A Ministry Of Presence', title: 'Feeding Our Community',
    intro: 'Food drives are one of the central ways The Unveiled Assembly serves people experiencing homelessness. We gather food, prepare meals, and meet neighbors with dignity, care, and practical support.',
    stories: [
      { title: 'Prepare With Care', copy: 'Gifts help make room for food, water, serving supplies, and the practical details behind every outreach day.' },
      { title: 'Serve With Dignity', copy: 'The heart is not simply distribution. It is seeing people, honoring them, and showing up with compassion.' },
      { title: 'Keep Showing Up', copy: 'Consistent giving helps the ministry plan future food drives and respond when community needs arise.' }
    ]
  },
  form: { eyebrow: 'Make A Difference', title: 'Give Today', copy: 'Choose an amount and a secure giving method.' },
  closing: { eyebrow: 'Together, We Go Further', title: 'More Than\nA Donation.', copy: 'Every gift can become a meal, a resource, a gathering, or a moment of care. Thank you for helping us serve with consistency and love.' },
  images: {
    hero: 'assets/give/hero-editorial-v2.png', event: 'assets/give/event-handoff-v2.png',
    community: 'assets/give/community-meals-v2.png', giving: 'assets/give/giving-panel-v2.png'
  }
};

const DEMO_DISCOUNT_DEFAULTS = [
  { id: 'demo-grace20', code: 'GRACE20', type: 'percent', amount: 20, scope: 'both', active: true, expiresAt: '', maxUses: null, usedCount: 0, redeemedSourceIds: [], lastRedeemedSourceId: null }
];

function clone(value){ return JSON.parse(JSON.stringify(value)); }
function money(value){ return '$' + Number(value || 0).toFixed(2); }
function normalizeCode(value){ return String(value || '').trim().toUpperCase().replace(/\s+/g, ''); }
function htmlLines(value, escapeHtml){ return String(value || '').split('\n').map(escapeHtml).join('<br>'); }

export function initSiteManagement(context){
  const { DEMO_MODE, db, firestore, escapeHtml, getBookingSubtotal, getTeachingSubtotal, rerenderBookingSummary, rerenderTeachingSummary } = context;
  const { doc, setDoc, getDoc, collection, getDocs, updateDoc, deleteDoc, serverTimestamp, runTransaction } = firestore;
  const PAGE_STORAGE_KEYS = { 'one-on-one': 'uaOneOnOnePageContent', home: 'uaHomePageContent', beliefs: 'uaBeliefsPageContent', give: 'uaGivePageContent' };
  const DISCOUNT_STORAGE_KEY = 'uaDiscountCodes';
  let pageContent = clone(ONE_ON_ONE_DEFAULTS);
  let homeContent = clone(HOME_DEFAULTS);
  let beliefsContent = clone(BELIEFS_DEFAULTS);
  let giveContent = clone(GIVE_DEFAULTS);
  let discountCodes = [];
  let discountsLoaded = false;
  const appliedDiscounts = { oneonone: null, teaching: null };

  if(!document.querySelector('link[data-owner-content-discounts]')){
    const link = document.createElement('link');
    link.rel = 'stylesheet'; link.href = new URL('./assets/owner-content-discounts.css?v=1', import.meta.url).href;
    link.dataset.ownerContentDiscounts = '';
    document.head.appendChild(link);
  }

  function mergePageContent(saved){
    if(!saved || typeof saved !== 'object') return clone(ONE_ON_ONE_DEFAULTS);
    return {
      ...clone(ONE_ON_ONE_DEFAULTS), ...saved,
      hero: { ...ONE_ON_ONE_DEFAULTS.hero, ...(saved.hero || {}) },
      booking: { ...ONE_ON_ONE_DEFAULTS.booking, ...(saved.booking || {}) },
      expect: { ...ONE_ON_ONE_DEFAULTS.expect, ...(saved.expect || {}) },
      closing: { ...ONE_ON_ONE_DEFAULTS.closing, ...(saved.closing || {}) },
      images: { ...ONE_ON_ONE_DEFAULTS.images, ...(saved.images || {}) },
      principles: Array.isArray(saved.principles) ? saved.principles.slice(0, 4).map((item, i) => ({ ...ONE_ON_ONE_DEFAULTS.principles[i], ...item })) : clone(ONE_ON_ONE_DEFAULTS.principles)
    };
  }
  function mergeHomeContent(saved){
    if(!saved || typeof saved !== 'object') return clone(HOME_DEFAULTS);
    return { ...clone(HOME_DEFAULTS), ...saved };
  }
  function mergeBeliefsContent(saved){
    if(!saved || typeof saved !== 'object') return clone(BELIEFS_DEFAULTS);
    const merged = { ...clone(BELIEFS_DEFAULTS), ...saved, hero: { ...BELIEFS_DEFAULTS.hero, ...(saved.hero || {}) }, order: BELIEFS_DEFAULTS.order };
    merged.beliefs = {};
    BELIEFS_DEFAULTS.order.forEach(id => { merged.beliefs[id] = { ...BELIEFS_DEFAULTS.beliefs[id], ...((saved.beliefs || {})[id] || {}) }; });
    return merged;
  }
  function mergeGiveContent(saved){
    if(!saved || typeof saved !== 'object') return clone(GIVE_DEFAULTS);
    const merged = {
      ...clone(GIVE_DEFAULTS), ...saved,
      hero: { ...GIVE_DEFAULTS.hero, ...(saved.hero || {}) },
      event: { ...GIVE_DEFAULTS.event, ...(saved.event || {}) },
      community: { ...GIVE_DEFAULTS.community, ...(saved.community || {}) },
      form: { ...GIVE_DEFAULTS.form, ...(saved.form || {}) },
      closing: { ...GIVE_DEFAULTS.closing, ...(saved.closing || {}) },
      images: { ...GIVE_DEFAULTS.images, ...(saved.images || {}) }
    };
    merged.community.stories = Array.isArray(saved.community?.stories)
      ? saved.community.stories.slice(0, 3).map((item, i) => ({ ...GIVE_DEFAULTS.community.stories[i], ...item }))
      : clone(GIVE_DEFAULTS.community.stories);
    return merged;
  }

  function setText(id, value){ const node = document.getElementById(id); if(node) node.textContent = value || ''; }
  function setLines(id, value){ const node = document.getElementById(id); if(node) node.innerHTML = htmlLines(value, escapeHtml); }
  function setBackground(selector, value){
    const node = document.querySelector(selector);
    if(node && value) node.style.backgroundImage = "url('" + String(value).replace(/'/g, '%27') + "')";
  }
  function applyOneOnOnePage(){
    if(document.body.dataset.page !== 'one-on-one') return;
    setText('ooHeroEyebrow', pageContent.hero.eyebrow);
    setLines('ooHeroTitle', pageContent.hero.title);
    setLines('ooHeroSubtitle', pageContent.hero.subtitle);
    setText('ooHeroButton', pageContent.hero.button);
    setLines('ooHeroDescription', pageContent.hero.description);
    setLines('ooHeroWords', pageContent.hero.words);
    document.querySelectorAll('[data-oo-principle]').forEach((row, i) => {
      const item = pageContent.principles[i];
      if(!item) return;
      const label = row.querySelector('.oo-principle-label');
      const desc = row.querySelector('.oo-principle-desc');
      if(label) label.textContent = item.label;
      if(desc) desc.textContent = item.description;
    });
    setText('ooBookingEyebrow', pageContent.booking.eyebrow);
    setLines('ooBookingTitle', pageContent.booking.title);
    setText('ooBookingDescription', pageContent.booking.description);
    setText('ooSupportText', pageContent.support);
    setText('ooExpectEyebrow', pageContent.expect.eyebrow);
    setLines('ooExpectTitle', pageContent.expect.title);
    document.querySelectorAll('[data-oo-expect]').forEach((row, i) => {
      const p = row.querySelector('p');
      if(p) p.textContent = pageContent.expect.items[i] || '';
    });
    setText('ooClosingEyebrow', pageContent.closing.eyebrow);
    setLines('ooClosingTitle', pageContent.closing.title);
    setText('ooClosingDescription', pageContent.closing.description);
    setText('ooClosingButton', pageContent.closing.button);
    setBackground('.oo-hero-media', pageContent.images.hero);
    setBackground('.oo-booking-image', pageContent.images.booking);
    setBackground('.oo-expect-media', pageContent.images.expect);
    setBackground('.oo-closing-media', pageContent.images.closing);
  }
  function applyHomePage(){
    if(document.body.dataset.page !== 'home') return;
    const root = document.getElementById('homeRoot');
    if(!root) return;
    const eyebrow = root.querySelector('.intro > .eyebrow');
    if(eyebrow) eyebrow.textContent = homeContent.eyebrow;
    const main = document.getElementById('homeHeadlineMain');
    const sub = document.getElementById('homeHeadlineSub');
    if(main) main.textContent = homeContent.headlineMain;
    if(sub) sub.textContent = homeContent.headlineSub;
    const copy = root.querySelector('.intro-copy');
    if(copy) copy.textContent = homeContent.copy;
    const primary = root.querySelector('.hero-action:not(.secondary)');
    const secondary = root.querySelector('.hero-action.secondary');
    if(primary) primary.textContent = homeContent.primaryButton;
    if(secondary) secondary.textContent = homeContent.secondaryButton;
  }
  function applyBeliefsPage(){
    if(document.body.dataset.page !== 'beliefs') return;
    const hero = document.querySelector('.ub-family-hero-content');
    if(hero){
      const eyebrow = hero.querySelector('.ub-eyebrow');
      const title = hero.querySelector('.ub-family-hero-title');
      const sub = hero.querySelector('.ub-family-hero-sub');
      if(eyebrow) eyebrow.textContent = beliefsContent.hero.eyebrow;
      if(title) title.innerHTML = htmlLines(beliefsContent.hero.title, escapeHtml);
      if(sub) sub.textContent = beliefsContent.hero.sub;
    }
    // The live markup wraps "Jesus Christ" in <strong> here; the editor
    // only offers plain text, so until the owner actually changes this
    // field we leave the original HTML (and its bold) untouched rather
    // than overwrite it with an unstyled copy on every page load.
    if(beliefsContent.intro !== BELIEFS_DEFAULTS.intro) setText('beliefs-intro', beliefsContent.intro);
    beliefsContent.order.forEach(id => {
      const card = document.getElementById(id);
      if(!card) return;
      const item = beliefsContent.beliefs[id];
      const h2 = card.querySelector('.ub-belief-card-head h2');
      const body = card.querySelector('.ub-belief-body p');
      const scripture = card.querySelector('.ub-scripture');
      if(h2) h2.textContent = item.title;
      if(body) body.textContent = item.body;
      if(scripture) scripture.innerHTML = '<strong>Scripture:</strong> ' + escapeHtml(item.scripture);
    });
  }

  function giveDate(value){
    if(!value) return 'Date to be announced';
    const parts = String(value).split('-').map(Number);
    if(parts.length !== 3 || parts.some(Number.isNaN)) return value;
    return new Intl.DateTimeFormat('en-US', { weekday:'long', month:'long', day:'numeric', year:'numeric' }).format(new Date(parts[0], parts[1] - 1, parts[2]));
  }
  function giveClock(value){
    if(!value) return '';
    const parts = String(value).split(':').map(Number);
    if(parts.length < 2 || parts.some(Number.isNaN)) return value;
    return new Intl.DateTimeFormat('en-US', { hour:'numeric', minute:'2-digit' }).format(new Date(2000, 0, 1, parts[0], parts[1]));
  }
  function applyGivePage(){
    if(document.body.dataset.page !== 'give') return;
    setText('giveHeroEyebrow', giveContent.hero.eyebrow); setText('giveHeroTitle', giveContent.hero.title);
    setText('giveHeroKicker', giveContent.hero.kicker); setText('giveHeroCopy', giveContent.hero.copy); setLines('giveHeroWords', giveContent.hero.words);
    const event = giveContent.event;
    const eventRoot = document.getElementById('giveFeaturedEvent'); if(eventRoot) eventRoot.hidden = event.enabled === false;
    setText('giveEventLabel', event.label); setText('giveEventTitle', event.title); setText('giveEventDate', giveDate(event.date));
    const start = giveClock(event.startTime), end = giveClock(event.endTime); setText('giveEventTime', start ? (end ? start + ' – ' + end : start) : 'Time to be announced');
    const locationWrap = document.getElementById('giveEventLocationWrap'); if(locationWrap) locationWrap.hidden = event.locationEnabled === false;
    setText('giveEventLocation', event.location || 'Location to be announced'); setText('giveEventDetails', event.details); setText('giveEventButton', event.button);
    setText('giveCommunityEyebrow', giveContent.community.eyebrow); setText('giveCommunityTitle', giveContent.community.title); setText('giveCommunityIntro', giveContent.community.intro);
    giveContent.community.stories.forEach((item, i) => { const word = ['One','Two','Three'][i]; setText('giveStory' + word + 'Title', item.title); setText('giveStory' + word + 'Copy', item.copy); });
    setText('giveFormEyebrow', giveContent.form.eyebrow); setText('giveFormTitle', giveContent.form.title); setText('giveFormCopy', giveContent.form.copy);
    setText('giveClosingEyebrow', giveContent.closing.eyebrow); setLines('giveClosingTitle', giveContent.closing.title); setText('giveClosingCopy', giveContent.closing.copy);
    setBackground('.gv-hero-media', giveContent.images.hero); setBackground('.give-feature-media', giveContent.images.event);
    setBackground('.give-story-image', giveContent.images.community); setBackground('.gv-donate-image', giveContent.images.giving);
  }

  async function loadPageContentDoc(pageId, defaults, merge){
    try {
      if(DEMO_MODE){
        const raw = localStorage.getItem(PAGE_STORAGE_KEYS[pageId]);
        return merge(raw ? JSON.parse(raw) : null);
      }
      const snap = await getDoc(doc(db, 'pageContent', pageId));
      return merge(snap.exists() ? snap.data() : null);
    } catch (err) { return clone(defaults); }
  }
  async function savePageContentDoc(pageId, value){
    if(DEMO_MODE) localStorage.setItem(PAGE_STORAGE_KEYS[pageId], JSON.stringify(value));
    else await setDoc(doc(db, 'pageContent', pageId), { ...value, updatedAt: serverTimestamp() });
  }
  async function loadOneOnOnePage(){
    pageContent = await loadPageContentDoc('one-on-one', ONE_ON_ONE_DEFAULTS, mergePageContent);
    applyOneOnOnePage();
    populateOneOnOneEditor();
  }
  async function loadHomePage(){
    homeContent = await loadPageContentDoc('home', HOME_DEFAULTS, mergeHomeContent);
    applyHomePage();
    populateHomeEditor();
  }
  async function loadBeliefsPage(){
    beliefsContent = await loadPageContentDoc('beliefs', BELIEFS_DEFAULTS, mergeBeliefsContent);
    applyBeliefsPage();
    populateBeliefsEditor();
  }
  async function loadGivePage(){
    giveContent = await loadPageContentDoc('give', GIVE_DEFAULTS, mergeGiveContent);
    applyGivePage();
    populateGiveEditor();
  }

  function field(label, id, rows){
    return '<div class="site-editor-field"><label for="' + id + '">' + label + '</label>' +
      (rows ? '<textarea id="' + id + '" rows="' + rows + '"></textarea>' : '<input id="' + id + '" type="text" />') + '</div>';
  }
  function imageField(label, key){
    const cap = key.charAt(0).toUpperCase() + key.slice(1);
    return '<div class="site-editor-image">' +
      '<span class="admin-microlabel">' + label + '</span>' +
      '<div class="admin-image-preview" id="ooEditImage' + cap + 'Preview"></div>' +
      '<div class="admin-image-actions"><label class="admin-image-upload-btn">Upload / Replace<input type="file" accept="image/*" data-oo-image-upload="' + key + '" hidden></label>' +
      '<button type="button" class="admin-image-remove-btn" data-oo-image-reset="' + key + '">Use Approved Image</button></div>' +
      '<details class="admin-image-advanced"><summary>Advanced: paste an image URL</summary><input id="ooEditImage' + cap + '" data-oo-image-input="' + key + '" type="text" /></details></div>';
  }
  function oneOnOneEditorHtml(){
    return '<form id="ownerOneOnOneEditor" class="site-editor">' +
      '<div class="site-editor-head"><div><span class="portal-label">Edit One-on-One Page</span><p class="admin-panel-intro">Change the words and photographs visitors see. Your design, spacing, colors, and booking system stay protected.</p></div>' +
      '<button type="button" class="admin-btn-ghost" id="ownerOneOnOnePreviewBtn">Open Page Preview ↗</button></div>' +
      '<div class="admin-subsection-label">Opening Section</div><div class="site-editor-grid">' +
      field('Small heading', 'ooEditHeroEyebrow') + field('Main heading — use a new line to control the break', 'ooEditHeroTitle', 2) +
      field('Focus line', 'ooEditHeroSubtitle', 2) + field('Button wording', 'ooEditHeroButton') +
      field('Short description', 'ooEditHeroDescription', 2) + field('Quiet words on the right — one per line', 'ooEditHeroWords', 5) + '</div>' +
      '<div class="admin-subsection-label">Four Ministry Principles</div><div class="site-editor-grid">' +
      ONE_ON_ONE_DEFAULTS.principles.map((_, i) => field((i + 1) + '. Name', 'ooEditPrincipleLabel' + i) + field((i + 1) + '. Description', 'ooEditPrincipleDescription' + i)).join('') + '</div>' +
      '<div class="admin-subsection-label">Booking Section</div><div class="site-editor-grid">' +
      field('Small heading', 'ooEditBookingEyebrow') + field('Main heading', 'ooEditBookingTitle', 2) + field('Description', 'ooEditBookingDescription', 2) + '</div>' +
      '<div class="site-editor-grid site-editor-single">' + field('Ministry support statement', 'ooEditSupport', 5) + '</div>' +
      '<div class="admin-subsection-label">What Visitors Can Expect</div><div class="site-editor-grid">' +
      field('Small heading', 'ooEditExpectEyebrow') + field('Main heading', 'ooEditExpectTitle', 2) + '</div><div class="site-editor-grid site-editor-single">' +
      field('Expectation list — one item per line', 'ooEditExpectItems', 7) + '</div>' +
      '<div class="admin-subsection-label">Closing Section</div><div class="site-editor-grid">' +
      field('Small heading', 'ooEditClosingEyebrow') + field('Main heading', 'ooEditClosingTitle', 2) + field('Description', 'ooEditClosingDescription', 3) + field('Button wording', 'ooEditClosingButton') + '</div>' +
      '<div class="admin-subsection-label">Page Photography</div><p class="admin-hint">Replace any photograph without changing the page layout. Large files are resized before saving.</p><div class="site-editor-images">' +
      imageField('Opening Photograph', 'hero') + imageField('Booking / Bible Photograph', 'booking') + imageField('Conversation Photograph', 'expect') + imageField('Closing Photograph', 'closing') + '</div>' +
      '<div class="site-editor-actions"><button class="admin-btn-solid" type="submit">Save One-on-One Page</button><button class="admin-btn-ghost" type="button" id="ownerOneOnOneResetBtn">Restore Approved Version</button><span class="form-status" id="ownerOneOnOneStatus" role="status" aria-live="polite"></span></div>' +
      '</form>';
  }
  function homeEditorHtml(){
    return '<form id="ownerHomeEditor" class="site-editor">' +
      '<div class="site-editor-head"><div><span class="portal-label">Edit Home Page</span><p class="admin-panel-intro">Change the opening words visitors see first. Layout, fonts, and colors stay protected.</p></div>' +
      '<button type="button" class="admin-btn-ghost" id="ownerHomePreviewBtn">Open Page Preview ↗</button></div>' +
      '<div class="admin-subsection-label">Opening Moment</div><div class="site-editor-grid">' +
      field('Small heading', 'homeEditEyebrow') + field('Main line', 'homeEditHeadlineMain') +
      field('Second line', 'homeEditHeadlineSub') + field('Short description', 'homeEditCopy', 2) +
      field('Primary button wording', 'homeEditPrimaryButton') + field('Secondary button wording', 'homeEditSecondaryButton') + '</div>' +
      '<div class="site-editor-actions"><button class="admin-btn-solid" type="submit">Save Home Page</button><button class="admin-btn-ghost" type="button" id="ownerHomeResetBtn">Restore Approved Version</button><span class="form-status" id="ownerHomeStatus" role="status" aria-live="polite"></span></div>' +
      '</form>';
  }
  function beliefsEditorHtml(){
    const beliefFields = BELIEFS_DEFAULTS.order.map((id, i) =>
      '<div class="admin-subsection-label">' + (i + 1) + '. ' + escapeHtml(BELIEFS_DEFAULTS.beliefs[id].title) + '</div><div class="site-editor-grid">' +
      field('Title', 'beliefEditTitle_' + id) + field('Scripture references — separate with •', 'beliefEditScripture_' + id) +
      '</div><div class="site-editor-grid site-editor-single">' + field('Doctrinal paragraph', 'beliefEditBody_' + id, 4) + '</div>'
    ).join('');
    return '<form id="ownerBeliefsEditor" class="site-editor">' +
      '<div class="site-editor-head"><div><span class="portal-label">Edit Beliefs Page</span><p class="admin-panel-intro">Change the hero words and the ten belief statements. Layout, order, the revelation interlude, and the Scripture reader stay protected.</p></div>' +
      '<button type="button" class="admin-btn-ghost" id="ownerBeliefsPreviewBtn">Open Page Preview ↗</button></div>' +
      '<div class="admin-subsection-label">Hero</div><div class="site-editor-grid">' +
      field('Small heading', 'beliefsEditHeroEyebrow') + field('Main heading — use a new line to control the break', 'beliefsEditHeroTitle', 2) + '</div>' +
      '<div class="site-editor-grid site-editor-single">' + field('Supporting line', 'beliefsEditHeroSub', 2) + '</div>' +
      '<div class="admin-subsection-label">Our Foundation Introduction</div><div class="site-editor-grid site-editor-single">' +
      field('Introduction paragraph (plain text — any bold emphasis is not preserved)', 'beliefsEditIntro', 3) + '</div>' +
      beliefFields +
      '<div class="site-editor-actions"><button class="admin-btn-solid" type="submit">Save Beliefs Page</button><button class="admin-btn-ghost" type="button" id="ownerBeliefsResetBtn">Restore Approved Version</button><span class="form-status" id="ownerBeliefsStatus" role="status" aria-live="polite"></span></div>' +
      '</form>';
  }
  function giveEditorHtml(){
    return '<form id="ownerGiveEditor" class="site-editor">' +
      '<div class="site-editor-head"><div><span class="portal-label">Edit Give Page</span><p class="admin-panel-intro">Update the Give page, feature or remove an upcoming event, and edit the food-drive stories. Payment connections and financial records stay protected.</p></div><button type="button" class="admin-btn-ghost" id="ownerGivePreviewBtn">Open Page Preview ↗</button></div>' +
      '<div class="admin-subsection-label">Opening Section</div><div class="site-editor-grid">' +
      field('Small heading', 'giveEditHeroEyebrow') + field('Main heading', 'giveEditHeroTitle') + field('Statement', 'giveEditHeroKicker', 2) + field('Quiet words — one per line', 'giveEditHeroWords', 5) + '</div><div class="site-editor-grid site-editor-single">' + field('Introduction', 'giveEditHeroCopy', 3) + '</div>' +
      '<div class="admin-subsection-label">Featured Event</div>' +
      '<label class="admin-checkbox-field"><input id="giveEditEventEnabled" type="checkbox" /> Feature this event on the Give page</label>' +
      '<div class="site-editor-grid">' + field('Small label', 'giveEditEventLabel') + field('Event name', 'giveEditEventTitle') +
      '<div class="site-editor-field"><label for="giveEditEventDate">Date</label><input id="giveEditEventDate" type="date" /></div>' +
      '<div class="site-editor-field"><label for="giveEditEventStart">Start time</label><input id="giveEditEventStart" type="time" /></div>' +
      '<div class="site-editor-field"><label for="giveEditEventEnd">End time</label><input id="giveEditEventEnd" type="time" /></div>' + field('Button wording', 'giveEditEventButton') + '</div>' +
      '<label class="admin-checkbox-field"><input id="giveEditLocationEnabled" type="checkbox" /> Show event location</label>' +
      '<div class="site-editor-grid site-editor-single">' + field('Event location', 'giveEditEventLocation') + field('Event description', 'giveEditEventDetails', 3) + '</div>' +
      '<div class="admin-subsection-label">Feeding Our Community</div><div class="site-editor-grid">' + field('Small heading', 'giveEditCommunityEyebrow') + field('Main heading', 'giveEditCommunityTitle') + '</div><div class="site-editor-grid site-editor-single">' + field('Introduction', 'giveEditCommunityIntro', 3) + '</div>' +
      GIVE_DEFAULTS.community.stories.map((_, i) => '<div class="admin-subsection-label">Story ' + (i + 1) + '</div><div class="site-editor-grid">' + field('Heading', 'giveEditStoryTitle' + i) + field('Description', 'giveEditStoryCopy' + i, 3) + '</div>').join('') +
      '<div class="admin-subsection-label">Giving Form</div><div class="site-editor-grid">' + field('Small heading', 'giveEditFormEyebrow') + field('Main heading', 'giveEditFormTitle') + '</div><div class="site-editor-grid site-editor-single">' + field('Instruction line', 'giveEditFormCopy', 2) + '</div>' +
      '<div class="admin-subsection-label">Closing Statement</div><div class="site-editor-grid">' + field('Small heading', 'giveEditClosingEyebrow') + field('Main heading — use a new line to control the break', 'giveEditClosingTitle', 2) + '</div><div class="site-editor-grid site-editor-single">' + field('Closing message', 'giveEditClosingCopy', 3) + '</div>' +
      '<div class="admin-subsection-label">Photography</div><p class="admin-hint">Use an approved site asset path or image URL. Concept photographs remain labeled on the public page.</p><div class="site-editor-grid">' +
      field('Opening photograph', 'giveEditImageHero') + field('Featured-event photograph', 'giveEditImageEvent') + field('Food-drive photograph', 'giveEditImageCommunity') + field('Giving-form photograph', 'giveEditImageGiving') + '</div>' +
      '<div class="site-editor-actions"><button class="admin-btn-solid" type="submit">Save Give Page</button><button class="admin-btn-ghost" type="button" id="ownerGiveResetBtn">Restore Approved Version</button><span class="form-status" id="ownerGiveStatus" role="status" aria-live="polite"></span></div></form>';
  }

  function setValue(id, value){ const node = document.getElementById(id); if(node) node.value = value || ''; }
  function readValue(id){ return (document.getElementById(id)?.value || '').trim(); }
  function populateOneOnOneEditor(){
    if(!document.getElementById('ownerOneOnOneEditor')) return;
    setValue('ooEditHeroEyebrow', pageContent.hero.eyebrow); setValue('ooEditHeroTitle', pageContent.hero.title);
    setValue('ooEditHeroSubtitle', pageContent.hero.subtitle); setValue('ooEditHeroButton', pageContent.hero.button);
    setValue('ooEditHeroDescription', pageContent.hero.description); setValue('ooEditHeroWords', pageContent.hero.words);
    pageContent.principles.forEach((item, i) => { setValue('ooEditPrincipleLabel' + i, item.label); setValue('ooEditPrincipleDescription' + i, item.description); });
    setValue('ooEditBookingEyebrow', pageContent.booking.eyebrow); setValue('ooEditBookingTitle', pageContent.booking.title); setValue('ooEditBookingDescription', pageContent.booking.description);
    setValue('ooEditSupport', pageContent.support); setValue('ooEditExpectEyebrow', pageContent.expect.eyebrow); setValue('ooEditExpectTitle', pageContent.expect.title); setValue('ooEditExpectItems', pageContent.expect.items.join('\n'));
    setValue('ooEditClosingEyebrow', pageContent.closing.eyebrow); setValue('ooEditClosingTitle', pageContent.closing.title); setValue('ooEditClosingDescription', pageContent.closing.description); setValue('ooEditClosingButton', pageContent.closing.button);
    Object.keys(pageContent.images).forEach(key => { const cap = key.charAt(0).toUpperCase() + key.slice(1); setValue('ooEditImage' + cap, pageContent.images[key]); refreshImagePreview(key); });
  }
  function populateHomeEditor(){
    if(!document.getElementById('ownerHomeEditor')) return;
    setValue('homeEditEyebrow', homeContent.eyebrow); setValue('homeEditHeadlineMain', homeContent.headlineMain);
    setValue('homeEditHeadlineSub', homeContent.headlineSub); setValue('homeEditCopy', homeContent.copy);
    setValue('homeEditPrimaryButton', homeContent.primaryButton); setValue('homeEditSecondaryButton', homeContent.secondaryButton);
  }
  function populateBeliefsEditor(){
    if(!document.getElementById('ownerBeliefsEditor')) return;
    setValue('beliefsEditHeroEyebrow', beliefsContent.hero.eyebrow); setValue('beliefsEditHeroTitle', beliefsContent.hero.title); setValue('beliefsEditHeroSub', beliefsContent.hero.sub);
    setValue('beliefsEditIntro', beliefsContent.intro);
    beliefsContent.order.forEach(id => {
      const item = beliefsContent.beliefs[id];
      setValue('beliefEditTitle_' + id, item.title); setValue('beliefEditBody_' + id, item.body); setValue('beliefEditScripture_' + id, item.scripture);
    });
  }
  function populateGiveEditor(){
    if(!document.getElementById('ownerGiveEditor')) return;
    setValue('giveEditHeroEyebrow', giveContent.hero.eyebrow); setValue('giveEditHeroTitle', giveContent.hero.title); setValue('giveEditHeroKicker', giveContent.hero.kicker); setValue('giveEditHeroCopy', giveContent.hero.copy); setValue('giveEditHeroWords', giveContent.hero.words);
    document.getElementById('giveEditEventEnabled').checked = giveContent.event.enabled !== false;
    setValue('giveEditEventLabel', giveContent.event.label); setValue('giveEditEventTitle', giveContent.event.title); setValue('giveEditEventDate', giveContent.event.date); setValue('giveEditEventStart', giveContent.event.startTime); setValue('giveEditEventEnd', giveContent.event.endTime); setValue('giveEditEventLocation', giveContent.event.location); setValue('giveEditEventDetails', giveContent.event.details); setValue('giveEditEventButton', giveContent.event.button);
    document.getElementById('giveEditLocationEnabled').checked = giveContent.event.locationEnabled !== false;
    setValue('giveEditCommunityEyebrow', giveContent.community.eyebrow); setValue('giveEditCommunityTitle', giveContent.community.title); setValue('giveEditCommunityIntro', giveContent.community.intro);
    giveContent.community.stories.forEach((item, i) => { setValue('giveEditStoryTitle' + i, item.title); setValue('giveEditStoryCopy' + i, item.copy); });
    setValue('giveEditFormEyebrow', giveContent.form.eyebrow); setValue('giveEditFormTitle', giveContent.form.title); setValue('giveEditFormCopy', giveContent.form.copy);
    setValue('giveEditClosingEyebrow', giveContent.closing.eyebrow); setValue('giveEditClosingTitle', giveContent.closing.title); setValue('giveEditClosingCopy', giveContent.closing.copy);
    setValue('giveEditImageHero', giveContent.images.hero); setValue('giveEditImageEvent', giveContent.images.event); setValue('giveEditImageCommunity', giveContent.images.community); setValue('giveEditImageGiving', giveContent.images.giving);
  }
  function collectOneOnOneEditor(){
    return {
      hero: { eyebrow: readValue('ooEditHeroEyebrow'), title: readValue('ooEditHeroTitle'), subtitle: readValue('ooEditHeroSubtitle'), button: readValue('ooEditHeroButton'), description: readValue('ooEditHeroDescription'), words: readValue('ooEditHeroWords') },
      principles: ONE_ON_ONE_DEFAULTS.principles.map((_, i) => ({ label: readValue('ooEditPrincipleLabel' + i), description: readValue('ooEditPrincipleDescription' + i) })),
      booking: { eyebrow: readValue('ooEditBookingEyebrow'), title: readValue('ooEditBookingTitle'), description: readValue('ooEditBookingDescription') },
      support: readValue('ooEditSupport'),
      expect: { eyebrow: readValue('ooEditExpectEyebrow'), title: readValue('ooEditExpectTitle'), items: readValue('ooEditExpectItems').split('\n').map(x => x.trim()).filter(Boolean).slice(0, 5) },
      closing: { eyebrow: readValue('ooEditClosingEyebrow'), title: readValue('ooEditClosingTitle'), description: readValue('ooEditClosingDescription'), button: readValue('ooEditClosingButton') },
      images: Object.fromEntries(Object.keys(ONE_ON_ONE_DEFAULTS.images).map(key => { const cap = key.charAt(0).toUpperCase() + key.slice(1); return [key, readValue('ooEditImage' + cap) || ONE_ON_ONE_DEFAULTS.images[key]]; }))
    };
  }
  function collectHomeEditor(){
    return {
      eyebrow: readValue('homeEditEyebrow'), headlineMain: readValue('homeEditHeadlineMain'), headlineSub: readValue('homeEditHeadlineSub'),
      copy: readValue('homeEditCopy'), primaryButton: readValue('homeEditPrimaryButton'), secondaryButton: readValue('homeEditSecondaryButton')
    };
  }
  function collectBeliefsEditor(){
    const beliefs = {};
    BELIEFS_DEFAULTS.order.forEach(id => {
      beliefs[id] = { title: readValue('beliefEditTitle_' + id), body: readValue('beliefEditBody_' + id), scripture: readValue('beliefEditScripture_' + id) };
    });
    return {
      hero: { eyebrow: readValue('beliefsEditHeroEyebrow'), title: readValue('beliefsEditHeroTitle'), sub: readValue('beliefsEditHeroSub') },
      intro: readValue('beliefsEditIntro'),
      beliefs
    };
  }
  function collectGiveEditor(){
    return {
      hero: { eyebrow:readValue('giveEditHeroEyebrow'), title:readValue('giveEditHeroTitle'), kicker:readValue('giveEditHeroKicker'), copy:readValue('giveEditHeroCopy'), words:readValue('giveEditHeroWords') },
      event: { enabled:document.getElementById('giveEditEventEnabled')?.checked !== false, label:readValue('giveEditEventLabel'), title:readValue('giveEditEventTitle'), date:readValue('giveEditEventDate'), startTime:readValue('giveEditEventStart'), endTime:readValue('giveEditEventEnd'), locationEnabled:document.getElementById('giveEditLocationEnabled')?.checked !== false, location:readValue('giveEditEventLocation'), details:readValue('giveEditEventDetails'), button:readValue('giveEditEventButton') },
      community: { eyebrow:readValue('giveEditCommunityEyebrow'), title:readValue('giveEditCommunityTitle'), intro:readValue('giveEditCommunityIntro'), stories:GIVE_DEFAULTS.community.stories.map((_, i) => ({ title:readValue('giveEditStoryTitle' + i), copy:readValue('giveEditStoryCopy' + i) })) },
      form: { eyebrow:readValue('giveEditFormEyebrow'), title:readValue('giveEditFormTitle'), copy:readValue('giveEditFormCopy') },
      closing: { eyebrow:readValue('giveEditClosingEyebrow'), title:readValue('giveEditClosingTitle'), copy:readValue('giveEditClosingCopy') },
      images: { hero:readValue('giveEditImageHero') || GIVE_DEFAULTS.images.hero, event:readValue('giveEditImageEvent') || GIVE_DEFAULTS.images.event, community:readValue('giveEditImageCommunity') || GIVE_DEFAULTS.images.community, giving:readValue('giveEditImageGiving') || GIVE_DEFAULTS.images.giving }
    };
  }
  function refreshImagePreview(key){
    const cap = key.charAt(0).toUpperCase() + key.slice(1);
    const input = document.getElementById('ooEditImage' + cap);
    const preview = document.getElementById('ooEditImage' + cap + 'Preview');
    if(!input || !preview) return;
    preview.style.backgroundImage = input.value ? "url('" + input.value.replace(/'/g, '%27') + "')" : '';
    preview.innerHTML = input.value ? '' : '<span class="admin-image-empty">No image selected</span>';
  }
  function resizeImage(file, maxDimension = 1200, quality = .72){
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = reject;
      reader.onload = () => {
        const image = new Image();
        image.onerror = reject;
        image.onload = () => {
          let width = image.width, height = image.height;
          if(width > maxDimension || height > maxDimension){
            if(width >= height){ height = Math.round(height * maxDimension / width); width = maxDimension; }
            else { width = Math.round(width * maxDimension / height); height = maxDimension; }
          }
          const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height;
          canvas.getContext('2d').drawImage(image, 0, 0, width, height);
          resolve(canvas.toDataURL('image/jpeg', quality));
        };
        image.src = reader.result;
      };
      reader.readAsDataURL(file);
    });
  }

  const WEBSITE_PAGES = [
    { name: 'Home Page', key: 'home', html: homeEditorHtml, populate: populateHomeEditor, previewUrl: 'index.html' },
    { name: 'One-on-One Page', key: 'one-on-one', html: oneOnOneEditorHtml, populate: populateOneOnOneEditor, previewUrl: 'one-on-one.html' },
    { name: 'Beliefs', key: 'beliefs', html: beliefsEditorHtml, populate: populateBeliefsEditor, previewUrl: 'beliefs.html' },
    { name: 'Give', key: 'give', html: giveEditorHtml, populate: populateGiveEditor, previewUrl: 'give.html' },
    { name: 'Teaching Page', key: null }, { name: 'Prayer Page', key: null }, { name: 'Our Story', key: null },
    { name: 'Gather', key: null }, { name: 'Connect', key: null },
    { name: 'Shop', key: null }, { name: 'Navigation', key: null }, { name: 'Footer', key: null }
  ];
  function renderOwnerWebsitePages(){
    const list = document.getElementById('ownerWebsitePagesList');
    const editor = document.getElementById('ownerWebsiteEditor');
    if(!list || !editor) return;
    list.innerHTML = WEBSITE_PAGES.map(page => {
      const connected = !!page.key;
      return '<button type="button" class="admin-website-page-row' + (connected ? ' is-connected' : '') + '" data-site-page="' + escapeHtml(page.name) + '"' + (connected ? '' : ' disabled') + '><span>' + escapeHtml(page.name) + '</span><span class="' + (connected ? 'admin-status-pill published' : 'demo-badge') + '">' + (connected ? 'Editable' : 'Coming Later') + '</span></button>';
    }).join('');
    editor.innerHTML = '<div class="site-editor-welcome"><strong>Choose an editable page.</strong><p>Home, One-on-One, Beliefs, and Give are ready to edit. Other pages stay protected until their editors are approved.</p></div>';
  }
  function openWebsitePageEditor(pageName){
    const page = WEBSITE_PAGES.find(p => p.name === pageName && p.key);
    if(!page) return;
    const editor = document.getElementById('ownerWebsiteEditor');
    editor.innerHTML = page.html();
    page.populate();
    editor.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  async function hashCode(code){
    const bytes = new TextEncoder().encode(normalizeCode(code));
    const hash = await crypto.subtle.digest('SHA-256', bytes);
    return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('');
  }
  function loadDemoDiscounts(){
    try {
      const raw = localStorage.getItem(DISCOUNT_STORAGE_KEY);
      discountCodes = raw ? JSON.parse(raw) : clone(DEMO_DISCOUNT_DEFAULTS);
      discountCodes.forEach(item => {
        if(item.maxUses === undefined) item.maxUses = null;
        if(item.usedCount === undefined) item.usedCount = 0;
        if(!Array.isArray(item.redeemedSourceIds)) item.redeemedSourceIds = [];
        if(item.lastRedeemedSourceId === undefined) item.lastRedeemedSourceId = null;
      });
    } catch (err) { discountCodes = clone(DEMO_DISCOUNT_DEFAULTS); }
    discountsLoaded = true;
  }
  function saveDemoDiscounts(){ try { localStorage.setItem(DISCOUNT_STORAGE_KEY, JSON.stringify(discountCodes)); } catch (err) {} }
  async function loadDiscountCodes(){
    if(discountsLoaded) return;
    if(DEMO_MODE){ loadDemoDiscounts(); return; }
    try {
      const snap = await getDocs(collection(db, 'discountCodes'));
      discountCodes = []; snap.forEach(item => discountCodes.push({ id: item.id, maxUses: null, usedCount: 0, ...item.data() }));
    } catch (err) { discountCodes = []; }
    discountsLoaded = true;
  }
  function scopeLabel(scope){ return scope === 'oneonone' ? 'One-on-Ones' : scope === 'teaching' ? 'Teachings' : 'One-on-Ones + Teachings'; }
  function usageLabel(item){
    const used = Number(item.usedCount) || 0;
    if(item.maxUses === null || item.maxUses === undefined || item.maxUses === '') return used + ' used · unlimited';
    return used + ' / ' + item.maxUses + ' used';
  }
  function renderDiscountRows(){
    const list = document.getElementById('ownerDiscountCodesList');
    if(!list) return;
    if(!discountCodes.length){ list.innerHTML = '<p class="admin-hint">No discount codes yet.</p>'; return; }
    list.innerHTML = discountCodes.slice().sort((a,b) => String(a.code).localeCompare(String(b.code))).map(item =>
      '<div class="discount-code-row" data-discount-id="' + escapeHtml(item.id) + '"><div><strong>' + escapeHtml(item.code) + '</strong><small>' +
      (item.type === 'percent' ? Number(item.amount) + '% off' : money(item.amount) + ' off') + ' · ' + scopeLabel(item.scope) + ' · ' + usageLabel(item) +
      (item.expiresAt ? ' · Ends ' + escapeHtml(item.expiresAt) : '') + '</small></div><div class="discount-code-actions"><button type="button" class="admin-btn-ghost" data-discount-action="toggle">' +
      (item.active === false ? 'Activate' : 'Pause') + '</button><button type="button" class="admin-btn-ghost" data-discount-action="delete">Delete</button></div></div>'
    ).join('');
  }
  async function renderOwnerDiscountCodes(){
    await loadDiscountCodes();
    renderDiscountRows();
  }

  function validateDiscount(item, scope, subtotal){
    if(!item || item.active === false) return 'That discount code is not active.';
    if(item.scope !== 'both' && item.scope !== scope) return scope === 'oneonone' ? 'That code is not available for One-on-One sessions.' : 'That code is not available for Teachings.';
    if(item.expiresAt && new Date(item.expiresAt + 'T23:59:59').getTime() < Date.now()) return 'That discount code has expired.';
    if(item.maxUses !== null && item.maxUses !== undefined && item.maxUses !== '' && (Number(item.usedCount) || 0) >= Number(item.maxUses)) return 'That discount code has reached its usage limit.';
    if(Number(subtotal) <= 0) return 'No discount is needed for this free item.';
    return '';
  }
  async function findDiscount(code){
    const normalized = normalizeCode(code);
    if(!normalized) return null;
    if(DEMO_MODE){ await loadDiscountCodes(); return discountCodes.find(item => normalizeCode(item.code) === normalized) || null; }
    try {
      const snap = await getDoc(doc(db, 'discountCodes', await hashCode(normalized)));
      return snap.exists() ? { id: snap.id, maxUses: null, usedCount: 0, ...snap.data() } : null;
    } catch (err) { return null; }
  }
  function pricing(scope, subtotal){
    subtotal = Math.max(0, Number(subtotal) || 0);
    const item = appliedDiscounts[scope];
    let discountAmount = 0;
    if(item){ discountAmount = item.type === 'percent' ? subtotal * Math.min(100, Math.max(0, Number(item.amount) || 0)) / 100 : Math.min(subtotal, Math.max(0, Number(item.amount) || 0)); }
    discountAmount = Math.round(discountAmount * 100) / 100;
    return { subtotal, discountAmount, total: Math.max(0, Math.round((subtotal - discountAmount) * 100) / 100), code: item ? item.code : '', type: item ? item.type : '', value: item ? Number(item.amount) || 0 : 0 };
  }
  function discountSummaryHtml(scope, subtotal){
    const p = pricing(scope, subtotal);
    if(!p.code) return '';
    return '<div class="checkout-order-row checkout-discount-row"><span>Discount · ' + escapeHtml(p.code) + '</span><span>−' + money(p.discountAmount) + '</span></div>';
  }
  function discountRecord(scope, subtotal){
    const p = pricing(scope, subtotal);
    return { subtotal: p.subtotal, discountCode: p.code || null, discountType: p.type || null, discountValue: p.value || 0, discountAmount: p.discountAmount, totalAfterDiscount: p.total };
  }
  function resetCheckout(scope){
    appliedDiscounts[scope] = null;
    const prefix = scope === 'oneonone' ? 'booking' : 'teachingRegister';
    const input = document.getElementById(prefix + 'DiscountCode');
    const status = document.getElementById(prefix + 'DiscountStatus');
    if(input) input.value = '';
    if(status) status.textContent = '';
  }
  // Three-step redemption, in this order, so a maxUses cap is actually
  // enforced BEFORE a discounted booking/registration exists — not
  // just before its usedCount is counted:
  //
  //   1. claimDiscount() — called BEFORE createBooking()/
  //      createTeachingRegistration(). Atomically reserves one use (see
  //      the discountCodes rule's race-safety note) and returns
  //      { ok:false, reason:'limit' } the instant the cap is already
  //      hit, with NOTHING booked yet. The caller (app.js) must respond
  //      by dropping the discount and booking at full price instead —
  //      a failed claim can never leave behind a discounted booking,
  //      because the booking is only ever created after the claim that
  //      pays for it has already won.
  //   2. confirmDiscountClaim() — called after the booking/registration
  //      actually commits. Locks the ticket (status 'claimed' ->
  //      'confirmed') so it can never be released again — closing the
  //      "release a spent claim, then re-claim it" double-dip.
  //   3. releaseDiscountClaim() — called if step 1 succeeded but the
  //      booking/registration itself then fails for an unrelated reason
  //      (e.g. the time slot was taken). Gives the use back atomically
  //      so a failed booking never permanently burns a limited code.
  //
  // Residual, documented limitation: there is no payment backend here,
  // so "claimed" is this codebase's best available stand-in for "paid."
  // The only gap this leaves is a crash or connection loss in the brief
  // window between a successful claim and the booking attempt that
  // follows it immediately afterward in the same function (no user
  // interaction happens in between) — that would strand one use as
  // 'claimed' forever, under-counting real availability by at most one.
  // Closing that completely needs a trusted server (e.g. a payment
  // webhook or Cloud Function) to confirm or release claims on its own,
  // independent of whether the customer's browser stays open.
  async function claimDiscount(scope, uid){
    const item = appliedDiscounts[scope];
    if(!item) return null;
    if(DEMO_MODE){
      // discountCodes (this page's own in-memory cache) is loaded once
      // and never refreshed, so it can't be trusted for a maxUses check
      // — another page/tab may have already claimed since this page
      // loaded. Read the shared localStorage source fresh, right here,
      // immediately before validating and writing, so this stays
      // correct across separate demo sessions sharing one browser
      // profile (not just within a single already-open page).
      let fresh;
      try {
        const raw = localStorage.getItem(DISCOUNT_STORAGE_KEY);
        fresh = raw ? JSON.parse(raw) : clone(DEMO_DISCOUNT_DEFAULTS);
      } catch (err) { fresh = clone(DEMO_DISCOUNT_DEFAULTS); }
      const stored = fresh.find(x => x.id === item.id);
      if(!stored) return null;
      if(stored.maxUses !== null && stored.maxUses !== undefined && (Number(stored.usedCount) || 0) >= Number(stored.maxUses)){
        discountCodes = fresh;
        return { ok: false, reason: 'limit' };
      }
      const claimId = 'demo-claim-' + Math.random().toString(36).slice(2);
      stored.redeemedSourceIds = Array.isArray(stored.redeemedSourceIds) ? stored.redeemedSourceIds : [];
      stored.redeemedSourceIds.push(claimId);
      stored.lastRedeemedSourceId = claimId;
      stored.usedCount = (Number(stored.usedCount) || 0) + 1;
      item.usedCount = stored.usedCount;
      discountCodes = fresh;
      try { localStorage.setItem(DISCOUNT_STORAGE_KEY, JSON.stringify(fresh)); } catch (err) { /* ignore storage failures — preview keeps working, just won't persist */ }
      return { ok: true, claimId };
    }
    const claimRef = doc(collection(db, 'discountRedemptions'));
    const claimId = claimRef.id;
    try {
      await setDoc(claimRef, { uid, codeId: item.id, status: 'claimed', sourceCollection: null, sourceId: null, createdAt: serverTimestamp() });
    } catch (err) { console.error('discount claim ticket failed to save', err); return { ok: false, reason: 'error' }; }
    let claimed = false;
    try {
      const codeRef = doc(db, 'discountCodes', item.id);
      await runTransaction(db, async tx => {
        const snap = await tx.get(codeRef);
        if(!snap.exists()) return;
        const data = snap.data();
        if(data.maxUses !== null && data.maxUses !== undefined && (Number(data.usedCount) || 0) >= Number(data.maxUses)) return;
        const redeemedSourceIds = Array.isArray(data.redeemedSourceIds) ? data.redeemedSourceIds : [];
        tx.update(codeRef, {
          usedCount: (Number(data.usedCount) || 0) + 1,
          redeemedSourceIds: [...redeemedSourceIds, claimId],
          lastRedeemedSourceId: claimId
        });
        claimed = true;
      });
    } catch (err) { console.error('discount claim failed to save', err); }
    if(!claimed){
      try { await deleteDoc(claimRef); } catch (err) { /* harmless if it never committed */ }
      return { ok: false, reason: 'limit' };
    }
    item.usedCount = (Number(item.usedCount) || 0) + 1;
    return { ok: true, claimId };
  }
  async function confirmDiscountClaim(claimId, source){
    if(!claimId) return;
    if(DEMO_MODE) return;
    try {
      await updateDoc(doc(db, 'discountRedemptions', claimId), {
        status: 'confirmed', sourceCollection: source.collection, sourceId: source.id, confirmedAt: serverTimestamp()
      });
    } catch (err) { console.error('discount claim confirm failed', err); }
  }
  async function releaseDiscountClaim(claimId){
    if(!claimId) return;
    if(DEMO_MODE){
      const stored = discountCodes.find(x => Array.isArray(x.redeemedSourceIds) && x.redeemedSourceIds.includes(claimId));
      if(stored){
        stored.usedCount = Math.max(0, (Number(stored.usedCount) || 0) - 1);
        stored.redeemedSourceIds = stored.redeemedSourceIds.filter(id => id !== claimId);
        saveDemoDiscounts();
      }
      return;
    }
    try {
      const claimSnap = await getDoc(doc(db, 'discountRedemptions', claimId));
      if(!claimSnap.exists()) return;
      const codeRef = doc(db, 'discountCodes', claimSnap.data().codeId);
      await runTransaction(db, async tx => {
        const snap = await tx.get(codeRef);
        if(!snap.exists()) return;
        const data = snap.data();
        const redeemedSourceIds = Array.isArray(data.redeemedSourceIds) ? data.redeemedSourceIds : [];
        if(!redeemedSourceIds.includes(claimId)) return;
        tx.update(codeRef, {
          usedCount: Math.max(0, (Number(data.usedCount) || 0) - 1),
          redeemedSourceIds: redeemedSourceIds.filter(id => id !== claimId),
          lastReleasedSourceId: claimId
        });
      });
      await deleteDoc(doc(db, 'discountRedemptions', claimId));
    } catch (err) { console.error('discount claim release failed', err); }
  }
  async function applyCheckoutCode(scope){
    const prefix = scope === 'oneonone' ? 'booking' : 'teachingRegister';
    const input = document.getElementById(prefix + 'DiscountCode');
    const status = document.getElementById(prefix + 'DiscountStatus');
    const button = document.getElementById(prefix + 'DiscountApply');
    const subtotal = scope === 'oneonone' ? getBookingSubtotal() : getTeachingSubtotal();
    if(!input || !status) return;
    if(button) button.disabled = true;
    status.textContent = 'Checking code…';
    const item = await findDiscount(input.value);
    const error = item ? validateDiscount(item, scope, subtotal) : 'That discount code was not found.';
    if(error){ appliedDiscounts[scope] = null; status.textContent = error; status.classList.remove('is-success'); }
    else { appliedDiscounts[scope] = item; const p = pricing(scope, subtotal); status.textContent = item.code + ' applied — you save ' + money(p.discountAmount) + '.'; status.classList.add('is-success'); input.value = item.code; }
    if(scope === 'oneonone') rerenderBookingSummary(); else rerenderTeachingSummary();
    if(button) button.disabled = false;
  }

  document.getElementById('ownerWebsitePagesList')?.addEventListener('click', event => {
    const button = event.target.closest('[data-site-page]');
    if(!button || button.disabled) return;
    openWebsitePageEditor(button.dataset.sitePage);
  });
  document.getElementById('ownerWebsiteEditor')?.addEventListener('input', event => {
    const input = event.target.closest('[data-oo-image-input]'); if(input) refreshImagePreview(input.dataset.ooImageInput);
  });
  document.getElementById('ownerWebsiteEditor')?.addEventListener('change', async event => {
    const input = event.target.closest('[data-oo-image-upload]');
    if(!input || !input.files?.[0]) return;
    const key = input.dataset.ooImageUpload, cap = key.charAt(0).toUpperCase() + key.slice(1);
    const status = document.getElementById('ownerOneOnOneStatus'); if(status) status.textContent = 'Preparing image…';
    try { document.getElementById('ooEditImage' + cap).value = await resizeImage(input.files[0]); refreshImagePreview(key); if(status) status.textContent = 'Image ready — save the page when finished.'; }
    catch (err) { if(status) status.textContent = 'That image could not be prepared. Try another file.'; }
    input.value = '';
  });
  document.getElementById('ownerWebsiteEditor')?.addEventListener('click', async event => {
    const resetImage = event.target.closest('[data-oo-image-reset]');
    if(resetImage){ const key = resetImage.dataset.ooImageReset, cap = key.charAt(0).toUpperCase() + key.slice(1); document.getElementById('ooEditImage' + cap).value = ONE_ON_ONE_DEFAULTS.images[key]; refreshImagePreview(key); return; }
    if(event.target.closest('#ownerOneOnOnePreviewBtn')){ window.open('one-on-one.html', '_blank', 'noopener'); return; }
    if(event.target.closest('#ownerHomePreviewBtn')){ window.open('index.html', '_blank', 'noopener'); return; }
    if(event.target.closest('#ownerBeliefsPreviewBtn')){ window.open('beliefs.html', '_blank', 'noopener'); return; }
    if(event.target.closest('#ownerGivePreviewBtn')){ window.open('give.html', '_blank', 'noopener'); return; }
    if(event.target.closest('#ownerOneOnOneResetBtn')){
      pageContent = clone(ONE_ON_ONE_DEFAULTS); populateOneOnOneEditor(); applyOneOnOnePage();
      const status = document.getElementById('ownerOneOnOneStatus'); if(status) status.textContent = 'Approved version restored in the editor. Select Save to publish it.';
    }
    if(event.target.closest('#ownerHomeResetBtn')){
      homeContent = clone(HOME_DEFAULTS); populateHomeEditor(); applyHomePage();
      const status = document.getElementById('ownerHomeStatus'); if(status) status.textContent = 'Approved version restored in the editor. Select Save to publish it.';
    }
    if(event.target.closest('#ownerBeliefsResetBtn')){
      beliefsContent = clone(BELIEFS_DEFAULTS); populateBeliefsEditor(); applyBeliefsPage();
      const status = document.getElementById('ownerBeliefsStatus'); if(status) status.textContent = 'Approved version restored in the editor. Select Save to publish it.';
    }
    if(event.target.closest('#ownerGiveResetBtn')){
      giveContent = clone(GIVE_DEFAULTS); populateGiveEditor(); applyGivePage();
      const status = document.getElementById('ownerGiveStatus'); if(status) status.textContent = 'Approved version restored in the editor. Select Save to publish it.';
    }
  });
  document.getElementById('ownerWebsiteEditor')?.addEventListener('submit', async event => {
    const formId = event.target.id;
    if(!['ownerOneOnOneEditor', 'ownerHomeEditor', 'ownerBeliefsEditor', 'ownerGiveEditor'].includes(formId)) return;
    event.preventDefault();
    if(formId === 'ownerOneOnOneEditor'){
      const status = document.getElementById('ownerOneOnOneStatus'); status.textContent = 'Saving…';
      pageContent = mergePageContent(collectOneOnOneEditor());
      try { await savePageContentDoc('one-on-one', pageContent); applyOneOnOnePage(); status.textContent = DEMO_MODE ? 'Saved in this preview browser.' : 'Saved. The One-on-One page is updated.'; }
      catch (err) { console.error('save One-on-One page failed', err); status.textContent = 'Could not save. Check your connection and try again.'; }
    } else if(formId === 'ownerHomeEditor'){
      const status = document.getElementById('ownerHomeStatus'); status.textContent = 'Saving…';
      homeContent = mergeHomeContent(collectHomeEditor());
      try { await savePageContentDoc('home', homeContent); applyHomePage(); status.textContent = DEMO_MODE ? 'Saved in this preview browser.' : 'Saved. The Home page is updated.'; }
      catch (err) { console.error('save Home page failed', err); status.textContent = 'Could not save. Check your connection and try again.'; }
    } else if(formId === 'ownerBeliefsEditor'){
      const status = document.getElementById('ownerBeliefsStatus'); status.textContent = 'Saving…';
      beliefsContent = mergeBeliefsContent(collectBeliefsEditor());
      try { await savePageContentDoc('beliefs', beliefsContent); applyBeliefsPage(); status.textContent = DEMO_MODE ? 'Saved in this preview browser.' : 'Saved. The Beliefs page is updated.'; }
      catch (err) { console.error('save Beliefs page failed', err); status.textContent = 'Could not save. Check your connection and try again.'; }
    } else if(formId === 'ownerGiveEditor'){
      const status = document.getElementById('ownerGiveStatus'); status.textContent = 'Saving…';
      giveContent = mergeGiveContent(collectGiveEditor());
      try { await savePageContentDoc('give', giveContent); applyGivePage(); status.textContent = DEMO_MODE ? 'Saved in this preview browser.' : 'Saved. The Give page is updated.'; }
      catch (err) { console.error('save Give page failed', err); status.textContent = 'Could not save. Check your connection and try again.'; }
    }
  });

  document.getElementById('ownerDiscountCodeForm')?.addEventListener('submit', async event => {
    event.preventDefault();
    const status = document.getElementById('ownerDiscountCodeStatus');
    const code = normalizeCode(document.getElementById('ownerDiscountCode').value);
    const type = document.getElementById('ownerDiscountType').value;
    const amount = Number(document.getElementById('ownerDiscountAmount').value);
    const scope = document.getElementById('ownerDiscountScope').value;
    const expiresAt = document.getElementById('ownerDiscountExpiry').value;
    const maxUsesRaw = document.getElementById('ownerDiscountMaxUses').value.trim();
    if(!/^[A-Z0-9_-]{3,30}$/.test(code)){ status.textContent = 'Use 3–30 letters, numbers, dashes, or underscores.'; return; }
    if(!(amount > 0) || (type === 'percent' && amount > 100)){ status.textContent = type === 'percent' ? 'Enter a percentage from 1 to 100.' : 'Enter a discount greater than $0.'; return; }
    let maxUses = null;
    if(maxUsesRaw !== ''){
      maxUses = Number(maxUsesRaw);
      if(!Number.isInteger(maxUses) || maxUses < 1){ status.textContent = 'Usage limit must be a whole number of 1 or more, or left blank for unlimited.'; return; }
    }
    status.textContent = 'Saving…';
    const id = DEMO_MODE ? 'demo-' + code.toLowerCase() : await hashCode(code);
    const existing = discountCodes.find(x => x.id === id || normalizeCode(x.code) === code);
    const usedCount = existing ? (Number(existing.usedCount) || 0) : 0;
    // Editing an existing code (re-submitting the same code string)
    // must keep its accumulated redemption history — only a brand-new
    // code starts with an empty ticket list. The discountCodes security
    // rule requires this field to already be a list before any
    // non-admin redemption can ever succeed against this code.
    const redeemedSourceIds = existing && Array.isArray(existing.redeemedSourceIds) ? existing.redeemedSourceIds : [];
    const lastRedeemedSourceId = existing && existing.lastRedeemedSourceId ? existing.lastRedeemedSourceId : null;
    const item = { id, code, type, amount, scope, active: true, expiresAt: expiresAt || '', maxUses, usedCount, redeemedSourceIds, lastRedeemedSourceId };
    try {
      const idx = discountCodes.findIndex(x => x.id === id || normalizeCode(x.code) === code);
      if(idx >= 0) discountCodes[idx] = item; else discountCodes.push(item);
      if(DEMO_MODE) saveDemoDiscounts(); else await setDoc(doc(db, 'discountCodes', id), { code, type, amount, scope, active: true, expiresAt: expiresAt || '', maxUses, usedCount, redeemedSourceIds, lastRedeemedSourceId, updatedAt: serverTimestamp() });
      event.target.reset(); document.getElementById('ownerDiscountType').value = 'percent'; document.getElementById('ownerDiscountScope').value = 'both';
      status.textContent = code + ' is ready to use.'; renderDiscountRows();
    } catch (err) { console.error('save discount failed', err); status.textContent = 'Could not save that code. Try again.'; }
  });
  document.getElementById('ownerDiscountCodesList')?.addEventListener('click', async event => {
    const action = event.target.closest('[data-discount-action]'); if(!action) return;
    const row = action.closest('[data-discount-id]'); const item = discountCodes.find(x => x.id === row.dataset.discountId); if(!item) return;
    if(action.dataset.discountAction === 'toggle'){
      item.active = item.active === false;
      if(DEMO_MODE) saveDemoDiscounts(); else await updateDoc(doc(db, 'discountCodes', item.id), { active: item.active, updatedAt: serverTimestamp() });
    } else if(action.dataset.discountAction === 'delete'){
      discountCodes = discountCodes.filter(x => x.id !== item.id);
      if(DEMO_MODE) saveDemoDiscounts(); else await deleteDoc(doc(db, 'discountCodes', item.id));
    }
    renderDiscountRows();
  });
  document.getElementById('bookingDiscountApply')?.addEventListener('click', () => applyCheckoutCode('oneonone'));
  document.getElementById('teachingRegisterDiscountApply')?.addEventListener('click', () => applyCheckoutCode('teaching'));
  document.getElementById('bookingDiscountCode')?.addEventListener('keydown', event => { if(event.key === 'Enter'){ event.preventDefault(); applyCheckoutCode('oneonone'); } });
  document.getElementById('teachingRegisterDiscountCode')?.addEventListener('keydown', event => { if(event.key === 'Enter'){ event.preventDefault(); applyCheckoutCode('teaching'); } });

  loadOneOnOnePage();
  loadHomePage();
  loadBeliefsPage();
  loadGivePage();
  if(DEMO_MODE) loadDemoDiscounts();

  return { renderOwnerWebsitePages, renderOwnerDiscountCodes, pricing, discountSummaryHtml, discountRecord, resetCheckout, claimDiscount, confirmDiscountClaim, releaseDiscountClaim };
}
