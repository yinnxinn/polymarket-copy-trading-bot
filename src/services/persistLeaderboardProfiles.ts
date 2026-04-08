import { ENV } from '../config/env';
import { LeaderboardTraderTrackingModel } from '../models/leaderboardTraderTracking';
import type { EnrichedLeaderboardEntry } from './traderProfile';
import { buildProfileTags, inferTrackingTier } from './traderProfileTags';
import Logger from '../utils/logger';

/**
 * Upsert each enriched leaderboard row: current tags + append time-series snapshot (capped).
 */
export async function persistEnrichedLeaderboardProfiles(
    enriched: EnrichedLeaderboardEntry[],
    source: 'startup' | 'refresh'
): Promise<void> {
    if (!ENV.LEADERBOARD_ENABLED || !ENV.LEADERBOARD_PERSIST_TRACKING || enriched.length === 0) {
        return;
    }

    const cap = ENV.LEADERBOARD_TRACKING_SNAPSHOT_CAP;
    let ok = 0;
    let failed = 0;

    for (const row of enriched) {
        const p = row.profile;
        const tags = buildProfileTags(row);
        const tier = inferTrackingTier(row, tags);
        const now = new Date();

        const snapshot = {
            recordedAt: now,
            source,
            tags,
            trackingTier: tier,
            winRate: p.winRate,
            compositeScore: p.compositeScore,
            lbRank: row.rank,
            lbPnl: row.pnl,
            lbVol: row.vol,
            hhi: p.marketsConcentrationHHI,
            activityNotionalUsd: p.activityNotionalUsd,
            wins: p.wins,
            losses: p.losses,
            closedPositionCount: p.closedPositionCount,
            openPositionCount: p.openPositionCount,
            lowSample: p.lowSample,
            fetchError: p.fetchError,
        };

        const latestMetrics = {
            userName: row.userName,
            rank: row.rank,
            pnl: row.pnl,
            vol: row.vol,
            winRate: p.winRate,
            compositeScore: p.compositeScore,
            hhi: p.marketsConcentrationHHI,
            activityNotionalUsd: p.activityNotionalUsd,
            wins: p.wins,
            losses: p.losses,
            closedPositionCount: p.closedPositionCount,
            openPositionCount: p.openPositionCount,
            lowSample: p.lowSample,
            verifiedBadge: row.verifiedBadge,
        };

        try {
            await LeaderboardTraderTrackingModel.findOneAndUpdate(
                { address: row.proxyWallet.toLowerCase() },
                {
                    $set: {
                        userName: row.userName,
                        currentTags: tags,
                        trackingTier: tier,
                        lastSource: source,
                        lastRecordedAt: now,
                        latestMetrics,
                    },
                    $push: {
                        snapshots: {
                            $each: [snapshot],
                            $slice: -cap,
                        },
                    },
                },
                { upsert: true, new: true }
            );
            ok += 1;
        } catch (e) {
            failed += 1;
            Logger.error(
                `Failed to persist leaderboard profile ${row.proxyWallet.slice(0, 8)}…: ${e}`
            );
        }
    }

    Logger.info(
        `Leaderboard tracking DB: upserted ${ok} trader profile(s)${
            failed ? `, ${failed} failed` : ''
        } (snapshots capped at ${cap} per address)`
    );
}
