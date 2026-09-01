#!/usr/bin/env python3.12
"""
Long-term walk-forward RS Rating weight backtest.

Goal
----
Find the best fixed weights for combining 9 timeframe RS ratings into a
composite score, validated out-of-sample across many years.

Design
------
- Universe : PIT top-1000 by 60-day turnover (monthly rebalance) — survivorship-aware
- Timeframes (9): 5/10/15/20/30/50/100/200/365d RS ratings (vs SPY)
- Forward horizons evaluated: 5/20/60/120/250d
- Validation: walk-forward 3y train + 1y OOS, rolling 1 year forward
- Optimizer: SLSQP with sum=1 + non-negative constraints, 5 random starts
- Primary objective: maximise spread Sharpe (top-50 minus bottom-50, train period)
- OOS report: spread Sharpe / long-only avg / IR per horizon, per fold + aggregate

Outputs
-------
backtest_walkforward/
  metadata.json     run params + data range
  folds.csv         per-fold weights + train/OOS metrics for all 5 horizons
  final_weights.csv aggregated weight (avg/median/std) across folds
  per_horizon.csv   best fixed weights when optimising for each horizon separately

Run
---
  # First run: build panel (~1-2 min ClickHouse) then walk-forward (~5-10 min)
  python backtest_walkforward.py
  # Force rebuild panel
  python backtest_walkforward.py --rebuild
  # Optimise on a different primary horizon
  python backtest_walkforward.py --horizon fwd_20d
"""
import sys, os, json, time, argparse, warnings
warnings.filterwarnings('ignore')

# Line-buffered stdout so background runs show progress in real time.
try: sys.stdout.reconfigure(line_buffering=True)
except Exception: pass

import numpy as np
import pandas as pd
from scipy.optimize import minimize

QUANT_DB = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', 'quant-db'))
sys.path.insert(0, QUANT_DB)
from config.settings import CLICKHOUSE_HOST, CLICKHOUSE_PORT, CLICKHOUSE_DB, CLICKHOUSE_USER, CLICKHOUSE_PASSWORD
import clickhouse_connect


TIMEFRAMES = [
    ('5d',   4),  ('10d',  9),  ('15d',  14),
    ('20d',  19), ('30d',  29), ('50d',  49),
    ('100d', 99), ('200d', 199),('365d', 364),
]
FWD_HORIZONS    = [5, 20, 60, 120, 250]
TURNOVER_LOOKBACK = 60
UNIVERSE_TOP_N    = 1000
SELECT_TOP_N      = 50
SELECT_BOT_N      = 50
N_RANDOM_STARTS   = 5

OUT_DIR     = os.path.dirname(os.path.abspath(__file__))
PANEL_FILE  = os.path.join(OUT_DIR, 'rs_panel.parquet')        # default US
RESULTS_DIR = os.path.join(OUT_DIR, 'backtest_walkforward')    # default US

# --- Per-market config ---
MARKETS = {
    'US': dict(market='US', benchmark='SPY',      start='2007-01-01',
               panel_file='rs_panel_us.parquet',
               results_dir='backtest_walkforward_us'),
    'HK': dict(market='HK', benchmark='2800.HK',  start='2011-01-01',
               panel_file='rs_panel_hk.parquet',
               results_dir='backtest_walkforward_hk'),
    'CN': dict(market='CN', benchmark='000985.SZ', start='2007-01-01',
               panel_file='rs_panel_cn.parquet',
               results_dir='backtest_walkforward_cn'),
}


def get_client():
    return clickhouse_connect.get_client(
        host=CLICKHOUSE_HOST or 'localhost',
        port=int(CLICKHOUSE_PORT or 18123),
        database=CLICKHOUSE_DB or 'quant',
        username=CLICKHOUSE_USER or 'quant',
        password=CLICKHOUSE_PASSWORD or 'quant123',
        send_receive_timeout=1800,
    )


# ============================================================
# STAGE 1: Build RS panel (full universe, full history)
# ============================================================

