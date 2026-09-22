/**
 * Pull-to-refresh Fiberix v3 — Capacitor / Android WebView.
 *
 * Kunci: saat .wrap di puncak, touch-action=pan-up supaya tarik ke bawah
 * tidak dimakan native scroller. Pointer capture + preventDefault dari pixel pertama.
 * Halaman boleh set window.mobileRefresh = function(){ return Promise }
 */
(function () {
  if (window.__flynPtrVer >= 3) return;
  window.__flynPtr = true;
  window.__flynPtrVer = 3;

  var THRESHOLD = 56;
  var MAX_PULL = 120;

  function ready(fn) {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fn);
    else fn();
  }

  function isMobileShell() {
    return !!(document.querySelector('.wrap') && document.querySelector('.mdr, .mtop, .bottomnav'));
  }

  function hasOwnPtr() {
    var path = (location.pathname || '').replace(/\/+$/, '') || '/';
    if (path === '/hotspot') return true;
    return !!(document.getElementById('ptr') && !document.querySelector('.mtop, .bottomnav'));
  }

  function shouldRun() {
    if (hasOwnPtr()) return false;
    if (isMobileShell()) return true;
    var touch = 'ontouchstart' in window || (navigator.maxTouchPoints && navigator.maxTouchPoints > 0);
    return !!(touch && window.innerWidth <= 768);
  }

  function scroller() { return document.querySelector('.wrap'); }

  function atTop() {
    var el = scroller();
    if (el) return (el.scrollTop || 0) <= 2;
    return (window.scrollY || window.pageYOffset || 0) <= 2;
  }

  function overlayOpen() {
    if (document.body.classList.contains('sheet-open')) return true;
    return !!(
      document.querySelector('.mdr.open, #mdrPanel.open, .mdr-overlay.open') ||
      document.querySelector('.msearch.open, #mSearch.open, .mnotif.open') ||
      document.querySelector('.dm-sheet.open, .sheet.open, .add-sheet.open') ||
      document.querySelector('.pn-sheet.open, .pd-sheet.open, .modal-overlay[style*="flex"]')
    );
  }

  function ignoreTouch(target) {
    if (!target || !target.closest) return false;
    if (target.closest('input, textarea, select, [contenteditable="true"]')) return true;
    if (target.closest('.leaflet-container')) return true;
    if (target.closest('.bottomnav, .bottom-nav')) return true;
    if (target.closest('.mdr.open, .msearch.open, .mnotif.open')) return true;
    return false;
  }

  function injectCss() {
    if (document.getElementById('flynPtrCss')) return;
    var st = document.createElement('style');
    st.id = 'flynPtrCss';
    st.textContent =
      '.flyn-ptr{position:fixed;top:env(safe-area-inset-top,0px);left:50%;transform:translate(-50%,-56px);' +
      'z-index:5000;pointer-events:none;display:flex;align-items:center;gap:8px;' +
      'background:#fff;border:1px solid #e8edf5;border-radius:999px;padding:8px 14px;' +
      'box-shadow:0 8px 22px rgba(15,27,52,.16);font-family:inherit;font-size:12px;' +
      'font-weight:700;color:#334155;opacity:0;transition:transform .18s ease,opacity .18s ease;' +
      'max-width:calc(100% - 32px);}' +
      '.flyn-ptr.show{opacity:1;}' +
      '.flyn-ptr svg{width:16px;height:16px;flex-shrink:0;color:#0ea5e9;}' +
      '.flyn-ptr.spin svg{animation:flynPtrSpin .75s linear infinite;}' +
      '@keyframes flynPtrSpin{to{transform:rotate(360deg);}}' +
      '.mtop{touch-action:none;}' +
      '.wrap.flyn-ptr-top{touch-action:pan-up;overscroll-behavior-y:none;}';
    document.head.appendChild(st);
  }

  function indicator() {
    var el = document.getElementById('flynPtr');
    if (el) return el;
    el = document.createElement('div');
    el.id = 'flynPtr';
    el.className = 'flyn-ptr';
    el.innerHTML =
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">' +
        '<path d="M21 2v6h-6"/><path d="M3 12a9 9 0 0115-6.7L21 8"/>' +
        '<path d="M3 22v-6h6"/><path d="M21 12a9 9 0 01-15 6.7L3 16"/>' +
      '</svg><span class="flyn-ptr-txt">Tarik untuk refresh</span>';
    document.body.appendChild(el);
    return el;
  }

  function setBar(el, pull, readyPull, spinning) {
    var y = Math.min(pull, MAX_PULL) - 44;
    el.style.transform = 'translate(-50%,' + y + 'px)';
    el.classList.toggle('show', pull > 6 || spinning);
    el.classList.toggle('spin', !!(readyPull || spinning));
    var txt = el.querySelector('.flyn-ptr-txt');
    if (txt) txt.textContent = spinning ? 'Memuat ulang…' : (readyPull ? 'Lepas untuk refresh' : 'Tarik untuk refresh');
  }

  function resetBar(el) {
    el.classList.remove('show', 'spin');
    el.style.transform = 'translate(-50%,-56px)';
  }

  function haptic() {
    try {
      if (typeof window.haptic === 'function') window.haptic(12);
      else if (navigator.vibrate) navigator.vibrate(12);
    } catch (_) {}
  }

  function doRefresh() {
    try {
      if (typeof window.mobileRefresh === 'function') return Promise.resolve(window.mobileRefresh());
    } catch (_) {}
    location.reload();
    return new Promise(function () {});
  }
  window.flynDoRefresh = function () { return doRefresh(); };

  ready(function () {
    if (!shouldRun()) return;
    injectCss();
    var ptr = indicator();
    var wrap = scroller();
    var startY = 0;
    var startX = 0;
    var dist = 0;
    var tracking = false;
    var pulling = false;
    var refreshing = false;
    var armed = false;
    var pid = null;

    function syncTouchAction() {
      if (!wrap) return;
      if ((wrap.scrollTop || 0) <= 2) wrap.classList.add('flyn-ptr-top');
      else wrap.classList.remove('flyn-ptr-top');
    }

    function rubber(pull) {
      if (!wrap) return;
      wrap.style.transition = 'none';
      wrap.style.transform = 'translateY(' + Math.round(Math.min(pull, MAX_PULL) * 0.36) + 'px)';
    }

    function clearRubber() {
      if (!wrap) return;
      wrap.style.transition = 'transform .2s ease';
      wrap.style.transform = '';
    }

    function pointY(e) {
      if (e.touches && e.touches.length) return e.touches[0].clientY;
      if (e.changedTouches && e.changedTouches.length) return e.changedTouches[0].clientY;
      return e.clientY;
    }
    function pointX(e) {
      if (e.touches && e.touches.length) return e.touches[0].clientX;
      if (e.changedTouches && e.changedTouches.length) return e.changedTouches[0].clientX;
      return e.clientX;
    }

    function begin(e) {
      if (refreshing || overlayOpen()) { tracking = pulling = false; return; }
      if (ignoreTouch(e.target)) { tracking = pulling = false; return; }
      if (!atTop()) { tracking = pulling = false; return; }
      startY = pointY(e);
      startX = pointX(e);
      if (typeof startY !== 'number') return;
      dist = 0;
      tracking = true;
      pulling = false;
      armed = false;
      pid = e.pointerId;
      try { if (e.pointerId != null && e.target && e.target.setPointerCapture) e.target.setPointerCapture(e.pointerId); } catch (_) {}
    }

    function move(e) {
      if (!tracking || refreshing) return;
      var y = pointY(e);
      var x = pointX(e);
      var dy = y - startY;
      var dx = x - startX;

      if (!pulling) {
        if (Math.abs(dx) > 18 && Math.abs(dx) > Math.abs(dy)) { tracking = false; return; }
        if (dy > 0 && atTop()) {
          pulling = true;
        } else if (dy < -10) {
          tracking = false;
          return;
        } else {
          return;
        }
      }

      dist = Math.max(0, dy);
      if (dist <= 0) {
        resetBar(ptr);
        rubber(0);
        return;
      }

      if (e.cancelable) e.preventDefault();
      if (typeof e.stopPropagation === 'function') e.stopPropagation();

      var pull = Math.min(dist * 0.52, MAX_PULL);
      var readyPull = dist >= THRESHOLD;
      if (readyPull && !armed) { armed = true; haptic(); }
      if (!readyPull) armed = false;
      rubber(pull);
      setBar(ptr, pull, readyPull, false);
    }

    function end() {
      if (!tracking && !pulling) return;
      var should = pulling && dist >= THRESHOLD;
      tracking = false;
      pulling = false;
      pid = null;
      if (should) {
        refreshing = true;
        setBar(ptr, 70, true, true);
        rubber(32);
        haptic();
        Promise.resolve(doRefresh()).finally(function () {
          setTimeout(function () {
            clearRubber();
            resetBar(ptr);
            refreshing = false;
            syncTouchAction();
          }, 260);
        });
      } else {
        clearRubber();
        resetBar(ptr);
      }
      dist = 0;
    }

    function cancel() {
      tracking = pulling = false;
      pid = null;
      if (!refreshing) {
        clearRubber();
        resetBar(ptr);
      }
      dist = 0;
    }

    var capPassive = { capture: true, passive: true };
    var capMove = { capture: true, passive: false };

    document.addEventListener('touchstart', begin, capPassive);
    document.addEventListener('touchmove', move, capMove);
    document.addEventListener('touchend', end, capPassive);
    document.addEventListener('touchcancel', cancel, capPassive);

    document.addEventListener('pointerdown', function (e) {
      if (e.pointerType === 'mouse') return;
      begin(e);
    }, capPassive);
    document.addEventListener('pointermove', function (e) {
      if (e.pointerType === 'mouse') return;
      move(e);
    }, capMove);
    document.addEventListener('pointerup', function (e) {
      if (e.pointerType === 'mouse') return;
      end();
    }, capPassive);
    document.addEventListener('pointercancel', function (e) {
      if (e.pointerType === 'mouse') return;
      cancel();
    }, capPassive);

    if (wrap) {
      wrap.addEventListener('scroll', syncTouchAction, { passive: true });
      syncTouchAction();
      if (wrap.scrollTop === 0) {
        try { wrap.scrollTop = 1; } catch (_) {}
      }
    }

    var mtop = document.getElementById('mTop');
    if (mtop) {
      mtop.addEventListener('touchstart', begin, capPassive);
      mtop.addEventListener('touchmove', move, capMove);
      mtop.addEventListener('touchend', end, capPassive);
    }

    var btn = document.getElementById('mTopRefresh');
    if (btn) {
      btn.addEventListener('click', function (e) {
        e.preventDefault();
        if (refreshing) return;
        refreshing = true;
        setBar(ptr, 70, true, true);
        Promise.resolve(doRefresh()).finally(function () {
          setTimeout(function () { resetBar(ptr); refreshing = false; }, 300);
        });
      });
    }
  });
})();
