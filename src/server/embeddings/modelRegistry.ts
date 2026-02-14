/**
 * Model Registry - Embedding model configuration and validation
 * 
 * Manages embedding model metadata and enforces modelId and dims consistency.
 * 
 * @see docs/40-implementation-plans/final-plan-canonical-document-parsing/05-embedding.md
 */

import { logger } from '../utils/logger.js';
import { EMBEDDING_MODELS } from '../services/query/VectorService.js';
import type { EmbeddingModel } from '../services/query/VectorService.js';

/**
 * Model registry entry
 */
export interface ModelRegistryEntry {
  modelId: string; // e.g., "xenova/all-MiniLM-L6-v2@v1"
  dims: number; // Vector dimensions
  provider: 'local' | 'openai' | 'custom';
  embeddingVersion: string; // Version for provider/model changes
  modelInfo?: EmbeddingModel; // Optional model metadata
}

/**
 * Model Registry - Manages embedding model configurations
 */
export class ModelRegistry {
  private models: Map<string, ModelRegistryEntry> = new Map();

  constructor() {
    // Register default models from VectorService
    this.registerDefaultModels();
  }

  /**
   * Register default models from VectorService
   */
  private registerDefaultModels(): void {
    for (const [modelName, modelInfo] of Object.entries(EMBEDDING_MODELS)) {
      // Create modelId with version (default v1)
      const modelId = `${modelName}@v1`;
      
      this.models.set(modelId, {
        modelId,
        dims: modelInfo.dimensions,
        provider: 'local',
        embeddingVersion: 'v1',
        modelInfo,
      });
    }

    // Register 'local' alias for the default model (backward compatibility)
    // Assuming Xenova/all-MiniLM-L6-v2 is the default
    const defaultModelName = 'Xenova/all-MiniLM-L6-v2';
    const defaultModelId = `${defaultModelName}@v1`;
    const defaultModelEntry = this.models.get(defaultModelId);

    if (defaultModelEntry) {
      this.models.set('local', {
        ...defaultModelEntry,
        modelId: 'local', // Override ID to match alias
      });
    }

    logger.debug(
      { modelCount: this.models.size },
      'Registered default embedding models'
    );
  }

  /**
   * Register a model
   * 
   * @param entry - Model registry entry
   */
  register(entry: ModelRegistryEntry): void {
    this.models.set(entry.modelId, entry);
    logger.debug(
      { modelId: entry.modelId, dims: entry.dims, provider: entry.provider },
      'Registered embedding model'
    );
  }

  /**
   * Get model by modelId
   * 
   * @param modelId - Model ID
   * @returns Model registry entry or null if not found
   */
  get(modelId: string): ModelRegistryEntry | null {
    return this.models.get(modelId) || null;
  }

  /**
   * Get all registered models
   * 
   * @returns Array of all model entries
   */
  getAll(): ModelRegistryEntry[] {
    return Array.from(this.models.values());
  }

  /**
   * Validate modelId and dims
   * 
   * @param modelId - Model ID to validate
   * @param dims - Expected dimensions
   * @throws Error if model not found or dims mismatch
   */
  validate(modelId: string, dims: number): void {
    const entry = this.get(modelId);
    
    if (!entry) {
      throw new Error(`Model not found in registry: ${modelId}`);
    }

    if (entry.dims !== dims) {
      throw new Error(
        `Dimension mismatch for model ${modelId}: expected ${entry.dims}, got ${dims}`
      );
    }
  }

  /**
   * Get dimensions for a model
   * 
   * @param modelId - Model ID
   * @returns Dimensions or null if model not found
   */
  getDims(modelId: string): number | null {
    const entry = this.get(modelId);
    return entry?.dims || null;
  }
}

// Singleton instance
let modelRegistry: ModelRegistry | null = null;

/**
 * Get model registry instance
 */
export function getModelRegistry(): ModelRegistry {
  if (!modelRegistry) {
    modelRegistry = new ModelRegistry();
  }
  return modelRegistry;
}

