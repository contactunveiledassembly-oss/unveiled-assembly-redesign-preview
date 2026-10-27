/* ============================================================
   The Unveiled Assembly — Shop
   Public collection, product details, persistent cart, and the
   owner-only product editor. Checkout, payment verification, order
   creation, and digital delivery deliberately remain unavailable
   until a trusted server/webhook is connected.
   ============================================================ */

export const SHOP_CART_KEY = 'ua_shop_cart_v1';
const DEMO_PRODUCTS_KEY = 'ua_preview_store_products_v1';
const DEMO_SETTINGS_KEY = 'ua_preview_store_settings_v1';
const PUBLIC_STATUSES = new Set(['published', 'coming_soon']);
const PRODUCT_TYPES = new Set(['digital', 'physical']);
const PRODUCT_CATEGORIES = new Set(['digital', 'books', 'apparel']);

const DEFAULT_SETTINGS = Object.freeze({
  eyebrow: 'THE UNVEILED COLLECTION',
  title: 'THE SHOP',
  tagline: 'RESOURCES FOR A DEEPER UNDERSTANDING OF SCRIPTURE.',
  description: 'Digital studies, workbooks, and resources designed to encourage your walk with Christ. Every resource is created with purpose, to help you grow, go deeper, and live what you learn.',
  buttonLabel: 'BROWSE THE COLLECTION'
});

const DEMO_PRODUCTS = [
  {
    id: 'development-digital-resource',
    title: 'DIGITAL STUDY RESOURCE — DEVELOPMENT PLACEHOLDER',
    type: 'digital', category: 'digital', status: 'coming_soon', featured: true,
    priceCents: null, availability: 'Coming Soon', collection: 'Digital Study Resources',
    image: 'assets/one-on-one/hero-v4.jpg', images: [],
    description: 'A clearly marked development placeholder showing how a future digital study resource will appear. This is not a published product and is not available for purchase.',
    included: ['Final contents will be supplied by the ministry owner.'],
    delivery: 'Secure digital delivery will be connected only after verified checkout and member-library infrastructure are approved.',
    options: [], tags: ['development placeholder'], isPlaceholder: true
  },
  {
    id: 'development-study-book',
    title: 'PHYSICAL STUDY BOOK — DEVELOPMENT PLACEHOLDER',
    type: 'physical', category: 'books', status: 'coming_soon', featured: false,
    priceCents: null, availability: 'Coming Soon', collection: 'Physical Study Books',
    image: 'assets/one-on-one/booking.png', images: [],
    description: 'A development placeholder for a future physical study book. No title, price, inventory, or release date has been approved.',
    included: ['Final format and contents are still to be determined.'],
    delivery: 'Shipping details will appear only after inventory and fulfillment are configured.',
    options: [], tags: ['development placeholder'], isPlaceholder: true
  },
  {
    id: 'development-apparel',
    title: 'APPAREL & ACCESSORIES — DEVELOPMENT PLACEHOLDER',
    type: 'physical', category: 'apparel', status: 'coming_soon', featured: false,
    priceCents: null, availability: 'Coming Soon', collection: 'Apparel & Accessories',
    image: 'assets/one-on-one/closing-v3.jpg', images: [],
    description: 'A development placeholder for a future apparel or accessory release. No item, price, variants, or stock have been approved.',
    included: ['Final product details will be added by the ministry owner.'],
    delivery: 'Sizing, inventory, and shipping details will appear after the collection is approved.',
    options: [], tags: ['development placeholder'], isPlaceholder: true
  },
  // Local-preview-only test item so the real Add to Cart / cart-drawer
  // flow can actually be clicked through during design review. DEMO_MODE
  // never runs on the production hostnames (see the DEMO_MODE check
  // above), so this never reaches a real visitor — remove before any
  // real content handoff.
  {
    id: 'preview-demo-discernment-guide',
    title: 'Discernment Study Guide',
    type: 'digital', category: 'digital', status: 'published', featured: true,
    priceCents: 2400, availability: 'Available', collection: 'Digital Study Resources',
    image: 'assets/one-on-one/hero-v4.jpg', images: [],
    description: 'A guided study walking through Scripture’s teaching on testing every spirit and discerning truth from counterfeit in a noisy age.',
    included: ['A 6-week guided study, delivered as a PDF', 'Daily reading plan with reflection questions', 'A printable scripture memory card set'],
    delivery: 'Delivered as an instant digital download after purchase.',
    options: [], tags: ['preview demo'], isPlaceholder: false
  }
];

function text(value){ return typeof value === 'string' ? value.trim() : ''; }
function list(value){
  if(Array.isArray(value)) return value.map(text).filter(Boolean);
  return text(value).split(/\r?\n|,/).map(v => v.trim()).filter(Boolean);
}
function clone(value){ return JSON.parse(JSON.stringify(value)); }
function safeInteger(value){
  if(value === '' || value === null || value === undefined) return null;
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, Math.round(number)) : null;
}

export function normalizeProduct(raw = {}){
  const type = PRODUCT_TYPES.has(raw.type) ? raw.type : 'digital';
  const category = PRODUCT_CATEGORIES.has(raw.category) ? raw.category : (type === 'digital' ? 'digital' : 'books');
  const status = ['draft', 'coming_soon', 'published', 'archived'].includes(raw.status) ? raw.status : 'draft';
  const stock = safeInteger(raw.stock);
  return {
    id: text(raw.id),
    title: text(raw.title) || 'Untitled Product',
    subtitle: text(raw.subtitle),
    type,
    category,
    status,
    featured: Boolean(raw.featured),
    priceCents: safeInteger(raw.priceCents),
    availability: text(raw.availability) || (status === 'coming_soon' ? 'Coming Soon' : status === 'published' ? 'Available' : 'Not Published'),
    collection: text(raw.collection),
    image: text(raw.image),
    images: list(raw.images),
    description: text(raw.description),
    included: list(raw.included),
    delivery: text(raw.delivery),
    options: list(raw.options),
    tags: list(raw.tags),
    trackInventory: type === 'physical' && Boolean(raw.trackInventory),
    stock,
    isPlaceholder: Boolean(raw.isPlaceholder)
  };
}

export function productIsPublic(product){
  return PUBLIC_STATUSES.has(normalizeProduct(product).status);
}

export function productIsPurchasable(product){
  const p = normalizeProduct(product);
  if(p.status !== 'published' || p.priceCents === null || p.isPlaceholder) return false;
  if(p.type === 'physical' && p.trackInventory && (p.stock === null || p.stock < 1)) return false;
  return true;
}

