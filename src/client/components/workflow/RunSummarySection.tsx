/**
 * Run Summary Section Component
 * 
 * Displays workflow run status, controls, output summary, and convert button.
 */

import { CheckCircle, XCircle, Clock, Download, RefreshCw, Play, Pause, Square, FileText } from 'lucide-react';
import { t } from '../../utils/i18n';
import { logError } from '../../utils/errorHandler';
import { toast } from '../../utils/toast';
import { api } from '../../services/api';

interface WorkflowRun {
  id: string;
  status: string;
  startTime: string;
  params?: Record<string, unknown>;
  type?: string;
  outputPaths?: {
    jsonPath: string;
  };
}

interface WorkflowOutput {
  trace: {
    totalUrlsVisited: number;
    steps: Array<{
      stepName: string;
      status: string;
      urls?: string[];
    }>;
  };
  results?: {
    summary?: {
      totalDocuments: number;
      newlyDiscovered: number;
      errors: number;
    };
    endpoints?: Array<{
      title: string;
      url: string;
    }>;
  };
}

interface RunSummarySectionProps {
  run: WorkflowRun | null;
  output: WorkflowOutput | null;
  queryId: string | null;
  documentsCount: number;
  isConverting: boolean;
  onPauseRun: () => void;
  onResumeRun: () => void;
  onStopRun: () => void;
  onRefresh: () => void;
  onConvertToDocuments: () => void;
}

function getStatusIcon(status: string) {
  switch (status) {
    case 'completed':
      return <CheckCircle className="w-6 h-6 text-green-600" />;
    case 'failed':
      return <XCircle className="w-6 h-6 text-red-600" />;
    case 'running':
    case 'paused':
      return <Clock className="w-6 h-6 text-blue-600" />;
    default:
      return <Clock className="w-6 h-6 text-gray-400" />;
  }
}

export function RunSummarySection({
  run,
  output,
  queryId,
  documentsCount,
  isConverting,
  onPauseRun,
  onResumeRun,
  onStopRun,
  onRefresh,
  onConvertToDocuments,
}: RunSummarySectionProps) {
  if (!run) {
    return null;
  }

  const outputName = run.outputPaths?.jsonPath
    ?.split('/')
    .pop()
    ?.replace('.json', '') || '';

  const handleDownload = async (format: 'json' | 'md' | 'txt') => {
    if (!outputName) return;
    
    try {
      await api.downloadWorkflowOutput(outputName, format);
      toast.success(
        t('workflowResults.downloadReport'),
        t('workflowResults.downloadSuccess')
      );
    } catch (error) {
      logError(error, 'download-document');
      toast.error(
        t('workflowResults.downloadFailed'),
        error instanceof Error ? error.message : t('workflowResults.downloadFailedMessage')
      );
    }
  };

  const workflowName = (run.params && typeof run.params === 'object' && 'workflowName' in run.params && typeof run.params.workflowName === 'string' 
    ? run.params.workflowName 
    : null) || (typeof run.type === 'string' ? run.type : t('common.unknown'));

  return (
    <div className="bg-card rounded-xl border border-border p-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          {getStatusIcon(run.status)}
          <div>
            <h3 className="font-semibold text-foreground">
              {workflowName}
            </h3>
            <p className="text-sm text-muted-foreground">
              {new Date(run.startTime).toLocaleString('nl-NL')}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {(run.status === 'running' || run.status === 'paused') && (
            <>
              {run.status === 'paused' ? (
                <button
                  onClick={onResumeRun}
                  className="p-2 text-green-600 hover:bg-green-50 dark:hover:bg-green-900/20 rounded-lg transition-colors"
                  title={t('workflowResults.resume')}
                >
                  <Play className="w-4 h-4" />
                </button>
              ) : (
                <button
                  onClick={onPauseRun}
                  className="p-2 text-yellow-600 hover:bg-yellow-50 dark:hover:bg-yellow-900/20 rounded-lg transition-colors"
                  title={t('workflowResults.pause')}
                >
                  <Pause className="w-4 h-4 fill-current" />
                </button>
              )}
              <button
                onClick={onStopRun}
                className="p-2 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
                title={t('workflowResults.stop')}
              >
                <Square className="w-4 h-4 fill-current" />
              </button>
            </>
          )}
          {run.outputPaths && outputName && (
            <div className="flex items-center gap-2">
              <button
                onClick={() => handleDownload('txt')}
                className="flex items-center gap-2 px-3 py-2 text-sm text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg transition-colors"
                title={t('workflowResults.downloadTxt')}
              >
                <Download className="w-4 h-4" />
                TXT
              </button>
              <button
                onClick={() => handleDownload('md')}
                className="flex items-center gap-2 px-3 py-2 text-sm text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg transition-colors"
                title={t('workflowResults.downloadMarkdown')}
              >
                <Download className="w-4 h-4" />
                MD
              </button>
              <button
                onClick={() => handleDownload('json')}
                className="flex items-center gap-2 px-3 py-2 text-sm text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg transition-colors"
                title={t('workflowResults.downloadJson')}
              >
                <Download className="w-4 h-4" />
                JSON
              </button>
            </div>
          )}
          <button
            onClick={onRefresh}
            className="p-2 text-muted-foreground hover:bg-muted rounded-lg transition-colors"
            title={t('workflowResults.refresh')}
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Output Summary */}
      {output && (
        <div className="grid grid-cols-4 gap-4 p-4 bg-muted rounded-lg">
          <div className="text-center">
            <div className="text-2xl font-bold text-foreground">
              {output.trace.totalUrlsVisited}
            </div>
            <div className="text-xs text-muted-foreground">{t('workflowResults.urlsVisited')}</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-foreground">
              {output.results?.summary?.totalDocuments || 0}
            </div>
            <div className="text-xs text-muted-foreground">{t('workflowResults.documentsFound')}</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-green-600">
              {output.results?.summary?.newlyDiscovered || 0}
            </div>
            <div className="text-xs text-muted-foreground">{t('workflowResults.newlyDiscovered')}</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-red-600">
              {output.results?.summary?.errors || 0}
            </div>
            <div className="text-xs text-muted-foreground">{t('workflowResults.errors')}</div>
          </div>
        </div>
      )}

      {/* Convert to Documents button */}
      {output && queryId && documentsCount === 0 && (
        <div className="mt-4 flex justify-center">
          <button
            onClick={onConvertToDocuments}
            disabled={isConverting}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
          >
            {isConverting ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin" />
                {t('workflowResults.converting')}
              </>
            ) : (
              <>
                <FileText className="w-4 h-4" />
                {t('workflowResults.importAsDocuments')}
              </>
            )}
          </button>
        </div>
      )}
    </div>
  );
}
