import { useCallback, useRef, useEffect } from 'react';

/**
 * Custom hook to throttle a callback function.
 * The callback will be executed at most once every `delay` milliseconds.
 * A trailing call is guaranteed if the last call was throttled.
 * The trailing call will use the arguments from the most recent call.
 *
 * @param callback - The function to throttle
 * @param delay - The throttle delay in milliseconds
 * @returns A throttled version of the callback
 */
export function useThrottledCallback<T extends (...args: any[]) => any>(
  callback: T,
  delay: number
): T {
  const lastCallRef = useRef<number>(0);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const callbackRef = useRef(callback);
  const argsRef = useRef<any[]>([]);

  // Keep callback fresh
  callbackRef.current = callback;

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  return useCallback((...args: any[]) => {
    const now = Date.now();
    const timeSinceLastCall = now - lastCallRef.current;

    argsRef.current = args;

    if (timeSinceLastCall >= delay) {
      lastCallRef.current = now;
      callbackRef.current(...args);
      // Clear any pending trailing call
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
    } else {
      // Schedule a trailing call
      if (!timeoutRef.current) {
        const remainingTime = delay - timeSinceLastCall;
        timeoutRef.current = setTimeout(() => {
          lastCallRef.current = Date.now();
          // Use the most recent arguments
          callbackRef.current(...argsRef.current);
          timeoutRef.current = null;
        }, remainingTime);
      }
    }
  }, [delay]) as T;
}
