// Shared bits for the marketing pages. Set WHATSAPP to the number customers should message, digits only with country code (e.g. '919876543210').
window.INNONDU = { WHATSAPP: '' };

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
