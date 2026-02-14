
/**
 * pLimit
 *
 * Limits the concurrency of async operations.
 * Similar to p-limit but lightweight and built-in.
 *
 * @param concurrency - Max number of concurrent operations
 * @returns A function that accepts a thunk (function returning a promise) and executes it with concurrency limit
 */
export function pLimit(concurrency: number) {
    if (!((Number.isInteger(concurrency) || concurrency === Infinity) && concurrency > 0)) {
		throw new TypeError('Expected `concurrency` to be a number from 1 and up');
	}

    const queue: (() => void)[] = [];
    let activeCount = 0;

    const next = () => {
        activeCount--;
        if (queue.length > 0) {
            const nextFn = queue.shift();
            if (nextFn) {
                nextFn();
            }
        }
    };

    const run = async <T>(fn: () => Promise<T>): Promise<T> => {
        const execute = async () => {
            activeCount++;
            try {
                return await fn();
            } finally {
                next();
            }
        };

        if (activeCount < concurrency) {
            return execute();
        } else {
            return new Promise<T>((resolve, reject) => {
                queue.push(() => {
                    execute().then(resolve, reject);
                });
            });
        }
    };

    Object.defineProperties(run, {
        activeCount: {
            get: () => activeCount,
        },
        pendingCount: {
            get: () => queue.length,
        },
        clearQueue: {
            value: () => {
                queue.length = 0;
            },
        },
    });

    return run;
}

/**
 * Helper to limit concurrency of async operations.
 * Uses pLimit to process items with controlled concurrency.
 *
 * @param items - Items to process
 * @param limit - Maximum number of concurrent operations
 * @param fn - Async function to process each item
 */
export async function limitConcurrency<T>(
    items: T[],
    limit: number,
    fn: (item: T) => Promise<void>
): Promise<void> {
    const limitFn = pLimit(limit);
    await Promise.all(items.map(item => limitFn(() => fn(item))));
}
