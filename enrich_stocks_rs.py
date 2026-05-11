#!/usr/bin/env python3.12
"""
Enrich stocks-db datasets with RS rating data, then re-classify type_1m / type_3m
using RS Composite percentile rank (方案 B).

For each ticker:
  - Look up rs_rating composite + 5d + 50d (latest date)
  - Recompute type by quadrant of (revenue growth × Composite):
        growth ≥ 10% & comp ≥ 50 → 成長股
        growth ≥ 10% & comp < 50 → 價值股
        growth < 10% & comp ≥ 50 → 投機股
        growth < 10% & comp < 50 → 困境股
        missing rev_growth or comp → 資料不足
  - type_1m uses 5d rating instead of Composite for short-term version

Inputs:
  HK: hk_stocks_data.enc (decrypt with member password)
  US: us-stocks-db.html RAW_DATA (inline JS array)

Outputs (overwrite):
  HK: hk_stocks_data.enc (re-encrypted, same password)
  US: us_stocks_data.json + .enc; us-stocks-db.html migrated to fetch .enc
"""
import os, sys, json, re, base64, argparse
from pathlib import Path

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'quant-db'))
from config.settings import (
    CLICKHOUSE_HOST, CLICKHOUSE_PORT, CLICKHOUSE_DB, CLICKHOUSE_USER, CLICKHOUSE_PASSWORD,
)
import clickhouse_connect

from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.ciphers.aead import AESGCM


HERE = Path(__file__).resolve().parent
PW = "Inv-2604-H8rW"          # member password (RS rating, Weinstein, etc.)
PW_HKDB = "hkdb-free-2604"    # separate password for free hk-stocks-db page
GROWTH_THRESHOLD = 10.0    # %


def get_client():
    return clickhouse_connect.get_client(
        host=CLICKHOUSE_HOST or 'localhost',
        port=int(CLICKHOUSE_PORT or 8123),
        database=CLICKHOUSE_DB or 'quant',
        username=CLICKHOUSE_USER or 'quant',
        password=CLICKHOUSE_PASSWORD or 'quant123',
    )


def aes_decrypt(b64_text: str, password: str) -> bytes:
    raw = base64.b64decode(b64_text)
    salt, nonce, ct = raw[:16], raw[16:28], raw[28:]
    kdf = PBKDF2HMAC(algorithm=hashes.SHA256(), length=32, salt=salt, iterations=100_000)
    key = kdf.derive(password.encode())
    return AESGCM(key).decrypt(nonce, ct, None)


def aes_encrypt(plaintext: bytes, password: str) -> str:
    salt = os.urandom(16); nonce = os.urandom(12)
    kdf = PBKDF2HMAC(algorithm=hashes.SHA256(), length=32, salt=salt, iterations=100_000)
    key = kdf.derive(password.encode())
    ct = AESGCM(key).encrypt(nonce, plaintext, None)
    return base64.b64encode(salt + nonce + ct).decode()


def parse_pct(s):
    """Parse '14.0%' or '-5.4%' → 14.0; '#VALUE!' → None."""
    if not s or '#' in str(s) or s in ('—', '-'):
        return None
    try:
        return float(str(s).replace('%', '').replace(',', '').strip())
    except (ValueError, TypeError):
        return None


def normalize_hk(code: str) -> str:
    """'00700.HK' → '0700.HK' (rs_rating uses 4-digit format)."""
    if not code: return code
    if code.endswith('.HK') and len(code) == 8 and code[0] == '0':
        return code[1:]
    return code


def normalize_us(code: str) -> str:
    """'AAPL.O' or 'NVDA.N' → plain ticker."""
    if not code: return code
    return code.split('.')[0]


