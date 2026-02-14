import { getDB } from '../config/database.js';
import { ObjectId } from 'mongodb';
import { DocumentComparison } from '../services/comparison/types.js';

const COLLECTION_NAME = 'comparisons';

export interface ComparisonDocument extends DocumentComparison {
    _id?: ObjectId;
    createdAt: Date;
}

export class ComparisonModel {
    static async create(comparison: DocumentComparison): Promise<ComparisonDocument> {
        const db = getDB();
        const doc: ComparisonDocument = {
            ...comparison,
            createdAt: new Date(),
        };
        const result = await db.collection<ComparisonDocument>(COLLECTION_NAME).insertOne(doc);
        return { ...doc, _id: result.insertedId };
    }

    static async findById(comparisonId: string): Promise<ComparisonDocument | null> {
        const db = getDB();
        return await db.collection<ComparisonDocument>(COLLECTION_NAME).findOne({ comparisonId });
    }
}
