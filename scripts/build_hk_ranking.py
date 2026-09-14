#!/usr/bin/env python3
"""由 V12.x 基本面排名匯出檔產生會員版加密資料。

輸入係研究流程匯出嘅 CSV(Big5-HKSCS,前兩行係標題同註腳,第三行先係
欄名)。亦支援早期嗰個 columnar JSON,但 JSON 淨係得排名同四個分數,
CSV 多咗行業、市值、流動性、RS、價格動能同上一版排名 —— 有 CSV 就用 CSV。

同「2026 中期業績前景庫」係兩件唔同嘅嘢:嗰個逐間有文字分析,呢個係全
市場單一把尺嘅排名。所以唔覆蓋,自己一個檔、自己一頁。

驗證先至加密(寧願唔出街,都唔好出街咗先發現分數係錯):
    · 欄名齊、筆數同排名連續
    · ticker 冇重複、補到 5 位數
    · 分數喺 0–100、rank 等於總分由高到低
    · 總分 = 業務×50% + 財務×30% + 質素風險×20%
    · 排名變動 = 舊排名 − 新排名

用法:
    export MEMBER_DATA_PASSWORD='...'
    python3 scripts/build_hk_ranking.py <2026H1HK_ALL_YYYYMMDD.csv>
"""
import csv
import io
import json
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import enc_utils  # noqa: E402

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TARGET = os.path.join(ROOT, "hk_fundamental_ranking.enc")

# 由 804 筆反推,最大誤差 0.0001。權重變咗就要改呢度同頁面嘅說明。
WEIGHTS = {"business": 0.50, "financial": 0.30, "quality_risk": 0.20}

# CSV 中文欄名 → 輸出用嘅英文 key。冇列出嘅欄會照跌咗。
COLMAP = [
    ("V12.3排名", "rank", int),
    ("股票代號", "ticker", str),
    ("公司名稱", "name", str),
    ("行業", "industry", str),
    ("市值(億HKD)", "mcap", float),
    ("ADV20(百萬HKD)", "adv20", float),
    ("ADV20狀態", "adv20_ok", str),
    ("業務動能分", "business", float),
    ("財務分", "financial", float),
    ("質素／風險分", "quality_risk", float),
    ("V12.3基本面總分", "fundamental", float),
    ("全市場RS", "rs", float),
    ("趨勢質素", "trend_quality", float),
    ("業績後延續", "post_result", float),
    ("價格動能", "price_momentum", float),
    ("價格－基本面差", "price_gap", float),
    ("參考50/50綜合分", "ref_5050", float),
    ("V11.6舊排名", "rank_prev", int),
    ("排名變動(正=上升)", "rank_change", int),
]
COLUMNS = [k for _, k, _ in COLMAP]


def fail(msg):
    raise SystemExit(f"停手:{msg}")


def num(v, cast):
    v = (v or "").strip()
    if not v:
        return None
    try:
        return cast(float(v)) if cast is int else cast(v)
    except ValueError:
        return None


def read_csv(path):
    """Big5-HKSCS + 兩行前言。前言第二行寫住市場快照日期,順手抽返出嚟。"""
    raw = open(path, "rb").read()
    for enc in ("big5hkscs", "utf-8-sig", "cp950"):
        try:
            text = raw.decode(enc)
            break
        except UnicodeDecodeError:
            continue
    else:
        fail("解唔到編碼(試過 big5hkscs / utf-8 / cp950)")

    lines = text.splitlines()
    # 揾真正嘅欄名行:第一行有「股票代號」嗰行
    head = next((i for i, ln in enumerate(lines[:10]) if "股票代號" in ln), None)
    if head is None:
        fail("頭 10 行揾唔到欄名行(要有「股票代號」)")
    preamble = " ".join(lines[:head])
    snapshot = re.search(r"(\d{4}-\d{2}-\d{2})", preamble)
    rows = list(csv.DictReader(io.StringIO("\n".join(lines[head:]))))
    return rows, (snapshot.group(1) if snapshot else None), preamble


def read_json(path):
    raw = json.load(open(path, encoding="utf-8"))
    cols = raw["columns"]
    out = []
    for r in raw["rows"]:
        d = dict(zip(cols, r))
        out.append({
            "rank": d["rank"], "ticker": str(d["ticker"]).zfill(5),
            "name": d["company_name"], "industry": None,
            "business": d["business_score"], "financial": d["financial_score"],
            "quality_risk": d["quality_risk_score"], "fundamental": d["fundamental_score"],
        })
    return out, raw.get("metadata", {}).get("version", ""), None


