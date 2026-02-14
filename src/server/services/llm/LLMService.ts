/**
 * LLM Service for RAG operations (QA, summarization)
 * 
 * Provides a unified interface for LLM API calls, supporting multiple providers.
 * This service is used by RAG operations for question-answering and summarization.
 */

import { aiUsageMonitoringService } from '../monitoring/AIUsageMonitoringService.js';
import { createHash } from 'crypto';
import { Cache } from '../infrastructure/cache.js';
import { getCircuitBreakerManager } from '../../config/httpClient.js';
import { ServiceUnavailableError, BadRequestError, ExternalServiceError } from '../../types/errors.js';
import { getOpenAIModule } from './openaiUtils.js';
import { logger } from '../../utils/logger.js';

export interface LLMConfig {
  provider: 'openai' | 'anthropic' | 'local';
  model: string;
  temperature: number;
  maxTokens: number;
  enabled: boolean;
  cacheEnabled: boolean;
  cacheSize: number;
  cacheTTL: number;
}

export interface LLMMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
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

/**
 * Service for interacting with LLM APIs
 */
export class LLMService {
  private config: LLMConfig;
  private openaiClient: OpenAIClient | null = null;
  private cache: Cache<LLMResponse>;

  constructor(config?: Partial<LLMConfig>) {
    this.config = {
      provider: (process.env.RAG_PROVIDER as 'openai' | 'anthropic' | 'local') || 'openai',
      model: process.env.RAG_MODEL || 'gpt-4o-mini',
      temperature: parseFloat(process.env.RAG_TEMPERATURE || '0.3'),
      maxTokens: parseInt(process.env.RAG_MAX_TOKENS || '1000', 10),
      enabled: process.env.RAG_ENABLED === 'true',
      cacheEnabled: process.env.RAG_CACHE_ENABLED !== 'false', // Default to true
      cacheSize: parseInt(process.env.RAG_CACHE_SIZE || '1000', 10),
      cacheTTL: parseInt(process.env.RAG_CACHE_TTL || '3600000', 10), // Default: 1 hour
      ...config
    };

    this.cache = new Cache<LLMResponse>(this.config.cacheSize, this.config.cacheTTL, 'llm-response');
  }

  /**
   * Generate a completion from the LLM
   * 
   * @param messages Array of messages (system, user, assistant)
   * @returns LLM response
   */
  async generate(messages: LLMMessage[]): Promise<LLMResponse> {
    if (!this.config.enabled) {
      throw new ServiceUnavailableError('LLM service is disabled. Set RAG_ENABLED=true to enable.', {
        reason: 'llm_service_disabled',
        operation: 'generate'
      });
    }

    switch (this.config.provider) {
      case 'openai':
        return this.generateOpenAI(messages);
      case 'anthropic':
        throw new ServiceUnavailableError('Anthropic provider not yet implemented', {
          reason: 'provider_not_implemented',
          provider: 'anthropic',
          operation: 'generate'
        });
      case 'local':
        throw new ServiceUnavailableError('Local LLM provider not yet implemented', {
          reason: 'provider_not_implemented',
          provider: 'local',
          operation: 'generate'
        });
      default:
        throw new BadRequestError(`Unknown LLM provider: ${this.config.provider}`, {
          reason: 'invalid_provider',
          provider: this.config.provider,
          operation: 'generate'
        });
    }
  }

