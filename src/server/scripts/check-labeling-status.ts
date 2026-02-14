#!/usr/bin/env tsx
/**
 * Quick script to check labeling status
 */

import dotenv from 'dotenv';
import path from 'path';
import { connectNeo4j } from '../config/neo4j.js';
import { SemanticLabelingService } from '../services/semantic/SemanticLabelingService.js';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

async function checkStatus() {
    const driver = await connectNeo4j();
    const session = driver.session();
    
    try {
        // Count labeled clusters
        const labeledResult = await session.run(`
            MATCH (c:Cluster)
            WHERE c.label IS NOT NULL
            RETURN count(c) AS count
        `);
        const labeled = labeledResult.records[0].get('count').toNumber();
        
        // Count total communities
        const totalResult = await session.run(`
            MATCH (e:Entity)
            WHERE e.communityId IS NOT NULL
            WITH DISTINCT e.communityId AS id
            RETURN count(id) AS count
        `);
        const total = totalResult.records[0].get('count').toNumber();
        
        // Get usage stats
        const labelingService = new SemanticLabelingService();
        const usage = labelingService.getUsageStats();
        
        console.log('\n📊 Labeling Status\n');
        console.log(`   Labeled: ${labeled}/${total} clusters (${((labeled/total)*100).toFixed(1)}%)`);
        console.log(`   Remaining: ${total - labeled} clusters`);
        console.log(`\n💰 Usage:`);
        console.log(`   Tokens: ${usage.tokensUsed.toLocaleString()}`);
        console.log(`   Cost: €${usage.costEUR.toFixed(4)}`);
        console.log(`   Remaining: €${usage.budgetRemainingEUR.toFixed(2)}`);
        
        if (labeled < total) {
            const remaining = total - labeled;
            const batches = Math.ceil(remaining / 5);
            const estimatedMinutes = Math.ceil(batches * 3.5 / 60);
            console.log(`\n⏱️  ETA:`);
            console.log(`   ~${batches} batches remaining`);
            console.log(`   ~${estimatedMinutes} minutes`);
        } else {
            console.log(`\n✅ All clusters labeled!`);
        }
    } catch (error) {
        console.error('Error:', error);
        process.exit(1);
    } finally {
        // Ensure session and driver are always closed
        try {
            await session.close();
        } catch (error) {
            console.error('Error closing session:', error);
        }
        try {
            await driver.close();
        } catch (error) {
            console.error('Error closing driver:', error);
        }
    }
}

checkStatus();

