/**
 * Google Gemini LLM Provider
 * 
 * Implements LLMProvider interface for Google Gemini API
 * Uses @google/generative-ai SDK with proper timeout configuration
 */

import type { LLMProvider, LLMMessage, LLMGenerateOptions, LLMResponse } from './LLMProvider.js';
import { logger } from '../../utils/logger.js';
import { createHttpClient, HTTP_TIMEOUTS } from '../../config/httpClient.js';
import type { AxiosInstance } from 'axios';
import { ExternalServiceError } from '../../types/errors.js';
import { ServiceConfigurationError } from '../../utils/serviceErrors.js';
import { getEnv } from '../../config/env.js';

// Default timeout for Gemini - can be overridden via GEMINI_TIMEOUT env var
// Gemini can be slow with large contexts, so we use a longer default
const DEFAULT_GEMINI_TIMEOUT = HTTP_TIMEOUTS.VERY_LONG; // 5 minutes default

export interface GeminiProviderConfig {
  apiKey?: string;
  defaultModel?: string;
  timeout?: number;
}

export class GeminiProvider implements LLMProvider {
  private config: GeminiProviderConfig;
  private client: AxiosInstance | null = null;

  constructor(config?: GeminiProviderConfig) {
    const env = getEnv();

    this.config = {
      apiKey: env.GEMINI_API_KEY,
      defaultModel: env.GEMINI_MODEL,
      timeout: env.GEMINI_TIMEOUT,
      ...config,
    };
  }

  getName(): string {
    return 'gemini';
  }

  async isAvailable(): Promise<boolean> {
    try {
      // Check if API key is set
      if (!this.config.apiKey) {
        return false;
      }

      // Try to make a simple API call to verify connectivity
      if (!this.client) {
        this.client = createHttpClient({
          baseURL: 'https://generativelanguage.googleapis.com',
          timeout: this.config.timeout || DEFAULT_GEMINI_TIMEOUT,
          headers: {
            'Content-Type': 'application/json',
          },
        });
      }

      return true;
    } catch (error) {
      logger.debug({ error }, 'Gemini not available');
      return false;
    }
  }

  async generate(
    messages: LLMMessage[],
    options?: LLMGenerateOptions
  ): Promise<LLMResponse> {
    if (!this.config.apiKey) {
      throw new ServiceConfigurationError('Gemini', ['GEMINI_API_KEY']);
    }

    if (!this.client) {
      this.client = createHttpClient({
        baseURL: 'https://generativelanguage.googleapis.com',
        timeout: this.config.timeout || HTTP_TIMEOUTS.LONG,
        headers: {
          'Content-Type': 'application/json',
        },
      });
    }

    const model = options?.model || this.config.defaultModel || 'gemini-1.5-pro';
    const temperature = options?.temperature ?? 0.7;
    const maxTokens = options?.max_tokens;

    try {
      // Convert messages to Gemini format
      // Gemini uses a different message format - combine system and user messages
      const systemMessage = messages.find(m => m.role === 'system');
      const userMessages = messages.filter(m => m.role !== 'system');
      
      // Combine system message with first user message if present
      let prompt = '';
      if (systemMessage) {
        prompt = `${systemMessage.content}\n\n`;
      }
      
      // Add user messages
      const userContent = userMessages
        .map(m => m.content)
        .join('\n\n');
      prompt += userContent;

      // Prepare request body
      const requestBody: any = {
        contents: [
          {
            parts: [
              {
                text: prompt,
              },
            ],
          },
        ],
        generationConfig: {
          temperature,
          ...(maxTokens && { maxOutputTokens: maxTokens }),
        },
      };

      // Make API call with timeout
      const response = await this.client.post(
        `/v1beta/models/${model}:generateContent?key=${this.config.apiKey}`,
        requestBody,
        {
          timeout: this.config.timeout || DEFAULT_GEMINI_TIMEOUT,
        }
      );

      const content = response.data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
      if (!content) {
        throw new ExternalServiceError('Gemini', 'Empty response from Gemini', {
          reason: 'empty_response',
          provider: 'gemini',
          model,
          response: response.data?.candidates?.[0]
        });
      }

      // Extract token usage if available
      const usageMetadata = response.data?.usageMetadata;
      const usage = usageMetadata
        ? {
            promptTokens: usageMetadata.promptTokenCount || 0,
            completionTokens: usageMetadata.candidatesTokenCount || 0,
            totalTokens: usageMetadata.totalTokenCount || 0,
          }
        : undefined;

      return {
        content,
        model: response.data?.model || model,
        usage,
      };
    } catch (error: any) {
      // Handle timeout errors specifically
      if (error.code === 'ECONNABORTED' || error.message?.includes('timeout')) {
        logger.error(
          { 
            error, 
            model, 
            timeout: this.config.timeout,
            message: 'Gemini API call timed out'
          },
          'Gemini API timeout'
        );
        throw new ExternalServiceError(
          'Gemini',
          `Gemini API call timed out after ${this.config.timeout}ms. Consider increasing GEMINI_TIMEOUT or using a faster model.`,
          {
            reason: 'timeout',
            provider: 'gemini',
            model,
            timeout: this.config.timeout
          }
        );
      }

      logger.error({ error, model }, 'Error calling Gemini API');
      throw error;
    }
  }

  /**
   * Get configuration
   */
  getConfig(): GeminiProviderConfig {
    return { ...this.config };
  }

  /**
   * Set HTTP client (for testing)
   */
  setClient(client: AxiosInstance): void {
    this.client = client;
  }
}

