#!/usr/bin/env python3.12
"""
Fine-tune long-biased RS Rating weights.

Why
---
walkforward.py shows that 35/30/20/15 (live) is dominated by long-biased
fixed weights AND by equal_9tf. This script searches the long-biased space
to find a robust, production-ready weight vector.

Pipeline
--------
Stage 1 — Coarse grid over 6 timeframes (20d/30d/50d/100d/200d/365d) at
          10% step, full sample, score = long-only Sharpe at the chosen
          primary horizon (default fwd_60d). 3003 combos.
Stage 2 — Take top-K candidates from stage 1, evaluate full-sample on ALL
          5 horizons (no look-ahead concern: this is just ranking).
Stage 3 — Walk-forward (3y train / 1y OOS) the top-K candidates AS FIXED
          weights (no per-fold optimisation), plus baselines (live_4tf,
          equal_9tf, long_biased manual). Pick the weight whose OOS metrics
          are best AND most stable (worst-fold matters).

Outputs
-------
backtest_finetune/
  stage1_grid.csv          (full grid result)
  stage2_top_k_horizons.csv
  stage3_walkforward.csv   (top-K + baselines × 14 folds × 5 horizons)
  recommendation.json      (final pick + reasoning)

Run
---
  python backtest_finetune.py                  # default: primary fwd_60d, top-10 candidates
  python backtest_finetune.py --primary fwd_120d --top-k 5 --step 5
"""
import sys, os, json, time, argparse, warnings
warnings.filterwarnings('ignore')

try: sys.stdout.reconfigure(line_buffering=True)
except Exception: pass

import numpy as np
import pandas as pd

# Reuse panel + helpers from walkforward script
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from backtest_walkforward import (
    TIMEFRAMES, FWD_HORIZONS, RATING_COLS, PANEL_FILE,
    SELECT_TOP_N, SELECT_BOT_N,
    build_panel, precompute_groups, eval_groups,
    LIVE_FORMULA_4TF, EQUAL_9TF, LONG_BIASED, _w_dict_to_arr,
)

OUT_DIR = os.path.dirname(os.path.abspath(__file__))
RESULTS_DIR = os.path.join(OUT_DIR, 'backtest_finetune')

# Long-biased grid: indices 3..8 are 20d, 30d, 50d, 100d, 200d, 365d
GRID_TF_NAMES = ['20d', '30d', '50d', '100d', '200d', '365d']
GRID_TF_INDICES = [3, 4, 5, 6, 7, 8]  # in TIMEFRAMES order


def gen_grid(step_pct: int) -> list:
    """Generate all 6-tuples of step%-multiples summing to 100."""
    vals = list(range(0, 101, step_pct))
    out = []
    for a in vals:
        for b in vals:
            if a + b > 100: break
            for c in vals:
                if a + b + c > 100: break
                for d in vals:
                    if a + b + c + d > 100: break
                    for e in vals:
                        rem = 100 - a - b - c - d - e
                        if rem < 0 or rem > 100: continue
                        if rem % step_pct != 0: continue
                        out.append((a, b, c, d, e, rem))
    return out


def combo_to_weights(combo) -> np.ndarray:
    """Convert a 6-tuple (20d,30d,50d,100d,200d,365d) % into a 9-tf weight array."""
    w = np.zeros(len(TIMEFRAMES))
    for i, idx in enumerate(GRID_TF_INDICES):
        w[idx] = combo[i] / 100
    return w


def stage1_grid(df_uni: pd.DataFrame, primary_horizon: str, step_pct: int):
    """Full-sample grid scan over 6tf long-biased space."""
    print(f'\n=== Stage 1: grid scan ({step_pct}% step, primary={primary_horizon}) ===')
    print(f'  Pre-computing groups for primary horizon...')
    groups = precompute_groups(df_uni, primary_horizon)
    print(f'  {len(groups)} usable dates in panel')

    combos = gen_grid(step_pct)
    print(f'  {len(combos)} combos to evaluate...')

    rows = []
    t0 = time.time()
    for i, combo in enumerate(combos):
        w = combo_to_weights(combo)
        res = eval_groups(groups, w)
        if res:
            rows.append({
                'w_20d':  combo[0], 'w_30d':  combo[1], 'w_50d':  combo[2],
                'w_100d': combo[3], 'w_200d': combo[4], 'w_365d': combo[5],
                'long_sharpe':   res['long_sharpe'],
                'long_avg':      res['long_avg'],
                'spread_sharpe': res['spread_sharpe'],
                'spread_avg':    res['spread_avg'],
                'win_rate':      res['win_rate'],
                'n_dates':       res['n_dates'],
            })
        if (i + 1) % 500 == 0:
            elapsed = time.time() - t0
            eta = elapsed * (len(combos) - i - 1) / (i + 1)
            print(f'  {i+1}/{len(combos)} ({elapsed:.0f}s elapsed, ETA {eta:.0f}s)')
    df_g = pd.DataFrame(rows).sort_values('long_sharpe', ascending=False).reset_index(drop=True)
    print(f'  Stage 1 done in {time.time()-t0:.1f}s')

    print('\n  Top 10 by long_sharpe:')
    for _, r in df_g.head(10).iterrows():
        print(f'    20d={r.w_20d:>3.0f}% 30d={r.w_30d:>3.0f}% 50d={r.w_50d:>3.0f}% '
              f'100d={r.w_100d:>3.0f}% 200d={r.w_200d:>3.0f}% 365d={r.w_365d:>3.0f}%  '
              f'long_Sharpe={r.long_sharpe:+.3f}  long_avg={r.long_avg*100:+.2f}%  '
              f'spread_Sharpe={r.spread_sharpe:+.3f}')
    return df_g


