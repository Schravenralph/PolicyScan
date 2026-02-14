/**
 * Local LLM Provider (Ollama)
 * 
 * Supports local LLM models via Ollama API
 * https://ollama.ai/
 * 
 * Usage:
 * 1. Install Ollama: https://ollama.ai/download
 * 2. Pull a model: ollama pull llama2 (or mistral, mixtral, etc.)
 * 3. Set environment variables:
 *    - RERANKER_PROVIDER=local or RERANKER_PROVIDER=ollama
 *    - RERANKER_LOCAL_API_URL=http://localhost:11434 (default)
 *    - RERANKER_MODEL=llama2 (or your preferred model)
 */

import type { LLMProvider, LLMMessage, LLMGenerateOptions, LLMResponse } from './LLMProvider.js';
import { logger } from '../../utils/logger.js';
import { createHttpClient, HTTP_TIMEOUTS } from '../../config/httpClient.js';
import { getEnv } from '../../config/env.js';
import type { AxiosInstance } from 'axios';
import { ExternalServiceError } from '../../types/errors.js';

export interface OllamaConfig {
  apiUrl: string;
  model: string;
  timeout: number;
}

export class LocalLLMProvider implements LLMProvider {
  private config: OllamaConfig;
  private client: AxiosInstance;

  constructor(config?: Partial<OllamaConfig>) {
    const env = getEnv();
    this.config = {
      apiUrl: env.OLLAMA_API_URL,
      model: env.RERANKER_MODEL || env.OLLAMA_MODEL || 'llama2',
      timeout: env.OLLAMA_TIMEOUT,
      ...config,
    };

    // Use centralized HTTP client for connection pooling and retry logic
    // Migrated from direct axios.create() to centralized client (WI-377)
    this.client = createHttpClient({
      baseURL: this.config.apiUrl,
      timeout: this.config.timeout || HTTP_TIMEOUTS.STANDARD,
      headers: {
        'Content-Type': 'application/json',
      },
    });
  }

  getName(): string {
    return 'ollama';
  }

  async isAvailable(): Promise<boolean> {
    try {
      // Try to list models to check if Ollama is running
      const response = await this.client.get('/api/tags', { timeout: 5000 });
      return response.status === 200;
    } catch (error) {
      logger.debug({ error, apiUrl: this.config.apiUrl }, 'Ollama not available');
      return false;
    }
  }

  async generate(
    messages: LLMMessage[],
    options?: LLMGenerateOptions
  ): Promise<LLMResponse> {
    const model = options?.model || this.config.model;
    const temperature = options?.temperature ?? 0.7;
    const max_tokens = options?.max_tokens;

    try {
      // Convert messages to Ollama format
      // Ollama uses a simpler format - just the prompt
      // For chat models, we can use the /api/chat endpoint
      const prompt = this.formatMessagesForOllama(messages);

      // Try chat endpoint first (for chat models like llama2, mistral)
      try {
        const chatResponse = await this.client.post('/api/chat', {
          model,
          messages: messages.map((msg) => ({
            role: msg.role,
            content: msg.content,
          })),
          options: {
            temperature,
            ...(max_tokens && { num_predict: max_tokens }),
          },
          stream: false,
        });

        const content = chatResponse.data.message?.content?.trim();
        if (!content) {
          throw new Error('Empty response from Ollama chat endpoint');
        }

        return {
          content,
          model: chatResponse.data.model || model,
          usage: chatResponse.data.eval_count
            ? {
                promptTokens: chatResponse.data.prompt_eval_count || 0,
                completionTokens: chatResponse.data.eval_count || 0,
                totalTokens:
                  (chatResponse.data.prompt_eval_count || 0) +
                  (chatResponse.data.eval_count || 0),
              }
            : undefined,
        };
      } catch (chatError) {
        // Fallback to generate endpoint if chat endpoint fails
        logger.debug({ error: chatError }, 'Chat endpoint failed, trying generate endpoint');

        const generateResponse = await this.client.post('/api/generate', {
          model,
          prompt,
          options: {
            temperature,
            ...(max_tokens && { num_predict: max_tokens }),
          },
          stream: false,
        });

        const content = generateResponse.data.response?.trim();
        if (!content) {
          throw new ExternalServiceError('Ollama', 'Empty response from Ollama', {
            reason: 'empty_response',
            provider: 'ollama',
            model,
            endpoint: 'generate'
          });
        }

        return {
          content,
          model: generateResponse.data.model || model,
          usage: generateResponse.data.eval_count
            ? {
                promptTokens: generateResponse.data.prompt_eval_count || 0,
                completionTokens: generateResponse.data.eval_count || 0,
                totalTokens:
                  (generateResponse.data.prompt_eval_count || 0) +
                  (generateResponse.data.eval_count || 0),
              }
            : undefined,
        };
      }
    } catch (error) {
      logger.error({ error, model, apiUrl: this.config.apiUrl }, 'Error calling Ollama');
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new ExternalServiceError(
        'Ollama',
        `Failed to generate completion from Ollama: ${errorMessage}`,
        {
          reason: 'completion_failed',
          provider: 'ollama',
          model,
          apiUrl: this.config.apiUrl,
          originalError: errorMessage
        }
      );
    }
  }

  /**
   * Format messages into a single prompt for Ollama generate endpoint
   */
  private formatMessagesForOllama(messages: LLMMessage[]): string {
    return messages
      .map((msg) => {
        const rolePrefix =
          msg.role === 'system'
            ? 'System: '
            : msg.role === 'assistant'
            ? 'Assistant: '
            : 'User: ';
        return `${rolePrefix}${msg.content}`;
      })
      .join('\n\n') + '\n\nAssistant:';
  }

  /**
   * Get configuration
   */
  getConfig(): OllamaConfig {
    return { ...this.config };
  }
}

