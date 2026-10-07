(() => {
  const api = window.VinuApi;
  const categories = ['Gaming', 'Cyberpunk', 'Anime', 'Cars', 'Nature', 'Dark'];
  const safeImage = (item) => String(item.imageUrl || '').startsWith('/manus-storage/') ? item.imageUrl : '';
  let cachedUsers = [];
  let currentHeroSlug = null;

  function adminShell(content) {
    document.body.classList.add('admin-body');
    document.body.innerHTML = `<div class="admin-shell"><header class="admin-topbar"><a class="brand" href="/" aria-label="Vinu wallpaperZ home"><img class="brand-mark" src="/logo.svg" alt="" aria-hidden="true" /><span>Vinu <span class="brand-accent">wallpaperZ</span><small>PRIVATE CONTROL ROOM</small></span></a><a class="admin-back" href="/">← View public archive</a></header>${content}<div class="toast" id="toast" role="status" aria-live="polite"></div></div>`;
  }

  function renderLogin(message = '') {
    document.title = 'Vinu wallpaperZ — Private admin login';
    adminShell(`<main class="admin-login-page"><div class="admin-login-card glass-panel"><p class="section-kicker">PRIVATE ACCESS / VWZ</p><h1>Sign in to<br /><span>your control room.</span></h1><p class="admin-intro">This private route is for the site owner. Wallpaper management is never shown in the public archive.</p><form id="admin-login-form" class="admin-form" novalidate><label>Username<input name="username" type="text" autocomplete="username" required maxlength="100" /></label><label>Password<input name="password" type="password" autocomplete="current-password" required maxlength="256" /></label><div class="form-error" id="login-error" role="alert">${api.esc(message)}</div><button class="button button-primary" type="submit">Sign in <span aria-hidden="true">↗</span></button></form><p class="secure-note"><span class="online-dot"></span> Private admin access · Secured session</p></div><div class="admin-login-aside"><span>VWZ / OWNER</span><p>YOUR ART.<br /><b>YOUR ARCHIVE.</b></p><i></i></div></main>`);
    const form = document.querySelector('#admin-login-form');
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      const button = form.querySelector('button');
      const error = document.querySelector('#login-error');
      error.textContent = ''; button.disabled = true; button.classList.add('is-loading');
      try {
        const body = Object.fromEntries(new FormData(form));
        await api.requestJson('/api/admin/login', { method: 'POST', headers: api.mutationHeaders({ 'Content-Type': 'application/json' }), body: JSON.stringify(body) });
        renderDashboard();
      } catch (err) { error.textContent = err.message; }
      finally { button.disabled = false; button.classList.remove('is-loading'); }
    });
  }

  function statsMarkup() {
    const cards = [
      ['totalWallpapers', 'TOTAL WALLPAPERS', '◈', 'violet'],
      ['totalViews', 'TOTAL VIEWS', '◎', 'cyan'],
      ['totalDownloads', 'TOTAL DOWNLOADS', '↓', 'blue'],
      ['dailyActiveUsers', 'DAILY ACTIVE USERS', '◌', 'green'],
      ['weeklyUsers', 'WEEKLY USERS', '↗', 'amber']
    ];
    return cards.map(([key, label, icon, tone], index) => `<article class="stat-card glass-panel stat-${tone}" data-stagger style="--stagger:${index * 70}ms"><div class="stat-head"><span>${label}</span><i aria-hidden="true">${icon}</i></div><div class="stat-value" data-stat="${key}" data-value="0">0</div><div class="stat-foot">${key === 'dailyActiveUsers' ? 'Signed-in · last 24 hours' : key === 'weeklyUsers' ? 'Signed-in · last 7 days' : 'Since archive launch'}</div></article>`).join('');
  }

  function renderDashboard() {
    document.title = 'Vinu wallpaperZ — Admin control room';
    adminShell(`<main class="admin-dashboard">
      <div class="dashboard-heading"><div><p class="section-kicker">CONTROL ROOM / VWZ</p><h1>Make the archive <span>yours.</span></h1><p class="admin-intro">A live view of your collection, its activity, and the people who use it.</p></div><button class="button button-quiet" id="admin-logout" type="button">Sign out <span>↗</span></button></div>
      <nav class="admin-tabs" role="tablist" aria-label="Admin sections"><button class="admin-tab is-active" data-admin-tab="overview" type="button" role="tab" aria-selected="true">Overview</button><button class="admin-tab" data-admin-tab="wallpapers" type="button" role="tab" aria-selected="false">Wallpapers</button><button class="admin-tab" data-admin-tab="users" type="button" role="tab" aria-selected="false">Users</button></nav>
      <section class="admin-view" id="admin-view-overview" data-admin-view="overview"><div class="stats-grid">${statsMarkup()}</div><section class="admin-panel chart-panel glass-panel"><div class="panel-heading"><div><p class="section-kicker">LAST 7 DAYS</p><h2>Views <span>&</span> downloads</h2></div><div class="chart-legend"><span><i class="legend-views"></i>Views</span><span><i class="legend-downloads"></i>Downloads</span></div></div><div class="chart-wrap" id="events-chart"></div><p class="chart-caption">Views count wallpaper previews. User totals include Google-verified active accounts.</p></section><div class="overview-foot"><span class="online-dot"></span> Metrics update from the managed archive database.</div></section>
      <section class="admin-view" id="admin-view-wallpapers" data-admin-view="wallpapers" hidden><div class="management-grid"><section class="admin-panel upload-panel glass-panel"><div class="panel-heading"><span class="panel-number">01</span><div><h2>Upload a wallpaper</h2><p>Set the details; image resolution is detected automatically.</p></div></div><form class="admin-form upload-form" id="wallpaper-upload-form"><label>Wallpaper title<input name="title" required maxlength="160" placeholder="e.g. Midnight Circuit" /></label><div class="form-row"><label>Category<select name="category" required><option value="">Choose a category</option>${categories.map((name) => `<option>${name}</option>`).join('')}</select></label><label>Tags <span class="optional-label">COMMA-SEPARATED</span><input name="tags" maxlength="500" placeholder="neon, skyline, action" /></label></div><label>Description <span class="optional-label">OPTIONAL</span><textarea name="description" rows="3" maxlength="500" placeholder="A short note about the artwork"></textarea></label><label class="file-picker"><span class="file-picker-title">Wallpaper image <span>PNG, JPEG or WebP · Max 12 MB</span></span><input id="wallpaper-file" name="file" type="file" accept="image/png,image/jpeg,image/webp" required /><span class="file-button">Choose image <b>＋</b></span></label><div class="file-status" id="file-status">No image selected</div><label class="resolution-field">Detected resolution<input id="resolution-display" value="Choose an image to detect resolution" readonly /></label><input type="hidden" name="width" /><input type="hidden" name="height" /><button class="button button-primary upload-submit" type="submit">Upload to archive <span aria-hidden="true">↑</span></button><div class="form-error" id="upload-error" role="alert"></div><p class="secure-note">Files are validated before they are saved to managed storage.</p></form></section><section class="admin-panel library-panel glass-panel"><div class="panel-heading"><span class="panel-number">02</span><div><h2>Wallpaper library</h2><p id="library-count">Loading saved wallpapers…</p></div><button class="refresh-button" id="refresh-library" type="button" aria-label="Refresh library">↻</button></div><div class="library-list" id="library-list"></div></section></div></section>
      <section class="admin-view" id="admin-view-users" data-admin-view="users" hidden><section class="admin-panel users-panel glass-panel"><div class="panel-heading"><div><p class="section-kicker">ACCOUNT DIRECTORY</p><h2>Signed-in users</h2><p>Only verified Google accounts appear here. Suspend access without deleting a user’s history.</p></div><span class="user-count-pill" id="user-count">0 accounts</span></div><label class="admin-search"><span aria-hidden="true">⌕</span><input id="user-search" type="search" placeholder="Search name or email" autocomplete="off" /></label><div class="user-table-wrap"><table class="user-table"><thead><tr><th>USER</th><th>FIRST SIGN-IN</th><th>LAST ACTIVE</th><th>STATUS</th><th>ACCESS</th></tr></thead><tbody id="user-table-body"><tr><td colspan="5">Open the Users tab to load accounts.</td></tr></tbody></table></div></section></section>
      <div class="dashboard-footer"><span><span class="online-dot"></span> ADMIN SESSION ACTIVE</span><span>PRIVATE CONTROL ROOM / VWZ</span></div>
      <dialog class="edit-dialog" id="edit-wallpaper-dialog"><form class="admin-form edit-form" id="edit-wallpaper-form"><div class="edit-dialog-heading"><div><p class="section-kicker">EDIT WALLPAPER</p><h2 id="edit-dialog-title">Update details.</h2></div><button class="modal-close" type="button" id="edit-dialog-close" aria-label="Close edit dialog">×</button></div><input type="hidden" name="id" /><label>Wallpaper title<input name="title" required maxlength="160" /></label><div class="form-row"><label>Category<select name="category" required>${categories.map((name) => `<option>${name}</option>`).join('')}</select></label><label>Tags <span class="optional-label">COMMA-SEPARATED</span><input name="tags" maxlength="500" /></label></div><label>Description <span class="optional-label">OPTIONAL</span><textarea name="description" rows="3" maxlength="500"></textarea></label><label class="resolution-field">Image resolution<input name="resolution" readonly /></label><div class="form-error" id="edit-error" role="alert"></div><button class="button button-primary" type="submit">Save changes <span aria-hidden="true">✓</span></button></form></dialog>
    </main>`);
    bindDashboard();
    loadDashboard();
    loadWallpaperLibrary();
  }

  function animateStats(stats) {
    for (const [key, raw] of Object.entries(stats || {})) {
      const target = document.querySelector(`[data-stat="${key}"]`);
      if (!target) continue;
      const end = Math.max(0, Number(raw) || 0);
      const start = performance.now();
      const duration = 850;
      function tick(now) {
        const progress = Math.min(1, (now - start) / duration);
        const eased = 1 - Math.pow(1 - progress, 3);
        target.textContent = api.formatNumber(Math.round(end * eased));
        if (progress < 1) requestAnimationFrame(tick);
      }
      requestAnimationFrame(tick);
    }
  }

  async function loadDashboard() {
    try {
      const data = await api.requestJson('/api/admin/dashboard');
      animateStats(data.stats);
      window.VinuCharts.renderEventsChart(document.querySelector('#events-chart'), data.days);
    } catch (error) {
      api.showToast(error.message || 'Dashboard metrics could not be loaded.');
    }
  }

  function libraryMarkup(item) {
    const src = safeImage(item);
    const resolution = item.width && item.height ? `${item.width} × ${item.height} px` : item.aspectRatio || 'Widescreen';
    const stateLabel = item.status === 'published' ? 'LIVE' : item.status === 'draft' ? 'DRAFT' : item.status === 'deleted' ? 'HIDDEN' : 'UPLOAD PENDING';
    const active = item.status === 'published' || item.status === 'draft';
    const preview = active ? `<button class="row-action" type="button" data-preview-wallpaper="${api.esc(item.id)}">Preview</button>` : '';
    const setHero = active ? `<button class="row-action" type="button" data-set-hero="${api.esc(item.id)}">Set as Hero</button>` : '';
    const heroBadge = active && item.id === currentHeroSlug ? '<b class="hero-badge">⭐ HERO</b>' : '';
    const buttons = item.status === 'published'
      ? `${preview}<button class="row-action" type="button" data-wallpaper-state="draft" data-wallpaper-id="${api.esc(item.id)}">Unpublish</button>${setHero}<button class="row-action" type="button" data-edit-wallpaper="${api.esc(item.id)}">Edit</button><button class="row-action is-danger" type="button" data-wallpaper-state="deleted" data-wallpaper-id="${api.esc(item.id)}">Delete</button>`
      : item.status === 'draft'
        ? `${preview}<button class="row-action" type="button" data-wallpaper-state="published" data-wallpaper-id="${api.esc(item.id)}">Publish</button>${setHero}<button class="row-action" type="button" data-edit-wallpaper="${api.esc(item.id)}">Edit</button><button class="row-action is-danger" type="button" data-wallpaper-state="deleted" data-wallpaper-id="${api.esc(item.id)}">Delete</button>`
        : item.status === 'deleted'
          ? `<button class="row-action" type="button" data-edit-wallpaper="${api.esc(item.id)}">Edit</button><button class="row-action" type="button" data-wallpaper-state="published" data-wallpaper-id="${api.esc(item.id)}">Restore</button>`
          : `<button class="row-action" type="button" data-edit-wallpaper="${api.esc(item.id)}">Edit details</button>`;
    return `<article class="library-item ${item.status === 'deleted' ? 'is-deleted' : ''}"><img src="${api.esc(src)}" alt="" loading="lazy" /><div class="library-item-copy"><strong>${api.esc(item.title)}</strong><span>${api.esc(item.category)} · ${api.esc(item.tags.join(', ') || item.game)}</span><small>${api.esc(resolution)} · <b class="status-label status-${api.esc(item.status)}">${stateLabel}</b>${heroBadge}</small></div><div class="library-actions">${buttons}</div></article>`;
  }

  async function loadWallpaperLibrary() {
    const list = document.querySelector('#library-list');
    const count = document.querySelector('#library-count');
    if (!list || !count) return;
    list.innerHTML = '<p class="library-loading">Loading your library…</p>';
    try {
      const data = await api.requestJson('/api/admin/wallpapers');
      currentHeroSlug = data.heroSlug || null;
      count.textContent = `${data.items.length} wallpaper${data.items.length === 1 ? '' : 's'} · ${data.items.filter((item) => item.status === 'published').length} live`;
      list.innerHTML = data.items.length ? data.items.map(libraryMarkup).join('') : '<p class="library-loading">No wallpapers yet. Upload your first one.</p>';
    } catch (error) { count.textContent = 'Could not load the library'; list.innerHTML = `<p class="library-error">${api.esc(error.message)}</p>`; }
  }

  function editWallpaper(id) {
    api.requestJson('/api/admin/wallpapers').then((data) => {
      const item = data.items.find((record) => record.id === id);
      if (!item) throw new Error('Wallpaper not found.');
      const form = document.querySelector('#edit-wallpaper-form');
      form.elements.id.value = item.id;
      form.elements.title.value = item.title;
      form.elements.category.value = categories.includes(item.category) ? item.category : 'Gaming';
      form.elements.tags.value = item.tags.join(', ');
      form.elements.description.value = item.description || '';
      form.elements.resolution.value = item.width && item.height ? `${item.width} × ${item.height} px` : item.aspectRatio || 'Widescreen';
      document.querySelector('#edit-dialog-title').textContent = item.title;
      document.querySelector('#edit-error').textContent = '';
      document.querySelector('#edit-wallpaper-dialog').showModal();
    }).catch((error) => api.showToast(error.message));
  }

  async function changeWallpaperState(id, status) {
    const restore = status === 'published';
    if (status === 'deleted' && !window.confirm('Hide this wallpaper from the public archive? You can restore it later.')) return;
    try {
      await api.requestJson(`/api/admin/wallpapers/${encodeURIComponent(id)}/status`, { method: 'PUT', headers: api.mutationHeaders({ 'Content-Type': 'application/json' }), body: JSON.stringify({ status }) });
      api.showToast(restore ? 'Wallpaper published to the archive.' : status === 'draft' ? 'Wallpaper moved back to drafts.' : 'Wallpaper removed from the public archive.');
      await Promise.all([loadWallpaperLibrary(), loadDashboard()]);
    } catch (error) { api.showToast(error.message || 'The wallpaper could not be updated.'); }
  }

  async function setHero(id) {
    try {
      const data = await api.requestJson('/api/admin/hero', { method: 'PUT', headers: api.mutationHeaders({ 'Content-Type': 'application/json' }), body: JSON.stringify({ heroSlug: id }) });
      currentHeroSlug = data.heroSlug;
      api.showToast('Homepage hero updated.');
      await loadWallpaperLibrary();
    } catch (error) { api.showToast(error.message || 'The homepage hero could not be updated.'); }
  }

  async function uploadWallpaper(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const button = form.querySelector('.upload-submit');
    const error = document.querySelector('#upload-error');
    error.textContent = ''; button.disabled = true; button.classList.add('is-loading');
    try {
      const result = await api.requestJson('/api/admin/wallpapers', { method: 'POST', headers: api.mutationHeaders(), body: new FormData(form) });
      form.reset();
      document.querySelector('#file-status').textContent = 'No image selected';
      document.querySelector('#resolution-display').value = 'Choose an image to detect resolution';
      api.showToast(`Saved as a draft: ${result.item.title}`);
      await Promise.all([loadWallpaperLibrary(), loadDashboard()]);
    } catch (err) {
      error.textContent = err.message;
      await loadWallpaperLibrary();
    } finally { button.disabled = false; button.classList.remove('is-loading'); }
  }

  function bindUpload() {
    const input = document.querySelector('#wallpaper-file');
    input.addEventListener('change', async (event) => {
      const file = event.target.files[0];
      const form = document.querySelector('#wallpaper-upload-form');
      const status = document.querySelector('#file-status');
      const resolution = document.querySelector('#resolution-display');
      form.elements.width.value = ''; form.elements.height.value = '';
      resolution.value = 'Choose an image to detect resolution';
      if (!file) { status.textContent = 'No image selected'; return; }
      status.textContent = `${file.name} · ${(file.size / 1024 / 1024).toFixed(2)} MB`;
      try {
        const bitmap = await createImageBitmap(file);
        form.elements.width.value = String(bitmap.width);
        form.elements.height.value = String(bitmap.height);
        resolution.value = `${bitmap.width} × ${bitmap.height} px`;
        status.textContent += ` · ${bitmap.width} × ${bitmap.height} px`;
        bitmap.close();
      } catch (_) { status.textContent = 'Could not decode this image. Choose a PNG, JPEG, or WebP file.'; event.target.value = ''; }
    });
    document.querySelector('#wallpaper-upload-form').addEventListener('submit', uploadWallpaper);
    document.querySelector('#refresh-library').addEventListener('click', loadWallpaperLibrary);
  }

  async function loadUsers() {
    const body = document.querySelector('#user-table-body');
    if (!body) return;
    body.innerHTML = '<tr><td colspan="5">Loading accounts…</td></tr>';
    try {
      const data = await api.requestJson('/api/admin/users');
      cachedUsers = data.items || [];
      document.querySelector('#user-count').textContent = `${cachedUsers.length} account${cachedUsers.length === 1 ? '' : 's'}`;
      renderUsers();
    } catch (error) { body.innerHTML = `<tr><td colspan="5">${api.esc(error.message)}</td></tr>`; }
  }

  function renderUsers() {
    const body = document.querySelector('#user-table-body');
    const search = document.querySelector('#user-search')?.value.trim().toLowerCase() || '';
    if (!body) return;
    const users = cachedUsers.filter((user) => `${user.displayName} ${user.email}`.toLowerCase().includes(search));
    body.innerHTML = users.length ? users.map((user) => {
      const action = user.status === 'active' ? 'Suspend' : 'Restore access';
      const avatar = user.pictureUrl ? `<img class="user-avatar-small" src="${api.esc(user.pictureUrl)}" alt="" loading="lazy" />` : '<span class="user-avatar-fallback" aria-hidden="true">V</span>';
      return `<tr><td><div class="user-identity">${avatar}<span><strong>${api.esc(user.displayName)}</strong><small>${api.esc(user.email)}</small></span></div></td><td>${api.esc(api.formatDate(user.firstLoginAt, { dateStyle: 'medium' }))}</td><td>${api.esc(api.formatDate(user.lastActivityAt, { dateStyle: 'medium', timeStyle: 'short' }))}</td><td><span class="user-status status-${api.esc(user.status)}">${api.esc(user.status)}</span></td><td><button class="row-action ${user.status === 'active' ? 'is-danger' : ''}" type="button" data-user-status="${user.status === 'active' ? 'suspended' : 'active'}" data-user-id="${api.esc(user.id)}">${action}</button></td></tr>`;
    }).join('') : '<tr><td colspan="5">No signed-in users match this search.</td></tr>';
  }

  async function setUserStatus(id, status) {
    if (status === 'suspended' && !window.confirm('Suspend this user’s access? Their favorites and download history will be retained.')) return;
    try {
      await api.requestJson(`/api/admin/users/${encodeURIComponent(id)}/status`, { method: 'PUT', headers: api.mutationHeaders({ 'Content-Type': 'application/json' }), body: JSON.stringify({ status }) });
      api.showToast(status === 'active' ? 'User access restored.' : 'User access suspended.');
      await Promise.all([loadUsers(), loadDashboard()]);
    } catch (error) { api.showToast(error.message || 'User access could not be updated.'); }
  }

  function bindDashboard() {
    document.querySelector('#admin-logout').addEventListener('click', async () => {
      try { await api.requestJson('/api/admin/logout', { method: 'POST', headers: api.mutationHeaders() }); } catch (_) { /* End the local view even if the network is unavailable. */ }
      renderLogin('You have been signed out.');
    });
    document.querySelectorAll('[data-admin-tab]').forEach((button) => button.addEventListener('click', () => {
      document.querySelectorAll('[data-admin-tab]').forEach((tab) => { const active = tab === button; tab.classList.toggle('is-active', active); tab.setAttribute('aria-selected', String(active)); });
      document.querySelectorAll('[data-admin-view]').forEach((view) => { view.hidden = view.dataset.adminView !== button.dataset.adminTab; });
      if (button.dataset.adminTab === 'users') loadUsers();
      if (button.dataset.adminTab === 'wallpapers') loadWallpaperLibrary();
    }));
    bindUpload();
    document.querySelector('#library-list').addEventListener('click', (event) => {
      const preview = event.target.closest('[data-preview-wallpaper]');
      if (preview) { window.open(`/preview/${encodeURIComponent(preview.dataset.previewWallpaper)}`, '_blank', 'noopener,noreferrer'); return; }
      const hero = event.target.closest('[data-set-hero]');
      if (hero) { setHero(hero.dataset.setHero); return; }
      const edit = event.target.closest('[data-edit-wallpaper]');
      if (edit) { editWallpaper(edit.dataset.editWallpaper); return; }
      const state = event.target.closest('[data-wallpaper-state]');
      if (state) changeWallpaperState(state.dataset.wallpaperId, state.dataset.wallpaperState);
    });
    document.querySelector('#edit-dialog-close').addEventListener('click', () => document.querySelector('#edit-wallpaper-dialog').close());
    document.querySelector('#edit-wallpaper-dialog').addEventListener('click', (event) => { if (event.target === event.currentTarget) event.currentTarget.close(); });
    document.querySelector('#edit-wallpaper-form').addEventListener('submit', async (event) => {
      event.preventDefault();
      const form = event.currentTarget;
      const id = form.elements.id.value;
      const error = document.querySelector('#edit-error'); error.textContent = '';
      const button = form.querySelector('button[type="submit"]'); button.disabled = true;
      const body = { title: form.elements.title.value, category: form.elements.category.value, tags: form.elements.tags.value, description: form.elements.description.value };
      try {
        await api.requestJson(`/api/admin/wallpapers/${encodeURIComponent(id)}`, { method: 'PUT', headers: api.mutationHeaders({ 'Content-Type': 'application/json' }), body: JSON.stringify(body) });
        document.querySelector('#edit-wallpaper-dialog').close();
        api.showToast('Wallpaper details saved.');
        await Promise.all([loadWallpaperLibrary(), loadDashboard()]);
      } catch (err) { error.textContent = err.message; }
      finally { button.disabled = false; }
    });
    document.querySelector('#user-search').addEventListener('input', renderUsers);
    document.querySelector('#user-table-body').addEventListener('click', (event) => {
      const button = event.target.closest('[data-user-status]');
      if (button) setUserStatus(button.dataset.userId, button.dataset.userStatus);
    });
  }

  async function bootAdmin() {
    try {
      const session = await api.requestJson('/api/admin/me');
      if (session.authenticated) renderDashboard(); else renderLogin();
    } catch (_) { renderLogin('The admin service is temporarily unavailable. Please try again shortly.'); }
  }

  window.VinuAdmin = { bootAdmin };
})();
