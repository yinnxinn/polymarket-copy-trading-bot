import * as dotenv from 'dotenv';
dotenv.config();

import connectDB, { closeDB } from '../config/db';
import { LeaderboardTraderTrackingModel } from '../models/leaderboardTraderTracking';

const main = async () => {
    await connectDB();
    const rows = await LeaderboardTraderTrackingModel.find()
        .sort({ lastRecordedAt: -1 })
        .limit(80)
        .lean()
        .exec();

    console.log(`\nLeaderboard trader tracking (${rows.length} docs, newest first)\n`);
    console.log('─'.repeat(100));

    for (const r of rows) {
        console.log(
            `\n${r.address}  tier=${r.trackingTier}  tags=[${(r.currentTags || []).join(', ')}]`
        );
        console.log(`  last: ${r.lastRecordedAt?.toISOString?.() || r.lastRecordedAt}  (${r.lastSource})`);
        const snaps = r.snapshots?.length ?? 0;
        console.log(`  snapshots stored: ${snaps}`);
        if (snaps > 0) {
            const last = r.snapshots[snaps - 1];
            console.log(
                `  latest snapshot: winRate=${last.winRate ?? 'n/a'} score=${last.compositeScore} rank=${last.lbRank}`
            );
        }
    }

    console.log('\n' + '─'.repeat(100));
    console.log('\nQuery examples (mongosh):');
    console.log(
        '  db.leaderboardtradertrackings.find({ currentTags: "winrate_elite" }).pretty()'
    );
    console.log(
        '  db.leaderboardtradertrackings.find({ trackingTier: "high" }).sort({ lastRecordedAt: -1 })\n'
    );

    await closeDB();
};

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
