import { ENV } from '../config/env';
import fetchData from '../utils/fetchData';
import type { LeaderboardEntry } from './leaderboard';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Polymarket Data API position row (subset). */
interface ApiPosition {
    asset?: string;
    conditionId?: string;
    size?: number;
    realizedPnl?: number;
    cashPnl?: number;
    percentPnl?: number;
    currentValue?: number;
    initialValue?: number;
    redeemable?: boolean;
    title?: string;
    slug?: string;
}

interface ApiActivity {
    timestamp: number;
    conditionId?: string;
    usdcSize?: number;
}

export interface TraderProfileMetrics {
    address: string;
    lbRank: string;
    lbPnl?: number;
    lbVol?: number;
    userName?: string;
    verifiedBadge?: boolean;

    positionCount: number;
    openPositionCount: number;
    /** Closed / flat positions used for win-rate (|size| negligible). */
    closedPositionCount: number;
    wins: number;
    losses: number;
    breakevens: number;
    /** Wins / (wins + losses); null if no decisive closed positions. */
    winRate: number | null;
    winRateSampleSize: number;
    /** True if fewer than MIN_SAMPLE closed positions for stable win rate. */
    lowSample: boolean;

    activityTradesSampled: number;
    uniqueMarketsInSample: number;
    /** Herfindahl index on conditionId share of volume in sample (0=diverse, 1=one market). */
    marketsConcentrationHHI: number;
    /** Sum of |usdcSize| in activity sample (proxy for recent intensity). */
    activityNotionalUsd: number;

    /** 0–100: blends win rate, diversification, activity depth (not raw PnL). */
    compositeScore: number;
    fetchError?: string;
}

export interface EnrichedLeaderboardEntry extends LeaderboardEntry {
    profile: TraderProfileMetrics;
}

const MIN_CLOSED_FOR_WINRATE = 5;
const DUST = 1e-4;
const PNL_DUST = 0.02;

function classifyClosedPosition(pos: ApiPosition): 'win' | 'loss' | 'breakeven' | 'open' {
    const size = Math.abs(pos.size ?? 0);
    if (size > DUST) {
        return 'open';
    }
    const rp = pos.realizedPnl ?? 0;
    if (Math.abs(rp) < PNL_DUST) {
        return 'breakeven';
    }
    return rp > 0 ? 'win' : 'loss';
}

function computeHHI(conditionVolumes: Map<string, number>): number {
    const total = [...conditionVolumes.values()].reduce((a, b) => a + b, 0);
    if (total <= 0) {
        return 0;
    }
    let h = 0;
    for (const v of conditionVolumes.values()) {
        const s = v / total;
        h += s * s;
    }
    return h;
}

async function fetchPositions(address: string): Promise<ApiPosition[]> {
    const url = `https://data-api.polymarket.com/positions?user=${address}`;
    const data = await fetchData(url);
    return Array.isArray(data) ? data : [];
}

async function fetchActivitySample(address: string, limit: number): Promise<ApiActivity[]> {
    const url = `https://data-api.polymarket.com/activity?user=${address}&type=TRADE&limit=${limit}`;
    const data = await fetchData(url);
    return Array.isArray(data) ? data : [];
}

