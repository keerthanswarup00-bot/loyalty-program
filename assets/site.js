// Shared bits for the marketing pages. Contact details and copy live in assets/site.config.js;
// this file reads window.SITE and fills the parts of the page that point at it.
(function () {
  var cfg = window.SITE || {};
  var wa = String((cfg.whatsapp && cfg.whatsapp.number) || '').replace(/\D/g, '');
  window.INNONDU = {
    WHATSAPP: wa,
    WHATSAPP_MESSAGE: (cfg.whatsapp && cfg.whatsapp.message) || ''
  };

  function read(path) {
    var v = path.split('.').reduce(function (o, k) { return (o || {})[k]; }, cfg);
    return typeof v === 'string' ? v : '';
  }
  var waHref = wa.length >= 10
    ? 'https://wa.me/' + wa + '?text=' + encodeURIComponent(window.INNONDU.WHATSAPP_MESSAGE)
    : '';

  // [data-site-href="whatsapp"] -> click-to-chat link, falling back to the contact page until
  // a number is set. Any other value is a dotted path into window.SITE.
  [].forEach.call(document.querySelectorAll('[data-site-href]'), function (a) {
    var key = a.getAttribute('data-site-href');
    var href = key === 'whatsapp' ? (waHref || a.getAttribute('data-fallback') || '/contact/') : read(key);
    if (href) a.href = href;
  });

  // og:image is injected only when a real path is set. Crawlers do not run JavaScript: once the
  // image exists, copy the tag into each page's <head> so link previews work too.
  if (cfg.defaultOgImage && !/TODO_/.test(cfg.defaultOgImage)) {
    var og = document.querySelector('meta[property="og:image"]');
    if (!og) { og = document.createElement('meta'); og.setAttribute('property', 'og:image'); document.head.appendChild(og); }
    og.content = cfg.defaultOgImage;
  }
})();

