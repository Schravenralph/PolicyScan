/**
 * BronnenOverzicht Custom Source Component
 * 
 * Form for adding custom document URL.
 */

import { Plus } from 'lucide-react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Card } from './ui/card';
import { Label } from './ui/label';
import { t } from '../utils/i18n';

interface BronnenOverzichtCustomSourceProps {
  customBronUrl: string;
  onUrlChange: (url: string) => void;
  onAdd: () => void;
  isLoading: boolean;
}

export function BronnenOverzichtCustomSource({
  customBronUrl,
  onUrlChange,
  onAdd,
  isLoading,
}: BronnenOverzichtCustomSourceProps) {
  return (
    <Card className="p-6 mb-8 bg-card border-border">
      <h3 className="mb-4 font-serif font-semibold text-foreground">
        {t('bronnenOverzicht.addCustomSource')}
      </h3>
      <div className="flex gap-3 items-end">
        <div className="flex-1 space-y-2">
          <Label htmlFor="custom-bron-url">{t('bronnenOverzicht.documentUrl')}</Label>
          <Input
            id="custom-bron-url"
            placeholder="https://voorbeeld.nl/beleidsplan.pdf"
            value={customBronUrl}
            onChange={(e) => onUrlChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                onAdd();
              }
            }}
            disabled={isLoading}
            className="border-2 bg-background border-border"
          />
        </div>
        <Button
          onClick={onAdd}
          disabled={!customBronUrl}
          isLoading={isLoading}
          loadingText={t('bronnenOverzicht.analyzing')}
          className={`flex items-center gap-2 ${customBronUrl && !isLoading ? 'bg-primary text-primary-foreground hover:bg-primary/90' : 'bg-muted text-muted-foreground'}`}
        >
          <Plus className="w-4 h-4" />
          {t('bronnenOverzicht.add')}
        </Button>
      </div>
    </Card>
  );
}
