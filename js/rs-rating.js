/**
 * 相對強度評分頁的共用程式,港/美/A 股三頁共用。
 *
 * 三個頁面原本各 732 行、實際差異只有 27 行(標題、幣別、成交額級距、
 * 資料檔名)。差異改由頁面內的 RS_CONFIG 提供:
 *   market / pageName / marketName / currency / rsUrl / weinsteinUrl / amountTiers
 *
 * 需先載入 js/member-auth.js 與 js/member-shell.js。
 */
var C = window.RS_CONFIG;
if (!C) throw new Error("RS_CONFIG 未定義");

// 標記直接注入,維持與原本 HTML 相同的 DOM;下面的程式碼保持頂層全域,
// 因為標記裡的 onclick="updateAmountBtn()" 等處理器需要全域函式。
document.getElementById("rs-app").innerHTML = `<button class="help-btn" onclick="_toggleHelp()">ⓘ 點解讀</button>
<div class="help-panel" id="_help_panel">
  <h3>點解讀「RS 相對強度評分」<button class="help-close" onclick="_toggleHelp()">收埋 ✕</button></h3>
  <p>每隻股票同<b>大盤</b>比較，畀 1-99 分：</p>
<ul>
  <li><b>99 分</b> = 跑贏大盤最多嘅 1%</li>
  <li><b>50 分</b> = 中位數</li>
  <li><b>1 分</b> = 跑輸大盤最多嘅 1%</li>
</ul>
<p>5 / 10 / 20 / 50 日代表唔同時段嘅相對表現。<b>Composite</b> 係綜合分數（一個整體強弱排名）。</p>
<p><b>點用：</b></p>
<ul>
  <li>揀 Composite ≥ 81 = 整體跑贏大盤嘅一群</li>
  <li>同時睇 5 日 vs 50 日，識別「短反彈 vs 真強勢」</li>
  <li>例：5d=99 但 50d=20 → 短期反彈、中期仍弱</li>
</ul>
<h4>Weinstein Stage 週期四階段</h4>
<p>用 <b>30 週均線（MA30W）</b>判斷股票處於哪個市場週期：</p>
<table class="help-table">
  <tr><th>Stage</th><th>名稱</th><th>特徵</th><th>操作</th></tr>
  <tr><td><span class="w-tag w-s1">Stage 1</span></td><td>底部整固</td><td>跌勢後橫行，MA30W 走平，成交萎縮</td><td>觀望</td></tr>
  <tr><td><span class="w-tag w-s1b">Stage 1B</span></td><td>突破準備</td><td>MA30W 開始上翹，價格嘗試站上均線</td><td>留意</td></tr>
  <tr><td><span class="w-tag w-s2">Stage 2</span></td><td>上升趨勢 ✅</td><td>站穩 MA30W 上方，均線向上，量能配合 — <b>最佳持有期</b></td><td><b>持有／買入</b></td></tr>
  <tr><td><span class="w-tag w-s3">Stage 3</span></td><td>頂部整固</td><td>升勢放緩，在均線附近震盪，MA30W 走平</td><td>減持</td></tr>
  <tr><td><span class="w-tag w-s3b">Stage 3B</span></td><td>跌破警告</td><td>跌穿 MA30W，均線即將轉向下</td><td>止損</td></tr>
  <tr><td><span class="w-tag w-s4">Stage 4</span></td><td>下跌趨勢 ❌</td><td>MA30W 向下，股價持續低於均線</td><td>迴避</td></tr>
</table>
<p><b>訊號：</b> 🚀 早期突破（Stage 2 初期）&nbsp;·&nbsp; 📈 回調買入（Stage 2 均線附近）&nbsp;·&nbsp; ⚠️ 警告（Stage 3/3B）&nbsp;·&nbsp; 🚫 迴避（Stage 4）</p>
<p><b>小貼士：</b>篩選 Stage 2 配合 Composite ≥ 81，效果最佳。</p>
</div>





<div id="pw-overlay">
  <div class="pw-box">
    <h2>${C.pageName}</h2>
    <p>請輸入密碼以繼續</p>
    <p class="pw-hint">密碼可到 Patreon 聊天區獲取</p>
    <input type="password" id="pw-input" placeholder="密碼" autocomplete="off">
    <button onclick="checkPassword()">進入</button>
    <div class="pw-error" id="pw-error"></div>
  </div>
</div>

<div class="page-header">
  <a href="/" class="back-btn">&#8592; 返回首頁</a>
  <a href="/member/" class="back-btn">&#8592; 返回資料庫首頁</a>
  <div>
    <div class="page-title">${C.pageName}</div>
    <div class="page-subtitle" id="data-date">載入中&#8230;</div>
  </div>
</div>

<div class="dist-panel">
  <div class="dist-panel-label">Composite 分佈（<b id="count-all">—</b> 隻，中位數 <b id="median-comp">—</b>）</div>
  <div class="dist-bar" id="dist-bar"></div>
  <div class="dist-legend">
    <span><i style="color:#b71c1c">■</i> 1–20 <b id="count-b1">—</b></span>
    <span><i style="color:#ef5350">■</i> 21–40 <b id="count-b2">—</b></span>
    <span><i style="color:#ffb74d">■</i> 41–60 <b id="count-b3">—</b></span>
    <span><i style="color:#64b5f6">■</i> 61–80 <b id="count-b4">—</b></span>
    <span><i style="color:#4caf50">■</i> 81–99 <b id="count-top">—</b></span>
  </div>
</div>

<div class="filter-bar">
  <div class="filter-group">
    <span class="filter-label">搜尋</span>
    <input type="text" id="f-search" placeholder="代碼或公司名">
  </div>
  <div class="filter-group">
    <span class="filter-label">行業</span>
    <select id="f-sector">
      <option value="">全部行業</option>
    </select>
  </div>
  <div class="filter-group">
    <span class="filter-label">Composite 評分</span>
    <select id="f-comp">
      <option value="">全部</option>
      <option value="top">81-99 強勢</option>
      <option value="good">61-80 偏強</option>
      <option value="ok">41-60 中性</option>
      <option value="bad">21-40 偏弱</option>
      <option value="bottom">1-20 弱勢</option>
    </select>
  </div>
  <div class="filter-group">
    <span class="filter-label">5日評分</span>
    <select id="f-5d">
      <option value="">全部</option>
      <option value="top">81-99</option>
      <option value="mid">41-80</option>
      <option value="bot">1-40</option>
    </select>
  </div>
  <div class="filter-group">
    <span class="filter-label">20日評分</span>
    <select id="f-20d">
      <option value="">全部</option>
      <option value="top">81-99</option>
      <option value="mid">41-80</option>
      <option value="bot">1-40</option>
    </select>
  </div>
  <div class="filter-group">
    <span class="filter-label">市值 (${C.currency})</span>
    <div class="mcap-multi">
      <button class="mcap-btn" id="mcap-btn" onclick="toggleMcapMenu(event)">全部市值 ▾</button>
      <div class="mcap-menu" id="mcap-menu" style="display:none">
        <div class="mcap-actions">
          <button onclick="selectAllMcap()">全選</button>
          <button onclick="deselectAllMcap()">取消全選</button>
        </div>
        <label><input type="checkbox" name="mcap" value="0,1e10" onchange="updateMcapBtn()"> 0 - 100億</label>
        <label><input type="checkbox" name="mcap" value="1e10,3e10" onchange="updateMcapBtn()"> 100 - 300億</label>
        <label><input type="checkbox" name="mcap" value="3e10,8e10" onchange="updateMcapBtn()"> 300 - 800億</label>
        <label><input type="checkbox" name="mcap" value="8e10,2e11" onchange="updateMcapBtn()"> 800 - 2000億</label>
        <label><input type="checkbox" name="mcap" value="2e11,5e11" onchange="updateMcapBtn()"> 2000 - 5000億</label>
        <label><input type="checkbox" name="mcap" value="5e11,Infinity" onchange="updateMcapBtn()"> 5000億以上</label>
      </div>
    </div>
  </div>
  <div class="filter-group">
    <span class="filter-label">20日平均成交額 (${C.currency})</span>
    <div class="mcap-multi">
      <button class="mcap-btn" id="amount-btn" onclick="toggleAmountMenu(event)">全部成交額 ▾</button>
      <div class="mcap-menu" id="amount-menu" style="display:none">
        <div class="mcap-actions">
          <button onclick="selectAllAmount()">全選</button>
          <button onclick="deselectAllAmount()">取消全選</button>
        </div>
${C.amountTiers.map(t => `        <label><input type="checkbox" name="amount" value="${t.v}" onchange="updateAmountBtn()"> ${t.label}</label>`).join("\n")}
      </div>
    </div>
  </div>
  <div class="filter-group">
    <span class="filter-label">5日RS</span>
    <select id="f-rs5d">
      <option value="">全部</option>
      <option value="pos">正 (+)</option>
      <option value="neg">負 (−)</option>
    </select>
  </div>
  <div class="filter-group">
    <span class="filter-label">Weinstein Stage</span>
    <div class="mcap-multi">
      <button class="mcap-btn" id="stage-btn" onclick="toggleStageMenu(event)">全部 Stage ▾</button>
      <div class="mcap-menu" id="stage-menu" style="display:none">
        <div class="mcap-actions">
          <button onclick="selectAllStage()">全選</button>
          <button onclick="deselectAllStage()">取消全選</button>
        </div>
        <label><input type="checkbox" name="wstage" value="2"  onchange="updateStageBtn()"> <span class="w-tag w-s2">Stage 2</span></label>
        <label><input type="checkbox" name="wstage" value="11" onchange="updateStageBtn()"> <span class="w-tag w-s1b">Stage 1B</span></label>
        <label><input type="checkbox" name="wstage" value="1"  onchange="updateStageBtn()"> <span class="w-tag w-s1">Stage 1</span></label>
        <label><input type="checkbox" name="wstage" value="3"  onchange="updateStageBtn()"> <span class="w-tag w-s3">Stage 3</span></label>
        <label><input type="checkbox" name="wstage" value="33" onchange="updateStageBtn()"> <span class="w-tag w-s3b">Stage 3B</span></label>
        <label><input type="checkbox" name="wstage" value="4"  onchange="updateStageBtn()"> <span class="w-tag w-s4">Stage 4</span></label>
      </div>
    </div>
  </div>
  <div>
    <button class="btn btn-ghost" onclick="resetFilters()">重置</button>
    <button class="btn btn-primary" onclick="applyFilters()">篩選</button>
  </div>
</div>

<div class="legend">
  <div class="legend-item"><div class="legend-dot" style="background:#4caf50"></div>81-99 強勢</div>
  <div class="legend-item"><div class="legend-dot" style="background:#64b5f6"></div>61-80 偏強</div>
  <div class="legend-item"><div class="legend-dot" style="background:#ffb74d"></div>41-60 中性</div>
  <div class="legend-item"><div class="legend-dot" style="background:#ef5350"></div>21-40 偏弱</div>
  <div class="legend-item"><div class="legend-dot" style="background:#b71c1c"></div>1-20 弱勢</div>
</div>

<div class="panel">
<div class="table-wrap">
<table>
  <thead>
    <tr>
      <th onclick="sortBy('rank')" data-col="rank"># <span class="sort-icon"></span></th>
      <th onclick="sortBy('symbol')" data-col="symbol">代碼 <span class="sort-icon"></span></th>
      <th>公司名稱</th>
      <th onclick="sortBy('sector')" data-col="sector">行業 <span class="sort-icon"></span></th>
      <th onclick="sortBy('market_cap')" data-col="market_cap">市值 <span class="sort-icon"></span></th>
      <th onclick="sortBy('rs_rating_composite')" data-col="rs_rating_composite">Composite <span class="sort-icon"></span></th>
      <th onclick="sortBy('rs_rating_5d')" data-col="rs_rating_5d">5日 <span class="sort-icon"></span></th>
      <th onclick="sortBy('rs_ret_5d')" data-col="rs_ret_5d">5日相對大市% <span class="sort-icon"></span></th>
      <th onclick="sortBy('rs_rating_10d')" data-col="rs_rating_10d">10日 <span class="sort-icon"></span></th>
      <th onclick="sortBy('rs_ret_10d')" data-col="rs_ret_10d">10日相對大市% <span class="sort-icon"></span></th>
      <th onclick="sortBy('rs_rating_20d')" data-col="rs_rating_20d">20日 <span class="sort-icon"></span></th>
      <th onclick="sortBy('rs_ret_20d')" data-col="rs_ret_20d">20日相對大市% <span class="sort-icon"></span></th>
      <th onclick="sortBy('rs_rating_50d')" data-col="rs_rating_50d">50日 <span class="sort-icon"></span></th>
      <th onclick="sortBy('rs_ret_50d')" data-col="rs_ret_50d">50日相對大市% <span class="sort-icon"></span></th>
      <th onclick="sortBy('amount')" data-col="amount">20日平均成交額 <span class="sort-icon"></span></th>
      <th onclick="sortBy('w_stage')" data-col="w_stage">Weinstein Stage <span class="sort-icon"></span></th>
    </tr>
  </thead>
  <tbody id="table-body"></tbody>
</table>
<div class="empty" id="empty-state" style="display:none">
  <div style="font-size:40px;margin-bottom:12px">&#128269;</div>
  <div>找不到符合條件的股票</div>
</div>
</div>
</div>

<div class="pagination" id="pagination"></div>`;

