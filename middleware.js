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

async function shop(slug) {
  try {
    const r = await fetch(SUPA + '/rest/v1/rpc/get_business', {
      method: 'POST', headers: { apikey: KEY, 'Content-Type': 'application/json' }, body: JSON.stringify({ p_slug: slug })
    });
    if (!r.ok) return null;
    const b = await r.json();
    return b && b.name ? b : null;
  } catch (e) { return null }
}

function inject(b, url) {
  const name = b.name, desc = b.tagline || ('Find ' + name + ' — contact, offers and links in one place.');
  const img = /^https?:\/\//i.test(b.logo_url || '') ? b.logo_url : '';
  const ld = {
    '@context': 'https://schema.org', '@type': SCHEMA[b.vertical] || 'LocalBusiness',
    name, url, description: desc, image: img || undefined,
    telephone: b.phone ? String(b.phone).replace(/\s+/g, '') : undefined,
    sameAs: [b.ig, b.fb, b.yt].filter(u => /^https?:\/\//i.test(u || ''))
  };
  Object.keys(ld).forEach(k => ld[k] === undefined && delete ld[k]);
  return [
    '<title>' + esc(name + ' · Connect') + '</title>',
    '<meta name="description" content="' + esc(desc) + '">',
    '<meta property="og:type" content="website">',
    '<meta property="og:title" content="' + esc(name + ' · Connect') + '">',
    '<meta property="og:description" content="' + esc(desc) + '">',
    '<meta property="og:url" content="' + esc(url) + '">',
    img ? '<meta property="og:image" content="' + esc(img) + '">' : '',
    '<meta name="twitter:card" content="' + (img ? 'summary_large_image' : 'summary') + '">',
    '<link rel="canonical" href="' + esc(url) + '">',
    '<script type="application/ld+json">' + JSON.stringify(ld) + '</script>'
  ].filter(Boolean).join('\n');
}

export default async function middleware(req) {
  const ua = req.headers.get('user-agent') || '';
  if (!BOT.test(ua)) return;                                   // normal visitor: continue to the static page
  const url = new URL(req.url);
  const m = url.pathname.match(/^\/connect\/([a-z0-9][a-z0-9-]*)\/?$/i);
  if (!m) return;                                              // /connect (marketing), /connect/<slug>/admin, etc.
  const slug = m[1].toLowerCase();
  const b = await shop(slug);
  if (!b) return;
  const res = await fetch(new URL('/connect-shop/index.html', url.origin).toString());
  if (!res.ok) return;
  let html = await res.text();
  const pageUrl = url.origin + '/connect/' + slug + '/';
  html = html.replace(/<title>[\s\S]*?<\/title>/i, '').replace('</head>', inject(b, pageUrl) + '\n</head>');
  return new Response(html, {
    headers: {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'public, s-maxage=3600, stale-while-revalidate=86400'
    }
  });
}