def classify(growth_pct, composite, rel_pct=None):
    """Map (growth, composite) → 4-quadrant type string.
    Falls back to rel_pct (旧 % vs benchmark) if composite missing."""
    if growth_pct is None:
        return '資料不足'
    growth_strong = growth_pct >= GROWTH_THRESHOLD
    if composite is not None:
        comp_strong = composite >= 50
    elif rel_pct is not None:
        # Fallback: use rel_pct sign as proxy (跑贏大盤 = strong)
        comp_strong = rel_pct > 0
    else:
        return '資料不足'
    if growth_strong and comp_strong:     return '成長股'
    if growth_strong and not comp_strong: return '價值股'
    if not growth_strong and comp_strong: return '投機股'
    return '困境股'


def fetch_rs_lookup(client, market: str) -> dict:
    """Return {symbol: (composite, rs_5d, rs_50d)} for latest date in market."""
    table = f'{market.lower()}_rs_rating'
    end_date = client.query(f"SELECT MAX(trade_date) FROM quant.{table}").result_rows[0][0]
    if end_date is None:
        return {}, None
    rows = client.query(f"""
        SELECT symbol, rs_rating_composite, rs_rating_5d, rs_rating_50d
        FROM quant.{table} FINAL
        WHERE trade_date = '{end_date.isoformat()}'
    """).result_rows
    return {r[0]: (r[1], r[2], r[3]) for r in rows}, end_date.isoformat()


def enrich_records(records, lookup, normalizer, growth_field):
    """Add rs_composite/rs_5d/rs_50d + recompute type_1m/type_3m."""
    matched = 0
    for r in records:
        sym = normalizer(r.get('code', ''))
        rs  = lookup.get(sym)
        if rs:
            comp, r5d, r50d = rs
            r['rs_composite'] = int(comp) if comp is not None else None
            r['rs_5d']        = int(r5d)  if r5d  is not None else None
            r['rs_50d']       = int(r50d) if r50d is not None else None
            matched += 1
        else:
            r['rs_composite'] = None
            r['rs_5d']        = None
            r['rs_50d']       = None

        growth = parse_pct(r.get(growth_field))
        # type_1m uses 5d rating (短期); type_3m uses composite (長期).
        # Falls back to rel_1m / rel_3m sign for tickers not in rs_rating.
        r['type_1m'] = classify(growth, r.get('rs_5d'),       parse_pct(r.get('rel_1m')))
        r['type_3m'] = classify(growth, r.get('rs_composite'), parse_pct(r.get('rel_3m')))
    return matched


def process_hk(client):
    enc_path = HERE / 'hk_stocks_data.enc'
    print(f'\n=== HK: {enc_path.name} ===')
    b64 = enc_path.read_text().strip()
    pt = aes_decrypt(b64, PW_HKDB)
    records = json.loads(pt)
    print(f'  loaded {len(records):,} records')
    lookup, latest = fetch_rs_lookup(client, 'HK')
    print(f'  rs_rating latest={latest}, {len(lookup):,} symbols')
    matched = enrich_records(records, lookup, normalize_hk, 'rev_growth_h2')
    print(f'  matched RS for {matched}/{len(records)} ({100*matched/len(records):.0f}%)')

    pt2 = json.dumps(records, ensure_ascii=False, separators=(',', ':')).encode('utf-8')
    enc_path.write_text(aes_encrypt(pt2, PW_HKDB))
    print(f'  re-encrypted {enc_path.name} ({len(pt2)/1024:.0f}KB plaintext)')

    # Type distribution
    from collections import Counter
    print('  type_3m distribution:', dict(Counter(r['type_3m'] for r in records)))


