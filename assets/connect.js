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
let B = null, MENU = null, V = null, MENU_ERR = false;

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
  const heroUrl = imgOk(b.hero_url) ? b.hero_url : (isAroma ? 'https://www.innondu.com/assets/aroma-scripts-hero.svg' : '');
  if (imgOk(heroUrl)) {
    return `<header class="cn-hero cn-hero-img"><img class="cn-hero-bg" src="${esc(heroUrl)}" alt="" decoding="async" fetchpriority="high" onerror="this.parentNode.classList.remove('cn-hero-img');this.remove()"><div class="cn-hero-in">${logo}<h1>${esc(b.name)}</h1>${tag}</div></header>`;
  }
  return `<header class="cn-hero${b.about ? ' cn-art' : ''}"><div class="cn-hero-in">${logo}<h1>${esc(b.name)}</h1>${tag}</div></header>`;
}
// About: the owner's short description, shown right under the hero. Blank line = new paragraph.
function aboutSection(b) {
  const fallback = String(b.slug || '').toLowerCase() === 'aroma-scripts'
    ? 'At Aroma Scripts, we believe every fragrance tells a story, evokes an emotion, and creates a memory worth remembering. Our perfumes are handcrafted in small batches with carefully selected fragrance oils and a 30% fragrance concentration. From fresh notes to deep, indulgent compositions, each scent celebrates individuality. We also create bespoke fragrances tailored to your preferences.'
    : '';
  const t = String(b.about || fallback).trim();
  if (!t) return '';
  const paras = t.split(/\n{2,}/).map(x => `<p>${esc(x.trim()).replace(/\n/g, '<br>')}</p>`).join('');
  return `<section class="cn-about" aria-label="About ${esc(b.name)}"><div class="cn-eyebrow">About</div>${paras}</section>`;
}

