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
  function renderPricing() {
    var pBody = document.getElementById('pricing-body');
    if (!pBody) return;
    var pr = cfg.pricing || {};
    var plans = (pr.plans || []).filter(function (p) { return p && p.perMonth > 0 && p.months > 0; });
    if (!plans.length) { pBody.innerHTML = ''; return; }
    var base = plans[0].perMonth;
    var features = [
      tr('pricing.f1', 'Digital stamp card, in your customers\u2019 browser'),
      tr('pricing.f2', 'Daily scratch card'),
      tr('pricing.f3', 'One-tap WhatsApp win-backs'),
      tr('pricing.f4', 'Your own Connect page with QR code'),
      tr('pricing.f5', 'Owner dashboard on your phone'),
      tr('pricing.f6', 'NFC stamp and QR poster for your counter')
    ];
    var cards = plans.map(function (p, i) {
      var total = p.perMonth * p.months, saved = base * p.months - total, pct = Math.round((1 - p.perMonth / base) * 100);
      var bill = i === 0 ? tr('pricing.payMonthly', 'Paid every month')
        : rupees(total) + ' ' + (p.months === 12 ? tr('pricing.paidYear', 'paid upfront for the year') : tr('pricing.paidTerm', 'paid upfront for') + ' ' + (p.months / 12) + ' ' + tr('pricing.years', 'years'));
      var save = i === 0 ? '' : tr('pricing.youSave', 'You save') + ' ' + rupees(saved);
      return '<article class="plan' + (p.recommended ? ' rec' : '') + '">' +
        '<div class="plan-top"><span class="plan-name">' + esc(p.name) + '</span>' +
          (p.recommended ? '<span class="plan-badge">' + esc(tr('pricing.recommended', 'Recommended')) + '</span>' : (pct > 0 ? '<span class="plan-save">' + esc(tr('pricing.save', 'Save')) + ' ' + pct + '%</span>' : '')) + '</div>' +
        '<p class="plan-tag">' + esc(p.tagline) + '</p>' +
        '<div class="plan-price"><b>' + rupees(p.perMonth) + '</b><span> / ' + esc(tr('pricing.perMonth', 'month')) + '</span></div>' +
        '<p class="plan-bill">' + esc(bill) + '</p>' +
        '<p class="plan-saving">' + (save ? esc(save) : '&nbsp;') + '</p>' +
        '<a class="btn ' + (p.recommended ? 'accent' : 'ghost') + ' plan-cta" href="/contact/?plan=' + encodeURIComponent(p.id) + '">' + esc(tr('pricing.cta', 'Choose')) + ' ' + esc(p.name) + '</a>' +
        '</article>';
    }).join('');
    var len = pr.pilotLength && !isTodo(pr.pilotLength) ? ' ' + esc(tr('pricing.pilotFor', 'for')) + ' ' + esc(pr.pilotLength) : '';
    pBody.innerHTML =
      '<div class="plans">' + cards + '</div>' +
      '<div class="inc"><b>' + esc(tr('pricing.inEvery', 'Included in every plan')) + '</b><ul>' +
        features.map(function (f) { return '<li>' + TICK + '<span>' + esc(f) + '</span></li>'; }).join('') + '</ul></div>' +
      '<div class="pilot"><div><div class="eyebrow">' + esc(tr('pricing.pilotEyebrow', 'Not sure yet?')) + '</div>' +
        '<h3>' + esc(tr('pricing.pilotH', 'Start with a free pilot')) + len + '</h3>' +
        '<p>' + esc(tr('pricing.pilotP', 'Run Innondu with your own regulars, see who comes back, then decide. Nothing to pay to start.')) + '</p></div>' +
        '<a class="btn" href="/contact/?plan=pilot">' + esc(tr('pricing.pilotCta', 'Start a free pilot')) + '</a></div>' +
      '<p class="plans-foot">' + esc(tr('pricing.foot', 'Prices are per shop, in rupees. No GST is charged. Longer plans are paid upfront; leave early and the unused months are refunded.')) + ' <a href="/terms/#refunds">' + esc(tr('pricing.refundLink', 'Refund policy')) + '</a></p>';
  }
  renderPricing();
  document.addEventListener('i18n:change', renderPricing);

  // Terms page: refund numbers are filled from the same plans, so they cannot disagree with pricing.
  (function () {
    var plans = ((cfg.pricing || {}).plans || []);
    if (!plans.length) return;
    var m = plans[0].perMonth;
    [].forEach.call(document.querySelectorAll('[data-plan-price]'), function (el) {
      var p = plans.filter(function (x) { return x.id === el.getAttribute('data-plan-price'); })[0];
      if (p) el.textContent = rupees(p.perMonth);
    });
    var ex = document.getElementById('refund-example'), y = plans.filter(function (x) { return x.months === 12; })[0];
    if (ex && y) {
      var total = y.perMonth * y.months, used = 3 * m;
      ex.textContent = 'Example: you pay ' + rupees(total) + ' for the 1 Year plan and leave after 3 months. We keep 3 \u00d7 ' + rupees(m) + ' = ' + rupees(used) + ' and refund ' + rupees(total - used) + '.';
    }
  })();

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
      var sec = document.getElementById('proof'); if (sec) sec.hidden = true;
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
  function phMark() { return ''; }  // unset values never render on the page; the console lists them
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
  // Optional wrapper: removed entirely while its value is still a placeholder, so no [brackets] ship.
  [].forEach.call(document.querySelectorAll('[data-site-opt]'), function (el) {
    if (!real(readPath(el.getAttribute('data-site-opt')))) el.remove();
  });
  [].forEach.call(document.querySelectorAll('[data-site-text]'), function (el) {
    el.innerHTML = textOf(el.getAttribute('data-site-text'));
  });

  // tel: and mailto: links. Until the value is set, the link falls back to the contact page.
  [].forEach.call(document.querySelectorAll('[data-site-tel]'), function (a) {
    var path = a.getAttribute('data-site-tel'), v = readPath(path), d = digits(v);
    if (real(v)) { a.textContent = v; a.href = d.length >= 4 ? 'tel:' + d : (a.getAttribute('data-fallback') || '/contact/'); }
    else { if (!a.textContent.replace(/\u00a0/g, '').trim()) a.textContent = 'our contact page'; a.href = a.getAttribute('data-fallback') || '/contact/'; }
  });
  [].forEach.call(document.querySelectorAll('[data-site-mail]'), function (a) {
    var path = a.getAttribute('data-site-mail'), v = readPath(path);
    if (real(v)) { a.textContent = v; a.href = 'mailto:' + v; }
    else { if (!a.textContent.replace(/\u00a0/g, '').trim()) a.textContent = 'our contact page'; a.href = a.getAttribute('data-fallback') || '/contact/'; }
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
    if (real(photo)) photoBox.innerHTML = '<img src="' + esc(photo) + '" alt="' + esc(nm) + '" loading="lazy" decoding="async">';
    else photoBox.remove();
  }

  var f = cfg.founder || {};
  var sub = document.getElementById('founder-sub');
  if (sub) {
    var bits = [real(f.role), real(f.city)].filter(Boolean).map(esc);
    if (bits.length) sub.innerHTML = ' &middot; ' + bits.join(' &middot; '); else sub.remove();
  }

  // Homepage strip: "Who is behind this".
  var strip = document.getElementById('founder-strip');
  if (strip) {
    var parts = [real(f.name) || 'Innondu', real(f.role), real(f.city)].filter(Boolean).map(esc);
    // Until a founder story is written, use the honest one-liner from the About page.
    var why = real(f.whyShort) ? esc(f.whyShort) : real(f.why) ? esc(f.why) : 'Tell me about your shop and I will set up a free pilot. You see who comes back before you decide anything.';
    strip.innerHTML =
      '<div class="founder-strip-in">' +
        (real(f.photo) ? '<img src="' + esc(f.photo) + '" alt="' + esc(real(f.name) || 'Founder') + '" loading="lazy" decoding="async" width="168" height="168">' : '') +
        '<div><div class="eyebrow">Who is behind this</div>' +
        '<p class="founder-line">' + parts.join(' &middot; ') + '</p>' +
        '<p class="lead">' + why + '</p>' +
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
