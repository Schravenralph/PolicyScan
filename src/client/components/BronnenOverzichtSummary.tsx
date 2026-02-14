/**
 * BronnenOverzicht Summary Component
 * 
 * Title, description, search parameters summary, and status overview.
 */

import type { NormalizedScanParameters } from '../types/scanParameters';
import { t } from '../utils/i18n';

interface BronnenOverzichtSummaryProps {
  normalizedParams: NormalizedScanParameters;
  totalBronnen: number;
  pendingCount: number;
  approvedCount: number;
  rejectedCount: number;
}

export function BronnenOverzichtSummary({
  normalizedParams,
  totalBronnen,
  pendingCount,
  approvedCount,
  rejectedCount,
}: BronnenOverzichtSummaryProps) {
  return (
    <div className="mb-8">
      <h2 className="text-5xl mb-4 font-serif font-extrabold text-foreground">
        Gevonden Bronnen
      </h2>
      <p className="text-xl mb-6 text-muted-foreground">
        Op basis van uw zoekopdracht hebben we {totalBronnen} relevante bronnen gevonden. Bekijk per bron of deze geschikt is voor uw analyse.
      </p>

      {/* Search Parameters Summary */}
      <div className="p-6 rounded-xl mb-6 bg-primary/10 border border-primary/20">
        <h3 className="mb-3 font-serif font-semibold text-foreground">
          Zoekparameters:
        </h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
          <div>
            <p className="text-muted-foreground">Overheidslaag</p>
            <p className="text-foreground">{normalizedParams.overheidslaag}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Onderwerp</p>
            <p className="text-foreground">{normalizedParams.onderwerp || t('common.notSpecified')}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Thema</p>
            <p className="text-foreground">{normalizedParams.thema || t('common.notSpecified')}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Bronnen</p>
            <p className="text-foreground">{normalizedParams.zoeklocaties.join(', ')}</p>
          </div>
        </div>
      </div>

      {/* Status Overview */}
      <div className="grid grid-cols-3 gap-4 mb-8">
        <div className="p-4 rounded-lg bg-card border border-border">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-3 h-3 rounded-full bg-muted-foreground" />
            <span className="text-sm text-muted-foreground">{t('step3.toReview')}</span>
          </div>
          <p className="text-3xl font-serif font-semibold text-foreground">
            {pendingCount}
          </p>
        </div>
        <div className="p-4 rounded-lg bg-card border border-border">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-3 h-3 rounded-full bg-primary" />
            <span className="text-sm text-muted-foreground">{t('step3.approved')}</span>
          </div>
          <p className="text-3xl font-serif font-semibold text-foreground">
            {approvedCount}
          </p>
        </div>
        <div className="p-4 rounded-lg bg-card border border-border">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-3 h-3 rounded-full bg-destructive" />
            <span className="text-sm text-muted-foreground">{t('step3.rejected')}</span>
          </div>
          <p className="text-3xl font-serif font-semibold text-foreground">
            {rejectedCount}
          </p>
        </div>
      </div>
    </div>
  );
}
