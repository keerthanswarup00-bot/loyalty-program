// The shop's Connect page: one public page per shop at /connect/<slug>/ (also /connect/?shop=<slug>).
// Everything shown comes from the public get_business(slug) and get_menu(slug) RPCs: name, tagline,
// colour, logo, contact details, links and the product/service list. The scan token, owner and any other
// private field are never read or shown. No visitor login, no cookies.
const collectionRoute = /\/collection\/?$/i.test(location.pathname);
const slugFromPath = (() => {
  const m = location.pathname.match(/^\/connect\/([a-z0-9][a-z0-9-]*)(?:\/collection)?\/?$/i);
  const s = m && m[1].toLowerCase();
  return s && !['assets', 'index', 'app', 'admin', 'platform'].includes(s) ? s : null;
})();
const slugFromQuery = (() => {
  const q = new URLSearchParams(location.search).get('shop');
  return q && /^[a-z0-9-]+$/.test(q) ? q.toLowerCase() : null;
})();
// Path wins, then the ?shop= fallback. Setting CFG.slug/linkSlug lets resolveShop() (common.js) honour it and
// makes the /app/ links point at this shop, so everything stays on the same address (custom domains included).
if (slugFromPath || slugFromQuery) { CFG.slug = slugFromPath || slugFromQuery; linkSlug = slugFromPath || slugFromQuery }

const sb = notReady() ? null : mkClient('lk-connect');
let B = null, MENU = null, V = null;

const httpsOnly = u => /^https:\/\//i.test(String(u || '')) ? String(u) : '';
const imgOk = u => /^(https:\/\/|data:image\/)/i.test(String(u || ''));
// A phone as international digits for tel: and wa.me links. Ten digits get the country code added.
const phoneDigits = raw => {
  let d = String(raw || '').replace(/\D/g, '');
  if (d.length == 11 && d[0] == '0') d = d.slice(1);
  if (d.length == 10) d = (CFG.countryCode || '91') + d;
  return d;
};
const waDigits = b => phoneDigits(b.wa_phone) || (String(b.wa || '').match(/(\d{10,15})/) || [])[1] || '';
const waHref = (digits, text) => digits ? 'https://wa.me/' + digits + (text ? '?text=' + encodeURIComponent(text) : '') : '';
function mapsHref(b) {
  const u = httpsOnly(b.maps_url); if (u) return u;
  if (isFinite(b.lat) && isFinite(b.lng) && b.lat !== null && b.lng !== null) return 'https://www.google.com/maps/search/?api=1&query=' + b.lat + ',' + b.lng;
  if (b.address) return 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(b.address);
  return '';
}
const telHref = b => { const d = phoneDigits(b.phone); return d ? 'tel:+' + d : '' };

const I = {
  arrow: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7 17 17 7M8 7h9v9"/></svg>',
  gift: ico('<rect x="3" y="8" width="18" height="4" rx="1"/><path d="M5 12v8h14v-8M12 8v12M12 8c-2 0-4-1-4-3s3-2.5 4 3c1-5.5 4-5 4-3s-2 3-4 3"/>'),
  pin: ico('<path d="M12 21s7-5.6 7-11a7 7 0 1 0-14 0c0 5.4 7 11 7 11z"/><circle cx="12" cy="10" r="2.5"/>'),
  call: ico('<path d="M4 5c0 8.3 6.7 15 15 15l2-3.6-4.3-2-1.8 1.8a12 12 0 0 1-4.6-4.6l1.8-1.8-2-4.3z"/>'),
  yt: ico('<rect x="2.5" y="5.5" width="19" height="13" rx="4"/><path d="M11 9.5l4 2.5-4 2.5z"/>'),
  star: ico('<path d="M12 3.5l2.9 5.9 6.1.9-4.5 4.4 1.1 6.1L12 18l-5.6 3 1.1-6.1L3 10.3l6.1-.9z"/>'),
  share: ico('<path d="M12 3v12M8 7l4-4 4 4M5 12v7a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-7"/>'),
  copy: ico('<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/>'),
  qr: ico('<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><path d="M14 14h3v3M21 14v0M21 21h-4v-4"/>'),
  wa: IC.wa, ig: IC.ig, fb: IC.fb, web: IC.web
};

