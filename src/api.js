(() => {
  const esc = (value = '') => String(value).replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
  async function requestJson(path, options = {}) {
    const response = await fetch(path, { credentials: 'same-origin', ...options, headers: { Accept: 'application/json', ...(options.headers || {}) } });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || `Request failed (${response.status})`);
    return data;
  }
  function mutationHeaders(headers = {}) { return { 'X-Vinu-Request': '1', ...headers }; }
  function formatNumber(value) { return new Intl.NumberFormat('en-US').format(Number(value) || 0); }
  function formatDate(value, options = {}) {
    const date = value ? new Date(value) : null;
    return date && !Number.isNaN(date.getTime()) ? new Intl.DateTimeFormat('en-US', options).format(date) : '—';
  }
  let toastTimer;
  function showToast(message) {
    const toast = document.querySelector('#toast');
    if (!toast) return;
    toast.textContent = String(message || '');
    toast.classList.add('is-visible');
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => toast.classList.remove('is-visible'), 3000);
  }
  window.VinuApi = { esc, requestJson, mutationHeaders, formatNumber, formatDate, showToast };
  document.addEventListener('click', (event) => {
    const link = event.target instanceof Element ? event.target.closest('a[data-download]') : null;
    if (!link) return;
    const slug = link.dataset.download;
    if (!slug) return;
    event.preventDefault();
    window.location.href = `/download/${encodeURIComponent(slug)}`;
  });
})();
