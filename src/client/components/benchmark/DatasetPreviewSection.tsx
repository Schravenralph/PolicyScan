/**
 * Dataset Preview Section Component
 * 
 * Displays preview of dataset before upload.
 */

import { CheckCircle2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { t } from '../../utils/i18n';
import type { GroundTruthDataset } from './GroundTruthDatasetList';

interface DatasetPreviewSectionProps {
  previewData: GroundTruthDataset | null;
}

export function DatasetPreviewSection({ previewData }: DatasetPreviewSectionProps) {
  if (!previewData) {
    return null;
  }

  return (
    <Card className="bg-green-50 border-green-200">
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <CheckCircle2 className="w-5 h-5 text-green-600" />
          {t('benchmark.preview')}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-2 text-sm">
          <p><strong>Naam:</strong> {previewData.name}</p>
          {previewData.description && (
            <p><strong>Beschrijving:</strong> {previewData.description}</p>
          )}
          <p><strong>{t('benchmark.queries')}</strong> {previewData.queries.length}</p>
          <p><strong>{t('benchmark.totalDocuments')}</strong>{' '}
            {previewData.queries.reduce((sum, q) => sum + q.relevant_documents.length, 0)}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
