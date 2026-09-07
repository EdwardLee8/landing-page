# 投資分析網站

港股、美股、A 股投資分析平台。純靜態網站,repo 根目錄即網站根目錄。

線上位置:https://ai10xpro.com

## 頁面

網址由 `worker/index.js` 的 `CLEAN_URLS` 決定,與實體檔名不同。舊的 `.html`
網址全部 301 轉到新網址,不會斷連。

### 公開頁面

| 網址 | 實體檔案 | 說明 |
|---|---|---|
| `/` | `index.html` | 主頁:介紹、免費文章、訂閱計劃 |
| `/free/` | `free-tools.html` | 免費內容中心 |
| `/free/stocks/hk` | `hk-stocks-db.html` | 港股資料庫(免費版) |
| `/free/keywords/hk` | `hk-keywords-free.html` | 港股關鍵字(免費版) |
| `/free/themes` | `theme-strength-dashboard.html` | 三地市場主題強弱監測 |
| `/free/sp500-top20` | `sp500-top20-reports.html` | S&P 500 Top 20 研究報告 |
| `/free/outlook-2026-archive` | `hk-h1-2026-archive-20260820.html` | 中期業績前景庫歷史快照 |
| `/hk-top100-reports/` | 同名目錄 | 港股 Top 100 深度報告 |

### 會員頁面

一律 `noindex`,資料以 AES-256-GCM 加密,並由 Worker 驗證 session cookie。
入口為 `/member/`。

| 網址 | 實體檔案 |
|---|---|
| `/member/` | `login.html` |
| `/member/rs/{hk,us,cn}` | `{hk,us,cn}-rs-rating.html` |
| `/member/keywords/{hk,us,cn}` | `hk-keywords-pro.html` 等 |
| `/member/stocks/{hk,us}` | `hk-stocks-pro.html`、`us-stocks-db.html` |
| `/member/movers` | `movers.html` |
| `/member/outlook-2026`、`/member/outlook-2026/top3` | `hk-h1-2026-*.html` |
| `/member/transcripts` | `us-transcript-db.html` |
| `/member/research` | `us-research-reports-db.html` |
| `/member/irm` | `cn-irm-db.html` |
| `/etf-report/` | 同名目錄 |

## 前端架構

沒有 build step,全部是瀏覽器原生就能跑的共用檔案。

### 設計系統

顏色、字級、間距集中在 `css/tokens.css`,**改顏色只改這一個檔案**。

| 檔案 | 內容 |
|---|---|
| `css/tokens.css` | 設計 token(唯一真相) |
| `css/base.css` | reset、body、連結 |
| `css/shell.css` | 會員區頁首、密碼遮罩、說明面板 |
| `css/components.css` | 表格、篩選器、按鈕、分頁、市場徽章 |

### 共用 JS

| 檔案 | 內容 |
|---|---|
| `js/member-auth.js` | 登入、session、AES 解密 |
| `js/member-shell.js` | 會員區頁首:品牌、市場切換、登出 |
| `js/rs-rating.js` | 三個 RS 評分頁共用(差異由頁面的 `RS_CONFIG` 提供) |
| `js/keywords-hk.js` | 港股關鍵字頁共用(`KW_CONFIG`) |
| `js/opencc.full.js` | 簡繁轉換,僅 A 股關鍵字頁按需載入 |

**重要:所有資源與資料路徑必須用絕對路徑**(`/css/...`、`/hk_rs_latest.enc`)。
頁面在 `/member/rs/hk` 這種深層網址下提供,相對路徑會解析錯誤。

## 資料保護

會員資料以 `.enc` 形式存放:`base64(salt[16] ‖ nonce[12] ‖ AES-256-GCM)`,
金鑰為 `PBKDF2-HMAC-SHA256(密碼, salt, 100000 輪)`。

- Python 端:`enc_utils.py`
- 瀏覽器端:`js/member-auth.js`

兩者格式必須一致。這是**前端加密**,只能擋住隨手抓檔,擋不住已取得密碼的
人 —— 真正的存取控制見 `docs/server-auth.md`。

### 密碼

密碼由環境變數 `MEMBER_DATA_PASSWORD` 提供(見 `.env.example`),**絕不可
寫死在任何檔案中** —— 本 repo 為 public,寫死等同對外發佈。所有腳本在缺少
該變數時會直接結束,不設內建預設值。

輪換密碼(舊密碼外洩時的唯一補救):

```bash
python rotate_password.py --old '舊密碼' --new '新密碼' --dry-run   # 先看
python rotate_password.py --old '舊密碼' --new '新密碼' --update-html
```

它會解密全部 `.enc` 再以新密碼重新加密,並同步更新各頁面的 `_PW_HASH`。

### 明文資料不可進入 git

`publish` 目錄就是 repo 根目錄,任何被追蹤的檔案都會對外提供下載。加密前的
`*_rs_latest.json`、`*_weinstein_latest.json` 等是匯出腳本的中間產物,已由
`.gitignore` 與 `.assetsignore` 同時擋住 git 與 Cloudflare 部署。新增資料
管線時請一併加入這兩份清單。

## 資料管線

| 腳本 | 用途 |
|---|---|
| `export_rs_latest.py` | 由 ClickHouse 匯出 RS Rating → `{market}_rs_latest.json` + `.enc` |
| `export_rs_movers.py` | 匯出每日 RS 上升榜 |
| `export_weinstein.py` | 匯出 Weinstein 階段分析 |
| `enrich_stocks_rs.py` | 為股票資料庫補上 RS 欄位 |
| `build_us_theme_strength.py` | 由 RS 資料建立美股主題強弱 |
| `rebuild_dashboard.py` | 把主題資料嵌回 `theme-strength-dashboard.html` |
| `encrypt_assets.py` | 批次加密關鍵字與相關性資料 |
| `encrypt_irm.py` / `encrypt_us_transcript.py` / `encrypt_us_research.py` | 各資料源的加密腳本 |
| `backtest_walkforward.py` / `backtest_finetune.py` | RS 權重回測 |
| `send_movers_report.py` | Telegram 推送每日上升榜 |
| `scripts/portfolio_rs_discord.py` | Discord 推送組合 RS 報告 |

## 部署

| 平台 | 設定檔 |
|---|---|
| Cloudflare(Workers Assets / Pages) | `wrangler.jsonc` + `_headers` + `.assetsignore` |
| Netlify | `netlify.toml` |

`_headers` 與 `netlify.toml` 的安全標頭與快取政策必須保持一致,**修改其中
一份時請同步另一份**。

## 開發

```bash
cp .env.example .env      # 填入密碼與 webhook
```

本機預覽**不能**用 `python -m http.server` —— 頁面要打 `/api/login`,
靜態伺服器不支援 POST(會回 501),測出來的結果是假的。要用 wrangler:

```bash
npx wrangler dev          # 讀 wrangler.jsonc,含驗證與路由
```

Worker 的行為測試(不需相依套件):

```bash
node worker/index.test.mjs
```

改 HTML 直接編輯即可,沒有 build step。新增頁面時記得:

1. 資源與資料路徑一律用**絕對路徑**
2. 在 `worker/index.js` 的 `CLEAN_URLS` 加上對外網址
3. 公開頁要加進 `sitemap.xml`;會員頁要有 `noindex`

