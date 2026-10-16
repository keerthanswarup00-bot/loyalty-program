// Connect page: one public page per shop at /connect/<slug>/ (also /connect/?shop=<slug>).
// Everything shown comes from the public get_business(slug) RPC: name, tagline, colour, logo and the
// shop's own links. The scan token, owner and any other private field are never read or shown.
const slugFromPath = (() => {
  const m = location.pathname.match(/^\/connect\/([a-z0-9][a-z0-9-]*)\/?$/i);
  const s = m && m[1].toLowerCase();
  return s && !['assets', 'index', 'app', 'admin', 'platform'].includes(s) ? s : null;
})();
const slugFromQuery = (() => {
  const q = new URLSearchParams(location.search).get('shop');
  return q && /^[a-z0-9-]+$/.test(q) ? q.toLowerCase() : null;
})();
// Path wins, then the ?shop= fallback. Setting CFG.slug/linkSlug lets resolveShop() (common.js) honour it and
// makes appBase() point at this shop, so links stay on the same address as the shop (custom domains included).
if (slugFromPath || slugFromQuery) { CFG.slug = slugFromPath || slugFromQuery; linkSlug = slugFromPath || slugFromQuery }

const sb = notReady() ? null : mkClient('lk-connect');
let B = null;

const httpsOnly = u => /^https:\/\//i.test(String(u || '')) ? String(u) : '';
const I = {
  arrow: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7 17 17 7M8 7h9v9"/></svg>',
  gift: ico('<rect x="3" y="8" width="18" height="4" rx="1"/><path d="M5 12v8h14v-8M12 8v12M12 8c-2 0-4-1-4-3s3-2.5 4 3c1-5.5 4-5 4-3s-2 3-4 3"/>'),
  menu: ico('<path d="M7 3v7a2 2 0 0 0 2 2v9M11 3v7a2 2 0 0 1-2 2M9 3v6M17 21V3c-2.2 1.2-3.5 3.6-3.5 6.5 0 2 1.2 3.5 3.5 3.5"/>')
};

// A link button. External links open in a new tab; the app buttons stay in this tab.
function btn(href, icon, label, pri) {
  const ext = /^https?:/i.test(href) ? ' target="_blank" rel="noopener"' : '';
  return `<a class="cn-act${pri ? ' pri' : ''}" href="${esc(href)}"${ext}><span class="cn-ai">${icon}</span><span class="cn-at"><b>${esc(label)}</b></span><span class="cn-ar">${I.arrow}</span></a>`;
}

function view() {
  const b = B;
  const rows = [
    btn(appBase(), I.gift, 'Join rewards', true),
    btn(appBase() + '#menu', I.menu, 'Menu'),
    btn(httpsOnly(b.ig), IC.ig, 'Instagram'),
    btn(httpsOnly(b.fb), IC.fb, 'Facebook'),
    btn(httpsOnly(b.wa), IC.wa, 'WhatsApp'),
    btn(httpsOnly(b.web), IC.web, 'Website')
  ].filter(x => !/href=""/.test(x)).join('');
  return `<header class="cn-hero"><div class="logo">${mark(b)}</div><h1>${esc(b.name)}</h1>${b.tagline ? `<p>${esc(b.tagline)}</p>` : ''}</header>
  <nav class="cn-acts" aria-label="Connect with ${esc(b.name)}">${rows}</nav>
  <footer class="cn-foot">${esc(b.name)} · <a href="https://www.innondu.com/" target="_blank" rel="noopener">Rewards by Innondu</a></footer>`;
}

const notSetUp = () => '<div class="card cn-empty"><h2>This shop isn’t set up yet</h2><p class="sub">The link may be wrong, or the shop has not finished setting up its page. Check the address, or ask the shop for their link.</p></div>';

// Social preview + tab title, set at runtime from the public fields only.
function meta(attr, key, content) {
  if (!content) return;
  let el = document.head.querySelector(`meta[${attr}="${key}"]`);
  if (!el) { el = document.createElement('meta'); el.setAttribute(attr, key); document.head.appendChild(el) }
  el.setAttribute('content', content);
}
function share(b) {
  const title = b.name + ' · Connect';
  document.title = title;
  meta('property', 'og:title', title);
  meta('property', 'og:type', 'website');
  meta('property', 'og:url', location.origin + location.pathname);
  const desc = b.tagline || ('Rewards, menu and links for ' + b.name);
  meta('property', 'og:description', desc);
  meta('name', 'description', desc);
  meta('name', 'twitter:card', 'summary');
  if (httpsOnly(b.logo_url)) meta('property', 'og:image', b.logo_url);
}

(async () => {
  const app = $('#app');
  if (notReady()) { app.innerHTML = setupMsg; return }
  if (!(await resolveShop())) { app.innerHTML = noShopMsg; return }
  try { B = await rpc(sb, 'get_business', { p_slug: CFG.slug }) } catch (e) { B = null }
  if (!B || !B.name) { document.title = 'Connect'; app.innerHTML = notSetUp(); return }
  brand(B); share(B);
  app.innerHTML = view();
})();
