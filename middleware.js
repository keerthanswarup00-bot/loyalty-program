// Vercel Edge Middleware: per-shop link previews for the Connect page (/connect/<slug>/).
// Crawlers (WhatsApp, Facebook, Slack, Telegram, Google, …) get the page HTML with the shop's own
// title, description, og:image and LocalBusiness JSON-LD injected. Normal visitors get nothing from
// here and continue to the static page, so the page stays static-fast.
// If Edge Middleware is not enabled on the project, everything still works: connect.js sets the same
// tags at runtime for browsers (just not for crawlers, which do not run JavaScript).
export const config = { matcher: ['/connect/:slug*'] };

const BOT = /bot|crawl|spider|slurp|whatsapp|facebookexternalhit|facebot|telegram|slack|discord|twitter|linkedin|embedly|pinterest|skype|line|viber|vkshare|applebot|bingbot|googlebot|yandex|duckduckbot|baiduspider|sogou|exabot|ia_archiver|semrush|ahrefs|screaming frog|sitechecker|w3c_validator|google-inspectiontool|lighthouse/i;
const SUPA = 'https://qgechlsujyzgivwnvdwf.supabase.co';
const KEY = 'sb_publishable_oEWnni9aBtWuwqF_aS6duQ_gF0B55r3';

const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const SCHEMA = { cafe: 'Restaurant', restaurant: 'Restaurant', bakery: 'Bakery', salon: 'HairSalon', boutique: 'ClothingStore', repair: 'LocalBusiness', generic: 'LocalBusiness' };

async function rpc(name, args) {
  try {
    const r = await fetch(SUPA + '/rest/v1/rpc/' + name, {
      method: 'POST', headers: { apikey: KEY, 'Content-Type': 'application/json' }, body: JSON.stringify(args)
    });
    return r.ok ? await r.json() : null;
  } catch (e) { return null }
}
async function shop(slug) {
  const b = await rpc('get_business', { p_slug: slug });
  return b && b.name ? b : null;
}
async function products(slug) {
  const raw = await rpc('get_menu', { p_slug: slug });
  const items = Array.isArray(raw) ? raw : (raw && raw.items) || [];
  return items.filter(x => x && x.title);
}

const https = u => /^https?:\/\//i.test(u || '') ? u : '';
const clean = (s, n) => String(s || '').replace(/\s+/g, ' ').trim().slice(0, n);

// Head tags for the main Connect page (collection = null) or the product collection page.
function inject(b, url, collection) {
  const name = b.name;
  let title, desc, img;
  if (collection) {
    const n = collection.length;
    title = name + ' · Collection';
    desc = (n ? 'Browse ' + n + ' product' + (n == 1 ? '' : 's') + ' from ' + name + '. ' : 'Explore the product collection from ' + name + '. ')
      + 'Open a product to read more or ask on WhatsApp.';
    const first = collection.map(x => https(x.image_url)).find(Boolean);
    img = first || https(b.hero_url) || https(b.logo_url);
  } else {
    title = name + ' · Connect';
    desc = clean(b.about, 160) || b.tagline || ('Find ' + name + ' — contact, offers and links in one place.');
    img = https(b.hero_url) || https(b.logo_url);
  }
  const ld = collection ? {
    '@context': 'https://schema.org', '@type': 'CollectionPage', name: title, url, description: desc, image: img || undefined,
    isPartOf: { '@type': 'WebSite', name, url: url.replace(/collection\/$/, '') },
    mainEntity: collection.length ? {
      '@type': 'ItemList', numberOfItems: collection.length,
      itemListElement: collection.slice(0, 20).map((x, i) => ({
        '@type': 'ListItem', position: i + 1,
        item: { '@type': 'Product', name: String(x.title), image: https(x.image_url) || undefined, description: clean(x.description, 200) || undefined }
      }))
    } : undefined
  } : {
    '@context': 'https://schema.org', '@type': SCHEMA[b.vertical] || 'LocalBusiness',
    name, url, description: desc, image: img || undefined,
    telephone: b.phone ? String(b.phone).replace(/\s+/g, '') : undefined,
    sameAs: [b.ig, b.fb, b.yt].filter(u => /^https?:\/\//i.test(u || ''))
  };
  const prune = o => { Object.keys(o).forEach(k => o[k] === undefined && delete o[k]); return o };
  prune(ld);
  if (ld.mainEntity) ld.mainEntity.itemListElement.forEach(e => prune(e.item));
  return [
    '<title>' + esc(title) + '</title>',
    '<meta name="description" content="' + esc(desc) + '">',
    '<meta property="og:type" content="website">',
    '<meta property="og:title" content="' + esc(title) + '">',
    '<meta property="og:description" content="' + esc(desc) + '">',
    '<meta property="og:url" content="' + esc(url) + '">',
    img ? '<meta property="og:image" content="' + esc(img) + '">' : '',
    '<meta name="twitter:card" content="' + (img ? 'summary_large_image' : 'summary') + '">',
    '<link rel="canonical" href="' + esc(url) + '">',
    '<script type="application/ld+json">' + JSON.stringify(ld).replace(/</g, '\\u003c') + '</script>'
  ].filter(Boolean).join('\n');
}

export default async function middleware(req) {
  const ua = req.headers.get('user-agent') || '';
  if (!BOT.test(ua)) return;                                   // normal visitor: continue to the static page
  const url = new URL(req.url);
  const m = url.pathname.match(/^\/connect\/([a-z0-9][a-z0-9-]*)(\/collection)?\/?$/i);
  if (!m) return;                                              // /connect (marketing), /connect/<slug>/admin, etc.
  const slug = m[1].toLowerCase(), isCollection = !!m[2];
  const [b, items] = await Promise.all([shop(slug), isCollection ? products(slug) : null]);
  if (!b) return;
  const res = await fetch(new URL('/connect-shop/index.html', url.origin).toString());
  if (!res.ok) return;
  let html = await res.text();
  const pageUrl = url.origin + '/connect/' + slug + '/' + (isCollection ? 'collection/' : '');
  html = html.replace(/<title>[\s\S]*?<\/title>/i, '').replace('</head>', () => inject(b, pageUrl, items) + '\n</head>');
  return new Response(html, {
    headers: {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'public, s-maxage=3600, stale-while-revalidate=86400'
    }
  });
}
