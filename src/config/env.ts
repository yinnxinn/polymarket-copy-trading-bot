import * as dotenv from 'dotenv';
import { CopyStrategy, CopyStrategyConfig, parseTieredMultipliers } from './copyStrategy';
dotenv.config();

/**
 * Validate Ethereum address format
 */
const isValidEthereumAddress = (address: string): boolean => {
    return /^0x[a-fA-F0-9]{40}$/.test(address);
};

const UUID_LIKE =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Normalize and validate Polygon wallet private key (32-byte hex).
 */
const parsePrivateKey = (raw: string): string => {
    let s = raw.trim();
    if (
        (s.startsWith('"') && s.endsWith('"')) ||
        (s.startsWith("'") && s.endsWith("'"))
    ) {
        s = s.slice(1, -1).trim();
    }
    if (UUID_LIKE.test(s)) {
        console.error('\n❌ Invalid PRIVATE_KEY\n');
        console.error(
            'The value looks like a UUID, not an Ethereum private key.\n'
        );
        console.error(
            'Use the 64-character hex key from your wallet (e.g. MetaMask → ⋮ → Account details → Show private key).\n'
        );
        console.error('Do not use API keys, MongoDB IDs, or random strings here.\n');
        throw new Error(
            'PRIVATE_KEY must be a 64-character hexadecimal wallet private key, not a UUID.'
        );
    }
    let hex = s;
    if (hex.startsWith('0x') || hex.startsWith('0X')) {
        hex = hex.slice(2);
    }
    if (!/^[0-9a-fA-F]{64}$/.test(hex)) {
        console.error('\n❌ Invalid PRIVATE_KEY format\n');
        console.error(
            'Expected: 64 hex characters, optionally prefixed with 0x (wallet export).\n'
        );
        throw new Error(
            'PRIVATE_KEY must be exactly 64 hex digits (32 bytes), with or without 0x prefix.'
        );
    }
    return '0x' + hex.toLowerCase();
};

const LEADERBOARD_ENABLED = process.env.LEADERBOARD_ENABLED === 'true';

/**
 * Validate required environment variables
 */
const validateRequiredEnv = (): void => {
    const required = [
        'PROXY_WALLET',
        'PRIVATE_KEY',
        'CLOB_HTTP_URL',
        'CLOB_WS_URL',
        'MONGO_URI',
        'RPC_URL',
        'USDC_CONTRACT_ADDRESS',
    ];

    if (!LEADERBOARD_ENABLED) {
        required.push('USER_ADDRESSES');
    }

    const missing: string[] = [];
    for (const key of required) {
        if (!process.env[key]) {
            missing.push(key);
        }
    }

    if (missing.length > 0) {
        console.error('\n❌ Configuration Error: Missing required environment variables\n');
        console.error(`Missing variables: ${missing.join(', ')}\n`);
        console.error('🔧 Quick fix:');
        console.error('   1. Run the setup wizard: npm run setup');
        console.error('   2. Or manually create .env file with all required variables\n');
        console.error('📖 See docs/QUICK_START.md for detailed instructions\n');
        throw new Error(
            `Missing required environment variables: ${missing.join(', ')}`
        );
    }
};

/**
 * Validate Ethereum addresses
 */
const validateAddresses = (): void => {
    if (process.env.PROXY_WALLET && !isValidEthereumAddress(process.env.PROXY_WALLET)) {
        console.error('\n❌ Invalid Wallet Address\n');
        console.error(`Your PROXY_WALLET: ${process.env.PROXY_WALLET}`);
        console.error('Expected format:    0x followed by 40 hexadecimal characters\n');
        console.error('Example: 0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb0\n');
        console.error('💡 Tips:');
        console.error('   • Copy your wallet address from MetaMask');
        console.error('   • Make sure it starts with 0x');
        console.error('   • Should be exactly 42 characters long\n');
        throw new Error(
            `Invalid PROXY_WALLET address format: ${process.env.PROXY_WALLET}`
        );
    }

    if (
        process.env.USDC_CONTRACT_ADDRESS &&
        !isValidEthereumAddress(process.env.USDC_CONTRACT_ADDRESS)
    ) {
        console.error('\n❌ Invalid USDC Contract Address\n');
        console.error(`Current value: ${process.env.USDC_CONTRACT_ADDRESS}`);
        console.error('Default value: 0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174\n');
        console.error('⚠️  Unless you know what you\'re doing, use the default value!\n');
        throw new Error(
            `Invalid USDC_CONTRACT_ADDRESS format: ${process.env.USDC_CONTRACT_ADDRESS}`
        );
    }
};

