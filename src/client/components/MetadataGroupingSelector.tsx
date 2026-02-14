import { Button } from './ui/button';
import { Label } from './ui/label';
import { Card } from './ui/card';
import { LayoutGrid, List } from 'lucide-react';

export type GroupingOption = 'none' | 'documentType' | 'theme' | 'date' | 'authority';

export interface MetadataGroupingSelectorProps {
  grouping: GroupingOption;
  onGroupingChange: (grouping: GroupingOption) => void;
  className?: string;
}

export function MetadataGroupingSelector({
  grouping,
  onGroupingChange,
  className = ''
}: MetadataGroupingSelectorProps) {
  return (
    <Card className={`p-4 ${className} bg-card border-border`}>
      <div className="flex items-center justify-between">
        <Label className="text-sm text-foreground">
          Groeperen op:
        </Label>
        <div className="flex gap-2">
          <Button
            variant={grouping === 'none' ? 'default' : 'outline'}
            size="sm"
            onClick={() => onGroupingChange('none')}
            className={`text-xs ${grouping === 'none' ? 'bg-primary text-primary-foreground hover:bg-primary/90' : 'border-border text-foreground hover:bg-muted'}`}
          >
            <List className="w-3 h-3 mr-1" />
            Geen
          </Button>
          <Button
            variant={grouping === 'documentType' ? 'default' : 'outline'}
            size="sm"
            onClick={() => onGroupingChange('documentType')}
            className={`text-xs ${grouping === 'documentType' ? 'bg-primary text-primary-foreground hover:bg-primary/90' : 'border-border text-foreground hover:bg-muted'}`}
          >
            <LayoutGrid className="w-3 h-3 mr-1" />
            Type
          </Button>
          <Button
            variant={grouping === 'theme' ? 'default' : 'outline'}
            size="sm"
            onClick={() => onGroupingChange('theme')}
            className={`text-xs ${grouping === 'theme' ? 'bg-primary text-primary-foreground hover:bg-primary/90' : 'border-border text-foreground hover:bg-muted'}`}
          >
            <LayoutGrid className="w-3 h-3 mr-1" />
            Thema
          </Button>
          <Button
            variant={grouping === 'date' ? 'default' : 'outline'}
            size="sm"
            onClick={() => onGroupingChange('date')}
            className={`text-xs ${grouping === 'date' ? 'bg-primary text-primary-foreground hover:bg-primary/90' : 'border-border text-foreground hover:bg-muted'}`}
          >
            <LayoutGrid className="w-3 h-3 mr-1" />
            Datum
          </Button>
          <Button
            variant={grouping === 'authority' ? 'default' : 'outline'}
            size="sm"
            onClick={() => onGroupingChange('authority')}
            className={`text-xs ${grouping === 'authority' ? 'bg-primary text-primary-foreground hover:bg-primary/90' : 'border-border text-foreground hover:bg-muted'}`}
          >
            <LayoutGrid className="w-3 h-3 mr-1" />
            Instantie
          </Button>
        </div>
      </div>
    </Card>
  );
}