(function(){
  const KEY = "_help_seen_rs-" + C.market;
  const panel = document.getElementById("_help_panel");
  if (!localStorage.getItem(KEY)) {
    panel.classList.add("open");
  }
  window._toggleHelp = function() {
    const isOpen = panel.classList.toggle("open");
    if (!isOpen) localStorage.setItem(KEY, "1");
  };
})();

// 密碼雜湊、SHA-256 與 AES-GCM 解密集中於 js/member-auth.js,
// 避免同一段密碼學程式碼散落在十幾個頁面各自維護。
const _PW_HASH = MemberAuth.PW_HASH;
const _sha256 = MemberAuth.sha256;
async function checkPassword() {
  const dataPassword = await MemberAuth.login(document.getElementById('pw-input').value);
  if (dataPassword) {
    document.getElementById('pw-overlay').style.display = 'none';
    sessionStorage.setItem('unified_auth', '1');
    sessionStorage.setItem('unified_auth_pw', dataPassword);
    await loadData();
  } else {
    document.getElementById('pw-error').textContent = '密碼錯誤，請再試';
    document.getElementById('pw-input').value = '';
    document.getElementById('pw-input').focus();
  }
}
document.addEventListener('DOMContentLoaded', async function() {
  document.getElementById('pw-input').addEventListener('keydown', function(e) {
    if (e.key === 'Enter') checkPassword();
  });
  // sessionStorage 只限本分頁;由書籤/新分頁進來時靠 cookie 回復登入
  const pw = sessionStorage.getItem('unified_auth_pw') || await MemberAuth.resume() || '';
  if (pw) {
    document.getElementById('pw-overlay').style.display = 'none';
    loadData();
  } else {
    sessionStorage.removeItem('unified_auth');
    document.getElementById('pw-input').focus();
  }
});