/**
 * Validate numeric configuration values
 */
const validateNumericConfig = (): void => {
    const fetchInterval = parseInt(process.env.FETCH_INTERVAL || '1', 10);
    if (isNaN(fetchInterval) || fetchInterval <= 0) {
        throw new Error(
            `Invalid FETCH_INTERVAL: ${process.env.FETCH_INTERVAL}. Must be a positive integer.`
        );
    }

    const retryLimit = parseInt(process.env.RETRY_LIMIT || '3', 10);
    if (isNaN(retryLimit) || retryLimit < 1 || retryLimit > 10) {
        throw new Error(
            `Invalid RETRY_LIMIT: ${process.env.RETRY_LIMIT}. Must be between 1 and 10.`
        );
    }

    const tooOldTimestamp = parseInt(process.env.TOO_OLD_TIMESTAMP || '24', 10);
    if (isNaN(tooOldTimestamp) || tooOldTimestamp < 1) {
        throw new Error(
            `Invalid TOO_OLD_TIMESTAMP: ${process.env.TOO_OLD_TIMESTAMP}. Must be a positive integer (hours).`
        );
    }

    const requestTimeout = parseInt(process.env.REQUEST_TIMEOUT_MS || '10000', 10);
    if (isNaN(requestTimeout) || requestTimeout < 1000) {
        throw new Error(
            `Invalid REQUEST_TIMEOUT_MS: ${process.env.REQUEST_TIMEOUT_MS}. Must be at least 1000ms.`
        );
    }

    const networkRetryLimit = parseInt(process.env.NETWORK_RETRY_LIMIT || '3', 10);
    if (isNaN(networkRetryLimit) || networkRetryLimit < 1 || networkRetryLimit > 10) {
        throw new Error(
            `Invalid NETWORK_RETRY_LIMIT: ${process.env.NETWORK_RETRY_LIMIT}. Must be between 1 and 10.`
        );
    }
};

/**
 * Validate URL formats
 */
