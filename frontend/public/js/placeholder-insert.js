/* Shared insert-{placeholder} helper for WA & Telegram template editors. */
(function (w) {
  'use strict';

  function sanitizeName(raw) {
    return String(raw || '')
      .trim()
      .replace(/[{}]/g, '')
      .replace(/[-\s]+/g, '_')
      .replace(/[^\w]/g, '');
  }

  function token(raw) {
    const n = sanitizeName(raw);
    return n ? '{' + n + '}' : '';
  }

  function insertAtCursor(el, text) {
    if (!el || text == null || text === '') return false;
    const s = el.selectionStart != null ? el.selectionStart : el.value.length;
    const e = el.selectionEnd != null ? el.selectionEnd : el.value.length;
    el.value = el.value.slice(0, s) + text + el.value.slice(e);
    const pos = s + String(text).length;
    el.focus();
    try { el.setSelectionRange(pos, pos); } catch (_) { /* not all inputs */ }
    try { el.dispatchEvent(new Event('input', { bubbles: true })); } catch (_) {}
    return true;
  }

  w.PlaceholderInsert = { sanitizeName, token, insertAtCursor };
})(window);
