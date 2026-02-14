import { useEffect, useState, useCallback } from 'react';
import { Loader2, AlertCircle, ChevronDown, ChevronUp, Calendar, FileText } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '../ui/dialog';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '../ui/collapsible';
import { Button } from '../ui/button';
import { TestApiService } from '../../services/api/TestApiService';
import { t } from '../../utils/i18n';

const testApiService = new TestApiService();

interface ErrorDetailDialogProps {
  fingerprint: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface ErrorDetail {
  fingerprint: string;
  pattern: string;
  category: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  errorMessage: string;
  stackTrace?: string;
  occurrenceCount: number;
  affectedTestFiles: Array<{
    filePath: string;
    count: number;
    firstSeen: string;
    lastSeen: string;
  }>;
  timeline: Array<{
    date: string;
    count: number;
    testFiles: string[];
  }>;
  occurrences: Array<{
    testFilePath: string;
    testName: string;
    executionTimestamp: string;
    duration?: number;
  }>;
  relatedErrors: Array<{
    fingerprint: string;
    pattern: string;
    category: string;
    occurrenceCount: number;
    similarity: number;
  }>;
  firstSeen: string;
  lastSeen: string;
}

const severityColors = {
  low: 'bg-primary/10 text-primary',
  medium: 'bg-yellow-100 dark:bg-yellow-950/30 text-yellow-800 dark:text-yellow-200',
  high: 'bg-orange-100 dark:bg-orange-950/30 text-orange-800 dark:text-orange-200',
  critical: 'bg-red-100 dark:bg-red-950/30 text-red-800 dark:text-red-200',
};

const categoryColors: Record<string, string> = {
  timeout: 'bg-purple-100 dark:bg-purple-950/30 text-purple-800 dark:text-purple-200',
  network: 'bg-primary/10 text-primary',
  assertion: 'bg-red-100 dark:bg-red-950/30 text-red-800 dark:text-red-200',
  database: 'bg-green-100 dark:bg-green-950/30 text-green-800 dark:text-green-200',
  environment: 'bg-muted text-muted-foreground',
  memory: 'bg-pink-100 dark:bg-pink-950/30 text-pink-800 dark:text-pink-200',
  'type-error': 'bg-indigo-100 dark:bg-indigo-950/30 text-indigo-800 dark:text-indigo-200',
  permission: 'bg-yellow-100 dark:bg-yellow-950/30 text-yellow-800 dark:text-yellow-200',
  'not-found': 'bg-orange-100 dark:bg-orange-950/30 text-orange-800 dark:text-orange-200',
  syntax: 'bg-red-100 dark:bg-red-950/30 text-red-800 dark:text-red-200',
  playwright: 'bg-cyan-100 dark:bg-cyan-950/30 text-cyan-800 dark:text-cyan-200',
  other: 'bg-muted text-muted-foreground',
};

export function ErrorDetailDialog({ fingerprint, open, onOpenChange }: ErrorDetailDialogProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<ErrorDetail | null>(null);
  const [stackTraceOpen, setStackTraceOpen] = useState(false);

  const loadErrorDetails = useCallback(async () => {
    if (!fingerprint) return;

    try {
      setLoading(true);
      setError(null);
      // Use getErrorLogs with fingerprint filter
      const result = await testApiService.getErrorLogs({ errorFingerprint: fingerprint, limit: 1 }) as { errors?: unknown[]; [key: string]: unknown };
      const errorData = Array.isArray(result.errors) && result.errors.length > 0 ? result.errors[0] : null;
      setData(errorData as ErrorDetail | null);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : t('errorDetailDialog.failedToLoad');
      setError(errorMessage);
      console.error('Error loading error details:', err);
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [fingerprint]);

  useEffect(() => {
    if (open && fingerprint) {
      loadErrorDetails();
    } else {
      setData(null);
      setError(null);
      setStackTraceOpen(false);
    }
  }, [open, fingerprint, loadErrorDetails]);

  if (!fingerprint) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t('errorDetailDialog.title')}</DialogTitle>
          <DialogDescription>
            {t('errorDetailDialog.description')}: {fingerprint.substring(0, 16)}...
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
            <span className="ml-2 text-gray-600">{t('errorDetailDialog.loading')}</span>
          </div>
        ) : error ? (
          <div className="flex items-center justify-center py-12 text-red-600">
            <AlertCircle className="w-6 h-6 mr-2" />
            <span>{error}</span>
          </div>
        ) : data ? (
          <div className="space-y-6">
            {/* Error Message */}
            <div>
              <h3 className="text-sm font-medium text-gray-700 mb-2">{t('errorDetailDialog.errorMessage')}</h3>
              <div className="bg-gray-50 border rounded-lg p-4 font-mono text-sm">
                {data.errorMessage}
              </div>
            </div>

            {/* Category and Severity Badges */}
            <div className="flex gap-4 items-center">
              <div>
                <span className="text-sm font-medium text-gray-700 mr-2">{t('errorDetailDialog.category')}:</span>
                <span
                  className={`px-3 py-1 rounded-full text-sm font-medium ${
                    categoryColors[data.category] || categoryColors.other
                  }`}
                >
                  {data.category}
                </span>
              </div>
              <div>
                <span className="text-sm font-medium text-gray-700 mr-2">{t('errorDetailDialog.severity')}:</span>
                <span
                  className={`px-3 py-1 rounded-full text-sm font-medium ${
                    severityColors[data.severity]
                  }`}
                >
                  {data.severity}
                </span>
              </div>
              <div>
                <span className="text-sm font-medium text-gray-700 mr-2">{t('errorDetailDialog.occurrences')}:</span>
                <span className="text-sm font-semibold">{data.occurrenceCount.toLocaleString()}</span>
              </div>
            </div>

            {/* Stack Trace (Collapsible) */}
            {data.stackTrace && (
              <Collapsible open={stackTraceOpen} onOpenChange={setStackTraceOpen}>
                <CollapsibleTrigger asChild>
                  <Button variant="outline" className="w-full justify-between">
                    <span>{t('errorDetailDialog.stackTrace')}</span>
                    {stackTraceOpen ? (
                      <ChevronUp className="w-4 h-4" />
                    ) : (
                      <ChevronDown className="w-4 h-4" />
                    )}
                  </Button>
                </CollapsibleTrigger>
                <CollapsibleContent className="mt-2">
                  <div className="bg-gray-50 border rounded-lg p-4 font-mono text-xs overflow-x-auto">
                    <pre className="whitespace-pre-wrap">{data.stackTrace}</pre>
                  </div>
                </CollapsibleContent>
              </Collapsible>
            )}

            {/* Timeline */}
            <div>
              <h3 className="text-sm font-medium text-gray-700 mb-2 flex items-center gap-2">
                <Calendar className="w-4 h-4" />
                {t('errorDetailDialog.occurrenceTimeline')}
              </h3>
              <div className="bg-gray-50 border rounded-lg p-4 space-y-2 max-h-48 overflow-y-auto">
                {data.timeline.length > 0 ? (
                  data.timeline.map((item, index) => (
                    <div key={index} className="flex items-center justify-between text-sm">
                      <span className="text-gray-600">
                        {new Date(item.date).toLocaleDateString()}
                      </span>
                      <span className="font-medium">{t('errorDetailDialog.occurrencesCount').replace('{{count}}', String(item.count))}</span>
                    </div>
                  ))
                ) : (
                  <div className="text-gray-500 text-sm">{t('errorDetailDialog.noTimelineData')}</div>
                )}
              </div>
            </div>

            {/* Affected Test Files */}
            <div>
              <h3 className="text-sm font-medium text-gray-700 mb-2 flex items-center gap-2">
                <FileText className="w-4 h-4" />
                {t('errorDetailDialog.affectedTestFiles')} ({data.affectedTestFiles.length})
              </h3>
              <div className="bg-gray-50 border rounded-lg p-4 space-y-2 max-h-48 overflow-y-auto">
                {data.affectedTestFiles.length > 0 ? (
                  data.affectedTestFiles.map((file, index) => (
                    <div key={index} className="flex items-center justify-between text-sm">
                      <span className="text-gray-700 font-mono text-xs truncate flex-1">
                        {file.filePath}
                      </span>
                      <span className="text-gray-600 ml-4">{t('errorDetailDialog.occurrencesCount').replace('{{count}}', String(file.count))}</span>
                    </div>
                  ))
                ) : (
                  <div className="text-gray-500 text-sm">{t('errorDetailDialog.noAffectedTestFiles')}</div>
                )}
              </div>
            </div>

            {/* Related Errors */}
            {data.relatedErrors.length > 0 && (
              <div>
                <h3 className="text-sm font-medium text-gray-700 mb-2">
                  {t('errorDetailDialog.relatedErrors')} ({data.relatedErrors.length})
                </h3>
                <div className="bg-gray-50 border rounded-lg p-4 space-y-2 max-h-48 overflow-y-auto">
                  {data.relatedErrors.map((related, index) => (
                    <div key={index} className="flex items-center justify-between text-sm">
                      <div className="flex-1">
                        <div className="font-medium text-gray-700">{related.pattern}</div>
                        <div className="text-xs text-gray-500">
                          {related.category} • {t('errorDetailDialog.occurrencesCount').replace('{{count}}', String(related.occurrenceCount))} •{' '}
                          {related.similarity.toFixed(1)}% {t('errorDetailDialog.similar')}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* First/Last Seen */}
            <div className="flex gap-4 text-sm text-gray-600">
              <div>
                <span className="font-medium">{t('errorDetailDialog.firstSeen')}:</span>{' '}
                {new Date(data.firstSeen).toLocaleString()}
              </div>
              <div>
                <span className="font-medium">{t('errorDetailDialog.lastSeen')}:</span>{' '}
                {new Date(data.lastSeen).toLocaleString()}
              </div>
            </div>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

