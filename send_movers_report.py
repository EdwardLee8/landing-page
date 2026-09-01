#!/usr/bin/env python3.12
"""
Send daily RS rating movers report via Telegram.

Reads from quant.{us|hk|cn}_rs_movers (must be populated by compute_rs_movers.py
first), formats top-10 from each market into a Markdown message, and sends
to user's Telegram chat.

Bot token & chat are read from:
  C:\\Users\\Edward\\.claude\\channels\\telegram\\.env (TELEGRAM_BOT_TOKEN)
  C:\\Users\\Edward\\.claude\\channels\\telegram\\access.json (allowFrom[0] = chat_id)

Usage:
    python send_movers_report.py                  # send today's report
    python send_movers_report.py --top 5          # only top-5 per market
    python send_movers_report.py --dry-run        # print, don't send
"""
import sys, os, json, argparse, urllib.request, urllib.parse, io
from pathlib import Path

# Ensure stdout can render emoji + Chinese on Windows cp950 console
try:
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', line_buffering=True)
except Exception:
    pass

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'quant-db'))
from config.settings import (
    CLICKHOUSE_HOST, CLICKHOUSE_PORT, CLICKHOUSE_DB, CLICKHOUSE_USER, CLICKHOUSE_PASSWORD,
)
import clickhouse_connect


TG_DIR  = Path(os.path.expanduser('~')) / '.claude' / 'channels' / 'telegram'
TG_ENV  = TG_DIR / '.env'
TG_ACL  = TG_DIR / 'access.json'

MARKETS = [
    ('HK', '港股', 'hk_rs_movers', 'hk_rs_rating'),
    ('CN', 'A股', 'cn_rs_movers', 'cn_rs_rating'),
    ('US', '美股', 'us_rs_movers', 'us_rs_rating'),
]


def get_client():
    return clickhouse_connect.get_client(
        host=CLICKHOUSE_HOST or 'localhost',
        port=int(CLICKHOUSE_PORT or 8123),
        database=CLICKHOUSE_DB or 'quant',
        username=CLICKHOUSE_USER or 'quant',
        password=CLICKHOUSE_PASSWORD or 'quant123',
    )


def get_telegram_credentials():
    token = None
    if TG_ENV.exists():
        for line in TG_ENV.read_text().splitlines():
            if line.startswith('TELEGRAM_BOT_TOKEN='):
                token = line.split('=', 1)[1].strip()
    chat_id = None
    if TG_ACL.exists():
        acl = json.loads(TG_ACL.read_text())
        allowed = acl.get('allowFrom', [])
        if allowed:
            chat_id = allowed[0]
    return token, chat_id


def fetch_top(client, movers_table, rs_table, limit):
    """Latest top-N movers + name/sector enriched."""
    end_date = client.query(
        f"SELECT MAX(trade_date) FROM quant.{movers_table}"
    ).result_rows[0][0]
    if end_date is None:
        return None, []

    rows = client.query(f"""
        SELECT m.rank, m.symbol, m.delta, m.composite_today, m.composite_yesterday,
               coalesce(c.name_zh, c.name_en, s.name, m.symbol) AS name,
               coalesce(c.sector,  s.sector, c.industry, s.industry, '') AS sector
        FROM (SELECT * FROM quant.{movers_table} FINAL
              WHERE trade_date='{end_date.isoformat()}' ORDER BY rank LIMIT {limit}) m
        LEFT JOIN (SELECT symbol, name_en, name_zh, sector, industry
                   FROM quant.company_info FINAL) c ON c.symbol=m.symbol
        LEFT JOIN (SELECT symbol, name, sector, industry FROM quant.stock_info FINAL) s
                  ON s.symbol=m.symbol
        ORDER BY m.rank
    """).result_rows
    return end_date, rows


def md_escape(s):
    """Telegram MarkdownV2 special chars. Backslash MUST be replaced first
    (otherwise other replacements' backslashes get double-escaped)."""
    if s is None: return ''
    s = str(s)
    s = s.replace('\\', '\\\\')   # backslash first
    for ch in ['_', '*', '[', ']', '(', ')', '~', '`', '>', '#', '+', '-', '=', '|', '{', '}', '.', '!']:
        s = s.replace(ch, '\\' + ch)
    return s


def format_report(client, top_n=10):
    sections = []
    latest_date = None
    for code, label, movers_t, rs_t in MARKETS:
        end_date, rows = fetch_top(client, movers_t, rs_t, top_n)
        if end_date and (not latest_date or end_date > latest_date):
            latest_date = end_date
        if not rows:
            sections.append(f'*{md_escape(label)}*  _\\(無數據\\)_')
            continue
        date_s = end_date.isoformat() if end_date else '?'
        lines = [f'*{md_escape(label)}*  \\({md_escape(date_s)}\\)']
        for r in rows:
            rank, symbol, delta, today, yest, name, sector = r
            sign = '+' if delta > 0 else ''
            arrow = '↑' if delta > 0 else ('↓' if delta < 0 else '→')
            # Trim name to 16 chars for mobile readability
            name_disp = (name or symbol)[:16]
            lines.append(
                f'`#{rank:>2}`  *{md_escape(symbol)}*  '
                f'`{sign}{delta:>3d}` {arrow} '
                f'\\({md_escape(yest)}→{md_escape(today)}\\)  '
                f'_{md_escape(name_disp)}_'
            )
        sections.append('\n'.join(lines))

    header = f'📈 *每日 RS 排名上升榜 \\(Top {top_n}\\)*'
    if latest_date:
        header += f'\n_{md_escape(latest_date.isoformat())}_'

    body = '\n\n'.join([header] + sections)
    body += '\n\n[查看完整 Top 100](https://ai10xpro.com/movers)'
    return body


def send_telegram(token, chat_id, text):
    url = f'https://api.telegram.org/bot{token}/sendMessage'
    data = urllib.parse.urlencode({
        'chat_id': str(chat_id),
        'text': text,
        'parse_mode': 'MarkdownV2',
        'disable_web_page_preview': 'true',
    }).encode('utf-8')
    req = urllib.request.Request(url, data=data, method='POST')
    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            return json.loads(resp.read())
    except urllib.error.HTTPError as e:
        body = e.read().decode('utf-8', errors='replace')
        print(f'[ERROR] Telegram {e.code}: {body}')
        return {'ok': False, 'error_code': e.code, 'description': body}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--top', type=int, default=10, help='Top-N per market in TG message (default 10)')
    ap.add_argument('--dry-run', action='store_true', help='Print message, do not send')
    args = ap.parse_args()

    client = get_client()
    text = format_report(client, top_n=args.top)

    if args.dry_run:
        print(text)
        return 0

    token, chat_id = get_telegram_credentials()
    if not token or not chat_id:
        print(f'[ERROR] Missing TG credentials: token={bool(token)} chat={chat_id}')
        return 1

    res = send_telegram(token, chat_id, text)
    if res.get('ok'):
        print(f"[INFO] Telegram message sent (id={res['result']['message_id']})")
    else:
        print(f"[ERROR] Telegram failed: {res}")
        return 1


if __name__ == '__main__':
    sys.exit(main() or 0)
