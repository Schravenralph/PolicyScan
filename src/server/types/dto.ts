/**
 * Data Transfer Objects (DTOs) for API boundaries
 * These interfaces define the shape of data as it crosses API boundaries
 */

import type { QueryCreateInput } from './index.js';

/**
 * Query DTOs
 */
export interface QueryResponseDto {
  _id: string;
  onderwerp: string;
  overheidstype?: string;
  overheidsinstantie?: string;
  websiteTypes?: string[];
  websiteUrls?: string[];
  status?: 'draft' | 'completed';
  finalizedAt?: Date;
  createdAt?: Date;
  updatedAt?: Date;
}

export type QueryCreateDto = QueryCreateInput;

export type QueryUpdateDto = Partial<QueryCreateInput>;

/**
 * Query Scan DTOs
 */
export interface QueryScanResponseDto {
  queryId: string;
  queryText: string;
  results: Array<{
    url: string;
    title: string;
    filePath: string;
    relevanceScore: number;
    excerpt: string;
    metadata: Record<string, unknown>;
  }>;
  relatedContent: Array<{
    url: string;
    title: string;
    filePath: string;
  }>;
  totalResults: number;
}

/**
 * Website Suggestion DTOs
 */
export interface WebsiteSuggestionDto {
  _id?: string; // Temporary ID for suggestions (generated from URL hash)
  titel: string;
  url: string;
  samenvatting: string;
  website_types: string[];
  'relevantie voor zoekopdracht': string;
  accepted: null;
  label: string;
  subjects: string[];
  themes: string[];
}

export interface WebsiteSuggestionResponseDto {
  success: boolean;
  websites: WebsiteSuggestionDto[];
  isMock?: boolean;
  metadata?: {
    aiSuggestionsCount: number; // Number of AI-generated suggestions (excluding municipality)
    municipalityWebsiteIncluded: boolean; // Whether municipality website was included
    onlyMunicipalityWebsite: boolean; // True if only municipality website exists (AI found nothing)
  };
}

// Alias for backward compatibility (used in WebsiteSuggestionOrchestrator)
export type WebsiteSuggestionDTO = WebsiteSuggestionDto;
export type WebsiteSuggestionsResponseDTO = WebsiteSuggestionResponseDto;

/**
 * Scan Job DTOs
 */
export interface ScanJobResponseDto {
  success: boolean;
  jobId?: string | number | undefined;
  queryId?: string;
  status?: string;
  message: string;
  runId?: string;
  documents?: unknown[];
  documentsFound?: number;
}

export interface JobStatusResponseDto {
  jobId: string | number | undefined;
  queryId: string;
  status: string;
  progress: number;
  createdAt: string;
  priority?: number;
  result?: unknown;
  error?: string;
}

export interface JobsListResponseDto {
  queryId: string;
  jobs: Array<{
    jobId: string | number | undefined;
    queryId: string;
    status: string;
    progress: number;
    createdAt: string;
    priority?: number;
    failedReason?: string;
  }>;
  count: number;
}

export interface ScanStatusResponseDto {
  status: string;
  documentsFound: number;
  sourcesFound: number;
}

/**
 * Progress DTOs
 */
export interface QueryProgressResponseDto {
  queryId: string;
  progress: number;
  status: 'analyzing' | 'searching' | 'evaluating' | 'generating' | 'completed' | 'error';
  estimatedSecondsRemaining?: number;
  currentStep?: string;
  totalSteps?: number;
  startedAt: number;
  lastUpdated: number;
  error?: string;
}

/**
 * Error DTOs
 */
export interface ApiErrorDto {
  error: string;
  message?: string;
  code?: string;
  missingKeys?: string[];
  canUseMock?: boolean;
}

/**
 * Knowledge Graph DTOs
 */
export interface KGNodeDto {
  id: string;
  type: string;
  name: string;
  description?: string;
  [key: string]: unknown; // Allow additional properties from domain objects
}

export interface KGEdgeDto {
  sourceId: string;
  targetId: string;
  type: string;
}

export interface RelationshipDto {
  type: string;
  targetId: string;
}

export interface EnrichedTripleDto {
  source: {
    id: string;
    type?: string;
    name?: string;
  };
  target: {
    id: string;
    type?: string;
    name?: string;
  };
  relationship: string;
  metadata?: Record<string, unknown>;
}

/**
 * Common Crawl DTOs
 */
export interface CommonCrawlCdxResultDto {
  urlkey: string;
  timestamp: string;
  url: string;
  mime: string;
  status: string;
  digest: string;
  length: string;
  offset: string;
  filename: string;
}

export interface CommonCrawlQueryResponseDto {
  results: CommonCrawlCdxResultDto[];
  total: number;
  crawlId: string;
  query: string;
  originalQuery?: string;
  filtered?: boolean;
  source: 'mongodb' | 'api';
}

export interface CommonCrawlCrawlDto {
  id: string;
  name: string;
  date: string;
}

export interface CommonCrawlQueryWithCountDto {
  _id: string;
  query: string;
  domainFilter: string;
  crawlId: string;
  status: string;
  createdAt: Date;
  updatedAt: Date;
  resultCount: number;
}

export interface CommonCrawlQueriesResponseDto {
  data: CommonCrawlQueryWithCountDto[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasMore: boolean;
  };
}

/**
 * Admin DTOs
 */
export interface AdminUserDto {
  _id: string;
  name: string;
  email: string;
  role: string;
  createdAt: string;
  lastLogin: string | null;
  active: boolean;
}

export interface AdminWorkflowRunDto {
  _id: string;
  createdAt?: Date;
  startTime?: Date;
  endTime?: Date;
  status?: string;
  error?: string;
  duration: number | null;
}

export interface AdminDashboardAlertDto {
  [key: string]: unknown;
  percentage: number;
  status: 'critical' | 'warning';
}

/**
 * Module DTOs
 */
export interface ModuleMetadataDto {
  id: string;
  name: string;
  version: string;
  description: string;
  category: string;
  author: {
    name: string;
    email?: string;
    url?: string;
  };
  license: string;
  repository?: string;
  tags: string[];
  dependencies: Array<{
    moduleId: string;
    version?: string;
    required?: boolean;
  }>;
  keywords?: string[];
  homepage?: string;
  icon?: string;
  published: boolean;
  createdAt: string;
  updatedAt: string;
  compatibility?: {
    minEngineVersion?: string;
    maxEngineVersion?: string;
  };
}

export interface ModuleRegistryEntryDto {
  metadata: ModuleMetadataDto;
  registeredAt: string;
  usageCount: number;
}

export interface ModuleListResponseDto {
  modules: ModuleRegistryEntryDto[];
  total: number;
  hasMore: boolean;
}

export interface ModuleParameterSchemaDto {
  [key: string]: {
    type: 'string' | 'number' | 'boolean' | 'array' | 'object';
    label: string;
    description?: string;
    required?: boolean;
    default?: unknown;
    options?: Array<{ value: string | number; label: string }>;
    validation?: {
      min?: number;
      max?: number;
      pattern?: string;
    };
  };
}
