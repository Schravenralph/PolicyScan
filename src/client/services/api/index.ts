import { BaseApiService } from './BaseApiService';
import { AuthApiService } from './AuthApiService';
import { QueryApiService } from './QueryApiService';
import { BronWebsiteApiService } from './BronWebsiteApiService';
import { CanonicalDocumentApiService } from './CanonicalDocumentApiService';
import { FeedbackApiService } from './FeedbackApiService';
import { WorkflowApiService } from './WorkflowApiService';
import { NotificationApiService } from './NotificationApiService';
import { SubgraphApiService } from './SubgraphApiService';
import { CommonCrawlApiService } from './CommonCrawlApiService';
import { ReviewApiService } from './ReviewApiService';
import { AICrawlingApiService } from './AICrawlingApiService';
import { HierarchyApiService } from './HierarchyApiService';
import { ErrorMonitoringApiService } from './ErrorMonitoringApiService';
import { GraphApiService } from './GraphApiService';
import { SustainabilityApiService } from './SustainabilityApiService';
import { WizardApiService } from './WizardApiService';
import { ExportTemplateApiService } from './ExportTemplateApiService';
import { WorkflowConfigurationApiService } from './WorkflowConfigurationApiService';
import { KnowledgeGraphManagementApiService } from './KnowledgeGraphManagementApiService';
import { csrfService } from '../csrfService';

// Re-export types for backward compatibility
import type { QueryData } from './QueryApiService';
import type { BronWebsite } from './BronWebsiteApiService';
import type { User } from './AuthApiService';
// Legacy BronDocument type (for backward compatibility in migration)
import type { BronDocument } from '../../utils/transformations';
import type { UserInteraction, DocumentFeedback, QAFeedback } from '../../types/feedback';
import type { CanonicalDocument } from './CanonicalDocumentApiService';

export type { QueryData } from './QueryApiService';
export type { BronWebsite } from './BronWebsiteApiService';
export type { User } from './AuthApiService';
export type { BronDocument } from '../../utils/transformations';
export type { SustainabilityMetrics } from './SustainabilityApiService';
export type { SustainabilityKPI } from './SustainabilityApiService';
export type { MetaGraphResponse } from './GraphApiService';
export type { ClusterNode } from './GraphApiService';
export type { NavigationGraphResponse } from './GraphApiService';
export type { NavigationNode } from './GraphApiService';
export type { GraphHealthResponse } from './GraphApiService';
export type { GraphRAGQueryOptions } from './GraphApiService';
export type { GraphRAGResponse } from './GraphApiService';

// Re-export CanonicalDocument and related types/interfaces
export type {
  CanonicalDocument,
  CanonicalDocumentWithExtensions,
  CanonicalDocumentDraft,
  ArtifactRef,
  ArtifactProvenance,
  BundleFileEntry,
  ExtensionType,
  PaginationParams,
  DocumentFilterParams
} from './CanonicalDocumentApiService';
export type {
  WorkflowDocument,
  WorkflowOutput,
  Run,
} from './WorkflowApiService';
export type { Subgraph, SubgraphMetadata } from './SubgraphApiService';
export type { WorkflowComparison } from '../../hooks/useWorkflowComparison';
export type {
  ExportTemplate,
  ExportFormat,
  ExportTemplateCreateInput,
  ExportTemplateUpdateInput,
  TemplateValidationResult,
} from './ExportTemplateApiService';
export type {
  WorkflowConfiguration,
  AvailableBeleidsscanWorkflow,
  ConfigurableFeatureFlag,
  WorkflowConfigurationCreateInput,
  WorkflowConfigurationUpdateInput,
} from './WorkflowConfigurationApiService';

/**
 * Main API Service that composes all domain-specific services
 * Maintains backward compatibility with the original monolithic ApiService
 */
export class ApiService extends BaseApiService {
  // Public admin methods that wrap protected BaseApiService methods
  async patch<T>(endpoint: string, data?: unknown): Promise<T> {
    return super.patch<T>(endpoint, data);
  }

  async put<T>(endpoint: string, data?: unknown): Promise<T> {
    return super.put<T>(endpoint, data);
  }

  async delete<T>(endpoint: string): Promise<T> {
    return super.delete<T>(endpoint);
  }

  async getCsrfToken(): Promise<string> {
    return csrfService.getToken();
  }
  // Domain-specific services
  public readonly auth: AuthApiService;
  public readonly query: QueryApiService;
  public readonly bronWebsite: BronWebsiteApiService;
  public readonly canonicalDocument: CanonicalDocumentApiService;
  public readonly feedback: FeedbackApiService;
  public readonly workflow: WorkflowApiService;
  public readonly notification: NotificationApiService;
  public readonly subgraph: SubgraphApiService;
  public readonly commonCrawl: CommonCrawlApiService;
  public readonly review: ReviewApiService;
  public readonly aiCrawling: AICrawlingApiService;
  public readonly hierarchy: HierarchyApiService;
  public readonly errorMonitoring: ErrorMonitoringApiService;
  public readonly graph: GraphApiService;
  public readonly sustainability: SustainabilityApiService;
  public readonly wizard: WizardApiService;
  public readonly exportTemplate: ExportTemplateApiService;
  public readonly workflowConfiguration: WorkflowConfigurationApiService;
  public readonly kgManagement: KnowledgeGraphManagementApiService;

