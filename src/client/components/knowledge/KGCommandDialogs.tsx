/**
 * Knowledge Graph Command Dialogs Component
 * 
 * Consolidates all dialogs for KG management commands:
 * - Commit dialog
 * - Stash dialog
 * - Branch management dialog
 * - Merge dialog
 * - Diff dialog
 * - Log dialog
 * - Stash list dialog
 */
import { GitBranch } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '../ui/dialog';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { Label } from '../ui/label';
import { Textarea } from '../ui/textarea';
import { Input } from '../ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { t } from '../../utils/i18n';
import { ScrollArea } from '../ui/scroll-area';
import type { KGStatus } from '../../services/api/KnowledgeGraphManagementApiService';

interface KGCommandDialogsProps {
  // Status
  status: KGStatus | null;
  
  // Commit Dialog
  commitDialogOpen: boolean;
  onCommitDialogChange: (open: boolean) => void;
  commitMessage: string;
  onCommitMessageChange: (message: string) => void;
  onExecuteCommit: () => void;
  
  // Stash Dialog
  stashDialogOpen: boolean;
  onStashDialogChange: (open: boolean) => void;
  stashDescription: string;
  onStashDescriptionChange: (description: string) => void;
  onExecuteStash: () => void;
  
  // Branch Dialog
  branchDialogOpen: boolean;
  onBranchDialogChange: (open: boolean) => void;
  branches: Array<{ name: string; isCurrent: boolean }>;
  newBranchName: string;
  onNewBranchNameChange: (name: string) => void;
  onSwitchBranch: (branchName: string) => void;
  onCreateBranch: () => void;
  
  // Merge Dialog
  mergeDialogOpen: boolean;
  onMergeDialogChange: (open: boolean) => void;
  mergeSource: string;
  onMergeSourceChange: (source: string) => void;
  mergeTarget: string;
  onMergeTargetChange: (target: string) => void;
  onExecuteMerge: () => void;
  
  // Diff Dialog
  diffDialogOpen: boolean;
  onDiffDialogChange: (open: boolean) => void;
  diffSource: string;
  onDiffSourceChange: (source: string) => void;
  diffTarget: string;
  onDiffTargetChange: (target: string) => void;
  diffResult: {
    entities: { added: string[]; removed: string[]; modified: string[]; addedCount: number; removedCount: number; modifiedCount: number };
    relationships: { added: Array<{ sourceId: string; targetId: string; type: string }>; removed: Array<{ sourceId: string; targetId: string; type: string }>; modified: Array<{ sourceId: string; targetId: string; type: string }>; addedCount: number; removedCount: number; modifiedCount: number };
  } | null;
  onExecuteDiff: () => void;
  onClearDiffResult: () => void;
  
  // Log Dialog
  logDialogOpen: boolean;
  onLogDialogChange: (open: boolean) => void;
  versionLog: Array<{ version: string; branch: string; timestamp: string }>;
  onLoadVersionLog: () => void;
  
  // Stash List Dialog
  stashListDialogOpen: boolean;
  onStashListDialogChange: (open: boolean) => void;
  stashes: Array<{ stashId: string; branch: string; timestamp: string; description?: string }>;
  onLoadStashes: () => void;
  onPopStash: (stashId: string) => void;
  onDropStash: (stashId: string) => void;
}

