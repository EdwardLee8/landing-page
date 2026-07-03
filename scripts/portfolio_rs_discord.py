#!/usr/bin/env python3
"""
Portfolio RS Rating Daily Discord Report
=========================================
1. Read Google Sheet portfolio (gviz/tq endpoint, no auth needed)
2. Parse transaction log → calculate current holdings (net position)
3. Query ClickHouse hk_rs_rating for today + yesterday
4. Format a nice Discord message with RS ratings and daily changes
5. Send to Discord webhook

Schedule: 17:25 HKT Mon-Fri (after HK RS Rating Update at 17:00)
"""

import os
import sys
import csv
import io
import json
import urllib.request
import urllib.parse
from datetime import date, timedelta
from collections import defaultdict

# ── Config ───────────────────────────────────────────────────────────────────

GOOGLE_SHEET_ID = "1S7KMB3Ke4X4lN3RN-0Z1TrpAGxSfraKKhM3W-68NApA"
GID = 1  # portfolio sheet

DISCORD_WEBHOOK = os.environ.get(
    "DISCORD_PORTFOLIO_WEBHOOK_URL",
    "https://discord.com/api/webhooks/1511780931302723628/GWs3dTmZz1fhvvzfMJ6Ha2tjzYugLgK4ZxG49lnkCYr58ZXLZmWJ1ZzXv9oQ3wmknB_Q",
)

# ClickHouse config from quant-db settings
sys.path.insert(0, "/mnt/p/Shared/code/quant-db")
os.environ.setdefault("CLICKHOUSE_PORT", "8123")

# ── 1. Read Google Sheet ─────────────────────────────────────────────────────

def fetch_sheet_csv(sheet_id: str, gid: int) -> str:
    """Fetch Google Sheet as CSV via gviz/tq endpoint (no auth needed)."""
    url = f"https://docs.google.com/spreadsheets/d/{sheet_id}/gviz/tq?tqx=out:csv&gid={gid}"
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
    with urllib.request.urlopen(req, timeout=30) as resp:
        return resp.read().decode("utf-8-sig")

def parse_holdings(csv_text: str) -> list[dict]:
    """
    Parse the transaction log to compute current holdings.
    Returns list of {code, name, net_qty} for stocks with positive net position.
    """
    reader = csv.reader(io.StringIO(csv_text))
    rows = list(reader)

    # Find transaction log header row: "股票code,公司名稱,買/賣"
    tx_start = None
    for i, row in enumerate(rows):
        if len(row) >= 3 and "股票code" in row[1]:
            tx_start = i + 1
            break

    if tx_start is None:
        print("[ERROR] Could not find transaction log header in sheet", file=sys.stderr)
        return []

    # Parse transactions
    # IMPORTANT: Sheet uses mixed code formats — "522" and "0522" are the same stock.
    # Normalize all codes to 4-digit zero-padded form before aggregating.
    positions = defaultdict(lambda: {"name": "", "buy_qty": 0, "sell_qty": 0})

    for row in rows[tx_start:]:
        if not row or not row[0].strip():
            continue
        # Col A: date, Col B: code, Col C: name, Col D: action, Col E: price, Col F: qty
        raw_code = row[1].strip() if len(row) > 1 else ""
        name = row[2].strip() if len(row) > 2 else ""
        action = row[3].strip() if len(row) > 3 else ""
        qty_str = row[5].strip().replace(",", "") if len(row) > 5 else ""

        if not raw_code or not raw_code.isdigit():
            continue

        # Normalize to 4-digit zero-padded code
        code = f"{int(raw_code):04d}"

        try:
            qty = int(qty_str) if qty_str else 0
        except ValueError:
            qty = 0

        if not name:
            continue

        if action == "買":
            positions[code]["name"] = name
            positions[code]["buy_qty"] += qty
        elif action == "賣":
            positions[code]["name"] = name
            positions[code]["sell_qty"] += qty
        # Skip "不中IPO", "未知IPO中幾多" etc.

    # Compute net positions
    holdings = []
    for code, info in positions.items():
        net = info["buy_qty"] - info["sell_qty"]
        if net > 0:
            symbol = f"{code}.HK"
            holdings.append({
                "code": code,
                "symbol": symbol,
                "name": info["name"],
                "net_qty": net,
            })

    return holdings

