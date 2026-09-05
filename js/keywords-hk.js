/**
 * 港股關鍵字資料庫的頁面程式,由 hk-keywords.html(免費版資料)與
 * hk-keywords-pro.html(付費版資料)共用。兩頁原本是各自 871 行、
 * 僅差四個設定值的複製品,現改由頁面內的 KW_CONFIG 注入差異:
 *   helpKey / sessionKey / dataUrl / corrUrl
 * 需先載入 js/member-auth.js。
 */
(function(){
  const KEY = KW_CONFIG.helpKey;
  const panel = document.getElementById("_help_panel");
  if (!localStorage.getItem(KEY)) {
    panel.classList.add("open");
  }
  window._toggleHelp = function() {
    const isOpen = panel.classList.toggle("open");
    if (!isOpen) localStorage.setItem(KEY, "1");
  };
})();

// ── Password ──────────────────────────────────────────────
const _PW_HASH = MemberAuth.PW_HASH;
const SESSION_KEY = KW_CONFIG.sessionKey;
let _pw = sessionStorage.getItem(SESSION_KEY + "_pw") || "";
// _sha256 / _decryptEnc 已集中到 js/member-auth.js
const _sha256 = MemberAuth.sha256;
const _decryptEnc = (b64, pw) => MemberAuth.decrypt(b64, pw, SESSION_KEY);
async function checkPassword() {
  const raw = document.getElementById("pw-input").value;
  const dataPassword = await MemberAuth.login(raw);
  if (dataPassword) {
    _pw = dataPassword;
    sessionStorage.setItem(SESSION_KEY, "1");
    sessionStorage.setItem(SESSION_KEY + "_pw", _pw);
    document.getElementById("pw-overlay").style.display = "none";
    document.getElementById("app").style.display = "block";
    initApp();
  } else {
    document.getElementById("pw-error").textContent = "密碼錯誤，請重試";
    document.getElementById("pw-input").value = "";
    document.getElementById("pw-input").focus();
  }
}
document.getElementById("pw-submit").addEventListener("click", checkPassword);
document.getElementById("pw-input").addEventListener("keydown", e => {
  if (e.key === "Enter") checkPassword();
  document.getElementById("pw-error").textContent = "";
});
if (sessionStorage.getItem(SESSION_KEY) === "1" && _pw) {
  document.getElementById("pw-overlay").style.display = "none";
  document.getElementById("app").style.display = "block";
  initApp();
} else if (sessionStorage.getItem(SESSION_KEY) === "1" && !_pw) {
  sessionStorage.removeItem(SESSION_KEY);
}

// ── State ─────────────────────────────────────────────────
let DB = [], KW_INDEX = {}, KW_ZH_INDEX = {}, KW_TO_ZH = {}, SYM_TO_SUM = {}, SYM_TO_NZ = {}, SYM_TO_MCAP = {};
let currentTab = "kw2co", kwSearchTimer = null;
let CORR_DATA = null;
let corrLoaded = false, corrSearchQ = "";
let currentThresh  = "0.8";
let currentSector  = "";
let currentMinSize = 1;
let currentMethod  = "pearson";

function getMethodData() {
  return CORR_DATA.by_method ? CORR_DATA.by_method[currentMethod] : CORR_DATA;
}

function setMethod(m) {
  currentMethod = m;
  currentSector = "";
  document.querySelectorAll(".thresh-btn[data-method]").forEach(b =>
    b.classList.toggle("active", b.dataset.method === m));
  if (!corrLoaded) return;
  updateThreshInfo();
  buildSectorBar();
  if (corrSearchQ) renderCorrSearch(corrSearchQ);
  else renderCorrView();
}

function setMinSize(m) {
  currentMinSize = m;
  currentSector = "";
  document.querySelectorAll(".thresh-btn[data-m]").forEach(b =>
    b.classList.toggle("active", +b.dataset.m === m));
  if (!corrLoaded) return;
  updateThreshInfo();
  buildSectorBar();
  if (corrSearchQ) renderCorrSearch(corrSearchQ);
  else renderCorrView();
}