function menuSection() {
  if (!MENU || !MENU.items || !MENU.items.length || collectionRoute) return '';
  const cats = (MENU.categories || []).map(c => ({ ...c, items: MENU.items.filter(i => i.category_id == c.id) })).filter(c => c.items.length);
  const loose = MENU.items.filter(i => !i.category_id || !(MENU.categories || []).some(c => c.id == i.category_id));
  const wd = waDigits(B);
  const item = x => {
    const im = imgOk(x.image_url) ? `<span class="mn-ph"><img src="${esc(x.image_url)}" alt="" loading="lazy" decoding="async" onerror="this.remove()"></span>` : '';
    const ask = wd ? `<a class="mn-ask" href="${esc(waHref(wd, productText(x)))}" target="_blank" rel="noopener" aria-label="${esc(V.ask + ': ' + x.title)}">${I.wa}</a>` : '';
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
// What the customer's WhatsApp message starts with for one product: wording by shop type (order / book / enquire),
// the product name and price, and the collection link, so the shop knows exactly which item it is about.
const productText = x => V.orderText(B.name, x.title + (x.price ? ' (' + x.price + ')' : '')) + ' ' + collectionUrl();

// A failed load is not an empty shop: say what happened and let the visitor try again.
const loadFailed = what => `<div class="cn-empty cn-retry" role="alert"><h2>Couldn't load ${esc(what)}</h2><p class="sub">Check your connection and try again.</p><button type="button" class="btn" onclick="retryMenu(this)">Try again</button></div>`;
async function retryMenu(btn) {
  if (btn) { btn.disabled = true; btn.textContent = 'Trying again…' }
  await loadMenu();
  if (!MENU_ERR) share(B);
  $('#app').innerHTML = view();
}
function collectionLink() {
  if (MENU_ERR) return `<section class="cn-sec">${loadFailed(V.section.toLowerCase())}</section>`;
  if (!MENU || !MENU.items || !MENU.items.length || ConnectCore.primary(V.primary, avail(B)) == 'col') return '';
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
  const ask = wd ? `<a class="cn-product-sheet-ask" href="${esc(waHref(wd, productText(product)))}" target="_blank" rel="noopener">${I.wa}<span>${esc(V.ask)}</span>${I.arrow}</a>` : '<p class="cn-product-contact-note">WhatsApp enquiry is not available yet. Please use the contact details on the main page.</p>';
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
  if (MENU_ERR) return `<div class="cn-collection-intro"><a class="cn-back-link" href="${esc(connectBase())}">← Back to ${esc(B.name)}</a></div><section class="cn-sec">${loadFailed('the collection')}</section>`;
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
  return `<section class="cn-sec"><h2>Photos</h2><div class="cn-gal">${g.map(u => `<img src="${esc(u)}" alt="${esc(B.name)}" loading="lazy" decoding="async" onerror="this.remove()">`).join('')}</div></section>`;
}

// Which of the shop's actions exist. The primary button is chosen from these.
const avail = b => ({ wa: !!waDigits(b), call: !!telHref(b), dir: !!mapsHref(b), col: !!(MENU && MENU.items && MENU.items.length) });

// Opening hours: a live Open / Closing soon / Closed badge that expands to the week.
function hoursSection(b) {
  const st = ConnectCore.status(b.hours, b.tz); if (!st) return '';
  const rows = ConnectCore.week(b.hours, b.tz).map(r => `<li${r.today ? ' class="today"' : ''}><span>${esc(r.label)}</span><span>${esc(r.text)}</span></li>`).join('');
  return `<details class="cn-hours"><summary><span class="cn-hb ${st.state}"><i aria-hidden="true"></i>${esc(st.text)}</span><span class="cn-hs">Hours</span></summary><ul>${rows}</ul></details>`;
}

function view() {
  const b = B;
  const wd = waDigits(b), a = avail(b), main = ConnectCore.primary(V.primary, a);
  // One primary button, chosen by shop type (falls back to what the shop has filled in). The others stay as small shortcuts.
  const quickAll = {
    dir: mapsHref(b) ? quick(mapsHref(b), I.pin, 'Directions', true) : '',
    call: telHref(b) ? quick(telHref(b), I.call, 'Call', false) : '',
    wa: wd ? quick(waHref(wd, V.intro(b.name)), I.wa, 'WhatsApp', true) : ''
  };
  const q = ['dir', 'call', 'wa'].filter(k => k != main).map(k => quickAll[k]).filter(Boolean).join('');
  const n = MENU && MENU.items ? MENU.items.length : 0;
  const lead = {
    wa: () => row(waHref(wd, V.intro(b.name)), I.wa, V.ask, 'Usually quick to reply', true, true),
    call: () => row(telHref(b), I.call, 'Call now', b.phone || '', true, false),
    dir: () => row(mapsHref(b), I.pin, 'Get directions', b.address || '', true, true),
    col: () => row(collectionUrl(), I.arrow, V.browse, n + (n == 1 ? ' ' + V.item : ' ' + V.items), true, false)
  };
  const soc = socialList(b);
  const rev = httpsOnly(b.review_url);
  const loyalty = b.connect_loyalty !== false;      // false = the shop has switched the loyalty button off
  // Loyalty is the lead only when the shop has nothing else to lead with.
  const acts = (main ? lead[main]() : '')
    + (loyalty ? row(appBase(), I.gift, 'Join the loyalty card', 'Collect stamps, earn rewards', !main, false) : '')
    + (rev ? row(rev, I.star, 'Leave a review', 'Takes a minute', false, true) : '');
  if (collectionRoute) return `${productCollectionSection()}<footer class="cn-foot">${esc(b.name)} · <a href="https://www.innondu.com/" target="_blank" rel="noopener">Powered by Innondu</a></footer>`;
  return `${heroSection(b)}
  ${hoursSection(b)}
  ${aboutSection(b)}
  ${acts ? `<nav class="cn-acts" aria-label="More from ${esc(b.name)}">${acts}</nav>` : ''}
  ${q ? `<nav class="cn-quick" aria-label="Contact ${esc(b.name)}">${q}</nav>` : ''}
  ${rev ? `<p class="cn-note">Honest reviews only — we don't offer rewards in exchange for them.</p>` : ''}
  ${collectionLink()}
  ${gallerySection()}
  ${soc.length ? `<section class="cn-sec"><h2>Find us online</h2><div class="cn-soc">${soc.map(x => `<a href="${esc(x.url)}" target="_blank" rel="noopener">${x.icon}<span>${esc(x.label)}</span></a>`).join('')}</div></section>` : ''}
  <section class="cn-sec"><h2>Share</h2>
    <div class="cn-share">
      <button type="button" class="cn-act" onclick="sharePage()"><span class="cn-ai">${I.share}</span><span class="cn-at"><b>Share this page</b><small>WhatsApp, or anywhere</small></span></button>
      <button type="button" class="cn-act" onclick="copyText(shareUrl(),'Link copied')"><span class="cn-ai">${I.copy}</span><span class="cn-at"><b>Copy link</b></span></button>
      <button type="button" class="cn-act" onclick="toggleQr()"><span class="cn-ai">${I.qr}</span><span class="cn-at"><b>Show QR code</b><small>Print it, or write it to a tag</small></span></button>
    </div>
    <div id="cn-qr" class="cn-qr" hidden></div>
  </section>
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
  if (document.head.querySelector('script[type="application/ld+json"]')) return;   // middleware already added one for crawlers
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
  const items = (MENU && MENU.items) || [];
  const desc = collectionRoute
    ? (items.length ? 'Browse ' + items.length + ' product' + (items.length == 1 ? '' : 's') + ' from ' + b.name + '. ' : 'Explore the product collection from ' + b.name + '. ') + 'Open a product to read more or ask on WhatsApp.'
    : (b.about ? String(b.about).replace(/\s+/g, ' ').trim().slice(0, 160) : '') || b.tagline || ('Find ' + b.name + ' — contact, menu and links in one place.');
  meta('property', 'og:description', desc);
  meta('name', 'description', desc);
  meta('name', 'twitter:card', 'summary_large_image');
  const ogImg = (collectionRoute && items.map(x => httpsOnly(x.image_url)).find(Boolean)) || httpsOnly(b.hero_url) || httpsOnly(b.logo_url);
  if (ogImg) meta('property', 'og:image', ogImg);
  meta('name', 'theme-color', HEX6.test(b.color || '') ? b.color : '#8a4b2a');
  const link = document.head.querySelector('link[rel="canonical"]') || (() => { const l = document.createElement('link'); l.rel = 'canonical'; document.head.appendChild(l); return l })();
  link.href = location.origin + location.pathname;
  jsonld(b);
}

async function loadMenu() {
  try {
    const raw = await rpc(sb, 'get_menu', { p_slug: CFG.slug });
    MENU = Array.isArray(raw) ? { categories: [], items: raw } : { categories: (raw && raw.categories) || [], items: (raw && raw.items) || [] };
    MENU_ERR = false;
  } catch (e) { MENU = { categories: [], items: [] }; MENU_ERR = true }
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
  app.innerHTML = view();
})();
