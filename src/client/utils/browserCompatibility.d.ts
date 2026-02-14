/**
 * Browser Compatibility Utility
 *
 * Provides feature detection and compatibility checking for browser features
 * required by the application.
 */
export interface BrowserCompatibilityStatus {
    compatible: boolean;
    features: {
        localStorage: boolean;
        sessionStorage: boolean;
        fetch: boolean;
        promises: boolean;
        asyncAwait: boolean;
        es6Classes: boolean;
        arrowFunctions: boolean;
        templateLiterals: boolean;
        destructuring: boolean;
        spreadOperator: boolean;
        cssGrid: boolean;
        cssFlexbox: boolean;
        intersectionObserver: boolean;
        resizeObserver: boolean;
        broadcastChannel: boolean;
        webWorkers: boolean;
    };
    missingFeatures: string[];
    warnings: string[];
    browserInfo: {
        userAgent: string;
        platform: string;
        language: string;
    };
}
/**
 * Check browser compatibility
 */
export declare function checkBrowserCompatibility(): BrowserCompatibilityStatus;
/**
 * Check if browser is compatible (quick check)
 */
export declare function isBrowserCompatible(): boolean;
/**
 * Get browser name and version (if detectable)
 */
export declare function getBrowserInfo(): {
    name: string;
    version: string;
    platform: string;
};
/**
 * Check if browser is recommended (modern browser)
 */
export declare function isRecommendedBrowser(): boolean;