// ── Init ──────────────────────────────────────────────────
async function initApp() {
  try {
    const r = await fetch(KW_CONFIG.dataUrl);
    if (r.status === 401) return MemberAuth.handleUnauthorized(SESSION_KEY);
    DB = await _decryptEnc(await r.text(), _pw);
  } catch(e) {
    document.getElementById("stats-bar").innerHTML = `<span style="color:#ef5350">載入失敗: ${e.message}</span>`;
    return;
  }
  let totalKws = 0;
  for (const co of DB) {
    if (!co.kws) continue;
    for (const kw of co.kws) {
      totalKws++;
      const key = kw.e.toLowerCase().trim();
      if (!KW_INDEX[key]) {
        KW_INDEX[key] = { en: kw.e, zh: kw.z || "", companies: [] };
        if (kw.z) KW_ZH_INDEX[kw.z.trim()] = KW_INDEX[key];
      }
      KW_INDEX[key].companies.push({ s: co.s, n: co.n, nz: co.nz || "", sec: co.sec || "", w: kw.w || 0.5 });
    }
  }
  for (const e of Object.values(KW_INDEX)) e.companies.sort((a, b) => (SYM_TO_MCAP[b.s]||0) - (SYM_TO_MCAP[a.s]||0));
  for (const [k, v] of Object.entries(KW_INDEX)) if (v.zh) KW_TO_ZH[k] = v.zh;
  for (const co of DB) if (co.sum) SYM_TO_SUM[co.s] = co.sum;
  for (const co of DB) if (co.nz) SYM_TO_NZ[co.s] = co.nz;
  for (const co of DB) SYM_TO_MCAP[co.s] = co.mcap || 0;
  document.getElementById("stats-bar").innerHTML =
    `<span><b>${DB.length.toLocaleString()}</b> 間公司</span>` +
    `<span><b>${Object.keys(KW_INDEX).length.toLocaleString()}</b> 個關鍵字</span>` +
    `<span><b>${totalKws.toLocaleString()}</b> 個映射</span>`;
  document.getElementById("search-input").addEventListener("input", e => {
    const v = e.target.value;
    document.getElementById("clear-btn").classList.toggle("visible", v.length > 0);
    clearTimeout(kwSearchTimer);
    kwSearchTimer = setTimeout(() => runKwSearch(v.trim()), 250);
  });
}

// ── Tab switching ─────────────────────────────────────────
function switchTab(tab) {
  currentTab = tab;
  document.querySelectorAll(".tab").forEach(t => t.classList.toggle("active", t.dataset.tab === tab));
  document.getElementById("kw-panel").style.display   = tab === "corr" ? "none" : "block";
  document.getElementById("corr-panel").style.display = tab === "corr" ? "block" : "none";
  if (tab === "corr" && !corrLoaded) loadCorrData();
  if (tab === "kw2co") {
    document.getElementById("search-input").placeholder = "搜尋關鍵字（英文或中文）";
    document.getElementById("search-hint").textContent  = "輸入關鍵字，例如：real estate、房地產";
  } else if (tab === "co2kw") {
    document.getElementById("search-input").placeholder = "搜尋公司名稱、股票代號或中文名稱";
    document.getElementById("search-hint").textContent  = "輸入代號或名稱，例如：00700.HK、騰訊";
  }
}

// ── Load correlation clusters ────────────────────────────
async function loadCorrData() {
  try {
    const r = await fetch(KW_CONFIG.corrUrl);
    if (r.status === 401) return MemberAuth.handleUnauthorized(SESSION_KEY);
    CORR_DATA = await _decryptEnc(await r.text(), _pw);
    corrLoaded = true;
    updateThreshInfo();
    buildSectorBar();
    renderCorrView();
  } catch(e) {
    document.getElementById("corr-body").innerHTML =
      `<div class="empty" style="color:#ef5350">載入失敗: ${e.message}</div>`;
  }
}

// ── Sector filter bar ────────────────────────────────────
function buildSectorBar() {
  const tData = getMethodData().by_thresh[currentThresh];
  const filtered = tData.clusters.filter(cl => cl.n >= currentMinSize);
  const count = {};
  for (const cl of filtered) {
    const s = cl.top_sec || "";
    if (s) count[s] = (count[s] || 0) + 1;
  }
  const sectors = Object.keys(count).sort();
  const total = filtered.length;

  let html = `<button class="sec-btn active" data-sec="" onclick="setSector('')">全部<span class="sec-count">${total}</span></button>`;
  for (const s of sectors) {
    html += `<button class="sec-btn" data-sec="${escHtml(s)}" onclick="setSector('${escHtml(s)}')">${escHtml(secZh(s))}<span class="sec-count">${count[s]}</span></button>`;
  }
  document.getElementById("sector-bar").innerHTML = html;
}

