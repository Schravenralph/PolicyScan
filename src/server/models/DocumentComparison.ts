import { getDB } from '../config/database.js';
import { ObjectId } from 'mongodb';
import type {
    DocumentComparison,
    MatchedConcept,
    DocumentDifference,
    ComparisonSummary,
    ComparisonMetadata
} from '../services/comparison/types.js';

const COLLECTION_NAME = 'document_comparisons';

export interface ComparisonDocument {
    _id?: ObjectId;
    comparisonId: string;
    documentAId: string;
    documentBId: string;
    matchedConcepts: MatchedConcept[];
    differences: DocumentDifference[];
    summary: ComparisonSummary;
    confidence: number;
    metadata: ComparisonMetadata;
    createdAt: Date;
}

export class ComparisonModel {
    /**
     * Create a new comparison
     */
    static async create(comparison: DocumentComparison): Promise<ComparisonDocument> {
        const db = getDB();
        const doc: ComparisonDocument = {
            comparisonId: comparison.comparisonId,
            documentAId: comparison.documentA._id.toString(),
            documentBId: comparison.documentB._id.toString(),
            matchedConcepts: comparison.matchedConcepts,
            differences: comparison.differences,
            summary: comparison.summary,
            confidence: comparison.confidence,
            metadata: comparison.metadata,
            createdAt: new Date()
        };

        await db.collection<ComparisonDocument>(COLLECTION_NAME).insertOne(doc);
        return doc;
    }

    /**
     * Find comparison by ID
     */
    static async findByComparisonId(comparisonId: string): Promise<ComparisonDocument | null> {
        const db = getDB();
        return await db.collection<ComparisonDocument>(COLLECTION_NAME).findOne({ comparisonId });
    }
}
