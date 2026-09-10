#!/usr/bin/env python3
"""
把 web_data.json 嘅 504 篇 Patreon 文章,每篇產生一個靜態摘要頁
(/archive/<id>/index.html)。

點解要有呢批頁:原本文章庫喺首頁用 JS fetch web_data.json 動態畫出嚟,
Google 搜尋「港股 XXXX 分析」呢類長尾字眼,搜到都係首頁本身,唔會搜到
個別文章 —— 504 篇公開文章完全冇 SEO 價值。每篇得返一小段 preview
(冇全文,全文喺 Patreon),所以呢啲頁淨係做摘要 + 連去 Patreon 全文,
唔係複製全文。

用法:
    python3 scripts/build_archive_pages.py

冪等:可以重複執行,每次都係完整重新產生(覆蓋舊檔),唔會累積垃圾檔。
"""
import json
import html
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA_FILE = ROOT / "web_data.json"
OUT_DIR = ROOT / "archive"
SITEMAP_FILE = ROOT / "sitemap-archive.xml"
SITE_URL = "https://ai10xpro.com"
BRAND = "Edward LEE 發掘十倍股"

CAT_LABELS_FALLBACK = {
    "technique": "買賣技巧", "stock_pick": "股票推介", "company_analysis": "公司分析",
    "earnings": "業績預測", "market_outlook": "大市展望", "other": "其他",
}


def esc(s):
    return html.escape(str(s), quote=True)


def slug_id(post_id):
    # id 本身已經係純數字字串,直接用做資料夾名。
    return re.sub(r"[^0-9A-Za-z_-]", "", str(post_id))


PAGE_TMPL = """<!DOCTYPE html>
<html lang="zh-Hant-HK">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>{title}｜{brand}</title>
<meta name="description" content="{desc}">
<link rel="canonical" href="{url}">
<meta property="og:type" content="article">
<meta property="og:site_name" content="{brand}">
<meta property="og:locale" content="zh_HK">
<meta property="og:title" content="{title}">
<meta property="og:description" content="{desc}">
<meta property="og:url" content="{url}">
<meta property="article:published_time" content="{date}">
<link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'><rect width='32' height='32' rx='6' fill='%230a0a0f'/><text y='24' x='4' font-size='22' fill='%23d4a647'>庫</text></svg>">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600;700;800&family=Noto+Sans+TC:wght@400;500;600;700;800&display=swap">
<link rel="stylesheet" href="/css/tokens.css">
<link rel="stylesheet" href="/css/base.css">
<link rel="stylesheet" href="/css/archive-post.css">
<script type="application/ld+json">
{{
  "@context": "https://schema.org",
  "@type": "Article",
  "headline": "{title_json}",
  "datePublished": "{date}",
  "description": "{desc_json}",
  "author": {{ "@type": "Person", "name": "Edward LEE" }},
  "publisher": {{ "@type": "Organization", "name": "{brand}" }},
  "mainEntityOfPage": "{url}"
}}
</script>
</head>
<body>
<div class="top"><div class="wrap">
  <a class="brand" href="/"><b>Edward LEE</b><span>發掘十倍股</span></a>
</div></div>
<div class="wrap">
  <a class="back" href="/#archive">← 返回 Patreon 文章庫</a>
  <div class="post-meta">
    <time class="post-date" datetime="{date}">{date}</time>
    {cat_tags}
  </div>
  <h1 class="post-title">{title}</h1>
  {stock_tags}
  <p class="post-preview">{preview}</p>
  <a class="post-cta" href="{patreon_url}" target="_blank" rel="noopener noreferrer">閱讀全文（Patreon）→</a>
  <p class="post-note">此頁為文章摘要,完整內容請在 Patreon 閱讀。資料只供研究用途,不構成任何投資建議、推薦或誘使進行任何投資交易。</p>
</div>
</body>
</html>
"""

INDEX_TMPL = """<!DOCTYPE html>
<html lang="zh-Hant-HK">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Patreon 文章庫索引｜{brand}</title>
<meta name="description" content="{total} 篇港股美股分析文章索引,按年份排列。">
<link rel="canonical" href="{url}">
<meta name="robots" content="index, follow">
<link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'><rect width='32' height='32' rx='6' fill='%230a0a0f'/><text y='24' x='4' font-size='22' fill='%23d4a647'>庫</text></svg>">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600;700;800&family=Noto+Sans+TC:wght@400;500;600;700;800&display=swap">
<link rel="stylesheet" href="/css/tokens.css">
<link rel="stylesheet" href="/css/base.css">
<style>
body {{ font-family: var(--font); }}
.wrap {{ max-width: 860px; margin: 0 auto; padding: 40px 24px 60px; }}
.back {{ display: inline-block; margin-bottom: 22px; font-size: 12.5px; color: var(--text-muted); }}
h1 {{ font-size: 1.6rem; color: var(--text-strong); margin-bottom: 8px; }}
.sub {{ font-size: 13px; color: var(--text-dim); margin-bottom: 30px; }}
.year {{ font-size: 13px; font-weight: 700; color: var(--gold); margin: 28px 0 10px; letter-spacing: .04em; }}
ul {{ list-style: none; }}
li {{ border-bottom: 1px solid var(--line); padding: 9px 0; display: flex; gap: 12px; align-items: baseline; }}
li time {{ font-size: 11.5px; color: var(--text-dim); white-space: nowrap; }}
li a {{ font-size: 13.5px; color: var(--text); }}
li a:hover {{ color: var(--gold); text-decoration: none; }}
</style>
</head>
<body>
<div class="wrap">
  <a class="back" href="/#archive">← 返回首頁文章庫</a>
  <h1>Patreon 文章庫索引</h1>
  <p class="sub">共 {total} 篇,按年份排列。每篇連去獨立摘要頁。</p>
  {body}
</div>
</body>
</html>
"""