# ── 2. Query ClickHouse RS Ratings ────────────────────────────────────────────

def get_rs_ratings(symbols: list[str], target_date: date) -> dict:
    """Get RS ratings for given symbols on target_date from ClickHouse."""
    from db.clickhouse import get_client

    client = get_client()
    if not symbols:
        return {}

    symbols_str = ", ".join(f"'{s}'" for s in symbols)
    query = f"""
        SELECT symbol, rs_rating_composite, rs_rating_5d, rs_rating_20d,
               rs_rating_50d, rs_rating_100d, rs_rating_200d
        FROM quant.hk_rs_rating
        WHERE trade_date = '{target_date}' AND symbol IN ({symbols_str})
    """
    result = client.query(query)
    return {row[0]: {
        "composite": row[1],
        "rs_5d": row[2],
        "rs_20d": row[3],
        "rs_50d": row[4],
        "rs_100d": row[5],
        "rs_200d": row[6],
    } for row in result.result_rows}

def get_rs_with_names(symbols: list[str], target_date: date) -> list[dict]:
    """Get RS ratings joined with stock names from hk_rs_latest.json or ClickHouse."""
    from db.clickhouse import get_client

    client = get_client()
    if not symbols:
        return []

    symbols_str = ", ".join(f"'{s}'" for s in symbols)
    query = f"""
        SELECT symbol, rs_rating_composite, rs_rating_5d, rs_rating_10d,
               rs_rating_20d, rs_rating_30d, rs_rating_50d, rs_rating_100d,
               rs_rating_200d, rs_rating_365d,
               rs_ret_5d, rs_ret_20d, rs_ret_50d, rs_ret_100d
        FROM quant.hk_rs_rating
        WHERE trade_date = '{target_date}' AND symbol IN ({symbols_str})
        ORDER BY rs_rating_composite DESC
    """
    result = client.query(query)
    return [
        {
            "symbol": row[0],
            "composite": row[1],
            "rs_5d": row[2],
            "rs_10d": row[3],
            "rs_20d": row[4],
            "rs_30d": row[5],
            "rs_50d": row[6],
            "rs_100d": row[7],
            "rs_200d": row[8],
            "rs_365d": row[9],
            "ret_5d": row[10],
            "ret_20d": row[11],
            "ret_50d": row[12],
            "ret_100d": row[13],
        }
        for row in result.result_rows
    ]

# ── 3. Format Discord Message ─────────────────────────────────────────────────

def rating_emoji(rs: int) -> str:
    if rs >= 80: return "🟢"
    if rs >= 60: return "🟡"
    if rs >= 40: return "🟠"
    return "🔴"

def change_emoji(delta: int) -> str:
    if delta > 0: return "📈"
    if delta < 0: return "📉"
    return "➡️"