const validateUrls = (): void => {
    if (process.env.CLOB_HTTP_URL && !process.env.CLOB_HTTP_URL.startsWith('http')) {
        console.error('\n❌ Invalid CLOB_HTTP_URL\n');
        console.error(`Current value: ${process.env.CLOB_HTTP_URL}`);
        console.error('Default value: https://clob.polymarket.com/\n');
        console.error('⚠️  Use the default value unless you have a specific reason to change it!\n');
        throw new Error(
            `Invalid CLOB_HTTP_URL: ${process.env.CLOB_HTTP_URL}. Must be a valid HTTP/HTTPS URL.`
        );
    }

    if (process.env.CLOB_WS_URL && !process.env.CLOB_WS_URL.startsWith('ws')) {
        console.error('\n❌ Invalid CLOB_WS_URL\n');
        console.error(`Current value: ${process.env.CLOB_WS_URL}`);
        console.error('Default value: wss://ws-subscriptions-clob.polymarket.com/ws\n');
        console.error('⚠️  Use the default value unless you have a specific reason to change it!\n');
        throw new Error(
            `Invalid CLOB_WS_URL: ${process.env.CLOB_WS_URL}. Must be a valid WebSocket URL (ws:// or wss://).`
        );
    }

    if (process.env.RPC_URL && !process.env.RPC_URL.startsWith('http')) {
        console.error('\n❌ Invalid RPC_URL\n');
        console.error(`Current value: ${process.env.RPC_URL}`);
        console.error('Must start with: http:// or https://\n');
        console.error('💡 Get a free RPC endpoint from:');
        console.error('   • Infura:  https://infura.io');
        console.error('   • Alchemy: https://www.alchemy.com');
        console.error('   • Ankr:    https://www.ankr.com\n');
        console.error('Example: https://polygon-mainnet.infura.io/v3/YOUR_PROJECT_ID\n');
        throw new Error(`Invalid RPC_URL: ${process.env.RPC_URL}. Must be a valid HTTP/HTTPS URL.`);
    }

    if (process.env.MONGO_URI && !process.env.MONGO_URI.startsWith('mongodb')) {
        console.error('\n❌ Invalid MONGO_URI\n');
        console.error(`Current value: ${process.env.MONGO_URI}`);
        console.error('Must start with: mongodb:// or mongodb+srv://\n');
        console.error('💡 Setup MongoDB Atlas (free):');
        console.error('   1. Visit https://www.mongodb.com/cloud/atlas/register');
        console.error('   2. Create a free cluster');
        console.error('   3. Create database user with password');
        console.error('   4. Whitelist IP: 0.0.0.0/0 (or your IP)');
        console.error('   5. Get connection string from "Connect" button\n');
        console.error('Example: mongodb+srv://username:password@cluster.mongodb.net/database\n');
        throw new Error(
            `Invalid MONGO_URI: ${process.env.MONGO_URI}. Must be a valid MongoDB connection string.`
        );
    }
};

// Run all validations
validateRequiredEnv();
validateAddresses();
validateNumericConfig();
validateUrls();

const PRIVATE_KEY = parsePrivateKey(process.env.PRIVATE_KEY as string);

const LEADERBOARD_CATEGORIES = new Set([
    'OVERALL',
    'POLITICS',
    'SPORTS',
    'CRYPTO',
    'CULTURE',
    'MENTIONS',
    'WEATHER',
    'ECONOMICS',
    'TECH',
    'FINANCE',
]);

const LEADERBOARD_PERIODS = new Set(['DAY', 'WEEK', 'MONTH', 'ALL']);

const validateLeaderboardEnv = (): void => {
    if (!LEADERBOARD_ENABLED) {
        return;
    }
    const cat = (process.env.LEADERBOARD_CATEGORY || 'OVERALL').toUpperCase();
    if (!LEADERBOARD_CATEGORIES.has(cat)) {
        throw new Error(
            `Invalid LEADERBOARD_CATEGORY: ${cat}. Must be one of: ${[...LEADERBOARD_CATEGORIES].join(', ')}`
        );
    }
    const period = (process.env.LEADERBOARD_TIME_PERIOD || 'MONTH').toUpperCase();
    if (!LEADERBOARD_PERIODS.has(period)) {
        throw new Error(
            `Invalid LEADERBOARD_TIME_PERIOD: ${period}. Must be DAY, WEEK, MONTH, or ALL`
        );
    }
    const order = (process.env.LEADERBOARD_ORDER_BY || 'PNL').toUpperCase();
    if (order !== 'PNL' && order !== 'VOL') {
        throw new Error('LEADERBOARD_ORDER_BY must be PNL or VOL');
    }
};

validateLeaderboardEnv();

