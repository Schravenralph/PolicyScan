import { useState, useEffect, useCallback } from 'react';
import { api } from '../../services/api';
import { logError } from '../../utils/errorHandler';
import { t } from '../../utils/i18n';

interface QualityMetrics {
  _id?: string;
  date: string;
  totalDocuments: number;
  documentsWithMetadata: number;
  metadataCoverage: number;
  averageConfidence: number;
  structuredExtractionCount: number;
  llmExtractionCount: number;
  hybridExtractionCount: number;
  extractionErrors: number;
  errorRate: number;
  highConfidenceCount: number;
  mediumConfidenceCount: number;
  lowConfidenceCount: number;
}

interface QualityReport {
  period: {
    start: string;
    end: string;
  };
  overall: {
    coverage: number;
    averageConfidence: number;
    accuracy?: number;
  };
  byField: {
    documentType?: { accuracy: number };
    publicationDate?: { accuracy: number };
    themes?: { precision: number; recall: number };
    issuingAuthority?: { accuracy: number };
  };
  byMethod: {
    structured: { count: number; averageConfidence: number };
    llm: { count: number; averageConfidence: number };
    hybrid: { count: number; averageConfidence: number };
  };
  errors: {
    total: number;
    rate: number;
  };
  trends: {
    coverage: number[];
    confidence: number[];
  };
}

interface Alert {
  type: string;
  message: string;
  severity: 'warning' | 'error';
}

interface LowConfidenceDocument {
  _id: string;
  titel: string;
  url: string;
  metadataConfidence?: number;
  type_document?: string;
  publicatiedatum?: string;
  themes?: string[];
  issuingAuthority?: string;
}

