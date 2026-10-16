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
