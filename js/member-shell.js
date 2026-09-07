/**
 * 會員區共用頁首/側邊欄。
 *
 * 各頁原本自己寫兩個「返回」連結,沒有品牌標記、沒有登出、同一份資料的
 * 三個市場之間也不能互跳(看完港股 RS 想看美股 RS,要退回資料庫首頁再點)。
 *
 * 兩種模式:
 *   - init(opts)                頂欄模式(原本行為,「增強」既有的
 *                                .page-header,不整個換掉,保留各頁靠 id
 *                                更新副標的邏輯)。
 *   - init({ sidebar: true, … }) 側邊欄模式:把整個 body 包進
 *                                「側邊欄 + 主內容」版面。目前只用在
 *                                login.html 與三個 RS 評分頁 —— 其餘頁面
 *                                維持頂欄模式,尚未逐一驗證側邊欄模式前
 *                                不擴大範圍。
 *
 * 用法(放在頁面 script 最後):
 *   MemberShell.init({ group: "rs", market: "hk" });
 *   MemberShell.init({ sidebar: true, section: "hk", group: "rs", market: "hk" });
 */
(function (global) {
  "use strict";

  var BRAND = "Edward LEE｜發掘十倍股";

  // 同一份資料的市場變體。合併頁面後只需改這裡。
  var GROUPS = {
    rs: {
      label: "相對強度評分",
      markets: [
        { id: "hk", name: "港股", href: "/member/rs/hk" },
        { id: "us", name: "美股", href: "/member/rs/us" },
        { id: "cn", name: "A股",  href: "/member/rs/cn" },
      ],
    },
    keywords: {
      label: "關鍵字資料庫",
      markets: [
        { id: "hk", name: "港股", href: "/member/keywords/hk" },
        { id: "us", name: "美股", href: "/member/keywords/us" },
        { id: "cn", name: "A股",  href: "/member/keywords/cn" },
      ],
    },
    stocks: {
      label: "股票資料庫",
      markets: [
        { id: "hk", name: "港股", href: "/member/stocks/hk" },
        { id: "us", name: "美股", href: "/member/stocks/us" },
      ],
    },
  };

  // 側邊欄導覽:對應 login.html 資料庫首頁的分類區塊(id="sec-hk" 等)。
  var SIDEBAR_SECTIONS = [
    { id: "home", label: "總覽",   href: "/member/" },
    { id: "hk",   label: "港股",   href: "/member/#sec-hk" },
    { id: "us",   label: "美股",   href: "/member/#sec-us" },
    { id: "cn",   label: "A 股",   href: "/member/#sec-cn" },
    { id: "daily",label: "每日追蹤", href: "/member/#sec-daily" },
    { id: "etf",  label: "ETF",    href: "/member/#sec-etf" },
  ];

  function el(tag, cls, html) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (html !== undefined) n.innerHTML = html;
    return n;
  }

  async function doLogout() {
    // 兩邊都要清:伺服器的 session cookie,以及本機存著的解密密碼。
    if (global.MemberAuth) {
      if (MemberAuth.logoutRemote) await MemberAuth.logoutRemote();
      if (MemberAuth.clear) MemberAuth.clear();
    }
    try { sessionStorage.clear(); } catch (err) {}
    location.href = "/member/";
  }

  function buildSidebar(opts) {
    var aside = el("aside", "shell-sidebar");
    var brand = el("div", "shell-sidebar-brand",
      '<a href="/"><span class="shell-sidebar-name">Edward LEE</span>' +
      '<span class="shell-sidebar-tag">發掘十倍股</span></a>');
    aside.appendChild(brand);

    var nav = el("nav", "shell-sidebar-nav");
    SIDEBAR_SECTIONS.forEach(function (s) {
      var a = el("a", s.id === opts.section ? "active" : "", s.label);
      a.href = s.href;
      nav.appendChild(a);
    });
    aside.appendChild(nav);

    var foot = el("div", "shell-sidebar-foot");
    var logout = el("a", "", "登出");
    logout.href = "#";
    logout.addEventListener("click", function (e) { e.preventDefault(); doLogout(); });
    foot.appendChild(logout);
    aside.appendChild(foot);

    return aside;
  }

  /** 把目前 body 的全部子節點包進「側邊欄 + 主內容」版面。 */
  function wrapSidebar(opts) {
    if (document.querySelector(".shell-sidebar")) return; // 已包過
    var body = document.body;
    var main = el("div", "shell-main");
    while (body.firstChild) main.appendChild(body.firstChild);

    var layout = el("div", "shell-layout");
    layout.appendChild(buildSidebar(opts));
    layout.appendChild(main);
    body.appendChild(layout);

    // 側邊欄模式下,頁首不再需要「返回首頁／返回資料庫首頁」—— 側邊欄的
    // 「總覽」已經是同一件事,兩個並存會顯得多餘。
    var header = main.querySelector(".page-header");
    if (header) {
      header.querySelectorAll(".back-btn").forEach(function (b) { b.remove(); });
    }
  }

  function init(opts) {
    opts = opts || {};

    if (opts.sidebar) wrapSidebar(opts);

    var header = document.querySelector(".page-header");
    if (!header) return;

    if (!opts.sidebar) {
      // 頂欄模式:品牌行 + 返回連結搬右側 + 登出(側邊欄模式這三者都已經
      // 在側邊欄裡處理,不在頁首重複)。
      var titleEl = header.querySelector(".page-title");
      if (titleEl && !header.querySelector(".shell-brand")) {
        var brand = el("div", "shell-brand", '<a href="/">' + BRAND + "</a>");
        titleEl.parentNode.insertBefore(brand, titleEl);
      }

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
        out.addEventListener("click", function (e) { e.preventDefault(); doLogout(); });
        actions.appendChild(out);
      }
    }

    // 市場切換:兩種模式都可能需要,固定放在頁首右側。
    var group = GROUPS[opts.group];
    if (group && !header.querySelector(".market-switch")) {
      var sw = el("div", "market-switch");
      group.markets.forEach(function (m) {
        var a = el("a", m.id === opts.market ? "active" : "", m.name);
        a.href = m.href;
        if (m.id === opts.market) a.setAttribute("aria-current", "page");
        sw.appendChild(a);
      });
      if (opts.sidebar) {
        var holder = header.querySelector(".shell-header-actions");
        if (!holder) {
          holder = el("div", "shell-header-actions");
          header.appendChild(holder);
        }
        holder.appendChild(sw);
      } else {
        header.querySelector(".shell-actions").insertBefore(sw, header.querySelector(".shell-actions").firstChild);
      }
    }
  }

  global.MemberShell = { init: init, BRAND: BRAND, GROUPS: GROUPS, SIDEBAR_SECTIONS: SIDEBAR_SECTIONS };
})(window);
