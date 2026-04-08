# Leaderboard trader profiles & win rate

When `LEADERBOARD_ENABLED=true` and `LEADERBOARD_ENRICH_PROFILES` is not `false`, the bot enriches each Polymarket leaderboard row with **on-chain/API-derived metrics** before deciding whom to copy.

## Data sources

1. **`GET /v1/leaderboard`** — official rank, period PnL/volume, display name (same as before).
2. **`GET /positions?user=`** — current portfolio; used to estimate **closed-position outcomes** (win / loss / breakeven).
3. **`GET /activity?user=&type=TRADE&limit=N`** — recent trades; used for **activity intensity** and **market concentration** (Herfindahl index, HHI).

All calls use the public Data API (`https://data-api.polymarket.com`).

## Win rate (画像 · 胜率)

**Definition (heuristic):**

- A position is **closed** for this purpose when `|size|` is negligible (effectively flat). For those rows we look at **`realizedPnl`**:
  - **Win**: `realizedPnl` above a small dust threshold (profitable resolution / exit).
  - **Loss**: `realizedPnl` below the negative of that threshold.
  - **Breakeven**: near zero — excluded from win/loss ratio.
- **Win rate** = `wins / (wins + losses)` among these **decisive** closed positions.

**Caveats:**

- Polymarket’s API does not always expose a perfect “closed market” flag; we use **flat size + realized PnL** as a practical proxy.
- If there are fewer than **5** closed positions in the snapshot, the profile is marked **low sample** and the composite score applies a slight penalty (win rate defaults to 50% only for scoring, not displayed as real).
- If there are **no** decisive wins+losses, **win rate shows as `n/a`** and the row is still kept unless you use `LEADERBOARD_MIN_WIN_RATE` (unknown rates are not filtered out).

## Market concentration (HHI)

From the activity sample, we sum USDC notional per `conditionId` and compute the **Herfindahl–Hirschman Index** (0 = spread across many markets, 1 = all volume in one market). **Higher diversification** (lower HHI) increases the composite score — reduces “one-lucky-market” risk.

## Composite score (0–100)

Default blend (tunable in code in `src/services/traderProfile.ts`):

- **~45%** — win rate (or neutral 50% when unknown / low sample penalty).
- **~30%** — diversification ` (1 - HHI) × 100`.
- **~25%** — activity depth (how many trades appear in the sample, capped).

When `LEADERBOARD_USE_PROFILE_SCORE` is not `false`, **copy order** follows **composite score descending**, then API rank as tie-breaker. **Pinned** addresses in `USER_ADDRESSES` still come first, then the rest in score order.

## Environment variables

| Variable | Meaning |
|----------|---------|
| `LEADERBOARD_ENRICH_PROFILES` | `false` to skip enrichment (faster startup). Default: on. |
| `LEADERBOARD_USE_PROFILE_SCORE` | `false` to keep API leaderboard order. Default: on. |
| `LEADERBOARD_PROFILE_CONCURRENCY` | Parallel fetches per batch (default `4`). |
| `LEADERBOARD_ACTIVITY_SAMPLE_LIMIT` | Trades pulled for HHI / activity (default `150`, max `500`). |
| `LEADERBOARD_MIN_WIN_RATE` | e.g. `0.52` — drop traders with **known** win rate below 52%; `n/a` rows are kept. |
| `LEADERBOARD_PERSIST_TRACKING` | `false` to skip MongoDB persistence (default: on). |
| `LEADERBOARD_TAG_WIN_RATE_HIGH` | Win-rate floor for tag `winrate_high` (default `0.55`). |
| `LEADERBOARD_TAG_WIN_RATE_ELITE` | Floor for `winrate_elite` (default `0.62`; must be **greater than** HIGH). |
| `LEADERBOARD_TRACKING_SNAPSHOT_CAP` | Max snapshots per wallet (default `50`, max `200`). |

## MongoDB: tags & continuous tracking

When leaderboard mode runs **with** `LEADERBOARD_ENRICH_PROFILES` (default), each startup / refresh (if configured) **upserts** one document per leaderboard wallet into collection **`leaderboardtradertrackings`**:

- **`currentTags`**: string tags derived from win rate, HHI, rank, verified badge, composite score, activity (e.g. `winrate_elite`, `winrate_high`, `style_diversified`, `lb_rank_top5`, `sample_low`, `winrate_unknown`).
- **`trackingTier`**: `elite` | `high` | `standard` | `watch` — coarse bucket for “who to prioritize watching”.
- **`snapshots`**: capped time series of the same metrics + tags each run (for trend / drift).

List recent rows from the shell:

```bash
npm run leaderboard-tracking
```

## `changeme.md`

Each resolution appends:

1. Raw leaderboard table (API).
2. **Profile table**: win rate, W/L counts, closed/open counts, HHI, activity notional, composite score.

Use this file to audit how the bot ranked traders over time.