// Parse USER_ADDRESSES: supports both comma-separated string and JSON array
const parseUserAddresses = (input: string): string[] => {
    const trimmed = input.trim();
    // Check if it's JSON array format
    if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
        try {
            const parsed = JSON.parse(trimmed);
            if (Array.isArray(parsed)) {
                const addresses = parsed
                    .map((addr) => addr.toLowerCase().trim())
                    .filter((addr) => addr.length > 0);
                // Validate each address
                for (const addr of addresses) {
                    if (!isValidEthereumAddress(addr)) {
                        console.error('\n❌ Invalid Trader Address in USER_ADDRESSES\n');
                        console.error(`Invalid address: ${addr}`);
                        console.error('Expected format: 0x followed by 40 hexadecimal characters\n');
                        console.error('💡 Where to find trader addresses:');
                        console.error('   • Polymarket Leaderboard: https://polymarket.com/leaderboard');
                        console.error('   • Predictfolio: https://predictfolio.com\n');
                        console.error('Example: USER_ADDRESSES=\'0x7c3db723f1d4d8cb9c550095203b686cb11e5c6b\'\n');
                        throw new Error(`Invalid Ethereum address in USER_ADDRESSES: ${addr}`);
                    }
                }
                return addresses;
            }
        } catch (e) {
            if (e instanceof Error && e.message.includes('Invalid Ethereum address')) {
                throw e;
            }
            throw new Error(
                `Invalid JSON format for USER_ADDRESSES: ${e instanceof Error ? e.message : String(e)}`
            );
        }
    }
    // Otherwise treat as comma-separated
    const addresses = trimmed
        .split(',')
        .map((addr) => addr.toLowerCase().trim())
        .filter((addr) => addr.length > 0);
    // Validate each address
    for (const addr of addresses) {
        if (!isValidEthereumAddress(addr)) {
            console.error('\n❌ Invalid Trader Address in USER_ADDRESSES\n');
            console.error(`Invalid address: ${addr}`);
            console.error('Expected format: 0x followed by 40 hexadecimal characters\n');
            console.error('💡 Where to find trader addresses:');
            console.error('   • Polymarket Leaderboard: https://polymarket.com/leaderboard');
            console.error('   • Predictfolio: https://predictfolio.com\n');
            console.error('Example: USER_ADDRESSES=\'0x7c3db723f1d4d8cb9c550095203b686cb11e5c6b\'\n');
            throw new Error(`Invalid Ethereum address in USER_ADDRESSES: ${addr}`);
        }
    }
    return addresses;
};