// ── Decryption (PBKDF2 + AES-256-GCM) ─────────────────────────────────────
// ENC_PASS read from sessionStorage (set by login.html or this page after auth)
function _getEncPass(){ return sessionStorage.getItem("unified_auth_pw") || ""; }

const decryptAsset = (b64) => MemberAuth.decrypt(b64);

async function loadData() {
  try {
    const resp = await fetch(C.rsUrl, { cache: 'no-store' });
    if (resp.status === 401) return MemberAuth.handleUnauthorized();
    const b64  = await resp.text();
    const data  = await decryptAsset(b64.trim());

    window._raw    = data.ratings || [];
    window._date   = data.date    || '';

    document.getElementById('data-date').innerHTML = `<span class="pill">📅 ${window._date}</span> · 共 ${window._raw.length} 隻${C.marketName}`;

    // Stats
    const comps = window._raw.map(r => r.rs_rating_composite).filter(c => c != null).sort((a,b)=>a-b);
    const median = comps[Math.floor(comps.length/2)];
    document.getElementById('count-all').textContent = window._raw.length;
    document.getElementById('median-comp').textContent = median;

    // Composite 分佈條:5 個桶,跟表格內 ratingBadge() 用同一套色階與級距
    // (1-20 / 21-40 / 41-60 / 61-80 / 81-99),數字皆由目前這批真實資料算出。
    const buckets = [
      { id: 'count-b1', color: '#b71c1c', test: c => c <= 20 },
      { id: 'count-b2', color: '#ef5350', test: c => c >= 21 && c <= 40 },
      { id: 'count-b3', color: '#ffb74d', test: c => c >= 41 && c <= 60 },
      { id: 'count-b4', color: '#64b5f6', test: c => c >= 61 && c <= 80 },
      { id: 'count-top', color: '#4caf50', test: c => c >= 81 },
    ].map(b => ({ ...b, n: comps.filter(b.test).length }));
    buckets.forEach(b => { document.getElementById(b.id).textContent = b.n; });
    const distBar = document.getElementById('dist-bar');
    distBar.innerHTML = buckets.filter(b => b.n > 0).map(b => {
      const pct = (b.n / comps.length * 100).toFixed(1);
      return `<span style="width:${pct}%;background:${b.color}" title="${b.n} 隻">${pct >= 8 ? b.n : ''}</span>`;
    }).join('');

    // Build sector dropdown
    const sectors = [...new Set(window._raw.map(r => r.sector).filter(Boolean))].sort();
    const sel = document.getElementById('f-sector');
    sectors.forEach(s => {
      const opt = document.createElement('option');
      opt.value = s;
      opt.textContent = s;
      sel.appendChild(opt);
    });

    // ── Load Weinstein Stage data (non-blocking) ──────────────────────────
    try {
      const wResp = await fetch(C.weinsteinUrl, { cache: 'no-store' });
      const wB64  = await wResp.text();
      const wData = await decryptAsset(wB64.trim());
      const wMap  = {};
      (wData.stages || []).forEach(s => { wMap[s.symbol] = s; });
      window._raw.forEach(r => {
        const w = wMap[r.symbol];
        if (w) {
          r.w_stage       = w.stage || 0;
          r.w_stage_label = w.stage_label || '';
          r.w_signal      = w.signal || '';
          r.w_duration    = w.stage_duration_weeks || 0;
          r.w_slope       = w.ma30w_slope_10w;
          r.w_pvm         = w.price_vs_ma30w;
          r.w_reasons     = w.reason_codes || '';
        }
      });
    } catch(we) { console.error('[Weinstein ' + C.market.toUpperCase() + '] load failed:', we.message, we); }

    window._filtered = [...window._raw];
    window._sortCol  = 'rs_rating_composite';
    window._sortDir = -1;
    window._page    = 1;
    render();
  } catch(e) {
    document.getElementById('data-date').textContent = '載入失敗: ' + e.message;
    console.error(e);
  }
}