  constructor() {
    super();
    // Initialize all domain services
    this.auth = new AuthApiService();
    this.query = new QueryApiService();
    this.bronWebsite = new BronWebsiteApiService();
    this.canonicalDocument = new CanonicalDocumentApiService();
    this.feedback = new FeedbackApiService();
    this.workflow = new WorkflowApiService();
    this.notification = new NotificationApiService();
    this.subgraph = new SubgraphApiService();
    this.commonCrawl = new CommonCrawlApiService();
    this.review = new ReviewApiService();
    this.aiCrawling = new AICrawlingApiService();
    this.hierarchy = new HierarchyApiService();
    this.errorMonitoring = new ErrorMonitoringApiService();
    this.graph = new GraphApiService();
    this.sustainability = new SustainabilityApiService();
    this.wizard = new WizardApiService();
    this.exportTemplate = new ExportTemplateApiService();
    this.workflowConfiguration = new WorkflowConfigurationApiService();
    this.kgManagement = new KnowledgeGraphManagementApiService();
  }

  // Backward compatibility: Delegate all methods to domain services
  // Auth methods
  async login(email: string, password: string): Promise<{ message: string; user: User; token: string }> {
    return this.auth.login(email, password);
  }

  async register(name: string, email: string, password: string, role: string): Promise<{ message: string; user: User }> {
    return this.auth.register(name, email, password, role);
  }

  async getMe(): Promise<{ user: User }> {
    return this.auth.getMe();
  }

  async logout() {
    return this.auth.logout();
  }

  // Query methods
  async createQuery(data: QueryData) {
    return this.query.createQuery(data);
  }

  async getQueries(params?: { limit?: number; skip?: number }) {
    return this.query.getQueries(params);
  }

  async getQuery(id: string) {
    return this.query.getQuery(id);
  }

  async triggerScan(queryId: string) {
    return this.query.triggerScan(queryId);
  }

  async getScanStatus(queryId: string) {
    return this.query.getScanStatus(queryId);
  }

  async generateWebsiteSuggestions(queryId: string) {
    return this.query.generateWebsiteSuggestions(queryId);
  }

  async getQueryProgress(queryId: string) {
    return this.query.getQueryProgress(queryId);
  }

  async generateMockWebsiteSuggestions(queryId: string) {
    return this.query.generateMockWebsiteSuggestions(queryId);
  }

  async scrapeSelectedWebsites(queryId: string, websiteIds: string[]) {
    return this.query.scrapeSelectedWebsites(queryId, websiteIds);
  }

  async getJurisdictions() {
    return this.query.getJurisdictions();
  }

  // BronWebsite methods
  async createBronWebsite(data: BronWebsite) {
    return this.bronWebsite.createBronWebsite(data);
  }

  async createBronWebsites(data: BronWebsite[]) {
    return this.bronWebsite.createBronWebsites(data);
  }

  async getBronWebsitesByQuery(queryId: string) {
    return this.bronWebsite.getBronWebsitesByQuery(queryId);
  }

  async getAllBronWebsites() {
    return this.bronWebsite.getAllBronWebsites();
  }

  async updateBronWebsiteAcceptance(id: string, accepted: boolean | null) {
    return this.bronWebsite.updateBronWebsiteAcceptance(id, accepted);
  }

  // BronDocument methods (migrated to canonical)
  /**
   * @deprecated Use canonicalDocument.createCanonicalDocument instead
   * This method converts legacy BronDocument format to canonical format
   */
  async createBronDocument(data: BronDocument) {
    // Convert legacy format to canonical and use canonical service
    const { convertBronToCanonicalDraft } = await import('../../utils/bronToCanonicalConverter');
    const canonicalDraft = await convertBronToCanonicalDraft(data);
    return this.canonicalDocument.createCanonicalDocument(canonicalDraft);
  }

  /**
   * @deprecated Use canonicalDocument.createCanonicalDocument in a loop instead
   * This method converts legacy BronDocument[] format to canonical format
   */
  async createBronDocuments(data: BronDocument[]) {
    // Convert each document and create via canonical service
    const { convertBronToCanonicalDraft } = await import('../../utils/bronToCanonicalConverter');
    const results = await Promise.all(
      data.map(async (doc) => {
        const canonicalDraft = await convertBronToCanonicalDraft(doc);
        return this.canonicalDocument.createCanonicalDocument(canonicalDraft);
      })
    );
    return results;
  }