// Quick action (directions / call / WhatsApp) — compact, in a row of three.
function quick(href, icon, label, ext) {
  const e = ext ? ' target="_blank" rel="noopener"' : '';
  return `<a class="cn-quick-a" href="${esc(href)}"${e}><span class="cn-qi">${icon}</span><span>${esc(label)}</span></a>`;
}
// A full-width action button.
function row(href, icon, label, sub, pri, ext) {
  const e = ext ? ' target="_blank" rel="noopener"' : '';
  return `<a class="cn-act${pri ? ' pri' : ''}" href="${esc(href)}"${e}><span class="cn-ai">${icon}</span><span class="cn-at"><b>${esc(label)}</b>${sub ? `<small>${esc(sub)}</small>` : ''}</span><span class="cn-ar">${I.arrow}</span></a>`;
}

function socialList(b) {
  const out = [];
  const push = (label, url, icon) => { const u = httpsOnly(url); if (u) out.push({ label, url: u, icon }) };
  push('Instagram', b.ig, I.ig); push('Facebook', b.fb, I.fb); push('YouTube', b.yt, I.yt); push('Website', b.web, I.web);
  (Array.isArray(b.links) ? b.links : []).forEach(x => { const u = httpsOnly(x && x.url); if (u) out.push({ label: String((x && x.label) || 'Link'), url: u, icon: I.web }) });
  return out;
}

// Hero: a full-width photo with the shop name over it when the owner uploaded one, otherwise the colour hero.
function heroSection(b) {
  const logo = `<div class="logo">${mark(b)}</div>`;
  const isAroma = String(b.slug || '').toLowerCase() === 'aroma-scripts';
  const tagText = b.tagline || (isAroma ? 'Every Scent Has a Story.' : '');
  const tag = tagText ? `<p>${esc(tagText)}</p>` : '';
  const heroUrl = imgOk(b.hero_url) ? b.hero_url : (isAroma ? '/assets/aroma-scripts-hero-clean.svg' : '');
  if (heroUrl) {
    return `<header class="cn-hero cn-hero-img${isAroma ? ' cn-hero-aroma' : ''}"><img class="cn-hero-bg" src="${esc(heroUrl)}" alt="" decoding="async" fetchpriority="high" onerror="this.parentNode.classList.remove('cn-hero-img','cn-hero-aroma');this.remove()"><div class="cn-hero-in">${logo}<h1>${esc(b.name)}</h1>${tag}</div></header>`;
  }
  return `<header class="cn-hero${b.about ? ' cn-art' : ''}"><div class="cn-hero-in">${logo}<h1>${esc(b.name)}</h1>${tag}</div></header>`;
}
// About: the owner's short description, shown right under the hero. Blank line = new paragraph.
function aboutSection(b) {
  const isAroma = String(b.slug || '').toLowerCase() === 'aroma-scripts';
  const fallback = isAroma
    ? 'At Aroma Scripts, we believe every fragrance tells a story, evokes an emotion, and creates a memory worth remembering. Our perfumes are handcrafted in small batches with carefully selected fragrance oils and a 30% fragrance concentration. From fresh notes to deep, indulgent compositions, each scent celebrates individuality. We also create bespoke fragrances tailored to your preferences.'
    : '';
  const t = String(b.about || fallback).trim();
  if (!t) return '';
  const paras = t.split(/\n{2,}/).map(x => `<p>${esc(x.trim()).replace(/\n/g, '<br>')}</p>`).join('');
  if (isAroma) {
    const plain = t.replace(/\s+/g, ' ').trim();
    const preview = plain.length > 145 ? plain.slice(0, 145).replace(/\s+\S*$/, '') + '…' : plain;
    return `<section class="cn-about cn-about-aroma" aria-label="About ${esc(b.name)}"><div class="cn-eyebrow">Our story</div><div class="cn-about-copy" data-about-copy><p>${esc(preview)}</p></div>${plain.length > 145 ? `<button class="cn-read-more" type="button" aria-expanded="false" onclick="toggleAbout(this)">Read our story <span aria-hidden="true">＋</span></button><div class="cn-about-full" hidden>${paras}</div>` : ''}</section>`;
  }
  return `<section class="cn-about" aria-label="About ${esc(b.name)}"><div class="cn-eyebrow">About</div>${paras}</section>`;
}
function toggleAbout(button) {
  const section = button.closest('.cn-about-aroma');
  if (!section) return;
  const expanded = button.getAttribute('aria-expanded') === 'true';
  const preview = section.querySelector('[data-about-copy]');
  const full = section.querySelector('.cn-about-full');
  if (!full || !preview) return;
  full.hidden = expanded;
  preview.hidden = !expanded;
  button.setAttribute('aria-expanded', String(!expanded));
  button.innerHTML = expanded ? 'Read our story <span aria-hidden="true">＋</span>' : 'Show less <span aria-hidden="true">−</span>';
}