// ── Rating badge ───────────────────────────────────────────────────────────
function ratingBadge(v) {
  if (v == null) return '<span class="neutral">—</span>';
  let cls;
  if (v >= 81)      { cls = 'bg-best'; }
  else if (v >= 61) { cls = 'bg-good'; }
  else if (v >= 41) { cls = 'bg-ok'; }
  else if (v >= 21) { cls = 'bg-bad'; }
  else              { cls = 'bg-worst'; }
  return `<span class="rating-badge ${cls}">${v}</span>`;
}

// Composite 是主要排序欄,用大字 + 長條凸顯,其餘 timeframe 仍用上面的
// 小膠囊(ratingBadge)—— 不拿掉任何欄位資訊,只是把最重要的那欄放大。
// 顏色跟 ratingBadge()/legend 用同一套色階,數值即真實 Composite 分數。
function compositeHero(v) {
  if (v == null) return '<span class="neutral">—</span>';
  const color = v >= 81 ? '#4caf50' : v >= 61 ? '#64b5f6' : v >= 41 ? '#ffb74d' : v >= 21 ? '#ef5350' : '#b71c1c';
  return `<div class="composite-hero">
    <span class="composite-hero-num" style="color:${color}">${v}</span>
    <div class="composite-hero-bar"><span style="width:${v}%;background:${color}"></span></div>
  </div>`;
}

