/**
 * Test Result Annotations Component
 * 
 * Component for viewing and managing annotations, comments, and tags for test results.
 */

import { useState, useEffect } from 'react';
import { TestAnnotationApiService, TestResultAnnotation, TestResultTag } from '../../services/api/TestAnnotationApiService';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Textarea } from '../ui/textarea';
import { Badge } from '../ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '../ui/dialog';
import { Label } from '../ui/label';
import { MessageSquare, Tag, X, Plus, Trash2 } from 'lucide-react';
// Using native Date formatting instead of date-fns

interface TestResultAnnotationsProps {
  runId: string;
  testId?: string;
  testApiService?: TestAnnotationApiService;
}

export function TestResultAnnotations({ runId, testId, testApiService: injectedApiService }: TestResultAnnotationsProps) {
  const [annotations, setAnnotations] = useState<TestResultAnnotation[]>([]);
  const [tags, setTags] = useState<string[]>([]);
  const [, setAllTags] = useState<TestResultTag[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [newAnnotation, setNewAnnotation] = useState({
    type: 'comment' as 'comment' | 'tag' | 'label' | 'note',
    content: '',
    author: '',
  });
  const [newTags, setNewTags] = useState<string>('');

  const apiService = injectedApiService || new TestAnnotationApiService();

  useEffect(() => {
    loadAnnotations();
    loadTags();
    loadAllTags();
  }, [runId, testId]);

  const loadAnnotations = async () => {
    try {
      setLoading(true);
      setError(null);
      const result = testId
        ? await apiService.getAnnotationsForTest(testId)
        : await apiService.getAnnotationsForRun(runId);
      setAnnotations(result.annotations);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load annotations');
    } finally {
      setLoading(false);
    }
  };

  const loadTags = async () => {
    try {
      const result = await apiService.getTagsForRun(runId);
      setTags(result.tags);
    } catch (err) {
      // Ignore errors for tags
    }
  };

  const loadAllTags = async () => {
    try {
      const result = await apiService.getAllTags();
      setAllTags(result.tags);
    } catch (err) {
      // Ignore errors
    }
  };

  const handleAddAnnotation = async () => {
    if (!newAnnotation.content.trim()) {
      return;
    }

    try {
      await apiService.addAnnotation({
        runId,
        testId,
        annotationType: newAnnotation.type,
        content: newAnnotation.content.trim(),
        author: newAnnotation.author.trim() || undefined,
      });
      setNewAnnotation({ type: 'comment', content: '', author: '' });
      setShowAddDialog(false);
      await loadAnnotations();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add annotation');
    }
  };

  const handleAddTags = async () => {
    if (!newTags.trim()) {
      return;
    }

    const tagList = newTags
      .split(',')
      .map(t => t.trim())
      .filter(t => t.length > 0);

    if (tagList.length === 0) {
      return;
    }

    try {
      await apiService.addTags(runId, tagList);
      setNewTags('');
      await loadTags();
      await loadAllTags();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add tags');
    }
  };

  const handleDeleteAnnotation = async (id: string) => {
    if (!confirm('Are you sure you want to delete this annotation?')) {
      return;
    }

    try {
      await apiService.deleteAnnotation(id);
      await loadAnnotations();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete annotation');
    }
  };

  const handleRemoveTag = async (_tag: string) => {
    // Note: This would require a delete tag endpoint
    // For now, we'll just show a message
    alert('Tag removal not yet implemented');
  };

  if (loading && annotations.length === 0) {
    return <div className="text-muted-foreground">Loading annotations...</div>;
  }

  const comments = annotations.filter(a => a.annotationType === 'comment' || a.annotationType === 'note');
  const labels = annotations.filter(a => a.annotationType === 'label');

  return (
    <div className="space-y-4">
      {error && (
        <div className="bg-destructive/10 text-destructive p-3 rounded-md text-sm">
          {error}
        </div>
      )}

      {/* Tags Section */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Tag className="w-5 h-5" />
            Tags
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap gap-2">
            {tags.map(tag => (
              <Badge key={tag} variant="secondary" className="flex items-center gap-1">
                {tag}
                <button
                  onClick={() => handleRemoveTag(tag)}
                  className="ml-1 hover:text-destructive"
                >
                  <X className="w-3 h-3" />
                </button>
              </Badge>
            ))}
            {tags.length === 0 && (
              <span className="text-muted-foreground text-sm">No tags</span>
            )}
          </div>
          <div className="flex gap-2">
            <Input
              placeholder="Add tags (comma-separated)"
              value={newTags}
              onChange={(e) => setNewTags(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  handleAddTags();
                }
              }}
            />
            <Button onClick={handleAddTags} size="sm">
              <Plus className="w-4 h-4" />
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Comments Section */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <MessageSquare className="w-5 h-5" />
              Comments & Notes
            </CardTitle>
            <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
              <DialogTrigger asChild>
                <Button size="sm">
                  <Plus className="w-4 h-4 mr-2" />
                  Add Comment
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Add Annotation</DialogTitle>
                  <DialogDescription>
                    Add a comment, note, or label to this test result
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4">
                  <div>
                    <Label>Type</Label>
                    <select
                      className="w-full p-2 border rounded-md"
                      value={newAnnotation.type}
                      onChange={(e) => setNewAnnotation({ ...newAnnotation, type: e.target.value as any })}
                    >
                      <option value="comment">Comment</option>
                      <option value="note">Note</option>
                      <option value="label">Label</option>
                    </select>
                  </div>
                  <div>
                    <Label>Content</Label>
                    <Textarea
                      value={newAnnotation.content}
                      onChange={(e) => setNewAnnotation({ ...newAnnotation, content: e.target.value })}
                      placeholder="Enter your annotation..."
                      rows={4}
                    />
                  </div>
                  <div>
                    <Label>Author (optional)</Label>
                    <Input
                      value={newAnnotation.author}
                      onChange={(e) => setNewAnnotation({ ...newAnnotation, author: e.target.value })}
                      placeholder="Your name"
                    />
                  </div>
                  <div className="flex justify-end gap-2">
                    <Button variant="outline" onClick={() => setShowAddDialog(false)}>
                      Cancel
                    </Button>
                    <Button onClick={handleAddAnnotation}>
                      Add
                    </Button>
                  </div>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        </CardHeader>
        <CardContent>
          {comments.length === 0 ? (
            <div className="text-muted-foreground text-sm">No comments yet</div>
          ) : (
            <div className="space-y-4">
              {comments.map(annotation => (
                <div key={annotation._id} className="border rounded-md p-3 space-y-2">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <Badge variant="outline">{annotation.annotationType}</Badge>
                        {annotation.author && (
                          <span className="text-sm text-muted-foreground">by {annotation.author}</span>
                        )}
                        <span className="text-xs text-muted-foreground">
                          {(() => {
                            const date = new Date(annotation.createdAt);
                            const now = new Date();
                            const diffMs = now.getTime() - date.getTime();
                            const diffMins = Math.floor(diffMs / 60000);
                            const diffHours = Math.floor(diffMs / 3600000);
                            const diffDays = Math.floor(diffMs / 86400000);
                            
                            if (diffMins < 1) return 'just now';
                            if (diffMins < 60) return `${diffMins} minute${diffMins !== 1 ? 's' : ''} ago`;
                            if (diffHours < 24) return `${diffHours} hour${diffHours !== 1 ? 's' : ''} ago`;
                            if (diffDays < 7) return `${diffDays} day${diffDays !== 1 ? 's' : ''} ago`;
                            return date.toLocaleDateString();
                          })()}
                        </span>
                      </div>
                      <p className="text-sm whitespace-pre-wrap">{annotation.content}</p>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDeleteAnnotation(annotation._id!)}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Labels Section */}
      {labels.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Labels</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {labels.map(annotation => (
                <Badge key={annotation._id} variant="outline">
                  {annotation.content}
                </Badge>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}


