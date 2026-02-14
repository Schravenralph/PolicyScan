import { pipeline, FeatureExtractionPipeline } from '@xenova/transformers';
import fs from 'fs/promises';
import path from 'path';
import { logger } from '../utils/logger.js';
import { getEnv } from '../config/env.js';

export interface EmbeddingProvider {
    generateEmbedding(text: string): Promise<number[]>;
    generateEmbeddings(texts: string[]): Promise<number[][]>;
}

export interface VectorDocument {
    id: string;
    vector: number[];
    content: string;
    metadata: Record<string, unknown>;
}

/**
 * Supported embedding models with quality and performance characteristics
 */
export interface EmbeddingModel {
    name: string;
    dimensions: number;
    maxLength: number;
    quality: 'basic' | 'good' | 'excellent';
    dutchSupport: 'basic' | 'good' | 'excellent';
    speed: 'fast' | 'medium' | 'slow';
    description: string;
}

/**
 * Pre-configured embedding models
 */
export const EMBEDDING_MODELS: Record<string, EmbeddingModel> = {
    'Xenova/all-MiniLM-L6-v2': {
        name: 'Xenova/all-MiniLM-L6-v2',
        dimensions: 384,
        maxLength: 512,
        quality: 'good',
        dutchSupport: 'good',
        speed: 'fast',
        description: 'Fast, efficient model with good Dutch support (default)'
    },
    'Xenova/multilingual-e5-base': {
        name: 'Xenova/multilingual-e5-base',
        dimensions: 768,
        maxLength: 512,
        quality: 'excellent',
        dutchSupport: 'excellent',
        speed: 'medium',
        description: 'High-quality multilingual model with excellent Dutch support'
    },
    'Xenova/paraphrase-multilingual-MiniLM-L12-v2': {
        name: 'Xenova/paraphrase-multilingual-MiniLM-L12-v2',
        dimensions: 384,
        maxLength: 512,
        quality: 'good',
        dutchSupport: 'excellent',
        speed: 'fast',
        description: 'Optimized for multilingual paraphrase detection, excellent Dutch support'
    },
    'Xenova/e5-small-v2': {
        name: 'Xenova/e5-small-v2',
        dimensions: 384,
        maxLength: 512,
        quality: 'excellent',
        dutchSupport: 'excellent',
        speed: 'fast',
        description: 'Small but high-quality model with excellent Dutch support'
    }
};

export class LocalEmbeddingProvider implements EmbeddingProvider {
    private pipe: FeatureExtractionPipeline | null = null;
    private modelName: string;
    private modelInfo: EmbeddingModel;
    private device: 'cpu' | 'gpu' | 'webgpu';
    private useGPU: boolean;

    constructor(modelName?: string) {
        // Allow model selection via environment variable or parameter
        const { VECTOR_SERVICE_MODEL, VECTOR_SERVICE_USE_GPU } = getEnv();
        this.modelName = modelName || VECTOR_SERVICE_MODEL || 'Xenova/all-MiniLM-L6-v2';
        
        // Validate model is supported
        if (!EMBEDDING_MODELS[this.modelName]) {
            logger.warn(
                `[VectorService] Model ${this.modelName} not in predefined list, using anyway. ` +
                `Supported models: ${Object.keys(EMBEDDING_MODELS).join(', ')}`
            );
            // Create a basic model info for unknown models
            this.modelInfo = {
                name: this.modelName,
                dimensions: 384, // Default assumption
                maxLength: 512,
                quality: 'good',
                dutchSupport: 'good',
                speed: 'medium',
                description: 'Custom model (not in predefined list)'
            };
        } else {
            this.modelInfo = EMBEDDING_MODELS[this.modelName];
        }
        
        // Check if GPU should be used (via environment variable)
        this.useGPU = VECTOR_SERVICE_USE_GPU;
        // Detect available device
        this.device = this.detectDevice();
        
        logger.info(`[VectorService] Using model: ${this.modelName} (${this.modelInfo.description})`);
    }

