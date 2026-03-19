// ============================================================
// content.js — 所有可變內容，只需改呢個檔案就可以更新網站
// ============================================================

const SITE_CONTENT = {

  // ── 基本資料 ──────────────────────────────────────────────
  author: {
    name: "陳大文",
    nameEn: "David Chan",
    tagline: "港股 · 美股 · 宏觀分析",
    subTagline: "精準捕捉市場先機，深度解讀財報訊號",
    bio: "十年市場研究經驗，專注港股盈利預警信號、美股財報分析及宏觀趨勢研判。每週定期發布深度分析報告，助你在噪音中找到真正的投資機會。",
    avatar: "assets/images/profile.webp",   // 換成自己頭像
    email: "contact@example.com",           // 換成自己電郵（選填）
  },

  // ── 精選文章 ──────────────────────────────────────────────
  // platform: "patreon" | "facebook" | "instagram" | "threads" | "medium"
  articles: [
    {
      title: "港股盈利警告潮：哪些行業最危險？",
      excerpt: "拆解 2024 年下半年 HKEXNEWS 盈利警告數據，發現地產、零售、餐飲三大板塊集中暴雷，揭示背後的共同因素。",
      date: "2025-03-10",
      platform: "patreon",
      url: "https://www.patreon.com/",      // 換成真實文章連結
    },
    {
      title: "美聯儲點陣圖解讀：2025 下半年利率路徑",
      excerpt: "逐格分析最新 FOMC 會議紀錄，結合 PCE 通脹走勢，判斷減息時間表對港股科技股的實際影響。",
      date: "2025-03-03",
      platform: "facebook",
      url: "https://www.facebook.com/",    // 換成真實文章連結
    },
    {
      title: "財報季必看：三個判斷管理層信心的指標",
      excerpt: "從股票回購規模、期權行使價格到分拆派息比率，教你在財報數字背後讀懂管理層對未來業績的真實預期。",
      date: "2025-02-24",
      platform: "patreon",
      url: "https://www.patreon.com/",     // 換成真實文章連結
    },
    {
      title: "騰訊 FY2024：遊戲復甦，但廣告才是關鍵",
      excerpt: "深度拆解騰訊全年財報，廣告收入增速超市場預期 12%，微信視頻號商業化進度成下半年最大催化劑。",
      date: "2025-02-17",
      platform: "threads",
      url: "https://www.threads.net/",     // 換成真實文章連結
    },
    {
      title: "內幕消息雷達：本週五大值得關注公告",
      excerpt: "本週 HKEXNEWS 內幕消息中，有五份公告藏有重要訊號。我用量化模型篩出異常成交量配合，逐一分析。",
      date: "2025-02-10",
      platform: "patreon",
      url: "https://www.patreon.com/",     // 換成真實文章連結
    },
    {
      title: "黃金突破 3000：避險還是通脹交易？",
      excerpt: "黃金與美債實際利率的關係在 2024 年底出現罕見背離。剖析背後的央行購金潮與地緣政治因素。",
      date: "2025-02-03",
      platform: "instagram",
      url: "https://www.instagram.com/",   // 換成真實文章連結
    },
  ],

  // ── Patreon 訂閱 Tier ────────────────────────────────────
  tiers: [
    {
      name: "基礎訂閱",
      nameEn: "Basic",
      price: "HK$68",
      period: "/ 月",
      highlight: false,
      features: [
        "每月 4 篇精選市場分析",
        "港股盈利警告週報",
        "Patreon 社群討論",
      ],
      cta: "立即訂閱",
      url: "https://www.patreon.com/",     // 換成真實 Patreon 連結
    },
    {
      name: "進階訂閱",
      nameEn: "Pro",
      price: "HK$168",
      period: "/ 月",
      highlight: true,                      // 金色 highlight
      features: [
        "基礎訂閱全部內容",
        "每週財報深度拆解",
        "美股 + 港股雙市場覆蓋",
        "即時盈利警告通知",
        "優先問答回覆",
      ],
      cta: "最多人選擇",
      url: "https://www.patreon.com/",     // 換成真實 Patreon 連結
    },
    {
      name: "尊享訂閱",
      nameEn: "Elite",
      price: "HK$388",
      period: "/ 月",
      highlight: false,
      features: [
        "進階訂閱全部內容",
        "每月一對一 30 分鐘分析諮詢",
        "獨家投資組合追蹤報告",
        "早鳥獨家研究報告",
      ],
      cta: "聯絡了解",
      url: "https://www.patreon.com/",     // 換成真實 Patreon 連結
    },
  ],

  // ── 社交連結 ─────────────────────────────────────────────
  // 順序：Patreon → Facebook → Instagram → Threads
  social: [
    {
      platform: "Patreon",
      label: "訂閱 Patreon 深度分析",
      url: "https://www.patreon.com/",     // 換成真實連結
      highlight: true,                      // 金色 CTA
    },
    {
      platform: "Facebook",
      label: "Facebook 專頁",
      url: "https://www.facebook.com/",    // 換成真實連結
      highlight: false,
    },
    {
      platform: "Instagram",
      label: "Instagram",
      url: "https://www.instagram.com/",   // 換成真實連結
      highlight: false,
    },
    {
      platform: "Threads",
      label: "Threads",
      url: "https://www.threads.net/",     // 換成真實連結
      highlight: false,
    },
  ],

  // ── SEO / OG ─────────────────────────────────────────────
  seo: {
    title: "陳大文 · 投資分析",
    description: "專注港股盈利警告、美股財報分析及宏觀趨勢研判。每週深度分析報告，精準捕捉市場先機。",
    ogImage: "assets/images/og-image.jpg", // 換成真實 OG 圖片
    siteUrl: "https://yourname.netlify.app", // 換成真實網址
  },

};
