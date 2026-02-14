import type * as OpenAIModule from 'openai';

/**
 * Interface for the global object with the mock OpenAI module.
 * This pattern is used for testing purposes to inject a mock OpenAI module.
 */
interface GlobalWithMockOpenAI {
  __MOCK_OPENAI__?: typeof OpenAIModule;
}

/**
 * Retrieves the OpenAI module, supporting a global mock injection for testing.
 * This encapsulates the type assertion required for the mock injection pattern.
 *
 * @returns The OpenAI module or the mock implementation.
 */
export async function getOpenAIModule(): Promise<typeof OpenAIModule> {
  // Use a type intersection to safely access the global mock property without 'unknown' casting
  const globalWithMock = globalThis as typeof globalThis & GlobalWithMockOpenAI;

  if (globalWithMock.__MOCK_OPENAI__) {
    return globalWithMock.__MOCK_OPENAI__;
  }

  return import('openai');
}
