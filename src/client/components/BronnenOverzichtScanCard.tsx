/**
 * BronnenOverzicht Scan Card Component
 * 
 * Card for starting automatic scan with progress indicator.
 */

import { Loader2 } from 'lucide-react';
import { Button } from './ui/button';
import { Card } from './ui/card';
import { t } from '../utils/i18n';

interface ScanProgress {
  status: string;
  currentStep: string;
  documentsFound: number;
  sourcesFound: number;
}

interface BronnenOverzichtScanCardProps {
  isScanning: boolean;
  scanProgress: ScanProgress | null;
  onStartScan: () => void;
}

export function BronnenOverzichtScanCard({
  isScanning,
  scanProgress,
  onStartScan,
}: BronnenOverzichtScanCardProps) {
  return (
    <Card className={`p-6 mb-8 bg-card ${isScanning ? 'border-primary border-2' : 'border-border border'}`}>
      <div className="flex items-center justify-between">
        <div>
          <h3 className="mb-2 font-serif font-semibold text-foreground">
            Start automatische scan
          </h3>
          <p className="text-sm text-muted-foreground">
            Scan IPLO, bekende bronnen en Google Search voor relevante documenten
          </p>
          {scanProgress && (
            <div className="mt-3">
              <p className="text-sm font-medium text-primary">
                {scanProgress.currentStep}
              </p>
              {scanProgress.status === 'completed' && (
                <p className="text-sm mt-1 text-muted-foreground">
                  {scanProgress.documentsFound} documenten gevonden, {scanProgress.sourcesFound} nieuwe bronnen
                </p>
              )}
            </div>
          )}
        </div>
        <Button
          onClick={onStartScan}
          disabled={isScanning}
          className="flex items-center gap-2 bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
        >
          {isScanning ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              {t('bronnenOverzicht.scanning')}
            </>
          ) : (
            t('bronnenOverzicht.startScan')
          )}
        </Button>
      </div>
    </Card>
  );
}