function buildMetrics(entry: LeaderboardEntry, positions: ApiPosition[], activities: ApiActivity[]): TraderProfileMetrics {
    const address = entry.proxyWallet;
    let wins = 0;
    let losses = 0;
    let breakevens = 0;
    let openPositionCount = 0;
    let closedPositionCount = 0;

    for (const pos of positions) {
        const c = classifyClosedPosition(pos);
        if (c === 'open') {
            openPositionCount += 1;
        } else {
            closedPositionCount += 1;
            if (c === 'win') {
                wins += 1;
            } else if (c === 'loss') {
                losses += 1;
            } else {
                breakevens += 1;
            }
        }
    }

    const decisive = wins + losses;
    const winRate = decisive > 0 ? wins / decisive : null;
    const winRateSampleSize = decisive;
    const lowSample = closedPositionCount < MIN_CLOSED_FOR_WINRATE;

    const conditionVolumes = new Map<string, number>();
    let activityNotionalUsd = 0;
    for (const a of activities) {
        const cid = a.conditionId || 'unknown';
        const sz = Math.abs(a.usdcSize ?? 0);
        activityNotionalUsd += sz;
        conditionVolumes.set(cid, (conditionVolumes.get(cid) ?? 0) + sz);
    }
    const uniqueMarketsInSample = conditionVolumes.size;
    const marketsConcentrationHHI = computeHHI(conditionVolumes);

    const wrForScore = winRate ?? 0.5;
    const diversificationScore = (1 - marketsConcentrationHHI) * 100;
    const activityScore = Math.min(100, (activities.length / 40) * 100);
    const samplePenalty = lowSample ? 0.85 : 1;

    let compositeScore =
        samplePenalty *
        (0.45 * (wrForScore * 100) + 0.3 * diversificationScore + 0.25 * activityScore);

    compositeScore = Math.max(0, Math.min(100, compositeScore));

    return {
        address,
        lbRank: entry.rank,
        lbPnl: entry.pnl,
        lbVol: entry.vol,
        userName: entry.userName,
        verifiedBadge: entry.verifiedBadge,
        positionCount: positions.length,
        openPositionCount,
        closedPositionCount,
        wins,
        losses,
        breakevens,
        winRate,
        winRateSampleSize,
        lowSample,
        activityTradesSampled: activities.length,
        uniqueMarketsInSample,
        marketsConcentrationHHI,
        activityNotionalUsd,
        compositeScore,
    };
}

/**
 * Enrich leaderboard rows with on-chain/API-derived profile (positions + activity sample).
 */
export async function enrichLeaderboardEntries(
    entries: LeaderboardEntry[]
): Promise<EnrichedLeaderboardEntry[]> {
    const limit = Math.max(20, Math.min(500, ENV.LEADERBOARD_ACTIVITY_SAMPLE_LIMIT));
    const concurrency = Math.max(1, Math.min(8, ENV.LEADERBOARD_PROFILE_CONCURRENCY));
    const out: EnrichedLeaderboardEntry[] = [];

    for (let i = 0; i < entries.length; i += concurrency) {
        const batch = entries.slice(i, i + concurrency);
        const part = await Promise.all(
            batch.map(async (entry) => {
                try {
                    const [positions, activities] = await Promise.all([
                        fetchPositions(entry.proxyWallet),
                        fetchActivitySample(entry.proxyWallet, limit),
                    ]);
                    const profile = buildMetrics(entry, positions, activities);
                    return { ...entry, profile };
                } catch (e) {
                    const msg = e instanceof Error ? e.message : String(e);
                    const profile: TraderProfileMetrics = {
                        address: entry.proxyWallet,
                        lbRank: entry.rank,
                        lbPnl: entry.pnl,
                        lbVol: entry.vol,
                        userName: entry.userName,
                        verifiedBadge: entry.verifiedBadge,
                        positionCount: 0,
                        openPositionCount: 0,
                        closedPositionCount: 0,
                        wins: 0,
                        losses: 0,
                        breakevens: 0,
                        winRate: null,
                        winRateSampleSize: 0,
                        lowSample: true,
                        activityTradesSampled: 0,
                        uniqueMarketsInSample: 0,
                        marketsConcentrationHHI: 0,
                        activityNotionalUsd: 0,
                        compositeScore: 0,
                        fetchError: msg,
                    };
                    return { ...entry, profile };
                }
            })
        );
        out.push(...part);
        if (i + concurrency < entries.length) {
            await sleep(250);
        }
    }

    return out;
}

/**
 * Optional filter: drop entries whose win rate is below threshold (if computable).
 */
export function filterByMinWinRate(
    rows: EnrichedLeaderboardEntry[],
    minRate: number | null
): EnrichedLeaderboardEntry[] {
    if (minRate === null || minRate <= 0) {
        return rows;
    }
    return rows.filter((r) => {
        const wr = r.profile.winRate;
        if (wr === null) {
            return true;
        }
        return wr >= minRate;
    });
}

/**
 * Sort by composite score (desc), then by API rank (asc).
 */
export function sortByProfileScore(rows: EnrichedLeaderboardEntry[]): EnrichedLeaderboardEntry[] {
    return [...rows].sort((a, b) => {
        const d = b.profile.compositeScore - a.profile.compositeScore;
        if (Math.abs(d) > 1e-6) {
            return d;
        }
        return parseInt(a.rank, 10) - parseInt(b.rank, 10);
    });
}