function pctColor(v) {
  if (v === null || v === undefined) return 'neutral';
  return v >= 0 ? 'good' : 'poor';
}

function fmtPct(v) {
  if (v === null || v === undefined) return '—';
  return (v >= 0 ? '+' : '') + (v * 100).toFixed(1) + '%';
}

function fmtAmount(v) {
  if (v === null || v === undefined) return '—';
  if (v >= 1e9) return (v / 1e9).toFixed(1) + 'B';
  if (v >= 1e6) return (v / 1e6).toFixed(1) + 'M';
  if (v >= 1e3) return (v / 1e3).toFixed(1) + 'K';
  return v.toFixed(0);
}

function fmtMktCap(v) {
  if (v === null || v === undefined) return '—';
  if (v >= 1e12) return (v / 1e12).toFixed(2) + 'T';
  if (v >= 1e9) return (v / 1e9).toFixed(1) + 'B';
  if (v >= 1e6) return (v / 1e6).toFixed(1) + 'M';
  if (v >= 1e3) return (v / 1e3).toFixed(1) + 'K';
  return v.toFixed(0);
}

function fmtName(r) {
  // Prefer Chinese name, fallback to English
  const name = r.name_zh || r.name_en || '';
  if (!name) return '<span class="neutral">—</span>';
  return `<span class="name" title="${r.name_en || ''}">${name}</span>`;
}