def build_panel(start_date=None, end_date=None,
                market='US', benchmark='SPY',
                panel_file=None) -> pd.DataFrame:
    """Compute 9-timeframe RS ratings + 5 forward returns + 60d turnover, cache parquet.

    Per-market params are pulled from MARKETS dict if not overridden.
    """
    if panel_file is None:
        panel_file = PANEL_FILE
    if os.path.exists(panel_file):
        print(f'Panel cache exists: {panel_file}')
        return pd.read_parquet(panel_file)

    if start_date is None:
        start_date = MARKETS.get(market, {}).get('start', '2007-01-01')

    client = get_client()
    if not end_date:
        end_date = client.query(
            f"SELECT MAX(trade_date) FROM quant.daily_ohlcv WHERE market='{market}'"
        ).result_rows[0][0].isoformat()

    print(f'Building RS panel for {market} (benchmark={benchmark}): {start_date} -> {end_date}')

    spy_lag_sql = ',\n              '.join(
        [f'lag(close, {lag}) OVER (ORDER BY trade_date) AS sc_{name}' for name, lag in TIMEFRAMES])
    stk_lag_sql = ',\n              '.join(
        [f'lag(close, {lag}) OVER (PARTITION BY symbol ORDER BY trade_date) AS sc_{name}' for name, lag in TIMEFRAMES])
    spy_ret_sql = ',\n              '.join(
        [f'(close - sc_{name})/sc_{name} AS sr_{name}' for name, _ in TIMEFRAMES])
    stk_ret_sql = ',\n              '.join(
        [f'(close - sc_{name})/sc_{name} AS sr_{name}' for name, _ in TIMEFRAMES])
    rs_sql = ',\n              '.join(
        [f's.sr_{name} - b.sr_{name} AS rs_{name}' for name, _ in TIMEFRAMES])
    rate_sql = ',\n            '.join(
        [(f"cast(round(percentRank(rs_{name}) OVER (PARTITION BY trade_date ORDER BY rs_{name} ASC) * 98 + 1), 'UInt8') "
          f"AS rating_{name}") for name, _ in TIMEFRAMES])
    fwd_sql = ',\n            '.join(
        [(f'(lead(close, {h}) OVER (PARTITION BY symbol ORDER BY trade_date) - close)/close '
          f'AS fwd_{h}d') for h in FWD_HORIZONS])
    pos_sql = ' AND '.join([f'sc_{name} > 0' for name, _ in TIMEFRAMES])

    q = f"""
    WITH
      spy_raw AS (
          SELECT trade_date, close FROM quant.daily_ohlcv
          WHERE market='{market}' AND symbol='{benchmark}' AND trade_date <= '{end_date}'
      ),
      spy_lag AS (
          SELECT trade_date, close, {spy_lag_sql} FROM spy_raw
      ),
      spy_ret AS (
          SELECT trade_date, {spy_ret_sql} FROM spy_lag WHERE {pos_sql}
      ),
      stk_raw AS (
          SELECT symbol, trade_date, close, volume * close AS turnover
          FROM quant.daily_ohlcv
          WHERE market='{market}' AND symbol NOT IN ('{benchmark}','') AND close > 0
            AND trade_date <= '{end_date}'
      ),
      stk_lag AS (
          SELECT symbol, trade_date, close, turnover, {stk_lag_sql} FROM stk_raw
      ),
      stk_ret AS (
          SELECT symbol, trade_date, close, turnover, {stk_ret_sql}
          FROM stk_lag
          WHERE {pos_sql} AND trade_date BETWEEN '{start_date}' AND '{end_date}'
      ),
      rs AS (
          SELECT s.symbol, s.trade_date, s.close, s.turnover, {rs_sql}
          FROM stk_ret s JOIN spy_ret b ON b.trade_date = s.trade_date
      ),
      rated AS (
          SELECT *, {rate_sql} FROM rs
      ),
      fwd AS (
          SELECT symbol, trade_date, {fwd_sql} FROM stk_raw
      ),
      turn AS (
          SELECT symbol, trade_date,
              avg(turnover) OVER (
                  PARTITION BY symbol ORDER BY trade_date
                  ROWS BETWEEN {TURNOVER_LOOKBACK - 1} PRECEDING AND CURRENT ROW
              ) AS turnover_60d
          FROM stk_raw
      )
    SELECT
        r.symbol, r.trade_date,
        {','.join([f'r.rating_{n}' for n,_ in TIMEFRAMES])},
        {','.join([f'f.fwd_{h}d'   for h   in FWD_HORIZONS])},
        t.turnover_60d
    FROM rated r
    JOIN fwd  f USING (symbol, trade_date)
    JOIN turn t USING (symbol, trade_date)
    """

    print('  Running ClickHouse query (heavy — 1-3 min expected)...')
    t0 = time.time()
    res = client.query(q)
    cols = (['symbol', 'trade_date']
            + [f'rating_{n}' for n,_ in TIMEFRAMES]
            + [f'fwd_{h}d'   for h in FWD_HORIZONS]
            + ['turnover_60d'])
    df = pd.DataFrame(res.result_rows, columns=cols)
    print(f'  {len(df):,} rows, {df["symbol"].nunique()} symbols, '
          f'{df["trade_date"].nunique()} dates ({time.time()-t0:.1f}s)')

    df['trade_date'] = pd.to_datetime(df['trade_date'])
    for c in [f'rating_{n}' for n,_ in TIMEFRAMES]:
        df[c] = df[c].astype(np.float32)
    for c in [f'fwd_{h}d' for h in FWD_HORIZONS] + ['turnover_60d']:
        df[c] = df[c].astype(np.float32)

    # PIT universe: top-1000 by 60d turnover at first trading day of each month
    print('  Building PIT universe (top-1000 by 60d turnover, monthly rebalance)...')
    df['ym'] = df['trade_date'].dt.to_period('M')
    monthly_first = (df.sort_values('trade_date')
                       .groupby(['symbol', 'ym'], as_index=False)
                       .agg(first_turnover=('turnover_60d', 'first')))
    monthly_first['rank'] = monthly_first.groupby('ym')['first_turnover'].rank(method='first', ascending=False)
    in_uni = monthly_first.loc[monthly_first['rank'] <= UNIVERSE_TOP_N, ['symbol', 'ym']].copy()
    in_uni['in_universe'] = True
    df = df.merge(in_uni, on=['symbol', 'ym'], how='left')
    df['in_universe'] = df['in_universe'].fillna(False)
    df = df.drop(columns=['ym'])

    df.to_parquet(panel_file, index=False)
    print(f'  Cached panel: {panel_file}')
    print(f'  in_universe rows: {df["in_universe"].sum():,} / {len(df):,}')
    return df


