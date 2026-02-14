import { getDB } from '../config/database.js';
import { ObjectId, type UpdateFilter } from 'mongodb';
import { FileMetadata } from '../services/knowledgeBase/KnowledgeBaseManager.js';

const COLLECTION_NAME = 'knowledge_base_files';

export interface KnowledgeBaseFileDocument extends FileMetadata {
    _id?: ObjectId;
    graphNodeUrl?: string; // Link to navigation graph node
}

export class KnowledgeBaseFileModel {
    /**
     * Create or update file metadata
     */
    static async upsert(metadata: FileMetadata, graphNodeUrl?: string): Promise<KnowledgeBaseFileDocument> {
        const db = getDB();
        const now = new Date();

        const doc: KnowledgeBaseFileDocument = {
            ...metadata,
            graphNodeUrl,
            lastModified: metadata.lastModified || now,
            createdAt: metadata.createdAt || now
        };

        const update: UpdateFilter<KnowledgeBaseFileDocument> = {
            $set: doc
        };
        await db.collection<KnowledgeBaseFileDocument>(COLLECTION_NAME).updateOne(
            { url: metadata.url },
            update,
            { upsert: true }
        );

        const result = await db.collection<KnowledgeBaseFileDocument>(COLLECTION_NAME).findOne({ url: metadata.url });
        return result!;
    }

    /**
     * Find file metadata by URL
     */
    static async findByUrl(url: string): Promise<KnowledgeBaseFileDocument | null> {
        const db = getDB();
        return await db.collection<KnowledgeBaseFileDocument>(COLLECTION_NAME).findOne({ url });
    }

    /**
     * Find file metadata by file path
     */
    static async findByFilePath(filePath: string): Promise<KnowledgeBaseFileDocument | null> {
        const db = getDB();
        return await db.collection<KnowledgeBaseFileDocument>(COLLECTION_NAME).findOne({ filePath });
    }

    /**
     * Find all files linked to a graph node
     */
    static async findByGraphNode(graphNodeUrl: string): Promise<KnowledgeBaseFileDocument[]> {
        const db = getDB();
        
        // Limit to prevent memory exhaustion when loading files for a graph node
        // Default limit: 1000 files, configurable via environment variable
        const MAX_KNOWLEDGE_BASE_FILES = parseInt(process.env.MAX_KNOWLEDGE_BASE_FILES || '1000', 10);
        
        const files = await db.collection<KnowledgeBaseFileDocument>(COLLECTION_NAME)
            .find({ graphNodeUrl })
            .limit(MAX_KNOWLEDGE_BASE_FILES)
            .toArray();
        
        if (files.length === MAX_KNOWLEDGE_BASE_FILES) {
            console.warn(
                `[KnowledgeBaseFile] findByGraphNode() query may have been truncated at ${MAX_KNOWLEDGE_BASE_FILES} entries. ` +
                `Consider increasing MAX_KNOWLEDGE_BASE_FILES.`
            );
        }
        
        return files;
    }

    /**
     * Delete file metadata
     */
    static async deleteByUrl(url: string): Promise<boolean> {
        const db = getDB();
        const result = await db.collection<KnowledgeBaseFileDocument>(COLLECTION_NAME).deleteOne({ url });
        return result.deletedCount > 0;
    }
}






























