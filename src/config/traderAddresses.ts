import { ENV } from './env';

let resolved: string[] | null = null;

/**
 * Set the active trader list (static env or merged leaderboard + pins).
 */
export function setResolvedUserAddresses(addresses: string[]): void {
    resolved = [...new Set(addresses.map((a) => a.toLowerCase()))];
}

export function getUserAddresses(): string[] {
    if (resolved !== null) {
        return resolved;
    }
    return ENV.USER_ADDRESSES;
}
