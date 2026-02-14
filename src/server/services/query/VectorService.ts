import { pipeline, FeatureExtractionPipeline } from '@xenova/transformers';
import * as fs from 'fs/promises';
import { createReadStream, createWriteStream } from 'fs';
import * as readline from 'readline';
import * as path from 'path';
import { queryCache } from './QueryCache.js';
import { getEnv } from '../../config/env.js';

export interface EmbeddingProvider {
    generateEmbedding(text: string): Promise<number[]>;
    generateEmbeddings(texts: string[]): Promise<number[][]>;
    getModelName?(): string;
}

export interface VectorDocument {
    id: string;
    vector: number[];
    norm?: number;
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

/**
 * Pipeline options for @xenova/transformers
 */
interface PipelineOptions {
    device?: 'cpu' | 'gpu' | 'webgpu';
}

/**
 * Tensor output structure from @xenova/transformers
 */
interface TensorOutput {
    data: Float32Array | number[] | ArrayLike<number>;
    shape?: number[];
}

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
            console.warn(
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
        
        console.log(`[VectorService] Using model: ${this.modelName} (${this.modelInfo.description})`);
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
            console.log(`[VectorService] Loading model ${this.modelName} on ${deviceInfo}...`);
            
            try {
                // Configure pipeline with device option
                // Note: @xenova/transformers may not support all device options in Node.js
                // The library will automatically fall back to CPU if GPU is not available
                const pipelineOptions: PipelineOptions = {
                    device: this.device
                };

                // Only set device if explicitly configured (to avoid errors)
                if (this.useGPU && this.device !== 'cpu') {
                    pipelineOptions.device = this.device;
                }

                this.pipe = await pipeline('feature-extraction', this.modelName, pipelineOptions as any);
                console.log(`[VectorService] Model loaded on ${deviceInfo}.`);
            } catch (error) {
                // Fallback to CPU if GPU initialization fails
                if (this.device !== 'cpu') {
                    console.warn(`[VectorService] Failed to initialize ${this.device}, falling back to CPU:`, error);
                    this.device = 'cpu';
                    this.pipe = await pipeline('feature-extraction', this.modelName);
                    console.log('[VectorService] Model loaded on CPU (fallback).');
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
        // Check cache first
        const cacheKey = queryCache.generateKey({
            type: 'embedding',
            model: this.modelName,
            text
        });

        const cached = await queryCache.get<number[]>(cacheKey);
        if (cached) {
            return cached;
        }

        if (!this.pipe) {
            await this.init();
        }

        // Double-check pipe is initialized and is a function
        // In parallel test execution, pipe might not be properly initialized
        // Store the validated pipe function once to avoid race conditions
        let validatedPipe: ((text: string, options?: any) => Promise<any>) | null = null;
        
        // Retry initialization if needed (for race conditions in parallel test execution)
        let initRetries = 0;
        const maxInitRetries = 3;
        while (initRetries < maxInitRetries) {
            if (!this.pipe) {
                await this.init();
            }
            
            // Ensure pipe is callable (it should be a function)
            // In some cases, the pipeline might return an object instead of a function
            const pipeFunction = typeof this.pipe === 'function' ? this.pipe : (this.pipe as any)?.pipe;
            if (typeof pipeFunction === 'function') {
                validatedPipe = pipeFunction;
                break;
            }
            
            // Pipe is not a function, try to re-initialize
            initRetries++;
            if (initRetries < maxInitRetries) {
                this.pipe = null; // Reset to force re-initialization
                await new Promise(resolve => setTimeout(resolve, 50 * initRetries)); // Small delay
            }
        }
        
        // Final check - if still not a function, throw error
        if (!validatedPipe || typeof validatedPipe !== 'function') {
            throw new Error('Embedding pipeline is not properly initialized: pipe is not a function after retries');
        }
        
        // TypeScript now knows validatedPipe is a function after the check above
        const pipe = validatedPipe;

        try {
            // Generate embedding
            // Note: In test environments, skip pooling options to avoid tensor type issues with @xenova/transformers
            // The library has a known issue with Float32Array type checking in some Node.js environments
            const isTestEnv = process.env.NODE_ENV === 'test' || process.env.JEST_WORKER_ID !== undefined;
            let output: { data: number[] | unknown } | unknown;
            
            if (isTestEnv) {
                // In test environment, skip pooling options to avoid tensor type errors
                // We'll handle pooling manually if needed
                // Retry logic for race conditions in parallel test environments
                let rawOutput: unknown;
                let retries = 0;
                const maxRetries = 10;
                while (retries < maxRetries) {
                    // Use the validated pipe function (stored once to avoid race conditions)
                    rawOutput = await pipe(text);
                    if (rawOutput !== undefined) {
                        break;
                    }
                    retries++;
                    if (retries < maxRetries) {
                        // Wait longer before retrying (exponential backoff with longer delays)
                        await new Promise(resolve => setTimeout(resolve, 50 * retries));
                        // Note: We don't re-initialize here because validatedPipe is already set
                        // If it's consistently returning undefined, it's likely a model/library issue
                    }
                }
                
                // If still undefined after retries, throw error
                if (rawOutput === undefined) {
                    throw new Error('Transformer pipeline returned undefined after retries - possible race condition in parallel test execution');
                }
                        
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
                                // Perform mean pooling manually if we have a 2D tensor
                                if (Array.isArray(tensorData) && tensorData.length > 0 && Array.isArray(tensorData[0])) {
                                    // 2D array: [batch_size, sequence_length, hidden_size] or [sequence_length, hidden_size]
                                    const dimensions = tensorData[0].length;
                                    
                                    // Guard against empty inner arrays (would cause zero vectors → NaN in cosine similarity)
                                    if (dimensions === 0) {
                                        throw new Error('Empty tensor data: inner array has zero length');
                                    }
                                    
                                    const meanPooled = new Array(dimensions).fill(0);
                                    let count = 0;
                                    
                                    for (const row of tensorData) {
                                        if (Array.isArray(row) && row.length === dimensions) {
                                            for (let i = 0; i < dimensions; i++) {
                                                meanPooled[i] += row[i];
                                            }
                                            count++;
                                        }
                                    }
                                    
                                    if (count > 0) {
                                        for (let i = 0; i < dimensions; i++) {
                                            meanPooled[i] /= count;
                                        }
                                    }
                                    
                                    // Normalize
                                    const norm = Math.sqrt(meanPooled.reduce((sum, val) => sum + val * val, 0));
                                    if (norm > 0) {
                                        for (let i = 0; i < dimensions; i++) {
                                            meanPooled[i] /= norm;
                                        }
                                    }
                                    
                                    output = { data: meanPooled };
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
                // Use the validated pipe function (stored once to avoid race conditions)
                try {
                    output = await pipe(text, { pooling: 'mean', normalize: true });
                } catch (poolingError) {
                    // If pooling fails, fall back to raw output
                    const errorMsg = poolingError instanceof Error ? poolingError.message : String(poolingError);
                    if (errorMsg.includes('Float32Array') || errorMsg.includes('tensor')) {
                        // Known tensor type issue, use fallback
                        const rawOutput = await pipe(text);
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

            // Cache the result (fire and forget)
            // Defensive check for tests where spy might return undefined
            const cachePromise = queryCache.set(cacheKey, embeddingArray);
            if (cachePromise && typeof cachePromise.catch === 'function') {
                cachePromise.catch(err => {
                    console.warn('[VectorService] Failed to cache embedding:', err);
                });
            }

            return embeddingArray;
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            console.error(`[VectorService] Embedding generation error for text "${text.substring(0, 50)}...":`, errorMessage);
            throw new Error(`Failed to generate embedding: ${errorMessage}`);
        }
    }

    async generateEmbeddings(texts: string[]): Promise<number[][]> {
        if (!texts || texts.length === 0) {
            return [];
        }

        // 1. Check cache for all texts
        const cacheKeys = texts.map(text => queryCache.generateKey({
            type: 'embedding',
            model: this.modelName,
            text
        }));

        let cachedValues: (number[] | null)[] = [];
        try {
            cachedValues = await queryCache.mget<number[]>(cacheKeys);
        } catch (e) {
            console.warn('[VectorService] Cache read failed in batch, proceeding without cache:', e);
            cachedValues = new Array(texts.length).fill(null);
        }

        const missingIndices: number[] = [];
        const missingTexts: string[] = [];
        const results: number[][] = new Array(texts.length);

        cachedValues.forEach((val, i) => {
            if (val) {
                results[i] = val;
            } else {
                missingIndices.push(i);
                missingTexts.push(texts[i]);
            }
        });

        // If all found in cache, return
        if (missingTexts.length === 0) {
            return results;
        }

        // 2. Generate embeddings for missing texts
        if (!this.pipe) {
            await this.init();
        }

        if (!this.pipe) {
             throw new Error('Failed to initialize embedding pipeline');
        }

        try {
            // Internal batch generation logic
            // Ensure pipe is a function before calling
            const currentPipe = typeof this.pipe === 'function' ? this.pipe : (this.pipe as any)?.pipe;
            if (typeof currentPipe !== 'function') {
                // Fallback to sequential generation if pipe is not available
                return Promise.all(missingTexts.map(t => this.generateEmbedding(t)));
            }
            let output: any;
            try {
                // In production/normal mode, use batch pooling
                output = await currentPipe(missingTexts, { pooling: 'mean', normalize: true });
            } catch (e) {
                 console.warn('[VectorService] Batch pooling failed, falling back to sequential processing:', e);
                 // Fallback to sequential generation using existing generateEmbedding
                 const sequentialEmbeddings = await Promise.all(missingTexts.map(t => this.generateEmbedding(t)));

                 // Fill results
                 sequentialEmbeddings.forEach((emb, i) => {
                     results[missingIndices[i]] = emb;
                 });
                 return results;
            }

            // Extract data from batch output
            const generatedEmbeddings: number[][] = [];

            if (output && output.data) {
                const data = output.data;
                let dims = output.dims || output.shape;

                if (!dims || dims.length < 2) {
                     // Try to infer dimensions
                     const totalLength = data.length;
                     const batchSize = missingTexts.length;
                     if (totalLength > 0 && totalLength % batchSize === 0) {
                        const embeddingDim = totalLength / batchSize;
                        dims = [batchSize, embeddingDim];
                     } else {
                        // Fallback to sequential
                        throw new Error('Could not determine dimensions for batch output');
                     }
                }

                const batchSize = dims[0];
                const embeddingDim = dims[1];

                if (batchSize !== missingTexts.length) {
                     throw new Error(`Batch size mismatch: expected ${missingTexts.length}, got ${batchSize}`);
                }

                const isTypedArray = ArrayBuffer.isView(data);

                for (let i = 0; i < batchSize; i++) {
                    const start = i * embeddingDim;
                    const end = start + embeddingDim;

                    let vector: number[];
                    if (isTypedArray) {
                        // ArrayBufferView doesn't have slice, convert to array first
                        // Use Uint8Array view to safely convert ArrayBufferView to array
                        const uint8View = new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
                        const arrayData = Array.from(uint8View);
                        vector = arrayData.slice(start, end).map(v => Number(v));
                    } else if (Array.isArray(data)) {
                        vector = data.slice(start, end);
                    } else {
                        throw new Error('Unknown data type');
                    }

                    // Validate and sanitize
                     vector = vector.map(v => {
                        const num = typeof v === 'number' ? v : parseFloat(String(v));
                        return isFinite(num) ? num : 0;
                    });

                    generatedEmbeddings.push(vector);
                }
            } else {
                 throw new Error('No data in output');
            }

            // 3. Fill results and update cache
            generatedEmbeddings.forEach((embedding, i) => {
                const originalIndex = missingIndices[i];
                results[originalIndex] = embedding;

                // Cache the result (fire and forget)
                const key = cacheKeys[originalIndex];
                queryCache.set(key, embedding).catch(err => {
                    console.warn('[VectorService] Failed to cache embedding:', err);
                });
            });

            return results;

        } catch (error) {
            console.warn('[VectorService] Batch embedding generation failed, falling back to sequential:', error);
            // Fallback to sequential generation
            const sequentialEmbeddings = await Promise.all(missingTexts.map(t => this.generateEmbedding(t)));

            sequentialEmbeddings.forEach((emb, i) => {
                results[missingIndices[i]] = emb;
            });
            return results;
        }
    }
}

export class LSHIndex {
    private tables: { planes: number[][], buckets: Map<number, string[]> }[] = [];
    private numTables: number;
    private bitsPerTable: number;
    private dim: number;

    constructor(numTables = 5, bitsPerTable = 10, dim = 0) {
        this.numTables = numTables;
        this.bitsPerTable = bitsPerTable;
        this.dim = dim;
        if (dim > 0) this.initTables();
    }

    private initTables() {
        if (this.dim <= 0) return;
        this.tables = [];
        for (let t = 0; t < this.numTables; t++) {
            const planes: number[][] = [];
            for (let b = 0; b < this.bitsPerTable; b++) {
                // Generate random unit vector
                const vec = new Array(this.dim);
                let norm = 0;
                for (let i = 0; i < this.dim; i++) {
                    vec[i] = Math.random() - 0.5;
                    norm += vec[i] * vec[i];
                }
                norm = Math.sqrt(norm);
                if (norm === 0) norm = 1; // Safety
                for (let i = 0; i < this.dim; i++) {
                    vec[i] /= norm;
                }
                planes.push(vec);
            }
            this.tables.push({ planes, buckets: new Map() });
        }
    }

    private ensureInit(dim: number) {
        if (this.dim === 0) {
            this.dim = dim;
            this.initTables();
        }
    }

    private computeHash(vector: number[], planes: number[][]): number {
        let hash = 0;
        // Safety: ensure vector length matches dim or is sufficient
        const len = Math.min(vector.length, this.dim);

        for (let i = 0; i < planes.length; i++) {
            let dot = 0;
            const plane = planes[i];
            for (let j = 0; j < len; j++) {
                dot += vector[j] * plane[j];
            }
            if (dot > 0) {
                hash |= (1 << i);
            }
        }
        return hash;
    }

    add(doc: VectorDocument) {
        this.ensureInit(doc.vector.length);
        for (const table of this.tables) {
            const hash = this.computeHash(doc.vector, table.planes);
            let bucket = table.buckets.get(hash);
            if (!bucket) {
                bucket = [];
                table.buckets.set(hash, bucket);
            }
            bucket.push(doc.id);
        }
    }

    remove(doc: VectorDocument) {
        if (this.dim === 0) return;
        for (const table of this.tables) {
            const hash = this.computeHash(doc.vector, table.planes);
            const bucket = table.buckets.get(hash);
            if (bucket) {
                const index = bucket.indexOf(doc.id);
                if (index !== -1) {
                    bucket.splice(index, 1);
                }
            }
        }
    }

    build(docs: VectorDocument[]) {
        if (docs.length > 0) {
            this.ensureInit(docs[0].vector.length);
        }
        for (const table of this.tables) {
            table.buckets.clear();
        }
        for (const doc of docs) {
            this.add(doc);
        }
    }

    query(queryVector: number[]): Set<string> {
        this.ensureInit(queryVector.length);
        const candidates = new Set<string>();
        // Guard against uninitialized tables if query happens before any add/build
        if (this.tables.length === 0) return candidates;

        for (const table of this.tables) {
            const hash = this.computeHash(queryVector, table.planes);
            const bucket = table.buckets.get(hash);
            if (bucket) {
                for (const id of bucket) {
                    candidates.add(id);
                }
            }
            // Multi-probe: check 1-bit flips
            for (let i = 0; i < this.bitsPerTable; i++) {
                const neighborHash = hash ^ (1 << i);
                const neighborBucket = table.buckets.get(neighborHash);
                if (neighborBucket) {
                    for (const id of neighborBucket) {
                        candidates.add(id);
                    }
                }
            }
        }
        return candidates;
    }
}

export class VectorStore {
    private documents: Map<string, VectorDocument> = new Map();
    private storagePath: string;
    private index: LSHIndex;

    constructor(storagePath: string) {
        this.storagePath = storagePath;
        // Optimized settings: 5 tables, 10 bits.
        // 10 bits = 1024 buckets. Multi-probe (1-bit flip) checks 11 buckets per table.
        // 5 tables * 11 buckets = 55 bucket lookups.
        // For 10k docs, avg bucket size ~10. Expected candidates ~550.
        // This is selective (~5% of data) and should provide good speedup (~5-10x)
        // while maintaining better recall than fewer tables.
        // Initialize lazily based on data dimension.
        this.index = new LSHIndex(5, 10);
    }

    async load() {
        try {
            // Check if file exists
            try {
                await fs.access(this.storagePath);
            } catch {
                console.log('[VectorStore] No existing store found, starting empty.');
                return;
            }

            // Read first character to determine format
            const fileHandle = await fs.open(this.storagePath, 'r');
            const buffer = Buffer.alloc(1);
            const { bytesRead } = await fileHandle.read(buffer, 0, 1, 0);
            await fileHandle.close();

            if (bytesRead === 0) {
                 console.log('[VectorStore] Empty file, starting empty.');
                 return;
            }

            const firstChar = buffer.toString('utf-8').trim();

            if (firstChar === '[') {
                // Legacy JSON format
                const data = await fs.readFile(this.storagePath, 'utf-8');
                const docs: VectorDocument[] = JSON.parse(data);
                this.documents.clear();
                docs.forEach(doc => {
                    if (doc.norm === undefined) {
                        doc.norm = this.computeNorm(doc.vector);
                    }
                    this.documents.set(doc.id, doc);
                });
                console.log(`[VectorStore] Loaded ${this.documents.size} documents from ${this.storagePath} (legacy format)`);
            } else {
                // NDJSON format (assumed if not '[')
                this.documents.clear();
                const fileStream = createReadStream(this.storagePath);
                const rl = readline.createInterface({
                    input: fileStream,
                    crlfDelay: Infinity
                });

                for await (const line of rl) {
                    if (line.trim()) {
                        try {
                            const doc: VectorDocument = JSON.parse(line);
                            if (doc.norm === undefined) {
                                doc.norm = this.computeNorm(doc.vector);
                            }
                            this.documents.set(doc.id, doc);
                        } catch (e) {
                            console.warn('[VectorStore] Skipping invalid line in NDJSON:', e);
                        }
                    }
                }
                console.log(`[VectorStore] Loaded ${this.documents.size} documents from ${this.storagePath} (NDJSON format)`);
            }

            // Rebuild index after loading all documents
            console.log('[VectorStore] Building LSH index...');
            const startTime = Date.now();
            this.index.build(Array.from(this.documents.values()));
            console.log(`[VectorStore] LSH index built in ${Date.now() - startTime}ms`);

        } catch (error) {
            console.error('[VectorStore] Error loading store:', error);
        }
    }

    async save() {
        await fs.mkdir(path.dirname(this.storagePath), { recursive: true });
        const fileStream = createWriteStream(this.storagePath);

        return new Promise<void>((resolve, reject) => {
            fileStream.on('error', (error) => {
                console.error('[VectorStore] Error writing to file:', error);
                reject(error);
            });

            fileStream.on('finish', () => {
                console.log(`[VectorStore] Saved ${this.documents.size} documents to ${this.storagePath} (NDJSON format)`);
                resolve();
            });

            const iterator = this.documents.values();

            function write() {
                let ok = true;
                let next = iterator.next();
                while (!next.done && ok) {
                    ok = fileStream.write(JSON.stringify(next.value) + '\n');
                    if (ok) next = iterator.next();
                }

                if (next.done) {
                    fileStream.end();
                } else {
                    fileStream.once('drain', write);
                }
            }

            write();
        });
    }

    addDocument(doc: VectorDocument) {
        if (doc.norm === undefined) {
            doc.norm = this.computeNorm(doc.vector);
        }
        const existingDoc = this.documents.get(doc.id);
        if (existingDoc) {
            this.index.remove(existingDoc);
        }
        this.documents.set(doc.id, doc);
        this.index.add(doc);
    }

    getDocument(id: string): VectorDocument | undefined {
        return this.documents.get(id);
    }

    /**
     * Compute L2 norm of a vector
     */
    private computeNorm(vector: number[]): number {
        let sum = 0;
        for (let i = 0; i < vector.length; i++) {
            sum += vector[i] * vector[i];
        }
        return Math.sqrt(sum);
    }

    search(queryVector: number[], limit: number = 5, filter?: (doc: VectorDocument) => boolean): { document: VectorDocument; score: number }[] {
        // Compute query norm once
        let qNorm = 0;
        for (let i = 0; i < queryVector.length; i++) {
            qNorm += queryVector[i] * queryVector[i];
        }
        qNorm = Math.sqrt(qNorm);

        // Avoid division by zero
        if (qNorm === 0) return [];

        // Handle invalid limit
        if (limit <= 0) return [];

        const topResults: { document: VectorDocument; score: number }[] = [];

        // Strategy: Use LSH index for large datasets, linear scan for small ones.
        // Threshold: 1000 documents.
        const useIndex = this.documents.size >= 1000;
        let candidates: Iterable<VectorDocument>;
        let isFullScan = !useIndex;

        if (useIndex) {
            const candidateIds = this.index.query(queryVector);

            // If candidates are too few (likely due to highly specific query or empty index),
            // fallback to checking everything if necessary (heuristic).
            if (candidateIds.size < limit * 5 && this.documents.size > candidateIds.size * 10) {
                 // Low recall risk, fallback to full scan
                 candidates = this.documents.values();
                 isFullScan = true;
            } else {
                candidates = this.mapIdsToDocs(candidateIds);
            }
        } else {
            candidates = this.documents.values();
        }

        // Search among candidates
        let candidateCount = 0;
        for (const doc of candidates) {
            if (filter && !filter(doc)) continue;

            candidateCount++;
            const docVec = doc.vector;
            let dot = 0;
            const len = docVec.length;
            for (let i = 0; i < len; i++) {
                dot += queryVector[i] * docVec[i];
            }

            // Use precomputed norm or compute it if missing (safety fallback)
            const docNorm = doc.norm !== undefined ? doc.norm : this.computeNorm(docVec);

            // Handle zero norm to avoid NaN/Infinity
            if (docNorm === 0) continue;

            const score = dot / (qNorm * docNorm);

            // Maintain top K
            if (topResults.length < limit) {
                topResults.push({ document: doc, score });
                if (topResults.length === limit) {
                    topResults.sort((a, b) => b.score - a.score);
                }
            } else {
                if (score > topResults[limit - 1].score) {
                    topResults[limit - 1] = { document: doc, score };
                    topResults.sort((a, b) => b.score - a.score);
                }
            }
        }

        // Secondary Fallback: Ensure we satisfy limit if possible
        if (!isFullScan && useIndex && topResults.length < limit && this.documents.size > candidateCount) {
             for (const doc of this.documents.values()) {
                if (filter && !filter(doc)) continue;

                // Avoid re-checking is tricky without Set overhead, but we can check if already in topResults
                let alreadyFound = false;
                for (const res of topResults) {
                    if (res.document === doc) {
                        alreadyFound = true;
                        break;
                    }
                }
                if (alreadyFound) continue;

                const docVec = doc.vector;
                let dot = 0;
                const len = docVec.length;
                for (let i = 0; i < len; i++) {
                    dot += queryVector[i] * docVec[i];
                }

                const docNorm = doc.norm !== undefined ? doc.norm : this.computeNorm(docVec);
                if (docNorm === 0) continue;
                const score = dot / (qNorm * docNorm);

                 if (topResults.length < limit) {
                    topResults.push({ document: doc, score });
                    if (topResults.length === limit) {
                        topResults.sort((a, b) => b.score - a.score);
                    }
                } else {
                    if (score > topResults[limit - 1].score) {
                        topResults[limit - 1] = { document: doc, score };
                        topResults.sort((a, b) => b.score - a.score);
                    }
                }
             }
        }

        return topResults.sort((a, b) => b.score - a.score);
    }

    private *mapIdsToDocs(ids: Iterable<string>): Iterable<VectorDocument> {
        for (const id of ids) {
            const doc = this.documents.get(id);
            if (doc) yield doc;
        }
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

    async search(query: string, limit: number = 5, filter?: (doc: VectorDocument) => boolean) {
        const queryVector = await this.provider.generateEmbedding(query);
        return this.store.search(queryVector, limit, filter);
    }

    /**
     * Search for similar documents using a pre-computed vector
     *
     * @param vector - Query vector
     * @param limit - Maximum number of results to return
     * @param filter - Optional filter function
     * @returns Array of documents with similarity scores
     */
    async searchByVector(vector: number[], limit: number = 5, filter?: (doc: VectorDocument) => boolean) {
        return this.store.search(vector, limit, filter);
    }

    async save() {
        await this.store.save();
    }
}
