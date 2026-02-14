/**
 * WizardStepDefinition - Single source of truth for wizard step contracts
 * 
 * This interface defines the contract for wizard steps, including:
 * - Validation schemas (input/output) using Zod
 * - Prerequisites (which steps must be completed first)
 * - Navigation rules (next, prev, canGoBack, canJumpTo)
 * - Completion criteria (function to determine if step is complete)
 * 
 * All API routes and modules should import and use the exact same schemas
 * from this definition to prevent duplication.
 */

import type { ZodSchema } from 'zod';
import type { WizardSessionDocument } from '../../types/WizardSession.js';

/**
 * Navigation rules for a wizard step
 */
export interface WizardStepNavigation {
  /**
   * Next step ID (if applicable)
   */
  next?: string;

  /**
   * Previous step ID (if applicable)
   */
  prev?: string;

  /**
   * Whether the user can go back from this step
   */
  canGoBack: boolean;

  /**
   * Whether the user can jump directly to this step (skip prerequisites)
   */
  canJumpTo: boolean;
}

/**
 * WizardStepDefinition interface
 * 
 * Defines the complete contract for a wizard step, including validation,
 * prerequisites, navigation, and completion criteria.
 */
export interface WizardStepDefinition {
  /**
   * Unique identifier for the step
   */
  id: string;

  /**
   * Human-readable name of the step
   */
  name: string;

  /**
   * Optional description of the step
   */
  description?: string;

  /**
   * Zod schema for validating step input
   * 
   * This schema should be used by:
   * - API routes for request validation
   * - Frontend components for form validation
   * - Step execution logic for input validation
   */
  inputSchema: ZodSchema<unknown>;

  /**
   * Zod schema for validating step output
   * 
   * This schema should be used by:
   * - Step execution logic for output validation
   * - API routes for response validation
   * - Frontend components for result validation
   */
  outputSchema: ZodSchema<unknown>;

  /**
   * Array of step IDs that must be completed before this step can be accessed
   * 
   * Empty array means no prerequisites (step can be accessed immediately)
   */
  prerequisites: string[];

  /**
   * Navigation rules for this step
   */
  navigation: WizardStepNavigation;

  /**
   * Function to determine if the step is complete
   * 
   * @param session - The current wizard session
   * @returns true if the step is complete, false otherwise
   */
  completionCriteria: (session: WizardSessionDocument) => boolean;
}


