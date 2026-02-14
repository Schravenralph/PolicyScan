/**
 * BronnenOverzicht Header Component
 * 
 * Header with logo, title, and back button.
 */

import { ArrowLeft } from 'lucide-react';
import { Button } from './ui/button';
import { t } from '../utils/i18n';

const logo = '/logo.svg';

interface BronnenOverzichtHeaderProps {
  onBack: () => void;
}

export function BronnenOverzichtHeader({ onBack }: BronnenOverzichtHeaderProps) {
  return (
    <header className="border-b border-border bg-background">
      <div className="container mx-auto px-6 py-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img src={logo} alt={t('bronnenOverzichtHeader.logo')} className="w-12 h-12" />
            <div>
              <h1 className="tracking-widest text-foreground tracking-[0.2em]">
                RUIMTEMEESTERS
              </h1>
              <p className="text-sm text-muted-foreground">
                Kleine acties. Grote impact.
              </p>
            </div>
          </div>
          <Button
            variant="ghost"
            onClick={onBack}
            className="flex items-center gap-2"
          >
            <ArrowLeft className="w-5 h-5" />
            {t('bronnenOverzichtHeader.backToIntake')}
          </Button>
        </div>
      </div>
    </header>
  );
}