def parse(rows):
    missing = [cn for cn, _, _ in COLMAP if cn not in rows[0]]
    if missing:
        fail(f"CSV 缺欄位 {missing}")
    out = []
    for raw in rows:
        rec = {}
        for cn, key, cast in COLMAP:
            rec[key] = (raw[cn] or "").strip() if cast is str else num(raw[cn], cast)
        if not rec["ticker"]:
            continue
        rec["ticker"] = rec["ticker"].zfill(5)
        out.append(rec)
    return out


def validate(rows):
    tickers = [r["ticker"] for r in rows]
    if len(set(tickers)) != len(tickers):
        fail("有重複 ticker")
    odd = {t for t in tickers if len(t) != 5 or not t.isdigit()}
    if odd:
        fail(f"ticker 唔係 5 位數字:{sorted(odd)[:5]}")

    for c in ("business", "financial", "quality_risk", "fundamental"):
        bad = [r["ticker"] for r in rows if r[c] is None or not (0 <= r[c] <= 100)]
        if bad:
            fail(f"{c} 有 {len(bad)} 筆缺失或者唔喺 0–100:{bad[:5]}")

    if sorted(r["rank"] for r in rows) != list(range(1, len(rows) + 1)):
        fail("rank 唔係由 1 連續到 N")
    # 按 rank 行一次,分數唔可以升返上去。唔可以攞自己 sort 出嚟嘅次序
    # 對 —— 有同分(804 筆入面有 3 對),邊隻排前係源頭決定,唔係我哋。
    by_rank = sorted(rows, key=lambda r: r["rank"])
    off = [b["ticker"] for a, b in zip(by_rank, by_rank[1:])
           if b["fundamental"] > a["fundamental"] + 1e-9]
    if off:
        fail(f"排名行落去總分反而升返:{off[:5]}")

    worst = max(abs(r["business"] * WEIGHTS["business"]
                    + r["financial"] * WEIGHTS["financial"]
                    + r["quality_risk"] * WEIGHTS["quality_risk"]
                    - r["fundamental"]) for r in rows)
    if worst > 0.01:
        fail(f"總分對唔上 50/30/20 加權,最大誤差 {worst:.4f}")

    drift = [r["ticker"] for r in rows
             if r.get("rank_prev") is not None and r.get("rank_change") is not None
             and r["rank_prev"] - r["rank"] != r["rank_change"]]
    if drift:
        fail(f"排名變動 ≠ 舊排名 − 新排名:{drift[:5]}")
    return worst


def build(src):
    password = enc_utils.get_password()
    if src.lower().endswith(".json"):
        rows, version, snapshot = read_json(src)
        preamble = ""
    else:
        raw, snapshot, preamble = read_csv(src)
        rows = parse(raw)
        version = "V12.3"
    worst = validate(rows)
    rows.sort(key=lambda r: r["rank"])

    industries = sorted({r["industry"] for r in rows if r.get("industry")})
    payload = {
        "title": "港股基本面排名",
        "version": version,
        "generated": re.search(r"(\d{8})", os.path.basename(src)),
        "snapshot": snapshot,
        "count": len(rows),
        "weights": WEIGHTS,
        "industries": industries,
        # 參考 50/50 係輔助分析,匯出檔前言明確講「不改寫正式排名」。
        # 頁面要照呢句標示,唔可以當成另一個排名。
        "ref_note": "參考 50/50 綜合分只作輔助分析,唔改寫正式排名。",
        "columns": COLUMNS,
        "rows": [[r.get(c) for c in COLUMNS] for r in rows],
    }
    payload["generated"] = (payload["generated"].group(1) if payload["generated"]
                            else None)
    if payload["generated"]:
        g = payload["generated"]
        payload["generated"] = f"{g[:4]}-{g[4:6]}-{g[6:]}"

    enc_utils.encrypt_data(json.dumps(payload, ensure_ascii=False,
                                     separators=(",", ":")), TARGET, password)

    size = os.path.getsize(TARGET) / 1024
    top = rows[0]
    print(f"{os.path.basename(TARGET)}:{len(rows)} 隻、{size:.0f}KB")
    print(f"  版本 {version} · 檔案日期 {payload['generated']} · 市場快照 {snapshot}")
    print(f"  {len(industries)} 個行業:{'、'.join(industries)}")
    print(f"  加權核對通過(最大誤差 {worst:.4f})、排名變動核對通過")
    print(f"  第一名:{top['ticker']} {top['name']} {top['fundamental']:.2f}")


if __name__ == "__main__":
    if len(sys.argv) < 2:
        raise SystemExit("用法:python3 scripts/build_hk_ranking.py <排名匯出檔.csv>")
    build(sys.argv[1])
