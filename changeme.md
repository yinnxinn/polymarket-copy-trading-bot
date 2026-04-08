# Runtime log — leaderboard snapshots

When `LEADERBOARD_ENABLED=true`, the bot appends markdown here each time it resolves the Polymarket trader leaderboard (at startup and on each refresh interval, if configured).

If `LEADERBOARD_ENRICH_PROFILES` is enabled (default), a **second table** is appended with per-wallet **win rate**, **W/L**, **HHI** (market concentration), and **composite score**. See [docs/LEADERBOARD_PROFILE.md](./docs/LEADERBOARD_PROFILE.md) for definitions.

This file is safe to delete or rotate; it is not required for trading.
