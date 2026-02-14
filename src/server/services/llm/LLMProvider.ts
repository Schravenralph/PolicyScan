/**
 * LLM Provider Abstraction
 * 
 * Provides a unified interface for different LLM providers (OpenAI, Ollama, etc.)
 * This allows RerankerService and other services to switch between providers seamlessly.
 */

export interface LLMProvider {
  /**
   * Generate a completion from the LLM
   * @param messages Array of messages (system, user, assistant)
   * @param options Optional configuration (temperature, max_tokens, etc.)
   * @returns LLM response with content and metadata
   */
  generate(messages: LLMMessage[], options?: LLMGenerateOptions): Promise<LLMResponse>;

  /**
   * Check if the provider is available and configured
   */
  isAvailable(): Promise<boolean>;

  /**
   * Get provider name
   */
  getName(): string;
}

export interface LLMMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface LLMGenerateOptions {
  temperature?: number;
  max_tokens?: number;
  model?: string;
}

export interface LLMResponse {
  content: string;
  model: string;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}

export type LLMProviderType = 'openai' | 'ollama' | 'local';