function menuSection() {
  if (!MENU || !MENU.items || !MENU.items.length || collectionRoute) return '';
  const cats = (MENU.categories || []).map(c => ({ ...c, items: MENU.items.filter(i => i.category_id == c.id) })).filter(c => c.items.length);
  const loose = MENU.items.filter(i => !i.category_id || !(MENU.categories || []).some(c => c.id == i.category_id));
  const wd = waDigits(B);
  const item = x => {
    const im = imgOk(x.image_url) ? `<span class="mn-ph"><img src="${esc(x.image_url)}" alt="" loading="lazy" decoding="async" onerror="this.remove()"></span>` : '';
    const ask = wd ? `<a class="mn-ask" href="${esc(waHref(wd, V.orderText(B.name, x.title)))}" target="_blank" rel="noopener" aria-label="${esc(V.ask + ': ' + x.title)}">${I.wa}</a>` : '';
    return `<li class="cn-item"><div class="mn-tx"><b>${esc(x.title)}</b>${x.description ? `<small>${esc(x.description)}</small>` : ''}</div>${im}${x.price ? `<span class="mn-pr">${esc(x.price)}</span>` : ''}${ask}</li>`;
  };
  const group = (name, items) => `<div class="cn-grp">${name ? `<h3>${esc(name)}</h3>` : ''}<ul class="cn-list">${items.map(item).join('')}</ul></div>`;
  const body = cats.length ? cats.map(c => group(c.name, c.items)).join('') + (loose.length ? group('Others', loose) : '') : group('', MENU.items);
  return `<section class="cn-sec" id="products"><h2>${esc(V.section)}</h2>${body}</section>`;
}

function slugifyText(value) {
  return String(value || 'product').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'product';
}

function collectionUrl() { return connectBase() + 'collection/'; }

function collectionLink() {
  if (!MENU || !MENU.items || !MENU.items.length) return '';
  return `<section class="cn-collection-cta"><div><span class="cn-eyebrow">Explore</span><h2>Our collection</h2><p>Browse everything we make and ask us about the pieces you love.</p></div><a class="cn-collection-btn" href="${esc(collectionUrl())}">View collection <span aria-hidden="true">${I.arrow}</span></a></section>`;
}

