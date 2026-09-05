# 投資分析網站

港股、美股、A 股投資分析平台。純靜態網站,repo 根目錄即網站根目錄。

線上位置:https://ai10xpro.com

## 頁面

### 公開頁面

| 頁面 | 說明 |
|---|---|
| `index.html` | 主頁:投資分析介紹、免費文章、訂閱計劃 |
| `free-tools.html` | 免費工具入口 |
| `hk-stocks-db.html` | 港股資料庫(免費版) |
| `hk-keywords-free.html` | 港股關鍵字資料庫(免費版) |
| `theme-strength-dashboard.html` | 三地市場主題強弱監測 |
| `hk-h1-2026-archive-20260820.html` | 港股 2026 中期業績前景庫歷史快照 |
| `hk-top100-reports/` | 港股 Top 100 深度報告 |

### 會員頁面

一律標記 `noindex`,資料以 AES-256-GCM 加密存放。入口為 `login.html`。

| 頁面 | 說明 |
|---|---|
| `hk-keywords.html` / `hk-keywords-pro.html` | 港股關鍵字資料庫與相關性分組 |
| `us-keywords.html` / `cn-keywords.html` | 美股 / A 股關鍵字資料庫 |
| `hk-rs-rating.html` / `us-rs-rating.html` / `cn-rs-rating.html` | 相對強度評分(8 個 timeframe + composite) |
| `movers.html` | 每日 RS 排名上升榜 |
| `hk-stocks-pro.html` / `us-stocks-db.html` | 港股 / 美股財務及市場數據 |
| `hk-h1-2026-db.html` / `hk-h1-2026-industry-top3.html` | 港股 2026 中期業績前景庫 |
| `us-transcript-db.html` | 美股業績電話會議情報 |
| `us-research-reports-db.html` | 美股自動研究報告 |
| `cn-irm-db.html` | A 股(深圳)投資者關係活動記錄 |
| `etf-report/` | 港股、美股 ETF 分類、回報及資產規模 |

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
python3 -m http.server 8899   # 本機預覽
```

沒有 build step,HTML 直接編輯即可。共用的前端程式碼放在 `js/`:

- `js/member-auth.js` — 會員驗證與資料解密(全站共用)
- `js/keywords-hk.js` + `css/keywords-hk.css` — 港股關鍵字頁(免費版與付費版共用)
- `js/main.js` / `js/content.js` — 首頁
- `js/opencc.full.js` — 簡繁轉換,僅 `cn-keywords.html` 按需載入
