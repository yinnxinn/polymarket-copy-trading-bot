import mongoose, { Schema, Document } from 'mongoose';

export interface IProfileSnapshot {
    recordedAt: Date;
    source: 'startup' | 'refresh';
    tags: string[];
    trackingTier: string;
    winRate: number | null;
    compositeScore: number;
    lbRank: string;
    lbPnl?: number;
    lbVol?: number;
    hhi: number;
    activityNotionalUsd: number;
    wins: number;
    losses: number;
    closedPositionCount: number;
    openPositionCount: number;
    lowSample: boolean;
    fetchError?: string;
}

export interface ILeaderboardTraderTracking extends Document {
    address: string;
    userName?: string;
    currentTags: string[];
    trackingTier: string;
    lastSource: 'startup' | 'refresh';
    lastRecordedAt: Date;
    latestMetrics: Record<string, unknown>;
    snapshots: IProfileSnapshot[];
    createdAt: Date;
    updatedAt: Date;
}

const snapshotSchema = new Schema(
    {
        recordedAt: { type: Date, required: true },
        source: { type: String, enum: ['startup', 'refresh'], required: true },
        tags: { type: [String], default: [] },
        trackingTier: { type: String, required: true },
        winRate: { type: Number, default: null },
        compositeScore: { type: Number, default: 0 },
        lbRank: { type: String, default: '' },
        lbPnl: { type: Number },
        lbVol: { type: Number },
        hhi: { type: Number, default: 0 },
        activityNotionalUsd: { type: Number, default: 0 },
        wins: { type: Number, default: 0 },
        losses: { type: Number, default: 0 },
        closedPositionCount: { type: Number, default: 0 },
        openPositionCount: { type: Number, default: 0 },
        lowSample: { type: Boolean, default: true },
        fetchError: { type: String },
    },
    { _id: true }
);

const leaderboardTraderTrackingSchema = new Schema(
    {
        address: {
            type: String,
            required: true,
            unique: true,
            lowercase: true,
            index: true,
        },
        userName: { type: String },
        currentTags: { type: [String], default: [] },
        trackingTier: { type: String, default: 'standard' },
        lastSource: { type: String, enum: ['startup', 'refresh'], required: true },
        lastRecordedAt: { type: Date, required: true },
        latestMetrics: { type: Schema.Types.Mixed, default: {} },
        snapshots: { type: [snapshotSchema], default: [] },
    },
    { timestamps: true }
);

const MODEL = 'LeaderboardTraderTracking';

export const LeaderboardTraderTrackingModel =
    (mongoose.models[MODEL] as mongoose.Model<ILeaderboardTraderTracking>) ||
    mongoose.model<ILeaderboardTraderTracking>(MODEL, leaderboardTraderTrackingSchema);
