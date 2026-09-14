/**
 * 港股基本面排名(會員版)。
 *
 * 資料:/hk_fundamental_ranking.enc(columnar,見 scripts/build_hk_ranking.py)
 * 804 隻股用同一把尺排名 —— 同「2026 中期業績前景庫」係兩件事,嗰邊逐間
 * 有文字分析,呢邊係全市場單一分數,用嚟快速篩名單。
 */
(function () {
  "use strict";

  var PAGE_SIZE = 50;
  var DATA = [];          // 攤平咗嘅物件陣列
  var META = {};
  var filtered = [];
  var page = 1;
  var sortCol = "rank";
  var sortDir = 1;        // 排名細 = 好,所以預設升序

  var $ = function (id) { return document.getElementById(id); };

  // ── 密碼閘 ────────────────────────────────────────────────
  async function checkPassword() {
    var val = $("pw-input").value;
    if (!val) return;
    var pw = await MemberAuth.login(val);
    if (pw) {
      sessionStorage.setItem("unified_auth", "1");
      sessionStorage.setItem("unified_auth_pw", pw);
      $("pw-overlay").style.display = "none";
      load(pw);
    } else {
      $("pw-error").textContent = "密碼錯誤，請再試";
      $("pw-input").value = "";
      $("pw-input").focus();
    }
  }

  async function load(pw) {
    try {
      var r = await fetch("/hk_fundamental_ranking.enc", { cache: "no-store" });
      if (r.status === 401) return MemberAuth.handleUnauthorized();
      if (!r.ok) throw new Error("HTTP " + r.status);
      var payload = await MemberAuth.decrypt(await r.text(), pw);
      META = payload;
      var cols = payload.columns;
      DATA = payload.rows.map(function (row) {
        var o = {};
        for (var i = 0; i < cols.length; i++) o[cols[i]] = row[i];
        return o;
      });
      init();
    } catch (e) {
      console.error(e);
      $("sub").textContent = "資料暫時載入唔到，請重新整理頁面。";
    }
  }

  // ── 呈現 ──────────────────────────────────────────────────
  function tier(score) {
    if (score >= 80) return ["a", "A 級"];
    if (score >= 70) return ["b", "B 級"];
    if (score >= 55) return ["c", "C 級"];
    return ["d", "D 級"];
  }

  function bar(v) {
    var pct = Math.max(0, Math.min(100, v));
    return '<span class="bar"><i style="width:' + pct.toFixed(1) + '%"></i>'
      + '<span>' + v.toFixed(1) + '</span></span>';
  }

  function fmtMcap(v) {
    if (v == null) return "—";
    return v >= 10000 ? (v / 10000).toFixed(2) + " 萬億" : Math.round(v).toLocaleString("en-US");
  }

  // 排名變動係呢版最有訊息量嘅一欄:同一把尺前後兩版比較,升得多
  // 通常代表業績剛剛轉好,值得優先睇。
  function changeCell(v) {
    if (v == null || v === 0) return '<td class="chg">—</td>';
    var up = v > 0;
    return '<td class="chg ' + (up ? "up" : "down") + '">'
      + (up ? "▲" : "▼") + Math.abs(v) + "</td>";
  }

  // 參考排名:單睇個名次冇乜用,同官方排名嘅落差先係重點 —— 爬升好多
  // 即係價格動能幫緊佢,跌好多即係股價拖住後腳。所以要同正式排名並排:
  // 擺喺最右嘅話,1440px 螢幕要向右捲二百幾 px 先見到,等於冇出過。
  function refRankCell(s) {
    if (s.ref_rank == null) return '<td class="refrank">—</td>';
    var d = s.rank - s.ref_rank;
    var mark = d === 0 ? "" : '<i class="' + (d > 0 ? "up" : "down") + '">'
      + (d > 0 ? "▲" : "▼") + Math.abs(d) + "</i>";
    return '<td class="refrank">' + s.ref_rank + mark + "</td>";
  }

  function gapCell(v) {
    if (v == null) return '<td class="sc">—</td>';
    var cls = v > 10 ? "down" : (v < -10 ? "up" : "");
    return '<td class="sc ' + cls + '">' + (v > 0 ? "+" : "") + v.toFixed(1) + "</td>";
  }

  function render() {
    var total = filtered.length;
    var pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
    if (page > pages) page = pages;
    var slice = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

    var html = "";
    slice.forEach(function (s) {
      var t = tier(s.fundamental);
      html += "<tr>"
        + '<td class="rank' + (s.rank <= 50 ? " top" : "") + '">' + s.rank + "</td>"
        + changeCell(s.rank_change)
        + refRankCell(s)
        + '<td class="ticker">' + s.ticker + "</td>"
        + '<td class="coname">' + escapeHtml(s.name) + "</td>"
        + '<td class="ind">' + escapeHtml(s.industry || "—") + "</td>"
        + '<td class="sc mcap">' + fmtMcap(s.mcap) + "</td>"
        + '<td class="sc mcap">' + (s.adv20 == null ? "—" : Math.round(s.adv20).toLocaleString("en-US")) + "</td>"
        + '<td class="sc"><b>' + bar(s.fundamental) + "</b></td>"
        + '<td class="sc">' + bar(s.business) + "</td>"
        + '<td class="sc">' + bar(s.financial) + "</td>"
        + '<td class="sc">' + bar(s.quality_risk) + "</td>"
        + '<td><span class="tier ' + t[0] + '">' + t[1] + "</span></td>"
        + '<td class="sc">' + (s.rs == null ? "—" : s.rs.toFixed(1)) + "</td>"
        + '<td class="sc">' + (s.price_momentum == null ? "—" : s.price_momentum.toFixed(1)) + "</td>"
        + gapCell(s.price_gap)
        + '<td class="sc ref">' + (s.ref_5050 == null ? "—" : s.ref_5050.toFixed(1)) + "</td>"
        + "</tr>";
    });
    $("table-body").innerHTML = html;
    $("empty-state").style.display = total ? "none" : "block";
    $("rank-table").style.display = total ? "" : "none";

    var counts = { a: 0, b: 0, c: 0, d: 0 };
    filtered.forEach(function (s) { counts[tier(s.fundamental)[0]]++; });
    $("stats-bar").innerHTML =
      "<span>共 <b>" + total.toLocaleString("en-US") + "</b> 隻</span>"
      + "<span>A 級 <b>" + counts.a + "</b></span>"
      + "<span>B 級 <b>" + counts.b + "</b></span>"
      + "<span>C 級 <b>" + counts.c + "</b></span>"
      + "<span>D 級 <b>" + counts.d + "</b></span>";

    var pag = $("pagination");
    pag.innerHTML = "";
    if (pages > 1) {
      pag.appendChild(btn("← 上一頁", page <= 1, function () { page--; render(); }));
      var label = document.createElement("span");
      label.textContent = "第 " + page + " / " + pages + " 頁";
      pag.appendChild(label);
      pag.appendChild(btn("下一頁 →", page >= pages, function () { page++; render(); }));
    }
  }

  function btn(text, disabled, onClick) {
    var b = document.createElement("button");
    b.type = "button";
    b.textContent = text;
    b.disabled = disabled;
    b.addEventListener("click", function () { onClick(); window.scrollTo(0, 0); });
    return b;
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  // ── 篩選與排序 ────────────────────────────────────────────
  function apply() {
    var q = $("f-search").value.trim().toLowerCase();
    var min = parseFloat($("f-min").value) || 0;
    var topN = parseInt($("f-rank").value, 10) || 0;
    var ind = $("f-industry").value;
    var mcap = parseFloat($("f-mcap").value) || 0;
    var adv = parseFloat($("f-adv").value) || 0;

    filtered = DATA.filter(function (s) {
      if (q && s.ticker.toLowerCase().indexOf(q) === -1
        && s.name.toLowerCase().indexOf(q) === -1) return false;
      if (min && s.fundamental < min) return false;
      if (topN && s.rank > topN) return false;
      if (ind && s.industry !== ind) return false;
      if (mcap && !(s.mcap >= mcap)) return false;
      // ADV20 缺失嘅唔當作通過 —— 篩流動性就係為咗剔走買唔到嘅嘢
      if (adv && !(s.adv20 >= adv)) return false;
      return true;
    });
    sort();
    page = 1;
    render();
  }

  function sort() {
    filtered.sort(function (a, b) {
      var x = a[sortCol], y = b[sortCol];
      // 缺值一律排到最後(唔理升定降序)—— 當成 0 會令佢哋喺升序時霸住頭幾行
      if (x == null && y == null) return 0;
      if (x == null) return 1;
      if (y == null) return -1;
      if (typeof x === "string") return sortDir * x.localeCompare(y, "zh-Hant");
      return sortDir * (x - y);
    });
  }

  function init() {
    $("app").style.display = "block";
    $("sub").textContent = META.count.toLocaleString("en-US") + " 隻港股 · "
      + META.version + " · 評分 " + (META.generated || "—")
      + (META.snapshot ? " · RS／價格動能快照 " + META.snapshot : "");

    var sel = $("f-industry");
    (META.industries || []).forEach(function (name) {
      var o = document.createElement("option");
      o.value = name; o.textContent = name;
      sel.appendChild(o);
    });

    $("f-search").addEventListener("input", debounce(apply, 180));
    ["f-min", "f-rank", "f-industry", "f-mcap", "f-adv"].forEach(function (id) {
      $(id).addEventListener("change", apply);
    });
    $("f-reset").addEventListener("click", function () {
      $("f-search").value = "";
      $("f-min").value = "0";
      $("f-rank").value = "0";
      $("f-industry").value = "";
      $("f-mcap").value = "0";
      $("f-adv").value = "0";
      sortCol = "rank"; sortDir = 1;
      markSort();
      apply();
    });

    document.querySelectorAll("#rank-table th").forEach(function (th) {
      th.addEventListener("click", function () {
        var col = th.dataset.col;
        if (col === sortCol) sortDir = -sortDir;
        else { sortCol = col; // 名次同文字欄預設升序(第 1 名 / A 字頭行先),分數先至係降序
          sortDir = (col === "rank" || col === "ref_rank" || col === "rank_prev"
            || col === "ticker" || col === "name" || col === "industry") ? 1 : -1; }
        markSort();
        sort();
        page = 1;
        render();
      });
    });

    markSort();
    apply();
  }

  function markSort() {
    document.querySelectorAll("#rank-table th").forEach(function (th) {
      th.classList.remove("sort-asc", "sort-desc");
      if (th.dataset.col === sortCol) {
        th.classList.add(sortDir === 1 ? "sort-asc" : "sort-desc");
      }
    });
  }

  function debounce(fn, ms) {
    var t = null;
    return function () { clearTimeout(t); t = setTimeout(fn, ms); };
  }

  // ── 說明面板 ──────────────────────────────────────────────
  var HELP_KEY = "_help_seen_hk-ranking";
  var panel = $("_help_panel");
  // 桌面第一次入嚟自動展開;手機一屏得咁少,展開會將成張表推到睇唔見,
  // 所以手機一律收起,要撳先開(同免費工具嗰套一致)。
  var wide = !window.matchMedia || window.matchMedia("(min-width:901px)").matches;
  try { if (wide && !localStorage.getItem(HELP_KEY)) panel.classList.add("open"); } catch (e) {}
  window._toggleHelp = function () {
    var open = panel.classList.toggle("open");
    if (!open) { try { localStorage.setItem(HELP_KEY, "1"); } catch (e) {} }
  };

  // ── 起步 ──────────────────────────────────────────────────
  document.addEventListener("DOMContentLoaded", async function () {
    $("pw-submit").addEventListener("click", checkPassword);
    $("pw-input").addEventListener("keydown", function (e) {
      if (e.key === "Enter") checkPassword();
      else $("pw-error").textContent = "";
    });
    var pw = sessionStorage.getItem("unified_auth_pw") || await MemberAuth.resume() || "";
    if (pw) {
      $("pw-overlay").style.display = "none";
      load(pw);
    } else {
      sessionStorage.removeItem("unified_auth");
      $("pw-input").focus();
    }
  });
})();