function setSector(sec) {
  currentSector = sec;
  document.querySelectorAll(".sec-btn").forEach(b => b.classList.toggle("active", b.dataset.sec === sec));
  if (corrSearchQ) renderCorrSearch(corrSearchQ);
  else renderCorrView();
}

// ── Threshold switching ───────────────────────────────────
function setThresh(t) {
  currentThresh = t;
  currentSector = "";
  document.querySelectorAll(".thresh-btn[data-t]").forEach(b => b.classList.toggle("active", b.dataset.t === t));
  if (!corrLoaded) return;
  updateThreshInfo();
  buildSectorBar();
  if (corrSearchQ) renderCorrSearch(corrSearchQ);
  else renderCorrView();
}

function updateThreshInfo() {
  if (!CORR_DATA) return;
  const tData = getMethodData().by_thresh[currentThresh];
  const ug = getMethodData().unclustered_groups || [];
  const filtered = tData.clusters.filter(cl => cl.n >= currentMinSize);
  const filteredStocks = filtered.reduce((s,c)=>s+c.n,0);
  const minTxt = currentMinSize > 1 ? `（≥${currentMinSize} 股）` : "";
  document.getElementById("thresh-info").textContent =
    `${filtered.length} 個群組${minTxt}，涵蓋 ${filteredStocks} 間股票，另有 ${getMethodData().n_unclustered || ug.reduce((s,g)=>s+g.n,0)} 間未分群（按行業歸組）`;
}

// ── Corr search ───────────────────────────────────────────
function onCorrSearch(val) {
  corrSearchQ = val.trim();
  document.getElementById("cs-clear").classList.toggle("visible", corrSearchQ.length > 0);
  if (!corrLoaded) return;
  if (corrSearchQ) renderCorrSearch(corrSearchQ);
  else renderCorrView();
}

function clearCorrSearch() {
  document.getElementById("corr-search").value = "";
  document.getElementById("cs-clear").classList.remove("visible");
  corrSearchQ = "";
  if (corrLoaded) renderCorrView();
}

// ── Build unique sub-sector labels — multi-level disambiguation ──
function buildSubLabels(clusters) {
  const tc = s => s.replace(/\b\w/g, c => c.toUpperCase());
  const kwLabel = k => KW_TO_ZH[k.toLowerCase().trim()] || tc(k);
  const labels = {};
  for (let depth = 1; depth <= 5; depth++) {
    const keyOf = cl => (cl.top_sec||"") + "|" + (cl.top_kws||[]).slice(0,depth).join("|");
    const count = {};
    for (const cl of clusters) { const k=keyOf(cl); count[k]=(count[k]||0)+1; }
    for (const cl of clusters) {
      if (labels[cl.id] !== undefined) continue;
      const kws = cl.top_kws || [];
      if (count[keyOf(cl)] === 1 || depth === 5) {
        labels[cl.id] = kws.slice(0,depth).filter(Boolean).map(kwLabel).join(" · ");
      }
    }
  }
  for (const cl of clusters) {
    if (!labels[cl.id]) labels[cl.id] = (cl.top_kws?.[0] ? kwLabel(cl.top_kws[0]) : (cl.top_sec||""))+` #${cl.id}`;
  }
  return labels;
}

// ── Sector name translation ───────────────────────────────
const SEC_ZH = {
  "Financial Services": "金融服務",
  "Basic Materials": "基礎原材料",
  "Industrials": "工業",
  "Energy": "能源",
  "Communication Services": "通訊服務",
  "Consumer Cyclical": "可選消費",
  "Consumer Defensive": "必需消費",
  "Healthcare": "醫療保健",
  "Real Estate": "房地產",
  "Technology": "科技",
  "Utilities": "公用事業",
};
function secZh(s) { return SEC_ZH[s] || s || ""; }