// ── Weinstein Stage tag ────────────────────────────────────────────────────
const _W_CLS = {'Stage 2':'w-s2','Stage 1B':'w-s1b','Stage 1':'w-s1',
                'Stage 3':'w-s3','Stage 3B':'w-s3b','Stage 4':'w-s4'};
const _W_SIG = {'early_breakout':'🚀','pullback_buy':'📈','warning':'⚠️','avoid':'🚫'};
function stageTag(label, signal, slope, reasons) {
  if (!label || label === 'Transition' || label === 'Insufficient') return '<span class="w-trans">—</span>';
  const cls  = _W_CLS[label] || 'w-trans';
  const ico  = signal ? (' ' + (_W_SIG[signal] || '')) : '';
  const tip  = [label, slope != null ? `斜率${slope>0?'+':''}${(slope||0).toFixed(1)}%` : '', reasons || '']
               .filter(Boolean).join(' | ');
  return `<span class="w-tag ${cls}" title="${tip}">${label}${ico}</span>`;
}

// ── Table rendering ────────────────────────────────────────────────────────
const PAGE_SIZE = 50;

function render() {
  const tb = document.getElementById('table-body');
  const empty = document.getElementById('empty-state');
  const data = window._filtered;

  // Sort
  const col = window._sortCol;
  const dir = window._sortDir;
  data.sort((a, b) => {
    const av = a[col], bv = b[col];
    if (av === null || av === undefined) return 1;
    if (bv === null || bv === undefined) return -1;
    return typeof av === 'string' ? av.localeCompare(bv) * dir : (av - bv) * dir;
  });

  if (data.length === 0) {
    tb.innerHTML = '';
    empty.style.display = 'block';
    document.getElementById('pagination').innerHTML = '';
    return;
  }
  empty.style.display = 'none';

  const start = (window._page - 1) * PAGE_SIZE;
  const page  = data.slice(start, start + PAGE_SIZE);

  tb.innerHTML = page.map((r, i) => {
    const rank = start + i + 1;
    const rs5  = r.rs_ret_5d  ?? null;
    const rs10 = r.rs_ret_10d ?? null;
    const rs20 = r.rs_ret_20d ?? null;
    const rs50 = r.rs_ret_50d ?? null;
    return `<tr>
      <td class="num neutral">${rank}</td>
      <td class="sym">${r.symbol}</td>
      <td>${fmtName(r)}</td>
      <td class="sector">${r.sector || '—'}</td>
      <td class="amount" style="text-align:right">${fmtMktCap(r.market_cap)}</td>
      <td>${compositeHero(r.rs_rating_composite)}</td>
      <td style="text-align:center">${ratingBadge(r.rs_rating_5d)}</td>
      <td class="num ${pctColor(rs5)}">${fmtPct(rs5)}</td>
      <td style="text-align:center">${ratingBadge(r.rs_rating_10d)}</td>
      <td class="num ${pctColor(rs10)}">${fmtPct(rs10)}</td>
      <td style="text-align:center">${ratingBadge(r.rs_rating_20d)}</td>
      <td class="num ${pctColor(rs20)}">${fmtPct(rs20)}</td>
      <td style="text-align:center">${ratingBadge(r.rs_rating_50d)}</td>
      <td class="num ${pctColor(rs50)}">${fmtPct(rs50)}</td>
      <td class="amount">${fmtAmount(r.amount)}</td>
      <td style="text-align:center">${stageTag(r.w_stage_label, r.w_signal, r.w_slope, r.w_reasons)}</td>
    </tr>`;
  }).join('');

  // Pagination
  const totalPages = Math.ceil(data.length / PAGE_SIZE);
  const pg = document.getElementById('pagination');
  let html = `<button class="page-btn" onclick="goPage(${window._page-1})" ${window._page===1?'disabled':''}>&#8592;</button>`;
  for (let p = Math.max(1, window._page-2); p <= Math.min(totalPages, window._page+4); p++) {
    html += `<button class="page-btn ${p===window._page?'active':''}" onclick="goPage(${p})">${p}</button>`;
  }
  html += `<button class="page-btn" onclick="goPage(${window._page+1})" ${window._page===totalPages?'disabled':''}>&#8594;</button>`;
  html += `<span class="page-info">${start+1}-${Math.min(start+PAGE_SIZE,data.length)} / ${data.length}</span>`;
  pg.innerHTML = html;

  // Sort indicators
  document.querySelectorAll('th[data-col]').forEach(th => {
    th.classList.remove('sort-asc','sort-desc');
    if (th.dataset.col === window._sortCol) {
      th.classList.add(window._sortDir === 1 ? 'sort-asc' : 'sort-desc');
    }
  });
}

