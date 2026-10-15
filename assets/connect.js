// Connect page: a public "link in bio" page for one shop at /app/<shop>/connect.
// It only shows when the owner has switched it on (get_connect returns null otherwise).
const sb = notReady() ? null : mkClient('lk-connect');
let B = null, MN = null;

const httpsOnly = u => /^https:\/\//i.test(String(u || '')) ? u : '';
const priceTxt = p => { p = String(p || '').trim(); return /^\d+([.,]\d+)?$/.test(p) ? '₹' + p : p };
const dishImg = u => typeof u == 'string' && (u.startsWith('https://') || u.startsWith('data:image/')) ? u : '';
const I = {
  arrow: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7 17 17 7M8 7h9v9"/></svg>',
  gift: ico('<rect x="3" y="8" width="18" height="13" rx="2"/><path d="M12 8v13M3 12h18M12 8c-1.5-4-6-4-6-1 0 2 3 1 6 1zm0 0c1.5-4 6-4 6-1 0 2-3 1-6 1z"/>'),
  menu: ico('<path d="M6 3v8a2 2 0 0 0 2 2v8M10 3v8M8 3v8M16 3c-2 2-2 6 0 8v10"/>'),
  star: ico('<path d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z"/>'),
  pin: ico('<path d="M12 21s7-6.2 7-11a7 7 0 0 0-14 0c0 4.8 7 11 7 11z"/><circle cx="12" cy="10" r="2.5"/>'),
  tag: ico('<path d="M3 12V4h8l10 10-8 8z"/><circle cx="7.5" cy="8.5" r="1.2"/>')
};
const STATUS = { open: 'Open', closed: 'Closed', temporarily_closed: 'Temporarily closed' };

function action(href, icon, title, sub, primary) {
  const ext = /^https?:/.test(href) ? ' target="_blank" rel="noopener"' : '';
  return `<a class="cn-act${primary ? ' pri' : ''}" href="${esc(href)}"${ext}><span class="cn-ai">${icon}</span><span class="cn-at"><b>${esc(title)}</b><small>${esc(sub)}</small></span><span class="cn-ar">${I.arrow}</span></a>`;
}
function menuV() {
  if (!MN || !MN.items.length) return '';
  const cats = MN.categories.filter(c => MN.items.some(i => i.category_id == c.id));
  const loose = MN.items.filter(i => !cats.some(c => c.id == i.category_id));
  const row = x => { const im = dishImg(x.image_url); return `<li><span class="cn-ph">${im ? `<img src="${esc(im)}" alt="" loading="lazy" decoding="async" onerror="this.remove()">` : ''}</span><span class="cn-mt"><b>${esc(x.title)}</b>${x.description ? `<small>${esc(x.description)}</small>` : ''}</span>${x.price ? `<span class="cn-pr">${esc(priceTxt(x.price))}</span>` : ''}</li>` };
  const sec = (n, L) => `<h3 class="cn-mh">${esc(n)}</h3><ul class="cn-ml">${L.map(row).join('')}</ul>`;
  return `<section class="card cn-sec" id="menu"><p class="eyebrow">Menu</p><h2>What we make</h2>${cats.map(c => sec(c.name, MN.items.filter(i => i.category_id == c.id))).join('')}${loose.length ? sec(cats.length ? 'Others' : 'Everything', loose) : ''}</section>`;
}
function view() {
  const b = B, hasMenu = MN && MN.items.length, wa = httpsOnly(b.wa), rv = httpsOnly(b.review_url);
  const soc = [['Instagram', httpsOnly(b.ig)], ['Facebook', httpsOnly(b.fb)], ['Website', httpsOnly(b.web)]].filter(x => x[1]);
  const rows = [
    action(appBase(), I.gift, 'Join our rewards', 'Collect stamps and get free treats', true),
    hasMenu ? action('#menu', I.menu, 'View the menu', 'Find your next favourite') : '',
    wa ? action(wa, ico('<path d="M20 11.8a8 8 0 0 1-11.9 7L4 20l1.2-4A8 8 0 1 1 20 11.8z"/>'), 'Message us on WhatsApp', 'Orders, bulk orders and questions') : '',
    rv ? action(rv, I.star, 'Review us on Google', 'Your words mean the world') : ''
  ].join('');
  const locs = b.locations.length ? `<section class="cn-sec"><p class="eyebrow">Find us</p><h2>Visit us</h2><div class="cn-locs">${b.locations.map(l => `<article class="card cn-loc"><div class="cn-lt"><span class="cn-st ${esc(l.status)}">${esc(STATUS[l.status] || l.status)}</span>${I.pin}</div><h3>${esc(l.name)}</h3>${l.address ? `<p>${esc(l.address)}</p>` : ''}${l.hours_note ? `<p class="cn-hr">${esc(l.hours_note)}</p>` : ''}${httpsOnly(l.maps_url) ? `<a class="cn-dir" href="${esc(l.maps_url)}" target="_blank" rel="noopener">Get directions ${I.arrow}</a>` : ''}</article>`).join('')}</div></section>` : '';
  const promos = b.promos.length ? `<section class="cn-sec"><p class="eyebrow">On now</p><h2>Good things are on</h2><div class="cn-locs">${b.promos.map(p => `<article class="card cn-promo"><span class="cn-pk">${p.kind == 'festive' ? 'Festive special' : 'Just for you'}</span><h3>${esc(p.title)}</h3>${p.body ? `<p>${esc(p.body)}</p>` : ''}${p.ends_on ? `<small>Until ${esc(fbd(p.ends_on))}</small>` : ''}</article>`).join('')}</div></section>` : '';
  return `<header class="cn-hero"><div class="logo">${mark(b)}</div><h1>${esc(b.title || b.name)}</h1>${(b.sub || b.tagline) ? `<p>${esc(b.sub || b.tagline)}</p>` : ''}</header>
  <nav class="cn-acts" aria-label="Quick links">${rows}</nav>
  ${soc.length ? `<div class="cn-soc">${soc.map(x => `<a href="${esc(x[1])}" target="_blank" rel="noopener">${x[0]}</a>`).join('')}</div>` : ''}
  ${locs}${promos}${menuV()}
  <footer class="cn-foot">${esc(b.name)} · <a href="https://www.innondu.com/" target="_blank" rel="noopener">Rewards by Innondu</a></footer>`;
}
const offV = () => '<div class="card" style="margin-top:40px"><h2>This page isn\'t available</h2><p class="sub">The link may be wrong, or the shop has not switched this page on yet.</p><a class="btn" href="' + esc(appBase()) + '" style="margin-top:14px">Open the rewards app</a></div>';

(async () => {
  const app = $('#app');
  if (notReady()) { app.innerHTML = setupMsg; return }
  if (!(await resolveShop())) { app.innerHTML = noShopMsg; return }
  try { B = await rpc(sb, 'get_connect', { p_slug: CFG.slug }) } catch (e) { B = null }
  if (!B) { app.innerHTML = offV(); return }
  B.locations = Array.isArray(B.locations) ? B.locations : []; B.promos = Array.isArray(B.promos) ? B.promos : [];
  brand(B); document.title = B.name;
  app.innerHTML = view();
  try {   // the menu loads after the page is already on screen
    const raw = await rpc(sb, 'get_menu', { p_slug: CFG.slug });
    MN = Array.isArray(raw) ? { categories: [], items: raw } : { categories: (raw && raw.categories) || [], items: (raw && raw.items) || [] };
    if (MN.items.length) app.innerHTML = view();
  } catch (e) { }
})();
