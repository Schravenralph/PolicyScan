/**
 * Document Tag Badge Component
 * 
 * Displays a tag badge with optional remove functionality.
 */
import { X } from 'lucide-react';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import type { DocumentTag } from '../services/api/DocumentTagApiService';

export interface DocumentTagBadgeProps {
  tag: DocumentTag;
  onRemove?: (tagId: string) => void;
  className?: string;
}

export function DocumentTagBadge({ tag, onRemove, className }: DocumentTagBadgeProps) {
  const badgeStyle = tag.color
    ? { backgroundColor: `${tag.color}20`, borderColor: tag.color, color: tag.color }
    : undefined;

  return (
    <Badge
      variant="outline"
      className={`flex items-center gap-1 ${className || ''}`}
      style={badgeStyle}
    >
      <span>{tag.label}</span>
      {onRemove && (
        <Button
          variant="ghost"
          size="sm"
          className="h-4 w-4 p-0 hover:bg-transparent"
          onClick={(e) => {
            e.stopPropagation();
            onRemove(tag.id);
          }}
          aria-label={`Remove tag ${tag.label}`}
        >
          <X className="h-3 w-3" />
        </Button>
      )}
    </Badge>
  );
}