// Parse copy strategy configuration
const parseCopyStrategy = (): CopyStrategyConfig => {
    // Support legacy COPY_PERCENTAGE + TRADE_MULTIPLIER for backward compatibility
    const hasLegacyConfig = process.env.COPY_PERCENTAGE && !process.env.COPY_STRATEGY;

    if (hasLegacyConfig) {
        console.warn(
            '⚠️  Using legacy COPY_PERCENTAGE configuration. Consider migrating to COPY_STRATEGY.'
        );
        const copyPercentage = parseFloat(process.env.COPY_PERCENTAGE || '10.0');
        const tradeMultiplier = parseFloat(process.env.TRADE_MULTIPLIER || '1.0');
        const effectivePercentage = copyPercentage * tradeMultiplier;

        const config: CopyStrategyConfig = {
            strategy: CopyStrategy.PERCENTAGE,
            copySize: effectivePercentage,
            maxOrderSizeUSD: parseFloat(process.env.MAX_ORDER_SIZE_USD || '100.0'),
            minOrderSizeUSD: parseFloat(process.env.MIN_ORDER_SIZE_USD || '1.0'),
            maxPositionSizeUSD: process.env.MAX_POSITION_SIZE_USD
                ? parseFloat(process.env.MAX_POSITION_SIZE_USD)
                : undefined,
            maxDailyVolumeUSD: process.env.MAX_DAILY_VOLUME_USD
                ? parseFloat(process.env.MAX_DAILY_VOLUME_USD)
                : undefined,
        };

        // Parse tiered multipliers if configured (even for legacy mode)
        if (process.env.TIERED_MULTIPLIERS) {
            try {
                config.tieredMultipliers = parseTieredMultipliers(process.env.TIERED_MULTIPLIERS);
                console.log(`✓ Loaded ${config.tieredMultipliers.length} tiered multipliers`);
            } catch (error) {
                throw new Error(`Failed to parse TIERED_MULTIPLIERS: ${error instanceof Error ? error.message : String(error)}`);
            }
        } else if (tradeMultiplier !== 1.0) {
            // If using legacy single multiplier, store it
            config.tradeMultiplier = tradeMultiplier;
        }

        return config;
    }

    // Parse new copy strategy configuration
    const strategyStr = (process.env.COPY_STRATEGY || 'PERCENTAGE').toUpperCase();
    const strategy =
        CopyStrategy[strategyStr as keyof typeof CopyStrategy] || CopyStrategy.PERCENTAGE;

    const config: CopyStrategyConfig = {
        strategy,
        copySize: parseFloat(process.env.COPY_SIZE || '10.0'),
        maxOrderSizeUSD: parseFloat(process.env.MAX_ORDER_SIZE_USD || '100.0'),
        minOrderSizeUSD: parseFloat(process.env.MIN_ORDER_SIZE_USD || '1.0'),
        maxPositionSizeUSD: process.env.MAX_POSITION_SIZE_USD
            ? parseFloat(process.env.MAX_POSITION_SIZE_USD)
            : undefined,
        maxDailyVolumeUSD: process.env.MAX_DAILY_VOLUME_USD
            ? parseFloat(process.env.MAX_DAILY_VOLUME_USD)
            : undefined,
    };

    // Add adaptive strategy parameters if applicable
    if (strategy === CopyStrategy.ADAPTIVE) {
        config.adaptiveMinPercent = parseFloat(
            process.env.ADAPTIVE_MIN_PERCENT || config.copySize.toString()
        );
        config.adaptiveMaxPercent = parseFloat(
            process.env.ADAPTIVE_MAX_PERCENT || config.copySize.toString()
        );
        config.adaptiveThreshold = parseFloat(process.env.ADAPTIVE_THRESHOLD_USD || '500.0');
    }

    // Parse tiered multipliers if configured
    if (process.env.TIERED_MULTIPLIERS) {
        try {
            config.tieredMultipliers = parseTieredMultipliers(process.env.TIERED_MULTIPLIERS);
            console.log(`✓ Loaded ${config.tieredMultipliers.length} tiered multipliers`);
        } catch (error) {
            throw new Error(`Failed to parse TIERED_MULTIPLIERS: ${error instanceof Error ? error.message : String(error)}`);
        }
    } else if (process.env.TRADE_MULTIPLIER) {
        // Fall back to single multiplier if no tiers configured
        const singleMultiplier = parseFloat(process.env.TRADE_MULTIPLIER);
        if (singleMultiplier !== 1.0) {
            config.tradeMultiplier = singleMultiplier;
            console.log(`✓ Using single trade multiplier: ${singleMultiplier}x`);
        }
    }

    return config;
};

const rawUserAddresses = (process.env.USER_ADDRESSES || '').trim();
const USER_ADDRESSES_PARSED =
    rawUserAddresses.length === 0 ? [] : parseUserAddresses(rawUserAddresses);

if (!LEADERBOARD_ENABLED && USER_ADDRESSES_PARSED.length === 0) {
    throw new Error('USER_ADDRESSES is empty; set addresses or enable LEADERBOARD_ENABLED=true');
}

