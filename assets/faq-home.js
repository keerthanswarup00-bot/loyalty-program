(function () {
  var cfg = window.SITE || {};
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function isTodo(v) { return typeof v === 'string' && /TODO_/.test(v); }
  function real(v) { return typeof v === 'string' && !isTodo(v) && v.trim() ? v.trim() : ''; }
  function ph(v, key) { return real(v) ? esc(v) : '<span class="tbd-ph">[' + esc(key) + ']</span>'; }
  function tr(key, fallback) { return (window.I18N && window.I18N.t(key, fallback)) || fallback; }
  function append(container, q, a) {
    var item = document.createElement('details');
    item.className = 'faq-item reveal';
    var sum = document.createElement('summary');
    sum.textContent = q;
    var ans = document.createElement('div');
    ans.className = 'faq-answer';
    ans.innerHTML = a;
    item.appendChild(sum);
    item.appendChild(ans);
    container.appendChild(item);
  }
  function render() {
    var list = document.getElementById('faq-list-home');
    if (!list) return;
    list.innerHTML = '';
    var faqs = [
      [tr('faq.q.cost', 'What does it cost, during and after the pilot?'), ph(cfg.faq && cfg.faq.cost, 'faq.cost')],
      [tr('faq.q.setup', 'How long does setup take and what do I need to do?'), ph(cfg.faq && cfg.faq.setup, 'faq.setup')],
      [tr('faq.q.install', 'Do my customers need to install anything?'), ph(cfg.faq && cfg.faq.install, 'faq.install')],
      [tr('faq.q.ownership', 'Who owns the customer data, and can I export or delete it?'), ph(cfg.faq && cfg.faq.ownership, 'faq.ownership')]
    ];
    faqs.forEach(function (f) { append(list, f[0], f[1]); });
  }
  render();
  document.addEventListener('i18n:change', render);
})();
