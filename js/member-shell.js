/**
 * 會員區共用頁首。
 *
 * 各頁原本自己寫兩個「返回」連結,沒有品牌標記、沒有登出、同一份資料的
 * 三個市場之間也不能互跳(看完港股 RS 想看美股 RS,要退回資料庫首頁再點)。
 *
 * 這支程式「增強」既有的 .page-header,而不是整個換掉 —— 因為各頁都靠
 * id 去更新副標(#data-date、#page-subtitle、#header-meta …),整個重畫
 * 會把那些元素弄丟。所以只做三件事:
 *   1. 在標題上方加一行品牌
 *   2. 把返回連結搬到右側,並補上登出
 *   3. 需要時插入市場切換
 *
 * 用法(放在頁面 script 最後):
 *   MemberShell.init({ group: "rs", market: "hk" });
 */
(function (global) {
  "use strict";

  var BRAND = "Edward LEE｜發掘十倍股";

  // 同一份資料的市場變體。合併頁面後只需改這裡。
  var GROUPS = {
    rs: {
      label: "相對強度評分",
      markets: [
        { id: "hk", name: "港股", href: "/hk-rs-rating.html" },
        { id: "us", name: "美股", href: "/us-rs-rating.html" },
        { id: "cn", name: "A股",  href: "/cn-rs-rating.html" },
      ],
    },
    keywords: {
      label: "關鍵字資料庫",
      markets: [
        { id: "hk", name: "港股", href: "/hk-keywords-pro.html" },
        { id: "us", name: "美股", href: "/us-keywords.html" },
        { id: "cn", name: "A股",  href: "/cn-keywords.html" },
      ],
    },
    stocks: {
      label: "股票資料庫",
      markets: [
        { id: "hk", name: "港股", href: "/hk-stocks-pro.html" },
        { id: "us", name: "美股", href: "/us-stocks-db.html" },
      ],
    },
  };

  function el(tag, cls, html) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (html !== undefined) n.innerHTML = html;
    return n;
  }

  function init(opts) {
    opts = opts || {};
    var header = document.querySelector(".page-header");
    if (!header) return;

    // 1. 品牌:放在標題區塊上方,讓會員頁一眼看得出仍在同一個網站
    var titleEl = header.querySelector(".page-title");
    if (titleEl && !header.querySelector(".shell-brand")) {
      var brand = el("div", "shell-brand",
        '<a href="/">' + BRAND + "</a>");
      titleEl.parentNode.insertBefore(brand, titleEl);
    }

    // 2. 把既有的返回連結搬到右側動作區,並補上登出
    var actions = header.querySelector(".shell-actions");
    if (!actions) {
      actions = el("div", "shell-actions");
      header.appendChild(actions);
    }
    var backs = header.querySelectorAll(":scope > .back-btn");
    for (var i = 0; i < backs.length; i++) actions.appendChild(backs[i]);

    if (!actions.querySelector(".shell-logout")) {
      var out = el("a", "back-btn shell-logout", "登出");
      out.href = "#";
      out.addEventListener("click", async function (e) {
        e.preventDefault();
        // 兩邊都要清:伺服器的 session cookie,以及本機存著的解密密碼。
        if (global.MemberAuth) {
          if (MemberAuth.logoutRemote) await MemberAuth.logoutRemote();
          if (MemberAuth.clear) MemberAuth.clear();
        }
        try { sessionStorage.clear(); } catch (err) {}
        location.href = "/login.html";
      });
      actions.appendChild(out);
    }

    // 3. 市場切換
    var group = GROUPS[opts.group];
    if (group && !header.querySelector(".market-switch")) {
      var sw = el("div", "market-switch");
      group.markets.forEach(function (m) {
        var a = el("a", m.id === opts.market ? "active" : "", m.name);
        a.href = m.href;
        if (m.id === opts.market) a.setAttribute("aria-current", "page");
        sw.appendChild(a);
      });
      actions.insertBefore(sw, actions.firstChild);
    }
  }

  global.MemberShell = { init: init, BRAND: BRAND, GROUPS: GROUPS };
})(window);
