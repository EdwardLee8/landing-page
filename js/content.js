// ============================================================
// content.js — 所有可變內容，只需改呢個檔案就可以更新網站
// ============================================================

const SITE_CONTENT = {

  // ── 基本資料 ──────────────────────────────────────────────
  // Hero Section — AIDA Framework
  // Attention  → subTagline：打破慣性思維
  // Interest   → bio 上半：點解值得留意（20年 + 數字）
  // Desire     → bio 下半：具體往績勾起渴望
  // Action     → CTA 按鈕（main.js 渲染）
  author: {
    name: "Edward LEE",
    nameEn: "Edward LEE",
    tagline: "AI · 港股 · 美股 · 宏觀分析",
    subTagline: "唔再靠感覺，用近 20 年數據建立你的投資系統",
    bio: "每個策略都有歷史數據支撐，唔係直覺，唔係消息。近 20 年基本面研究，公開模擬組合 2025 年回報 +36%，同期 Nasdaq 約 +20%，以約五成倉位達成。大部分虧損控制在 15% 以內，讓 APP 跑出 +236%、ANET +290%。",
    avatar: "https://img.etimg.com/thumb/msid-68631304,width-210,height-158,imgsize-410125,resizemode-75/bull1-getty-1200.jpg",
    bgImage: "https://img.etimg.com/thumb/msid-68631304,width-1200,height-800,imgsize-410125,resizemode-75/bull1-getty-1200.jpg",
    email: "",
  },

  // ── 個人介紹 ──────────────────────────────────────────────
  about: {
    bio: "擁有近 20 年投資研究經驗，專注基本面選股，擅長閱讀年報及招股書，從財務數據中識別高增長潛力股。投資風格紀律嚴明：嚴格止損，大部分虧損控制在 15% 以內；同時讓贏家持續奔跑，APP 持有至 +236%、ANET 持有至 +290%。公開模擬組合 2025 年回報 +36%（同期 Nasdaq 約 +20%），僅以約五成倉位達成。近期結合 AI / LLM 工具進行量化回測與策略開發，涵蓋港股、美股及 A 股。過往表現不代表將來回報。",
    highlights: [
      { label: "📊 近 20 年研究經驗", value: "港股 · 美股 · 宏觀分析 · 年報深度閱讀" },
      { label: "🎯 紀律型風險管理", value: "止損 15% · 讓利潤奔跑 · 模擬組合持續跑贏大市" },
      { label: "🤖 AI 量化策略開發", value: "Claude Code · Python 回測 · 自動化信號掃瞄" },
    ],
    platforms: [
      "Patreon 深度分析文章",
      "Discord 即時市場討論",
      "Facebook 公開市場評論",
      "Instagram 市場動態更新",
    ],
    stats: [
      { value: "1,369+", label: "Patreon 訂閱者" },
      { value: "500+",   label: "深度分析文章" },
      { value: "2020",   label: "開始年份" },
      { value: "+36%",   label: "2025 模擬組合回報" },
    ],
  },

  // ── Patreon 內容介紹 ──────────────────────────────────────
  // TIMER Framework:
  // T (Time)       → 每週報告，第一時間知道新策略
  // I (Identity)   → 為認真對待投資回報嘅人而設
  // M (Money)      → 真實往績：+36% vs Nasdaq +20%
  // E (Ego)        → 與數據驅動投資者同行
  // R (Reputation) → 避開散戶常犯嘅追高殺低錯誤
  patreonPage: {
    description: "為認真對待投資回報的人而設。每週深度報告，每個策略都有歷史數據驗證——唔係嗌你買邊隻，係教你點解呢個策略有效，點樣管理風險。過往表現不代表將來回報。",
    features: [
      {
        title: "數據驗證策略",
        desc: "每個買入建議都有回測數據支撐，唔靠直覺唔靠消息，講清入場邏輯與止損水位",
      },
      {
        title: "個人選股組合",
        desc: "港股及美股真實模擬持倉參考，附入場理由、目標價及風險評估",
      },
      {
        title: "每週市場回顧",
        desc: "每週大市走勢深度分析，下週重點板塊、關鍵數據及事件預測",
      },
      {
        title: "行業深度研究",
        desc: "從財務報表識別結構性機會，捕捉市場尚未完全消化的增長訊號",
      },
      {
        title: "風險管理實錄",
        desc: "止損點如何設置、倉位如何控制——大部分虧損控制在 15% 以內的實際操作",
      },
      {
        title: "避開散戶陷阱",
        desc: "拆解「RSI 超買再追」「消息出貨」等常見錯誤，建立正確投資框架",
      },
    ],
    cta: { text: "睇免費報告 →", url: "https://www.patreon.com/edward10" },
  },

  // ── 收費 Discord ──────────────────────────────────────────
  discordPaid: {
    description: "與一群認真對待投資的人即時交流。市場訊號、操作思路、倉位更新——第一時間同步，唔再獨自摸索。",
    channels: [
      { name: "📊 選股分析", desc: "個股深度分析與入場訊號討論" },
      { name: "📰 即時新聞解讀", desc: "重要消息第一時間分析實際影響" },
      { name: "📈 組合更新", desc: "個人持倉變動即時通知，附操作理由" },
      { name: "🌏 宏觀討論", desc: "美聯儲、利率、地緣政治對市場的傳導分析" },
      { name: "💬 問答頻道", desc: "直接提問，每週定期回覆" },
      { name: "📚 學習資源", desc: "投資書籍推薦、選股框架建立" },
    ],
    cta: { text: "立即加入 Discord →", url: "https://www.patreon.com/edward10" },
  },

  // ── 免費 Discord ──────────────────────────────────────────
  discordFree: {
    description: "先免費試試。加入後你會看到市場分析的角度有多不同——數據說話，唔係感覺說話。",
    channels: [
      { name: "📢 公告", desc: "最新文章及重要更新通知" },
      { name: "💹 市場動態", desc: "每日市場開收市簡報" },
      { name: "🗣️ 自由討論", desc: "港股美股自由討論區" },
      { name: "📖 免費文章", desc: "公開分析文章分享" },
    ],
    cta: { text: "免費加入 Discord →", url: "https://discord.gg/Y8wk7DCWPR" },
  },

  // ── 精選文章 ──────────────────────────────────────────────
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
  tiers: [
    {
      name: "免費跟隨",
      nameEn: "Free",
      price: "免費",
      period: "",
      highlight: false,
      features: [
        "定期免費市場分析文章",
        "Facebook 及 Instagram 公開分析",
        "投資框架基礎知識分享",
      ],
      cta: "睇免費報告 →",
      url: "https://www.patreon.com/edward10",
    },
    {
      name: "付費訂閱",
      nameEn: "Pro",
      price: "查看 Patreon",
      period: "",
      highlight: true,
      features: [
        "數據驗證選股策略（港股 + 美股）",
        "每週市場深度回顧與走向預測",
        "個人模擬組合持倉參考及操作理由",
        "風險管理實操：止損設置與倉位控制",
        "行業深度研究，捕捉結構性機會",
      ],
      cta: "成為訂閱會員 →",
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
        "支持獨立、無利益衝突的投資研究",
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
    description: "近 20 年基本面研究，公開模擬組合 2025 年回報 +36%（Nasdaq +20%）。數據驗證策略，港股美股深度分析，AI 量化回測。過往表現不代表將來回報。",
    ogImage: "assets/images/og-image.jpg",
    siteUrl: "https://ai10xpro.com",
  },

};