// ── Render all (default) ──────────────────────────────────
function renderCorrView() {
  const tData = getMethodData().by_thresh[currentThresh];
  const allClusters = [...tData.clusters]
    .filter(cl => cl.n >= currentMinSize)
    .sort((a, b) => {
      const sa = (a.top_sec || "").localeCompare(b.top_sec || "");
      return sa !== 0 ? sa : b.n - a.n;
    });
  const subLabels = buildSubLabels(allClusters);
  const clusters = currentSector
    ? allClusters.filter(cl => (cl.top_sec || "") === currentSector)
    : allClusters;

  // Build set of all syms already in clusters (for UG dedup)
  const clusterSyms = new Set();
  for (const cl of allClusters) for (const co of cl.companies) clusterSyms.add(co.s);

  const ug = getMethodData().unclustered_groups || [];
  const ugFiltered = currentSector
    ? ug.filter(g => (g.sec || "") === currentSector)
    : [...ug].sort((a, b) => (a.sec || "").localeCompare(b.sec || ""));

  // Split named-sector vs mixed clusters
  const namedClusters = clusters.filter(cl => cl.top_sec);
  const mixedClusters = clusters.filter(cl => !cl.top_sec);

  const minTxt = currentMinSize > 1 ? `（≥${currentMinSize} 股）` : "";
  let html = `<div class="section-hdr">已分群股票 — 顯示 ${clusters.length} 個群組${minTxt}${currentSector ? `（${secZh(currentSector)}）` : ""}，每對相關系數 ≥ ${currentThresh}</div>`;
  for (const cl of namedClusters) html += renderClusterCard(cl, new Set(), false, subLabels[cl.id]);

  if (mixedClusters.length) {
    html += `<div class="section-hdr-lg">跨行業群組<span>— ${mixedClusters.length} 個群組，股票跨越多個行業</span></div>`;
    for (const cl of mixedClusters) html += renderClusterCard(cl, new Set(), false, subLabels[cl.id]);
  }

  if (ugFiltered.length) {
    html += `<div class="section-hdr-lg">未分群股票（按行業歸組）<span>— 與其他股票相關系數均 &lt; 0.60</span></div>`;
    for (const g of ugFiltered) html += renderSectorGroupCard(g, new Set(), false, clusterSyms);
  }

  document.getElementById("corr-body").innerHTML = html;
}

// ── Render search result ──────────────────────────────────
function renderCorrSearch(q) {
  const tData = getMethodData().by_thresh[currentThresh];
  const allClusters = tData.clusters.filter(cl => cl.n >= currentMinSize);
  const subLabels = buildSubLabels(allClusters);
  const clusters = currentSector
    ? allClusters.filter(cl => (cl.top_sec || "") === currentSector)
    : allClusters;
  const symToCluster = tData.sym_to_cluster || {};
  const ug = currentSector
    ? (getMethodData().unclustered_groups || []).filter(g => (g.sec || "") === currentSector)
    : (getMethodData().unclustered_groups || []);
  const ql = q.toLowerCase();

  const matchSyms = new Set();
  for (const cl of clusters) {
    for (const co of cl.companies) {
      const nz = SYM_TO_NZ[co.s] || "";
      if (co.s.toLowerCase().includes(ql) || co.n.toLowerCase().includes(ql) || nz.includes(q))
        matchSyms.add(co.s);
    }
  }
  let matchUg = [];
  for (const g of ug) {
    const found = g.companies.filter(co => {
      const nz = SYM_TO_NZ[co.s] || "";
      return co.s.toLowerCase().includes(ql) || co.n.toLowerCase().includes(ql) || nz.includes(q);
    });
    if (found.length) matchUg.push({ g, found });
  }

  if (!matchSyms.size && !matchUg.length) {
    document.getElementById("corr-body").innerHTML = `<div class="empty">找不到「${escHtml(q)}」</div>`;
    return;
  }

  const clusterIds = new Set();
  for (const s of matchSyms) {
    const cid = symToCluster[s];
    if (cid !== undefined) clusterIds.add(cid);
  }

  let html = "";
  if (clusterIds.size) {
    html += `<div class="section-hdr">所屬群組（${clusterIds.size} 個）</div>`;
    for (const cid of clusterIds) {
      const cl = clusters.find(c => c.id === cid);
      if (cl) html += renderClusterCard(cl, matchSyms, true, subLabels[cid]);
    }
  }
  if (matchUg.length) {
    html += `<div class="section-hdr">行業分組（未分群）</div>`;
    for (const { g, found } of matchUg) {
      html += renderSectorGroupCard(g, new Set(found.map(c => c.s)), true);
    }
  }

  document.getElementById("corr-body").innerHTML = html || `<div class="empty">無群組記錄</div>`;
  clusterIds.forEach(cid => openCluster("cl-" + cid));
  matchUg.forEach(({ g }) => openCluster("sg-" + g.sec.replace(/\s+/g, "_")));
}

