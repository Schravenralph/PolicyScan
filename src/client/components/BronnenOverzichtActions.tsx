/**
 * BronnenOverzicht Action Buttons Component
 * 
 * Back and continue buttons for navigation.
 */

import { ArrowLeft } from 'lucide-react';
import { Button } from './ui/button';

interface BronnenOverzichtActionsProps {
  onBack: () => void;
  approvedCount: number;
  onContinue?: () => void;
}

export function BronnenOverzichtActions({
  onBack,
  approvedCount,
  onContinue,
}: BronnenOverzichtActionsProps) {
  return (
    <div className="flex gap-4 mt-8">
      <Button
        onClick={onBack}
        variant="outline"
        className="flex items-center gap-2 border-border text-foreground hover:bg-muted"
      >
        <ArrowLeft className="w-4 h-4" />
        Terug
      </Button>
      <Button
        onClick={onContinue}
        disabled={approvedCount === 0}
        className={`flex items-center gap-2 ${approvedCount > 0 ? 'bg-primary text-primary-foreground hover:bg-primary/90' : 'bg-muted text-muted-foreground opacity-50'}`}
      >
        Doorgaan met analyse ({approvedCount} bronnen)
      </Button>
    </div>
  );
}