def process_us(client):
    """Extract RAW_DATA from us-stocks-db.html, enrich, write us_stocks_data.enc.

    Also patch us-stocks-db.html to fetch the .enc instead of inline RAW_DATA.
    """
    html_path = HERE / 'us-stocks-db.html'
    json_path = HERE / 'us_stocks_data.json'
    print(f'\n=== US ===')
    src = html_path.read_text(encoding='utf-8')

    # Source priority: previously extracted JSON (idempotent re-runs) → inline RAW_DATA
    records = None
    if json_path.exists():
        try:
            records = json.loads(json_path.read_text(encoding='utf-8'))
            print(f'  loaded {len(records):,} records from {json_path.name}')
        except Exception as e:
            print(f'  [WARN] {json_path.name} parse failed: {e}')
    if records is None:
        m = re.search(r'const RAW_DATA = (\[.*?\]);\n', src, re.DOTALL)
        if not m:
            raise RuntimeError('Could not find RAW_DATA in us-stocks-db.html and no JSON cache')
        records = json.loads(m.group(1))
        print(f'  loaded {len(records):,} records (inline RAW_DATA)')

    lookup, latest = fetch_rs_lookup(client, 'US')
    print(f'  rs_rating latest={latest}, {len(lookup):,} symbols')
    matched = enrich_records(records, lookup, normalize_us, 'rev_growth')
    print(f'  matched RS for {matched}/{len(records)} ({100*matched/len(records):.0f}%)')

    # Write JSON + ENC
    json_path.write_text(json.dumps(records, ensure_ascii=False, separators=(',', ':')),
                         encoding='utf-8')
    print(f'  wrote {json_path.name}')
    enc_path = HERE / 'us_stocks_data.enc'
    enc_path.write_text(aes_encrypt(json_path.read_bytes(), PW))
    print(f'  encrypted {enc_path.name}')

    # Patch us-stocks-db.html: replace inline RAW_DATA with fetch
    new_src, n = re.subn(
        r'const RAW_DATA = \[.*?\];\n',
        '// RAW_DATA loaded from us_stocks_data.enc — see loadAndInit\n'
        'let RAW_DATA = [];\n',
        src, count=1, flags=re.DOTALL)
    if n != 1:
        print('  [WARN] could not patch RAW_DATA assignment')
    else:
        # Find the init flow and inject the fetch+decrypt before it.
        if 'loadAndInit' not in new_src and 'us_stocks_data.enc' not in new_src:
            new_src = inject_us_loader(new_src)
        html_path.write_text(new_src, encoding='utf-8')
        print(f'  patched {html_path.name} to fetch us_stocks_data.enc')

    from collections import Counter
    print('  type_3m distribution:', dict(Counter(r['type_3m'] for r in records)))


def inject_us_loader(src: str) -> str:
    """Inject decrypt+fetch loader into us-stocks-db.html.

    Replaces the `if (sessionStorage…) initApp()` line with a version that
    first fetches us_stocks_data.enc, decrypts with member password,
    populates RAW_DATA, then calls initApp.
    """
    loader = '''
async function _decryptStocksData(){
  const pw = sessionStorage.getItem('unified_auth_pw') || '';
  if (!pw) { console.error('No auth pw'); return; }
  const r = await fetch('us_stocks_data.enc');
  const b64 = (await r.text()).trim();
  const raw = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
  const salt = raw.slice(0,16), nonce = raw.slice(16,28), ct = raw.slice(28);
  const km = await crypto.subtle.importKey("raw", new TextEncoder().encode(pw), "PBKDF2", false, ["deriveKey"]);
  const key = await crypto.subtle.deriveKey({name:"PBKDF2", salt, iterations:100000, hash:"SHA-256"},
    km, {name:"AES-GCM", length:256}, false, ["decrypt"]);
  const pt = await crypto.subtle.decrypt({name:"AES-GCM", iv:nonce}, key, ct);
  RAW_DATA = JSON.parse(new TextDecoder().decode(pt));
}
async function loadAndInit(){
  await _decryptStocksData();
  initApp();
}
'''
    # Replace direct initApp() with loadAndInit()
    src = src.replace('initApp();\n', 'loadAndInit();\n', 1)
    # Inject loader before initApp definition
    src = re.sub(r'(function initApp\(\))', loader + r'\1', src, count=1)
    return src


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--market', choices=['HK', 'US'], default=None,
                    help='Limit to one market (default: both)')
    args = ap.parse_args()

    client = get_client()
    if args.market in (None, 'HK'):
        process_hk(client)
    if args.market in (None, 'US'):
        process_us(client)


if __name__ == '__main__':
    main()