  /**
   * @deprecated Use canonicalDocument.getCanonicalDocumentsByQuery instead
   */
  async getBronDocumentsByQuery(queryId: string) {
    const response = await this.canonicalDocument.getCanonicalDocumentsByQuery(queryId);
    // Return array format for backward compatibility
    return response.data;
  }

  /**
   * @deprecated Use canonicalDocument.updateCanonicalDocumentAcceptance instead
   */
  async updateBronDocumentAcceptance(id: string, accepted: boolean | null) {
    return this.canonicalDocument.updateCanonicalDocumentAcceptance(id, accepted);
  }

  /**
   * @deprecated Use canonicalDocument.deleteCanonicalDocument instead
   */
  async deleteBronDocument(id: string) {
    return this.canonicalDocument.deleteCanonicalDocument(id);
  }

  // Feedback methods
  async recordInteraction(interaction: UserInteraction) {
    return this.feedback.recordInteraction(interaction);
  }

  async recordDocumentFeedback(feedback: DocumentFeedback) {
    return this.feedback.recordDocumentFeedback(feedback);
  }

  async recordQAFeedback(feedback: QAFeedback) {
    return this.feedback.recordQAFeedback(feedback);
  }

  async getDocumentFeedbackStats(documentId: string) {
    return this.feedback.getDocumentFeedbackStats(documentId);
  }

  async getQualityMetrics(minInteractions?: number, minDocuments?: number) {
    return this.feedback.getQualityMetrics(minInteractions, minDocuments);
  }

  async runLearningCycle() {
    return this.feedback.runLearningCycle();
  }

  async getLearningCycleStatus() {
    return this.feedback.getLearningCycleStatus();
  }

  async recoverLearningCycle(timeoutMinutes?: number) {
    return this.feedback.recoverLearningCycle(timeoutMinutes);
  }

  async getLearningSchedulerStatus() {
    return this.get<{
      enabled: boolean;
      tasks: Array<{
        id: string;
        name: string;
        enabled: boolean;
        lastRun?: string;
        nextRun?: string;
        status: 'idle' | 'running' | 'failed';
        runningSince?: string;
        lastError?: string;
      }>;
    }>('/admin/learning/scheduler/status');
  }

  async recoverLearningScheduler(timeoutMinutes?: number) {
    return this.post<{
      success: boolean;
      recovered: number;
      message: string;
    }>('/admin/learning/scheduler/recover', { timeoutMinutes });
  }

  async triggerScheduledTask(taskId: 'rankings' | 'dictionaries' | 'sources' | 'monthly-review') {
    return this.post<{
      success: boolean;
      message: string;
      taskId: string;
    }>(`/admin/learning/scheduler/trigger/${taskId}`);
  }

  async getLearningCycleHistory(limit?: number, offset?: number) {
    return this.feedback.getLearningCycleHistory(limit, offset);
  }

  async cancelLearningCycle(operationId?: string) {
    return this.feedback.cancelLearningCycle(operationId);
  }

  // Workflow methods (delegated to workflow service)
  async getWorkflowOutputs() {
    return this.workflow.getWorkflowOutputs();
  }

  async downloadWorkflowOutput(name: string, format: 'json' | 'md' | 'txt') {
    return this.workflow.downloadWorkflowOutput(name, format);
  }

  async getWorkflowOutput(name: string) {
    return this.workflow.getWorkflowOutput(name);
  }

  async convertWorkflowOutputToDocuments(name: string, queryId: string) {
    return this.workflow.convertWorkflowOutputToDocuments(name, queryId);
  }

  async getWorkflows() {
    return this.workflow.getWorkflows();
  }

  async getManagedWorkflows(status?: string) {
    return this.workflow.getManagedWorkflows(status);
  }

  async getManagedWorkflow(id: string) {
    return this.workflow.getManagedWorkflow(id);
  }

  async createWorkflow(workflow: {
    id: string;
    name: string;
    description?: string;
    steps: Array<{
      id: string;
      name: string;
      action: string;
      params?: Record<string, unknown>;
      next?: string;
    }>;
  }) {
    return this.workflow.createWorkflow(workflow);
  }

  async updateWorkflow(id: string, updates: {
    name?: string;
    description?: string;
    steps?: Array<{
      id: string;
      name: string;
      action: string;
      params?: Record<string, unknown>;
      next?: string;
    }>;
  }) {
    return this.workflow.updateWorkflow(id, updates);
  }

  async updateWorkflowStatus(
    id: string,
    status: string,
    comment?: string,
    runningInstanceBehavior?: 'complete' | 'cancel'
  ) {
    return this.workflow.updateWorkflowStatus(id, status, comment, runningInstanceBehavior);
  }

