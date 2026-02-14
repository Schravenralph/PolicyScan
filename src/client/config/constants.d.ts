/**
 * Client-side constants
 *
 * Constants specific to client-side operations.
 * These should not be used in server code.
 */
import { HTTP_STATUS, PAGINATION, TIMEOUTS, DELAYS } from '../../shared/constants';
/**
 * Re-export shared constants for convenience
 */
export { HTTP_STATUS, PAGINATION, TIMEOUTS, DELAYS };
/**
 * UI Configuration
 * User interface related constants
 */
export declare const UI: {
    readonly DEBOUNCE_DELAY: 300;
    readonly TOAST_DURATION: 5000;
    readonly ANIMATION_DURATION: 200;
    readonly MODAL_ANIMATION_DURATION: 300;
};
/**
 * Polling Configuration
 * Polling intervals for real-time updates
 */
export declare const POLLING: {
    readonly SHORT_INTERVAL: 1000;
    readonly MEDIUM_INTERVAL: 5000;
    readonly LONG_INTERVAL: 30000;
    readonly VERY_LONG_INTERVAL: 60000;
};
/**
 * Form Validation
 * Form validation related constants
 */
export declare const VALIDATION: {
    readonly MIN_PASSWORD_LENGTH: 8;
    readonly MAX_PASSWORD_LENGTH: 128;
    readonly MIN_USERNAME_LENGTH: 3;
    readonly MAX_USERNAME_LENGTH: 50;
    readonly MAX_EMAIL_LENGTH: 255;
    readonly MAX_URL_LENGTH: 2048;
};
/**
 * Local Storage Keys
 * Keys used for localStorage
 */
export declare const STORAGE_KEYS: {
    readonly AUTH_TOKEN: "auth_token";
    readonly USER_PREFERENCES: "user_preferences";
    readonly THEME: "theme";
    readonly LANGUAGE: "language";
};
/**
 * API Endpoints
 * Client-side API endpoint paths
 */
export declare const API_ENDPOINTS: {
    readonly AUTH: "/api/auth";
    readonly QUERIES: "/api/queries";
    readonly SCAN: "/api/scan";
    readonly WORKFLOWS: "/api/workflows";
    readonly CANONICAL_DOCUMENTS: "/api/canonical-documents";
    readonly WEBSITES: "/api/bronwebsites";
};
/**
 * Error Messages
 * User-facing error messages
 */
export declare const USER_ERROR_MESSAGES: {
    readonly NETWORK_ERROR: "Network error. Please check your connection.";
    readonly UNAUTHORIZED: "You are not authorized to perform this action.";
    readonly NOT_FOUND: "The requested resource was not found.";
    readonly SERVER_ERROR: "A server error occurred. Please try again later.";
    readonly VALIDATION_ERROR: "Please check your input and try again.";
};
/**
 * Workflow Configuration
 * Workflow-related constants and configuration
 */
export declare const WORKFLOWS: {
    /**
     * Workflow IDs that require the 'onderwerp' (subject) parameter
     * These workflows will fail validation if onderwerp is missing or empty
     */
    readonly REQUIRING_ONDERWERP: readonly ["standard-scan", "bfs-3-hop", "beleidsscan-graph", "beleidsscan-wizard", "external-links-exploration", "horst-aan-de-maas", "horst-labor-migration"];
    /**
     * Workflow ID prefix for beleidsscan step workflows
     * All workflows starting with this prefix also require onderwerp
     */
    readonly BELEIDSSCAN_STEP_PREFIX: "beleidsscan-step-";
};
