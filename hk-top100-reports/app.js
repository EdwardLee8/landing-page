
const state = { companies: [], industry: "全部", q: "", sort: "rank", active: null };

const els = {
  grid: document.getElementById("grid"),
  chips: document.getElementById("chips"),
  count: document.getElementById("count"),
  stats: document.getElementById("stats"),
  q: document.getElementById("q"),
  sort: document.getElementById("sort"),
  browse: document.getElementById("browse"),
  article: document.getElementById("article"),
  viewer: document.getElementById("viewer"),
  artTitle: document.getElementById("artTitle"),
  artMeta: document.getElementById("artMeta"),
  toc: document.getElementById("toc"),
};

function fmtCap(n) {
  if (!n) return "—";
  const yi = n / 1e8;
  if (yi >= 10000) return (yi / 10000).toFixed(2) + " 萬億港元";
  return Math.round(yi).toLocaleString("zh-Hant") + " 億港元";
}

function industries() {
  const set = new Set(state.companies.map((c) => c.industry));
  return ["全部", ...[...set].sort((a, b) => a.localeCompare(b, "zh-Hant"))];
}

function filtered() {
  const q = state.q.trim().toLowerCase().replace(/\.hk$/, "");
  let rows = state.companies.filter((c) => {
    if (state.industry !== "全部" && c.industry !== state.industry) return false;
    if (!q) return true;
    return [c.shortName, c.code, c.symbol, c.name_en, c.title].join(" ").toLowerCase().includes(q);
  });
  if (state.sort === "name") rows = [...rows].sort((a, b) => a.shortName.localeCompare(b.shortName, "zh-Hant"));
  else if (state.sort === "code") rows = [...rows].sort((a, b) => a.symbol.localeCompare(b.symbol));
  else rows = [...rows].sort((a, b) => a.rank - b.rank);
  return rows;
}

function renderChips() {
  els.chips.innerHTML = "";
  industries().forEach((name) => {
    const b = document.createElement("button");
    b.className = "chip" + (state.industry === name ? " active" : "");
    b.textContent = name;
    b.onclick = () => { state.industry = name; renderBrowse(); };
    els.chips.appendChild(b);
  });
}

function renderBrowse() {
  renderChips();
  const rows = filtered();
  els.count.textContent = `顯示 ${rows.length} / ${state.companies.length} 間公司`;
  els.grid.innerHTML = "";
  rows.forEach((c) => {
    const d = document.createElement("article");
    d.className = "card";
    d.innerHTML = `<div class="rank">#${c.rank}</div><h3>${c.shortName}</h3><div class="code">${c.code}</div><div class="cap">${fmtCap(c.market_cap)}</div><span class="tag">${c.industry}</span>`;
    d.onclick = () => openArticle(c.symbol);
    els.grid.appendChild(d);
  });
}

function syncUrl(symbol) {
  const url = new URL(window.location.href);
  if (symbol) url.searchParams.set("s", symbol);
  else url.searchParams.delete("s");
  history.replaceState({}, "", url);
}

async function openArticle(symbol) {
  const c = state.companies.find((x) => x.symbol === symbol);
  if (!c) return;
  state.active = c;
  els.browse.classList.add("hidden");
  els.article.classList.remove("hidden");
  els.artTitle.textContent = c.shortName;
  els.artMeta.textContent = `${c.code} · 市值排名 #${c.rank} · ${c.industry} · ${fmtCap(c.market_cap)}`;
  els.viewer.textContent = "載入中…";
  els.toc.innerHTML = "";
  syncUrl(symbol);
  try {
    const res = await fetch("reports/" + c.file, { cache: "no-store" });
    if (!res.ok) throw new Error("讀取報告失敗");
    const md = await res.text();
    els.viewer.innerHTML = DOMPurify.sanitize(marked.parse(md, { breaks: true, gfm: true }));
    const heads = [...els.viewer.querySelectorAll("h2")];
    heads.forEach((h, i) => {
      h.id = h.id || "sec-" + i;
      const a = document.createElement("a");
      a.href = "#" + h.id;
      a.textContent = h.textContent;
      els.toc.appendChild(a);
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  } catch (err) {
    els.viewer.textContent = err.message;
  }
}

function closeArticle() {
  state.active = null;
  els.article.classList.add("hidden");
  els.browse.classList.remove("hidden");
  syncUrl(null);
}

async function init() {
  const data = await (await fetch("data/companies.json", { cache: "no-store" })).json();
  state.companies = data.companies;
  els.stats.textContent = `${data.count} 間公司 · 報告日 2026-09`;
  document.getElementById("brandHome").onclick = closeArticle;
  document.getElementById("back").onclick = closeArticle;
  els.q.addEventListener("input", () => { state.q = els.q.value; renderBrowse(); });
  els.sort.addEventListener("change", () => { state.sort = els.sort.value; renderBrowse(); });
  renderBrowse();
  const s = new URL(window.location.href).searchParams.get("s");
  if (s) openArticle(s);
}

init().catch((err) => {
  els.grid.textContent = "載入失敗：" + err.message;
});