    /**
     * Detect available device (GPU or CPU)
     * Falls back to CPU if GPU is not available
     */
    private detectDevice(): 'cpu' | 'gpu' | 'webgpu' {
        const { VECTOR_SERVICE_DEVICE, VECTOR_SERVICE_USE_GPU } = getEnv();

        // Check environment variable first
        if (VECTOR_SERVICE_DEVICE) {
            return VECTOR_SERVICE_DEVICE;
        }

        // Try to detect GPU availability
        // Note: @xenova/transformers in Node.js primarily uses CPU
        // WebGPU support requires browser environment or specific Node.js setup
        // For now, we'll use CPU as default and allow configuration via env vars
        if (VECTOR_SERVICE_USE_GPU) {
            // In a browser environment, WebGPU might be available
            // In Node.js, this would require additional setup (e.g., ONNX Runtime with GPU)
            // For now, we'll attempt GPU but fall back to CPU if not available
            try {
                // Check if WebGPU is available (browser environment)
                if (typeof globalThis !== 'undefined' && 'gpu' in globalThis) {
                    return 'webgpu';
                }
                // For Node.js, GPU support would require ONNX Runtime with GPU backend
                // This is complex and platform-specific, so we default to CPU
                // Users can configure via VECTOR_SERVICE_DEVICE if they have GPU setup
                return 'cpu';
            } catch {
                return 'cpu';
            }
        }

        return 'cpu';
    }

    async init() {
        if (!this.pipe) {
            const deviceInfo = this.device === 'cpu' ? 'CPU' : this.device.toUpperCase();
            logger.info(`[VectorService] Loading model ${this.modelName} on ${deviceInfo}...`);
            
            try {
                // Configure pipeline with device option
                // Note: @xenova/transformers may not support all device options in Node.js
                // The library will automatically fall back to CPU if GPU is not available
                // Note: PretrainedOptions doesn't officially support device, but we pass it anyway
                // The transformers library will handle it internally
                const pipelineOptions: { device?: 'cpu' | 'gpu' | 'webgpu' } & Record<string, unknown> = {};

                // Only set device if explicitly configured (to avoid errors)
                if (this.useGPU && this.device !== 'cpu') {
                    pipelineOptions.device = this.device;
                }

                this.pipe = await pipeline('feature-extraction', this.modelName, pipelineOptions as any);
                logger.info(`[VectorService] Model loaded on ${deviceInfo}.`);
            } catch (error) {
                // Fallback to CPU if GPU initialization fails
                if (this.device !== 'cpu') {
                    logger.warn({ err: error }, `[VectorService] Failed to initialize ${this.device}, falling back to CPU`);
                    this.device = 'cpu';
                    this.pipe = await pipeline('feature-extraction', this.modelName);
                    logger.info('[VectorService] Model loaded on CPU (fallback).');
                } else {
                    throw error;
                }
            }
        }
    }

    /**
     * Get the current device being used
     */
    getDevice(): 'cpu' | 'gpu' | 'webgpu' {
        return this.device;
    }

    /**
     * Check if GPU is being used
     */
    isUsingGPU(): boolean {
        return this.device !== 'cpu';
    }

    /**
     * Get current model information
     */
    getModelInfo(): EmbeddingModel {
        return { ...this.modelInfo };
    }

    /**
     * Get current model name
     */
    getModelName(): string {
        return this.modelName;
    }

    /**
     * List all available models
     */
    static getAvailableModels(): EmbeddingModel[] {
        return Object.values(EMBEDDING_MODELS);
    }

