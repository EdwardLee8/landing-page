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
    bgImage: "https://img.etimg.com/thumb/msid-68631304,width-1200,height-800,imgsize-410125,resizemode-75/bull1-getty-1200.jpg",
    email: "",
  },

  // ── 個人介紹 ──────────────────────────────────────────────
  about: {
    bio: "與各位分享個人投資市場看法，內容涵蓋：個人選股組合參考（港股及美股）、每週市場回顧與下週走向預測、當期熱門行業趨勢與發展分析、投資者常犯錯誤與解決方法、曾經十倍股介紹與研究分享，並隨市場發展持續更新。",
    highlights: [
      { label: "專注領域", value: "港股 · 美股 · 宏觀分析" },
      { label: "分析風格", value: "基本面 + 技術面結合" },
      { label: "平台", value: "Patreon · Discord · Facebook" },
    ],
    platforms: [
      "Patreon 深度分析文章",
      "Discord 即時市場討論",
      "Facebook 公開市場評論",
      "Instagram 市場動態更新",
    ],
  },

  // ── Patreon 內容介紹 ──────────────────────────────────────
  patreonPage: {
    description: "Patreon 係我主要嘅深度分析平台，每月定期發布研究報告，幫你在市場噪音中找到真正的投資機會。",
    features: [
      {
        title: "個人選股組合",
        desc: "港股及美股個人持倉參考，附帶入場理由及目標價分析",
      },
      {
        title: "每週市場回顧",
        desc: "每週大市走勢回顧，下週重點板塊及事件預測",
      },
      {
        title: "行業深度研究",
        desc: "熱門行業趨勢與發展分析，捕捉結構性機會",
      },
      {
        title: "財報深度解讀",
        desc: "重點公司財報逐項拆解，提取市場尚未消化的關鍵訊號",
      },
      {
        title: "十倍股研究",
        desc: "回顧歷史十倍股的成長路徑，建立選股框架",
      },
      {
        title: "投資者錯誤分析",
        desc: "常見投資誤區與解決方法，幫你避開致命錯誤",
      },
    ],
    cta: { text: "前往 Patreon 訂閱", url: "https://www.patreon.com/edward10" },
  },

  // ── 收費 Discord ──────────────────────────────────────────
  discordPaid: {
    description: "收費 Discord 係深度討論社群，與一群認真對待投資的朋友即時交流，分享市場機會與操作思路。",
    channels: [
      { name: "📊 選股分析", desc: "個股深度分析與入場訊號討論" },
      { name: "📰 即時新聞解讀", desc: "重要消息第一時間分析影響" },
      { name: "📈 組合更新", desc: "個人持倉變動即時通知" },
      { name: "🌏 宏觀討論", desc: "美聯儲、利率、地緣政治對市場的影響" },
      { name: "💬 問答頻道", desc: "直接向我提問，每週定期回覆" },
      { name: "📚 學習資源", desc: "投資書籍推薦、學習路徑規劃" },
    ],
    cta: { text: "加入收費 Discord", url: "https://www.patreon.com/edward10" },
  },

  // ── 免費 Discord ──────────────────────────────────────────
  discordFree: {
    description: "免費 Discord 開放給所有人，分享基礎市場資訊與投資觀點，歡迎各位加入交流。",
    channels: [
      { name: "📢 公告", desc: "最新文章及重要更新通知" },
      { name: "💹 市場動態", desc: "每日市場開收市簡報" },
      { name: "🗣️ 自由討論", desc: "港股美股自由討論區" },
      { name: "📖 免費文章", desc: "公開分析文章分享" },
    ],
    cta: { text: "免費加入 Discord", url: "https://discord.gg/Y8wk7DCWPR" },
  },

  // ── 精選文章 ──────────────────────────────────────────────
  // platform: "patreon" | "facebook" | "instagram" | "threads" | "medium"
  // 如需更新文章：改 title、excerpt、date、url 即可
  articles: [
    {
      title: "港股 IPO：嗚嗚很忙公司介紹",
      excerpt: "最新港股 IPO 分析，深入拆解公司背景、業務模式及上市估值，判斷值唔值得抽新股。",
      date: "2026-03-10",
      platform: "patreon",
      url: "https://www.patreon.com/posts/148744481?collection=503820",
    },
    {
      title: "2025 年白銀真的在「暴走」：到 12 月已翻倍、創歷史新高",
      excerpt: "白銀全年升幅翻倍，背後係工業需求爆發定係資金避險？深度拆解銀價上漲邏輯及後市走向。",
      date: "2025-12-20",
      platform: "patreon",
      url: "https://www.patreon.com/posts/146896511?collection=503820",
    },
    {
      title: "關稅分析及未來可能",
      excerpt: "Trump 地圖炮式對全球加關稅，互惠關稅邏輯拆解，分析對港股及美股各板塊的實際傳導影響。",
      date: "2025-04-03",
      platform: "patreon",
      url: "https://www.patreon.com/posts/125851269?collection=503820",
    },
    {
      title: "AI 驅動記憶體市場結構性變革：SK 海力士財報會議深度解析",
      excerpt: "從 SK 海力士財報會議紀錄提取關鍵訊號，解讀 HBM 需求爆發對整個記憶體供應鏈的影響。",
      date: "2025-10-15",
      platform: "patreon",
      url: "https://www.patreon.com/posts/142328408?collection=503820",
    },
    {
      title: "港股為什麼這麼弱？以 JS 環球生活分拆 SharkNinja 為例說明",
      excerpt: "除基本面因素外，以 JS 環球生活（1691）分拆 SharkNinja 赴美上市為例，解釋港股資金持續外流的深層原因。",
      date: "2024-10-01",
      platform: "patreon",
      url: "https://www.patreon.com/posts/109913962?collection=503820",
    },
    {
      title: "大家樂 vs 大快活：經營比率數據對比",
      excerpt: "用財務比率數據實際對比兩大香港快餐龍頭，毛利率、翻枱率、同店增長逐項拆解，數字背後誰更穩健？",
      date: "2024-07-01",
      platform: "patreon",
      url: "https://www.patreon.com/posts/107125684?collection=503820",
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
      url: "https://www.threads.net/@edwardleeten",
      highlight: false,
    },
    {
      platform: "twitter",
      label: "Twitter / X @EdwardLee239412",
      url: "https://twitter.com/EdwardLee239412",
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
