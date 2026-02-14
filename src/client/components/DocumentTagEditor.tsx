/**
 * Document Tag Editor Component
 * 
 * Allows adding and removing tags from a document.
 */
import { useState, useEffect, useMemo } from 'react';
import { Plus, Loader2 } from 'lucide-react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Badge } from './ui/badge';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from './ui/popover';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from './ui/command';
import { documentTagApiService, type DocumentTag } from '../services/api/DocumentTagApiService';
import { DocumentTagBadge } from './DocumentTagBadge';
import { logError } from '../utils/errorHandler';
import { toast } from '../utils/toast';

export interface DocumentTagEditorProps {
  documentId: string;
  currentTags: string[]; // Array of tag IDs
  onTagsChange?: (tagIds: string[]) => void;
  className?: string;
}

export function DocumentTagEditor({
  documentId,
  currentTags,
  onTagsChange,
  className,
}: DocumentTagEditorProps) {
  const [allTags, setAllTags] = useState<DocumentTag[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [newTagLabel, setNewTagLabel] = useState('');
  const [creatingTag, setCreatingTag] = useState(false);

  // Load all tags
  useEffect(() => {
    loadTags();
  }, []);

  const loadTags = async () => {
    try {
      setLoading(true);
      const tags = await documentTagApiService.getTags();
      setAllTags(tags);
    } catch (error) {
      logError(error as Error, 'load-tags');
      toast.error('Failed to load tags', 'Please try again later');
    } finally {
      setLoading(false);
    }
  };

  // Get current tag objects
  const currentTagObjects = useMemo(() => {
    return allTags.filter(tag => currentTags.includes(tag.id));
  }, [allTags, currentTags]);

  // Get available tags (not already added)
  const availableTags = useMemo(() => {
    return allTags.filter(tag => !currentTags.includes(tag.id));
  }, [allTags, currentTags]);

  // Filter available tags by search query
  const filteredTags = useMemo(() => {
    if (!searchQuery) return availableTags;
    const query = searchQuery.toLowerCase();
    return availableTags.filter(
      tag => tag.label.toLowerCase().includes(query) || tag.id.toLowerCase().includes(query)
    );
  }, [availableTags, searchQuery]);

  const handleAddTag = async (tagId: string) => {
    try {
      await documentTagApiService.addTagToDocument(tagId, documentId);
      const updatedTags = [...currentTags, tagId];
      onTagsChange?.(updatedTags);
      setOpen(false);
      setSearchQuery('');
    } catch (error) {
      logError(error as Error, 'add-tag-to-document');
      toast.error('Failed to add tag', 'Please try again later');
    }
  };

  const handleRemoveTag = async (tagId: string) => {
    try {
      await documentTagApiService.removeTagFromDocument(tagId, documentId);
      const updatedTags = currentTags.filter(id => id !== tagId);
      onTagsChange?.(updatedTags);
    } catch (error) {
      logError(error as Error, 'remove-tag-from-document');
      toast.error('Failed to remove tag', 'Please try again later');
    }
  };

  const handleCreateTag = async () => {
    if (!newTagLabel.trim()) return;

    try {
      setCreatingTag(true);
      // Generate tag ID from label (slugify)
      const tagId = newTagLabel
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');

      const newTag = await documentTagApiService.createTag({
        id: tagId,
        label: newTagLabel.trim(),
        category: 'custom',
      });

      // Add the new tag to the document
      await documentTagApiService.addTagToDocument(newTag.id, documentId);
      const updatedTags = [...currentTags, newTag.id];
      onTagsChange?.(updatedTags);

      // Refresh tags list
      await loadTags();

      setNewTagLabel('');
      setOpen(false);
      toast.success('Tag created and added', '');
    } catch (error) {
      logError(error as Error, 'create-tag');
      toast.error('Failed to create tag', 'Please try again later');
    } finally {
      setCreatingTag(false);
    }
  };

  return (
    <div className={className}>
      <div className="flex flex-wrap gap-2 mb-2">
        {currentTagObjects.map(tag => (
          <DocumentTagBadge
            key={tag.id}
            tag={tag}
            onRemove={handleRemoveTag}
          />
        ))}
      </div>

      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button variant="outline" size="sm" className="h-8">
            <Plus className="h-4 w-4 mr-1" />
            Add Tag
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[300px] p-0" align="start">
          <Command>
            <CommandInput
              placeholder="Search tags..."
              value={searchQuery}
              onValueChange={setSearchQuery}
            />
            <CommandList>
              <CommandEmpty>
                {loading ? (
                  <div className="flex items-center justify-center p-4">
                    <Loader2 className="h-4 w-4 animate-spin" />
                  </div>
                ) : (
                  <div className="p-4">
                    <p className="text-sm text-muted-foreground mb-2">No tags found</p>
                    <div className="space-y-2">
                      <Input
                        placeholder="Create new tag..."
                        value={newTagLabel}
                        onChange={(e) => setNewTagLabel(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            handleCreateTag();
                          }
                        }}
                      />
                      <Button
                        size="sm"
                        onClick={handleCreateTag}
                        disabled={!newTagLabel.trim() || creatingTag}
                        className="w-full"
                      >
                        {creatingTag ? (
                          <>
                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                            Creating...
                          </>
                        ) : (
                          'Create Tag'
                        )}
                      </Button>
                    </div>
                  </div>
                )}
              </CommandEmpty>
              {filteredTags.length > 0 && (
                <CommandGroup heading="Available Tags">
                  {filteredTags.map(tag => (
                    <CommandItem
                      key={tag.id}
                      onSelect={() => handleAddTag(tag.id)}
                      className="cursor-pointer"
                    >
                      <div className="flex items-center gap-2 flex-1">
                        {tag.color && (
                          <div
                            className="w-3 h-3 rounded-full"
                            style={{ backgroundColor: tag.color }}
                          />
                        )}
                        <span>{tag.label}</span>
                        {tag.category && (
                          <Badge variant="outline" className="text-xs">
                            {tag.category}
                          </Badge>
                        )}
                      </div>
                    </CommandItem>
                  ))}
                </CommandGroup>
              )}
              {filteredTags.length === 0 && !loading && searchQuery && (
                <CommandGroup>
                  <div className="p-4">
                    <p className="text-sm text-muted-foreground mb-2">
                      Create new tag &quot;{searchQuery}&quot;
                    </p>
                    <Button
                      size="sm"
                      onClick={() => {
                        setNewTagLabel(searchQuery);
                        handleCreateTag();
                      }}
                      disabled={creatingTag}
                      className="w-full"
                    >
                      {creatingTag ? (
                        <>
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          Creating...
                        </>
                      ) : (
                        'Create Tag'
                      )}
                    </Button>
                  </div>
                </CommandGroup>
              )}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </div>
  );
}
