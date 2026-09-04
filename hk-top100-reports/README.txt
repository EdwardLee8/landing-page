港股市值 Top 100 深度報告靜態網站
================================

交給網頁同事：把整個資料夾上載到網站根目錄（或任意子目錄）即可。
不需要 Node / PHP / 資料庫。任何靜態託管都得（GitHub Pages、Nginx、Cloudflare Pages、公司現有主機）。

結構
----
index.html          首頁
styles.css          樣式
app.js              搜尋、行業分類、文章閱讀
vendor/             Markdown 渲染庫（離線可用，唔使外網 CDN）
data/companies.json 100 間公司索引（市值、行業、檔名）
reports/            100 篇 Markdown 原文

功能
----
- 按公司中文名 / 股份代號 / 英文名搜尋
- 按行業分類篩選
- 按市值排名、名稱、代號排序
- 點卡片閱讀全文（自動轉成網頁排版）
- 直達連結：index.html?s=00700 可開騰訊報告

注意
----
- 報告僅供參考，頁尾已有「不構成投資建議」聲明
- 建議用 https 託管