function goPage(p) {
  const total = Math.ceil(window._filtered.length / PAGE_SIZE);
  window._page = Math.max(1, Math.min(p, total));
  render();
}

function sortBy(col) {
  if (window._sortCol === col) {
    window._sortDir *= -1;
  } else {
    window._sortCol = col;
    window._sortDir = col === 'rs_rating_composite' || col === 'rs_rating_5d' ? -1 : 1;
  }
  window._page = 1;
  render();
}

function applyFilters() {
  const q       = document.getElementById('f-search').value.trim().toLowerCase();
  const sector  = document.getElementById('f-sector').value;
  const comp    = document.getElementById('f-comp').value;
  const r5d     = document.getElementById('f-5d').value;
  const r20d    = document.getElementById('f-20d').value;
  const rs5     = document.getElementById('f-rs5d').value;

  const mcapChecked = [...document.querySelectorAll('input[name="mcap"]:checked')].map(cb => {
    const [a, b] = cb.value.split(',');
    return [parseFloat(a), b === 'Infinity' ? Infinity : parseFloat(b)];
  });
  const stageChecked = [...document.querySelectorAll('input[name="wstage"]:checked')].map(cb => parseInt(cb.value));
  const amountChecked = [...document.querySelectorAll('input[name="amount"]:checked')].map(cb => {
    const [a, b] = cb.value.split(',');
    return [parseFloat(a), b === 'Infinity' ? Infinity : parseFloat(b)];
  });

  window._filtered = window._raw.filter(r => {
    // Search: symbol or name
    if (q) {
      const name = ((r.name_en || '') + ' ' + (r.name_zh || '')).toLowerCase();
      if (!r.symbol.toLowerCase().includes(q) && !name.includes(q)) return false;
    }
    if (sector && r.sector !== sector) return false;
    const c = r.rs_rating_composite;
    if (comp === 'top'    && c < 81)  return false;
    if (comp === 'good'   && (c < 61 || c > 80))  return false;
    if (comp === 'ok'     && (c < 41 || c > 60))  return false;
    if (comp === 'bad'    && (c < 21 || c > 40))  return false;
    if (comp === 'bottom' && c > 20)  return false;
    const r5 = r.rs_rating_5d;
    if (r5d === 'top' && r5 < 81) return false;
    if (r5d === 'mid' && (r5 < 41 || r5 > 80)) return false;
    if (r5d === 'bot' && r5 > 40) return false;
    const r20 = r.rs_rating_20d;
    if (r20d === 'top' && r20 < 81) return false;
    if (r20d === 'mid' && (r20 < 41 || r20 > 80)) return false;
    if (r20d === 'bot' && r20 > 40) return false;
    if (mcapChecked.length > 0) {
      if (r.market_cap == null) return false;
      if (!mcapChecked.some(([lo, hi]) => r.market_cap >= lo && r.market_cap < hi)) return false;
    }
    if (amountChecked.length > 0) {
      if (r.amount == null) return false;
      if (!amountChecked.some(([lo, hi]) => r.amount >= lo && r.amount < hi)) return false;
    }
    if (stageChecked.length > 0 && !stageChecked.includes(r.w_stage || 0)) return false;
    const rs5v = r.rs_ret_5d;
    if (rs5 === 'pos' && (rs5v === null || rs5v === undefined || rs5v < 0)) return false;
    if (rs5 === 'neg' && (rs5v === null || rs5v === undefined || rs5v >= 0)) return false;
    return true;
  });
  window._page = 1;
  render();
}

