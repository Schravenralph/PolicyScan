/**
 * Mock DSO Ontsluiten Service
 * 
 * Provides mock implementation of DSOOntsluitenService for testing.
 * Implements the same interface as the real service but returns
 * configurable mock responses instead of making real API calls.
 */

import { MockServiceBase } from './MockServiceBase.js';
import { getMockServiceRegistry } from './MockServiceRegistry.js';
import { logger } from '../../utils/logger.js';
import type { DocumentSearchQuery, DocumentSuggestion } from '../external/DSOOntsluitenService.js';

export class MockDSOService extends MockServiceBase<DocumentSuggestion[], Error> {
  private useProduction: boolean = false;

  constructor(useProduction: boolean = false) {
    super();
    this.useProduction = useProduction;
    // Set default mock response
    this.setDefaultResponse(this.getDefaultMockSuggestions());
    getMockServiceRegistry().register('DSOOntsluitenService', this);
  }

  getServiceName(): string {
    return 'MockDSOService';
  }

  /**
   * Check if DSO API is configured (static method for validation before instantiation)
   * Always returns true for mock service
   */
  static isConfigured(useProduction: boolean = false): boolean {
    return true;
  }

  /**
   * Check if service is configured (always returns true for mock)
   */
  isConfigured(): boolean {
    return true;
  }

  /**
   * Mock health check implementation
   */
  async checkHealth(): Promise<boolean> {
    if (!this.isEnabled()) {
      logger.debug('MockDSOService is disabled, falling back to real service.');
      return false;
    }

    // Check for error scenario
    const errorKey = 'health';
    if (this.hasError(errorKey)) {
      const error = this.getError(errorKey);
      if (error) {
        throw error;
      }
    }

    // Health check always succeeds for mock
    return true;
  }

  /**
   * Mock suggestDocuments implementation
   */
  async suggestDocuments(query: DocumentSearchQuery): Promise<DocumentSuggestion[]> {
    if (!this.isEnabled()) {
      logger.debug('MockDSOService is disabled, falling back to real service.');
      // In a real scenario, you'd import and call the actual DSOOntsluitenService here
      // For now, we'll just return an empty array or throw if not configured
      return [];
    }

    logger.info({ query }, 'MockDSOService.suggestDocuments called');

    // Build key from query parameters
    const key = `suggest:${JSON.stringify(query)}`;
    
    // Check for error scenario
    if (this.hasError(key)) {
      const error = this.getError(key);
      if (error) {
        logger.warn(`MockDSOService returning error for key '${key}'.`);
        throw error;
      }
    }

    // Get mock response
    const response = this.getResponse(key);

    if (response) {
      logger.debug(`MockDSOService returning custom response for key '${key}'.`);
      // Filter results based on query parameters (simulate real behavior)
      return this.filterSuggestions(response, query);
    }

    // Return default response if no specific response set
    logger.debug(`MockDSOService returning default response for key '${key}'.`);
    return this.filterSuggestions(this.getDefaultMockSuggestions(), query);
  }

  /**
   * Filter suggestions based on query parameters (simulate real API behavior)
   */
  private filterSuggestions(
    suggestions: DocumentSuggestion[],
    query: DocumentSearchQuery
  ): DocumentSuggestion[] {
    let filtered = [...suggestions];

    // Filter by query term (fuzzy matching simulation)
    if (query.query) {
      const queryLower = query.query.toLowerCase();
      filtered = filtered.filter(suggestion => {
        const titleLower = suggestion.titel?.toLowerCase() || '';
        return titleLower.includes(queryLower);
      });
    }

    // Filter by identificatie
    if (query.identificatie) {
      filtered = filtered.filter(suggestion => 
        suggestion.identificatie === query.identificatie
      );
    }

    // Filter by titel
    if (query.titel) {
      const titelLower = query.titel.toLowerCase();
      filtered = filtered.filter(suggestion => {
        const suggestionTitel = suggestion.titel?.toLowerCase() || '';
        return suggestionTitel.includes(titelLower);
      });
    }

    // Filter by opgesteldDoor
    if (query.opgesteldDoor) {
      const opgesteldDoorLower = query.opgesteldDoor.toLowerCase();
      filtered = filtered.filter(suggestion => {
        const suggestionOpgesteldDoor = suggestion.opgesteldDoor?.toLowerCase() || '';
        return suggestionOpgesteldDoor.includes(opgesteldDoorLower);
      });
    }

    // Filter by type
    if (query.type) {
      filtered = filtered.filter(suggestion => 
        suggestion.type === query.type
      );
    }

    return filtered;
  }

  /**
   * Get default mock suggestions
   */
  private getDefaultMockSuggestions(): DocumentSuggestion[] {
    return [
      {
        identificatie: 'MOCK-DSO-001',
        titel: 'Mock Omgevingsplan Amsterdam Centrum',
        type: 'Omgevingsplan',
        opgesteldDoor: 'Gemeente Amsterdam',
        geldigheidsdatum: '2024-01-01',
        publicatiedatum: '2023-12-15',
        vervaldatum: undefined
      },
      {
        identificatie: 'MOCK-DSO-002',
        titel: 'Mock Omgevingsvisie Rotterdam',
        type: 'Omgevingsvisie',
        opgesteldDoor: 'Gemeente Rotterdam',
        geldigheidsdatum: '2024-02-01',
        publicatiedatum: '2024-01-20',
        vervaldatum: undefined
      },
      {
        identificatie: 'MOCK-DSO-003',
        titel: 'Mock Verordening Waterbeheer Utrecht',
        type: 'Verordening',
        opgesteldDoor: 'Gemeente Utrecht',
        geldigheidsdatum: '2024-03-01',
        publicatiedatum: '2024-02-15',
        vervaldatum: undefined
      }
    ];
  }
}


