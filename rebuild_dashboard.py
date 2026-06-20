#!/usr/bin/env python3.12
"""
Rebuild theme-strength-dashboard.html with updated US theme data.

Reads:
  - us_theme_strength.json: new US theme data (industry-based)
  - theme-strength-dashboard.html: existing dashboard (for HK + CN data)

Output:
  - theme-strength-dashboard.html (updated with new US data)
"""
import json, re, sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
DASHBOARD = HERE / "landing-page" / "theme-strength-dashboard.html"
US_DATA = HERE / "landing-page" / "us_theme_strength.json"

# 1. Load new US data
us = json.load(open(US_DATA, encoding='utf-8'))

# 2. Load existing dashboard to extract HK + CN data
html = open(DASHBOARD, encoding='utf-8').read()
match = re.search(r'<script id="data" type="application/json">(.*?)</script>', html, re.DOTALL)
if not match:
    print("ERROR: Cannot find inline data in dashboard")
    sys.exit(1)

old_data = json.loads(match.group(1))

# 3. Build new US market data
us_market = {
    "label": "美股 US",
    "rs_date": us['rs_date'],
    "rs_count": us['rs_count'],
    "theme_date": us['rs_date'],
    "theme_count": us['theme_count'],
    "cards": [{
        "theme": t['theme'],
        "n": t['n'],
        "return_1d": t.get('return_1d', 0),
        "return_5d": t['return_5d'],
        "n_with_data": t['n_with_data'],
        "total_market_cap": t['total_market_cap'],
        "avg_rs": t['avg_rs'],
        "top": t['top'],
        "bottom": t.get('bottom', []),
    } for t in us['themes']],
}

# 4. Merge: replace US, keep HK + CN
new_data = {
    "generated_at": us['generated_at'],
    "markets": {
        "US": us_market,
        "HK": old_data['markets']['HK'],
        "CN": old_data['markets']['CN'],
    }
}

# 5. Write back
new_json = json.dumps(new_data, ensure_ascii=False, separators=(',', ':'))
new_html = html[:match.start(1)] + new_json + html[match.end(1):]

# Backup
backup = DASHBOARD.with_suffix('.html.bak')
open(backup, 'w', encoding='utf-8').write(html)
print(f"Backup: {backup}")

open(DASHBOARD, 'w', encoding='utf-8').write(new_html)
print(f"Updated: {DASHBOARD}")
print(f"US themes: {us['theme_count']}")
print(f"HK themes: {old_data['markets']['HK']['theme_count']}")
print(f"CN themes: {old_data['markets']['CN']['theme_count']}")

# 6. Verify
print("\n=== US Theme Summary ===")
for t in us['themes'][:10]:
    print(f"  n={t['n']:4d} n_data={t['n_with_data']:4d} mRS={t['median_rs']:5.1f} | {t['theme']}")
print("  ...")
for t in us['themes'][-5:]:
    print(f"  n={t['n']:4d} n_data={t['n_with_data']:4d} mRS={t['median_rs']:5.1f} | {t['theme']}")