    async generateEmbedding(text: string): Promise<number[]> {
        if (!this.pipe) {
            await this.init();
        }

        // Double-check pipe is initialized after init
        if (!this.pipe) {
            throw new Error('Failed to initialize embedding pipeline: pipe is not available after initialization');
        }

        // Ensure pipe has the expected method
        if (typeof this.pipe !== 'function' && typeof (this.pipe as any)?.pipe !== 'function') {
            throw new Error('Embedding pipeline is not properly initialized: pipe is not a function');
        }

        try {
            // Generate embedding
            // Note: In test environments, skip pooling options to avoid tensor type issues with @xenova/transformers
            // The library has a known issue with Float32Array type checking in some Node.js environments
            const isTestEnv = process.env.NODE_ENV === 'test' || process.env.JEST_WORKER_ID !== undefined;
            let output: unknown;
            
            if (isTestEnv) {
                // In test environment, skip pooling options to avoid tensor type errors
                // We'll handle pooling manually if needed
                const rawOutput = await this.pipe(text);
                        
                // Handle raw tensor output - extract the actual tensor data
                if (rawOutput && typeof rawOutput === 'object') {
                    // The output might be a nested structure with the actual tensor
                    // Try to find the tensor data in various possible locations
                    let tensorData: unknown = null;

                    const rawObj = rawOutput as unknown as Record<string, unknown>;
                    if ('data' in rawObj) {
                        tensorData = rawObj.data;
                    } else if (Array.isArray(rawOutput)) {
                        // Output might be directly an array of tensors
                        const firstElement = rawOutput[0] as Record<string, unknown> | undefined;
                        tensorData = firstElement?.data || rawOutput;
                    } else if ('shape' in rawObj) {
                        // It's a tensor object, try to get data
                        tensorData = rawObj.data;
                    }

                    if (tensorData) {
                        // Try to get dimensions
                        let dimensions: number[] = [];
                        if ('dims' in rawObj && Array.isArray(rawObj.dims)) {
                            dimensions = rawObj.dims as number[];
                        } else if ('shape' in rawObj && Array.isArray(rawObj.shape)) {
                            dimensions = rawObj.shape as number[];
                        }

                        // Perform mean pooling manually if we have a 2D tensor
                        if (Array.isArray(tensorData) && tensorData.length > 0 && Array.isArray(tensorData[0])) {
                            // 2D array: [batch_size, sequence_length, hidden_size] or [sequence_length, hidden_size]
                            const dims = tensorData[0].length;
                            
                            // Guard against empty inner arrays (would cause zero vectors → NaN in cosine similarity)
                            if (dims === 0) {
                                throw new Error('Empty tensor data: inner array has zero length');
                            }
                            
                            const meanPooled = new Array(dims).fill(0);
                            let count = 0;
                            
                            for (const row of tensorData) {
                                if (Array.isArray(row) && row.length === dims) {
                                    for (let i = 0; i < dims; i++) {
                                        meanPooled[i] += row[i];
                                    }
                                    count++;
                                }
                            }
                            
                            if (count > 0) {
                                for (let i = 0; i < dims; i++) {
                                    meanPooled[i] /= count;
                                }
                            }

                            // Normalize
                            const norm = Math.sqrt(meanPooled.reduce((sum, val) => sum + val * val, 0));
                            if (norm > 0) {
                                for (let i = 0; i < dims; i++) {
                                    meanPooled[i] /= norm;
                                }
                            }

                            output = { data: meanPooled };
                        } else if ((tensorData instanceof Float32Array || Array.isArray(tensorData)) && dimensions.length >= 2) {
                            // Handle flat array with dimensions (e.g. from TypedArray)
                            // Expected dims: [1, sequence_length, hidden_size] or [sequence_length, hidden_size]
                            const hiddenSize = dimensions[dimensions.length - 1];
                            const sequenceLength = dimensions.length === 3 ? dimensions[1] : dimensions[0];

                            const dataArray = tensorData as number[] | Float32Array;

                            // Guard against empty data (would cause zero vectors → NaN in cosine similarity)
                            if (dataArray.length === 0) {
                                throw new Error('Empty tensor data: flat array has zero length');
                            }
                            
                            // Guard against zero dimensions (would cause zero vectors → NaN in cosine similarity)
                            if (hiddenSize === 0 || sequenceLength === 0) {
                                throw new Error(`Invalid tensor dimensions: sequenceLength=${sequenceLength}, hiddenSize=${hiddenSize}`);
                            }

                            // Only proceed if data length matches expected size
                            if (dataArray.length >= sequenceLength * hiddenSize) {
                                const meanPooled = new Array(hiddenSize).fill(0);

                                for (let i = 0; i < sequenceLength; i++) {
                                    for (let j = 0; j < hiddenSize; j++) {
                                        const idx = i * hiddenSize + j;
                                        meanPooled[j] += dataArray[idx];
                                    }
                                }

                                // Average
                                for (let j = 0; j < hiddenSize; j++) {
                                    meanPooled[j] /= sequenceLength;
                                }

                                // Normalize
                                const norm = Math.sqrt(meanPooled.reduce((sum, val) => sum + val * val, 0));
                                if (norm > 0) {
                                    for (let i = 0; i < hiddenSize; i++) {
                                        meanPooled[i] /= norm;
                                    }
                                }

                                output = { data: meanPooled };
                            } else {
                                output = { data: tensorData };
                            }
                        } else {
                            // Already 1D, just use it
                            output = { data: tensorData };
                        }
                    } else {
                        output = rawOutput;
                    }
                } else {
                    output = rawOutput;
                }
            } else {
                // In production, try with pooling options first (better embeddings)
                try {
                    output = await this.pipe(text, { pooling: 'mean', normalize: true });
                } catch (poolingError) {
                    // If pooling fails, fall back to raw output
                    const errorMsg = poolingError instanceof Error ? poolingError.message : String(poolingError);
                    if (errorMsg.includes('Float32Array') || errorMsg.includes('tensor')) {
                        // Known tensor type issue, use fallback
                        const rawOutput = await this.pipe(text);
                        // Handle raw output (same as test path above)
                        if (rawOutput && typeof rawOutput === 'object' && 'data' in rawOutput) {
                            output = rawOutput;
                        } else {
                            output = { data: rawOutput };
                        }
                    } else {
                        // Different error, re-throw
                        throw poolingError;
                    }
                }
            }

            // Convert Tensor to standard array
            // @xenova/transformers returns a Tensor object with a .data property
            // The .data property is a TypedArray (Float32Array) that needs proper conversion
            let embeddingArray: number[];
            
            if (output && typeof output === 'object') {
                // Check if output is a Tensor-like object with .data property
                const outputObj = output as Record<string, unknown>;
                if ('data' in outputObj) {
                    const tensorData = outputObj.data;
                    
                    // Handle Float32Array - ensure proper conversion
                    if (tensorData instanceof Float32Array) {
                        // Create a new regular array from Float32Array
                        embeddingArray = Array.from(tensorData);
                    }
                    // Handle regular array
                    else if (Array.isArray(tensorData)) {
                        embeddingArray = [...tensorData];
                    }
                    // Handle TypedArray (Int32Array, etc.) - convert to regular array
                    else if (tensorData && typeof tensorData === 'object' && tensorData !== null && 'length' in tensorData) {
                        const typedArrayLike = tensorData as { length: number; [index: number]: number };
                        // Try to convert typed array to regular array
                        try {
                            embeddingArray = Array.from(tensorData as ArrayLike<number>);
                        } catch {
                            // Manual conversion as fallback
                            const length = typedArrayLike.length;
                            embeddingArray = new Array(length);
                            for (let i = 0; i < length; i++) {
                                embeddingArray[i] = typedArrayLike[i] ?? 0;
                            }
                        }
                    }
                    else {
                        throw new Error(`Unexpected tensor data type: ${typeof tensorData}, constructor: ${tensorData?.constructor?.name || 'unknown'}`);
                    }
                } 
                // Output might be directly an array (unlikely but handle it)
                else if (Array.isArray(output)) {
                    embeddingArray = output;
                }
                // Output might be directly a Float32Array
                else if (output instanceof Float32Array) {
                    embeddingArray = Array.from(output);
                }
                else {
                    // Try to access as tensor with tolist() method if available
                    const outputWithTolist = output as { tolist?: () => number[] };
                    if (typeof outputWithTolist.tolist === 'function') {
                        embeddingArray = outputWithTolist.tolist();
                    } else {
                        const keys = typeof output === 'object' && output !== null ? Object.keys(output) : [];
                        throw new Error(`Cannot extract embedding from output type: ${typeof output}, keys: ${keys.join(', ')}`);
                    }
                }
            } else {
                throw new Error(`Unexpected output type from transformer: ${typeof output}`);
            }

            // Validate the embedding array
            if (!Array.isArray(embeddingArray) || embeddingArray.length === 0) {
                throw new Error(`Generated embedding is empty or invalid. Length: ${embeddingArray?.length || 0}`);
            }

            // Ensure all values are numbers and handle any NaN/Infinity values
            embeddingArray = embeddingArray.map(v => {
                const num = typeof v === 'number' ? v : parseFloat(String(v));
                if (!isFinite(num)) {
                    return 0; // Replace NaN/Infinity with 0
                }
                return num;
            });

            return embeddingArray;
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            logger.error({ err: error }, `[VectorService] Embedding generation error for text "${text.substring(0, 50)}..."`);
            throw new Error(`Failed to generate embedding: ${errorMessage}`);
        }
    }

