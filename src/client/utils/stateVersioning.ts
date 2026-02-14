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
export function createVersionedState<T>(
  initialState: T,
  version: number = 1
): VersionedState<T> {
  return {
    state: initialState,
    version,
    timestamp: Date.now(),
  };
}

/**
 * Update versioned state
 */
export function updateVersionedState<T>(
  versionedState: VersionedState<T>,
  updateFn: (state: T) => T,
  options?: { lastModifiedBy?: string }
): VersionedState<T> {
  return {
    state: updateFn(versionedState.state),
    version: versionedState.version + 1,
    timestamp: Date.now(),
    lastModifiedBy: options?.lastModifiedBy,
  };
}

/**
 * Check for version conflicts
 */
export function detectVersionConflict<T>(
  local: VersionedState<T>,
  remote: VersionedState<T>
): StateVersionConflict<T> | null {
  if (local.version === remote.version) {
    return null; // No conflict
  }

  // Check if versions are close (concurrent modification)
  const versionDiff = Math.abs(local.version - remote.version);
  const timeDiff = Math.abs(local.timestamp - remote.timestamp);

  if (versionDiff === 1 && timeDiff < 1000) {
    // Likely concurrent modification (versions differ by 1, timestamps close)
    return {
      local,
      remote,
      conflict: 'concurrent_modification',
    };
  }

  // Version mismatch (versions differ significantly)
  return {
    local,
    remote,
    conflict: 'version_mismatch',
  };
}

/**
 * Resolve version conflict by merging states
 */
export function resolveVersionConflict<T>(
  conflict: StateVersionConflict<T>,
  mergeFn: (local: T, remote: T) => T
): VersionedState<T> {
  const mergedState = mergeFn(conflict.local.state, conflict.remote.state);
  
  // Use the higher version number
  const newVersion = Math.max(conflict.local.version, conflict.remote.version) + 1;
  
  return {
    state: mergedState,
    version: newVersion,
    timestamp: Date.now(),
  };
}

/**
 * Resolve version conflict by accepting remote state
 */
export function acceptRemoteState<T>(
  conflict: StateVersionConflict<T>
): VersionedState<T> {
  return {
    ...conflict.remote,
    version: conflict.remote.version + 1, // Increment to indicate resolution
    timestamp: Date.now(),
  };
}

/**
 * Resolve version conflict by accepting local state
 */
export function acceptLocalState<T>(
  conflict: StateVersionConflict<T>
): VersionedState<T> {
  return {
    ...conflict.local,
    version: conflict.remote.version + 1, // Use remote version + 1 to indicate resolution
    timestamp: Date.now(),
  };
}