# ============================================================
# STAGE 2: Evaluate weights on a slice
# ============================================================

RATING_COLS = [f'rating_{n}' for n,_ in TIMEFRAMES]


def precompute_groups(df_period: pd.DataFrame, fwd_col: str = 'fwd_5d',
                      top_n: int = SELECT_TOP_N, bot_n: int = SELECT_BOT_N):
    """Pre-compute per-date numpy arrays so each weight eval is pure numpy.

    Returns list of (R_d (n,9), fwd_d (n,)) for each date with enough rows.
    """
    if len(df_period) == 0:
        return []
    rating = df_period[RATING_COLS].values.astype(np.float32)
    fwd    = df_period[fwd_col].values.astype(np.float32)
    dates  = df_period['trade_date'].values

    # Sort by date for contiguous groups; then split at boundaries.
    order  = np.argsort(dates, kind='stable')
    rating, fwd, dates = rating[order], fwd[order], dates[order]
    _, first_idx = np.unique(dates, return_index=True)
    bounds = np.concatenate([first_idx, [len(dates)]])

    groups = []
    need   = top_n + bot_n
    for i in range(len(bounds) - 1):
        s, e = bounds[i], bounds[i + 1]
        f = fwd[s:e]
        mask = ~np.isnan(f)
        if int(mask.sum()) < need:
            continue
        groups.append((rating[s:e][mask], f[mask]))
    return groups


