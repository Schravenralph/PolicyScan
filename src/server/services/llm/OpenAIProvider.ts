/**
 * OpenAI LLM Provider
 * 
 * Implements LLMProvider interface for OpenAI API
 */

import type { LLMProvider, LLMMessage, LLMGenerateOptions, LLMResponse } from './LLMProvider.js';
import { logger } from '../../utils/logger.js';
import { getCircuitBreakerManager } from '../../config/httpClient.js';
import { ExternalServiceError } from '../../types/errors.js';
import { ServiceConfigurationError } from '../../utils/serviceErrors.js';
import { getEnv } from '../../config/env.js';
import { getOpenAIModule } from './openaiUtils.js';

interface OpenAIClient {
  chat: {
    completions: {
      create: (params: {
        model: string;
        messages: Array<{ role: string; content: string }>;
        temperature?: number;
        max_tokens?: number;
        stream?: boolean;
      }) => Promise<{
        choices: Array<{
          message?: {
            content?: string | null;
          };
        }>;
        model: string;
        usage?: {
          prompt_tokens: number;
          completion_tokens: number;
          total_tokens: number;
        };
      }>;
    };
  };
}

export interface OpenAIProviderConfig {
  apiKey?: string;
  defaultModel?: string;
}

export class OpenAIProvider implements LLMProvider {
  private config: OpenAIProviderConfig;
  private client: OpenAIClient | null = null;

  constructor(config?: OpenAIProviderConfig) {
    this.config = {
      apiKey: getEnv().OPENAI_API_KEY,
      defaultModel: 'gpt-4o-mini',
      ...config,
    };
  }

  getName(): string {
    return 'openai';
  }

  async isAvailable(): Promise<boolean> {
    try {
      // Check if API key is set
      if (!this.config.apiKey) {
        return false;
      }

      // Try to initialize client if not already done
      if (!this.client) {
        const OpenAI = await getOpenAIModule();
        this.client = new OpenAI.default({ apiKey: this.config.apiKey }) as unknown as OpenAIClient;
      }

      return true;
    } catch (error) {
      logger.debug({ error }, 'OpenAI not available');
      return false;
    }
  }

  async generate(
    messages: LLMMessage[],
    options?: LLMGenerateOptions
  ): Promise<LLMResponse> {
    if (!this.client) {
      // Support mocking for tests via global variable
      const MockOpenAI = (global as typeof globalThis & { __MOCK_OPENAI__?: typeof import('openai') }).__MOCK_OPENAI__;
      const OpenAI = MockOpenAI || await import('openai');
      const apiKey = this.config.apiKey || getEnv().OPENAI_API_KEY;

      if (!apiKey) {
        throw new ServiceConfigurationError('OpenAI', ['OPENAI_API_KEY']);
      }

      this.client = new OpenAI.default({ apiKey }) as unknown as OpenAIClient;
    }

    const model = options?.model || this.config.defaultModel || 'gpt-4o-mini';
    const temperature = options?.temperature ?? 0.7;
    const max_tokens = options?.max_tokens;

    try {
      const circuitBreakerManager = getCircuitBreakerManager();
      const breaker = circuitBreakerManager.getBreaker('openai-provider');

      const response = await breaker.execute(() =>
        this.client!.chat.completions.create({
          model,
          messages: messages.map((msg) => ({
            role: msg.role,
            content: msg.content,
          })),
          temperature,
          ...(max_tokens && { max_tokens }),
        })
      );

      const content = response.choices[0]?.message?.content?.trim();
      if (!content) {
        throw new ExternalServiceError('OpenAI', 'Empty response from OpenAI', {
          reason: 'empty_response',
          provider: 'openai',
          model,
          response: response.choices[0]?.message
        });
      }

      return {
        content,
        model: response.model,
        usage: response.usage
          ? {
              promptTokens: response.usage.prompt_tokens,
              completionTokens: response.usage.completion_tokens,
              totalTokens: response.usage.total_tokens,
            }
          : undefined,
      };
    } catch (error) {
      logger.error({ error, model }, 'Error calling OpenAI');
      throw error;
    }
  }

  /**
   * Set OpenAI client (for testing)
   */
  setClient(client: OpenAIClient): void {
    this.client = client;
  }
}

