export interface DocumentCollection {
    _id: string;
    name: string;
    description?: string;
    color?: string;
    icon?: string;
    documentIds: string[];
    userId?: string;
    createdAt: Date;
    updatedAt: Date;
}
export interface DocumentCollectionCreateInput {
    name: string;
    description?: string;
    color?: string;
    icon?: string;
}
export interface DocumentCollectionUpdateInput {
    name?: string;
    description?: string;
    color?: string;
    icon?: string;
}
declare class DocumentCollectionApiService {
    private baseUrl;
    /**
     * Get all collections, optionally filtered by userId
     */
    getCollections(params?: {
        userId?: string;
    }): Promise<DocumentCollection[]>;
    /**
     * Get a specific collection by ID
     */
    getCollection(collectionId: string): Promise<DocumentCollection>;
    /**
     * Get all collections containing a specific document
     */
    getCollectionsForDocument(documentId: string): Promise<DocumentCollection[]>;
    /**
     * Create a new collection
     */
    createCollection(collectionData: DocumentCollectionCreateInput): Promise<DocumentCollection>;
    /**
     * Update a collection
     */
    updateCollection(collectionId: string, updates: DocumentCollectionUpdateInput): Promise<DocumentCollection>;
    /**
     * Delete a collection
     */
    deleteCollection(collectionId: string): Promise<void>;
    /**
     * Add a document to a collection
     */
    addDocumentToCollection(collectionId: string, documentId: string): Promise<void>;
    /**
     * Remove a document from a collection
     */
    removeDocumentFromCollection(collectionId: string, documentId: string): Promise<void>;
}
export declare const documentCollectionApiService: DocumentCollectionApiService;
export {};