  async getRunningInstances(workflowId: string) {
    return this.workflow.getRunningInstances(workflowId);
  }

  async checkQualityGates(id: string) {
    return this.workflow.checkQualityGates(id);
  }

  async getWorkflowModules(filters?: {
    query?: string;
    category?: string;
    tags?: string[];
    author?: string;
    published?: boolean;
    minVersion?: string;
  }) {
    return this.workflow.getWorkflowModules(filters);
  }

  async getWorkflowModule(id: string) {
    return this.workflow.getWorkflowModule(id);
  }

  async getWorkflowModuleSchema(id: string) {
    return this.workflow.getWorkflowModuleSchema(id);
  }

  async getWorkflowModulesByCategory(category: string) {
    return this.workflow.getWorkflowModulesByCategory(category);
  }

  async getModuleCategories() {
    return this.workflow.getModuleCategories();
  }

  async getModuleTags() {
    return this.workflow.getModuleTags();
  }

  async getModuleStatistics() {
    return this.workflow.getModuleStatistics();
  }

  async getWorkflowsUsingModule(moduleId: string) {
    return this.workflow.getWorkflowsUsingModule(moduleId);
  }

  async shareWorkflow(
    workflowId: string,
    userId?: string,
    teamId?: string,
    level?: 'owner' | 'editor' | 'runner' | 'viewer'
  ) {
    return this.workflow.shareWorkflow(workflowId, userId, teamId, level);
  }

  async removeWorkflowAccess(workflowId: string, userId: string) {
    return this.workflow.removeWorkflowAccess(workflowId, userId);
  }

  async updateWorkflowPermission(
    workflowId: string,
    userId: string,
    level: 'owner' | 'editor' | 'runner' | 'viewer'
  ) {
    return this.workflow.updateWorkflowPermission(workflowId, userId, level);
  }

  async transferWorkflowOwnership(workflowId: string, newOwnerId: string) {
    return this.workflow.transferWorkflowOwnership(workflowId, newOwnerId);
  }

  async getWorkflowActivity(workflowId: string) {
    return this.workflow.getWorkflowActivity(workflowId);
  }

  async getSharedWorkflows() {
    return this.workflow.getSharedWorkflows();
  }

  async getWorkflowPermissions(workflowId: string) {
    return this.workflow.getWorkflowPermissions(workflowId);
  }

  async updateWorkflowVisibility(workflowId: string, visibility: 'private' | 'team' | 'public') {
    return this.workflow.updateWorkflowVisibility(workflowId, visibility);
  }

  async exportResults(
    documents: Array<{
      id: string;
      content: string;
      sourceUrl?: string;
      metadata?: Record<string, unknown>;
    }>,
    format: 'csv' | 'pdf',
    options?: {
      includeCitations?: boolean;
      citationFormat?: 'apa' | 'custom';
      searchParams?: {
        topic?: string;
        location?: string;
        jurisdiction?: string;
      };
    }
  ) {
    return this.workflow.exportResults(documents, format, options);
  }

  async emailExport(
    documents: Array<{
      id: string;
      content: string;
      sourceUrl?: string;
      metadata?: Record<string, unknown>;
    }>,
    recipients: string[],
    searchParams?: {
      topic?: string;
      location?: string;
      jurisdiction?: string;
    },
    options?: {
      includeCitations?: boolean;
      citationFormat?: 'apa' | 'custom';
    }
  ) {
    return this.workflow.emailExport(documents, recipients, searchParams, options);
  }

  async updateTestMetrics(id: string, metrics: {
    runCount: number;
    acceptanceRate: number;
    errorRate: number;
  }) {
    return this.workflow.updateTestMetrics(id, metrics);
  }

  async getWorkflowHistory(id: string) {
    return this.workflow.getWorkflowHistory(id);
  }

  async previewRollback(id: string, version: number) {
    return this.workflow.previewRollback(id, version);
  }

  async rollbackWorkflow(id: string, version: number, comment?: string) {
    return this.workflow.rollbackWorkflow(id, version, comment);
  }

  async getVersionHistory(id: string, options?: { limit?: number; skip?: number }) {
    return this.workflow.getVersionHistory(id, options);
  }

  async deleteWorkflow(id: string) {
    return this.workflow.deleteWorkflow(id);
  }

  async getRecentRuns(limit: number = 20) {
    return this.workflow.getRecentRuns(limit);
  }

  /**
   * Run a workflow
   * 
   * @param workflowId - The workflow ID to run
   * @param params - Workflow parameters (flexible - backend accepts any parameters via passthrough)
   *                 Common parameters: mode, query, queryId, selectedWebsites, onderwerp, overheidsinstantie, etc.
   */
  async runWorkflow(
    workflowId: string,
    params: {
      mode?: string;
      reviewMode?: boolean;
      query?: string;
      queryId?: string;
      selectedWebsites?: string[];
      overheidstype?: string;
      overheidsinstantie?: string;
      onderwerp?: string;
      thema?: string;
      randomness?: number;
      [key: string]: unknown; // Allow any additional workflow-specific parameters
    }
  ) {
    return this.workflow.runWorkflow(workflowId, params);
  }