export function MetadataQualityDashboard() {
  const [, setMetrics] = useState<QualityMetrics[]>([]);
  const [latestMetrics, setLatestMetrics] = useState<QualityMetrics | null>(null);
  const [report, setReport] = useState<QualityReport | null>(null);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [lowConfidenceDocs, setLowConfidenceDocs] = useState<LowConfidenceDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [dateRange, setDateRange] = useState({
    start: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    end: new Date().toISOString().split('T')[0]
  });
  const [selectedDocument, setSelectedDocument] = useState<LowConfidenceDocument | null>(null);
  const [correctionField, setCorrectionField] = useState<string>('');
  const [correctionValue, setCorrectionValue] = useState<string>('');

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [metricsRes, latestRes, alertsRes, lowConfRes] = await Promise.all([
        api.get<{ metrics: QualityMetrics[] }>(
          `/metadata-quality/metrics?startDate=${dateRange.start}&endDate=${dateRange.end}`
        ),
        api.get<{ metrics: QualityMetrics | null }>('/metadata-quality/metrics/latest'),
        api.get<{ alerts: Alert[] }>('/metadata-quality/alerts'),
        api.get<{ documents: LowConfidenceDocument[] }>(
          `/metadata-quality/low-confidence?limit=20&startDate=${dateRange.start}&endDate=${dateRange.end}`
        )
      ]);

      setMetrics(metricsRes.metrics || []);
      setLatestMetrics(latestRes.metrics);
      setAlerts(alertsRes.alerts || []);
      setLowConfidenceDocs(lowConfRes.documents || []);
    } catch (error) {
      logError(error, 'load-quality-data');
    } finally {
      setLoading(false);
    }
  }, [dateRange.start, dateRange.end]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const generateReport = async () => {
    try {
      const response = await api.get<{ report: QualityReport }>(
        `/metadata-quality/report?startDate=${dateRange.start}&endDate=${dateRange.end}`
      );
      setReport(response.report);
    } catch (error) {
      logError(error, 'generate-quality-report');
      alert('Failed to generate report');
    }
  };

  const calculateMetrics = async () => {
    try {
      await api.post('/metadata-quality/metrics/calculate', { date: new Date().toISOString() });
      await loadData();
      alert('Metrics calculated successfully');
    } catch (error) {
      logError(error, 'calculate-quality-metrics');
      alert('Failed to calculate metrics');
    }
  };

  const correctMetadata = async () => {
    if (!selectedDocument || !correctionField || !correctionValue) {
      alert('Please select a document, field, and provide a corrected value');
      return;
    }

    try {
      await api.post('/metadata-quality/correct', {
        documentId: selectedDocument._id,
        field: correctionField,
        correctedValue: correctionValue,
        reason: 'Manual correction from admin dashboard'
      });
      alert('Metadata corrected successfully');
      setSelectedDocument(null);
      setCorrectionField('');
      setCorrectionValue('');
      await loadData();
    } catch (error) {
      logError(error, 'correct-metadata');
      alert('Failed to correct metadata');
    }
  };

  if (loading) {
    return <div className="p-4">{t('common.loadingMetrics')}</div>;
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold">Metadata Quality Dashboard</h2>
        <div className="flex gap-2">
          <button
            onClick={calculateMetrics}
            className="px-4 py-2 bg-primary text-primary-foreground rounded hover:bg-primary/90"
          >
            Calculate Metrics
          </button>
          <button
            onClick={generateReport}
            className="px-4 py-2 bg-green-600 dark:bg-green-700 text-white rounded hover:bg-green-700 dark:hover:bg-green-800"
          >
            Generate Report
          </button>
        </div>
      </div>

      {/* Date Range Selector */}
      <div className="flex gap-4 items-center">
        <label className="flex items-center gap-2">
          <span>Start Date:</span>
          <input
            type="date"
            value={dateRange.start}
            onChange={(e) => setDateRange({ ...dateRange, start: e.target.value })}
            className="border rounded px-2 py-1"
          />
        </label>
        <label className="flex items-center gap-2">
          <span>End Date:</span>
          <input
            type="date"
            value={dateRange.end}
            onChange={(e) => setDateRange({ ...dateRange, end: e.target.value })}
            className="border rounded px-2 py-1"
          />
        </label>
      </div>

      {/* Alerts */}
      {alerts.length > 0 && (
        <div className="space-y-2">
          {alerts.map((alert, idx) => (
            <div
              key={idx}
              className={`p-4 rounded ${
                alert.severity === 'error'
                  ? 'bg-destructive/10 border border-destructive/30 text-destructive dark:text-destructive'
                  : 'bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 text-yellow-800 dark:text-yellow-200'
              }`}
            >
              <strong>{alert.severity === 'error' ? 'Error' : 'Warning'}:</strong> {alert.message}
            </div>
          ))}
        </div>
      )}

      {/* Latest Metrics Overview */}
      {latestMetrics && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="bg-card p-4 rounded shadow border border-border">
            <h3 className="text-sm font-semibold text-muted-foreground">Coverage</h3>
            <p className="text-2xl font-bold">{latestMetrics.metadataCoverage.toFixed(1)}%</p>
            <p className="text-xs text-muted-foreground">
              {latestMetrics.documentsWithMetadata} / {latestMetrics.totalDocuments} documents
            </p>
          </div>
          <div className="bg-card p-4 rounded shadow border border-border">
            <h3 className="text-sm font-semibold text-muted-foreground">Avg Confidence</h3>
            <p className="text-2xl font-bold">{(latestMetrics.averageConfidence * 100).toFixed(1)}%</p>
            <p className="text-xs text-gray-500">{t('admin.averageMetadataConfidence')}</p>
          </div>
          <div className="bg-card p-4 rounded shadow border border-border">
            <h3 className="text-sm font-semibold text-muted-foreground">Error Rate</h3>
            <p className="text-2xl font-bold">{latestMetrics.errorRate.toFixed(1)}%</p>
            <p className="text-xs text-gray-500">{latestMetrics.extractionErrors} errors</p>
          </div>
          <div className="bg-card p-4 rounded shadow border border-border">
            <h3 className="text-sm font-semibold text-muted-foreground">Low Confidence</h3>
            <p className="text-2xl font-bold">{latestMetrics.lowConfidenceCount}</p>
            <p className="text-xs text-gray-500">{t('admin.documentsWithLowConfidence')}</p>
          </div>
        </div>
      )}

      {/* Quality Report */}
      {report && (
        <div className="bg-card p-6 rounded shadow border border-border">
          <h3 className="text-xl font-bold mb-4">{t('admin.qualityReport')}</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <h4 className="font-semibold mb-2">{t('admin.overallMetrics')}</h4>
              <ul className="space-y-1 text-sm">
                <li>{t('admin.coverage')}: {report.overall.coverage.toFixed(1)}%</li>
                <li>{t('admin.avgConfidence')}: {(report.overall.averageConfidence * 100).toFixed(1)}%</li>
                {report.overall.accuracy && (
                  <li>{t('admin.accuracy')}: {report.overall.accuracy.toFixed(1)}%</li>
                )}
              </ul>
            </div>
            <div>
              <h4 className="font-semibold mb-2">{t('admin.byMethod')}</h4>
              <ul className="space-y-1 text-sm">
                <li>Structured: {report.byMethod.structured.count} docs</li>
                <li>LLM: {report.byMethod.llm.count} docs</li>
                <li>Hybrid: {report.byMethod.hybrid.count} docs</li>
              </ul>
            </div>
            {Object.keys(report.byField).length > 0 && (
              <div>
                <h4 className="font-semibold mb-2">Field Accuracy</h4>
                <ul className="space-y-1 text-sm">
                  {report.byField.documentType && (
                    <li>Document Type: {report.byField.documentType.accuracy.toFixed(1)}%</li>
                  )}
                  {report.byField.publicationDate && (
                    <li>Publication Date: {report.byField.publicationDate.accuracy.toFixed(1)}%</li>
                  )}
                  {report.byField.themes && (
                    <li>
                      Themes: P={report.byField.themes.precision.toFixed(1)}%, R={report.byField.themes.recall.toFixed(1)}%
                    </li>
                  )}
                </ul>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Low Confidence Documents */}
      <div className="bg-card p-6 rounded shadow border border-border">
        <h3 className="text-xl font-bold mb-4">Low Confidence Documents</h3>
        {lowConfidenceDocs.length === 0 ? (
          <p className="text-muted-foreground">No low confidence documents found</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-muted">
                <tr>
                  <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground uppercase">Title</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground uppercase">Confidence</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground uppercase">Type</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground uppercase">Actions</th>
                </tr>
              </thead>
              <tbody className="bg-background divide-y divide-border">
                {lowConfidenceDocs.map((doc) => (
                  <tr key={doc._id}>
                    <td className="px-4 py-2 text-sm">{doc.titel}</td>
                    <td className="px-4 py-2 text-sm">
                      {doc.metadataConfidence ? (doc.metadataConfidence * 100).toFixed(1) : 'N/A'}%
                    </td>
                    <td className="px-4 py-2 text-sm">{doc.type_document || 'N/A'}</td>
                    <td className="px-4 py-2 text-sm">
                      <button
                        onClick={() => setSelectedDocument(doc)}
                        className="text-primary hover:text-primary/80"
                      >
                        Review
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Correction Modal */}
      {selectedDocument && (
        <div className="fixed inset-0 bg-white backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-900 p-6 rounded shadow-2xl max-w-2xl w-full mx-4 border-2 border-primary">
            <h3 className="text-xl font-bold mb-4">{t('admin.correctMetadata')}</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">Document</label>
                <p className="text-sm text-foreground">{selectedDocument.titel}</p>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Field to Correct</label>
                <select
                  value={correctionField}
                  onChange={(e) => setCorrectionField(e.target.value)}
                  className="w-full border rounded px-3 py-2"
                >
                  <option value="">Select field</option>
                  <option value="documentType">Document Type</option>
                  <option value="publicationDate">Publication Date</option>
                  <option value="themes">Themes</option>
                  <option value="issuingAuthority">Issuing Authority</option>
                  <option value="documentStatus">Document Status</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">{t('admin.correctedValue')}</label>
                <input
                  type="text"
                  value={correctionValue}
                  onChange={(e) => setCorrectionValue(e.target.value)}
                  className="w-full border rounded px-3 py-2"
                  placeholder={t('admin.enterCorrectedValue')}
                />
              </div>
              <div className="flex gap-2 justify-end">
                <button
                  onClick={() => {
                    setSelectedDocument(null);
                    setCorrectionField('');
                    setCorrectionValue('');
                  }}
                  className="px-4 py-2 border rounded hover:bg-muted"
                >
                  Cancel
                </button>
                <button
                  onClick={correctMetadata}
                  className="px-4 py-2 bg-primary text-primary-foreground rounded hover:bg-primary/90"
                >
                  Apply Correction
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}


