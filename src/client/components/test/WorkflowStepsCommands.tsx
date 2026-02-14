import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Copy, Check, ChevronDown, ChevronRight, ExternalLink, Play, FileText, Bug, TrendingUp, Archive, Bell, Settings } from 'lucide-react';
import { t } from '../../utils/i18n';

interface Command {
  command: string;
  description: string;
  category: string;
  icon?: React.ReactNode;
}

const COMMANDS: Command[] = [
  // Health & Validation (3 commands)
  { command: 'pnpm run test:workflow-steps:health', description: 'System health check', category: 'Health & Validation', icon: <Check className="w-4 h-4" /> },
  { command: 'pnpm run test:workflow-steps:validate', description: 'Setup validation', category: 'Health & Validation', icon: <Check className="w-4 h-4" /> },
  { command: 'pnpm run test:workflow-steps:verify', description: 'System verification', category: 'Health & Validation', icon: <Check className="w-4 h-4" /> },
  
  // Running Tests (10 commands)
  { command: 'pnpm run test:workflow-steps', description: 'Run all 8 workflow steps', category: 'Running Tests', icon: <Play className="w-4 h-4" /> },
  { command: 'pnpm run test:workflow-steps:step-1', description: 'Run Step 1 only', category: 'Running Tests', icon: <Play className="w-4 h-4" /> },
  { command: 'pnpm run test:workflow-steps:step-2', description: 'Run Step 2 only', category: 'Running Tests', icon: <Play className="w-4 h-4" /> },
  { command: 'pnpm run test:workflow-steps:step-3', description: 'Run Step 3 only', category: 'Running Tests', icon: <Play className="w-4 h-4" /> },
  { command: 'pnpm run test:workflow-steps:step-4', description: 'Run Step 4 only', category: 'Running Tests', icon: <Play className="w-4 h-4" /> },
  { command: 'pnpm run test:workflow-steps:step-5', description: 'Run Step 5 only', category: 'Running Tests', icon: <Play className="w-4 h-4" /> },
  { command: 'pnpm run test:workflow-steps:step-6', description: 'Run Step 6 only', category: 'Running Tests', icon: <Play className="w-4 h-4" /> },
  { command: 'pnpm run test:workflow-steps:step-7', description: 'Run Step 7 only', category: 'Running Tests', icon: <Play className="w-4 h-4" /> },
  { command: 'pnpm run test:workflow-steps:step-8', description: 'Run Step 8 only', category: 'Running Tests', icon: <Play className="w-4 h-4" /> },
  { command: 'pnpm run test:workflow-steps:run', description: 'Run specific scenario', category: 'Running Tests', icon: <Play className="w-4 h-4" /> },
  
  // Bug Management (2 commands)
  { command: 'pnpm run test:workflow-steps:collect-bugs', description: 'Collect bugs from test results', category: 'Bug Management', icon: <Bug className="w-4 h-4" /> },
  { command: 'pnpm run test:workflow-steps:fix-bugs', description: 'Generate fix plan', category: 'Bug Management', icon: <Bug className="w-4 h-4" /> },
  
  // Viewing Results (5 commands)
  { command: 'pnpm run test:workflow-steps:view', description: 'View all results (CLI)', category: 'Viewing Results', icon: <FileText className="w-4 h-4" /> },
  { command: 'pnpm run test:workflow-steps:view:step', description: 'View Step results', category: 'Viewing Results', icon: <FileText className="w-4 h-4" /> },
  { command: 'pnpm run test:workflow-steps:view:bugs', description: 'View bugs', category: 'Viewing Results', icon: <FileText className="w-4 h-4" /> },
  { command: 'pnpm run test:workflow-steps:view:summary', description: 'View summary', category: 'Viewing Results', icon: <FileText className="w-4 h-4" /> },
  { command: 'pnpm run test:workflow-steps:report', description: 'Generate HTML report', category: 'Viewing Results', icon: <FileText className="w-4 h-4" /> },
  
  // Comparison & Baseline (2 commands)
  { command: 'pnpm run test:workflow-steps:baseline', description: 'Save current as baseline', category: 'Comparison & Baseline', icon: <TrendingUp className="w-4 h-4" /> },
  { command: 'pnpm run test:workflow-steps:compare', description: 'Compare with baseline', category: 'Comparison & Baseline', icon: <TrendingUp className="w-4 h-4" /> },
  
  // Performance Benchmarking (4 commands)
  { command: 'pnpm run test:workflow-steps:benchmark', description: 'Benchmark commands', category: 'Performance Benchmarking', icon: <TrendingUp className="w-4 h-4" /> },
  { command: 'pnpm run test:workflow-steps:benchmark:record', description: 'Record performance', category: 'Performance Benchmarking', icon: <TrendingUp className="w-4 h-4" /> },
  { command: 'pnpm run test:workflow-steps:benchmark:analyze', description: 'Analyze performance', category: 'Performance Benchmarking', icon: <TrendingUp className="w-4 h-4" /> },
  { command: 'pnpm run test:workflow-steps:benchmark:trend', description: 'View trends', category: 'Performance Benchmarking', icon: <TrendingUp className="w-4 h-4" /> },
  
  // History & Archiving (5 commands)
  { command: 'pnpm run test:workflow-steps:history', description: 'History commands', category: 'History & Archiving', icon: <Archive className="w-4 h-4" /> },
  { command: 'pnpm run test:workflow-steps:history:record', description: 'Record execution', category: 'History & Archiving', icon: <Archive className="w-4 h-4" /> },
  { command: 'pnpm run test:workflow-steps:history:list', description: 'List history', category: 'History & Archiving', icon: <Archive className="w-4 h-4" /> },
  { command: 'pnpm run test:workflow-steps:history:stats', description: 'View statistics', category: 'History & Archiving', icon: <Archive className="w-4 h-4" /> },
  { command: 'pnpm run test:workflow-steps:archive', description: 'Archive results', category: 'History & Archiving', icon: <Archive className="w-4 h-4" /> },
  { command: 'pnpm run test:workflow-steps:archive:list', description: 'List archives', category: 'History & Archiving', icon: <Archive className="w-4 h-4" /> },
  
  // Notifications (1 command)
  { command: 'pnpm run test:workflow-steps:notify', description: 'Check results & notify', category: 'Notifications', icon: <Bell className="w-4 h-4" /> },
  
  // Maintenance (1 command)
  { command: 'pnpm run test:workflow-steps:maintain', description: 'Maintenance commands', category: 'Maintenance', icon: <Settings className="w-4 h-4" /> },
];