(function () {
  // Pricing and proof sections, rendered from window.SITE. A value still marked TODO_ shows as a
  // visible placeholder, never as a claim. The proof grid is never empty or invented: without a
  // consented shop it becomes the "run a free pilot" block instead.
  var cfg = window.SITE || {};
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function isTodo(v) { return typeof v === 'string' && /TODO_/.test(v); }
  function tr(key, fallback) { return (window.I18N && window.I18N.t(key, fallback)) || fallback; }
  function val(v, where) {
    return isTodo(v)
      ? '<span class="tbd"><span class="tbd-tag">' + esc(tr('pricing.placeholderTag', 'Placeholder')) + '</span> set <code>pricing.' + esc(where) + '</code> in assets/site.config.js</span>'
      : esc(v);
  }
  var wa = window.INNONDU && window.INNONDU.WHATSAPP;
  var waHref = wa && wa.length >= 10
    ? 'https://wa.me/' + wa + '?text=' + encodeURIComponent(window.INNONDU.WHATSAPP_MESSAGE || '')
    : '/contact/';

  // Pricing: three plans, same features, different commitment. Re-rendered when the language changes.
  var PLAN_ICONS = {
    monthly: '<svg viewBox="0 0 48 48" aria-hidden="true"><circle cx="24" cy="9" r="5.5"/><circle cx="24" cy="9" r="1.6"/><path d="M24 14.5V44M24 32l-8-7M24 32l8-7"/><circle cx="14" cy="23" r="3"/><circle cx="34" cy="23" r="3"/></svg>',
    '1y': '<svg viewBox="0 0 48 48" aria-hidden="true"><circle cx="24" cy="9" r="5.5"/><circle cx="24" cy="9" r="1.6"/><path d="M24 14.5V44M24 36l-9-8M24 36l9-8M24 27l-9-8M24 27l9-8"/><circle cx="13" cy="26" r="3"/><circle cx="35" cy="26" r="3"/><circle cx="13" cy="17" r="3"/><circle cx="35" cy="17" r="3"/></svg>',
    '2y': '<svg viewBox="0 0 48 48" aria-hidden="true"><circle cx="24" cy="9" r="5.5"/><circle cx="24" cy="9" r="1.6"/><path d="M24 14.5V44M24 38l-11-7M24 38l11-7M24 30l-9-7M24 30l9-7M24 22l-6-5M24 22l6-5"/><circle cx="11" cy="32" r="3"/><circle cx="37" cy="32" r="3"/><circle cx="13" cy="24" r="3"/><circle cx="35" cy="24" r="3"/><circle cx="17" cy="19" r="2.6"/><circle cx="31" cy="19" r="2.6"/></svg>'
  };
  var TICK = '<svg class="pl-tick" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>';
  function rupees(n) { return '\u20b9' + Math.round(n).toLocaleString('en-IN'); }
  function termLabel(m) { return m === 1 ? tr('pricing.billedMonthly', 'billed monthly') : tr('pricing.billedEvery', 'billed every') + ' ' + (m === 12 ? tr('pricing.year', 'year') : (m / 12) + ' ' + tr('pricing.years', 'years')); }
  function renderPricing() {
    var pBody = document.getElementById('pricing-body');
    if (!pBody) return;
    var plans = ((cfg.pricing || {}).plans || []).filter(function (p) { return p && p.perMonth > 0 && p.months > 0; });
    if (!plans.length) { pBody.innerHTML = ''; return; }
    var base = plans[0].perMonth * 1; // first plan is the month-to-month reference
    var features = [
      tr('pricing.f1', 'Digital stamp card, in your customers\u2019 browser'),
      tr('pricing.f2', 'Daily scratch card'),
      tr('pricing.f3', 'One-tap WhatsApp win-backs'),
      tr('pricing.f4', 'Your own Connect page with QR code'),
      tr('pricing.f5', 'Owner dashboard on your phone')
    ];
    pBody.innerHTML = '<div class="plans">' + plans.map(function (p, i) {
      var total = p.perMonth * p.months, full = base * p.months, saved = full - total, pct = Math.round((1 - p.perMonth / base) * 100);
      var isBase = i === 0;
      var perks = features;
      var head = tr('pricing.everything', 'Everything you need:');
      var note = isBase ? tr('pricing.noCommit', 'No commitment') : tr('pricing.save', 'Save') + ' ' + rupees(saved) + ' ' + tr('pricing.vsMonthly', 'compared with paying monthly');
      var cta = p.recommended ? 'btn accent' : 'btn ghost';
      return '<article class="plan' + (p.recommended ? ' rec' : '') + '">' +
        '<div class="plan-top">' + '<div class="plan-ic">' + (PLAN_ICONS[p.id] || '') + '</div>' +
          (p.recommended ? '<span class="plan-badge">' + esc(tr('pricing.recommended', 'Recommended')) + '</span>' : (pct > 0 ? '<span class="plan-save">' + esc(tr('pricing.save', 'Save')) + ' ' + pct + '%</span>' : '')) + '</div>' +
        '<h3>' + esc(p.name) + '</h3><p class="plan-tag">' + esc(p.tagline) + '</p>' +
        '<div class="plan-price"><div><b>' + rupees(p.perMonth) + '</b><span> / ' + esc(tr('pricing.perMonth', 'month')) + '</span></div><small>' + esc(termLabel(p.months)) + (p.months > 1 ? ' \u00b7 ' + rupees(total) : '') + '</small></div>' +
        '<a class="' + cta + ' plan-cta" href="/contact/?plan=' + encodeURIComponent(p.id) + '">' + esc(tr('pricing.cta', 'Get started')) + ' \u2014 ' + esc(p.name) + '</a>' +
        '<p class="plan-note">' + esc(note) + '</p>' +
        '<div class="plan-list"><p>' + esc(head) + '</p><ul>' + perks.map(function (f) { return '<li>' + TICK + '<span>' + esc(f) + '</span></li>'; }).join('') + '</ul></div>' +
        '</article>';
    }).join('') + '</div><p class="plans-foot">' + esc(tr('pricing.foot', 'Prices are per shop, in Indian rupees. Every plan has the same features; a longer term only lowers the monthly price.')) + '</p>';
  }
  renderPricing();
  document.addEventListener('i18n:change', renderPricing);

  // Proof: consented shops only.
  var sBody = document.getElementById('proof-body');
  if (sBody) {
    var shops = (cfg.proof || []).filter(function (s) { return s && s.consent === true; });
    if (shops.length) {
      sBody.innerHTML =
        '<div class="sec-head"><div class="eyebrow">From real shops</div><h2>Shops using Innondu.</h2></div>' +
        '<div class="proof-grid">' + shops.map(function (s) {
          return '<figure class="proof-card">' +
            (s.photo ? '<img src="' + esc(s.photo) + '" alt="" loading="lazy" decoding="async" width="480" height="320">' : '') +
            '<blockquote>&ldquo;' + esc(s.quote) + '&rdquo;</blockquote>' +
            '<figcaption><b>' + esc(s.name) + '</b>' +
            (s.area ? '<span>' + esc(s.area) + '</span>' : '') +
            (s.metric ? '<span class="metric">' + esc(s.metric) + '</span>' : '') +
            '</figcaption></figure>';
        }).join('') + '</div>';
    } else {
      var pilot = cfg.pricing || {};
      sBody.innerHTML =
        '<div class="sec-head"><div class="eyebrow">Free pilot</div><h2>Run a free pilot with your shop.</h2>' +
        '<p class="lead">No shops are listed here yet &mdash; we are running pilots first. Try Innondu with your regulars for a fixed period, see who comes back, then decide.</p></div>' +
        '<dl class="price-list">' +
        '<div class="price-row"><dt>The pilot</dt><dd>' + val(pilot.pilot, 'pilot') + '</dd></div>' +
        '<div class="price-row"><dt>After the pilot</dt><dd>' + val(pilot.afterPilot, 'afterPilot') + '</dd></div>' +
        '</dl>' +
        '<div class="pilot-cta"><a class="btn accent" data-site-wa="whatsapp.number" data-wa-msg="pilot" data-fallback="/contact/" href="/contact/" target="_blank" rel="noopener">WhatsApp us</a>' +
        '<a class="linkbtn" href="/contact/">Or set up my shop</a></div>';
    }
  }
})();