export const ENV = {
    LEADERBOARD_ENABLED,
    LEADERBOARD_CATEGORY: (process.env.LEADERBOARD_CATEGORY || 'OVERALL').toUpperCase(),
    LEADERBOARD_TIME_PERIOD: (process.env.LEADERBOARD_TIME_PERIOD || 'MONTH').toUpperCase(),
    LEADERBOARD_ORDER_BY: (process.env.LEADERBOARD_ORDER_BY || 'PNL').toUpperCase() as
        | 'PNL'
        | 'VOL',
    LEADERBOARD_LIMIT: Math.min(
        50,
        Math.max(
            1,
            parseInt(process.env.LEADERBOARD_TOP_N || process.env.LEADERBOARD_LIMIT || '10', 10)
        )
    ),
    LEADERBOARD_OFFSET: Math.min(
        1000,
        Math.max(0, parseInt(process.env.LEADERBOARD_OFFSET || '0', 10))
    ),
    LEADERBOARD_REFRESH_MINUTES: Math.max(
        0,
        parseInt(process.env.LEADERBOARD_REFRESH_MINUTES || '0', 10)
    ),
    LEADERBOARD_MAX_TOTAL_TRADERS: Math.min(
        200,
        Math.max(1, parseInt(process.env.LEADERBOARD_MAX_TOTAL_TRADERS || '25', 10))
    ),
    /** Fetch positions + activity to compute win rate / concentration / composite score. Default on. */
    LEADERBOARD_ENRICH_PROFILES: process.env.LEADERBOARD_ENRICH_PROFILES !== 'false',
    /** After enrichment, order copy targets by composite score instead of raw API order. Default on. */
    LEADERBOARD_USE_PROFILE_SCORE: process.env.LEADERBOARD_USE_PROFILE_SCORE !== 'false',
    LEADERBOARD_PROFILE_CONCURRENCY: Math.min(
        8,
        Math.max(1, parseInt(process.env.LEADERBOARD_PROFILE_CONCURRENCY || '4', 10))
    ),
    LEADERBOARD_ACTIVITY_SAMPLE_LIMIT: Math.min(
        500,
        Math.max(20, parseInt(process.env.LEADERBOARD_ACTIVITY_SAMPLE_LIMIT || '150', 10))
    ),
    /** If set (0–1), drop traders with computed win rate below this (unknown win rate kept). */
    LEADERBOARD_MIN_WIN_RATE: (() => {
        if (!LEADERBOARD_ENABLED) {
            return null as number | null;
        }
        const s = process.env.LEADERBOARD_MIN_WIN_RATE?.trim();
        if (!s) {
            return null as number | null;
        }
        const v = parseFloat(s);
        if (isNaN(v) || v < 0 || v > 1) {
            throw new Error('LEADERBOARD_MIN_WIN_RATE must be between 0 and 1');
        }
        return v;
    })(),
    USER_ADDRESSES: USER_ADDRESSES_PARSED,
    PROXY_WALLET: process.env.PROXY_WALLET as string,
    PRIVATE_KEY,
    CLOB_HTTP_URL: process.env.CLOB_HTTP_URL as string,
    CLOB_WS_URL: process.env.CLOB_WS_URL as string,
    FETCH_INTERVAL: parseInt(process.env.FETCH_INTERVAL || '1', 10),
    TOO_OLD_TIMESTAMP: parseInt(process.env.TOO_OLD_TIMESTAMP || '24', 10),
    RETRY_LIMIT: parseInt(process.env.RETRY_LIMIT || '3', 10),
    // Legacy parameters (kept for backward compatibility)
    TRADE_MULTIPLIER: parseFloat(process.env.TRADE_MULTIPLIER || '1.0'),
    COPY_PERCENTAGE: parseFloat(process.env.COPY_PERCENTAGE || '10.0'),
    // New copy strategy configuration
    COPY_STRATEGY_CONFIG: parseCopyStrategy(),
    // Network settings
    REQUEST_TIMEOUT_MS: parseInt(process.env.REQUEST_TIMEOUT_MS || '10000', 10),
    NETWORK_RETRY_LIMIT: parseInt(process.env.NETWORK_RETRY_LIMIT || '3', 10),
    // Trade aggregation settings
    TRADE_AGGREGATION_ENABLED: process.env.TRADE_AGGREGATION_ENABLED === 'true',
    TRADE_AGGREGATION_WINDOW_SECONDS: parseInt(
        process.env.TRADE_AGGREGATION_WINDOW_SECONDS || '300',
        10
    ), // 5 minutes default
    MONGO_URI: process.env.MONGO_URI as string,
    RPC_URL: process.env.RPC_URL as string,
    USDC_CONTRACT_ADDRESS: process.env.USDC_CONTRACT_ADDRESS as string,
};