// ── Render cluster card ───────────────────────────────────
function renderClusterCard(cl, highlightSyms, autoOpen, subLabel) {
  const isHighlighted = cl.companies.some(c => highlightSyms.has(c.s));
  const rawDesc = cl.desc || {};
  const descEn = typeof rawDesc === "object" ? (rawDesc.en || "") : String(rawDesc);
  const descZh = typeof rawDesc === "object" ? (rawDesc.zh || "") : "";

  const kws = cl.top_kws || [];
  const subSec = subLabel !== undefined ? subLabel
    : (kws.length ? kws[0].replace(/\b\w/g, c => c.toUpperCase()) : "");
  const secLabel = secZh(cl.top_sec) || "跨行業";

  // Filter out R-shares when their regular counterpart is also in this cluster
  const allSyms = new Set(cl.companies.map(co => co.s));
  const companies = cl.companies.filter(co => {
    const m = co.s.match(/^8(\d{4}\.HK)$/);
    return !(m && allSyms.has(m[1]));
  });
  // Skip cluster if only 1 company remains after dedup
  if (companies.length < 2) return "";

  const cosHtml = [...companies].sort((a,b)=>(SYM_TO_MCAP[b.s]||0)-(SYM_TO_MCAP[a.s]||0)).map(co => {
    const isTarget = highlightSyms.has(co.s);
    const nz = SYM_TO_NZ[co.s] || co.nz || "";
    const nzShort = nz.length > 12 ? nz.slice(0,12)+"…" : nz;
    const enShort = co.n.length > 20 ? co.n.slice(0,20)+"…" : co.n;
    const sum = SYM_TO_SUM[co.s] || "";
    const sumShort = sum.length > 120 ? sum.slice(0,120)+"…" : sum;
    return `<div class="cl-co ${isTarget ? "target" : ""}" onclick="jumpToCompany('${escHtml(co.s)}')">
      <div class="cl-co-sym">${escHtml(co.s.replace(".HK",""))}</div>
      ${nzShort ? `<div class="cl-co-namez">${escHtml(nzShort)}</div>` : ""}
      <div class="cl-co-name">${escHtml(enShort)}</div>
      ${sumShort ? `<div class="cl-co-sum">${escHtml(sumShort)}</div>` : ""}
    </div>`;
  }).join("");

  const skipN = subSec ? (subSec.split(" · ").length) : 0;
  const kwsHtml = kws.slice(skipN).map(k => `<span class="cl-kw">${escHtml(k)}</span>`).join("");

  const cardId = "cl-" + cl.id;
  return `<div class="cl-card ${isHighlighted ? "highlighted" : ""}" id="${cardId}">
    <div class="cl-head" onclick="toggleCluster('${cardId}')">
      <span class="cl-badge">${companies.length} 間</span>
      <div class="cl-title-wrap">
        <div class="cl-title">${escHtml(secLabel)}${subSec ? ` <span style="color:#d4a64799;font-weight:400;font-size:13px">— ${escHtml(subSec)}</span>` : ""}</div>
        ${descEn ? `<div class="cl-desc-en">${escHtml(descEn)}</div>` : ""}
        ${descZh ? `<div class="cl-desc-zh">${escHtml(descZh)}</div>` : ""}
      </div>
      <span class="cl-chevron">▼</span>
    </div>
    <div class="cl-body">
      <div class="cl-companies">${cosHtml}</div>
      ${kwsHtml ? `<div class="cl-kws">${kwsHtml}</div>` : ""}
    </div>
  </div>`;
}

