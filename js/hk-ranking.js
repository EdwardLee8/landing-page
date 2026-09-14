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

  function render() {
    var total = filtered.length;
    var pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
    if (page > pages) page = pages;
    var slice = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

    var html = "";
    slice.forEach(function (s) {
      var t = tier(s.fundamental_score);
      html += "<tr>"
        + '<td class="rank' + (s.rank <= 50 ? " top" : "") + '">' + s.rank + "</td>"
        + '<td class="ticker">' + s.ticker + "</td>"
        + '<td class="coname">' + escapeHtml(s.company_name) + "</td>"
        + '<td class="sc"><b>' + bar(s.fundamental_score) + "</b></td>"
        + '<td class="sc">' + bar(s.business_score) + "</td>"
        + '<td class="sc">' + bar(s.financial_score) + "</td>"
        + '<td class="sc">' + bar(s.quality_risk_score) + "</td>"
        + '<td><span class="tier ' + t[0] + '">' + t[1] + "</span></td>"
        + "</tr>";
    });
    $("table-body").innerHTML = html;
    $("empty-state").style.display = total ? "none" : "block";
    $("rank-table").style.display = total ? "" : "none";

    var counts = { a: 0, b: 0, c: 0, d: 0 };
    filtered.forEach(function (s) { counts[tier(s.fundamental_score)[0]]++; });
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

    filtered = DATA.filter(function (s) {
      if (q && s.ticker.toLowerCase().indexOf(q) === -1
        && s.company_name.toLowerCase().indexOf(q) === -1) return false;
      if (min && s.fundamental_score < min) return false;
      if (topN && s.rank > topN) return false;
      return true;
    });
    sort();
    page = 1;
    render();
  }

  function sort() {
    filtered.sort(function (a, b) {
      var x = a[sortCol], y = b[sortCol];
      if (typeof x === "string") return sortDir * x.localeCompare(y, "zh-Hant");
      return sortDir * (x - y);
    });
  }

  function init() {
    $("app").style.display = "block";
    $("sub").textContent = META.count.toLocaleString("en-US") + " 隻港股 · "
      + META.version + " · 資料日期 " + META.generated;

    $("f-search").addEventListener("input", debounce(apply, 180));
    $("f-min").addEventListener("change", apply);
    $("f-rank").addEventListener("change", apply);
    $("f-reset").addEventListener("click", function () {
      $("f-search").value = "";
      $("f-min").value = "0";
      $("f-rank").value = "0";
      sortCol = "rank"; sortDir = 1;
      markSort();
      apply();
    });

    document.querySelectorAll("#rank-table th").forEach(function (th) {
      th.addEventListener("click", function () {
        var col = th.dataset.col;
        if (col === sortCol) sortDir = -sortDir;
        else { sortCol = col; sortDir = (col === "rank" || col === "ticker" || col === "company_name") ? 1 : -1; }
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