def stage2_horizons(df_uni: pd.DataFrame, top_combos):
    """Evaluate top-K combos on all 5 horizons (full sample)."""
    print(f'\n=== Stage 2: top candidates across all horizons (full sample) ===')
    rows = []
    for h in FWD_HORIZONS:
        groups = precompute_groups(df_uni, f'fwd_{h}d')
        for i, combo in enumerate(top_combos):
            w = combo_to_weights(combo)
            res = eval_groups(groups, w)
            if res:
                rows.append({
                    'rank': i + 1,
                    'fwd': f'fwd_{h}d',
                    'w_20d':  combo[0], 'w_30d':  combo[1], 'w_50d':  combo[2],
                    'w_100d': combo[3], 'w_200d': combo[4], 'w_365d': combo[5],
                    'long_sharpe':   res['long_sharpe'],
                    'long_avg':      res['long_avg'],
                    'spread_sharpe': res['spread_sharpe'],
                    'spread_avg':    res['spread_avg'],
                })
    df_h = pd.DataFrame(rows)
    return df_h


def stage3_walkforward(df: pd.DataFrame, candidate_weights: dict,
                       train_years: int = 3, oos_years: int = 1):
    """Evaluate each candidate as FIXED weight in walk-forward."""
    print(f'\n=== Stage 3: walk-forward {train_years}y/{oos_years}y on {len(candidate_weights)} candidates ===')
    df_uni = df[df['in_universe']].copy()
    dates = sorted(df_uni['trade_date'].unique())
    first, last = pd.Timestamp(dates[0]), pd.Timestamp(dates[-1])

    rows = []
    cur = first + pd.DateOffset(years=train_years)
    fold_idx = 0
    while cur + pd.DateOffset(years=oos_years) <= last:
        oos_start = cur
        oos_end   = cur + pd.DateOffset(years=oos_years) - pd.Timedelta(days=1)
        df_oos = df_uni[(df_uni['trade_date'] >= oos_start) & (df_uni['trade_date'] <= oos_end)]
        if df_oos.empty:
            cur += pd.DateOffset(years=oos_years); continue

        fold_idx += 1
        oos_groups = {h: precompute_groups(df_oos, f'fwd_{h}d') for h in FWD_HORIZONS}
        for label, w in candidate_weights.items():
            for h in FWD_HORIZONS:
                res = eval_groups(oos_groups[h], w)
                if res:
                    rows.append({
                        'fold': fold_idx,
                        'oos_start': oos_start.date().isoformat(),
                        'oos_end':   oos_end.date().isoformat(),
                        'label': label,
                        'fwd': f'fwd_{h}d',
                        'long_sharpe':   res['long_sharpe'],
                        'long_avg':      res['long_avg'],
                        'spread_sharpe': res['spread_sharpe'],
                        'spread_avg':    res['spread_avg'],
                    })
        cur += pd.DateOffset(years=oos_years)
    return pd.DataFrame(rows)


