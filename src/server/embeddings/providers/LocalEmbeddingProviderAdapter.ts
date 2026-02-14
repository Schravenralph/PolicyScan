/**
 * LocalEmbeddingProviderAdapter - Adapter for LocalEmbeddingProvider
 * 
 * Wraps the existing LocalEmbeddingProvider to implement the EmbeddingProvider interface.
 */

import type { EmbeddingProvider } from '../EmbeddingProvider.js';
import { LocalEmbeddingProvider as VectorServiceLocalProvider } from '../../services/query/VectorService.js';
import { getModelRegistry } from '../modelRegistry.js';

/**
 * Local embedding provider adapter
 */
export class LocalEmbeddingProviderAdapter implements EmbeddingProvider {
  private provider: VectorServiceLocalProvider;
  private _modelId: string;
  private dims: number;

  constructor(_modelId: string) {
    this._modelId = _modelId;
    
    // Extract model name from modelId (e.g., "xenova/all-MiniLM-L6-v2@v1" -> "xenova/all-MiniLM-L6-v2")
    const modelName = _modelId.split('@')[0];
    
    // Get dimensions from registry
    const registry = getModelRegistry();
    const entry = registry.get(_modelId);
    
    if (!entry) {
      throw new Error(`Model not found in registry: ${_modelId}`);
    }
    
    this.dims = entry.dims;
    this.provider = new VectorServiceLocalProvider(modelName);
  }

  async generateEmbedding(text: string): Promise<number[]> {
    return await this.provider.generateEmbedding(text);
  }

  async generateEmbeddings(texts: string[]): Promise<number[][]> {
    return await this.provider.generateEmbeddings(texts);
  }

  getName(): string {
    return 'local';
  }

  getDims(): number {
    return this.dims;
  }
}