def eval_groups(groups, weights: np.ndarray,
                top_n: int = SELECT_TOP_N, bot_n: int = SELECT_BOT_N):
    """Evaluate pre-computed groups. ~50us per date — fast inside the optimiser."""
    if not groups:
        return None
    w  = np.asarray(weights, dtype=np.float32)
    L  = np.empty(len(groups), dtype=np.float32)
    S  = np.empty(len(groups), dtype=np.float32)
    SH = np.empty(len(groups), dtype=np.float32)
    n  = 0
    for R, f in groups:
        c = R @ w
        # Partial sorts (cheaper than full sort)
        top_idx = np.argpartition(c, -top_n)[-top_n:]
        bot_idx = np.argpartition(c,  bot_n)[: bot_n]
        t = float(f[top_idx].mean())
        b = float(f[bot_idx].mean())
        L[n], S[n], SH[n] = t, b, t - b
        n += 1
    if n == 0:
        return None
    L, S, SH = L[:n], S[:n], SH[:n]
    eps = 1e-9
    return dict(
        long_avg      = float(L.mean()),
        long_std      = float(L.std() + eps),
        long_sharpe   = float(L.mean() / (L.std() + eps)),
        spread_avg    = float(SH.mean()),
        spread_std    = float(SH.std() + eps),
        spread_sharpe = float(SH.mean() / (SH.std() + eps)),
        short_avg     = float(S.mean()),
        win_rate      = float((L > 0).mean()),
        n_dates       = int(n),
    )


def evaluate_weights(df_period: pd.DataFrame, weights: np.ndarray,
                     fwd_col: str = 'fwd_5d',
                     top_n: int = SELECT_TOP_N, bot_n: int = SELECT_BOT_N):
    """Convenience wrapper: precompute + eval. Slow path; use precompute_groups
    + eval_groups inside the optimiser to amortise the precompute cost."""
    return eval_groups(precompute_groups(df_period, fwd_col, top_n, bot_n),
                       weights, top_n, bot_n)


# ============================================================
# STAGE 3: Optimise weights via SLSQP
# ============================================================

def _normalise(w):
    w = np.maximum(w, 0)
    s = w.sum()
    return w / s if s > 0 else np.ones_like(w) / len(w)


def _neg_obj_groups(w, groups):
    res = eval_groups(groups, _normalise(w))
    if not res:
        return 1e6
    return -res['spread_sharpe']


def optimise_weights(df_train: pd.DataFrame, fwd_col: str = 'fwd_60d',
                     n_starts: int = N_RANDOM_STARTS, seed: int = 42):
    """SLSQP w/ sum=1 + non-neg, multiple random starts. Pre-computes groups once."""
    groups = precompute_groups(df_train, fwd_col)
    if not groups:
        return np.ones(len(TIMEFRAMES)) / len(TIMEFRAMES), 0.0

    rng    = np.random.default_rng(seed)
    n      = len(TIMEFRAMES)
    bounds = [(0.0, 1.0)] * n
    constr = [{'type': 'eq', 'fun': lambda w: w.sum() - 1}]
    best_w, best_score = None, np.inf

    for i in range(n_starts):
        x0 = np.ones(n) / n if i == 0 else rng.dirichlet(np.ones(n))
        try:
            r = minimize(_neg_obj_groups, x0, args=(groups,),
                         method='SLSQP', bounds=bounds, constraints=constr,
                         options=dict(maxiter=60, ftol=1e-4))
            if r.fun < best_score:
                best_score, best_w = r.fun, _normalise(r.x)
        except Exception:
            continue

    if best_w is None:
        return np.ones(n) / n, 0.0
    return best_w, -best_score