function openProduct(id) {
  const product = (MENU && MENU.items || []).find(x => String(x.id || slugifyText(x.title)) === String(id));
  if (!product) return;
  const modal = document.getElementById('cn-product-sheet'), content = document.getElementById('cn-product-sheet-content');
  if (!modal || !content) return;
  const wd = waDigits(B);
  const image = imgOk(product.image_url) ? `<img class="cn-product-sheet-image" src="${esc(product.image_url)}" alt="${esc(product.title)}" decoding="async">` : '<div class="cn-product-sheet-image cn-product-sheet-image-empty" aria-hidden="true">✦</div>';
  const desc = product.description ? `<p class="cn-product-sheet-description">${esc(product.description).replace(/\n/g, '<br>')}</p>` : '<p class="cn-product-sheet-description">Contact us for more information about this product.</p>';
  const price = product.price ? `<div class="cn-product-sheet-price">${esc(product.price)}</div>` : '';
  const ask = wd ? `<a class="cn-product-sheet-ask" href="${esc(waHref(wd, 'Hi ' + B.name + ', I want more details about ' + product.title + '.'))}" target="_blank" rel="noopener">${I.wa}<span>Ask for more details</span>${I.arrow}</a>` : '<p class="cn-product-contact-note">WhatsApp enquiry is not available yet. Please use the contact details on the main page.</p>';
  const category = (MENU.categories || []).find(c => c.id == product.category_id);
  content.innerHTML = `${image}<div class="cn-product-sheet-info"><div class="cn-product-sheet-heading"><div><span class="cn-eyebrow">${esc(category ? category.name : 'Product')}</span><h2>${esc(product.title)}</h2></div>${price}</div>${desc}${ask}</div>`;
  modal.hidden = false; document.body.classList.add('cn-product-sheet-open'); modal.setAttribute('aria-hidden', 'false');
  const close = modal.querySelector('.cn-product-sheet-close'); if (close) close.focus();
}
function closeProduct() {
  const modal = document.getElementById('cn-product-sheet'); if (!modal) return;
  modal.hidden = true; modal.setAttribute('aria-hidden', 'true'); document.body.classList.remove('cn-product-sheet-open');
}
function productSheetMarkup() {
  return `<div class="cn-product-sheet-backdrop" id="cn-product-sheet" hidden aria-hidden="true" onclick="if(event.target===this)closeProduct()"><section class="cn-product-sheet-panel" role="dialog" aria-modal="true" aria-label="Product details"><button class="cn-product-sheet-close" type="button" aria-label="Close product details" onclick="closeProduct()">×</button><div id="cn-product-sheet-content"></div></section></div>`;
}
function productCollectionSection() {
  if (!MENU || !Array.isArray(MENU.items) || !MENU.items.length) return '<section class="cn-sec"><div class="cn-empty"><h2>Collection coming soon</h2><p class="sub">Products will appear here when this shop adds them.</p></div></section>';
  const cats = (MENU.categories || []).map(c => ({ ...c, items: MENU.items.filter(i => i.category_id == c.id) })).filter(c => c.items.length);
  const loose = MENU.items.filter(i => !i.category_id || !(MENU.categories || []).some(c => c.id == i.category_id));
  const item = x => {
    const id = x.id || slugifyText(x.title);
    const img = imgOk(x.image_url) ? `<span class="cn-product-thumb"><img src="${esc(x.image_url)}" alt="" loading="lazy" decoding="async"></span>` : '<span class="cn-product-thumb cn-product-thumb-empty" aria-hidden="true">✦</span>';
    return `<article class="cn-product"><button class="cn-product-toggle" type="button" onclick="openProduct('${esc(id)}')" aria-label="View details for ${esc(x.title)}">${img}<span class="cn-product-title"><b>${esc(x.title)}</b>${x.price ? `<small>${esc(x.price)}</small>` : ''}</span><span class="cn-product-chevron" aria-hidden="true">⌄</span></button></article>`;
  };
  const group = (name, items) => `<section class="cn-collection-group">${name ? `<h2>${esc(name)}</h2>` : ''}<div class="cn-product-list">${items.map(item).join('')}</div></section>`;
  return `<div class="cn-collection-intro"><a class="cn-back-link" href="${esc(connectBase())}">← Back to ${esc(B.name)}</a><span class="cn-eyebrow">The collection</span><h1>${esc(B.name)} <em>Collection</em></h1><p>Explore our products. Select any item to read more and ask us for details.</p><span class="cn-collection-count">${MENU.items.length} ${MENU.items.length === 1 ? 'product' : 'products'}</span></div><div class="cn-collection-groups">${cats.map(c => group(c.name, c.items)).join('')}${loose.length ? group(cats.length ? 'Others' : '', loose) : ''}</div>${productSheetMarkup()}`;
}

