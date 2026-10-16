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
    if (d.length >= 10) a.href = 'https://wa.me/' + d + '?text=' + encodeURIComponent((cfg.whatsapp && cfg.whatsapp.message) || '');
    else a.href = a.getAttribute('data-fallback') || '/contact/';
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

  // A page can carry a hidden draft note that only appears while placeholders remain (legal pages).
  var draft = document.querySelector('[data-draft-note]');
  if (draft && document.querySelector('.tbd-ph')) draft.hidden = false;
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