  /**
   * Generate completion using OpenAI
   */
  private async generateOpenAI(messages: LLMMessage[]): Promise<LLMResponse> {
    if (!this.openaiClient) {
      const OpenAI = await getOpenAIModule();
      const apiKey = process.env.OPENAI_API_KEY;
      
      if (!apiKey) {
        throw new ServiceUnavailableError('OPENAI_API_KEY not set. Cannot use OpenAI LLM service.', {
          reason: 'missing_openai_api_key',
          operation: 'generateOpenAI'
        });
      }

      this.openaiClient = new OpenAI.default({ apiKey }) as unknown as OpenAIClient;
    }

    const startTime = Date.now();
    let cacheHit = false;
    let success = false;
    let error: string | undefined;
    const cacheKey = this.getCacheKey(messages);

    try {
      // Check cache first
      if (this.config.cacheEnabled) {
        const cachedResponse = await this.cache.get(cacheKey);
        if (cachedResponse) {
          cacheHit = true;
          success = true;
          const duration = Date.now() - startTime;

          // Record cached API call for monitoring
          aiUsageMonitoringService.recordAPICall({
            provider: 'openai',
            model: cachedResponse.model,
            operation: 'generate',
            promptTokens: cachedResponse.usage?.promptTokens || 0,
            completionTokens: cachedResponse.usage?.completionTokens || 0,
            totalTokens: cachedResponse.usage?.totalTokens || 0,
            cacheHit: true,
            duration,
            success: true,
            metadata: {
              model: cachedResponse.model,
              temperature: this.config.temperature,
            },
          }).catch((err) => {
            logger.warn({ err }, 'Failed to record AI usage metric for cache hit');
          });

          return cachedResponse;
        }
      }

      if (!this.openaiClient) {
        throw new ServiceUnavailableError('OpenAI client not initialized', {
          reason: 'openai_client_not_initialized',
          operation: 'generateOpenAI'
        });
      }

      const circuitBreakerManager = getCircuitBreakerManager();
      const breaker = circuitBreakerManager.getBreaker('openai-llm-service');

      const response = await breaker.execute(() =>
        this.openaiClient!.chat.completions.create({
          model: this.config.model,
          messages: messages.map(msg => ({
            role: msg.role,
            content: msg.content
          })),
          temperature: this.config.temperature,
          max_tokens: this.config.maxTokens,
        })
      );

      const content = response.choices[0]?.message?.content?.trim();
      if (!content) {
        throw new ExternalServiceError('OpenAI', 'Empty response from OpenAI', {
          reason: 'empty_response',
          operation: 'generateOpenAI'
        });
      }

      success = true;
      const duration = Date.now() - startTime;

      // Record API call for monitoring
      const usage = response.usage ? {
        promptTokens: response.usage.prompt_tokens,
        completionTokens: response.usage.completion_tokens,
        totalTokens: response.usage.total_tokens,
      } : undefined;

      const result: LLMResponse = {
        content,
        model: response.model,
        usage,
      };

      // Store in cache
      if (this.config.cacheEnabled) {
        await this.cache.set(cacheKey, result);
      }

      if (usage) {
        aiUsageMonitoringService.recordAPICall({
          provider: 'openai',
          model: response.model,
          operation: 'generate',
          promptTokens: usage.promptTokens,
          completionTokens: usage.completionTokens,
          totalTokens: usage.totalTokens,
          cacheHit,
          duration,
          success,
          metadata: {
            model: response.model,
            temperature: this.config.temperature,
          },
        }).catch((err) => {
          // Don't fail the request if monitoring fails
          logger.warn({ err }, 'Failed to record AI usage metric');
        });
      }

      return result;
    } catch (err) {
      success = false;
      error = err instanceof Error ? err.message : String(err);
      const duration = Date.now() - startTime;

      // Record failed API call for monitoring
      aiUsageMonitoringService.recordAPICall({
        provider: 'openai',
        model: this.config.model,
        operation: 'generate',
        promptTokens: 0, // Unknown on error
        completionTokens: 0,
        totalTokens: 0,
        cacheHit: false,
        duration,
        success: false,
        error,
        metadata: {
          model: this.config.model,
        },
      }).catch((monitoringErr) => {
        // Don't fail the request if monitoring fails
        logger.warn({ err: monitoringErr }, 'Failed to record AI usage metric');
      });

      logger.error({ err }, 'Error calling OpenAI');
      throw err;
    }
  }

  /**
   * Check if LLM service is enabled
   */
  isEnabled(): boolean {
    return this.config.enabled;
  }

  /**
   * Get current configuration
   */
  getConfig(): LLMConfig {
    return { ...this.config };
  }

  /**
   * Set OpenAI client (for testing)
   */
  setOpenAIClient(client: OpenAIClient): void {
    this.openaiClient = client;
  }

  /**
   * Generate a cache key for the messages
   */
  private getCacheKey(messages: LLMMessage[]): string {
    const data = JSON.stringify({
      messages,
      model: this.config.model,
      temperature: this.config.temperature,
      maxTokens: this.config.maxTokens,
    });
    return createHash('sha256').update(data).digest('hex');
  }
}