function gallerySection() {
  const g = (Array.isArray(B.gallery) ? B.gallery : []).map(httpsOnly).filter(Boolean);
  if (!g.length) return '';
  const isAroma = String(B.slug || '').toLowerCase() === 'aroma-scripts';
  return `<section class="cn-sec${isAroma ? ' cn-gallery-aroma' : ''}"><h2>${isAroma ? 'A closer look' : 'Photos'}</h2>${isAroma ? '<p class="cn-section-intro">A little more of the world behind our fragrances.</p>' : ''}<div class="cn-gal${isAroma ? ' cn-gal-aroma' : ''}">${g.slice(0, isAroma ? 6 : 12).map((u, i) => `<img src="${esc(u)}" alt="${esc(B.name)} photo ${i + 1}" loading="lazy" decoding="async" onerror="this.remove()">`).join('')}</div></section>`;
}

function featuredProductsSection() {
  if (String(B.slug || '').toLowerCase() !== 'aroma-scripts' || !MENU || !Array.isArray(MENU.items)) return '';
  const items = MENU.items.filter(x => x && x.available !== false && imgOk(x.image_url)).slice(0, 3);
  if (!items.length) return '';
  const wd = waDigits(B);
  return `<section class="cn-sec cn-featured-aroma"><div class="cn-featured-head"><div><span class="cn-eyebrow">Discover your scent</span><h2>Featured fragrances</h2><p class="cn-section-intro">Explore a few favourites, then find the scent that feels like you.</p></div><a class="cn-featured-all" href="${esc(collectionUrl())}">View all ${I.arrow}</a></div><div class="cn-featured-grid">${items.map(x => {
    const category = (MENU.categories || []).find(c => c.id == x.category_id);
    return `<article class="cn-featured-card"><button type="button" class="cn-featured-open" onclick="openProduct('${esc(x.id || slugifyText(x.title))}')" aria-label="View ${esc(x.title)}"><img src="${esc(x.image_url)}" alt="${esc(x.title)}" loading="lazy" decoding="async" onerror="this.closest('.cn-featured-card').remove()"><span class="cn-featured-meta">${category ? `<small>${esc(category.name)}</small>` : ''}<b>${esc(x.title)}</b>${x.price ? `<span>${esc(x.price)}</span>` : ''}</span><span class="cn-featured-plus" aria-hidden="true">↗</span></button>${wd ? `<a class="cn-featured-ask" href="${esc(waHref(wd, 'Hi ' + B.name + ', I would love to know more about ' + x.title + '.'))}" target="_blank" rel="noopener">Enquire on WhatsApp ${I.arrow}</a>` : ''}</article>`;
  }).join('')}</div><a class="cn-featured-mobile-all" href="${esc(collectionUrl())}">Explore the full collection ${I.arrow}</a></section>${productSheetMarkup()}`;
}

function offerSection(b) {
  if (String(b.slug || '').toLowerCase() !== 'aroma-scripts') return '';
  const offer = b.connect_offer && typeof b.connect_offer === 'object' ? b.connect_offer : {};
  const title = String(offer.title || '').trim(), text = String(offer.text || '').trim();
  if (!title && !text) return '';
  const url = httpsOnly(offer.url);
  const wd = waDigits(b);
  const href = url || (wd ? waHref(wd, 'Hi ' + b.name + ', I would like to know more about: ' + (title || 'your current offer') + '.') : '');
  const label = String(offer.label || (wd ? 'Enquire on WhatsApp' : 'Learn more')).trim();
  return `<section class="cn-offer-aroma"><span class="cn-offer-kicker">A little something special</span><div class="cn-offer-copy"><h2>${esc(title || 'A special offer')}</h2>${text ? `<p>${esc(text)}</p>` : ''}</div>${href ? `<a class="cn-offer-button" href="${esc(href)}" target="_blank" rel="noopener">${esc(label)} ${I.arrow}</a>` : ''}</section>`;
}

