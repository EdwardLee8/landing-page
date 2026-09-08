# 公開研究頁改版

公開首頁、免費工具、公司研究同文章索引改用查閱研究為先嘅版面。會員工具沿用現有路由與驗證。

## 內容來源與更新

- 公司資料：`hk-top100-reports/data/companies.json`。
- 公司全文：`hk-top100-reports/reports/*.md`，保留現有內容與來源說明，唔新增投資結論。
- 品牌背景：`js/content.js`。
- 首頁結構：`scripts/templates/research-home.html`。
- 文章摘要資料：`web_data.json`；各篇摘要沿用現有 `/archive/<id>/`。
- 首頁更新區按原報告日期排序，唔用生成日期冒充內容更新日期。

修改來源後執行 `node scripts/build_research_pages.mjs`，並一併提交產生嘅 HTML、公司索引同 sitemap。網站部署仍然直接使用已提交嘅靜態檔案，無新套件或強制部署 build step。若有執行原本嘅 `scripts/build_archive_pages.py`，最後再執行研究頁生成器，以保留新版文章索引。

首頁數據預覽取自騰訊原報告首個同名財務指標行；若更换報告期間，需同步核對首頁期間標籤同選讀文案。

## 驗證

```sh
node worker/index.test.mjs
node scripts/research.test.mjs
node --check js/research.js
```

預覽使用原有 Wrangler Worker。Windows 若以根目錄作 assets 時出現檔案監察循環，可用獨立預覽資產目錄，再以 `wrangler dev --assets <preview-directory> --local` 啟動；唔改生產設定。

## 本次驗證記錄

- `node worker/index.test.mjs`：53 項通過，包含會員保護、轉址及訂閱儲存成功／失敗。
- `node scripts/research.test.mjs`：106 個頁面、100 份完整報告、720 個內部路徑通過。
- `node --check js/research.js` 及 `git diff --check` 通過。
- 瀏覽器已驗證公司搜尋、行業篩選、空結果及手機選單。最後表單操作被 Chrome 擴充功能視窗阻擋，未完成端到端畫面驗證；需關閉該視窗後覆測。
- 提交檢查使用明確路徑嘅 `git add`、`git diff --cached` 同 `git diff --cached --check`；預覽資產同本機測試儲存均唔包含喺提交。

## 增長資料與後續營運

`js/research.js` 會發出 `research:action` DOM 事件（search、report_open、report_click、tool_open、share、subscribe、membership），供已選定嘅分析服務接駁。事件唔帶電郵或搜尋字串。未連接分析服務前，唔會儲存或傳送事件，亦唔代表已收集到流量基準。

電郵表單沿用 `/api/subscribe`，確認 KV 寫入成功先顯示已登記。呢個改版唔會向讀者發信；固定寄送頻率、寄件服務同退訂流程要喺正式寄送前完成。可分享嘅本期選讀位於 `/research/briefing/`，由現有三間公司報告組成，無自動產生新嘅每週投資觀點。

合併後建議先驗證 Search Console 可讀到個股完整內容，再觀察非品牌搜尋點擊、閱讀公司研究嘅比例同回訪。舊 Top 100 分享網址以 301 導向相應研究頁。AI 爬蟲同會員資料限制保留，僅放行原有公開公司目錄 JSON 供一般搜尋爬蟲讀取。
