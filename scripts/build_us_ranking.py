#!/usr/bin/env python3
"""由美股 V11.x 業績評分匯出檔產生會員版加密資料。

同港股嗰個(build_hk_ranking.py)係姊妹腳本,但模型唔一樣,匯出檔前言
講得好清楚:「為避免錯誤硬套港股模型,美股中間三欄採原生可核對欄位」。

    港股 V12.3   總分 = 業務×50% + 財務×30% + 質素風險×20%
    美股 V11.5   總分 = 基本面分(指引前) + 指引修正

而且「趨勢質素」同「業績後延續」兩欄喺現有美股市場快照未單列,前言明講
保留同格式但留空 —— 腳本會確認佢哋真係空,唔好靜靜地當 0 用。

輸入資料嘅已知狀況(2026-09-15 版核對過):
    · 指引修正有浮點雜訊(±2e-07、2.9999998 呢類),實際意思係 0 同 ±3。
      四捨五入到小數 2 位,1,986 筆嘅排名次序零變動,所以照 round。
    · 分類信心得三個值(90 / 97 / 99),係三級標籤唔係連續分數。
    · 約 44% 公司名稱只係重複代號(資料源冇全名),頁面照樣顯示。

用法:
    export MEMBER_DATA_PASSWORD='...'
    python3 scripts/build_us_ranking.py <US_V11_5_..._YYYYMMDD.csv>
"""
import json
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import enc_utils  # noqa: E402
import ranking_common as rc  # noqa: E402

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TARGET = os.path.join(ROOT, "us_fundamental_ranking.enc")

COLMAP = [
    ("V11.5排名", "rank", int),
    ("股票代號", "ticker", str),
    ("公司名稱", "name", str),
    ("行業", "industry", str),
    ("市值(十億USD)", "mcap", float),
    ("ADV20(百萬USD)", "adv20", float),
    ("ADV20狀態", "adv20_ok", str),
    ("基本面分(指引前)", "base", float),
    ("指引修正", "guidance", float),
    ("分類信心", "confidence", float),
    ("V11.5基本面總分", "fundamental", float),
    ("全市場RS", "rs", float),
    ("價格動能", "price_momentum", float),
    ("價格－基本面差", "price_gap", float),
    ("參考50/50綜合分", "ref_5050", float),
    ("V11.4舊基本面排名", "rank_prev", int),
    ("排名變動(正=上升)", "rank_change", int),
    ("備註", "note", str),
]
COLUMNS = [k for _, k, _ in COLMAP] + ["name_zh"]
# 前言講明呢兩欄留空。確認佢哋真係空 —— 如果將來有數,要有人特登決定
# 點用,而唔係靜靜地當 0 塞落頁面度。
MUST_BE_BLANK = ("趨勢質素", "業績後延續")

# 補公司名用嘅對照來源。排名匯出檔有 44% 公司只係重複代號(資料源冇記低
# 全名),但同一批股喺其他會員資料庫係有名嘅 —— 唔使去外面攞,自己夾返。
# (檔案, 取哪一層, 代號欄, 名稱欄, 落英文定中文)
NAME_SOURCES = [
    ("us_stocks_data.enc", None, "code", "en_name", "en"),
    ("us_stocks_data.enc", None, "code", "name", "zh"),
    ("us_rs_latest.enc", ["ratings"], "symbol", "name_en", "en"),
    ("us_weinstein_latest.enc", ["stages"], "symbol", "name_en", "en"),
    ("us_keywords_export.enc", None, "s", "n", "en"),
    ("us_transcript_index.enc", None, "symbol", "name", "en"),
    ("us_research_index.enc", ["tickers"], "symbol", "name_en", "en"),
]


def norm_symbol(s):
    """us_stocks_data 用 EC.N / PKX.N 咁嘅格式,剝走交易所後綴先夾得返。"""
    return re.sub(r"\.(N|O|A|P|OQ|US|K)$", "", (s or "").strip().upper())


def name_lookup(password):
    en, zh = {}, {}
    for fname, path, sym_key, name_key, lang in NAME_SOURCES:
        src = os.path.join(ROOT, fname)
        if not os.path.exists(src):
            continue
        data = json.loads(enc_utils.decrypt_file(src, password))
        for step in (path or []):
            data = data[step]
        target = zh if lang == "zh" else en
        for r in data:
            sym = norm_symbol(r.get(sym_key))
            name = (r.get(name_key) or "").strip()
            # 名等於代號嘅唔算「有名」,唔好攞嚟補
            if sym and name and name.upper() != sym:
                target.setdefault(sym, name)
    return en, zh


