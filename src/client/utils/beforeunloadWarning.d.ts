/**
 * Beforeunload Warning Utility
 *
 * Provides utilities for warning users about unsaved changes when leaving the page.
 */
export interface BeforeunloadConfig {
    enabled: boolean;
    message?: string;
    onBeforeUnload?: () => void;
    onSave?: () => Promise<void> | void;
}
/**
 * Enable beforeunload warning
 */
export declare function enableBeforeunloadWarning(config: BeforeunloadConfig): void;
/**
 * Disable beforeunload warning
 */
export declare function disableBeforeunloadWarning(): void;
/**
 * Set unsaved changes state
 */
export declare function setUnsavedChanges(hasUnsavedChanges: boolean): void;
/**
 * Save changes before leaving
 */
export declare function saveBeforeUnload(): Promise<boolean>;
/**
 * React hook for beforeunload warning
 */
export declare function useBeforeunloadWarning(config: BeforeunloadConfig): void;