    async generateEmbeddings(texts: string[]): Promise<number[][]> {
        if (!texts || texts.length === 0) {
            return [];
        }

        if (!this.pipe) {
            await this.init();
        }

        if (!this.pipe) {
             throw new Error('Failed to initialize embedding pipeline');
        }

        try {
            let output: any;
            try {
                // In production/normal mode, use batch pooling
                output = await this.pipe(texts, { pooling: 'mean', normalize: true });
            } catch (e) {
                 logger.warn({ err: e }, '[VectorService] Batch pooling failed, falling back to sequential processing');
                 return Promise.all(texts.map(t => this.generateEmbedding(t)));
            }

            // Extract data
            if (!output || !output.data) {
                 return Promise.all(texts.map(t => this.generateEmbedding(t)));
            }

            const data = output.data;
            let dims = output.dims || output.shape;

            if (!dims || dims.length < 2) {
                 // Try to infer dimensions from the data length and batch size
                 // Assuming output.data is flat array of (batchSize * embeddingDim)
                 const totalLength = data.length;
                 const batchSize = texts.length;
                 if (totalLength % batchSize === 0) {
                    const embeddingDim = totalLength / batchSize;
                    dims = [batchSize, embeddingDim];
                 } else {
                    return Promise.all(texts.map(t => this.generateEmbedding(t)));
                 }
            }

            const batchSize = dims[0];
            const embeddingDim = dims[1];

            if (batchSize !== texts.length) {
                 return Promise.all(texts.map(t => this.generateEmbedding(t)));
            }

            const embeddings: number[][] = [];
            // Handle different data types for slice
            const isTypedArray = ArrayBuffer.isView(data);

            for (let i = 0; i < batchSize; i++) {
                const start = i * embeddingDim;
                const end = start + embeddingDim;

                let vector: number[];
                if (isTypedArray) {
                    // ArrayBufferView doesn't have slice, convert to array first
                    // Handle different typed array types by iterating
                    const arrayData: number[] = [];
                    const typedArray = data as unknown as ArrayLike<number>;
                    for (let j = 0; j < typedArray.length; j++) {
                        arrayData.push(Number(typedArray[j]));
                    }
                    vector = arrayData.slice(start, end);
                } else if (Array.isArray(data)) {
                    vector = data.slice(start, end);
                } else {
                    // Fallback
                     return Promise.all(texts.map(t => this.generateEmbedding(t)));
                }

                // Validate and sanitize
                 vector = vector.map(v => {
                    const num = typeof v === 'number' ? v : parseFloat(String(v));
                    return isFinite(num) ? num : 0;
                });

                embeddings.push(vector);
            }

            return embeddings;
        } catch (error) {
            logger.error({ err: error }, '[VectorService] Batch embedding generation failed');
            // Final fallback
            return Promise.all(texts.map(t => this.generateEmbedding(t)));
        }
    }
}

