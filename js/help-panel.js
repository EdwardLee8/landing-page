/**
 * 「點解讀」說明面板(共用元件)。
 *
 *   HelpPanel.init({
 *     id: "free-hk-stocks",        // localStorage key,每頁唔同
 *     mount: "#browse",            // 插喺邊(預設 .page-header)
 *     prepend: true,               // 插入容器最頂(預設插喺容器之後)
 *     flush: true,                 // 容器本身已經有左右內距,唔使再加
 *     title: "點解讀「…」",
 *     hint: "成長股同價值股點分?",  // 收起時都見到嘅一行字
 *     html: "<p>…</p>",
 *   });
 *
 * 開合策略:桌面第一次入嚟預設展開 —— 呢個面板嘅存在意義就係俾第一
 * 次見到呢堆數據嘅人睇。手機一屏得咁少,展開會將工具本身推到睇唔
 * 見,所以手機一律收起,靠 hint 嗰行字引。撳過「收埋」之後寫入
 * localStorage,之後每次都收起。
 */
(function (global) {
  "use strict";

  var MOBILE = 900;

  function init(opts) {
    if (!opts || !opts.html) return;
    var key = "_help_seen_" + (opts.id || "default");

    var wrap = document.createElement("div");
    wrap.className = "help-wrap" + (opts.flush ? " help-flush" : "");

    var bar = document.createElement("div");
    bar.className = "help-bar";

    var btn = document.createElement("button");
    btn.type = "button";
    btn.className = "help-btn";
    bar.appendChild(btn);

    if (opts.hint) {
      var hint = document.createElement("span");
      hint.className = "help-hint";
      hint.textContent = opts.hint;
      hint.addEventListener("click", function () { btn.click(); });
      bar.appendChild(hint);
    }
    wrap.appendChild(bar);

    var panel = document.createElement("div");
    panel.className = "help-panel";

    var head = document.createElement("h2");
    head.appendChild(document.createTextNode(opts.title || "點解讀"));
    var close = document.createElement("button");
    close.type = "button";
    close.className = "help-close";
    close.textContent = "收埋 ✕";
    head.appendChild(close);
    panel.appendChild(head);

    var body = document.createElement("div");
    body.innerHTML = opts.html; // 內容由頁面自己寫死,唔係用戶輸入
    panel.appendChild(body);
    wrap.appendChild(panel);

    var host = document.querySelector(opts.mount || ".page-header")
      || document.querySelector("main")
      || document.querySelector("header")
      || document.body;

    if (opts.prepend) host.insertBefore(wrap, host.firstChild);
    else if (host === document.body) host.insertBefore(wrap, host.firstChild);
    else host.insertAdjacentElement("afterend", wrap);

    var seen = false;
    try { seen = !!localStorage.getItem(key); } catch (e) { /* 私隱模式 */ }
    var wide = !global.matchMedia || global.matchMedia("(min-width:" + (MOBILE + 1) + "px)").matches;
    if (!seen && wide) panel.classList.add("open");

    function label() {
      var open = panel.classList.contains("open");
      btn.textContent = open ? "ⓘ 收埋說明" : "ⓘ 點解讀呢個工具";
      btn.setAttribute("aria-expanded", open ? "true" : "false");
      wrap.classList.toggle("help-open", open);
    }
    function toggle() {
      if (!panel.classList.toggle("open")) {
        try { localStorage.setItem(key, "1"); } catch (e) {}
      }
      label();
    }
    label();
    btn.addEventListener("click", toggle);
    close.addEventListener("click", toggle);
  }

  global.HelpPanel = { init: init };
})(window);
