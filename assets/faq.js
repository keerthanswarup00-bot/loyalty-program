(function () {
  var cfg = window.SITE || {};
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function isTodo(v) { return typeof v === 'string' && /TODO_/.test(v); }
  function real(v) { return typeof v === 'string' && !isTodo(v) && v.trim() ? v.trim() : ''; }
  function ph(v, key) {
    return real(v) ? esc(v) : '<span class="tbd-ph">[' + esc(key) + ']</span>';
  }
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
  function qa() {
    return [
      [tr('faq.q.identity', 'How does a customer identify themselves?'), 'identity'],
      [tr('faq.q.abuse', 'What stops someone farming stamps by tapping repeatedly?'), 'abuse'],
      [tr('faq.q.ownership', 'Who owns the customer data, and can I export or delete it?'), 'ownership'],
      [tr('faq.q.setup', 'How long does setup take and what do I need to do?'), 'setup'],
      [tr('faq.q.cost', 'What does it cost, during and after the pilot?'), 'cost'],
      [tr('faq.q.exit', 'What if I stop using it or you shut down?'), 'exit'],
      [tr('faq.q.compat', 'Does it work on cheap Android phones and slow data?'), 'compat'],
      [tr('faq.q.install', 'Do my customers need to install anything?'), 'install'],
      [tr('faq.q.connect', 'What is the Connect page, and how is it different from the stamp card?'), 'connect'],
      [tr('faq.q.connectEdit', 'Who edits the Connect page, and how?'), 'connectEdit'],
      [tr('faq.q.connectNfc', 'Does the NFC keychain cost extra, and is it included?'), 'connectNfc']
    ];
  }
  function render() {
    var list = document.getElementById('faq-list');
    if (!list) return;
    list.innerHTML = '';
    var faqs = qa();
    faqs.forEach(function (f) {
      append(list, f[0], ph(cfg.faq && cfg.faq[f[1]], 'faq.' + f[1]));
    });
    var ld = document.getElementById('ld-faq');
    if (ld) {
      var main = [];
      faqs.forEach(function (f) {
        var txt = (cfg.faq && cfg.faq[f[1]]) || '';
        if (!real(txt)) return;
        main.push({
          '@type': 'Question',
          name: f[0],
          acceptedAnswer: { '@type': 'Answer', text: txt }
        });
      });
      if (main.length) ld.textContent = JSON.stringify({ '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: main }, null, 2);
      else ld.textContent = '{}';
    }
  }
  render();
  document.addEventListener('i18n:change', render);
})();