interface CollapsibleCategoryProps {
  title: string;
  commands: Command[];
  defaultExpanded?: boolean;
  onRunCommand?: (command: string) => void;
}

function CollapsibleCategory({ title, commands, defaultExpanded = false, onRunCommand }: CollapsibleCategoryProps) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);

  const handleCopy = async (command: string, index: number) => {
    try {
      await navigator.clipboard.writeText(command);
      setCopiedIndex(index);
      setTimeout(() => setCopiedIndex(null), 2000);
    } catch (err) {
      console.error('Failed to copy command:', err);
    }
  };

  return (
    <div className="border border-gray-200 rounded-lg mb-4">
      <button
        onClick={() => setExpanded(prev => !prev)}
        className="w-full flex items-center justify-between p-4 hover:bg-gray-50 transition-colors text-left"
      >
        <div className="flex items-center gap-2">
          {expanded ? (
            <ChevronDown className="w-4 h-4 text-gray-500" />
          ) : (
            <ChevronRight className="w-4 h-4 text-gray-500" />
          )}
          <span className="font-semibold text-gray-900">{title}</span>
          <span className="text-sm text-gray-500">({t('workflowStepsCommands.commandsCount').replace('{{count}}', String(commands.length))})</span>
        </div>
      </button>
      {expanded && (
        <div className="border-t border-gray-200 p-4 space-y-2">
          {commands.map((cmd, _index) => {
            const globalIndex = COMMANDS.findIndex(c => c.command === cmd.command);
            return (
              <div
                key={cmd.command}
                className="flex items-start gap-3 p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors"
              >
                {cmd.icon && (
                  <div className="mt-1 text-gray-600">
                    {cmd.icon}
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    {onRunCommand ? (
                      <button
                        onClick={() => onRunCommand(cmd.command)}
                        className="flex-1 text-left text-sm font-mono text-gray-900 break-all bg-blue-50 hover:bg-blue-100 dark:bg-blue-950/30 dark:hover:bg-blue-950/50 px-3 py-2 rounded border border-blue-200 dark:border-blue-800 transition-colors cursor-pointer flex items-center gap-2 group"
                        title={t('workflowStepsCommands.clickToRun')}
                      >
                        <Play className="w-3 h-3 text-blue-600 dark:text-blue-400 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />
                        <code className="flex-1">{cmd.command}</code>
                      </button>
                    ) : (
                      <code className="text-sm font-mono text-gray-900 break-all">{cmd.command}</code>
                    )}
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleCopy(cmd.command, globalIndex)}
                      className="h-6 w-6 p-0 flex-shrink-0"
                      title={t('workflowStepsCommands.copyCommand')}
                    >
                      {copiedIndex === globalIndex ? (
                        <Check className="w-3 h-3 text-green-600" />
                      ) : (
                        <Copy className="w-3 h-3 text-gray-500" />
                      )}
                    </Button>
                  </div>
                  <p className="text-xs text-gray-600">{cmd.description}</p>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

interface WorkflowStepsCommandsProps {
  onRunCommand?: (command: string) => void;
}

export function WorkflowStepsCommands({ onRunCommand }: WorkflowStepsCommandsProps = {}) {
  const categories = Array.from(new Set(COMMANDS.map(cmd => cmd.category)));

  const commandsByCategory = categories.reduce((acc, category) => {
    acc[category] = COMMANDS.filter(cmd => cmd.category === category);
    return acc;
  }, {} as Record<string, Command[]>);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <FileText className="w-5 h-5" />
            {t('workflowStepsCommands.title')}
          </CardTitle>
          <a
            href="/docs/03-testing/workflow-steps-testing-README.md"
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm text-blue-600 hover:text-blue-800 flex items-center gap-1"
          >
            {t('workflowStepsCommands.fullDocumentation')}
            <ExternalLink className="w-4 h-4" />
          </a>
        </div>
        <p className="text-sm text-gray-600 mt-2">
          {t('workflowStepsCommands.description')}
          {onRunCommand && ` ${t('workflowStepsCommands.runDescription')}`}
        </p>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          {categories.map(category => (
            <CollapsibleCategory
              key={category}
              title={category}
              commands={commandsByCategory[category]}
              defaultExpanded={category === 'Running Tests' || category === 'Health & Validation'}
              onRunCommand={onRunCommand}
            />
          ))}
        </div>
        <div className="mt-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
          <p className="text-sm text-blue-900">
            <strong>{t('workflowStepsCommands.quickReference')}</strong> {t('workflowStepsCommands.quickReferenceDescription')}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