def summarise_walkforward(df_wf: pd.DataFrame):
    """Aggregate across folds: avg long_sharpe, worst fold, %positive."""
    out = []
    for label in df_wf['label'].unique():
        for h in FWD_HORIZONS:
            sub = df_wf[(df_wf.label == label) & (df_wf.fwd == f'fwd_{h}d')]
            if sub.empty: continue
            out.append({
                'label': label,
                'fwd': f'fwd_{h}d',
                'long_sharpe_avg':   sub.long_sharpe.mean(),
                'long_sharpe_min':   sub.long_sharpe.min(),
                'long_sharpe_pos%':  100 * (sub.long_sharpe > 0).mean(),
                'long_avg':          sub.long_avg.mean(),
                'long_avg_min':      sub.long_avg.min(),
                'spread_sharpe_avg': sub.spread_sharpe.mean(),
                'spread_avg':        sub.spread_avg.mean(),
            })
    return pd.DataFrame(out)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--primary', default='fwd_60d',
                    choices=[f'fwd_{h}d' for h in FWD_HORIZONS],
                    help='Primary horizon for stage 1 grid score (default fwd_60d)')
    ap.add_argument('--step', type=int, default=10,
                    help='Grid step %% (default 10; use 5 for 53k combos which takes ~30 min)')
    ap.add_argument('--top-k', type=int, default=10,
                    help='Number of top stage-1 candidates to walk-forward (default 10)')
    ap.add_argument('--train-years', type=int, default=3)
    ap.add_argument('--oos-years',   type=int, default=1)
    args = ap.parse_args()

    if not os.path.exists(PANEL_FILE):
        print('Panel cache missing — run backtest_walkforward.py first to build it.')
        return 1
    df = build_panel()
    df_uni = df[df['in_universe']].copy()

    os.makedirs(RESULTS_DIR, exist_ok=True)

    # Stage 1
    df_g = stage1_grid(df_uni, args.primary, args.step)
    df_g.to_csv(os.path.join(RESULTS_DIR, 'stage1_grid.csv'), index=False)

    # Stage 2: top-K from stage 1
    top_combos = [
        (int(r.w_20d), int(r.w_30d), int(r.w_50d), int(r.w_100d), int(r.w_200d), int(r.w_365d))
        for _, r in df_g.head(args.top_k).iterrows()
    ]
    df_h = stage2_horizons(df_uni, top_combos)
    df_h.to_csv(os.path.join(RESULTS_DIR, 'stage2_top_k_horizons.csv'), index=False)

    print(f'\n  Top-{args.top_k} candidates × 5 horizons (full sample, long_sharpe):')
    pivot = df_h.pivot_table(index='rank', columns='fwd',
                             values='long_sharpe', aggfunc='first')
    print(pivot.round(3).to_string())

    # Stage 3: walk-forward top-K + baselines
    cand = {f'opt_{i+1}': combo_to_weights(c) for i, c in enumerate(top_combos)}
    cand['live_4tf']   = _w_dict_to_arr(LIVE_FORMULA_4TF)
    cand['equal_9tf']  = _w_dict_to_arr(EQUAL_9TF)
    cand['long_biased']= _w_dict_to_arr(LONG_BIASED)
    df_wf = stage3_walkforward(df, cand, args.train_years, args.oos_years)
    df_wf.to_csv(os.path.join(RESULTS_DIR, 'stage3_walkforward.csv'), index=False)

    summary = summarise_walkforward(df_wf)
    summary.to_csv(os.path.join(RESULTS_DIR, 'stage3_summary.csv'), index=False)

    # Pick recommended weight: best ranking by avg long_sharpe across {60d, 120d, 250d},
    # tie-broken by worst-fold long_sharpe (more robust).
    score = (summary[summary.fwd.isin(['fwd_60d', 'fwd_120d', 'fwd_250d'])]
                .groupby('label')
                .agg(robust_score=('long_sharpe_min', 'mean'),
                     avg_score=('long_sharpe_avg', 'mean'))
                .sort_values(['robust_score', 'avg_score'], ascending=False))

    print('\n=== Walk-forward summary (avg / worst long Sharpe across folds) ===')
    print('\nLong-only Sharpe (long_avg) — sorted by avg across 60d/120d/250d:')
    score_full = score.merge(
        summary.pivot_table(index='label', columns='fwd', values='long_sharpe_avg', aggfunc='first'),
        left_index=True, right_index=True
    )
    print(score_full.round(3).to_string())

    print('\nWorst-fold long Sharpe by horizon:')
    worst = summary.pivot_table(index='label', columns='fwd', values='long_sharpe_min', aggfunc='first')
    print(worst.loc[score.index].round(3).to_string())

    print('\nLong-only avg return (annualised-ish) by horizon:')
    longa = summary.pivot_table(index='label', columns='fwd', values='long_avg', aggfunc='first')
    print((longa.loc[score.index] * 100).round(2).to_string())

    # Recommendation
    best_label = score.index[0]
    if best_label in cand:
        w = cand[best_label]
        rec = {
            'recommended_weights': {n: float(w[i]) for i, (n,_) in enumerate(TIMEFRAMES)},
            'recommended_label': best_label,
            'rationale': 'Highest worst-fold long Sharpe across 60d/120d/250d (robustness floor)',
            'avg_long_sharpe_60_120_250': float(score.loc[best_label, 'avg_score']),
            'worst_long_sharpe_60_120_250': float(score.loc[best_label, 'robust_score']),
        }
        with open(os.path.join(RESULTS_DIR, 'recommendation.json'), 'w') as f:
            json.dump(rec, f, indent=2, ensure_ascii=False)
        print(f'\n=== RECOMMENDED ({best_label}) ===')
        for n, _ in TIMEFRAMES:
            print(f'  {n:>5s}: {rec["recommended_weights"][n]:>5.1%}')

    print(f'\nResults written to: {RESULTS_DIR}/')


if __name__ == '__main__':
    sys.exit(main() or 0)
