#!/usr/bin/env python3.12
"""
Build US theme strength data using industry-based mapping.

Reads:
  - us_themes_industry.json: theme definition with industry mapping
  - ClickHouse company_info: symbol -> industry mapping
  - us_rs_latest.enc: RS rating data

Output:
  - us_theme_strength.json: theme strength data for dashboard

Usage:
    python build_us_theme_strength.py [--output us_theme_strength.json]
"""
import sys, os, json, base64, argparse
from pathlib import Path
from collections import defaultdict

# ── Paths ──────────────────────────────────────────────────────────────
HERE = Path(__file__).resolve().parent
LANDING_PAGE = HERE / "landing-page"
THEME_DEF = HERE / "us_themes_industry.json"
RS_ENC = LANDING_PAGE / "us_rs_latest.enc"
DEFAULT_OUTPUT = LANDING_PAGE / "us_theme_strength.json"

# ── Encryption ─────────────────────────────────────────────────────────
PW = "Inv-2604-H8rW"

def aes_decrypt(b64_text: str) -> dict:
    from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC
    from cryptography.hazmat.primitives import hashes
    from cryptography.hazmat.primitives.ciphers.aead import AESGCM
    raw = base64.b64decode(b64_text)
    salt, nonce, ct = raw[:16], raw[16:28], raw[28:]
    kdf = PBKDF2HMAC(algorithm=hashes.SHA256(), length=32, salt=salt, iterations=100_000)
    key = kdf.derive(PW.encode())
    pt = AESGCM(key).decrypt(nonce, ct, None)
    return json.loads(pt)

# ── ClickHouse ─────────────────────────────────────────────────────────
def get_client():
    import importlib.util
    settings_path = Path("/mnt/p/Shared/code/quant-db/config/settings.py")
    spec = importlib.util.spec_from_file_location("settings", settings_path)
    settings = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(settings)
    import clickhouse_connect
    return clickhouse_connect.get_client(
        host=getattr(settings, 'CLICKHOUSE_HOST', None) or 'localhost',
        port=int(getattr(settings, 'CLICKHOUSE_PORT', None) or 8123),
        database=getattr(settings, 'CLICKHOUSE_DB', None) or 'quant',
        username=getattr(settings, 'CLICKHOUSE_USER', None) or 'quant',
        password=getattr(settings, 'CLICKHOUSE_PASSWORD', None) or 'quant123',
        send_receive_timeout=600,
    )

# ── Main ───────────────────────────────────────────────────────────────
def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    args = parser.parse_args()

    # 1. Load theme definition
    theme_def = json.load(open(THEME_DEF, encoding='utf-8'))
    themes = theme_def['themes']
    print(f"Loaded {len(themes)} theme definitions")

    # 2. Load RS data
    rs_data = aes_decrypt(RS_ENC.read_text().strip())
    rs_date = rs_data.get('date', '')
    rs_ratings = {r['symbol']: r for r in rs_data.get('ratings', [])}
    print(f"RS data: {len(rs_ratings)} stocks, date={rs_date}")

    # 3. Load industry mapping from ClickHouse
    cl = get_client()
    rows = cl.query(
        "SELECT symbol, industry FROM company_info WHERE market='US' AND industry != ''"
    ).result_rows
    sym2industry = {sym: ind for sym, ind in rows}
    print(f"Industry mapping: {len(sym2industry)} stocks")

    # 4. Build industry -> symbols reverse index
    industry2syms = defaultdict(set)
    for sym, ind in sym2industry.items():
        industry2syms[ind].add(sym)

    # 5. Compute theme strength
    results = []
    for theme in themes:
        theme_zh = theme['theme_zh']
        industries = theme.get('industries', [])

        # Collect all symbols in these industries
        theme_syms = set()
        for ind in industries:
            theme_syms |= industry2syms.get(ind, set())

        # Filter to stocks with RS data
        rated = []
        for sym in theme_syms:
            if sym in rs_ratings:
                rated.append(rs_ratings[sym])

        n = len(theme_syms)  # total stocks in theme (from industry mapping)
        n_with_data = len(rated)  # stocks with RS data

        if n_with_data == 0:
            continue

        # Compute stats
        comps = [r['rs_rating_composite'] for r in rated if r.get('rs_rating_composite') is not None]
        mcap_total = sum(r.get('market_cap', 0) or 0 for r in rated)
        avg_rs = sum(comps) / len(comps) if comps else 0

        # Median RS
        sorted_comps = sorted(comps)
        mid = len(sorted_comps) // 2
        median_rs = sorted_comps[mid] if len(sorted_comps) % 2 else (sorted_comps[mid-1] + sorted_comps[mid]) / 2

        # Top stocks by RS composite
        rated.sort(key=lambda r: r.get('rs_rating_composite', 0) or 0, reverse=True)
        top = rated[:20]

        # 5D return (average)
        ret_5d_vals = [r.get('rs_ret_5d') for r in rated if r.get('rs_ret_5d') is not None]
        avg_ret_5d = sum(ret_5d_vals) / len(ret_5d_vals) if ret_5d_vals else 0

        ret_1d_vals = [r.get('rs_ret_5d') for r in rated if r.get('rs_ret_5d') is not None]  # Using 5d as proxy

        results.append({
            'theme': theme_zh,
            'theme_en': theme.get('theme_en', ''),
            'category': theme.get('category', ''),
            'n': n,
            'n_with_data': n_with_data,
            'total_market_cap': mcap_total,
            'avg_rs': round(avg_rs, 1),
            'median_rs': round(median_rs, 1),
            'return_5d': round(avg_ret_5d, 6),
            'return_1d': round(avg_ret_5d / 5, 6),  # Approximate 1D from 5D
            'top': [{
                'symbol': r['symbol'],
                'name': r.get('name_en', ''),
                'rs': r.get('rs_rating_composite', 0),
                'ret5': r.get('rs_ret_5d', 0),
                'ret20': r.get('rs_ret_20d', 0),
                'amount': r.get('amount', 0),
                'mcap': r.get('market_cap', 0),
            } for r in top],
            'bottom': [{
                'symbol': r['symbol'],
                'name': r.get('name_en', ''),
                'rs': r.get('rs_rating_composite', 0),
                'ret5': r.get('rs_ret_5d', 0),
                'ret20': r.get('rs_ret_20d', 0),
                'amount': r.get('amount', 0),
                'mcap': r.get('market_cap', 0),
            } for r in sorted(rated, key=lambda r: r.get('rs_rating_composite', 0) or 0)[:5]],
        })

    # 6. Sort by median RS descending
    results.sort(key=lambda x: x['median_rs'], reverse=True)

    # 7. Output
    output = {
        'generated_at': __import__('datetime').datetime.now().strftime('%Y-%m-%d %H:%M:%S'),
        'rs_date': rs_date,
        'rs_count': len(rs_ratings),
        'theme_count': len(results),
        'themes': results,
    }

    json.dump(output, open(args.output, 'w', encoding='utf-8'), ensure_ascii=False, indent=2)
    print(f"\nOutput: {args.output}")
    print(f"Themes: {len(results)}")

    # Print summary
    print("\n=== Theme Summary ===")
    for t in results:
        print(f"  n={t['n']:4d} n_data={t['n_with_data']:4d} mRS={t['median_rs']:5.1f} | {t['theme']}")

if __name__ == '__main__':
    main()
