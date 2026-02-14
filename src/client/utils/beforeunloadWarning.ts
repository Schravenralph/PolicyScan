/**
 * Beforeunload Warning Utility
 * 
 * Provides utilities for warning users about unsaved changes when leaving the page.
 */

import React from 'react';

export interface BeforeunloadConfig {
  enabled: boolean;
  message?: string;
  onBeforeUnload?: () => void;
  onSave?: () => Promise<void> | void;
}

class BeforeunloadWarningManager {
  private config: BeforeunloadConfig | null = null;
  private hasUnsavedChanges: boolean = false;

  /**
   * Enable beforeunload warning
   */
  enable(config: BeforeunloadConfig): void {
    this.config = config;
    this.hasUnsavedChanges = true;
    this.setupBeforeunload();
  }

  /**
   * Disable beforeunload warning
   */
  disable(): void {
    this.config = null;
    this.hasUnsavedChanges = false;
    this.removeBeforeunload();
  }

  /**
   * Set unsaved changes state
   */
  setUnsavedChanges(hasUnsavedChanges: boolean): void {
    this.hasUnsavedChanges = hasUnsavedChanges;
    if (hasUnsavedChanges && this.config) {
      this.setupBeforeunload();
    } else {
      this.removeBeforeunload();
    }
  }

  /**
   * Setup beforeunload handler
   */
  private setupBeforeunload(): void {
    if (typeof window === 'undefined') {
      return;
    }

    const handler = (event: BeforeUnloadEvent) => {
      if (!this.hasUnsavedChanges || !this.config?.enabled) {
        return;
      }

      // Call custom handler if provided
      if (this.config.onBeforeUnload) {
        this.config.onBeforeUnload();
      }

      // Standard browser warning
      event.preventDefault();
      event.returnValue = this.config.message || 'You have unsaved changes. Are you sure you want to leave?';
      return event.returnValue;
    };

    window.addEventListener('beforeunload', handler);
  }

  /**
   * Remove beforeunload handler
   */
  private removeBeforeunload(): void {
    if (typeof window === 'undefined') {
      return;
    }

    // Note: We can't remove the specific handler, but we can disable it
    // by setting hasUnsavedChanges to false
  }

  /**
   * Save changes before leaving
   */
  async saveBeforeUnload(): Promise<boolean> {
    if (!this.config?.onSave) {
      return false;
    }

    try {
      await this.config.onSave();
      this.setUnsavedChanges(false);
      return true;
    } catch (error) {
      console.error('Failed to save before unload:', error);
      return false;
    }
  }
}

// Singleton instance
const beforeunloadWarningManager = new BeforeunloadWarningManager();

/**
 * Enable beforeunload warning
 */
export function enableBeforeunloadWarning(config: BeforeunloadConfig): void {
  beforeunloadWarningManager.enable(config);
}

/**
 * Disable beforeunload warning
 */
export function disableBeforeunloadWarning(): void {
  beforeunloadWarningManager.disable();
}

/**
 * Set unsaved changes state
 */
export function setUnsavedChanges(hasUnsavedChanges: boolean): void {
  beforeunloadWarningManager.setUnsavedChanges(hasUnsavedChanges);
}

/**
 * Save changes before leaving
 */
export async function saveBeforeUnload(): Promise<boolean> {
  return beforeunloadWarningManager.saveBeforeUnload();
}

/**
 * React hook for beforeunload warning
 */
export function useBeforeunloadWarning(config: BeforeunloadConfig) {
  React.useEffect(() => {
    if (config.enabled) {
      enableBeforeunloadWarning(config);
      return () => {
        disableBeforeunloadWarning();
      };
    }
  }, [config.enabled, config.message, config.onBeforeUnload, config.onSave]);
}

