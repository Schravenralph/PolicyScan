/**
 * Utility functions for categorizing and handling wizard session creation errors
 */
import type { WizardSessionError } from '../components/wizard/WizardSessionErrorDialog';
/**
 * Categorize an error for wizard session creation
 */
export declare function categorizeSessionError(error: unknown): WizardSessionError;