  async getRun(runId: string) {
    return this.workflow.getRun(runId);
  }

  async pauseRun(runId: string) {
    return this.workflow.pauseRun(runId);
  }

  async resumeRun(runId: string) {
    return this.workflow.resumeRun(runId);
  }

  async cancelRun(runId: string) {
    return this.workflow.cancelRun(runId);
  }

  // Notification methods
  async getNotifications(options?: { limit?: number; skip?: number; read?: boolean }) {
    return this.notification.getNotifications(options);
  }

  async getUnreadNotificationCount() {
    return this.notification.getUnreadNotificationCount();
  }

  async markNotificationAsRead(notificationId: string) {
    return this.notification.markNotificationAsRead(notificationId);
  }

  async markAllNotificationsAsRead() {
    return this.notification.markAllNotificationsAsRead();
  }

  async deleteNotification(notificationId: string) {
    return this.notification.deleteNotification(notificationId);
  }

  // Subgraph methods
  async getSubgraphs(options?: { limit?: number; skip?: number; status?: string }) {
    return this.subgraph.getSubgraphs(options);
  }

  async getCurrentSubgraph() {
    return this.subgraph.getCurrentSubgraph();
  }

  async getSubgraph(id: string) {
    return this.subgraph.getSubgraph(id);
  }

  async getSubgraphNodes(id: string) {
    return this.subgraph.getSubgraphNodes(id);
  }

  async createSubgraph(data: {
    name: string;
    description?: string;
    workflowId?: string;
    runId?: string;
    queryId?: string;
    includedNodes?: string[];
    rootUrl?: string;
    maxDepth?: number;
  }) {
    return this.subgraph.createSubgraph(data);
  }

  async createSubgraphFromGraph(data: {
    name: string;
    description?: string;
    startNode?: string;
    maxDepth?: number;
    maxNodes?: number;
    urlPattern?: string;
    queryId?: string;
  }) {
    return this.subgraph.createSubgraphFromGraph(data);
  }

  async updateSubgraph(id: string, data: { name?: string; description?: string; status?: string }) {
    return this.subgraph.updateSubgraph(id, data);
  }

  async addNodesToSubgraph(id: string, urls: string[]) {
    return this.subgraph.addNodesToSubgraph(id, urls);
  }

  async removeNodesFromSubgraph(id: string, urls: string[]) {
    return this.subgraph.removeNodesFromSubgraph(id, urls);
  }

  async approveEndpoint(subgraphId: string, endpoint: { url: string; title: string; type?: string }) {
    return this.subgraph.approveEndpoint(subgraphId, endpoint);
  }

  async rejectEndpoint(subgraphId: string, endpoint: { url: string; title: string; reason?: string }) {
    return this.subgraph.rejectEndpoint(subgraphId, endpoint);
  }

  async resetEndpoint(subgraphId: string, url: string) {
    return this.subgraph.resetEndpoint(subgraphId, url);
  }

  async activateSubgraph(id: string) {
    return this.subgraph.activateSubgraph(id);
  }

  async archiveSubgraph(id: string) {
    return this.subgraph.archiveSubgraph(id);
  }

  async deleteSubgraph(id: string) {
    return this.subgraph.deleteSubgraph(id);
  }

  async getSubgraphsByQuery(queryId: string) {
    return this.subgraph.getSubgraphsByQuery(queryId);
  }

  // Common Crawl methods
  async queryCommonCrawl(params: {
    query: string;
    domainFilter?: string;
    crawlId?: string;
    limit?: number;
  }) {
    return this.commonCrawl.queryCommonCrawl(params);
  }

  async getCommonCrawlCrawls() {
    return this.commonCrawl.getCommonCrawlCrawls();
  }

  async validateCrawlId(crawlId: string) {
    return this.commonCrawl.validateCrawlId(crawlId);
  }

  async saveCommonCrawlQuery(params: {
    query: string;
    domainFilter?: string;
    crawlId: string;
    status?: 'pending' | 'approved' | 'rejected';
  }) {
    return this.commonCrawl.saveCommonCrawlQuery(params);
  }

  async getCommonCrawlQueries(params?: {
    status?: 'pending' | 'approved' | 'rejected';
    page?: number;
    limit?: number;
    skip?: number;
  }) {
    return this.commonCrawl.getCommonCrawlQueries(params);
  }

  async getCommonCrawlQuery(queryId: string) {
    return this.commonCrawl.getCommonCrawlQuery(queryId);
  }