def fill_names(rows, password):
    """只補冇名嗰啲,絕不覆蓋。

    對照庫同排名檔兩邊都有名嘅有 1,120 隻,其中 772 隻寫法唔同
    (「Inc.」對「Inc」、有冇「-A」股份類別)。排名檔自己嗰個寫得好啲,
    所以有名嘅一律唔郁 —— 補名係補窿,唔係統一格式。
    """
    en, zh = name_lookup(password)
    filled = 0
    for r in rows:
        r["name_zh"] = zh.get(r["ticker"], "")
        if r["name"].strip().upper() == r["ticker"].strip().upper():
            better = en.get(r["ticker"])
            if better:
                r["name"] = better
                filled += 1
    still = sum(1 for r in rows if r["name"].strip().upper() == r["ticker"].strip().upper())
    return filled, still, sum(1 for r in rows if r["name_zh"])


def validate(rows, raw_rows):
    rc.check_tickers(rows)
    rc.check_range(rows, ("base", "confidence", "fundamental"))
    rc.check_range(rows, ("guidance",), lo=-100, hi=100)
    rc.check_ranking(rows)

    worst = max(abs(r["base"] + r["guidance"] - r["fundamental"]) for r in rows)
    if worst > 0.01:
        rc.fail(f"總分對唔上「基本面分 + 指引修正」,最大誤差 {worst:.4f}")

    for col in MUST_BE_BLANK:
        if col not in raw_rows[0]:
            rc.fail(f"匯出檔缺咗 {col} 欄")
        filled = [r["股票代號"] for r in raw_rows if (r[col] or "").strip()]
        if filled:
            rc.fail(f"{col} 前言話留空,但有 {len(filled)} 筆有值:{filled[:5]}。"
                    "資料格式變咗,要人手決定點顯示先好再跑。")
    return worst


def build(src):
    password = enc_utils.get_password()
    raw_rows, snapshot, _ = rc.read_csv(src)
    rows = rc.parse(raw_rows, COLMAP)
    worst = validate(rows, raw_rows)

    # 浮點雜訊:±2e-07 顯示做 "+0.0000002" 好核突,而且會令人以為
    # 個模型真係有咁細嘅調整。四捨五入唔會郁到排名(核對過零變動)。
    for r in rows:
        for k in ("base", "guidance", "fundamental", "rs", "price_momentum",
                  "price_gap", "ref_5050", "mcap", "adv20"):
            if r.get(k) is not None:
                r[k] = round(r[k], 2)
    rc.check_ranking(rows)  # round 完再驗一次,確認排名仍然企得住

    filled, unnamed, zh_count = fill_names(rows, password)

    rows.sort(key=lambda r: r["rank"])
    industries = sorted({r["industry"] for r in rows if r.get("industry")})

    payload = {
        "title": "美股業績評分資料庫",
        "market": "us",
        "version": "V11.5",
        "generated": rc.file_date(os.path.basename(src)),
        "snapshot": snapshot,
        "count": len(rows),
        "formula": "總分 = 基本面分(指引前) + 指引修正",
        "industries": industries,
        "unnamed": unnamed,
        "name_zh_count": zh_count,
        "ref_note": "參考 50/50 綜合分只供輔助,唔改寫正式排名。",
        "columns": COLUMNS,
        "rows": [[r.get(c) for c in COLUMNS] for r in rows],
    }
    enc_utils.encrypt_data(json.dumps(payload, ensure_ascii=False,
                                     separators=(",", ":")), TARGET, password)

    size = os.path.getsize(TARGET) / 1024
    top = rows[0]
    print(f"{os.path.basename(TARGET)}:{len(rows)} 隻、{size:.0f}KB")
    print(f"  版本 V11.5 · 檔案日期 {payload['generated']} · 市場快照 {snapshot}")
    print(f"  {len(industries)} 個行業")
    print(f"  總分公式核對通過(最大誤差 {worst:.4f})、排名變動核對通過")
    print(f"  趨勢質素／業績後延續 確認留空(同前言一致)")
    print(f"  公司名:由其他會員資料庫補返 {filled} 隻,"
          f"仲有 {unnamed} 隻只有代號" + (" (RH 本身就係叫 RH)" if unnamed == 1 else ""))
    print(f"  中文名:{zh_count} / {len(rows)} 隻夾得返")
    print(f"  第一名:{top['ticker']} {top['name']} {top['fundamental']:.2f}")


if __name__ == "__main__":
    if len(sys.argv) < 2:
        raise SystemExit("用法:python3 scripts/build_us_ranking.py <排名匯出檔.csv>")
    build(sys.argv[1])
