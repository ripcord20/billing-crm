(function (root) {
  function notify(msg, type) {
    if (typeof App !== 'undefined' && typeof App.showToast === 'function') {
      App.showToast(msg, type === 'err' ? 'error' : (type === 'ok' ? 'success' : (type || 'info')));
      return;
    }
    if (typeof toast === 'function') toast(msg, type);
  }

  async function fetchRemote(id) {
    if (typeof App !== 'undefined' && typeof App.api === 'function') {
      return App.api('/customers/' + encodeURIComponent(id) + '/modem-remote');
    }
    var token = null;
    if (typeof getToken === 'function') token = getToken();
    else {
      try { token = localStorage.getItem('token'); } catch (_) {}
    }
    var headers = { 'Content-Type': 'application/json', 'Accept': 'application/json' };
    if (token && token !== 'null') headers.Authorization = 'Bearer ' + token;
    var r = await fetch('/api/customers/' + encodeURIComponent(id) + '/modem-remote', {
      credentials: 'include',
      headers: headers
    });
    if (r.status === 401) {
      location.href = '/login';
      return null;
    }
    return r.json();
  }

  root.openModemRemote = async function (id, ev) {
    if (ev) { ev.preventDefault(); ev.stopPropagation(); }
    if (!id) return;
    var popup = null;
    try { popup = window.open('about:blank', 'modem-remote-' + id); } catch (_) { popup = null; }
    try {
      var j = await fetchRemote(id);
      if (!j || !j.success || !j.url) {
        if (popup) try { popup.close(); } catch (_) {}
        notify((j && j.message) || 'Tidak bisa remote modem', 'err');
        return;
      }
      if (popup && !popup.closed) {
        popup.location.href = j.url;
      } else {
        var w = window.open(j.url, '_blank', 'noopener');
        if (!w) notify('Izinkan pop-up browser, lalu coba lagi. URL: ' + j.url, 'err');
      }
      notify(j.hint || 'GUI modem dibuka. Pastikan WireGuard aktif.', 'ok');
    } catch (e) {
      if (popup) try { popup.close(); } catch (_) {}
      notify('Gagal remote modem', 'err');
    }
  };
})(window);
