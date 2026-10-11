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
