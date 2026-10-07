(() => {
  const api = window.VinuApi;
  const auth = window.VinuAuth;
  const CATEGORY_ORDER = ['Gaming', 'Cyberpunk', 'Anime', 'Cars', 'Nature', 'Dark'];
  const safeImagePath = (item) => String(item.imageUrl || '').startsWith('/manus-storage/') ? item.imageUrl : '';

  function setupReveals(root = document) {
    const targets = root.querySelectorAll('[data-reveal]');
    if (!('IntersectionObserver' in window)) { targets.forEach((target) => target.classList.add('is-visible')); return; }
    const observer = new IntersectionObserver((entries, current) => entries.forEach((entry) => {
      if (entry.isIntersecting) { entry.target.classList.add('is-visible'); current.unobserve(entry.target); }
    }), { threshold: 0.12, rootMargin: '0px 0px -40px 0px' });
    targets.forEach((target) => observer.observe(target));
  }

  function bootGallery() {
    const grid = document.querySelector('#wallpaper-grid');
    if (!grid) return;
    const previewSlug = window.location.pathname.match(/^\/preview\/([a-z0-9-]{1,64})\/?$/i)?.[1] || null;
    const search = document.querySelector('#wallpaper-search');
    const chips = document.querySelector('.filter-list');
    const count = document.querySelector('#results-count');
    const empty = document.querySelector('#empty-state');
    const loadError = document.querySelector('#load-error');
    const dialog = document.querySelector('#preview-dialog');
    const items = [];
    let currentItems = items;
    let activeCategory = 'all';
    let previewItem = null;

    function cardMarkup(item, index) {
      const image = safeImagePath(item);
      const resolution = item.width > 0 && item.height > 0 ? `${item.width} × ${item.height}` : (item.aspectRatio || 'Widescreen');
      const favorite = auth.isFavorite(item.id);
      const download = `/download/${encodeURIComponent(item.id)}`;
      return `<article class="wallpaper-card" tabindex="0" role="button" aria-label="Preview ${api.esc(item.title)}" data-id="${api.esc(item.id)}" data-reveal style="animation-delay:${Math.min(index, 6) * 55}ms"><div class="card-image"><img src="${api.esc(image)}" alt="${api.esc(item.title)} gaming wallpaper" loading="lazy" /><span class="card-index">VWZ / ${String(index + 1).padStart(2, '0')}</span><span class="card-ratio">${api.esc(resolution)}</span><button class="favorite-toggle card-favorite" type="button" data-favorite="${api.esc(item.id)}" aria-label="${favorite ? 'Remove' : 'Save'} ${api.esc(item.title)} ${favorite ? 'from' : 'to'} favorites" aria-pressed="${favorite}">${favorite ? '♥' : '♡'}</button><span class="card-hover-label">PREVIEW ARTWORK ↗</span></div><div class="card-info"><div><h3>${api.esc(item.title)}</h3><span class="card-game">${api.esc(item.game || 'Gaming wallpaper')}</span></div><span class="card-tag">${api.esc(item.category)}</span></div>${item.description ? `<p class="card-description">${api.esc(item.description)}</p>` : ''}<div class="card-foot"><span>${api.esc((item.fileName || 'IMAGE').split('.').pop().toUpperCase())} · ${api.esc(resolution)}</span><a class="card-download" href="${download}" download="VinuWallpaperZ-${api.esc(item.id)}-4K.jpg" data-download="${api.esc(item.id)}">DOWNLOAD <span aria-hidden="true">↓</span></a></div></article>`;
    }

    function renderCategories() {
      const counts = new Map();
      items.forEach((item) => counts.set(item.category, (counts.get(item.category) || 0) + 1));
      const categories = [...counts.keys()].sort((a, b) => {
        const ai = CATEGORY_ORDER.indexOf(a), bi = CATEGORY_ORDER.indexOf(b);
        return (ai < 0 ? 100 : ai) - (bi < 0 ? 100 : bi) || a.localeCompare(b);
      });
      document.querySelector('#all-count').textContent = String(items.length).padStart(2, '0');
      chips.innerHTML = `<button class="filter-chip ${activeCategory === 'all' ? 'is-active' : ''}" data-filter="all" type="button">All <span>${String(items.length).padStart(2, '0')}</span></button>` + categories.map((category) => `<button class="filter-chip ${activeCategory === category ? 'is-active' : ''}" data-filter="${api.esc(category)}" type="button">${api.esc(category)} <span>${counts.get(category)}</span></button>`).join('');
    }

    function render() {
      const query = search.value.trim().toLowerCase();
      currentItems = items.filter((item) => {
        const categoryMatch = activeCategory === 'all' || item.category === activeCategory;
        const text = `${item.title} ${item.game} ${item.category} ${(item.tags || []).join(' ')} ${item.keywords || ''} ${item.description || ''}`.toLowerCase();
        return categoryMatch && text.includes(query);
      });
      grid.innerHTML = currentItems.map(cardMarkup).join('');
      grid.hidden = currentItems.length === 0;
      empty.hidden = currentItems.length !== 0;
      count.textContent = `${String(currentItems.length).padStart(2, '0')} WALLPAPER${currentItems.length === 1 ? '' : 'S'}`;
      setupReveals(grid);
    }

    async function logEvent(type, item) {
      if (type !== 'view' || !item) return;
      try { await api.requestJson('/api/analytics/view', { method: 'POST', headers: api.mutationHeaders({ 'Content-Type': 'application/json' }), body: JSON.stringify({ wallpaperId: item.id }) }); } catch (_) { /* Analytics never blocks the wallpaper experience. */ }
    }

    function updatePreviewFavorite() {
      const button = document.querySelector('#preview-favorite');
      if (!button || !previewItem) return;
      const favorite = auth.isFavorite(previewItem.id);
      button.textContent = favorite ? '♥' : '♡';
      button.setAttribute('aria-pressed', String(favorite));
      button.setAttribute('aria-label', `${favorite ? 'Remove from' : 'Save to'} favorites`);
    }

    function openPreview(item, { trackView = true } = {}) {
      previewItem = item;
      const image = document.querySelector('#preview-image');
      image.src = safeImagePath(item);
      image.alt = `${item.title} gaming wallpaper`;
      document.querySelector('#preview-title').textContent = item.title;
      document.querySelector('#preview-game').textContent = item.game || item.category;
      document.querySelector('#preview-category').textContent = `WALLPAPER / ${item.category.toUpperCase()}`;
      document.querySelector('#preview-resolution').textContent = item.width > 0 && item.height > 0 ? `${item.width} × ${item.height} px` : `${item.aspectRatio || '16:9'} widescreen`;
      const link = document.querySelector('#preview-download');
      link.href = `/download/${encodeURIComponent(item.id)}`;
      link.download = `VinuWallpaperZ-${item.id}-4K.jpg`;
      link.dataset.download = item.id;
      document.querySelector('#preview-favorite').hidden = item.status === 'draft';
      document.querySelector('.preview-corner').textContent = item.status === 'draft' ? 'DRAFT PREVIEW / VWZ' : 'LIVE PREVIEW / VWZ';
      updatePreviewFavorite();
      dialog.showModal();
      if (trackView) logEvent('view', item);
    }

    async function loadWallpapers() {
      try {
        const data = await api.requestJson('/api/wallpapers');
        items.splice(0, items.length, ...(data.items || []));
        let heroItem = items.find((item) => item.id === 'neon-frontier') || items[0];
        try {
          const heroConfig = await api.requestJson('/hero.json');
          if (heroConfig.heroSlug) {
            const configuredHero = items.find((item) => item.id.toLowerCase() === String(heroConfig.heroSlug).toLowerCase())
              || (await api.requestJson(`/api/hero/${encodeURIComponent(heroConfig.heroSlug)}`)).item;
            if (configuredHero) heroItem = configuredHero;
          }
        } catch (_) { /* Keep the existing public-wallpaper fallback if hero settings are unavailable. */ }
        const heroArt = document.querySelector('.hero-art');
        const image = heroItem && safeImagePath(heroItem);
        if (image) heroArt.style.backgroundImage = `linear-gradient(90deg,#080a0d 0%,rgba(8,10,13,.92) 16%,rgba(8,10,13,.35) 57%,rgba(8,10,13,.1) 100%),linear-gradient(0deg,#080a0d 0%,transparent 24%,transparent 78%,rgba(8,10,13,.25) 100%),url("${image}")`;
        renderCategories(); render(); setupReveals();
        if (previewSlug) {
          try {
            const library = await api.requestJson('/api/admin/wallpapers');
            const previewItem = library.items.find((item) => item.id.toLowerCase() === previewSlug.toLowerCase() && ['draft', 'published'].includes(item.status));
            if (!previewItem) throw new Error('Wallpaper is not available for preview.');
            document.title = `${previewItem.title} — Vinu wallpaperZ Preview`;
            openPreview(previewItem, { trackView: false });
          } catch (error) {
            loadError.textContent = error.message || 'Wallpaper preview could not be loaded.';
            loadError.hidden = false;
          }
        }
      } catch (_) { loadError.hidden = false; count.textContent = 'ARCHIVE UNAVAILABLE'; }
    }

    chips.addEventListener('click', (event) => {
      const chip = event.target.closest('[data-filter]');
      if (!chip) return;
      activeCategory = chip.dataset.filter;
      renderCategories(); render();
    });
    search.addEventListener('input', render);
    grid.addEventListener('click', async (event) => {
      const favoriteButton = event.target.closest('[data-favorite]');
      if (favoriteButton) {
        event.preventDefault(); event.stopPropagation();
        const id = favoriteButton.dataset.favorite;
        await auth.toggleFavorite(id); render(); updatePreviewFavorite();
        return;
      }
      const downloadLink = event.target.closest('[data-download]');
      if (downloadLink) return;
      const card = event.target.closest('[data-id]');
      const item = card && currentItems.find((wallpaper) => wallpaper.id === card.dataset.id);
      if (item) openPreview(item);
    });
    grid.addEventListener('keydown', (event) => {
      if ((event.key === 'Enter' || event.key === ' ') && event.target.matches('.wallpaper-card')) { event.preventDefault(); const item = currentItems.find((wallpaper) => wallpaper.id === event.target.dataset.id); if (item) openPreview(item); }
    });
    document.querySelector('#preview-dialog .modal-close').addEventListener('click', () => dialog.close());
    dialog.addEventListener('click', (event) => { if (event.target === dialog) dialog.close(); });
    document.querySelector('#preview-favorite').addEventListener('click', async () => { if (previewItem) { await auth.toggleFavorite(previewItem.id); render(); updatePreviewFavorite(); } });
    document.querySelector('#reset-search').addEventListener('click', () => { search.value = ''; activeCategory = 'all'; renderCategories(); render(); });
    document.addEventListener('keydown', (event) => { if (event.key === '/' && !['INPUT', 'TEXTAREA'].includes(document.activeElement.tagName)) { event.preventDefault(); search.focus(); } });
    setupReveals();
    loadWallpapers();
    auth.initUserAuth(render);
  }

  if (window.location.pathname.replace(/\/$/, '') === '/admin/login') window.VinuAdmin.bootAdmin();
  else bootGallery();
})();