# Pre-defined "comparison" weights — for live-formula-vs-optimal benchmarking.
LIVE_FORMULA_4TF = {  # current production: 5d=35, 10d=30, 20d=20, 50d=15
    '5d': 0.35, '10d': 0.30, '15d': 0.00, '20d': 0.20, '30d': 0.00,
    '50d': 0.15, '100d': 0.00, '200d': 0.00, '365d': 0.00,
}
EQUAL_9TF       = {n: 1/9 for n,_ in TIMEFRAMES}
EQUAL_4TF_SHORT = {  # equal weight on the 4 timeframes the live formula uses
    '5d': 0.25, '10d': 0.25, '15d': 0.00, '20d': 0.25, '30d': 0.00,
    '50d': 0.25, '100d': 0.00, '200d': 0.00, '365d': 0.00,
}
LONG_BIASED     = {  # heavy on long horizons where signal is clear (manual ref)
    '5d': 0.00, '10d': 0.00, '15d': 0.00, '20d': 0.00, '30d': 0.20,
    '50d': 0.20, '100d': 0.10, '200d': 0.20, '365d': 0.30,
}

def _w_dict_to_arr(d):
    return np.array([d.get(n, 0.0) for n,_ in TIMEFRAMES], dtype=np.float64)


# ============================================================
# STAGE 4: Walk-forward
# ============================================================

def walkforward(df: pd.DataFrame, train_years: int, oos_years: int,
                primary_horizon: str = 'fwd_60d',
                n_starts: int = N_RANDOM_STARTS):
    df_uni = df[df['in_universe']].copy()
    if df_uni.empty:
        return []
    dates = sorted(df_uni['trade_date'].unique())
    first, last = pd.Timestamp(dates[0]), pd.Timestamp(dates[-1])

    # Pre-build comparison weight arrays (used per-fold for benchmarking).
    cmp_weights = {
        'opt':            None,  # filled per-fold
        'live_4tf':       _w_dict_to_arr(LIVE_FORMULA_4TF),
        'equal_9tf':      _w_dict_to_arr(EQUAL_9TF),
        'equal_4tf_short':_w_dict_to_arr(EQUAL_4TF_SHORT),
        'long_biased':    _w_dict_to_arr(LONG_BIASED),
    }

    folds = []
    cur = first + pd.DateOffset(years=train_years)
    while cur + pd.DateOffset(years=oos_years) <= last:
        train_start = cur - pd.DateOffset(years=train_years)
        train_end   = cur - pd.Timedelta(days=1)
        oos_start   = cur
        oos_end     = cur + pd.DateOffset(years=oos_years) - pd.Timedelta(days=1)

        df_train = df_uni[(df_uni['trade_date'] >= train_start) & (df_uni['trade_date'] <= train_end)]
        df_oos   = df_uni[(df_uni['trade_date'] >= oos_start)   & (df_uni['trade_date'] <= oos_end)]
        if df_train.empty or df_oos.empty:
            cur += pd.DateOffset(years=oos_years); continue

        fold_idx = len(folds) + 1
        print(f'\nFold {fold_idx}: '
              f'train {train_start.date()}->{train_end.date()} ({len(df_train):,} rows) | '
              f'OOS {oos_start.date()}->{oos_end.date()} ({len(df_oos):,} rows)')

        # Per-fold seed → genuinely different random starts each fold,
        # so apparent "stability" reflects data-driven convergence not seed lock.
        w_opt, train_score = optimise_weights(df_train, fwd_col=primary_horizon,
                                              n_starts=n_starts, seed=fold_idx * 7919 + 17)
        cmp_weights['opt'] = w_opt
        print('  opt weights: ' + ' '.join(f'{n}={w_opt[i]:.0%}' for i,(n,_) in enumerate(TIMEFRAMES)))
        print(f'  train spread Sharpe ({primary_horizon}): {train_score:.3f}')

        # OOS: evaluate opt weights + every comparison fixed-weight, all 5 horizons.
        oos_groups_per_h = {h: precompute_groups(df_oos, f'fwd_{h}d') for h in FWD_HORIZONS}
        oos_by_w = {}
        for label, w in cmp_weights.items():
            oos_by_w[label] = {}
            for h in FWD_HORIZONS:
                res = eval_groups(oos_groups_per_h[h], w)
                if res:
                    oos_by_w[label][h] = res

        # Print just the opt weights (full comparison goes to CSV).
        for h in FWD_HORIZONS:
            r = oos_by_w['opt'].get(h)
            if r:
                print(f'  OOS fwd_{h:>3d}d (opt): spread_Sharpe={r["spread_sharpe"]:+.3f}  '
                      f'long_avg={r["long_avg"]*100:+.2f}%  spread_avg={r["spread_avg"]*100:+.2f}%')

        folds.append(dict(
            fold=fold_idx,
            train_start=train_start.date().isoformat(),
            train_end=train_end.date().isoformat(),
            oos_start=oos_start.date().isoformat(),
            oos_end=oos_end.date().isoformat(),
            weights=w_opt.tolist(),
            train_spread_sharpe=train_score,
            oos=oos_by_w['opt'],
            oos_compare=oos_by_w,  # all 4 comparison weights + opt
        ))
        cur += pd.DateOffset(years=oos_years)
    return folds


