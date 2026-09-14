#!/usr/bin/env python3
"""由 V12.x 基本面排名 JSON 產生會員版加密資料。

來源係研究流程匯出嘅排名檔,格式係 columnar:
    { "columns": [...], "rows": [[...], ...], "metadata": {...} }

同「2026 中期業績前景庫」係兩件唔同嘅嘢 —— 嗰個逐間有文字分析同市場
數據,呢個係全市場單一把尺嘅排名。所以唔覆蓋,自己一個檔、自己一頁。

腳本會先驗證先至加密(寧願唔出街,都唔好出街咗先發現分數係錯):
    · 欄位齊、筆數同 metadata 對得上
    · ticker 冇重複、全部 5 位數
    · rank 由 1 連續到 N,而且等於 fundamental_score 由高到低
    · fundamental = business×50% + financial×30% + quality_risk×20%
    · 分數全部喺 0–100 之間

用法:
    export MEMBER_DATA_PASSWORD='...'
    python3 scripts/build_hk_ranking.py <ranking.json>
"""
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import enc_utils  # noqa: E402

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TARGET = os.path.join(ROOT, "hk_fundamental_ranking.enc")

SCORES = ("business_score", "financial_score", "quality_risk_score", "fundamental_score")
REQUIRED = ("rank", "ticker", "company_name") + SCORES
# 由 804 筆反推出嚟,最大誤差 0.0001。權重變咗就要改呢度同頁面嘅說明。
WEIGHTS = {"business_score": 0.50, "financial_score": 0.30, "quality_risk_score": 0.20}


def fail(msg):
    raise SystemExit(f"停手:{msg}")


def validate(cols, rows, meta):
    missing = [c for c in REQUIRED if c not in cols]
    if missing:
        fail(f"缺欄位 {missing}")
    if meta.get("row_count") not in (None, len(rows)):
        fail(f"metadata 寫住 {meta['row_count']} 筆,實際 {len(rows)} 筆")

    tickers = [str(r["ticker"]) for r in rows]
    if len(set(tickers)) != len(tickers):
        fail("有重複 ticker")
    odd = {t for t in tickers if len(t) != 5 or not t.isdigit()}
    if odd:
        fail(f"ticker 唔係 5 位數字:{sorted(odd)[:5]}")

    for c in SCORES:
        bad = [r["ticker"] for r in rows if not (0 <= r[c] <= 100)]
        if bad:
            fail(f"{c} 有 {len(bad)} 筆唔喺 0–100:{bad[:5]}")

    ranks = sorted(r["rank"] for r in rows)
    if ranks != list(range(1, len(rows) + 1)):
        fail("rank 唔係由 1 連續到 N")
    ordered = sorted(rows, key=lambda r: -r["fundamental_score"])
    off = [r["ticker"] for i, r in enumerate(ordered) if r["rank"] != i + 1]
    if off:
        fail(f"rank 同 fundamental_score 排序唔一致:{off[:5]}")

    worst = max(
        abs(sum(r[c] * w for c, w in WEIGHTS.items()) - r["fundamental_score"])
        for r in rows
    )
    if worst > 0.01:
        fail(f"fundamental_score 對唔上 50/30/20 加權,最大誤差 {worst:.4f}")
    return worst


def build(src):
    password = enc_utils.get_password()
    with open(src, encoding="utf-8") as f:
        raw = json.load(f)

    cols = raw["columns"]
    rows = [dict(zip(cols, r)) for r in raw["rows"]]
    meta = raw.get("metadata", {})
    worst = validate(cols, rows, meta)

    payload = {
        "title": "港股基本面排名",
        "version": meta.get("version", "V12.3"),
        "generated": (meta.get("generated_at") or "")[:10],
        "count": len(rows),
        "weights": WEIGHTS,
        # 保留 columnar:804 × 7,攤開做物件會大兩倍,前端一行就砌返。
        "columns": list(REQUIRED),
        "rows": [[r[c] for c in REQUIRED] for r in rows],
    }
    enc_utils.encrypt_data(json.dumps(payload, ensure_ascii=False,
                                     separators=(",", ":")), TARGET, password)

    size = os.path.getsize(TARGET) / 1024
    top = sorted(rows, key=lambda r: r["rank"])[0]
    print(f"{os.path.basename(TARGET)}:{len(rows)} 隻、{size:.0f}KB")
    print(f"  版本 {payload['version']} · 產生日期 {payload['generated']}")
    print(f"  加權核對通過(最大誤差 {worst:.4f})")
    print(f"  第一名:{top['ticker']} {top['company_name']} {top['fundamental_score']:.2f}")


if __name__ == "__main__":
    if len(sys.argv) < 2:
        raise SystemExit("用法:python3 scripts/build_hk_ranking.py <ranking.json>")
    build(sys.argv[1])
