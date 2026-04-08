import { ENV } from './env';
import { fetchLeaderboardEntries } from '../services/leaderboard';
import {
    enrichLeaderboardEntries,
    filterByMinWinRate,
    sortByProfileScore,
} from '../services/traderProfile';
import { setResolvedUserAddresses } from './traderAddresses';
import { appendLeaderboardSnapshot } from '../utils/changemeLog';

function mergePinsWithOrderedWallets(pins: string[], orderedWallets: string[]): string[] {
    const pinSet = new Set(pins.map((a) => a.toLowerCase()));
    const rest = orderedWallets.filter((w) => !pinSet.has(w.toLowerCase()));
    const merged = [...pins.map((p) => p.toLowerCase()), ...rest];
    return [...new Set(merged)].slice(0, ENV.LEADERBOARD_MAX_TOTAL_TRADERS);
}

async function buildOrderedWalletsAndLog(source: 'startup' | 'refresh'): Promise<string[]> {
    const entries = await fetchLeaderboardEntries();
    const fromLb = entries.map((e) => e.proxyWallet);

    if (!ENV.LEADERBOARD_ENRICH_PROFILES) {
        appendLeaderboardSnapshot({ source, entries });
        return fromLb;
    }

    let enriched = await enrichLeaderboardEntries(entries);
    enriched = filterByMinWinRate(enriched, ENV.LEADERBOARD_MIN_WIN_RATE);
    if (ENV.LEADERBOARD_USE_PROFILE_SCORE) {
        enriched = sortByProfileScore(enriched);
    }
    appendLeaderboardSnapshot({ source, entries, enriched });
    return enriched.map((e) => e.proxyWallet);
}

/**
 * Resolves final trader list: static USER_ADDRESSES, or leaderboard + optional pins.
 */
export async function resolveTraderAddressesAtStartup(): Promise<string[]> {
    if (!ENV.LEADERBOARD_ENABLED) {
        setResolvedUserAddresses(ENV.USER_ADDRESSES);
        return ENV.USER_ADDRESSES;
    }

    const orderedWallets = await buildOrderedWalletsAndLog('startup');
    const merged = mergePinsWithOrderedWallets(ENV.USER_ADDRESSES, orderedWallets);

    if (merged.length === 0) {
        throw new Error(
            'Leaderboard mode: no valid traders (empty API result and USER_ADDRESSES pins empty)'
        );
    }

    setResolvedUserAddresses(merged);
    return merged;
}

/**
 * Re-fetch leaderboard and merge with pinned USER_ADDRESSES (used on refresh interval).
 */
export async function refreshLeaderboardTraders(): Promise<string[]> {
    const orderedWallets = await buildOrderedWalletsAndLog('refresh');
    const merged = mergePinsWithOrderedWallets(ENV.USER_ADDRESSES, orderedWallets);

    if (merged.length === 0) {
        throw new Error('Leaderboard refresh returned no traders');
    }

    setResolvedUserAddresses(merged);
    return merged;
}
