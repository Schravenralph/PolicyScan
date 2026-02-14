/**
 * Knowledge Graph Command Panel Component
 * 
 * Sidebar panel with Git-like versioning command buttons:
 * - status, branch, commit, stash, merge, diff, log, stash list
 */
import { Terminal, GitBranch, CheckCircle2, Save, Code, History } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import type { KGStatus } from '../../services/api/KnowledgeGraphManagementApiService';
import { t } from '../../utils/i18n';

interface KGCommandPanelProps {
  status: KGStatus | null;
  loading: boolean;
  onCommand: (command: string) => void;
  onStashList: () => void;
}

export function KGCommandPanel({
  status,
  loading,
  onCommand,
  onStashList,
}: KGCommandPanelProps) {
  return (
    <div className="col-span-3">
      <Card className="h-full">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Terminal className="h-5 w-5" />
            {t('kg.commands.title')}
          </CardTitle>
          <CardDescription>
            {t('kg.commands.description')}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          <Button
            variant="outline"
            className="w-full justify-start"
            onClick={() => onCommand('status')}
            disabled={loading}
          >
            <Terminal className="h-4 w-4 mr-2" />
            {t('kg.commands.status')}
          </Button>
          <Button
            variant="outline"
            className="w-full justify-start"
            onClick={() => onCommand('branch')}
          >
            <GitBranch className="h-4 w-4 mr-2" />
            {t('kg.commands.branch')}
          </Button>
          <Button
            variant="outline"
            className="w-full justify-start"
            onClick={() => onCommand('commit')}
            disabled={!status || (status.pendingChanges.entityCount === 0 && status.pendingChanges.relationshipCount === 0)}
          >
            <CheckCircle2 className="h-4 w-4 mr-2" />
            {t('kg.commands.commit')}
          </Button>
          <Button
            variant="outline"
            className="w-full justify-start"
            onClick={() => onCommand('stash')}
          >
            <Save className="h-4 w-4 mr-2" />
            {t('kg.commands.stash')}
          </Button>
          <Button
            variant="outline"
            className="w-full justify-start"
            onClick={() => onCommand('merge')}
          >
            <GitBranch className="h-4 w-4 mr-2" />
            {t('kg.commands.merge')}
          </Button>
          <Button
            variant="outline"
            className="w-full justify-start"
            onClick={() => onCommand('diff')}
          >
            <Code className="h-4 w-4 mr-2" />
            {t('kg.commands.diff')}
          </Button>
          <Button
            variant="outline"
            className="w-full justify-start"
            onClick={() => onCommand('log')}
          >
            <History className="h-4 w-4 mr-2" />
            {t('kg.commands.log')}
          </Button>
          <Button
            variant="outline"
            className="w-full justify-start"
            onClick={onStashList}
          >
            <Save className="h-4 w-4 mr-2" />
            {t('kg.commands.stashList')}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
