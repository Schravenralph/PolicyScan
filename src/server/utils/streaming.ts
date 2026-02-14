/**
 * Streaming utilities for large result sets
 * 
 * Provides utilities for streaming large result sets to prevent memory issues
 * and improve response times for large data exports.
 */

import { Response, Request } from 'express';

/**
 * Check if response socket is writable and client is still connected
 * Prevents EPIPE errors when writing to closed connections
 */
function isResponseWritable(res: Response, req: Request): boolean {
  return (
    !res.closed &&
    !(req as any).aborted &&
    !req.destroyed &&
    res.socket?.writable !== false &&
    !res.socket?.destroyed
  );
}

/**
 * Safely write to response, handling EPIPE and connection errors
 */
function safeWrite(res: Response, req: Request, chunk: string): boolean {
  if (!isResponseWritable(res, req)) {
    return false;
  }
  
  try {
    res.write(chunk);
    return true;
  } catch (error) {
    // Handle EPIPE and other write errors gracefully
    const errorMessage = error instanceof Error ? error.message : String(error);
    if (
      errorMessage.includes('EPIPE') ||
      errorMessage.includes('ECONNRESET') ||
      errorMessage.includes('socket hang up')
    ) {
      // Client disconnected - this is expected, not an error
      return false;
    }
    // Re-throw unexpected errors
    throw error;
  }
}

export interface StreamOptions {
  /** Content type for the response */
  contentType?: string;
  /** Whether to format as JSON array */
  formatAsJsonArray?: boolean;
  /** Chunk size for streaming */
  chunkSize?: number;
}

/**
 * Stream results as a JSON array
 * Useful for very large result sets that shouldn't be loaded entirely into memory
 * 
 * @param res Express response object
 * @param dataGenerator Async generator that yields data chunks
 * @param options Streaming options
 */
export async function streamJsonArray<T>(
  res: Response,
  dataGenerator: AsyncGenerator<T, void, unknown>,
  options: StreamOptions = {}
): Promise<void> {
  const {
    contentType = 'application/json',
    chunkSize = 100,
  } = options;

  res.setHeader('Content-Type', contentType);
  res.setHeader('Transfer-Encoding', 'chunked');
  
  // Get request object from response (Express attaches it as res.req)
  const req = res.req as unknown as Request;
  
  // Write opening bracket
  if (!safeWrite(res, req, '[')) {
    return; // Client disconnected
  }
  
  let isFirst = true;
  let count = 0;
  
  try {
    for await (const item of dataGenerator) {
      // Check if client is still connected before processing
      if (!isResponseWritable(res, req)) {
        break; // Client disconnected, stop streaming
      }
      
      if (!isFirst) {
        if (!safeWrite(res, req, ',')) {
          break; // Client disconnected
        }
      }
      
      if (!safeWrite(res, req, JSON.stringify(item))) {
        break; // Client disconnected
      }
      isFirst = false;
      count++;
      
      // Optional: Add chunk breaks for very large streams
      if (count % chunkSize === 0) {
        // Flush to send data immediately (optional optimization)
        if (res.flushHeaders && isResponseWritable(res, req)) {
          res.flushHeaders();
        }
      }
    }
    
    // Write closing bracket only if client is still connected
    if (isResponseWritable(res, req)) {
      safeWrite(res, req, ']');
      res.end();
    }
  } catch (error) {
    // Handle EPIPE and connection errors gracefully
    const errorMessage = error instanceof Error ? error.message : String(error);
    const isConnectionError = 
      errorMessage.includes('EPIPE') ||
      errorMessage.includes('ECONNRESET') ||
      errorMessage.includes('socket hang up') ||
      errorMessage.includes('write after end');
    
    if (isConnectionError) {
      // Client disconnected - this is expected, not an error
      // Just end the response if headers were sent
      if (res.headersSent && isResponseWritable(res, req)) {
        res.end();
      }
      return; // Don't throw - client disconnection is not an error
    }
    
    // For other errors, try to send error response
    if (!res.headersSent) {
      res.status(500).json({ error: 'Streaming error occurred' });
    } else if (isResponseWritable(res, req)) {
      res.end();
    }
    throw error;
  }
}

/**
 * Stream results as newline-delimited JSON (NDJSON)
 * Each line is a separate JSON object, more memory efficient for very large sets
 * 
 * @param res Express response object
 * @param dataGenerator Async generator that yields data chunks
 * @param options Streaming options
 */
export async function streamNdJson<T>(
  res: Response,
  dataGenerator: AsyncGenerator<T, void, unknown>,
  options: StreamOptions = {}
): Promise<void> {
  const {
    contentType = 'application/x-ndjson',
  } = options;

  res.setHeader('Content-Type', contentType);
  res.setHeader('Transfer-Encoding', 'chunked');
  
  // Get request object from response (Express attaches it as res.req)
  const req = res.req as unknown as Request;
  
  try {
    for await (const item of dataGenerator) {
      // Check if client is still connected before processing
      if (!isResponseWritable(res, req)) {
        break; // Client disconnected, stop streaming
      }
      
      if (!safeWrite(res, req, JSON.stringify(item) + '\n')) {
        break; // Client disconnected
      }
      
      // Flush after each item for real-time streaming
      if (res.flushHeaders && isResponseWritable(res, req)) {
        res.flushHeaders();
      }
    }
    
    // End response only if client is still connected
    if (isResponseWritable(res, req)) {
      res.end();
    }
  } catch (error) {
    // Handle EPIPE and connection errors gracefully
    const errorMessage = error instanceof Error ? error.message : String(error);
    const isConnectionError = 
      errorMessage.includes('EPIPE') ||
      errorMessage.includes('ECONNRESET') ||
      errorMessage.includes('socket hang up') ||
      errorMessage.includes('write after end');
    
    if (isConnectionError) {
      // Client disconnected - this is expected, not an error
      if (res.headersSent && isResponseWritable(res, req)) {
        res.end();
      }
      return; // Don't throw - client disconnection is not an error
    }
    
    // For other errors, try to send error response
    if (!res.headersSent) {
      res.status(500).json({ error: 'Streaming error occurred' });
    } else if (isResponseWritable(res, req)) {
      res.end();
    }
    throw error;
  }
}

/**
 * Check if result set should be streamed based on size
 * 
 * @param totalCount Total number of items
 * @param threshold Threshold above which to use streaming (default: 10000)
 * @returns Whether to use streaming
 */
export function shouldUseStreaming(totalCount: number, threshold = 10000): boolean {
  return totalCount > threshold;
}

