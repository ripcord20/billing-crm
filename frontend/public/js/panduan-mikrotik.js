(function () {
  function textOf(id) {
    const el = document.getElementById(id);
    return el ? el.textContent : '';
  }

  function copy(text, btn) {
    const done = () => {
      if (!btn) return;
      const old = btn.textContent;
      btn.textContent = 'Tersalin';
      setTimeout(() => { btn.textContent = old; }, 1400);
    };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(done).catch(() => fallback(text, done));
    } else {
      fallback(text, done);
    }
  }

  function fallback(text, done) {
    const ta = document.createElement('textarea');
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand('copy'); } catch (_) {}
    ta.remove();
    done();
  }

  document.querySelectorAll('.mk-tab').forEach((tab) => {
    tab.addEventListener('click', () => {
      const name = tab.getAttribute('data-tab');
      document.querySelectorAll('.mk-tab').forEach((t) => t.classList.toggle('on', t === tab));
      document.querySelectorAll('[data-pane]').forEach((pane) => {
        pane.style.display = pane.getAttribute('data-pane') === name ? '' : 'none';
      });
    });
  });

  document.querySelectorAll('.mk-copy').forEach((btn) => {
    btn.addEventListener('click', () => {
      const which = btn.getAttribute('data-copy');
      if (which === 'v7') copy(textOf('mkScriptV7'), btn);
      else if (which === 'v6') copy(textOf('mkScriptV6'), btn);
      else if (which === 'verify') copy(textOf('mkVerify'), btn);
    });
  });
})();
