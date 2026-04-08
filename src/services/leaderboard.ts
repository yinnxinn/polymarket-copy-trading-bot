import { ENV } from '../config/env';
import fetchData from '../utils/fetchData';

export interface LeaderboardEntry {
    rank: string;
    proxyWallet: string;
    userName?: string;
    vol?: number;
    pnl?: number;
    profileImage?: string;
    xUsername?: string;
    verifiedBadge?: boolean;
}

/**
 * Fetches trader leaderboard from Polymarket Data API (public, no auth).
 * @see https://docs.polymarket.com/api-reference/core/get-trader-leaderboard-rankings
 */
export async function fetchLeaderboardEntries(): Promise<LeaderboardEntry[]> {
    const params = new URLSearchParams({
        category: ENV.LEADERBOARD_CATEGORY,
        timePeriod: ENV.LEADERBOARD_TIME_PERIOD,
        orderBy: ENV.LEADERBOARD_ORDER_BY,
        limit: String(ENV.LEADERBOARD_LIMIT),
        offset: String(ENV.LEADERBOARD_OFFSET),
    });
    const url = `https://data-api.polymarket.com/v1/leaderboard?${params.toString()}`;
    const data = await fetchData(url);
    if (!Array.isArray(data)) {
        throw new Error('Leaderboard API returned a non-array response');
    }
    const out: LeaderboardEntry[] = [];
    for (const row of data) {
        const w = row?.proxyWallet;
        if (typeof w === 'string' && /^0x[a-fA-F0-9]{40}$/.test(w)) {
            out.push({
                rank: String(row.rank ?? ''),
                proxyWallet: w.toLowerCase(),
                userName: row.userName,
                vol: typeof row.vol === 'number' ? row.vol : undefined,
                pnl: typeof row.pnl === 'number' ? row.pnl : undefined,
                profileImage: row.profileImage,
                xUsername: row.xUsername,
                verifiedBadge: row.verifiedBadge,
            });
        }
    }
    return out;
}
