/**
 * Step3 Summary Component
 * 
 * Displays scan summary with query details.
 */

import { memo, useMemo } from 'react';
import type { CanonicalDocument } from '../../services/api';
import type { LightweightDocument } from '../../utils/documentStateOptimization';
import { t } from '../../utils/i18n';

interface OverheidslaagConfig {
  id: 'gemeente' | 'waterschap' | 'provincie' | 'rijk' | 'kennisinstituut';
  label: string;
}

interface Step3SummaryProps {
  overheidslagen: OverheidslaagConfig[];
  overheidslaag: 'gemeente' | 'waterschap' | 'provincie' | 'rijk' | 'kennisinstituut' | '';
  selectedEntity: string;
  onderwerp: string;
  selectedWebsites: string[];
  documents: (CanonicalDocument | LightweightDocument)[];
}

function Step3SummaryComponent({
  overheidslagen,
  overheidslaag,
  selectedEntity,
  onderwerp,
  selectedWebsites,
  documents,
}: Step3SummaryProps) {
  // Memoize overheidslaag lookup to avoid find() on every render
  const overheidslaagLabel = useMemo(() => {
    return overheidslagen.find(l => l.id === overheidslaag)?.label;
  }, [overheidslagen, overheidslaag]);

  return (
    <div className="mt-8 p-6 rounded-xl bg-primary/10 border border-primary/20">
      <h4 className="mb-4 font-serif font-semibold text-foreground">
        {t('beleidsscan.scanSummaryTitle')}
      </h4>
      <div className="space-y-2 text-sm">
        <p className="text-muted-foreground">
          <strong className="text-foreground">{t('step3Summary.governmentLayer')}:</strong> {overheidslaagLabel}
        </p>
        {selectedEntity && (
          <p className="text-muted-foreground">
            <strong className="text-foreground">{t('step3Summary.entity')}:</strong> {selectedEntity}
          </p>
        )}
        <p className="text-muted-foreground">
          <strong className="text-foreground">{t('step3Summary.query')}:</strong> {onderwerp}
        </p>
        <p className="text-muted-foreground">
          <strong className="text-foreground">{t('step3Summary.scrapedWebsites')}:</strong> {selectedWebsites.length}
        </p>
        <p className="text-muted-foreground">
          <strong className="text-foreground">{t('step3Summary.foundDocuments')}:</strong> {documents.length}
        </p>
      </div>
    </div>
  );
}

// Memoize Step3Summary to prevent unnecessary re-renders
// Only re-render when props actually change
export const Step3Summary = memo(Step3SummaryComponent, (prevProps, nextProps) => {
  // Compare primitive values
  if (
    prevProps.overheidslaag !== nextProps.overheidslaag ||
    prevProps.selectedEntity !== nextProps.selectedEntity ||
    prevProps.onderwerp !== nextProps.onderwerp
  ) {
    return false;
  }
  
  // Compare array lengths (most common change)
  if (
    prevProps.selectedWebsites.length !== nextProps.selectedWebsites.length ||
    prevProps.documents.length !== nextProps.documents.length
  ) {
    return false;
  }
  
  // Shallow compare selectedWebsites array (check if same reference or same values)
  if (prevProps.selectedWebsites !== nextProps.selectedWebsites) {
    // Arrays are different references, check if contents are the same
    for (let i = 0; i < prevProps.selectedWebsites.length; i++) {
      if (prevProps.selectedWebsites[i] !== nextProps.selectedWebsites[i]) {
        return false;
      }
    }
  }
  
  return true;
});
