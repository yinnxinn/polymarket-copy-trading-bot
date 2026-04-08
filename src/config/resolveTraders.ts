import { ENV } from './env';
import { fetchLeaderboardEntries } from '../services/leaderboard';
import { setResolvedUserAddresses } from './traderAddresses';
import { appendLeaderboardSnapshot } from '../utils/changemeLog';

function mergePinsWithLeaderboard(
    pins: string[],
    leaderboardWallets: string[]
): string[] {
    const merged = [...new Set([...pins.map((a) => a.toLowerCase()), ...leaderboardWallets])];
    const max = ENV.LEADERBOARD_MAX_TOTAL_TRADERS;
    return merged.slice(0, max);
}

/**
 * Resolves final trader list: static USER_ADDRESSES, or leaderboard + optional pins.
 */
export async function resolveTraderAddressesAtStartup(): Promise<string[]> {
    if (!ENV.LEADERBOARD_ENABLED) {
        setResolvedUserAddresses(ENV.USER_ADDRESSES);
        return ENV.USER_ADDRESSES;
    }

    const entries = await fetchLeaderboardEntries();
    const fromLb = entries.map((e) => e.proxyWallet);
    const merged = mergePinsWithLeaderboard(ENV.USER_ADDRESSES, fromLb);

    if (merged.length === 0) {
        throw new Error(
            'Leaderboard mode: no valid traders (empty API result and USER_ADDRESSES pins empty)'
        );
    }

    setResolvedUserAddresses(merged);
    appendLeaderboardSnapshot({ source: 'startup', entries });
    return merged;
}

/**
 * Re-fetch leaderboard and merge with pinned USER_ADDRESSES (used on refresh interval).
 */
export async function refreshLeaderboardTraders(): Promise<string[]> {
    const entries = await fetchLeaderboardEntries();
    const fromLb = entries.map((e) => e.proxyWallet);
    const merged = mergePinsWithLeaderboard(ENV.USER_ADDRESSES, fromLb);

    if (merged.length === 0) {
        throw new Error('Leaderboard refresh returned no traders');
    }

    setResolvedUserAddresses(merged);
    appendLeaderboardSnapshot({ source: 'refresh', entries });
    return merged;
}
