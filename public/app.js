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
const state = {
  selMold: null,
  selSources: new Set(),
  selLib: new Set(),
  selAccounts: new Set(),
  workspaces: [],
};

// ===== Tabs =====
$$('nav button').forEach((b) => b.onclick = () => {
  $$('nav button').forEach((x) => x.classList.toggle('active', x === b));
  $$('.tab').forEach((t) => t.classList.toggle('active', t.id === `tab-${b.dataset.tab}`));
  if (b.dataset.tab === 'contas') { loadWorkspaces(); loadSettings(); }
  if (b.dataset.tab === 'agendar') { refreshScheduleTab(); }
});

// ===================== EDITOR =====================
async function loadMolds() {
  const molds = await api('GET', '/api/editor/molds');
  const box = $('#moldList');
  box.innerHTML = '';
  molds.forEach((m) => {
    const d = document.createElement('div');
    d.className = 'thumb' + (state.selMold === m.id ? ' sel' : '');
    d.innerHTML = `<img src="/mold-file/${m.id}" /><span class="tag">${m.canvas_w}×${m.canvas_h}</span>
      <span class="pick">✓</span><span class="name">${m.name}</span>`;
    d.onclick = () => { state.selMold = state.selMold === m.id ? null : m.id; loadMolds(); };
    box.appendChild(d);
  });
}
$('#moldUpload').onclick = async () => {
  const f = $('#moldFile').files[0];
  if (!f) return toast('Escolha um PNG.', 'err');
  const fd = new FormData(); fd.append('mold', f);
  try { const m = await api('POST', '/api/editor/molds', fd, true); state.selMold = m.id; await loadMolds(); toast('Molde adicionado: área detectada ' + m.area_w + '×' + m.area_h, 'ok'); }
  catch (e) { toast(e.message, 'err'); }
};

async function loadSources() {
  const src = await api('GET', '/api/editor/sources');
  $('#sourceCount').textContent = src.length
    ? `${src.length} vídeo(s) carregado(s). Selecione alguns ou deixe sem seleção para usar todos.`
    : 'Nenhum vídeo carregado.';
  const box = $('#sourceList');
  box.innerHTML = '';
  src.slice(0, MAX_THUMBS).forEach((m) => box.appendChild(mediaThumb(m, state.selSources, loadSources)));
  if (src.length > MAX_THUMBS) {
    const more = document.createElement('p'); more.className = 'muted';
    more.textContent = `+${src.length - MAX_THUMBS} vídeos não exibidos (serão incluídos se nada estiver selecionado).`;
    box.appendChild(more);
  }
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
$('#renderBtn').onclick = async () => {
  if (!state.selMold) return toast('Selecione um molde.', 'err');
  try {
    const { jobId } = await api('POST', '/api/editor/render', { moldId: state.selMold, sourceIds: [...state.selSources] });
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

// ===================== CONTAS =====================
let PLATFORMS = [];
async function loadWorkspaces() {
  PLATFORMS = await api('GET', '/platforms');
  state.workspaces = await api('GET', '/workspaces');
  const box = $('#wsList');
  box.innerHTML = '';
  if (!state.workspaces.length) { box.innerHTML = '<p class="muted">Nenhum workspace ainda. Crie o primeiro acima.</p>'; return; }
  state.workspaces.forEach((w) => box.appendChild(workspaceCard(w)));
}
function workspaceCard(w) {
  const c = document.createElement('div');
  c.className = 'card'; c.style.background = 'var(--bg2)';
  const accs = w.accounts.map((a) =>
    `<span class="chip ok">${platIcon(a.platform)} ${a.display_name}
      <button class="btn sm ghost" style="padding:0 6px" onclick="delAccount(${a.id})">✕</button></span>`).join(' ');
  const connectBtns = PLATFORMS.map((p) => {
    if (p.manual) return `<button class="btn sm ghost" onclick="connectManual(${w.id},'${p.name}')">+ ${p.label}</button>`;
    const dis = p.configured ? '' : 'disabled title="Configure as credenciais"';
    return `<button class="btn sm" ${dis} onclick="connectOAuth(${w.id},'${p.name}')">+ ${p.label}</button>`;
  }).join(' ');
  c.innerHTML = `<div class="row between"><b>${w.name}</b>
    <button class="btn sm ghost" onclick="delWorkspace(${w.id})">Excluir</button></div>
    <div class="row" style="margin:12px 0">${accs || '<span class="muted">Sem contas vinculadas</span>'}</div>
    <div class="row">${connectBtns}</div>`;
  return c;
}
function platIcon(p) { return { youtube: '▶️', instagram: '📷', tiktok: '🎵', kwai: '🟠' }[p] || '•'; }
$('#wsCreate').onclick = async () => {
  const name = $('#wsName').value.trim();
  if (!name) return toast('Informe um nome.', 'err');
  await api('POST', '/workspaces', { name }); $('#wsName').value = ''; loadWorkspaces();
};
window.delWorkspace = async (id) => { if (confirm('Excluir workspace e suas contas?')) { await api('DELETE', '/workspaces/' + id); loadWorkspaces(); } };
window.delAccount = async (id) => { await api('DELETE', '/accounts/' + id); loadWorkspaces(); };
window.connectManual = async (wsId, platform) => {
  const name = prompt('Nome dessa conta ' + platform + ':');
  if (!name) return;
  await api('POST', '/accounts/manual', { workspaceId: wsId, platform, displayName: name });
  loadWorkspaces();
};
window.connectOAuth = (wsId, platform) => {
  window.open(`/oauth/${platform}/connect?workspaceId=${wsId}`, '_blank', 'width=620,height=720');
};
window.addEventListener('message', (e) => { if (e.data === 'oauth-done') { toast('Conta conectada!', 'ok'); loadWorkspaces(); } });

async function loadSettings() {
  const s = await api('GET', '/settings');
  $('#redirectNote').innerHTML = `<b>Redirect URIs</b> (cole no painel de cada rede):<br>
    YouTube: <code>${s.redirectUris.youtube}</code><br>
    Instagram: <code>${s.redirectUris.instagram}</code><br>
    TikTok: <code>${s.redirectUris.tiktok}</code>`;
  $('#settingsForm').innerHTML = `
    ${field('YouTube Client ID', 'youtubeClientId', s.youtube.clientId)}
    ${field('YouTube Client Secret', 'youtubeClientSecret', s.youtube.clientSecret)}
    ${field('Meta App ID', 'metaAppId', s.meta.appId)}
    ${field('Meta App Secret', 'metaAppSecret', s.meta.appSecret)}
    ${field('TikTok Client Key', 'tiktokClientKey', s.tiktok.clientKey)}
    ${field('TikTok Client Secret', 'tiktokClientSecret', s.tiktok.clientSecret)}`;
}
function field(label, id, val) {
  return `<div><label>${label}</label><input id="set-${id}" value="${val || ''}" placeholder="(vazio)" /></div>`;
}
$('#saveSettings').onclick = async () => {
  const body = {};
  ['youtubeClientId', 'youtubeClientSecret', 'metaAppId', 'metaAppSecret', 'tiktokClientKey', 'tiktokClientSecret']
    .forEach((id) => { body[id] = $('#set-' + id).value; });
  await api('POST', '/settings', body);
  toast('Credenciais salvas.', 'ok'); loadSettings(); loadWorkspaces();
};

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
    const id = 'acc-' + a.id;
    const l = document.createElement('label'); l.className = 'chip'; l.style.cursor = 'pointer';
    l.innerHTML = `<input type="checkbox" id="${id}" /> ${platIcon(a.platform)} ${a.display_name}`;
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