def per_horizon_best(df: pd.DataFrame):
    """For each forward horizon, optimise on full in-universe sample (in-sample reference)."""
    df_uni = df[df['in_universe']].copy()
    out = []
    for h in FWD_HORIZONS:
        print(f'\n  Optimising fixed weights for fwd_{h}d (full sample, reference only)...')
        w, score = optimise_weights(df_uni, fwd_col=f'fwd_{h}d')
        res = evaluate_weights(df_uni, w, fwd_col=f'fwd_{h}d')
        row = dict(
            fwd_horizon=f'fwd_{h}d',
            train_spread_sharpe=score,
            sample_long_avg=res['long_avg']    if res else None,
            sample_spread_avg=res['spread_avg'] if res else None,
            n_dates=res['n_dates']             if res else 0,
        )
        for i,(n,_) in enumerate(TIMEFRAMES):
            row[f'w_{n}'] = w[i]
        print('    ' + ' '.join(f'{n}={w[i]:.0%}' for i,(n,_) in enumerate(TIMEFRAMES))
              + f'  Sharpe={score:.3f}')
        out.append(row)
    return pd.DataFrame(out)


# ============================================================
# Reports
# ============================================================

def write_compare_report(folds, primary_horizon):
    """Compare opt vs live_4tf vs equal_9tf vs equal_4tf_short vs long_biased."""
    rows = []
    labels = ['opt', 'live_4tf', 'equal_9tf', 'equal_4tf_short', 'long_biased']
    for f in folds:
        for label in labels:
            for h in FWD_HORIZONS:
                r = f['oos_compare'].get(label, {}).get(h)
                if not r:
                    continue
                rows.append(dict(
                    fold=f['fold'], oos=f"{f['oos_start']}/{f['oos_end']}",
                    weights_label=label, fwd=f'fwd_{h}d',
                    spread_sharpe=r['spread_sharpe'],
                    long_avg=r['long_avg'],
                    spread_avg=r['spread_avg'],
                    long_sharpe=r['long_sharpe'],
                    win_rate=r['win_rate'],
                ))
    cmp_df = pd.DataFrame(rows)
    cmp_df.to_csv(os.path.join(RESULTS_DIR, 'compare_weights.csv'), index=False)

    # Aggregate summary table
    print('\n' + '='*90)
    print('FIXED-WEIGHT COMPARISON  (avg OOS metrics across folds)')
    print('='*90)
    print(f'  {"weights":<18}  {"horizon":<10}  {"avg_Sharpe":>11}  {"worst":>7}  {"%pos":>5}  '
          f'{"long_avg":>9}  {"spread_avg":>11}')
    for label in labels:
        for h in FWD_HORIZONS:
            sub = cmp_df[(cmp_df.weights_label == label) & (cmp_df.fwd == f'fwd_{h}d')]
            if sub.empty:
                continue
            print(f'  {label:<18}  fwd_{h:>3d}d   '
                  f'{sub.spread_sharpe.mean():>+11.3f}  '
                  f'{sub.spread_sharpe.min():>+7.2f}  '
                  f'{100*(sub.spread_sharpe>0).mean():>4.0f}%  '
                  f'{sub.long_avg.mean()*100:>+8.2f}%  '
                  f'{sub.spread_avg.mean()*100:>+10.2f}%')


