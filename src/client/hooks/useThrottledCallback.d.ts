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
export declare function useThrottledCallback<T extends (...args: any[]) => any>(callback: T, delay: number): T;