  async saveCommonCrawlResults(
    queryId: string,
    results: Array<{
      urlkey: string;
      timestamp: string;
      url: string;
      mime: string;
      status: string;
      digest: string;
      length: string;
      offset: string;
      filename: string;
    }>
  ) {
    return this.commonCrawl.saveCommonCrawlResults(queryId, results);
  }

  async getCommonCrawlResults(queryId: string, params?: {
    approved?: boolean;
    limit?: number;
    skip?: number;
  }) {
    return this.commonCrawl.getCommonCrawlResults(queryId, params);
  }

  async approveCommonCrawlResult(resultId: string) {
    return this.commonCrawl.approveCommonCrawlResult(resultId);
  }

  async approveCommonCrawlResults(resultIds: string[]) {
    return this.commonCrawl.approveCommonCrawlResults(resultIds);
  }

  async deleteCommonCrawlQuery(queryId: string) {
    return this.commonCrawl.deleteCommonCrawlQuery(queryId);
  }

  // Review methods
  async getReview(runId: string, moduleId?: string) {
    return this.review.getReview(runId, moduleId);
  }

  async getAllReviews(runId: string) {
    return this.review.getAllReviews(runId);
  }

  async reviewCandidate(reviewId: string, candidateId: string, status: 'accepted' | 'rejected', notes?: string) {
    return this.review.reviewCandidate(reviewId, candidateId, status, notes);
  }

  async reviewCandidates(reviewId: string, decisions: Array<{ candidateId: string; status: 'accepted' | 'rejected' }>) {
    return this.review.reviewCandidates(reviewId, decisions);
  }

  async completeReview(reviewId: string, workflowId: string) {
    return this.review.completeReview(reviewId, workflowId);
  }

  async getReviewStatistics(workflowId: string) {
    return this.review.getReviewStatistics(workflowId);
  }

  async getReviewHistory(workflowId: string, limit: number = 100) {
    return this.review.getReviewHistory(workflowId, limit);
  }

  async getReviewStats(reviewId: string) {
    return this.review.getReviewStats(reviewId);
  }

  async getPendingReviews(runId: string) {
    return this.review.getPendingReviews(runId);
  }

  async deleteReview(reviewId: string) {
    return this.review.deleteReview(reviewId);
  }

  async deleteReviewsByRun(runId: string) {
    return this.review.deleteReviewsByRun(runId);
  }

  // AI Crawling methods
  async getAICrawlingConfig(siteUrl?: string, queryConfig?: Record<string, unknown>) {
    return this.aiCrawling.getAICrawlingConfig(siteUrl, queryConfig);
  }

  async getAICrawlingConfigs(filters?: {
    scope?: 'global' | 'site' | 'query';
    siteUrl?: string;
    enabled?: boolean;
    limit?: number;
    skip?: number;
  }) {
    return this.aiCrawling.getAICrawlingConfigs(filters);
  }

  async getAICrawlingConfigById(id: string) {
    return this.aiCrawling.getAICrawlingConfigById(id);
  }

  async createAICrawlingConfig(config: {
    scope: 'global' | 'site' | 'query';
    siteUrl?: string;
    aggressiveness: 'low' | 'medium' | 'high';
    strategy: 'site_search' | 'ai_navigation' | 'traditional' | 'auto';
    maxDepth?: number;
    maxLinks?: number;
    llmModel?: string;
    cacheEnabled?: boolean;
    cacheTTL?: number;
    timeout?: number;
    fallbackBehavior?: 'traditional' | 'skip';
    enabled?: boolean;
  }) {
    return this.aiCrawling.createAICrawlingConfig(config);
  }

  async updateAICrawlingConfig(id: string, updates: {
    aggressiveness?: 'low' | 'medium' | 'high';
    strategy?: 'site_search' | 'ai_navigation' | 'traditional' | 'auto';
    maxDepth?: number;
    maxLinks?: number;
    llmModel?: string;
    cacheEnabled?: boolean;
    cacheTTL?: number;
    timeout?: number;
    enabled?: boolean;
  }) {
    return this.aiCrawling.updateAICrawlingConfig(id, updates);
  }

  async deleteAICrawlingConfig(id: string) {
    return this.aiCrawling.deleteAICrawlingConfig(id);
  }

  async getGlobalAICrawlingConfig() {
    return this.aiCrawling.getGlobalAICrawlingConfig();
  }

  async getDocumentExplanation(documentUrl: string) {
    return this.aiCrawling.getDocumentExplanation(documentUrl);
  }

  async getAICrawlingTrace(sessionId: string) {
    return this.aiCrawling.getAICrawlingTrace(sessionId);
  }

  async listAICrawlingTraces(filters?: {
    baseUrl?: string;
    query?: string;
    strategy?: string;
    startDate?: string;
    endDate?: string;
    limit?: number;
    skip?: number;
  }) {
    return this.aiCrawling.listAICrawlingTraces(filters);
  }

