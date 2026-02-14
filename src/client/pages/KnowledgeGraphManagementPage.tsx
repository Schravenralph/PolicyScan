/**
 * Knowledge Graph Management Page
 * 
 * Provides a comprehensive interface for managing the knowledge graph:
 * - SPARQL query execution
 * - Git-like versioning commands
 * - Branch management
 * - Commit/invalidate workflow changes
 */

import { useState, useEffect, useCallback } from 'react';
import { Database, AlertCircle } from 'lucide-react';
import { api } from '../services/api';
import type { KGStatus, SPARQLQueryResult } from '../services/api/KnowledgeGraphManagementApiService';
import { Alert, AlertDescription } from '../components/ui/alert';
import { toast } from 'sonner';
import { t } from '../utils/i18n';
import { KGCommandDialogs } from '../components/knowledge/KGCommandDialogs.js';
import { SPARQLQueryEditor } from '../components/knowledge/SPARQLQueryEditor.js';
import { SPARQLQueryResults } from '../components/knowledge/SPARQLQueryResults.js';
import { KGCommandPanel } from '../components/knowledge/KGCommandPanel.js';
import { KGStatusBanner } from '../components/knowledge/KGStatusBanner.js';

export function KnowledgeGraphManagementPage() {
  const [status, setStatus] = useState<KGStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // SPARQL Query state
  const [query, setQuery] = useState('SELECT ?s ?p ?o WHERE { GRAPH <http://data.example.org/graph/knowledge> { ?s ?p ?o } } LIMIT 10');
  const [queryResult, setQueryResult] = useState<SPARQLQueryResult | null>(null);
  const [queryLoading, setQueryLoading] = useState(false);
  const [queryError, setQueryError] = useState<string | null>(null);
  const [queryHistory, setQueryHistory] = useState<string[]>([]);
  
  // Query templates
  const queryTemplates = [
    {
      name: t('kg.query.templates.allEntities'),
      query: `SELECT ?id ?type ?name ?description
WHERE {
  GRAPH <http://data.example.org/graph/knowledge> {
    ?s beleid:id ?id ;
       beleid:type ?type ;
       rdfs:label ?name .
    OPTIONAL { ?s dct:description ?description }
  }
}
LIMIT 100`
    },
    {
      name: t('kg.query.templates.allRelationships'),
      query: `SELECT ?sourceId ?targetId ?type
WHERE {
  GRAPH <http://data.example.org/graph/knowledge> {
    ?rel a kg:Relation ;
         kg:source ?source ;
         kg:target ?target ;
         kg:relationType ?type .
    ?source beleid:id ?sourceId .
    ?target beleid:id ?targetId .
  }
}
LIMIT 100`
    },
    {
      name: t('kg.query.templates.entitiesByType'),
      query: `SELECT ?id ?name ?description
WHERE {
  GRAPH <http://data.example.org/graph/knowledge> {
    ?s beleid:id ?id ;
       beleid:type "PolicyDocument" ;
       rdfs:label ?name .
    OPTIONAL { ?s dct:description ?description }
  }
}
LIMIT 50`
    },
    {
      name: t('kg.query.templates.entityCountByType'),
      query: `SELECT ?type (COUNT(?s) as ?count)
WHERE {
  GRAPH <http://data.example.org/graph/knowledge> {
    ?s beleid:type ?type .
  }
}
GROUP BY ?type
ORDER BY DESC(?count)`
    },
    {
      name: t('kg.query.templates.relationshipsByType'),
      query: `SELECT ?type (COUNT(?rel) as ?count)
WHERE {
  GRAPH <http://data.example.org/graph/knowledge> {
    ?rel a kg:Relation ;
         kg:relationType ?type .
  }
}
GROUP BY ?type
ORDER BY DESC(?count)`
    }
  ];

  // Load initial status
  useEffect(() => {
    loadStatus();
  }, []);

  const loadStatus = async () => {
    try {
      setLoading(true);
      setError(null);
      const statusData = await api.kgManagement.getStatus();
      setStatus(statusData);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('kg.status.loadError'));
    } finally {
      setLoading(false);
    }
  };

  // Execute SPARQL query
  const executeQuery = useCallback(async () => {
    if (!query.trim()) {
      toast.error(t('kg.query.required'));
      return;
    }

    try {
      setQueryLoading(true);
      setQueryError(null);
      setQueryResult(null);

      const result = await api.kgManagement.executeQuery({
        query: query.trim(),
        limit: 1000,
        timeout: 30000,
      });

      setQueryResult(result);
      
      // Add to history if successful
      if (result.success && !queryHistory.includes(query.trim())) {
        setQueryHistory(prev => [query.trim(), ...prev.slice(0, 9)]); // Keep last 10
      }

      toast.success(t('kg.query.executedSuccess').replace('{{count}}', String(result.summary.recordCount)).replace('{{time}}', String(result.summary.executionTime)));
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : t('kg.query.executeError');
      setQueryError(errorMsg);
      toast.error(t('kg.query.failed').replace('{{error}}', errorMsg));
    } finally {
      setQueryLoading(false);
    }
  }, [query, queryHistory]);

  // Save query to history
  const saveQuery = useCallback(() => {
    if (!query.trim()) {
      toast.error(t('kg.query.saveRequired'));
      return;
    }
    
    if (!queryHistory.includes(query.trim())) {
      setQueryHistory(prev => [query.trim(), ...prev.slice(0, 9)]);
      toast.success(t('kg.query.saved'));
    } else {
      toast.info(t('kg.query.alreadyInHistory'));
    }
  }, [query, queryHistory]);

  // Load query from history
  const loadQueryFromHistory = useCallback((historyQuery: string) => {
    setQuery(historyQuery);
    toast.info(t('kg.query.loadedFromHistory'));
  }, []);

  // Command dialog states
  const [commitDialogOpen, setCommitDialogOpen] = useState(false);
  const [commitMessage, setCommitMessage] = useState('');
  const [stashDialogOpen, setStashDialogOpen] = useState(false);
  const [stashDescription, setStashDescription] = useState('');
  const [branchDialogOpen, setBranchDialogOpen] = useState(false);
  const [branches, setBranches] = useState<Array<{ name: string; isCurrent: boolean }>>([]);
  const [newBranchName, setNewBranchName] = useState('');
  const [mergeDialogOpen, setMergeDialogOpen] = useState(false);
  const [mergeSource, setMergeSource] = useState('');
  const [mergeTarget, setMergeTarget] = useState('');
  const [diffDialogOpen, setDiffDialogOpen] = useState(false);
  const [diffSource, setDiffSource] = useState('');
  const [diffTarget, setDiffTarget] = useState('');
  const [diffResult, setDiffResult] = useState<{
    entities: { added: string[]; removed: string[]; modified: string[]; addedCount: number; removedCount: number; modifiedCount: number };
    relationships: { added: Array<{ sourceId: string; targetId: string; type: string }>; removed: Array<{ sourceId: string; targetId: string; type: string }>; modified: Array<{ sourceId: string; targetId: string; type: string }>; addedCount: number; removedCount: number; modifiedCount: number };
  } | null>(null);
  const [logDialogOpen, setLogDialogOpen] = useState(false);
  const [versionLog, setVersionLog] = useState<Array<{ version: string; branch: string; timestamp: string }>>([]);
  const [stashes, setStashes] = useState<Array<{ stashId: string; branch: string; timestamp: string; description?: string }>>([]);
  const [stashListDialogOpen, setStashListDialogOpen] = useState(false);

  // Load branches
  const loadBranches = useCallback(async () => {
    try {
      const branchesData = await api.kgManagement.getBranches();
      setBranches(branchesData.branches);
    } catch (err) {
      toast.error(t('kg.branch.loadError').replace('{{error}}', err instanceof Error ? err.message : String(err)));
    }
  }, []);

  // Load stashes
  const loadStashes = useCallback(async () => {
    try {
      const stashesData = await api.kgManagement.listStashes();
      setStashes(stashesData.stashes.map(s => ({
        stashId: s.stashId,
        branch: s.branch,
        timestamp: s.timestamp,
        description: s.description
      })));
    } catch (err) {
      toast.error(t('kg.stash.loadError').replace('{{error}}', err instanceof Error ? err.message : String(err)));
    }
  }, []);

  // Load version log
  const loadVersionLog = useCallback(async () => {
    try {
      const logData = await api.kgManagement.getLog(status?.currentBranch, 50);
      if (logData.versions && Array.isArray(logData.versions)) {
        setVersionLog(logData.versions as Array<{ version: string; branch: string; timestamp: string }>);
      }
    } catch (err) {
      toast.error(t('kg.log.loadError').replace('{{error}}', err instanceof Error ? err.message : String(err)));
    }
  }, [status]);

  // Handle command execution
  const handleCommand = useCallback(async (command: string) => {
    try {
      switch (command) {
        case 'status':
          await loadStatus();
          toast.success(t('kg.status.refreshed'));
          break;
        case 'branch':
          await loadBranches();
          setBranchDialogOpen(true);
          break;
        case 'commit':
          if (!status || (status.pendingChanges.entityCount === 0 && status.pendingChanges.relationshipCount === 0)) {
            toast.error(t('kg.commit.noPendingChanges'));
            return;
          }
          setCommitMessage(t('kg.commit.defaultMessage').replace('{{branch}}', status.pendingChanges.branch));
          setCommitDialogOpen(true);
          break;
        case 'stash':
          setStashDescription(t('kg.stash.defaultDescription'));
          setStashDialogOpen(true);
          break;
        case 'merge':
          await loadBranches();
          if (status) {
            setMergeSource(status.currentBranch);
            setMergeTarget('main');
          }
          setMergeDialogOpen(true);
          break;
        case 'diff':
          await loadBranches();
          if (status) {
            setDiffDialogOpen(true);
            setDiffSource(status.currentBranch);
            setDiffTarget('main');
          }
          break;
        case 'log':
          setLogDialogOpen(true);
          break;
        default:
          toast.info(t('kg.commands.notImplemented').replace('{{command}}', command));
      }
    } catch (err) {
      toast.error(t('kg.commands.failed').replace('{{error}}', err instanceof Error ? err.message : String(err)));
    }
  }, [status, loadStatus, loadBranches]);

  // Execute commit
  const executeCommit = useCallback(async () => {
    if (!status) return;
    
    try {
      const commitResult = await api.kgManagement.commit({
        message: commitMessage || t('kg.commit.defaultMessage').replace('{{branch}}', status.pendingChanges.branch),
      });
      toast.success(t('kg.commit.success').replace('{{version}}', commitResult.version));
      setCommitDialogOpen(false);
      setCommitMessage('');
      await loadStatus();
    } catch (err) {
      toast.error(t('kg.commit.failed').replace('{{error}}', err instanceof Error ? err.message : String(err)));
    }
  }, [status, commitMessage, loadStatus]);

  // Execute stash
  const executeStash = useCallback(async () => {
    try {
      const stashResult = await api.kgManagement.stash({
        description: stashDescription || t('kg.stash.defaultDescription'),
      });
      toast.success(t('kg.stash.success').replace('{{stashId}}', stashResult.stashId));
      setStashDialogOpen(false);
      setStashDescription('');
      await loadStatus();
    } catch (err) {
      toast.error(t('kg.stash.failed').replace('{{error}}', err instanceof Error ? err.message : String(err)));
    }
  }, [stashDescription, loadStatus]);

  // Switch branch
  const switchBranch = useCallback(async (branchName: string) => {
    try {
      await api.kgManagement.switchBranch(branchName, true);
      toast.success(t('kg.branch.switched').replace('{{branch}}', branchName));
      setBranchDialogOpen(false);
      await loadStatus();
      await loadBranches();
    } catch (err) {
      toast.error(t('kg.branch.switchError').replace('{{error}}', err instanceof Error ? err.message : String(err)));
    }
  }, [loadStatus, loadBranches]);

  // Create branch
  const createBranch = useCallback(async () => {
    if (!newBranchName.trim()) {
      toast.error(t('kg.branch.nameRequired'));
      return;
    }
    
    try {
      await api.kgManagement.createBranch(newBranchName.trim(), false, status?.currentBranch || 'main');
      toast.success(t('kg.branch.created').replace('{{branch}}', newBranchName));
      setNewBranchName('');
      await loadBranches();
    } catch (err) {
      toast.error(t('kg.branch.createError').replace('{{error}}', err instanceof Error ? err.message : String(err)));
    }
  }, [newBranchName, status, loadBranches]);

  // Execute merge
  const executeMerge = useCallback(async () => {
    if (!mergeSource || !mergeTarget) {
      toast.error(t('kg.branch.selectRequired'), { description: t('kg.branch.selectRequiredDesc') });
      return;
    }
    
    try {
      const mergeResult = await api.kgManagement.merge({
        sourceBranch: mergeSource,
        targetBranch: mergeTarget,
      });
      
      if (mergeResult.merged) {
        toast.success(t('kg.merge.success').replace('{{source}}', mergeSource).replace('{{target}}', mergeTarget));
      } else {
        toast.warning(t('kg.merge.conflicts').replace('{{count}}', String(mergeResult.conflicts.length)));
      }
      
      setMergeDialogOpen(false);
      setMergeSource('');
      setMergeTarget('');
      await loadStatus();
    } catch (err) {
      toast.error(t('kg.merge.failed').replace('{{error}}', err instanceof Error ? err.message : String(err)));
    }
  }, [mergeSource, mergeTarget, loadStatus]);

  // Execute diff
  const executeDiff = useCallback(async () => {
    if (!diffSource || !diffTarget) {
      toast.error(t('kg.branch.selectRequired'), { description: t('kg.branch.selectRequiredDesc') });
      return;
    }
    
    try {
      const diffResult = await api.kgManagement.getDiff(diffSource, diffTarget);
      setDiffResult({
        entities: diffResult.entities as any,
        relationships: diffResult.relationships as any
      });
    } catch (err) {
      toast.error(t('kg.diff.failed').replace('{{error}}', err instanceof Error ? err.message : String(err)));
    }
  }, [diffSource, diffTarget]);

  // Pop stash
  const popStash = useCallback(async (stashId: string) => {
    try {
      const result = await api.kgManagement.stashPop(stashId);
      if (result.success) {
        toast.success(t('kg.stash.applied').replace('{{stashId}}', stashId));
      } else {
        toast.warning(result.message);
      }
      await loadStashes();
      await loadStatus();
    } catch (err) {
      toast.error(t('kg.stash.popError').replace('{{error}}', err instanceof Error ? err.message : String(err)));
    }
  }, [loadStashes, loadStatus]);

  // Drop stash
  const dropStash = useCallback(async (stashId: string) => {
    try {
      await api.kgManagement.stashDrop(stashId);
      toast.success(t('kg.stash.dropped').replace('{{stashId}}', stashId));
      await loadStashes();
    } catch (err) {
      toast.error(t('kg.stash.dropError').replace('{{error}}', err instanceof Error ? err.message : String(err)));
    }
  }, [loadStashes]);

  return (
    <div className="container mx-auto p-6 max-w-7xl h-full flex flex-col">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-3xl font-bold mb-2 flex items-center gap-3">
          <Database className="h-8 w-8 text-blue-600" />
          {t('kg.management.title')}
        </h1>
        <p className="text-muted-foreground">
          {t('kg.management.description')}
        </p>
      </div>

      {/* Status Banner */}
      <KGStatusBanner status={status} />

      {/* Error Display */}
      {error && (
        <Alert variant="destructive" className="mb-6">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* Main Layout */}
      <div className="flex-1 grid grid-cols-12 gap-6 min-h-[600px]">
        {/* Left Sidebar - Command Panel */}
        <KGCommandPanel
          status={status}
          loading={loading}
          onCommand={handleCommand}
          onStashList={() => {
            loadStashes();
            setStashListDialogOpen(true);
          }}
        />

        {/* All Command Dialogs */}
        <KGCommandDialogs
          status={status}
          commitDialogOpen={commitDialogOpen}
          onCommitDialogChange={setCommitDialogOpen}
          commitMessage={commitMessage}
          onCommitMessageChange={setCommitMessage}
          onExecuteCommit={executeCommit}
          stashDialogOpen={stashDialogOpen}
          onStashDialogChange={setStashDialogOpen}
          stashDescription={stashDescription}
          onStashDescriptionChange={setStashDescription}
          onExecuteStash={executeStash}
          branchDialogOpen={branchDialogOpen}
          onBranchDialogChange={setBranchDialogOpen}
          branches={branches}
          newBranchName={newBranchName}
          onNewBranchNameChange={setNewBranchName}
          onSwitchBranch={switchBranch}
          onCreateBranch={createBranch}
          mergeDialogOpen={mergeDialogOpen}
          onMergeDialogChange={setMergeDialogOpen}
          mergeSource={mergeSource}
          onMergeSourceChange={setMergeSource}
          mergeTarget={mergeTarget}
          onMergeTargetChange={setMergeTarget}
          onExecuteMerge={executeMerge}
          diffDialogOpen={diffDialogOpen}
          onDiffDialogChange={setDiffDialogOpen}
          diffSource={diffSource}
          onDiffSourceChange={setDiffSource}
          diffTarget={diffTarget}
          onDiffTargetChange={setDiffTarget}
          diffResult={diffResult}
          onExecuteDiff={executeDiff}
          onClearDiffResult={() => setDiffResult(null)}
          logDialogOpen={logDialogOpen}
          onLogDialogChange={setLogDialogOpen}
          versionLog={versionLog}
          onLoadVersionLog={loadVersionLog}
          stashListDialogOpen={stashListDialogOpen}
          onStashListDialogChange={setStashListDialogOpen}
          stashes={stashes}
          onLoadStashes={loadStashes}
          onPopStash={popStash}
          onDropStash={dropStash}
        />

        {/* Main Content - Query and Results */}
        <div className="col-span-9 flex flex-col gap-6">
          {/* SPARQL Query Pane */}
          <SPARQLQueryEditor
            query={query}
            onQueryChange={setQuery}
            onExecute={executeQuery}
            onSave={saveQuery}
            queryLoading={queryLoading}
            queryError={queryError}
            queryHistory={queryHistory}
            onLoadFromHistory={loadQueryFromHistory}
            queryTemplates={queryTemplates}
            onLoadTemplate={setQuery}
          />

          {/* Output Pane */}
          <SPARQLQueryResults
            queryResult={queryResult}
            queryLoading={queryLoading}
            queryError={queryError}
          />
        </div>
      </div>
    </div>
  );
}

