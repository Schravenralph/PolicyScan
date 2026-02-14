/**
 * Type declarations for optional dependencies
 * These packages may not be installed, so we provide type stubs
 */

declare module 'openai' {
  export interface ChatCompletion {
    id: string;
    object: string;
    created: number;
    model: string;
    choices: Array<{
      index: number;
      message: {
        role: string;
        content: string | null;
      };
      finish_reason: string | null;
    }>;
    usage?: {
      prompt_tokens: number;
      completion_tokens: number;
      total_tokens: number;
    };
  }

  export interface ChatCompletionCreateParams {
    model: string;
    messages: Array<{
      role: string;
      content: string;
    }>;
    temperature?: number;
    max_tokens?: number;
  }

  export class OpenAI {
    constructor(config: { apiKey: string });
    chat: {
      completions: {
        create(params: ChatCompletionCreateParams): Promise<ChatCompletion>;
      };
    };
  }

  export default OpenAI;
}

declare module '@anthropic-ai/sdk' {
  export interface Message {
    role: 'user' | 'assistant';
    content: string;
  }

  export interface MessageCreateParams {
    model: string;
    max_tokens: number;
    messages: Message[];
  }

  export interface MessageResponse {
    content: Array<{
      type: 'text';
      text: string;
    }>;
  }

  export class Anthropic {
    constructor(config: { apiKey: string });
    messages: {
      create(params: MessageCreateParams): Promise<MessageResponse>;
    };
  }

  export default Anthropic;
}






