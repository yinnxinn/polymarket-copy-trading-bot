import { ENV } from '../config/env';
import type { EnrichedLeaderboardEntry } from './traderProfile';

export type TrackingTier = 'elite' | 'high' | 'standard' | 'watch';

/**
 * Derive stable profile tags from enriched leaderboard + on-chain sample metrics.
 */
export function buildProfileTags(row: EnrichedLeaderboardEntry): string[] {
    const tags: string[] = [];
    const p = row.profile;
    const rank = parseInt(row.rank, 10) || 999;
    const high = ENV.LEADERBOARD_TAG_WIN_RATE_HIGH;
    const elite = ENV.LEADERBOARD_TAG_WIN_RATE_ELITE;

    if (p.fetchError) {
        tags.push('data_fetch_error');
    }

    if (p.lowSample) {
        tags.push('sample_low');
    }

    if (p.winRate === null) {
        tags.push('winrate_unknown');
    } else if (!p.lowSample) {
        if (p.winRate >= elite) {
            tags.push('winrate_elite');
        } else if (p.winRate >= high) {
            tags.push('winrate_high');
        } else if (p.winRate < 0.45) {
            tags.push('winrate_low');
        }
    }

    if (p.marketsConcentrationHHI < 0.28) {
        tags.push('style_diversified');
    } else if (p.marketsConcentrationHHI > 0.55) {
        tags.push('style_concentrated');
    }

    if (rank <= 5) {
        tags.push('lb_rank_top5');
    } else if (rank <= 15) {
        tags.push('lb_rank_top15');
    }

    if (row.pnl !== undefined && row.pnl > 0) {
        tags.push('lb_pnl_positive');
    }

    if (row.verifiedBadge) {
        tags.push('account_verified');
    }

    if (p.compositeScore >= 72) {
        tags.push('score_strong');
    } else if (p.compositeScore >= 55) {
        tags.push('score_mid');
    }

    if (p.activityNotionalUsd >= 5000) {
        tags.push('activity_heavy');
    } else if (p.activityNotionalUsd > 0 && p.activityNotionalUsd < 200) {
        tags.push('activity_light');
    }

    return [...new Set(tags)];
}

export function inferTrackingTier(row: EnrichedLeaderboardEntry, tags: string[]): TrackingTier {
    const p = row.profile;
    if (p.fetchError) {
        return 'watch';
    }
    if (!p.lowSample && p.winRate !== null) {
        if (tags.includes('winrate_elite')) {
            return 'elite';
        }
        if (tags.includes('winrate_high')) {
            return 'high';
        }
    }
    if (p.lowSample || p.winRate === null) {
        return 'watch';
    }
    return 'standard';
}
