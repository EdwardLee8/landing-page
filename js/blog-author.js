import { escapeHTML as esc, renderMarkdown } from './blog-format.js';
const $ = id => document.getElementById(id);
const form = $('editor-form'), notice = $('author-message');
let currentId = crypto.randomUUID(), draftRevision = null, publishedRevision = null, dirty = false, busy = false;
let localEntries = new Map();
function message(text, error = false) { notice.textContent = text; notice.classList.toggle('error', error); }
async function api(path, options = {}) {
  const response = await fetch('/api/blog/' + path, { cache: 'no-store', credentials: 'same-origin', ...options, headers: { 'Content-Type': 'application/json', ...(options.headers || {}) } });
  let data; try { data = await response.json(); } catch { throw new Error('伺服器回應不完整，請保留內容並重試。'); }
  if (!response.ok) { if (response.status === 401) $('login-panel').hidden = false; throw new Error(data.error || '操作未能完成，內容仍保留在編輯器。'); }
  return data;
}
function content() { return { title: $('post-title').value, excerpt: $('post-excerpt').value, category: $('post-category').value, body: $('post-body').value }; }
function setBusy(value) { busy = value; document.querySelectorAll('#workspace button,#workspace input,#workspace textarea').forEach(e => e.disabled = value); }
function markDirty() { dirty = true; $('editor-state').textContent = '有未儲存的修改'; }
function canLeave() { return !dirty || window.confirm('還有未儲存的修改。確定離開這篇文章？'); }
function fill(post, revisions = {}) {
  currentId = post.id; draftRevision = revisions.draftRevision || null; publishedRevision = revisions.publishedRevision || null;
  $('post-title').value = post.title || ''; $('post-excerpt').value = post.excerpt || ''; $('post-category').value = post.category || '研究筆記'; $('post-body').value = post.body || '';
  dirty = false; $('preview-panel').hidden = true; $('import-file').value = '';
  $('editor-state').textContent = post.updatedAt ? `已載入 · ${new Date(post.updatedAt).toLocaleString('zh-HK')}` : '新文章 · 尚未儲存';
  $('live-link').hidden = !publishedRevision; $('live-link').href = `/blog/p/${currentId}`;
}
function drawList(drafts, published) {
  const merged = new Map();
  for (const p of published) merged.set(p.id, { ...p, status: '已發佈' });
  for (const p of drafts) { const live = merged.get(p.id); if (!live || p.updatedAt > live.updatedAt) merged.set(p.id, { ...p, status: live ? '已發佈 · 有更新草稿' : '草稿' }); }
  for (const [id, p] of localEntries) { const remote = merged.get(id); if (!remote || p.updatedAt >= remote.updatedAt) merged.set(id, p); }
  $('post-list').innerHTML = [...merged.values()].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).map(p => `<li><button type="button" data-id="${esc(p.id)}">${esc(p.title)}<small>${esc(p.status)}</small></button></li>`).join('') || '<li class="muted">還沒有文章，開始寫第一篇吧。</li>';
}
async function refreshList() { const data = await api('author/posts'); drawList(data.drafts, data.published); }
async function session() {
  try { const data = await api('author/session'); $('login-panel').hidden = data.authenticated; $('workspace').hidden = !data.authenticated;
    if (data.authenticated) { message(''); await refreshList(); }
    else message(data.configured ? '請先登入作者後台。' : '作者後台尚未啟用：需要先在網站設定獨立作者密碼。');
  } catch (e) { message(e.message, true); }
}
$('login-form').addEventListener('submit', async e => { e.preventDefault(); const b = e.submitter; b.disabled = true; try { await api('author/login', { method: 'POST', body: JSON.stringify({ password: $('author-password').value }) }); $('author-password').value = ''; await session(); } catch (e) { message(e.message, true); } finally { b.disabled = false; } });
$('logout').addEventListener('click', async () => { if (!canLeave()) return; try { await api('author/logout', { method: 'POST', body: '{}' }); localEntries.clear(); fill({ id: crypto.randomUUID() }); await session(); } catch (e) { message(e.message, true); } });
$('new-post').addEventListener('click', () => { if (canLeave()) { fill({ id: crypto.randomUUID() }); message(''); $('post-title').focus(); } });
$('reload-list').addEventListener('click', async () => { try { await refreshList(); } catch (e) { message(e.message, true); } });
$('post-list').addEventListener('click', async e => { const b = e.target.closest('[data-id]'); if (!b || busy || !canLeave()) return; setBusy(true); try { const data = await api(`author/posts/${b.dataset.id}`); fill(data.post, data); message(''); } catch (e) { message(e.message, true); } finally { setBusy(false); } });
form.addEventListener('input', e => { if (e.target.id !== 'import-file') markDirty(); });
$('import-file').addEventListener('change', async e => {
  const file = e.target.files[0]; if (!file) return;
  try {
    if (!/\.(md|markdown|txt)$/i.test(file.name)) throw new Error('請選擇 Markdown 或文字檔。');
    if (file.size > 350 * 1024) throw new Error('檔案超過 350 KB，請縮短內容。');
    if ($('post-body').value.trim() && !window.confirm('匯入會取代編輯器中的內文，是否繼續？')) return;
    const text = new TextDecoder('utf-8', { fatal: true }).decode(await file.arrayBuffer());
    if (text.includes('\0') || text.length > 120000) throw new Error('檔案不是可支援的文字，或超過 120,000 字元。');
    $('post-body').value = text;
    if (!$('post-title').value.trim()) $('post-title').value = (text.match(/^#\s+(.+)$/m)?.[1] || file.name.replace(/\.[^.]+$/, '')).slice(0, 100);
    markDirty(); message('已匯入，請檢查內容後儲存草稿或發佈。');
  } catch (e) { message(e instanceof TypeError ? '請將檔案另存為 UTF-8 文字後再匯入。' : e.message, true); }
  finally { e.target.value = ''; }
});
$('preview-button').addEventListener('click', () => { $('preview-title').textContent = $('post-title').value || '未命名文章'; $('preview-body').innerHTML = renderMarkdown($('post-body').value); $('preview-panel').hidden = false; });
$('export-button').addEventListener('click', () => {
  const p = content(); const blob = new Blob([`# ${p.title}\n\n${p.body}\n`], { type: 'text/markdown;charset=utf-8' });
  const url = URL.createObjectURL(blob), a = document.createElement('a'); a.href = url; a.download = (p.title.replace(/[<>:"/\\|?*\x00-\x1f]/g, '_').slice(0, 60) || 'article') + '.md'; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
});
async function save(publish) {
  if (busy || !form.reportValidity()) return;
  const input = content(); setBusy(true); message(publish ? '正在發佈…' : '正在儲存草稿…');
  try {
    const data = await api(`author/posts/${currentId}${publish ? '/publish' : ''}`, { method: publish ? 'POST' : 'PUT', body: JSON.stringify({ ...input, revision: publish ? publishedRevision : draftRevision }) });
    if (publish) publishedRevision = data.post.revision; else draftRevision = data.post.revision;
    dirty = false; localEntries.set(currentId, { ...data.post, status: publish ? '已發佈' : publishedRevision ? '已發佈 · 有更新草稿' : '草稿' });
    $('editor-state').textContent = `${publish ? '已發佈' : '草稿已儲存'} · ${new Date(data.post.updatedAt).toLocaleString('zh-HK')}`;
    $('live-link').hidden = !publishedRevision; $('live-link').href = `/blog/p/${currentId}`; message(data.message);
    try { await refreshList(); } catch { drawList([], []); message(`${data.message}\n文章列表暫時未能重新整理。`); }
  } catch (e) { message(e.message, true); } finally { setBusy(false); }
}
form.addEventListener('submit', e => { e.preventDefault(); save(false); });
$('publish-button').addEventListener('click', () => { if (form.reportValidity()) { $('publish-title').textContent = $('post-title').value; $('publish-dialog').showModal(); } });
$('cancel-publish').addEventListener('click', () => $('publish-dialog').close());
$('confirm-publish').addEventListener('click', () => { $('publish-dialog').close(); save(true); });
window.addEventListener('beforeunload', e => { if (dirty) { e.preventDefault(); e.returnValue = ''; } });
session();