def format_discord_message(holdings: list[dict], today_rs: dict, yesterday_rs: dict, today: date) -> list[str]:
    """
    Format the portfolio RS rating report for Discord.
    Returns a list of message chunks (Discord 2000 char limit per message).
    Uses Discord embeds with code blocks for readability.
    """
    # Sort holdings by RS composite (highest first)
    holdings_with_rs = []
    for h in holdings:
        sym = h["symbol"]
        rs_today = today_rs.get(sym, {})
        rs_yesterday = yesterday_rs.get(sym, {})
        composite_today = rs_today.get("composite", 0)
        composite_yesterday = rs_yesterday.get("composite", 0)
        delta = composite_today - composite_yesterday
        holdings_with_rs.append({
            **h,
            "rs_today": rs_today,
            "rs_yesterday": rs_yesterday,
            "composite": composite_today,
            "delta": delta,
        })

    holdings_with_rs.sort(key=lambda x: x["composite"], reverse=True)

    # Split into RS tiers
    strong = [h for h in holdings_with_rs if h["composite"] >= 80]
    medium = [h for h in holdings_with_rs if 40 <= h["composite"] < 80]
    weak = [h for h in holdings_with_rs if h["composite"] < 40 and h["composite"] > 0]
    no_data = [h for h in holdings_with_rs if h["composite"] == 0]

    messages = []

    # ── Message 1: Summary ──
    total = len(holdings_with_rs)
    avg_rs = sum(h["composite"] for h in holdings_with_rs if h["composite"] > 0) / max(1, len([h for h in holdings_with_rs if h["composite"] > 0]))

    summary = f"📊 **模倉 RS Rating 日报** — {today.strftime('%Y-%m-%d (%a)')}\n"
    summary += f"持倉 {total} 隻 | 平均 RS {avg_rs:.0f}\n"
    summary += f"🟢 強勢(≥80): {len(strong)} 隻 | 🟡 中等(40-79): {len(medium)} 隻 | 🔴 弱勢(<40): {len(weak)} 隻"

    if not strong and not weak:
        summary += "\n\n⚠️ 今日 RS Rating 尚未更新"
        return [summary]

    messages.append(summary)

    # ── Helper: format one stock as a line ──
    def fmt_stock(h: dict) -> str:
        sym = h["symbol"]
        name = h["name"]
        comp = h["composite"]
        delta = h["delta"]
        rs = h["rs_today"]
        rs5 = rs.get("rs_5d", 0)
        rs20 = rs.get("rs_20d", 0)
        rs50 = rs.get("rs_50d", 0)
        rs100 = rs.get("rs_100d", 0)
        qty = h["net_qty"]

        emoji = rating_emoji(comp)
        if delta > 0:
            change_str = f"🔺{delta:+d}"
        elif delta < 0:
            change_str = f"🔻{delta:+d}"
        else:
            change_str = "➡️  0"

        # Short name (max 8 chars for alignment)
        short_name = name[:8]

        return f"{emoji}`RS{comp:3d}` {change_str:>5s} | `{sym}` {short_name:<8s} | 5d:{rs5:3d} 20d:{rs20:3d} 50d:{rs50:3d} 100d:{rs100:3d} | ×{qty:,}"

    # ── Message 2: 🟢 Strong stocks ──
    if strong:
        msg = "🟢 **強勢股 (RS ≥ 80)**\n"
        msg += "```\n"
        for h in strong:
            msg += fmt_stock(h) + "\n"
        msg += "```"
        messages.append(msg)

    # ── Message 3: 🟡 Medium stocks ──
    if medium:
        msg = "🟡 **中等股 (RS 40-79)**\n"
        msg += "```\n"
        for h in medium:
            msg += fmt_stock(h) + "\n"
        msg += "```"
        messages.append(msg)

    # ── Message 4: 🔴 Weak stocks ──
    if weak:
        msg = "🔴 **弱勢股 (RS < 40)**\n"
        msg += "```\n"
        for h in weak:
            msg += fmt_stock(h) + "\n"
        msg += "```"
        messages.append(msg)

    # ── No RS data (ETFs etc) ──
    if no_data:
        msg = "⚪ **無 RS 數據**\n"
        for h in no_data:
            msg += f"• `{h['symbol']}` {h['name']} ×{h['net_qty']:,}\n"
        messages.append(msg)

    return messages

# ── 4. Send to Discord ───────────────────────────────────────────────────────

