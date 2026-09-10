// ============================================================
// content.js — 所有可變內容，只需改呢個檔案就可以更新網站
// ============================================================

const SITE_CONTENT = {

  // ── 基本資料 ──────────────────────────────────────────────
  author: {
    name: "Edward LEE",
    nameEn: "Edward LEE",
    tagline: "發掘十倍股",
    subTagline: "港股 · 美股 · 宏觀分析",
    avatar: "assets/bg-bull.jpg",
    bgImage: "assets/hero-bg.jpg",
    email: "",
  },

  // ── 個人故事 ──────────────────────────────────────────────
  story: {
    hook: "如果你問，大部分人在股市輸錢的原因是甚麼——\n通常不是因為不努力，而是方向一開始就錯了。",

    journey: [
      "我的背景，其實和很多人一樣。不是出身於中產家庭，也沒有資源或人脈。大學剛滿18歲，用自己的錢開戶入市。沒有導師，沒有圈子，只能靠書、報章、網上零碎資料自學。",
      "2012年，我開始在Facebook建立「發掘十倍股」，持續公開記錄對港股的看法；2014年開設群組。這不只是分享，更是長達十多年的實驗，驗證哪些方法有效，哪些完全沒用。",
    ],

    turningPoint: {
      before: "真正的轉變，不是某一次賺錢，而是當我開始發現：",
      emphasis: "大多數人關注的東西，其實都不是關鍵。",
    },

    insight: "投資最難的部分，往往不是找到好股票，而是知道甚麼時候該走，甚麼時候該留。我能把多數虧損控制在 15% 以內，同時讓 APP 跑到 +236%、ANET 跑到 +290%。2021 年沒有跟進 meme 股，2022 年沒有跟進新電動車。不是市場沒有誘惑，而是有自己的判斷標準。",

    pillars: {
      intro: "真正影響投資回報的是：",
      items: [
        { icon: "bars",  label: "業績變化", desc: "從財務數據識別高增長潛力，捕捉市場尚未消化的訊號" },
        { icon: "trend", label: "行業趨勢", desc: "結構性變革帶來的長期機會，而非短線題材" },
        { icon: "pulse2", label: "資金與情緒", desc: "市場所處的階段，以及大多數人還未察覺的變化" },
      ],
    },

    aiNote: "AI 對我來說，只是效率工具：更快篩選、更廣覆蓋。最終的判斷，仍然來自對市場的理解。",

    valueProp: [
      "這個專欄的目的，不是提供更多資訊，而是幫你過濾掉大部分無用的資訊。",
      "你會看到的，不是事後分析，而是：哪些公司正處於動能最強的位置，哪些變化正在發生，而市場仍未完全反映——然後放在模擬倉，看著它們朝預想的方向發展。",
    ],

    closingHook: "如果你想看的，不只是發生了甚麼，\n而是下一步可能發生甚麼——",
    cta: { text: "完整分析會在會員內容中提供", url: "https://www.patreon.com/edward10" },
  },

  // ── 往績數據 ──────────────────────────────────────────────
  // 原本這裡放 2012 / 19,000+ / 500+ —— 但呢三個係「產出量」(寫咗幾耐、
  // 幾多人 follow、寫咗幾多篇),唔係「往績」。真正的投資回報數字原本
  // 埋喺 story.insight 一段長文中間,搬呢度做主角。呢三個產出量數字
  // hero 已經有一份(a26-proof-grid),唔再重複。
  about: {
    stats: [
      { value: "+236%", label: "APP 持有期間回報" },
      { value: "+290%", label: "ANET 持有期間回報" },
      { value: "<15%",  label: "多數持倉的最大虧損上限" },
    ],
  },

  // ── 研究工具(免費 + 會員資料庫總覽) ─────────────────────────
  // 首頁原本完全無提過任何一個資料庫/工具 —— 21 個(6 免費 + 15 會員)
  // 全部收埋喺導覽列的下拉選單。呢個區塊唔係要求會員買嘢,純粹係
  // 「證明呢個網站有嘢」,免密碼工具同會員資料庫入口並排放。
  researchTools: {
    stats: [
      { value: "21",     label: "個資料庫工具（6 免費＋15 會員）" },
      { value: "2,012",  label: "隻港股業績數據" },
      { value: "3",      label: "個市場 RS 相對強度評分" },
      { value: "801",    label: "間港股前景評分" },
      { value: "583",    label: "份美股業績電話會議拆解" },
      { value: "9,300+", label: "間公司關鍵字覆蓋" },
    ],
    ctaFree:   { text: "6 個免費工具，即刻用 →", url: "/free/" },
    ctaMember: { text: "會員資料庫 →",          url: "/member/" },
  },

  // ── 免費 vs 會員對照 ─────────────────────────────────────────
  compare: {
    rows: [
      { label: "分析文章",       free: "504 篇公開",           member: "全部＋每週最新" },
      { label: "資料庫工具",      free: "6 個",                member: "21 個" },
      { label: "港股業績庫",      free: "2,012 隻（H2 2025）",  member: "同步更新＋前景評分 801 間" },
      { label: "RS 相對強度評分", free: "—",                   member: "港／美／A 三市場＋每日上升榜" },
      { label: "業績電話會議拆解", free: "—",                  member: "583 份（美股）" },
      { label: "Discord",       free: "公開頻道",             member: "操作思路＋倉位更新即時同步" },
    ],
  },

  // ── 收費 Discord ──────────────────────────────────────────
  discordPaid: {
    description: "與一群認真對待投資的人即時交流。市場訊號、操作思路、倉位更新第一時間同步，不用再獨自摸索。",
    channels: [
      { icon: "chart",   name: "選股分析",   desc: "個股深度分析與入場訊號討論" },
      { icon: "news",    name: "即時新聞解讀", desc: "重要消息第一時間分析實際影響" },
      { icon: "trend",   name: "組合更新",   desc: "個人持倉變動即時通知，附操作理由" },
      { icon: "globe",   name: "宏觀討論",   desc: "美聯儲、利率、地緣政治對市場的傳導分析" },
      { icon: "chat",    name: "問答頻道",   desc: "直接提問，每週定期回覆" },
      { icon: "book",    name: "學習資源",   desc: "投資書籍推薦、選股框架建立" },
    ],
    cta: { text: "立即加入 Discord →", url: "https://www.patreon.com/edward10" },
  },

  // ── 免費 Discord ──────────────────────────────────────────
  discordFree: {
    description: "先免費試用。加入後你會看到市場分析的角度有多不同：用數據說話，而不是用感覺說話。",
    channels: [
      { icon: "megaphone", name: "公告",     desc: "最新文章及重要更新通知" },
      { icon: "pulse",     name: "市場動態",   desc: "每日市場開收市簡報" },
      { icon: "chat",      name: "自由討論",   desc: "港股美股自由討論區" },
      { icon: "doc",       name: "免費文章",   desc: "公開分析文章分享" },
    ],
    cta: { text: "免費加入 Discord →", url: "https://discord.gg/Y8wk7DCWPR" },
  },

  // ── 精選文章 ──────────────────────────────────────────────
  articles: [
    {
      title: "港股 Top 100 深度報告（2026年9月版）",
      excerpt: "港股市值最大 100 間上市公司深度分析報告，涵蓋騰訊、工商銀行、滙豐等龍頭。可按公司、股份代號或行業搜尋，免密碼免費閱讀全文。",
      date: "2026-09-04",
      platform: "website",
      url: "/hk-top100-reports/",
    },
    {
      title: "〈免費會員可享〉港股2025下半年資料庫",
      excerpt: "資料庫收錄 1,894 隻港股的 2025 下半年業績數據，幫助投資者快速篩選股票，不用逐隻翻業績，幾秒鐘就能找到符合自己策略的標的。",
      date: "2026-04-01",
      platform: "patreon",
      url: "https://www.patreon.com/posts/mian-fei-hui-ke-154513617",
    },
    {
      title: "港股 IPO：嗚嗚很忙公司介紹",
      excerpt: "最新港股 IPO 分析，拆解公司背景、業務模式及上市估值，判斷值不值得抽新股。",
      date: "2026-03-10",
      platform: "patreon",
      url: "https://www.patreon.com/posts/148744481?collection=503820",
    },
    {
      title: "2025 年白銀真的在「暴走」：到 12 月已翻倍、創歷史新高",
      excerpt: "白銀全年升幅翻倍，背後是工業需求爆發還是資金避險？拆解銀價上漲邏輯及後市走向。",
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
      title: "港股為甚麼這麼弱？以 JS 環球生活分拆 SharkNinja 為例說明",
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

  // 首頁只列 8 篇精選;往績寫「500+ 分析文章」,所以文章區底下要有一個
  // 通往全部文章的出口,否則數字沒有著落。文字原本寫死在 js/main.js,
  // 跟這裡的 tiers[0].cta 重複,改成一起由這個檔案管理。
  articlesCta: {
    text: "查看全部免費文章 →",
    url: "/blog/",
  },

  // ── Patreon 訂閱 Tier ────────────────────────────────────
  tiers: [
    {
      name: "免費關注",
      nameEn: "Free",
      price: "免費",
      period: "",
      highlight: false,
      features: [
        "定期免費市場分析文章",
        "Facebook 及 Instagram 公開分析",
        "投資框架基礎知識分享",
      ],
      cta: "查看免費報告 →",
      url: "https://www.patreon.com/collection/503820?view=expanded",
    },
    {
      name: "付費訂閱",
      nameEn: "Pro",
      price: "查看 Patreon",
      period: "",
      highlight: true,
      features: [
        "數據驗證選股策略（港股 + 美股）",
        "每週市場回顧與走向預測",
        "個人模擬組合持倉參考及操作理由",
        "風險管理：止蝕位與倉位控制",
        "行業研究：捕捉結構性機會",
      ],
      cta: "成為訂閱會員 →",
      url: "https://www.patreon.com/edward10",
    },
    {
      name: "支持創作",
      nameEn: "Support",
      price: "自訂金額",
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
      label: "訂閱 Patreon — 完整投資分析",
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

  // ── 電郵訂閱 ─────────────────────────────────────────────
  // 現有嘅出口(免費文章、免費 Discord、Patreon)全部係第三方平台,
  // 演算法改咗或者帳號有事就聯絡唔到人。電郵係唯一自己擁有嘅名單。
  newsletter: {
    title: "資料庫更新通知",
    desc: "唔想錯過新資料庫上線同重大更新？留個電郵，唔會經常打擾。",
    placeholder: "your@email.com",
    buttonText: "訂閱",
    successText: "已訂閱，多謝支持。",
  },

  // ── SEO / OG ─────────────────────────────────────────────
  seo: {
    title: "Edward LEE · 發掘十倍股",
    description: "2012年起公開記錄港股美股分析。專注業績變化、行業趨勢、資金與情緒——幫你過濾噪音，看到下一步可能發生甚麼。",
    ogImage: "assets/images/og-image.jpg",
    siteUrl: "https://ai10xpro.com",
  },

};