// Aroma actions: one full-width WhatsApp button, then Call / Directions / Instagram, each only when the shop filled it in.
// The prefilled message follows the language the visitor chose on the Innondu site (innondu-lang) or the page's lang attribute.
const WA_TEXT = {
  en: n => 'Hi ' + n + '! I found your page and I\u2019d like to know more.',
  hi: n => '\u0928\u092e\u0938\u094d\u0924\u0947 ' + n + '! \u092e\u0948\u0902\u0928\u0947 \u0906\u092a\u0915\u093e \u092a\u0947\u091c \u0926\u0947\u0916\u093e \u0914\u0930 \u092e\u0941\u091d\u0947 \u0914\u0930 \u091c\u093e\u0928\u0915\u093e\u0930\u0940 \u091a\u093e\u0939\u093f\u090f\u0964',
  kn: n => '\u0ca8\u0cae\u0cb8\u0ccd\u0c95\u0cbe\u0cb0 ' + n + '! \u0ca8\u0cbf\u0cae\u0ccd\u0cae \u0caa\u0cc1\u0c9f \u0ca8\u0ccb\u0ca1\u0cbf\u0ca6\u0cc6, \u0c87\u0ca8\u0ccd\u0ca8\u0cb7\u0ccd\u0c9f\u0cc1 \u0ca4\u0cbf\u0cb3\u0cbf\u0caf\u0cb2\u0cc1 \u0cac\u0caf\u0cb8\u0cc1\u0ca4\u0ccd\u0ca4\u0cc7\u0ca8\u0cc6.'
};
function activeLang() {
  let l = '';
  try { l = localStorage.getItem('innondu-lang') || '' } catch (e) { }
  l = (l || document.documentElement.lang || 'en').toLowerCase().slice(0, 2);
  return WA_TEXT[l] ? l : 'en';
}
function aromaActions(b) {
  const wd = waDigits(b);
  const ig = socialList(b).find(x => x.label === 'Instagram');
  const sec = [
    telHref(b) ? ['Call', I.call, telHref(b), false] : null,
    mapsHref(b) ? ['Directions', I.pin, mapsHref(b), true] : null,
    ig ? ['Instagram', I.ig, ig.url, true] : null
  ].filter(Boolean);
  const primary = wd ? `<a class="cn-wa-primary" href="${esc(waHref(wd, WA_TEXT[activeLang()](b.name)))}" target="_blank" rel="noopener">${I.wa}<span>Chat on WhatsApp</span></a>` : '';
  const row2 = sec.length ? `<nav class="cn-sec-actions" style="--n:${sec.length}" aria-label="Contact ${esc(b.name)}">${sec.map(x => `<a class="cn-sec-a" href="${esc(x[2])}"${x[3] ? ' target="_blank" rel="noopener"' : ''}>${x[1]}<span>${x[0]}</span></a>`).join('')}</nav>` : '';
  return primary || row2 ? `<div class="cn-cta-aroma">${primary}${row2}</div>` : '';
}