def send_discord_message(content: str):
    """Send a single message to Discord webhook."""
    payload = json.dumps({"content": content}).encode("utf-8")
    req = urllib.request.Request(
        DISCORD_WEBHOOK,
        data=payload,
        headers={"Content-Type": "application/json", "User-Agent": "Mozilla/5.0"},
    )
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            if resp.status not in (200, 204):
                print(f"[WARN] Discord response {resp.status}", file=sys.stderr)
    except Exception as e:
        print(f"[ERROR] Discord send failed: {e}", file=sys.stderr)
        raise

def send_discord(messages: list[str]):
    """Send multiple messages to Discord, respecting rate limits."""
    import time
    for i, msg in enumerate(messages):
        if not msg:
            continue
        # Discord 2000 char limit — split if needed
        if len(msg) > 2000:
            # Split at line boundaries
            chunks = []
            current = ""
            for line in msg.split("\n"):
                if len(current) + len(line) + 1 > 1900 and current:
                    chunks.append(current)
                    current = line
                else:
                    current += "\n" + line if current else line
            if current:
                chunks.append(current)
            for chunk in chunks:
                send_discord_message(chunk)
                if i < len(messages) - 1:
                    time.sleep(0.5)
        else:
            send_discord_message(msg)
            if i < len(messages) - 1:
                time.sleep(0.5)

# ── Main ─────────────────────────────────────────────────────────────────────

def main():
    today = date.today()
    yesterday = today - timedelta(days=1)

    # Handle weekends — skip on Sat/Sun
    if today.weekday() >= 5:
        print(f"[SKIP] Weekend ({today})")
        return

    print(f"[INFO] Portfolio RS Report for {today}")

    # 1. Fetch Google Sheet
    print("[1/4] Fetching Google Sheet...")
    csv_text = fetch_sheet_csv(GOOGLE_SHEET_ID, GID)
    print(f"  Sheet CSV: {len(csv_text)} bytes")

    # 2. Parse holdings
    print("[2/4] Parsing holdings...")
    holdings = parse_holdings(csv_text)
    print(f"  Holdings: {len(holdings)} stocks")
    for h in holdings:
        print(f"    {h['symbol']} {h['name']} qty={h['net_qty']}")

    if not holdings:
        print("[ERROR] No holdings found", file=sys.stderr)
        return

    # 3. Query RS ratings
    print("[3/4] Querying ClickHouse RS ratings...")
    symbols = [h["symbol"] for h in holdings]

    today_rs_list = get_rs_with_names(symbols, today)
    today_rs = {item["symbol"]: item for item in today_rs_list}

    # Try yesterday, then go back up to 5 days for non-trading days
    yesterday_rs_list = []
    for days_back in range(1, 8):
        check_date = today - timedelta(days=days_back)
        yesterday_rs_list = get_rs_with_names(symbols, check_date)
        if yesterday_rs_list:
            print(f"  Found previous RS data from {check_date} ({days_back}d ago)")
            break
    yesterday_rs = {item["symbol"]: item for item in yesterday_rs_list}

    # Check if we have today's data
    found_today = len([s for s in symbols if s in today_rs])
    print(f"  Today RS: {found_today}/{len(symbols)} found")
    print(f"  Previous RS: {len(yesterday_rs)}/{len(symbols)} found")

    if found_today == 0:
        print("[ERROR] No RS data found for today. HK RS Rating may not have updated yet.", file=sys.stderr)
        # Still send a notification
        send_discord([f"⚠️ **模倉 RS Rating 日报 — {today}**\n\nHK RS Rating 尚未更新，无法生成报告。请检查 cron job `79a51d616bec` (Daily HK RS Rating Update)。"])
        return

    # 4. Format and send
    print("[4/4] Formatting and sending to Discord...")
    messages = format_discord_message(holdings, today_rs, yesterday_rs, today)
    print(f"  Messages: {len(messages)} chunks")

    send_discord(messages)
    print("[DONE] Discord messages sent successfully!")

    # Also print to stdout (for cron log)
    print("\n" + "=" * 60)
    for msg in messages:
        print(msg)
        print("-" * 40)
    print("=" * 60)

if __name__ == "__main__":
    main()