  // Hierarchy methods
  async getHierarchyRegulations(jurisdictionId: string, options?: {
    includeChildren?: boolean;
    includeParents?: boolean;
    maxDepth?: number;
    levelFilter?: string[];
  }) {
    return this.hierarchy.getHierarchyRegulations(jurisdictionId, options);
  }

  async getHierarchyChildren(jurisdictionId: string, options?: {
    maxDepth?: number;
    levelFilter?: string[];
  }) {
    return this.hierarchy.getHierarchyChildren(jurisdictionId, options);
  }

  async getHierarchyByLevel(level: 'municipality' | 'province' | 'national' | 'european') {
    return this.hierarchy.getHierarchyByLevel(level);
  }

  async getHierarchySubtree(jurisdictionId: string, options?: {
    includeChildren?: boolean;
    includeParents?: boolean;
    maxDepth?: number;
    levelFilter?: string[];
  }) {
    return this.hierarchy.getHierarchySubtree(jurisdictionId, options);
  }

  async updateHierarchy(jurisdictionId: string, hierarchy: {
    level: 'municipality' | 'province' | 'national' | 'european';
    parentId?: string;
  }) {
    return this.hierarchy.updateHierarchy(jurisdictionId, hierarchy);
  }

  async validateHierarchy(jurisdictionId: string, includeParent?: boolean) {
    return this.hierarchy.validateHierarchy(jurisdictionId, includeParent);
  }

  // Benchmark methods
  async runBenchmark(params: {
    name?: string;
    query?: string; // Optional for backward compatibility
    queries?: string[]; // Array of queries to test
    benchmarkTypes: string[];
  }) {
    return this.post<{ runId: string }>('/benchmark/run', params);
  }

  async getBenchmarkStatus(runId: string) {
    return this.get<{
      id: string;
      status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
      results?: unknown;
    }>(`/benchmark/status/${runId}`);
  }

  async getBenchmarkRun(runId: string) {
    return this.get<{
      id: string;
      name: string;
      query: string;
      benchmarkTypes: string[];
      status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
      createdAt: string;
      completedAt?: string;
      cancelledAt?: string;
      results: Array<{
        id: string;
        benchmarkType: string;
        configName: string;
        documents: Array<{
          url: string;
          titel: string;
          samenvatting: string;
          score: number;
          rank: number;
        }>;
        metrics: {
          documentsFound: number;
          averageScore: number;
        };
      }>;
    }>(`/benchmark/runs/${runId}`);
  }

  async cancelBenchmark(runId: string) {
    return this.post<{ success: boolean; message: string }>(`/benchmark/runs/${runId}/cancel`);
  }

  async compareWorkflows(workflowIds: string[], query?: string) {
    const params = new URLSearchParams();
    workflowIds.forEach(id => params.append('workflowIds', id));
    if (query) {
      params.append('query', query);
    }
    return this.get<Array<{
      workflowId: string;
      workflowName: string;
      query: string;
      runs: number;
      metrics: {
        avgExecutionTime: number;
        avgDocumentsFound: number;
        avgScore: number;
        minExecutionTime: number;
        maxExecutionTime: number;
        stdDevExecutionTime: number;
        medianExecutionTime: number;
      };
      results: Array<{
        id: string;
        benchmarkRunId: string;
        workflowId: string;
        configName: string;
        documents: Array<{
          url: string;
          titel: string;
          samenvatting: string;
          score: number;
          rank: number;
        }>;
        metrics: {
          documentsFound: number;
          averageScore: number;
        };
      }>;
    }>>(`/benchmark/compare?${params.toString()}`);
  }

  async startWorkflowComparison(params: {
    name: string;
    description?: string;
    workflowA: {
      workflowId: string;
      label?: string;
      runtimeSettings?: {
        featureFlags?: Record<string, boolean>;
        params?: Record<string, unknown>;
        timeout?: number;
        maxRetries?: number;
        maxMemoryMB?: number;
        maxConcurrentRequests?: number;
      };
    };
    workflowB: {
      workflowId: string;
      label?: string;
      runtimeSettings?: {
        featureFlags?: Record<string, boolean>;
        params?: Record<string, unknown>;
        timeout?: number;
        maxRetries?: number;
        maxMemoryMB?: number;
        maxConcurrentRequests?: number;
      };
    };
    query?: string;
    queries?: string[];
    runsPerQuery?: number;
  }) {
    return this.post<{
      success: boolean;
      comparisonId: string;
      message: string;
    }>('/benchmark/compare-workflows', params);
  }