def build():
    data = json.loads(DATA_FILE.read_text(encoding="utf-8"))
    posts = data.get("posts", [])
    cat_labels = data.get("cat_labels", CAT_LABELS_FALLBACK)

    OUT_DIR.mkdir(exist_ok=True)
    by_year = {}

    for post in posts:
        pid = slug_id(post.get("id", ""))
        if not pid:
            continue
        title = post.get("title", "").strip()
        date = post.get("date", "")
        preview = post.get("preview", "").strip()
        patreon_url = post.get("url", "")
        cats = post.get("cats", [])
        hk = post.get("hk", [])
        us = post.get("us", [])

        page_url = f"{SITE_URL}/archive/{pid}/"
        desc = (preview[:110] + "…") if len(preview) > 110 else preview
        cat_tags = "".join(
            f'<span class="post-cat">{esc(cat_labels.get(c, c))}</span>'
            for c in cats[:3]
        )
        stock_items = "".join(f'<span class="stock-tag hk">{esc(s["c"])}</span>' for s in hk[:8]) + \
                      "".join(f'<span class="stock-tag us">{esc(s["c"])}</span>' for s in us[:8])
        stock_tags = f'<div class="stock-tags">{stock_items}</div>' if stock_items else ""

        html_out = PAGE_TMPL.format(
            title=esc(title), title_json=json.dumps(title, ensure_ascii=False)[1:-1],
            desc=esc(desc), desc_json=json.dumps(desc, ensure_ascii=False)[1:-1],
            url=esc(page_url), date=esc(date), brand=BRAND,
            cat_tags=cat_tags, stock_tags=stock_tags,
            preview=esc(preview), patreon_url=esc(patreon_url),
        )

        page_dir = OUT_DIR / pid
        page_dir.mkdir(exist_ok=True)
        (page_dir / "index.html").write_text(html_out, encoding="utf-8")

        year = (date or "0000")[:4]
        by_year.setdefault(year, []).append((date, title, pid))

    # ── 索引頁,供爬蟲發現連結(純 sitemap 唔夠,仲要有站內連結) ──
    body_parts = []
    for year in sorted(by_year.keys(), reverse=True):
        items = sorted(by_year[year], key=lambda x: x[0], reverse=True)
        lis = "".join(
            f'<li><time>{esc(d)}</time><a href="/archive/{pid}/">{esc(t)}</a></li>'
            for d, t, pid in items
        )
        body_parts.append(f'<div class="year">{esc(year)}（{len(items)} 篇）</div><ul>{lis}</ul>')

    index_html = INDEX_TMPL.format(
        brand=BRAND, total=len(posts), url=f"{SITE_URL}/archive/",
        body="".join(body_parts),
    )
    (OUT_DIR / "index.html").write_text(index_html, encoding="utf-8")

    # ── 獨立 sitemap:504 篇加主 sitemap.xml 會太肥,分開一個檔案,
    # 喺 robots.txt 用多一行 Sitemap: 指過去。──
    urls = [f"{SITE_URL}/archive/"]
    for post in posts:
        pid = slug_id(post.get("id", ""))
        if pid:
            urls.append(f"{SITE_URL}/archive/{pid}/")
    entries = "\n".join(
        f"  <url>\n    <loc>{esc(u)}</loc>\n    <changefreq>yearly</changefreq>\n    <priority>0.4</priority>\n  </url>"
        for u in urls
    )
    sitemap_xml = (
        '<?xml version="1.0" encoding="UTF-8"?>\n'
        "<!-- 由 scripts/build_archive_pages.py 自動產生,唔好手改。 -->\n"
        '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
        f"{entries}\n"
        "</urlset>\n"
    )
    SITEMAP_FILE.write_text(sitemap_xml, encoding="utf-8")

    print(f"產生 {len(posts)} 個摘要頁 + 1 個索引頁,輸出目錄:{OUT_DIR}")
    print(f"產生 sitemap:{SITEMAP_FILE}({len(urls)} 個網址)")
    return len(posts)


if __name__ == "__main__":
    build()
