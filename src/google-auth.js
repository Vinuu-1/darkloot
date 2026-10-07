(() => {
  const api = window.VinuApi;
  const state = { user: null, favorites: new Set(), onChange: null, tab: 'favorites', config: null, ready: false };
  const imagePath = (item) => String(item && item.imageUrl || '').startsWith('/manus-storage/') ? item.imageUrl : '';

  function guestMarkup() {
    const html = '<button class="google-fallback" type="button"><span class="google-glyph">G</span>Sign in with Google</button>';
    for (const target of document.querySelectorAll('.google-signin-slot')) target.innerHTML = html;
  }

  function renderAccount() {
    const guest = document.querySelector('#account-guest');
    const member = document.querySelector('#account-member');
    const header = document.querySelector('#google-signin-header');
    const accountOpen = document.querySelector('#account-open');
    if (!guest || !member) return;
    const signedIn = Boolean(state.user);
    guest.hidden = signedIn;
    member.hidden = !signedIn;
    header.hidden = signedIn;
    accountOpen.hidden = !signedIn;
    if (signedIn) {
      document.querySelector('#user-name').textContent = state.user.displayName || 'Wallpaper fan';
      document.querySelector('#user-email').textContent = state.user.email || '';
      const avatar = document.querySelector('#user-avatar');
      avatar.src = state.user.pictureUrl || '/logo.svg';
      avatar.alt = state.user.displayName ? `${state.user.displayName} profile` : 'Vinu wallpaperZ account';
    }
    renderUserLibrary();
    if (typeof state.onChange === 'function') state.onChange();
  }

  function openDialog(tab = 'favorites') {
    state.tab = tab;
    const dialog = document.querySelector('#account-dialog');
    if (!dialog) return;
    if (!dialog.open) dialog.showModal();
    renderAccountTabs();
    if (state.user) loadUserLibrary();
  }

  function renderAccountTabs() {
    document.querySelectorAll('[data-user-tab]').forEach((button) => {
      const active = button.dataset.userTab === state.tab;
      button.classList.toggle('is-active', active);
      button.setAttribute('aria-selected', String(active));
    });
  }

  function renderUserLibrary(items = null, errorMessage = '') {
    const list = document.querySelector('#user-library-list');
    if (!list) return;
    if (errorMessage) { list.innerHTML = `<p class="account-empty">${api.esc(errorMessage)}</p>`; return; }
    if (!items) { list.innerHTML = '<p class="account-empty">Choose a tab to load your library.</p>'; return; }
    if (!items.length) {
      list.innerHTML = state.tab === 'favorites'
        ? '<p class="account-empty">No favorites yet. Tap the heart on a wallpaper to save it here.</p>'
        : '<p class="account-empty">Your download history will appear here.</p>';
      return;
    }
    list.innerHTML = items.map((item) => {
      const src = imagePath(item);
      const metadata = state.tab === 'history' ? api.formatDate(item.downloadedAt, { dateStyle: 'medium', timeStyle: 'short' }) : api.esc(item.category || 'Wallpaper');
      return `<article class="user-library-row"><img src="${api.esc(src)}" alt="" loading="lazy" /><div><strong>${api.esc(item.title)}</strong><span>${api.esc(item.game || item.category || '')}</span><small>${metadata}</small></div><a class="user-library-download" href="/download/${encodeURIComponent(item.id)}" data-download="${api.esc(item.id)}" download="VinuWallpaperZ-${api.esc(item.id)}-4K.jpg" aria-label="Download ${api.esc(item.title)} again">↓</a></article>`;
    }).join('');
  }

  async function loadUserLibrary() {
    if (!state.user) return;
    const list = document.querySelector('#user-library-list');
    if (list) list.innerHTML = '<p class="account-empty">Loading your library…</p>';
    try {
      const path = state.tab === 'favorites' ? '/api/user/favorites' : '/api/user/history';
      const data = await api.requestJson(path);
      if (state.tab === 'favorites') state.favorites = new Set(data.items.map((item) => item.id));
      renderUserLibrary(data.items || []);
      if (typeof state.onChange === 'function') state.onChange();
    } catch (error) {
      if (error.message.includes('session has expired') || error.message.includes('Sign in')) {
        state.user = null; state.favorites.clear(); renderAccount();
      }
      renderUserLibrary(null, error.message || 'Your library could not be loaded.');
    }
  }

  async function refreshSession() {
    try {
      const data = await api.requestJson('/api/user/me');
      state.user = data.authenticated ? data.user : null;
      state.favorites.clear();
      if (state.user) {
        const saved = await api.requestJson('/api/user/favorites');
        state.favorites = new Set(saved.items.map((item) => item.id));
      }
    } catch (_) {
      state.user = null; state.favorites.clear();
    }
    renderAccount();
  }

  function showSetupMessage(message) {
    const note = document.querySelector('#google-setup-note');
    if (note) { note.textContent = message; note.hidden = false; }
    const modal = document.querySelector('#account-dialog');
    if (modal && !modal.open) modal.showModal();
  }

  function renderGoogleButtons() {
    if (!window.google || !window.google.accounts || !window.google.accounts.id) throw new Error('Google Identity Services did not load.');
    const options = { type: 'standard', theme: 'filled_black', size: 'large', shape: 'pill', text: 'signin_with', logo_alignment: 'left', width: 250 };
    for (const target of document.querySelectorAll('.google-signin-slot')) {
      target.replaceChildren();
      window.google.accounts.id.renderButton(target, options);
    }
  }

  function loadGoogleScript() {
    return new Promise((resolve, reject) => {
      if (window.google && window.google.accounts && window.google.accounts.id) { resolve(); return; }
      const existing = document.querySelector('script[data-google-gis]');
      if (existing) { existing.addEventListener('load', resolve, { once: true }); existing.addEventListener('error', reject, { once: true }); return; }
      const script = document.createElement('script');
      script.src = 'https://accounts.google.com/gsi/client';
      script.async = true; script.defer = true; script.dataset.googleGis = 'true';
      script.onload = resolve; script.onerror = () => reject(new Error('Google sign-in could not be loaded.'));
      document.head.append(script);
    });
  }

  async function handleCredential(response) {
    try {
      await api.requestJson('/api/auth/google', {
        method: 'POST',
        headers: api.mutationHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ credential: response.credential, nonce: state.config && state.config.nonce })
      });
      await refreshSession();
      const dialog = document.querySelector('#account-dialog');
      if (dialog && dialog.open) dialog.close();
      api.showToast('Signed in. Your favorites and history are ready.');
    } catch (error) {
      showSetupMessage(error.message || 'Google sign-in could not be completed.');
      await configureGoogle();
    }
  }

  async function configureGoogle() {
    try {
      state.config = await api.requestJson('/api/auth/google/config');
      if (!state.config.configured || !state.config.clientId) {
        guestMarkup();
        document.querySelectorAll('.google-fallback').forEach((button) => button.addEventListener('click', () => showSetupMessage('Google sign-in needs a Google Web client ID and an authorized Preview origin. The site owner is setting this up.')));
        return;
      }
      await loadGoogleScript();
      window.google.accounts.id.initialize({
        client_id: state.config.clientId,
        nonce: state.config.nonce,
        callback: handleCredential,
        auto_select: false,
        cancel_on_tap_outside: true,
        use_fedcm_for_prompt: true
      });
      renderGoogleButtons();
      state.ready = true;
    } catch (error) {
      guestMarkup();
      document.querySelectorAll('.google-fallback').forEach((button) => button.addEventListener('click', () => showSetupMessage(error.message || 'Google sign-in is temporarily unavailable.')));
    }
  }

  async function toggleFavorite(id) {
    if (!state.user) {
      openDialog('favorites');
      api.showToast('Sign in with Google to save favorites.');
      return false;
    }
    const exists = state.favorites.has(id);
    try {
      const method = exists ? 'DELETE' : 'PUT';
      await api.requestJson(`/api/user/favorites/${encodeURIComponent(id)}`, { method, headers: api.mutationHeaders() });
      if (exists) state.favorites.delete(id); else state.favorites.add(id);
      renderAccount();
      return true;
    } catch (error) {
      api.showToast(error.message || 'The favorite could not be saved.');
      return false;
    }
  }

  function bindAccountControls() {
    document.querySelector('#account-open')?.addEventListener('click', () => openDialog('favorites'));
    document.querySelector('#account-close')?.addEventListener('click', () => document.querySelector('#account-dialog')?.close());
    document.querySelector('#account-dialog')?.addEventListener('click', (event) => { if (event.target === event.currentTarget) event.currentTarget.close(); });
    document.querySelectorAll('[data-user-tab]').forEach((button) => button.addEventListener('click', () => { state.tab = button.dataset.userTab; renderAccountTabs(); loadUserLibrary(); }));
    document.querySelector('#user-signout')?.addEventListener('click', async () => {
      try { await api.requestJson('/api/user/logout', { method: 'POST', headers: api.mutationHeaders() }); } catch (_) { /* Local account UI still clears if the server is unreachable. */ }
      if (window.google && window.google.accounts && window.google.accounts.id) window.google.accounts.id.disableAutoSelect();
      state.user = null; state.favorites.clear(); renderAccount();
      api.showToast('You have been signed out.');
    });
    document.querySelectorAll('.google-signin-slot').forEach((slot) => slot.addEventListener('click', (event) => {
      if (event.target.closest('.google-fallback')) return;
      if (!state.user && slot.id === 'google-signin-header' && !window.google) openDialog('favorites');
    }));
  }

  async function initUserAuth(onChange) {
    state.onChange = onChange;
    bindAccountControls();
    await Promise.all([refreshSession(), configureGoogle()]);
  }

  window.VinuAuth = {
    initUserAuth,
    isSignedIn: () => Boolean(state.user),
    isFavorite: (id) => state.favorites.has(id),
    toggleFavorite,
    openAccount: openDialog,
    refresh: refreshSession
  };
})();
