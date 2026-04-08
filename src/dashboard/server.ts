import 'dotenv/config';
import express from 'express';
import path from 'path';
import mongoose from 'mongoose';
import { LeaderboardTraderTrackingModel } from '../models/leaderboardTraderTracking';

const PORT = parseInt(process.env.DASHBOARD_PORT || '3847', 10);
const HOST = process.env.DASHBOARD_HOST || '127.0.0.1';

function normalizeAddress(raw: string): string | null {
    let a = raw.trim().toLowerCase();
    if (!a.startsWith('0x')) {
        a = `0x${a}`;
    }
    return /^0x[a-f0-9]{40}$/.test(a) ? a : null;
}

async function main(): Promise<void> {
    const mongoUri = process.env.MONGO_URI;
    if (!mongoUri) {
        console.error('MONGO_URI is required to run the dashboard.');
        process.exit(1);
    }

    await mongoose.connect(mongoUri);
    console.log('Dashboard: MongoDB connected');

    const app = express();
    app.disable('x-powered-by');

    app.get('/api/summary', async (_req, res) => {
        try {
            const docs = await LeaderboardTraderTrackingModel.find().lean().exec();
            const tierCounts: Record<string, number> = {};
            const tagCounts: Record<string, number> = {};
            let scoreSum = 0;
            let scoreN = 0;
            let wrSum = 0;
            let wrN = 0;

            for (const d of docs) {
                const tier = d.trackingTier || 'unknown';
                tierCounts[tier] = (tierCounts[tier] || 0) + 1;
                for (const t of d.currentTags || []) {
                    tagCounts[t] = (tagCounts[t] || 0) + 1;
                }
                const lm = d.latestMetrics as Record<string, unknown> | undefined;
                if (lm && typeof lm.compositeScore === 'number') {
                    scoreSum += lm.compositeScore;
                    scoreN += 1;
                }
                if (lm && typeof lm.winRate === 'number') {
                    wrSum += lm.winRate;
                    wrN += 1;
                }
            }

            const topTags = Object.entries(tagCounts)
                .sort((a, b) => b[1] - a[1])
                .slice(0, 24)
                .map(([tag, count]) => ({ tag, count }));

            res.json({
                total: docs.length,
                tierCounts,
                topTags,
                avgCompositeScore: scoreN ? Math.round((scoreSum / scoreN) * 10) / 10 : null,
                avgWinRate: wrN ? Math.round((wrN > 0 ? wrSum / wrN : 0) * 1000) / 1000 : null,
                generatedAt: new Date().toISOString(),
            });
        } catch (e) {
            res.status(500).json({
                error: e instanceof Error ? e.message : String(e),
            });
        }
    });

    app.get('/api/traders', async (req, res) => {
        try {
            const limit = Math.min(
                200,
                Math.max(1, parseInt(String(req.query.limit || '100'), 10) || 100)
            );
            const rows = await LeaderboardTraderTrackingModel.find()
                .sort({ lastRecordedAt: -1 })
                .limit(limit)
                .lean()
                .exec();
            res.json({ traders: rows });
        } catch (e) {
            res.status(500).json({
                error: e instanceof Error ? e.message : String(e),
            });
        }
    });

    app.get('/api/traders/:address', async (req, res) => {
        try {
            const a = normalizeAddress(req.params.address);
            if (!a) {
                res.status(400).json({ error: 'Invalid address' });
                return;
            }
            const doc = await LeaderboardTraderTrackingModel.findOne({ address: a }).lean().exec();
            if (!doc) {
                res.status(404).json({ error: 'Not found' });
                return;
            }
            res.json(doc);
        } catch (e) {
            res.status(500).json({
                error: e instanceof Error ? e.message : String(e),
            });
        }
    });

    const staticDir = path.join(__dirname, 'static');
    const indexHtml = path.join(staticDir, 'index.html');
    app.use(express.static(staticDir));
    // Express 5 / path-to-regexp v8 rejects app.get('*', ...); use middleware for SPA fallback.
    app.use((req, res, next) => {
        if (req.method !== 'GET' && req.method !== 'HEAD') {
            next();
            return;
        }
        if (req.path.startsWith('/api')) {
            next();
            return;
        }
        res.sendFile(indexHtml);
    });

    app.listen(PORT, HOST, () => {
        console.log(`\n  Bot dashboard → http://${HOST === '0.0.0.0' ? 'localhost' : HOST}:${PORT}\n`);
    });
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