export class VectorStore {
    private documents: Map<string, VectorDocument> = new Map();
    private storagePath: string;

    constructor(storagePath: string) {
        this.storagePath = storagePath;
    }

    async load() {
        try {
            const data = await fs.readFile(this.storagePath, 'utf-8');
            const docs: VectorDocument[] = JSON.parse(data);
            this.documents.clear();
            docs.forEach(doc => this.documents.set(doc.id, doc));
            logger.info(`[VectorStore] Loaded ${this.documents.size} documents from ${this.storagePath}`);
        } catch (_error) {
            // If file doesn't exist, start empty
            logger.info('[VectorStore] No existing store found, starting empty.');
        }
    }

    async save() {
        const docs = Array.from(this.documents.values());
        await fs.mkdir(path.dirname(this.storagePath), { recursive: true });
        await fs.writeFile(this.storagePath, JSON.stringify(docs, null, 2));
        logger.info(`[VectorStore] Saved ${docs.length} documents to ${this.storagePath}`);
    }

    addDocument(doc: VectorDocument) {
        this.documents.set(doc.id, doc);
    }

    getDocument(id: string): VectorDocument | undefined {
        return this.documents.get(id);
    }

    /**
     * Calculate cosine similarity between two vectors
     * Returns 0 for zero vectors to avoid NaN (rather than throwing an error)
     */
    private cosineSimilarity(a: number[], b: number[]): number {
        // Guard against empty vectors
        if (a.length === 0 || b.length === 0 || a.length !== b.length) {
            return 0;
        }

        let dotProduct = 0;
        let normA = 0;
        let normB = 0;

        for (let i = 0; i < a.length; i++) {
            dotProduct += a[i] * b[i];
            normA += a[i] * a[i];
            normB += b[i] * b[i];
        }

        // Guard against zero norms to avoid NaN/Infinity
        const denominator = Math.sqrt(normA) * Math.sqrt(normB);
        if (denominator === 0 || !isFinite(denominator)) {
            return 0;
        }

        const result = dotProduct / denominator;
        return isNaN(result) || !isFinite(result) ? 0 : result;
    }

