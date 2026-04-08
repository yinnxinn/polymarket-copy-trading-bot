import * as fs from 'fs';
import * as path from 'path';
import type { LeaderboardEntry } from '../services/leaderboard';
import type { EnrichedLeaderboardEntry } from '../services/traderProfile';

const FILE = 'changeme.md';

/**
 * Appends a markdown snapshot to changeme.md (raw leaderboard and optional profile enrichment).
 */
export function appendLeaderboardSnapshot(payload: {
    source: 'startup' | 'refresh';
    entries: LeaderboardEntry[];
    enriched?: EnrichedLeaderboardEntry[];
}): void {
    if (!payload.entries.length) {
        return;
    }
    const filePath = path.join(process.cwd(), FILE);
    const ts = new Date().toISOString();
    const lines: string[] = [
        `\n### ${ts} — leaderboard (${payload.source})\n`,
        '| rank | wallet | userName | lb pnl | lb vol |',
        '| --- | --- | --- | ---: | ---: |',
        ...payload.entries.map(
            (e) =>
                `| ${e.rank} | ${e.proxyWallet} | ${e.userName ?? ''} | ${e.pnl ?? ''} | ${e.vol ?? ''} |`
        ),
        '',
    ];

    if (payload.enriched && payload.enriched.length > 0) {
        lines.push(
            '**Trader profiles** — row order follows **composite score** (not API rank). Column `lb rank` is the original leaderboard rank.\n'
        );
        lines.push(
            '| # | lb rank | wallet | winRate | W/L | closed | open | HHI | activity$ | score |',
            '| --- | --- | --- | ---: | --- | ---: | ---: | ---: | ---: | ---: |'
        );
        payload.enriched.forEach((row, idx) => {
            const p = row.profile;
            const wr =
                p.winRate === null
                    ? 'n/a'
                    : `${(p.winRate * 100).toFixed(1)}%`;
            const wl = `${p.wins}/${p.losses}`;
            lines.push(
                `| ${idx + 1} | ${row.rank} | ${row.proxyWallet} | ${wr} | ${wl} | ${p.closedPositionCount} | ${p.openPositionCount} | ${p.marketsConcentrationHHI.toFixed(2)} | ${p.activityNotionalUsd.toFixed(0)} | ${p.compositeScore.toFixed(1)} |`
            );
            if (p.fetchError) {
                lines.push(`  - *fetch note ${row.proxyWallet.slice(0, 8)}…*: ${p.fetchError}`);
            }
        });
        lines.push('');
    }

    fs.appendFileSync(filePath, lines.join('\n'), 'utf8');
}