// ── Render sector group card (unclustered) ────────────────
function renderSectorGroupCard(g, highlightSyms, autoOpen, excludeSyms) {
  const cardId = "sg-" + g.sec.replace(/\s+/g, "_");
  const exclude = excludeSyms || new Set();
  const companies = g.companies.filter(co => !exclude.has(co.s)).sort((a,b)=>(SYM_TO_MCAP[b.s]||0)-(SYM_TO_MCAP[a.s]||0));
  if (!companies.length) return "";
  const cosHtml = companies.map(co => {
    const isTarget = highlightSyms.has(co.s);
    const nz = SYM_TO_NZ[co.s] || co.nz || "";
    const nzShort = nz.length > 12 ? nz.slice(0,12)+"…" : nz;
    const enShort = co.n.length > 18 ? co.n.slice(0,18)+"…" : co.n;
    const sum = SYM_TO_SUM[co.s] || "";
    const sumShort = sum.length > 120 ? sum.slice(0,120)+"…" : sum;
    return `<div class="cl-co ${isTarget ? "target" : ""}" onclick="jumpToCompany('${escHtml(co.s)}')">
      <div class="cl-co-sym">${escHtml(co.s.replace(".HK",""))}</div>
      ${nzShort ? `<div class="cl-co-namez">${escHtml(nzShort)}</div>` : ""}
      <div class="cl-co-name">${escHtml(enShort)}</div>
      ${sumShort ? `<div class="cl-co-sum">${escHtml(sumShort)}</div>` : ""}
    </div>`;
  }).join("");

  return `<div class="cl-card sector-card" id="${cardId}">
    <div class="cl-head" onclick="toggleCluster('${cardId}')">
      <span class="cl-badge sector-badge">${companies.length} 間</span>
      <div class="cl-title-wrap">
        <div class="cl-title">${escHtml(secZh(g.sec))}</div>
        <div class="cl-desc-zh">此行業內與其他股票相關系數均低於 0.60，未能歸入相關群組</div>
      </div>
      <span class="cl-chevron">▼</span>
    </div>
    <div class="cl-body">
      <div class="cl-companies">${cosHtml}</div>
    </div>
  </div>`;
}

// Toggle cluster open/close
const openClusters = new Set();
function toggleCluster(id) {
  const el = document.getElementById(id);
  if (!el) return;
  if (openClusters.has(id)) { openClusters.delete(id); el.classList.remove("open"); }
  else { openClusters.add(id); el.classList.add("open"); }
}
function openCluster(id) {
  const el = document.getElementById(id);
  if (el && !openClusters.has(id)) { openClusters.add(id); el.classList.add("open"); }
}

// ── Keyword search ────────────────────────────────────────
function clearKwSearch() {
  document.getElementById("search-input").value = "";
  document.getElementById("clear-btn").classList.remove("visible");
  document.getElementById("results").innerHTML = '<div class="empty">請輸入搜尋內容</div>';
}

function runKwSearch(query) {
  if (!query) { document.getElementById("results").innerHTML = '<div class="empty">請輸入搜尋內容</div>'; return; }
  if (currentTab === "kw2co") searchKw2Co(query);
  else searchCo2Kw(query);
}

function searchKw2Co(query) {
  const q = query.toLowerCase(), results = [];
  if (KW_INDEX[q]) results.push({ entry: KW_INDEX[q], score: 2 });
  for (const [key, entry] of Object.entries(KW_INDEX)) {
    if (key !== q && key.includes(q)) results.push({ entry, score: 1 });
  }
  for (const [zh, entry] of Object.entries(KW_ZH_INDEX)) {
    if (!results.some(r => r.entry === entry) && zh.includes(query)) results.push({ entry, score: 1.5 });
  }
  results.sort((a, b) => b.score - a.score || b.entry.companies.length - a.entry.companies.length);
  const top = results.slice(0, 50);
  const div = document.getElementById("results");
  if (!top.length) { div.innerHTML = `<div class="result-count">找不到相關關鍵字</div>`; return; }
  let html = `<div class="result-count">找到 <b>${results.length}</b> 個關鍵字，顯示前 ${top.length} 個</div>`;
  for (const { entry } of top) {
    const cos = entry.companies.slice(0, 60);
    html += `<div class="kw-result-card"><div class="kw-result-header">
      ${entry.zh ? `<span class="kw-result-zh">${hl(entry.zh, query)}</span>` : ""}
      <span class="kw-result-en">${hl(entry.en, query)}</span>
      <span class="kw-result-count">${entry.companies.length} 間</span>
    </div><div class="kw-co-list">`;
    for (const co of cos) {
      const sym = co.s.replace(".HK","");
      const namez = co.nz || "";
      const namen = co.n.length>30?co.n.slice(0,30)+"…":co.n;
      const sum = (SYM_TO_SUM[co.s]||"").slice(0,100);
      html += `<div class="kw-co-item" onclick="jumpToCompany('${escHtml(co.s)}')">
        <div class="kw-co-header">
          <span class="kw-co-sym">${escHtml(sym)}</span>
          <span class="kw-co-namez">${escHtml(namez||namen)}</span>
          ${namez?`<span class="kw-co-name">${escHtml(namen)}</span>`:""}
        </div>
        ${sum?`<div class="kw-co-sum">${escHtml(sum)}</div>`:""}
      </div>`;
    }
    if (entry.companies.length > 60) html += `<div style="font-size:12px;color:#666;align-self:center;padding:4px 8px">…還有 ${entry.companies.length-60} 間</div>`;
    html += `</div></div>`;
  }
  div.innerHTML = html;
}