function cartLineKey(product, option = ''){
  const p = normalizeProduct(product);
  return p.type === 'digital' ? p.id : p.id + '::' + text(option);
}

function normalizedCart(cart){
  if(!Array.isArray(cart)) return [];
  return cart.map(line => ({
    key: text(line.key), productId: text(line.productId), title: text(line.title),
    type: line.type === 'physical' ? 'physical' : 'digital', option: text(line.option),
    image: text(line.image), priceCents: safeInteger(line.priceCents) ?? 0,
    quantity: Math.max(1, safeInteger(line.quantity) || 1),
    trackInventory: Boolean(line.trackInventory), stock: safeInteger(line.stock)
  })).filter(line => line.key && line.productId && line.title);
}

export function addCartProduct(cart, product, option = ''){
  const p = normalizeProduct(product);
  const next = normalizedCart(cart);
  if(!productIsPurchasable(p)) return { cart: next, added: false, reason: 'unavailable' };
  const chosenOption = text(option);
  if(p.type === 'physical' && p.options.length && !chosenOption){
    return { cart: next, added: false, reason: 'option-required' };
  }
  const key = cartLineKey(p, chosenOption);
  const existing = next.find(line => line.key === key);
  if(existing){
    if(p.type === 'digital') return { cart: next, added: false, reason: 'digital-duplicate' };
    const max = p.trackInventory && p.stock !== null ? p.stock : Infinity;
    if(existing.quantity >= max) return { cart: next, added: false, reason: 'stock-limit' };
    existing.quantity += 1;
    return { cart: next, added: true, reason: 'incremented' };
  }
  next.push({
    key, productId: p.id, title: p.title, type: p.type, option: chosenOption,
    image: p.image, priceCents: p.priceCents, quantity: 1,
    trackInventory: p.trackInventory, stock: p.stock
  });
  return { cart: next, added: true, reason: 'added' };
}

export function updateCartQuantity(cart, key, quantity){
  const next = normalizedCart(cart);
  const line = next.find(item => item.key === key);
  if(!line) return next;
  if(Number(quantity) <= 0) return next.filter(item => item.key !== key);
  if(line.type === 'digital'){ line.quantity = 1; return next; }
  const max = line.trackInventory && line.stock !== null ? line.stock : Infinity;
  line.quantity = Math.max(1, Math.min(Math.round(Number(quantity)) || 1, max));
  return next;
}

export function cartSubtotalCents(cart){
  return normalizedCart(cart).reduce((sum, line) => sum + line.priceCents * line.quantity, 0);
}

function categoryLabel(value){
  return ({ digital: 'Digital Study Resources', books: 'Physical Study Books', apparel: 'Apparel & Accessories' })[value] || 'Collection';
}
function typeLabel(value){ return value === 'digital' ? 'Digital Resource' : 'Physical Product'; }
function formatLabel(value){ return value === 'digital' ? 'Digital PDF' : 'Physical Product'; }
function accessLineLabel(value){ return value === 'digital' ? 'Digital PDF · Access After Purchase' : 'Physical Product · Ships After Purchase'; }
function statusLabel(value){
  return ({ draft: 'Draft', coming_soon: 'Coming Soon', published: 'Published', archived: 'Archived' })[value] || value;
}
function money(cents){ return cents === null || cents === undefined ? 'Price to be announced' : '$' + (cents / 100).toFixed(2); }

