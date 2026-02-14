/**
 * State Versioning - Tracks state changes and detects conflicts
 *
 * Provides version tracking for state to detect concurrent modifications
 * and resolve conflicts.
 */
export interface VersionedState<T> {
    state: T;
    version: number;
    timestamp: number;
    lastModifiedBy?: string;
}
export interface StateVersionConflict<T> {
    local: VersionedState<T>;
    remote: VersionedState<T>;
    conflict: 'version_mismatch' | 'concurrent_modification';
}
/**
 * Create a versioned state wrapper
 */
export declare function createVersionedState<T>(initialState: T, version?: number): VersionedState<T>;
/**
 * Update versioned state
 */
export declare function updateVersionedState<T>(versionedState: VersionedState<T>, updateFn: (state: T) => T, options?: {
    lastModifiedBy?: string;
}): VersionedState<T>;
/**
 * Check for version conflicts
 */
export declare function detectVersionConflict<T>(local: VersionedState<T>, remote: VersionedState<T>): StateVersionConflict<T> | null;
/**
 * Resolve version conflict by merging states
 */
export declare function resolveVersionConflict<T>(conflict: StateVersionConflict<T>, mergeFn: (local: T, remote: T) => T): VersionedState<T>;
/**
 * Resolve version conflict by accepting remote state
 */
export declare function acceptRemoteState<T>(conflict: StateVersionConflict<T>): VersionedState<T>;
/**
 * Resolve version conflict by accepting local state
 */
export declare function acceptLocalState<T>(conflict: StateVersionConflict<T>): VersionedState<T>;
