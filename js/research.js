/* Progressive enhancement: reports and directory links work without JavaScript. */
(() => {
  const companies = window.RESEARCH_COMPANIES || [];
  const track = (action, detail = {}) => {
    // Hook for an existing analytics integration; never include email/search text.
    document.dispatchEvent(new CustomEvent('research:action', { detail: { action, ...detail } }));
  };
  const menu = document.querySelector('.menu-toggle');
  const nav = document.querySelector('.main-nav');
  menu?.addEventListener('click', () => {
    const open = menu.getAttribute('aria-expanded') !== 'true';
    menu.setAttribute('aria-expanded', String(open));
    nav.classList.toggle('is-open', open);
  });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && menu) {
      menu.setAttribute('aria-expanded', 'false');
      nav.classList.remove('is-open');
    }
  });
  const matches = (company, query) => {
    const q = query.trim().toLowerCase().replace(/\.hk$/, '');
    if (/^\d{1,5}$/.test(q)) return company.symbol === q.padStart(5, '0');
    return [company.shortName, company.name_en, company.code].join(' ').toLowerCase().includes(q);
  };
  const form = document.getElementById('company-search');
  const query = document.getElementById('stock-query');
  const results = document.getElementById('search-results');
  function search() {
    results.hidden = !query.value.trim();
    const matchesEl = results.querySelector('.search-matches');
    matchesEl.replaceChildren();
    if (results.hidden) return;
    const rows = companies.filter(company => matches(company, query.value));
    results.querySelector('.search-status').textContent = rows.length
      ? `搵到 ${rows.length} 間公司${rows.length > 6 ? '，先顯示首六間' : ''}`
      : '呢期報告未收錄呢間公司。可以試其他名稱，或瀏覽全部公司研究。';
    rows.slice(0, 6).forEach(company => {
      const a = document.createElement('a');
      a.href = `/research/hk/${company.symbol}/`;
      a.textContent = company.shortName;
      const code = document.createElement('small');
      code.textContent = `${company.code} ↗`;
      a.append(code);
      matchesEl.append(a);
    });
    const all = document.createElement('a');
    all.href = `/research/?q=${encodeURIComponent(query.value.trim())}`;
    all.textContent = '前往公司研究庫 →';
    matchesEl.append(all);
  }
  if (form && companies.length) {
    query.addEventListener('input', search);
    form.addEventListener('submit', event => {
      if (!query.value.trim()) return;
      event.preventDefault();
      search();
      track('search', { resultCount: companies.filter(c => matches(c, query.value)).length });
      results.querySelector('a')?.focus();
    });
  }
  const directory = document.getElementById('directory');
  if (directory) {
    const input = document.getElementById('directory-query');
    const industry = document.getElementById('directory-industry');
    const params = new URLSearchParams(location.search);
    input.value = params.get('q') || '';
    if ([...industry.options].some(option => option.value === params.get('industry'))) industry.value = params.get('industry');
    const filter = () => {
      let count = 0;
      directory.querySelectorAll('[data-symbol]').forEach(card => {
        const company = companies.find(c => c.symbol === card.dataset.symbol);
        const visible = company && matches(company, input.value) && (!industry.value || company.industry === industry.value);
        card.hidden = !visible;
        if (visible) count++;
      });
      document.getElementById('directory-count').textContent = `顯示 ${count} / ${companies.length} 間公司`;
      document.getElementById('directory-empty').hidden = count > 0;
      const url = new URL(location.href);
      for (const [key, value] of [['q', input.value.trim()], ['industry', industry.value]]) {
        if (value) url.searchParams.set(key, value); else url.searchParams.delete(key);
      }
      history.replaceState(null, '', url);
    };
    input.addEventListener('input', filter);
    industry.addEventListener('change', filter);
    filter();
  }
  const archive = document.getElementById('archive-directory');
  if (archive) {
    const cards = [...archive.querySelectorAll('[data-archive-search]')];
    const query = document.getElementById('archive-query');
    const year = document.getElementById('archive-year');
    const month = document.getElementById('archive-month');
    const category = document.getElementById('archive-category');
    const previous = document.getElementById('archive-prev');
    const next = document.getElementById('archive-next');
    let page = 0;
    const render = () => {
      const q = query.value.trim().toLowerCase();
      const rows = cards.filter(card => card.dataset.archiveSearch.includes(q)
        && (!year.value || card.dataset.date.startsWith(year.value))
        && (!month.value || card.dataset.date.slice(5, 7) === month.value)
        && (!category.value || card.dataset.categories.split(' ').includes(category.value)));
      const visible = new Set(rows.slice(page * 12, (page + 1) * 12));
      cards.forEach(card => { card.hidden = !visible.has(card); });
      document.getElementById('archive-count').textContent = rows.length
        ? `${rows.length} 篇摘要 · 第 ${page + 1} / ${Math.ceil(rows.length / 12)} 頁`
        : '未搵到符合條件嘅文章，試下其他關鍵字或日期。';
      previous.disabled = page === 0;
      next.disabled = (page + 1) * 12 >= rows.length;
    };
    document.getElementById('archive-pagination').hidden = false;
    for (const field of [query, year, month, category]) field.addEventListener(field === query ? 'input' : 'change', () => { page = 0; render(); });
    previous.addEventListener('click', () => { page--; render(); document.getElementById('archive-filters').scrollIntoView(); });
    next.addEventListener('click', () => { page++; render(); document.getElementById('archive-filters').scrollIntoView(); });
    render();
  }
  document.querySelectorAll('.newsletter-form').forEach(form => {
    // Without JS, keep the message visible and the submit control disabled.
    const button = form.querySelector('button');
    const message = form.querySelector('.form-message');
    button.disabled = false;
    message.textContent = '';
    form.addEventListener('submit', async event => {
      event.preventDefault();
      button.disabled = true;
      message.classList.remove('error');
      message.textContent = '登記中…';
      try {
        const response = await fetch('/api/subscribe', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: form.elements.email.value.trim() }),
        });
        const data = await response.json();
        if (!response.ok || data.ok !== true) throw new Error(data.error || '未能登記，請稍後再試。');
        message.textContent = '已登記研究更新通知，多謝支持。';
        form.reset();
        track('subscribe');
      } catch (error) {
        message.textContent = error.message === 'Failed to fetch' ? '連線未成功，請稍後再試。' : error.message;
        message.classList.add('error');
      } finally { button.disabled = false; }
    });
  });
  document.querySelectorAll('[data-share]').forEach(button => {
    button.hidden = false;
    button.addEventListener('click', async () => {
      const canonical = document.querySelector('link[rel="canonical"]').href;
      const message = document.getElementById('share-message');
      try {
        if (button.dataset.share === 'native' && navigator.share) {
          await navigator.share({ title: document.title, url: canonical });
        } else {
          await navigator.clipboard.writeText(canonical);
          message.textContent = '已複製研究連結。';
        }
        track('share');
      } catch (error) {
        if (error.name !== 'AbortError') message.textContent = `可以複製呢個網址分享：${canonical}`;
      }
    });
  });
  document.querySelectorAll('a[data-track]').forEach(a => a.addEventListener('click', () => track(a.dataset.track)));
  const report = document.getElementById('report');
  if (report) track('report_open', { symbol: report.dataset.symbol });
})();