export function initShopSystem(context){
  const { DEMO_MODE, db, firestore, escapeHtml, resizeImage, base = '' } = context;
  const esc = escapeHtml;
  let products = [];
  let settings = { ...DEFAULT_SETTINGS };
  let cart = [];
  let adminLoaded = false;
  let editingProductId = null;
  let publicFilter = 'all';
  let publicSort = 'featured';
  let publicSearch = '';

  function storageGet(key, fallback){
    try { const parsed = JSON.parse(localStorage.getItem(key)); return parsed ?? fallback; }
    catch (err) { return fallback; }
  }
  function storageSet(key, value){ try { localStorage.setItem(key, JSON.stringify(value)); } catch (err) { /* storage may be unavailable */ } }
  function assetUrl(url){
    if(!url) return '';
    if(/^(?:https?:|data:|blob:|\/)/i.test(url)) return url;
    return base + url.replace(/^\.\//, '');
  }
  function imageStyle(url){ return url ? ' style="background-image:url(&quot;' + esc(assetUrl(url)) + '&quot;)"' : ''; }
  // No real cover yet (a brand-new product before the owner uploads an
  // image) — a generated placeholder card instead of a blank gray box,
  // matching the reference design's own "no image yet" state.
  function coverCardHtml(p){
    return `<div class="shop-generated-cover"><strong>${esc(p.title)}</strong><span>${esc(categoryLabel(p.category))}</span><small>The Unveiled Assembly</small></div>`;
  }
  function productById(id){ return products.find(product => product.id === id) || null; }
  function publicProducts(){ return products.filter(productIsPublic); }

  if(DEMO_MODE){
    const savedProducts = storageGet(DEMO_PRODUCTS_KEY, null);
    products = (Array.isArray(savedProducts) ? savedProducts : DEMO_PRODUCTS).map(normalizeProduct);
    settings = { ...DEFAULT_SETTINGS, ...(storageGet(DEMO_SETTINGS_KEY, {}) || {}) };
  }
  cart = normalizedCart(storageGet(SHOP_CART_KEY, []));

  function saveCart(){ storageSet(SHOP_CART_KEY, cart); renderCart(); }
  function saveDemoProducts(){ if(DEMO_MODE) storageSet(DEMO_PRODUCTS_KEY, products); }
  function saveDemoSettings(){ if(DEMO_MODE) storageSet(DEMO_SETTINGS_KEY, settings); }

  function ensureOverlays(){
    if(!document.getElementById('shopCartDialog')){
      document.body.insertAdjacentHTML('beforeend', `
        <div class="shop-cart-backdrop" id="shopCartBackdrop" hidden></div>
        <aside class="shop-cart" id="shopCartDialog" aria-labelledby="shopCartTitle" aria-hidden="true">
          <div class="shop-cart-head"><h2 id="shopCartTitle">Your Bag</h2><button type="button" class="shop-icon-close" id="shopCartClose" aria-label="Close cart">×</button></div>
          <div class="shop-cart-items" id="shopCartItems"></div>
          <div class="shop-cart-foot">
            <label class="shop-discount-field" title="Discount codes will work once secure checkout is connected">
              <input type="text" placeholder="Discount code" disabled />
              <button type="button" disabled>Apply</button>
            </label>
            <div class="shop-cart-total"><span>Subtotal</span><strong id="shopCartSubtotal" data-subtotal-cents="0">$0.00</strong></div>
            <p class="shop-cart-note">Taxes and delivery are not calculated. Checkout remains unavailable until secure payment processing is connected.</p>
            <button class="shop-primary-action" type="button" disabled title="Secure checkout has not been connected">Checkout Not Connected</button>
            <div class="shop-cart-secondary-actions"><a href="${base}shop/" id="shopContinueShopping">Continue Shopping</a><button type="button" id="shopEmptyCart">Empty Cart</button></div>
          </div>
        </aside>`);
    }
    if(!document.getElementById('shopQuickViewDialog')){
      document.body.insertAdjacentHTML('beforeend', `
        <dialog class="shop-quick-view" id="shopQuickViewDialog" aria-labelledby="shopQuickViewTitle">
          <button type="button" class="shop-icon-close shop-quick-close" id="shopQuickViewClose" aria-label="Close quick view">×</button>
          <div id="shopQuickViewContent"></div>
        </dialog>`);
    }
  }

  function setCartOpen(open){
    const drawer = document.getElementById('shopCartDialog');
    const backdrop = document.getElementById('shopCartBackdrop');
    if(!drawer || !backdrop) return;
    drawer.classList.toggle('open', open);
    drawer.setAttribute('aria-hidden', open ? 'false' : 'true');
    backdrop.hidden = !open;
    document.body.classList.toggle('shop-cart-open', open);
    if(open) document.getElementById('shopCartClose')?.focus();
  }

  function cartLineHtml(line){
    const image = line.image ? `<div class="shop-cart-line-image"${imageStyle(line.image)}></div>` : '<div class="shop-cart-line-image shop-image-empty"></div>';
    const quantity = line.type === 'digital'
      ? '<span class="shop-digital-qty">Digital · 1 copy</span>'
      : `<div class="shop-qty"><button type="button" data-cart-decrement aria-label="Decrease quantity">−</button><span data-cart-quantity>${line.quantity}</span><button type="button" data-cart-increment aria-label="Increase quantity">+</button></div>`;
    return `<article class="shop-cart-line" data-cart-product-id="${esc(line.productId)}" data-cart-key="${esc(line.key)}">${image}<div class="shop-cart-line-copy"><span>${esc(typeLabel(line.type))}</span><h3>${esc(line.title)}</h3>${line.option ? `<p>${esc(line.option)}</p>` : ''}<div class="shop-cart-line-bottom">${quantity}<strong>${money(line.priceCents * line.quantity)}</strong></div><button type="button" class="shop-remove" data-cart-remove>Remove</button></div></article>`;
  }

  function renderCart(){
    const count = cart.reduce((sum, line) => sum + line.quantity, 0);
    const countNode = document.querySelector('#cartBtn span');
    if(countNode) countNode.innerHTML = 'Cart <b id="cartCount">' + count + '</b>';
    const wrap = document.getElementById('shopCartItems');
    if(!wrap) return;
    wrap.innerHTML = cart.length ? cart.map(cartLineHtml).join('') : `<div class="shop-cart-empty"><span class="shop-micro">Nothing here yet</span><h3>Your cart is empty.</h3><p>Explore the collection when you are ready.</p><a href="${base}shop/">Browse The Collection</a></div>`;
    const subtotal = cartSubtotalCents(cart);
    const subtotalNode = document.getElementById('shopCartSubtotal');
    subtotalNode.textContent = money(subtotal);
    subtotalNode.dataset.subtotalCents = String(subtotal);
    document.getElementById('shopEmptyCart').hidden = cart.length === 0;
  }

  function addProduct(id, option, announceNode){
    const product = productById(id);
    if(!product) return;
    const result = addCartProduct(cart, product, option);
    cart = result.cart;
    if(result.added){
      const quickDialog = document.getElementById('shopQuickViewDialog');
      if(quickDialog?.open) quickDialog.close();
      saveCart(); setCartOpen(true);
      if(announceNode) announceNode.textContent = result.reason === 'incremented' ? 'Quantity updated.' : 'Added to cart.';
    } else if(result.reason === 'digital-duplicate'){
      if(announceNode) announceNode.textContent = 'This digital resource is already in your cart.';
      const quickDialog = document.getElementById('shopQuickViewDialog');
      if(quickDialog?.open) quickDialog.close();
      setCartOpen(true);
    } else if(result.reason === 'option-required'){
      openQuickView(id, 'Choose an option before adding this item.');
    } else if(announceNode){
      announceNode.textContent = 'This item is not available to add yet.';
    }
  }

  function productCardHtml(product){
    const p = normalizeProduct(product);
    const purchasable = productIsPurchasable(p);
    return `<article class="shop-product-card" data-product-id="${esc(p.id)}" data-product-type="${esc(p.type)}" data-product-category="${esc(p.category)}" data-price-cents="${p.priceCents === null ? '' : p.priceCents}">
      <a class="shop-product-image" data-product-link href="${base}shop/product.html?id=${encodeURIComponent(p.id)}" aria-label="View ${esc(p.title)}"${imageStyle(p.image)}>${p.image ? '' : coverCardHtml(p)}</a>
      <div class="shop-product-card-hover"><button type="button" data-quick-view="${esc(p.id)}">Quick View</button><button type="button" data-add-to-cart="${esc(p.id)}"${purchasable ? '' : ' disabled'}>${purchasable ? 'Add To Cart' : 'Coming Soon'}</button></div>
      <div class="shop-product-card-copy"><a data-product-link href="${base}shop/product.html?id=${encodeURIComponent(p.id)}"><h3>${esc(p.title)}</h3></a><span class="shop-product-type">${esc(p.isPlaceholder ? 'Development Preview' : typeLabel(p.type))}</span><p class="shop-product-price">${esc(money(p.priceCents))}</p></div>
    </article>`;
  }

  function sortedFilteredProducts(){
    const q = publicSearch.trim().toLowerCase();
    const filtered = publicProducts().filter(p => (publicFilter === 'all' || p.category === publicFilter) &&
      (!q || p.title.toLowerCase().includes(q) || p.description.toLowerCase().includes(q)));
    return filtered.sort((a, b) => {
      if(publicSort === 'title') return a.title.localeCompare(b.title);
      if(publicSort === 'price-asc') return (a.priceCents ?? Number.MAX_SAFE_INTEGER) - (b.priceCents ?? Number.MAX_SAFE_INTEGER);
      if(publicSort === 'price-desc') return (b.priceCents ?? -1) - (a.priceCents ?? -1);
      return Number(b.featured) - Number(a.featured) || a.title.localeCompare(b.title);
    });
  }

  function applySettings(){
    const map = { shopHeroEyebrow: settings.eyebrow, shopHeroTitle: settings.title, shopHeroTagline: settings.tagline, shopHeroDescription: settings.description, shopHeroButton: settings.buttonLabel };
    Object.entries(map).forEach(([id, value]) => { const node = document.getElementById(id); if(node) node.textContent = value; });
  }

  function renderCollection(){
    applySettings();
    const grid = document.getElementById('shopProductGrid');
    if(!grid) return;
    const visible = sortedFilteredProducts();
    grid.innerHTML = visible.length ? visible.map(productCardHtml).join('') : `<div class="shop-collection-empty"><span class="shop-micro">Collection Update</span><h3>${publicFilter === 'all' ? 'The collection is being prepared.' : 'Nothing has been released in this category yet.'}</h3><p>Return soon for new study resources and ministry goods.</p></div>`;
    const count = document.getElementById('shopResultCount');
    if(count) count.textContent = visible.length + ' ' + (visible.length === 1 ? 'product' : 'products');
  }

  function productControlHtml(p, location){
    const purchasable = productIsPurchasable(p);
    const optionSelect = p.options.length ? `<label class="shop-option-label">Choose an option<select data-shop-option>${p.options.map(option => `<option value="${esc(option)}">${esc(option)}</option>`).join('')}</select></label>` : '';
    // "Preview Sample Pages" only appears once a real sample file exists
    // to show — there's no upload field or viewer for it yet, so showing
    // the button with nothing behind it would be exactly the kind of
    // decorative-looking-functional control this project avoids elsewhere.
    const preview = (location === 'detail' && p.type === 'digital' && p.previewUrl)
      ? `<a class="shop-outline-action" href="${esc(assetUrl(p.previewUrl))}" target="_blank" rel="noopener">Preview Sample Pages</a>` : '';
    return `${optionSelect}${preview}<button class="shop-primary-action" type="button" data-add-to-cart="${esc(p.id)}"${purchasable ? '' : ' disabled'}>${purchasable ? 'Add To Cart' : p.status === 'coming_soon' ? 'Coming Soon' : 'Unavailable'}</button><div class="shop-action-status" data-shop-action-status aria-live="polite">${location === 'detail' && !purchasable ? 'Purchasing is not active for this item.' : ''}</div>`;
  }

  function openQuickView(id, message = ''){
    const p = productById(id);
    const dialog = document.getElementById('shopQuickViewDialog');
    const wrap = document.getElementById('shopQuickViewContent');
    if(!p || !dialog || !wrap) return;
    wrap.dataset.productId = p.id;
    wrap.innerHTML = `<div class="shop-quick-grid"><div class="shop-quick-image"${imageStyle(p.image)}>${p.image ? '' : coverCardHtml(p)}</div><div class="shop-quick-copy"><span class="shop-micro">${esc(categoryLabel(p.category))}</span><h2 id="shopQuickViewTitle">${esc(p.title)}</h2><p class="shop-quick-price">${esc(money(p.priceCents))} <span>·</span> ${esc(formatLabel(p.type))}</p><p>${esc(p.description || 'Product details will be added by the ministry owner.')}</p>${productControlHtml(p, 'quick')}<a class="shop-text-link" href="${base}shop/product.html?id=${encodeURIComponent(p.id)}">View Full Details ↗</a></div></div>`;
    if(message) wrap.querySelector('[data-shop-action-status]').textContent = message;
    if(!dialog.open) dialog.showModal();
  }

  function accordionItemHtml(title, bodyHtml){
    return `<details class="shop-accordion-item"><summary>${esc(title)}<span class="shop-accordion-icon" aria-hidden="true"></span></summary><div class="shop-accordion-body">${bodyHtml}</div></details>`;
  }

  function renderProductDetail(){
    const wrap = document.getElementById('shopProductDetail');
    if(!wrap) return;
    const id = new URLSearchParams(window.location.search).get('id') || '';
    const p = publicProducts().find(product => product.id === id);
    if(!p){
      wrap.removeAttribute('data-product-id');
      wrap.innerHTML = `<div class="shop-detail-unavailable" id="shopProductUnavailable"><span class="shop-micro">The Unveiled Collection</span><h1>This resource is not available.</h1><p>It may still be in draft, archived, or awaiting release.</p><a class="shop-primary-link" href="${base}shop/">Return To The Shop</a></div>`;
      document.title = 'Product | The Unveiled Assembly';
      return;
    }
    wrap.dataset.productId = p.id;
    document.title = p.title + ' | The Unveiled Assembly';
    const description = p.description || 'Product details will be added by the ministry owner.';
    const includedHtml = p.included.length ? `<ul>${p.included.map(item => `<li>${esc(item)}</li>`).join('')}</ul>` : `<p>Details will be added by the ministry owner.</p>`;
    const deliveryText = p.delivery || (p.type === 'digital'
      ? 'Secure delivery details will be provided when this resource is released.'
      : 'Shipping details will be provided when this item is released.');
    const accordion = p.type === 'digital'
      ? accordionItemHtml('Description', `<p>${esc(description)}</p>`) +
        accordionItemHtml('What’s Included', includedHtml) +
        accordionItemHtml('Download & Access', `<p>${esc(deliveryText)}</p>`)
      : accordionItemHtml('Description', `<p>${esc(description)}</p>`) +
        accordionItemHtml('Product Details', includedHtml) +
        accordionItemHtml('Shipping & Returns', `<p>${esc(deliveryText)}</p>`);
    wrap.innerHTML = `<div class="shop-detail-breadcrumb"><a href="${base}shop/">Shop</a><span>/</span><span>${esc(categoryLabel(p.category))}</span></div>
      <h1>${esc(p.title)}</h1>
      <p class="shop-detail-priceline">${esc(money(p.priceCents))} <span>·</span> ${esc(formatLabel(p.type))}</p>
      <div class="shop-detail-rule"></div>
      <div class="shop-detail-image"${imageStyle(p.image)}>${p.image ? '' : coverCardHtml(p)}</div>
      <p class="shop-detail-description">${esc(description)}</p>
      <p class="shop-detail-access-line">${esc(accessLineLabel(p.type))}</p>
      ${productControlHtml(p, 'detail')}
      <div class="shop-detail-rule"></div>
      <div class="shop-accordion">${accordion}</div>`;
  }

  function wirePublic(){
    const filter = document.getElementById('shopCategoryFilter');
    const sort = document.getElementById('shopSort');
    const search = document.getElementById('shopSearch');
    filter?.addEventListener('change', () => { publicFilter = filter.value; renderCollection(); });
    sort?.addEventListener('change', () => { publicSort = sort.value; renderCollection(); });
    search?.addEventListener('input', () => { publicSearch = search.value; renderCollection(); });
    document.getElementById('shopCategoryButtons')?.addEventListener('click', event => {
      const btn = event.target.closest('[data-shop-category]'); if(!btn) return;
      publicFilter = btn.dataset.shopCategory;
      document.querySelectorAll('[data-shop-category]').forEach(node => node.classList.toggle('active', node === btn));
      if(filter) filter.value = publicFilter;
      renderCollection();
    });
    document.getElementById('shopHeroButton')?.addEventListener('click', event => {
      event.preventDefault(); document.getElementById('shopCollection')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }

  function wireShared(){
    ensureOverlays();
    const cartButton = document.getElementById('cartBtn');
    if(cartButton){ cartButton.title = 'Open shopping cart'; cartButton.removeAttribute('aria-disabled'); cartButton.addEventListener('click', () => setCartOpen(true)); }
    document.getElementById('shopCartClose')?.addEventListener('click', () => setCartOpen(false));
    document.getElementById('shopCartBackdrop')?.addEventListener('click', () => setCartOpen(false));
    document.getElementById('shopContinueShopping')?.addEventListener('click', () => setCartOpen(false));
    document.getElementById('shopEmptyCart')?.addEventListener('click', () => { cart = []; saveCart(); });
    document.getElementById('shopQuickViewClose')?.addEventListener('click', () => document.getElementById('shopQuickViewDialog')?.close());
    document.getElementById('shopQuickViewDialog')?.addEventListener('click', event => { if(event.target === event.currentTarget) event.currentTarget.close(); });
    document.addEventListener('keydown', event => { if(event.key === 'Escape') setCartOpen(false); });
    document.addEventListener('click', event => {
      const quick = event.target.closest('[data-quick-view]');
      if(quick){ openQuickView(quick.dataset.quickView); return; }
      const add = event.target.closest('[data-add-to-cart]');
      if(add && !add.disabled){
        const scope = add.closest('#shopQuickViewContent, #shopProductDetail, .shop-product-card') || document;
        const option = scope.querySelector('[data-shop-option]')?.value || '';
        addProduct(add.dataset.addToCart, option, scope.querySelector('[data-shop-action-status]'));
        return;
      }
      const gallery = event.target.closest('[data-gallery-image]');
      if(gallery){
        const main = document.getElementById('shopGalleryMain');
        if(main) main.style.backgroundImage = `url("${gallery.dataset.galleryImage.replace(/"/g, '%22')}")`;
        document.querySelectorAll('[data-gallery-image]').forEach(node => node.classList.toggle('active', node === gallery));
        return;
      }
      const cartLine = event.target.closest('[data-cart-key]');
      if(!cartLine) return;
      const key = cartLine.dataset.cartKey;
      const line = cart.find(item => item.key === key);
      if(event.target.closest('[data-cart-remove]')) cart = cart.filter(item => item.key !== key);
      else if(event.target.closest('[data-cart-decrement]')) cart = updateCartQuantity(cart, key, (line?.quantity || 1) - 1);
      else if(event.target.closest('[data-cart-increment]')) cart = updateCartQuantity(cart, key, (line?.quantity || 1) + 1);
      else return;
      saveCart();
    });
    renderCart(); wirePublic();
  }

  async function loadPublic(){
    if(!DEMO_MODE && (document.body.dataset.page === 'shop' || document.body.dataset.page === 'shop-product')){
      const { collection, query, where, getDocs, doc, getDoc } = firestore;
      const [publishedSnap, comingSnap, settingsSnap] = await Promise.all([
        getDocs(query(collection(db, 'shopProducts'), where('status', '==', 'published'))),
        getDocs(query(collection(db, 'shopProducts'), where('status', '==', 'coming_soon'))),
        getDoc(doc(db, 'shopSettings', 'public'))
      ]);
      const found = [];
      publishedSnap.forEach(snapshot => found.push(normalizeProduct({ id: snapshot.id, ...snapshot.data() })));
      comingSnap.forEach(snapshot => found.push(normalizeProduct({ id: snapshot.id, ...snapshot.data() })));
      products = found;
      if(settingsSnap.exists()) settings = { ...DEFAULT_SETTINGS, ...settingsSnap.data() };
    }
    renderPublic();
  }

  function renderPublic(){ renderCollection(); renderProductDetail(); }

  function ownerTabEmpty(title, message){ return `<div class="store-empty-state"><span class="shop-micro">${esc(title)}</span><h4>${esc(message)}</h4><p>This area is prepared in the owner portal, but it will remain inactive until its required secure integration is connected.</p></div>`; }

  function ownerShellHtml(){
    return `<div class="admin-panel-head"><div><span class="portal-label">Store Management</span><p class="admin-panel-intro">Create and organize the public collection. Publishing controls visibility only—checkout and real transactions remain off.</p></div><div class="admin-panel-head-actions"><a class="admin-btn-ghost" href="${base}shop/" target="_blank" rel="noopener">Preview Shop ↗</a></div></div>
      <div class="admin-tabs store-tabs" id="ownerStoreTabs" role="tablist">
        ${[['overview','Overview'],['products','Products'],['files','Digital Files'],['orders','Orders'],['inventory','Inventory'],['appearance','Shop Appearance'],['discounts','Discounts'],['settings','Settings']].map(([id,label], index) => `<button type="button" class="admin-tab${index === 0 ? ' active' : ''}" data-store-tab="${id}">${label}</button>`).join('')}
      </div>
      <div data-store-panel="overview"><div id="ownerStoreOverview"></div></div>
      <div data-store-panel="products" hidden><div class="store-products-head"><div><h4>Products</h4><p>Create, edit, preview, and control what appears publicly.</p></div><button class="admin-btn-solid" type="button" id="ownerStoreNewProduct">Create Product</button></div><div id="ownerStoreProductsList"></div><div id="ownerStoreProductEditor"></div></div>
      <div data-store-panel="files" hidden>${ownerTabEmpty('Digital Files', 'Secure delivery is not connected yet.')}</div>
      <div data-store-panel="orders" hidden>${ownerTabEmpty('Orders', 'No order system is active.')}</div>
      <div data-store-panel="inventory" hidden><div id="ownerStoreInventory"></div></div>
      <div data-store-panel="appearance" hidden><div id="ownerStoreAppearance"></div></div>
      <div data-store-panel="discounts" hidden>${ownerTabEmpty('Discounts', 'Shop discounts will follow verified checkout.')}</div>
      <div data-store-panel="settings" hidden>${ownerTabEmpty('Settings', 'Payments, taxes, shipping, and receipts are not configured.')}</div>`;
  }

  function renderOwnerOverview(){
    const wrap = document.getElementById('ownerStoreOverview'); if(!wrap) return;
    const counts = { published: 0, coming_soon: 0, draft: 0, archived: 0 };
    products.forEach(p => { if(counts[p.status] !== undefined) counts[p.status] += 1; });
    wrap.innerHTML = `<div class="admin-stat-row store-stat-row"><div class="admin-stat-tile"><span>Published</span><strong>${counts.published}</strong></div><div class="admin-stat-tile"><span>Coming Soon</span><strong>${counts.coming_soon}</strong></div><div class="admin-stat-tile"><span>Drafts</span><strong>${counts.draft}</strong></div><div class="admin-stat-tile"><span>Archived</span><strong>${counts.archived}</strong></div></div><div class="store-boundary-note"><strong>Storefront only—payments remain off.</strong><p>Publishing a product makes its page visible. It does not create a checkout, charge a customer, generate an order, or unlock a digital file.</p></div>`;
  }

  function renderOwnerProducts(){
    const wrap = document.getElementById('ownerStoreProductsList'); if(!wrap) return;
    const ordered = [...products].sort((a,b) => a.title.localeCompare(b.title));
    wrap.innerHTML = ordered.length ? ordered.map(p => `<article class="store-product-row" data-store-product-id="${esc(p.id)}" data-product-status="${esc(p.status)}"><div class="store-product-thumb"${imageStyle(p.image)}></div><div><span>${esc(typeLabel(p.type))} · ${esc(categoryLabel(p.category))}</span><strong>${esc(p.title)}</strong><p>${esc(money(p.priceCents))}</p></div><span class="admin-status-pill ${p.status === 'published' ? 'published' : 'draft'}">${esc(statusLabel(p.status))}</span><button class="admin-btn-ghost" type="button" data-store-edit="${esc(p.id)}">Edit</button></article>`).join('') : '<p class="admin-hint">No products have been created yet.</p>';
  }

  function storeProductPreviewHtml(p){
    return `<div class="store-preview-image"${imageStyle(p.image)}>${p.image ? '' : coverCardHtml(p)}</div>
      <div class="store-preview-copy"><span>${esc(typeLabel(p.type))} · ${esc(categoryLabel(p.category))}</span><strong>${esc(p.title || 'Untitled Product')}</strong><p>${esc(money(p.priceCents))}</p></div>`;
  }

  function productEditorHtml(product){
    const p = product ? normalizeProduct(product) : normalizeProduct({ id:'', title:'', status:'draft' });
    const isNew = !p.id;
    return `<form id="ownerStoreProductForm" class="store-product-form" data-product-id="${esc(p.id)}"><div class="store-editor-head"><div><span class="portal-label">${isNew ? 'New Product' : 'Edit Product'}</span><h4>${isNew ? 'Create a product' : esc(p.title)}</h4></div><button type="button" class="admin-btn-ghost" id="ownerStoreCloseEditor">Close</button></div>

      <div class="store-editor-step">
        <span class="store-editor-step-label">Step 1 — Choose a product type</span>
        <div class="store-type-cards" id="storeProductTypeCards">
          <button type="button" class="store-type-card${p.type !== 'physical' ? ' active' : ''}" data-type-card="digital"><strong>Digital Resource</strong><p>PDF guides and studies delivered after purchase.</p></button>
          <button type="button" class="store-type-card${p.type === 'physical' ? ' active' : ''}" data-type-card="physical"><strong>Physical Product</strong><p>Books, journals, and items that ship to the customer.</p></button>
        </div>
        <select id="storeProductType" class="store-visually-hidden" tabindex="-1" aria-hidden="true"><option value="digital"${p.type === 'digital' ? ' selected' : ''}>Digital Resource</option><option value="physical"${p.type === 'physical' ? ' selected' : ''}>Physical Product</option></select>
      </div>

      <div class="store-editor-step">
        <span class="store-editor-step-label">Step 2 — The essentials.</span>
        <div class="booking-grid">
          <div class="booking-field full"><label>Product Title</label><input id="storeProductTitle" value="${esc(isNew ? '' : p.title)}" required /></div>
          <div class="booking-field"><label>Category</label><select id="storeProductCategory"><option value="digital"${p.category === 'digital' ? ' selected' : ''}>Digital Study Resources</option><option value="books"${p.category === 'books' ? ' selected' : ''}>Physical Study Books</option><option value="apparel"${p.category === 'apparel' ? ' selected' : ''}>Apparel &amp; Accessories</option></select></div>
          <div class="booking-field"><label>Collection</label><input id="storeProductCollection" value="${esc(p.collection)}" placeholder="e.g. Study Resources" /></div>
          <div class="booking-field"><label>Price (USD)</label><input id="storeProductPrice" type="number" min="0" step="0.01" value="${p.priceCents === null ? '' : (p.priceCents/100).toFixed(2)}" placeholder="Leave blank until approved" /></div>
          <div class="booking-field full"><label>Short Description</label><textarea id="storeProductDescription" rows="4">${esc(p.description)}</textarea></div>
        </div>
      </div>

      <div class="store-editor-step">
        <span class="store-editor-step-label">Step 3 — Your study material.</span>
        <div class="booking-field full site-editor-image"><span class="admin-microlabel">Product Image</span><div class="admin-image-preview store-image-preview" id="storeProductImagePreview"${imageStyle(p.image)}></div><div class="admin-image-actions"><label class="admin-image-upload-btn"><span>Upload / Replace</span><input id="storeProductImageFile" type="file" accept="image/*" hidden /></label><button class="admin-image-remove-btn" id="storeProductImageRemove" type="button">Remove</button></div><details class="admin-image-advanced"><summary>Advanced: paste an image URL</summary><input id="storeProductImage" value="${esc(p.image)}" placeholder="https://…" /></details></div>
      </div>

      <div class="store-editor-step">
        <span class="store-editor-step-label">Preview</span>
        <div class="store-preview-card" id="storeProductPreview">${storeProductPreviewHtml(p)}</div>
      </div>

      <details class="store-advanced-settings">
        <summary>Advanced Settings</summary>
        <div class="booking-grid" style="margin-top:18px">
          <div class="booking-field"><label>Availability Label</label><input id="storeProductAvailability" value="${esc(p.availability === 'Not Published' ? '' : p.availability)}" placeholder="Available / Coming Soon" /></div>
          <div class="booking-field"><label>Tags (comma separated)</label><input id="storeProductTags" value="${esc(p.tags.join(', '))}" /></div>
          <div class="booking-field full"><label>What’s Included (one item per line)</label><textarea id="storeProductIncluded" rows="3">${esc(p.included.join('\n'))}</textarea></div>
          <div class="booking-field full"><label>Delivery Information</label><textarea id="storeProductDelivery" rows="3">${esc(p.delivery)}</textarea></div>
          <div class="booking-field full"><label>Options / Sizes (one per line)</label><textarea id="storeProductOptions" rows="3">${esc(p.options.join('\n'))}</textarea></div>
          <div class="booking-field"><label>Stock (physical only)</label><input id="storeProductStock" type="number" min="0" step="1" value="${p.stock === null ? '' : p.stock}" /></div>
          <label class="admin-checkbox-field"><input id="storeProductTrackInventory" type="checkbox"${p.trackInventory ? ' checked' : ''} /> Track physical inventory</label>
          <label class="admin-checkbox-field"><input id="storeProductFeatured" type="checkbox"${p.featured ? ' checked' : ''} /> Feature this product</label>
          <div class="booking-field full"><label>Additional Gallery Image URLs (one per line)</label><textarea id="storeProductImages" rows="3">${esc(p.images.join('\n'))}</textarea></div>
        </div>
      </details>

      <div class="store-save-actions"><button type="button" class="admin-btn-ghost" id="ownerStoreSaveDraftBtn" data-store-save-status="draft">Save Draft</button><button type="button" class="admin-btn-ghost" data-store-save-status="coming_soon">Mark Coming Soon</button><button type="button" class="admin-btn-solid" id="ownerStorePublishBtn" data-store-save-status="published">Publish</button>${isNew ? '' : '<button type="button" class="admin-btn-ghost store-archive" data-store-save-status="archived">Archive</button>'}</div><div class="form-status" id="ownerStoreProductStatus" role="status" aria-live="polite"></div></form>`;
  }

  function renderOwnerInventory(){
    const wrap = document.getElementById('ownerStoreInventory'); if(!wrap) return;
    const physical = products.filter(p => p.type === 'physical');
    wrap.innerHTML = `<div class="store-products-head"><div><h4>Inventory</h4><p>Current physical-product values. Fulfillment and stock reservation are not connected.</p></div></div>${physical.length ? physical.map(p => `<div class="store-inventory-row"><strong>${esc(p.title)}</strong><span>${p.trackInventory ? (p.stock ?? 0) + ' recorded' : 'Not tracked'}</span></div>`).join('') : '<p class="admin-hint">No physical products yet.</p>'}`;
  }

  function renderOwnerAppearance(){
    const wrap = document.getElementById('ownerStoreAppearance'); if(!wrap) return;
    wrap.innerHTML = `<form id="ownerStoreAppearanceForm" class="store-appearance-form"><div class="store-products-head"><div><h4>Shop Appearance</h4><p>Edit the Shop hero words without changing the established layout.</p></div></div><div class="booking-grid"><div class="booking-field"><label>Eyebrow</label><input id="storeAppearanceEyebrow" value="${esc(settings.eyebrow)}" /></div><div class="booking-field"><label>Page Title</label><input id="storeAppearanceTitle" value="${esc(settings.title)}" /></div><div class="booking-field full"><label>Tagline</label><input id="storeAppearanceTagline" value="${esc(settings.tagline)}" /></div><div class="booking-field full"><label>Description</label><textarea id="storeAppearanceDescription" rows="4">${esc(settings.description)}</textarea></div><div class="booking-field"><label>Button Label</label><input id="storeAppearanceButton" value="${esc(settings.buttonLabel)}" /></div></div><button class="admin-btn-solid" type="submit">Save Shop Appearance</button><div class="form-status" id="ownerStoreAppearanceStatus" role="status" aria-live="polite"></div></form>`;
  }

  function renderAdmin(){
    const root = document.getElementById('ownerStoreRoot'); if(!root) return;
    if(!root.dataset.ready){ root.innerHTML = ownerShellHtml(); root.dataset.ready = 'true'; wireAdmin(); }
    renderOwnerOverview(); renderOwnerProducts(); renderOwnerInventory(); renderOwnerAppearance();
  }

  function slugId(title){
    const slug = text(title).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 56) || 'product';
    return slug + '-' + Date.now().toString(36);
  }
  function editorProduct(status){
    const priceValue = document.getElementById('storeProductPrice').value;
    const dollars = priceValue === '' ? null : Number(priceValue);
    const current = editingProductId ? productById(editingProductId) : null;
    return normalizeProduct({
      id: editingProductId || slugId(document.getElementById('storeProductTitle').value),
      title: document.getElementById('storeProductTitle').value,
      type: document.getElementById('storeProductType').value,
      category: document.getElementById('storeProductCategory').value,
      status,
      featured: document.getElementById('storeProductFeatured').checked,
      priceCents: dollars === null || !Number.isFinite(dollars) ? null : Math.round(Math.max(0, dollars) * 100),
      availability: document.getElementById('storeProductAvailability').value || (status === 'coming_soon' ? 'Coming Soon' : status === 'published' ? 'Available' : ''),
      collection: document.getElementById('storeProductCollection').value,
      image: document.getElementById('storeProductImage').value,
      images: document.getElementById('storeProductImages').value,
      description: document.getElementById('storeProductDescription').value,
      included: document.getElementById('storeProductIncluded').value,
      delivery: document.getElementById('storeProductDelivery').value,
      options: document.getElementById('storeProductOptions').value,
      tags: document.getElementById('storeProductTags').value,
      trackInventory: document.getElementById('storeProductTrackInventory').checked,
      stock: document.getElementById('storeProductStock').value,
      isPlaceholder: current?.isPlaceholder || false
    });
  }

  async function saveOwnerProduct(status){
    const statusNode = document.getElementById('ownerStoreProductStatus');
    const title = document.getElementById('storeProductTitle')?.value.trim();
    if(!title){ statusNode.textContent = 'Add a product title first.'; return; }
    const product = editorProduct(status);
    if(status === 'published' && product.priceCents === null){ statusNode.textContent = 'Add an approved price before publishing. Use Coming Soon if pricing is not final.'; return; }
    statusNode.textContent = 'Saving…';
    try {
      if(DEMO_MODE){
        const index = products.findIndex(p => p.id === product.id);
        if(index >= 0) products[index] = product; else products.push(product);
        saveDemoProducts();
      } else {
        const { doc, setDoc, serverTimestamp } = firestore;
        await setDoc(doc(db, 'shopProducts', product.id), { ...product, updatedAt: serverTimestamp() }, { merge: true });
        const index = products.findIndex(p => p.id === product.id);
        if(index >= 0) products[index] = product; else products.push(product);
      }
      editingProductId = product.id;
      statusNode.textContent = statusLabel(status) + ' saved. Publishing changes visibility only; checkout is still off.';
      renderOwnerOverview(); renderOwnerProducts(); renderOwnerInventory();
    } catch (err) { statusNode.textContent = 'Could not save this product. Please try again.'; }
  }

  function openEditor(id = null){
    editingProductId = id;
    const wrap = document.getElementById('ownerStoreProductEditor'); if(!wrap) return;
    wrap.innerHTML = productEditorHtml(id ? productById(id) : null);
    wrap.scrollIntoView({ behavior: 'smooth', block: 'start' });
    const imageInput = document.getElementById('storeProductImage');
    const preview = document.getElementById('storeProductImagePreview');
    const previewCard = document.getElementById('storeProductPreview');
    const refreshPreviewCard = () => { if(previewCard) previewCard.innerHTML = storeProductPreviewHtml(editorProduct('draft')); };
    const refresh = () => { const url = imageInput.value.trim(); preview.style.backgroundImage = url ? `url("${assetUrl(url).replace(/"/g, '%22')}")` : ''; refreshPreviewCard(); };
    imageInput.addEventListener('input', refresh);
    document.getElementById('storeProductImageRemove').addEventListener('click', () => { imageInput.value = ''; refresh(); });
    document.getElementById('storeProductImageFile').addEventListener('change', async event => {
      const file = event.target.files?.[0]; if(!file) return;
      try { imageInput.value = await resizeImage(file, 1400, .76); refresh(); }
      catch (err) { document.getElementById('ownerStoreProductStatus').textContent = 'That image could not be read.'; }
    });
    const typeSelect = document.getElementById('storeProductType');
    document.getElementById('storeProductTypeCards').addEventListener('click', event => {
      const card = event.target.closest('[data-type-card]'); if(!card) return;
      typeSelect.value = card.dataset.typeCard;
      wrap.querySelectorAll('[data-type-card]').forEach(button => button.classList.toggle('active', button === card));
      refreshPreviewCard();
    });
    ['storeProductTitle','storeProductCategory','storeProductPrice'].forEach(id => {
      document.getElementById(id).addEventListener('input', refreshPreviewCard);
    });
    document.getElementById('storeProductCategory').addEventListener('change', refreshPreviewCard);
    document.getElementById('ownerStoreCloseEditor').addEventListener('click', () => { editingProductId = null; wrap.innerHTML = ''; });
    wrap.querySelectorAll('[data-store-save-status]').forEach(button => button.addEventListener('click', () => saveOwnerProduct(button.dataset.storeSaveStatus)));
  }

  async function saveAppearance(event){
    event.preventDefault();
    const status = document.getElementById('ownerStoreAppearanceStatus');
    settings = {
      eyebrow: text(document.getElementById('storeAppearanceEyebrow').value) || DEFAULT_SETTINGS.eyebrow,
      title: text(document.getElementById('storeAppearanceTitle').value) || DEFAULT_SETTINGS.title,
      tagline: text(document.getElementById('storeAppearanceTagline').value) || DEFAULT_SETTINGS.tagline,
      description: text(document.getElementById('storeAppearanceDescription').value) || DEFAULT_SETTINGS.description,
      buttonLabel: text(document.getElementById('storeAppearanceButton').value) || DEFAULT_SETTINGS.buttonLabel
    };
    status.textContent = 'Saving…';
    try {
      if(DEMO_MODE) saveDemoSettings();
      else await firestore.setDoc(firestore.doc(db, 'shopSettings', 'public'), { ...settings, updatedAt: firestore.serverTimestamp() }, { merge: true });
      status.textContent = 'Shop appearance saved.'; applySettings();
    } catch (err) { status.textContent = 'Could not save these changes. Please try again.'; }
  }

  function showStoreTab(tab){
    document.querySelectorAll('#ownerStoreTabs [data-store-tab]').forEach(button => button.classList.toggle('active', button.dataset.storeTab === tab));
    document.querySelectorAll('[data-store-panel]').forEach(panel => { panel.hidden = panel.dataset.storePanel !== tab; });
  }
  function wireAdmin(){
    document.getElementById('ownerStoreTabs').addEventListener('click', event => { const button = event.target.closest('[data-store-tab]'); if(button) showStoreTab(button.dataset.storeTab); });
    document.getElementById('ownerStoreNewProduct').addEventListener('click', () => openEditor());
    document.getElementById('ownerStoreProductsList').addEventListener('click', event => { const button = event.target.closest('[data-store-edit]'); if(button) openEditor(button.dataset.storeEdit); });
    document.getElementById('ownerStoreAppearance').addEventListener('submit', event => { if(event.target.id === 'ownerStoreAppearanceForm') saveAppearance(event); });
  }

  async function loadAdmin(){
    if(DEMO_MODE){ adminLoaded = true; renderAdmin(); return; }
    const { collection, getDocs, doc, getDoc } = firestore;
    const [productSnap, settingsSnap] = await Promise.all([getDocs(collection(db, 'shopProducts')), getDoc(doc(db, 'shopSettings', 'public'))]);
    products = []; productSnap.forEach(snapshot => products.push(normalizeProduct({ id: snapshot.id, ...snapshot.data() })));
    if(settingsSnap.exists()) settings = { ...DEFAULT_SETTINGS, ...settingsSnap.data() };
    adminLoaded = true; renderAdmin();
  }

  wireShared();
  renderPublic();

  return { loadPublic, renderPublic, loadAdmin, renderAdmin, openCart: () => setCartOpen(true), isAdminLoaded: () => adminLoaded };
}