function searchCo2Kw(query) {
  const q = query.toLowerCase(), matches = [];
  for (const co of DB) {
    const sm = co.s.toLowerCase().includes(q);
    const nm = co.n.toLowerCase().includes(q);
    const nzm = (co.nz||"").includes(query);
    if (sm || nm || nzm) matches.push({ co, score: sm ? (co.s.toLowerCase()===q?3:2) : (nzm?1.5:1) });
  }
  matches.sort((a, b) => b.score - a.score);
  const top = matches.slice(0, 30);
  const div = document.getElementById("results");
  if (!top.length) { div.innerHTML = `<div class="result-count">找不到相關公司</div>`; return; }
  let html = `<div class="result-count">找到 <b>${matches.length}</b> 間公司，顯示前 ${top.length} 間</div>`;
  for (const { co } of top) {
    const kws = (co.kws||[]).slice(0,25);
    const symDisplay = co.s.replace(".HK","");
    html += `<div class="company-card"><div class="company-header">
      <span class="co-symbol">${hl(symDisplay,query.toUpperCase())}</span>
      <span class="co-name">${hl(co.n,query)}</span>
      ${co.nz?`<span class="co-name-zh">${hl(co.nz,query)}</span>`:""}
      ${co.sec?`<span class="co-sector">${escHtml(co.sec)}</span>`:""}
    </div>`;
    if (co.ind) html += `<div class="co-industry">${escHtml(co.ind)}</div>`;
    if (co.sum) html += `<div class="co-summary">${escHtml(co.sum)}</div>`;
    if (kws.length) {
      html += `<div class="kw-list">`;
      for (const kw of kws) {
        html += `<span class="kw-tag ${kwColor(kw.w)}" onclick="searchByKw('${escHtml(kw.z||kw.e)}')">
          ${kw.z?`<span class="kw-zh">${escHtml(kw.z)}</span><span class="kw-dot">·</span>`:""}
          <span class="kw-en">${escHtml(kw.e)}</span>
        </span>`;
      }
      html += `</div>`;
    } else html += `<div style="font-size:12px;color:#555">無關鍵字資料</div>`;
    html += `</div>`;
  }
  div.innerHTML = html;
}

function jumpToCompany(symbol) {
  switchTab("co2kw");
  const input = document.getElementById("search-input");
  input.value = symbol;
  document.getElementById("clear-btn").classList.add("visible");
  runKwSearch(symbol);
}
function searchByKw(kw) {
  switchTab("kw2co");
  const input = document.getElementById("search-input");
  input.value = kw;
  document.getElementById("clear-btn").classList.add("visible");
  runKwSearch(kw);
}

function hl(text, query) {
  if (!query) return escHtml(text);
  return escHtml(text).replace(new RegExp(query.replace(/[.*+?^${}()|[\]\\]/g,"\\$&"),"gi"), m=>`<mark>${m}</mark>`);
}
function escHtml(s) {
  return String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
}
function kwColor(w) { return w>=0.8?"kw-high":w>=0.6?"kw-mid":"kw-low"; }
