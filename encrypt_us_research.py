"""Encrypt US research reports for static hosting on landing-page.

Mirrors encrypt_us_transcript.py — same PBKDF2 + AES-GCM scheme so the
landing-page frontend can decrypt with the same browser-side logic.

Usage:
    python encrypt_us_research.py <unified_password>
"""
import base64
import json
import os
import sys
from datetime import datetime
from pathlib import Path

from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.ciphers.aead import AESGCM

if len(sys.argv) < 2:
    print("Usage: python encrypt_us_research.py <unified_password>")
    sys.exit(1)
PASSWORD = sys.argv[1]

# Paths
HERE = Path(__file__).parent.resolve()
PILOT_DIR = Path("/mnt/p/Shared/code/reports/pilot_20260607")
BUNDLE_DIR = Path("/home/edward/.hermes/hermes-agent/reports/pilot")
SOURCE_DIR = PILOT_DIR  # markdown lives here
DST_INDEX = HERE / "us_research_index.enc"
DST_DATA = HERE / "us_research_data"
DST_DATA.mkdir(exist_ok=True)

PASSWORD_PEPPER = b""  # Match the existing us-transcript-db scheme exactly
                    # (browser _decryptEnc does NOT use a pepper)


def encrypt_bytes(plaintext: bytes, password: str) -> str:
    salt = os.urandom(16)
    nonce = os.urandom(12)
    kdf = PBKDF2HMAC(algorithm=hashes.SHA256(), length=32,
                     salt=salt + PASSWORD_PEPPER, iterations=100_000)
    key = kdf.derive(password.encode())
    ct = AESGCM(key).encrypt(nonce, plaintext, None)
    return base64.b64encode(salt + nonce + ct).decode()


def encrypt_file(src: Path, dst: Path):
    enc = encrypt_bytes(src.read_bytes(), PASSWORD)
    dst.write_text(enc, encoding="utf-8")


# Build index from each report's bundle (so we can show sector/price/etc.
# without decrypting every individual report).
def load_bundle_meta(symbol: str) -> dict:
    bundle_path = BUNDLE_DIR / f"{symbol}_bundle.json"
    if not bundle_path.exists():
        return {}
    try:
        b = json.loads(bundle_path.read_text(encoding="utf-8"))
    except Exception:
        return {}
    company = b.get("company", {}) or {}
    price = b.get("price", {}) or {}
    income = b.get("income_latest", []) or []
    latest_period = (income[0].get("fiscal_period", "") if income else "")
    market_cap = company.get("market_cap", "")
    try:
        mcap_b = round(float(market_cap) / 1e9, 2) if market_cap else 0
    except (ValueError, TypeError):
        mcap_b = 0
    try:
        close = float(price.get("close", 0) or 0)
    except (ValueError, TypeError):
        close = 0
    try:
        hi = float(price.get("hi52", 0) or 0)
    except (ValueError, TypeError):
        hi = 0
    return {
        "symbol": symbol,
        "name_en": company.get("name_en", ""),
        "sector": company.get("sector", ""),
        "industry": company.get("industry", ""),
        "report_date": price.get("trade_date", ""),
        "latest_quarter": latest_period,
        "stock_price_usd": round(close, 2),
        "hi52": round(hi, 2),
        "market_cap_b": mcap_b,
    }


# Find all *_tier1.md files in SOURCE_DIR
md_files = sorted(SOURCE_DIR.glob("*_tier1.md"))
if not md_files:
    print(f"No *_tier1.md files in {SOURCE_DIR}")
    sys.exit(1)

print(f"Found {len(md_files)} tier-1 reports to encrypt")

tickers_meta = []
for md in md_files:
    symbol = md.stem.replace("_tier1", "").upper()
    print(f"  {symbol}: encrypting {md.name} ({md.stat().st_size:,} bytes)")

    # Encrypt the markdown body
    dst = DST_DATA / f"{symbol}.enc"
    encrypt_file(md, dst)

    # Collect metadata
    meta = load_bundle_meta(symbol)
    meta["tier"] = 1
    meta["filename"] = f"us_research_data/{symbol}.enc"
    meta["char_count"] = md.stat().st_size
    tickers_meta.append(meta)

# Build index.json
sectors = {}
for m in tickers_meta:
    sec = m.get("sector") or "Unknown"
    sectors[sec] = sectors.get(sec, 0) + 1

index = {
    "version": "1.0",
    "generated_at": datetime.utcnow().isoformat() + "Z",
    "total_tickers": len(tickers_meta),
    "by_sector": dict(sorted(sectors.items(), key=lambda x: -x[1])),
    "tickers": tickers_meta,
}

# Encrypt index
index_path = SOURCE_DIR / "us_research_index.json"
index_path.write_text(json.dumps(index, indent=2, ensure_ascii=False), encoding="utf-8")
encrypt_file(index_path, DST_INDEX)
print(f"\n  index: {DST_INDEX.name} ({DST_INDEX.stat().st_size:,} bytes)")
print(f"  data:  {DST_DATA}/ ({len(md_files)} files)")
print("Done.")