export function KGCommandDialogs({
  status,
  commitDialogOpen,
  onCommitDialogChange,
  commitMessage,
  onCommitMessageChange,
  onExecuteCommit,
  stashDialogOpen,
  onStashDialogChange,
  stashDescription,
  onStashDescriptionChange,
  onExecuteStash,
  branchDialogOpen,
  onBranchDialogChange,
  branches,
  newBranchName,
  onNewBranchNameChange,
  onSwitchBranch,
  onCreateBranch,
  mergeDialogOpen,
  onMergeDialogChange,
  mergeSource,
  onMergeSourceChange,
  mergeTarget,
  onMergeTargetChange,
  onExecuteMerge,
  diffDialogOpen,
  onDiffDialogChange,
  diffSource,
  onDiffSourceChange,
  diffTarget,
  onDiffTargetChange,
  diffResult,
  onExecuteDiff,
  onClearDiffResult,
  logDialogOpen,
  onLogDialogChange,
  versionLog,
  onLoadVersionLog,
  stashListDialogOpen,
  onStashListDialogChange,
  stashes,
  onLoadStashes,
  onPopStash,
  onDropStash,
}: KGCommandDialogsProps) {
  return (
    <>
      {/* Commit Dialog */}
      <Dialog open={commitDialogOpen} onOpenChange={onCommitDialogChange}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('knowledgeGraph.commitPendingChanges')}</DialogTitle>
            <DialogDescription>
              {t('knowledgeGraph.commitDescription')
                .replace('{{entityCount}}', String(status?.pendingChanges.entityCount || 0))
                .replace('{{relationshipCount}}', String(status?.pendingChanges.relationshipCount || 0))
                .replace('{{branch}}', status?.currentBranch || 'unknown')}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="commit-message">{t('knowledgeGraph.commitMessage')}</Label>
              <Textarea
                id="commit-message"
                value={commitMessage}
                onChange={(e) => onCommitMessageChange(e.target.value)}
                placeholder={t('knowledgeGraph.commitMessagePlaceholder')}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => onCommitDialogChange(false)}>
              {t('knowledgeGraph.cancel')}
            </Button>
            <Button onClick={onExecuteCommit}>
              {t('knowledgeGraph.commit')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Stash Dialog */}
      <Dialog open={stashDialogOpen} onOpenChange={onStashDialogChange}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('knowledgeGraph.stashChanges')}</DialogTitle>
            <DialogDescription>
              {t('knowledgeGraph.stashDescription').replace('{{branch}}', status?.currentBranch || 'unknown')}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="stash-description">{t('knowledgeGraph.descriptionOptional')}</Label>
              <Textarea
                id="stash-description"
                value={stashDescription}
                onChange={(e) => onStashDescriptionChange(e.target.value)}
                placeholder={t('knowledgeGraph.stashDescriptionPlaceholder')}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => onStashDialogChange(false)}>
              {t('knowledgeGraph.cancel')}
            </Button>
            <Button onClick={onExecuteStash}>
              {t('kg.stash.button')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Branch Dialog */}
      <Dialog open={branchDialogOpen} onOpenChange={onBranchDialogChange}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{t('knowledgeGraph.branchManagement')}</DialogTitle>
            <DialogDescription>
              {t('knowledgeGraph.switchBranchesOrCreate')}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>{t('knowledgeGraph.currentBranch')}</Label>
              <Badge variant="outline">{status?.currentBranch || 'unknown'}</Badge>
            </div>
            
            <div className="space-y-2">
              <Label>{t('knowledgeGraph.availableBranches')}</Label>
              <ScrollArea className="h-48 border rounded-md p-2">
                <div className="space-y-1">
                  {branches.map((branch) => (
                    <div
                      key={branch.name}
                      className="flex items-center justify-between p-2 hover:bg-gray-100 rounded cursor-pointer"
                      onClick={() => branch.name !== status?.currentBranch && onSwitchBranch(branch.name)}
                    >
                      <div className="flex items-center gap-2">
                        <GitBranch className="h-4 w-4" />
                        <span className={branch.isCurrent ? 'font-semibold' : ''}>{branch.name}</span>
                        {branch.isCurrent && <Badge variant="secondary">{t('knowledgeGraph.current')}</Badge>}
                      </div>
                      {branch.name !== status?.currentBranch && (
                        <Button variant="ghost" size="sm">
                          {t('knowledgeGraph.switch')}
                        </Button>
                      )}
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </div>

            <div className="space-y-2">
              <Label htmlFor="new-branch">{t('knowledgeGraph.createNewBranch')}</Label>
              <div className="flex gap-2">
                <Input
                  id="new-branch"
                  value={newBranchName}
                  onChange={(e) => onNewBranchNameChange(e.target.value)}
                  placeholder={t('knowledgeGraph.branchNamePlaceholder')}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      onCreateBranch();
                    }
                  }}
                />
                <Button onClick={onCreateBranch} disabled={!newBranchName.trim()}>
                  {t('knowledgeGraph.create')}
                </Button>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => onBranchDialogChange(false)}>
              {t('common.close')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Merge Dialog */}
      <Dialog open={mergeDialogOpen} onOpenChange={onMergeDialogChange}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('knowledgeGraph.mergeBranches')}</DialogTitle>
            <DialogDescription>
              {t('knowledgeGraph.mergeOneBranchIntoAnother')}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="merge-source">{t('knowledgeGraph.sourceBranch')}</Label>
              <Select value={mergeSource} onValueChange={onMergeSourceChange}>
                <SelectTrigger id="merge-source">
                  <SelectValue placeholder={t('knowledgeGraph.selectSourceBranch')} />
                </SelectTrigger>
                <SelectContent>
                  {branches.map((branch) => (
                    <SelectItem key={branch.name} value={branch.name}>
                      {branch.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="merge-target">{t('knowledgeGraph.targetBranch')}</Label>
              <Select value={mergeTarget} onValueChange={onMergeTargetChange}>
                <SelectTrigger id="merge-target">
                  <SelectValue placeholder={t('knowledgeGraph.selectTargetBranch')} />
                </SelectTrigger>
                <SelectContent>
                  {branches.map((branch) => (
                    <SelectItem key={branch.name} value={branch.name}>
                      {branch.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => onMergeDialogChange(false)}>
              {t('knowledgeGraph.cancel')}
            </Button>
            <Button onClick={onExecuteMerge} disabled={!mergeSource || !mergeTarget}>
              {t('knowledgeGraph.merge')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Diff Dialog */}
      <Dialog open={diffDialogOpen} onOpenChange={onDiffDialogChange}>
        <DialogContent className="max-w-4xl max-h-[80vh]">
          <DialogHeader>
            <DialogTitle>{t('knowledgeGraph.branchDiff')}</DialogTitle>
            <DialogDescription>
              {t('knowledgeGraph.compareDifferences')}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="diff-source">{t('knowledgeGraph.sourceBranch')}</Label>
                <Select value={diffSource} onValueChange={onDiffSourceChange}>
                  <SelectTrigger id="diff-source">
                    <SelectValue placeholder={t('knowledgeGraph.selectSourceBranch')} />
                  </SelectTrigger>
                  <SelectContent>
                    {branches.map((branch) => (
                      <SelectItem key={branch.name} value={branch.name}>
                        {branch.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="diff-target">{t('knowledgeGraph.targetBranch')}</Label>
                <Select value={diffTarget} onValueChange={onDiffTargetChange}>
                  <SelectTrigger id="diff-target">
                    <SelectValue placeholder={t('knowledgeGraph.selectTargetBranch')} />
                  </SelectTrigger>
                  <SelectContent>
                    {branches.map((branch) => (
                      <SelectItem key={branch.name} value={branch.name}>
                        {branch.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <Button onClick={onExecuteDiff} disabled={!diffSource || !diffTarget}>
              {t('knowledgeGraph.compareBranches')}
            </Button>
            {diffResult && (
              <ScrollArea className="max-h-96 border rounded-md p-4">
                <div className="space-y-4">
                  <div>
                    <h4 className="font-semibold mb-2">{t('kg.diff.entities')}</h4>
                    <div className="space-y-1 text-sm">
                      <div className="text-green-600">{t('kg.diff.added')}: {diffResult.entities.addedCount} ({diffResult.entities.added.slice(0, 10).join(', ')}{diffResult.entities.added.length > 10 ? '...' : ''})</div>
                      <div className="text-red-600">{t('kg.diff.removed')}: {diffResult.entities.removedCount} ({diffResult.entities.removed.slice(0, 10).join(', ')}{diffResult.entities.removed.length > 10 ? '...' : ''})</div>
                      <div className="text-yellow-600">{t('kg.diff.modified')}: {diffResult.entities.modifiedCount}</div>
                    </div>
                  </div>
                  <div>
                    <h4 className="font-semibold mb-2">{t('kg.diff.relationships')}</h4>
                    <div className="space-y-1 text-sm">
                      <div className="text-green-600">{t('kg.diff.added')}: {diffResult.relationships.addedCount}</div>
                      <div className="text-red-600">{t('kg.diff.removed')}: {diffResult.relationships.removedCount}</div>
                      <div className="text-yellow-600">{t('kg.diff.modified')}: {diffResult.relationships.modifiedCount}</div>
                    </div>
                  </div>
                </div>
              </ScrollArea>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => {
              onDiffDialogChange(false);
              onClearDiffResult();
            }}>
              {t('common.close')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Log Dialog */}
      <Dialog open={logDialogOpen} onOpenChange={onLogDialogChange}>
        <DialogContent className="max-w-2xl max-h-[80vh]">
          <DialogHeader>
            <DialogTitle>{t('kg.log.title')}</DialogTitle>
            <DialogDescription>
              {t('kg.log.description')}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <Button onClick={onLoadVersionLog} variant="outline">
              {t('kg.log.refresh')}
            </Button>
            <ScrollArea className="max-h-96 border rounded-md p-4">
              {versionLog.length > 0 ? (
                <div className="space-y-2">
                  {versionLog.map((version, idx) => (
                    <div key={idx} className="p-2 border rounded text-sm">
                      <div className="font-mono text-xs">{version.version}</div>
                      <div className="text-muted-foreground">{version.branch} • {new Date(version.timestamp).toLocaleString()}</div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center text-muted-foreground py-8">
                  {t('kg.log.noHistory')}
                </div>
              )}
            </ScrollArea>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => onLogDialogChange(false)}>
              {t('common.close')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Stash List Dialog */}
      <Dialog open={stashListDialogOpen} onOpenChange={onStashListDialogChange}>
        <DialogContent className="max-w-2xl max-h-[80vh]">
          <DialogHeader>
            <DialogTitle>{t('kg.stash.listTitle')}</DialogTitle>
            <DialogDescription>
              {t('kg.stash.listDescription')}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <Button onClick={onLoadStashes} variant="outline">
              {t('common.refresh')}
            </Button>
            <ScrollArea className="max-h-96 border rounded-md p-4">
              {stashes.length > 0 ? (
                <div className="space-y-2">
                  {stashes.map((stash) => (
                    <div key={stash.stashId} className="p-3 border rounded flex items-center justify-between">
                      <div className="flex-1">
                        <div className="font-mono text-xs">{stash.stashId}</div>
                        <div className="text-sm text-muted-foreground">{stash.branch} • {new Date(stash.timestamp).toLocaleString()}</div>
                        {stash.description && (
                          <div className="text-sm mt-1">{stash.description}</div>
                        )}
                      </div>
                      <div className="flex gap-2">
                        <Button size="sm" variant="outline" onClick={() => onPopStash(stash.stashId)}>
                          {t('kg.stash.pop')}
                        </Button>
                        <Button size="sm" variant="destructive" onClick={() => onDropStash(stash.stashId)}>
                          {t('kg.stash.drop')}
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center text-muted-foreground py-8">
                  {t('kg.stash.noStashes')}
                </div>
              )}
            </ScrollArea>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => onStashListDialogChange(false)}>
              {t('common.close')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