def write_reports(folds, primary_horizon, df_panel):
    os.makedirs(RESULTS_DIR, exist_ok=True)

    # folds.csv
    rows = []
    for f in folds:
        row = dict(
            fold=f['fold'],
            train=f"{f['train_start']}/{f['train_end']}",
            oos=f"{f['oos_start']}/{f['oos_end']}",
            train_spread_sharpe=f['train_spread_sharpe'],
        )
        for i,(n,_) in enumerate(TIMEFRAMES):
            row[f'w_{n}'] = f['weights'][i]
        for h in FWD_HORIZONS:
            if h in f['oos']:
                row[f'oos_{h}d_spread_sharpe'] = f['oos'][h]['spread_sharpe']
                row[f'oos_{h}d_long_avg']      = f['oos'][h]['long_avg']
                row[f'oos_{h}d_spread_avg']    = f['oos'][h]['spread_avg']
        rows.append(row)
    folds_df = pd.DataFrame(rows)
    folds_df.to_csv(os.path.join(RESULTS_DIR, 'folds.csv'), index=False)

    # final_weights.csv
    W = np.array([f['weights'] for f in folds])
    final = pd.DataFrame({
        'timeframe':     [n for n,_ in TIMEFRAMES],
        'weight_avg':    W.mean(axis=0),
        'weight_median': np.median(W, axis=0),
        'weight_std':    W.std(axis=0),
    })
    final.to_csv(os.path.join(RESULTS_DIR, 'final_weights.csv'), index=False)

    # metadata.json
    meta = dict(
        primary_horizon=primary_horizon,
        train_years=int((pd.Timestamp(folds[0]['train_end'])
                         - pd.Timestamp(folds[0]['train_start'])).days / 365),
        oos_years=int((pd.Timestamp(folds[0]['oos_end'])
                       - pd.Timestamp(folds[0]['oos_start'])).days / 365),
        n_folds=len(folds),
        timeframes=[n for n,_ in TIMEFRAMES],
        fwd_horizons=FWD_HORIZONS,
        select_top_n=SELECT_TOP_N,
        select_bot_n=SELECT_BOT_N,
        universe_top_n=UNIVERSE_TOP_N,
        panel_first_date=str(df_panel['trade_date'].min().date()),
        panel_last_date=str(df_panel['trade_date'].max().date()),
        panel_rows=int(len(df_panel)),
        run_at=time.strftime('%Y-%m-%d %H:%M:%S'),
    )
    with open(os.path.join(RESULTS_DIR, 'metadata.json'), 'w') as f:
        json.dump(meta, f, indent=2)

    # Console summary
    print('\n' + '='*78)
    print('AGGREGATE WEIGHTS ACROSS FOLDS  (primary horizon: ' + primary_horizon + ')')
    print('='*78)
    print(f'  {"timeframe":>10s}  {"avg":>6s}  {"median":>7s}  {"std":>6s}  stable?')
    for n, wa, wm, ws in zip([t[0] for t in TIMEFRAMES], final['weight_avg'],
                             final['weight_median'], final['weight_std']):
        flag = 'yes' if ws < 0.10 else ('mid' if ws < 0.20 else 'NO')
        print(f'  {n:>10s}  {wa:>5.1%}  {wm:>6.1%}  {ws:>5.1%}   {flag}')

    print('\n' + '='*78)
    print('OOS METRICS BY HORIZON  (avg / worst-fold / %-positive folds)')
    print('='*78)
    for h in FWD_HORIZONS:
        sh = [f['oos'][h]['spread_sharpe'] for f in folds if h in f['oos']]
        la = [f['oos'][h]['long_avg']      for f in folds if h in f['oos']]
        sa = [f['oos'][h]['spread_avg']    for f in folds if h in f['oos']]
        if not sh: continue
        sh = np.array(sh); la = np.array(la); sa = np.array(sa)
        print(f'  fwd_{h:>3d}d:  spread_Sharpe avg={sh.mean():+.3f}  worst={sh.min():+.3f}  '
              f'%pos_folds={100*(sh>0).mean():>4.0f}%')
        print(f'           long_avg     avg={la.mean()*100:+.2f}%  worst={la.min()*100:+.2f}%')
        print(f'           spread_avg   avg={sa.mean()*100:+.2f}%  worst={sa.min()*100:+.2f}%')

    print(f'\nResults written to: {RESULTS_DIR}/')
    print('  - folds.csv          (per-fold weights & OOS metrics)')
    print('  - final_weights.csv  (avg/median/std weights across folds)')
    print('  - per_horizon.csv    (in-sample best weights per fwd horizon, reference only)')
    print('  - compare_weights.csv (opt vs live_4tf vs equal vs long_biased — all folds & horizons)')
    print('  - metadata.json      (run params + data range)')