  async listWorkflowComparisons(options?: {
    limit?: number;
    skip?: number;
    status?: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
  }) {
    const params = new URLSearchParams();
    if (options?.limit) params.append('limit', String(options.limit));
    if (options?.skip) params.append('skip', String(options.skip));
    if (options?.status) params.append('status', options.status);

    const queryString = params.toString();
    return this.get<Array<{
      _id: string;
      name: string;
      description?: string;
      status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
      workflowA: { workflowId: string; label?: string };
      workflowB: { workflowId: string; label?: string };
      createdAt: string;
      startedAt?: string;
      completedAt?: string;
      error?: string;
    }>>(`/benchmark/compare-workflows${queryString ? `?${queryString}` : ''}`);
  }

  /**
   * Compare two documents
   * @param documentAId - ID of first document
   * @param documentBId - ID of second document
   * @param options - Comparison options (strategy, extractionMethod, etc.)
   */
  async compareDocuments(
    documentAId: string,
    documentBId: string,
    options?: {
      strategy?: 'semantic' | 'structured' | 'hybrid';
      extractionMethod?: 'llm' | 'rule-based' | 'hybrid';
      includeMetadata?: boolean;
      maxConcepts?: number;
      minConfidence?: number;
    }
  ) {
    return this.post<{
      documentA: CanonicalDocument;
      documentB: CanonicalDocument;
      comparisonId: string;
      matchedConcepts: Array<{
        concept: string;
        normType: 'regulation' | 'requirement' | 'policy' | 'procedure';
        evidenceA: {
          documentId: string;
          chunks: Array<{
            chunkId: string;
            text: string;
            offsets: { start: number; end: number };
            relevanceScore: number;
          }>;
          citations: Array<{
            chunkId: string;
            text: string;
            offsets: { start: number; end: number };
            pageNumber?: number;
            section?: string;
          }>;
          confidence: number;
        };
        evidenceB: {
          documentId: string;
          chunks: Array<{
            chunkId: string;
            text: string;
            offsets: { start: number; end: number };
            relevanceScore: number;
          }>;
          citations: Array<{
            chunkId: string;
            text: string;
            offsets: { start: number; end: number };
            pageNumber?: number;
            section?: string;
          }>;
          confidence: number;
        };
        status: 'identical' | 'changed' | 'conflicting' | 'a-only' | 'b-only';
        delta?: {
          type: 'added' | 'removed' | 'modified' | 'conflicting';
          oldValue?: string;
          newValue?: string;
          changeDescription: string;
        };
        confidence: number;
        impact?: string;
      }>;
      differences: Array<{
        category: 'regulation' | 'requirement' | 'policy' | 'procedure' | 'metadata';
        concept: string;
        status: 'a-only' | 'b-only' | 'changed' | 'conflicting';
        evidenceA?: {
          documentId: string;
          chunks: Array<{
            chunkId: string;
            text: string;
            offsets: { start: number; end: number };
            relevanceScore: number;
          }>;
          citations: Array<{
            chunkId: string;
            text: string;
            offsets: { start: number; end: number };
            pageNumber?: number;
            section?: string;
          }>;
          confidence: number;
        };
        evidenceB?: {
          documentId: string;
          chunks: Array<{
            chunkId: string;
            text: string;
            offsets: { start: number; end: number };
            relevanceScore: number;
          }>;
          citations: Array<{
            chunkId: string;
            text: string;
            offsets: { start: number; end: number };
            pageNumber?: number;
            section?: string;
          }>;
          confidence: number;
        };
        delta?: {
          type: 'added' | 'removed' | 'modified' | 'conflicting';
          oldValue?: string;
          newValue?: string;
          changeDescription: string;
        };
        confidence: number;
        impact: string;
      }>;
      summary: {
        totalConcepts: number;
        identical: number;
        changed: number;
        conflicting: number;
        aOnly: number;
        bOnly: number;
        overallSimilarity: number;
        keyDifferences: string[];
      };
      confidence: number;
      metadata: {
        comparisonDate: string;
        comparisonStrategy: 'semantic' | 'structured' | 'hybrid';
        extractionMethod: 'llm' | 'rule-based' | 'hybrid';
        processingTime: number;
      };
    }>('/comparisons', {
      documentAId,
      documentBId,
      ...options,
    });
  }

  /**
   * Get comparison result by ID
   * @param comparisonId - Comparison ID
   */
  async getComparison(comparisonId: string) {
    return this.get<{
      documentA: CanonicalDocument;
      documentB: CanonicalDocument;
      comparisonId: string;
      matchedConcepts: unknown[];
      differences: unknown[];
      summary: unknown;
      confidence: number;
      metadata: unknown;
    }>(`/comparisons/${comparisonId}`);
  }

  // Public get/post methods for backward compatibility
  // These allow direct API calls for endpoints not covered by domain services
  async get<T>(endpoint: string, options?: { responseType?: 'json' | 'blob' }): Promise<T> {
    return super.get<T>(endpoint, options);
  }

  async post<T>(endpoint: string, data?: unknown): Promise<T> {
    return super.post<T>(endpoint, data);
  }
}

// Export singleton instance for backward compatibility
export const api = new ApiService();