(function () {
  // Founder page, footer text and structured data, all read from window.SITE. Real values are
  // injected; anything still marked TODO_ shows a small inline placeholder instead of shipping a
  // wrong claim. The JSON-LD is built from the same values, so it cannot drift from the page.
  var cfg = window.SITE || {};
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function readPath(path) {
    return path.split('.').reduce(function (o, k) { return (o || {})[k]; }, cfg);
  }
  function isTodo(v) { return typeof v === 'string' && /TODO_/.test(v); }
  function real(v) { return typeof v === 'string' && !isTodo(v) && v.trim() ? v.trim() : ''; }
  function phMark(path) {
    var key = path.split('.').pop();
    return '<span class="tbd-ph" title="Set ' + esc(path) + ' in assets/site.config.js">[' + esc(key) + ']</span>';
  }
  function textOf(path) {
    var v = readPath(path);
    return real(v) ? esc(v) : phMark(path);
  }
  function digits(v) { return String(v || '').replace(/\D/g, ''); }
  function abs(p) {
    if (!p) return '';
    if (/^https?:/i.test(p)) return p;
    return (cfg.siteUrl || '').replace(/\/$/, '') + (p.charAt(0) === '/' ? p : '/' + p);
  }

  // Inline text from config (footer, founder's paragraphs).
  [].forEach.call(document.querySelectorAll('[data-site-text]'), function (el) {
    el.innerHTML = textOf(el.getAttribute('data-site-text'));
  });

  // tel: and mailto: links. Until the value is set, the link falls back to the contact page.
  [].forEach.call(document.querySelectorAll('[data-site-tel]'), function (a) {
    var path = a.getAttribute('data-site-tel'), v = readPath(path), d = digits(v);
    if (real(v)) { a.textContent = v; a.href = d.length >= 4 ? 'tel:' + d : (a.getAttribute('data-fallback') || '/contact/'); }
    else { a.innerHTML = phMark(path); a.href = a.getAttribute('data-fallback') || '/contact/'; }
  });
  [].forEach.call(document.querySelectorAll('[data-site-mail]'), function (a) {
    var path = a.getAttribute('data-site-mail'), v = readPath(path);
    if (real(v)) { a.textContent = v; a.href = 'mailto:' + v; }
    else { a.innerHTML = phMark(path); a.href = a.getAttribute('data-fallback') || '/contact/'; }
  });

  // A WhatsApp link for a chosen number (defaults to the site-wide one).
  [].forEach.call(document.querySelectorAll('[data-site-wa]'), function (a) {
    var path = a.getAttribute('data-site-wa') || 'whatsapp.number';
    var d = digits(readPath(path));
    if (d.length >= 10) {
      var msgs = (cfg.whatsapp && cfg.whatsapp.messages) || {};
      var key = a.getAttribute('data-wa-msg') || 'contact';
      var msgTxt = (msgs[key] && real(msgs[key])) ? msgs[key] : ((cfg.whatsapp && cfg.whatsapp.message) || '');
      a.href = 'https://wa.me/' + d + '?text=' + encodeURIComponent(msgTxt);
    } else a.href = a.getAttribute('data-fallback') || '/contact/';
  });

  // Founder photo: the real image, or a labelled placeholder box.
  var photoBox = document.getElementById('founder-photo-box');
  if (photoBox) {
    var photo = readPath('founder.photo'), nm = real(readPath('founder.name')) || 'Founder';
    photoBox.innerHTML = real(photo)
      ? '<img src="' + esc(photo) + '" alt="' + esc(nm) + '" loading="lazy" decoding="async">'
      : '<span class="founder-photo-ph">' + phMark('founder.photo') + '</span>';
  }

  var f = cfg.founder || {};

  // Homepage strip: "Who is behind this".
  var strip = document.getElementById('founder-strip');
  if (strip) {
    var line = real(f.name) ? esc(f.name) : phMark('founder.name');
    line += ' &middot; ' + (real(f.role) ? esc(f.role) : phMark('founder.role'));
    line += ' &middot; ' + (real(f.city) ? esc(f.city) : phMark('founder.city'));
    strip.innerHTML =
      '<div class="founder-strip-in">' +
        (real(f.photo) ? '<img src="' + esc(f.photo) + '" alt="' + esc(real(f.name) || 'Founder') + '" loading="lazy" decoding="async" width="168" height="168">' : '') +
        '<div><div class="eyebrow">Who is behind this</div>' +
        '<p class="founder-line">' + line + '</p>' +
        '<p class="lead">' + textOf('founder.why') + '</p>' +
        '<a class="linkbtn" href="/about/">More about ' + esc(real(f.name) || 'Innondu') + '</a></div>' +
      '</div>';
  }

  // Person + Organization JSON-LD, from the config (only real values, never a placeholder).
  var ld = document.getElementById('ld-founder');
  if (ld) {
    var site = (cfg.siteUrl || '').replace(/\/$/, '');
    var person = { '@type': 'Person' };
    if (real(f.name)) person.name = real(f.name);
    if (real(f.role)) person.jobTitle = real(f.role);
    if (real(f.city)) person.address = { '@type': 'PostalAddress', addressLocality: real(f.city) };
    if (real(f.photo)) person.image = abs(real(f.photo));
    if (real(f.email)) person.email = real(f.email);
    if (real(f.phone)) person.telephone = real(f.phone);
    if (real(f.portfolio)) person.url = real(f.portfolio);
    var org = { '@type': 'Organization', '@id': site + '/#org', name: cfg.siteName || 'Innondu', url: site + '/' };
    var graph = [];
    if (person.name) { person['@id'] = site + '/#founder'; org.founder = { '@id': site + '/#founder' }; graph.push(person); }
    graph.push(org);
    ld.textContent = JSON.stringify({ '@context': 'https://schema.org', '@graph': graph }, null, 2);
  }

  // Legal pages carry a visible draft note; it should always show (placeholder values still
  // render inline as [brackets] via the data-site-text fillers above).
  var draft = document.querySelector('[data-draft-note]');
  if (draft) draft.hidden = false;

  // Floating WhatsApp button on mobile only; small, dismissible, and not shown over forms/inputs.
  try {
    if (!window.matchMedia('(max-width: 640px)').matches) return;
    if (document.querySelector('form')) return;
    if (document.querySelector('input, textarea, select, [contenteditable="true"]')) return;
    var fw = document.getElementById('wa-float');
    if (fw) return;
    var d = digits(readPath('whatsapp.number'));
    if (d.length < 10) return;
    var msgs = (cfg.whatsapp && cfg.whatsapp.messages) || {};
    var msgTxt = (msgs.float && real(msgs.float)) ? msgs.float : ((cfg.whatsapp && cfg.whatsapp.message) || '');
    var a = document.createElement('a');
    a.id = 'wa-float';
    a.className = 'wa-float';
    a.href = 'https://wa.me/' + d + '?text=' + encodeURIComponent(msgTxt);
    a.target = '_blank';
    a.rel = 'noopener';
    a.setAttribute('aria-label', 'Message us on WhatsApp');
    a.innerHTML = '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347zM12.004 2C6.486 2 2 6.486 2 12c0 2.117.557 4.093 1.528 5.77L2 22l4.34-1.507A9.97 9.97 0 0 0 12.004 22C17.522 22 22 17.514 22 12S17.522 2 12.004 2z" fill="currentColor"/></svg>';
    var close = document.createElement('button');
    close.className = 'wa-float-close';
    close.setAttribute('aria-label', 'Close WhatsApp');
    close.textContent = '×';
    close.onclick = function (e) { e.preventDefault(); a.remove(); };
    a.appendChild(close);
    document.body.appendChild(a);
  } catch (e) {}
})();

