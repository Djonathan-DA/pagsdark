// ===== Helpers =====
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const MAX_THUMBS = 48;

async function api(method, url, body, isForm) {
  const opts = { method };
  if (body && isForm) opts.body = body;
  else if (body) { opts.headers = { 'Content-Type': 'application/json' }; opts.body = JSON.stringify(body); }
  const res = await fetch(url, opts);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Erro ${res.status}`);
  return data;
}
function toast(msg, type = '') {
  const t = document.createElement('div');
  t.className = `toast ${type}`;
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 4000);
}
function platIcon(p) { return { youtube: '▶️', instagram: '📷', facebook: '📘', tiktok: '🎵' }[p] || '•'; }

const state = {
  selMold: null,
  selSources: new Set(),
  selLib: new Set(),
  selAccounts: new Set(),
  workspaces: [],
  molds: [],
  sourcesArr: [],
  focusX: 50, focusY: 50, sampleIdx: 0,
  activeWs: null,
  settings: null,
};
let PLATFORMS = [];

// ===== Tabs =====
$$('nav button').forEach((b) => b.onclick = () => {
  $$('nav button').forEach((x) => x.classList.toggle('active', x === b));
  $$('.tab').forEach((t) => t.classList.toggle('active', t.id === `tab-${b.dataset.tab}`));
  if (b.dataset.title) $('#pageTitle').textContent = b.dataset.title;
  if (b.dataset.sub) $('#pageSub').textContent = b.dataset.sub;
  if (b.dataset.tab === 'contas') loadContas();
  if (b.dataset.tab === 'agendar') refreshScheduleTab();
});

// ===================== EDITOR =====================
async function loadMolds() {
  state.molds = await api('GET', '/api/editor/molds');
  const box = $('#moldList');
  box.innerHTML = '';
  state.molds.forEach((m) => {
    const d = document.createElement('div');
    d.className = 'thumb' + (state.selMold === m.id ? ' sel' : '');
    d.innerHTML = `<img src="/mold-file/${m.id}" /><span class="tag">${m.canvas_w}×${m.canvas_h}</span>
      <span class="pick">✓</span><span class="name">${m.name}</span>`;
    d.onclick = () => { state.selMold = state.selMold === m.id ? null : m.id; loadMolds(); refreshPreview(); };
    box.appendChild(d);
  });
  refreshPreview();
}
$('#moldUpload').onclick = async () => {
  const f = $('#moldFile').files[0];
  if (!f) return toast('Escolha um PNG.', 'err');
  const fd = new FormData(); fd.append('mold', f);
  try { const m = await api('POST', '/api/editor/molds', fd, true); state.selMold = m.id; await loadMolds(); toast('Molde adicionado: área detectada ' + m.area_w + '×' + m.area_h, 'ok'); }
  catch (e) { toast(e.message, 'err'); }
};

async function loadSources() {
  state.sourcesArr = await api('GET', '/api/editor/sources');
  const src = state.sourcesArr;
  $('#sourceCount').textContent = src.length
    ? `${src.length} vídeo(s) carregado(s). Selecione alguns ou deixe sem seleção para usar todos.`
    : 'Nenhum vídeo carregado.';
  const box = $('#sourceList');
  box.innerHTML = '';
  src.slice(0, MAX_THUMBS).forEach((m) => box.appendChild(mediaThumb(m, state.selSources, () => { loadSources(); })));
  if (src.length > MAX_THUMBS) {
    const more = document.createElement('p'); more.className = 'muted';
    more.textContent = `+${src.length - MAX_THUMBS} vídeos não exibidos (incluídos se nada estiver selecionado).`;
    box.appendChild(more);
  }
  refreshPreview();
}
function mediaThumb(m, selSet, reload) {
  const d = document.createElement('div');
  d.className = 'thumb' + (selSet.has(m.id) ? ' sel' : '');
  d.innerHTML = `<video src="/preview/${m.id}#t=0.5" muted preload="metadata"></video>
    <span class="pick">✓</span><span class="name">${m.label || ('#' + m.id)}</span>`;
  d.onclick = () => { selSet.has(m.id) ? selSet.delete(m.id) : selSet.add(m.id); reload(); };
  return d;
}
$('#videoUpload').onclick = async () => {
  const files = $('#videoFiles').files;
  if (!files.length) return toast('Escolha vídeos.', 'err');
  const fd = new FormData(); [...files].forEach((f) => fd.append('videos', f));
  try { const r = await api('POST', '/api/editor/sources/upload', fd, true); toast(`${r.length} vídeo(s) enviados`, 'ok'); await loadSources(); }
  catch (e) { toast(e.message, 'err'); }
};
$('#folderImport').onclick = async () => {
  const folder = $('#folderPath').value.trim();
  if (!folder) return toast('Cole o caminho da pasta.', 'err');
  try { const r = await api('POST', '/api/editor/sources/import-folder', { folder }); toast(`${r.imported} vídeo(s) importados`, 'ok'); await loadSources(); }
  catch (e) { toast(e.message, 'err'); }
};

// ---- Preview interativo (canvas) ----
const pv = { moldId: null, sampleId: null, img: null, video: null, imgReady: false, vidReady: false };
function currentMold() { return state.molds.find((m) => m.id === state.selMold) || null; }
function currentSample() {
  const list = state.selSources.size ? state.sourcesArr.filter((s) => state.selSources.has(s.id)) : state.sourcesArr;
  if (!list.length) return null;
  return list[state.sampleIdx % list.length];
}
function refreshPreview() {
  const canvas = $('#previewCanvas'); if (!canvas) return;
  const hint = $('#previewHint');
  const mold = currentMold(), sample = currentSample();
  if (!mold || !sample) {
    if (hint) hint.style.display = '';
    canvas.getContext('2d').clearRect(0, 0, canvas.width, canvas.height);
    return;
  }
  if (hint) hint.style.display = 'none';
  const W = 240, s = W / mold.canvas_w;
  canvas.width = W; canvas.height = Math.round(mold.canvas_h * s);
  if (pv.moldId !== mold.id) {
    pv.moldId = mold.id; pv.imgReady = false; pv.img = new Image();
    pv.img.onload = () => { pv.imgReady = true; drawPreview(); };
    pv.img.src = '/mold-file/' + mold.id;
  }
  if (pv.sampleId !== sample.id) {
    pv.sampleId = sample.id; pv.vidReady = false;
    if (!pv.video) { pv.video = document.createElement('video'); pv.video.muted = true; pv.video.playsInline = true; }
    pv.video.onloadeddata = () => { try { pv.video.currentTime = Math.min(1, (pv.video.duration || 2) / 2); } catch (e) {} };
    pv.video.onseeked = () => { pv.vidReady = true; drawPreview(); };
    pv.video.src = '/preview/' + sample.id; pv.video.load();
  }
  drawPreview();
}
function drawPreview() {
  const canvas = $('#previewCanvas'); if (!canvas) return;
  const mold = currentMold(); if (!mold) return;
  const ctx = canvas.getContext('2d');
  const s = canvas.width / mold.canvas_w;
  const ax = mold.area_x * s, ay = mold.area_y * s, aw = mold.area_w * s, ah = mold.area_h * s;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#000'; ctx.fillRect(ax, ay, aw, ah);
  if (pv.vidReady && pv.video.videoWidth) {
    const vw = pv.video.videoWidth, vh = pv.video.videoHeight;
    const cover = Math.max(aw / vw, ah / vh), dw = vw * cover, dh = vh * cover;
    const offX = (dw - aw) * (state.focusX / 100), offY = (dh - ah) * (state.focusY / 100);
    ctx.save(); ctx.beginPath(); ctx.rect(ax, ay, aw, ah); ctx.clip();
    ctx.drawImage(pv.video, ax - offX, ay - offY, dw, dh);
    ctx.restore();
  }
  if (pv.imgReady) ctx.drawImage(pv.img, 0, 0, canvas.width, canvas.height);
}
$('#focusX').oninput = (e) => { state.focusX = +e.target.value; drawPreview(); };
$('#focusY').oninput = (e) => { state.focusY = +e.target.value; drawPreview(); };
$('#sampleNext').onclick = () => { state.sampleIdx++; refreshPreview(); };
$('#centerFocus').onclick = () => { state.focusX = 50; state.focusY = 50; $('#focusX').value = 50; $('#focusY').value = 50; drawPreview(); };

$('#renderBtn').onclick = async () => {
  if (!state.selMold) return toast('Selecione um molde.', 'err');
  try {
    const { jobId } = await api('POST', '/api/editor/render', {
      moldId: state.selMold, sourceIds: [...state.selSources],
      focusX: state.focusX, focusY: state.focusY,
    });
    $('#renderProgress').classList.remove('hide');
    $('#downloadZip').href = `/api/editor/job/${jobId}/zip`;
    pollJob(jobId);
  } catch (e) { toast(e.message, 'err'); }
};
async function pollJob(jobId) {
  const j = await api('GET', `/api/editor/job/${jobId}`);
  const pct = j.total ? Math.round((j.done / j.total) * 100) : 0;
  $('#renderBar').style.width = pct + '%';
  $('#renderPct').textContent = pct + '%';
  const failed = j.items.filter((i) => i.status === 'failed').length;
  $('#renderLabel').textContent = j.status === 'done'
    ? `Concluído: ${j.done}/${j.total}${failed ? ` (${failed} com erro)` : ''}`
    : `Renderizando… ${j.done}/${j.total}`;
  if (j.status !== 'done') setTimeout(() => pollJob(jobId), 1500);
  else toast('Renderização concluída! Vídeos na biblioteca.', 'ok');
}
$('#goSchedule').onclick = () => $$('nav button').find((b) => b.dataset.tab === 'agendar').click();

// ===================== CONTAS (guiado) =====================
const GUIDES = {
  youtube: {
    icon: '▶️', title: 'YouTube Shorts', fields: [['youtubeClientId', 'Client ID'], ['youtubeClientSecret', 'Client Secret']],
    steps: [
      'Acesse o <b>Google Cloud Console</b> (console.cloud.google.com) e crie um projeto.',
      'Ative a API <b>YouTube Data API v3</b>.',
      'Tela de consentimento OAuth → modo <b>Testing</b> → adicione seu e-mail como tester.',
      'Em Credenciais, crie um <b>OAuth Client ID</b> (tipo <i>Web application</i>) e cole o Redirect URI abaixo.',
      'Copie o Client ID e o Client Secret nos campos abaixo e clique em Salvar.',
    ],
  },
  instagram: {
    icon: '📷', title: 'Instagram Reels', fields: [['metaAppId', 'Meta App ID'], ['metaAppSecret', 'Meta App Secret']],
    steps: [
      'Sua conta IG precisa ser <b>Profissional</b> (Business/Creator) e ligada a uma <b>Página do Facebook</b>.',
      'Em <b>developers.facebook.com</b>, crie um app do tipo <i>Business</i>.',
      'Adicione os produtos <b>Instagram Graph API</b> e <b>Facebook Login</b>.',
      'No Facebook Login, cole o Redirect URI abaixo em "Valid OAuth Redirect URIs".',
      'Copie o App ID e o App Secret abaixo e salve. <b>(As mesmas credenciais valem para o Facebook.)</b>',
    ],
  },
  facebook: {
    icon: '📘', title: 'Facebook (Página)', fields: [['metaAppId', 'Meta App ID'], ['metaAppSecret', 'Meta App Secret']],
    steps: [
      'Use o <b>mesmo app do Meta</b> criado para o Instagram (mesmas credenciais).',
      'Garanta as permissões <b>pages_manage_posts</b> e <b>publish_video</b>.',
      'No Facebook Login, cole o Redirect URI abaixo.',
      'Você precisa <b>administrar uma Página</b> — o vídeo é publicado nela.',
      'Confirme App ID e Secret abaixo e salve.',
    ],
  },
  tiktok: {
    icon: '🎵', title: 'TikTok', fields: [['tiktokClientKey', 'Client Key'], ['tiktokClientSecret', 'Client Secret']],
    steps: [
      'Em <b>developers.tiktok.com</b>, crie um app.',
      'Adicione <b>Login Kit</b> e <b>Content Posting API</b>.',
      'Cole o Redirect URI abaixo nas configurações do app.',
      'Copie o Client Key e o Client Secret abaixo e salve.',
      '⚠️ Enquanto o app não for auditado, o TikTok só aceita posts <b>privados/rascunho</b>.',
    ],
  },
};
function credVal(k) {
  const s = state.settings; if (!s) return '';
  return ({
    youtubeClientId: s.youtube.clientId, youtubeClientSecret: s.youtube.clientSecret,
    metaAppId: s.meta.appId, metaAppSecret: s.meta.appSecret,
    tiktokClientKey: s.tiktok.clientKey, tiktokClientSecret: s.tiktok.clientSecret,
  })[k] || '';
}
async function loadContas() {
  PLATFORMS = await api('GET', '/platforms');
  state.workspaces = await api('GET', '/workspaces');
  state.settings = await api('GET', '/settings');
  if (!state.activeWs && state.workspaces.length) state.activeWs = state.workspaces[0].id;
  renderWorkspaces();
  renderGuides();
}
function renderWorkspaces() {
  const box = $('#wsList');
  if (!state.workspaces.length) { box.innerHTML = '<p class="muted">Nenhum workspace ainda. Crie o primeiro acima.</p>'; return; }
  box.innerHTML = '';
  state.workspaces.forEach((w) => {
    const d = document.createElement('div');
    d.className = 'ws-item' + (w.id === state.activeWs ? ' active' : '');
    d.innerHTML = `<span>${w.id === state.activeWs ? '<span class="star">★</span> ' : ''}<b>${w.name}</b>
      <span class="muted">· ${w.accounts.length} conta(s)</span></span>
      <button class="btn sm ghost" onclick="event.stopPropagation();delWorkspace(${w.id})">Excluir</button>`;
    d.onclick = () => { state.activeWs = w.id; renderWorkspaces(); renderGuides(); };
    box.appendChild(d);
  });
}
function renderGuides() {
  const ws = state.workspaces.find((w) => w.id === state.activeWs);
  $('#activeWsName').textContent = ws ? ws.name : '—';
  const box = $('#platformGuides');
  if (!ws) { $('#guidesHint').style.display = ''; box.innerHTML = ''; return; }
  $('#guidesHint').style.display = 'none';
  box.innerHTML = '';
  PLATFORMS.forEach((p) => {
    const g = GUIDES[p.name]; if (!g) return;
    const connected = ws.accounts.filter((a) => a.platform === p.name);
    const redir = (state.settings.redirectUris || {})[p.name] || '';
    const fields = g.fields.map(([k, lbl]) =>
      `<div><label>${lbl}</label><input data-key="${k}" value="${credVal(k)}" placeholder="(vazio)" /></div>`).join('');
    const steps = g.steps.map((s) => `<li>${s}</li>`).join('');
    const accs = connected.length
      ? connected.map((a) => `<span class="chip ok">✓ ${a.display_name}
          <button class="btn sm ghost" style="padding:0 6px" onclick="delAccount(${a.id})">✕</button></span>`).join(' ')
      : '<span class="muted">Nenhuma conta conectada ainda.</span>';
    const el = document.createElement('details');
    el.className = 'guide'; el.dataset.platform = p.name;
    el.innerHTML = `
      <summary><span class="gi">${g.icon}</span> ${g.title}
        ${p.configured ? '<span class="chip ok">credenciais ok</span>' : '<span class="chip warn">configure</span>'}
        <span class="chev">▾</span></summary>
      <div class="body">
        <ol>${steps}</ol>
        <label>Redirect URI — cole no painel da rede</label>
        <div class="copy" onclick="copyText('${redir}', this)"><span class="t">${redir}</span> <span>⧉ copiar</span></div>
        <div class="grid" style="grid-template-columns:1fr 1fr; margin-top:12px">${fields}</div>
        <div class="row" style="margin-top:12px">
          <button class="btn sm" onclick="saveCred('${p.name}', this)">Salvar credenciais</button>
          <button class="btn sm ghost" onclick="connectOAuth(${ws.id},'${p.name}')" ${p.configured ? '' : 'disabled title=\"Salve as credenciais primeiro\"'}>Conectar conta</button>
        </div>
        <div class="row" style="margin-top:14px">${accs}</div>
      </div>`;
    box.appendChild(el);
  });
}
$('#wsCreate').onclick = async () => {
  const name = $('#wsName').value.trim();
  if (!name) return toast('Informe um nome.', 'err');
  const w = await api('POST', '/workspaces', { name });
  $('#wsName').value = ''; state.activeWs = w.id; loadContas();
};
window.delWorkspace = async (id) => { if (confirm('Excluir workspace e suas contas?')) { await api('DELETE', '/workspaces/' + id); if (state.activeWs === id) state.activeWs = null; loadContas(); } };
window.delAccount = async (id) => { await api('DELETE', '/accounts/' + id); loadContas(); };
window.saveCred = async (platform, btn) => {
  const card = btn.closest('.guide');
  const body = {};
  $$('input[data-key]', card).forEach((inp) => { body[inp.dataset.key] = inp.value; });
  await api('POST', '/settings', body);
  toast('Credenciais salvas.', 'ok');
  state.settings = await api('GET', '/settings');
  PLATFORMS = await api('GET', '/platforms');
  renderGuides();
};
window.connectOAuth = (wsId, platform) => {
  window.open(`/oauth/${platform}/connect?workspaceId=${wsId}`, '_blank', 'width=620,height=760');
};
window.copyText = (t, el) => {
  navigator.clipboard.writeText(t).then(() => {
    const tag = el.querySelector('span:last-child');
    if (tag) { tag.textContent = '✓ copiado'; setTimeout(() => tag.textContent = '⧉ copiar', 1500); }
  });
};
window.addEventListener('message', (e) => { if (e.data === 'oauth-done') { toast('Conta conectada!', 'ok'); loadContas(); } });

// ===================== AGENDAR =====================
async function refreshScheduleTab() {
  state.workspaces = await api('GET', '/workspaces');
  const sel = $('#campWorkspace');
  sel.innerHTML = state.workspaces.map((w) => `<option value="${w.id}">${w.name}</option>`).join('');
  sel.onchange = loadCampAccounts;
  if (!$('#campStart').value) $('#campStart').value = new Date().toISOString().slice(0, 10);
  renderSlots(Number($('#campPerDay').value) || 10);
  await loadCampAccounts();
  await loadLibrary();
  await loadCampaigns();
  await loadPosts();
}
async function loadCampAccounts() {
  const wsId = Number($('#campWorkspace').value);
  if (!wsId) { $('#campAccounts').innerHTML = '<span class="muted">Crie um workspace e vincule contas na aba Contas.</span>'; return; }
  const accs = await api('GET', '/accounts?workspaceId=' + wsId);
  state.selAccounts.clear();
  $('#campAccounts').innerHTML = accs.length ? '' : '<span class="muted">Sem contas neste workspace.</span>';
  accs.forEach((a) => {
    const l = document.createElement('label'); l.className = 'chip'; l.style.cursor = 'pointer';
    l.innerHTML = `<input type="checkbox" /> ${platIcon(a.platform)} ${a.display_name}`;
    l.querySelector('input').onchange = (e) => { e.target.checked ? state.selAccounts.add(a.id) : state.selAccounts.delete(a.id); updateSummary(); };
    $('#campAccounts').appendChild(l);
  });
}
function renderSlots(n) {
  const box = $('#slotInputs');
  const prev = $$('#slotInputs input').map((i) => i.value);
  box.innerHTML = '';
  for (let i = 0; i < n; i++) {
    const inp = document.createElement('input'); inp.type = 'time'; inp.value = prev[i] || '';
    box.appendChild(inp);
  }
}
$('#campPerDay').oninput = () => { renderSlots(Number($('#campPerDay').value) || 1); updateSummary(); };
$('#genSlots').onclick = () => {
  const n = Number($('#campPerDay').value) || 1;
  const start = 8 * 60, end = 22 * 60, step = n > 1 ? (end - start) / (n - 1) : 0;
  $$('#slotInputs input').forEach((inp, i) => {
    const m = Math.round(start + step * i);
    inp.value = `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
  });
};
async function loadLibrary() {
  const lib = await api('GET', '/api/editor/library');
  const box = $('#libList'); box.innerHTML = '';
  if (!lib.length) { box.innerHTML = '<p class="muted">Nenhum vídeo renderizado ainda. Use o Editor primeiro.</p>'; updateSummary(); return; }
  lib.slice(0, MAX_THUMBS).forEach((m) => box.appendChild(mediaThumb(m, state.selLib, () => { loadLibrary(); })));
  if (lib.length > MAX_THUMBS) {
    const p = document.createElement('p'); p.className = 'muted';
    p.textContent = `+${lib.length - MAX_THUMBS} não exibidos (incluídos se nada for selecionado).`;
    box.appendChild(p);
  }
  box._all = lib.map((m) => m.id);
  updateSummary();
}
function updateSummary() {
  const perDay = Number($('#campPerDay').value) || 1;
  const all = ($('#libList')._all || []);
  const vids = state.selLib.size || all.length;
  const accs = state.selAccounts.size;
  const days = Math.ceil(vids / perDay);
  $('#campSummary').textContent = vids && accs
    ? `${vids} vídeo(s) × ${accs} conta(s) = ${vids * accs} posts, ${perDay}/dia → ~${days} dia(s).`
    : 'Selecione contas e vídeos.';
}
$('#createCampaign').onclick = async () => {
  const wsId = Number($('#campWorkspace').value);
  const accountIds = [...state.selAccounts];
  if (!wsId) return toast('Escolha um workspace.', 'err');
  if (!accountIds.length) return toast('Selecione ao menos uma conta.', 'err');
  const all = ($('#libList')._all || []);
  const mediaIds = state.selLib.size ? [...state.selLib] : all;
  if (!mediaIds.length) return toast('Sem vídeos na biblioteca.', 'err');
  const timeSlots = $$('#slotInputs input').map((i) => i.value).filter(Boolean);
  try {
    const r = await api('POST', '/api/schedule/campaigns', {
      workspaceId: wsId, name: $('#campName').value || 'Campanha',
      startDate: $('#campStart').value, postsPerDay: Number($('#campPerDay').value) || 10,
      timeSlots, accountIds, mediaIds, fanout: $('#campFanout').value,
      captionTemplate: $('#campCaption').value,
    });
    toast(`Campanha criada: ${r.posts} posts em ~${r.days} dias.`, 'ok');
    state.selLib.clear();
    loadCampaigns(); loadPosts();
  } catch (e) { toast(e.message, 'err'); }
};
async function loadCampaigns() {
  const camps = await api('GET', '/api/schedule/campaigns');
  const box = $('#campList');
  if (!camps.length) { box.innerHTML = '<p class="muted">Nenhuma campanha ainda.</p>'; return; }
  box.innerHTML = camps.map((c) => {
    const k = c.counts || {};
    const total = k.total || 0, posted = k.posted || 0;
    const pct = total ? Math.round((posted / total) * 100) : 0;
    return `<div class="card" style="background:var(--bg2)">
      <div class="row between"><b>${c.name}</b>
        <span class="muted">início ${c.start_date} · ${c.posts_per_day}/dia · ${c.time_slots.join(' ')}</span></div>
      <div class="bar"><div style="width:${pct}%"></div></div>
      <div class="row between">
        <span class="muted">${posted}/${total} postados${k.failed ? ` · ${k.failed} com erro` : ''}${k.scheduled ? ` · ${k.scheduled} agendados` : ''}</span>
        <button class="btn sm ghost" onclick="cancelCampaign(${c.id})">Pausar/cancelar</button>
      </div></div>`;
  }).join('');
}
window.cancelCampaign = async (id) => { if (confirm('Cancelar os posts ainda agendados desta campanha?')) { await api('POST', `/api/schedule/campaigns/${id}/cancel`); loadCampaigns(); loadPosts(); } };
async function loadPosts() {
  const posts = await api('GET', '/api/schedule/posts');
  const box = $('#postsTable');
  if (!posts.length) { box.innerHTML = '<p class="muted">Nenhum post agendado.</p>'; return; }
  const rows = posts.slice(0, 100).map((p) => `<tr>
    <td>${p.scheduled_at.replace('T', ' ').slice(0, 16)}</td>
    <td>${platIcon(p.platform)} ${p.account_name || p.platform}</td>
    <td class="status-${p.status}">${p.status}</td>
    <td class="muted">${(p.caption || '').slice(0, 40)}</td>
    <td>${p.status === 'scheduled' ? `<button class="btn sm ghost" onclick="cancelPost(${p.id})">✕</button>` : ''}</td>
  </tr>`).join('');
  box.innerHTML = `<table><thead><tr><th>Quando</th><th>Conta</th><th>Status</th><th>Legenda</th><th></th></tr></thead><tbody>${rows}</tbody></table>
    ${posts.length > 100 ? `<p class="muted">+${posts.length - 100} posts…</p>` : ''}`;
}
window.cancelPost = async (id) => { await api('POST', `/api/schedule/posts/${id}/cancel`); loadPosts(); };

// ===== Init =====
loadMolds(); loadSources();
