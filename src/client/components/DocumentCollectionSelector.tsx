/**
 * Document Collection Selector Component
 * 
 * Allows adding and removing documents from collections.
 */
import { useState, useEffect, useMemo } from 'react';
import { FolderPlus, X, Loader2, Plus } from 'lucide-react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Badge } from './ui/badge';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from './ui/popover';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from './ui/dialog';
import { documentCollectionApiService, type DocumentCollection } from '../services/api/DocumentCollectionApiService';
import { logError } from '../utils/errorHandler';
import { toast } from '../utils/toast';

export interface DocumentCollectionSelectorProps {
  documentId: string;
  currentCollectionIds: string[]; // Array of collection IDs
  onCollectionsChange?: (collectionIds: string[]) => void;
  className?: string;
}

export function DocumentCollectionSelector({
  documentId,
  currentCollectionIds,
  onCollectionsChange,
  className,
}: DocumentCollectionSelectorProps) {
  const [allCollections, setAllCollections] = useState<DocumentCollection[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [newCollectionName, setNewCollectionName] = useState('');
  const [newCollectionDescription, setNewCollectionDescription] = useState('');
  const [creatingCollection, setCreatingCollection] = useState(false);

  // Load all collections
  useEffect(() => {
    loadCollections();
  }, []);

  const loadCollections = async () => {
    try {
      setLoading(true);
      const collections = await documentCollectionApiService.getCollections();
      setAllCollections(collections);
    } catch (error) {
      logError(error as Error, 'load-collections');
      toast.error('Failed to load collections', 'Please try again later');
    } finally {
      setLoading(false);
    }
  };

  // Get current collection objects
  const currentCollections = useMemo(() => {
    return allCollections.filter(collection => currentCollectionIds.includes(collection._id));
  }, [allCollections, currentCollectionIds]);

  // Get available collections (not already added)
  const availableCollections = useMemo(() => {
    return allCollections.filter(collection => !currentCollectionIds.includes(collection._id));
  }, [allCollections, currentCollectionIds]);

  const handleAddToCollection = async (collectionId: string) => {
    try {
      await documentCollectionApiService.addDocumentToCollection(collectionId, documentId);
      const updatedCollectionIds = [...currentCollectionIds, collectionId];
      onCollectionsChange?.(updatedCollectionIds);
      setOpen(false);
    } catch (error) {
      logError(error as Error, 'add-document-to-collection');
      toast.error('Failed to add document to collection', 'Please try again later');
    }
  };

  const handleRemoveFromCollection = async (collectionId: string) => {
    try {
      await documentCollectionApiService.removeDocumentFromCollection(collectionId, documentId);
      const updatedCollectionIds = currentCollectionIds.filter(id => id !== collectionId);
      onCollectionsChange?.(updatedCollectionIds);
    } catch (error) {
      logError(error as Error, 'remove-document-from-collection');
      toast.error('Failed to remove document from collection', 'Please try again later');
    }
  };

  const handleCreateCollection = async () => {
    if (!newCollectionName.trim()) return;

    try {
      setCreatingCollection(true);
      const newCollection = await documentCollectionApiService.createCollection({
        name: newCollectionName.trim(),
        description: newCollectionDescription.trim() || undefined,
      });

      // Add the document to the new collection
      await documentCollectionApiService.addDocumentToCollection(newCollection._id, documentId);
      const updatedCollectionIds = [...currentCollectionIds, newCollection._id];
      onCollectionsChange?.(updatedCollectionIds);

      // Refresh collections list
      await loadCollections();

      setNewCollectionName('');
      setNewCollectionDescription('');
      setCreateDialogOpen(false);
      setOpen(false);
      toast.success('Collection created and document added', '');
    } catch (error) {
      logError(error as Error, 'create-collection');
      toast.error('Failed to create collection', 'Please try again later');
    } finally {
      setCreatingCollection(false);
    }
  };

  return (
    <div className={className}>
      <div className="flex flex-wrap gap-2 mb-2">
        {currentCollections.map(collection => (
          <Badge
            key={collection._id}
            variant="outline"
            className="flex items-center gap-1"
            style={collection.color ? { borderColor: collection.color, color: collection.color } : undefined}
          >
            {collection.icon && <span className="mr-1">{collection.icon}</span>}
            <span>{collection.name}</span>
            <Button
              variant="ghost"
              size="sm"
              className="h-4 w-4 p-0 hover:bg-transparent"
              onClick={(e) => {
                e.stopPropagation();
                handleRemoveFromCollection(collection._id);
              }}
              aria-label={`Remove from collection ${collection.name}`}
            >
              <X className="h-3 w-3" />
            </Button>
          </Badge>
        ))}
      </div>

      <div className="flex gap-2">
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className="h-8">
              <FolderPlus className="h-4 w-4 mr-1" />
              Add to Collection
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-[300px] p-0" align="start">
            {loading ? (
              <div className="flex items-center justify-center p-4">
                <Loader2 className="h-4 w-4 animate-spin" />
              </div>
            ) : availableCollections.length === 0 ? (
              <div className="p-4">
                <p className="text-sm text-muted-foreground mb-2">No collections available</p>
                <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
                  <DialogTrigger asChild>
                    <Button size="sm" className="w-full">
                      <Plus className="h-4 w-4 mr-2" />
                      Create Collection
                    </Button>
                  </DialogTrigger>
                </Dialog>
              </div>
            ) : (
              <div className="p-2">
                <div className="space-y-1">
                  {availableCollections.map(collection => (
                    <Button
                      key={collection._id}
                      variant="ghost"
                      className="w-full justify-start"
                      onClick={() => handleAddToCollection(collection._id)}
                    >
                      {collection.icon && <span className="mr-2">{collection.icon}</span>}
                      <span className="flex-1 text-left">{collection.name}</span>
                    </Button>
                  ))}
                </div>
                <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
                  <DialogTrigger asChild>
                    <Button variant="outline" size="sm" className="w-full mt-2">
                      <Plus className="h-4 w-4 mr-2" />
                      Create New Collection
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Create Collection</DialogTitle>
                      <DialogDescription>
                        Create a new collection to organize your documents
                      </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4">
                      <div>
                        <label className="text-sm font-medium">Name</label>
                        <Input
                          placeholder="Collection name"
                          value={newCollectionName}
                          onChange={(e) => setNewCollectionName(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' && newCollectionName.trim()) {
                              handleCreateCollection();
                            }
                          }}
                        />
                      </div>
                      <div>
                        <label className="text-sm font-medium">Description (optional)</label>
                        <Input
                          placeholder="Collection description"
                          value={newCollectionDescription}
                          onChange={(e) => setNewCollectionDescription(e.target.value)}
                        />
                      </div>
                      <Button
                        onClick={handleCreateCollection}
                        disabled={!newCollectionName.trim() || creatingCollection}
                        className="w-full"
                      >
                        {creatingCollection ? (
                          <>
                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                            Creating...
                          </>
                        ) : (
                          'Create Collection'
                        )}
                      </Button>
                    </div>
                  </DialogContent>
                </Dialog>
              </div>
            )}
          </PopoverContent>
        </Popover>
      </div>
    </div>
  );
}