(function () {
  // Fade sections in as they scroll into view. Without IntersectionObserver or with reduced motion, everything just shows.
  var els = [].slice.call(document.querySelectorAll('.reveal'));
  var calm = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (!('IntersectionObserver' in window) || calm) { els.forEach(function (e) { e.classList.add('in'); }); return; }
  var io = new IntersectionObserver(function (list) {
    list.forEach(function (x) { if (x.isIntersecting) { x.target.classList.add('in'); io.unobserve(x.target); } });
  }, { threshold: .12 });
  els.forEach(function (e) { io.observe(e); });
})();

(function () {
  // Shared header menu. The toggle only exists under 560px; on wider screens the links show inline.
  var toggle = document.querySelector('.nav-toggle'), menu = document.getElementById('site-menu');
  if (!toggle || !menu) return;
  function setOpen(open) {
    menu.classList.toggle('open', open);
    toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    toggle.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
  }
  toggle.addEventListener('click', function () { setOpen(!menu.classList.contains('open')); });
  menu.addEventListener('click', function (e) { if (e.target.closest('a')) setOpen(false); });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && menu.classList.contains('open')) { setOpen(false); toggle.focus(); }
  });
  document.addEventListener('click', function (e) {
    if (menu.classList.contains('open') && !e.target.closest('header')) setOpen(false);
  });
  window.addEventListener('resize', function () { if (innerWidth > 560) setOpen(false); });
})();
