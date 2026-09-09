(() => {
  const key = 'edward-layout';
  const params = new URLSearchParams(location.search);
  const explicit = params.get('view');
  const home = location.pathname === '/' || location.pathname === '/index.html';
  const visited = history.state?.layoutVisited;
  const returning = performance.getEntriesByType('navigation')[0]?.type === 'back_forward';
  let saved;
  try { saved = localStorage.getItem(key); } catch {}
  const remember = value => { try { localStorage.setItem(key, value); } catch {} };
  if (home && !explicit && !location.hash && !visited && !returning && saved === 'explore') {
    location.replace('/explore/');
    return;
  }
  // History traversal restores the page; only an explicit selection changes preference.
  history.replaceState({ ...history.state, layoutVisited: true }, '');
  document.querySelectorAll('[data-layout]').forEach(link => {
    link.addEventListener('click', () => remember(link.dataset.layout));
  });
  function choose(push = true) {
    let dialog = document.getElementById('layout-picker');
    if (!dialog) {
      dialog = document.createElement('dialog');
      dialog.id = 'layout-picker';
      dialog.className = 'layout-picker';
      dialog.setAttribute('aria-labelledby', 'layout-title');
      dialog.innerHTML = '<h2 id="layout-title">用你習慣嘅方式，探索研究。</h2><p>揀一個版面開始，之後亦可以隨時切換。</p><div class="layout-options"><a class="layout-option" href="/?view=classic" data-layout="classic"><img src="/assets/hero-bg.jpg" alt=""><strong>經典文字版</strong><small>熟悉嘅原有版面，集中瀏覽資訊與研究入口。</small><b>進入經典文字版 →</b></a><a class="layout-option" href="/explore/" data-layout="explore"><img src="/preview/redesign/ai-hardware.webp" alt=""><strong>新型探索版</strong><small>圖像導讀，由公司同產業主題展開研究。</small><b>進入新型探索版 →</b></a></div><p class="layout-note">偏好只儲存喺呢個瀏覽器，唔影響會員帳戶或閱讀權限。</p><button class="layout-close" type="button">暫時留喺呢頁</button>';
      dialog.querySelectorAll('[data-layout]').forEach(link => link.addEventListener('click', () => remember(link.dataset.layout)));
      const close = () => {
        if (history.state?.layoutPicker) history.back();
        else dialog.close();
      };
      dialog.querySelector('button').addEventListener('click', close);
      dialog.addEventListener('cancel', event => { event.preventDefault(); close(); });
      document.body.append(dialog);
    }
    if (dialog.open) return;
    if (push) history.pushState({ ...history.state, layoutPicker: true }, '');
    dialog.showModal();
  }
  document.querySelectorAll('[data-layout-chooser]').forEach(link => link.addEventListener('click', event => {
    event.preventDefault();
    choose();
  }));
  const restore = () => {
    if (history.state?.layoutPicker) choose(false);
    else document.getElementById('layout-picker')?.close();
  };
  addEventListener('popstate', restore);
  addEventListener('pageshow', restore);
  if (history.state?.layoutPicker) restore();
  else if (home && (explicit === 'choose' || (!explicit && !saved && !location.hash && !visited && !returning))) {
    if (explicit === 'choose') {
      const url = new URL(location.href);
      url.searchParams.delete('view');
      history.replaceState(history.state, '', url);
    }
    choose();
  }
})();