function view() {
  const b = B;
  const isAroma = String(b.slug || '').toLowerCase() === 'aroma-scripts';
  const wd = waDigits(b);
  const q = [
    mapsHref(b) ? quick(mapsHref(b), I.pin, 'Directions', true) : '',
    telHref(b) ? quick(telHref(b), I.call, 'Call', false) : '',
    wd ? quick(waHref(wd, 'Hi ' + b.name + '!'), I.wa, 'WhatsApp', true) : ''
  ].filter(Boolean).join('');
  const soc = socialList(b);
  const rev = httpsOnly(b.review_url);
  const loyalty = b.connect_loyalty !== false;
  const acts = (loyalty ? row(appBase(), I.gift, 'Join the loyalty card', 'Collect stamps, earn rewards', true, false) : '')
    + (rev ? row(rev, I.star, 'Leave a review', 'Takes a minute', false, true) : '');
  if (collectionRoute) return `${productCollectionSection()}<footer class="cn-foot">${esc(b.name)} · <a href="https://www.innondu.com/" target="_blank" rel="noopener">Powered by Innondu</a></footer>`;
  const socials = isAroma ? [soc.find(x => x.label === 'Instagram'), soc.find(x => x.label === 'Website')].filter(Boolean) : soc;
  const socialMarkup = socials.length ? `<section class="cn-sec${isAroma ? ' cn-social-aroma' : ''}"><h2>${isAroma ? 'Follow the fragrance' : 'Find us online'}</h2><div class="cn-soc${isAroma ? ' cn-soc-pair' : ''}">${socials.map(x => `<a href="${esc(x.url)}" target="_blank" rel="noopener">${x.icon}<span>${esc(x.label)}</span></a>`).join('')}</div></section>` : '';
  const shareMarkup = isAroma
    ? `<section class="cn-sec cn-share-aroma"><div class="cn-share-head"><div><span class="cn-eyebrow">Take us with you</span><h2>Share Aroma Scripts</h2><p>Send our scents to someone who’d love them.</p></div><button type="button" class="cn-share-primary" onclick="sharePage()">${I.share}<span>Share</span></button></div><div class="cn-share-tools"><button type="button" class="cn-share-tool" onclick="copyText(shareUrl(),'Link copied')">${I.copy}<span>Copy link</span></button><button type="button" class="cn-share-tool" onclick="toggleQr()">${I.qr}<span>Show QR</span></button></div><div id="cn-qr" class="cn-qr" hidden></div></section>`
    : `<section class="cn-sec"><h2>Share</h2><div class="cn-share"><button type="button" class="cn-act" onclick="sharePage()"><span class="cn-ai">${I.share}</span><span class="cn-at"><b>Share this page</b><small>WhatsApp, or anywhere</small></span></button><button type="button" class="cn-act" onclick="copyText(shareUrl(),'Link copied')"><span class="cn-ai">${I.copy}</span><span class="cn-at"><b>Copy link</b></span></button><button type="button" class="cn-act" onclick="toggleQr()"><span class="cn-ai">${I.qr}</span><span class="cn-at"><b>Show QR code</b><small>Print it, or write it to a tag</small></span></button></div><div id="cn-qr" class="cn-qr" hidden></div></section>`;
  return `${heroSection(b)}
  ${isAroma ? aromaActions(b) : ''}
  ${aboutSection(b)}
  ${q && !isAroma ? `<nav class="cn-quick${isAroma ? ' cn-quick-aroma' : ''}" aria-label="Contact ${esc(b.name)}">${q}</nav>` : ''}
  ${acts ? `<nav class="cn-acts" aria-label="More from ${esc(b.name)}">${acts}</nav>` : ''}
  ${rev ? `<p class="cn-note">Honest reviews only — we don't offer rewards in exchange for them.</p>` : ''}
  ${featuredProductsSection()}
  ${offerSection(b)}
  ${collectionLink()}
  ${gallerySection()}
  ${socialMarkup}
  ${shareMarkup}
  <footer class="cn-foot">${esc(b.name)} · <a href="https://www.innondu.com/" target="_blank" rel="noopener">Powered by Innondu</a></footer>`;
}

const notSetUp = () => '<div class="card cn-empty"><h2>This shop isn\'t set up yet</h2><p class="sub">The link may be wrong, or the shop has not finished setting up its page. Check the address, or ask the shop for their link.</p></div>';
const shareUrl = () => location.origin + location.pathname;

function toggleQr() {
  const el = $('#cn-qr'); if (!el) return;
  if (!el.hidden) { el.hidden = true; el.innerHTML = ''; return }
  const url = shareUrl();
  const svg = typeof qrcode == 'undefined' ? '' : (() => { const z = qrcode(0, 'M'); z.addData(url); z.make(); return z.createSvgTag({ cellSize: 5, margin: 2, scalable: true }) })();
  el.hidden = false;
  el.innerHTML = `<div class="cn-qr-box">${svg || '<p class="sub">QR code unavailable.</p>'}<p class="sub">${esc(url.replace(/^https?:\/\//, ''))}</p>
    ${svg ? '<button type="button" class="btn alt" onclick="downloadQr()">Download QR (SVG)</button>' : ''}
    <p class="cn-note">To use an NFC keychain, write this same link to the tag.</p></div>`;
}
function downloadQr() {
  const svg = $('#cn-qr .cn-qr-box svg'); if (!svg) return;
  const blob = new Blob([svg.outerHTML], { type: 'image/svg+xml' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = (CFG.slug || 'shop') + '-qr.svg';
  document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
function sharePage() {
  const url = shareUrl(), title = B ? B.name : 'Connect', text = B && B.tagline ? B.name + ' — ' + B.tagline : title;
  if (navigator.share) { navigator.share({ title, text, url }).catch(() => { }) }
  else { window.open('https://wa.me/?text=' + encodeURIComponent(text + ' ' + url), '_blank', 'noopener') }
}

// Social preview + tab title, set at runtime for browsers (crawlers get the same from middleware.js).
function meta(attr, key, content) {
  if (!content) return;
  let el = document.head.querySelector(`meta[${attr}="${key}"]`);
  if (!el) { el = document.createElement('meta'); el.setAttribute(attr, key); document.head.appendChild(el) }
  el.setAttribute('content', content);
}
function jsonld(b) {
  const data = {
    '@context': 'https://schema.org', '@type': vertical(b.vertical).schemaType, name: b.name,
    url: shareUrl(), image: httpsOnly(b.logo_url) || undefined, description: b.tagline || undefined,
    telephone: phoneDigits(b.phone) ? '+' + phoneDigits(b.phone) : undefined,
    address: b.address ? { '@type': 'PostalAddress', streetAddress: b.address, addressCountry: 'IN' } : undefined,
    sameAs: socialList(b).filter(x => x.label != 'Website').map(x => x.url)
  };
  Object.keys(data).forEach(k => data[k] === undefined && delete data[k]);
  const s = document.createElement('script'); s.type = 'application/ld+json'; s.textContent = JSON.stringify(data);
  document.head.appendChild(s);
}
function share(b) {
  const title = collectionRoute ? b.name + ' · Collection' : b.name + ' · Connect';
  document.title = title;
  meta('property', 'og:title', title);
  meta('property', 'og:type', 'website');
  meta('property', 'og:url', location.origin + location.pathname);
  const desc = (b.about ? String(b.about).replace(/\s+/g, ' ').trim().slice(0, 160) : '') || b.tagline || ('Find ' + b.name + ' — contact, menu and links in one place.');
  meta('property', 'og:description', desc);
  meta('name', 'description', desc);
  meta('name', 'twitter:card', 'summary_large_image');
  const ogImg = httpsOnly(b.hero_url) || httpsOnly(b.logo_url);
  if (ogImg) meta('property', 'og:image', ogImg);
  meta('name', 'theme-color', HEX6.test(b.color || '') ? b.color : '#8a4b2a');
  const link = document.head.querySelector('link[rel="canonical"]') || (() => { const l = document.createElement('link'); l.rel = 'canonical'; document.head.appendChild(l); return l })();
  link.href = location.origin + location.pathname;
  jsonld(b);
}

async function loadMenu() {
  try { const raw = await rpc(sb, 'get_menu', { p_slug: CFG.slug }); MENU = Array.isArray(raw) ? { categories: [], items: raw } : { categories: (raw && raw.categories) || [], items: (raw && raw.items) || [] } }
  catch (e) { MENU = { categories: [], items: [] } }
}

(async () => {
  const app = $('#app');
  if (notReady()) { app.innerHTML = setupMsg; return }
  if (!(await resolveShop())) { app.innerHTML = noShopMsg; return }
  try { B = await rpc(sb, 'get_business', { p_slug: CFG.slug }) } catch (e) { B = null }
  if (!B || !B.name) { document.title = 'Connect'; app.innerHTML = notSetUp(); return }
  V = vertical(B.vertical);
  await loadMenu();
  brand(B); share(B);
  // Aroma Scripts: accent text and icons use the hero-artwork gold (AA on light and dark) instead of the purple brand colour. Fills keep --brand.
  if (String(B.slug || '').toLowerCase() === 'aroma-scripts') { const st = document.documentElement.style; st.setProperty('--brand-t-l', '#855a1a'); st.setProperty('--brand-t-d', '#e0b062') }
  if (collectionRoute) { document.title = B.name + ' · Collection'; meta('name', 'description', 'Explore the product collection from ' + B.name + '. Open a product to read more or ask us on WhatsApp.'); }
  app.innerHTML = view();
})();
