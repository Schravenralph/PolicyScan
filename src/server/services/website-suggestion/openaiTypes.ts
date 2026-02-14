export interface OpenAIWebSearchResult {
  rank: number;
  title: string;
  url: string;
  website_url: string;
  website_title?: string;
  snippet: string;
  document_type: string;
}

export interface OpenAIToolResult {
  tool_call_id: string;
  role: 'tool';
  name: 'web_search';
  content: string;
}

export interface ToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string;
  };
}

export interface OpenAIMessage {
  role: string;
  content: string | null;
  tool_calls?: ToolCall[];
  tool_call_id?: string;
  name?: string;
}

export interface OpenAIClient {
  chat: {
    completions: {
      create: (params: {
        model: string;
        messages: Array<OpenAIMessage>;
        temperature?: number;
        max_tokens?: number;
        tools?: unknown[];
        tool_choice?: unknown; // Can be string or object
        response_format?: { type: string };
      }) => Promise<{
        choices: Array<{
          message: OpenAIMessage;
        }>;
        model: string;
      }>;
    };
  };
  responses: {
    create: (params: {
      model: string;
      input: string;
      tools?: unknown[];
      include?: string[];
    }) => Promise<any>;
  };
}

export interface ChatCompletionParams {
  model: string;
  messages: Array<OpenAIMessage>;
  temperature?: number;
  max_tokens?: number;
  tools?: unknown[];
  response_format?: { type: string };
}

export interface APIKeysMissingError extends Error {
  code: 'API_KEYS_MISSING';
  missingKeys: {
    google: boolean;
    openai: boolean;
  };
  canUseMock: boolean;
}
