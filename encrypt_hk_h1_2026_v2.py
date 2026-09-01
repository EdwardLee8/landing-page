#!/usr/bin/env python3
"""Encrypt 2026 H1 HK earnings CSV for static hosting.

Usage: python3 encrypt_hk_h1_2026_v2.py <password> [csv_path]
"""
from __future__ import annotations

import base64
import csv
import json
import os
import sys
from datetime import date, datetime

from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC
from cryptography.hazmat.primitives import hashes

PASSWORD = sys.argv[1] if len(sys.argv) > 1 else "Inv-2604-H8rW"
CSV_PATH = sys.argv[2] if len(sys.argv) > 2 else os.path.expanduser(
    "~/.hermes/cache/documents/doc_a3934abce9cd_hk_2026h1_db.csv"
)
BASE = "/mnt/p/Shared/code/Claude/landing-page"
DST = os.path.join(BASE, "hk_h1_2026_data.enc")

# CSV columns (in order) → JSON keys
# 29 columns in CSV
CSV_COLS = [
    "分析日期", "股票代號", "公司名稱", "業績期", "新評分",
    "增長動能/25", "盈利能力/20", "現金流/資產負債表/15", "可見度/20", "策略選擇權/20",
    "風險扣分", "行業/商業模式", "發展階段", "分類", "核心判斷",
    "財務主線", "分部動能", "領先指標/訂單", "現金流與資產負債表", "管理層指引/前瞻",
    "外部行業驗證", "主要催化劑", "主要風險", "6–18個月展望",
    "資本配置/股東回報", "Thesis驗證條件", "Thesis失效條件",
    "當時發展全景摘要", "未來判斷因果鏈",
]

# Map Chinese column names to short English keys for the JSON
# (keeps payload smaller, HTML maps back to display labels)
KEY_MAP = {
    "分析日期": "date",
    "股票代號": "code",
    "公司名稱": "name",
    "業績期": "period",
    "新評分": "score",
    "增長動能/25": "g_score",      # /25
    "盈利能力/20": "p_score",      # /20
    "現金流/資產負債表/15": "c_score",  # /15
    "可見度/20": "v_score",        # /20
    "策略選擇權/20": "s_score",    # /20
    "風險扣分": "risk_ded",
    "行業/商業模式": "industry",
    "發展階段": "stage",
    "分類": "category",
    "核心判斷": "core_judgment",
    "財務主線": "financials",
    "分部動能": "segment",
    "領先指標/訂單": "leading",
    "現金流與資產負債表": "cashflow",
    "管理層指引/前瞻": "guidance",
    "外部行業驗證": "industry_validation",
    "主要催化劑": "catalyst",
    "主要風險": "risk",
    "6–18個月展望": "outlook",
    "資本配置/股東回報": "capital",
    "Thesis驗證條件": "thesis_valid",
    "Thesis失效條件": "thesis_invalid",
    "當時發展全景摘要": "summary",
    "未來判斷因果鏈": "causal_chain",
}

# Display labels for HTML (English key → Chinese label)
DISPLAY = {
    "date": "分析日期",
    "code": "股票代號",
    "name": "公司名稱",
    "period": "業績期",
    "score": "評分",
    "g_score": "增長動能 /25",
    "p_score": "盈利能力 /20",
    "c_score": "現金流 /15",
    "v_score": "可見度 /20",
    "s_score": "策略選擇權 /20",
    "risk_ded": "風險扣分",
    "industry": "行業/商業模式",
    "stage": "發展階段",
    "category": "分類",
    "core_judgment": "核心判斷",
    "financials": "財務主線",
    "segment": "分部動能",
    "leading": "領先指標/訂單",
    "cashflow": "現金流與資產負債表",
    "guidance": "管理層指引/前瞻",
    "industry_validation": "外部行業驗證",
    "catalyst": "主要催化劑",
    "risk": "主要風險",
    "outlook": "6–18個月展望",
    "capital": "資本配置/股東回報",
    "thesis_valid": "Thesis驗證條件",
    "thesis_invalid": "Thesis失效條件",
    "summary": "發展全景摘要",
    "causal_chain": "未來判斷因果鏈",
}

# Section grouping for expandable detail view
SECTIONS = {
    "評分拆解": ["g_score", "p_score", "c_score", "v_score", "s_score", "risk_ded"],
    "基本面分析": ["industry", "stage", "category", "core_judgment", "financials", "segment"],
    "前瞻與驗證": ["leading", "guidance", "industry_validation", "catalyst", "risk"],
    "展望與策略": ["outlook", "capital", "thesis_valid", "thesis_invalid", "causal_chain"],
    "完整摘要": ["summary"],
}


def clean(v):
    if v is None:
        return None
    if isinstance(v, (datetime, date)):
        return v.isoformat() if isinstance(v, datetime) else v.isoformat()
    s = str(v).strip()
    return s if s else None


def encrypt_bytes(plaintext: bytes, password: str) -> str:
    salt = os.urandom(16)
    nonce = os.urandom(12)
    kdf = PBKDF2HMAC(algorithm=hashes.SHA256(), length=32, salt=salt, iterations=100_000)
    key = kdf.derive(password.encode())
    ct = AESGCM(key).encrypt(nonce, plaintext, None)
    return base64.b64encode(salt + nonce + ct).decode()


def main():
    rows = []
    with open(CSV_PATH, encoding="utf-8-sig") as f:
        reader = csv.DictReader(f)
        for raw in reader:
            rec = {}
            for cn_col, en_key in KEY_MAP.items():
                val = raw.get(cn_col, "")
                rec[en_key] = clean(val)
            if not rec.get("code"):
                continue
            # Normalize code to 5-digit string
            code = rec["code"]
            try:
                rec["code"] = str(int(float(code))).zfill(5)
            except (ValueError, TypeError):
                pass
            # Convert score to int
            if rec.get("score"):
                try:
                    rec["score"] = int(float(rec["score"]))
                except (ValueError, TypeError):
                    pass
            # Convert sub-scores to float
            for k in ["g_score", "p_score", "c_score", "v_score", "s_score", "risk_ded"]:
                if rec.get(k):
                    try:
                        rec[k] = float(rec[k])
                    except (ValueError, TypeError):
                        pass
            rows.append(rec)

    payload = json.dumps(
        {
            "generated": "2026-08-20",
            "source": "hk_2026h1_db.csv",
            "count": len(rows),
            "rows": rows,
        },
        ensure_ascii=False,
        separators=(",", ":"),
    ).encode("utf-8")

    enc = encrypt_bytes(payload, PASSWORD)
    with open(DST, "w", encoding="utf-8") as f:
        f.write(enc)

    print(f"rows={len(rows)} bytes={len(payload)} enc={os.path.getsize(DST)} -> {DST}")

    # Also write the DISPLAY and SECTIONS as a separate JS file for the HTML
    meta_path = os.path.join(BASE, "hk_h1_2026_meta.js")
    with open(meta_path, "w", encoding="utf-8") as f:
        f.write("// Auto-generated display metadata for hk-h1-2026-db.html\n")
        f.write("const DISPLAY = ")
        json.dump(DISPLAY, f, ensure_ascii=False, indent=2)
        f.write(";\n\nconst SECTIONS = ")
        json.dump(SECTIONS, f, ensure_ascii=False, indent=2)
        f.write(";\n")
    print(f"meta -> {meta_path}")


if __name__ == "__main__":
    main()