    search(queryVector: number[], limit: number = 5): { document: VectorDocument; score: number }[] {
        const results = Array.from(this.documents.values()).map(doc => ({
            document: doc,
            score: this.cosineSimilarity(queryVector, doc.vector)
        }));

        // Sort by score descending
        return results
            .sort((a, b) => b.score - a.score)
            .slice(0, limit);
    }
}

export class VectorService {
    private provider: EmbeddingProvider;
    private store: VectorStore;

    constructor(storagePath?: string) {
        this.provider = new LocalEmbeddingProvider();
        const defaultPath = path.join(process.cwd(), 'data', 'vector_store.json');
        this.store = new VectorStore(storagePath || defaultPath);
    }

    async init() {
        await this.store.load();
        // Provider init is lazy, but we can force it here if we want
    }

    async addDocument(id: string, content: string, metadata: Record<string, unknown> = {}) {
        const vector = await this.provider.generateEmbedding(content);
        const doc: VectorDocument = { id, vector, content, metadata };
        this.store.addDocument(doc);
    }

    async generateEmbedding(text: string): Promise<number[]> {
        return this.provider.generateEmbedding(text);
    }

    async generateEmbeddings(texts: string[]): Promise<number[][]> {
        return this.provider.generateEmbeddings(texts);
    }

    /**
     * Add a document with a pre-computed embedding
     * Useful when embedding has already been generated (e.g., for MongoDB persistence)
     * 
     * @param id - Document ID
     * @param content - Document content text
     * @param embedding - Pre-computed embedding vector
     * @param metadata - Document metadata
     */
    async addDocumentWithEmbedding(id: string, content: string, embedding: number[], metadata: Record<string, unknown> = {}) {
        const doc: VectorDocument = { id, vector: embedding, content, metadata };
        this.store.addDocument(doc);
    }

    async search(query: string, limit: number = 5) {
        const queryVector = await this.provider.generateEmbedding(query);
        return this.store.search(queryVector, limit);
    }

    async save() {
        await this.store.save();
    }
}
