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
  function val(v, where) {
    return isTodo(v)
      ? '<span class="tbd"><span class="tbd-tag">Placeholder</span> set <code>pricing.' + esc(where) + '</code> in assets/site.config.js</span>'
      : esc(v);
  }
  var wa = window.INNONDU && window.INNONDU.WHATSAPP;
  var waHref = wa && wa.length >= 10
    ? 'https://wa.me/' + wa + '?text=' + encodeURIComponent(window.INNONDU.WHATSAPP_MESSAGE || '')
    : '/contact/';

  // Pricing: one row per question an owner asks.
  var pBody = document.getElementById('pricing-body');
  if (pBody) {
    var price = cfg.pricing || {};
    var rows = [
      ['The app itself', 'software', price.software],
      ['Subscription', 'subscription', price.subscription],
      ['Each reward redeemed', 'perRedemption', price.perRedemption],
      ['NFC stamp and poster', 'hardware', price.hardware],
      ['The free pilot', 'pilot', price.pilot],
      ['After the pilot', 'afterPilot', price.afterPilot],
      ['Included', 'included', price.included],
      ['Not included', 'notIncluded', price.notIncluded]
    ].filter(function (r) { return r[2] !== undefined && r[2] !== null && r[2] !== ''; });
    var draft = rows.some(function (r) { return isTodo(r[2]); });
    pBody.innerHTML =
      (draft ? '<p class="tbd-note" role="status"><b>Draft.</b> Rows marked Placeholder are still to be decided in assets/site.config.js. Do not treat this as final.</p>' : '') +
      '<dl class="price-list">' + rows.map(function (r) {
        return '<div class="price-row"><dt>' + esc(r[0]) + '</dt><dd>' + val(r[2], r[1]) + '</dd></div>';
      }).join('') + '</dl>';
  }

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
        '<div class="pilot-cta"><a class="btn accent" href="' + esc(waHref) + '" target="_blank" rel="noopener">WhatsApp us</a>' +
        '<a class="linkbtn" href="/contact/">Or set up my shop</a></div>';
    }
  }
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