# ============================================================

def main():
    global RESULTS_DIR
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument('--market', default='US', choices=list(MARKETS.keys()),
                    help='Which market to backtest (US/HK/CN). Default US')
    ap.add_argument('--benchmark', default=None,
                    help='Override default benchmark (e.g. ^HSI for HK).')
    ap.add_argument('--rebuild', action='store_true', help='Force rebuild RS panel from ClickHouse')
    ap.add_argument('--horizon', default='fwd_60d',
                    choices=[f'fwd_{h}d' for h in FWD_HORIZONS],
                    help='Primary forward horizon to optimise on (default fwd_60d)')
    ap.add_argument('--train-years', type=int, default=3)
    ap.add_argument('--oos-years',   type=int, default=1)
    ap.add_argument('--n-starts',    type=int, default=10,
                    help='Random starts per fold for SLSQP (default 10)')
    ap.add_argument('--skip-per-horizon', action='store_true',
                    help='Skip per-horizon in-sample reference (saves a few minutes)')
    args = ap.parse_args()

    cfg = MARKETS[args.market]
    benchmark = args.benchmark or cfg['benchmark']
    panel_file  = os.path.join(OUT_DIR, cfg['panel_file'])
    RESULTS_DIR = os.path.join(OUT_DIR, cfg['results_dir'])

    if args.rebuild and os.path.exists(panel_file):
        os.remove(panel_file)

    df = build_panel(market=args.market, benchmark=benchmark,
                     panel_file=panel_file)

    print(f'\nWalk-forward (primary horizon = {args.horizon}, '
          f'train={args.train_years}y, OOS={args.oos_years}y, n_starts={args.n_starts})...')
    folds = walkforward(df, train_years=args.train_years, oos_years=args.oos_years,
                        primary_horizon=args.horizon, n_starts=args.n_starts)
    if not folds:
        print('No folds — check data range vs train/oos years.')
        return

    os.makedirs(RESULTS_DIR, exist_ok=True)
    write_compare_report(folds, args.horizon)

    if not args.skip_per_horizon:
        print('\n' + '='*78)
        print('PER-HORIZON IN-SAMPLE REFERENCE (full panel; no walk-forward)')
        print('='*78)
        ph = per_horizon_best(df)
        ph.to_csv(os.path.join(RESULTS_DIR, 'per_horizon.csv'), index=False)

    write_reports(folds, args.horizon, df)


if __name__ == '__main__':
    main()
