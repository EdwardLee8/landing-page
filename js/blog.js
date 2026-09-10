import { escapeHTML as esc, safeLink } from './blog-format.js';
const seed = (typeof SITE_CONTENT !== 'undefined' ? SITE_CONTENT.articles : []).map((p, i) => ({ ...p, id: `existing-${i}`, category: '免費精選', source: 'existing', date: p.date || '', external: /^https?:/.test(p.url) }));
let posts = [...seed], source = 'all', visible = 12;
const grid = document.getElementById('article-grid'), search = document.getElementById('article-search'), category = document.getElementById('category');
const link = p => p.source === 'own' ? `/blog/p/${encodeURIComponent(p.id)}` : safeLink(p.url);
const label = p => p.source === 'own' ? '閱讀全文 →' : p.external ? '前往免費原文 ↗' : '開啟免費內容 →';
const date = p => esc(p.date.slice(0, 10));
function card(p, featured = false) { return `<article class="${featured ? 'featured' : 'article-card'}"><p class="eyebrow">${featured ? '精選 / ' : ''}${esc(p.source === 'own' ? 'Edward 專欄' : '以往免費文章')} · ${date(p)}</p><h2><a href="${esc(link(p))}"${p.external ? ' target="_blank" rel="noopener noreferrer"' : ''}>${esc(p.title)}</a></h2><p class="excerpt">${esc(p.excerpt)}</p><span class="category-tag">${esc(p.category)}</span><a class="${featured ? 'primary' : 'read-link'}" href="${esc(link(p))}"${p.external ? ' target="_blank" rel="noopener noreferrer"' : ''}>${label(p)}</a></article>`; }
function draw() {
  const q = search.value.trim().toLowerCase();
  const ordered = [...posts].sort((a, b) => b.date.localeCompare(a.date));
  const filtered = ordered.filter(p => (source === 'all' || p.source === source) && (!category.value || p.category === category.value) && (!q || `${p.title} ${p.excerpt} ${p.category}`.toLowerCase().includes(q)));
  const feature = document.getElementById('feature');
  const featured = !q && !category.value && source === 'all' && ordered.length
    ? (ordered.find(p => p.source === 'own') || ordered[0]) : null;
  feature.innerHTML = featured ? card(featured, true) : '';
  // 精選嗰篇唔好喺下面個列表再出多次 —— 同一屏見到兩次同一篇文,
  // 讀者會以為自己撳錯咗或者網站出錯。
  const listed = featured ? filtered.filter(p => p !== featured) : filtered;
  grid.innerHTML = listed.slice(0, visible).map(p => card(p)).join('') || `<div class="empty"><h2>${source === 'own' && !q && !category.value ? '首篇專欄文章，敬請期待。' : '沒有符合的文章。'}</h2><p>可以試試其他關鍵字或內容來源。</p></div>`;
  document.getElementById('result-count').textContent = `${filtered.length} 篇免費內容`;
  document.getElementById('more').hidden = visible >= filtered.length;
  document.querySelectorAll('[data-source]').forEach(b => b.setAttribute('aria-pressed', b.dataset.source === source));
}
document.getElementById('source-filters').addEventListener('click', e => { const button = e.target.closest('[data-source]'); if (button) { source = button.dataset.source; visible = 12; draw(); } });
search.addEventListener('input', () => { visible = 12; draw(); });
category.addEventListener('change', () => { visible = 12; draw(); });
document.getElementById('more').addEventListener('click', () => { visible += 12; draw(); });
function categories() { category.innerHTML = '<option value="">全部分類</option>' + [...new Set(posts.map(p => p.category))].sort().map(c => `<option value="${esc(c)}">${esc(c)}</option>`).join(''); }
categories(); draw();
try {
  const response = await fetch('/api/blog/posts', { cache: 'no-store' });
  if (!response.ok) throw new Error();
  const data = await response.json(); if (!Array.isArray(data.posts)) throw new Error();
  posts.push(...data.posts.map(p => ({ ...p, source: 'own', external: false })));
  categories(); draw(); document.getElementById('load-status').hidden = true;
} catch {
  // 攞唔到專欄文章唔係讀者嘅事:以往免費文章照樣列曬出嚟,
  // 唔應該喺頁面頂扔一句似出錯嘅紅字嚇親人。想睇專欄嘅人撳
  // 「Edward 專欄」篩選,會見到「首篇專欄文章,敬請期待。」
  document.getElementById('load-status').hidden = true;
}