function resetFilters() {
  document.getElementById('f-search').value = '';
  document.getElementById('f-sector').value = '';
  document.getElementById('f-comp').value   = '';
  document.getElementById('f-5d').value     = '';
  document.getElementById('f-20d').value    = '';
  deselectAllAmount();
  deselectAllMcap();
  deselectAllStage();
  document.getElementById('f-rs5d').value  = '';
  window._filtered = [...window._raw];
  window._page = 1;
  render();
}

function toggleMcapMenu(e) {
  e.stopPropagation();
  const m = document.getElementById('mcap-menu');
  m.style.display = m.style.display === 'none' ? 'block' : 'none';
}
function selectAllMcap() {
  document.querySelectorAll('input[name="mcap"]').forEach(cb => cb.checked = true);
  updateMcapBtn();
}
function deselectAllMcap() {
  document.querySelectorAll('input[name="mcap"]').forEach(cb => cb.checked = false);
  updateMcapBtn();
}
function updateMcapBtn() {
  const checked = document.querySelectorAll('input[name="mcap"]:checked');
  const total   = document.querySelectorAll('input[name="mcap"]').length;
  const btn = document.getElementById('mcap-btn');
  btn.textContent = (checked.length === 0 || checked.length === total) ? '全部市值 ▾' : `已選 ${checked.length} 項 ▾`;
}
document.addEventListener('click', () => {
  const m = document.getElementById('mcap-menu');
  if (m) m.style.display = 'none';
  const a = document.getElementById('amount-menu');
  if (a) a.style.display = 'none';
  const s = document.getElementById('stage-menu');
  if (s) s.style.display = 'none';
});


function toggleAmountMenu(e) {
  e.stopPropagation();
  const m = document.getElementById('amount-menu');
  m.style.display = m.style.display === 'none' ? 'block' : 'none';
}
function selectAllAmount() {
  document.querySelectorAll('input[name="amount"]').forEach(cb => cb.checked = true);
  updateAmountBtn();
}
function deselectAllAmount() {
  document.querySelectorAll('input[name="amount"]').forEach(cb => cb.checked = false);
  updateAmountBtn();
}
function updateAmountBtn() {
  const checked = document.querySelectorAll('input[name="amount"]:checked');
  const total   = document.querySelectorAll('input[name="amount"]').length;
  const btn = document.getElementById('amount-btn');
  if (btn) btn.textContent = (checked.length === 0 || checked.length === total) ? '全部成交額 ▾' : `已選 ${checked.length} 項 ▾`;
}

function toggleStageMenu(e) {
  e.stopPropagation();
  const m = document.getElementById('stage-menu');
  m.style.display = m.style.display === 'none' ? 'block' : 'none';
}
function selectAllStage() {
  document.querySelectorAll('input[name="wstage"]').forEach(cb => cb.checked = true);
  updateStageBtn();
}
function deselectAllStage() {
  document.querySelectorAll('input[name="wstage"]').forEach(cb => cb.checked = false);
  updateStageBtn();
}
function updateStageBtn() {
  const checked = document.querySelectorAll('input[name="wstage"]:checked');
  const total   = document.querySelectorAll('input[name="wstage"]').length;
  const btn = document.getElementById('stage-btn');
  btn.textContent = (checked.length === 0 || checked.length === total) ? '全部 Stage ▾' : `已選 ${checked.length} Stage ▾`;
}

// MemberShell.init 由各頁自行呼叫(市場不同),不在共用模組寫死。
