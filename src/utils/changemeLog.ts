import * as fs from 'fs';
import * as path from 'path';
import type { LeaderboardEntry } from '../services/leaderboard';

const FILE = 'changeme.md';

/**
 * Appends a markdown table snapshot of resolved leaderboard rows to changeme.md.
 */
export function appendLeaderboardSnapshot(payload: {
    source: 'startup' | 'refresh';
    entries: LeaderboardEntry[];
}): void {
    if (!payload.entries.length) {
        return;
    }
    const filePath = path.join(process.cwd(), FILE);
    const ts = new Date().toISOString();
    const lines = [
        `\n### ${ts} — leaderboard (${payload.source})\n`,
        '| rank | wallet | userName | pnl | vol |',
        '| --- | --- | --- | ---: | ---: |',
        ...payload.entries.map(
            (e) =>
                `| ${e.rank} | ${e.proxyWallet} | ${e.userName ?? ''} | ${e.pnl ?? ''} | ${e.vol ?? ''} |`
        ),
        '',
    ];
    fs.appendFileSync(filePath, lines.join('\n'), 'utf8');
}
