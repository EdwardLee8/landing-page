// ============================================================
// content.js — 所有可變內容，只需改呢個檔案就可以更新網站
// ============================================================

const SITE_CONTENT = {

  // ── 基本資料 ──────────────────────────────────────────────
  author: {
    name: "Edward LEE",
    nameEn: "Edward LEE",
    tagline: "AI · 港股 · 美股 · 宏觀分析",
    subTagline: "分享真實投資視野，助你捕捉市場先機",
    bio: "與各位分享個人投資市場看法，內容涵蓋：個人選股組合參考（港股及美股）、每週市場回顧與下週走向預測、當期熱門行業趨勢與發展分析、投資者常犯錯誤與解決方法、曾經十倍股介紹與研究分享，並隨市場發展持續更新。",
    avatar: "https://img.etimg.com/thumb/msid-68631304,width-210,height-158,imgsize-410125,resizemode-75/bull1-getty-1200.jpg",
    email: "",
  },

  // ── 精選文章 ──────────────────────────────────────────────
  // platform: "patreon" | "facebook" | "instagram" | "threads" | "medium"
  // 如需更新文章：改 title、excerpt、date、url 即可
  articles: [
    {
      title: "個人選股組合參考（港股 + 美股）",
      excerpt: "分享個人持倉邏輯與選股思路，涵蓋港股及美股市場，解析每隻股票的入場理由與風險考量。",
      date: "2025-03-17",
      platform: "patreon",
      url: "https://www.patreon.com/edward10",
    },
    {
      title: "每週市場回顧：恒指與標普 500 走向分析",
      excerpt: "回顧本週港股及美股主要走勢，結合宏觀數據與技術分析，預判下週市場方向及關鍵支撐阻力位。",
      date: "2025-03-14",
      platform: "patreon",
      url: "https://www.patreon.com/edward10",
    },
    {
      title: "當期熱門行業趨勢：AI 硬件供應鏈佈局",
      excerpt: "深入分析 AI 硬件需求爆發對港股半導體及科技股的影響，哪些相關股票值得重點關注？",
      date: "2025-03-10",
      platform: "patreon",
      url: "https://www.patreon.com/edward10",
    },
    {
      title: "投資者常犯錯誤：追高殺低的心理根源",
      excerpt: "剖析散戶最常見的行為偏差——追漲殺跌背後的心理機制，以及如何建立系統性紀律克服情緒交易。",
      date: "2025-03-03",
      platform: "facebook",
      url: "https://www.facebook.com/28investment",
    },
    {
      title: "十倍股研究：曾經的港股傳奇個股回顧",
      excerpt: "回顧近年港股市場中出現過的十倍股案例，分析其共同特徵，尋找下一隻潛力大牛股的線索。",
      date: "2025-02-24",
      platform: "patreon",
      url: "https://www.patreon.com/edward10",
    },
    {
      title: "宏觀視野：美聯儲利率路徑對港股的影響",
      excerpt: "以 AI 輔助分析美聯儲最新表態，結合聯匯制度下港元利率走勢，判斷對港股資金流向的實際影響。",
      date: "2025-02-17",
      platform: "patreon",
      url: "https://www.patreon.com/edward10",
    },
  ],

  // ── Patreon 訂閱 Tier ────────────────────────────────────
  // 詳細 Tier 內容請到 Patreon 查看，所有 CTA 按鈕直接連去 Patreon
  // 如需改 price/features，直接改呢度；url 全部指向你嘅 Patreon
  tiers: [
    {
      name: "免費跟隨",
      nameEn: "Free",
      price: "免費",
      period: "",
      highlight: false,
      features: [
        "定期免費市場分析文章",
        "Facebook 及 Instagram 公開帖子",
        "投資基礎知識分享",
      ],
      cta: "免費訂閱",
      url: "https://www.patreon.com/edward10",
    },
    {
      name: "付費訂閱",
      nameEn: "Pro",
      price: "查看 Patreon",
      period: "",
      highlight: true,
      features: [
        "個人選股組合參考（港股 + 美股）",
        "每週市場回顧與下週走向預測",
        "熱門行業趨勢與發展深度分析",
        "投資者常犯錯誤與解決方法",
        "十倍股研究與分享",
      ],
      cta: "立即訂閱",
      url: "https://www.patreon.com/edward10",
    },
    {
      name: "支持創作",
      nameEn: "Support",
      price: "隨心支持",
      period: "",
      highlight: false,
      features: [
        "付費訂閱全部內容",
        "支持獨立投資分析創作",
        "優先回覆投資相關問題",
      ],
      cta: "了解更多",
      url: "https://www.patreon.com/edward10",
    },
  ],

  // ── 社交連結 ─────────────────────────────────────────────
  social: [
    {
      platform: "Patreon",
      label: "訂閱 Patreon — 深度投資分析",
      url: "https://www.patreon.com/edward10",
      highlight: true,
    },
    {
      platform: "Facebook",
      label: "Facebook 專頁 @28investment",
      url: "https://www.facebook.com/28investment",
      highlight: false,
    },
    {
      platform: "Instagram",
      label: "Instagram @edwardleeten",
      url: "https://www.instagram.com/edwardleeten/",
      highlight: false,
    },
    {
      platform: "Threads",
      label: "Threads @edwardleeten",
      url: "https://www.threads.com/@edwardleeten",
      highlight: false,
    },
  ],

  // ── SEO / OG ─────────────────────────────────────────────
  seo: {
    title: "Edward LEE · AI 投資分析",
    description: "分享港股及美股個人選股組合、每週市場回顧與走向預測、熱門行業趨勢分析。以 AI 輔助，捕捉市場先機。",
    ogImage: "assets/images/og-image.jpg",
    siteUrl: "https://edward10.netlify.app",
  },

};
