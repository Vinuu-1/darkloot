(() => {
  const SUPABASE_URL = 'https://vknbvgzyamvrekyubjnw.supabase.co';
  const SUPABASE_KEY = 'sb_publishable_rD3pBYMRul1LsO9udVuBQQ_QTh8bwiH';
  const BUCKET = 'wallpapers';

  const categories = ['Gaming', 'Cyberpunk', 'Anime', 'Cars', 'Nature', 'Dark'];

  function esc(v=''){ return String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])) }

  function adminShell(content) {
    document.body.classList.add('admin-body');
    document.body.innerHTML = `<div class="admin-shell"><header class="admin-topbar"><a class="brand" href="/"><img class="brand-mark" src="/logo.svg" alt="" /><span>Vinu <span class="brand-accent">wallpaperZ</span><small>PRIVATE CONTROL ROOM</small></span></a><a class="admin-back" href="/">← View public archive</a></header>${content}<div class="toast" id="toast"></div></div>`;
  }

  function showToast(msg){
    const t = document.querySelector('#toast');
    if(!t) return alert(msg);
    t.textContent = msg;
    t.classList.add('is-visible');
    setTimeout(()=>t.classList.remove('is-visible'), 3500);
  }

  function renderUploader(){
    document.title = 'Vinu wallpaperZ — Admin Upload';
    adminShell(`
      <main class="admin-dashboard">
        <div class="dashboard-heading"><div><p class="section-kicker">CONTROL ROOM / VWZ — SUPABASE CONNECTED</p><h1>Upload <span>directly.</span></h1><p class="admin-intro">No login needed. This uploads straight to Supabase Storage + Database.</p></div></div>

        <section class="admin-panel upload-panel glass-panel" style="max-width:720px;">
          <div class="panel-heading"><span class="panel-number">01</span><div><h2>Upload a wallpaper</h2><p>Image will be saved to bucket: ${BUCKET}</p></div></div>

          <form class="admin-form upload-form" id="wallpaper-upload-form">
            <label>Wallpaper title<input name="title" required maxlength="160" placeholder="e.g. Midnight Circuit" /></label>
            <div class="form-row">
              <label>Category<select name="category" required><option value="">Choose a category</option>${categories.map(n=>`<option>${n}</option>`).join('')}</select></label>
              <label>Tags <span class="optional-label">COMMA-SEPARATED</span><input name="tags" maxlength="500" placeholder="neon, skyline, action" /></label>
            </div>
            <label>Description <span class="optional-label">OPTIONAL</span><textarea name="description" rows="3" maxlength="500" placeholder="A short note"></textarea></label>

            <label class="file-picker"><span class="file-picker-title">Wallpaper image <span>PNG, JPEG or WebP · Max 12 MB</span></span>
              <input id="wallpaper-file" name="file" type="file" accept="image/png,image/jpeg,image/webp" required />
              <span class="file-button">Choose image <b>＋</b></span>
            </label>
            <div class="file-status" id="file-status">No image selected</div>
            <label class="resolution-field">Detected resolution<input id="resolution-display" value="Choose an image" readonly /></label>
            <input type="hidden" name="width" /><input type="hidden" name="height" />

            <button class="button button-primary upload-submit" type="submit">Upload to Supabase <span>↑</span></button>
            <div class="form-error" id="upload-error" role="alert" style="color:#ff6b6b;margin-top:12px;"></div>
            <p class="secure-note">Connected to: ${SUPABASE_URL}</p>
          </form>
        </section>
        <section class="admin-panel library-panel glass-panel" style="max-width:720px;margin-top:20px;">
          <div class="panel-heading"><span class="panel-number">02</span><div><h2>Recent uploads</h2><p id="library-count">Loading...</p></div><button class="refresh-button" id="refresh-library" type="button">↻</button></div>
          <div class="library-list" id="library-list"></div>
        </section>
      </main>
    `);
    bindUpload();
    loadLibrary();
  }

  async function loadLibrary(){
    const list = document.querySelector('#library-list');
    const count = document.querySelector('#library-count');
    try {
      const res = await fetch(`${SUPABASE_URL}/rest/v1/wallpapers?select=*&order=created_at.desc&limit=20`, {
        headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` }
      });
      const data = await res.json();
      if(!Array.isArray(data)) throw new Error(JSON.stringify(data));
      count.textContent = `${data.length} wallpapers found`;
      list.innerHTML = data.length? data.map(i=>`<article class="library-item"><img src="${esc(i.image_url || i.imageUrl || '')}" alt="" style="width:60px;height:40px;object-fit:cover;border-radius:6px;" /><div class="library-item-copy"><strong>${esc(i.title)}</strong><span>${esc(i.category)} · ${esc((i.tags||[]).join? i.tags.join(', ') : i.tags || '')}</span><small>${esc(i.width||'') } × ${esc(i.height||'')} · ${esc(i.status||'published')}</small></div></article>`).join('') : '<p>No wallpapers yet</p>';
    } catch(e){
      count.textContent = 'Could not load';
      list.innerHTML = `<p style="color:#ff6b6b">${esc(e.message)}</p>`;
    }
  }

  function bindUpload(){
    const input = document.querySelector('#wallpaper-file');
    const form = document.querySelector('#wallpaper-upload-form');
    input.addEventListener('change', async (e)=>{
      const file = e.target.files[0];
      const status = document.querySelector('#file-status');
      const resDisplay = document.querySelector('#resolution-display');
      if(!file){ status.textContent='No image selected'; return; }
      status.textContent = `${file.name} · ${(file.size/1024/1024).toFixed(2)} MB`;
      try{
        const bmp = await createImageBitmap(file);
        form.elements.width.value = bmp.width;
        form.elements.height.value = bmp.height;
        resDisplay.value = `${bmp.width} × ${bmp.height} px`;
        status.textContent += ` · ${bmp.width} × ${bmp.height}`;
        bmp.close();
      }catch(_){ status.textContent = 'Could not read image'; }
    });

    document.querySelector('#refresh-library').addEventListener('click', loadLibrary);

    form.addEventListener('submit', async (ev)=>{
      ev.preventDefault();
      const btn = form.querySelector('.upload-submit');
      const errBox = document.querySelector('#upload-error');
      errBox.textContent=''; btn.disabled=true; btn.textContent='Uploading...';

      try{
        const file = form.elements.file.files[0];
        if(!file) throw new Error('Please choose a file');

        const ext = file.name.split('.').pop();
        const filePath = `${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;

        // 1. Upload to Storage
        const uploadRes = await fetch(`${SUPABASE_URL}/storage/v1/object/${BUCKET}/${filePath}`, {
          method: 'POST',
          headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}`, 'x-upsert': 'false' },
          body: file
        });
        if(!uploadRes.ok){
          const t = await uploadRes.text();
          throw new Error('Storage upload failed: ' + t);
        }

        const publicUrl = `${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${filePath}`;

        // 2. Insert into DB
        const payload = {
          title: form.elements.title.value.trim(),
          category: form.elements.category.value,
          tags: form.elements.tags.value.split(',').map(s=>s.trim()).filter(Boolean),
          description: form.elements.description.value.trim(),
          image_url: publicUrl,
          imageUrl: publicUrl,
          width: parseInt(form.elements.width.value) || null,
          height: parseInt(form.elements.height.value) || null,
          status: 'published',
          game: form.elements.category.value
        };

        const dbRes = await fetch(`${SUPABASE_URL}/rest/v1/wallpapers`, {
          method: 'POST',
          headers: {
            'apikey': SUPABASE_KEY,
            'Authorization': `Bearer ${SUPABASE_KEY}`,
            'Content-Type': 'application/json',
            'Prefer': 'return=representation'
          },
          body: JSON.stringify(payload)
        });
        if(!dbRes.ok){
          const t = await dbRes.text();
          throw new Error('DB insert failed: ' + t);
        }

        showToast('Upload successful! Wallpaper is now LIVE!');
        form.reset();
        document.querySelector('#file-status').textContent='No image selected';
        document.querySelector('#resolution-display').value='Choose an image';
        loadLibrary();

      }catch(err){
        errBox.textContent = err.message;
        showToast(err.message);
      }finally{
        btn.disabled=false; btn.textContent='Upload to Supabase ↑';
      }
    });
  }

  window.VinuAdmin = { bootAdmin: renderUploader };
})();
