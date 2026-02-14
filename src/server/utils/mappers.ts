/**
 * Data transformation utilities
 * Maps between domain objects and DTOs
 */

import type { QueryDocument } from '../types/index.js';
import type {
  QueryResponseDto,
  QueryScanResponseDto,
  QueryProgressResponseDto,
  WebsiteSuggestionDto,
  CommonCrawlCdxResultDto,
  CommonCrawlQueryResponseDto,
  CommonCrawlCrawlDto,
  CommonCrawlQueryWithCountDto,
  CommonCrawlQueriesResponseDto,
  AdminUserDto,
  AdminWorkflowRunDto,
  AdminDashboardAlertDto,
  KGNodeDto,
  KGEdgeDto,
  RelationshipDto,
  EnrichedTripleDto
} from '../types/dto.js';
import { ObjectId } from 'mongodb';
import { createHash } from 'crypto';
// QueryScanResult type definition (matches the structure expected by the mapper)
interface QueryScanResult {
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

import type { QueryProgress } from '../services/query/QueryProgressService.js';
import type { KnowledgeDocument } from '../services/knowledgeBase/knowledgeBase.js';
import type { WebsiteSuggestion } from '../services/website-suggestion/WebsiteSuggestionService.js';

interface SearchResult {
  document: KnowledgeDocument;
  relevanceScore: number;
}

/**
 * Map Query domain object to QueryResponseDto
 */
export function mapQueryToDto(query: QueryDocument): QueryResponseDto {
  return {
    _id: query._id?.toString() ?? '',
    onderwerp: query.onderwerp,
    overheidstype: query.overheidstype,
    overheidsinstantie: query.overheidsinstantie,
    websiteTypes: query.websiteTypes,
    websiteUrls: query.websiteUrls,
    status: query.status,
    finalizedAt: query.finalizedAt,
    createdAt: query.createdAt,
    updatedAt: query.updatedAt
  };
}

/**
 * Map QueryScanResult to QueryScanResponseDto
 */
export function mapQueryScanResultToDto(result: QueryScanResult): QueryScanResponseDto {
  return {
    queryId: result.queryId,
    queryText: result.queryText,
    results: result.results,
    relatedContent: result.relatedContent,
    totalResults: result.totalResults
  };
}

/**
 * Map QueryProgress to QueryProgressResponseDto
 */
export function mapQueryProgressToDto(progress: QueryProgress): QueryProgressResponseDto {
  return {
    queryId: progress.queryId,
    progress: progress.progress,
    status: progress.status,
    estimatedSecondsRemaining: progress.estimatedSecondsRemaining,
    currentStep: progress.currentStep,
    totalSteps: progress.totalSteps,
    startedAt: progress.startedAt,
    lastUpdated: progress.lastUpdated,
    error: progress.error
  };
}

/**
 * Map knowledge base search results to QueryScanResponseDto
 */
export function mapKnowledgeBaseScanToDto(
  queryId: string,
  queryText: string,
  searchResults: SearchResult[],
  relatedContent: KnowledgeDocument[]
): QueryScanResponseDto {
  // Extract excerpt from content (first 200 characters)
  const getExcerpt = (content: string): string => {
    return content.length > 200 ? content.substring(0, 200) + '...' : content;
  };

  return {
    queryId,
    queryText,
    results: searchResults.map((result) => ({
      url: result.document.url,
      title: result.document.title,
      filePath: result.document.filePath,
      relevanceScore: result.relevanceScore,
      excerpt: getExcerpt(result.document.content),
      metadata: result.document.metadata
    })),
    relatedContent: relatedContent.map((doc) => ({
      url: doc.url,
      title: doc.title,
      filePath: doc.filePath
    })),
    totalResults: searchResults.length
  };
}

/**
 * Generate a temporary ID for a website suggestion based on its URL
 * This ensures the same URL always gets the same ID, making it deterministic
 */
function generateWebsiteSuggestionId(url: string): string {
  // Create a deterministic hash from the URL
  // Use first 24 characters of hex hash to match MongoDB ObjectId length
  const hash = createHash('sha256').update(url).digest('hex');
  return hash.substring(0, 24);
}

/**
 * Map WebsiteSuggestion domain object to WebsiteSuggestionDto
 */
export function mapWebsiteSuggestionToDto(suggestion: WebsiteSuggestion): WebsiteSuggestionDto {
  return {
    _id: generateWebsiteSuggestionId(suggestion.url), // Generate temporary ID from URL
    titel: suggestion.titel,
    url: suggestion.url,
    samenvatting: suggestion.samenvatting,
    website_types: suggestion.website_types,
    'relevantie voor zoekopdracht': suggestion.relevantie || 'AI-generated recommendation',
    accepted: null,
    label: 'suggested',
    subjects: [],
    themes: []
  };
}

/**
 * Map array of WebsiteSuggestion domain objects to WebsiteSuggestionDto array
 */
export function mapWebsiteSuggestionsToDto(suggestions: WebsiteSuggestion[]): WebsiteSuggestionDto[] {
  return suggestions.map(mapWebsiteSuggestionToDto);
}

/**
 * Common Crawl Mappers
 */

/**
 * Map MongoDB index record to CommonCrawlCdxResultDto
 */
export function mapMongoIndexRecordToDto(record: {
  urlkey: string;
  timestamp: string;
  url: string;
  mime: string;
  status: string;
  digest: string;
  length: number | string;
  offset: string;
  filename: string;
}): CommonCrawlCdxResultDto {
  return {
    urlkey: record.urlkey,
    timestamp: record.timestamp,
    url: record.url,
    mime: record.mime,
    status: record.status,
    digest: record.digest,
    length: typeof record.length === 'string' ? record.length : record.length.toString(),
    offset: record.offset,
    filename: record.filename,
  };
}

/**
 * Map CDX API result to CommonCrawlCdxResultDto
 */
export function mapCdxResultToDto(result: {
  urlkey?: string;
  timestamp?: string;
  url?: string;
  mime?: string;
  status?: string;
  digest?: string;
  length?: string;
  offset?: string;
  filename?: string;
}): CommonCrawlCdxResultDto {
  return {
    urlkey: result.urlkey || '',
    timestamp: result.timestamp || '',
    url: result.url || '',
    mime: result.mime || 'unknown',
    status: result.status || 'unknown',
    digest: result.digest || '',
    length: result.length || '0',
    offset: result.offset || '',
    filename: result.filename || '',
  };
}

/**
 * Map array of MongoDB index records to CommonCrawlCdxResultDto array
 */
export function mapMongoIndexRecordsToDto(
  records: Array<{
    urlkey: string;
    timestamp: string;
    url: string;
    mime: string;
    status: string;
    digest: string;
    length: number | string;
    offset: string;
    filename: string;
  }>
): CommonCrawlCdxResultDto[] {
  return records.map(mapMongoIndexRecordToDto);
}

/**
 * Map array of CDX API results to CommonCrawlCdxResultDto array
 */
export function mapCdxResultsToDto(
  results: Array<{
    urlkey?: string;
    timestamp?: string;
    url?: string;
    mime?: string;
    status?: string;
    digest?: string;
    length?: string;
    offset?: string;
    filename?: string;
  }>
): CommonCrawlCdxResultDto[] {
  return results.map(mapCdxResultToDto);
}

/**
 * Map crawl info to CommonCrawlCrawlDto
 */
export function mapCrawlInfoToDto(
  crawl: { id: string; name?: string },
  index: number,
  extractDate: (crawlId: string) => string
): CommonCrawlCrawlDto {
  return {
    id: crawl.id,
    name: index === 0 ? `${crawl.name || crawl.id} (Latest)` : (crawl.name || crawl.id),
    date: extractDate(crawl.id),
  };
}

/**
 * Map array of crawl infos to CommonCrawlCrawlDto array
 */
export function mapCrawlInfosToDto(
  crawls: Array<{ id: string; name?: string }>,
  extractDate: (crawlId: string) => string
): CommonCrawlCrawlDto[] {
  return crawls.map((crawl, index) => mapCrawlInfoToDto(crawl, index, extractDate));
}

/**
 * Map Common Crawl query with result count to DTO
 */
export function mapCommonCrawlQueryWithCountToDto(
  query: {
    _id: string;
    query: string;
    domainFilter: string;
    crawlId: string;
    status: string;
    createdAt: Date;
    updatedAt: Date;
  },
  resultCount: number
): CommonCrawlQueryWithCountDto {
  return {
    _id: query._id,
    query: query.query,
    domainFilter: query.domainFilter,
    crawlId: query.crawlId,
    status: query.status,
    createdAt: query.createdAt,
    updatedAt: query.updatedAt,
    resultCount,
  };
}

/**
 * Admin Mappers
 */

/**
 * Map user to AdminUserDto
 */
export function mapUserToAdminDto(user: {
  _id: unknown;
  name: string;
  email: string;
  role: string;
  createdAt: Date;
  lastLogin?: Date | null;
  active?: boolean;
}): AdminUserDto {
  return {
    _id: user._id instanceof ObjectId ? user._id.toString() : String(user._id),
    name: user.name,
    email: user.email,
    role: user.role,
    createdAt: user.createdAt.toISOString(),
    lastLogin: user.lastLogin ? user.lastLogin.toISOString() : null,
    active: user.active !== false,
  };
}

/**
 * Map workflow run to AdminWorkflowRunDto
 */
export function mapWorkflowRunToAdminDto(run: {
  _id: unknown;
  createdAt?: Date;
  startTime?: Date;
  endTime?: Date;
  status?: string;
  error?: string;
}): AdminWorkflowRunDto {
  return {
    _id: run._id instanceof ObjectId ? run._id.toString() : String(run._id),
    createdAt: run.createdAt || run.startTime,
    startTime: run.startTime,
    endTime: run.endTime,
    status: run.status,
    error: run.error,
    duration: run.startTime && run.endTime ? run.endTime.getTime() - run.startTime.getTime() : null,
  };
}

/**
 * Map alert to AdminDashboardAlertDto
 */
export function mapAlertToDashboardDto(alert: {
  current_value: number;
  threshold: number;
  [key: string]: unknown;
}): AdminDashboardAlertDto {
  return {
    ...alert,
    percentage: (alert.current_value / alert.threshold) * 100,
    status: alert.current_value > alert.threshold * 1.5 ? 'critical' : 'warning',
  };
}

/**
 * Knowledge Graph Mappers
 */

/**
 * Map BaseEntity to KGNodeDto
 */
export function mapEntityToKGNodeDto(
  node: {
    id: string;
    type: string;
    name?: string;
    description?: string;
    [key: string]: unknown;
  },
  getDefaultName?: (node: { type: string; [key: string]: unknown }) => string | undefined,
  getDefaultDescription?: (node: { type: string; [key: string]: unknown }) => string | undefined
): KGNodeDto {
  const base = {
    id: node.id,
    type: node.type,
    name: node.name || getDefaultName?.(node) || 'Unknown',
    description: node.description || getDefaultDescription?.(node) || undefined,
  };
  // Merge with node properties, but base properties take precedence
  return { ...node, ...base } as KGNodeDto;
}

/**
 * Map array of entities to KGNodeDto array
 */
export function mapEntitiesToKGNodeDto(
  nodes: Array<{
    id: string;
    type: string;
    name?: string;
    description?: string;
    [key: string]: unknown;
  }>,
  getDefaultName?: (node: { type: string; [key: string]: unknown }) => string | undefined,
  getDefaultDescription?: (node: { type: string; [key: string]: unknown }) => string | undefined
): KGNodeDto[] {
  return nodes.map((node) => mapEntityToKGNodeDto(node, getDefaultName, getDefaultDescription));
}

/**
 * Map edge to KGEdgeDto
 */
export function mapEdgeToKGEdgeDto(edge: {
  sourceId: string;
  targetId: string;
  type: string;
}): KGEdgeDto {
  return {
    sourceId: edge.sourceId,
    targetId: edge.targetId,
    type: edge.type,
  };
}

/**
 * Map array of edges to KGEdgeDto array
 */
export function mapEdgesToKGEdgeDto(
  edges: Array<{
    sourceId: string;
    targetId: string;
    type: string;
  }>
): KGEdgeDto[] {
  return edges.map(mapEdgeToKGEdgeDto);
}

/**
 * Map relationship to RelationshipDto
 */
export function mapRelationshipToDto(rel: {
  type: string;
  targetId: string;
}): RelationshipDto {
  return {
    type: rel.type,
    targetId: rel.targetId,
  };
}

/**
 * Map array of relationships to RelationshipDto array
 */
export function mapRelationshipsToDto(
  relationships: Array<{
    type: string;
    targetId: string;
  }>
): RelationshipDto[] {
  return relationships.map(mapRelationshipToDto);
}

/**
 * Map enriched triple to EnrichedTripleDto
 */
export function mapEnrichedTripleToDto(triple: {
  source: {
    id: string;
    type?: string;
    name?: string;
  } | null;
  target: {
    id: string;
    type?: string;
    name?: string;
  } | null;
  relationship: string;
  metadata?: Record<string, unknown>;
  sourceId?: string;
  targetId?: string;
}): EnrichedTripleDto {
  return {
    source: triple.source || { id: triple.sourceId || '' },
    target: triple.target || { id: triple.targetId || '' },
    relationship: triple.relationship,
    metadata: triple.metadata,
  };
}

/**
 * Map array of enriched triples to EnrichedTripleDto array
 */
export function mapEnrichedTriplesToDto(
  triples: Array<{
    source: {
      id: string;
      type?: string;
      name?: string;
    } | null;
    target: {
      id: string;
      type?: string;
      name?: string;
    } | null;
    relationship: string;
    metadata?: Record<string, unknown>;
    sourceId?: string;
    targetId?: string;
  }>
): EnrichedTripleDto[] {
  return triples.map(mapEnrichedTripleToDto);
}
