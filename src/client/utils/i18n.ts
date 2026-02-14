/**
 * Simple i18n utility for Dutch translations
 * 
 * This handles customer-facing text only. Developer-side logs,
 * MongoDB fields, and backend code remain in English.
 */

export type TranslationKey = 
  // WorkflowLogs
  | 'workflowLogs.title'
  | 'workflowLogs.waiting'
  | 'workflowLogs.loading'
  | 'workflowLogs.noLogs'
  | 'workflowLogs.viewDetails'
  | 'workflowLogs.status.completed'
  | 'workflowLogs.status.failed'
  | 'workflowLogs.status.running'
  | 'workflowLogs.status.pending'
  | 'workflowLogs.status.cancelled'
  | 'workflowLogs.status.completed_with_errors'
  | 'workflowLogs.downloadTooltip'
  | 'workflowLogs.graphSaved'
  | 'workflowLogs.graphLoaded'
  | 'workflowLogs.noClustersFound'
  | 'workflowLogs.externalLinksCompleted'
  | 'workflowLogs.subgraphShown'
  | 'workflowLogs.expansionStarted'
  | 'workflowLogs.findingStartNode'
  | 'workflowLogs.mergingExpandedResults'
  | 'workflowLogs.scanResultsSaved'
  | 'workflowLogs.cancellationRequested'
  | 'workflowLogs.pauseRequested'
  | 'workflowLogs.workflowCancelled'
  | 'workflowLogs.initializingScan'
  | 'workflowLogs.initialSearch'
  | 'workflowLogs.analyzingClusters'
  | 'workflowLogs.finalizingScan'
  | 'workflowLogs.arbeidsmigrantenScraper'
  | 'workflowLogs.energietransitieScraper'
  | 'workflowLogs.baseHorstScraper'
  | 'workflowLogs.runResumed'
  | 'workflowLogs.startingWorkflow'
  | 'workflowLogs.workflowExecutionStarted'
  | 'workflowLogs.engineInitialized'
  | 'workflowLogs.workflowCompleted'
  | 'workflowLogs.workflowFailed'
  | 'workflowLogs.workflowPauseRequested'
  | 'workflowLogs.workflowCancelledByUser'
  | 'workflowLogs.workflowLoaded'
  | 'workflowLogs.scanningIPLO'
  | 'workflowLogs.processingSubject'
  | 'workflowLogs.enhancingQuery'
  | 'workflowLogs.enhancedQuery'
  | 'workflowLogs.initializingImborService'
  | 'workflowLogs.imborServiceCreated'
  | 'workflowLogs.queryExpansionServiceInitialized'
  | 'workflowLogs.imborLoadWarning'
  | 'workflowLogs.failedToInitializeServices'
  | 'workflowLogs.scanningIPLODetailed'
  | 'workflowLogs.foundDocuments'
  | 'workflowLogs.semanticThemeRouting'
  | 'workflowLogs.selectedThemes'
  | 'workflowLogs.noThemeMatch'
  | 'workflowLogs.themeFallback'
  | 'workflowLogs.startingThemeScraping'
  | 'workflowLogs.completedTheme'
  | 'workflowLogs.errorScrapingTheme'
  | 'workflowLogs.startingSearchScraping'
  | 'workflowLogs.skippingIploSearch'
  | 'workflowLogs.failedToAddSemanticSimilarity'
  | 'workflowLogs.crawlTimeout'
  | 'workflowLogs.contentChangeDetected'
  | 'workflowLogs.totalContentChanges'
  | 'workflowLogs.crawling'
  | 'workflowLogs.foundDocumentsOn'
  | 'workflowLogs.followingLinks'
  | 'workflowLogs.processingItems'
  | 'workflowLogs.exploringItems'
  | 'workflowLogs.scanningKnownSources'
  | 'workflowLogs.noWebsitesSelected'
  | 'workflowLogs.noWebsitesProvided'
  | 'workflowLogs.noWebsitesToScrape'
  | 'workflowLogs.foundWebsitesToScrape'
  | 'workflowLogs.processingWebsites'
  | 'workflowLogs.errorScanningKnownSources'
  | 'workflowLogs.usingEnhancedQuery'
  | 'workflowLogs.dsoLocationSearching'
  | 'workflowLogs.dsoLocationGeocoded'
  | 'workflowLogs.dsoLocationDiscovered'
  | 'workflowLogs.dsoLocationProcessing'
  | 'workflowLogs.dsoLocationSuccess'
  | 'workflowLogs.dsoLocationError'
  | 'workflowLogs.dsoLocationWarning'
  | 'workflowLogs.dsoStep1AFailed'
  | 'workflowLogs.dsoStep1AWarning'
  | 'workflowLogs.dsoStep1ASuccess'
  | 'workflowLogs.dsoStep1AEmptyQuery'
  | 'workflowLogs.dsoStep1ANoDocuments'
  | 'workflowLogs.dsoEnrichmentError'
  | 'workflowLogs.iploScanComplete'
  | 'workflowLogs.errorProcessingSubject'
  | 'workflowLogs.hybridRetrievalComplete'
  | 'workflowLogs.hybridRetrievalFailed'
  | 'workflowLogs.unknownNavigationPattern'
  | 'workflowLogs.learningOpportunity'
  | 'workflowLogs.hybridRetrievalEnabled'
  | 'workflowLogs.initializingScan'
  | 'workflowLogs.performingInitialWebSearch'
  | 'workflowLogs.devModeExploring'
  | 'workflowLogs.navigationGraphUpdated'
  | 'workflowLogs.navigationGraphUpdatedWithPattern'
  | 'workflowLogs.prodModeUsingGraph'
  | 'workflowLogs.hybridModeTargeted'
  | 'workflowLogs.hybridModeExploring'
  | 'workflowLogs.analyzingGraphClusters'
  | 'workflowLogs.semanticClusterMatch'
  | 'workflowLogs.noSemanticClusterMatches'
  | 'workflowLogs.startingRecursiveCrawl'
  | 'workflowLogs.depthProcessing'
  | 'workflowLogs.finalizingScan'
  | 'workflowLogs.scoringAndFiltering'
  | 'workflowLogs.scoredDocuments'
  | 'workflowLogs.rerankingDocuments'
  | 'workflowLogs.rerankedDocuments'
  | 'workflowLogs.kgRerankingFailed'
  | 'workflowLogs.checkingOrphanedFiles'
  | 'workflowLogs.noOrphanedFiles'
  | 'workflowLogs.errorDetectingOrphanedFiles'
  | 'workflowLogs.missingTitleFallback'
  | 'workflowLogs.skippedUnchanged'
  | 'workflowLogs.nodeUpdated'
  | 'workflowLogs.nodeNew'
  | 'workflowLogs.errorProcessingNode'
  | 'workflowLogs.hybridModeNoPatterns'
  | 'workflowLogs.patternMatchedNodes'
  | 'workflowLogs.usingProductionEfficiency'
  | 'workflowLogs.exploringUnknownPages'
  | 'workflowLogs.explorationError'
  | 'workflowLogs.explorationSuggestion'
  | 'workflowLogs.hybridRetrievalFound'
  | 'workflowLogs.workflowCancelledBeforeStep'
  | 'workflowLogs.workflowCancelledAfterStep'
  | 'workflowLogs.allStepsCompleted'
  | 'workflowLogs.workflowCancelledDuringExecution'
  | 'workflowLogs.stepFailed'
  | 'workflowLogs.stepExecutionCompleted'
  | 'workflowLogs.stepExecutionFailed'
  | 'workflowLogs.contextAtFailure'
  | 'workflowLogs.graphInitialized'
  | 'workflowLogs.graphVerified'
  | 'workflowLogs.graphVerifiedWithNodes'
  | 'workflowLogs.semanticTargetingActive'
  | 'workflowLogs.identifiedClusters'
  | 'workflowLogs.targetScopeContains'
  | 'workflowLogs.probabilisticExploration'
  | 'workflowLogs.targetedExplorationActive'
  | 'workflowLogs.probabilisticExplorationActive'
  | 'workflowLogs.startingExploration'
  | 'workflowLogs.explorationCompleted'
  | 'workflowLogs.exploringOutOfScope'
  | 'workflowLogs.exploring'
  | 'workflowLogs.failedToAddNode'
  | 'workflowLogs.failedToAddChildNode'
  | 'workflowLogs.failedToUpdateNode'
  | 'workflowLogs.persistedNode'
  | 'workflowLogs.extractingEntities'
  | 'workflowLogs.entityExtractionInProgress'
  | 'workflowLogs.entityExtractionCompleted'
  | 'workflowLogs.skippingEntityExtraction'
  | 'workflowLogs.exploringChildren'
  | 'workflowLogs.childExplorationProgress'
  | 'workflowLogs.childExplorationCompleted'
  | 'workflowLogs.extractedEntities'
  | 'workflowLogs.externalLinkExplorationStarted'
  | 'workflowLogs.externalLinksAdded'
  | 'workflowLogs.externalLinksNoNew'
  | 'workflowLogs.externalLinksNoneFound'
  | 'workflowLogs.findingRelevantNodes'
  | 'workflowLogs.foundRelevantNodes'
  | 'workflowLogs.creatingSubgraph'
  | 'workflowLogs.createdSubgraph'
  | 'workflowLogs.noRelevantNodes'
  | 'workflowLogs.startingBFS'
  | 'workflowLogs.mergeComplete'
  | 'workflowLogs.embeddingBackfillStarted'
  | 'workflowLogs.backfillProgress'
  | 'workflowLogs.backfillComplete'
  | 'workflowLogs.graphSavedAfterExpansion'
  | 'workflowLogs.graphSaveFailed'
  | 'workflowLogs.startNodeNotFound'
  | 'workflowLogs.expandingFromNode'
  | 'workflowLogs.expansionComplete'
  | 'workflowLogs.errorExpanding'
  | 'workflowLogs.exploringWebsites'
  | 'workflowLogs.addedWebsitesToGraph'
  | 'workflowLogs.graphSavedAfterWebsites'
  | 'workflowLogs.semanticAnalysisPending'
  | 'workflowLogs.startingHorstScrape'
  | 'workflowLogs.foundHorstDocuments'
  | 'workflowLogs.graphSavedAfterHorst'
  | 'workflowLogs.scanningKnownSourcesDetailed'
  | 'workflowLogs.foundDocumentsFromWebsite'
  | 'workflowLogs.noDocumentsFromWebsite'
  | 'workflowLogs.startingScanIploAction'
  | 'workflowLogs.populatingKnowledgeGraph'
  | 'workflowLogs.knowledgeGraphPopulated'
  | 'workflowLogs.knowledgeGraphWarning'
  | 'workflowLogs.kgPopulatedSummary'
  | 'workflowLogs.kgPopulatedWithFiltering'
  | 'workflowLogs.kgPopulatedWithPerformance'
  | 'workflowLogs.kgPopulatedWithFilteringAndPerformance'
  | 'workflowLogs.kgValidationErrors'
  | 'workflowLogs.kgValidationWarnings'
  | 'workflowLogs.kgValidationPassed'
  | 'workflowLogs.kgEntitiesAddedToBranch'
  | 'workflowLogs.kgEntitiesAddedToBranchNote'
  | 'workflowLogs.kgEntitiesAddedToPendingChanges'
  | 'workflowLogs.entityValidationFailed'
  | 'workflowLogs.entityValidationWarnings'
  | 'workflowLogs.relationshipValidationFailed'
  | 'workflowLogs.relationshipValidationWarnings'
  | 'workflowLogs.factValidationIssues'
  | 'workflowLogs.consistencyViolation'
  | 'workflowLogs.selfLoopDetected'
  | 'workflowLogs.targetEntityNotFound'
  | 'workflowLogs.sourceEntityNotFound'
  | 'workflowLogs.sourceDocumentNotFound'
  | 'workflowLogs.relationshipNotSupportedBySource'
  | 'workflowLogs.selfLoopsNotAllowed'
  | 'workflowLogs.invalidRelationship'
  | 'workflowLogs.factValidationIssueWithConfidence'
  | 'workflowLogs.startingIploScan'
  | 'workflowLogs.processingSubjectDetailed'
  | 'workflowLogs.enhancingQueryDetailed'
  | 'workflowLogs.dsoStep1Configured'
  | 'workflowLogs.dsoStep2Configured'
  | 'workflowLogs.parameterValidationFailed'
  | 'workflowLogs.normalizingDocuments'
  | 'workflowLogs.noCoreDocuments'
  | 'workflowLogs.startingNormalizeDeduplicate'
  | 'workflowLogs.step3StartingIploScraper'
  | 'workflowLogs.step3ScraperReturned'
  | 'workflowLogs.step3InitializingCanonicalPipeline'
  | 'workflowLogs.step3UsingFixtureDocuments'
  | 'workflowLogs.step3SearchingIplo'
  | 'workflowLogs.step3FoundDocuments'
  | 'workflowLogs.step3AddedToGraph'
  | 'workflowLogs.step3AddedToGraphWithRelationships'
  | 'workflowLogs.step3WarningCouldNotSave'
  | 'workflowLogs.step3ProcessedViaPipeline'
  | 'workflowLogs.step3ProcessedViaPipelineWithQuery'
  | 'workflowLogs.step3ProcessedViaPipelineWarning'
  | 'workflowLogs.step3ProcessedViaPipelineNoQuery'
  | 'workflowLogs.step3ActionCompleting'
  | 'workflowLogs.step3ActionReturningEmpty'
  | 'workflowLogs.step5UsingFixtureDocuments'
  | 'workflowLogs.runStarted'
  | 'workflowLogs.runPaused'
  | 'workflowLogs.workflowAutoResumed'
  | 'workflowLogs.parallelStepsCancelled'
  | 'workflowLogs.startingSourceDiscovery'
  | 'workflowLogs.runCancelledRecentlyFailed'
  | 'workflowLogs.runNotFoundError'
  | 'workflowLogs.processingItems'
  | 'workflowLogs.exploringItems'
  | 'workflowLogs.processedItems'
  | 'workflowLogs.processingDocument'
  | 'workflowLogs.processingDocumentOf'
  | 'workflowLogs.processedDocument'
  | 'workflowLogs.processingCompleted'
  | 'workflowLogs.canonicalPipelineComplete'
  | 'workflowLogs.totalDocumentsProcessed'
  | 'workflowLogs.processingDocumentUrl'
  | 'workflowLogs.processingCompletedWithErrors'
  | 'workflowLogs.documentProcessingComplete'
  | 'workflowLogs.parameterValidationFailed'
  | 'workflowLogs.discoveredDocumentUrls'
  | 'workflowLogs.noDocumentUrlsDiscovered'
  | 'workflowLogs.couldNotPopulateKnowledgeGraph'
  | 'workflowLogs.failedToSaveNavigationGraph'
  | 'workflowLogs.errorScanningKnownSources'
  | 'workflowLogs.navigationGraphSaved'
  | 'workflowLogs.semanticAnalysisPending'
  | 'workflowLogs.startingHorstScrape'
  | 'workflowLogs.usingArbeidsmigrantenScraper'
  | 'workflowLogs.usingEnergietransitieScraper'
  | 'workflowLogs.usingBaseHorstScraper'
  | 'workflowLogs.foundHorstDocuments'
  | 'workflowLogs.populatingKnowledgeGraphFromGoogle'
  | 'workflowLogs.knowledgeGraphPopulatedFromGoogle'
  | 'workflowLogs.processingWebsites'
  | 'workflowLogs.processingDocumentsThroughPipeline'
  | 'workflowLogs.failedToProcess'
  | 'workflowLogs.failedToProcessWebsite'
  | 'workflowLogs.stepProcessedDocuments'
  | 'workflowLogs.stepProcessedDocumentsWithQuery'
  | 'workflowLogs.stepProcessedDocumentsCreatedQuery'
  | 'workflowLogs.stepProcessedDocumentsWarning'
  | 'workflowLogs.stepProcessedDocumentsNoQuery'
  | 'workflowLogs.stepErrorInDSO'
  | 'workflowLogs.dsoLocationSearchError'
  | 'workflowLogs.schemaValidationFailed'
  | 'workflowLogs.securityValidationFailed'
  | 'workflowLogs.parallelStepFailed'
  | 'workflowLogs.parallelStepRejected'
  | 'workflowLogs.allParallelStepsCompleted'
  | 'workflowLogs.parallelExecutionCompletedWithTimeouts'
  | 'workflowLogs.parallelExecutionCompletedWithErrors'
  | 'workflowLogs.stepCompleted'
  | 'workflowLogs.dsoEnrichmentCompleted'
  | 'workflowLogs.stepFailedInTransaction'
  | 'workflowLogs.startingBfsExploration'
  | 'workflowLogs.bfsStartingFrom'
  | 'workflowLogs.errorExploring'
  | 'workflowLogs.bfsExplorationCompleted'
  | 'workflowLogs.startingBfsFromUrls'
  | 'workflowLogs.bfsCrawlCompleted'
  | 'workflowLogs.noClustersFoundEmpty'
  | 'workflowLogs.noClustersFoundThreshold'
  | 'workflowLogs.noClustersFoundMatching'
  | 'workflowLogs.startingExternalLinkExploration'
  | 'workflowLogs.externalLinkExplorationCompleted'
  | 'workflowLogs.externalLinkExplorationCompletedWithCount'
  | 'workflowLogs.externalLinkExplorationNoNew'
  | 'workflowLogs.externalLinkExplorationNoneFound'
  | 'workflowLogs.startingExpansionFromRelevantNodes'
  | 'workflowLogs.findingStartingNodeForBfs'
  | 'workflowLogs.startingBfsFrom'
  | 'workflowLogs.mergeComplete'
  | 'workflowLogs.startingEmbeddingBackfill'
  | 'workflowLogs.errorExpandingFrom'
  | 'workflowLogs.expansionComplete'
  | 'workflowLogs.startingModuleExecution'
  | 'workflowLogs.errorInModule'
  | 'workflowLogs.semanticTargetingActive'
  | 'workflowLogs.targetScopeContains'
  | 'workflowLogs.probabilisticExplorationEnabled'
  | 'workflowLogs.navigationGraphVerified'
  | 'workflowLogs.navigationGraphInitialized'
  | 'workflowLogs.findingRelevantNodesForQuery'
  | 'workflowLogs.creatingSubgraphFrom'
  | 'workflowLogs.createdSubgraphWith'
  | 'workflowLogs.showingRelevantSubgraph'
  | 'workflowLogs.mergingExpandedResults'
  | 'workflowLogs.visuallyExpandingFrom'
  | 'workflowLogs.startNodeNotFound'
  | 'workflowLogs.expandingOutwardFrom'
  | 'workflowLogs.navigationGraphSavedAfterExpansion'
  | 'workflowLogs.bfsAddedUrlsToQueue'
  | 'workflowLogs.bfsAddedUrlsFromGraph'
  | 'workflowLogs.navigationGraphSavedAfterBfs'
  | 'workflowLogs.noIploClustersFoundEmpty'
  | 'workflowLogs.noIploClustersFoundThreshold'
  | 'workflowLogs.noIploClustersFoundMatching'
  | 'workflowLogs.populatingKnowledgeGraphFromDso'
  | 'workflowLogs.knowledgeGraphPopulatedFromDso'
  | 'workflowLogs.totalCoreDocumentsCollected'
  | 'workflowLogs.noCoreDocumentsFound'
  | 'workflowLogs.diagnosticRawDocumentsBySourceKeys'
  | 'workflowLogs.diagnosticRawDocumentsBySourceEmpty'
  | 'workflowLogs.diagnosticDocumentCountsBySource'
  | 'workflowLogs.errorInNormalizeDeduplicate'
  | 'workflowLogs.startingFinalDocumentSaveVerification'
  | 'workflowLogs.failedToAddExternalLink'
  | 'workflowLogs.failedToUpdateIploNode'
  | 'workflowLogs.hybridRetrievalEnabled'
  | 'workflowLogs.exploringDiscoveredWebsites'
  | 'workflowLogs.entitiesExtractedFromUrl'
  | 'workflowLogs.entityExtractionFailed'
  | 'workflowLogs.startingBfsCrawlFromMultipleSources'
  | 'workflowLogs.foundRelevantIploUrls'
  | 'workflowLogs.bfsProgress'
  | 'workflowLogs.identifiedRelevantClusters'
  | 'workflowLogs.backfillProgress'
  | 'workflowLogs.backfillComplete'
  | 'workflowLogs.navigationGraphSavedWithDetails'
  | 'workflowLogs.queryEmbeddingGenerated'
  | 'workflowLogs.queryExpanded'
  | 'workflowLogs.queryEmbeddingGenerationFailed'
  | 'workflowLogs.hybridRetrievalFoundDocuments'
  | 'workflowLogs.hybridRetrievalComplete'
  | 'workflowLogs.hybridRetrievalFailed'
  | 'workflowLogs.normalizedDocuments'
  | 'workflowLogs.deduplicatingDocuments'
  | 'workflowLogs.deduplicatedDocuments'
  | 'workflowLogs.duplicateGroupsFound'
  | 'workflowLogs.normalizeDeduplicateCompleted'
  | 'workflowLogs.updatedDocumentsInLibrary'
  | 'workflowLogs.couldNotPersistScores'
  | 'workflowLogs.noQueryIdProvided'
  | 'workflowLogs.foundUniqueDocumentUrls'
  | 'workflowLogs.verifyingDocuments'
  | 'workflowLogs.documentVerificationComplete'
  | 'workflowLogs.skippingDocumentVerification'
  | 'workflowLogs.errorInSaveAllWorkflowDocuments'
  | 'workflowLogs.navigationGraphSavedWithDsoDocuments'
  | 'workflowLogs.processingDiscoveredUrls'
  | 'workflowLogs.failedToProcessUrl'
  | 'workflowLogs.allDocumentsFailedProcessing'
  | 'workflowLogs.documentPersistenceFailed'
  | 'workflowLogs.documentsPersisted'
  | 'workflowLogs.couldNotAddToGraph'
  | 'workflowLogs.scanIploKnownSubjectsFailed'
  | 'workflowLogs.errorSearchingIplo'
  | 'workflowLogs.errorInMergeScoreCategorize'
  | 'workflowLogs.errorSearchingOfficieleBekendmakingen'
  | 'workflowLogs.errorSearchingRechtspraak'
  | 'workflowLogs.dsoLocationSearchSearching'
  | 'workflowLogs.stepStarting'
  | 'workflowLogs.stepStartingNoNumber'
  | 'workflowLogs.dsoGeometrySearchSearching'
  | 'workflowLogs.dsoGeometrySearchFound'
  | 'workflowLogs.dsoGeometrySearchError'
  | 'workflowLogs.dsoGeometrySearchFailedToFetch'
  | 'workflowLogs.step3ErrorDiagnostic'
  | 'workflowLogs.step3ErrorStackTrace'
  | 'workflowLogs.step4ErrorDiagnostic'
  | 'workflowLogs.step4ErrorStackTrace'
  | 'workflowLogs.step7ErrorDiagnostic'
  | 'workflowLogs.step7ErrorStackTrace'
  | 'workflowLogs.step1ADocumentNotAvailable'
  | 'workflowLogs.step1AErrorAcquiringZip'
  | 'workflowLogs.step1AEmptySearchQuery'
  | 'workflowLogs.step1AErrorInDsoDiscovery'
  | 'workflowLogs.step1ANoDocumentsDiscovered'
  | 'workflowLogs.step1AErrorExtractingZip'
  | 'workflowLogs.step1AErrorPersistingDocument'
  | 'workflowLogs.step1ADocumentNoQueryId'
  | 'workflowLogs.step1ADocumentQueryIdMismatch'
  | 'workflowLogs.step1ADocumentsFailedProcessing'
  | 'workflowLogs.step1APersistenceMismatch'
  | 'workflowLogs.step1ACouldNotVerifyPersistence'
  | 'workflowLogs.step1AErrorInDsoOntsluitenDiscovery'
  | 'workflowLogs.step1AFailedToProcessDocument'
  | 'workflowLogs.step1BAllDocumentsInvalid'
  | 'workflowLogs.step1BSomeDocumentsInvalid'
  | 'workflowLogs.step1BRunningStandalone'
  | 'workflowLogs.step1BCheckingEligibility'
  | 'workflowLogs.step1BUsingProvidedDocuments'
  | 'workflowLogs.step1BEnrichingTopK'
  | 'workflowLogs.step1BInvalidDocument'
  | 'workflowLogs.step1BProcessingDocuments'
  | 'workflowLogs.step1BDocumentsFailed'
  | 'workflowLogs.step1BSuccessfullyProcessed'
  | 'workflowLogs.step1BSkippingEnrichment'
  | 'workflowLogs.dsoLocationSearchDiscovered'
  | 'workflowLogs.dsoLocationSearchLimited'
  | 'workflowLogs.dsoLocationSearchProcessing'
  | 'workflowLogs.dsoLocationSearchFailedToProcess'
  | 'workflowLogs.dsoLocationSearchWarningFailed'
  | 'workflowLogs.dsoLocationSearchSuccessfullyProcessed'
  | 'workflowLogs.dsoLocationSearchSuccessFoundBoth'
  | 'workflowLogs.dsoLocationSearchWarningMissing'
  | 'workflowLogs.dsoLocationSearchErrorDiagnostic'
  | 'workflowLogs.dsoLocationSearchStackTrace'
  | 'workflowLogs.stepMarkedAsCompleted'
  | 'workflowLogs.executingStepWithRetry'
  | 'workflowLogs.fetchingDsoDocumentsByGeometry'
  | 'workflowLogs.geometryRetrieved'
  | 'workflowLogs.retrievingGeometry'
  | 'workflowLogs.foundEnrichedDsoDocuments'
  | 'workflowLogs.foundDsoDiscoveryDocuments'
  | 'workflowLogs.foundDsoGeometryDocuments'
  | 'workflowLogs.foundIploDocuments'
  | 'workflowLogs.foundKnownSourcesDocuments'
  | 'workflowLogs.updatingDocumentsWithScores'
  | 'workflowLogs.errorScrapingIplo'
  | 'workflowLogs.errorExploringUrl'
  | 'workflowLogs.stackTrace'
  | 'workflowLogs.crawlingUrl'
  | 'workflowLogs.foundDocumentsOnUrl'
  | 'workflowLogs.followingLinksFromUrl'
  | 'workflowLogs.errorCrawlingUrl'
  | 'workflowLogs.searchingIplo'
  | 'workflowLogs.errorScrapingIploSearch'
  | 'workflowLogs.foundRelevantNodesInGraph'
  | 'workflowLogs.bfsExploringUrl'
  | 'workflowLogs.bfsExtractedLinks'
  | 'workflowLogs.fetchFailed'
  | 'workflowLogs.findingsFound'
  | 'workflowLogs.findingsSummary'
  | 'workflowLogs.geographicFilterApplied'
  | 'workflowLogs.geographicFilterRemovedAll'
  | 'workflowLogs.geographicFilterRemovedPercentage'
  | 'workflowLogs.iploTotal'
  | 'workflowLogs.progressUpdate'
  | 'workflowLogs.removedDuplicates'
  | 'workflowLogs.semanticSimilarityScoresAdded'
  | 'workflowLogs.step5RunningStandalone'
  | 'workflowLogs.step5MergingScoringCategorizing'
  | 'workflowLogs.step5Merged'
  | 'workflowLogs.step5ScoredRanked'
  | 'workflowLogs.step5Categorized'
  | 'workflowLogs.step3FixtureDocumentsPersisted'
  | 'workflowLogs.step5DocumentsPersisted'
  | 'workflowLogs.step5CreatedQuery'
  | 'workflowLogs.step5WarningCouldNotCreateQuery'
  | 'workflowLogs.step5NoQueryIdOrOnderwerp'
  | 'workflowLogs.step6UsingFixture'
  | 'workflowLogs.step6Searching'
  | 'workflowLogs.step6Found'
  | 'workflowLogs.step7UsingFixture'
  | 'workflowLogs.step7Searching'
  | 'workflowLogs.step7ExpandedQuery'
  | 'workflowLogs.step7DiscoveringEcli'
  | 'workflowLogs.step7QueryFound'
  | 'workflowLogs.step7QueryFailed'
  | 'workflowLogs.step7EarlyExit'
  | 'workflowLogs.step7NoEcliFound'
  | 'workflowLogs.step7FoundUniqueEcli'
  | 'workflowLogs.step7FoundEcliProcessing'
  | 'workflowLogs.step7FailedToProcessEcli'
  | 'workflowLogs.step7ProcessedJurisprudence'
  | 'workflowLogs.step1AErrorStackTrace'
  | 'workflowLogs.step1AErrorDiagnostic'
  | 'workflowLogs.dsoEnrichmentErrorDiagnostic'
  | 'workflowLogs.dsoEnrichmentErrorStackTrace'
  | 'workflowLogs.step4UsingFixture'
  | 'workflowLogs.step4FixtureModeEnabled'
  | 'workflowLogs.step4UsingProvidedWebsiteData'
  | 'workflowLogs.step4WarningInvalidResult'
  | 'workflowLogs.step4FoundWebsites'
  | 'workflowLogs.step8CheckingIfShouldRun'
  | 'workflowLogs.step8SkippingCommonCrawl'
  | 'workflowLogs.step8CommonCrawlServiceAvailable'
  | 'workflowLogs.step8WarningCommonCrawlValidationFailed'
  | 'workflowLogs.step8StartingCommonCrawl'
  | 'workflowLogs.step8UsingFixture'
  | 'workflowLogs.step8UsingFixtureWithQueryId'
  | 'workflowLogs.step8UsingFixtureCreatedQuery'
  | 'workflowLogs.step8DiscoveredDomains'
  | 'workflowLogs.step8CommonCrawlDiscoveryComplete'
  | 'workflowLogs.step8ProcessedCommonCrawlDocuments'
  | 'workflowLogs.step8ProcessedCommonCrawlDocumentsWithQuery'
  | 'workflowLogs.step8ProcessedCommonCrawlDocumentsWarning'
  | 'workflowLogs.step8ProcessedCommonCrawlDocumentsNoQuery'
  | 'workflowLogs.commonCrawlDiscoveryError'
  | 'workflowLogs.scrapingDomain'
  | 'workflowLogs.scrapedDocumentsFromDomain'
  | 'workflowLogs.errorScrapingDomain'
  | 'workflowLogs.linkedToRelatedNodes'
  | 'workflowLogs.navigationGraphSavedWithRechtspraak'
  | 'workflowLogs.navigationGraphSavedWithRechtspraakAndRelationships'
  | 'workflowLogs.step5UsingFixtureDocumentsWithQuery'
  | 'workflowLogs.workflowExecutionStartedEmoji'
  | 'workflowLogs.workflowExecutionStartedPlain'
  | 'workflowLogs.workflowExecutionStartedWithRunId'
  | 'workflowLogs.workflowCompletedEmoji'
  | 'workflowLogs.workflowFailedEmoji'
  | 'workflowLogs.startingExternalLinkExplorationFromIplo'
  | 'workflowLogs.collectingExternalLinks'
  | 'workflowLogs.skippingIploHtmlSearch'
  | 'workflowLogs.processingDocumentsAfterTheme'
  | 'workflowLogs.addingSemanticSimilarity'
  | 'workflowLogs.trimmingToTop'
  | 'workflowLogs.trimmedTo'
  | 'workflowLogs.noSemanticSimilarity'
  | 'workflowLogs.iploPagesToScan'
  | 'workflowLogs.externalLinksCollected'
  | 'workflowLogs.invalidLinksFiltered'
  | 'workflowLogs.failedToFetchIploPages'
  | 'workflowLogs.processedExternalLinks'
  | 'workflowLogs.queryTimeoutReached'
  | 'workflowLogs.targetScopeContainsSimple'
  | 'workflowLogs.identifiedRelevantClustersSimple'
  | 'workflowLogs.foundDocumentsSimple'
  | 'workflowLogs.bfsExplorationStarting'
  | 'workflowLogs.bfsExploring'
  | 'workflowLogs.bfsExtractedLinksDetailed'
  | 'workflowLogs.bfsAddedUrlsFromGraphDetailed'
  | 'workflowLogs.commonCrawlError'
  | 'workflowLogs.dsoStep1AFilteredUnrecognizedFormats'
  | 'workflowLogs.dsoStep1ALimitedResults'
  | 'workflowLogs.dsoStep1AProcessingPhase'
  | 'workflowLogs.dsoStep1AProcessingDocument'
  | 'workflowLogs.progressUpdateDetailed'
  | 'workflowLogs.productionModeComplete'
  | 'apiMessages.scheduledJobUpdated'
  | 'apiMessages.scheduledJobDeleted'
  | 'apiMessages.scheduledJobEnabled'
  | 'apiMessages.scheduledJobDisabled'
  | 'apiMessages.workflowPaused'
  | 'apiMessages.workflowResumed'
  | 'apiMessages.workflowDeleted'
  | 'apiMessages.subgraphDeleted'
  | 'apiMessages.queryAndResultsDeleted'
  | 'apiMessages.teamAccessRemoved'
  | 'apiMessages.accessRemoved'
  | 'apiMessages.passwordReset'
  | 'apiMessages.errorMarkedAsResolved'
  | 'apiMessages.thresholdGroupCreated'
  | 'apiMessages.thresholdsAutoAdjusted'
  | 'apiMessages.noAdjustmentsNeeded'
  | 'apiMessages.thresholdsImported'
  | 'apiMessages.scheduleCreated'
  | 'apiMessages.scheduleUpdated'
  | 'apiMessages.scheduleDeleted'
  | 'apiMessages.graphStreamCleanedUp'
  | 'apiMessages.documentsCreated'
  | 'apiMessages.logoutSuccessful'
  | 'apiMessages.profileUpdated'
  | 'apiMessages.passwordResetSuccessful'
  | 'apiMessages.tokenRevoked'
  | 'apiMessages.allTokensRevoked'
  | 'apiMessages.passwordResetLinkSent'
  | 'apiMessages.templateDeleted'
  | 'apiMessages.templateApplied'
  | 'apiMessages.candidateReviewed'
  | 'apiMessages.candidatesReviewed'
  | 'apiMessages.reviewCompletedResumed'
  | 'apiMessages.reviewDeleted'
  | 'apiMessages.reviewsDeleted'
  | 'apiMessages.allNotificationsMarkedRead'
  | 'apiMessages.notificationDeleted'
  | 'apiMessages.featureFlagsCacheRefreshed'
  | 'apiMessages.templateAppliedSuccessfully'
  | 'apiMessages.benchmarkConfigApplied'
  | 'apiMessages.workflowStarted'
  | 'apiMessages.workflowQueued'
  | 'apiMessages.scheduledExportDeleted'
  | 'apiMessages.testExecutionStateReset'
  | 'toastMessages.pleaseSelectDocuments'
  | 'toastMessages.exportingTo'
  | 'toastMessages.exportedToSuccessfully'
  | 'toastMessages.failedToExport'
  | 'toastMessages.failedToPreviewRollback'
  | 'toastMessages.failedToRollback'
  | 'toastMessages.failedToDuplicate'
  | 'toastMessages.pleaseTryAgain'
  | 'toastMessages.workflowRolledBack'
  | 'toastMessages.workflowExported'
  | 'toastMessages.workflowDuplicated'
  | 'workflowDetails.confirmRollback'
  | 'workflowDetails.workflowRolledBackMessage'
  | 'workflowDetails.workflowExportedMessage'
  | 'workflowDetails.workflowDuplicatedMessage'
  | 'beleidsscan.startWorkflowWithoutWebsites'
  | 'toastMessages.nameRequired'
  | 'toastMessages.templateContentRequired'
  | 'toastMessages.templateUpdated'
  | 'toastMessages.templateCreated'
  | 'toastMessages.templateDeleted'
  | 'toastMessages.failedToSaveTemplate'
  | 'toastMessages.failedToDeleteTemplate'
  | 'toastMessages.pleaseTryAgainLater'
  | 'workflowDetails.rollbackNotePlaceholder'
  | 'knowledgeGraph.commitMessagePlaceholder'
  | 'knowledgeGraph.stashDescriptionPlaceholder'
  | 'knowledgeGraph.selectSourceBranch'
  | 'knowledgeGraph.selectTargetBranch'
  | 'knowledgeGraph.cancel'
  | 'knowledgeGraph.commit'
  | 'knowledgeGraph.stash'
  | 'common.skipToMainContent'
  | 'knowledgeGraph.commitPendingChanges'
  | 'knowledgeGraph.commitDescription'
  | 'knowledgeGraph.commitMessage'
  | 'knowledgeGraph.stashChanges'
  | 'knowledgeGraph.stashDescription'
  | 'knowledgeGraph.descriptionOptional'
  | 'knowledgeGraph.branchManagement'
  | 'knowledgeGraph.switchBranchesOrCreate'
  | 'knowledgeGraph.currentBranch'
  | 'knowledgeGraph.availableBranches'
  | 'knowledgeGraph.createNewBranch'
  | 'knowledgeGraph.branchNamePlaceholder'
  | 'knowledgeGraph.create'
  | 'knowledgeGraph.close'
  | 'knowledgeGraph.current'
  | 'knowledgeGraph.switch'
  | 'knowledgeGraph.mergeBranches'
  | 'knowledgeGraph.mergeOneBranchIntoAnother'
  | 'knowledgeGraph.sourceBranch'
  | 'knowledgeGraph.targetBranch'
  | 'knowledgeGraph.merge'
  | 'knowledgeGraph.branchDiff'
  | 'knowledgeGraph.compareDifferences'
  | 'knowledgeGraph.compareBranches'
  | 'toastMessages.pleaseEnterTemplateName'
  | 'toastMessages.pleaseEnterTemplateContent'
  | 'toastMessages.templateUpdatedMessage'
  | 'toastMessages.templateCreatedMessage'
  | 'toastMessages.templateDeletedMessage'
  | 'toastMessages.pleaseEnterRecipientEmails'
  | 'toastMessages.pleaseEnterValidEmails'
  | 'toastMessages.sendingEmail'
  | 'toastMessages.emailSentSuccessfully'
  | 'toastMessages.failedToSendEmail'
  | 'toastMessages.failedToLoadData'
  | 'toastMessages.failedToLoadRecommendations'
  | 'apiMessages.thresholdsUpdated'
  | 'apiMessages.testsStarted'
  | 'apiMessages.userRegistered'
  | 'apiMessages.loginSuccessful'
  | 'apiMessages.userRoleUpdated'
  | 'apiMessages.userActivated'
  | 'apiMessages.userDeactivated'
  | 'apiMessages.scheduledJobCreated'
  | 'apiMessages.branchesMerged'
  | 'apiMessages.mergeCompletedWithConflicts'
  | 'apiMessages.templateAppliedSuccessfullyWithName'
  | 'toastMessages.exportSuccessful'
  | 'toastMessages.urlCopied'
  | 'toastMessages.copyFailed'
  | 'toastMessages.pleaseSelectBothDocuments'
  | 'toastMessages.pleaseSelectTwoDifferentDocuments'
  | 'toastMessages.documentComparisonCompleted'
  | 'toastMessages.commandCompletedSuccessfully'
  | 'toastMessages.commandFailed'
  | 'toastMessages.failedToLoadFlakeDetection'
  | 'toastMessages.failedToLoadPerformanceDrift'
  | 'toastMessages.failedToLoadFailureTimeline'
  | 'toastMessages.failedToLoadDependencies'
  | 'toastMessages.failedToLoadAlerts'
  | 'apiMessages.workflowQueuedForExecution'
  | 'apiMessages.runAlreadyCancelledOrCompleted'
  | 'apiMessages.runCancelled'
  | 'apiMessages.runAlreadyInTerminalOrPaused'
  | 'apiMessages.runPauseRequested'
  | 'apiMessages.changesCommitted'
  | 'apiMessages.changesStashed'
  | 'apiMessages.versionLogNotImplemented'
  | 'apiMessages.runTestsFirst'
  | 'apiMessages.failedToReadDashboardData'
  | 'apiMessages.noPerformanceTrendsData'
  | 'apiMessages.noCoverageData'
  | 'alerts.highFailureRateTitle'
  | 'alerts.highFailureRateMessage'
  | 'alerts.flakyTestsTitle'
  | 'alerts.flakyTestsMessage'
  | 'alerts.lowCoverageTitle'
  | 'alerts.lowCoverageMessage'
  | 'alerts.performanceIssuesTitle'
  | 'alerts.performanceIssuesMessage'
  | 'dataAvailability.coverageAvailable'
  | 'dataAvailability.coverageNotFound'
  | 'dataAvailability.performanceTrendsAvailable'
  | 'dataAvailability.performanceTrendsNotFound'
  | 'dataAvailability.dashboardDataAvailable'
  | 'dataAvailability.dashboardDataNotFound'
  | 'workflowLogs.step5UsingFixtureDocumentsNoQuery'
  | 'workflowLogs.step1AUsingFixtureDocuments'
  // Workflow step names & workflow-level messages
  | 'workflowSteps.startingExecution'
  | 'workflowSteps.saveNavigationGraph'
  | 'workflowSteps.initializeNavigationGraph'
  | 'workflowSteps.exploreIPLO'
  | 'workflowSteps.exploreExternalLinks'
  | 'workflowSteps.createRelevantSubgraph'
  | 'workflowSteps.expandFromRelevantNodes'
  | 'workflowSteps.mergeResultsIntoMainGraph'
  | 'workflowSteps.saveResults'
  | 'workflowSteps.findRelevantNodes'
  | 'workflowSteps.findStartingNode'
  | 'workflowSteps.bfsExplore3Hops'
  | 'workflowSteps.enhanceQueryWithImbor'
  | 'workflowSteps.scanIPLO'
  | 'workflowSteps.scanKnownSources'
  | 'workflowSteps.crossReferenceWithGoogle'
  | 'workflowSteps.scoreAndFilterDocuments'
  | 'workflowSteps.exploreDiscoveredWebsites'
  | 'workflowSteps.resumingWorkflow'
  | 'workflowSteps.executingStep'
  | 'workflowSteps.stepCompleted'
  | 'workflowSteps.startingStep'
  | 'workflowSteps.scrapeHorstMunicipality'
  | 'workflowSteps.scrapeHorstMunicipalityArbeidsmigratie'
  | 'workflowSteps.scanIPLOForArbeidsmigratie'
  | 'workflowSteps.scanIPLOForKnownSubjects'
  | 'workflowSteps.targetedGoogleSearch'
  | 'workflowSteps.bfsCrawlFromDiscoveredUrls'
  | 'workflowSteps.exploreIPLOWithSemanticTargeting'
  | 'workflowSteps.title'
  | 'workflowSteps.action'
  // Command
  | 'command.completedSuccess'
  | 'command.completedDesc'
  | 'command.failed'
  | 'command.failedDesc'
  | 'command.executeFailed'
  // CommandOutput
  | 'commandOutput.title'
  | 'commandOutput.status.running'
  | 'commandOutput.status.completed'
  | 'commandOutput.status.error'
  | 'commandOutput.status.idle'
  | 'commandOutput.copy'
  | 'commandOutput.copied'
  | 'commandOutput.clear'
  | 'commandOutput.filterPlaceholder'
  | 'commandOutput.filterAll'
  | 'commandOutput.filterError'
  | 'commandOutput.filterWarning'
  | 'commandOutput.filterSuccess'
  | 'commandOutput.filterInfo'
  | 'commandOutput.autoScrollPaused'
  | 'commandOutput.noOutputYet'
  | 'commandOutput.noMatchingLogs'
  // WorkflowStatus
  | 'workflowStatus.running'
  | 'workflowStatus.completed'
  | 'workflowStatus.failed'
  | 'workflowStatus.pending'
  | 'workflowStatus.cancelled'
  | 'workflowStatus.completed_with_errors'
  | 'workflowStatus.published'
  | 'workflowStatus.draft'
  | 'workflowStatus.testing'
  | 'workflowStatus.tested'
  | 'workflowStatus.unpublished'
  | 'workflowStatus.deprecated'
  // WorkflowStatusDescription
  | 'workflowStatusDescription.draft'
  | 'workflowStatusDescription.testing'
  | 'workflowStatusDescription.tested'
  | 'workflowStatusDescription.published'
  | 'workflowStatusDescription.unpublished'
  | 'workflowStatusDescription.deprecated'
  // StatusTransition
  | 'statusTransition.pleaseSelectStatus'
  | 'statusTransition.publishWithoutQualityGates'
  | 'statusTransition.currentStatus'
  | 'statusTransition.selectNewStatus'
  | 'statusTransition.commentOptional'
  | 'statusTransition.commentPlaceholder'
  | 'statusTransition.qualityGatesCheck'
  | 'statusTransition.minimumTestRuns'
  | 'statusTransition.acceptanceRate'
  | 'statusTransition.errorRate'
  | 'statusTransition.runningInstances'
  | 'statusTransition.checkingRunningInstances'
  | 'statusTransition.activeInstancesSingular'
  | 'statusTransition.activeInstancesPlural'
  | 'statusTransition.letInstancesComplete'
  | 'statusTransition.cancelAllInstances'
  | 'statusTransition.noRunningInstances'
  | 'statusTransition.changeStatus'
  // WorkflowDetails
  | 'workflowDetails.title'
  | 'workflowDetails.backToWorkflows'
  | 'workflowDetails.averageExecutionTime'
  | 'workflowDetails.peakExecutionTime'
  | 'workflowDetails.successRate'
  | 'workflowDetails.peakUsage'
  | 'workflowDetails.totalRuns'
  | 'workflowDetails.recentRuns'
  | 'workflowDetails.noRunsFound'
  | 'workflowDetails.runLogs'
  | 'workflowDetails.selectRunToViewLogs'
  | 'workflowDetails.loadingLogs'
  | 'workflowDetails.noLogsAvailable'
  | 'workflowDetails.workflowErrors'
  | 'workflowDetails.noErrorsFound'
  | 'workflowDetails.hideErrors'
  | 'workflowDetails.showErrors'
  | 'workflowDetails.loadingErrors'
  | 'workflowDetails.noDescription'
  | 'workflowDetails.loadingModules'
  | 'workflowDetails.noModulesDetected'
  | 'workflowDetails.modulesUsed'
  | 'workflowDetails.usedInSteps_one'
  | 'workflowDetails.usedInSteps_other'
  | 'workflowDetails.statusHistory'
  | 'workflowDetails.by'
  | 'workflowDetails.versionHistory'
  | 'workflowDetails.rollback'
  | 'workflowDetails.rollbackWorkflow'
  | 'workflowDetails.selectVersionToRollback'
  | 'workflowDetails.loadingVersions'
  | 'workflowDetails.noPreviousVersions'
  | 'workflowDetails.rollbackPreview'
  | 'workflowDetails.currentVersion'
  | 'workflowDetails.targetVersion'
  | 'workflowDetails.warnings'
  | 'workflowDetails.changes'
  | 'workflowDetails.commentOptional'
  | 'workflowDetails.rollingBack'
  | 'workflowDetails.rollbackToVersion'
  | 'workflowDetails.loadingVersionHistory'
  | 'workflowDetails.current'
  | 'workflowDetails.noVersionHistory'
  | 'workflowDetails.publicationInfo'
  | 'workflowDetails.publishedBy'
  | 'workflowDetails.publishedAt'
  | 'workflowDetails.stepId'
  | 'workflowDetails.parameters'
  | 'workflowDetails.published'
  // Workflows
  | 'workflows.noWorkflowsFound'
  // WorkflowResults UI
  | 'workflowResults.downloadTxt'
  | 'workflowResults.downloadMarkdown'
  | 'workflowResults.downloadJson'
  | 'workflowResults.downloadSuccess'
  | 'workflowResults.downloadFailed'
  | 'workflowResults.downloadFailedMessage'
  // WorkflowPage
  | 'workflowPage.downloadLogsTooltip'
  // Workflow
  | 'workflow.commaSeparatedValues'
  | 'workflow.workflowId'
  | 'workflow.uniqueIdentifier'
  | 'workflow.workflowName'
  | 'workflow.description'
  | 'workflow.describeWorkflow'
  | 'workflow.workflowModules'
  | 'workflow.addModule'
  | 'workflow.noModulesAdded'
  | 'workflow.step'
  | 'workflow.selectModule'
  | 'workflow.loadingModules'
  | 'workflow.chooseModule'
  | 'workflow.failed'
  | 'workflow.failedDesc'
  | 'workflow.completed'
  | 'workflow.completedDesc'
  | 'workflow.completedWithErrors'
  | 'workflow.completedWithErrorsDesc'
  | 'workflow.cancelled'
  | 'workflow.cancelledDesc'
  | 'workflow.statusFetchFailed'
  | 'workflow.statusFetchFailedDesc'
  | 'workflow.subjectRequired'
  | 'workflow.subjectRequiredDesc'
  | 'workflow.pausedFound'
  | 'workflow.pausedFoundDesc'
  | 'workflow.started'
  | 'workflow.startedDesc'
  | 'workflow.startedNoProgress'
  | 'workflow.startedNoProgressDesc'
  | 'workflow.validationError'
  | 'workflow.invalidParameters'
  | 'workflow.invalidParametersDesc'
  | 'workflow.notFound'
  | 'workflow.notFoundDesc'
  | 'workflow.queueFull'
  | 'workflow.queueFullDesc'
  | 'workflow.newOwnerLabel'
  | 'workflow.transferOwnershipFailed'
  | 'workflow.ownershipTransferred'
  | 'workflow.ownershipTransferredDesc'
  | 'workflow.review.resumed'
  | 'workflow.review.resumedDesc'
  | 'workflow.review.loadFailed'
  | 'workflow.review.completed'
  | 'workflow.review.submitFailed'
  | 'workflow.review.notFound'
  | 'workflow.review.notFoundDesc'
  | 'workflow.review.resumedAndStatus'
  | 'workflow.review.onlyWhenPaused'
  // WorkflowQualityGates
  | 'workflowQualityGates.title'
  | 'workflowQualityGates.checking'
  | 'workflowQualityGates.passed'
  | 'workflowQualityGates.notMet'
  | 'workflowQualityGates.allMet'
  | 'workflowQualityGates.readyToPublish'
  | 'workflowQualityGates.notMetTitle'
  | 'workflowQualityGates.testMetricsSummary'
  | 'workflowQualityGates.runs'
  | 'workflowQualityGates.acceptance'
  | 'workflowQualityGates.errorRate'
  // WorkflowTimeout
  | 'workflowTimeout.warning'
  | 'workflowTimeout.willTimeoutIn'
  | 'workflowTimeout.extendOrSave'
  | 'workflowTimeout.extendTimeout'
  | 'workflowTimeout.saveProgress'
  | 'workflowTimeout.continue'
  // WorkflowRecovery
  | 'workflowRecovery.title'
  | 'workflowRecovery.description'
  | 'workflowRecovery.completedSteps'
  | 'workflowRecovery.stepsCompleted'
  | 'workflowRecovery.documentsFound'
  | 'workflowRecovery.documentsCount'
  | 'workflowRecovery.error'
  | 'workflowRecovery.resumeWorkflow'
  | 'workflowRecovery.viewPartialResults'
  | 'workflowRecovery.dismiss'
  // WorkflowTestMetrics
  | 'workflowTestMetrics.title'
  | 'workflowTestMetrics.testRuns'
  | 'workflowTestMetrics.acceptanceRate'
  | 'workflowTestMetrics.errorRate'
  | 'workflowTestMetrics.lastTestRun'
  // WorkflowManagement
  | 'workflowManagement.loadFailed'
  | 'workflowManagement.created'
  | 'workflowManagement.createdDesc'
  | 'workflowManagement.createFailed'
  | 'workflowManagement.cannotEdit'
  | 'workflowManagement.cannotEditDesc'
  | 'workflowManagement.permissionDenied'
  | 'workflowManagement.permissionDeniedDesc'
  | 'workflowManagement.updated'
  | 'workflowManagement.updatedDesc'
  | 'workflowManagement.updateFailed'
  | 'workflowManagement.statusUpdated'
  | 'workflowManagement.statusUpdateFailed'
  | 'workflowManagement.deleteConfirm'
  | 'workflowManagement.deleted'
  | 'workflowManagement.deletedDesc'
  | 'workflowManagement.deleteFailed'
  | 'workflowManagement.editWorkflow'
  | 'workflowManagement.createNewWorkflow'
  | 'workflowManagement.createWorkflow'
  | 'workflowManagement.noWorkflowsMatchFilters'
  | 'workflowManagement.noWorkflowsYet'
  | 'workflowManagement.noDescription'
  | 'workflowManagement.searchWorkflows'
  | 'workflowManagement.myWorkflows'
  | 'workflowManagement.sharedWithMe'
  | 'workflowManagement.all'
  | 'workflowManagement.loading'
  | 'workflowManagement.title'
  | 'workflowManagement.subtitle'
  | 'workflowManagement.steps'
  | 'workflowManagement.testRuns'
  | 'workflowManagement.acceptance'
  | 'workflowManagement.errorRate'
  | 'workflowManagement.details'
  | 'workflowManagement.changeStatus'
  | 'workflowManagement.share'
  | 'workflowManagement.statusChanged'
  | 'workflowManagement.runningInstance'
  | 'workflowManagement.runningInstances'
  | 'workflowManagement.cancelled'
  | 'workflowManagement.allowedToComplete'
  | 'workflowManagement.willComplete'
  | 'workflowList.loadError'
  | 'workflowList.loadErrorDesc'
  | 'workflowList.noWorkflows'
  // Feature Flags
  | 'featureFlags.noManageableFlags'
  | 'featureFlags.noFlagsInCategory'
  | 'featureFlags.allCategories'
  | 'featureFlags.noFlagsAvailable'
  | 'featureFlags.configureFirst'
  | 'featureFlags.loadFailed'
  | 'featureFlags.filterByCategory'
  | 'featureFlags.viewDependencies'
  // Workflow Actions
  | 'workflowActions.exportJson'
  | 'workflowActions.exportJsonTitle'
  | 'workflowActions.duplicate'
  | 'workflowActions.duplicateTitle'
  | 'workflowActions.duplicating'
  | 'workflowActions.share'
  // Workflow Review
  | 'workflowReview.filterCandidates'
  | 'workflowReview.sortByRelevance'
  | 'workflowReview.sortByBoostScore'
  | 'workflowReview.sortByTitle'
  | 'workflowReview.sortByUrl'
  | 'workflowReview.accepted'
  | 'workflowReview.rejected'
  | 'workflowReview.pending'
  | 'workflowReview.reviewProgress'
  | 'workflowReview.total'
  | 'workflowReview.filtered'
  | 'workflowReview.selectAllVisible'
  | 'workflowReview.deselectAllVisible'
  | 'workflowReview.acceptAllVisible'
  | 'workflowReview.rejectAllVisible'
  | 'workflowReview.selectAll'
  | 'workflowReview.deselect'
  | 'workflowReview.submit'
  | 'workflowReview.candidatesShown'
  | 'workflowReview.submitting'
  | 'workflowReview.saveAndContinue'
  | 'workflowReview.boost'
  | 'workflowReview.score'
  | 'workflowReview.showLess'
  | 'workflowReview.showMore'
  | 'workflowReview.metadata'
  // Admin Toast Messages
  | 'admin.failedToResolveError'
  | 'admin.failedToResolveTestErrors'
  | 'admin.failedToCheckSystemHealth'
  | 'admin.failedToExportLogs'
  | 'admin.failedToUpdateThreshold'
  | 'admin.failedToApplyTemplate'
  | 'admin.failedToCreateSchedule'
  | 'admin.failedToDeleteSchedule'
  | 'admin.failedToExportAuditLogs'
  | 'admin.noMetricsDataAvailable'
  | 'admin.pleaseCheckErrorAndRetry'
  | 'admin.loading'
  | 'admin.errors24h'
  | 'admin.confirmDatabaseCleanup'
  | 'admin.databaseCleanupStarted'
  | 'admin.databaseCleanupCompleted'
  | 'admin.databaseCleanupFailed'
  | 'admin.runCleanup'
  | 'admin.running'
  | 'admin.filterByComponent'
  | 'admin.filterByProcess'
  | 'admin.filterByProcessTitle'
  | 'admin.filterByTargetId'
  | 'admin.search'
  | 'admin.action'
  | 'admin.targetType'
  | 'admin.targetId'
  | 'admin.component'
  | 'admin.process'
  | 'admin.status'
  | 'workflowComparison.failedToLoadActiveComparisons'
  | 'workflowComparison.failedToFetchStatus'
  | 'workflowComparison.rateLimited'
  | 'workflowComparison.connectionLost'
  | 'workflowComparison.connectionIssue'
  | 'workflowLogs.steps'
  | 'workflowLogs.estimatedTimeRemaining'
  | 'common.of'
  | 'common.selected'
  | 'common.usesCoseBilkentLayout'
  | 'common.dismissError'
  | 'common.loadingMetrics'
  | 'common.allOperations'
  | 'admin.auditLogs'
  | 'admin.passwordReset'
  | 'admin.workflowPaused'
  | 'admin.workflowResumed'
  | 'admin.thresholdUpdated'
  | 'admin.thresholdScheduleCreated'
  | 'admin.thresholdScheduleUpdated'
  | 'admin.thresholdScheduleDeleted'
  | 'admin.ipAddress'
  | 'admin.recentErrors'
  | 'admin.learningServiceDisabled'
  | 'admin.enableLearningService'
  | 'admin.performanceAlerts'
  | 'admin.performanceDashboard'
  | 'common.sevenDays'
  | 'test.applicationErrorLogs'
  | 'test.loadingErrorLogs'
  | 'common.notAvailable'
  | 'test.noTestRunsMatchFilters'
  | 'test.comparedToPreviousRun'
  | 'test.testNotificationMessage'
  | 'test.settingsSavedSuccessfully'
  | 'common.emailAddresses'
  | 'test.noActiveFailuresData'
  | 'test.identifyProblematicErrorPatterns'
  | 'common.selectDocument'
  | 'common.deselectDocument'
  | 'common.selectGovernmentLayer'
  | 'admin.errorResolved'
  | 'admin.resolving'
  | 'admin.resolveTestErrors'
  | 'admin.healthy'
  | 'admin.unhealthy'
  | 'admin.unknown'
  | 'admin.traceDetails'
  | 'admin.completeTraceInformation'
  | 'admin.allLevels'
  | 'admin.minInteractions'
  | 'admin.averageMetadataConfidence'
  | 'admin.documentsWithLowConfidence'
  | 'admin.qualityReport'
  | 'admin.overallMetrics'
  | 'admin.coverage'
  | 'admin.avgConfidence'
  | 'admin.accuracy'
  | 'admin.byMethod'
  | 'admin.correctMetadata'
  | 'admin.callsByOperation'
  | 'admin.performanceMetrics'
  | 'test.autoScrollOn'
  | 'test.autoScrollOff'
  | 'test.execution.title'
  | 'test.execution.runAllTests'
  | 'test.execution.stopTests'
  | 'test.execution.started'
  | 'test.execution.processId'
  | 'test.execution.testFile'
  | 'test.execution.error'
  | 'test.execution.resultsReady'
  | 'test.execution.loading'
  | 'test.execution.viewLogFiles'
  | 'test.execution.logFiles'
  | 'test.execution.savedIn'
  | 'test.execution.logContent'
  | 'test.execution.logsAutoSaved'
  | 'test.execution.clear'
  | 'test.execution.waitingForOutput'
  | 'test.execution.workflowStepsMonitoring'
  | 'test.execution.loadingStatus'
  | 'test.execution.pipelineStatus'
  | 'test.execution.executionId'
  | 'test.execution.active'
  | 'test.execution.currentStep'
  | 'test.execution.step'
  | 'test.execution.progress'
  | 'test.execution.steps'
  | 'test.execution.estimatedTimeRemaining'
  | 'test.execution.stepProgress'
  | 'test.execution.completed'
  | 'test.execution.running'
  | 'test.execution.pending'
  | 'test.execution.noWorkflowStepsActive'
  | 'test.execution.liveLogs'
  | 'test.execution.workflow'
  | 'testAdvancedSearch.show'
  | 'testAdvancedSearch.hide'
  | 'featureFlags.enabled'
  | 'featureFlags.disabled'
  | 'common.page'
  | 'common.showing'
  | 'common.to'
  | 'common.entries'
  | 'common.runs'
  | 'common.errors'
  | 'common.reviewed'
  | 'common.results'
  | 'common.hadFailures'
  | 'common.exporting'
  | 'common.last5Runs'
  | 'common.last7DaysExecutionFrequency'
  | 'common.lastSeen'
  | 'common.resetFilters'
  | 'common.emailPlaceholder'
  | 'common.userEmailPlaceholder'
  | 'common.example'
  | 'common.moreInfo'
  | 'common.performance'
  | 'common.performanceMetrics'
  | 'common.noCoverageData'
  | 'common.runTestsWithCoverage'
  | 'common.performanceRegressionDetected'
  | 'common.averageDurationIncreased'
  | 'common.comparedToPreviousPeriod'
  | 'common.filters'
  | 'common.clearFilters'
  | 'common.help'
  | 'common.open'
  | 'common.all'
  | 'common.ok'
  | 'common.reset'
  | 'common.continue'
  | 'common.finish'
  | 'common.start'
  | 'common.stop'
  | 'common.pause'
  | 'common.resume'
  | 'common.update'
  | 'common.create'
  | 'common.view'
  | 'common.details'
  | 'common.more'
  | 'common.less'
  | 'common.show'
  | 'common.hide'
  | 'common.copy'
  | 'common.paste'
  | 'common.cut'
  | 'common.undo'
  | 'common.redo'
  | 'common.info'
  | 'common.warning'
  | 'common.alert'
  | 'common.required'
  | 'common.optional'
  | 'common.invalid'
  | 'common.valid'
  | 'common.empty'
  | 'common.full'
  | 'common.complete'
  | 'common.incomplete'
  | 'common.pending'
  | 'common.active'
  | 'common.inactive'
  | 'common.enabled'
  | 'common.disabled'
  | 'common.nodes'
  | 'common.allCategories'
  | 'common.allStrategies'
  | 'admin.filterByUrl'
  | 'admin.filterByQuery'
  | 'admin.gdsMetricsDashboard'
  | 'admin.minDegree'
  | 'admin.traceDetails'
  | 'admin.completeTraceInformation'
  | 'admin.errorRate'
  | 'admin.lowConfidence'
  | 'admin.errors'
  | 'admin.callsByOperation'
  | 'admin.performanceMetrics'
  | 'admin.entityMetadata'
  | 'admin.loadingMetadata'
  | 'admin.fullMetadata'
  | 'admin.showBottlenecksOnly'
  | 'admin.bottlenecksLabel'
  | 'admin.errorPattern'
  | 'admin.searchErrorMessage'
  | 'admin.filterByTestFile'
  | 'admin.minimumOccurrences'
  | 'admin.category'
  | 'admin.pattern'
  | 'admin.errorMessage'
  | 'admin.testFilePath'
  | 'admin.minOccurrences'
  | 'workflow.stepIdPlaceholder'
  | 'workflow.stepNamePlaceholder'
  | 'workflow.stepActionPlaceholder'
  | 'workflow.workflowIdPlaceholder'
  | 'workflow.allCategories'
  | 'workflow.moduleParameters'
  | 'workflow.noConfigurableParameters'
  | 'workflow.stepId'
  | 'workflow.stepName'
  | 'workflow.action'
  | 'workflow.transferOwnershipConfirm'
  | 'workflow.transferOwnership'
  | 'workflow.transferWorkflowOwnership'
  | 'workflow.note'
  | 'workflow.transferOwnershipNote'
  | 'workflow.owner'
  | 'workflow.noSharedUsers'
  | 'workflow.noActivity'
  | 'common.setViaEnvironmentVariable'
  | 'common.usesCoseBilkentLayout'
  | 'common.colorNodesByDomain'
  | 'common.pendingChange'
  | 'admin.resolveTestErrorsTooltip'
  | 'admin.tableMessage'
  | 'admin.tableSeverity'
  | 'admin.tableComponent'
  | 'admin.tableLocation'
  | 'admin.tableOccurrences'
  | 'admin.tableStatus'
  | 'admin.tableActions'
  | 'admin.tableName'
  | 'admin.tableEmail'
  | 'admin.tableRole'
  | 'admin.tableTourGuide'
  | 'admin.tableLastLogin'
  | 'admin.labelWebsiteUrl'
  | 'admin.labelQuery'
  | 'admin.labelStrategy'
  | 'admin.labelStartDate'
  | 'admin.labelEndDate'
  | 'admin.strategyAll'
  | 'admin.strategySiteSearch'
  | 'admin.strategyAINavigation'
  | 'admin.strategyTraditionalCrawl'
  | 'admin.strategyHybrid'
  | 'admin.templateAppliedSuccessfully'
  | 'admin.scheduleCreatedSuccessfully'
  | 'admin.invalidDate'
  | 'admin.invalidStartDate'
  | 'admin.invalidEndDate'
  | 'admin.startDateMustBeBeforeEndDate'
  | 'admin.failedToLoadTraces'
  | 'admin.failedToLoadTraceDetails'
  | 'admin.tracesExported'
  | 'admin.tracesExportedSuccessfully'
  | 'admin.failedToExportTraces'
  | 'admin.enableTourGuide'
  | 'admin.disableTourGuide'
  | 'beleidsscan.draftSaved'
  | 'beleidsscan.draftSavedDesc'
  | 'beleidsscan.saved'
  | 'beleidsscan.save'
  | 'beleidsscan.saveButton'
  | 'beleidsscan.noDraftFound'
  | 'beleidsscan.noDraftFoundDesc'
  | 'beleidsscan.scanProgress'
  | 'beleidsscan.updateQuery'
  | 'beleidsscan.updateQueryTooltip'
  | 'beleidsscan.saveAsNew'
  | 'beleidsscan.saveAsNewTooltip'
  | 'beleidsscan.cancelEdit'
  | 'beleidsscan.cancelEditTooltip'
  | 'beleidsscan.completeQuery'
  | 'beleidsscan.saveProgressTooltip'
  // OnderwerpInput
  | 'onderwerpInput.enterSubject'
  | 'onderwerpInput.requiredField'
  | 'onderwerpInput.optional'
  | 'onderwerpInput.chooseSuggestionOrType'
  | 'onderwerpInput.placeholder'
  | 'onderwerpInput.enterSubjectAria'
  | 'onderwerpInput.topicSuggestions'
  | 'onderwerpInput.popularTopics'
  | 'onderwerpInput.recentSearches'
  | 'onderwerpInput.selectTopic'
  | 'onderwerpInput.noSuggestionsFound'
  | 'onderwerpInput.noSuggestionsFoundMessage'
  | 'onderwerpInput.searchResults'
  | 'onderwerpInput.subjectValid'
  | 'onderwerpInput.characterCount'
  | 'onderwerpInput.minimumCharactersRequired'
  | 'common.pendingReview'
  | 'common.monday'
  | 'common.tuesday'
  | 'common.wednesday'
  | 'common.thursday'
  | 'common.friday'
  | 'common.saturday'
  | 'common.sunday'
  | 'common.revisionNeeded'
  | 'common.approved'
  | 'common.rejected'
  | 'library.documentAdded'
  | 'library.documentAddedDesc'
  | 'benchmark.uploadCompleted'
  | 'benchmark.uploadCompletedDesc'
  | 'benchmark.uploadFailed'
  | 'stepNavigation.step1Announcement'
  | 'stepNavigation.step2Announcement'
  | 'stepNavigation.step3Announcement'
  | 'common.noDocumentsFound'
  | 'common.noDocumentsFoundWithFilters'
  | 'common.notSpecified'
  | 'common.failedToLoadGraph'
  | 'common.failedToLoadErrors'
  | 'common.sending'
  | 'common.sendEmail'
  | 'test.noFlakyTestsDetected'
  | 'test.oneFlakyTestDetected'
  | 'test.flakyTestsDetected'
  | 'test.passRate'
  | 'common.tryOtherSearchTerms'
  | 'common.usingBackend'
  | 'common.graphDB'
  | 'common.neo4j'
  | 'common.selectNothing'
  | 'common.selectAll'
  | 'common.unknownError'
  | 'admin.exportingTraces'
  | 'admin.exportTraces'
  | 'admin.hideDecisionDetails'
  | 'admin.showDecisionDetails'
  | 'benchmark.relevanceScorer'
  | 'benchmark.relevanceScorerDesc'
  | 'benchmark.llmReranker'
  | 'benchmark.llmRerankerDesc'
  | 'benchmark.hybridRetrieval'
  | 'benchmark.hybridRetrievalDesc'
  | 'benchmark.runAllBenchmarkTypes'
  | 'benchmark.fullBenchmarkSuite'
  | 'common.exportOptions'
  | 'common.export'
  | 'common.exportToCsv'
  | 'common.exportToPdf'
  | 'common.exportAsCsv'
  | 'common.exportAsPdf'
  | 'common.selectedCount'
  | 'common.emailExport'
  | 'common.emailExportDescription'
  | 'common.emailResults'
  | 'common.recipients'
  | 'common.includeCitations'
  | 'common.apaFormat'
  | 'common.customFormat'
  | 'common.documentActions'
  | 'common.copyUrl'
  | 'common.openInNewTab'
  | 'common.loadingDocuments'
  | 'common.loadingDocumentsDescription'
  | 'common.noDocumentsFound'
  | 'common.noDocumentsAvailable'
  | 'common.documentenFound'
  | 'common.total'
  | 'common.previous'
  | 'common.next'
  | 'common.pageOf'
  | 'common.total'
  | 'test.noDashboardDataAvailable'
  | 'test.noTestRunsFound'
  | 'common.clusterWithEntities'
  | 'admin.active'
  | 'admin.inactive'
  | 'admin.activate'
  | 'admin.deactivate'
  | 'admin.enableTour'
  | 'admin.disableTour'
  | 'common.never'
  | 'test.invalidDataFormat'
  | 'workflow.review.loadFailedAfterRetries'
  | 'common.unknown'
  | 'workflowComparison.comparisonNotFound'
  | 'common.loadingKnowledgeGraph'
  | 'common.errorLoadingGraph'
  | 'common.loadingEntities'
  | 'common.noEntitiesFound'
  | 'common.failedToFetchCluster'
  | 'common.failedToFetchEntityMetadata'
  | 'common.notAvailable'
  | 'workflowReview.workflowReview'
  | 'common.invalidUrl'
  | 'common.invalidUrlMessage'
  | 'common.unknownType'
  | 'common.unknownAuthority'
  | 'common.unknownDate'
  | 'common.concept'
  | 'common.noTheme'
  | 'common.thisYear'
  | 'common.lastYear'
  | 'common.yearsAgo'
  | 'common.olderThan5Years'
  | 'common.noWebsites'
  | 'common.website'
  | 'common.websites'
  | 'admin.confirmDeleteSchedule'
  | 'admin.failedToLoadAIUsageData'
  | 'common.close'
  | 'common.refreshing'
  | 'common.refresh'
  | 'common.noDateAvailable'
  | 'documentPreview.approved'
  | 'documentPreview.approve'
  | 'documentPreview.rejected'
  | 'documentPreview.reject'
  | 'documentPreview.documentApproved'
  | 'documentPreview.documentApprovedDesc'
  | 'documentPreview.documentRejected'
  | 'documentPreview.documentRejectedDesc'
  | 'documentPreview.cannotOpenDocument'
  | 'documentPreview.noUrlAvailable'
  | 'documentPreview.noSummaryAvailable'
  | 'common.websites'
  | 'common.allDocuments'
  | 'common.notSet'
  | 'groundTruth.failedToLoadDatasets'
  | 'groundTruth.failedToLoadDatasetsDesc'
  | 'groundTruth.errorLoadingDatasets'
  | 'groundTruth.confirmDeleteDataset'
  | 'groundTruth.datasetDeleted'
  | 'groundTruth.datasetDeletedDesc'
  | 'groundTruth.failedToDeleteDataset'
  | 'groundTruth.failedToDeleteDatasetDesc'
  | 'groundTruth.errorDeletingDataset'
  | 'groundTruth.failedToLoadDataset'
  | 'groundTruth.datasetNotFound'
  | 'groundTruth.error'
  | 'groundTruth.datasetDeletedAnnouncement'
  | 'groundTruth.veryRelevant'
  | 'groundTruth.relevant'
  | 'groundTruth.moderatelyRelevant'
  | 'groundTruth.somewhatRelevant'
  | 'groundTruth.notRelevant'
  | 'draftManagement.currentStep'
  | 'draftManagement.queryId'
  | 'draftManagement.selectedWebsites'
  | 'draftManagement.subject'
  | 'draftManagement.governmentLayer'
  | 'draftManagement.selectedEntity'
  | 'documentPreview.toReview'
  | 'imroMetadata.datasetTitle'
  | 'imroMetadata.bronbeheerder'
  | 'imroMetadata.creatiedatum'
  | 'imroMetadata.identificatie'
  | 'imroMetadata.typePlan'
  | 'imroMetadata.naamOverheid'
  | 'imroMetadata.besluitgebied'
  | 'imroMetadata.bestemmingsvlak'
  | 'imroMetadata.plantekst'
  | 'imroMetadata.regeltekst'
  | 'imroMetadata.toelichting'
  | 'common.governmentType.gemeente'
  | 'common.governmentType.waterschap'
  | 'common.governmentType.provincie'
  | 'common.governmentType.rijk'
  | 'common.governmentType.kennisinstituut'
  | 'bronnenOverzicht.failedToUpdateStatus'
  | 'bronnenOverzicht.failedToUpdateStatusDesc'
  | 'bronnenOverzicht.failedToAddDocument'
  | 'bronnenOverzicht.failedToAddDocumentDesc'
  | 'bronnenOverzicht.failedToDeleteDocument'
  | 'bronnenOverzicht.failedToDeleteDocumentDesc'
  | 'bronnenOverzicht.scanCompleted'
  | 'bronnenOverzicht.scanCompletedDesc'
  | 'bronnenOverzicht.scanError'
  | 'bronnenOverzicht.scanErrorDesc'
  | 'benchmark.addQuery'
  | 'benchmark.addDocument'
  | 'library.addDocumentTitle'
  | 'library.addDocumentDescription'
  | 'errorBoundary.criticalError'
  | 'errorBoundary.errorHandlerFailed'
  | 'benchmark.uploadError'
  | 'benchmark.comparisonError'
  | 'benchmark.genericError'
  | 'benchmark.loadingDatasets'
  | 'benchmark.noDatasetsAvailable'
  | 'benchmark.uploadDatasetFirst'
  | 'benchmark.workflowVsGroundTruth'
  | 'benchmark.workflowVsGroundTruthDesc'
  | 'benchmark.workflowLabel'
  | 'benchmark.selectWorkflow'
  | 'benchmark.selectWorkflowDesc'
  | 'benchmark.groundTruthDataset'
  | 'benchmark.uploadNewDataset'
  | 'benchmark.errorLoadingDatasets'
  | 'benchmark.errorLoadingDatasetsMessage'
  | 'benchmark.workflowRequired'
  | 'benchmark.workflowRequiredMessage'
  | 'benchmark.datasetRequired'
  | 'benchmark.datasetRequiredMessage'
  | 'benchmark.queryRequired'
  | 'benchmark.queryRequiredMessage'
  | 'benchmark.comparisonCompleted'
  | 'benchmark.allQueries'
  | 'benchmark.onlyJsonFilesAllowed'
  | 'benchmark.expandAll'
  | 'benchmark.collapseAll'
  | 'sustainability.all'
  | 'benchmark.comparisonCompletedMessage'
  | 'benchmark.comparisonFailed'
  | 'benchmark.datasetUploaded'
  | 'benchmark.datasetUploadedMessage'
  | 'benchmark.selectDataset'
  | 'benchmark.benchmarkConfiguration'
  | 'benchmark.usingCustomConfig'
  | 'benchmark.usingDefaultConfig'
  | 'benchmark.custom'
  | 'benchmark.default'
  | 'benchmark.loadingConfiguration'
  | 'benchmark.noConfigurationSet'
  | 'workflowSelector.selectMinMax'
  | 'workflowSelector.searchPlaceholder'
  | 'workflowSelector.selectedWorkflows'
  | 'workflowSelector.removeWorkflow'
  | 'workflowSelector.availableWorkflows'
  | 'workflowSelector.loadingWorkflows'
  | 'workflowSelector.noWorkflowsFound'
  | 'workflowSelector.noWorkflowsAvailable'
  | 'workflowSelector.maxReached'
  | 'workflowSelector.maxReachedMessage'
  | 'workflowComparison.failedToStartComparison'
  | 'workflowComparison.comparisonFailed'
  | 'workflowComparison.unknownError'
  | 'benchmark.config.baseline'
  | 'benchmark.config.hybridOnly'
  | 'benchmark.config.embeddingsOnly'
  | 'benchmark.config.fullHybrid'
  | 'benchmark.config.keywordWeighted'
  | 'benchmark.config.semanticWeighted'
  | 'benchmark.config.withOcr'
  | 'benchmark.config.withLearning'
  | 'benchmark.config.withAiCrawling'
  | 'benchmark.config.allFeatures'
  | 'workflowReview.noCandidatesMatch'
  | 'benchmark.relevantDocuments'
  | 'benchmark.retrievedDocuments'
  | 'benchmark.documentsFound'
  | 'benchmark.totalDocuments'
  | 'benchmark.queries'
  | 'benchmark.preview'
  | 'common.type'
  | 'common.source'
  | 'admin.gdsMetrics'
  | 'admin.showBottlenecks'
  | 'admin.bottlenecks'
  | 'benchmark.queryTypeManual'
  | 'benchmark.queryTypeCount'
  | 'benchmark.queryTypePreset'
  | 'benchmark.queryTypePresetMulti'
  | 'benchmark.queryTypeFilter'
  | 'benchmark.loadingPresets'
  | 'benchmark.queriesInPreset'
  | 'benchmark.totalQueries'
  | 'benchmark.selectedDocuments'
  | 'benchmark.largeCandidateList'
  | 'benchmark.largeCandidateListDescription'
  | 'bronnenOverzicht.addCustomSource'
  | 'bronnenOverzicht.documentUrl'
  | 'bronnenOverzicht.analyzing'
  | 'bronnenOverzicht.add'
  | 'library.documentDisplayError'
  | 'library.documentDisplayErrorDescription'
  | 'library.documentDisplayErrorHelp'
  | 'draftManagement.step1'
  | 'draftManagement.step2'
  | 'draftManagement.step3'
  | 'draftManagement.useServerVersion'
  | 'draftManagement.mergeVersions'
  | 'draftManagement.useLocalVersion'
  | 'draftManagement.divergenceDetected'
  | 'draftManagement.divergenceDescription'
  | 'draftManagement.whatIsDifferent'
  | 'draftManagement.localVersion'
  | 'draftManagement.serverVersion'
  | 'draftManagement.newest'
  | 'draftManagement.savedInBrowser'
  | 'draftManagement.savedOnServer'
  | 'draftManagement.savedOnServerDescription'
  | 'draftManagement.useLocalButton'
  | 'draftManagement.useServerButton'
  | 'draftManagement.mergeButton'
  | 'draftManagement.whatDoesEachOption'
  | 'draftManagement.useLocalDescription'
  | 'draftManagement.useServerDescription'
  | 'draftManagement.mergeDescription'
  | 'draftManagement.ignoreAndContinue'
  | 'draftManagement.startFresh'
  | 'draftManagement.startFreshDescription'
  | 'draftManagement.draftFound'
  // DraftRestorePromptDialog
  | 'draftRestorePromptDialog.title'
  | 'draftRestorePromptDialog.description'
  | 'draftRestorePromptDialog.subject'
  | 'draftRestorePromptDialog.governmentLayer'
  | 'draftRestorePromptDialog.entity'
  | 'draftRestorePromptDialog.lastSaved'
  | 'draftRestorePromptDialog.step'
  | 'draftRestorePromptDialog.stepValue'
  | 'draftRestorePromptDialog.websitesSelected'
  | 'draftRestorePromptDialog.documentsFound'
  | 'draftRestorePromptDialog.expirationNotice'
  | 'draftRestorePromptDialog.ignoreAndContinue'
  | 'draftRestorePromptDialog.restore'
  | 'draftManagement.draftFoundDescription'
  | 'draftManagement.lastSaved'
  | 'draftManagement.step'
  | 'draftManagement.websitesSelected'
  | 'draftManagement.documentsFound'
  | 'draftManagement.draftsExpire'
  | 'draftManagement.discardAndContinue'
  | 'draftManagement.restore'
  | 'draftManagement.local'
  | 'draftManagement.server'
  | 'draftManagement.recommended'
  | 'previousSets.searchPlaceholder'
  | 'previousSets.noResults'
  | 'previousSets.noCompletedQueries'
  | 'previousSets.completeQuerySetToSee'
  | 'previousSets.allTypes'
  | 'previousSets.sortByDate'
  | 'previousSets.sortByTopic'
  | 'previousSets.sortByEntity'
  | 'previousSets.loading'
  | 'groundTruth.noDatasetsFoundFor'
  | 'groundTruth.noDatasetsAvailable'
  | 'groundTruth.datasetsLoaded'
  | 'groundTruth.searchDatasets'
  | 'groundTruth.searchDatasetsPlaceholder'
  | 'groundTruth.searchDatasetsAriaLabel'
  | 'groundTruth.searchDatasetsDescription'
  | 'groundTruth.uploadNewDataset'
  | 'groundTruth.uploadFirstDataset'
  | 'groundTruth.datasetInfo'
  | 'groundTruth.loadingDatasets'
  | 'groundTruth.invalidDatasetIdFormat'
  | 'groundTruth.searchInQueriesOrUrls'
  | 'groundTruth.dataset'
  | 'groundTruth.queries'
  | 'groundTruth.createdOn'
  | 'groundTruth.actionsFor'
  | 'groundTruth.viewDataset'
  | 'groundTruth.deleteDataset'
  // BronnenOverzichtHeader
  | 'bronnenOverzichtHeader.logo'
  | 'bronnenOverzichtHeader.backToIntake'
  // WebsiteList
  | 'websiteList.noWebsitesFound'
  | 'websiteList.noWebsitesFoundWithFilters'
  | 'websiteList.clearFilters'
  | 'websiteList.availableWebsites'
  // ExportMenu
  | 'exportMenu.exportFormats'
  | 'exportMenu.csvDescription'
  | 'exportMenu.jsonDescription'
  | 'exportMenu.markdownDescription'
  | 'exportMenu.excelDescription'
  | 'exportMenu.allDocuments'
  | 'exportMenu.filteredDocuments'
  | 'exportMenu.selectedDocuments'
  | 'exportMenu.export'
  | 'exportMenu.exportAs'
  | 'exportMenu.exportDocumentsAria'
  | 'exportMenu.exportFormatsInfoAria'
  // Breadcrumb
  | 'breadcrumb.navigation'
  | 'breadcrumb.beleidsscan'
  | 'breadcrumb.step1'
  | 'breadcrumb.step2'
  | 'breadcrumb.step3'
  | 'breadcrumb.backToOverview'
  // StatusFilterTabs
  | 'statusFilterTabs.label.all'
  | 'statusFilterTabs.label.pending'
  | 'statusFilterTabs.label.approved'
  | 'statusFilterTabs.label.rejected'
  | 'statusFilterTabs.title.all'
  | 'statusFilterTabs.title.pending'
  | 'statusFilterTabs.title.approved'
  | 'statusFilterTabs.title.rejected'
  | 'statusFilterTabs.description.all'
  | 'statusFilterTabs.description.pending'
  | 'statusFilterTabs.description.approved'
  | 'statusFilterTabs.description.rejected'
  | 'statusFilterTabs.filterByStatus'
  | 'statusFilterTabs.filterInfo'
  | 'statusFilterTabs.filterInfoAria'
  // DocumentStats
  | 'documentStats.showing'
  | 'documentStats.filtered'
  | 'documentStats.clearAllFilters'
  // BulkActionsToolbar
  | 'bulkActionsToolbar.documentsSelected'
  | 'bulkActionsToolbar.bulkActionsTitle'
  | 'bulkActionsToolbar.bulkActionsDescription'
  | 'bulkActionsToolbar.approve'
  | 'bulkActionsToolbar.approveAria'
  | 'bulkActionsToolbar.reject'
  | 'bulkActionsToolbar.rejectAria'
  | 'bulkActionsToolbar.deselect'
  | 'bulkActionsToolbar.bulkActionsInfo'
  | 'bulkActionsToolbar.bulkActionsInfoAria'
  | 'bulkActionsToolbar.deselectAllSelected'
  // FilterPresetDialog
  | 'filterPresetDialog.title'
  | 'filterPresetDialog.description'
  | 'filterPresetDialog.nameLabel'
  | 'filterPresetDialog.nameRequired'
  | 'filterPresetDialog.nameRequiredDescription'
  | 'filterPresetDialog.presetSaved'
  | 'filterPresetDialog.presetSavedDescription'
  | 'filterPresetDialog.namePlaceholder'
  // Step2InfoDialog
  | 'step2InfoDialog.moreInfo'
  | 'step2InfoDialog.moreInfoStep2'
  | 'step2InfoDialog.title'
  | 'step2InfoDialog.description'
  | 'step2InfoDialog.websiteSelectionTitle'
  | 'step2InfoDialog.websiteSelectionDescription'
  | 'step2InfoDialog.search'
  | 'step2InfoDialog.searchDescription'
  | 'step2InfoDialog.filter'
  | 'step2InfoDialog.filterDescription'
  | 'step2InfoDialog.sort'
  | 'step2InfoDialog.sortDescription'
  | 'step2InfoDialog.selectAll'
  | 'step2InfoDialog.selectAllDescription'
  | 'step2InfoDialog.scrapingTitle'
  | 'step2InfoDialog.scrapingDescription'
  | 'step2InfoDialog.scrapingPoint1'
  | 'step2InfoDialog.scrapingPoint2'
  | 'step2InfoDialog.scrapingPoint3'
  | 'step2InfoDialog.scrapingPoint4'
  | 'step2InfoDialog.graphVisualizationTitle'
  | 'step2InfoDialog.graphVisualizationDescription'
  | 'step2InfoDialog.tip'
  | 'step2InfoDialog.tipDescription'
  // ConsolidatedHelpDialog
  | 'consolidatedHelpDialog.title'
  | 'consolidatedHelpDialog.description'
  | 'consolidatedHelpDialog.step1'
  | 'consolidatedHelpDialog.step2'
  | 'consolidatedHelpDialog.step3'
  | 'consolidatedHelpDialog.step1Title'
  | 'consolidatedHelpDialog.step1Description'
  | 'consolidatedHelpDialog.step1SelectLayer'
  | 'consolidatedHelpDialog.step1SelectLayerDescription'
  | 'consolidatedHelpDialog.gemeente'
  | 'consolidatedHelpDialog.gemeenteDescription'
  | 'consolidatedHelpDialog.waterschap'
  | 'consolidatedHelpDialog.waterschapDescription'
  | 'consolidatedHelpDialog.provincie'
  | 'consolidatedHelpDialog.provincieDescription'
  | 'consolidatedHelpDialog.rijksoverheid'
  | 'consolidatedHelpDialog.rijksoverheidDescription'
  | 'consolidatedHelpDialog.kennisinstituut'
  | 'consolidatedHelpDialog.kennisinstituutDescription'
  | 'consolidatedHelpDialog.step1SelectEntity'
  | 'consolidatedHelpDialog.step1SelectEntityDescription'
  | 'consolidatedHelpDialog.step1EnterSubject'
  | 'consolidatedHelpDialog.step1EnterSubjectDescription'
  | 'consolidatedHelpDialog.step1Tip1'
  | 'consolidatedHelpDialog.step1Tip2'
  | 'consolidatedHelpDialog.step1Tip3'
  | 'consolidatedHelpDialog.step1Tip4'
  | 'consolidatedHelpDialog.step1WhatNext'
  | 'consolidatedHelpDialog.step1WhatNextDescription'
  | 'consolidatedHelpDialog.step2Title'
  | 'consolidatedHelpDialog.step2Description'
  | 'consolidatedHelpDialog.step2WebsiteSelection'
  | 'consolidatedHelpDialog.step2WebsiteSelectionDescription'
  | 'consolidatedHelpDialog.search'
  | 'consolidatedHelpDialog.searchDescription'
  | 'consolidatedHelpDialog.filter'
  | 'consolidatedHelpDialog.filterDescription'
  | 'consolidatedHelpDialog.sort'
  | 'consolidatedHelpDialog.sortDescription'
  | 'consolidatedHelpDialog.selectAll'
  | 'consolidatedHelpDialog.selectAllDescription'
  | 'consolidatedHelpDialog.step2ScrapingTitle'
  | 'consolidatedHelpDialog.step2ScrapingDescription'
  | 'consolidatedHelpDialog.step2ScrapingPoint1'
  | 'consolidatedHelpDialog.step2ScrapingPoint2'
  | 'consolidatedHelpDialog.step2ScrapingPoint3'
  | 'consolidatedHelpDialog.step2ScrapingPoint4'
  | 'consolidatedHelpDialog.step2GraphVisualization'
  | 'consolidatedHelpDialog.step2GraphVisualizationDescription'
  | 'consolidatedHelpDialog.step2Tip'
  | 'consolidatedHelpDialog.step2TipDescription'
  | 'consolidatedHelpDialog.step3Title'
  | 'consolidatedHelpDialog.step3Description'
  | 'consolidatedHelpDialog.step3DocumentStatuses'
  | 'consolidatedHelpDialog.step3DocumentStatusesDescription'
  | 'consolidatedHelpDialog.pending'
  | 'consolidatedHelpDialog.pendingDescription'
  | 'consolidatedHelpDialog.approved'
  | 'consolidatedHelpDialog.approvedDescription'
  | 'consolidatedHelpDialog.rejected'
  | 'consolidatedHelpDialog.rejectedDescription'
  | 'consolidatedHelpDialog.step3FilterAndSort'
  | 'consolidatedHelpDialog.step3FilterAndSortDescription'
  | 'consolidatedHelpDialog.all'
  | 'consolidatedHelpDialog.allDescription'
  | 'consolidatedHelpDialog.pendingFilterDescription'
  | 'consolidatedHelpDialog.approvedFilterDescription'
  | 'consolidatedHelpDialog.rejectedFilterDescription'
  | 'consolidatedHelpDialog.step3BulkActions'
  | 'consolidatedHelpDialog.step3BulkActionsDescription'
  | 'consolidatedHelpDialog.step3DocumentDetails'
  | 'consolidatedHelpDialog.step3DocumentDetailsDescription'
  | 'consolidatedHelpDialog.step3NextSteps'
  | 'consolidatedHelpDialog.step3NextStepsDescription'
  // ScrapingInfoDialog
  | 'scrapingInfoDialog.title'
  | 'scrapingInfoDialog.description'
  | 'scrapingInfoDialog.step1'
  | 'scrapingInfoDialog.step1Description'
  | 'scrapingInfoDialog.step2'
  | 'scrapingInfoDialog.step2Description'
  | 'scrapingInfoDialog.step3'
  | 'scrapingInfoDialog.step3Description'
  | 'scrapingInfoDialog.note'
  | 'scrapingInfoDialog.noteDescription'
  // Step3Summary
  | 'step3Summary.governmentLayer'
  | 'step3Summary.entity'
  | 'step3Summary.query'
  | 'step3Summary.scrapedWebsites'
  | 'step3Summary.foundDocuments'
  // BeleidsscanErrorBoundary
  | 'beleidsscanErrorBoundary.unknown'
  | 'beleidsscanErrorBoundary.title'
  | 'beleidsscanErrorBoundary.stepOfWizard'
  | 'beleidsscanErrorBoundary.unexpectedError'
  | 'beleidsscanErrorBoundary.draftAvailable'
  | 'beleidsscanErrorBoundary.draftAvailableDescription'
  | 'beleidsscanErrorBoundary.step'
  | 'beleidsscanErrorBoundary.websites'
  | 'beleidsscanErrorBoundary.documents'
  | 'beleidsscanErrorBoundary.restoreDraft'
  | 'beleidsscanErrorBoundary.tryAgain'
  | 'beleidsscanErrorBoundary.backToPortal'
  | 'beleidsscanErrorBoundary.technicalDetails'
  // BeleidsscanContent
  | 'beleidsscanContent.title'
  | 'beleidsscanContent.subtitle'
  | 'beleidsscanContent.application'
  // EntitySelector
  | 'entitySelector.availableEntities'
  | 'entitySelector.entities'
  | 'entitySelector.helpSelectingEntity'
  | 'entitySelector.helpSelectingEntityDescription'
  | 'entitySelector.noResultsFound'
  | 'entitySelector.requiredField'
  | 'entitySelector.searchEntity'
  | 'entitySelector.selectEntity'
  | 'entitySelector.selected'
  // OverheidslaagSelector
  | 'overheidslaagSelector.requiredField'
  | 'overheidslaagSelector.selectLayer'
  // FilterControls
  | 'filterControls.noFilters'
  | 'filterControls.noFiltersDescription'
  | 'filterControls.presetDeleted'
  | 'filterControls.presetDeletedDescription'
  | 'filterControls.allDates'
  | 'filterControls.allTypes'
  | 'filterControls.allWebsites'
  | 'filterControls.clearFilters'
  | 'filterControls.clearFiltersAria'
  | 'filterControls.clearQuery'
  | 'filterControls.filterByDate'
  | 'filterControls.filterByType'
  | 'filterControls.filterByWebsite'
  | 'filterControls.filterPresets'
  | 'filterControls.lastMonth'
  | 'filterControls.lastWeek'
  | 'filterControls.lastYear'
  | 'filterControls.searchAndFilter'
  | 'filterControls.searchAria'
  | 'filterControls.searchHelp'
  | 'filterControls.searchPlaceholder'
  | 'filterControls.sortAscending'
  | 'filterControls.sortBy'
  | 'filterControls.sortByDate'
  | 'filterControls.sortByRelevance'
  | 'filterControls.sortByTitle'
  | 'filterControls.sortByWebsite'
  | 'filterControls.sortDescending'
  | 'filterControls.presets'
  | 'filterControls.filterPresetsLabel'
  | 'filterControls.noPresetsSaved'
  | 'filterControls.saveCurrentFilters'
  | 'filterControls.deletePreset'
  // WorkflowImportModal
  | 'workflowImportModal.close'
  | 'workflowImportModal.title'
  | 'workflowImportModal.loading'
  | 'workflowImportModal.noOutputsDescription'
  | 'workflowImportModal.unknownOutput'
  | 'workflowImportModal.urlsVisited'
  | 'workflowImportModal.documents'
  | 'workflowImportModal.endpoints'
  | 'workflowImportModal.foundEndpoints'
  | 'workflowImportModal.andMore'
  | 'workflowImportModal.importing'
  | 'workflowImportModal.importDocuments'
  // WebsiteErrorDisplay
  | 'websiteErrorDisplay.title'
  | 'websiteErrorDisplay.closeError'
  // GraphVisualizerModal
  | 'graphVisualizerModal.close'
  // DraftStatusIndicator
  | 'draftStatusIndicator.viewDraftStatus'
  | 'draftStatusIndicator.viewDraftStatusAria'
  // DraftBanner
  | 'draftBanner.draftSaved'
  | 'draftBanner.recentlySaved'
  | 'draftBanner.step'
  | 'draftBanner.websites'
  | 'draftBanner.documents'
  | 'draftBanner.noDraftFound'
  | 'draftBanner.noDraftFoundDescription'
  | 'draftBanner.resumeDraft'
  | 'draftBanner.discardDraft'
  // StepLoader
  | 'stepLoader.loading'
  // ApiKeysErrorDialog
  | 'apiKeysErrorDialog.title'
  | 'apiKeysErrorDialog.missingKeys'
  | 'apiKeysErrorDialog.openaiKey'
  | 'apiKeysErrorDialog.googleApiKey'
  | 'apiKeysErrorDialog.googleEngineId'
  | 'apiKeysErrorDialog.configuration'
  | 'apiKeysErrorDialog.configurationDescription'
  | 'apiKeysErrorDialog.developmentMode'
  | 'apiKeysErrorDialog.developmentModeDescription'
  | 'apiKeysErrorDialog.useMockSuggestions'
  // ConfigurationDialog
  | 'configurationDialog.descriptionPlaceholder'
  | 'configurationDialog.createTitle'
  | 'configurationDialog.editTitle'
  | 'configurationDialog.description'
  | 'configurationDialog.nameLabel'
  | 'configurationDialog.workflowInfoAria'
  | 'configurationDialog.directActivateEnabled'
  | 'configurationDialog.directActivateDisabled'
  | 'configurationDialog.descriptionLabel'
  | 'configurationDialog.namePlaceholder'
  | 'configurationDialog.nameRequired'
  | 'configurationDialog.selectWorkflow'
  | 'configurationDialog.selectWorkflowPlaceholder'
  | 'configurationDialog.workflowLabel'
  // ConfigurationCard
  | 'configurationCard.activeConfiguration'
  | 'configurationCard.editConfiguration'
  | 'configurationCard.duplicateConfiguration'
  | 'configurationCard.deleteConfiguration'
  | 'configurationCard.deleteConfigurationDisabled'
  | 'configurationCard.exportAsJson'
  | 'configuration.onlyCheckedFlagsOverwritten'
  // ActiveConfigurationCard
  | 'activeConfigurationCard.refreshFromServerAria'
  | 'activeConfigurationCard.refreshFromServerTitle'
  // PreviousSetsDialog
  | 'previousSetsDialog.title'
  | 'previousSetsDialog.description'
  | 'previousSetsDialog.websites'
  | 'previousSetsDialog.documents'
  | 'previousSetsDialog.load'
  // DocumentPreviewModal
  | 'documentPreviewModal.description'
  | 'documentPreviewModal.website'
  | 'documentPreviewModal.type'
  | 'documentPreviewModal.publicationDate'
  | 'documentPreviewModal.status'
  | 'documentPreviewModal.url'
  | 'documentPreviewModal.noUrlAvailable'
  | 'documentPreviewModal.summary'
  | 'documentPreviewModal.relevance'
  | 'documentPreviewModal.subjects'
  | 'documentPreviewModal.openDocument'
  | 'documentPreview.themes'
  | 'step2.previousStep'
  | 'step2.previous'
  | 'step2.startWorkflowWithWebsites'
  | 'step2.startWorkflowWithoutWebsites'
  | 'step2.saveDraftManually'
  | 'step2.lastSaved'
  | 'step2.saveDraft'
  | 'step2.goToResults'
  | 'stepNavigation.step'
  | 'stepNavigation.completed'
  | 'stepNavigation.currentStep'
  | 'common.select'
  | 'common.deselect'
  | 'documentMetadata.tapFor'
  | 'documentMetadata.hoverFor'
  | 'documentMetadata.moreInfo'
  | 'knowledgeGraph.usingBackend'
  | 'benchmark.noQuery'
  | 'testRuns.collapseSteps'
  | 'testRuns.expandSteps'
  | 'admin.totalUsers'
  | 'admin.workflows'
  | 'admin.runsToday'
  | 'admin.activeToday'
  | 'admin.automated'
  | 'admin.running'
  | 'admin.successRate'
  | 'admin.critical'
  | 'admin.severityCritical'
  | 'admin.severityError'
  | 'admin.severityWarning'
  | 'admin.severityInfo'
  // Sidebar
  | 'common.toggleSidebar'
  // Login/Register
  | 'auth.welcomeBack'
  | 'auth.signInToAccount'
  | 'auth.emailAddress'
  | 'auth.password'
  | 'auth.signingIn'
  | 'auth.signIn'
  | 'auth.dontHaveAccount'
  | 'auth.signUp'
  | 'auth.createAccount'
  | 'auth.joinBeleidsscan'
  | 'auth.fullName'
  | 'auth.role'
  | 'auth.role.advisor'
  | 'auth.role.developer'
  | 'auth.role.admin'
  | 'auth.creatingAccount'
  | 'auth.alreadyHaveAccount'
  | 'auth.loginFailed'
  | 'auth.registrationFailed'
  | 'auth.showPassword'
  | 'auth.hidePassword'
  // Beleidsscan
  | 'beleidsscan.startingScan'
  | 'beleidsscan.graphVisualization'
  | 'beleidsscan.close'
  | 'beleidsscan.scrape'
  | 'beleidsscan.scraping'
  | 'beleidsscan.startScan'
  | 'beleidsscan.importWorkflowResults'
  | 'beleidsscan.workflowResultsImported'
  | 'beleidsscan.workflowResultsPreview'
  | 'beleidsscan.endpointsFound'
  | 'beleidsscan.executionTrace'
  | 'beleidsscan.importAsDocuments'
  | 'beleidsscan.converting'
  | 'beleidsscan.importWorkflowResultsErrorTitle'
  | 'beleidsscan.importWorkflowResultsErrorDescription'
  | 'beleidsscan.workflowImportDialogTitle'
  | 'beleidsscan.workflowImportDialogDescription'
  | 'beleidsscan.workflowImportWhatTitle'
  | 'beleidsscan.workflowImportWhatBody'
  | 'beleidsscan.workflowImportHowTitle'
  | 'beleidsscan.workflowImportStepStart'
  | 'beleidsscan.workflowImportStepPreview'
  | 'beleidsscan.workflowImportStepImport'
  | 'beleidsscan.selectWorkflowOutputStep'
  | 'beleidsscan.selectWorkflowOutputToImport'
  | 'beleidsscan.noWorkflowOutputs'
  | 'beleidsscan.tipLabel'
  | 'beleidsscan.workflowImportTipText'
  | 'beleidsscan.scanSummaryTitle'
  // BronnenOverzicht
  | 'bronnenOverzicht.startScan'
  | 'bronnenOverzicht.startingScan'
  | 'bronnenOverzicht.scanning'
  | 'bronnenOverzicht.scanComplete'
  | 'bronnenOverzicht.scanFailed'
  // WorkflowResults
  | 'workflowResults.resume'
  | 'workflowResults.pause'
  | 'workflowResults.stop'
  | 'workflowResults.refresh'
  | 'workflowResults.downloadReport'
  | 'workflowResults.urlsVisited'
  | 'workflowResults.documentsFound'
  | 'workflowResults.newlyDiscovered'
  | 'workflowResults.errors'
  | 'workflowResults.converting'
  | 'workflowResults.importAsDocuments'
  | 'workflowResults.all'
  | 'workflowResults.pending'
  | 'workflowResults.approved'
  | 'workflowResults.rejected'
  | 'workflowResults.ofDocuments'
  | 'workflowResults.noDocuments'
  | 'workflowResults.workflowResultsPreview'
  | 'workflowResults.endpointsFound'
  | 'workflowResults.executionTrace'
  | 'workflowResults.andMoreEndpoints'
  | 'workflowResults.urlsCount'
  | 'workflowResults.runPaused'
  | 'workflowResults.runResumed'
  | 'workflowResults.runStopped'
  | 'workflowResults.failedToPause'
  | 'workflowResults.failedToResume'
  | 'workflowResults.failedToStop'
  | 'workflowResults.conversionFailed'
  | 'workflowResults.conversionFailedDescription'
  | 'workflowResults.workflowConverted'
  | 'workflowResults.workflowConvertedDescription'
  | 'workflowResults.statusUpdateFailed'
  | 'workflowResults.statusUpdateFailedDesc'
  // CommonCrawl
  | 'commonCrawl.title'
  | 'commonCrawl.description'
  | 'commonCrawl.savedQueries'
  | 'commonCrawl.searchQuery'
  | 'commonCrawl.search'
  | 'commonCrawl.searching'
  | 'commonCrawl.domainFilter'
  | 'commonCrawl.crawlId'
  | 'commonCrawl.invalidCrawlId'
  | 'commonCrawl.noResultsFound'
  | 'commonCrawl.invalidPattern'
  | 'commonCrawl.networkError'
  | 'commonCrawl.serverError'
  | 'commonCrawl.error'
  | 'commonCrawl.suggestions'
  | 'commonCrawl.validatingCrawlId'
  | 'commonCrawl.results'
  | 'commonCrawl.found'
  | 'commonCrawl.noResultsForQuery'
  | 'commonCrawl.startExploring'
  | 'commonCrawl.exampleQueries'
  | 'commonCrawl.showingOf'
  | 'commonCrawl.ofResults'
  | 'commonCrawl.increaseLimit'
  | 'commonCrawl.noSavedQueries'
  | 'commonCrawl.currentCrawlId'
  // Workflow cards
  | 'workflows.iploExploration.name'
  | 'workflows.iploExploration.description'
  | 'workflows.standardScan.name'
  | 'workflows.standardScan.description'
  | 'workflows.quickIploScan.name'
  | 'workflows.quickIploScan.description'
  | 'workflows.bfs3Hop.name'
  | 'workflows.bfs3Hop.description'
  | 'workflows.externalLinks.name'
  | 'workflows.externalLinks.description'
  | 'workflows.beleidsscanGraph.name'
  | 'workflows.beleidsscanGraph.description'
  | 'workflows.horstAanDeMaas.name'
  | 'workflows.horstAanDeMaas.description'
  | 'workflows.horstLaborMigration.name'
  | 'workflows.horstLaborMigration.description'
  | 'workflows.beleidsscanStep1.name'
  | 'workflows.beleidsscanStep1.description'
  | 'workflows.beleidsscanStep2.name'
  | 'workflows.beleidsscanStep2.description'
  | 'workflows.beleidsscanStep3.name'
  | 'workflows.beleidsscanStep3.description'
  | 'workflows.beleidsscanStep4.name'
  | 'workflows.beleidsscanStep4.description'
  | 'workflows.beleidsscanStep5.name'
  | 'workflows.beleidsscanStep5.description'
  | 'workflows.beleidsscanStep6.name'
  | 'workflows.beleidsscanStep6.description'
  | 'workflows.beleidsscanStep7.name'
  | 'workflows.beleidsscanStep7.description'
  | 'workflows.beleidsscanStep8.name'
  | 'workflows.beleidsscanStep8.description'
  | 'workflows.beleidsscanStep9.name'
  | 'workflows.beleidsscanStep9.description'
  | 'workflows.dsoLocationSearch.name'
  | 'workflows.dsoLocationSearch.description'
  | 'workflows.testWorkflow1.name'
  | 'workflows.testWorkflow1.description'
  | 'workflows.testWorkflow2.name'
  | 'workflows.testWorkflow2.description'
  // WorkflowPage
  | 'workflowPage.title'
  | 'workflowPage.description'
  | 'workflowPage.tip'
  | 'workflowPage.loading'
  | 'workflowPage.run'
  | 'workflowPage.resume'
  | 'workflowPage.pause'
  | 'workflowPage.stop'
  | 'workflowPage.steps'
  | 'workflowPage.semanticTarget'
  | 'workflowPage.explorationRandomness'
  | 'workflowPage.focused'
  | 'workflowPage.chaotic'
  | 'workflowPage.workflowThoughts'
  | 'workflowPage.subjectLabel'
  | 'workflowPage.locationLabel'
  | 'workflowPage.subjectPlaceholder'
  | 'workflowPage.locationPlaceholder'
  | 'workflowPage.semanticTargetPlaceholder'
  | 'workflowPage.noLogsAvailable'
  | 'workflowPage.workflowPaused'
  | 'workflowPage.workflowResumed'
  | 'workflowPage.workflowStopped'
  | 'workflowPage.failedToPause'
  | 'workflowPage.failedToResume'
  | 'workflowPage.failedToStop'
  | 'workflowPage.failedToStart'
  | 'workflowPage.skipRendering'
  | 'workflowPage.skipRenderingTooltip'
  | 'workflowPage.publishedWorkflows'
  | 'workflowPage.manageWorkflows'
  | 'workflowPage.missingRequiredFields'
  | 'workflowPage.missingRequiredFieldsDesc'
  | 'workflowPage.checkRequiredParameters'
  | 'workflowPage.close'
  | 'workflowPage.errorFetchingStatus'
  | 'workflowPage.stillChecking'
  | 'workflowPage.workflowStarting'
  | 'workflowPage.waitingForLogs'
  | 'workflowPage.fetchingStatus'
  | 'workflowPage.navigationGraph'
  // WorkflowComparison
  | 'workflowComparison.workflowA'
  | 'workflowComparison.workflowB'
  | 'workflowComparison.synchronizedScrolling'
  | 'workflowComparison.progress'
  | 'workflowComparison.running'
  | 'workflowComparison.waitingForRunId'
  | 'workflowComparison.failed'
  | 'workflowComparison.workflowAError'
  | 'workflowComparison.workflowBError'
  | 'workflowComparison.comparisonProgress'
  | 'workflowComparison.started'
  | 'workflowComparison.comparisonFailed'
  | 'workflowComparison.workflowBenchmarkComparison'
  | 'workflowComparison.comparisonSummary'
  | 'workflowComparison.overallPerformanceComparison'
  | 'workflowComparison.winner'
  | 'workflowComparison.tie'
  | 'workflowComparison.metricsBetter'
  | 'workflowComparison.runs'
  | 'workflowComparison.unnamedComparison'
  | 'workflowComparison.minExecutionTime'
  | 'workflowComparison.metricsComparison'
  | 'workflowComparison.sideBySideMetrics'
  | 'workflowComparison.metric'
  | 'workflowComparison.better'
  | 'workflowComparison.averageExecutionTime'
  | 'workflowComparison.minExecutionTime'
  | 'workflowComparison.maxExecutionTime'
  | 'workflowComparison.medianExecutionTime'
  | 'workflowComparison.atLeastOneQueryRequired'
  | 'workflowComparison.atLeastOneQueryRequiredMessage'
  | 'workflowComparison.configurationSaved'
  | 'workflowComparison.configurationSavedMessage'
  | 'workflowComparison.failedToSaveConfig'
  | 'workflowComparison.workflowsRequired'
  | 'workflowComparison.workflowsRequiredMessage'
  | 'workflowComparison.queryRequired'
  | 'workflowComparison.queryRequiredMessage'
  | 'workflowComparison.nameRequired'
  | 'workflowComparison.nameRequiredMessage'
  | 'workflowComparison.comparisonStartedMessage'
  | 'workflowComparison.failedToStartComparison'
  | 'workflowComparison.startNewWorkflowComparison'
  | 'workflowComparison.configureTwoWorkflows'
  | 'workflowComparison.comparisonNameRequired'
  | 'workflowComparison.comparisonNameExample'
  | 'workflowComparison.descriptionOptional'
  | 'workflowComparison.benchmarkConfiguration'
  | 'workflowComparison.comparisonNameExample'
  | 'workflowComparison.usingCustomConfig'
  | 'workflowComparison.usingDefaultConfig'
  | 'workflowComparison.custom'
  | 'workflowComparison.default'
  | 'workflowComparison.loadingConfiguration'
  | 'workflowComparison.featureFlags'
  | 'workflowComparison.noConfigurationSet'
  | 'workflowComparison.testQueries'
  | 'workflowComparison.addQuery'
  | 'workflowComparison.queryExample'
  | 'workflowComparison.queryFilterOptional'
  | 'workflowComparison.loadingComparisonData'
  | 'workflowComparison.errorLoadingComparison'
  | 'workflowComparison.editBenchmarkConfigA'
  | 'workflowComparison.editBenchmarkConfigB'
  | 'workflowComparison.queryExample'
  | 'workflowComparison.configureFeatureFlags'
  | 'workflowComparison.enabled'
  | 'workflowComparison.on'
  | 'workflowComparison.off'
  | 'workflowComparison.of'
  | 'workflowComparison.flagsEnabled'
  | 'workflowComparison.saving'
  | 'workflowComparison.saveConfiguration'
  | 'workflowComparison.averageDocumentsFound'
  | 'workflowComparison.averageScore'
  | 'workflowComparison.trendAnalysis'
  | 'workflowComparison.averageScoreOverTime'
  | 'workflowComparison.runIndex'
  | 'workflowComparison.documentDiscovery'
  | 'workflowComparison.documentDiscoveryComparison'
  | 'workflowComparison.avgDocumentsFound'
  | 'workflowComparison.selectWorkflowsToCompare'
  | 'workflowComparison.selectWorkflowsDescription'
  | 'workflowComparison.filterByQuery'
  | 'workflowComparison.labelOptional'
  | 'workflowComparison.describeComparison'
  | 'workflowComparison.searchFeatureFlags'
  | 'workflowComparison.enableAllFlags'
  | 'workflowComparison.disableAllFlags'
  | 'workflowComparison.resetToSaved'
  | 'workflowComparison.selectWorkflowA'
  | 'workflowComparison.selectWorkflowB'
  | 'workflowComparison.selectConfigA'
  | 'workflowComparison.selectConfigB'
  | 'workflowComparison.enterSearchQuery'
  | 'workflowComparison.comparisonName'
  | 'workflowComparison.defaultTimeout'
  | 'workflowComparison.startNewComparison'
  | 'workflowComparison.hideNewComparison'
  | 'workflowComparison.startComparison'
  | 'workflowComparison.startingComparison'
  | 'workflowComparison.viewHistoricalComparisons'
  | 'workflowComparison.historicalDescription'
  | 'workflowComparison.quickRange'
  | 'workflowComparison.last7d'
  | 'workflowComparison.last30d'
  | 'workflowComparison.last90d'
  | 'workflowComparison.allTime'
  | 'workflowComparison.fromDate'
  | 'workflowComparison.toDate'
  | 'workflowComparison.pickDate'
  | 'workflowComparison.activeComparisons'
  | 'workflowComparison.comparisonsRunning'
  | 'workflowComparison.comparison'
  | 'workflowComparison.comparisons'
  | 'workflowComparison.selected'
  | 'workflowComparison.noComparisonData'
  | 'workflowComparison.comparisonComplete'
  | 'workflowComparison.comparisonCompleteMessage'
  | 'workflowComparison.comparisonFailed'
  | 'workflowComparison.comparisonFailedMessage'
  | 'workflowComparison.validationError'
  | 'workflowComparison.validationErrorMessage'
  | 'workflowComparison.comparisonStarted'
  | 'workflowComparison.configA'
  | 'workflowComparison.configB'
  | 'workflowComparison.query'
  | 'workflowComparison.nameOptional'
  | 'workflowComparison.timeoutOptional'
  | 'workflowComparison.starting'
  | 'workflowComparison.comparisonResults'
  | 'workflowComparison.executionTime'
  | 'workflowComparison.documentsFound'
  | 'workflowComparison.topScore'
  | 'workflowComparison.differences'
  | 'workflowComparison.executionTimeDifference'
  | 'workflowComparison.documentsFoundDifference'
  | 'workflowComparison.commonDocuments'
  | 'workflowComparison.uniqueToA'
  | 'workflowComparison.uniqueToB'
  // RunsPage
  | 'runsPage.title'
  | 'runsPage.description'
  | 'runsPage.loading'
  | 'runsPage.error'
  | 'runsPage.retry'
  | 'runsPage.status'
  | 'runsPage.scanType'
  | 'runsPage.startTime'
  | 'runsPage.duration'
  | 'runsPage.details'
  | 'runsPage.actions'
  | 'runsPage.noRunsFound'
  | 'runsPage.running'
  | 'runsPage.topic'
  | 'runsPage.resume'
  | 'runsPage.pause'
  | 'runsPage.stop'
  | 'runsPage.runPaused'
  | 'runsPage.runResumed'
  | 'runsPage.runStopped'
  | 'runsPage.failedToPause'
  | 'runsPage.failedToResume'
  | 'runsPage.failedToStop'
  // BronCard
  | 'bronCard.website'
  | 'bronCard.document'
  // Common
  | 'common.close'
  | 'common.loading'
  | 'common.error'
  | 'common.success'
  | 'common.cancel'
  | 'common.save'
  | 'common.delete'
  | 'common.edit'
  | 'common.add'
  | 'common.remove'
  | 'common.search'
  | 'common.filter'
  | 'common.sort'
  | 'common.selectAll'
  | 'common.deselectAll'
  | 'common.back'
  | 'common.next'
  | 'common.previous'
  | 'common.submit'
  | 'common.confirm'
  | 'common.yes'
  | 'common.no'
  | 'common.retry'
  | 'common.none'
  | 'common.failed'
  | 'common.tryAgain'
  | 'common.tryAgainLater'
  | 'common.unknownError'
  | 'templates.failedToLoad'
  | 'templates.tryAgainLater'
  | 'admin.failedToUpdateHierarchy'
  | 'admin.confirmRemoveAccess'
  | 'admin.enterNewPassword'
  | 'admin.passwordMinLength'
  | 'admin.passwordResetSuccess'
  | 'common.never'
  | 'common.collapse'
  | 'common.expand'
  // Layout
  | 'layout.scanHistory'
  | 'layout.commonCrawl'
  | 'layout.logout'
  | 'layout.beleidsscanSettings'
  | 'layout.featureFlags'
  | 'layout.flagTemplates'
  | 'layout.systemAdministration'
  // GraphPage
  | 'graphPage.loading'
  | 'graphPage.loadingSubtitle'
  | 'graphPage.contains'
  | 'graphPage.pages'
  | 'graphPage.topPages'
  | 'graphPage.morePages'
  | 'graphPage.nodes'
  | 'graphPage.approved'
  | 'graphPage.pending'
  | 'graphPage.themes'
  | 'graphPage.navigationNetwork'
  // SearchPage
  | 'searchPage.title'
  | 'searchForm.topicLabel'
  | 'searchForm.topicPlaceholder'
  | 'searchForm.clearTopic'
  | 'searchForm.locationLabel'
  | 'searchForm.locationPlaceholder'
  | 'searchForm.clearLocation'
  | 'searchForm.jurisdictionLabel'
  | 'searchForm.selectJurisdiction'
  | 'searchForm.jurisdiction.national'
  | 'searchPage.description'
  | 'searchPage.searchPlaceholder'
  | 'searchPage.searching'
  | 'searchPage.documents'
  | 'searchPage.noDocumentsFound'
  | 'searchPage.score'
  | 'searchPage.unknownSource'
  | 'searchPage.viewSource'
  | 'searchPage.relatedConcepts'
  | 'searchPage.noRelatedEntities'
  | 'searchPage.noDescriptionAvailable'
  | 'searchPage.searchFailed'
  | 'searchPage.unnamedDocument'
  | 'searchPage.noDocumentsFoundMessage'
  | 'searchPage.suggestion1'
  | 'searchPage.suggestion2'
  | 'searchPage.suggestion3'
  | 'searchPage.clearFilters'
  // WebsiteSearch
  | 'websiteSearch.searchAndFilter'
  | 'websiteSearch.searchPlaceholder'
  | 'websiteSearch.searchAria'
  | 'websiteSearch.searchHelp'
  | 'websiteSearch.clearQuery'
  | 'websiteSearch.filterByType'
  | 'websiteSearch.allTypes'
  | 'websiteSearch.sortInfo'
  | 'websiteSearch.sortInfoAria'
  | 'websiteSearch.sortOptions'
  | 'websiteSearch.sortByRelevance'
  | 'websiteSearch.sortByRelevanceDescription'
  | 'websiteSearch.sortByName'
  | 'websiteSearch.sortByNameDescription'
  | 'websiteSearch.sortByType'
  | 'websiteSearch.sortByTypeDescription'
  | 'websiteSearch.sortBy'
  | 'websiteSearch.selectionSummary'
  | 'websiteSearch.selectAll'
  | 'websiteSearch.deselectAll'
  | 'websiteSearch.of'
  | 'websiteSearch.websitesSelectedText'
  | 'websiteSearch.ofTotal'
  | 'websiteSearch.clearFiltersAria'
  | 'websiteSearch.clearFilters'
  // KnowledgePage
  | 'knowledgePage.title'
  | 'knowledgePage.manageKg'
  | 'knowledgePage.graphRAGSearch'
  | 'knowledgePage.deepDiveTutorial'
  | 'knowledgePage.visualizationDescription.graphdb'
  | 'knowledgePage.visualizationDescription.neo4j'
  | 'knowledgePage.visualizationDescription.generic'
  | 'knowledgePage.kgDisabled'
  | 'knowledgePage.kgDisabledDescription'
  | 'knowledgePage.workflowIntegrationDisabled'
  | 'knowledgePage.workflowIntegrationDisabledDescription'
  // GraphRAG
  | 'graphRAG.title'
  | 'graphRAG.description'
  | 'graphRAG.advancedOptions'
  | 'graphRAG.naturalLanguageQuery'
  | 'graphRAG.queryPlaceholder'
  | 'graphRAG.retrievalStrategy'
  | 'graphRAG.selectStrategy'
  | 'graphRAG.strategy.factFirst'
  | 'graphRAG.strategy.contextFirst'
  | 'graphRAG.strategy.hybrid'
  | 'graphRAG.maxResults'
  | 'graphRAG.maxHops'
  | 'graphRAG.kgWeight'
  | 'graphRAG.vectorWeight'
  | 'graphRAG.enableExplainability'
  | 'graphRAG.error'
  | 'graphRAG.processing'
  | 'graphRAG.search'
  | 'graphRAG.retrieval'
  | 'graphRAG.ranking'
  | 'graphRAG.total'
  | 'graphRAG.explanation'
  | 'graphRAG.facts'
  | 'graphRAG.context'
  | 'graphRAG.rawJson'
  | 'graphRAG.answerExplanation'
  | 'graphRAG.noExplanation'
  | 'graphRAG.retrievedFacts'
  | 'graphRAG.factsDescription'
  | 'graphRAG.retrievedContext'
  | 'graphRAG.contextDescription'
  | 'graphRAG.noFacts'
  | 'graphRAG.noContext'
  | 'graphRAG.source'
  | 'graphRAG.score'
  | 'graphRAG.path'
  // Tutorial
  | 'tutorial.notFound'
  | 'tutorial.backToHelpCenter'
  | 'tutorial.tip'
  | 'tutorial.startTutorial'
  // GraphHelpPanel
  | 'graphHelp.title'
  | 'graphHelp.closeHelp'
  | 'graphHelp.description'
  | 'graphHelp.workflowActionsTitle'
  | 'graphHelp.quickStartTitle'
  | 'graphHelp.step1'
  | 'graphHelp.step2'
  | 'graphHelp.step3'
  | 'graphHelp.runWorkflow'
  | 'graphHelp.action.iplo'
  | 'graphHelp.action.officielebekendmakingen'
  | 'graphHelp.action.exploreWebsites'
  | 'graphHelp.action.bfsExplore'
  | 'graphHelp.action.googleSearch'
  // AddDocumentDialog
  | 'addDocument.documentTitle'
  | 'addDocument.selectSource'
  | 'addDocument.titleRequired'
  | 'addDocument.contentRequired'
  | 'addDocument.urlRequiredForExtraction'
  | 'addDocument.invalidUrl'
  | 'addDocument.emptyExtraction'
  | 'addDocument.contentExtracted'
  | 'addDocument.extractionFailed'
  | 'addDocument.urlOrContentRequired'
  | 'addDocument.extracting'
  | 'addDocument.extractContent'
  // CanonicalDocumentCard
  | 'documentCard.rejected'
  | 'documentCard.notSuitable'
  | 'documentCard.copyExplanation'
  | 'documentCard.whyFound'
  | 'documentCard.whyFoundDescription'
  | 'documentCard.explanation'
  | 'documentCard.loadingExplanation'
  | 'documentCard.strategy'
  | 'documentCard.confidence'
  | 'documentCard.reasoning'
  | 'documentCard.detailedExplanation'
  | 'documentCard.confidence.high'
  | 'documentCard.confidence.medium'
  | 'documentCard.confidence.low'
  | 'documentCard.suitable'
  // Step2ActionButtons
  | 'step2.scrapingCompleted'
  // Step3ActionButtons
  | 'step3.draftSaved'
  | 'step3.draftSavedDescription'
  // Step3EmptyStates
  | 'step3.noDocumentsWithStatus'
  | 'step3.status.pending'
  | 'step3.status.approved'
  | 'step3.status.rejected'
  | 'step3.approved'
  // KnowledgeGraphVisualizer
  | 'kgVisualizer.collapseCluster'
  | 'kgVisualizer.expandCluster'
  | 'kgVisualizer.hideFilters'
  | 'kgVisualizer.showFilters'
  // ExportTemplates
  | 'exportTemplates.noDescription'
  // TestComparison
  | 'testComparison.selectTestRun'
  | 'testComparison.noTimestamp'
  | 'testComparison.run1'
  | 'testComparison.run2'
  // TestAlerts
  | 'testAlerts.dismissAlert'
  // Step3EmptyStates (additional)
  | 'step3.showAllDocuments'
  | 'step3.showAllDocumentsAria'
  | 'step3.noDocumentsFoundDescription'
  | 'step3.possibleCauses'
  | 'step3.cause1'
  | 'step3.cause2'
  | 'step3.cause3'
  | 'step3.scrapeMoreWebsites'
  | 'step3.scrapeMoreWebsitesAria'
  // SelectedWebsitesSummary
  | 'selectedWebsitesSummary.title'
  // Step3SelectAllButton
  | 'step3SelectAllButton.selectAll'
  | 'step3SelectAllButton.deselectAll'
  | 'step3SelectAllButton.selectAllAria'
  | 'step3SelectAllButton.deselectAllAria'
  // Step3Header
  | 'step3Header.title'
  | 'step3Header.loadingDocuments'
  | 'step3Header.documentsFound'
  | 'step3Header.importWorkflow'
  // KnowledgeGraphVisualizer (additional)
  | 'kgVisualizer.filterMinWeight'
  | 'kgVisualizer.resetFilters'
  | 'kgVisualizer.clustersAndEntities'
  | 'kgVisualizer.edgesShown'
  | 'kgVisualizer.topEdgesTooltip'
  | 'kgVisualizer.topEdgesOf'
  | 'kgVisualizer.expanded'
  | 'kgVisualizer.semanticLabelsLoaded'
  // AddDocumentDialog (additional)
  | 'addDocument.urlPlaceholder'
  | 'addDocument.documentTypePlaceholder'
  | 'addDocument.contentPlaceholder'
  // Step2ActionButtons (additional)
  | 'step2.scrapingInProgress'
  | 'step2.progress'
  | 'step2.remainingTime'
  | 'step2.documentsFound'
  | 'step2.viewDetails'
  | 'step2.viewDetailsAria'
  | 'step2.goToStep3'
  | 'step2.goToStep3WithDocuments'
  | 'step2.title'
  | 'step2.description'
  | 'step2.noWebsitesFound'
  | 'step2.noWebsitesFoundDescription'
  | 'step2.youCan'
  | 'step2.option1'
  | 'step2.option2'
  | 'step2.backToConfiguration'
  | 'step2.startScanWithoutWebsites'
  // Step3ActionButtons (additional)
  | 'step3.backToStep2'
  | 'step3.backToStep2Aria'
  | 'step3.scrapeMoreWebsites'
  | 'step3.save'
  | 'step3.complete'
  | 'step3.completeAria'
  | 'step3.importWorkflowResultsAria'
  | 'step3.title'
  | 'step3.foundDocuments'
  | 'step3.tryAgain'
  | 'step3.tryAgainAria'
  | 'step3.documentsLoading'
  | 'step3.toReview'
  | 'step3.approved'
  | 'step3.rejected'
  | 'step3.all'
  | 'step3.reviewInfoTitle'
  | 'step3.toReviewDescription'
  | 'step3.approvedDescription'
  | 'step3.rejectedDescription'
  | 'step3.allDescription'
  | 'step3.toReviewOnlyDescription'
  | 'step3.approvedOnlyDescription'
  | 'step3.rejectedOnlyDescription'
  | 'step3.totalDocumentsLabel'
  | 'step3.reviewInfoTitle'
  | 'step3.afterReviewing'
  | 'documentSelector.selectDocuments'
  | 'documentSelector.searchDocuments'
  | 'documentSelector.loadingDocuments'
  // AddDocumentDialog (additional)
  | 'addDocument.cancel'
  | 'addDocument.saving'
  | 'addDocument.add'
  | 'addDocument.source.web'
  | 'addDocument.source.dso'
  | 'addDocument.source.rechtspraak'
  | 'addDocument.source.wetgeving'
  | 'addDocument.source.gemeente'
  | 'addDocument.source.pdok'
  // KnowledgeGraphVisualizer (additional)
  | 'kgVisualizer.clusterType.type'
  | 'kgVisualizer.clusterType.domain'
  | 'kgVisualizer.clusterType.jurisdiction'
  | 'kgVisualizer.clusterType.category'
  | 'kgVisualizer.semanticLabel'
  | 'kgVisualizer.entity'
  | 'kgVisualizer.entities'
  | 'kgVisualizer.loading'
  | 'kgVisualizer.errorLoading'
  | 'kgVisualizer.filters'
  | 'kgVisualizer.relationType'
  | 'kgVisualizer.entityType'
  | 'kgVisualizer.jurisdiction'
  | 'kgVisualizer.minWeight'
  | 'kgVisualizer.allTypes'
  | 'kgVisualizer.allJurisdictions'
  | 'kgVisualizer.relationType.appliesTo'
  | 'kgVisualizer.relationType.constrains'
  | 'kgVisualizer.relationType.definedIn'
  | 'kgVisualizer.relationType.locatedIn'
  | 'kgVisualizer.relationType.hasRequirement'
  | 'kgVisualizer.relationType.relatedTo'
  | 'kgVisualizer.entityType.policyDocument'
  | 'kgVisualizer.entityType.regulation'
  | 'kgVisualizer.entityType.spatialUnit'
  | 'kgVisualizer.entityType.landUse'
  | 'kgVisualizer.entityType.requirement'
  | 'kgVisualizer.withLabels'
  // ExportTemplates (additional)
  | 'exportTemplates.saving'
  | 'exportTemplates.update'
  | 'exportTemplates.create'
  | 'exportTemplates.deleting'
  | 'exportTemplates.delete'
  | 'exportTemplates.cancel'
  | 'exportTemplates.deleteTemplate'
  | 'exportTemplates.deleteConfirm'
  | 'exportTemplates.templatePreview'
  | 'exportTemplates.templateContent'
  | 'exportTemplates.variablesUsed'
  // TestAlerts (additional)
  | 'testAlerts.type.failure'
  | 'testAlerts.type.regression'
  | 'testAlerts.type.flakiness'
  | 'testAlerts.type.coverage'
  | 'testAlerts.type.performance'
  // Tutorial (additional)
  | 'tutorial.clickSearch'
  | 'tutorial.clickSearchToView'
  | 'tutorial.clickSearchButton'
  | 'tutorial.title'
  | 'tutorial.complete'
  | 'tutorial.next'
  // ExportTemplates (additional)
  | 'exportTemplates.filterByFormat'
  | 'exportTemplates.namePlaceholder'
  | 'exportTemplates.descriptionPlaceholder'
  | 'exportTemplates.templatePlaceholder'
  // LibraryFilters
  | 'libraryFilters.queryIdPlaceholder'
  | 'libraryFilters.workflowRunIdPlaceholder'
  | 'libraryFilters.removeQueryIdFilter'
  | 'libraryFilters.removeWorkflowRunIdFilter'
  | 'libraryFilters.removeReviewStatusFilter'
  | 'libraryFilters.removeSourceFilter'
  | 'libraryFilters.filterByQueryId'
  | 'libraryFilters.filterByWorkflowRunId'
  | 'libraryFilters.filterByReviewStatus'
  | 'libraryFilters.filterBySource'
  | 'libraryFilters.allStatuses'
  | 'libraryFilters.pendingReview'
  | 'libraryFilters.approved'
  | 'libraryFilters.rejected'
  | 'libraryFilters.needsRevision'
  | 'libraryFilters.allSources'
  | 'libraryFilters.queryId'
  | 'libraryFilters.workflowRunId'
  | 'libraryFilters.status'
  | 'libraryFilters.source'
  | 'libraryFilters.source.dso'
  | 'libraryFilters.source.rechtspraak'
  | 'libraryFilters.source.wetgeving'
  | 'libraryFilters.source.gemeente'
  | 'libraryFilters.source.pdok'
  | 'libraryFilters.source.web'
  // WebsiteCard
  | 'websiteCard.deselect'
  | 'websiteCard.select'
  | 'websiteCard.openInNewTab'
  // DocumentMetadataTooltip
  | 'documentMetadata.document'
  | 'documentMetadata.tapFor'
  | 'documentMetadata.hoverFor'
  | 'documentMetadata.moreInfo'
  | 'documentMetadata.ariaLabel'
  // Tutorial (additional)
  | 'tutorial.fallback'
  // Step1QueryConfiguration
  | 'step1.restoreDraft'
  | 'step1.restoreDraftAria'
  | 'step1.howScanWorks'
  | 'step1.howScanWorksAria'
  | 'step1.threeSteps'
  | 'step1.step1Title'
  | 'step1.step1Description'
  | 'step1.step2Title'
  | 'step1.step2Description'
  | 'step1.step3Title'
  | 'step1.step3Description'
  | 'step1.generateSuggestions'
  | 'step1.generateSuggestionsAria'
  | 'step1.generateSuggestionsDisabled'
  | 'step1.toContinueFill'
  | 'step1.websitesGenerating'
  | 'step1.websitesGeneratingAria'
  | 'step1.generateSuggestionsBasedOn'
  | 'step1.cancelGeneration'
  | 'step1.cancelGenerationAria'
  | 'step1.missingRequirements'
  | 'step1.title'
  | 'step1.description'
  | 'step1.cancel'
  | 'step1.infoTitle'
  | 'step1.moreInfo'
  | 'step1.selectGovernmentLayer'
  | 'step1.selectGovernmentLayerDescription'
  | 'step1.municipality'
  | 'step1.waterschap'
  | 'step1.province'
  | 'step1.national'
  | 'step1.knowledgeInstitute'
  | 'step1.selectEntity'
  | 'step1.selectEntityDescription'
  | 'step1.enterSubject'
  | 'step1.enterSubjectDescription'
  | 'step1.enterQuery'
  | 'step1.enterQueryDescription'
  | 'step1.selectWebsites'
  | 'step1.selectWebsitesDescription'
  | 'step1.websitesSelected'
  | 'step1.websitesSelectedDescription'
  | 'step1.websitesSelectedCount'
  | 'step1.websitesSelectedCountDescription'
  | 'step1.websitesSelectedCountAria'
  | 'step1.websitesSelectedCountDescriptionAria'
  | 'step1.websitesSelectedCountDescriptionAria2'
  | 'step1.websitesSelectedCountDescriptionAria3'
  | 'step1.websitesSelectedCountDescriptionAria4'
  | 'step1.websitesSelectedCountDescriptionAria5'
  | 'step1.websitesSelectedCountDescriptionAria6'
  | 'step1.websitesSelectedCountDescriptionAria7'
  | 'step1.websitesSelectedCountDescriptionAria8'
  | 'step1.websitesSelectedCountDescriptionAria9'
  | 'step1.websitesSelectedCountDescriptionAria10'
  | 'step1.tip1'
  | 'step1.tip2'
  | 'step1.tip3'
  | 'step1.tip4'
  | 'step1.whatHappensNext'
  | 'step1.whatHappensNextDescription'
  // BeleidsscanHeader
  | 'beleidsscanHeader.logo'
  | 'beleidsscanHeader.help'
  | 'beleidsscanHeader.helpAria'
  | 'beleidsscanHeader.helpTitle'
  | 'beleidsscanHeader.startFresh'
  | 'beleidsscanHeader.startFreshAria'
  | 'beleidsscanHeader.startFreshTitle'
  | 'beleidsscanHeader.previousSets'
  | 'beleidsscanHeader.previousSetsAria'
  | 'beleidsscanHeader.previousSetsTitle'
  | 'beleidsscanHeader.editMode'
  | 'beleidsscanHeader.update'
  | 'beleidsscanHeader.saveAsNew'
  | 'beleidsscanHeader.cancel'
  | 'beleidsscanHeader.complete'
  | 'beleidsscanHeader.backToPortal'
  // SubgraphSelector
  | 'subgraphSelector.fullGraph'
  | 'subgraphSelector.completeNavigationGraph'
  | 'subgraphSelector.createNewSubgraph'
  | 'subgraphSelector.loading'
  | 'subgraphSelector.noSubgraphs'
  | 'subgraphSelector.archive'
  | 'subgraphSelector.delete'
  | 'subgraphSelector.name'
  | 'subgraphSelector.description'
  | 'subgraphSelector.startNodeUrl'
  | 'subgraphSelector.urlPattern'
  | 'subgraphSelector.maxDepth'
  | 'subgraphSelector.maxNodes'
  | 'subgraphSelector.createSubgraph'
  | 'subgraphSelector.deleteConfirm'
  | 'subgraphSelector.namePlaceholder'
  | 'subgraphSelector.descriptionPlaceholder'
  | 'subgraphSelector.startNodePlaceholder'
  | 'subgraphSelector.urlPatternPlaceholder'
  // CommonCrawl
  | 'commonCrawl.pleaseEnterQuery'
  | 'commonCrawl.querySuggestion'
  | 'commonCrawl.invalidCrawlIdMessage'
  // Sustainability
  | 'sustainability.title'
  | 'sustainability.subtitle'
  | 'sustainability.intro.title'
  | 'sustainability.intro.description'
  | 'sustainability.caching.title'
  | 'sustainability.caching.description'
  | 'sustainability.caching.diagram.title'
  | 'sustainability.caching.diagram.without'
  | 'sustainability.caching.diagram.withoutDesc'
  | 'sustainability.caching.diagram.with'
  | 'sustainability.caching.diagram.withDesc'
  | 'sustainability.caching.diagram.button'
  | 'sustainability.caching.diagram.server'
  | 'sustainability.caching.diagram.processing'
  | 'sustainability.caching.diagram.aiProcessing'
  | 'sustainability.caching.diagram.instantResult'
  | 'sustainability.caching.diagram.noAiNeeded'
  | 'sustainability.caching.benefit'
  | 'sustainability.singleSearch.title'
  | 'sustainability.singleSearch.description'
  | 'sustainability.singleSearch.diagram.title'
  | 'sustainability.singleSearch.diagram.multiple'
  | 'sustainability.singleSearch.diagram.multipleDesc'
  | 'sustainability.singleSearch.diagram.single'
  | 'sustainability.singleSearch.diagram.singleDesc'
  | 'sustainability.singleSearch.diagram.aiSearch'
  | 'sustainability.singleSearch.diagram.once'
  | 'sustainability.singleSearch.diagram.comprehensive'
  | 'sustainability.singleSearch.diagram.results'
  | 'sustainability.singleSearch.diagram.allInOne'
  | 'sustainability.singleSearch.diagram.lowEnergyUsage'
  | 'sustainability.singleSearch.diagram.highEnergyUsage'
  | 'sustainability.singleSearch.benefit'
  | 'sustainability.textReuse.title'
  | 'sustainability.textReuse.description'
  | 'sustainability.textReuse.diagram.title'
  | 'sustainability.textReuse.diagram.comparison'
  | 'sustainability.textReuse.cost.title'
  | 'sustainability.textReuse.cost.description'
  | 'sustainability.textReuse.carbon.title'
  | 'sustainability.textReuse.carbon.description'
  | 'sustainability.summary.title'
  | 'sustainability.summary.point1'
  | 'sustainability.summary.point2'
  | 'sustainability.summary.point3'
  | 'sustainability.summary.point4'
  | 'sustainability.summary.point5'
  | 'sustainability.summary.commitment'
  | 'sustainability.additional.title'
  | 'sustainability.additional.description'
  | 'sustainability.additional.efficient.title'
  | 'sustainability.additional.efficient.description'
  | 'sustainability.additional.data.title'
  | 'sustainability.additional.data.description'
  | 'sustainability.additional.optimization.title'
  | 'sustainability.additional.optimization.description'
  | 'sustainability.additional.scalable.title'
  | 'sustainability.additional.scalable.description'
  | 'sustainability.impact.title'
  | 'sustainability.impact.description'
  | 'sustainability.impact.cacheReduction'
  | 'sustainability.impact.searchReduction'
  | 'sustainability.impact.textReuse'
  | 'sustainability.impact.note'
  | 'sustainability.downloadFailed'
  | 'sustainability.loadingMetrics'
  | 'sustainability.retry'
  | 'sustainability.loadMetricsFailed'
  | 'sustainability.downloadJson'
  | 'sustainability.downloadCsv'
  | 'sustainability.downloadPdf'
  | 'sustainability.refreshMetrics'
  | 'admin.fillAllFields'
  | 'admin.createUserFailed'
  | 'admin.deleteUserFailed'
  | 'admin.userCreatedSuccess'
  | 'admin.userDeletedSuccess'
  | 'admin.searchPlaceholder'
  | 'admin.fullNamePlaceholder'
  | 'admin.passwordMinPlaceholder'
  | 'workflow.loadPermissionsFailed'
  | 'workflow.userIdRequired'
  | 'workflow.shareFailed'
  | 'workflow.removeAccessFailed'
  | 'workflow.updatePermissionFailed'
  | 'workflow.updateVisibilityFailed'
  | 'workflow.userPlaceholder'
  | 'workflow.sharedSuccess'
  | 'workflow.accessRemovedSuccess'
  | 'workflow.permissionUpdatedSuccess'
  | 'workflow.visibilityUpdatedSuccess'
  | 'workflow.permissionLevels.owner'
  | 'workflow.permissionLevels.editor'
  | 'workflow.permissionLevels.runner'
  | 'workflow.permissionLevels.viewer'
  | 'workflow.permissionLevels.ownerDesc'
  | 'workflow.permissionLevels.editorDesc'
  | 'workflow.permissionLevels.runnerDesc'
  | 'workflow.permissionLevels.viewerDesc'
  | 'workflow.visibility.private'
  | 'workflow.visibility.team'
  | 'workflow.visibility.public'
  | 'workflow.visibility.privateDesc'
  | 'workflow.visibility.teamDesc'
  | 'workflow.visibility.publicDesc'
  | 'admin.validateHierarchyFailed'
  | 'workflow.shareTitle'
  | 'workflow.loading'
  | 'workflow.permissions'
  | 'workflow.activityLog'
  | 'workflow.share'
  | 'workflow.visibility'
  | 'workflow.shareWithUser'
  | 'workflow.currentPermissions'
  | 'workflow.userIdRequiredDesc'
  // Error messages
  | 'errors.generic.title'
  | 'errors.timeout.title'
  | 'errors.timeout.limit'
  | 'errors.timeout.elapsed'
  | 'errors.timeout.percentageUsed'
  | 'errors.timeout.suggestions'
  | 'errors.timeout.retry'
  | 'errors.timeout.dismiss'
  | 'jobs.jobFailed'
  | 'jobs.jobCompletedWithErrors'
  | 'jobs.jobFailedTitle'
  | 'jobs.jobCompletedWithErrorsTitle'
  | 'jobs.errors'
  | 'jobs.retryJob'
  | 'jobs.errorDetails'
  | 'jobs.action'
  | 'jobs.showDetails'
  | 'jobs.dismiss'
  | 'jobs.document'
  | 'jobs.stackTrace'
  | 'errors.backend.notReachable'
  | 'errors.backend.notReachableDocker'
  | 'errors.backend.notReachableGeneric'
  | 'errors.backend.title'
  | 'errors.network.connectionProblem'
  | 'errors.network.connectionProblemMessage'
  | 'errors.network.connectionProblemAction'
  | 'errors.network.connectionRefused'
  | 'errors.network.connectionRefusedMessage'
  | 'errors.network.connectionRefusedAction'
  | 'errors.network.connectionBroken'
  | 'errors.network.connectionBrokenMessage'
  | 'errors.network.connectionBrokenAction'
  | 'errors.network.networkError'
  | 'errors.network.networkErrorMessage'
  | 'errors.network.networkErrorAction'
  | 'errors.timeout.genericTitle'
  | 'errors.timeout.genericMessage'
  | 'errors.timeout.genericAction'
  // GraphDB/Hierarchy errors
  | 'errors.graphdb.hierarchyNotAvailable'
  | 'errors.graphdb.hierarchyNotAvailableMessage'
  | 'errors.graphdb.hierarchyNotAvailableAction'
  // Validation errors
  | 'errors.validation.workflowRequiresSubject'
  | 'errors.validation.invalidUrl'
  | 'errors.validation.invalidUrlExample'
  | 'errors.validation.onlyHttpHttps'
  | 'errors.validation.fieldRequired'
  | 'errors.validation.fieldName'
  | 'errors.validation.valueMustBeNumber'
  | 'errors.validation.valueMustBeBetween'
  | 'errors.validation.invalidEmail'
  | 'errors.validation.subjectMaxLength'
  | 'errors.networkConnection'
  | 'errors.timeout'
  | 'errors.validation'
  | 'errors.validationWithField'
  | 'errors.notFound'
  | 'errors.resourceNotFound'
  | 'errors.permission'
  | 'errors.serverError'
  | 'errors.rateLimit'
  // Validation
  | 'validation.errors'
  // HierarchyTree
  | 'hierarchy.loading'
  | 'hierarchy.error'
  | 'hierarchy.noData'
  | 'hierarchy.failedToLoad'
  // ErrorDetailModal
  | 'errorDetail.title'
  | 'errorDetail.severity'
  | 'errorDetail.component'
  | 'errorDetail.status'
  | 'errorDetail.occurrences'
  | 'errorDetail.process'
  | 'errorDetail.request'
  | 'errorDetail.fileLocation'
  | 'errorDetail.errorMessage'
  | 'errorDetail.stackTrace'
  | 'errorDetail.firstSeen'
  | 'errorDetail.lastSeen'
  | 'errorDetail.resolvedAt'
  | 'errorDetail.additionalInfo'
  | 'errorDetail.errorId'
  | 'errorDetail.viewDashboard'
  | 'errorDetail.markResolved'
  | 'errorDetail.resolving'
  | 'errorDetail.failedFetch'
  | 'errorDetail.failedResolve'
  | 'errorDetail.severity.critical'
  | 'errorDetail.severity.error'
  | 'errorDetail.severity.warning'
  | 'errorDetail.component.scraper'
  | 'errorDetail.component.workflow'
  | 'errorDetail.component.api'
  | 'errorDetail.component.frontend'
  | 'errorDetail.component.database'
  | 'errorDetail.component.other'
  | 'errorDetail.status.resolved'
  | 'errorDetail.status.ignored'
  | 'errorDetail.status.open'
  // AICrawlingConfig
  | 'aiCrawling.title'
  | 'aiCrawling.description'
  | 'aiCrawling.globalConfig'
  | 'aiCrawling.noGlobalConfig'
  | 'aiCrawling.siteConfigs'
  | 'aiCrawling.createSiteConfig'
  | 'aiCrawling.siteUrl'
  | 'aiCrawling.aggressiveness'
  | 'aiCrawling.strategy'
  | 'aiCrawling.maxDepth'
  | 'aiCrawling.maxLinks'
  | 'aiCrawling.cacheEnabled'
  | 'aiCrawling.enabled'
  | 'aiCrawling.create'
  | 'aiCrawling.noSiteConfigs'
  | 'aiCrawling.save'
  | 'aiCrawling.cancel'
  | 'aiCrawling.aggressiveness.low'
  | 'aiCrawling.aggressiveness.medium'
  | 'aiCrawling.aggressiveness.high'
  | 'aiCrawling.strategy.auto'
  | 'aiCrawling.strategy.site_search'
  | 'aiCrawling.strategy.ai_navigation'
  | 'aiCrawling.strategy.traditional'
  | 'aiCrawling.boolean.yes'
  | 'aiCrawling.boolean.no'
  | 'aiCrawling.cache.enabled'
  | 'aiCrawling.cache.disabled'
  | 'aiCrawling.toast.urlRequired'
  | 'aiCrawling.toast.createSuccess'
  | 'aiCrawling.toast.createError'
  | 'aiCrawling.toast.updateSuccess'
  | 'aiCrawling.toast.updateError'
  | 'aiCrawling.toast.deleteConfirm'
  | 'aiCrawling.toast.deleteSuccess'
  | 'aiCrawling.toast.deleteError'
  | 'aiCrawling.toast.loadError'
  // TestRuns
  | 'testRuns.all'
  | 'testRuns.passed'
  | 'testRuns.failed'
  | 'testRuns.skipped'
  | 'testRuns.allTime'
  | 'testRuns.last24Hours'
  | 'testRuns.last7Days'
  | 'testRuns.last30Days'
  | 'testRuns.allTypes'
  | 'testRuns.unit'
  | 'testRuns.integration'
  | 'testRuns.e2e'
  | 'testRuns.visual'
  | 'testRuns.performance'
  | 'testRuns.workflowSteps'
  | 'testRuns.other'
  | 'testRuns.filterByTestFile'
  | 'testRuns.unknown'
  | 'testRuns.failedToLoadPipeline'
  // Knowledge Graph (KG)
  | 'kg.query.required'
  | 'kg.query.saveRequired'
  | 'kg.query.saved'
  | 'kg.query.alreadyInHistory'
  | 'kg.query.loadedFromHistory'
  | 'kg.query.executedSuccess'
  | 'kg.query.failed'
  | 'kg.query.title'
  | 'kg.query.description'
  | 'kg.query.executing'
  | 'kg.query.execute'
  | 'kg.query.history'
  | 'kg.query.templates'
  | 'kg.query.results.title'
  | 'kg.query.results.description'
  | 'kg.query.results.executing'
  | 'kg.query.results.summary'
  | 'kg.query.results.exportCsv'
  | 'kg.query.results.true'
  | 'kg.query.results.false'
  | 'kg.query.results.noResults'
  | 'kg.query.results.noQueryYet'
  | 'kg.commands.title'
  | 'kg.commands.description'
  | 'kg.commands.status'
  | 'kg.commands.branch'
  | 'kg.commands.commit'
  | 'kg.commands.stash'
  | 'kg.commands.merge'
  | 'kg.commands.diff'
  | 'kg.commands.log'
  | 'kg.commands.stashList'
  | 'kg.commands.notImplemented'
  | 'kg.commands.failed'
  | 'kg.management.title'
  | 'kg.management.description'
  | 'kg.status.currentBranch'
  | 'kg.status.loadError'
  | 'kg.query.templates.allEntities'
  | 'kg.query.templates.allRelationships'
  | 'kg.query.templates.entitiesByType'
  | 'kg.query.templates.entityCountByType'
  | 'kg.query.templates.relationshipsByType'
  | 'kg.query.executeError'
  | 'kg.branch.loadError'
  | 'kg.branch.switched'
  | 'kg.branch.switchError'
  | 'kg.branch.created'
  | 'kg.branch.createError'
  | 'kg.stash.loadError'
  | 'kg.stash.defaultDescription'
  | 'kg.stash.success'
  | 'kg.stash.failed'
  | 'kg.stash.applied'
  | 'kg.stash.popError'
  | 'kg.stash.dropped'
  | 'kg.stash.dropError'
  | 'kg.stash.button'
  | 'kg.stash.listTitle'
  | 'kg.stash.listDescription'
  | 'kg.stash.pop'
  | 'kg.stash.drop'
  | 'kg.stash.noStashes'
  | 'kg.commit.defaultMessage'
  | 'kg.commit.success'
  | 'kg.commit.failed'
  | 'kg.merge.success'
  | 'kg.merge.conflicts'
  | 'kg.merge.failed'
  | 'kg.diff.failed'
  | 'kg.diff.entities'
  | 'kg.diff.relationships'
  | 'kg.diff.added'
  | 'kg.diff.removed'
  | 'kg.diff.modified'
  | 'kg.log.loadError'
  | 'kg.log.title'
  | 'kg.log.description'
  | 'kg.log.refresh'
  | 'kg.log.noHistory'
  | 'kg.status.entities'
  | 'kg.status.relationships'
  | 'kg.status.pendingChanges'
  | 'kg.status.pendingChangesCount'
  | 'kg.status.noPendingChanges'
  | 'kg.status.refreshed'
  | 'kg.commit.noPendingChanges'
  | 'kg.branch.nameRequired'
  | 'kg.branch.selectRequired'
  | 'kg.branch.selectRequiredDesc'
  // Runs
  | 'runs.retryInfo'
  | 'runs.retryInfoDesc'
  // TestRun
  | 'testRun.startedSuccess'
  | 'testRun.startFailed'
  | 'testRun.linkCopied'
  | 'testRun.copyFailed'
  | 'testRun.detailsRefreshed'
  // Benchmark templates
  | 'benchmark.templates.loadFailed'
  | 'benchmark.templates.nameRequired'
  | 'benchmark.templates.nameRequiredDesc'
  | 'benchmark.templates.typesRequired'
  | 'benchmark.templates.typesRequiredDesc'
  | 'benchmark.templates.saved'
  | 'benchmark.templates.savedDesc'
  | 'benchmark.settingsComparison'
  | 'benchmark.settingsComparisonDesc'
  | 'benchmark.templates.saveFailed'
  | 'benchmark.templates.deleted'
  | 'benchmark.templates.deletedDesc'
  | 'benchmark.templates.deleteFailed'
  | 'benchmark.featureFlags.loadFailed'
  | 'benchmark.config.invalid'
  | 'benchmark.config.invalidDesc'
  | 'benchmark.config.workflowRequired'
  | 'benchmark.config.workflowRequiredDesc'
  | 'benchmark.config.saved'
  | 'benchmark.config.savedDesc'
  | 'benchmark.config.workflowNotFound'
  | 'benchmark.config.workflowNotFoundDesc'
  | 'benchmark.config.saveFailed'
  | 'benchmark.loadingFeatureFlags'
  | 'benchmark.noFlagsMatchSearch'
  | 'benchmark.retry'
  // DocumentSources
  | 'documentSources.title'
  | 'documentSources.noQueryId'
  | 'documentSources.loading'
  | 'documentSources.loadError'
  | 'documentSources.waitingForDocuments'
  // WorkflowComparison
  | 'workflowComparison.id'
  // DocumentComparison
  | 'documentComparison.title'
  | 'documentComparison.description'
  | 'documentComparison.documentA'
  | 'documentComparison.documentB'
  | 'documentComparison.comparing'
  | 'documentComparison.compareDocuments'
  | 'documentComparison.summary'
  | 'documentComparison.matchedConcepts'
  | 'documentComparison.differences'
  | 'documentComparison.comparisonSummary'
  | 'documentComparison.totalConcepts'
  | 'documentComparison.identical'
  | 'documentComparison.changed'
  | 'documentComparison.conflicting'
  | 'documentComparison.overallSimilarity'
  | 'documentComparison.confidence'
  | 'documentComparison.keyDifferences'
  | 'documentComparison.strategy'
  | 'documentComparison.method'
  | 'documentComparison.processingTime'
  | 'documentComparison.change'
  | 'documentComparison.old'
  | 'documentComparison.new'
  | 'documentComparison.impact'
  | 'documentComparison.evidenceA'
  | 'documentComparison.evidenceB'
  | 'documentComparison.chunks'
  | 'documentComparison.confidencePercent'
  | 'documentComparison.viewDetails'
  | 'documentComparison.conceptDifference'
  | 'documentComparison.conceptDifferenceDescription'
  | 'documentComparison.changeType'
  | 'documentComparison.changeDescription'
  | 'documentComparison.oldValue'
  | 'documentComparison.newValue'
  // Sustainability
  | 'sustainability.cacheHitRate'
  | 'sustainability.co2Savings'
  | 'sustainability.costSavings'
  | 'sustainability.apiCallsAvoided'
  | 'sustainability.energySavings'
  | 'sustainability.keyPerformanceIndicators'
  | 'sustainability.target'
  | 'sustainability.hits'
  | 'sustainability.requests'
  // Neo4jBloom
  | 'neo4jBloom.checkingAvailability'
  | 'neo4jBloom.title'
  | 'neo4jBloom.description'
  | 'neo4jBloom.openInNewWindow'
  | 'neo4jBloom.notAvailable'
  | 'neo4jBloom.notAvailableDescription'
  | 'neo4jBloom.setupInstructions'
  | 'neo4jBloom.installTitle'
  | 'neo4jBloom.installRequires'
  | 'neo4jBloom.installDownload'
  | 'neo4jBloom.installGuide'
  | 'neo4jBloom.configureTitle'
  | 'neo4jBloom.configureEnv'
  | 'neo4jBloom.configureApi'
  | 'neo4jBloom.accessTitle'
  | 'neo4jBloom.accessPort'
  | 'neo4jBloom.accessDefault'
  | 'neo4jBloom.tryOpening'
  | 'neo4jBloom.recheckAvailability'
  | 'neo4jBloom.note'
  | 'neo4jBloom.noteDescription'
  // AIUsage
  | 'aiUsage.cachePerformance'
  | 'aiUsage.hitRate'
  | 'aiUsage.cacheHits'
  | 'aiUsage.cacheMisses'
  | 'aiUsage.carbonFootprintEstimate'
  | 'aiUsage.loadingData'
  | 'aiUsage.error'
  | 'aiUsage.dailyApiCalls'
  | 'aiUsage.date'
  | 'aiUsage.calls'
  | 'aiUsage.tokens'
  | 'aiUsage.cost'
  | 'aiUsage.errors'
  | 'aiUsage.llmCalls'
  // Sustainability
  | 'sustainability.loadingMetrics'
  | 'sustainability.apiCallsAvoided'
  // Neo4jNVL
  | 'neo4jNVL.noCommunitiesFound'
  | 'neo4jNVL.runWorkflowOrSeed'
  | 'neo4jNVL.knowledgeGraph'
  | 'neo4jNVL.entities'
  | 'neo4jNVL.relationships'
  | 'neo4jNVL.hierarchical'
  | 'neo4jNVL.forceDirected'
  | 'neo4jNVL.domains'
  | 'neo4jNVL.filterByDomain'
  | 'neo4jNVL.domainColorLegend'
  // Search
  | 'search.exportOptions'
  | 'search.noMunicipalitiesFound'
  | 'search.allGovernmentLayers'
  // Network
  | 'network.offline'
  | 'network.offlineMessage'
  // Performance
  | 'performance.loadingMetrics'
  | 'performance.errorLoading'
  | 'performance.retry'
  | 'performance.noDataAvailable'
  | 'performance.dashboard'
  | 'performance.days'
  | 'performance.autoRefresh'
  | 'performance.refreshing'
  | 'performance.refresh'
  | 'performance.p95ResponseTime'
  // Workflow create
  | 'workflow.create.validationFailed'
  | 'workflow.create.validationFailedDesc'
  | 'workflow.create.stepValidationFailed'
  // Missing workflow keys
  | 'workflow.failedToLoadCompletedQueries'
  | 'workflow.failedToNavigateToStep1'
  | 'workflow.failedToNavigateToStep3'
  | 'workflow.failedToStart'
  | 'workflow.selectParameter'
  | 'workflow.workflowNamePlaceholder'
  // Missing step3 keys
  | 'step3InfoDialogs.helpReviewingDocuments'
  | 'step3InfoDialogs.workflowImportInfoAria'
  // Missing admin keys
  | 'admin.correctedValue'
  | 'admin.createSchedule'
  | 'admin.createThresholdSchedule'
  | 'admin.enterCorrectedValue'
  | 'admin.failedToExportTracesDesc'
  | 'admin.failedToLoadTraceDetailsDesc'
  | 'admin.failedToLoadTracesDesc'
  | 'admin.scheduleDaysOfWeek'
  | 'admin.scheduleEndTime'
  | 'admin.scheduleName'
  | 'admin.scheduleNamePlaceholder'
  | 'admin.scheduleOptional'
  | 'admin.scheduleStartTime'
  | 'admin.scheduleThresholds'
  | 'admin.statusIgnored'
  | 'admin.statusResolved'
  // Missing featureFlags keys
  | 'featureFlags.allDisabled'
  | 'featureFlags.allEnabled'
  | 'featureFlags.apply'
  | 'featureFlags.applyChanges'
  | 'featureFlags.applyTemplate'
  | 'featureFlags.applying'
  | 'featureFlags.applyingChanges'
  | 'featureFlags.benchmark'
  | 'featureFlags.bulkEdit'
  | 'featureFlags.bulkEditMode'
  | 'featureFlags.cancel'
  | 'featureFlags.changed'
  | 'featureFlags.changes'
  | 'featureFlags.childFlags'
  | 'featureFlags.clickSaveToApply'
  | 'featureFlags.close'
  | 'featureFlags.configurationName'
  | 'featureFlags.configurationNamePlaceholder'
  | 'featureFlags.configureMultipleFlags'
  | 'featureFlags.confirmDeleteTemplate'
  | 'featureFlags.conflictingFlags'
  | 'featureFlags.created'
  | 'featureFlags.createdBy'
  | 'featureFlags.default'
  | 'featureFlags.delete'
  | 'featureFlags.deleteTemplate'
  | 'featureFlags.dependenciesFor'
  | 'featureFlags.description'
  | 'featureFlags.discardChanges'
  | 'featureFlags.discardChangesAction'
  | 'featureFlags.editMode'
  | 'featureFlags.editModeBadge'
  | 'featureFlags.enabledCount'
  | 'featureFlags.environment'
  | 'featureFlags.environmentVariables'
  | 'featureFlags.failedToApplyTemplate'
  | 'featureFlags.failedToLoadTemplates'
  | 'featureFlags.flag'
  | 'featureFlags.flagDiffersFromCurrent'
  | 'featureFlags.flags'
  | 'featureFlags.flagsDifferFromCurrent'
  | 'featureFlags.flagsPlural'
  | 'featureFlags.keepEditing'
  | 'featureFlags.lastUpdated'
  | 'featureFlags.loadingTemplates'
  | 'featureFlags.makeTemplatePublic'
  | 'featureFlags.manageFlags'
  | 'featureFlags.manageableFlags'
  | 'featureFlags.more'
  | 'featureFlags.moreFlags'
  | 'featureFlags.mutuallyExclusiveFlags'
  | 'featureFlags.noChangesIfApplied'
  | 'featureFlags.noDependenciesDefined'
  | 'featureFlags.noDependencyInfo'
  | 'featureFlags.noTemplatesFound'
  | 'featureFlags.parentFlags'
  | 'featureFlags.pendingChangesWillBeLost'
  | 'featureFlags.preview'
  | 'featureFlags.previewOfTemplate'
  | 'featureFlags.productionDescription'
  | 'featureFlags.productionFeatureFlags'
  | 'featureFlags.public'
  | 'featureFlags.refreshCache'
  | 'featureFlags.requiredFlags'
  | 'featureFlags.saveAsTemplate'
  | 'featureFlags.saveChanges'
  | 'featureFlags.saveCurrentAsTemplate'
  | 'featureFlags.saveCurrentAsTemplateDesc'
  | 'featureFlags.saveTemplate'
  | 'featureFlags.savedTemplates'
  | 'featureFlags.saving'
  | 'featureFlags.templateApplied'
  | 'featureFlags.templateAppliedSuccess'
  | 'featureFlags.templateDescription'
  | 'featureFlags.templateDescriptionPlaceholder'
  | 'featureFlags.templateMatchesCurrent'
  | 'featureFlags.templateName'
  | 'featureFlags.templateNamePlaceholder'
  | 'featureFlags.templatePreview'
  | 'featureFlags.templates'
  | 'featureFlags.templatesDescription'
  | 'featureFlags.templatesTitle'
  | 'featureFlags.time'
  | 'featureFlags.times'
  | 'featureFlags.title'
  | 'featureFlags.tryAgainLater'
  | 'featureFlags.usageCount'
  | 'featureFlags.used'
  | 'featureFlags.viewTemplates'
  | 'featureFlags.youHavePendingChanges'
  // Missing test keys
  | 'test.completed'
  | 'test.failed'
  | 'test.failedToCompareDocuments'
  | 'test.failedToLoadHistory'
  | 'test.failedToLoadMetadata'
  | 'test.ready'
  | 'test.testsRunning'
  | 'test.viewDetails'
  | 'test.quickLinksToTrendAnalysis'
  | 'test.testTrends'
  | 'test.identifyFlakyTests'
  | 'test.testHealth'
  | 'test.failureTimeline'
  // TestExecution
  | 'testExecution.runTests'
  | 'testExecution.failedToStart'
  | 'testExecution.failedToStartExecution'
  | 'testExecution.testFilesLabel'
  | 'testExecution.testFilesPlaceholder'
  | 'testExecution.testFilesDescription'
  | 'testExecution.running'
  | 'testExecution.startTests'
  | 'testExecution.selectedFiles'
  // TestExecutionTimeline
  | 'testExecutionTimeline.title'
  | 'testExecutionTimeline.viewTimeline'
  | 'testExecutionTimeline.unknownTime'
  | 'testExecutionTimeline.testResults'
  | 'testExecutionTimeline.moreRuns'
  | 'testExecutionTimeline.noData'
  // TestExecutionMonitor
  | 'testExecutionMonitor.title'
  | 'testExecutionMonitor.waitingForStart'
  | 'testExecutionMonitor.notConnected'
  | 'testExecutionMonitor.calculating'
  | 'testExecutionMonitor.secondsRemaining'
  | 'testExecutionMonitor.timeRemaining'
  | 'testExecutionMonitor.progress'
  | 'testExecutionMonitor.total'
  | 'testExecutionMonitor.passed'
  | 'testExecutionMonitor.failed'
  | 'testExecutionMonitor.skipped'
  | 'testExecutionMonitor.completed'
  | 'testExecutionMonitor.currentTest'
  | 'testExecutionMonitor.started'
  | 'testExecutionMonitor.estimatedRemaining'
  | 'testExecutionMonitor.testResults'
  | 'testExecutionMonitor.output'
  // TestProgressBar
  | 'testProgressBar.title'
  | 'testProgressBar.tests'
  | 'testProgressBar.complete'
  | 'testProgressBar.remaining'
  | 'testProgressBar.allTestsCompleted'
  // DashboardMainContent
  | 'dashboardMainContent.topFlakyTests'
  | 'dashboardMainContent.pass'
  | 'dashboardMainContent.flake'
  | 'dashboardMainContent.andMore'
  | 'dashboardMainContent.clickToViewDetails'
  | 'dashboardMainContent.noFlakyTestsData'
  | 'dashboardMainContent.viewDetailedTrends'
  | 'dashboardMainContent.overallPassRate'
  | 'dashboardMainContent.averageDuration'
  | 'dashboardMainContent.acrossRuns'
  | 'dashboardMainContent.totalTests'
  | 'dashboardMainContent.testSummary'
  | 'dashboardMainContent.failureRate'
  | 'dashboardMainContent.viewFull'
  // ErrorExplorer
  | 'errorExplorer.title'
  | 'errorExplorer.description'
  | 'errorExplorer.loadingErrors'
  | 'errorExplorer.noErrorsFound'
  | 'errorExplorer.tryAdjustingFilters'
  | 'errorExplorer.errorMessage'
  | 'errorExplorer.noDetails'
  | 'errorExplorer.category'
  | 'errorExplorer.severity'
  | 'errorExplorer.testFile'
  | 'errorExplorer.occurrences'
  | 'errorExplorer.actions'
  // ErrorDetailDialog
  | 'errorDetailDialog.title'
  | 'errorDetailDialog.description'
  | 'errorDetailDialog.failedToLoad'
  | 'errorDetailDialog.loading'
  | 'errorDetailDialog.errorMessage'
  | 'errorDetailDialog.category'
  | 'errorDetailDialog.severity'
  | 'errorDetailDialog.occurrences'
  | 'errorDetailDialog.stackTrace'
  | 'errorDetailDialog.occurrenceTimeline'
  | 'errorDetailDialog.occurrencesCount'
  | 'errorDetailDialog.noTimelineData'
  | 'errorDetailDialog.affectedTestFiles'
  | 'errorDetailDialog.noAffectedTestFiles'
  | 'errorDetailDialog.relatedErrors'
  | 'errorDetailDialog.similar'
  | 'errorDetailDialog.firstSeen'
  | 'errorDetailDialog.lastSeen'
  // TestFailureAnalysis
  | 'testFailureAnalysis.searchPatterns'
  | 'testFailureAnalysis.allSeverities'
  | 'testFailureAnalysis.critical'
  | 'testFailureAnalysis.high'
  | 'testFailureAnalysis.medium'
  | 'testFailureAnalysis.low'
  | 'testFailureAnalysis.allCategories'
  // WizardSessionError
  | 'wizardSessionError.title'
  | 'wizardSessionError.networkError'
  | 'wizardSessionError.timeoutError'
  | 'wizardSessionError.serverError'
  | 'wizardSessionError.connectionError'
  | 'wizardSessionError.unknownError'
  | 'wizardSessionError.retrying'
  | 'wizardSessionError.retryAttempt'
  | 'wizardSessionError.technicalDetails'
  | 'wizardSessionError.code'
  | 'wizardSessionError.message'
  | 'wizardSessionError.retryable'
  | 'wizardSessionError.retryAriaLabel'
  | 'wizardSessionError.retry'
  | 'wizardSessionError.continueWithDraftAriaLabel'
  | 'wizardSessionError.continueWithDraft'
  | 'wizardSessionError.startFreshAriaLabel'
  | 'wizardSessionError.startFresh'
  | 'wizardSessionError.goHomeAriaLabel'
  | 'wizardSessionError.goHome'
  | 'wizardSessionError.tip'
  | 'wizardSessionError.helpText'
  // TestDashboard
  | 'testDashboard.title'
  | 'testDashboard.description'
  | 'testDashboard.lastUpdated'
  | 'testDashboard.enableRealTime'
  | 'testDashboard.disableRealTime'
  | 'testDashboard.realTimeOn'
  | 'testDashboard.realTimeOff'
  | 'testDashboard.exportDashboardData'
  | 'testDashboard.exportTestRunsJson'
  | 'testDashboard.exportTestRunsCsv'
  | 'testDashboard.keyboardShortcutsTitle'
  | 'testDashboard.shortcuts'
  | 'testDashboard.enableNotifications'
  | 'testDashboard.disableNotifications'
  | 'testDashboard.requestNotificationPermission'
  | 'testDashboard.notificationsOn'
  | 'testDashboard.notificationsOff'
  | 'testDashboard.keyboardShortcuts'
  | 'testDashboard.keyboardShortcutsDescription'
  | 'testDashboard.shortcutRefreshDashboard'
  | 'testDashboard.shortcutRefreshDashboardDesc'
  | 'testDashboard.shortcutRunAllTests'
  | 'testDashboard.shortcutRunAllTestsDesc'
  | 'testDashboard.shortcutExportMenu'
  | 'testDashboard.shortcutExportMenuDesc'
  | 'testDashboard.shortcutShowShortcuts'
  | 'testDashboard.shortcutShowShortcutsDesc'
  | 'testDashboard.shortcutCloseMenu'
  | 'testDashboard.shortcutCloseMenuDesc'
  | 'testDashboard.tip'
  | 'testDashboard.shortcutsDisabledNote'
  | 'testDashboard.loading'
  | 'testDashboard.noDataTitle'
  | 'testDashboard.noDataDescription'
  | 'testDashboard.noDataInstructions'
  | 'testDashboard.quickActions'
  | 'testDashboard.quickActionsDescription'
  | 'testDashboard.healthCheck'
  | 'testDashboard.healthCheckTitle'
  | 'testDashboard.runAllTests'
  | 'testDashboard.runAllTestsTitle'
  | 'testDashboard.collectBugs'
  | 'testDashboard.collectBugsTitle'
  | 'testDashboard.generateReport'
  | 'testDashboard.generateReportTitle'
  | 'testDashboard.note'
  | 'testDashboard.quickActionsNote'
  | 'testDashboard.passed'
  | 'testDashboard.failed'
  | 'testDashboard.skipped'
  | 'testDashboard.totalTests'
  | 'testDashboard.updated'
  | 'testDashboard.flakyTests'
  | 'testDashboard.clickToViewDetails'
  | 'testExecutionSection.endToEndTestsRun'
  | 'testExecutionSection.stopTests'
  | 'testExecutionSection.started'
  | 'testExecutionSection.processId'
  | 'testExecutionSection.testFile'
  | 'testExecutionSection.error'
  | 'testExecutionSection.loading'
  | 'testExecutionSection.viewLogFiles'
  | 'testExecutionSection.clear'
  | 'testExecutionSection.waitingForOutput'
  | 'testExecutionSection.workflowStepsMonitoring'
  | 'testExecutionSection.loadingWorkflowStatus'
  | 'testExecutionSection.runId'
  | 'testExecutionSection.active'
  | 'testExecutionSection.currentStep'
  | 'testExecutionSection.step'
  | 'testExecutionSection.progress'
  | 'testExecutionSection.steps'
  | 'testExecutionSection.estimatedTimeRemaining'
  | 'testExecutionSection.stepProgress'
  | 'testExecutionSection.completed'
  | 'testExecutionSection.pending'
  | 'testExecutionSection.noWorkflowStepsRunning'
  | 'testExecutionSection.testLogFiles'
  | 'testExecutionSection.savedTo'
  | 'testExecutionSection.logContent'
  | 'testExecutionSection.logsAutoSaved'
  | 'testExecutionSection.runAllTests'
  | 'testExecutionSection.resultsReady'
  | 'testExecutionSection.pipelineStatus'
  | 'testHistoryTimeline.loadingHistory'
  | 'testHistoryTimeline.allTypes'
  | 'testHistoryTimeline.clearFilters'
  | 'testHistoryTimeline.status'
  | 'testHistoryTimeline.time'
  | 'testHistoryTimeline.duration'
  | 'testHistoryTimeline.results'
  | 'testHistoryTimeline.type'
  | 'testHistoryTimeline.environment'
  | 'testHistoryTimeline.branch'
  | 'testHistoryTimeline.clickToViewDetails'
  | 'testHistoryTimeline.passed'
  | 'testHistoryTimeline.failed'
  | 'testHistoryTimeline.skipped'
  | 'testHistoryTimeline.error'
  | 'testHistoryTimeline.retry'
  | 'testHistoryTimeline.failedToFetch'
  | 'testHistoryTimeline.filters'
  | 'testHistoryTimeline.fromDate'
  | 'testHistoryTimeline.toDate'
  | 'testHistoryTimeline.testFile'
  | 'testHistoryTimeline.testType'
  | 'testHistoryTimeline.allFiles'
  | 'testHistoryTimeline.allStatus'
  | 'testHistoryTimeline.allEnvironments'
  | 'testHistoryTimeline.applyFilters'
  | 'testHistoryTimeline.zoomOut'
  | 'testHistoryTimeline.zoomIn'
  | 'testHistoryTimeline.reset'
  | 'testHistoryTimeline.testRunsShown'
  | 'testHistoryTimeline.testExecutionTimeline'
  | 'testHistoryTimeline.noHistoryFound'
  | 'testHistoryTimeline.runTestsToSee'
  | 'testHistoryTimeline.legend'
  | 'testHistoryTimeline.unit'
  | 'testHistoryTimeline.integration'
  | 'testHistoryTimeline.endToEnd'
  | 'testHistoryTimeline.visual'
  | 'testHistoryTimeline.performance'
  | 'testHistoryStatistics.title'
  | 'testHistoryStatistics.totalRuns'
  | 'testHistoryStatistics.totalTests'
  | 'testHistoryStatistics.avgPassRate'
  | 'testHistoryStatistics.avgDuration'
  | 'testAdvancedSearch.advancedSearch'
  | 'testAdvancedSearch.searchPlaceholder'
  | 'testAdvancedSearch.searching'
  | 'testAdvancedSearch.search'
  | 'testAdvancedSearch.clear'
  | 'testAdvancedSearch.allTypes'
  | 'testAdvancedSearch.testType'
  | 'testAdvancedSearch.status'
  | 'testAdvancedSearch.branch'
  | 'testAdvancedSearch.filterByBranch'
  | 'testAdvancedSearch.limit'
  | 'testAdvancedSearch.startDate'
  | 'testAdvancedSearch.endDate'
  | 'testAdvancedSearch.all'
  | 'testAdvancedSearch.passed'
  | 'testAdvancedSearch.failed'
  | 'testAdvancedSearch.partial'
  | 'testAdvancedSearch.total'
  | 'testRunsList.noDataAvailable'
  | 'testRunsList.runTestsFirst'
  | 'testRunsList.seeInstructions'
  | 'testRunsList.clearFilters'
  | 'testRunsList.status'
  | 'testRunsList.testFile'
  | 'testHistoryFilters.allTypes'
  | 'testHistoryFilters.testType'
  | 'testHistoryFilters.branch'
  | 'testHistoryFilters.allBranches'
  | 'testHistoryFilters.status'
  | 'testHistoryFilters.sortBy'
  | 'testHistoryFilters.timestamp'
  | 'testHistoryFilters.duration'
  | 'testHistoryFilters.passRate'
  | 'testHistoryFilters.search'
  | 'testHistoryFilters.searchPlaceholder'
  | 'testHistoryFilters.order'
  | 'testHistoryFilters.ascending'
  | 'testHistoryFilters.descending'
  // TestDashboardNav
  | 'testDashboardNav.title'
  | 'testDashboardNav.dashboard'
  | 'testDashboardNav.analytics'
  | 'testDashboardNav.history'
  | 'testDashboardNav.performance'
  | 'testDashboardNav.failures'
  | 'testDashboardNav.coverage'
  | 'testDashboardNav.search'
  | 'testDashboardNav.recommendations'
  | 'testDashboardNav.alerts'
  // TestTrendsPage
  | 'testTrends.title'
  | 'testTrends.description'
  | 'testTrends.refresh'
  | 'testTrends.filters'
  | 'testTrends.timeRange'
  | 'testTrends.testSuite'
  | 'testTrends.branch'
  | 'testTrends.environment'
  | 'testTrends.lastDays'
  | 'testTrends.allSuites'
  | 'testTrends.allEnvironments'
  | 'testTrends.passFailTrends'
  | 'testTrends.passRate'
  | 'testTrends.noTrendsData'
  | 'testTrends.passed'
  | 'testTrends.failed'
  | 'testTrends.skipped'
  | 'testTrends.flakeDetection'
  | 'testTrends.noFlakyTests'
  | 'testTrends.failedToLoadFlake'
  | 'testTrends.totalFlakyTests'
  | 'testTrends.testIdSuite'
  | 'testTrends.totalRuns'
  | 'testTrends.passRate'
  | 'testTrends.flakeRate'
  | 'testTrends.recentFailures'
  | 'testTrends.performanceDrift'
  | 'testTrends.noTestData'
  | 'testTrends.noRegressions'
  | 'testTrends.failedToLoadPerformance'
  | 'testTrends.currentDuration'
  | 'testTrends.baselineDuration'
  | 'testTrends.increase'
  | 'testTrends.status'
  | 'testTrends.trend'
  | 'testTrends.regressions'
  | 'testTrends.warnings'
  | 'testTrends.whatBrokeWhen'
  | 'testTrends.noFailuresInRange'
  | 'testTrends.failedToLoadTimeline'
  | 'testTrends.totalFailures'
  | 'testTrends.uniqueCommits'
  | 'testTrends.uniqueTests'
  | 'testTrends.commit'
  | 'testTrends.failures'
  | 'testTrends.failedTests'
  | 'testDashboardNav.dependencies'
  | 'testDashboardNav.notifications'
  | 'testDashboardNav.scheduledExports'
  | 'testDashboardNav.documentation'
  | 'testDashboardNav.reports'
  | 'testDashboardNav.errorAnalysis'
  // GraphPage
  | 'graphPage.milestoneTitle'
  | 'graphPage.milestoneMessage'
  | 'graphPage.loadError'
  | 'graphPage.loadErrorDescription'
  | 'graphPage.loadNavigationError'
  | 'graphPage.loadNavigationErrorDescription'
  | 'graphPage.connected'
  | 'graphPage.mode'
  | 'graphPage.viewMode'
  | 'graphPage.metaGraph'
  | 'graphPage.connectedGraph'
  | 'graphPage.allNodes'
  | 'graphPage.clusteredView'
  | 'graphPage.node'
  | 'graphPage.totalNodesTitle'
  | 'graphPage.showHelpTitle'
  | 'graphPage.showHelp'
  | 'graphPage.help'
  | 'graphPage.realTimeUpdateTitle'
  | 'graphPage.graphHealthTitle'
  | 'graphPage.hasRoot'
  | 'graphPage.noRoot'
  | 'graphPage.emptyGraphTitle'
  | 'graphPage.criticalHealthTitle'
  | 'graphPage.warningHealthTitle'
  | 'graphPage.emptyGraphDescription'
  | 'graphPage.graphStats'
  | 'graphPage.noRootNode'
  | 'graphPage.connectivityPercentage'
  | 'graphPage.runWorkflow'
  | 'graphPage.adminTools'
  | 'graphPage.dismiss'
  | 'graphPage.noClustersFound'
  | 'graphPage.noClustersDescription'
  | 'graphPage.noClustersExplanation'
  // WorkflowStepsCommands
  | 'workflowStepsCommands.title'
  | 'workflowStepsCommands.commandsCount'
  | 'workflowStepsCommands.clickToRun'
  | 'workflowStepsCommands.copyCommand'
  | 'workflowStepsCommands.fullDocumentation'
  | 'workflowStepsCommands.description'
  | 'workflowStepsCommands.runDescription'
  | 'workflowStepsCommands.quickReference'
  | 'workflowStepsCommands.quickReferenceDescription'
  | 'groundTruth.datasetsAvailable'
  | 'groundTruth.noDatasetsYet'
  | 'groundTruth.uploadFirstDatasetButton'
  | 'workflowLogs.key'
  | 'executionHistory.healthCheck'
  | 'executionHistory.collectBugs'
  | 'executionHistory.generateReport'
  | 'executionHistory.custom'
  | 'executionHistory.noHistory'
  | 'executionHistory.runCommandToSee'
  | 'executionHistory.rerunCommand';

const translations: Record<TranslationKey, string> = {
  // WorkflowLogs
  'workflowLogs.title': 'Uitvoeringslogboeken',
  'workflowLogs.waiting': 'Wachten tot workflow start...',
  'workflowLogs.loading': 'Logboeken laden...',
  'workflowLogs.noLogs': 'Nog geen logboeken. Workflow wordt gestart...',
  'workflowLogs.viewDetails': 'Details bekijken',
  'workflowLogs.status.completed': 'Voltooid',
  'workflowLogs.status.failed': 'Mislukt',
  'workflowLogs.status.running': 'Bezig',
  'workflowLogs.status.pending': 'In afwachting',
  'workflowLogs.status.cancelled': 'Geannuleerd',
  'workflowLogs.status.completed_with_errors': 'Voltooid met fouten',
  'workflowLogs.downloadTooltip': 'Downloaden logs als tekstbestand',
  'workflowLogs.graphSaved': 'Navigatiegrafiek opgeslagen op schijf',
  'workflowLogs.graphLoaded': 'Navigatiegrafiek geladen',
  'workflowLogs.noClustersFound': 'Geen relevante clusters gevonden. Volledige verkenning gestart.',
  'workflowLogs.externalLinksCompleted': 'Verkenning van externe links voltooid',
  'workflowLogs.subgraphShown': 'Relevante subnetwerkweergave uit bestaand navigatienetwerk',
  'workflowLogs.expansionStarted': 'Uitbreiding vanaf relevante nodes gestart...',
  'workflowLogs.findingStartNode': 'Startnode voor BFS zoeken...',
  'workflowLogs.mergingExpandedResults': 'Uitbreiding samenvoegen in hoofd-navigatienetwerk...',
  'workflowLogs.scanResultsSaved': 'Scanresultaten opgeslagen',
  'workflowLogs.cancellationRequested': 'Annulering aangevraagd door gebruiker',
  'workflowLogs.pauseRequested': 'Pauze aangevraagd door gebruiker',
  'workflowLogs.workflowCancelled': 'Workflow geannuleerd door gebruiker',
  'workflowLogs.initializingScan': 'Scan initialiseren...',
  'workflowLogs.initialSearch': 'Initiële webzoekopdracht uitvoeren...',
  'workflowLogs.analyzingClusters': 'Grafiekclusters analyseren...',
  'workflowLogs.finalizingScan': 'Scan afronden...',
  'workflowLogs.arbeidsmigrantenScraper': 'Gespecialiseerde scraper voor Arbeidsmigranten',
  'workflowLogs.energietransitieScraper': 'Gespecialiseerde scraper voor Energietransitie',
  'workflowLogs.baseHorstScraper': 'Basis-scraper voor Horst aan de Maas',
  'workflowLogs.runResumed': 'Run hervat',
  'workflowLogs.startingWorkflow': 'Workflow starten',
  'workflowLogs.workflowExecutionStarted': 'Workflowuitvoering gestart',
  'workflowLogs.engineInitialized': 'Engine geïnitialiseerd, workflowuitvoering starten...',
  'workflowLogs.workflowCompleted': 'Workflow succesvol voltooid',
  'workflowLogs.workflowFailed': 'Workflow mislukt',
  'workflowLogs.workflowPauseRequested': 'Workflow pauze aangevraagd',
  'workflowLogs.workflowCancelledByUser': 'Workflow geannuleerd door gebruiker',
  'workflowLogs.workflowLoaded': 'Workflow geladen, engine initialiseren...',
  'workflowLogs.scanningIPLO': 'IPLO scannen',
  'workflowLogs.processingSubject': 'Onderwerp verwerken',
  'workflowLogs.enhancingQuery': 'Zoekopdracht uitbreiden',
  'workflowLogs.enhancedQuery': 'Zoekopdracht uitgebreid',
  'workflowLogs.initializingImborService': 'IMBOR service initialiseren...',
  'workflowLogs.imborServiceCreated': 'IMBOR service aangemaakt, wachten op vocabulaire laden...',
  'workflowLogs.queryExpansionServiceInitialized': 'Zoekopdracht uitbreidingsservice geïnitialiseerd',
  'workflowLogs.imborLoadWarning': 'IMBOR laadwaarschuwing. Doorgaan in basis modus...',
  'workflowLogs.failedToInitializeServices': 'Initialisatie services mislukt',
  'workflowLogs.scanningIPLODetailed': 'IPLO scannen',
  'workflowLogs.foundDocuments': 'Documenten gevonden',
  'workflowLogs.semanticThemeRouting': 'Semantische themarouting',
  'workflowLogs.selectedThemes': 'Thema\'s geselecteerd via vectoren',
  'workflowLogs.noThemeMatch': 'Geen betrouwbare semantische themamatch',
  'workflowLogs.themeFallback': 'Gebruik gemapt thema als fallback',
  'workflowLogs.startingThemeScraping': 'Themagebaseerd scrapen starten',
  'workflowLogs.completedTheme': 'Thema "{{slug}}" voltooid: {{count}} documenten gevonden (totaal: {{total}})',
  'workflowLogs.errorScrapingTheme': 'Fout bij scrapen thema "{{slug}}": {{error}}. Doorgaan met volgend thema.',
  'workflowLogs.startingSearchScraping': 'Zoekgebaseerd scrapen starten (semantische score onder drempelwaarde {{threshold}}) voor: {{query}}',
  'workflowLogs.skippingIploSearch': 'IPLO HTML-zoekopdracht overslaan omdat semantische themamatch betrouwbaar was.',
  'workflowLogs.failedToAddSemanticSimilarity': 'Toevoegen van semantische gelijkenisscores mislukt: {{error}}. Doorgaan zonder gelijkenisscores.',
  'workflowLogs.crawlTimeout': 'Crawl timeout bereikt ({{seconds}}s). Crawl stoppen op diepte {{depth}}.',
  'workflowLogs.contentChangeDetected': 'Inhoudswijziging gedetecteerd voor document: {{title}} ({{url}})',
  'workflowLogs.totalContentChanges': 'Totaal documenten met inhoudswijzigingen: {{count}}',
  'workflowLogs.crawling': 'Crawlen: {{url}} (Diepte: {{depth}})',
  'workflowLogs.foundDocumentsOn': '{{count}} documenten gevonden op {{url}}',
  'workflowLogs.followingLinks': '{{count}} links volgen vanaf {{url}}',
  'workflowLogs.processingItems': '{{count}} items verwerken...',
  'workflowLogs.exploringItems': '{{count}} items verkennen...',
  'workflowLogs.scanningKnownSources': 'Bekende bronnen scannen (geselecteerde websites)...',
  'workflowLogs.noWebsitesSelected': 'Geen websites geselecteerd voor scraping',
  'workflowLogs.noWebsitesProvided': 'Geen websites opgegeven (geen websiteData noch selectedWebsites)',
  'workflowLogs.noWebsitesToScrape': 'Geen websites om te scrapen',
  'workflowLogs.foundWebsitesToScrape': '{{count}} websites gevonden om te scrapen uit database',
  'workflowLogs.processingWebsites': '{{count}} websites verwerken met canonieke pipeline',
  'workflowLogs.errorScanningKnownSources': 'Fout bij scannen bekende bronnen: {{error}}',
  'workflowLogs.usingEnhancedQuery': 'Uitgebreide zoekopdracht van vorige stap gebruiken: "{{query}}"',
  'workflowLogs.dsoLocationSearching': 'DSO Locatie Zoeken: Zoeken naar omgevingsdocumenten op {{location}} (gebruik canonieke pipeline)',
  'workflowLogs.dsoLocationGeocoded': 'DSO Locatie Zoeken: Gegeocodeerd naar coördinaten ({{x}}, {{y}}) (RD)',
  'workflowLogs.dsoLocationDiscovered': 'DSO Locatie Zoeken: {{count}} records ontdekt via canonieke pipeline',
  'workflowLogs.dsoLocationProcessing': 'DSO Locatie Zoeken: {{count}} documenten verwerken via canonieke pipeline',
  'workflowLogs.dsoLocationSuccess': 'DSO Locatie Zoeken: Succesvol {{count}} documenten verwerkt via canonieke pipeline (opgeslagen in canonical_documents collectie)',
  'workflowLogs.dsoLocationError': 'DSO Locatie Zoeken: FOUT - {{error}}',
  'workflowLogs.dsoLocationWarning': 'DSO Locatie Zoeken: WAARSCHUWING - {{count}} van {{total}} documenten mislukt bij verwerking',
  'workflowLogs.dsoStep1AFailed': 'Stap 1A: Mislukt document {{id}} te verwerken: {{error}}',
  'workflowLogs.dsoStep1AWarning': 'Stap 1A: WAARSCHUWING - {{count}} van {{total}} documenten mislukt bij verwerking',
  'workflowLogs.dsoStep1ASuccess': 'Stap 1A: Succesvol {{count}} DSO documenten verwerkt via canonieke pipeline (opgeslagen in canonical_documents collectie)',
  'workflowLogs.dsoStep1AEmptyQuery': 'Stap 1A: WAARSCHUWING - Lege zoekopdracht (geen onderwerp/thema en geen overheidsinstantie). Dit kan resulteren in geen documenten.',
  'workflowLogs.dsoStep1ANoDocuments': 'Stap 1A: WAARSCHUWING - Geen DSO documenten ontdekt.',
  'workflowLogs.dsoEnrichmentError': 'Fout in DSO verrijking: {{error}}',
  'workflowLogs.iploScanComplete': 'IPLO scan voltooid: {{total}} documenten gevonden over {{subjects}} onderwerpen',
  'workflowLogs.errorProcessingSubject': 'Fout bij verwerken "{{subject}}": {{error}}. Doorgaan met volgend onderwerp.',
  'workflowLogs.hybridRetrievalComplete': 'Hybrid retrieval voltooid: {{scraper}} scraper documenten + {{hybrid}} hybrid resultaten = {{total}} totaal ({{new}} nieuwe documenten)',
  'workflowLogs.hybridRetrievalFailed': 'Hybrid retrieval mislukt: {{error}}. Gebruik alleen scraper resultaten.',
  'workflowLogs.unknownNavigationPattern': 'Onbekend navigatiepatroon aangetroffen: {{error}}. Run gepauzeerd voor beoordeling.',
  'workflowLogs.learningOpportunity': 'Leermogelijkheid: Dit patroon kan worden toegevoegd aan navigatiegrafiek na beoordeling.',
  'workflowLogs.performingInitialWebSearch': 'Initiële webzoekopdracht uitvoeren ({{mode}} modus)...',
  'workflowLogs.devModeExploring': 'Dev modus: IPLO structuur verkennen en navigatiegrafiek opbouwen...',
  'workflowLogs.navigationGraphUpdated': 'Navigatiegrafiek bijgewerkt met nieuwe ontdekkingen',
  'workflowLogs.navigationGraphUpdatedWithPattern': 'Navigatiegrafiek bijgewerkt met geleerd patroon',
  'workflowLogs.prodModeUsingGraph': 'Prod modus: Navigatiegrafiek gebruiken voor gerichte updates...',
  'workflowLogs.hybridModeTargeted': 'Hybrid modus: Gerichte verkenning met productie-efficiëntie...',
  'workflowLogs.hybridModeExploring': 'Hybrid modus: Verkennen binnen {{count}} URL patroon(patronen): {{patterns}}',
  'workflowLogs.analyzingGraphClusters': 'Grafiekclusters analyseren (semantische gelijkenis)...',
  'workflowLogs.semanticClusterMatch': 'Semantische clustermatch: {{summary}}',
  'workflowLogs.noSemanticClusterMatches': 'Geen semantische clustermatches boven drempelwaarde; terugvallen op trefwoordheuristiek.',
  'workflowLogs.startingRecursiveCrawl': 'Recursieve crawl starten met frontier van {{count}} URLs',
  'workflowLogs.depthProcessing': 'Diepte {{depth}}: {{count}} URLs verwerken',
  'workflowLogs.scoringAndFiltering': 'Documenten scoren en filteren...',
  'workflowLogs.scoredDocuments': '{{count}} documenten gescoord (na filtering)',
  'workflowLogs.rerankingDocuments': 'Documenten opnieuw rangschikken met KG-inzichten...',
  'workflowLogs.rerankedDocuments': '{{count}} documenten opnieuw gerangschikt met KG-inzichten',
  'workflowLogs.kgRerankingFailed': 'KG herrangschikking mislukt: {{error}}, originele scores gebruiken',
  'workflowLogs.checkingOrphanedFiles': 'Controleren op weesbestanden in kennisbank...',
  'workflowLogs.noOrphanedFiles': 'Geen weesbestanden gedetecteerd',
  'workflowLogs.errorDetectingOrphanedFiles': 'Fout bij detecteren weesbestanden: {{error}}',
  'workflowLogs.missingTitleFallback': 'Ontbrekende titel voor {{url}}, URL als fallback gebruiken',
  'workflowLogs.skippedUnchanged': 'Overgeslagen ongewijzigd: {{url}} ({{time}}ms)',
  'workflowLogs.nodeUpdated': 'Bijgewerkt: {{url}} ({{time}}ms)',
  'workflowLogs.nodeNew': 'Nieuw: {{url}} ({{time}}ms)',
  'workflowLogs.errorProcessingNode': 'Fout bij verwerken {{url}} [{{type}}]: {{error}}',
  'workflowLogs.hybridModeNoPatterns': 'Hybrid modus: Geen URL-patronen opgegeven, terugvallen op dev modus',
  'workflowLogs.patternMatchedNodes': 'Patroon "{{pattern}}" matchte {{count}} nodes',
  'workflowLogs.usingProductionEfficiency': 'Productie-efficiëntie gebruiken voor {{count}} bekende nodes',
  'workflowLogs.exploringUnknownPages': '{{count}} onbekende pagina\'s verkennen binnen patronen',
  'workflowLogs.explorationError': 'Verkenningsfout: {{error}}',
  'workflowLogs.explorationSuggestion': 'Suggestie: Probeer verkenningsdiepte te verminderen of gebruik meer specifieke URL-patronen',
  'workflowLogs.step3StartingIploScraper': 'Stap 3: IPLO scraper starten...',
  'workflowLogs.step3ScraperReturned': 'Stap 3: Scraper retourneerde {{count}} documenten',
  'workflowLogs.step3InitializingCanonicalPipeline': 'Stap 3: Canonieke pipeline adapter initialiseren...',
  'workflowLogs.step3UsingFixtureDocuments': 'Stap 3: Fixture IPLO documenten gebruiken (FEATURE_E2E_FIXTURES=true)',
  'workflowLogs.step3SearchingIplo': 'Stap 3: IPLO doorzoeken voor: {{query}}',
  'workflowLogs.step3FoundDocuments': 'Stap 3: {{limited}} IPLO documenten gevonden (beperkt van {{total}})',
  'workflowLogs.step3AddedToGraph': 'Stap 3: {{count}} IPLO documenten toegevoegd aan navigatiegrafiek',
  'workflowLogs.step3AddedToGraphWithRelationships': 'Stap 3: {{count}} IPLO documenten toegevoegd aan navigatiegrafiek, {{relationships}} relaties aangemaakt',
  'workflowLogs.step3WarningCouldNotSave': 'Stap 3: WAARSCHUWING - Kon documenten niet opslaan in navigatiegrafiek: {{error}}',
  'workflowLogs.step3ProcessedViaPipeline': 'Stap 3: {{count}} IPLO documenten verwerkt via canonieke pipeline (Query ID: {{queryId}})',
  'workflowLogs.step3ProcessedViaPipelineWithQuery': 'Stap 3: {{count}} IPLO documenten verwerkt via canonieke pipeline en Query document aangemaakt (Query ID: {{queryId}})',
  'workflowLogs.step3ProcessedViaPipelineWarning': 'Stap 3: {{count}} IPLO documenten verwerkt via canonieke pipeline (WAARSCHUWING: Kon Query document niet aanmaken)',
  'workflowLogs.step3ProcessedViaPipelineNoQuery': 'Stap 3: {{count}} IPLO documenten verwerkt via canonieke pipeline (geen Query document aangemaakt - geen queryId of onderwerp opgegeven)',
  'workflowLogs.step3ActionCompleting': 'Stap 3: Actie voltooid, retourneert {{total}} verwerkte documenten ({{canonical}} canoniek, {{original}} origineel)',
  'workflowLogs.step3ActionReturningEmpty': 'Stap 3: Actie retourneert leeg resultaat vanwege fout (workflow zal doorgaan)',
  'workflowLogs.step5UsingFixtureDocuments': 'Stap 5: Fixture Google-zoekdocumenten gebruiken (FEATURE_E2E_FIXTURES=true)',
  'workflowLogs.step5UsingFixtureDocumentsWithQuery': 'Stap 5: Fixture Google-zoekdocumenten gebruiken (Query ID: {{queryId}}) - fixture documenten zijn alleen testdata',
  'workflowLogs.step5UsingFixtureDocumentsNoQuery': 'Stap 5: Fixture Google-zoekdocumenten gebruiken (geen queryId opgegeven) - fixture documenten zijn alleen testdata',
  'workflowLogs.step1AUsingFixtureDocuments': 'Stap 1A: Fixture DSO discovery documenten gebruiken (FEATURE_E2E_FIXTURES=true)',
  'workflowLogs.runStarted': 'Run gestart',
  'workflowLogs.runPaused': 'Run gepauzeerd en status opgeslagen',
  'workflowLogs.workflowAutoResumed': 'Workflow automatisch hervat na review timeout',
  'workflowLogs.parallelStepsCancelled': 'Parallelle stappen geannuleerd voor uitvoering',
  'workflowLogs.startingSourceDiscovery': 'Bronontdekking starten...',
  'workflowLogs.runCancelledRecentlyFailed': 'Run geannuleerd (was recent mislukt)',
  'workflowLogs.runNotFoundError': 'Workflow run niet gevonden',
  'workflowLogs.processedItems': '{{count}} items verwerkt',
  'workflowLogs.processingDocument': 'Verwerken document {{url}}',
  'workflowLogs.processingDocumentOf': 'Verwerken document {{current}}/{{total}}: {{url}}',
  'workflowLogs.processedDocument': 'Document verwerkt: {{title}} (ID: {{id}})',
  'workflowLogs.processingCompleted': 'Verwerking voltooid. {{count}} documenten verwerkt{{errors}}.',
  'workflowLogs.processingCompletedWithErrors': 'Verwerking voltooid. {{count}} documenten verwerkt met {{errors}} fouten.',
  'workflowLogs.documentProcessingComplete': 'Documentverwerking voltooid: {{processed}} opgeslagen, {{failed}} mislukt',
  'workflowLogs.canonicalPipelineComplete': 'Canonical pipeline verwerking voltooid: {{success}} geslaagd, {{failed}} mislukt van {{total}} totaal',
  'workflowLogs.totalDocumentsProcessed': 'Totaal documenten verwerkt via canonical pipeline: {{processed}}/{{total}}',
  'workflowLogs.processingDocumentUrl': 'Verwerken document {{url}}',
  'workflowLogs.hybridRetrievalEnabled': 'Hybrid retrieval ingeschakeld - resultaten verrijken met semantisch zoeken...',
  'workflowLogs.hybridRetrievalFound': 'Hybrid retrieval vond {{count}} extra documenten',
  'workflowLogs.workflowCancelledBeforeStep': 'Workflow geannuleerd voor stapuitvoering',
  'workflowLogs.workflowCancelledAfterStep': 'Workflow geannuleerd na stapuitvoering',
  'workflowLogs.allStepsCompleted': 'Alle workflowstappen succesvol voltooid. Workflow afronden...',
  'workflowLogs.workflowCancelledDuringExecution': 'Workflow geannuleerd tijdens uitvoering (AbortError)',
  'workflowLogs.stepFailed': 'Stap mislukt: {{step}} - {{error}}',
  'workflowLogs.stepExecutionCompleted': 'Stapuitvoering voltooid: {{step}} ({{stepId}}) in {{duration}}ms',
  'workflowLogs.stepExecutionFailed': 'Stapuitvoering mislukt: {{step}} ({{stepId}}) na {{duration}}ms. Fout: {{error}}',
  'workflowLogs.contextAtFailure': 'Context bij fout: {{context}}',
  'workflowLogs.graphInitialized': 'Navigatiegrafiek geïnitialiseerd met {{total}} bestaande nodes ({{iplo}} IPLO, {{external}} extern)',
  'workflowLogs.graphVerified': 'Navigatiegrafiek geverifieerd ({{count}} nodes opgeslagen in Neo4j) [{{duration}}ms]',
  'workflowLogs.graphVerifiedWithNodes': 'Navigatiegrafiek geverifieerd: {{count}} nodes opgeslagen in Neo4j ({{added}})',
  'workflowLogs.semanticTargetingActive': 'Semantische targeting actief voor zoekopdracht: "{{query}}"',
  'workflowLogs.identifiedClusters': '{{count}} relevante clusters geïdentificeerd: {{labels}}',
  'workflowLogs.targetScopeContains': 'Doelbereik bevat {{count}} URLs',
  'workflowLogs.probabilisticExploration': 'Waarschijnlijkheidsverkenning ingeschakeld (Willekeur: {{randomness}})',
  'workflowLogs.targetedExplorationActive': 'Gerichte verkenning actief. Scope grootte: {{size}}',
  'workflowLogs.probabilisticExplorationActive': 'Waarschijnlijkheidsverkenning actief. Willekeur: {{randomness}}',
  'workflowLogs.startingExploration': 'Verkenning van IPLO starten...',
  'workflowLogs.explorationCompleted': 'Verkenning voltooid.',
  'workflowLogs.exploringOutOfScope': 'Buiten-bereik pagina verkennen: {{url}}',
  'workflowLogs.exploring': 'Verkennen: {{url}} (Diepte: {{depth}})',
  'workflowLogs.failedToAddNode': 'Toevoegen node {{url}} aan navigatiegrafiek mislukt: {{error}}',
  'workflowLogs.failedToAddChildNode': 'Toevoegen kindnode {{url}} aan navigatiegrafiek mislukt: {{error}}',
  'workflowLogs.failedToUpdateNode': 'Updaten node {{url}} met kinderen in navigatiegrafiek mislukt: {{error}}',
  'workflowLogs.persistedNode': 'Node {{url}} opgeslagen met {{count}} kinderen in navigatiegrafiek',
  'workflowLogs.extractingEntities': 'Entiteiten extraheren van {{url}}...',
  'workflowLogs.entityExtractionInProgress': 'Entiteiten extraheren van {{url}} (nog bezig...)',
  'workflowLogs.entityExtractionCompleted': 'Entiteiten extractie voltooid voor {{url}} ({{duration}}ms)',
  'workflowLogs.skippingEntityExtraction': 'Entiteiten extractie overgeslagen voor indexpagina {{url}} ({{count}} kinderen)',
  'workflowLogs.exploringChildren': 'Verkennen van {{count}} kinderen van {{url}}...',
  'workflowLogs.childExplorationProgress': 'Kind {{current}}/{{total}} verkennen...',
  'workflowLogs.childExplorationCompleted': 'Verkennen van {{count}} kinderen voltooid voor {{url}} ({{duration}}ms)',
  'workflowLogs.extractedEntities': '{{entities}} entiteiten en {{relationships}} relaties geëxtraheerd van {{url}}',
  'workflowLogs.externalLinkExplorationStarted': 'Externe linkverkenning gestart (max: {{max}})',
  'workflowLogs.externalLinksAdded': 'Externe linkverkenning voltooid. {{added}} externe links toegevoegd ({{total}} totaal) [{{duration}}ms]',
  'workflowLogs.externalLinksNoNew': 'Externe linkverkenning voltooid maar geen nieuwe externe links toegevoegd. {{collected}} links verzameld maar mogelijk al bestaand ({{total}} totaal) [{{duration}}ms]',
  'workflowLogs.externalLinksNoneFound': 'Externe linkverkenning voltooid maar geen externe links gevonden op IPLO-pagina\'s ({{total}} totaal) [{{duration}}ms]',
  'workflowLogs.findingRelevantNodes': 'Relevante nodes zoeken voor zoekopdracht: {{query}}',
  'workflowLogs.foundRelevantNodes': '{{count}} relevante nodes gevonden in bestaand grafiek',
  'workflowLogs.creatingSubgraph': 'Subnetwerk maken van {{count}} relevante nodes',
  'workflowLogs.createdSubgraph': 'Subnetwerk gemaakt met {{count}} nodes',
  'workflowLogs.noRelevantNodes': 'Geen relevante nodes gevonden, starten vanaf root',
  'workflowLogs.startingBFS': 'BFS starten vanaf: {{url}}',
  'workflowLogs.mergeComplete': 'Samenvoeging voltooid! Hoofdgrafiek heeft nu {{nodes}} nodes en {{edges}} edges',
  'workflowLogs.embeddingBackfillStarted': 'Embedding backfill gestart (batchgrootte: {{batchSize}})',
  'workflowLogs.backfillProgress': 'Backfill voortgang: {{processed}}/{{total}} nodes verwerkt',
  'workflowLogs.backfillComplete': 'Backfill voltooid: {{processed}} verwerkt, {{updated}} bijgewerkt, {{errors}} fouten',
  'workflowLogs.graphSavedAfterExpansion': 'Navigatiegrafiek opgeslagen: {{total}} totaal nodes na uitbreiding ({{iplo}} IPLO, {{external}} extern)',
  'workflowLogs.graphSaveFailed': 'Navigatiegrafiek opslaan mislukt: {{error}}',
  'workflowLogs.startNodeNotFound': 'Startnode niet gevonden: {{url}}',
  'workflowLogs.expandingFromNode': 'Uitbreiden vanaf subnetwerknode: {{title}}',
  'workflowLogs.errorExpanding': 'Fout bij uitbreiden vanaf {{url}}: {{error}}',
  'workflowLogs.exploringWebsites': '{{count}} ontdekte websites verkennen',
  'workflowLogs.addedWebsitesToGraph': '{{count}} websites toegevoegd aan grafiek',
  'workflowLogs.graphSavedAfterWebsites': 'Navigatiegrafiek opgeslagen: {{total}} totaal nodes na verkennen websites',
  'workflowLogs.semanticAnalysisPending': 'TODO: Semantische analyse voor "{{topic}}" onderwerp is in afwachting',
  'workflowLogs.startingHorstScrape': 'Horst aan de Maas gemeente scrape starten voor onderwerp: {{topic}}',
  'workflowLogs.foundHorstDocuments': '{{count}} documenten gevonden van Horst aan de Maas gemeente',
  'workflowLogs.graphSavedAfterHorst': 'Navigatiegrafiek opgeslagen: {{total}} totaal nodes na toevoegen Horst documenten',
  'workflowLogs.scanningKnownSourcesDetailed': 'Bekende bronnen scannen (geselecteerde websites)...',
  'workflowLogs.foundDocumentsFromWebsite': '{{count}} document-URLs ontdekt van {{url}}',
  'workflowLogs.noDocumentsFromWebsite': 'Geen document-URLs ontdekt van {{url}}',
  'workflowLogs.startingScanIploAction': 'scan_iplo_known_subjects actie starten',
  'workflowLogs.populatingKnowledgeGraph': 'Kennisgrafiek vullen vanuit {{count}} IPLO documenten...',
  'workflowLogs.knowledgeGraphPopulated': 'Kennisgrafiek gevuld met entiteiten uit {{count}} documenten',
  'workflowLogs.knowledgeGraphWarning': 'Waarschuwing: Kennisgrafiek kon niet worden gevuld: {{error}}',
  'workflowLogs.kgPopulatedSummary': 'Kennisgrafiek gevuld: {{entities}} entiteiten, {{relationships}} relaties, {{facts}} feiten, {{jurisdictions}} rechtsgebieden',
  'workflowLogs.kgPopulatedWithFiltering': 'Kennisgrafiek gevuld: {{entities}} entiteiten, {{relationships}} relaties, {{facts}} feiten, {{jurisdictions}} rechtsgebieden (gefilterd: {{filteredEntities}} entiteiten, {{filteredRelationships}} relaties)',
  'workflowLogs.kgPopulatedWithPerformance': 'Kennisgrafiek gevuld: {{entities}} entiteiten, {{relationships}} relaties, {{facts}} feiten, {{jurisdictions}} rechtsgebieden ({{time}}s totaal{{perfDetails}})',
  'workflowLogs.kgPopulatedWithFilteringAndPerformance': 'Kennisgrafiek gevuld: {{entities}} entiteiten, {{relationships}} relaties, {{facts}} feiten, {{jurisdictions}} rechtsgebieden (gefilterd: {{filteredEntities}} entiteiten, {{filteredRelationships}} relaties) ({{time}}s totaal{{perfDetails}})',
  'workflowLogs.kgValidationErrors': 'Kennisgrafiek validatie vond {{count}} fouten: {{messages}}',
  'workflowLogs.kgValidationWarnings': 'Kennisgrafiek validatie vond {{count}} waarschuwingen: {{messages}}',
  'workflowLogs.kgValidationPassed': 'Kennisgrafiek validatie geslaagd zonder problemen',
  'workflowLogs.kgEntitiesAddedToBranch': 'branch: Entiteiten toegevoegd aan \'{{branch}}\' branch.',
  'workflowLogs.kgEntitiesAddedToBranchNote': 'Let op: Query\'s moeten mogelijk deze branch controleren als main leeg is.',
  'workflowLogs.kgEntitiesAddedToPendingChanges': '{{count}} entiteiten toegevoegd aan \'pending-changes\' branch. Om ze zichtbaar te maken in \'main\' branch, ofwel: (1) Stel KG_AUTO_MERGE_TO_MAIN=true in voor automatische merge, of (2) Merge handmatig via API: POST /api/knowledge-graph/versioning/branch/merge',
  'workflowLogs.entityValidationFailed': 'Entiteit validatie mislukt: {{errors}}',
  'workflowLogs.entityValidationWarnings': 'Entiteit validatie waarschuwingen: {{warnings}}',
  'workflowLogs.relationshipValidationFailed': 'Relatie validatie mislukt: {{errors}}',
  'workflowLogs.relationshipValidationWarnings': 'Relatie validatie waarschuwingen: {{warnings}}',
  'workflowLogs.factValidationIssues': 'Feit validatie problemen: {{issue}} (vertrouwen: {{confidence}}%)',
  'workflowLogs.factValidationIssueWithConfidence': '{{issue}} (vertrouwen: {{confidence}}%)',
  'workflowLogs.consistencyViolation': 'Consistentie schending: {{description}}',
  'workflowLogs.selfLoopDetected': 'Zelflus relatie gedetecteerd',
  'workflowLogs.targetEntityNotFound': 'Doelentiteit {{id}} niet gevonden',
  'workflowLogs.sourceEntityNotFound': 'Bronentiteit {{id}} niet gevonden',
  'workflowLogs.sourceDocumentNotFound': 'Brongocument niet gevonden',
  'workflowLogs.relationshipNotSupportedBySource': 'Relatie wordt mogelijk niet ondersteund door brongocument: doelentiteit "{{name}}" niet gevonden in brontekst',
  'workflowLogs.selfLoopsNotAllowed': 'Zelflussen niet toegestaan voor dit relatietype',
  'workflowLogs.invalidRelationship': 'Ongeldige relatie: {{type}} van {{sourceType}} naar {{targetType}}',
  'workflowLogs.startingIploScan': 'IPLO scan starten',
  'workflowLogs.processingSubjectDetailed': 'Onderwerp verwerken',
  'workflowLogs.enhancingQueryDetailed': 'Zoekopdracht uitbreiden',
  'workflowLogs.dsoStep1Configured': 'Stap 1: DSO API is geconfigureerd en beschikbaar',
  'workflowLogs.dsoStep2Configured': 'Stap 2: DSO API is geconfigureerd en beschikbaar (standalone modus)',
  'workflowLogs.parameterValidationFailed': 'Parameter validatie mislukt: {{error}}',
  'workflowLogs.discoveredDocumentUrls': '{{count}} document-URLs ontdekt van {{url}}',
  'workflowLogs.noDocumentUrlsDiscovered': 'Geen document-URLs ontdekt van {{url}}',
  'workflowLogs.couldNotPopulateKnowledgeGraph': 'Waarschuwing: Kennisgrafiek kon niet worden gevuld: {{error}}',
  'workflowLogs.failedToSaveNavigationGraph': 'Navigatiegrafiek opslaan mislukt: {{error}}',
  'workflowLogs.navigationGraphSaved': 'Navigatiegrafiek opgeslagen: {{total}} totaal nodes na {{action}}',
  'workflowLogs.usingArbeidsmigrantenScraper': 'Gespecialiseerde Arbeidsmigranten scraper gebruiken',
  'workflowLogs.usingEnergietransitieScraper': 'Gespecialiseerde Energietransitie scraper gebruiken',
  'workflowLogs.usingBaseHorstScraper': 'Basis Horst aan de Maas scraper gebruiken',
  'workflowLogs.populatingKnowledgeGraphFromGoogle': 'Kennisgrafiek vullen vanuit {{count}} Google zoekresultaten...',
  'workflowLogs.knowledgeGraphPopulatedFromGoogle': 'Kennisgrafiek gevuld met entiteiten uit {{count}} Google zoekresultaten',
  'workflowLogs.processingDocumentsThroughPipeline': 'Verwerken van {{count}} documenten via canonical pipeline',
  'workflowLogs.failedToProcess': 'Verwerken mislukt: {{url}} - {{error}}',
  'workflowLogs.failedToProcessWebsite': 'Verwerken website mislukt: {{url}} - {{error}}',
  'workflowLogs.stepProcessedDocuments': 'Stap {{step}}: {{count}} documenten verwerkt via canonical pipeline (Query ID: {{queryId}})',
  'workflowLogs.stepProcessedDocumentsWithQuery': 'Stap {{step}}: {{count}} documenten verwerkt via canonical pipeline en Query document aangemaakt (Query ID: {{queryId}})',
  'workflowLogs.stepProcessedDocumentsCreatedQuery': 'Stap {{step}}: {{count}} documenten verwerkt via canonical pipeline en Query aangemaakt (Query ID: {{queryId}})',
  'workflowLogs.stepProcessedDocumentsWarning': 'Stap {{step}}: {{count}} documenten verwerkt via canonical pipeline (WAARSCHUWING: Kon Query document niet aanmaken)',
  'workflowLogs.stepProcessedDocumentsNoQuery': 'Stap {{step}}: {{count}} documenten verwerkt via canonical pipeline (geen Query document aangemaakt - geen queryId of onderwerp opgegeven)',
  'workflowLogs.stepErrorInDSO': 'Stap {{step}}: FOUT in DSO {{service}}: {{error}}',
  'workflowLogs.dsoLocationSearchError': 'DSO Locatie Zoeken: FOUT - {{error}}',
  'workflowLogs.schemaValidationFailed': 'Schema validatie mislukt voor {{action}}: {{error}}',
  'workflowLogs.securityValidationFailed': 'Beveiligingsvalidatie mislukt voor {{action}}: {{error}}',
  'workflowLogs.normalizingDocuments': 'Documenten normaliseren...',
  'workflowLogs.deduplicatingDocuments': 'Documenten dedupliceren...',
  'workflowLogs.normalizedDocuments': '{{count}} documenten genormaliseerd',
  'workflowLogs.deduplicatedDocuments': '{{count}} unieke documenten overgebleven na deduplicatie ({{removed}} duplicaten verwijderd)',
  'workflowLogs.duplicateGroupsFound': '{{count}} groepen met duplicaten gevonden',
  'workflowLogs.noCoreDocuments': 'Geen kern documenten gevonden om te normaliseren en dedupliceren',
  'workflowLogs.startingNormalizeDeduplicate': 'Normaliseren + dedupliceren kern documenten starten...',
  'workflowLogs.parallelStepFailed': 'Parallelle stap {{stepId}} mislukt: {{error}}',
  'workflowLogs.parallelStepRejected': 'Parallelle stap {{stepId}} afgewezen: {{error}}',
  'workflowLogs.allParallelStepsCompleted': 'Alle {{count}} parallelle stappen succesvol voltooid',
  'workflowLogs.parallelExecutionCompletedWithTimeouts': 'Parallelle uitvoering voltooid: {{success}} geslaagd, {{timeouts}} timeouts, {{failed}} mislukt van {{total}} stappen. Timeouts: {{details}}',
  'workflowLogs.parallelExecutionCompletedWithErrors': 'Parallelle uitvoering voltooid: {{success}} geslaagd, {{failed}} mislukt van {{total}} stappen',
  'workflowLogs.stepCompleted': 'Stap voltooid: {{step}}',
  'workflowLogs.dsoEnrichmentCompleted': 'Ik heb {{count}} documenten verrijkt met volledige tekst, {{rules}} regels, {{activities}} activiteiten en {{areas}} regelingsgebieden. Dit maakt gestructureerde zoekopdrachten en betere documentanalyse mogelijk.',
  'workflowLogs.stepFailedInTransaction': 'Stap {{step}} mislukt in transactie: {{error}}',
  'workflowLogs.startingBfsExploration': 'BFS verkenning starten 3 hops diep vanaf {{url}} (onderwerp: {{topic}})',
  'workflowLogs.bfsStartingFrom': 'BFS: Starten vanaf {{url}} (maxDiepte: {{maxDepth}}, onderwerp: {{topic}})',
  'workflowLogs.errorExploring': 'Fout bij verkennen {{url}}: {{error}}',
  'workflowLogs.bfsExplorationCompleted': 'BFS verkenning voltooid. {{visited}} nodes bezocht, wachtrij had {{remaining}} resterend.',
  'workflowLogs.startingBfsFromUrls': 'BFS starten vanaf {{count}} start-URLs (max diepte: {{maxDepth}})',
  'workflowLogs.bfsCrawlCompleted': 'BFS crawl voltooid. {{count}} URLs ontdekt',
  'workflowLogs.noClustersFoundEmpty': 'Geen clusters gevonden: Navigatiegrafiek is leeg. IPLO eerst verkennen om grafiek op te bouwen. Volledige verkenning starten...',
  'workflowLogs.noClustersFoundThreshold': 'Geen clusters gevonden: Grafiek heeft {{count}} nodes maar geen clusters voldoen aan minimum grootte drempel. Volledige verkenning starten...',
  'workflowLogs.noClustersFoundMatching': 'Geen clusters gevonden die overeenkomen met zoekopdracht "{{query}}". Grafiek heeft {{clusters}} clusters maar geen match. Volledige verkenning starten...',
  'workflowLogs.startingExternalLinkExploration': 'Externe linkverkenning starten (max: {{max}})',
  'workflowLogs.externalLinkExplorationCompleted': 'Externe linkverkenning voltooid. {{added}} externe links toegevoegd ({{total}} totaal) [{{duration}}ms]',
  'workflowLogs.externalLinkExplorationCompletedWithCount': 'Externe linkverkenning voltooid. {{count}} externe links verwerkt.',
  'workflowLogs.externalLinkExplorationNoNew': 'Externe linkverkenning voltooid maar geen nieuwe externe links toegevoegd. {{collected}} links verzameld maar mogelijk al bestaand ({{total}} totaal) [{{duration}}ms]',
  'workflowLogs.externalLinkExplorationNoneFound': 'Externe linkverkenning voltooid maar geen externe links gevonden op IPLO-pagina\'s ({{total}} totaal) [{{duration}}ms]',
  'workflowLogs.startingExpansionFromRelevantNodes': 'Uitbreiding starten vanaf relevante nodes...',
  'workflowLogs.findingStartingNodeForBfs': 'Startnode zoeken voor BFS...',
  'workflowLogs.startingBfsFrom': 'BFS starten vanaf: {{url}}',
  'workflowLogs.startingEmbeddingBackfill': 'Embedding backfill starten (batchgrootte: {{batchSize}})',
  'workflowLogs.errorExpandingFrom': 'Fout bij uitbreiden vanaf {{url}}: {{error}}',
  'workflowLogs.expansionComplete': 'Uitbreiding voltooid! {{count}} nieuwe nodes toegevoegd verbonden met subnetwerk',
  'workflowLogs.startingModuleExecution': 'Start {{name}} uitvoering...',
  'workflowLogs.errorInModule': 'Fout in {{name}}: {{error}}',
  'workflowLogs.probabilisticExplorationEnabled': 'Waarschijnlijkheidsverkenning ingeschakeld (Willekeur: {{randomness}})',
  'workflowLogs.navigationGraphVerified': 'Navigatiegrafiek geverifieerd: {{count}} nodes opgeslagen in Neo4j{{added}}',
  'workflowLogs.navigationGraphInitialized': 'Navigatiegrafiek geïnitialiseerd met {{total}} bestaande nodes ({{iplo}} IPLO, {{external}} extern)',
  'workflowLogs.findingRelevantNodesForQuery': 'Relevante nodes zoeken voor zoekopdracht: {{query}}',
  'workflowLogs.creatingSubgraphFrom': 'Subnetwerk maken van {{count}} relevante nodes',
  'workflowLogs.createdSubgraphWith': 'Subnetwerk gemaakt met {{count}} nodes',
  'workflowLogs.showingRelevantSubgraph': 'Relevante subnetwerk tonen vanuit bestaande navigatiegrafiek...',
  'workflowLogs.visuallyExpandingFrom': '🎨 Visueel uitbreiden vanaf {{count}} relevante nodes in subnetwerk...',
  'workflowLogs.expandingOutwardFrom': 'Uitbreiden vanaf subnetwerknode: {{title}}',
  'workflowLogs.navigationGraphSavedAfterExpansion': 'Navigatiegrafiek opgeslagen: {{total}} totaal nodes na uitbreiding ({{iplo}} IPLO, {{external}} extern)',
  'workflowLogs.bfsAddedUrlsToQueue': 'BFS: {{count}} nieuwe URLs toegevoegd aan wachtrij (diepte {{depth}}, wachtrij grootte: {{queueSize}}){{externalDomains}}',
  'workflowLogs.bfsAddedUrlsFromGraph': 'BFS: {{count}} URLs toegevoegd vanuit bestaande grafiekdata (diepte {{depth}}, {{filtered}} gefilterd onder drempel, gesorteerd op relevantie)',
  'workflowLogs.navigationGraphSavedAfterBfs': 'Navigatiegrafiek opgeslagen: {{total}} totaal nodes na BFS verkenning ({{iplo}} IPLO, {{external}} extern)',
  'workflowLogs.noIploClustersFoundEmpty': 'Geen IPLO clusters gevonden: Navigatiegrafiek is leeg. Andere bronnen gebruiken (Horst, Google) voor BFS crawl.',
  'workflowLogs.noIploClustersFoundThreshold': 'Geen IPLO clusters gevonden: Grafiek heeft {{count}} nodes maar geen clusters voldoen aan minimum grootte drempel. Andere bronnen gebruiken voor BFS crawl.',
  'workflowLogs.noIploClustersFoundMatching': 'Geen IPLO clusters gevonden die overeenkomen met "{{query}}". Grafiek heeft {{clusters}} clusters maar geen match. Andere bronnen gebruiken voor BFS crawl.',
  'workflowLogs.populatingKnowledgeGraphFromDso': 'Kennisgrafiek vullen vanuit {{count}} DSO locatie documenten...',
  'workflowLogs.knowledgeGraphPopulatedFromDso': 'Kennisgrafiek gevuld met entiteiten uit {{count}} DSO locatie documenten',
  'workflowLogs.totalCoreDocumentsCollected': 'Totaal kern documenten verzameld: {{count}}',
  'workflowLogs.noCoreDocumentsFound': 'Geen kern documenten gevonden om te normaliseren en dedupliceren',
  'workflowLogs.diagnosticRawDocumentsBySourceKeys': '[Diagnostiek] Beschikbare keys in rawDocumentsBySource: {{keys}}',
  'workflowLogs.diagnosticRawDocumentsBySourceEmpty': '[Diagnostiek] rawDocumentsBySource is leeg of niet aanwezig',
  'workflowLogs.diagnosticDocumentCountsBySource': '[Diagnostiek] Document aantallen per bron: {{counts}}',
  'workflowLogs.errorInNormalizeDeduplicate': 'Fout in normalize_deduplicate_core: {{error}}',
  'workflowLogs.startingFinalDocumentSaveVerification': 'Starten met laatste document opslag verificatie...',
  'workflowLogs.failedToAddExternalLink': 'Externe link {{url}} toevoegen aan navigatiegrafiek mislukt: {{error}}',
  'workflowLogs.failedToUpdateIploNode': 'IPLO node {{url}} updaten met externe links mislukt: {{error}}',
  'workflowLogs.exploringDiscoveredWebsites': '{{count}} ontdekte websites verkennen',
  'workflowLogs.entitiesExtractedFromUrl': '{{entities}} entiteiten en {{relationships}} relaties geëxtraheerd van {{url}}',
  'workflowLogs.entityExtractionFailed': 'Entiteit extractie mislukt voor {{url}}: {{error}}',
  'workflowLogs.startingBfsCrawlFromMultipleSources': 'BFS crawl starten vanaf {{horst}} Horst URLs, {{google}} Google URLs, en IPLO nodes',
  'workflowLogs.foundRelevantIploUrls': '{{count}} relevante IPLO URLs gevonden van {{clusters}} clusters voor BFS crawl',
  'workflowLogs.bfsProgress': 'BFS voortgang: {{count}} URLs ontdekt',
  'workflowLogs.identifiedRelevantClusters': '{{count}} relevante clusters geïdentificeerd: {{labels}}',
  'workflowLogs.navigationGraphSavedWithDetails': 'Navigatiegrafiek opgeslagen: {{count}} nodes opgeslagen ({{iplo}} IPLO, {{external}} extern, {{edges}} edges) [{{duration}}ms]',
  'workflowLogs.queryEmbeddingGenerated': 'Query embedding gegenereerd ({{dimensions}} dimensies){{cached}}',
  'workflowLogs.queryExpanded': 'Query uitgebreid: "{{original}}" → "{{expanded}}"',
  'workflowLogs.queryEmbeddingGenerationFailed': 'Query embedding generatie mislukt: {{error}}. Originele query gebruiken.',
  'workflowLogs.hybridRetrievalFoundDocuments': 'Hybrid retrieval vond {{count}} aanvullende documenten',
  'workflowLogs.normalizeDeduplicateCompleted': 'Normaliseren + dedupliceren kern voltooid: {{count}} documenten klaar voor samenvoegen',
  'workflowLogs.updatedDocumentsInLibrary': '{{count}} documenten bijgewerkt in bibliotheek met scores en categorieën',
  'workflowLogs.couldNotPersistScores': 'Waarschuwing: Kon scores en categorieën niet opslaan: {{error}}',
  'workflowLogs.noQueryIdProvided': 'Geen queryId opgegeven. Documenten mogelijk niet correct gekoppeld aan query.',
  'workflowLogs.foundUniqueDocumentUrls': '{{count}} unieke document-URLs gevonden in alle bronnen',
  'workflowLogs.verifyingDocuments': 'Verifiëren van {{count}} documenten zijn opgeslagen met juiste metadata...',
  'workflowLogs.documentVerificationComplete': 'Document verificatie voltooid: {{verified}} geverifieerd, {{updated}} metadata bijgewerkt, {{notFound}} niet gevonden (mogelijk in uitvoering)',
  'workflowLogs.skippingDocumentVerification': 'Document verificatie overslaan (geen queryId of geen documenten gevonden)',
  'workflowLogs.errorInSaveAllWorkflowDocuments': 'Fout in save_all_workflow_documents: {{error}}',
  'workflowLogs.navigationGraphSavedWithDsoDocuments': 'Navigatiegrafiek opgeslagen: {{total}} totaal nodes na toevoegen van {{added}} DSO locatie documenten',
  'workflowLogs.processingDiscoveredUrls': 'Verwerken van {{count}} ontdekte URLs via canonical pipeline',
  'workflowLogs.failedToProcessUrl': 'Verwerken van {{url}} mislukt: {{error}}',
  'workflowLogs.allDocumentsFailedProcessing': 'Waarschuwing: Alle documenten mislukt canonical verwerking. Geen documenten om terug te geven.',
  'workflowLogs.documentPersistenceFailed': 'Document {{url}} persistentie mislukt: {{error}}',
  'workflowLogs.documentsPersisted': '{{count}} van {{total}} documenten opgeslagen',
  'workflowLogs.couldNotAddToGraph': 'Kon niet toevoegen aan grafiek: {{error}}',
  'workflowLogs.scanIploKnownSubjectsFailed': 'scan_iplo_known_subjects actie mislukt: {{error}}',
  'workflowLogs.errorSearchingIplo': 'Fout bij zoeken in IPLO: {{error}}',
  'workflowLogs.errorInMergeScoreCategorize': 'Fout in merge_score_categorize: {{error}}',
  'workflowLogs.errorSearchingOfficieleBekendmakingen': 'Fout bij zoeken in officielebekendmakingen: {{error}}',
  'workflowLogs.errorSearchingRechtspraak': 'Fout bij zoeken in rechtspraak: {{error}}',
  'workflowLogs.dsoLocationSearchSearching': 'DSO Locatie Zoeken: Zoeken naar omgevingsdocumenten op {{location}} (gebruik canonical pipeline)',
  'workflowLogs.stepStarting': 'Stap {{stepNumber}}: {{stepName}} - {{purpose}}. We gaan nu {{action}} uitvoeren.',
  'workflowLogs.stepStartingNoNumber': '{{stepName}} - {{purpose}}. We gaan nu {{action}} uitvoeren.',
  'workflowLogs.dsoGeometrySearchSearching': 'Zoeken naar documenten met geometrie ({{geometryType}}) voor {{bevoegdgezagCode}}',
  'workflowLogs.dsoGeometrySearchFound': '{{count}} documenten gevonden voor {{bevoegdgezagCode}} ({{total}} totaal voor filtering)',
  'workflowLogs.dsoGeometrySearchError': 'Fout bij ophalen documenten met geometrie: {{error}}',
  'workflowLogs.dsoGeometrySearchFailedToFetch': 'Mislukt documenten op te halen voor {{bevoegdgezagCode}}',
  'workflowLogs.step3ErrorDiagnostic': 'Stap 3: Foutdiagnose informatie: {{diagnostic}}',
  'workflowLogs.step3ErrorStackTrace': 'Stap 3: Fout stack trace: {{stack}}',
  'workflowLogs.step4ErrorDiagnostic': 'Stap 4: Foutdiagnose informatie: {{diagnostic}}',
  'workflowLogs.step4ErrorStackTrace': 'Stap 4: Fout stack trace: {{stack}}',
  'workflowLogs.step7ErrorDiagnostic': 'Stap 7: Foutdiagnose informatie: {{diagnostic}}',
  'workflowLogs.step7ErrorStackTrace': 'Stap 7: Fout stack trace: {{stack}}',
  'workflowLogs.step1ADocumentNotAvailable': 'Stap 1A: Document {{identificatie}} niet beschikbaar voor download (alleen metadata opgeslagen): {{error}}',
  'workflowLogs.step1AErrorAcquiringZip': 'Stap 1A: FOUT bij ophalen ZIP voor {{identificatie}}: {{error}}',
  'workflowLogs.step1AEmptySearchQuery': 'Stap 1A: WAARSCHUWING - Lege zoekopdracht (geen onderwerp/thema en geen overheidsinstantie). Dit kan resulteren in geen documenten.',
  'workflowLogs.step1AErrorInDsoDiscovery': 'Stap 1A: FOUT in DSO discovery: {{error}}',
  'workflowLogs.step1ANoDocumentsDiscovered': 'Stap 1A: WAARSCHUWING - Geen DSO documenten ontdekt. Diagnostische informatie: {{diagnostic}}',
  'workflowLogs.step1AErrorExtractingZip': 'Stap 1A: FOUT bij extraheren ZIP voor {{identificatie}}: {{error}}',
  'workflowLogs.step1AErrorPersistingDocument': 'Stap 1A: FOUT bij opslaan document {{identificatie}}: {{error}}',
  'workflowLogs.step1ADocumentNoQueryId': 'Stap 1A: WAARSCHUWING - Document {{identificatie}} heeft geen queryId in workflow context (opgeslagen: "{{persistedQueryId}}")',
  'workflowLogs.step1ADocumentQueryIdMismatch': 'Stap 1A: WAARSCHUWING - Document {{identificatie}} queryId komt niet overeen: verwacht "{{expected}}", kreeg "{{got}}"',
  'workflowLogs.step1ADocumentsFailedProcessing': 'Stap 1A: WAARSCHUWING - {{failedCount}} van {{totalCount}} documenten mislukt verwerking',
  'workflowLogs.step1APersistenceMismatch': 'Stap 1A: WAARSCHUWING - Persistentie komt niet overeen: {{successfulCount}} gerapporteerd succesvol, maar {{persistedCount}} gevonden in database',
  'workflowLogs.step1ACouldNotVerifyPersistence': 'Stap 1A: WAARSCHUWING - Kon document persistentie niet verifiëren: {{error}}',
  'workflowLogs.step1AErrorInDsoOntsluitenDiscovery': 'Stap 1A: FOUT in DSO Ontsluiten discovery: {{error}}',
  'workflowLogs.step1AFailedToProcessDocument': 'Stap 1A: Verwerken van document {{identificatie}} mislukt: {{error}}',
  'workflowLogs.step1BAllDocumentsInvalid': 'Stap 1B: FOUT - Alle discovery documenten zijn ongeldig. Validatiefouten: {{errors}}',
  'workflowLogs.step1BSomeDocumentsInvalid': 'Stap 1B: WAARSCHUWING - {{invalidCount}} van {{totalCount}} discovery documenten zijn ongeldig en worden overgeslagen. Doorgaan met {{validCount}} geldige documenten.',
  'workflowLogs.step1BRunningStandalone': 'Stap 1B: Uitvoeren in standalone modus met {{count}} opgegeven DSO discovery documenten',
  'workflowLogs.step1BCheckingEligibility': 'Stap 1B: Controleren DSO verrijking geschiktheid - ontdekte documenten: {{count}} (van {{source}}), enableEnrichment: {{enabled}}',
  'workflowLogs.step1BUsingProvidedDocuments': 'Stap 1B: Gebruik opgegeven documenten voor standalone uitvoering ({{count}} documenten)',
  'workflowLogs.step1BEnrichingTopK': 'Stap 1B: Verrijken top-K DSO documenten ({{count}} ontdekt)',
  'workflowLogs.step1BInvalidDocument': 'Stap 1B: Ongeldig discovery document op index {{index}}: {{error}}',
  'workflowLogs.step1BProcessingDocuments': 'Stap 1B: Verwerken top-{{count}} documenten via canonical pipeline (verrijking is nu onderdeel van acquire → extract → map pipeline)',
  'workflowLogs.step1BDocumentsFailed': 'Stap 1B: WAARSCHUWING - {{failed}} van {{total}} documenten mislukt verwerking',
  'workflowLogs.step1BSuccessfullyProcessed': 'Stap 1B: Succesvol {{count}} documenten verwerkt via canonical pipeline (opgeslagen in canonical_documents collectie)',
  'workflowLogs.step1BSkippingEnrichment': 'DSO verrijking overslaan ({{reason}}). Diagnostische info: {{diagnostic}}. Controleer Stap 1A logs voor discovery details.',
  'workflowLogs.dsoLocationSearchDiscovered': 'DSO Locatie Zoeken: {{count}} records ontdekt via canonical pipeline',
  'workflowLogs.dsoLocationSearchLimited': 'DSO Locatie Zoeken: Resultaten beperkt van {{from}} naar {{to}} documenten',
  'workflowLogs.dsoLocationSearchProcessing': 'DSO Locatie Zoeken: Verwerken van {{count}} documenten via canonical pipeline',
  'workflowLogs.dsoLocationSearchFailedToProcess': 'DSO Locatie Zoeken: Verwerken van document {{documentId}} mislukt: {{error}}',
  'workflowLogs.dsoLocationSearchWarningFailed': 'DSO Locatie Zoeken: WAARSCHUWING - {{failed}} van {{total}} documenten mislukt verwerking',
  'workflowLogs.dsoLocationSearchSuccessfullyProcessed': 'DSO Locatie Zoeken: Succesvol {{count}} documenten verwerkt via canonical pipeline (opgeslagen in canonical_documents collectie)',
  'workflowLogs.dsoLocationSearchSuccessFoundBoth': 'DSO Locatie Zoeken: SUCCES - Beide Omgevingsvisie en Omgevingsplan gevonden',
  'workflowLogs.dsoLocationSearchWarningMissing': 'DSO Locatie Zoeken: WAARSCHUWING - Ontbrekende verwachte documenten: {{missing}}',
  'workflowLogs.dsoLocationSearchErrorDiagnostic': 'DSO Locatie Zoeken: Fout diagnostiek: {{diagnostic}}',
  'workflowLogs.dsoLocationSearchStackTrace': 'DSO Locatie Zoeken: Stack trace: {{trace}}',
  'workflowLogs.stepMarkedAsCompleted': 'Stap {{stepId}} gemarkeerd als voltooid',
  'workflowLogs.executingStepWithRetry': 'Stap {{stepName}} uitvoeren met retry (maxAttempts: {{maxAttempts}}){{circuitBreaker}}',
  'workflowLogs.fetchingDsoDocumentsByGeometry': 'DSO documenten ophalen op basis van geometrie voor bevoegd gezag: {{bevoegdgezagCode}} (exhaustive pagination)',
  'workflowLogs.geometryRetrieved': 'Geometrie opgehaald van {{source}} voor {{bevoegdgezagCode}} ({{bestuurslaag}})',
  'workflowLogs.retrievingGeometry': 'Geometrie ophalen voor bevoegd gezag: {{bevoegdgezagCode}}{{forceRefresh}}',
  'workflowLogs.foundEnrichedDsoDocuments': '{{count}} verrijkte DSO documenten gevonden',
  'workflowLogs.foundDsoDiscoveryDocuments': '{{count}} documenten gevonden van DSO Discovery',
  'workflowLogs.foundDsoGeometryDocuments': '{{count}} documenten gevonden van DSO Geometrie Zoekopdracht',
  'workflowLogs.foundIploDocuments': '{{count}} documenten gevonden van IPLO',
  'workflowLogs.foundKnownSourcesDocuments': '{{count}} documenten gevonden van Bekende Bronnen',
  'workflowLogs.updatingDocumentsWithScores': '{{count}} documenten bijwerken met scores en categorieën in bibliotheek...',
  'workflowLogs.errorScrapingIplo': 'Fout bij scrapen IPLO: {{error}}',
  'workflowLogs.errorExploringUrl': 'Fout bij verkennen {{url}}: {{error}}',
  'workflowLogs.stackTrace': 'Stack trace: {{trace}}',
  'workflowLogs.crawlingUrl': 'Crawlen: {{url}} (Diepte: {{depth}})',
  'workflowLogs.foundDocumentsOnUrl': '{{count}} documenten gevonden op {{url}}',
  'workflowLogs.followingLinksFromUrl': '{{count}} links volgen van {{url}}',
  'workflowLogs.errorCrawlingUrl': 'Fout bij crawlen {{url}}: {{error}}',
  'workflowLogs.searchingIplo': 'IPLO doorzoeken: {{url}}',
  'workflowLogs.errorScrapingIploSearch': 'Fout bij scrapen IPLO zoekopdracht: {{error}}',
  'workflowLogs.foundRelevantNodesInGraph': '{{count}} relevante nodes gevonden in bestaande grafiek',
  'workflowLogs.bfsExploringUrl': 'BFS: Verkennen {{url}} (Diepte: {{depth}})',
  'workflowLogs.bfsExtractedLinks': 'BFS: {{extracted}} links geëxtraheerd van {{url}}, {{filtered}} gefilterd onder relevantiedrempel ({{threshold}}), {{kept}} relevante links behouden (domeinen: {{domains}}). Top links: {{topLinks}}',
  'workflowLogs.fetchFailed': '{{prefix}}: {{url}} ({{message}})',
  'workflowLogs.findingsFound': '{{count}} {{type}} gevonden',
  'workflowLogs.findingsSummary': '{{count}} {{type}} gevonden (voorbeeld: {{examples}})',
  'workflowLogs.geographicFilterApplied': 'Geografisch filter toegepast: {{before}} → {{after}} documenten voor {{overheidsinstantie}}',
  'workflowLogs.geographicFilterRemovedAll': 'Geografisch filter heeft alle {{count}} documenten verwijderd. Dit kan betekenen dat het filter te streng is voor IPLO algemene documenten.',
  'workflowLogs.geographicFilterRemovedPercentage': 'Geografisch filter heeft {{percentage}}% van de documenten verwijderd. Dit kan betekenen dat het filter te streng is voor IPLO algemene documenten.',
  'workflowLogs.iploTotal': '{{count}} IPLO documenten gevonden{{geographicFilter}}',
  'workflowLogs.progressUpdate': '{{completed}} voltooid. Volgende stap: {{next}}',
  'workflowLogs.removedDuplicates': 'Duplicaten verwijderd: {{total}} → {{unique}} unieke documenten',
  'workflowLogs.semanticSimilarityScoresAdded': 'Vergelijkbare documenten gevonden',
  'workflowLogs.step5RunningStandalone': 'Stap 5: Uitvoeren in standalone modus met mock/geleverde data',
  'workflowLogs.step5MergingScoringCategorizing': 'Stap 5: Samenvoegen, scoren en categoriseren van documenten vanuit workflow context',
  'workflowLogs.step5Merged': 'Stap 5: {{count}} documenten samengevoegd van alle bronnen',
  'workflowLogs.step5ScoredRanked': 'Stap 5: {{count}} documenten gescoord en gerangschikt',
  'workflowLogs.step5Categorized': 'Stap 5: Documenten gecategoriseerd in {{count}} categorieën: {{categories}}',
  'workflowLogs.step3FixtureDocumentsPersisted': 'Stap 3: {{count}} fixture documenten opgeslagen',
  'workflowLogs.step5DocumentsPersisted': 'Stap 5: Documenten al opgeslagen via canonical pipeline (canonical_documents collectie). Query ID: {{queryId}}',
  'workflowLogs.step5CreatedQuery': 'Stap 5: Query document aangemaakt voor workflow tracking (Query ID: {{queryId}}). Documenten al in canonical_documents collectie.',
  'workflowLogs.step5WarningCouldNotCreateQuery': 'Stap 5: WAARSCHUWING - Kon Query document niet aanmaken voor workflow tracking',
  'workflowLogs.step5NoQueryIdOrOnderwerp': 'Stap 5: Geen queryId of onderwerp opgegeven. Documenten zijn in canonical_documents collectie.',
  'workflowLogs.step6UsingFixture': 'Stap 6: Gebruik fixture officielebekendmakingen documenten (FEATURE_E2E_FIXTURES=true)',
  'workflowLogs.step6Searching': 'Stap 6: Zoeken in officielebekendmakingen.nl voor: {{query}}{{authority}}',
  'workflowLogs.step6Found': 'Stap 6: {{count}} officiële publicaties gevonden',
  'workflowLogs.step7UsingFixture': 'Stap 7: Gebruik fixture Rechtspraak documenten (FEATURE_E2E_FIXTURES=true)',
  'workflowLogs.step7Searching': 'Stap 7: Zoeken in rechtspraak.nl voor: {{query}}{{court}}{{dateRange}}',
  'workflowLogs.step7ExpandedQuery': 'Stap 7: Query uitgebreid "{{original}}" → {{queryCount}} query/queries met {{termCount}} termen ({{sources}})',
  'workflowLogs.step7DiscoveringEcli': 'Stap 7: ECLI identifiers ontdekken via canonical pipeline ({{queryCount}} query/queries)',
  'workflowLogs.step7QueryFound': 'Stap 7: Query {{index}}/{{total}} ("{{query}}") vond {{count}} ECLI identifiers',
  'workflowLogs.step7QueryFailed': 'Stap 7: Query {{index}}/{{total}} ("{{query}}") mislukt: {{error}}',
  'workflowLogs.step7EarlyExit': 'Stap 7: Vroege exit - {{count}} ECLI identifiers gevonden (drempel: {{threshold}})',
  'workflowLogs.step7NoEcliFound': 'Stap 7: Geen ECLI identifiers gevonden voor query',
  'workflowLogs.step7FoundUniqueEcli': 'Stap 7: {{unique}} unieke ECLI identifiers gevonden (van {{total}} totaal)',
  'workflowLogs.step7FoundEcliProcessing': 'Stap 7: {{count}} ECLI identifiers gevonden, verwerken via canonical pipeline',
  'workflowLogs.step7FailedToProcessEcli': 'Stap 7: Verwerken van ECLI {{ecli}} mislukt: {{error}}',
  'workflowLogs.step7ProcessedJurisprudence': 'Stap 7: {{count}} jurisprudentie documenten verwerkt via canonical pipeline{{court}}{{dateRange}}',
  'workflowLogs.step1AErrorStackTrace': 'Stap 1A: Fout stack trace: {{trace}}',
  'workflowLogs.step1AErrorDiagnostic': 'Stap 1A: Foutdiagnose informatie: {{diagnostic}}',
  'workflowLogs.dsoEnrichmentErrorDiagnostic': 'DSO Verrijking: Foutdiagnose informatie: {{diagnostic}}',
  'workflowLogs.dsoEnrichmentErrorStackTrace': 'DSO Verrijking: Fout stack trace: {{trace}}',
  'workflowLogs.step4UsingFixture': 'Stap 4: Gebruik fixture geschraapte documenten (FEATURE_E2E_FIXTURES=true)',
  'workflowLogs.step4FixtureModeEnabled': 'Stap 4: Fixture modus ingeschakeld - lege resultaten teruggeven (gebruik canonical pipeline voor productie)',
  'workflowLogs.step4UsingProvidedWebsiteData': 'Stap 4: Gebruik geleverde websiteData voor standalone uitvoering ({{count}} websites)',
  'workflowLogs.step4WarningInvalidResult': 'Stap 4: WAARSCHUWING - BronWebsite.findByIds gaf ongeldig resultaat terug, gebruik lege array',
  'workflowLogs.step4FoundWebsites': '{{count}} websites gevonden om te scrapen vanuit database',
  'workflowLogs.step8CheckingIfShouldRun': 'Stap 8: Controleren of Common Crawl ontdekking moet draaien',
  'workflowLogs.step8SkippingCommonCrawl': 'Common Crawl ontdekking overslaan (voldoende resultaten of niet ingeschakeld)',
  'workflowLogs.step8CommonCrawlServiceAvailable': 'Stap 8: Common Crawl service is beschikbaar (publieke service)',
  'workflowLogs.step8WarningCommonCrawlValidationFailed': 'Stap 8: WAARSCHUWING - Common Crawl service validatie mislukt. Dit kan wijzen op netwerkconnectiviteitsproblemen.',
  'workflowLogs.step8StartingCommonCrawl': 'Stap 8: Starten met optionele Common Crawl diepe ontdekking',
  'workflowLogs.step8UsingFixture': 'Stap 8: Gebruik fixture Common Crawl documenten (FEATURE_E2E_FIXTURES=true)',
  'workflowLogs.step8UsingFixtureWithQueryId': 'Stap 8: Gebruik fixture Common Crawl documenten (Query ID: {{queryId}})',
  'workflowLogs.step8UsingFixtureCreatedQuery': 'Stap 8: Gebruik fixture Common Crawl documenten en aangemaakt Query document (Query ID: {{queryId}})',
  'workflowLogs.step8DiscoveredDomains': 'Stap 8: {{count}} domeinen ontdekt van Common Crawl',
  'workflowLogs.step8CommonCrawlDiscoveryComplete': 'Stap 8: Common Crawl verkenning voltooid: {{docs}} documenten gevonden van {{domains}} domeinen',
  'workflowLogs.step8ProcessedCommonCrawlDocuments': 'Stap 8: {{count}} Common Crawl documenten verwerkt via canonieke pipeline (Query ID: {{queryId}})',
  'workflowLogs.step8ProcessedCommonCrawlDocumentsWithQuery': 'Stap 8: {{count}} Common Crawl documenten verwerkt via canonieke pipeline en Query document aangemaakt (Query ID: {{queryId}})',
  'workflowLogs.step8ProcessedCommonCrawlDocumentsWarning': 'Stap 8: {{count}} Common Crawl documenten verwerkt via canonieke pipeline (WAARSCHUWING: Kon Query document niet aanmaken)',
  'workflowLogs.step8ProcessedCommonCrawlDocumentsNoQuery': 'Stap 8: {{count}} Common Crawl documenten verwerkt via canonieke pipeline (geen Query document aangemaakt - geen queryId of onderwerp opgegeven)',
  'workflowLogs.commonCrawlDiscoveryError': 'FOUT in Common Crawl verkenning: {{error}}. {{guidance}}',
  'workflowLogs.scrapingDomain': 'Domein scrapen: {{domain}} (max {{maxPages}} pagina\'s)',
  'workflowLogs.scrapedDocumentsFromDomain': '{{count}} documenten geschraapt van {{domain}}',
  'workflowLogs.errorScrapingDomain': 'Fout bij scrapen domein {{domain}}: {{error}}. {{guidance}}',
  'workflowLogs.linkedToRelatedNodes': '{{url}} gekoppeld aan {{count}} gerelateerde nodes',
  'workflowLogs.navigationGraphSavedWithRechtspraak': 'Navigatiegrafiek opgeslagen: {{total}} totaal nodes na toevoegen van {{added}} rechtspraak documenten',
  'workflowLogs.navigationGraphSavedWithRechtspraakAndRelationships': 'Navigatiegrafiek opgeslagen: {{total}} totaal nodes na toevoegen van {{added}} rechtspraak documenten, {{relationships}} relaties aangemaakt',
  'workflowLogs.workflowExecutionStartedEmoji': 'Workflowuitvoering gestart',
  'workflowLogs.workflowExecutionStartedPlain': 'Workflowuitvoering gestart',
  'workflowLogs.workflowExecutionStartedWithRunId': 'Workflowuitvoering gestart (runId: {{runId}})',
  'workflowLogs.workflowCompletedEmoji': 'Workflow succesvol voltooid',
  'workflowLogs.workflowFailedEmoji': 'Workflow mislukt',
  'workflowLogs.startingExternalLinkExplorationFromIplo': 'Externe linkverkenning starten vanaf IPLO...',
  'workflowLogs.collectingExternalLinks': 'Externe links verzamelen van IPLO pagina\'s...',
  'workflowLogs.skippingIploHtmlSearch': 'IPLO HTML zoeken overslaan omdat semantische themamatch betrouwbaar was.',
  'workflowLogs.processingDocumentsAfterTheme': '{{count}} documenten verwerken na themagebaseerd scrapen...',
  'workflowLogs.addingSemanticSimilarity': 'Semantische gelijkenisscores toevoegen aan {{count}} documenten...',
  'workflowLogs.trimmingToTop': '✂️ Bijsnijden naar top {{count}} documenten op semantische gelijkenis...',
  'workflowLogs.trimmedTo': 'Bijgesneden naar {{count}} documenten',
  'workflowLogs.noSemanticSimilarity': 'Geen semantische gelijkenisscores beschikbaar, alle {{count}} documenten behouden',
  'workflowLogs.iploPagesToScan': '{{count}} IPLO pagina\'s gevonden om te scannen voor externe links',
  'workflowLogs.externalLinksCollected': '{{count}} externe links verzameld om te verwerken',
  'workflowLogs.invalidLinksFiltered': '   {{count}} ongeldige links uitgefilterd',
  'workflowLogs.failedToFetchIploPages': '   Mislukt om {{count}} IPLO pagina\'s op te halen (zal opnieuw proberen als workflow opnieuw wordt uitgevoerd)',
  'workflowLogs.processedExternalLinks': '{{processed}}/{{total}} externe links verwerkt ({{percent}}%)',
  'workflowLogs.queryTimeoutReached': 'Zoekopdracht timeout bereikt ({{seconds}}s). {{count}} documenten tot nu toe gevonden teruggeven.',
  'workflowLogs.targetScopeContainsSimple': 'Doelscope bevat {{count}} URLs',
  'workflowLogs.identifiedRelevantClustersSimple': '{{count}} relevante clusters gevonden: {{labels}}',
  'workflowLogs.foundDocumentsSimple': '{{count}} documenten gevonden',
  'workflowLogs.bfsExplorationStarting': 'BFS verkenning starten (3 hops) vanaf {{url}} (onderwerp: {{topic}})',
  'workflowLogs.bfsExploring': 'BFS: Verkennen {{url}} (Diepte: {{depth}})',
  'workflowLogs.bfsExtractedLinksDetailed': 'BFS: {{total}} links geëxtraheerd van {{url}}, {{filtered}} gefilterd onder drempelwaarde ({{threshold}}), {{kept}} relevante links behouden (domeinen: {{domains}}). Top links: {{topLinks}}',
  'workflowLogs.bfsAddedUrlsFromGraphDetailed': 'BFS: {{added}} URLs toegevoegd vanuit bestaande grafiekgegevens (diepte {{depth}}, {{filtered}} gefilterd onder drempelwaarde, gesorteerd op relevantie)',
  'workflowLogs.commonCrawlError': 'Common Crawl: Fout bij scrapen domein - {{guidance}}',
  'workflowLogs.dsoStep1AFilteredUnrecognizedFormats': 'Stap 1A: {{count}} document(en) uitgefilterd met niet-herkende formaten (alleen IMRO, STOP/TPOD en Z-voorvoegsel documenten worden verwerkt)',
  'workflowLogs.dsoStep1ALimitedResults': 'Stap 1A: DSO resultaten beperkt van {{from}} naar {{to}} documenten',
  'workflowLogs.dsoStep1AProcessingPhase': 'Stap 1A: Verwerkingsfase - {{count}} document(en) verwerken via canonieke pipeline (acquire → extract → map → persist)',
  'workflowLogs.dsoStep1AProcessingDocument': 'Stap 1A: Document verwerken {{id}}...',
  'workflowLogs.progressUpdateDetailed': 'Voortgang: {{processed}}/{{total}} ({{percent}}%) - gemiddeld: {{avgTime}}ms/node',
  'workflowLogs.productionModeComplete': 'Productiemodus voltooid: {{updated}} bijgewerkt, {{unchanged}} ongewijzigd, {{errors}} fout(en) ({{successRate}}% succes, {{totalTime}}ms totaal, {{avgTime}}ms gemiddeld/node)',
  // Workflow step names & workflow-level messages
  'workflowSteps.startingExecution': 'Start uitvoering stap: {{step}} ({{stepId}})',
  'workflowSteps.saveNavigationGraph': 'Navigatiegrafiek opslaan',
  'workflowSteps.initializeNavigationGraph': 'We gaan nu het navigatienetwerk inladen',
  'workflowSteps.exploreIPLO': 'IPLO verkennen',
  'workflowSteps.exploreExternalLinks': 'Externe links verkennen',
  'workflowSteps.createRelevantSubgraph': 'Relevante subnetwerk maken',
  'workflowSteps.expandFromRelevantNodes': 'Uitbreiden vanaf relevante nodes',
  'workflowSteps.mergeResultsIntoMainGraph': 'Resultaten samenvoegen met hoofdnetwerk',
  'workflowSteps.saveResults': 'Resultaten opslaan',
  'workflowSteps.findRelevantNodes': 'Relevante nodes vinden in bestaand netwerk',
  'workflowSteps.findStartingNode': 'Startnode zoeken',
  'workflowSteps.bfsExplore3Hops': 'BFS verkenning (3 hops)',
  'workflowSteps.enhanceQueryWithImbor': 'Zoekopdracht uitbreiden met IMBOR',
  'workflowSteps.scanIPLO': 'IPLO scannen',
  'workflowSteps.scanKnownSources': 'Bekende bronnen scannen',
  'workflowSteps.crossReferenceWithGoogle': 'Kruisverwijzing met Google',
  'workflowSteps.scoreAndFilterDocuments': 'Documenten scoren en filteren',
  'workflowSteps.exploreDiscoveredWebsites': 'Gevonden websites verkennen',
  'workflowSteps.resumingWorkflow': 'Workflow hervatten vanaf stap: {{stepId}}',
  'workflowSteps.executingStep': 'Stap uitvoeren: {{step}} ({{action}})',
  'workflowSteps.stepCompleted': 'Stap voltooid: {{step}}',
  'workflowSteps.startingStep': 'Start: {{step}} ({{action}})',
  'workflowSteps.scrapeHorstMunicipality': 'Scrape Horst aan de Maas gemeente',
  'workflowSteps.scrapeHorstMunicipalityArbeidsmigratie': 'Scrape Horst aan de Maas gemeente (Arbeidsmigratie)',
  'workflowSteps.scanIPLOForArbeidsmigratie': 'Scan IPLO voor arbeidsmigratie',
  'workflowSteps.scanIPLOForKnownSubjects': 'Scan IPLO voor bekende onderwerpen',
  'workflowSteps.targetedGoogleSearch': 'Gerichte Google-zoekopdracht (Gemeente + IPLO)',
  'workflowSteps.bfsCrawlFromDiscoveredUrls': 'BFS-crawl vanaf gevonden URLs',
  'workflowSteps.exploreIPLOWithSemanticTargeting': 'Verken IPLO met semantische targeting',
  'workflowSteps.title': 'Workflow Stappen',
  'workflowSteps.action': 'Actie:',
  // WorkflowStatus
  'workflowStatus.running': 'Bezig',
  'workflowStatus.completed': 'Voltooid',
  'workflowStatus.failed': 'Mislukt',
  'workflowStatus.pending': 'In afwachting',
  'workflowStatus.cancelled': 'Geannuleerd',
  'workflowStatus.completed_with_errors': 'Voltooid met fouten',
  'workflowStatus.published': 'Gepubliceerd',
  'workflowStatus.draft': 'Concept',
  'workflowStatus.testing': 'Testen',
  'workflowStatus.tested': 'Getest',
  'workflowStatus.unpublished': 'Niet gepubliceerd',
  'workflowStatus.deprecated': 'Verouderd',
  // WorkflowStatusDescription
  'workflowStatusDescription.draft': 'Concept - Workflow is in ontwikkeling',
  'workflowStatusDescription.testing': 'Testen - Workflow wordt getest',
  'workflowStatusDescription.tested': 'Getest - Workflow heeft tests doorstaan',
  'workflowStatusDescription.published': 'Gepubliceerd - Workflow is actief en beschikbaar',
  'workflowStatusDescription.unpublished': 'Niet gepubliceerd - Workflow is teruggetrokken',
  'workflowStatusDescription.deprecated': 'Verouderd - Workflow wordt niet meer gebruikt',
  // StatusTransition
  'statusTransition.pleaseSelectStatus': 'Selecteer een nieuwe status',
  'statusTransition.publishWithoutQualityGates': 'Deze workflow voldoet niet aan alle kwaliteitscriteria. Wilt u toch publiceren?',
  'statusTransition.currentStatus': 'Huidige status',
  'statusTransition.selectNewStatus': 'Selecteer nieuwe status',
  'statusTransition.commentOptional': 'Opmerking (optioneel)',
  'statusTransition.commentPlaceholder': 'Voeg een opmerking toe over deze statuswijziging...',
  'statusTransition.qualityGatesCheck': 'Kwaliteitscriteria',
  'statusTransition.minimumTestRuns': 'Minimaal 3 test runs',
  'statusTransition.acceptanceRate': 'Acceptatiepercentage ≥ 70%',
  'statusTransition.errorRate': 'Foutpercentage < 10%',
  'statusTransition.runningInstances': 'Lopende instanties',
  'statusTransition.checkingRunningInstances': 'Controleren op lopende instanties...',
  'statusTransition.activeInstancesSingular': 'Er is {{count}} actieve instantie',
  'statusTransition.activeInstancesPlural': 'Er zijn {{count}} actieve instanties',
  'statusTransition.letInstancesComplete': 'Laat instanties voltooien',
  'statusTransition.cancelAllInstances': 'Annuleer alle instanties',
  'statusTransition.noRunningInstances': 'Geen lopende instanties',
  'statusTransition.changeStatus': 'Status wijzigen',
  // WorkflowDetails
  'workflowDetails.title': 'Workflow Details',
  'workflowDetails.backToWorkflows': '← Terug naar workflows',
  'workflowDetails.averageExecutionTime': 'Gemiddelde uitvoeringstijd',
  'workflowDetails.peakExecutionTime': 'Piek uitvoeringstijd',
  'workflowDetails.successRate': 'Succespercentage',
  'workflowDetails.peakUsage': 'Piek gebruik',
  'workflowDetails.totalRuns': 'Totaal runs',
  'workflowDetails.recentRuns': 'Recente runs',
  'workflowDetails.noRunsFound': 'Geen runs gevonden',
  'workflowDetails.runLogs': 'Run logboeken',
  'workflowDetails.selectRunToViewLogs': 'Selecteer een run om logboeken te bekijken',
  'workflowDetails.loadingLogs': 'Logboeken laden...',
  'workflowDetails.noLogsAvailable': 'Geen logboeken beschikbaar',
  'workflowDetails.workflowErrors': 'Workflow fouten',
  'workflowDetails.noErrorsFound': 'Geen fouten gevonden voor deze workflow',
  'workflowDetails.hideErrors': 'Fouten verbergen',
  'workflowDetails.showErrors': 'Fouten tonen',
  'workflowDetails.loadingErrors': 'Fouten laden...',
  'workflowDetails.noDescription': 'Geen beschrijving',
  'workflowDetails.loadingModules': 'Modules laden...',
  'workflowDetails.statusHistory': 'Status Geschiedenis',
  'workflowDetails.by': 'door',
  'workflowDetails.versionHistory': 'Versie Geschiedenis',
  'workflowDetails.rollback': 'Terugdraaien',
  'workflowDetails.rollbackWorkflow': 'Workflow Terugdraaien',
  'workflowDetails.selectVersionToRollback': 'Selecteer Versie om Naar Terug te Draaien',
  'workflowDetails.loadingVersions': 'Versies laden...',
  'workflowDetails.noPreviousVersions': 'Geen eerdere versies beschikbaar',
  'workflowDetails.rollbackPreview': 'Terugdraai Voorvertoning',
  'workflowDetails.currentVersion': 'Huidige Versie',
  'workflowDetails.targetVersion': 'Doel Versie',
  'workflowDetails.warnings': 'Waarschuwingen',
  'workflowDetails.changes': 'Wijzigingen',
  'workflowDetails.commentOptional': 'Opmerking (optioneel)',
  'workflowDetails.rollingBack': 'Terugdraaien...',
  'workflowDetails.rollbackToVersion': 'Terugdraaien naar Versie',
  'workflowDetails.loadingVersionHistory': 'Versie geschiedenis laden...',
  'workflowDetails.current': 'Huidig',
  'workflowDetails.noVersionHistory': 'Geen versie geschiedenis beschikbaar',
  'workflowDetails.publicationInfo': 'Publicatie Informatie',
  'workflowDetails.publishedBy': 'Gepubliceerd door',
  'workflowDetails.publishedAt': 'Gepubliceerd op',
  'workflowDetails.stepId': 'Stap ID',
  'workflowDetails.parameters': 'Parameters',
  'workflowDetails.published': 'Gepubliceerd',
  'workflowDetails.noModulesDetected': 'Geen geregistreerde modules gedetecteerd in deze workflow. Stappen kunnen legacy acties gebruiken.',
  'workflowDetails.modulesUsed': 'Gebruikte modules',
  'workflowDetails.usedInSteps_one': 'Gebruikt in {{count}} stap',
  'workflowDetails.usedInSteps_other': 'Gebruikt in {{count}} stappen',
  // Workflows
  'workflows.noWorkflowsFound': 'Geen workflows gevonden',
  // WorkflowResults UI
  'workflowResults.downloadTxt': 'Downloaden als TXT',
  'workflowResults.downloadMarkdown': 'Downloaden als Markdown',
  'workflowResults.downloadJson': 'Downloaden als JSON',
  'workflowResults.downloadSuccess': 'Bestand succesvol gedownload.',
  'workflowResults.downloadFailed': 'Downloaden mislukt',
  'workflowResults.downloadFailedMessage': 'Kon bestand niet downloaden',
  // WorkflowPage
  'workflowPage.downloadLogsTooltip': 'Downloaden logs als tekstbestand',
  // Sidebar
  'common.toggleSidebar': 'Zijbalk openen/sluiten',
  // Login/Register
  'auth.welcomeBack': 'Welkom terug',
  'auth.signInToAccount': 'Log in op uw account',
  'auth.emailAddress': 'E-mailadres',
  'auth.password': 'Wachtwoord',
  'auth.signingIn': 'Inloggen...',
  'auth.signIn': 'Inloggen',
  'auth.dontHaveAccount': 'Heeft u nog geen account?',
  'auth.signUp': 'Registreren',
  'auth.createAccount': 'Account aanmaken',
  'auth.joinBeleidsscan': 'Word vandaag lid van Beleidsscan',
  'auth.fullName': 'Volledige naam',
  'auth.role': 'Rol',
  'auth.role.advisor': 'Adviseur',
  'auth.role.developer': 'Ontwikkelaar',
  'auth.role.admin': 'Beheerder',
  'auth.creatingAccount': 'Account aanmaken...',
  'auth.alreadyHaveAccount': 'Heeft u al een account?',
  'auth.loginFailed': 'Inloggen mislukt. Controleer uw gegevens.',
  'auth.registrationFailed': 'Registratie mislukt. Probeer het opnieuw.',
  'auth.showPassword': 'Toon wachtwoord',
  'auth.hidePassword': 'Verberg wachtwoord',
  // Beleidsscan
  'beleidsscan.startingScan': 'Scan wordt gestart...',
  'beleidsscan.graphVisualization': 'Grafiekvisualisatie verschijnt zodra het scannen begint',
  'beleidsscan.close': 'Sluiten',
  'beleidsscan.scrape': 'Scrapen',
  'beleidsscan.scraping': 'Scrapen...',
  'beleidsscan.startScan': 'Scan starten',
  'beleidsscan.importWorkflowResults': 'Importeer workflow resultaten',
  'beleidsscan.workflowResultsImported': 'Workflow resultaten geïmporteerd',
  'beleidsscan.workflowResultsPreview': 'Workflow Resultaten Voorvertoning',
  'beleidsscan.endpointsFound': 'Gevonden endpoints',
  'beleidsscan.executionTrace': 'Uitvoeringstrace',
  'beleidsscan.importAsDocuments': 'Importeren als documenten',
  'beleidsscan.converting': 'Converteren...',
  'beleidsscan.importWorkflowResultsErrorTitle': 'Fout bij importeren workflow resultaten',
  'beleidsscan.importWorkflowResultsErrorDescription':
    'Probeer het opnieuw of controleer of de workflow-uitvoer beschikbaar is.',
  'beleidsscan.workflowImportDialogTitle': 'Workflow resultaten importeren',
  'beleidsscan.workflowImportDialogDescription': 'Wat zijn workflow resultaten en hoe gebruikt u ze?',
  'beleidsscan.workflowImportWhatTitle': 'Wat zijn workflow resultaten?',
  'beleidsscan.workflowImportWhatBody':
    'Workflow resultaten zijn documenten die zijn gegenereerd door geavanceerde scraping workflows. Deze kunnen aanvullende bronnen bevatten die niet via de standaard scan zijn gevonden.',
  'beleidsscan.workflowImportHowTitle': 'Hoe werkt het?',
  'beleidsscan.workflowImportStepStart': 'Klik op "Importeer workflow resultaten"',
  'beleidsscan.workflowImportStepPreview': 'Bekijk een voorvertoning van de gevonden documenten',
  'beleidsscan.workflowImportStepImport': 'Importeer de documenten naar deze scan',
  'beleidsscan.selectWorkflowOutputStep': 'Selecteer een beschikbare workflow-uitvoer',
  'beleidsscan.selectWorkflowOutputToImport': 'Selecteer een workflow-uitvoer om documenten te importeren',
  'beleidsscan.noWorkflowOutputs': 'Geen workflow-uitvoerbestanden beschikbaar',
  'beleidsscan.tipLabel': 'Tip:',
  'beleidsscan.workflowImportTipText':
    'Workflow resultaten worden toegevoegd aan uw bestaande documenten en kunnen op dezelfde manier worden beoordeeld.',
  'beleidsscan.scanSummaryTitle': 'Scan samenvatting:',
  // BronnenOverzicht
  'bronnenOverzicht.startScan': 'Scan starten',
  'bronnenOverzicht.startingScan': 'Scan wordt gestart...',
  'bronnenOverzicht.scanning': 'Scannen...',
  'bronnenOverzicht.scanComplete': 'Scan voltooid',
  'bronnenOverzicht.scanFailed': 'Scan mislukt',
  // WorkflowResults
  'workflowResults.resume': 'Hervatten',
  'workflowResults.pause': 'Pauzeren',
  'workflowResults.stop': 'Stoppen',
  'workflowResults.refresh': 'Vernieuwen',
  'workflowResults.downloadReport': 'Rapport downloaden',
  'workflowResults.urlsVisited': 'URLs bezocht',
  'workflowResults.documentsFound': 'Documenten gevonden',
  'workflowResults.newlyDiscovered': 'Nieuw ontdekt',
  'workflowResults.errors': 'Fouten',
  'workflowResults.converting': 'Converteren...',
  'workflowResults.importAsDocuments': 'Importeren als documenten',
  'workflowResults.all': 'Alle',
  'workflowResults.pending': 'In afwachting',
  'workflowResults.approved': 'Goedgekeurd',
  'workflowResults.rejected': 'Afgekeurd',
  'workflowResults.ofDocuments': 'van documenten',
  'workflowResults.noDocuments': 'Geen documenten gevonden. Voer een workflow uit of importeer resultaten.',
  'workflowResults.workflowResultsPreview': 'Workflow Resultaten Voorvertoning',
  'workflowResults.endpointsFound': 'Gevonden endpoints',
  'workflowResults.executionTrace': 'Uitvoeringstrace',
  'workflowResults.andMoreEndpoints': '... en {{count}} meer',
  'workflowResults.urlsCount': '({{count}} URLs)',
  'workflowResults.runPaused': 'Run gepauzeerd',
  'workflowResults.runResumed': 'Run hervat',
  'workflowResults.runStopped': 'Run gestopt',
  'workflowResults.failedToPause': 'Pauzeren mislukt',
  'workflowResults.failedToResume': 'Hervatten mislukt',
  'workflowResults.failedToStop': 'Stoppen mislukt',
  'workflowResults.conversionFailed': 'Conversie mislukt',
  'workflowResults.conversionFailedDescription':
    'Kon workflow-uitvoer niet converteren naar documenten. Probeer het opnieuw.',
  'workflowResults.workflowConverted': 'Workflow resultaten geconverteerd',
  'workflowResults.workflowConvertedDescription': '{{documents}} documenten en {{websites}} websites aangemaakt.',
  'workflowResults.statusUpdateFailed': 'Status bijwerken mislukt',
  'workflowResults.statusUpdateFailedDesc': 'Probeer het opnieuw.',
  // CommonCrawl
  'commonCrawl.title': 'Common Crawl Explorer',
  'commonCrawl.description': 'Doorzoek het Common Crawl webarchief om pagina\'s over specifieke onderwerpen te vinden op alle domeinen. Perfect voor het ontdekken van pagina\'s over specifieke onderwerpen zoals "antennebeleid huizen".',
  'commonCrawl.savedQueries': 'Opgeslagen zoekopdrachten',
  'commonCrawl.searchQuery': 'Zoekopdracht (URL patroon)',
  'commonCrawl.search': 'Zoeken',
  'commonCrawl.searching': 'Zoeken...',
  'commonCrawl.domainFilter': 'Domein filter',
  'commonCrawl.crawlId': 'Crawl ID',
  'commonCrawl.invalidCrawlId': 'Ongeldig Crawl ID',
  'commonCrawl.noResultsFound': 'Geen resultaten gevonden',
  'commonCrawl.invalidPattern': 'Ongeldig patroon',
  'commonCrawl.networkError': 'Netwerkfout',
  'commonCrawl.serverError': 'Serverfout',
  'commonCrawl.error': 'Fout',
  'commonCrawl.suggestions': 'Suggesties:',
  'commonCrawl.validatingCrawlId': 'Crawl ID valideren...',
  'commonCrawl.results': 'Resultaten',
  'commonCrawl.found': 'gevonden',
  'commonCrawl.noResultsForQuery': 'Geen resultaten gevonden voor deze zoekopdracht.',
  'commonCrawl.startExploring': 'Begin met verkennen',
  'commonCrawl.exampleQueries': 'Voorbeeld zoekopdrachten:',
  'commonCrawl.showingOf': 'Toont',
  'commonCrawl.ofResults': 'van',
  'commonCrawl.increaseLimit': 'resultaten. Verhoog limiet om meer te zien.',
  'commonCrawl.noSavedQueries': 'Nog geen opgeslagen zoekopdrachten.',
  'commonCrawl.currentCrawlId': 'Huidig crawl ID:',
  // Workflow cards
  'workflows.iploExploration.name': 'IPLO-verkenning',
  'workflows.iploExploration.description':
    'Verken de IPLO-website, bouw de navigatiegrafiek op en sla inhoud op als Markdown.',
  'workflows.standardScan.name': 'Standaard documentscan',
  'workflows.standardScan.description':
    'Scan IPLO, bekende bronnen en Google op relevante documenten.',
  'workflows.quickIploScan.name': 'Snelle IPLO-scan',
  'workflows.quickIploScan.description': 'Snelle IPLO-scan zonder externe bronnen.',
  'workflows.bfs3Hop.name': '3-hop BFS-test',
  'workflows.bfs3Hop.description':
    'Breedte-eerst verkenning vanaf één startnode tot drie niveaus diep.',
  'workflows.externalLinks.name': 'Externe links verkennen',
  'workflows.externalLinks.description':
    'Verken externe links vanaf IPLO-pagina\'s en voeg ze toe aan de navigatiegrafiek (niet aan de kennisgrafiek).',
  'workflows.beleidsscanGraph.name': 'Beleidsscan navigatiegrafiek',
  'workflows.beleidsscanGraph.description':
    'Vind relevante nodes, toon subnetwerk en breid navigatiegrafiek in real-time uit.',
  'workflows.horstAanDeMaas.name': 'Horst aan de Maas workflow',
  'workflows.horstAanDeMaas.description':
    'Scrape Horst aan de Maas gemeente en relevante IPLO-websites met BFS-strategie.',
  'workflows.horstLaborMigration.name': 'Horst arbeidsmigratie',
  'workflows.horstLaborMigration.description':
    'Gerichte workflow voor arbeidsmigratie in Horst aan de Maas (IPLO + gemeente + Google).',
  'workflows.beleidsscanStep1.name': 'Beleidsscan Stap 1: Zoek DSO Omgevingsdocumenten',
  'workflows.beleidsscanStep1.description':
    'Zoek DSO Omgevingsdocumenten naar beleidsdocumenten (ontdekkingsfase)',
  'workflows.beleidsscanStep2.name': 'Beleidsscan Stap 2: Verrijk DSO Documenten',
  'workflows.beleidsscanStep2.description':
    'Verrijk DSO documenten met aanvullende metadata (optioneel)',
  'workflows.beleidsscanStep3.name': 'Beleidsscan Stap 3: Zoek IPLO Documenten',
  'workflows.beleidsscanStep3.description':
    'Zoek IPLO naar relevante beleidsdocumenten',
  'workflows.beleidsscanStep4.name': 'Beleidsscan Stap 4: Scan Geselecteerde Websites',
  'workflows.beleidsscanStep4.description':
    'Scan geselecteerde gemeente- en overheidswebsites voor documenten',
  'workflows.beleidsscanStep5.name': 'Beleidsscan Stap 5: Zoek Officiële Publicaties',
  'workflows.beleidsscanStep5.description':
    'Zoek Officiele Bekendmakingen voor officiële overheidspublicaties',
  'workflows.beleidsscanStep6.name': 'Beleidsscan Stap 6: Zoek Jurisprudentie',
  'workflows.beleidsscanStep6.description':
    'Zoek Rechtspraak.nl naar relevante juridische beslissingen en jurisprudentie',
  'workflows.beleidsscanStep7.name': 'Beleidsscan Stap 7: Optionele Diepe Ontdekking (Common Crawl)',
  'workflows.beleidsscanStep7.description':
    'Optionele diepe ontdekking met Common Crawl voor aanvullende documentbronnen',
  'workflows.beleidsscanStep8.name': 'Beleidsscan Stap 8: Optionele Stap',
  'workflows.beleidsscanStep8.description': 'Optionele stap voor aanvullende verwerking.',
  'workflows.beleidsscanStep9.name': 'Beleidsscan Stap 9: Merge + Score + Categoriseer',
  'workflows.beleidsscanStep9.description':
    'Merge resultaten van alle bronnen, score relevantie en categoriseer documenten',
  'workflows.dsoLocationSearch.name': 'DSO Location-Based Document Search',
  'workflows.dsoLocationSearch.description':
    'Haal alle omgevingsdocumenten op die van toepassing zijn op een specifieke locatie via de DSO API (standaard: Europalaan 6D, \'s-Hertogenbosch)',
  'workflows.testWorkflow1.name': 'Test Workflow 1',
  'workflows.testWorkflow1.description': '',
  'workflows.testWorkflow2.name': 'Test Workflow 2',
  'workflows.testWorkflow2.description': '',
  // WorkflowPage
  'workflowPage.title': 'Workflows',
  'workflowPage.description': 'Ontwikkelaarstools: Beheer en voer geautomatiseerde scraping workflows uit',
  'workflowPage.tip': 'Voor beleidsscanning, gebruik in plaats daarvan Beleidsscan (eenvoudiger, gebruiksvriendelijk)',
  'workflowPage.loading': 'Workflows laden...',
  'workflowPage.run': 'Uitvoeren',
  'workflowPage.resume': 'Hervatten',
  'workflowPage.pause': 'Pauzeren',
  'workflowPage.stop': 'Stoppen',
  'workflowPage.steps': 'stappen',
  'workflowPage.semanticTarget': 'Onderwerp',
  'workflowPage.explorationRandomness': 'Verkenningswillekeur (0-1)',
  'workflowPage.focused': 'Gefocust',
  'workflowPage.chaotic': 'Chaotisch',
  'workflowPage.workflowThoughts': 'Workflow gedachten',
  'workflowPage.subjectLabel': 'Onderwerp *',
  'workflowPage.locationLabel': 'Locatie (Location) - Optioneel',
  'workflowPage.subjectPlaceholder': 'e.g., klimaatadaptatie, bodem',
  'workflowPage.locationPlaceholder': 'e.g., Gemeente Amsterdam, Horst aan de Maas',
  'workflowPage.semanticTargetPlaceholder': 'e.g., bodem, water',
  'workflowPage.noLogsAvailable': 'Geen logboeken beschikbaar. Start een workflow om output te zien.',
  'workflowPage.workflowPaused': 'Workflow gepauzeerd',
  'workflowPage.workflowResumed': 'Workflow hervat',
  'workflowPage.workflowStopped': 'Workflow gestopt',
  'workflowPage.failedToPause': 'Workflow pauzeren mislukt',
  'workflowPage.failedToResume': 'Workflow hervatten mislukt',
  'workflowPage.failedToStop': 'Workflow stoppen mislukt',
  'workflowPage.failedToStart': 'Workflow starten mislukt',
  'workflowPage.skipRendering': 'Sla animatie over',
  'workflowPage.skipRenderingTooltip': 'Toon alle tekst direct (workflow is al klaar)',
  'workflowPage.publishedWorkflows': 'Gepubliceerde Workflows',
  'workflowPage.manageWorkflows': 'Beheer Workflows',
  'workflowPage.missingRequiredFields': 'Ontbrekende verplichte invoervelden',
  'workflowPage.missingRequiredFieldsDesc': 'De workflow actie {{action}} vereist de volgende velden:',
  'workflowPage.checkRequiredParameters': 'Controleer of alle benodigde parameters zijn doorgegeven aan de workflow.',
  'workflowPage.close': 'Sluiten',
  'workflowPage.errorFetchingStatus': 'Fout bij ophalen workflow status',
  'workflowPage.stillChecking': 'De workflow wordt nog steeds gecontroleerd...',
  'workflowPage.workflowStarting': 'Workflow wordt gestart...',
  'workflowPage.waitingForLogs': 'Wachten op eerste logberichten. Dit kan even duren.',
  'workflowPage.fetchingStatus': 'Status wordt opgehaald...',
  'workflowPage.navigationGraph': 'Navigatiegrafiek',
  // WorkflowComparison
  'workflowComparison.workflowA': 'Workflow A',
  'workflowComparison.workflowB': 'Workflow B',
  'workflowComparison.synchronizedScrolling': 'Gesynchroniseerd scrollen',
  'workflowComparison.progress': 'Voortgang',
  'workflowComparison.running': 'Bezig',
  'workflowComparison.waitingForRunId': 'Wachten op runId...',
  'workflowComparison.failed': 'Mislukt',
  'workflowComparison.workflowAError': 'Workflow A Fout:',
  'workflowComparison.workflowBError': 'Workflow B Fout:',
  'workflowComparison.comparisonProgress': 'Vergelijkingsvoortgang',
  'workflowComparison.started': 'Gestart',
  'workflowComparison.comparisonFailed': 'Vergelijking mislukt:',
  'workflowComparison.comparisonFailedMessage': 'De workflow vergelijking is mislukt.',
  'workflowComparison.workflowBenchmarkComparison': 'Workflow Benchmark Vergelijking',
  'workflowComparison.comparisonSummary': 'Vergelijkingssamenvatting',
  'workflowComparison.overallPerformanceComparison': 'Algemene prestatievergelijking',
  'workflowComparison.winner': 'Winnaar',
  'workflowComparison.tie': 'Gelijk',
  'workflowComparison.metricsBetter': 'metrieken beter',
  'workflowComparison.runs': 'runs',
  'workflowComparison.unnamedComparison': 'Naamloze vergelijking',
  'workflowComparison.minExecutionTime': 'Minimale uitvoeringstijd',
  'workflowComparison.metricsComparison': 'Metriekenvergelijking',
  'workflowComparison.sideBySideMetrics': 'Naast elkaar prestatiemetrieken',
  'workflowComparison.metric': 'Metriek',
  'workflowComparison.better': 'Beter',
  'workflowComparison.averageExecutionTime': 'Gemiddelde uitvoeringstijd',
  'workflowComparison.averageDocumentsFound': 'Gemiddeld aantal gevonden documenten',
  'workflowComparison.averageScore': 'Gemiddelde score',
  'workflowComparison.trendAnalysis': 'Trendanalyse',
  'workflowComparison.averageScoreOverTime': 'Gemiddelde score over tijd',
  'workflowComparison.runIndex': 'Run Index',
  'workflowComparison.documentDiscovery': 'Documentontdekking',
  'workflowComparison.documentDiscoveryComparison': 'Vergelijking van documentontdekkingsresultaten',
  'workflowComparison.avgDocumentsFound': 'gem. gevonden documenten',
  'workflowComparison.selectWorkflowsToCompare': 'Selecteer workflows om te vergelijken',
  'workflowComparison.selectWorkflowsDescription': 'Selecteer precies twee workflows om hun prestaties te vergelijken',
  'workflowComparison.filterByQuery': 'Filter op zoekopdracht...',
  'workflowComparison.labelOptional': 'Label (optioneel)',
  'workflowComparison.describeComparison': 'Beschrijf waar deze vergelijking op test...',
  'workflowComparison.searchFeatureFlags': 'Zoek feature flags...',
  'workflowComparison.enableAllFlags': 'Schakel alle flags in',
  'workflowComparison.disableAllFlags': 'Schakel alle flags uit',
  'workflowComparison.resetToSaved': 'Reset naar opgeslagen configuratie',
  'workflowComparison.selectWorkflowA': 'Selecteer workflow A',
  'workflowComparison.selectWorkflowB': 'Selecteer workflow B',
  'workflowComparison.selectConfigA': 'Selecteer config A',
  'workflowComparison.selectConfigB': 'Selecteer config B',
  'workflowComparison.enterSearchQuery': 'Voer zoekopdracht in...',
  'workflowComparison.comparisonName': 'Vergelijkingsnaam',
  'workflowComparison.defaultTimeout': 'Standaard: 1800',
  'workflowComparison.startNewComparison': 'Start nieuwe vergelijking',
  'workflowComparison.hideNewComparison': 'Verberg nieuwe vergelijking',
  'workflowComparison.startComparison': 'Start vergelijking',
  'workflowComparison.startingComparison': 'Vergelijking starten...',
  'workflowComparison.viewHistoricalComparisons': 'Bekijk historische vergelijkingen',
  'workflowComparison.historicalDescription': 'Vergelijk workflows op basis van hun benchmark run geschiedenis',
  'workflowComparison.quickRange': 'Snelle periode',
  'workflowComparison.last7d': 'Laatste 7 dagen',
  'workflowComparison.last30d': 'Laatste 30 dagen',
  'workflowComparison.last90d': 'Laatste 90 dagen',
  'workflowComparison.allTime': 'Alle tijd',
  'workflowComparison.fromDate': 'Vanaf datum',
  'workflowComparison.toDate': 'Tot datum',
  'workflowComparison.pickDate': 'Kies een datum',
  'workflowComparison.activeComparisons': 'Actieve vergelijkingen',
  'workflowComparison.comparisonsRunning': 'vergelijkingen actief',
  'workflowComparison.comparison': 'vergelijking',
  'workflowComparison.comparisons': 'vergelijkingen',
  'workflowComparison.selected': 'Geselecteerd',
  'workflowComparison.noComparisonData': 'Geen vergelijkingsgegevens beschikbaar voor de geselecteerde workflows en filters.',
  'workflowComparison.comparisonComplete': 'Vergelijking voltooid',
  'workflowComparison.comparisonCompleteMessage': 'De workflow vergelijking is succesvol voltooid.',
  'workflowComparison.validationError': 'Validatiefout',
  'workflowComparison.validationErrorMessage': 'Controleer of alle vereiste velden zijn ingevuld.',
  'workflowComparison.comparisonStarted': 'Vergelijking gestart',
  'workflowComparison.configA': 'Configuratie A',
  'workflowComparison.configB': 'Configuratie B',
  'workflowComparison.query': 'Zoekopdracht',
  'workflowComparison.nameOptional': 'Naam (optioneel)',
  'workflowComparison.timeoutOptional': 'Timeout (optioneel)',
  'workflowComparison.starting': 'Starten...',
  'workflowComparison.comparisonResults': 'Vergelijkingsresultaten',
  'workflowComparison.executionTime': 'Uitvoeringstijd',
  'workflowComparison.documentsFound': 'Gevonden documenten',
  'workflowComparison.topScore': 'Top score',
  'workflowComparison.differences': 'Verschillen',
  'workflowComparison.executionTimeDifference': 'Verschil in uitvoeringstijd',
  'workflowComparison.documentsFoundDifference': 'Verschil in gevonden documenten',
  'workflowComparison.commonDocuments': 'Gemeenschappelijke documenten',
  'workflowComparison.uniqueToA': 'Uniek voor A',
  'workflowComparison.uniqueToB': 'Uniek voor B',
  'workflowComparison.startNewWorkflowComparison': 'Start nieuwe workflow vergelijking',
  'workflowComparison.configureTwoWorkflows': 'Configureer twee workflows met zoekopdrachten om een naast-elkaar vergelijking uit te voeren',
  'workflowComparison.comparisonNameRequired': 'Vergelijkingsnaam *',
  'workflowComparison.comparisonNameExample': 'Bijv. "Vergelijking workflow A vs B"',
  'workflowComparison.descriptionOptional': 'Beschrijving (Optioneel)',
  'workflowComparison.testQueries': 'Test zoekopdrachten *',
  'workflowComparison.addQuery': 'Zoekopdracht toevoegen',
  'workflowComparison.queryExample': 'Bijv. "ruimtelijke ordening"',
  'workflowComparison.queryFilterOptional': 'Zoekopdracht filter (optioneel)',
  'workflowComparison.benchmarkConfiguration': 'Benchmark configuratie',
  'workflowComparison.usingCustomConfig': 'Gebruik aangepaste benchmark configuratie',
  'workflowComparison.usingDefaultConfig': 'Gebruik standaard benchmark configuratie',
  'workflowComparison.custom': 'Aangepast',
  'workflowComparison.default': 'Standaard',
  'workflowComparison.loadingConfiguration': 'Configuratie laden...',
  'workflowComparison.noConfigurationSet': 'Geen configuratie ingesteld. Standaardinstellingen worden gebruikt.',
  'workflowComparison.featureFlags': 'Feature Flags:',
  'workflowComparison.enabled': 'Ingeschakeld',
  'workflowComparison.on': 'AAN',
  'workflowComparison.off': 'UIT',
  'workflowComparison.flagsEnabled': 'flags ingeschakeld',
  'workflowComparison.of': 'van',
  'workflowComparison.editBenchmarkConfigA': 'Bewerk benchmark configuratie - Workflow A',
  'workflowComparison.editBenchmarkConfigB': 'Bewerk benchmark configuratie - Workflow B',
  'workflowComparison.configureFeatureFlags': 'Configureer feature flags en runtime-instellingen voor deze workflow. Deze instellingen zijn gescheiden van productie feature flags.',
  'workflowComparison.saving': 'Opslaan...',
  'workflowComparison.saveConfiguration': 'Configuratie opslaan',
  'workflowComparison.configurationSaved': 'Configuratie opgeslagen',
  'workflowComparison.configurationSavedMessage': 'Benchmark configuratie is opgeslagen voor deze workflow.',
  'workflowComparison.failedToSaveConfig': 'Configuratie opslaan mislukt',
  'workflowComparison.workflowsRequired': 'Workflows vereist',
  'workflowComparison.workflowsRequiredMessage': 'Selecteer beide workflows om te vergelijken.',
  'workflowComparison.queryRequired': 'Zoekopdracht vereist',
  'workflowComparison.queryRequiredMessage': 'Voer ten minste één test zoekopdracht in.',
  'workflowComparison.nameRequired': 'Naam vereist',
  'workflowComparison.nameRequiredMessage': 'Voer een naam in voor deze vergelijking.',
   'workflowComparison.comparisonStartedMessage': 'Vergelijking "{{name}}" is gestart. Resultaten verschijnen wanneer deze compleet is.',
  'workflowComparison.failedToStartComparison': 'Vergelijking starten mislukt',
  'workflowComparison.atLeastOneQueryRequired': 'Ten minste één zoekopdracht vereist',
  'workflowComparison.atLeastOneQueryRequiredMessage': 'U moet ten minste één test zoekopdracht hebben.',
  'workflowComparison.maxExecutionTime': 'Maximale uitvoeringstijd',
  'workflowComparison.medianExecutionTime': 'Mediane uitvoeringstijd',
  'workflowComparison.loadingComparisonData': 'Vergelijkingsgegevens laden...',
  'workflowComparison.errorLoadingComparison': 'Fout bij laden vergelijking',
  'workflow.workflowId': 'Workflow ID',
  'workflow.workflowName': 'Workflow Naam',
  'workflow.workflowNamePlaceholder': 'bijv. Planning documenten – NL gemeenten',
  'workflow.description': 'Beschrijving',
  'workflow.uniqueIdentifier': 'Unieke identifier (kan niet worden gewijzigd)',
  'workflow.describeWorkflow': 'Beschrijf wat deze workflow doet...',
  'workflow.commaSeparatedValues': 'Door komma\'s gescheiden waarden',
  'workflow.noModulesAdded': 'Nog geen modules toegevoegd. Klik op "Module toevoegen" om te beginnen.',
  'workflow.addModule': 'Module toevoegen',
  'workflow.loadingModules': 'Modules laden...',
  'workflow.chooseModule': 'Kies een module...',
  'workflow.selectParameter': 'Selecteer {{label}}',
  'workflow.workflowModules': 'Workflow Modules',
  'workflow.selectModule': 'Selecteer Module',
  'workflow.step': 'Stap',
  // RunsPage
  'runsPage.title': 'Scan geschiedenis',
  'runsPage.description': 'Bekijk vorige en huidige beleidsscans',
  'runsPage.loading': 'Runs laden...',
  'runsPage.error': 'Fout:',
  'runsPage.retry': 'Opnieuw proberen',
  'runsPage.status': 'Status',
  'runsPage.scanType': 'Scantype',
  'runsPage.startTime': 'Starttijd',
  'runsPage.duration': 'Duur',
  'runsPage.details': 'Details',
  'runsPage.actions': 'Acties',
  'runsPage.noRunsFound': 'Geen runs gevonden',
  'runsPage.running': 'Bezig...',
  'runsPage.topic': 'Onderwerp:',
  'runsPage.resume': 'Hervatten',
  'runsPage.pause': 'Pauzeren',
  'runsPage.stop': 'Stoppen',
  'runsPage.runPaused': 'Run gepauzeerd',
  'runsPage.runResumed': 'Run hervat',
  'runsPage.runStopped': 'Run gestopt',
  'runsPage.failedToPause': 'Pauzeren mislukt',
  'runsPage.failedToResume': 'Hervatten mislukt',
  'runsPage.failedToStop': 'Stoppen mislukt',
  // BronCard
  'bronCard.website': 'Website',
  'bronCard.document': 'Document',
  // Common
  'common.close': 'Sluiten',
  'common.loading': 'Laden...',
  'common.error': 'Fout',
  'common.success': 'Succes',
  'common.cancel': 'Annuleren',
  'common.save': 'Opslaan',
  'common.delete': 'Verwijderen',
  'common.edit': 'Bewerken',
  'common.add': 'Toevoegen',
  'common.remove': 'Verwijderen',
  'common.search': 'Zoeken',
  'common.filter': 'Filter',
  'common.sort': 'Sorteren',
  'common.selectAll': 'Alles selecteren',
  'common.deselectAll': 'Alles deselecteren',
  'common.back': 'Terug',
  'common.next': 'Volgende',
  'common.previous': 'Vorige',
  'common.submit': 'Verzenden',
  'common.confirm': 'Bevestigen',
  'common.failed': 'Mislukt',
  'common.tryAgain': 'Probeer opnieuw',
  'common.tryAgainLater': 'Probeer het later opnieuw',
  'common.unknownError': 'Onbekende fout',
  'templates.failedToLoad': 'Sjablonen laden mislukt',
  'templates.tryAgainLater': 'Probeer het later opnieuw',
  'admin.failedToUpdateHierarchy': 'Hiërarchie bijwerken mislukt. Probeer het opnieuw.',
  'admin.confirmRemoveAccess': 'Weet u zeker dat u de toegang voor deze gebruiker wilt verwijderen?',
  'admin.enterNewPassword': 'Voer nieuw wachtwoord in (minimaal 6 tekens):',
  'admin.passwordMinLength': 'Wachtwoord moet minimaal 6 tekens lang zijn',
  'common.yes': 'Ja',
  'common.no': 'Nee',
  'common.retry': 'Opnieuw proberen',
  'common.none': 'Geen',
  'common.never': 'Nooit',
  'common.collapse': 'Inklappen',
  'common.expand': 'Uitklappen',
  'common.sunday': 'Zo',
  'common.monday': 'Ma',
  'common.tuesday': 'Di',
  'common.wednesday': 'Wo',
  'common.thursday': 'Do',
  'common.friday': 'Vr',
  'common.saturday': 'Za',
  // Layout
  'layout.scanHistory': 'Scan geschiedenis',
  'layout.commonCrawl': 'Common Crawl',
  'layout.logout': 'Uitloggen',
  'layout.beleidsscanSettings': 'Beleidsscan Instellingen',
  'layout.featureFlags': 'Feature Flags',
  'layout.flagTemplates': 'Flag Templates',
  'layout.systemAdministration': 'Systeembeheer',
  // GraphPage
  'graphPage.loading': 'Navigatiegrafiek laden...',
  'graphPage.loadingSubtitle': 'Grafiek wordt geladen...',
  'graphPage.contains': 'Bevat',
  'graphPage.pages': 'pagina\'s',
  'graphPage.topPages': 'Top Pagina\'s',
  'graphPage.morePages': 'meer pagina\'s...',
  'graphPage.nodes': 'nodes',
  'graphPage.approved': 'goedgekeurd',
  'graphPage.pending': 'in afwachting',
  'graphPage.themes': 'thema\'s',
  'graphPage.navigationNetwork': 'Navigatie Netwerk',
  'graphPage.milestoneTitle': 'Navigatie Grafiek Mijlpaal!',
  'graphPage.milestoneMessage': 'De grafiek heeft nu {{count}} nodes!',
  'graphPage.loadError': 'Fout bij laden grafiek',
  'graphPage.loadErrorDescription': 'De grafiek kon niet worden geladen. Probeer het opnieuw.',
  'graphPage.loadNavigationError': 'Fout bij laden navigatiegrafiek',
  'graphPage.loadNavigationErrorDescription': 'De navigatiegrafiek kon niet worden geladen. Probeer het opnieuw.',
  'graphPage.connected': 'verbonden',
  'graphPage.mode': 'Modus',
  'graphPage.viewMode': 'Weergave Modus',
  'graphPage.metaGraph': 'Meta-Grafiek (Gegroepeerd)',
  'graphPage.connectedGraph': 'Verbonden Grafiek',
  'graphPage.allNodes': 'Alle Nodes (Vlak)',
  'graphPage.clusteredView': 'Gegroepeerde Weergave',
  'graphPage.node': 'node',
  'graphPage.totalNodesTitle': 'Totaal nodes in navigatiegrafiek: {{count}}',
  'graphPage.showHelpTitle': 'Toon hulp: Hoe de grafiek te vullen',
  'graphPage.showHelp': 'Toon hulp',
  'graphPage.help': 'Hulp',
  'graphPage.realTimeUpdateTitle': 'Real-time update bezig',
  'graphPage.graphHealthTitle': 'Grafiek gezondheid: {{status}}. {{nodes}} nodes, {{edges}} edges, {{root}}',
  'graphPage.hasRoot': 'heeft root',
  'graphPage.noRoot': 'geen root',
  'graphPage.emptyGraphTitle': 'Navigatie Grafiek is Leeg',
  'graphPage.criticalHealthTitle': 'Navigatie Grafiek Gezondheid: Kritiek',
  'graphPage.warningHealthTitle': 'Navigatie Grafiek Gezondheid: Waarschuwing',
  'graphPage.emptyGraphDescription': 'De navigatiegrafiek moet worden gevuld voordat u deze kunt visualiseren.',
  'graphPage.graphStats': 'De navigatiegrafiek heeft {{nodes}} nodes en {{edges}} edges.',
  'graphPage.noRootNode': 'Geen root node ingesteld.',
  'graphPage.connectivityPercentage': '{{percentage}}% van de nodes zijn verbonden.',
  'graphPage.runWorkflow': 'Workflow Uitvoeren',
  'graphPage.adminTools': 'Beheerder Tools',
  'graphPage.dismiss': 'Sluiten',
  'graphPage.noClustersFound': 'Geen Clusters Gevonden',
  'graphPage.noClustersDescription': 'De grafiek bevat {{count}} node{{plural}}, maar er zijn geen clusters aangemaakt.',
  'graphPage.noClustersExplanation': 'Dit gebeurt wanneer nodes worden uitgefilterd door de minimale clustergrootte (20). Voer een workflow uit om meer nodes toe te voegen, of de grafiek zal automatisch clusters tonen zodra u genoeg nodes heeft.',
  // SearchPage
  'searchPage.title': 'Beleid Zoeken',
  'searchForm.topicLabel': 'Onderwerp',
  'searchForm.topicPlaceholder': 'Voer een onderwerp in (bijv. \'arbeidsmigranten\', \'omgevingsvisie\')',
  'searchForm.clearTopic': 'Wis zoekopdracht',
  'searchForm.locationLabel': 'Locatie (optioneel)',
  'searchForm.locationPlaceholder': 'Zoek gemeente (bijv. \'Horst aan de Maas\', \'Amsterdam\')',
  'searchForm.clearLocation': 'Locatie verwijderen',
  'searchForm.jurisdictionLabel': 'Bestuurslaag (optioneel)',
  'searchForm.selectJurisdiction': 'Selecteer bestuurslaag',
  'searchForm.jurisdiction.national': 'Rijksoverheid',
  'searchPage.description': 'Zoek door beleidsdocumenten en regelgeving.',
  'searchPage.searchPlaceholder': 'Zoek naar beleid (bijv. \'bodem\', \'geluid centrum\', \'bouwhoogte wonen\')...',
  'searchPage.searching': 'Zoeken...',
  'searchPage.documents': 'Documenten',
  'searchPage.noDocumentsFound': 'Geen documenten gevonden.',
  'searchPage.score': 'Score:',
  'searchPage.unknownSource': 'Onbekende Bron',
  'searchPage.viewSource': 'Bekijk Bron',
  'searchPage.relatedConcepts': 'Gerelateerde Concepten',
  'searchPage.noRelatedEntities': 'Geen gerelateerde entiteiten gevonden.',
  'searchPage.noDescriptionAvailable': 'Geen beschrijving beschikbaar.',
  'searchPage.searchFailed': 'Zoeken mislukt',
  'searchPage.unnamedDocument': 'Naamloos Document',
  'searchPage.noDocumentsFoundMessage': 'We konden geen documenten vinden die aan je zoekopdracht voldoen.',
  'searchPage.suggestion1': 'Controleer de spelling van je zoektermen',
  'searchPage.suggestion2': 'Probeer minder specifieke zoektermen',
  'searchPage.suggestion3': 'Verwijder filters zoals locatie of bestuurslaag',
  'searchPage.clearFilters': 'Wis alle filters',
  // WebsiteSearch
  'websiteSearch.searchAndFilter': 'Zoek en filter websites',
  'websiteSearch.searchPlaceholder': 'Zoek websites...',
  'websiteSearch.searchAria': 'Zoek websites',
  'websiteSearch.searchHelp': 'Typ om websites te zoeken op naam, URL of samenvatting',
  'websiteSearch.clearQuery': 'Wis zoekopdracht',
  'websiteSearch.filterByType': 'Filter op website type',
  'websiteSearch.allTypes': 'Alle types',
  'websiteSearch.sortInfo': 'Sorteer informatie',
  'websiteSearch.sortInfoAria': 'Meer informatie over sorteren',
  'websiteSearch.sortOptions': 'Sorteer opties',
  'websiteSearch.sortByRelevance': 'Relevantie',
  'websiteSearch.sortByRelevanceDescription': 'Websites gerangschikt op relevantie voor uw onderwerp',
  'websiteSearch.sortByName': 'Naam',
  'websiteSearch.sortByNameDescription': 'Alfabetisch gesorteerd op website naam',
  'websiteSearch.sortByType': 'Type',
  'websiteSearch.sortByTypeDescription': 'Gesorteerd op organisatietype (gemeente, waterschap, etc.)',
  'websiteSearch.sortBy': 'Sorteer websites',
  'websiteSearch.selectionSummary': 'Selectie samenvatting',
  'websiteSearch.selectAll': 'Selecteer alle websites',
  'websiteSearch.deselectAll': 'Deselecteer alle websites',
  'websiteSearch.of': 'van',
  'websiteSearch.websitesSelectedText': 'websites geselecteerd',
  'websiteSearch.ofTotal': '(van {{count}} totaal)',
  'websiteSearch.clearFiltersAria': 'Wis alle filters',
  'websiteSearch.clearFilters': 'Filters wissen',
  // KnowledgePage
  'knowledgePage.title': 'Kennis Netwerk',
  'knowledgePage.manageKg': 'Beheer KG',
  'knowledgePage.graphRAGSearch': 'GraphRAG Zoeken',
  'knowledgePage.deepDiveTutorial': 'Deep Dive Tutorial',
  'knowledgePage.visualizationDescription.graphdb': 'Visueel overzicht van beleid, regelgeving en hun onderlinge relaties via GraphDB.',
  'knowledgePage.visualizationDescription.neo4j': 'Visueel overzicht van beleid, regelgeving en hun onderlinge relaties via Neo4j Visualization Library.',
  'knowledgePage.visualizationDescription.generic': 'Visueel overzicht van beleid, regelgeving en hun onderlinge relaties.',
  'knowledgePage.kgDisabled': 'Kennisgrafiek Uitgeschakeld',
  'knowledgePage.kgDisabledDescription': 'De kennisgrafiek functionaliteit is momenteel uitgeschakeld via feature flags.',
  'knowledgePage.workflowIntegrationDisabled': 'Automatische Populatie Uitgeschakeld',
  'knowledgePage.workflowIntegrationDisabledDescription': 'Automatische populatie vanuit workflows is uitgeschakeld. Nieuwe documenten worden niet toegevoegd.',
  // GraphRAG
  'graphRAG.title': 'GraphRAG Query',
  'graphRAG.description': 'Voer geavanceerde retrieval queries uit die Kennisgrafiek feiten en Vector Search context combineren.',
  'graphRAG.advancedOptions': 'Geavanceerde Opties',
  'graphRAG.naturalLanguageQuery': 'Natuurlijke Taal Query',
  'graphRAG.queryPlaceholder': 'bijv. Wat zijn de regelgevingen met betrekking tot windturbines in woonwijken?',
  'graphRAG.retrievalStrategy': 'Retrieval Strategie',
  'graphRAG.selectStrategy': 'Selecteer strategie',
  'graphRAG.strategy.factFirst': 'Fact-First (KG Prioriteit)',
  'graphRAG.strategy.contextFirst': 'Context-First (Vector Prioriteit)',
  'graphRAG.strategy.hybrid': 'Hybrid (Gebalanceerd)',
  'graphRAG.maxResults': 'Max Resultaten',
  'graphRAG.maxHops': 'Max Hops (Grafiek Traversie)',
  'graphRAG.kgWeight': 'KG Gewicht',
  'graphRAG.vectorWeight': 'Vector Gewicht',
  'graphRAG.enableExplainability': 'Explainability Inschakelen',
  'graphRAG.error': 'Fout',
  'graphRAG.processing': 'Verwerken...',
  'graphRAG.search': 'Zoeken',
  'graphRAG.retrieval': 'Retrieval',
  'graphRAG.ranking': 'Ranking',
  'graphRAG.total': 'Totaal',
  'graphRAG.explanation': 'Uitleg',
  'graphRAG.facts': 'Feiten',
  'graphRAG.context': 'Context',
  'graphRAG.rawJson': 'Ruwe JSON',
  'graphRAG.answerExplanation': 'Antwoord Uitleg',
  'graphRAG.noExplanation': 'Geen uitleg gegenereerd. Probeer de explainability optie in te schakelen.',
  'graphRAG.retrievedFacts': 'Opgehaalde Feiten (Kennisgrafiek)',
  'graphRAG.factsDescription': 'Entiteiten en relaties gevonden in de grafiek.',
  'graphRAG.retrievedContext': 'Opgehaalde Context (Vector Store)',
  'graphRAG.contextDescription': 'Relevante tekst chunks gevonden via vector zoeken.',
  'graphRAG.noFacts': 'Geen feiten opgehaald.',
  'graphRAG.noContext': 'Geen context chunks opgehaald.',
  'graphRAG.source': 'Bron',
  'graphRAG.score': 'Score',
  'graphRAG.path': 'Pad',
  // Tutorial
  'tutorial.notFound': 'Tutorial niet gevonden.',
  'tutorial.backToHelpCenter': 'Terug naar Help Center',
  'tutorial.tip': 'Tip:',
  'tutorial.startTutorial': 'Start tutorial',
  // GraphHelpPanel
  'graphHelp.title': 'Hoe de Grafiek te Vullen',
  'graphHelp.closeHelp': 'Help sluiten',
  'graphHelp.description': 'De navigatiegrafiek wordt automatisch gevuld wanneer u workflows uitvoert met grafiekopbouwende acties.',
  'graphHelp.workflowActionsTitle': 'Workflow Acties Die Nodes Toevoegen',
  'graphHelp.quickStartTitle': 'Snelle Start',
  'graphHelp.step1': 'Ga naar de <a href="/beleidsscan">Workflow pagina</a>',
  'graphHelp.step2': 'Maak of voer een workflow uit die een van de bovenstaande acties bevat',
  'graphHelp.step3': 'Keer hier terug om te zien hoe de grafiek wordt gevuld',
  'graphHelp.runWorkflow': 'Workflow Uitvoeren →',
  'graphHelp.action.iplo': ' - Ontdekt IPLO documenten en pagina\'s',
  'graphHelp.action.officielebekendmakingen': ' - Vindt officiële publicaties',
  'graphHelp.action.exploreWebsites': ' - Voegt ontdekte websites toe',
  'graphHelp.action.bfsExplore': ' - Crawlt websites breedte-eerst',
  'graphHelp.action.googleSearch': ' - Voegt Google zoekresultaten toe',
  // AddDocumentDialog
  'addDocument.documentTitle': 'Document titel',
  'addDocument.selectSource': 'Selecteer bron',
  'addDocument.titleRequired': 'Titel is verplicht',
  'addDocument.contentRequired': 'Inhoud is verplicht',
  'addDocument.urlRequiredForExtraction': 'URL is verplicht om inhoud op te halen',
  'addDocument.invalidUrl': 'Ongeldige URL',
  'addDocument.emptyExtraction': 'Geen inhoud gevonden op deze URL. Controleer of de URL toegankelijk is.',
  'addDocument.contentExtracted': 'Inhoud succesvol opgehaald',
  'addDocument.extractionFailed': 'Fout bij het ophalen van inhoud',
  'addDocument.urlOrContentRequired': 'URL of inhoud is verplicht',
  'addDocument.extracting': 'Inhoud ophalen...',
  'addDocument.extractContent': 'Haal inhoud op',
  // CanonicalDocumentCard
  'documentCard.rejected': 'Afgekeurd',
  'documentCard.notSuitable': 'Niet geschikt',
  'documentCard.copyExplanation': 'Kopieer uitleg',
  'documentCard.whyFound': 'Waarom is dit document gevonden?',
  'documentCard.whyFoundDescription': 'Uitleg over hoe dit document is ontdekt tijdens het AI-geleide crawlen',
  'documentCard.explanation': 'Uitleg',
  'documentCard.loadingExplanation': 'Uitleg laden...',
  'documentCard.strategy': 'Strategie',
  'documentCard.confidence': 'Vertrouwensscore',
  'documentCard.reasoning': 'Redenering',
  'documentCard.detailedExplanation': 'Gedetailleerde uitleg',
  'documentCard.confidence.high': 'Hoge vertrouwen - zeer waarschijnlijk relevant',
  'documentCard.confidence.medium': 'Gemiddeld vertrouwen - waarschijnlijk relevant',
  'documentCard.confidence.low': 'Lager vertrouwen - mogelijk review nodig',
  // Step2ActionButtons
  'step2.scrapingCompleted': 'Scraping voltooid',
  // Step3ActionButtons
  'step3.draftSaved': 'Concept opgeslagen',
  'step3.draftSavedDescription': 'Uw voortgang is opgeslagen. U kunt deze later hervatten.',
  // Step3EmptyStates
  'step3.noDocumentsWithStatus': 'Er zijn geen documenten met de status "{{status}}".',
  'step3.status.pending': 'Te beoordelen',
  'step3.status.approved': 'Goedgekeurd',
  'step3.status.rejected': 'Afgekeurd',
  // KnowledgeGraphVisualizer
  'kgVisualizer.collapseCluster': 'Cluster inklappen',
  'kgVisualizer.expandCluster': 'Cluster uitklappen',
  'kgVisualizer.hideFilters': 'Verberg filters',
  'kgVisualizer.showFilters': 'Toon filters',
  // ExportTemplates
  'exportTemplates.noDescription': 'Geen beschrijving',
  // TestComparison
  'testComparison.selectTestRun': 'Selecteer een test run...',
  'testComparison.noTimestamp': 'Geen timestamp',
  'testComparison.run1': 'Run 1:',
  'testComparison.run2': 'Run 2:',
  // TestAlerts
  'testAlerts.dismissAlert': 'Waarschuwing sluiten',
  // Step3EmptyStates (additional)
  'step3.showAllDocuments': 'Toon alle documenten',
  'step3.showAllDocumentsAria': 'Toon alle documenten (verwijder status filter)',
  'step3.noDocumentsFoundDescription': 'We hebben nog geen documenten gevonden van de geselecteerde websites.',
  'step3.possibleCauses': 'Mogelijke oorzaken:',
  'step3.cause1': 'De scraping is nog bezig - wacht even',
  'step3.cause2': 'De websites bevatten geen relevante documenten',
  'step3.cause3': 'Er is een technische fout opgetreden',
  'step3.scrapeMoreWebsites': 'Scrape meer websites',
  'step3.scrapeMoreWebsitesAria': 'Ga terug naar stap 2 om meer websites te scrapen',
  // KnowledgeGraphVisualizer (additional)
  'kgVisualizer.filterMinWeight': 'Filter op minimaal gewicht',
  'kgVisualizer.resetFilters': 'Reset filters',
  'kgVisualizer.clustersAndEntities': 'clusters ({{entities}} entiteiten)',
  'kgVisualizer.edgesShown': 'edges getoond',
  'kgVisualizer.topEdgesTooltip': 'Toont top {{shown}} belangrijkste edges van {{total}} totaal (limiet: {{limit}} edges)',
  'kgVisualizer.topEdgesOf': '(top {{shown}} van {{total}})',
  'kgVisualizer.expanded': 'uitgevouwen',
  'kgVisualizer.semanticLabelsLoaded': 'Semantische labels geladen',
  // AddDocumentDialog (additional)
  'addDocument.urlPlaceholder': 'https://example.com',
  'addDocument.documentTypePlaceholder': 'Bijv. Web Page, PDF, etc.',
  'addDocument.contentPlaceholder': 'Plak hier de inhoud van het document...',
  // Step2ActionButtons (additional)
  'step2.scrapingInProgress': 'Scraping in uitvoering',
  'step2.progress': 'Voortgang:',
  'step2.remainingTime': 'min resterend',
  'step2.documentsFound': 'documenten gevonden',
  'step2.viewDetails': 'Bekijk details',
  'step2.viewDetailsAria': 'Bekijk uitvoeringslog details',
  'step2.goToStep3': 'Ga naar stap 3: documenten beoordelen',
  'step2.goToStep3WithDocuments': 'Ga naar stap 3: documenten beoordelen ({{count}} documenten gevonden)',
  // SelectedWebsitesSummary
  'selectedWebsitesSummary.title': 'Geselecteerde websites:',
  // Step3SelectAllButton
  'step3SelectAllButton.selectAll': 'Selecteer alles ({{count}})',
  'step3SelectAllButton.deselectAll': 'Deselecteer alles',
  'step3SelectAllButton.selectAllAria': 'Selecteer alle {{count}} documenten',
  'step3SelectAllButton.deselectAllAria': 'Deselecteer alle {{count}} documenten',
  // Step3Header
  'step3Header.title': 'Stap 3: Gevonden Documenten',
  'step3Header.loadingDocuments': 'Documenten worden geladen...',
  'step3Header.documentsFound': 'We hebben {{count}} documenten gevonden van de geselecteerde websites',
  'step3Header.importWorkflow': 'Importeer workflow',
  // Step3ActionButtons (additional)
  'step3.backToStep2': 'Scrape meer websites',
  'step3.backToStep2Aria': 'Ga terug naar stap 2 om meer websites te scrapen',
  'step3.save': 'Sla op',
  'step3.complete': 'Voltooien',
  'step3.completeAria': 'Voltooi de analyse en sla de resultaten op',
  'step3.importWorkflowResultsAria': 'Importeer workflow resultaten',
  'step3.title': 'Stap 3: Documenten beoordelen',
  'step3.foundDocuments': 'Gevonden documenten',
  'step3.tryAgain': 'Probeer opnieuw',
  'step3.tryAgainAria': 'Probeer documenten opnieuw te laden',
  // AddDocumentDialog (additional)
  'addDocument.cancel': 'Annuleren',
  'addDocument.saving': 'Opslaan...',
  'addDocument.add': 'Toevoegen',
  'addDocument.source.web': 'Web',
  'addDocument.source.dso': 'DSO',
  'addDocument.source.rechtspraak': 'Rechtspraak',
  'addDocument.source.wetgeving': 'Wetgeving',
  'addDocument.source.gemeente': 'Gemeente',
  'addDocument.source.pdok': 'PDOK',
  // KnowledgeGraphVisualizer (additional)
  'kgVisualizer.clusterType.type': 'Type',
  'kgVisualizer.clusterType.domain': 'Domein',
  'kgVisualizer.clusterType.jurisdiction': 'Jurisdictie',
  'kgVisualizer.clusterType.category': 'Categorie',
  'kgVisualizer.semanticLabel': 'Semantisch label',
  'kgVisualizer.entity': 'entiteit',
  'kgVisualizer.entities': 'entiteiten',
  'kgVisualizer.loading': 'Laden...',
  'kgVisualizer.errorLoading': 'Fout bij laden van kennisgraaf',
  'kgVisualizer.filters': 'Filters',
  'kgVisualizer.relationType': 'Relatietype',
  'kgVisualizer.entityType': 'Entiteitstype',
  'kgVisualizer.jurisdiction': 'Jurisdictie',
  'kgVisualizer.minWeight': 'Min. gewicht:',
  'kgVisualizer.allTypes': 'Alle types',
  'kgVisualizer.allJurisdictions': 'Alle jurisdicties',
  'kgVisualizer.relationType.appliesTo': 'Geldt voor',
  'kgVisualizer.relationType.constrains': 'Beperkt',
  'kgVisualizer.relationType.definedIn': 'Gedefinieerd in',
  'kgVisualizer.relationType.locatedIn': 'Ligt in',
  'kgVisualizer.relationType.hasRequirement': 'Heeft eis',
  'kgVisualizer.relationType.relatedTo': 'Gerelateerd aan',
  'kgVisualizer.entityType.policyDocument': 'Beleidsdocument',
  'kgVisualizer.entityType.regulation': 'Regelgeving',
  'kgVisualizer.entityType.spatialUnit': 'Ruimtelijke Eenheid',
  'kgVisualizer.entityType.landUse': 'Gebruiksfunctie',
  'kgVisualizer.entityType.requirement': 'Eis',
  'kgVisualizer.withLabels': 'met labels',
  // ExportTemplates (additional)
  'exportTemplates.saving': 'Saving...',
  'exportTemplates.update': 'Update',
  'exportTemplates.create': 'Create',
  'exportTemplates.deleting': 'Deleting...',
  'exportTemplates.delete': 'Delete',
  'exportTemplates.cancel': 'Cancel',
  'exportTemplates.deleteTemplate': 'Delete Template',
  'exportTemplates.deleteConfirm': 'Are you sure you want to delete "{{name}}"? This action cannot be undone.',
  'exportTemplates.templatePreview': 'Template preview for {{format}} format',
  'exportTemplates.templateContent': 'Template Content',
  'exportTemplates.variablesUsed': 'Variables Used',
  // TestAlerts (additional)
  'testAlerts.type.failure': 'Failure',
  'testAlerts.type.regression': 'Regression',
  'testAlerts.type.flakiness': 'Flakiness',
  'testAlerts.type.coverage': 'Coverage',
  'testAlerts.type.performance': 'Performance',
  // Tutorial (additional)
  'tutorial.clickSearch': 'Klik op "Zoeken" in het navigatiemenu aan de linkerkant van het scherm.',
  'tutorial.clickSearchToView': 'Klik op "Zoeken" om de resultaten te bekijken.',
  'tutorial.clickSearchButton': 'Klik op de "Zoeken" knop om je zoekopdracht uit te voeren.',
  'tutorial.title': 'Tutorial:',
  'tutorial.complete': 'Voltooien',
  'tutorial.next': 'Volgende',
  // ExportTemplates (additional)
  'exportTemplates.filterByFormat': 'Filter by format',
  'exportTemplates.namePlaceholder': 'e.g., Custom CSV Export',
  'exportTemplates.descriptionPlaceholder': 'Describe what this template is used for...',
  'exportTemplates.templatePlaceholder': 'Enter template content using {{variable}} syntax...',
  // LibraryFilters
  'libraryFilters.queryIdPlaceholder': 'Voer Query ID in (optioneel)',
  'libraryFilters.workflowRunIdPlaceholder': 'Voer Workflow Run ID in (optioneel)',
  'libraryFilters.removeQueryIdFilter': 'Remove query ID filter',
  'libraryFilters.removeWorkflowRunIdFilter': 'Remove workflow run ID filter',
  'libraryFilters.removeReviewStatusFilter': 'Remove review status filter',
  'libraryFilters.removeSourceFilter': 'Remove source filter',
  'libraryFilters.filterByQueryId': 'Filter op Query ID',
  'libraryFilters.filterByWorkflowRunId': 'Filter op Workflow Run ID',
  'libraryFilters.filterByReviewStatus': 'Filter op Review Status',
  'libraryFilters.filterBySource': 'Filter op Bron',
  'libraryFilters.allStatuses': 'Alle statussen',
  'libraryFilters.pendingReview': 'In afwachting van review',
  'libraryFilters.approved': 'Goedgekeurd',
  'libraryFilters.rejected': 'Afgewezen',
  'libraryFilters.needsRevision': 'Revisie nodig',
  'libraryFilters.allSources': 'Alle bronnen',
  'libraryFilters.queryId': 'Query ID:',
  'libraryFilters.workflowRunId': 'Workflow Run ID:',
  'libraryFilters.status': 'Status:',
  'libraryFilters.source': 'Bron:',
  'libraryFilters.source.dso': 'DSO / STOP-TPOD / IMRO',
  'libraryFilters.source.rechtspraak': 'Rechtspraak',
  'libraryFilters.source.wetgeving': 'Wetgeving',
  'libraryFilters.source.gemeente': 'Gemeente',
  'libraryFilters.source.pdok': 'PDOK',
  'libraryFilters.source.web': 'Web',
  // WebsiteCard
  'websiteCard.deselect': 'Deselecteer',
  'websiteCard.select': 'Selecteer',
  'websiteCard.openInNewTab': 'Open {{title}} in nieuw tabblad',
  // DocumentMetadataTooltip
  'documentMetadata.document': 'Document:',
  'documentMetadata.tapFor': 'Tik voor',
  'documentMetadata.hoverFor': 'Hover voor',
  'documentMetadata.moreInfo': 'meer informatie',
  'documentMetadata.ariaLabel': 'Document metadata',
  // Tutorial (additional)
  'tutorial.fallback': 'Tutorial',
  // Step1QueryConfiguration
  'step1.restoreDraft': 'Herstel draft',
  'step1.restoreDraftAria': 'Herstel uw opgeslagen voortgang',
  'step1.howScanWorks': 'Hoe werkt de scan?',
  'step1.howScanWorksAria': 'Meer informatie over hoe de scan werkt',
  'step1.threeSteps': 'De drie stappen',
  'step1.step1Title': 'Stap 1: Configureer',
  'step1.step1Description': 'Selecteer overheidslaag, instantie en onderwerp voor uw scan.',
  'step1.step2Title': 'Stap 2: Selecteer',
  'step1.step2Description': 'Kies welke websites u wilt scrapen en start het proces.',
  'step1.step3Title': 'Stap 3: Review',
  'step1.step3Description': 'Beoordeel gevonden documenten en bepaal welke relevant zijn.',
  'step1.generateSuggestions': 'Genereer website suggesties',
  'step1.generateSuggestionsAria': 'Genereer website suggesties op basis van uw zoekopdracht',
  'step1.generateSuggestionsDisabled': 'Genereer website suggesties (vul eerst alle verplichte velden in)',
  'step1.toContinueFill': 'Om door te gaan, vul de volgende velden in:',
  'step1.websitesGenerating': 'Websites genereren...',
  'step1.websitesGeneratingAria': 'Websites worden gegenereerd',
  'step1.generateSuggestionsBasedOn': 'Genereer website suggesties op basis van uw zoekopdracht',
  'step1.cancelGeneration': 'Annuleer genereren van websites',
  'step1.cancelGenerationAria': 'Annuleer genereren van websites',
  'step1.missingRequirements': 'Om door te gaan, vul de volgende velden in:',
  'step1.title': 'Stap 1: Configureer uw zoekopdracht',
  'step1.description': 'Selecteer overheidslaag, instantie en onderwerp in één keer',
  'step1.cancel': 'Annuleer',
  // BeleidsscanHeader
  'beleidsscanHeader.logo': 'Ruimtemeesters logo',
  'beleidsscanHeader.help': 'Hulp',
  'beleidsscanHeader.helpAria': 'Hulp en informatie',
  'beleidsscanHeader.helpTitle': 'Open hulp en informatie over de beleidsscan',
  'beleidsscanHeader.startFresh': 'Opnieuw Beginnen',
  'beleidsscanHeader.startFreshAria': 'Start opnieuw zonder concept',
  'beleidsscanHeader.startFreshTitle': 'Start een nieuwe scan zonder het huidige concept te gebruiken',
  'beleidsscanHeader.previousSets': 'Vorige Sets',
  'beleidsscanHeader.previousSetsAria': 'Vorige query sets',
  'beleidsscanHeader.previousSetsTitle': 'Bekijk en laad vorige voltooide query sets',
  'beleidsscanHeader.editMode': 'Bewerkingsmodus',
  'beleidsscanHeader.update': 'Bijwerken',
  'beleidsscanHeader.saveAsNew': 'Opslaan als nieuw',
  'beleidsscanHeader.cancel': 'Annuleren',
  'beleidsscanHeader.complete': 'Voltooien',
  'beleidsscanHeader.backToPortal': 'Terug naar portaal',
  // SubgraphSelector
  'subgraphSelector.fullGraph': 'Volledig Netwerk',
  'subgraphSelector.completeNavigationGraph': 'Volledig navigatienetwerk',
  'subgraphSelector.createNewSubgraph': 'Nieuw Subnetwerk Aanmaken',
  'subgraphSelector.loading': 'Laden...',
  'subgraphSelector.noSubgraphs': 'Nog geen subnetwerken aangemaakt',
  'subgraphSelector.archive': 'Archiveren',
  'subgraphSelector.delete': 'Verwijderen',
  'subgraphSelector.name': 'Naam *',
  'subgraphSelector.description': 'Beschrijving',
  'subgraphSelector.startNodeUrl': 'Start Node URL (optioneel)',
  'subgraphSelector.urlPattern': 'URL Patroon (regex, optioneel)',
  'subgraphSelector.maxDepth': 'Maximale Diepte',
  'subgraphSelector.maxNodes': 'Maximale Nodes',
  'subgraphSelector.createSubgraph': 'Subnetwerk Aanmaken',
  'subgraphSelector.deleteConfirm': 'Weet u zeker dat u dit subnetwerk wilt verwijderen?',
  'subgraphSelector.namePlaceholder': 'bijv. Bodem Thema',
  'subgraphSelector.descriptionPlaceholder': 'Optionele beschrijving...',
  'subgraphSelector.startNodePlaceholder': 'bijv. https://iplo.nl/thema/bodem/',
  'subgraphSelector.urlPatternPlaceholder': 'bijv. /thema/bodem/',
  // CommonCrawl
  'commonCrawl.pleaseEnterQuery': 'Voer een zoekopdracht in',
  'commonCrawl.querySuggestion': 'Voer een URL patroon met wildcards in (bijv. *beleid*)',
  'commonCrawl.invalidCrawlIdMessage': 'Ongeldig Crawl ID:',
  // Sustainability
  'sustainability.title': 'Duurzaamheidsbeleid',
  'sustainability.subtitle': 'Hoe wij AI op een verantwoorde en milieuvriendelijke manier gebruiken',
  'sustainability.intro.title': 'Onze aanpak voor duurzame AI',
  'sustainability.intro.description': 'Bij Beleidsscan nemen we onze verantwoordelijkheid voor het milieu serieus. We hebben verschillende strategieën geïmplementeerd om de ecologische voetafdruk van onze AI-gebruik te minimaliseren, zonder in te boeten aan functionaliteit.',
  'sustainability.caching.title': '1. Intelligente Caching',
  'sustainability.caching.description': 'In plaats van elke keer opnieuw alles te verwerken wanneer u op een knop drukt, slaan we resultaten op in een cache. Dit betekent dat we informatie die we al hebben opgehaald, opnieuw kunnen gebruiken zonder extra AI-verwerking.',
  'sustainability.caching.diagram.title': 'Hoe caching werkt',
  'sustainability.caching.diagram.without': 'Zonder caching',
  'sustainability.caching.diagram.withoutDesc': 'Elke klik = nieuwe AI-verwerking = energieverbruik',
  'sustainability.caching.diagram.with': 'Met caching',
  'sustainability.caching.diagram.withDesc': 'Herhaalde kliks = direct resultaat = geen extra energie',
  'sustainability.caching.diagram.button': 'Knop',
  'sustainability.caching.diagram.server': 'Server',
  'sustainability.caching.diagram.processing': 'Verwerken...',
  'sustainability.caching.diagram.aiProcessing': 'AI Verwerking',
  'sustainability.caching.diagram.instantResult': 'Direct Resultaat!',
  'sustainability.caching.diagram.noAiNeeded': 'Geen AI nodig',
  'sustainability.caching.benefit': 'Door resultaten te cachen, voorkomen we onnodige AI-verwerkingen. Als u bijvoorbeeld meerdere keren op dezelfde knop klikt of dezelfde informatie opvraagt, gebruiken we de opgeslagen versie in plaats van opnieuw AI aan te roepen. Dit bespaart zowel tijd als energie.',
  'sustainability.singleSearch.title': '2. Eén AI-zoekopdracht in plaats van eindeloos Googlen',
  'sustainability.singleSearch.description': 'In plaats van meerdere Google-zoekopdrachten uit te voeren, gebruiken we één gerichte AI-zoekopdracht die alle relevante informatie in één keer vindt. Dit is veel efficiënter dan het uitvoeren van bijvoorbeeld 15 afzonderlijke Google-zoekopdrachten.',
  'sustainability.singleSearch.diagram.title': 'Vergelijking: Meerdere Google-zoekopdrachten vs. Eén AI-zoekopdracht',
  'sustainability.singleSearch.diagram.multiple': '15 Google-zoekopdrachten',
  'sustainability.singleSearch.diagram.multipleDesc': 'Elke zoekopdracht verbruikt energie. 15 zoekopdrachten = 15x energieverbruik + tijd om resultaten te combineren.',
  'sustainability.singleSearch.diagram.single': 'Eén AI-zoekopdracht',
  'sustainability.singleSearch.diagram.singleDesc': 'Eén intelligente zoekopdracht die alle relevante informatie vindt. Veel efficiënter en sneller!',
  'sustainability.singleSearch.diagram.aiSearch': 'AI Zoeken',
  'sustainability.singleSearch.diagram.once': 'Eén keer',
  'sustainability.singleSearch.diagram.comprehensive': 'Uitgebreid',
  'sustainability.singleSearch.diagram.results': 'Resultaten',
  'sustainability.singleSearch.diagram.allInOne': 'Alles in één!',
  'sustainability.singleSearch.diagram.lowEnergyUsage': 'Laag Energieverbruik',
  'sustainability.singleSearch.diagram.highEnergyUsage': 'Hoog Energieverbruik',
  'sustainability.singleSearch.benefit': 'Door één gerichte AI-zoekopdracht te gebruiken in plaats van meerdere Google-zoekopdrachten, verminderen we niet alleen het energieverbruik aanzienlijk, maar krijgen gebruikers ook sneller en completere resultaten. Het is een win-win situatie: beter voor het milieu en beter voor de gebruiker.',
  'sustainability.textReuse.title': '3. Hergebruik van AI-tekst',
  'sustainability.textReuse.description': 'Zelfs de tekst die AI genereert, wordt opgeslagen en hergebruikt. Als dezelfde of vergelijkbare informatie later nodig is, gebruiken we de opgeslagen versie in plaats van opnieuw AI aan te roepen. Dit voorkomt zowel kosten als koolstofuitstoot.',
  'sustainability.textReuse.diagram.title': 'Hoe teksthergebruik werkt',
  'sustainability.textReuse.diagram.comparison': 'Eerste keer: AI genereert en slaat op | Tweede keer: Direct uit cache, geen AI nodig!',
  'sustainability.textReuse.cost.title': 'Kostenbesparing',
  'sustainability.textReuse.cost.description': 'Door AI-gegenereerde tekst op te slaan en te hergebruiken, verminderen we het aantal AI-API-aanroepen aanzienlijk. Dit resulteert in lagere operationele kosten en maakt onze service betaalbaarder.',
  'sustainability.textReuse.carbon.title': 'Koolstofvoetafdruk',
  'sustainability.textReuse.carbon.description': 'Elke AI-verwerking vereist rekenkracht en energie. Door tekst te hergebruiken in plaats van opnieuw te genereren, verminderen we onze koolstofuitstoot aanzienlijk. Elke hergebruikte tekst is een kleine maar belangrijke bijdrage aan een duurzamere toekomst.',
  'sustainability.summary.title': 'Samenvatting',
  'sustainability.summary.point1': 'We cachen zoveel mogelijk om onnodige AI-verwerkingen te voorkomen',
  'sustainability.summary.point2': 'We gebruiken één gerichte AI-zoekopdracht in plaats van meerdere Google-zoekopdrachten',
  'sustainability.summary.point3': 'We slaan AI-gegenereerde tekst op en hergebruiken deze om zowel kosten als koolstofuitstoot te verminderen',
  'sustainability.summary.point4': 'We gebruiken efficiënte algoritmes en optimaliseren onze data-opslag',
  'sustainability.summary.point5': 'We monitoren en verbeteren continu onze energie-efficiëntie',
  'sustainability.summary.commitment': 'We zijn toegewijd aan het continu verbeteren van onze duurzaamheidspraktijken en het minimaliseren van onze ecologische voetafdruk, zonder in te boeten aan de kwaliteit van onze service.',
  'sustainability.additional.title': 'Aanvullende Duurzaamheidspraktijken',
  'sustainability.additional.description': 'Naast onze kernstrategieën implementeren we aanvullende maatregelen om onze ecologische impact verder te verminderen.',
  'sustainability.additional.efficient.title': 'Efficiënte Algoritmes',
  'sustainability.additional.efficient.description': 'We gebruiken geoptimaliseerde algoritmes die minder rekenkracht vereisen. Onze graph traversal en search algoritmes zijn ontworpen om minimaal energie te verbruiken terwijl ze maximale resultaten leveren.',
  'sustainability.additional.data.title': 'Slimme Data-opslag',
  'sustainability.additional.data.description': 'We slaan alleen essentiële data op en gebruiken efficiënte compressie- en indexeringstechnieken. Dit vermindert niet alleen opslagkosten, maar ook de energie die nodig is voor data-opslag en -retrieval.',
  'sustainability.additional.optimization.title': 'Server Optimalisatie',
  'sustainability.additional.optimization.description': 'Onze servers zijn geoptimaliseerd voor energie-efficiëntie. We gebruiken load balancing en automatische scaling om ervoor te zorgen dat we alleen de benodigde resources gebruiken, zonder verspilling.',
  'sustainability.additional.scalable.title': 'Schalable Architectuur',
  'sustainability.additional.scalable.description': 'Onze architectuur is ontworpen om efficiënt te schalen. Dit betekent dat we kunnen groeien zonder proportioneel meer energie te verbruiken, waardoor onze energie-efficiëntie verbetert naarmate we groeien.',
  'sustainability.impact.title': 'Onze Impact',
  'sustainability.impact.description': 'Door onze duurzaamheidsstrategieën te implementeren, hebben we aanzienlijke verbeteringen gerealiseerd in energie-efficiëntie en koolstofuitstoot.',
  'sustainability.impact.cacheReduction': 'Minder AI-verwerkingen door caching',
  'sustainability.impact.searchReduction': 'Minder zoekopdrachten door gecombineerde AI-search',
  'sustainability.impact.textReuse': 'Minder AI-aanroepen door teksthergebruik',
  'sustainability.impact.note': 'Deze percentages zijn gebaseerd op vergelijkingen tussen onze geoptimaliseerde aanpak en traditionele methoden zonder caching en teksthergebruik. De exacte besparingen variëren afhankelijk van gebruikspatronen.',
  'sustainability.cacheHitRate': 'Cache Hit Rate',
  'sustainability.co2Savings': 'CO2 Besparingen',
  'sustainability.costSavings': 'Kostenbesparingen',
  'sustainability.apiCallsAvoided': 'API-aanroepen vermeden',
  'sustainability.energySavings': 'energiebesparingen',
  'sustainability.keyPerformanceIndicators': 'Belangrijkste prestatie-indicatoren',
  'sustainability.target': 'Doel:',
  'sustainability.hits': 'hits',
  'sustainability.requests': 'aanvragen',
  // Neo4jBloom
  'neo4jBloom.checkingAvailability': 'Neo4j Bloom beschikbaarheid controleren...',
  'neo4jBloom.title': 'Neo4j Bloom',
  'neo4jBloom.description': 'Native graph visualisatie met depth-based layouts',
  'neo4jBloom.openInNewWindow': 'Openen in nieuw venster',
  'neo4jBloom.notAvailable': 'Neo4j Bloom niet beschikbaar',
  'neo4jBloom.notAvailableDescription': 'Neo4j Bloom biedt native graph visualisatie met organische depth-based layouts. Om Bloom te gebruiken, moet u het installeren en configureren.',
  'neo4jBloom.setupInstructions': 'Installatie-instructies',
  'neo4jBloom.installTitle': 'Installeer Neo4j Bloom:',
  'neo4jBloom.installRequires': 'Neo4j Bloom vereist Neo4j Enterprise Edition',
  'neo4jBloom.installDownload': 'Download Bloom via Neo4j Desktop of installeer via Neo4j plugins',
  'neo4jBloom.installGuide': 'Volg de officiële Neo4j Bloom installatiegids',
  'neo4jBloom.configureTitle': 'Configureer Bloom URL:',
  'neo4jBloom.configureEnv': 'Stel VITE_NEO4J_BLOOM_URL in uw .env bestand in',
  'neo4jBloom.configureApi': 'Of configureer het in het backend API endpoint',
  'neo4jBloom.accessTitle': 'Toegang tot Bloom:',
  'neo4jBloom.accessPort': 'Bloom draait meestal op poort 7474 of een aangepaste poort',
  'neo4jBloom.accessDefault': 'Standaard URL: http://localhost:7474/browser/',
  'neo4jBloom.tryOpening': 'Probeer Bloom te openen (werkt mogelijk niet als het niet is geïnstalleerd)',
  'neo4jBloom.recheckAvailability': 'Beschikbaarheid opnieuw controleren',
  'neo4jBloom.note': 'Opmerking:',
  'neo4jBloom.noteDescription': 'Neo4j Bloom biedt geavanceerde visualisatiefuncties, waaronder depth-based layouts, organische graph positionering, semantisch zoeken en interactieve verkenning. Het is de aanbevolen tool voor het visualiseren van knowledge graphs met goed depth-begrip.',
  // AIUsage
  'aiUsage.cachePerformance': 'Cache Prestaties',
  'aiUsage.hitRate': 'Hit Rate',
  'aiUsage.cacheHits': 'Cache Hits',
  'aiUsage.cacheMisses': 'Cache Misses',
  'aiUsage.carbonFootprintEstimate': 'Koolstofvoetafdruk Schatting',
  'aiUsage.loadingData': 'AI gebruik data laden...',
  'aiUsage.error': 'Fout:',
  'aiUsage.dailyApiCalls': 'Dagelijkse AI API Aanroepen',
  'aiUsage.date': 'Datum',
  'aiUsage.calls': 'Aanroepen',
  'aiUsage.tokens': 'Tokens',
  'aiUsage.cost': 'Kosten',
  'aiUsage.errors': 'Fouten',
  'aiUsage.llmCalls': 'LLM Aanroepen',
  // Sustainability
  'sustainability.loadingMetrics': 'Metrieken laden...',
  // Neo4jNVL
  'neo4jNVL.noCommunitiesFound': 'Geen communities gevonden in knowledge graph.',
  'neo4jNVL.runWorkflowOrSeed': 'Voer een workflow of seed script uit om het te vullen.',
  'neo4jNVL.knowledgeGraph': 'Knowledge Graph',
  'neo4jNVL.entities': 'entiteiten',
  'neo4jNVL.relationships': 'relaties',
  'neo4jNVL.hierarchical': 'Hiërarchisch',
  'neo4jNVL.forceDirected': 'Force-Directed',
  'neo4jNVL.domains': 'Domeinen',
  'neo4jNVL.filterByDomain': 'Filter op domein',
  'neo4jNVL.domainColorLegend': 'Domein Kleur Legenda',
  // Search
  'search.exportOptions': 'Export Opties',
  // Network
  'network.offline': 'Offline',
  'network.offlineMessage': 'U bent momenteel offline. Sommige functies zijn mogelijk niet beschikbaar.',
  // Performance
  'performance.loadingMetrics': 'Prestatiemetrieken laden...',
  'performance.errorLoading': 'Fout bij laden prestatiemetrieken',
  'performance.retry': 'Opnieuw proberen',
  'performance.noDataAvailable': 'Geen prestatiegegevens beschikbaar',
  'performance.dashboard': 'Prestatie Dashboard',
  'performance.days': 'Dagen',
  'performance.autoRefresh': 'Auto-vernieuwen',
  'performance.refreshing': 'Vernieuwen...',
  'performance.refresh': 'Vernieuwen',
  'performance.p95ResponseTime': 'P95 Reactietijd',
  'sustainability.downloadFailed': 'Rapport downloaden mislukt. Probeer het opnieuw.',
  'sustainability.retry': 'Opnieuw proberen',
  'sustainability.loadMetricsFailed': 'Duurzaamheidsmetrieken laden mislukt',
  'sustainability.downloadJson': 'Downloaden JSON rapport',
  'sustainability.downloadCsv': 'Downloaden CSV rapport',
  'sustainability.downloadPdf': 'Downloaden PDF rapport',
  'sustainability.refreshMetrics': 'Ververs metrieken',
  'admin.fillAllFields': 'Vul alle velden in',
  'admin.createUserFailed': 'Gebruiker aanmaken mislukt',
  'admin.deleteUserFailed': 'Gebruiker verwijderen mislukt',
  'admin.userCreatedSuccess': 'Gebruiker succesvol aangemaakt',
  'admin.userDeletedSuccess': 'Gebruiker succesvol verwijderd',
  'admin.searchPlaceholder': 'Zoeken op naam of e-mail...',
  'admin.fullNamePlaceholder': 'Volledige naam',
  'admin.passwordMinPlaceholder': 'Minimaal 6 tekens',
  'workflow.loadPermissionsFailed': 'Machtigingen laden mislukt',
  'workflow.userIdRequired': 'Gebruikers-ID vereist',
  'workflow.shareFailed': 'Workflow delen mislukt',
  'workflow.removeAccessFailed': 'Toegang verwijderen mislukt',
  'workflow.updatePermissionFailed': 'Machtiging bijwerken mislukt',
  'workflow.updateVisibilityFailed': 'Zichtbaarheid bijwerken mislukt',
  'workflow.userPlaceholder': 'Gebruikers-ID of e-mail',
  'workflow.sharedSuccess': 'Workflow gedeeld',
  'workflow.accessRemovedSuccess': 'Toegang verwijderd',
  'workflow.permissionUpdatedSuccess': 'Machtiging bijgewerkt',
  'workflow.visibilityUpdatedSuccess': 'Zichtbaarheid bijgewerkt',
  'workflow.permissionLevels.owner': 'Eigenaar',
  'workflow.permissionLevels.editor': 'Bewerker',
  'workflow.permissionLevels.runner': 'Runner',
  'workflow.permissionLevels.viewer': 'Bekijker',
  'workflow.permissionLevels.ownerDesc': 'Volledige controle',
  'workflow.permissionLevels.editorDesc': 'Kan bewerken en uitvoeren',
  'workflow.permissionLevels.runnerDesc': 'Kan alleen uitvoeren',
  'workflow.permissionLevels.viewerDesc': 'Alleen-lezen',
  'workflow.visibility.private': 'Privé',
  'workflow.visibility.team': 'Team',
  'workflow.visibility.public': 'Openbaar',
  'workflow.visibility.privateDesc': 'Alleen eigenaar en gedeelde gebruikers',
  'workflow.visibility.teamDesc': 'Zichtbaar voor teamleden',
  'workflow.visibility.publicDesc': 'Zichtbaar voor alle gebruikers',
  'admin.validateHierarchyFailed': 'Hiërarchie valideren mislukt',
  'workflow.shareTitle': 'Workflow delen',
  'workflow.loading': 'Laden...',
  'workflow.permissions': 'Machtigingen',
  'workflow.activityLog': 'Activiteitenlogboek',
  'workflow.share': 'Delen',
  'workflow.visibility': 'Zichtbaarheid',
  'workflow.shareWithUser': 'Delen met gebruiker',
  'workflow.currentPermissions': 'Huidige machtigingen',
  'workflow.userIdRequiredDesc': 'Voer een gebruikers-ID of e-mailadres in.',
  'workflow.newOwnerLabel': 'Nieuwe eigenaar gebruikers-ID of e-mail',
  'workflow.transferOwnershipFailed': 'Eigendom overdragen mislukt',
  'workflow.ownershipTransferred': 'Eigendom overgedragen',
  'workflow.ownershipTransferredDesc': 'Eigendom is overgedragen aan {{userId}}',
  'admin.passwordResetSuccess': 'Wachtwoord succesvol gereset',
  'workflow.subjectRequired': 'Onderwerp vereist',
  'workflow.subjectRequiredDesc': 'Dit workflow vereist een onderwerp. Vul het onderwerp veld in en probeer het opnieuw.',
  'workflow.validationError': 'Validatiefout',
  'workflow.invalidParameters': 'Ongeldige parameters',
  'workflow.invalidParametersDesc': 'Controleer de ingevoerde parameters en probeer het opnieuw.',
  'workflow.notFound': 'Workflow niet gevonden',
  'workflow.notFoundDesc': 'De workflow bestaat niet of is niet beschikbaar.',
  'workflow.queueFull': 'Wachtrij vol',
  'workflow.queueFullDesc': 'De workflow wachtrij is vol. Probeer het later opnieuw.',
  'workflow.failed': 'Workflow mislukt',
  'workflow.failedDesc': 'De workflow is gestopt met een fout. Controleer de logs voor details.',
  'workflow.completed': 'Workflow voltooid',
  'workflow.completedDesc': 'Alle stappen zijn succesvol uitgevoerd.',
  'workflow.completedWithErrors': 'Workflow voltooid met fouten',
  'workflow.completedWithErrorsDesc': 'De workflow is voltooid, maar sommige stappen hadden fouten.',
  'workflow.cancelled': 'Workflow geannuleerd',
  'workflow.cancelledDesc': 'De workflow is gestopt.',
  'workflow.statusFetchFailed': 'Kan workflow status niet ophalen',
  'workflow.statusFetchFailedDesc': 'Er zijn problemen met het ophalen van de workflow status. Probeer de pagina te vernieuwen.',
  'workflow.pausedFound': 'Workflow gevonden',
  'workflow.pausedFoundDesc': 'Er is een gepauzeerde workflow gevonden. Gebruik de knop "Hervatten" om door te gaan.',
  'workflow.started': 'Workflow gestart',
  'workflow.startedDesc': 'De workflow is gestart. Volg de voortgang hieronder.',
  'workflow.startedNoProgress': 'Workflow gestart',
  'workflow.startedNoProgressDesc': 'Kan voortgang niet volgen (geen runId ontvangen).',
  'command.completedSuccess': 'Commando succesvol voltooid',
  'command.completedDesc': '{{command}} voltooid in {{duration}}s',
  'command.failed': 'Commando mislukt',
  'command.failedDesc': '{{command}} mislukt na {{duration}}s',
  'command.executeFailed': 'Commando uitvoeren mislukt',
  'commandOutput.title': 'Commando Uitvoer',
  'commandOutput.status.running': 'Bezig...',
  'commandOutput.status.completed': 'Voltooid',
  'commandOutput.status.error': 'Fout',
  'commandOutput.status.idle': 'Inactief',
  'commandOutput.copy': 'Kopiëren',
  'commandOutput.copied': 'Gekopieerd!',
  'commandOutput.clear': 'Wissen',
  'commandOutput.filterPlaceholder': 'Filter uitvoer...',
  'commandOutput.filterAll': 'Alle Logs',
  'commandOutput.filterError': 'Fouten',
  'commandOutput.filterWarning': 'Waarschuwingen',
  'commandOutput.filterSuccess': 'Succes',
  'commandOutput.filterInfo': 'Info',
  'commandOutput.autoScrollPaused': 'Auto-scroll gepauzeerd',
  'commandOutput.noOutputYet': 'Nog geen uitvoer...',
  'commandOutput.noMatchingLogs': 'Geen overeenkomende logs gevonden voor de huidige filters.',
  'workflow.review.resumed': 'Workflow hervat',
  'workflow.review.resumedDesc': 'De workflow is hervat. De review is niet meer beschikbaar.',
  'workflow.review.loadFailed': 'Review laden mislukt',
  'workflow.review.completed': 'Review voltooid. Workflow hervat.',
  'workflow.review.submitFailed': 'Review verzenden mislukt',
  'workflow.review.notFound': 'Review niet gevonden',
  'workflow.review.notFoundDesc': 'De review bestaat niet. De workflow is mogelijk al hervat of er zijn geen kandidaten gevonden.',
  'workflow.review.resumedAndStatus': 'De workflow is hervat en is nu {{status}}. Reviews kunnen alleen worden geopend wanneer de workflow is gepauzeerd.',
  'workflow.review.onlyWhenPaused': 'Reviews kunnen alleen worden geopend wanneer de workflow is gepauzeerd.',
  'workflow.review.loadFailedAfterRetries': 'De review kon niet worden geladen na meerdere pogingen. De workflow is mogelijk al hervat.',
  // WorkflowQualityGates
  'workflowQualityGates.title': 'Quality Gates',
  'workflowQualityGates.checking': 'Controleren...',
  'workflowQualityGates.passed': 'Geslaagd',
  'workflowQualityGates.notMet': 'Niet behaald',
  'workflowQualityGates.allMet': 'Alle quality gates zijn behaald. Klaar om te publiceren!',
  'workflowQualityGates.readyToPublish': 'Klaar om te publiceren!',
  'workflowQualityGates.notMetTitle': 'Quality gates niet behaald',
  'workflowQualityGates.testMetricsSummary': 'Test Metrics Samenvatting:',
  'workflowQualityGates.runs': 'Runs',
  'workflowQualityGates.acceptance': 'Acceptatie',
  'workflowQualityGates.errorRate': 'Foutpercentage',
  // WorkflowTimeout
  'workflowTimeout.warning': 'Workflow Timeout Waarschuwing',
  'workflowTimeout.willTimeoutIn': 'De workflow zal time-out in <strong>{{time}}</strong>.',
  'workflowTimeout.extendOrSave': 'U kunt de timeout verlengen of uw voortgang nu opslaan.',
  'workflowTimeout.extendTimeout': 'Timeout verlengen',
  'workflowTimeout.saveProgress': 'Voortgang opslaan',
  'workflowTimeout.continue': 'Doorgaan',
  'workflowRecovery.title': 'Workflow Herstel',
  'workflowRecovery.description': 'De workflow werd onderbroken, maar er is wat voortgang opgeslagen.',
  'workflowRecovery.completedSteps': 'Voltooide Stappen',
  'workflowRecovery.stepsCompleted': '{{count}} stap(pen) voltooid',
  'workflowRecovery.documentsFound': 'Documenten Gevonden',
  'workflowRecovery.documentsCount': '{{count}} document(en)',
  'workflowRecovery.error': 'Fout',
  'workflowRecovery.resumeWorkflow': 'Workflow Hervatten',
  'workflowRecovery.viewPartialResults': 'Bekijk Gedeeltelijke Resultaten',
  'workflowRecovery.dismiss': 'Sluiten',
  // WorkflowTestMetrics
  'workflowTestMetrics.title': 'Test Metrics',
  'workflowTestMetrics.testRuns': 'Test Runs',
  'workflowTestMetrics.acceptanceRate': 'Acceptatiepercentage',
  'workflowTestMetrics.errorRate': 'Foutpercentage',
  'workflowTestMetrics.lastTestRun': 'Laatste test run:',
  'benchmark.templates.loadFailed': 'Sjablonen laden mislukt',
  'benchmark.templates.nameRequired': 'Naam vereist',
  'benchmark.templates.nameRequiredDesc': 'Voer een sjabloonnaam in',
  'benchmark.templates.typesRequired': 'Benchmark types vereist',
  'benchmark.templates.typesRequiredDesc': 'Selecteer minimaal één benchmark type',
  'benchmark.templates.saved': 'Sjabloon opgeslagen',
  'benchmark.templates.savedDesc': 'Sjabloon "{{name}}" is opgeslagen',
  'benchmark.templates.saveFailed': 'Sjabloon opslaan mislukt',
  'benchmark.templates.deleted': 'Sjabloon verwijderd',
  'benchmark.templates.deletedDesc': 'Sjabloon "{{name}}" is verwijderd',
  'benchmark.templates.deleteFailed': 'Sjabloon verwijderen mislukt',
  'benchmark.featureFlags.loadFailed': 'Feature flags laden mislukt',
  'featureFlags.noManageableFlags': 'Geen beheerbare feature flags',
  'featureFlags.noFlagsInCategory': 'Geen flags in categorie "{{category}}"',
  'featureFlags.allCategories': 'Alle Categorieën',
  'featureFlags.noFlagsAvailable': 'Geen feature flags beschikbaar',
  'featureFlags.configureFirst': 'Configureer eerst feature flags.',
  'featureFlags.loadFailed': 'Feature flags laden mislukt. Probeer het opnieuw.',
  'featureFlags.filterByCategory': 'Filter op categorie',
  'featureFlags.viewDependencies': 'Bekijk afhankelijkheden',
  'workflowActions.exportJson': 'Exporteer JSON',
  'workflowActions.exportJsonTitle': 'Exporteer workflow configuratie als JSON bestand',
  'workflowActions.duplicate': 'Dupliceer',
  'workflowActions.duplicateTitle': 'Maak een kopie van deze workflow',
  'workflowActions.duplicating': 'Dupliceren...',
  'workflowActions.share': 'Delen',
  'workflowReview.filterCandidates': 'Filter kandidaten...',
  'workflowReview.sortByRelevance': 'Sorteer op relevantie',
  'workflowReview.sortByBoostScore': 'Sorteer op boost score',
  'workflowReview.sortByTitle': 'Sorteer op titel',
  'workflowReview.sortByUrl': 'Sorteer op URL',
  'workflowReview.accepted': 'Geaccepteerd',
  'workflowReview.rejected': 'Afgewezen',
  'workflowReview.pending': 'In afwachting',
  'workflowReview.reviewProgress': 'Review Voortgang',
  'workflowReview.total': 'Totaal',
  'workflowReview.filtered': 'Gefilterd',
  'workflowReview.selectAllVisible': 'Selecteer Alle Zichtbare',
  'workflowReview.deselectAllVisible': 'Deselecteer Alle Zichtbare',
  'workflowReview.acceptAllVisible': 'Accepteer Alle Zichtbare',
  'workflowReview.rejectAllVisible': 'Wijs Alle Zichtbare Af',
  'workflowReview.selectAll': 'Selecteer Alles',
  'workflowReview.deselect': 'Deselecteer',
  'workflowReview.submit': 'Verzenden',
  'workflowReview.candidatesShown': '{{count}} kandidaat{{plural}} getoond',
  'workflowReview.submitting': 'Verzenden...',
  'workflowReview.saveAndContinue': 'Opslaan & Doorgaan ({{count}} geaccepteerd)',
  'workflowReview.boost': 'Boost',
  'workflowReview.score': 'Score',
  'workflowReview.showLess': 'Minder tonen',
  'workflowReview.showMore': 'Meer tonen',
  'workflowReview.metadata': 'Metadata',
  'admin.failedToResolveError': 'Fout oplossen mislukt',
  'admin.failedToResolveTestErrors': 'Test fouten oplossen mislukt',
  'admin.failedToCheckSystemHealth': 'Systeem gezondheid controleren mislukt',
  'admin.failedToExportLogs': 'Logs exporteren mislukt',
  'admin.failedToUpdateThreshold': 'Drempel bijwerken mislukt',
  'admin.failedToApplyTemplate': 'Sjabloon toepassen mislukt',
  'admin.failedToCreateSchedule': 'Schema aanmaken mislukt',
  'admin.failedToDeleteSchedule': 'Schema verwijderen mislukt',
  'admin.failedToExportAuditLogs': 'Audit logs exporteren mislukt',
  'admin.noMetricsDataAvailable': 'Geen metrics gegevens beschikbaar.',
  'admin.pleaseCheckErrorAndRetry': 'Controleer de fout hierboven en probeer het opnieuw.',
  'admin.loading': 'Laden...',
  'admin.errors24h': 'Fouten (24u)',
  'admin.confirmDatabaseCleanup': 'Weet u zeker dat u database cleanup wilt uitvoeren? Dit kan enkele minuten duren.',
  'admin.databaseCleanupStarted': 'Database cleanup gestart...',
  'admin.databaseCleanupCompleted': 'Database cleanup voltooid',
  'admin.databaseCleanupFailed': 'Database cleanup mislukt',
  'admin.runCleanup': 'Cleanup uitvoeren',
  'admin.running': 'Bezig...',
  'admin.filterByComponent': 'Filter op component',
  'admin.filterByProcess': 'Filter op proces',
  'admin.filterByProcessTitle': 'Filter fouten op procesnaam (bijv., backend-server, worker)',
  'admin.filterByTargetId': 'Filter op doel ID',
  'admin.search': 'Zoeken...',
  'admin.action': 'Actie',
  'admin.targetType': 'Doel Type',
  'admin.targetId': 'Doel ID',
  'admin.component': 'Component',
  'admin.process': 'Proces',
  'admin.status': 'Status',
  'admin.statusResolved': 'Opgelost',
  'admin.statusIgnored': 'Genegeerd',
  'admin.totalUsers': 'Totaal Gebruikers',
  'admin.workflows': 'Workflows',
  'admin.runsToday': 'Runs Vandaag',
  'admin.activeToday': 'actief vandaag',
  'admin.automated': 'geautomatiseerd',
  'admin.successRate': '% succespercentage',
  'admin.critical': 'kritiek',
  'admin.severityCritical': 'Kritiek',
  'admin.severityError': 'Fout',
  'admin.severityWarning': 'Waarschuwing',
  'admin.severityInfo': 'Info',
  'workflowComparison.failedToLoadActiveComparisons': 'Actieve vergelijkingen laden mislukt',
  'workflowComparison.failedToFetchStatus': 'Vergelijking status ophalen mislukt',
  'workflowComparison.rateLimited': 'Snelheidsbeperking. Opnieuw proberen met vertraging...',
  'workflowComparison.connectionLost': 'Verbinding verbroken. Kon vergelijking status niet ophalen na {{count}} pogingen.',
  'workflowComparison.connectionIssue': 'Verbindingsprobleem ({{current}}/{{max}}). Opnieuw proberen...',
  'benchmark.settingsComparison': 'Instellingen Vergelijking',
  'benchmark.settingsComparisonDesc': 'Vergelijk verschillende feature flag combinaties',
  'test.failed': 'Mislukt',
  'test.ready': 'Klaar',
  'test.testsRunning': 'Tests worden uitgevoerd...',
  'test.completed': 'Voltooid',
  'test.failedToLoadHistory': 'Test geschiedenis laden mislukt',
  'test.failedToCompareDocuments': 'Documenten vergelijken mislukt',
  'test.failedToLoadMetadata': 'Metadata laden mislukt',
  'test.viewDetails': 'Details bekijken',
  'testExecutionMonitor.title': 'Test Uitvoering',
  'testExecutionMonitor.waitingForStart': 'Wachten op test uitvoering om te starten...',
  'testExecutionMonitor.notConnected': 'Niet verbonden. Wachten op WebSocket verbinding...',
  'testExecutionMonitor.calculating': 'Berekenen...',
  'testExecutionMonitor.secondsRemaining': '{{seconds}}s resterend',
  'testExecutionMonitor.timeRemaining': '{{minutes}}m {{seconds}}s resterend',
  'testExecutionMonitor.progress': 'Voortgang',
  'testExecutionMonitor.total': 'Totaal',
  'testExecutionMonitor.passed': 'Geslaagd',
  'testExecutionMonitor.failed': 'Mislukt',
  'testExecutionMonitor.skipped': 'Overgeslagen',
  'testExecutionMonitor.completed': 'Voltooid',
  'testExecutionMonitor.currentTest': 'Huidige Test',
  'testExecutionMonitor.started': 'Gestart',
  'testExecutionMonitor.estimatedRemaining': 'Geschat Resterend',
  'testExecutionMonitor.testResults': 'Test Resultaten',
  'testExecutionMonitor.output': 'Uitvoer',
  'testProgressBar.title': 'Test Voortgang',
  'testProgressBar.tests': 'tests',
  'testProgressBar.complete': 'voltooid',
  'testProgressBar.remaining': 'resterend',
  'testProgressBar.allTestsCompleted': 'Alle tests voltooid',
  'dashboardMainContent.topFlakyTests': 'Top Flaky Tests:',
  'dashboardMainContent.pass': 'pass',
  'dashboardMainContent.flake': 'flake',
  'dashboardMainContent.andMore': '... en {{count}} meer',
  'dashboardMainContent.clickToViewDetails': 'Klik om gedetailleerde flake detectie analyse te bekijken',
  'dashboardMainContent.noFlakyTestsData': 'Geen flaky tests gegevens beschikbaar',
  'dashboardMainContent.viewDetailedTrends': 'Bekijk Gedetailleerde Trends',
  'dashboardMainContent.overallPassRate': 'Algehele Slagingspercentage',
  'dashboardMainContent.averageDuration': 'Gemiddelde Duur',
  'dashboardMainContent.acrossRuns': 'Over {{count}} runs',
  'dashboardMainContent.totalTests': 'Totaal Tests',
  'dashboardMainContent.testSummary': '{{passed}} geslaagd, {{failed}} mislukt, {{skipped}} overgeslagen',
  'dashboardMainContent.failureRate': 'Foutpercentage',
  'dashboardMainContent.viewFull': 'Bekijk Volledig',
  'errorExplorer.title': 'Fouten Verkenner',
  'errorExplorer.description': 'Filter, zoek en verken test fouten',
  'errorExplorer.loadingErrors': 'Fouten laden...',
  'errorExplorer.noErrorsFound': 'Geen fouten gevonden',
  'errorExplorer.tryAdjustingFilters': 'Probeer je filters aan te passen',
  'errorExplorer.errorMessage': 'Foutmelding',
  'errorExplorer.noDetails': 'Geen details',
  'errorExplorer.category': 'Categorie',
  'errorExplorer.severity': 'Ernst',
  'errorExplorer.testFile': 'Test Bestand',
  'errorExplorer.occurrences': 'Voorkomens',
  'errorExplorer.actions': 'Acties',
  'errorDetailDialog.errorMessage': 'Foutmelding',
  'errorDetailDialog.category': 'Categorie',
  'errorDetailDialog.severity': 'Ernst',
  'errorDetailDialog.occurrences': 'Voorkomens',
  'errorDetailDialog.title': 'Fout Details',
  'errorDetailDialog.description': 'Gedetailleerde informatie over fout patroon',
  'errorDetailDialog.failedToLoad': 'Fout details laden mislukt',
  'errorDetailDialog.loading': 'Fout details laden...',
  'errorDetailDialog.stackTrace': 'Stack Trace',
  'errorDetailDialog.occurrenceTimeline': 'Voorkomen Tijdlijn',
  'errorDetailDialog.occurrencesCount': '{{count}} voorkomens',
  'errorDetailDialog.noTimelineData': 'Geen tijdlijn gegevens beschikbaar',
  'errorDetailDialog.affectedTestFiles': 'Getroffen Test Bestanden',
  'errorDetailDialog.noAffectedTestFiles': 'Geen getroffen test bestanden',
  'errorDetailDialog.relatedErrors': 'Gerelateerde Fouten',
  'errorDetailDialog.similar': 'vergelijkbaar',
  'errorDetailDialog.firstSeen': 'Eerst Gezien',
  'errorDetailDialog.lastSeen': 'Laatst Gezien',
  'testFailureAnalysis.searchPatterns': 'Zoek patronen...',
  'testFailureAnalysis.allSeverities': 'Alle Ernstniveaus',
  'testFailureAnalysis.critical': 'Kritiek',
  'testFailureAnalysis.high': 'Hoog',
  'testFailureAnalysis.medium': 'Gemiddeld',
  'testFailureAnalysis.low': 'Laag',
  'testFailureAnalysis.allCategories': 'Alle Categorieën',
  'wizardSessionError.title': 'Sessie Aanmaken Mislukt',
  'wizardSessionError.networkError': 'Er is een netwerkfout opgetreden. Controleer uw internetverbinding en probeer het opnieuw.',
  'wizardSessionError.timeoutError': 'Het aanmaken van de sessie duurt langer dan verwacht. Probeer het opnieuw.',
  'wizardSessionError.serverError': 'De server heeft een fout gerapporteerd. Probeer het over een paar momenten opnieuw.',
  'wizardSessionError.connectionError': 'Kan geen verbinding maken met de server. Controleer of de server actief is.',
  'wizardSessionError.unknownError': 'Er is een onbekende fout opgetreden bij het aanmaken van de wizard sessie.',
  'wizardSessionError.retrying': 'Opnieuw proberen...',
  'wizardSessionError.retryAttempt': 'Poging {{attempt}} van 3',
  'wizardSessionError.technicalDetails': 'Technische Details (Alleen in Development)',
  'wizardSessionError.code': 'Code',
  'wizardSessionError.message': 'Bericht',
  'wizardSessionError.retryable': 'Retryable',
  'wizardSessionError.retryAriaLabel': 'Probeer opnieuw om wizard sessie aan te maken',
  'wizardSessionError.retry': 'Opnieuw Proberen',
  'wizardSessionError.continueWithDraftAriaLabel': 'Ga door met opgeslagen concept',
  'wizardSessionError.continueWithDraft': 'Doorgaan met Concept',
  'wizardSessionError.startFreshAriaLabel': 'Start opnieuw zonder concept',
  'wizardSessionError.startFresh': 'Opnieuw Beginnen',
  'wizardSessionError.goHomeAriaLabel': 'Ga naar home pagina',
  'wizardSessionError.goHome': 'Naar Home',
  'wizardSessionError.tip': 'Tip:',
  'wizardSessionError.helpText': 'Als het probleem aanhoudt, probeer de pagina te verversen of neem contact op met de beheerder.',
  'testDashboard.title': 'Test Dashboard',
  'testDashboard.description': 'Overzicht van test uitvoeringsresultaten en statistieken',
  'testDashboard.lastUpdated': 'Laatst bijgewerkt',
  'testDashboard.enableRealTime': 'Real-time updates inschakelen',
  'testDashboard.disableRealTime': 'Real-time updates uitschakelen',
  'testDashboard.realTimeOn': 'Real-time AAN',
  'testDashboard.realTimeOff': 'Real-time UIT',
  'testDashboard.exportDashboardData': 'Dashboard Gegevens (JSON)',
  'testDashboard.exportTestRunsJson': 'Test Runs (JSON)',
  'testDashboard.exportTestRunsCsv': 'Test Runs (CSV)',
  'testDashboard.keyboardShortcutsTitle': 'Toetsenbord sneltoetsen (druk op ? voor hulp)',
  'testDashboard.shortcuts': 'Sneltoetsen',
  'testDashboard.enableNotifications': 'Meldingen inschakelen',
  'testDashboard.disableNotifications': 'Meldingen uitschakelen',
  'testDashboard.requestNotificationPermission': 'Meldingstoestemming aanvragen',
  'testDashboard.notificationsOn': 'Meldingen AAN',
  'testDashboard.notificationsOff': 'Meldingen UIT',
  'testDashboard.keyboardShortcuts': 'Toetsenbord Sneltoetsen',
  'testDashboard.keyboardShortcutsDescription': 'Gebruik deze toetsenbord sneltoetsen om snel te navigeren en het test dashboard te beheren.',
  'testDashboard.shortcutRefreshDashboard': 'Dashboard Vernieuwen',
  'testDashboard.shortcutRefreshDashboardDesc': 'Herlaad alle dashboard gegevens',
  'testDashboard.shortcutRunAllTests': 'Alle Tests Uitvoeren',
  'testDashboard.shortcutRunAllTestsDesc': 'Start test uitvoering',
  'testDashboard.shortcutExportMenu': 'Export Menu',
  'testDashboard.shortcutExportMenuDesc': 'Schakel export opties',
  'testDashboard.shortcutShowShortcuts': 'Sneltoetsen Tonen',
  'testDashboard.shortcutShowShortcutsDesc': 'Open dit hulp dialoogvenster',
  'testDashboard.shortcutCloseMenu': 'Menu/Dialoog Sluiten',
  'testDashboard.shortcutCloseMenuDesc': 'Sluit elk open menu of dialoog',
  'testDashboard.tip': 'Tip',
  'testDashboard.shortcutsDisabledNote': 'Sneltoetsen zijn uitgeschakeld bij het typen in invoervelden of tekstgebieden.',
  'testDashboard.loading': 'Dashboard laden...',
  'testDashboard.noDataTitle': 'Geen Test Gegevens Beschikbaar',
  'testDashboard.noDataDescription': 'Voer eerst tests uit om dashboard gegevens te genereren.',
  'testDashboard.noDataInstructions': 'Om dashboard gegevens te genereren, voer een van de volgende uit:',
  'testDashboard.quickActions': 'Snelle Acties',
  'testDashboard.quickActionsDescription': 'Veelgebruikte workflow stappen test commando\'s',
  'testDashboard.healthCheck': 'Health Check',
  'testDashboard.healthCheckTitle': 'Voer health check commando uit',
  'testDashboard.runAllTests': 'Alle Tests Uitvoeren',
  'testDashboard.runAllTestsTitle': 'Voer alle workflow stappen tests commando uit',
  'testDashboard.collectBugs': 'Bugs Verzamelen',
  'testDashboard.collectBugsTitle': 'Voer bugs verzamelen commando uit',
  'testDashboard.generateReport': 'Rapport Genereren',
  'testDashboard.generateReportTitle': 'Voer rapport genereren commando uit',
  'testDashboard.note': 'Opmerking',
  'testDashboard.quickActionsNote': 'Klik op een knop hierboven om het commando uit te voeren en de uitvoer in real-time te bekijken. Zie de commando referentie hieronder voor alle 35 beschikbare commando\'s.',
  'testDashboard.passed': 'Geslaagd',
  'testDashboard.failed': 'Mislukt',
  'testDashboard.skipped': 'Overgeslagen',
  'testDashboard.totalTests': 'Totaal Tests',
  'testDashboard.updated': 'Bijgewerkt',
  'testDashboard.flakyTests': 'Flaky Tests',
  'testDashboard.clickToViewDetails': 'Klik om details te bekijken',
  'testExecutionSection.endToEndTestsRun': 'End-to-end Tests Uitvoeren',
  'testExecutionSection.stopTests': 'Tests Stoppen',
  'testExecutionSection.started': 'Gestart',
  'testExecutionSection.processId': 'Proces ID',
  'testExecutionSection.testFile': 'Testbestand',
  'testExecutionSection.error': 'Fout',
  'testExecutionSection.loading': 'Laden...',
  'testExecutionSection.viewLogFiles': 'Logbestanden Bekijken',
  'testExecutionSection.clear': 'Wissen',
  'testExecutionSection.waitingForOutput': 'Wachten op test output...',
  'testExecutionSection.workflowStepsMonitoring': 'Workflow Stappen Test Monitoring',
  'testExecutionSection.loadingWorkflowStatus': 'Workflow stappen status laden...',
  'testExecutionSection.runId': 'Uitvoerings ID',
  'testExecutionSection.active': 'Actief',
  'testExecutionSection.currentStep': 'Huidige Stap',
  'testExecutionSection.step': 'Stap',
  'testExecutionSection.progress': 'Voortgang',
  'testExecutionSection.steps': 'stappen',
  'testExecutionSection.estimatedTimeRemaining': 'Geschatte resterende tijd',
  'testExecutionSection.stepProgress': 'Stap Voortgang',
  'testExecutionSection.completed': 'Voltooid',
  'testExecutionSection.pending': 'In afwachting',
  'testExecutionSection.noWorkflowStepsRunning': 'Geen workflow stappen test actief',
  'testExecutionSection.testLogFiles': 'Test Logbestanden',
  'testExecutionSection.savedTo': 'opgeslagen in',
  'testExecutionSection.logContent': 'Log Inhoud',
  'testExecutionSection.logsAutoSaved': 'Logs worden automatisch opgeslagen op schijf en na 14 dagen opgeruimd. Fouten worden 60 dagen in de database bewaard. Klik op een logbestand om de inhoud te bekijken.',
  'testExecutionSection.runAllTests': 'Alle Tests Uitvoeren',
  'testExecutionSection.resultsReady': 'Testresultaten zijn klaar!',
  'testExecutionSection.pipelineStatus': 'Pipeline Status',
  'testHistoryTimeline.loadingHistory': 'Test geschiedenis laden...',
  'testHistoryTimeline.allTypes': 'Alle Types',
  'testHistoryTimeline.clearFilters': 'Filters Wissen',
  'testHistoryTimeline.status': 'Status:',
  'testHistoryTimeline.time': 'Tijd:',
  'testHistoryTimeline.duration': 'Duur:',
  'testHistoryTimeline.results': 'Resultaten:',
  'testHistoryTimeline.type': 'Type:',
  'testHistoryTimeline.environment': 'Omgeving:',
  'testHistoryTimeline.branch': 'Branch:',
  'testHistoryTimeline.clickToViewDetails': 'Klik om details te bekijken',
  'testHistoryTimeline.passed': 'geslaagd',
  'testHistoryTimeline.failed': 'mislukt',
  'testHistoryTimeline.skipped': 'overgeslagen',
  'testHistoryTimeline.error': 'Fout:',
  'testHistoryTimeline.retry': 'Opnieuw Proberen',
  'testHistoryTimeline.failedToFetch': 'Kan test geschiedenis niet ophalen',
  'testHistoryTimeline.filters': 'Filters',
  'testHistoryTimeline.fromDate': 'Van Datum',
  'testHistoryTimeline.toDate': 'Tot Datum',
  'testHistoryTimeline.testFile': 'Testbestand',
  'testHistoryTimeline.testType': 'Test Type',
  'testHistoryTimeline.allFiles': 'Alle Bestanden',
  'testHistoryTimeline.allStatus': 'Alle Status',
  'testHistoryTimeline.allEnvironments': 'Alle Omgevingen',
  'testHistoryTimeline.applyFilters': 'Filters Toepassen',
  'testHistoryTimeline.zoomOut': 'Uitzoomen',
  'testHistoryTimeline.zoomIn': 'Inzoomen',
  'testHistoryTimeline.reset': 'Reset',
  'testHistoryTimeline.testRunsShown': 'test run(s) getoond',
  'testHistoryTimeline.testExecutionTimeline': 'Test Uitvoering Timeline',
  'testHistoryTimeline.noHistoryFound': 'Geen test geschiedenis gevonden.',
  'testHistoryTimeline.runTestsToSee': 'Voer enkele tests uit om de timeline te zien.',
  'testHistoryTimeline.legend': 'Legenda',
  'testHistoryTimeline.unit': 'Unit',
  'testHistoryTimeline.integration': 'Integratie',
  'testHistoryTimeline.endToEnd': 'End-to-end',
  'testHistoryTimeline.visual': 'Visueel',
  'testHistoryTimeline.performance': 'Prestatie',
  'testHistoryStatistics.title': 'Test Geschiedenis Statistieken',
  'testHistoryStatistics.totalRuns': 'Totaal Runs',
  'testHistoryStatistics.totalTests': 'Totaal Tests',
  'testHistoryStatistics.avgPassRate': 'Gem. Slagingspercentage',
  'testHistoryStatistics.avgDuration': 'Gem. Duur',
  'testAdvancedSearch.advancedSearch': 'Geavanceerd Zoeken',
  'testAdvancedSearch.searchPlaceholder': 'Zoek test runs, testbestanden, branches...',
  'testAdvancedSearch.searching': 'Zoeken...',
  'testAdvancedSearch.search': 'Zoeken',
  'testAdvancedSearch.clear': 'Wissen',
  'testAdvancedSearch.allTypes': 'Alle Types',
  'testDashboardNav.title': '🧪 Test Dashboard',
  'testDashboardNav.dashboard': 'Dashboard',
  'testDashboardNav.analytics': 'Analytics',
  'testDashboardNav.history': 'Geschiedenis',
  'testDashboardNav.performance': 'Prestaties',
  'testDashboardNav.failures': 'Fouten',
  'testDashboardNav.coverage': 'Coverage',
  'testDashboardNav.search': 'Zoeken',
  'testDashboardNav.recommendations': 'Aanbevelingen',
  'testDashboardNav.alerts': 'Waarschuwingen',
  'testDashboardNav.dependencies': 'Afhankelijkheden',
  'testDashboardNav.notifications': 'Meldingen',
  'testDashboardNav.scheduledExports': 'Geplande Exports',
  'testDashboardNav.documentation': 'Test Documentatie',
  'testDashboardNav.reports': 'Rapporten',
  'testDashboardNav.errorAnalysis': 'Fout Analyse',
  // TestTrendsPage
  'testTrends.title': '📈 Test Trend Analyse',
  'testTrends.description': 'Visualiseer test trends, flake detectie, performance drift en foutanalyse',
  'testTrends.refresh': 'Vernieuwen',
  'testTrends.filters': 'Filters',
  'testTrends.timeRange': 'Tijdsbereik:',
  'testTrends.testSuite': 'Test Suite:',
  'testTrends.branch': 'Branch:',
  'testTrends.environment': 'Omgeving:',
  'testTrends.lastDays': 'Laatste {{days}} dagen',
  'testTrends.allSuites': 'Alle Suites',
  'testTrends.allEnvironments': 'Alle Omgevingen',
  'testTrends.passFailTrends': 'Test Geslaagd/Mislukt Trends Over Tijd',
  'testTrends.passRate': 'Slagingspercentage:',
  'testTrends.noTrendsData': 'Geen trends gegevens beschikbaar',
  'testTrends.passed': 'Geslaagd',
  'testTrends.failed': 'Mislukt',
  'testTrends.skipped': 'Overgeslagen',
  'testTrends.flakeDetection': 'Flake Detectie',
  'testTrends.noFlakyTests': 'Geen flaky tests gedetecteerd',
  'testTrends.failedToLoadFlake': 'Kan flake detectie gegevens niet laden',
  'testTrends.totalFlakyTests': 'Totaal flaky tests:',
  'testTrends.testIdSuite': 'Test ID / Suite',
  'testTrends.totalRuns': 'Totaal Runs',
  'testTrends.flakeRate': 'Flake Percentage',
  'testTrends.recentFailures': 'Recente Fouten',
  'testTrends.performanceDrift': 'Performance Drift',
  'testTrends.noTestData': 'Geen test gegevens beschikbaar voor analyse',
  'testTrends.noRegressions': 'Geen performance regressies of waarschuwingen gedetecteerd',
  'testTrends.failedToLoadPerformance': 'Kan performance drift gegevens niet laden',
  'testTrends.currentDuration': 'Huidige Duur',
  'testTrends.baselineDuration': 'Baseline Duur',
  'testTrends.increase': 'Toename',
  'testTrends.status': 'Status',
  'testTrends.trend': 'Trend',
  'testTrends.regressions': 'Regressies:',
  'testTrends.warnings': 'Waarschuwingen:',
  'testTrends.whatBrokeWhen': 'Wat Brak Wanneer',
  'testTrends.noFailuresInRange': 'Geen test fouten in het geselecteerde tijdsbereik',
  'testTrends.failedToLoadTimeline': 'Kan fout timeline gegevens niet laden',
  'testTrends.totalFailures': 'Totaal fouten:',
  'testTrends.uniqueCommits': 'Unieke commits:',
  'testTrends.uniqueTests': 'Unieke tests:',
  'testTrends.commit': 'Commit:',
  'testTrends.failures': 'fout(en)',
  'testTrends.failedTests': 'Mislukte Tests:',
  'testExecution.runTests': 'Tests Uitvoeren',
  'testExecution.failedToStart': 'Tests starten mislukt',
  'testExecution.failedToStartExecution': 'Test uitvoering starten mislukt',
  'testExecution.testFilesLabel': 'Test Bestanden (optioneel - leeg laten om alle tests uit te voeren)',
  'testExecution.testFilesPlaceholder': 'test-bestand.spec.ts, ander-test.spec.ts',
  'testExecution.testFilesDescription': 'Voer test bestandspaden in, gescheiden door komma\'s of nieuwe regels. Laat leeg om alle tests uit te voeren.',
  'testExecution.running': 'Bezig...',
  'testExecution.startTests': 'Tests Starten',
  'testExecution.selectedFiles': 'Geselecteerde bestanden:',
  'testExecutionTimeline.title': '📅 Test Uitvoering Tijdlijn',
  'testExecutionTimeline.viewTimeline': 'Tijdlijn Bekijken',
  'testExecutionTimeline.unknownTime': 'Onbekende tijd',
  'testExecutionTimeline.testResults': '{{passed}} geslaagd, {{failed}} mislukt',
  'testExecutionTimeline.moreRuns': '+{{count}} meer runs',
  'testExecutionTimeline.noData': 'Geen test uitvoeringsgegevens beschikbaar',
  'workflowStepsCommands.title': 'Workflow Stappen Test Commando\'s',
  'workflowStepsCommands.commandsCount': '{{count}} commando\'s',
  'workflowStepsCommands.clickToRun': 'Klik om dit commando uit te voeren',
  'workflowStepsCommands.copyCommand': 'Commando kopiëren',
  'workflowStepsCommands.fullDocumentation': 'Volledige Documentatie',
  'workflowStepsCommands.description': 'Alle 35 pnpm commando\'s voor het workflow stappen test systeem. Klik op een categorie om uit te klappen en commando\'s te zien.',
  'workflowStepsCommands.runDescription': 'Klik op "Uitvoeren" om commando\'s uit te voeren en uitvoer te bekijken.',
  'workflowStepsCommands.quickReference': 'Snelle Referentie:',
  'workflowStepsCommands.quickReferenceDescription': 'Meest gebruikte commando\'s staan in de "Running Tests" en "Health & Validation" categorieën. Klik op het kopieerpictogram naast een commando om het naar je klembord te kopiëren.',
  'workflow.failedToStart': 'Workflow starten mislukt',
  'workflow.failedToNavigateToStep3': 'Navigeren naar stap 3 mislukt',
  'workflow.failedToNavigateToStep1': 'Navigeren naar stap 1 mislukt',
  'workflow.failedToLoadCompletedQueries': 'Voltooide queries laden mislukt',
  'workflowLogs.steps': 'stappen',
  'workflowLogs.estimatedTimeRemaining': 'Geschatte tijd resterend',
  'common.of': 'van',
  'common.selected': 'geselecteerd',
  'common.selectDocument': 'Selecteer document',
  'common.deselectDocument': 'Deselecteer document',
  'admin.errorResolved': 'Fout Opgelost',
  'admin.resolving': 'Oplossen...',
  'admin.resolveTestErrors': 'Los Test Fouten Op',
  'admin.healthy': 'Gezond',
  'admin.unhealthy': 'Niet Gezond',
  'admin.unknown': 'Onbekend',
  'test.autoScrollOn': '📌 Auto-scroll: AAN',
  'test.autoScrollOff': '📌 Auto-scroll: UIT',
  'test.execution.title': 'End-to-end Tests Uitvoeren',
  'test.execution.runAllTests': 'Alle Tests Uitvoeren',
  'test.execution.stopTests': 'Tests Stoppen',
  'test.execution.started': 'Gestart:',
  'test.execution.processId': 'Proces ID:',
  'test.execution.testFile': 'Testbestand:',
  'test.execution.error': 'Fout:',
  'test.execution.resultsReady': 'Testresultaten zijn klaar!',
  'test.execution.loading': 'Laden...',
  'test.execution.viewLogFiles': 'Logbestanden Bekijken',
  'test.execution.logFiles': 'Test Logbestanden',
  'test.execution.savedIn': '(opgeslagen in:',
  'test.execution.logContent': 'Log Inhoud:',
  'test.execution.logsAutoSaved': 'Logs worden automatisch opgeslagen op schijf en na 14 dagen opgeruimd. Fouten worden 60 dagen in de database bewaard. Klik op een logbestand om de inhoud te bekijken.',
  'test.execution.clear': 'Wissen',
  'test.execution.waitingForOutput': 'Wachten op test output...',
  'test.execution.workflowStepsMonitoring': 'Workflow Stappen Test Monitoring',
  'test.execution.loadingStatus': 'Workflow stappen status laden...',
  'test.execution.pipelineStatus': 'Pipeline Status',
  'test.execution.executionId': 'Uitvoerings ID:',
  'test.execution.active': 'Actief',
  'test.execution.currentStep': 'Huidige Stap',
  'test.execution.step': 'Stap',
  'test.execution.progress': 'Voortgang',
  'test.execution.steps': 'stappen',
  'test.execution.estimatedTimeRemaining': 'Geschatte resterende tijd:',
  'test.execution.stepProgress': 'Stap Voortgang',
  'test.execution.completed': 'Voltooid',
  'test.execution.running': 'Actief',
  'test.execution.pending': 'In afwachting',
  'test.execution.noWorkflowStepsActive': 'Geen workflow stappen test actief',
  'test.execution.liveLogs': 'Live Test Logs',
  'test.execution.workflow': 'Workflow:',
  'executionHistory.healthCheck': 'Health Check',
  'executionHistory.collectBugs': 'Bugs Verzamelen',
  'executionHistory.generateReport': 'Rapport Genereren',
  'executionHistory.custom': 'Aangepast',
  'executionHistory.noHistory': 'Nog geen uitvoeringsgeschiedenis',
  'executionHistory.runCommandToSee': 'Voer een commando uit om het hier te zien',
  'executionHistory.rerunCommand': 'Commando opnieuw uitvoeren',
  'testAdvancedSearch.testType': 'Test Type',
  'testAdvancedSearch.status': 'Status',
  'testAdvancedSearch.branch': 'Branch',
  'testAdvancedSearch.filterByBranch': 'Filter op branch...',
  'testAdvancedSearch.limit': 'Limiet',
  'testAdvancedSearch.startDate': 'Start Datum',
  'testAdvancedSearch.endDate': 'Eind Datum',
  'testAdvancedSearch.all': 'Alle',
  'testAdvancedSearch.passed': 'Geslaagd',
  'testAdvancedSearch.failed': 'Mislukt',
  'testAdvancedSearch.partial': 'Gedeeltelijk',
  'testAdvancedSearch.total': 'Totaal',
  'testRunsList.noDataAvailable': 'Geen test gegevens beschikbaar',
  'testRunsList.runTestsFirst': 'Voer eerst tests uit om dashboard gegevens te genereren.',
  'testRunsList.seeInstructions': 'Zie instructies hierboven voor het genereren van test gegevens.',
  'testRunsList.clearFilters': 'Filters Wissen',
  'testRunsList.status': 'Status',
  'testRunsList.testFile': 'Testbestand',
  'testHistoryFilters.allTypes': 'Alle Types',
  'testHistoryFilters.testType': 'Test Type',
  'testHistoryFilters.branch': 'Branch',
  'testHistoryFilters.allBranches': 'Alle Branches',
  'testHistoryFilters.status': 'Status',
  'testHistoryFilters.sortBy': 'Sorteren op',
  'testHistoryFilters.timestamp': 'Tijdstempel',
  'testHistoryFilters.duration': 'Duur',
  'testHistoryFilters.passRate': 'Slagingspercentage',
  'testHistoryFilters.search': 'Zoeken',
  'testHistoryFilters.searchPlaceholder': 'Zoek runs...',
  'testHistoryFilters.order': 'Volgorde',
  'testHistoryFilters.ascending': 'Oplopend',
  'testHistoryFilters.descending': 'Aflopend',
  'testAdvancedSearch.show': 'Toon',
  'testAdvancedSearch.hide': 'Verberg',
  'featureFlags.enabled': 'Ingeschakeld',
  'featureFlags.disabled': 'Uitgeschakeld',
  'featureFlags.title': 'Feature Flags',
  'featureFlags.description': 'Beheer feature flags voor de applicatie',
  'featureFlags.viewTemplates': 'Bekijk Sjablonen',
  'featureFlags.saveAsTemplate': 'Opslaan als Sjabloon',
  'featureFlags.editMode': 'Bewerkmodus',
  'featureFlags.bulkEdit': 'Bulk Bewerken',
  'featureFlags.refreshCache': 'Cache Vernieuwen',
  'featureFlags.saveChanges': 'Wijzigingen Opslaan',
  'featureFlags.cancel': 'Annuleren',
  'featureFlags.environmentVariables': 'Omgevingsvariabelen',
  'featureFlags.flags': 'flags',
  'featureFlags.environment': 'Omgeving',
  'featureFlags.manageableFlags': 'Beheerbare Flags',
  'featureFlags.editModeBadge': 'Bewerkmodus',
  'featureFlags.savedTemplates': 'Opgeslagen Sjablonen',
  'featureFlags.templates': 'sjablonen',
  'featureFlags.default': 'Standaard',
  'featureFlags.public': 'Publiek',
  'featureFlags.createdBy': 'Aangemaakt door:',
  'featureFlags.used': 'Gebruikt',
  'featureFlags.time': 'keer',
  'featureFlags.times': 'keer',
  'featureFlags.flagsDifferFromCurrent': 'flags verschillen van huidige',
  'featureFlags.flagDiffersFromCurrent': 'flag verschilt van huidige',
  'featureFlags.preview': 'Voorvertoning',
  'featureFlags.apply': 'Toepassen',
  'featureFlags.templateName': 'Sjabloon Naam *',
  'featureFlags.templateNamePlaceholder': 'bijv. Productie Config, Test Setup',
  'featureFlags.templateDescription': 'Beschrijving (optioneel)',
  'featureFlags.templateDescriptionPlaceholder': 'Beschrijf waar dit sjabloon voor wordt gebruikt...',
  'featureFlags.makeTemplatePublic': 'Maak sjabloon publiek (zichtbaar voor alle gebruikers)',
  'featureFlags.saveTemplate': 'Sjabloon Opslaan',
  'featureFlags.saving': 'Opslaan...',
  'featureFlags.templatePreview': 'Sjabloon Voorvertoning:',
  'featureFlags.previewOfTemplate': 'Voorvertoning van sjabloon configuratie en verschillen met huidige staat',
  'featureFlags.changes': 'Wijzigingen',
  'featureFlags.flag': 'flag',
  'featureFlags.flagsPlural': 'flags',
  'featureFlags.templateMatchesCurrent': 'Dit sjabloon komt overeen met uw huidige configuratie.',
  'featureFlags.noChangesIfApplied': 'Er zouden geen wijzigingen worden gemaakt als toegepast.',
  'featureFlags.created': 'Aangemaakt:',
  'featureFlags.lastUpdated': 'Laatst bijgewerkt:',
  'featureFlags.usageCount': 'Gebruik aantal:',
  'featureFlags.close': 'Sluiten',
  'featureFlags.applying': 'Toepassen...',
  'featureFlags.applyTemplate': 'Sjabloon Toepassen',
  'featureFlags.discardChanges': 'Wijzigingen Verwerpen?',
  'featureFlags.pendingChangesWillBeLost': 'U heeft {{count}} wijziging(en) in afwachting die verloren gaan als u annuleert. Weet u zeker dat u deze wijzigingen wilt verwerpen?',
  'featureFlags.keepEditing': 'Blijf Bewerken',
  'featureFlags.discardChangesAction': 'Wijzigingen Verwerpen',
  'featureFlags.deleteTemplate': 'Sjabloon Verwijderen',
  'featureFlags.confirmDeleteTemplate': 'Weet u zeker dat u sjabloon "{{name}}" wilt verwijderen? Deze actie kan niet ongedaan worden gemaakt.',
  'featureFlags.delete': 'Verwijderen',
  'featureFlags.bulkEditMode': 'Bulk Bewerkmodus',
  'featureFlags.configureMultipleFlags': 'Configureer meerdere flags tegelijk. Wijzigingen worden toegepast wanneer u opslaat.',
  'featureFlags.applyChanges': 'Wijzigingen Toepassen',
  'featureFlags.applyingChanges': 'Toepassen...',
  'featureFlags.configurationName': 'Configuratie Naam (optioneel)',
  'featureFlags.configurationNamePlaceholder': 'bijv. Productie Setup, Test Config',
  'featureFlags.allEnabled': 'Alles Ingeschakeld',
  'featureFlags.allDisabled': 'Alles Uitgeschakeld',
  'featureFlags.changed': 'Gewijzigd',
  'featureFlags.saveCurrentAsTemplate': 'Huidige Configuratie Opslaan als Sjabloon',
  'featureFlags.saveCurrentAsTemplateDesc': 'Sla de huidige feature flag configuratie op als herbruikbaar sjabloon.',
  'featureFlags.youHavePendingChanges': 'U heeft {{count}} wijziging(en) in afwachting',
  'featureFlags.clickSaveToApply': 'Klik op "Wijzigingen Opslaan" om uw wijzigingen toe te passen',
  'featureFlags.noDependencyInfo': 'Geen afhankelijkheidsinformatie beschikbaar voor deze flag.',
  'featureFlags.dependenciesFor': 'Afhankelijkheden voor',
  'featureFlags.parentFlags': 'Ouder Flags (moeten ingeschakeld zijn)',
  'featureFlags.requiredFlags': 'Vereiste Flags (moeten ingeschakeld zijn)',
  'featureFlags.childFlags': 'Kind Flags (worden uitgeschakeld als ouder wordt uitgeschakeld)',
  'featureFlags.conflictingFlags': 'Conflicterende Flags',
  'featureFlags.mutuallyExclusiveFlags': 'Onderling Uitsluitende Flags',
  'featureFlags.noDependenciesDefined': 'Geen afhankelijkheden gedefinieerd voor deze flag.',
  'featureFlags.templatesTitle': 'Feature Flag Sjablonen',
  'featureFlags.templatesDescription': 'Vooraf geconfigureerde feature flag combinaties voor benchmarking en testen',
  'featureFlags.manageFlags': 'Beheer Flags',
  'featureFlags.noTemplatesFound': 'Geen sjablonen gevonden',
  'featureFlags.enabledCount': 'ingeschakeld',
  'featureFlags.moreFlags': 'meer flags',
  'featureFlags.loadingTemplates': 'Sjablonen laden...',
  'featureFlags.failedToLoadTemplates': 'Sjablonen laden mislukt',
  'featureFlags.tryAgainLater': 'Probeer het later opnieuw',
  'featureFlags.templateApplied': 'Sjabloon toegepast',
  'featureFlags.templateAppliedSuccess': 'Sjabloon "{{name}}" is succesvol toegepast',
  'featureFlags.failedToApplyTemplate': 'Sjabloon toepassen mislukt',
  'featureFlags.benchmark': 'Benchmark',
  'featureFlags.productionFeatureFlags': 'Productie Feature Flags',
  'featureFlags.productionDescription': 'Actieve feature flag configuratie voor productiegebruik. Deze zijn gescheiden van benchmark configuraties.',
  'featureFlags.more': 'meer',
  'common.page': 'Pagina',
  'common.showing': 'Toont',
  'common.to': 'tot',
  'common.entries': 'items',
  'common.runs': 'runs',
  'common.errors': 'fouten',
  'common.reviewed': 'beoordeeld',
  'common.results': 'resultaten',
  'common.hadFailures': 'hadden fouten',
  'common.exporting': 'Exporteren',
  'common.last5Runs': 'Laatste 5 runs',
  'common.last7DaysExecutionFrequency': 'Laatste 7 dagen uitvoeringsfrequentie',
  'common.lastSeen': 'Laatst Gezien',
  'common.resetFilters': 'Filters Resetten',
  'common.emailPlaceholder': 'email1@voorbeeld.nl, email2@voorbeeld.nl',
  'common.userEmailPlaceholder': 'gebruiker@voorbeeld.nl',
  'common.example': 'bijv.',
  'common.allCategories': 'Alle categorieën',
  'common.allStrategies': 'Alle strategieën',
  'admin.filterByUrl': 'Filter op URL...',
  'admin.filterByQuery': 'Filter op query...',
  'admin.errorPattern': 'Fout patroon...',
  'admin.searchErrorMessage': 'Zoek foutmelding...',
  'admin.filterByTestFile': 'Filter op testbestand...',
  'admin.minimumOccurrences': 'Minimum aantal voorkomens',
  'admin.category': 'Categorie',
  'admin.pattern': 'Patroon',
  'admin.errorMessage': 'Foutmelding',
  'admin.testFilePath': 'Testbestand Pad',
  'admin.minOccurrences': 'Min. Voorkomens',
  'workflow.stepIdPlaceholder': 'bijv., stap-1',
  'workflow.stepNamePlaceholder': 'bijv., Ontdek bronnen',
  'workflow.moduleParameters': 'Module Parameters',
  'workflow.noConfigurableParameters': 'Deze module heeft geen configureerbare parameters.',
  'workflow.stepId': 'Stap ID',
  'workflow.stepName': 'Stap Naam',
  'workflow.action': 'Actie',
  'workflow.transferOwnershipConfirm': 'Eigenaarschap overdragen bevestigen',
  'workflow.transferOwnership': 'Eigenaarschap overdragen',
  'workflow.transferWorkflowOwnership': 'Workflow eigenaarschap overdragen',
  'workflow.note': 'Opmerking',
  'workflow.transferOwnershipNote': 'Opmerking bij overdracht',
  'workflow.owner': 'Eigenaar',
  'workflow.noSharedUsers': 'Geen gedeelde gebruikers',
  'workflow.noActivity': 'Geen activiteit',
  'workflow.stepActionPlaceholder': 'bijv., explore_iplo',
  'workflow.workflowIdPlaceholder': 'bijv., planning-documents-nl-municipalities',
  'workflow.allCategories': 'Alle',
  'common.setViaEnvironmentVariable': 'Ingesteld via omgevingsvariabele',
  'common.usesCoseBilkentLayout': 'Gebruikt CoseBilkent layout voor meta-grafiek clusters',
  'common.colorNodesByDomain': 'Kleur nodes op domein in plaats van entiteitstype',
  'common.pendingChange': 'Wijziging in afwachting',
  'admin.resolveTestErrorsTooltip': 'Los alle test-gerelateerde fouten op (invalid-, test-, nonexistent- patronen)',
  'admin.tableMessage': 'Bericht',
  'admin.tableSeverity': 'Ernst',
  'admin.tableComponent': 'Component',
  'admin.tableLocation': 'Locatie',
  'admin.tableOccurrences': 'Voorkomens',
  'admin.tableStatus': 'Status',
  'admin.tableActions': 'Acties',
  'admin.tableName': 'Naam',
  'admin.tableEmail': 'E-mail',
  'admin.tableRole': 'Rol',
  'admin.tableTourGuide': 'Tour Gids',
  'admin.tableLastLogin': 'Laatste Login',
  'admin.labelWebsiteUrl': 'Website URL',
  'admin.labelQuery': 'Query',
  'admin.labelStrategy': 'Strategie',
  'admin.labelStartDate': 'Startdatum',
  'admin.labelEndDate': 'Einddatum',
  'admin.strategyAll': 'Alle strategieën',
  'admin.strategySiteSearch': 'Site Zoeken',
  'admin.strategyAINavigation': 'AI Navigatie',
  'admin.strategyTraditionalCrawl': 'Traditioneel Crawlen',
  'admin.strategyHybrid': 'Hybride',
  'admin.templateAppliedSuccessfully': 'Sjabloon succesvol toegepast',
  'admin.scheduleCreatedSuccessfully': 'Schema succesvol aangemaakt',
  'admin.scheduleNamePlaceholder': 'bijv. Kantooruren',
  'admin.scheduleStartTime': 'Starttijd',
  'admin.scheduleEndTime': 'Eindtijd',
  'admin.scheduleDaysOfWeek': 'Dagen van de week',
  'admin.scheduleThresholds': 'Drempelwaarden',
  'admin.scheduleOptional': 'Optioneel',
  'admin.createThresholdSchedule': 'Drempelwaarde Schema Aanmaken',
  'admin.scheduleName': 'Schema Naam',
  'admin.createSchedule': 'Schema Aanmaken',
  'admin.correctedValue': 'Gecorrigeerde Waarde',
  'admin.enterCorrectedValue': 'Voer gecorrigeerde waarde in',
  'admin.invalidDate': 'Ongeldige datum',
  'admin.invalidStartDate': 'Startdatum is ongeldig.',
  'admin.invalidEndDate': 'Einddatum is ongeldig.',
  'admin.startDateMustBeBeforeEndDate': 'Startdatum moet voor einddatum liggen.',
  'admin.failedToLoadTraces': 'Fout bij laden',
  'admin.failedToLoadTracesDesc': 'Kon traces niet laden: {{error}}',
  'admin.failedToLoadTraceDetails': 'Fout bij laden',
  'admin.failedToLoadTraceDetailsDesc': 'Kon trace details niet laden: {{error}}',
  'admin.tracesExported': 'Geëxporteerd',
  'admin.tracesExportedSuccessfully': 'Traces zijn geëxporteerd.',
  'admin.failedToExportTraces': 'Fout bij exporteren',
  'admin.failedToExportTracesDesc': 'Kon traces niet exporteren: {{error}}',
  'admin.enableTourGuide': 'Schakel tour gids in voor deze gebruiker',
  'admin.disableTourGuide': 'Schakel tour gids uit voor deze gebruiker',
  'beleidsscan.draftSaved': 'Concept opgeslagen',
  'beleidsscan.draftSavedDesc': 'Uw voortgang is opgeslagen. U kunt deze later hervatten.',
  'beleidsscan.saved': 'Opgeslagen',
  'beleidsscan.save': 'Opslaan',
  'beleidsscan.saveButton': 'Sla op',
  'beleidsscan.noDraftFound': 'Geen concept gevonden',
  'beleidsscan.noDraftFoundDesc': 'Er is geen opgeslagen concept om te herstellen.',
  'beleidsscan.scanProgress': 'Scan voortgang',
  'beleidsscan.updateQuery': 'Query bijwerken',
  'beleidsscan.updateQueryTooltip': 'Wijzigingen opslaan in de originele query set',
  'beleidsscan.saveAsNew': 'Opslaan als nieuw',
  'beleidsscan.saveAsNewTooltip': 'Maak een nieuwe query set op basis van deze wijzigingen',
  'beleidsscan.cancelEdit': 'Bewerking annuleren',
  'beleidsscan.cancelEditTooltip': 'Annuleer bewerking en start een nieuwe query',
  'beleidsscan.completeQuery': 'Query voltooien',
  'beleidsscan.saveProgressTooltip': 'Sla uw voortgang op om later verder te gaan',
  // OnderwerpInput
  'onderwerpInput.enterSubject': 'Voer onderwerp in',
  'onderwerpInput.requiredField': 'Verplicht veld',
  'onderwerpInput.optional': 'Optioneel:',
  'onderwerpInput.chooseSuggestionOrType': 'Kies een suggestie of typ uw eigen onderwerp',
  'onderwerpInput.placeholder': 'Typ om te zoeken of kies een suggestie...',
  'onderwerpInput.enterSubjectAria': 'Voer onderwerp in',
  'onderwerpInput.topicSuggestions': 'Onderwerp suggesties',
  'onderwerpInput.popularTopics': 'Populaire onderwerpen',
  'onderwerpInput.recentSearches': 'Recente zoekopdrachten',
  'onderwerpInput.selectTopic': 'Selecteer {{topic}}',
  'onderwerpInput.noSuggestionsFound': 'Geen suggesties gevonden',
  'onderwerpInput.noSuggestionsFoundMessage': 'Geen suggesties gevonden. Typ om te zoeken.',
  'onderwerpInput.searchResults': 'Zoekresultaten',
  'onderwerpInput.subjectValid': 'Onderwerp is geldig',
  'onderwerpInput.characterCount': '{{count}} / 500 karakters',
  'onderwerpInput.minimumCharactersRequired': 'Minimaal 3 karakters vereist',
  'common.pendingReview': 'In afwachting',
  'common.revisionNeeded': 'Revisie nodig',
  'common.approved': 'Goedgekeurd',
  'common.rejected': 'Afgewezen',
  'library.documentAdded': 'Document toegevoegd',
  'library.documentAddedDesc': 'Het document is succesvol opgeslagen.',
  'benchmark.uploadCompleted': 'Upload voltooid',
  'benchmark.uploadCompletedDesc': 'Dataset "{{name}}" is succesvol geüpload.',
  'benchmark.uploadFailed': 'Upload mislukt',
  'benchmark.addQuery': 'Query Toevoegen',
  'benchmark.addDocument': 'Document Toevoegen',
  'library.addDocumentTitle': 'Document toevoegen',
  'library.addDocumentDescription': 'Voeg een document toe aan de bibliotheek',
  'stepNavigation.step1Announcement': 'Stap 1: Configureer uw zoekopdracht',
  'stepNavigation.step2Announcement': 'Stap 2: Selecteer websites',
  'stepNavigation.step3Announcement': 'Stap 3: Documenten beoordelen',
  'common.noDocumentsFound': 'Geen documenten gevonden.',
  'common.noDocumentsFoundWithFilters': 'Geen documenten gevonden die voldoen aan de geselecteerde filters.',
  'common.notSpecified': 'Niet opgegeven',
  'common.failedToLoadGraph': 'Grafiek laden mislukt',
  'common.failedToLoadErrors': 'Fouten laden mislukt',
  'common.sending': 'Verzenden...',
  'common.sendEmail': 'E-mail Verzenden',
  'test.noFlakyTestsDetected': 'Geen flaky tests gedetecteerd',
  'test.oneFlakyTestDetected': '1 flaky test gedetecteerd',
  'test.flakyTestsDetected': '{{count}} flaky tests gedetecteerd',
  'test.passRate': 'Slagingspercentage (%)',
  'common.tryOtherSearchTerms': 'Probeer andere zoektermen of filters',
  'common.usingBackend': 'Gebruikt {{backend}} backend',
  'common.graphDB': 'GraphDB',
  'common.neo4j': 'Neo4j',
  'common.selectNothing': 'Selecteer niets',
  'admin.exportingTraces': 'Traces exporteren...',
  'admin.exportTraces': 'Exporteer traces',
  'admin.hideDecisionDetails': 'Verberg beslissing details',
  'admin.showDecisionDetails': 'Toon beslissing details',
  'benchmark.relevanceScorer': 'Relevantie Scorer',
  'benchmark.relevanceScorerDesc': 'Test verschillende relevantie scoring algoritmes',
  'benchmark.llmReranker': 'LLM Herordening',
  'benchmark.llmRerankerDesc': 'Vergelijk resultaten met en zonder LLM herordening',
  'benchmark.hybridRetrieval': 'Hybride Ophalen',
  'benchmark.hybridRetrievalDesc': 'Test verschillende keyword/semantische gewicht combinaties',
  'benchmark.runAllBenchmarkTypes': 'Voer alle beschikbare benchmark types uit',
  'benchmark.fullBenchmarkSuite': 'Volledige Benchmark Suite',
  'common.exportOptions': 'Export opties',
  'common.export': 'Export',
  'common.exportToCsv': 'Exporteer naar CSV',
  'common.exportToPdf': 'Exporteer naar PDF',
  'common.exportAsCsv': 'Exporteer als CSV',
  'common.exportAsPdf': 'Exporteer als PDF',
  'common.selectedCount': 'geselecteerd',
  'common.emailExport': 'E-mail Export',
  'common.emailExportDescription': 'Voer e-mailadressen van ontvangers in (gescheiden door komma\'s). De export wordt verzonden als CSV bijlage.',
  'common.emailResults': 'E-mail Resultaten',
  'common.recipients': 'Ontvangers',
  'common.includeCitations': 'Citaten opnemen',
  'common.apaFormat': 'APA Formaat',
  'common.customFormat': 'Aangepast Formaat',
  'common.documentActions': 'Document Acties',
  'common.copyUrl': 'URL Kopiëren',
  'common.openInNewTab': 'Open in nieuw tabblad',
  'common.loadingDocuments': 'Documenten worden geladen...',
  'common.loadingDocumentsDescription': 'Even geduld, de documentbibliotheek wordt opgehaald.',
  'common.noDocumentsAvailable': 'Geen documenten beschikbaar.',
  'common.documentenFound': 'gevonden',
  'common.total': 'totaal',
  'common.pageOf': 'van',
  'test.noDashboardDataAvailable': 'Geen dashboard gegevens beschikbaar',
  'test.noTestRunsFound': 'Geen test runs gevonden',
  'common.clusterWithEntities': 'Cluster met {{count}} entiteiten',
  'admin.active': 'Actief',
  'admin.inactive': 'Inactief',
  'admin.activate': 'Activeren',
  'admin.deactivate': 'Deactiveren',
  'admin.enableTour': 'Tour Inschakelen',
  'admin.disableTour': 'Tour Uitschakelen',
  'test.invalidDataFormat': 'Ongeldig dataformaat: recentRuns is geen array',
  'common.unknown': 'Onbekend',
  'workflowComparison.comparisonNotFound': 'Vergelijking niet gevonden. Het kan zijn verwijderd of het ID is ongeldig.',
  'common.loadingKnowledgeGraph': 'Kennisnetwerk laden...',
  'common.errorLoadingGraph': 'Fout bij Laden Grafiek',
  'common.loadingEntities': 'Entiteiten laden...',
  'common.noEntitiesFound': 'Geen entiteiten gevonden',
  'common.failedToFetchCluster': 'Cluster ophalen mislukt: {{status}}',
  'common.failedToFetchEntityMetadata': 'Entiteit metadata ophalen mislukt: {{status}}',
  'common.notAvailable': 'N.v.t.',
  'workflowReview.workflowReview': 'Workflow Review',
  'common.invalidUrl': 'Ongeldige URL',
  'common.invalidUrlMessage': 'Voer een geldige URL in.',
  'common.unknownType': 'Onbekend type',
  'common.unknownAuthority': 'Onbekende instantie',
  'common.unknownDate': 'Onbekende datum',
  'common.concept': 'Concept',
  'common.noTheme': 'Geen thema',
  'common.thisYear': 'Dit jaar',
  'common.lastYear': 'Vorig jaar',
  'common.yearsAgo': '{{count}} jaar geleden',
  'common.olderThan5Years': 'Ouder dan 5 jaar',
  'common.noWebsites': 'Geen websites',
  'common.website': 'website',
  'common.websites': 'websites',
  'admin.confirmDeleteSchedule': 'Weet je zeker dat je dit schema wilt verwijderen?',
  'admin.failedToLoadAIUsageData': 'Laden van AI gebruik gegevens mislukt',
  'common.refreshing': 'Vernieuwen...',
  'common.refresh': 'Vernieuwen',
  'common.noDateAvailable': 'Geen datum beschikbaar',
  'documentPreview.approved': 'Goedgekeurd',
  'documentPreview.approve': 'Goedkeuren',
  'documentPreview.rejected': 'Afgekeurd',
  'documentPreview.reject': 'Afkeuren',
  'documentPreview.documentApproved': 'Document goedgekeurd',
  'documentPreview.documentApprovedDesc': 'Het document is gemarkeerd als relevant.',
  'documentPreview.documentRejected': 'Document afgekeurd',
  'documentPreview.documentRejectedDesc': 'Het document is gemarkeerd als niet relevant.',
  'documentPreview.cannotOpenDocument': 'Kan document niet openen',
  'documentPreview.noUrlAvailable': 'Geen URL beschikbaar voor dit document.',
  'documentPreview.noSummaryAvailable': 'Geen samenvatting beschikbaar.',
  'common.allDocuments': 'Alle documenten',
  'common.notSet': 'Niet ingesteld',
  'groundTruth.failedToLoadDatasets': 'Fout',
  'groundTruth.failedToLoadDatasetsDesc': 'Kan datasets niet laden.',
  'groundTruth.errorLoadingDatasets': 'Fout bij het laden van datasets',
  'groundTruth.confirmDeleteDataset': 'Weet je zeker dat je "{{name}}" wilt verwijderen? Deze actie kan niet ongedaan worden gemaakt.',
  'groundTruth.datasetDeleted': 'Verwijderd',
  'groundTruth.datasetDeletedDesc': 'Dataset "{{name}}" is verwijderd.',
  'groundTruth.datasetDeletedAnnouncement': 'Dataset "{{name}}" is verwijderd',
  'groundTruth.failedToDeleteDataset': 'Fout',
  'groundTruth.failedToDeleteDatasetDesc': 'Kan dataset niet verwijderen.',
  'groundTruth.errorDeletingDataset': 'Fout bij het verwijderen van dataset',
  'groundTruth.failedToLoadDataset': 'Kan dataset niet laden.',
  'groundTruth.datasetNotFound': 'Dataset niet gevonden.',
  'groundTruth.error': 'Fout',
  'groundTruth.veryRelevant': 'Zeer Relevant',
  'groundTruth.relevant': 'Relevant',
  'groundTruth.moderatelyRelevant': 'Matig Relevant',
  'groundTruth.somewhatRelevant': 'Weinig Relevant',
  'groundTruth.notRelevant': 'Niet Relevant',
  'draftManagement.currentStep': 'Huidige stap',
  'draftManagement.queryId': 'Zoekopdracht ID',
  'draftManagement.selectedWebsites': 'Aantal geselecteerde websites',
  'draftManagement.subject': 'Onderwerp',
  'draftManagement.governmentLayer': 'Overheidslaag',
  'draftManagement.selectedEntity': 'Geselecteerde instantie',
  'documentPreview.toReview': 'Te beoordelen',
  'common.governmentType.gemeente': 'Gemeente',
  'common.governmentType.waterschap': 'Waterschap',
  'common.governmentType.provincie': 'Provincie',
  'common.governmentType.rijk': 'Rijksorganisatie',
  'common.governmentType.kennisinstituut': 'Kennisinstituut',
  'bronnenOverzicht.failedToUpdateStatus': 'Fout bij bijwerken status',
  'bronnenOverzicht.failedToUpdateStatusDesc': 'Probeer het opnieuw of controleer uw internetverbinding.',
  'bronnenOverzicht.failedToAddDocument': 'Fout bij toevoegen document',
  'bronnenOverzicht.failedToAddDocumentDesc': 'Probeer het opnieuw of controleer of de URL geldig is.',
  'bronnenOverzicht.failedToDeleteDocument': 'Fout bij verwijderen document',
  'bronnenOverzicht.failedToDeleteDocumentDesc': 'Probeer het opnieuw.',
  'bronnenOverzicht.scanCompleted': 'Scan voltooid',
  'bronnenOverzicht.scanCompletedDesc': '{{documents}} documenten gevonden en {{sources}} nieuwe bronnen voorgesteld.',
  'bronnenOverzicht.scanError': 'Fout tijdens scannen',
  'bronnenOverzicht.scanErrorDesc': 'Probeer het opnieuw of controleer uw internetverbinding.',
  'bronnenOverzicht.addCustomSource': 'Voeg eigen brondocument toe',
  'bronnenOverzicht.documentUrl': 'URL van document',
  'bronnenOverzicht.analyzing': 'Analyseren...',
  'bronnenOverzicht.add': 'Toevoegen',
  'library.documentDisplayError': 'Fout bij weergave document',
  'library.documentDisplayErrorDescription': 'Er is een fout opgetreden bij het weergeven van dit document.',
  'library.documentDisplayErrorHelp': 'Probeer de pagina te vernieuwen. Als het probleem aanhoudt, neem contact op met de beheerder.',
  'errorBoundary.criticalError': 'Kritieke fout',
  'errorBoundary.errorHandlerFailed': 'Foutafhandeling mislukt',
  'benchmark.uploadError': 'Er is een fout opgetreden bij het uploaden van het dataset.',
  'benchmark.comparisonError': 'Er is een fout opgetreden bij de vergelijking.',
  'benchmark.genericError': 'Er is een fout opgetreden.',
  'benchmark.loadingDatasets': 'Datasets laden...',
  'benchmark.noDatasetsAvailable': 'Geen datasets beschikbaar.',
  'benchmark.uploadDatasetFirst': 'Upload eerst een ground truth dataset.',
  'benchmark.workflowVsGroundTruth': 'Workflow vs Ground Truth Vergelijking',
  'benchmark.workflowVsGroundTruthDesc': 'Vergelijk een workflow tegen een ground truth dataset en bekijk precision, recall, F1, NDCG en MAP metrics.',
  'benchmark.workflowLabel': 'Workflow *',
  'benchmark.selectWorkflow': 'Selecteer Workflow',
  'benchmark.selectWorkflowDesc': 'Selecteer één workflow om te vergelijken',
  'benchmark.groundTruthDataset': 'Ground Truth Dataset *',
  'benchmark.uploadNewDataset': 'Upload Nieuw Dataset',
  'benchmark.errorLoadingDatasets': 'Fout',
  'benchmark.errorLoadingDatasetsMessage': 'Kan datasets niet laden.',
  'benchmark.workflowRequired': 'Workflow vereist',
  'benchmark.workflowRequiredMessage': 'Selecteer een workflow.',
  'benchmark.datasetRequired': 'Dataset vereist',
  'benchmark.datasetRequiredMessage': 'Selecteer een ground truth dataset.',
  'benchmark.queryRequired': 'Query vereist',
  'benchmark.queryRequiredMessage': 'Voer een query in.',
  'benchmark.comparisonCompleted': 'Vergelijking voltooid',
  'benchmark.comparisonCompletedMessage': 'De workflow is succesvol vergeleken met de ground truth dataset.',
  'benchmark.comparisonFailed': 'Vergelijking mislukt',
  'benchmark.datasetUploaded': 'Dataset geüpload',
  'benchmark.datasetUploadedMessage': 'Dataset "{{name}}" is succesvol geüpload en geselecteerd.',
  'benchmark.selectDataset': 'Selecteer een dataset',
  'benchmark.benchmarkConfiguration': 'Benchmark Configuration',
  'benchmark.usingCustomConfig': 'Gebruik aangepaste benchmark configuratie',
  'benchmark.usingDefaultConfig': 'Gebruik standaard benchmark configuratie',
  'benchmark.custom': 'Aangepast',
  'benchmark.default': 'Standaard',
  'benchmark.loadingConfiguration': 'Configuratie laden...',
  'benchmark.noConfigurationSet': 'Geen configuratie ingesteld. Standaard instellingen worden gebruikt.',
  'workflowSelector.selectMinMax': 'Selecteer minimaal {{min}} en maximaal {{max}} workflows.',
  'workflowSelector.searchPlaceholder': 'Zoek workflows op naam of ID...',
  'workflowSelector.selectedWorkflows': 'Geselecteerde workflows',
  'workflowSelector.removeWorkflow': 'Verwijder {{name}}',
  'workflowSelector.availableWorkflows': 'Beschikbare workflows',
  'workflowSelector.loadingWorkflows': 'Workflows laden...',
  'workflowSelector.noWorkflowsFound': 'Geen workflows gevonden voor deze zoekopdracht.',
  'workflowSelector.noWorkflowsAvailable': 'Geen workflows beschikbaar.',
  'workflowSelector.maxReached': 'Maximum bereikt',
  'workflowSelector.maxReachedMessage': 'Je kunt maximaal {{max}} workflows selecteren.',
  'workflowComparison.unknownError': 'Onbekende fout',
  'benchmark.config.baseline': 'Baseline configuratie - alle features uitgeschakeld',
  'benchmark.config.hybridOnly': 'Hybrid retrieval ingeschakeld, embeddings uitgeschakeld',
  'benchmark.config.embeddingsOnly': 'Embeddings ingeschakeld, hybrid retrieval uitgeschakeld',
  'benchmark.config.fullHybrid': 'Volledige hybrid retrieval met embeddings',
  'benchmark.config.keywordWeighted': 'Hybrid retrieval met keyword-zware weging (70/30)',
  'benchmark.config.semanticWeighted': 'Hybrid retrieval met semantische-zware weging (30/70)',
  'benchmark.config.withOcr': 'Volledige hybrid met OCR ingeschakeld',
  'benchmark.config.withLearning': 'Volledige hybrid met learning ingeschakeld',
  'benchmark.config.withAiCrawling': 'Volledige hybrid met AI crawling ingeschakeld',
  'benchmark.config.allFeatures': 'Alle features ingeschakeld (maximale performance)',
  'workflowReview.noCandidatesMatch': 'Geen kandidaten komen overeen met uw filters',
  'benchmark.relevantDocuments': 'Relevante Documenten',
  'benchmark.retrievedDocuments': 'Opgehaalde Documenten',
  'benchmark.documentsFound': 'Documenten gevonden',
  'benchmark.totalDocuments': 'Totaal documenten:',
  'benchmark.queryTypeManual': 'Handmatig (specificeer queries)',
  'benchmark.queryTypeCount': 'Aantal (selecteer N queries)',
  'benchmark.queryTypePreset': 'Preset (gebruik vooraf gedefinieerde set)',
  'benchmark.queryTypePresetMulti': 'Preset Multi (selecteer meerdere presets)',
  'benchmark.queryTypeFilter': 'Filter (filter op criteria)',
  'benchmark.loadingPresets': 'Presets laden...',
  'benchmark.queriesInPreset': 'Queries in deze preset:',
  'benchmark.totalQueries': 'Totaal aantal queries:',
  'benchmark.selectedDocuments': 'Geselecteerde Documenten (Relevance aanpassen)',
  'benchmark.largeCandidateList': 'Grote kandidaatlijst gedetecteerd',
  'benchmark.largeCandidateListDescription': 'Toont eerste 1.000 kandidaten voor prestaties. Gebruik filters om resultaten te verfijnen.',
  'draftManagement.step1': 'Stap 1: Configureer',
  'draftManagement.step2': 'Stap 2: Selecteer websites',
  'draftManagement.step3': 'Stap 3: Review documenten',
  'draftManagement.useServerVersion': 'Gebruik server versie (deze is nieuwer)',
  'draftManagement.mergeVersions': 'Slim samenvoegen (behoudt wijzigingen van beide versies)',
  'draftManagement.useLocalVersion': 'Gebruik lokale versie (deze is nieuwer)',
  'draftManagement.divergenceDetected': 'Conceptverschil gedetecteerd',
  'draftManagement.divergenceDescription': 'We hebben een verschil gevonden tussen uw lokaal opgeslagen concept en de versie op de server. Dit kan gebeuren als u op meerdere apparaten werkt of als er wijzigingen zijn opgeslagen terwijl u bezig was.',
  'draftManagement.whatIsDifferent': 'Wat is er anders?',
  'draftManagement.localVersion': 'Uw lokale versie',
  'draftManagement.serverVersion': 'Server versie',
  'draftManagement.newest': 'Nieuwste',
  'draftManagement.savedInBrowser': 'Opgeslagen in uw browser op dit apparaat',
  'draftManagement.savedOnServer': 'Opgeslagen op de server (toegankelijk vanaf alle apparaten)',
  'draftManagement.savedOnServerDescription': 'Dit is de versie die opgeslagen is op onze servers',
  'draftManagement.useLocalButton': 'Gebruik lokale versie',
  'draftManagement.useServerButton': 'Gebruik server versie',
  'draftManagement.mergeButton': 'Slim samenvoegen',
  'step3.documentsLoading': 'Documenten worden geladen...',
  'documentSelector.selectDocuments': 'Selecteer Documenten',
  'documentSelector.searchDocuments': 'Zoek documenten',
  'documentSelector.loadingDocuments': 'Documenten laden...',
  'step3.toReview': 'Te beoordelen',
  'step3.approved': 'Goedgekeurd',
  'step3.rejected': 'Afgekeurd',
  'step3.all': 'Alle',
  'step3.totalDocumentsLabel': 'Totaal documenten:',
  'step3.reviewInfoTitle': 'Alles over het beoordelen en beheren van gevonden documenten',
  'step3.afterReviewing': 'Na het beoordelen van documenten kunt u doorgaan met de analyse. Alleen goedgekeurde documenten worden gebruikt in verdere analyses en rapportages.',
  'benchmark.allQueries': 'Alle queries',
  'benchmark.onlyJsonFilesAllowed': 'Alleen JSON bestanden zijn toegestaan',
  'sustainability.all': 'Alles',
  'benchmark.expandAll': 'Alles Uitklappen',
  'benchmark.collapseAll': 'Alles Inklappen',
  'admin.allLevels': 'Alle Niveaus',
  'step1.infoTitle': 'Alles wat u moet weten over het configureren van uw scan',
  'step1.moreInfo': 'Meer informatie',
  'step1.selectGovernmentLayer': '1. Selecteer overheidslaag',
  'step1.selectGovernmentLayerDescription': 'Kies het type organisatie waar u naar zoekt. Dit bepaalt welke websites we zullen doorzoeken:',
  'step1.municipality': 'Gemeentelijke beleidsdocumenten en websites',
  'step1.waterschap': 'Regionale waterbeheer organisaties',
  'step1.province': 'Provinciaal beleid en regelgeving',
  'step1.national': 'Landelijke beleidsdocumenten',
  'step1.knowledgeInstitute': 'Onderzoeks- en kennisorganisaties',
  'step1.selectEntity': '2. Selecteer instantie',
  'step1.selectEntityDescription': 'Kies een specifieke organisatie (bijv. "Gemeente Amsterdam"). U kunt zoeken door te typen. Voor kennisinstituten hoeft u geen specifieke instantie te selecteren.',
  'step1.enterSubject': '3. Voer onderwerp in',
  'step1.enterSubjectDescription': 'Beschrijf waar u naar zoekt. Tips voor betere resultaten:',
  'step1.enterQuery': '4. Voer zoekopdracht in',
  'step1.enterQueryDescription': 'Voer een specifieke zoekopdracht in voor gerichte resultaten.',
  'step1.selectWebsites': '5. Selecteer websites',
  'step1.selectWebsitesDescription': 'Kies de websites die u wilt doorzoeken.',
  'step1.websitesSelected': 'Websites geselecteerd',
  'step1.websitesSelectedDescription': 'De geselecteerde websites worden gebruikt voor de scan.',
  'step1.websitesSelectedCount': '{{count}} websites geselecteerd',
  'step1.websitesSelectedCountDescription': 'U heeft {{count}} websites geselecteerd voor de scan.',
  'step1.websitesSelectedCountAria': '{{count}} websites geselecteerd',
  'step1.websitesSelectedCountDescriptionAria': '{{count}} websites geselecteerd voor de scan',
  'step1.websitesSelectedCountDescriptionAria2': '{{count}} websites geselecteerd voor de scan',
  'step1.websitesSelectedCountDescriptionAria3': '{{count}} websites geselecteerd voor de scan',
  'step1.websitesSelectedCountDescriptionAria4': '{{count}} websites geselecteerd voor de scan',
  'step1.websitesSelectedCountDescriptionAria5': '{{count}} websites geselecteerd voor de scan',
  'step1.websitesSelectedCountDescriptionAria6': '{{count}} websites geselecteerd voor de scan',
  'step1.websitesSelectedCountDescriptionAria7': '{{count}} websites geselecteerd voor de scan',
  'step1.websitesSelectedCountDescriptionAria8': '{{count}} websites geselecteerd voor de scan',
  'step1.websitesSelectedCountDescriptionAria9': '{{count}} websites geselecteerd voor de scan',
  'step1.websitesSelectedCountDescriptionAria10': '{{count}} websites geselecteerd voor de scan',
  'step1.tip1': 'Gebruik specifieke termen (bijv. "klimaatadaptatie" in plaats van "klimaat")',
  'step1.tip2': 'Combineer onderwerpen (bijv. "arbeidsmigranten huisvesting")',
  'step1.tip3': 'Minimaal 3 karakters, maximaal 500 karakters',
  'step1.tip4': 'Hoe specifieker, hoe relevantere resultaten',
  'step1.whatHappensNext': 'Wat gebeurt er daarna?',
  'step1.whatHappensNextDescription': 'Na het klikken op "Genereer website suggesties" gebruikt onze AI om relevante websites te vinden op basis van uw criteria. Dit kan enkele seconden duren.',
  'common.selectGovernmentLayer': 'Selecteer overheidslaag',
  'common.moreInfo': 'Meer informatie',
  'common.loadingMetrics': 'Metrieken laden...',
  'common.allOperations': 'Alle operaties',
  'common.performance': 'Prestaties',
  'common.performanceMetrics': 'Prestatiemetrieken',
  'common.noCoverageData': 'Geen coverage data beschikbaar',
  'common.runTestsWithCoverage': 'Voer tests uit met coverage om metrieken te genereren',
  'common.performanceRegressionDetected': 'Prestatie regressie gedetecteerd',
  'common.averageDurationIncreased': 'Gemiddelde duur is toegenomen met',
  'common.comparedToPreviousPeriod': 'vergeleken met vorige periode',
  'test.quickLinksToTrendAnalysis': 'Snelle links naar trendanalyse',
  'test.testTrends': 'Test trends',
  'test.identifyFlakyTests': 'Identificeer flaky tests',
  'test.testHealth': 'Test gezondheid',
  'test.failureTimeline': 'Fout tijdlijn',
  'admin.gdsMetricsDashboard': 'GDS Metrieken Dashboard',
  'common.filters': 'Filters',
  'admin.minDegree': 'Min Degree',
  'common.clearFilters': 'Filters wissen',
  'admin.traceDetails': 'Trace Details',
  'admin.completeTraceInformation': 'Volledige trace informatie voor deze crawling sessie',
  'admin.averageMetadataConfidence': 'Gemiddelde metadata vertrouwen',
  'admin.overallMetrics': 'Algemene Metrieken',
  'admin.byMethod': 'Per Methode',
  'admin.correctMetadata': 'Correcte Metadata',
  'admin.qualityReport': 'Kwaliteitsrapport',
  'admin.coverage': 'Coverage',
  'admin.avgConfidence': 'Gem. Vertrouwen',
  'admin.accuracy': 'Nauwkeurigheid',
  'admin.errorRate': 'Foutpercentage',
  'admin.lowConfidence': 'Laag Vertrouwen',
  'admin.documentsWithLowConfidence': 'Documenten met vertrouwen < 50%',
  'admin.errors': 'fouten',
  'admin.callsByOperation': 'Oproepen per Operatie',
  'admin.performanceMetrics': 'Prestatiemetrieken',
  'admin.entityMetadata': 'Entiteit Metadata',
  'admin.loadingMetadata': 'Metadata laden...',
  'admin.fullMetadata': 'Volledige Metadata',
  'admin.minInteractions': 'Min Interacties:',
  'common.help': 'Help',
  'common.open': 'Openen',
  'common.select': 'Selecteer',
  'common.all': 'Alle',
  'common.ok': 'OK',
  'common.reset': 'Resetten',
  'common.continue': 'Doorgaan',
  'common.finish': 'Voltooien',
  'common.start': 'Starten',
  'common.stop': 'Stoppen',
  'common.pause': 'Pauzeren',
  'common.resume': 'Hervatten',
  'common.update': 'Bijwerken',
  'common.create': 'Aanmaken',
  'common.view': 'Bekijken',
  'common.details': 'Details',
  'common.more': 'Meer',
  'common.less': 'Minder',
  'common.show': 'Tonen',
  'common.hide': 'Verbergen',
  'common.copy': 'Kopiëren',
  'common.paste': 'Plakken',
  'common.cut': 'Knippen',
  'common.undo': 'Ongedaan maken',
  'common.redo': 'Opnieuw doen',
  'common.info': 'Info',
  'common.warning': 'Waarschuwing',
  'common.alert': 'Melding',
  'common.required': 'Verplicht',
  'common.optional': 'Optioneel',
  'common.invalid': 'Ongeldig',
  'common.valid': 'Geldig',
  'common.empty': 'Leeg',
  'common.full': 'Vol',
  'common.complete': 'Voltooid',
  'common.incomplete': 'Onvoltooid',
  'common.pending': 'In afwachting',
  'common.active': 'Actief',
  'common.inactive': 'Inactief',
  'common.enabled': 'Ingeschakeld',
  'common.disabled': 'Uitgeschakeld',
  'benchmark.queries': 'Queries:',
  'benchmark.preview': 'Preview',
  'common.type': 'Type:',
  'common.source': 'Bron',
  'admin.gdsMetrics': 'GDS Metrieken',
  'admin.showBottlenecks': 'Toon bottlenecks',
  'admin.bottlenecks': 'bottlenecks',
  'admin.showBottlenecksOnly': 'Toon alleen bottlenecks (betweenness > 1000)',
  'admin.bottlenecksLabel': 'Bottlenecks:',
  'common.nodes': 'nodes',
  'common.dismissError': 'Fout negeren',
  'admin.auditLogs': 'Audit Logs',
  'admin.passwordReset': 'Password Reset',
  'admin.workflowPaused': 'Workflow Paused',
  'admin.workflowResumed': 'Workflow Resumed',
  'admin.thresholdUpdated': 'Threshold Updated',
  'admin.thresholdScheduleCreated': 'Threshold Schedule Created',
  'admin.thresholdScheduleUpdated': 'Threshold Schedule Updated',
  'admin.thresholdScheduleDeleted': 'Threshold Schedule Deleted',
  'admin.ipAddress': 'IP Address',
  'admin.recentErrors': 'Recent Errors',
  'admin.learningServiceDisabled': 'Learning service is disabled.',
  'admin.enableLearningService': 'Enable it by setting LEARNING_ENABLED=true in the server configuration.',
  'admin.performanceAlerts': 'Performance Alerts',
  'admin.performanceDashboard': 'Performance Dashboard',
  'common.sevenDays': '7 Days',
  'test.applicationErrorLogs': 'Application Error Logs',
  'test.loadingErrorLogs': 'Loading error logs...',
  'test.noTestRunsMatchFilters': 'No test runs match the current filters.',
  'test.comparedToPreviousRun': 'Compared to previous run',
  'test.testNotificationMessage': 'This is a test notification from the test dashboard.',
  'test.settingsSavedSuccessfully': 'Settings saved successfully!',
  'common.emailAddresses': 'Email Addresses',
  'test.noActiveFailuresData': 'No active failures data available',
  'test.identifyProblematicErrorPatterns': 'Identify the most problematic error patterns',
  'search.noMunicipalitiesFound': 'Geen gemeenten gevonden.',
  'search.allGovernmentLayers': 'Alle bestuurslagen',
  'step3.toReviewDescription': 'Documenten die nog niet zijn beoordeeld (standaard)',
  'step3.approvedDescription': 'Documenten die relevant zijn voor uw onderzoek',
  'step3.rejectedDescription': 'Documenten die niet relevant zijn',
  'step3.allDescription': 'Toon alle documenten',
  'step3.toReviewOnlyDescription': 'Alleen documenten die nog niet beoordeeld zijn',
  'step3.approvedOnlyDescription': 'Alleen goedgekeurde documenten',
  'step3.rejectedOnlyDescription': 'Alleen afgekeurde documenten',
  'documentCard.suitable': 'Geschikt',
  'configuration.onlyCheckedFlagsOverwritten': 'Alleen aangevinkte flags worden overschreven.',
  'draftManagement.whatDoesEachOption': 'Wat betekent elke optie?',
  'draftManagement.useLocalDescription': 'Gebruik de versie die opgeslagen is in uw browser op dit apparaat.',
  'draftManagement.useServerDescription': 'Gebruik de versie die opgeslagen is op de server (aanbevolen als deze nieuwer is).',
  'draftManagement.mergeDescription': 'Combineer beide versies automatisch om het beste van beide te behouden.',
  'draftManagement.ignoreAndContinue': 'Negeren en doorgaan met huidige versie',
  'draftManagement.startFresh': 'Begin met schone lei',
  'draftManagement.startFreshDescription': 'Verwijder het concept volledig en start met een lege state zonder gebruik te maken van lokaal of server versie.',
  'draftManagement.draftFound': 'Concept gevonden',
  'draftManagement.draftFoundDescription': 'We hebben een opgeslagen concept gevonden. Wilt u deze herstellen?',
  'draftManagement.lastSaved': 'Laatst opgeslagen',
  'draftManagement.step': 'Stap',
  'draftManagement.websitesSelected': 'Websites geselecteerd',
  'draftManagement.documentsFound': 'Documenten gevonden',
  'draftManagement.draftsExpire': 'Concepten verlopen automatisch na 7 dagen inactiviteit.',
  'draftManagement.discardAndContinue': 'Negeren en doorgaan',
  'draftManagement.restore': 'Herstellen',
  'draftManagement.local': 'Lokaal:',
  // DraftRestorePromptDialog
  'draftRestorePromptDialog.title': 'Concept gevonden',
  'draftRestorePromptDialog.description': 'We hebben een opgeslagen concept gevonden. Wilt u deze herstellen?',
  'draftRestorePromptDialog.subject': 'Onderwerp',
  'draftRestorePromptDialog.governmentLayer': 'Overheidslaag',
  'draftRestorePromptDialog.entity': 'Instantie',
  'draftRestorePromptDialog.lastSaved': 'Laatst opgeslagen',
  'draftRestorePromptDialog.step': 'Stap',
  'draftRestorePromptDialog.stepValue': 'Stap {{step}}',
  'draftRestorePromptDialog.websitesSelected': 'Websites geselecteerd',
  'draftRestorePromptDialog.documentsFound': 'Documenten gevonden',
  'draftRestorePromptDialog.expirationNotice': 'Concepten verlopen automatisch na 7 dagen inactiviteit.',
  'draftRestorePromptDialog.ignoreAndContinue': 'Negeren en doorgaan',
  'draftRestorePromptDialog.restore': 'Herstellen',
  'draftManagement.server': 'Server:',
  'draftManagement.recommended': 'Aanbevolen:',
  'previousSets.searchPlaceholder': 'Zoek op onderwerp, instantie of type...',
  'previousSets.noResults': 'Geen resultaten gevonden',
  'previousSets.noCompletedQueries': 'Geen voltooide query sets',
  'previousSets.completeQuerySetToSee': 'Voltooi een query set om deze hier te zien',
  'previousSets.allTypes': 'Alle types',
  'previousSets.sortByDate': 'Sorteer op datum',
  'previousSets.sortByTopic': 'Sorteer op onderwerp',
  'previousSets.sortByEntity': 'Sorteer op instantie',
  'previousSets.loading': 'Laden...',
  'groundTruth.noDatasetsFoundFor': 'Geen datasets gevonden voor "{{query}}"',
  'groundTruth.noDatasetsAvailable': 'Geen datasets beschikbaar',
  'groundTruth.datasetsLoaded': '{{count}} dataset{{plural}} geladen',
  'groundTruth.searchDatasets': 'Zoek datasets',
  'groundTruth.searchDatasetsPlaceholder': 'Zoek datasets...',
  'groundTruth.searchDatasetsAriaLabel': 'Zoek datasets',
  'groundTruth.searchDatasetsDescription': 'Typ om datasets te zoeken op naam of beschrijving',
  'groundTruth.uploadNewDataset': 'Upload nieuw dataset',
  'groundTruth.uploadFirstDataset': 'Upload eerste dataset',
  'groundTruth.datasetInfo': 'Dataset informatie',
  'groundTruth.loadingDatasets': 'Datasets laden...',
  'groundTruth.invalidDatasetIdFormat': 'Ongeldig dataset ID formaat.',
  'groundTruth.searchInQueriesOrUrls': 'Zoek in queries of URLs...',
  'groundTruth.noDatasetsYet': 'Nog geen datasets beschikbaar.',
  'groundTruth.uploadFirstDatasetButton': 'Eerste Dataset Uploaden',
  'groundTruth.datasetsAvailable': '{{count}} dataset{{plural}} beschikbaar',
  // Step3InfoDialogs
  'step3InfoDialogs.helpReviewingDocuments': 'Hulp bij het beoordelen van documenten',
  'step3InfoDialogs.workflowImportInfoAria': 'Informatie over workflow import',
  // WorkflowLogs
  'workflowLogs.key': 'Sleutel',
  'groundTruth.dataset': 'Dataset',
  'groundTruth.queries': 'queries',
  'groundTruth.createdOn': 'Aangemaakt op',
  'groundTruth.actionsFor': 'Acties voor',
  'groundTruth.viewDataset': 'Bekijk dataset',
  'groundTruth.deleteDataset': 'Verwijder dataset',
  // BronnenOverzichtHeader
  'bronnenOverzichtHeader.logo': 'Ruimtemeesters logo',
  'bronnenOverzichtHeader.backToIntake': 'Terug naar intake',
  // WebsiteList
  'websiteList.noWebsitesFound': 'Geen websites gevonden',
  'websiteList.noWebsitesFoundWithFilters': 'Geen websites gevonden met de huidige filters.',
  'websiteList.clearFilters': 'Filters wissen',
  'websiteList.availableWebsites': 'Beschikbare websites',
  // ExportMenu
  'exportMenu.exportFormats': 'Exportformaten',
  'exportMenu.csvDescription': 'Comma-separated values. Ideaal voor Excel, data-analyse en import in andere systemen. Bevat alle documentgegevens in tabelvorm.',
  'exportMenu.jsonDescription': 'Gestructureerd dataformaat. Perfect voor ontwikkelaars, API-integraties en programmatische verwerking van de gegevens.',
  'exportMenu.markdownDescription': 'Leesbaar tekstformaat met opmaak. Geschikt voor documentatie, rapporten en menselijke leesbaarheid. Bevat samenvattingen en relevante informatie.',
  'exportMenu.excelDescription': 'Native Excel-formaat. Direct te openen in Microsoft Excel of Google Sheets. Bevat geoptimaliseerde kolombreedtes en volledige documentgegevens.',
  'exportMenu.allDocuments': 'Alle documenten',
  'exportMenu.filteredDocuments': 'Gefilterde documenten',
  'exportMenu.selectedDocuments': 'Geselecteerde documenten ({{count}})',
  'exportMenu.export': 'Exporteren',
  'exportMenu.exportAs': 'Exporteren als',
  'exportMenu.exportDocumentsAria': 'Exporteren documenten',
  'exportMenu.exportFormatsInfoAria': 'Informatie over exportformaten',
  // Breadcrumb
  'breadcrumb.navigation': 'Breadcrumb',
  'breadcrumb.beleidsscan': 'Beleidsscan',
  'breadcrumb.step1': 'Configureer',
  'breadcrumb.step2': 'Selecteer',
  'breadcrumb.step3': 'Review',
  'breadcrumb.backToOverview': 'Terug naar overzicht',
  // StatusFilterTabs
  'statusFilterTabs.label.all': 'Alle',
  'statusFilterTabs.label.pending': 'Te beoordelen',
  'statusFilterTabs.label.approved': 'Goedgekeurd',
  'statusFilterTabs.label.rejected': 'Afgekeurd',
  'statusFilterTabs.title.all': 'Alle documenten',
  'statusFilterTabs.title.pending': 'Te beoordelen documenten',
  'statusFilterTabs.title.approved': 'Goedgekeurde documenten',
  'statusFilterTabs.title.rejected': 'Afgekeurde documenten',
  'statusFilterTabs.description.all': 'Toont alle gevonden documenten, ongeacht hun status.',
  'statusFilterTabs.description.pending': 'Documenten die nog niet zijn beoordeeld. Deze moeten worden goedgekeurd of afgekeurd.',
  'statusFilterTabs.description.approved': 'Documenten die als relevant zijn gemarkeerd. Deze worden gebruikt in verdere analyses.',
  'statusFilterTabs.description.rejected': 'Documenten die als niet relevant zijn gemarkeerd en uitgesloten worden van verdere analyses.',
  'statusFilterTabs.filterByStatus': 'Filter op status',
  'statusFilterTabs.filterInfo': 'Filter informatie',
  'statusFilterTabs.filterInfoAria': 'Informatie over status filters',
  // DocumentStats
  'documentStats.showing': 'Toont {{filtered}} van {{total}} documenten',
  'documentStats.filtered': '(gefilterd)',
  'documentStats.clearAllFilters': 'Wis alle filters',
  // BulkActionsToolbar
  'bulkActionsToolbar.documentsSelected': '{{count}} document{{plural}} geselecteerd',
  'bulkActionsToolbar.bulkActionsTitle': 'Bulk acties',
  'bulkActionsToolbar.bulkActionsDescription': 'U kunt meerdere documenten tegelijk beoordelen door ze te selecteren met de checkboxes en vervolgens een bulk actie uit te voeren. Dit bespaart tijd bij het beoordelen van grote aantallen documenten.',
  'bulkActionsToolbar.approve': 'Goedkeuren ({{count}})',
  'bulkActionsToolbar.approveAria': 'Goedkeuren {{count}} geselecteerde document{{plural}}',
  'bulkActionsToolbar.reject': 'Afkeuren ({{count}})',
  'bulkActionsToolbar.rejectAria': 'Afkeuren {{count}} geselecteerde document{{plural}}',
  'bulkActionsToolbar.deselect': 'Deselecteer',
  'bulkActionsToolbar.bulkActionsInfo': 'Bulk acties informatie',
  'bulkActionsToolbar.bulkActionsInfoAria': 'Informatie over bulk acties',
  'bulkActionsToolbar.deselectAllSelected': 'Deselecteer alle geselecteerde',
  // FilterPresetDialog
  'filterPresetDialog.title': 'Sla filter preset op',
  'filterPresetDialog.description': 'Geef een naam op voor deze filter combinatie',
  'filterPresetDialog.nameLabel': 'Preset naam',
  'filterPresetDialog.nameRequired': 'Naam vereist',
  'filterPresetDialog.nameRequiredDescription': 'Geef een naam op voor de preset.',
  'filterPresetDialog.presetSaved': 'Preset opgeslagen',
  'filterPresetDialog.presetSavedDescription': '"{{name}}" is opgeslagen.',
  'filterPresetDialog.namePlaceholder': 'Voer preset naam in...',
  // Step2InfoDialog
  'step2InfoDialog.moreInfo': 'Meer informatie',
  'step2InfoDialog.moreInfoStep2': 'Meer informatie over stap 2',
  'step2InfoDialog.title': 'Stap 2: Website selectie en scraping',
  'step2InfoDialog.description': 'Hoe u websites selecteert en wat er gebeurt tijdens het scrapen',
  'step2InfoDialog.websiteSelectionTitle': 'Website selectie',
  'step2InfoDialog.websiteSelectionDescription': 'U kunt websites selecteren en filteren op verschillende manieren:',
  'step2InfoDialog.search': 'Zoeken',
  'step2InfoDialog.searchDescription': 'Zoek op naam of URL van een website',
  'step2InfoDialog.filter': 'Filteren',
  'step2InfoDialog.filterDescription': 'Filter op website type (gemeente, waterschap, etc.)',
  'step2InfoDialog.sort': 'Sorteren',
  'step2InfoDialog.sortDescription': 'Sorteer op relevantie, naam of type',
  'step2InfoDialog.selectAll': 'Selecteer alles',
  'step2InfoDialog.selectAllDescription': 'Selecteer alle gefilterde websites in één keer',
  'step2InfoDialog.scrapingTitle': 'Wat is scraping?',
  'step2InfoDialog.scrapingDescription': 'Tijdens het scrapen worden de geselecteerde websites doorzocht naar relevante documenten:',
  'step2InfoDialog.scrapingPoint1': 'We doorzoeken pagina\'s en documenten op basis van uw onderwerp',
  'step2InfoDialog.scrapingPoint2': 'Relevante documenten worden gevonden en geanalyseerd',
  'step2InfoDialog.scrapingPoint3': 'U kunt de voortgang volgen in real-time via de grafiek visualisatie',
  'step2InfoDialog.scrapingPoint4': 'Het proces kan enkele minuten duren, afhankelijk van het aantal websites',
  'step2InfoDialog.graphVisualizationTitle': 'Grafiek visualisatie',
  'step2InfoDialog.graphVisualizationDescription': 'Tijdens het scrapen ziet u een real-time visualisatie van het navigatienetwerk dat wordt opgebouwd. Dit helpt u begrijpen hoe websites zijn georganiseerd en welke documenten worden gevonden.',
  'step2InfoDialog.tip': 'Tip',
  'step2InfoDialog.tipDescription': 'Selecteer meerdere websites voor een uitgebreidere scan. U kunt altijd later meer websites toevoegen door terug te gaan naar deze stap.',
  // ConsolidatedHelpDialog
  'consolidatedHelpDialog.title': 'Hulp bij Beleidsscan',
  'consolidatedHelpDialog.description': 'Alles wat u moet weten om een succesvolle scan uit te voeren',
  'consolidatedHelpDialog.step1': 'Stap 1',
  'consolidatedHelpDialog.step2': 'Stap 2',
  'consolidatedHelpDialog.step3': 'Stap 3',
  'consolidatedHelpDialog.step1Title': 'Stap 1: Configureer uw zoekopdracht',
  'consolidatedHelpDialog.step1Description': 'Configureer uw scan door overheidslaag, instantie en onderwerp te selecteren.',
  'consolidatedHelpDialog.step1SelectLayer': '1. Selecteer overheidslaag',
  'consolidatedHelpDialog.step1SelectLayerDescription': 'Kies het type organisatie waar u naar zoekt. Dit bepaalt welke websites we zullen doorzoeken:',
  'consolidatedHelpDialog.gemeente': 'Gemeente',
  'consolidatedHelpDialog.gemeenteDescription': 'Gemeentelijke beleidsdocumenten en websites',
  'consolidatedHelpDialog.waterschap': 'Waterschap',
  'consolidatedHelpDialog.waterschapDescription': 'Regionale waterbeheer organisaties',
  'consolidatedHelpDialog.provincie': 'Provincie',
  'consolidatedHelpDialog.provincieDescription': 'Provinciaal beleid en regelgeving',
  'consolidatedHelpDialog.rijksoverheid': 'Rijksoverheid',
  'consolidatedHelpDialog.rijksoverheidDescription': 'Landelijke beleidsdocumenten',
  'consolidatedHelpDialog.kennisinstituut': 'Kennisinstituut',
  'consolidatedHelpDialog.kennisinstituutDescription': 'Onderzoeks- en kennisorganisaties',
  'consolidatedHelpDialog.step1SelectEntity': '2. Selecteer instantie',
  'consolidatedHelpDialog.step1SelectEntityDescription': 'Kies een specifieke organisatie (bijv. "Gemeente Amsterdam"). U kunt zoeken door te typen. Voor kennisinstituten hoeft u geen specifieke instantie te selecteren.',
  'consolidatedHelpDialog.step1EnterSubject': '3. Voer onderwerp in',
  'consolidatedHelpDialog.step1EnterSubjectDescription': 'Beschrijf waar u naar zoekt. Tips voor betere resultaten:',
  'consolidatedHelpDialog.step1Tip1': 'Gebruik specifieke termen (bijv. "klimaatadaptatie" in plaats van "klimaat")',
  'consolidatedHelpDialog.step1Tip2': 'Combineer onderwerpen (bijv. "arbeidsmigranten huisvesting")',
  'consolidatedHelpDialog.step1Tip3': 'Minimaal 3 karakters, maximaal 500 karakters',
  'consolidatedHelpDialog.step1Tip4': 'Hoe specifieker, hoe relevantere resultaten',
  'consolidatedHelpDialog.step1WhatNext': 'Wat gebeurt er daarna?',
  'consolidatedHelpDialog.step1WhatNextDescription': 'Na het klikken op "Genereer website suggesties" gebruikt onze AI om relevante websites te vinden op basis van uw criteria. Dit kan enkele seconden duren.',
  'consolidatedHelpDialog.step2Title': 'Stap 2: Website selectie en scraping',
  'consolidatedHelpDialog.step2Description': 'Selecteer websites en start het scrapen om relevante documenten te vinden.',
  'consolidatedHelpDialog.step2WebsiteSelection': 'Website selectie',
  'consolidatedHelpDialog.step2WebsiteSelectionDescription': 'U kunt websites selecteren en filteren op verschillende manieren:',
  'consolidatedHelpDialog.search': 'Zoeken',
  'consolidatedHelpDialog.searchDescription': 'Zoek op naam of URL van een website',
  'consolidatedHelpDialog.filter': 'Filteren',
  'consolidatedHelpDialog.filterDescription': 'Filter op website type (gemeente, waterschap, etc.)',
  'consolidatedHelpDialog.sort': 'Sorteren',
  'consolidatedHelpDialog.sortDescription': 'Sorteer op relevantie, naam of type',
  'consolidatedHelpDialog.selectAll': 'Selecteer alles',
  'consolidatedHelpDialog.selectAllDescription': 'Selecteer alle gefilterde websites in één keer',
  'consolidatedHelpDialog.step2ScrapingTitle': 'Wat is scraping?',
  'consolidatedHelpDialog.step2ScrapingDescription': 'Tijdens het scrapen worden de geselecteerde websites doorzocht naar relevante documenten:',
  'consolidatedHelpDialog.step2ScrapingPoint1': 'We doorzoeken pagina\'s en documenten op basis van uw onderwerp',
  'consolidatedHelpDialog.step2ScrapingPoint2': 'Relevante documenten worden gevonden en geanalyseerd',
  'consolidatedHelpDialog.step2ScrapingPoint3': 'U kunt de voortgang volgen in real-time via de grafiek visualisatie',
  'consolidatedHelpDialog.step2ScrapingPoint4': 'Het proces kan enkele minuten duren, afhankelijk van het aantal websites',
  'consolidatedHelpDialog.step2GraphVisualization': 'Grafiek visualisatie',
  'consolidatedHelpDialog.step2GraphVisualizationDescription': 'Tijdens het scrapen ziet u een real-time visualisatie van het navigatienetwerk dat wordt opgebouwd. Dit helpt u begrijpen hoe websites zijn georganiseerd en welke documenten worden gevonden.',
  'consolidatedHelpDialog.step2Tip': 'Tip',
  'consolidatedHelpDialog.step2TipDescription': 'Selecteer meerdere websites voor een uitgebreidere scan. U kunt altijd later meer websites toevoegen door terug te gaan naar deze stap.',
  'consolidatedHelpDialog.step3Title': 'Stap 3: Documenten beoordelen',
  'consolidatedHelpDialog.step3Description': 'Beoordeel gevonden documenten en bepaal welke relevant zijn voor uw onderzoek.',
  'consolidatedHelpDialog.step3DocumentStatuses': 'Document statusen',
  'consolidatedHelpDialog.step3DocumentStatusesDescription': 'Elk document heeft een status die u kunt instellen:',
  'consolidatedHelpDialog.pending': 'Te beoordelen',
  'consolidatedHelpDialog.pendingDescription': 'Documenten die nog niet zijn beoordeeld (standaard)',
  'consolidatedHelpDialog.approved': 'Goedgekeurd',
  'consolidatedHelpDialog.approvedDescription': 'Documenten die relevant zijn voor uw onderzoek',
  'consolidatedHelpDialog.rejected': 'Afgekeurd',
  'consolidatedHelpDialog.rejectedDescription': 'Documenten die niet relevant zijn',
  'consolidatedHelpDialog.step3FilterAndSort': 'Filteren en sorteren',
  'consolidatedHelpDialog.step3FilterAndSortDescription': 'Gebruik de filter tabs om documenten te bekijken op basis van status:',
  'consolidatedHelpDialog.all': 'Alle',
  'consolidatedHelpDialog.allDescription': 'Toon alle documenten',
  'consolidatedHelpDialog.pendingFilterDescription': 'Alleen documenten die nog niet beoordeeld zijn',
  'consolidatedHelpDialog.approvedFilterDescription': 'Alleen goedgekeurde documenten',
  'consolidatedHelpDialog.rejectedFilterDescription': 'Alleen afgekeurde documenten',
  'consolidatedHelpDialog.step3BulkActions': 'Bulk acties',
  'consolidatedHelpDialog.step3BulkActionsDescription': 'Selecteer meerdere documenten met de checkboxes en gebruik de bulk acties om ze tegelijk goed te keuren of af te keuren. Dit bespaart tijd bij het beoordelen van grote aantallen documenten.',
  'consolidatedHelpDialog.step3DocumentDetails': 'Document details',
  'consolidatedHelpDialog.step3DocumentDetailsDescription': 'Elk document toont een samenvatting, relevantie voor uw zoekopdracht, en een link naar de originele bron. Gebruik deze informatie om te bepalen of het document relevant is voor uw onderzoek.',
  'consolidatedHelpDialog.step3NextSteps': 'Volgende stappen',
  'consolidatedHelpDialog.step3NextStepsDescription': 'Na het beoordelen van documenten kunt u doorgaan met de analyse. Alleen goedgekeurde documenten worden gebruikt in verdere analyses en rapportages.',
  // ScrapingInfoDialog
  'scrapingInfoDialog.title': 'Wat gebeurt er tijdens het scrapen?',
  'scrapingInfoDialog.description': 'Een overzicht van het scraping proces',
  'scrapingInfoDialog.step1': '1. Navigatienetwerk opbouwen',
  'scrapingInfoDialog.step1Description': 'We verkennen de structuur van de geselecteerde websites',
  'scrapingInfoDialog.step2': '2. Documenten zoeken',
  'scrapingInfoDialog.step2Description': 'Relevante pagina\'s en documenten worden gevonden op basis van uw onderwerp',
  'scrapingInfoDialog.step3': '3. Analyse en beoordeling',
  'scrapingInfoDialog.step3Description': 'Documenten worden geanalyseerd op relevantie en samengevat',
  'scrapingInfoDialog.note': 'Let op:',
  'scrapingInfoDialog.noteDescription': 'Het proces kan enkele minuten duren. U kunt de voortgang volgen via de grafiek visualisatie die automatisch wordt geopend.',
  // Step3Summary
  'step3Summary.governmentLayer': 'Overheidslaag',
  'step3Summary.entity': 'Instantie',
  'step3Summary.query': 'Zoekopdracht',
  'step3Summary.scrapedWebsites': 'Gescrapte websites',
  'step3Summary.foundDocuments': 'Gevonden documenten',
  // BeleidsscanErrorBoundary
  'beleidsscanErrorBoundary.unknown': 'Onbekend',
  'beleidsscanErrorBoundary.title': 'Er is iets misgegaan',
  'beleidsscanErrorBoundary.stepOfWizard': 'Stap {{step}} van de wizard',
  'beleidsscanErrorBoundary.unexpectedError': 'Er is een onverwachte fout opgetreden.',
  'beleidsscanErrorBoundary.draftAvailable': 'Concept beschikbaar',
  'beleidsscanErrorBoundary.draftAvailableDescription': 'We hebben een opgeslagen concept gevonden. U kunt uw werk hiermee herstellen.',
  'beleidsscanErrorBoundary.step': 'Stap {{step}}',
  'beleidsscanErrorBoundary.websites': '{{count}} websites',
  'beleidsscanErrorBoundary.documents': '{{count}} documenten',
  'beleidsscanErrorBoundary.restoreDraft': 'Herstel concept',
  'beleidsscanErrorBoundary.tryAgain': 'Opnieuw proberen',
  'beleidsscanErrorBoundary.backToPortal': 'Terug naar portaal',
  'beleidsscanErrorBoundary.technicalDetails': 'Technische details',
  // BeleidsscanContent
  'beleidsscanContent.title': 'Beleidsscan',
  'beleidsscanContent.subtitle': 'Scan en analyseer beleidsdocumenten op basis van uw specifieke behoeften',
  'beleidsscanContent.application': 'Beleidsscan',
  // EntitySelector
  'entitySelector.availableEntities': 'Beschikbare instanties',
  'entitySelector.entities': 'Instanties',
  'entitySelector.helpSelectingEntity': 'Hulp bij selecteren van instantie',
  'entitySelector.helpSelectingEntityDescription': 'Zoek en selecteer een specifieke instantie (gemeente, waterschap, provincie, etc.) door te typen in het zoekveld.',
  'entitySelector.noResultsFound': 'Geen resultaten gevonden',
  'entitySelector.requiredField': 'Verplicht veld',
  'entitySelector.searchEntity': 'Zoek {{entityType}}',
  'entitySelector.selectEntity': 'Selecteer {{entity}}',
  'entitySelector.selected': 'Geselecteerd:',
  // OverheidslaagSelector
  'overheidslaagSelector.requiredField': 'Verplicht veld',
  'overheidslaagSelector.selectLayer': '1. Selecteer overheidslaag',
  // FilterControls
  'filterControls.noFilters': 'Geen filters',
  'filterControls.noFiltersDescription': 'Selecteer eerst filters om op te slaan als preset.',
  'filterControls.presetDeleted': 'Preset verwijderd',
  'filterControls.presetDeletedDescription': '"{{name}}" is verwijderd.',
  'filterControls.allDates': 'Alle datums',
  'filterControls.allTypes': 'Alle types',
  'filterControls.allWebsites': 'Alle websites',
  'filterControls.clearFilters': 'Wis filters',
  'filterControls.clearFiltersAria': 'Wis alle actieve filters',
  'filterControls.clearQuery': 'Wis zoekopdracht',
  'filterControls.filterByDate': 'Filter op publicatiedatum',
  'filterControls.filterByType': 'Filter op document type',
  'filterControls.filterByWebsite': 'Filter op website',
  'filterControls.filterPresets': 'Filter presets',
  'filterControls.lastMonth': 'Laatste maand',
  'filterControls.lastWeek': 'Laatste week',
  'filterControls.lastYear': 'Laatste jaar',
  'filterControls.searchAndFilter': 'Zoek en filter documenten',
  'filterControls.searchAria': 'Zoek documenten',
  'filterControls.searchHelp': 'Zoek op titel, URL of inhoud van documenten',
  'filterControls.searchPlaceholder': 'Zoek documenten...',
  'filterControls.sortAscending': 'oplopend',
  'filterControls.sortBy': 'Sorteer documenten',
  'filterControls.sortByDate': 'Op datum',
  'filterControls.sortByRelevance': 'Op relevantie',
  'filterControls.sortByTitle': 'Op titel',
  'filterControls.sortByWebsite': 'Op website',
  'filterControls.sortDescending': 'aflopend',
  'filterControls.presets': 'Presets',
  'filterControls.filterPresetsLabel': 'Filter Presets',
  'filterControls.noPresetsSaved': 'Geen presets opgeslagen',
  'filterControls.saveCurrentFilters': 'Sla huidige filters op',
  'filterControls.deletePreset': 'Verwijder preset {{name}}',
  // WebsiteErrorDisplay
  'websiteErrorDisplay.title': 'Kan geen website suggesties genereren',
  'websiteErrorDisplay.closeError': 'Sluit foutmelding',
  // GraphVisualizerModal
  'graphVisualizerModal.close': 'Sluiten',
  // DraftStatusIndicator
  'draftStatusIndicator.viewDraftStatus': 'Conceptstatus bekijken',
  'draftStatusIndicator.viewDraftStatusAria': 'Bekijk conceptstatus',
  // DraftBanner
  'draftBanner.draftSaved': 'Concept opgeslagen',
  'draftBanner.recentlySaved': 'Recent opgeslagen',
  'draftBanner.step': 'Stap {{step}}',
  'draftBanner.websites': '{{count}} websites',
  'draftBanner.documents': '{{count}} documenten',
  'draftBanner.noDraftFound': 'Geen concept gevonden',
  'draftBanner.noDraftFoundDescription': 'Er is geen opgeslagen concept om te herstellen.',
  'draftBanner.resumeDraft': 'Hervat concept',
  'draftBanner.discardDraft': 'Verwijder concept',
  // StepLoader
  'stepLoader.loading': 'Stap wordt geladen...',
  // ApiKeysErrorDialog
  'apiKeysErrorDialog.title': 'API Keys Niet Geconfigureerd',
  'apiKeysErrorDialog.missingKeys': 'Ontbrekende API Keys:',
  'apiKeysErrorDialog.openaiKey': 'OPENAI_API_KEY (vereist voor production mode)',
  'apiKeysErrorDialog.googleApiKey': 'GOOGLE_CUSTOM_SEARCH_JSON_API_KEY',
  'apiKeysErrorDialog.googleEngineId': 'GOOGLE_CUSTOM_SEARCH_JSON_ENGINE_ID',
  'apiKeysErrorDialog.configuration': 'Configuratie:',
  'apiKeysErrorDialog.configurationDescription': 'Voeg de API keys toe aan uw server/.env bestand en herstart de server.',
  'apiKeysErrorDialog.developmentMode': 'Development Mode',
  'apiKeysErrorDialog.developmentModeDescription': 'U kunt doorgaan met voorbeeld (mock) website suggesties voor testdoeleinden.',
  'apiKeysErrorDialog.useMockSuggestions': 'Gebruik Voorbeeld Suggesties',
  // WorkflowImportModal
  'workflowImportModal.close': 'Sluiten',
  'workflowImportModal.title': 'Importeer Workflow Resultaten',
  'workflowImportModal.loading': 'Laden...',
  'workflowImportModal.noOutputsDescription': 'Voer eerst een workflow uit om documenten te genereren',
  'workflowImportModal.unknownOutput': 'Unknown Output',
  'workflowImportModal.urlsVisited': 'URLs Bezocht',
  'workflowImportModal.documents': 'Documenten',
  'workflowImportModal.endpoints': 'Endpoints',
  'workflowImportModal.foundEndpoints': 'Gevonden endpoints ({{count}})',
  'workflowImportModal.andMore': '... en {{count}} meer',
  'workflowImportModal.importing': 'Importeren...',
  'workflowImportModal.importDocuments': 'Importeer {{count}} documenten',
  // ConfigurationDialog
  'configurationDialog.descriptionPlaceholder': 'Optionele beschrijving van deze configuratie...',
  'configurationDialog.createTitle': 'Nieuwe Configuratie',
  'configurationDialog.editTitle': 'Configuratie Bewerken',
  'configurationDialog.description': 'Selecteer een workflow en configureer de feature flags voor deze configuratie.',
  'configurationDialog.nameLabel': 'Naam',
  'configurationDialog.workflowInfoAria': 'Meer informatie over {{name}}',
  'configurationDialog.directActivateEnabled': 'Direct activeren is ingeschakeld',
  'configurationDialog.directActivateDisabled': 'Direct activeren is uitgeschakeld',
  'configurationDialog.descriptionLabel': 'Beschrijving',
  'configurationDialog.namePlaceholder': 'Voer configuratienaam in...',
  'configurationDialog.nameRequired': 'Naam is verplicht',
  'configurationDialog.selectWorkflow': 'Selecteer workflow',
  'configurationDialog.selectWorkflowPlaceholder': 'Kies een workflow...',
  'configurationDialog.workflowLabel': 'Workflow',
  // ConfigurationCard
  'configurationCard.activeConfiguration': 'Actieve configuratie',
  'configurationCard.editConfiguration': 'Bewerk configuratie',
  'configurationCard.duplicateConfiguration': 'Dupliceer configuratie',
  'configurationCard.deleteConfiguration': 'Verwijder configuratie',
  'configurationCard.deleteConfigurationDisabled': 'Actieve configuratie kan niet verwijderd worden',
  'configurationCard.exportAsJson': 'Exporteren als JSON',
  // ActiveConfigurationCard
  'activeConfigurationCard.refreshFromServerAria': 'Ververs configuratie van server',
  'activeConfigurationCard.refreshFromServerTitle': 'Ververs van server',
  // PreviousSetsDialog
  'previousSetsDialog.title': 'Vorige Query Sets',
  'previousSetsDialog.description': 'Selecteer een voltooide query set om te laden',
  'previousSetsDialog.websites': '{{count}} website{{plural}}',
  'previousSetsDialog.documents': '{{count}} document{{plural}}',
  'previousSetsDialog.load': 'Laden',
  // DocumentPreviewModal
  'documentPreviewModal.description': 'Document preview - Bekijk details voordat u beslist',
  'documentPreviewModal.website': 'Website',
  'documentPreviewModal.type': 'Type',
  'documentPreviewModal.publicationDate': 'Publicatiedatum',
  'documentPreviewModal.status': 'Status',
  'documentPreviewModal.url': 'URL',
  'documentPreviewModal.noUrlAvailable': 'Geen URL beschikbaar',
  'documentPreviewModal.summary': 'Samenvatting',
  'documentPreviewModal.relevance': 'Relevantie voor zoekopdracht',
  'documentPreviewModal.subjects': 'Onderwerpen',
  'documentPreviewModal.openDocument': 'Open document',
  'documentPreview.themes': 'Thema\'s',
  // IMRO Metadata Labels
  'imroMetadata.datasetTitle': 'Dataset Titel',
  'imroMetadata.bronbeheerder': 'Bronbeheerder',
  'imroMetadata.creatiedatum': 'Creatiedatum',
  'imroMetadata.identificatie': 'Identificatie',
  'imroMetadata.typePlan': 'Type Plan',
  'imroMetadata.naamOverheid': 'Naam Overheid',
  'imroMetadata.besluitgebied': 'Besluitgebied',
  'imroMetadata.bestemmingsvlak': 'Bestemmingsvlak',
  'imroMetadata.plantekst': 'Plantekst',
  'imroMetadata.regeltekst': 'Regeltekst',
  'imroMetadata.toelichting': 'Toelichting',
  'step2.previousStep': 'Vorige stap',
  'step2.previous': 'Vorige',
  'step2.startWorkflowWithWebsites': 'Start workflow met {{count}} geselecteerde website{{plural}}',
  'step2.startWorkflowWithoutWebsites': 'Start workflow (zonder websites - andere bronnen worden gebruikt)',
  'step2.saveDraftManually': 'Concept handmatig opslaan',
  'step2.lastSaved': 'Laatst opgeslagen: {{timestamp}}',
  'step2.saveDraft': 'Concept opslaan',
  'step2.goToResults': 'Naar resultaten',
  'step2.noWebsitesFound': 'Geen websites gevonden',
  'step2.noWebsitesFoundDescription': 'Er zijn geen websites gevonden op basis van uw zoekcriteria. U kunt nog steeds doorgaan met de scan.',
  'step2.youCan': 'U kunt:',
  'step2.option1': 'Teruggaan naar stap 1 om uw zoekcriteria aan te passen',
  'step2.option2': 'Doorgaan met de scan zonder websites (andere bronnen zoals DSO, IPLO en Rechtspraak worden gebruikt)',
  'step2.backToConfiguration': 'Terug naar configuratie',
  'step2.startScanWithoutWebsites': 'Start scan zonder websites',
  'step2.title': 'Stap 2: Website selectie',
  'step2.description': 'We hebben {{count}} websites gevonden op basis van uw zoekcriteria. Selecteer de websites die u wilt scrapen.',
  'stepNavigation.step': 'Stap {{number}}',
  'stepNavigation.completed': ' (voltooid)',
  'stepNavigation.currentStep': ' (huidige stap)',
  'common.deselect': 'Deselecteer',
  'knowledgeGraph.usingBackend': 'Gebruikt {{backend}} backend',
  'benchmark.noQuery': '(geen query)',
  'testRuns.collapseSteps': 'Stappen inklappen',
  'testRuns.expandSteps': 'Stappen uitklappen',
  'benchmark.config.invalid': 'Ongeldige configuratie',
  'benchmark.config.invalidDesc': 'Workflow ID en configuratie zijn vereist',
  'benchmark.config.workflowRequired': 'Ongeldige workflow',
  'benchmark.config.workflowRequiredDesc': 'Selecteer eerst een workflow',
  'benchmark.config.saved': 'Configuratie opgeslagen',
  'benchmark.config.savedDesc': 'Benchmark configuratie opgeslagen met {{count}} feature flag(s) ingeschakeld.',
  'benchmark.config.workflowNotFound': 'Workflow niet gevonden',
  'benchmark.config.workflowNotFoundDesc': 'De workflow "{{workflowId}}" kon niet worden gevonden. Selecteer een geldige workflow.',
  'benchmark.config.saveFailed': 'Configuratie opslaan mislukt',
  'benchmark.loadingFeatureFlags': 'Feature flags laden...',
  'benchmark.noFlagsMatchSearch': 'Geen flags gevonden die overeenkomen met uw zoekopdracht.',
  'benchmark.retry': 'Opnieuw proberen',
  // DocumentSources
  'documentSources.title': 'Documenten',
  'documentSources.noQueryId': 'Geen query ID beschikbaar',
  'documentSources.loading': 'Documenten worden geladen...',
  'documentSources.loadError': 'Fout bij laden documenten',
  'documentSources.waitingForDocuments': 'Wachten op documenten...',
  // WorkflowComparison
  'workflowComparison.id': 'ID:',
  // DocumentComparison
  'documentComparison.title': 'Documentvergelijking',
  'documentComparison.description': 'Vergelijk twee documenten om verschillen, gematchte concepten en bewijs te identificeren',
  'documentComparison.documentA': 'Document A',
  'documentComparison.documentB': 'Document B',
  'documentComparison.comparing': 'Vergelijken...',
  'documentComparison.compareDocuments': 'Documenten vergelijken',
  'documentComparison.summary': 'Samenvatting',
  'documentComparison.matchedConcepts': 'Gematchte concepten',
  'documentComparison.differences': 'Verschillen',
  'documentComparison.comparisonSummary': 'Vergelijkingssamenvatting',
  'documentComparison.totalConcepts': 'Totaal concepten',
  'documentComparison.identical': 'Identiek',
  'documentComparison.changed': 'Gewijzigd',
  'documentComparison.conflicting': 'Conflicterend',
  'documentComparison.overallSimilarity': 'Algemene gelijkenis',
  'documentComparison.confidence': 'Vertrouwen',
  'documentComparison.keyDifferences': 'Belangrijkste verschillen',
  'documentComparison.strategy': 'Strategie',
  'documentComparison.method': 'Methode',
  'documentComparison.processingTime': 'Verwerkingstijd',
  'documentComparison.change': 'Wijziging:',
  'documentComparison.old': 'Oud:',
  'documentComparison.new': 'Nieuw:',
  'documentComparison.impact': 'Impact:',
  'documentComparison.evidenceA': 'Bewijs A',
  'documentComparison.evidenceB': 'Bewijs B',
  'documentComparison.chunks': 'chunks',
  'documentComparison.confidencePercent': '% vertrouwen',
  'documentComparison.viewDetails': 'Bekijk details',
  'documentComparison.conceptDifference': 'Conceptverschil',
  'documentComparison.conceptDifferenceDescription': 'Gedetailleerde informatie over het verschil tussen de concepten',
  'documentComparison.changeType': 'Wijzigingstype',
  'documentComparison.changeDescription': 'Wijzigingsbeschrijving',
  'documentComparison.oldValue': 'Oude waarde',
  'documentComparison.newValue': 'Nieuwe waarde',
  'workflow.create.validationFailed': 'Validatie mislukt',
  'workflow.create.validationFailedDesc': 'Vul alle verplichte velden in (ID, naam en minimaal één stap)',
  'workflow.create.stepValidationFailed': 'Stap {{stepId}} mist verplichte velden: ID, naam of actie',
  'kg.query.required': 'Voer een SPARQL query in',
  'kg.query.saveRequired': 'Voer een query in om op te slaan',
  'kg.query.saved': 'Query opgeslagen in geschiedenis',
  'kg.query.alreadyInHistory': 'Query staat al in geschiedenis',
  'kg.query.loadedFromHistory': 'Query geladen uit geschiedenis',
  'kg.query.executedSuccess': 'Query succesvol uitgevoerd ({{count}} resultaten in {{time}}ms)',
  'kg.query.failed': 'Query mislukt: {{error}}',
  'kg.query.title': 'SPARQL Query',
  'kg.query.description': 'Voer SPARQL queries uit tegen de knowledge graph',
  'kg.query.executing': 'Uitvoeren...',
  'kg.query.execute': 'Query uitvoeren',
  'kg.query.history': 'Geschiedenis ({{count}})',
  'kg.query.templates': 'Sjablonen',
  'kg.query.results.title': 'Query Resultaten',
  'kg.query.results.description': 'Resultaten verschijnen hier na het uitvoeren van een query',
  'kg.query.results.executing': 'Query uitvoeren...',
  'kg.query.results.summary': '{{count}} resultaten in {{time}}ms',
  'kg.query.results.exportCsv': 'Exporteer CSV',
  'kg.query.results.true': 'Waar',
  'kg.query.results.false': 'Onwaar',
  'kg.query.results.noResults': 'Geen resultaten gevonden',
  'kg.query.results.noQueryYet': 'Nog geen query uitgevoerd. Voer een SPARQL query in en klik op "Query uitvoeren" om resultaten te zien.',
  'kg.commands.title': 'Commando\'s',
  'kg.commands.description': 'Git-achtige versiebeheer commando\'s',
  'kg.commands.status': 'kg status',
  'kg.commands.branch': 'kg branch',
  'kg.commands.commit': 'kg commit',
  'kg.commands.stash': 'kg stash',
  'kg.commands.merge': 'kg merge',
  'kg.commands.diff': 'kg diff',
  'kg.commands.log': 'kg log',
  'kg.commands.stashList': 'kg stash list',
  'kg.commands.notImplemented': 'Commando \'{{command}}\' is nog niet volledig geïmplementeerd',
  'kg.commands.failed': 'Commando mislukt: {{error}}',
  'kg.management.title': 'Knowledge Graph Beheer',
  'kg.management.description': 'Beheer uw knowledge graph met SPARQL queries en Git-achtige versiebeheer commando\'s',
  'kg.status.loadError': 'KG status laden mislukt',
  'kg.query.templates.allEntities': 'Alle Entiteiten',
  'kg.query.templates.allRelationships': 'Alle Relaties',
  'kg.query.templates.entitiesByType': 'Entiteiten per Type',
  'kg.query.templates.entityCountByType': 'Entiteit Aantal per Type',
  'kg.query.templates.relationshipsByType': 'Relaties per Type',
  'kg.query.executeError': 'Query uitvoeren mislukt',
  'kg.branch.loadError': 'Branches laden mislukt: {{error}}',
  'kg.branch.switched': 'Gewisseld naar branch: {{branch}}',
  'kg.branch.switchError': 'Branch wisselen mislukt: {{error}}',
  'kg.branch.created': 'Branch aangemaakt: {{branch}}',
  'kg.branch.createError': 'Branch aanmaken mislukt: {{error}}',
  'kg.stash.loadError': 'Stashes laden mislukt: {{error}}',
  'kg.stash.defaultDescription': 'Opgeslagen wijzigingen vanuit KG beheer interface',
  'kg.stash.success': 'Opgeslagen: {{stashId}}',
  'kg.stash.failed': 'Opslaan mislukt: {{error}}',
  'kg.stash.applied': 'Stash {{stashId}} toegepast',
  'kg.stash.popError': 'Stash toepassen mislukt: {{error}}',
  'kg.stash.dropped': 'Stash {{stashId}} verwijderd',
  'kg.stash.dropError': 'Stash verwijderen mislukt: {{error}}',
  'kg.stash.button': 'Opslaan',
  'kg.stash.listTitle': 'Stash Lijst',
  'kg.stash.listDescription': 'Beheer opgeslagen wijzigingen',
  'kg.stash.pop': 'Toepassen',
  'kg.stash.drop': 'Verwijderen',
  'kg.stash.noStashes': 'Geen stashes beschikbaar',
  'kg.commit.defaultMessage': 'Wijzigingen gecommit van {{branch}}',
  'kg.commit.success': 'Gecommit: {{version}}',
  'kg.commit.failed': 'Commit mislukt: {{error}}',
  'kg.merge.success': '{{source}} samengevoegd in {{target}}',
  'kg.merge.conflicts': 'Merge voltooid met {{count}} conflicten',
  'kg.merge.failed': 'Merge mislukt: {{error}}',
  'kg.diff.failed': 'Diff mislukt: {{error}}',
  'kg.diff.entities': 'Entiteiten',
  'kg.diff.relationships': 'Relaties',
  'kg.diff.added': 'Toegevoegd',
  'kg.diff.removed': 'Verwijderd',
  'kg.diff.modified': 'Gewijzigd',
  'kg.log.loadError': 'Versie log laden mislukt: {{error}}',
  'kg.log.title': 'Versie Geschiedenis',
  'kg.log.description': 'Versie geschiedenis voor huidige branch',
  'kg.log.refresh': 'Log Vernieuwen',
  'kg.log.noHistory': 'Geen versie geschiedenis beschikbaar',
  'kg.status.currentBranch': 'Huidige Branch:',
  'kg.status.entities': 'Entiteiten:',
  'kg.status.relationships': 'Relaties:',
  'kg.status.pendingChanges': 'Wijzigingen in behandeling:',
  'kg.status.pendingChangesCount': '{{entityCount}} entiteiten, {{relationshipCount}} relaties',
  'kg.status.noPendingChanges': 'Geen wijzigingen in behandeling',
  'kg.status.refreshed': 'Status vernieuwd',
  'kg.commit.noPendingChanges': 'Geen wijzigingen om te committen',
  'kg.branch.nameRequired': 'Voer een branch naam in',
  'kg.branch.selectRequired': 'Selecteer branches',
  'kg.branch.selectRequiredDesc': 'Selecteer bron- en doelbranches',
  'runs.retryInfo': 'Herhaal functionaliteit',
  'runs.retryInfoDesc': 'Om deze workflow opnieuw te proberen, start een nieuwe run.',
  'testRun.startedSuccess': 'Test run succesvol gestart',
  'testRun.startFailed': 'Test run starten mislukt',
  'testRun.linkCopied': 'Link gekopieerd naar klembord',
  'testRun.copyFailed': 'Link kopiëren mislukt',
  'testRun.detailsRefreshed': 'Test run details vernieuwd',
  'workflowManagement.loadFailed': 'Workflows laden mislukt',
  'workflowManagement.created': 'Workflow aangemaakt',
  'workflowManagement.createdDesc': 'De workflow is aangemaakt in Draft status.',
  'workflowManagement.createFailed': 'Workflow aanmaken mislukt',
  'workflowManagement.cannotEdit': 'Kan workflow niet bewerken',
  'workflowManagement.cannotEditDesc': 'Alleen workflows in Draft of Testing status kunnen worden bewerkt.',
  'workflowManagement.permissionDenied': 'Toegang geweigerd',
  'workflowManagement.permissionDeniedDesc': 'U moet eigenaar of editor zijn om deze workflow te bewerken.',
  'workflowManagement.updated': 'Workflow bijgewerkt',
  'workflowManagement.updatedDesc': 'De workflow is succesvol bijgewerkt.',
  'workflowManagement.updateFailed': 'Workflow bijwerken mislukt',
  'workflowManagement.statusUpdated': 'Status bijgewerkt',
  'workflowManagement.statusUpdateFailed': 'Status bijwerken mislukt',
  'workflowManagement.deleted': 'Workflow verwijderd',
  'workflowManagement.deletedDesc': 'De workflow is gemarkeerd als Deprecated.',
  'workflowManagement.deleteFailed': 'Workflow verwijderen mislukt',
  'workflowManagement.deleteConfirm': 'Weet u zeker dat u "{{name}}" wilt verwijderen? Dit zal het markeren als Deprecated.',
  'workflowManagement.editWorkflow': 'Bewerk Workflow',
  'workflowManagement.createNewWorkflow': 'Nieuwe Workflow Aanmaken',
  'workflowManagement.createWorkflow': 'Workflow Aanmaken',
  'workflowManagement.noWorkflowsMatchFilters': 'Geen workflows gevonden die overeenkomen met uw filters.',
  'workflowManagement.noWorkflowsYet': 'Nog geen workflows. Maak uw eerste workflow aan!',
  'workflowManagement.noDescription': 'Geen beschrijving',
  'workflowManagement.searchWorkflows': 'Zoek workflows...',
  'workflowManagement.myWorkflows': 'Mijn Workflows',
  'workflowManagement.sharedWithMe': 'Gedeeld met Mij',
  'workflowManagement.all': 'Alles',
  'workflowManagement.loading': 'Workflows laden...',
  'workflowManagement.title': 'Workflow Beheer',
  'workflowManagement.subtitle': 'Beheer workflow levenscyclus: maak, test en publiceer workflows',
  'workflowManagement.steps': 'stappen',
  'workflowManagement.testRuns': 'Test Runs',
  'workflowManagement.acceptance': 'Acceptatie',
  'workflowManagement.errorRate': 'Foutpercentage',
  'workflowManagement.details': 'Details',
  'workflowManagement.changeStatus': 'Status Wijzigen',
  'workflowManagement.share': 'Delen',
  'workflowManagement.statusChanged': 'Workflow status gewijzigd naar {{status}}.',
  'workflowManagement.runningInstance': 'lopende instantie',
  'workflowManagement.runningInstances': 'lopende instanties',
  'workflowManagement.cancelled': 'geannuleerd',
  'workflowManagement.allowedToComplete': 'mogen voltooien',
  'workflowManagement.willComplete': 'zullen voltooien',
  'workflowList.loadError': 'Kan workflows niet laden',
  'workflowList.loadErrorDesc': 'Er is een fout opgetreden bij het laden van workflows.',
  'workflowList.noWorkflows': 'Geen workflows beschikbaar',
  // Error messages
  'errors.generic.title': 'Fout',
  'errors.timeout.title': 'Workflow Timeout Fout',
  'errors.timeout.limit': 'Timeout limiet',
  'errors.timeout.elapsed': 'Verstreken tijd',
  'errors.timeout.percentageUsed': '{{percentage}}% van timeout limiet gebruikt',
  'errors.timeout.suggestions': 'Suggesties om dit probleem op te lossen:',
  'errors.timeout.retry': 'Workflow opnieuw proberen',
  'errors.timeout.dismiss': 'Sluiten',
  'jobs.jobFailed': 'Job mislukt',
  'jobs.jobCompletedWithErrors': 'Job voltooid met fouten',
  'jobs.jobFailedTitle': 'Job Mislukt',
  'jobs.jobCompletedWithErrorsTitle': 'Job Voltooid met Fouten',
  'jobs.errors': 'fouten',
  'jobs.retryJob': 'Job opnieuw proberen',
  'jobs.errorDetails': 'Foutdetails',
  'jobs.action': 'Actie:',
  'jobs.showDetails': 'Toon details',
  'jobs.dismiss': 'Sluiten',
  'jobs.document': 'Document:',
  'jobs.stackTrace': 'Stack Trace',
  'errors.backend.notReachable': 'Backend server is niet bereikbaar. Controleer of de backend draait.',
  'errors.backend.notReachableDocker': 'Backend server is niet bereikbaar. De backend container draait mogelijk niet of er is een netwerkconnectiviteitsprobleem tussen containers. Probeer beide backend en frontend containers opnieuw te starten: docker compose restart backend frontend',
  'errors.backend.notReachableGeneric': 'Backend server is niet bereikbaar. De server draait mogelijk niet of is niet correct gestart.',
  'errors.backend.title': 'Backend niet bereikbaar',
  'errors.network.connectionProblem': 'Verbindingsprobleem',
  'errors.network.connectionProblemMessage': 'Kan geen verbinding maken met de server. Controleer uw internetverbinding.',
  'errors.network.connectionProblemAction': 'Controleer uw internetverbinding en probeer het opnieuw.',
  'errors.network.connectionRefused': 'Verbinding geweigerd',
  'errors.network.connectionRefusedMessage': 'De backend server is niet bereikbaar. De server draait mogelijk niet of is niet correct gestart.',
  'errors.network.connectionRefusedAction': 'Controleer of de backend server actief is. Als u Docker gebruikt, controleer de logs: docker logs beleidsscan-backend. Veelvoorkomende oorzaken: ontbrekende exports, database verbindingsproblemen, of startup validatiefouten.',
  'errors.network.connectionBroken': 'Verbindingsprobleem',
  'errors.network.connectionBrokenMessage': 'De verbinding met de server is verbroken. De server heeft de verbinding mogelijk onverwacht gesloten of de client heeft de verbinding verbrak.',
  'errors.network.connectionBrokenAction': 'Probeer het opnieuw. Als het probleem aanhoudt, controleer of de server actief is.',
  'errors.network.networkError': 'Netwerkfout',
  'errors.network.networkErrorMessage': 'Kan geen verbinding maken met de server.',
  'errors.network.networkErrorAction': 'Controleer uw internetverbinding en probeer het opnieuw.',
  'errors.timeout.genericTitle': 'Tijd overschreden',
  'errors.timeout.genericMessage': 'De operatie duurde te lang. De server reageert niet snel genoeg.',
  'errors.timeout.genericAction': 'Probeer het opnieuw. Als het probleem aanhoudt, probeer het later opnieuw.',
  // GraphDB/Hierarchy errors
  'errors.graphdb.hierarchyNotAvailable': 'Hiërarchische structuur niet beschikbaar',
  'errors.graphdb.hierarchyNotAvailableMessage': 'De hiërarchische structuur functionaliteit is niet beschikbaar wanneer GraphDB als backend wordt gebruikt. Deze functionaliteit vereist Neo4j als backend.',
  'errors.graphdb.hierarchyNotAvailableAction': 'Zorg ervoor dat GraphDB is geconfigureerd en verbonden. GraphDB is vereist voor de Knowledge Graph.',
  // Validation errors
  'errors.validation.workflowRequiresSubject': 'Dit workflow vereist een onderwerp. Vul het onderwerp veld in en probeer het opnieuw.',
  'errors.validation.invalidUrl': 'Voer een geldige URL in (bijvoorbeeld: https://voorbeeld.nl/pagina).',
  'errors.validation.invalidUrlExample': 'Voer een geldige URL in (bijvoorbeeld: https://voorbeeld.nl/pagina).',
  'errors.validation.onlyHttpHttps': 'Alleen HTTP en HTTPS URLs worden ondersteund.',
  'errors.validation.fieldRequired': '{{fieldName}} is verplicht.',
  'errors.validation.fieldName': 'Veld',
  'errors.validation.valueMustBeNumber': 'Waarde moet een getal zijn.',
  'errors.validation.valueMustBeBetween': 'Waarde moet tussen {{min}} en {{max}} liggen.',
  'errors.validation.invalidEmail': 'Voer een geldig e-mailadres in.',
  'errors.validation.subjectMaxLength': 'Onderwerp mag maximaal 500 tekens bevatten.',
  'errors.networkConnection': 'Kan geen verbinding maken met de server. Controleer uw internetverbinding en probeer het opnieuw.',
  'errors.timeout': 'De server reageert niet. Probeer het over een moment opnieuw.',
  'errors.validation': 'De ingevoerde gegevens zijn ongeldig. Controleer alle velden en probeer het opnieuw.',
  'errors.validationWithField': 'Ongeldige waarde voor {{field}}. Controleer de invoer en probeer het opnieuw.',
  'errors.notFound': 'De gevraagde informatie is niet gevonden. Controleer of alles correct is ingevoerd.',
  'errors.resourceNotFound': '{{resource}} niet gevonden. Controleer of het bestaat en probeer het opnieuw.',
  'errors.permission': 'U heeft geen toegang tot deze actie. Neem contact op met een beheerder als u denkt dat dit een fout is.',
  'errors.serverError': 'Er is een fout opgetreden op de server. Probeer het over een moment opnieuw. Als het probleem aanhoudt, neem contact op met de ondersteuning.',
  'errors.rateLimit': 'Te veel verzoeken. Wacht even en probeer het daarna opnieuw.',
  // Validation
  'validation.errors': 'Validatiefouten',
  // HierarchyTree
  'hierarchy.loading': 'Hiërarchie boom laden...',
  'hierarchy.error': 'Fout: {{error}}',
  'hierarchy.noData': 'Geen hiërarchie data beschikbaar',
  'hierarchy.failedToLoad': 'Kon hiërarchie boom niet laden',
  // ErrorDetailModal
  'errorDetail.title': 'Fout details',
  'errorDetail.severity': 'Ernst',
  'errorDetail.component': 'Component',
  'errorDetail.status': 'Status',
  'errorDetail.occurrences': 'Aantal keer',
  'errorDetail.process': 'Proces',
  'errorDetail.request': 'Verzoek',
  'errorDetail.fileLocation': 'Bestandslocatie',
  'errorDetail.errorMessage': 'Foutmelding',
  'errorDetail.stackTrace': 'Stack trace',
  'errorDetail.firstSeen': 'Eerst gezien',
  'errorDetail.lastSeen': 'Laatst gezien',
  'errorDetail.resolvedAt': 'Opgelost op',
  'errorDetail.additionalInfo': 'Extra informatie',
  'errorDetail.errorId': 'Fout ID',
  'errorDetail.viewDashboard': 'Bekijk in Fout Monitoring Dashboard',
  'errorDetail.markResolved': 'Markeer als opgelost',
  'errorDetail.resolving': 'Oplossen...',
  'errorDetail.failedFetch': 'Kon fout details niet ophalen',
  'errorDetail.failedResolve': 'Kon fout niet oplossen',
  'errorDetail.severity.critical': 'Kritiek',
  'errorDetail.severity.error': 'Fout',
  'errorDetail.severity.warning': 'Waarschuwing',
  'errorDetail.component.scraper': 'Scraper',
  'errorDetail.component.workflow': 'Workflow',
  'errorDetail.component.api': 'API',
  'errorDetail.component.frontend': 'Frontend',
  'errorDetail.component.database': 'Database',
  'errorDetail.component.other': 'Overige',
  'errorDetail.status.resolved': 'Opgelost',
  'errorDetail.status.ignored': 'Genegeerd',
  'errorDetail.status.open': 'Openen',
  // AICrawlingConfig
  'aiCrawling.title': 'AI Crawling Configuratie',
  'aiCrawling.description': 'Configureer AI-gestuurd crawlgedrag. Globale instellingen gelden voor alle sites tenzij overschreven door site-specifieke configuraties.',
  'aiCrawling.globalConfig': 'Globale Configuratie',
  'aiCrawling.noGlobalConfig': 'Geen globale configuratie ingesteld (standaardwaarden worden gebruikt)',
  'aiCrawling.siteConfigs': 'Site-specifieke Configuraties',
  'aiCrawling.createSiteConfig': 'Nieuwe Site Configuratie Aanmaken',
  'aiCrawling.siteUrl': 'Site URL',
  'aiCrawling.aggressiveness': 'Agressiviteit',
  'aiCrawling.strategy': 'Strategie',
  'aiCrawling.maxDepth': 'Max Diepte',
  'aiCrawling.maxLinks': 'Max Links',
  'aiCrawling.cacheEnabled': 'Cache Ingeschakeld',
  'aiCrawling.enabled': 'Ingeschakeld',
  'aiCrawling.create': 'Configuratie Aanmaken',
  'aiCrawling.noSiteConfigs': 'Geen site-specifieke configuraties',
  'aiCrawling.save': 'Opslaan',
  'aiCrawling.cancel': 'Annuleren',
  'aiCrawling.aggressiveness.low': 'Laag',
  'aiCrawling.aggressiveness.medium': 'Gemiddeld',
  'aiCrawling.aggressiveness.high': 'Hoog',
  'aiCrawling.strategy.auto': 'Auto',
  'aiCrawling.strategy.site_search': 'Site Zoeken',
  'aiCrawling.strategy.ai_navigation': 'AI Navigatie',
  'aiCrawling.strategy.traditional': 'Traditioneel',
  'aiCrawling.boolean.yes': 'Ja',
  'aiCrawling.boolean.no': 'Nee',
  'aiCrawling.cache.enabled': 'Ingeschakeld',
  'aiCrawling.cache.disabled': 'Uitgeschakeld',
  'aiCrawling.toast.urlRequired': 'Site URL is vereist voor site scope',
  'aiCrawling.toast.createSuccess': 'Configuratie succesvol aangemaakt',
  'aiCrawling.toast.createError': 'Kon configuratie niet aanmaken',
  'aiCrawling.toast.updateSuccess': 'Configuratie succesvol bijgewerkt',
  'aiCrawling.toast.updateError': 'Kon configuratie niet bijwerken',
  'aiCrawling.toast.deleteConfirm': 'Weet u zeker dat u deze configuratie wilt verwijderen?',
  'aiCrawling.toast.deleteSuccess': 'Configuratie succesvol verwijderd',
  'aiCrawling.toast.deleteError': 'Kon configuratie niet verwijderen',
  'aiCrawling.toast.loadError': 'Kon AI crawling configuraties niet laden',
  // TestRuns
  'testRuns.all': 'Alle',
  'testRuns.passed': 'Geslaagd',
  'testRuns.failed': 'Gefaald',
  'testRuns.skipped': 'Overgeslagen',
  'testRuns.allTime': 'Alle tijd',
  'testRuns.last24Hours': 'Laatste 24 uur',
  'testRuns.last7Days': 'Laatste 7 dagen',
  'testRuns.last30Days': 'Laatste 30 dagen',
  'testRuns.allTypes': 'Alle types',
  'testRuns.unit': 'Unit',
  'testRuns.integration': 'Integratie',
  'testRuns.e2e': 'End-to-end',
  'testRuns.visual': 'Visueel',
  'testRuns.performance': 'Prestatie',
  'testRuns.workflowSteps': 'Workflow stappen',
  'testRuns.other': 'Anders',
  'testRuns.filterByTestFile': 'Filter op test bestand',
  'testRuns.unknown': 'Onbekend',
  'testRuns.failedToLoadPipeline': 'Kon pipeline details niet laden:',
  // API success messages
  'apiMessages.scheduledJobUpdated': 'Geplande taak succesvol bijgewerkt',
  'apiMessages.scheduledJobDeleted': 'Geplande taak succesvol verwijderd',
  'apiMessages.scheduledJobEnabled': 'Geplande taak succesvol ingeschakeld',
  'apiMessages.scheduledJobDisabled': 'Geplande taak succesvol uitgeschakeld',
  'apiMessages.workflowPaused': 'Workflow succesvol gepauzeerd',
  'apiMessages.workflowResumed': 'Workflow succesvol hervat',
  'apiMessages.workflowDeleted': 'Workflow succesvol verwijderd',
  'apiMessages.subgraphDeleted': 'Subnetwerk succesvol verwijderd',
  'apiMessages.queryAndResultsDeleted': 'Query en resultaten succesvol verwijderd',
  'apiMessages.teamAccessRemoved': 'Team toegang succesvol verwijderd',
  'apiMessages.accessRemoved': 'Toegang succesvol verwijderd',
  'apiMessages.passwordReset': 'Wachtwoord succesvol gereset',
  'apiMessages.errorMarkedAsResolved': 'Fout gemarkeerd als opgelost',
  'apiMessages.thresholdGroupCreated': 'Drempelgroep succesvol aangemaakt',
  'apiMessages.thresholdsAutoAdjusted': 'Drempels succesvol automatisch aangepast',
  'apiMessages.noAdjustmentsNeeded': 'Geen aanpassingen nodig',
  'apiMessages.thresholdsImported': 'Drempels succesvol geïmporteerd',
  'apiMessages.scheduleCreated': 'Schema succesvol aangemaakt',
  'apiMessages.scheduleUpdated': 'Schema succesvol bijgewerkt',
  'apiMessages.scheduleDeleted': 'Schema succesvol verwijderd',
  'apiMessages.graphStreamCleanedUp': 'Grafiekstroom opgeschoond',
  'apiMessages.documentsCreated': 'Documenten succesvol aangemaakt',
  'apiMessages.logoutSuccessful': 'Uitloggen succesvol',
  'apiMessages.profileUpdated': 'Profiel succesvol bijgewerkt',
  'apiMessages.passwordResetSuccessful': 'Wachtwoord succesvol gereset',
  'apiMessages.tokenRevoked': 'Token succesvol ingetrokken',
  'apiMessages.allTokensRevoked': 'Alle gebruikers tokens succesvol ingetrokken',
  'apiMessages.passwordResetLinkSent': 'Als een gebruiker met dat e-mailadres bestaat, is een wachtwoord reset link verzonden',
  'apiMessages.templateDeleted': 'Sjabloon succesvol verwijderd',
  'apiMessages.templateApplied': 'Sjabloon toegepast: {{count}} beslissingen gemaakt',
  'apiMessages.candidateReviewed': 'Kandidaat succesvol beoordeeld',
  'apiMessages.candidatesReviewed': 'Kandidaten succesvol beoordeeld',
  'apiMessages.reviewCompletedResumed': 'Beoordeling voltooid en workflow succesvol hervat',
  'apiMessages.reviewDeleted': 'Beoordeling succesvol verwijderd',
  'apiMessages.reviewsDeleted': '{{count}} beoordeling(en) verwijderd',
  'apiMessages.allNotificationsMarkedRead': 'Alle meldingen gemarkeerd als gelezen',
  'apiMessages.notificationDeleted': 'Melding succesvol verwijderd',
  'apiMessages.featureFlagsCacheRefreshed': 'Feature flags cache succesvol vernieuwd',
  'apiMessages.templateAppliedSuccessfully': 'Sjabloon "{{name}}" succesvol toegepast',
  'apiMessages.benchmarkConfigApplied': 'Benchmark configuratie succesvol toegepast',
  'apiMessages.workflowStarted': 'Workflow gestart',
  'apiMessages.workflowQueued': 'Workflow in wachtrij geplaatst',
  'apiMessages.scheduledExportDeleted': 'Geplande export verwijderd',
  'apiMessages.testExecutionStateReset': 'Test uitvoering status gereset',
  'toastMessages.pleaseSelectDocuments': 'Selecteer documenten om te exporteren',
  'toastMessages.exportingTo': 'Exporteren naar {{format}}...',
  'toastMessages.exportedToSuccessfully': 'Succesvol geëxporteerd naar {{format}}',
  'toastMessages.failedToExport': 'Exporteren naar {{format}} mislukt',
  'toastMessages.failedToPreviewRollback': 'Voorvertoning rollback mislukt',
  'toastMessages.failedToRollback': 'Workflow terugzetten mislukt',
  'toastMessages.failedToDuplicate': 'Workflow dupliceren mislukt',
  'toastMessages.pleaseTryAgain': 'Probeer het opnieuw.',
  'toastMessages.workflowRolledBack': 'Workflow teruggezet',
  'toastMessages.workflowExported': 'Workflow geëxporteerd',
  'toastMessages.workflowDuplicated': 'Workflow gedupliceerd',
  'workflowDetails.confirmRollback': 'Weet u zeker dat u deze workflow wilt terugzetten naar versie {{version}}? Dit zal een nieuwe versie aanmaken gebaseerd op de vorige.',
  'workflowDetails.workflowRolledBackMessage': 'Workflow is teruggezet naar versie {{version}}.',
  'workflowDetails.workflowExportedMessage': 'Workflow configuratie is geëxporteerd als JSON.',
  'workflowDetails.workflowDuplicatedMessage': 'Workflow "{{name}}" is aangemaakt.',
  'beleidsscan.startWorkflowWithoutWebsites': 'Workflow starten (zonder websites)',
  'toastMessages.nameRequired': 'Naam vereist',
  'toastMessages.templateContentRequired': 'Sjabloon inhoud vereist',
  'toastMessages.templateUpdated': 'Sjabloon bijgewerkt',
  'toastMessages.templateCreated': 'Sjabloon aangemaakt',
  'toastMessages.templateDeleted': 'Sjabloon verwijderd',
  'toastMessages.failedToSaveTemplate': 'Sjabloon opslaan mislukt',
  'toastMessages.failedToDeleteTemplate': 'Sjabloon verwijderen mislukt',
  'toastMessages.pleaseTryAgainLater': 'Probeer het later opnieuw',
  'workflowDetails.rollbackNotePlaceholder': 'Voeg een notitie toe over deze rollback...',
  'knowledgeGraph.commitMessagePlaceholder': 'Voer commit bericht in...',
  'knowledgeGraph.stashDescriptionPlaceholder': 'Voer stash beschrijving in...',
  'knowledgeGraph.selectSourceBranch': 'Selecteer bron branch',
  'knowledgeGraph.selectTargetBranch': 'Selecteer doel branch',
  'knowledgeGraph.cancel': 'Annuleren',
  'knowledgeGraph.commit': 'Commit',
  'knowledgeGraph.stash': 'Stash',
  'common.skipToMainContent': 'Spring naar hoofdinhoud',
  'knowledgeGraph.commitPendingChanges': 'Wijzigingen committen',
  'knowledgeGraph.commitDescription': 'Commit {{entityCount}} entiteiten en {{relationshipCount}} relaties naar branch: {{branch}}',
  'knowledgeGraph.commitMessage': 'Commit bericht',
  'knowledgeGraph.stashChanges': 'Wijzigingen stashen',
  'knowledgeGraph.stashDescription': 'Stash huidige wijzigingen op branch: {{branch}}',
  'knowledgeGraph.descriptionOptional': 'Beschrijving (optioneel)',
  'knowledgeGraph.branchManagement': 'Branch beheer',
  'knowledgeGraph.switchBranchesOrCreate': 'Wissel van branch of maak een nieuwe branch aan',
  'knowledgeGraph.currentBranch': 'Huidige branch',
  'knowledgeGraph.availableBranches': 'Beschikbare branches',
  'knowledgeGraph.createNewBranch': 'Nieuwe branch aanmaken',
  'knowledgeGraph.branchNamePlaceholder': 'branch-naam',
  'knowledgeGraph.create': 'Aanmaken',
  'knowledgeGraph.close': 'Sluiten',
  'knowledgeGraph.current': 'Huidig',
  'knowledgeGraph.switch': 'Wisselen',
  'knowledgeGraph.mergeBranches': 'Branches samenvoegen',
  'knowledgeGraph.mergeOneBranchIntoAnother': 'Voeg een branch samen met een andere',
  'knowledgeGraph.sourceBranch': 'Bron branch',
  'knowledgeGraph.targetBranch': 'Doel branch',
  'knowledgeGraph.merge': 'Samenvoegen',
  'knowledgeGraph.branchDiff': 'Branch verschil',
  'knowledgeGraph.compareDifferences': 'Vergelijk verschillen tussen twee branches',
  'knowledgeGraph.compareBranches': 'Branches vergelijken',
  'toastMessages.pleaseEnterTemplateName': 'Voer een sjabloon naam in',
  'toastMessages.pleaseEnterTemplateContent': 'Voer sjabloon inhoud in',
  'toastMessages.templateUpdatedMessage': 'Sjabloon "{{name}}" is bijgewerkt',
  'toastMessages.templateCreatedMessage': 'Sjabloon "{{name}}" is aangemaakt',
  'toastMessages.templateDeletedMessage': 'Sjabloon "{{name}}" is verwijderd',
  'toastMessages.pleaseEnterRecipientEmails': 'Voer e-mailadressen van ontvangers in',
  'toastMessages.pleaseEnterValidEmails': 'Voer geldige e-mailadressen in',
  'toastMessages.sendingEmail': 'E-mail verzenden...',
  'toastMessages.emailSentSuccessfully': 'E-mail succesvol verzonden naar {{count}} ontvanger(s)',
  'toastMessages.failedToSendEmail': 'E-mail export verzenden mislukt',
  'toastMessages.failedToLoadData': 'Gegevens laden mislukt',
  'toastMessages.failedToLoadRecommendations': 'Aanbevelingen laden mislukt',
  'apiMessages.thresholdsUpdated': 'Drempels succesvol bijgewerkt',
  'apiMessages.testsStarted': 'Tests succesvol gestart',
  'apiMessages.userRegistered': 'Gebruiker succesvol geregistreerd',
  'apiMessages.loginSuccessful': 'Inloggen succesvol',
  'apiMessages.userRoleUpdated': 'Gebruikersrol succesvol bijgewerkt',
  'apiMessages.userActivated': 'Gebruiker succesvol geactiveerd',
  'apiMessages.userDeactivated': 'Gebruiker succesvol gedeactiveerd',
  'apiMessages.scheduledJobCreated': 'Geplande taak succesvol aangemaakt',
  'apiMessages.branchesMerged': 'Branches succesvol samengevoegd',
  'apiMessages.mergeCompletedWithConflicts': 'Samenvoegen voltooid met conflicten',
  'apiMessages.templateAppliedSuccessfullyWithName': 'Sjabloon "{{name}}" succesvol toegepast',
  'toastMessages.exportSuccessful': 'Export succesvol',
  'toastMessages.urlCopied': 'URL gekopieerd',
  'toastMessages.copyFailed': 'Kopiëren mislukt',
  'toastMessages.pleaseSelectBothDocuments': 'Selecteer beide documenten om te vergelijken',
  'toastMessages.pleaseSelectTwoDifferentDocuments': 'Selecteer twee verschillende documenten',
  'toastMessages.documentComparisonCompleted': 'Document vergelijking voltooid',
  'toastMessages.commandCompletedSuccessfully': 'Commando succesvol voltooid',
  'toastMessages.commandFailed': 'Commando mislukt',
  'toastMessages.failedToLoadFlakeDetection': 'Laden van flake detectie gegevens mislukt',
  'toastMessages.failedToLoadPerformanceDrift': 'Laden van performance drift gegevens mislukt',
  'toastMessages.failedToLoadFailureTimeline': 'Laden van failure timeline gegevens mislukt',
  'toastMessages.failedToLoadDependencies': 'Laden van dependencies mislukt',
  'toastMessages.failedToLoadAlerts': 'Laden van alerts mislukt',
  'apiMessages.workflowQueuedForExecution': 'Workflow in wachtrij geplaatst voor uitvoering',
  'apiMessages.runAlreadyCancelledOrCompleted': 'Run is al geannuleerd of voltooid',
  'apiMessages.runCancelled': 'Run geannuleerd',
  'apiMessages.runAlreadyInTerminalOrPaused': 'Run is al in een terminale of gepauzeerde status',
  'apiMessages.runPauseRequested': 'Run pauze aangevraagd',
  'apiMessages.changesCommitted': 'Wijzigingen gecommit',
  'apiMessages.changesStashed': 'Wijzigingen gestashed',
  'apiMessages.versionLogNotImplemented': 'Versie log nog niet volledig geïmplementeerd',
  'apiMessages.runTestsFirst': 'Voer eerst tests uit om dashboard gegevens te genereren',
  'apiMessages.failedToReadDashboardData': 'Laden van dashboard gegevens bestand mislukt',
  'apiMessages.noPerformanceTrendsData': 'Geen performance trends gegevens beschikbaar. Voer eerst tests uit om dashboard gegevens te genereren.',
  'apiMessages.noCoverageData': 'Geen coverage gegevens beschikbaar. Voer tests uit met coverage om metrics te genereren.',
  'alerts.highFailureRateTitle': 'Hoge foutpercentage gedetecteerd',
  'alerts.highFailureRateMessage': '{{count}} test{{plural}} mislukt in de laatste {{days}} dag{{daysPlural}} ({{rate}}% foutpercentage)',
  'alerts.flakyTestsTitle': '{{count}} Flaky Test{{plural}} Gedetecteerd',
  'alerts.flakyTestsMessage': '{{count}} test{{plural}} {{show}} inconsistente pass rates, wat duidt op potentiële flakiness',
  'alerts.lowCoverageTitle': 'Lage Test Coverage',
  'alerts.lowCoverageMessage': 'Lijn coverage is {{coverage}}%, onder de aanbevolen 80% drempel',
  'alerts.performanceIssuesTitle': 'Potentiële Performance Problemen',
  'alerts.performanceIssuesMessage': '{{count}} test{{plural}} {{show}} consistent lage pass rates, wat kan duiden op performance problemen',
  'dataAvailability.coverageAvailable': 'Coverage gegevens zijn beschikbaar',
  'dataAvailability.coverageNotFound': 'Geen coverage gegevens gevonden. Voer uit: pnpm run test:coverage',
  'dataAvailability.performanceTrendsAvailable': 'Performance trends gegevens zijn beschikbaar',
  'dataAvailability.performanceTrendsNotFound': 'Geen performance trends gegevens gevonden. Voer uit: pnpm test',
  'dataAvailability.dashboardDataAvailable': 'Dashboard gegevens zijn beschikbaar',
  'dataAvailability.dashboardDataNotFound': 'Geen dashboard gegevens gevonden. Voer uit: pnpm test',
};

/**
 * Set of all valid translation keys (for O(1) lookup)
 * Generated from the translations object
 * This must be defined before the functions that use it
 */
const translationKeysSet = new Set<string>(Object.keys(translations) as TranslationKey[]);

/**
 * Type guard to check if a string is a valid translation key
 * 
 * @param value - String to check
 * @returns true if value is a valid TranslationKey
 */
export function isTranslationKey(value: string): value is TranslationKey {
  return translationKeysSet.has(value);
}

/**
 * Get a translated string by key
 */
export function t(key: TranslationKey): string {
  const translation = translations[key];
  if (translation === undefined) {
    // Log warning in development to catch missing translations
    if (typeof window !== 'undefined' && process.env.NODE_ENV === 'development') {
      console.warn(`[i18n] Translation key "${key}" not found in translations object`);
    }
    // Return the key itself as fallback (so it's visible and can be fixed)
    return key;
  }
  return translation;
}

/**
 * Translate workflow status values
 */
export function translateStatus(status: string): string {
  // Normalize status: lowercase and replace underscores
  const normalizedStatus = status.toLowerCase();
  const statusKey = `workflowStatus.${normalizedStatus}` as TranslationKey;
  const translated = t(statusKey);
  // If translation returns the same as the key, it doesn't exist - return original status
  return translated !== statusKey ? translated : status;
}

/**
 * Translation hook for React components
 */
export function useTranslation() {
  return { t };
}
