import { ScraperOrchestrator } from '../services/scraping/scraperOrchestrator.js';
import { ScanParameters } from '../services/infrastructure/types.js';
import { ObjectId, type Db, type Collection } from 'mongodb';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';

// Load environment variables
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

async function main() {
    // Mock MongoDB Db object
    const mockCollection = {
        find: (() => ({
            sort: () => ({
                limit: () => ({
                    toArray: async () => []
                })
            }),
            toArray: async () => []
        })) as unknown as Collection<Document>['find'],
        findOne: (async () => null) as unknown as Collection<Document>['findOne'],
        insertOne: (async () => ({ insertedId: new ObjectId() })) as unknown as Collection<Document>['insertOne'],
        updateOne: (async () => ({ modifiedCount: 1 })) as unknown as Collection<Document>['updateOne']
    };
    
    const mockDb = {
        collection: ((_name: string) => mockCollection) as unknown as Db['collection']
    };

    try {
        console.log('Using Mocked MongoDB');

        const orchestrator = new ScraperOrchestrator(mockDb as Db);

        const params: ScanParameters = {
            queryId: new ObjectId(), // Mock ObjectId
            overheidslaag: 'gemeente',
            onderwerp: 'geluid',
            thema: 'geluid',
            mode: 'dev' // Enable Dev mode
        };

        console.log('🚀 Starting Scraper in DEV mode...');
        const result = await orchestrator.scan(params);

        console.log('✅ Scan completed!');
        console.log(`Found ${result.documents.length} documents`);

        // Check if graph file exists
        const graphPath = path.resolve(process.cwd(), 'scraper_graph.json');
        if (fs.existsSync(graphPath)) {
            console.log('✅ Graph file created at:', graphPath);
            const graphContent = fs.readFileSync(graphPath, 'utf-8');
            const graph = JSON.parse(graphContent);
            console.log(`📊 Graph contains ${Object.keys(graph.nodes).length} nodes`);
        } else {
            console.error('❌ Graph file NOT found!');
        }

    } catch (error) {
        console.error('Error:', error);
    }
}

main();
