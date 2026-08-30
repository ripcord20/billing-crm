(function () {
  var toggle = document.getElementById('saasNavToggle');
  var links = document.getElementById('saasNavLinks');
  if (toggle && links) {
    toggle.addEventListener('click', function () {
      var open = links.classList.toggle('is-open');
      toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    });
  }

  var form = document.getElementById('mitraSignupForm');
  if (!form) return;

  var alertEl = document.getElementById('mitraSignupAlert');
  var btn = document.getElementById('mitraSignupBtn');

  function showAlert(type, message) {
    if (!alertEl) return;
    alertEl.className = 'saas-alert ' + type;
    alertEl.textContent = message;
  }

  form.addEventListener('submit', async function (e) {
    e.preventDefault();
    showAlert('', '');
    if (alertEl) alertEl.className = 'saas-alert';

    var payload = {
      company_name: (document.getElementById('company_name') || {}).value || '',
      owner_name: (document.getElementById('owner_name') || {}).value || '',
      email: (document.getElementById('email') || {}).value || '',
      password: (document.getElementById('password') || {}).value || '',
      phone: (document.getElementById('phone') || {}).value || '',
      website: (document.getElementById('website') || {}).value || ''
    };

    if (btn) {
      btn.disabled = true;
      btn.textContent = 'Membuat akun…';
    }

    try {
      var res = await fetch('/api/public/tenant-signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
        body: JSON.stringify(payload)
      });
      var data = await res.json().catch(function () { return {}; });
      if (data.success && data.data && data.data.redirect) {
        if (data.data.token) localStorage.setItem('token', data.data.token);
        if (data.data.user) localStorage.setItem('user', JSON.stringify(data.data.user));
        showAlert('ok', data.message || 'Akun dibuat. Mengalihkan…');
        window.location.href = data.data.redirect;
        return;
      }
      showAlert('error', data.message || 'Pendaftaran gagal. Periksa data Anda.');
    } catch (err) {
      showAlert('error', 'Koneksi gagal. Coba lagi nanti.');
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.textContent = 'Buat akun mitra';
      }
    }
  });
})();
