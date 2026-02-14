import { useEffect, useRef, useState, useCallback, useMemo, memo } from 'react';
import { X, Copy, Trash2, Loader2, CheckCircle2, XCircle, AlertCircle, Search } from 'lucide-react';
import { Button } from '../ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../ui/dialog';
import { cn } from '../ui/utils';
import { useDebounce } from '../../hooks/useDebounce';
import { performanceMonitor } from '../../utils/performanceMonitor';
import { t } from '../../utils/i18n';

export interface CommandOutputPaneProps {
  isOpen: boolean;
  onClose: () => void;
  command: string;
  output: string[];
  status: 'idle' | 'running' | 'success' | 'error';
  onClear?: () => void;
}

/**
 * CommandOutputPane - Displays real-time command execution output
 * 
 * Features:
 * - Real-time output streaming
 * - Auto-scroll to bottom (disabled when user scrolls up)
 * - Copy to clipboard
 * - Clear output
 * - Status indicators
 * - Terminal-like appearance
 * - Output filtering and search
 */
export function CommandOutputPane({
  isOpen,
  onClose,
  command,
  output,
  status,
  onClear,
}: CommandOutputPaneProps) {
  const outputRef = useRef<HTMLDivElement>(null);
  const [autoScroll, setAutoScroll] = useState(true);
  const [copied, setCopied] = useState(false);

  // Filter state
  const [filterType, setFilterType] = useState<'all' | 'info' | 'success' | 'error' | 'warning'>('all');
  const [searchTerm, setSearchTerm] = useState('');
  
  // Debounce search term to prevent excessive filtering (300ms delay)
  const debouncedSearchTerm = useDebounce(searchTerm, 300);
  
  // Track previous output length to detect new lines
  const prevOutputLengthRef = useRef(0);

  // Auto-scroll to bottom when new output arrives (if auto-scroll is enabled)
  // Only scroll on actual output changes, not filter changes
  useEffect(() => {
    const hasNewOutput = output.length > prevOutputLengthRef.current;
    prevOutputLengthRef.current = output.length;
    
    if (autoScroll && outputRef.current && isOpen && hasNewOutput) {
      // Use requestAnimationFrame to batch scroll operations
      requestAnimationFrame(() => {
        if (outputRef.current) {
          outputRef.current.scrollTop = outputRef.current.scrollHeight;
        }
      });
    }
  }, [output.length, autoScroll, isOpen]); // Only depend on output length, not content

  // Detect manual scroll to disable auto-scroll
  const handleScroll = useCallback(() => {
    if (!outputRef.current) return;
    
    // Defer layout reads to avoid forced reflow
    requestAnimationFrame(() => {
      if (!outputRef.current) return;
      
      // Batch all layout reads together
      const { scrollTop, scrollHeight, clientHeight } = outputRef.current;
      const isAtBottom = scrollHeight - scrollTop - clientHeight < 10; // 10px threshold
      
      if (isAtBottom && !autoScroll) {
        setAutoScroll(true);
      } else if (!isAtBottom && autoScroll) {
        setAutoScroll(false);
      }
    });
  }, [autoScroll]);

  // Get status icon and color
  const getStatusDisplay = () => {
    switch (status) {
      case 'running':
        return {
          icon: <Loader2 className="w-4 h-4 animate-spin" />,
          color: 'text-blue-600',
          bgColor: 'bg-blue-50',
          text: t('commandOutput.status.running'),
        };
      case 'success':
        return {
          icon: <CheckCircle2 className="w-4 h-4" />,
          color: 'text-green-600',
          bgColor: 'bg-green-50',
          text: t('commandOutput.status.completed'),
        };
      case 'error':
        return {
          icon: <XCircle className="w-4 h-4" />,
          color: 'text-red-600',
          bgColor: 'bg-red-50',
          text: t('commandOutput.status.error'),
        };
      default:
        return {
          icon: <AlertCircle className="w-4 h-4" />,
          color: 'text-gray-600',
          bgColor: 'bg-gray-50',
          text: t('commandOutput.status.idle'),
        };
    }
  };

  const statusDisplay = getStatusDisplay();

  // Parse output line to determine type (info, success, error, warning)
  const getLineType = useCallback((line: string): 'info' | 'success' | 'error' | 'warning' => {
    const lowerLine = line.toLowerCase();
    if (lowerLine.includes('error') || lowerLine.includes('failed') || lowerLine.includes('exception')) {
      return 'error';
    }
    if (lowerLine.includes('success') || lowerLine.includes('passed') || lowerLine.includes('✓')) {
      return 'success';
    }
    if (lowerLine.includes('warning') || lowerLine.includes('warn')) {
      return 'warning';
    }
    return 'info';
  }, []);

  const getLineColor = (type: 'info' | 'success' | 'error' | 'warning'): string => {
    switch (type) {
      case 'error':
        return 'text-red-400';
      case 'success':
        return 'text-green-400';
      case 'warning':
        return 'text-yellow-400';
      default:
        return 'text-gray-300';
    }
  };

  // Memoize search term lowercased for performance (use debounced version)
  const searchTermLower = useMemo(() => debouncedSearchTerm.toLowerCase(), [debouncedSearchTerm]);

  // Filtered output with optimizations
  const filteredOutput = useMemo(() => {
    return performanceMonitor.measureSync(
      'CommandOutputPane',
      'filter',
      () => {
        // Limit to last 10000 lines to prevent rendering issues with very large outputs
        const maxLines = 10000;
        const linesToProcess = output.length > maxLines ? output.slice(-maxLines) : output;
        
        return linesToProcess.filter(line => {
          // Filter by type first (cheaper check)
          if (filterType !== 'all') {
            const lineType = getLineType(line);
            if (lineType !== filterType) return false;
          }

          // Filter by search term
          if (searchTermLower) {
            if (!line.toLowerCase().includes(searchTermLower)) return false;
          }

          return true;
        });
      },
      { outputLength: output.length, filterType, hasSearchTerm: !!searchTermLower }
    );
  }, [output, filterType, searchTermLower, getLineType]);

  // Copy output to clipboard
  const handleCopy = useCallback(async () => {
    try {
      // Copy filtered output if filters are active, otherwise copy all
      const text = filteredOutput.join('\n');
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      console.error('Failed to copy to clipboard:', error);
    }
  }, [filteredOutput]);

  // Clear output
  const handleClear = useCallback(() => {
    if (onClear) {
      onClear();
    }
    setAutoScroll(true);
  }, [onClear]);

  // Reset auto-scroll when dialog opens
  useEffect(() => {
    if (isOpen) {
      setAutoScroll(true);
      // Don't reset filters on reopen to preserve context
    }
  }, [isOpen]);

  // Memoize regex pattern for search highlighting (use debounced term)
  const searchRegex = useMemo(() => {
    if (!debouncedSearchTerm) return null;
    try {
      // eslint-disable-next-line security/detect-non-literal-regexp
      return new RegExp(`(${debouncedSearchTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
    } catch {
      // If regex fails, return null to fall back to simple rendering
      return null;
    }
  }, [debouncedSearchTerm]);

  // Memoized line component to prevent unnecessary re-renders
  const OutputLine = memo(({ line, index, lineType, searchRegex: regex, searchTermLower: term }: {
    line: string;
    index: number;
    lineType: 'info' | 'success' | 'error' | 'warning';
    searchRegex: RegExp | null;
    searchTermLower: string;
  }) => {
    const lineColor = getLineColor(lineType);

    if (!regex || !term) {
      return (
        <div
          key={index}
          className={cn('whitespace-pre-wrap break-words', lineColor)}
        >
          {line}
        </div>
      );
    }

    // Highlight search term
    const parts = line.split(regex);

    return (
      <div
        key={index}
        className={cn('whitespace-pre-wrap break-words', lineColor)}
      >
        {parts.map((part, i) =>
          part.toLowerCase() === term ? (
            <span key={i} className="bg-yellow-900 text-yellow-100 font-bold">{part}</span>
          ) : (
            part
          )
        )}
      </div>
    );
  }, (prev, next) => {
    // Custom comparison to prevent re-renders when line content hasn't changed
    return prev.line === next.line && 
           prev.lineType === next.lineType && 
           prev.searchTermLower === next.searchTermLower;
  });

  OutputLine.displayName = 'OutputLine';

  // Render lines with memoization
  const renderLine = useCallback((line: string, index: number) => {
    const lineType = getLineType(line);
    return (
      <OutputLine
        line={line}
        index={index}
        lineType={lineType}
        searchRegex={searchRegex}
        searchTermLower={searchTermLower}
      />
    );
  }, [getLineType, searchRegex, searchTermLower]);

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-4xl max-h-[80vh] flex flex-col p-0">
        <DialogHeader className="px-6 pt-6 pb-4 border-b">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <DialogTitle className="text-lg font-semibold">{t('commandOutput.title')}</DialogTitle>
              <div className={cn('flex items-center gap-2 px-2 py-1 rounded text-xs font-medium', statusDisplay.bgColor, statusDisplay.color)}>
                {statusDisplay.icon}
                <span>{statusDisplay.text}</span>
              </div>
            </div>
          </div>
          <div className="mt-2">
            <code className="text-sm text-gray-600 bg-gray-100 px-2 py-1 rounded">
              {command}
            </code>
          </div>
        </DialogHeader>

        <div className="flex-1 flex flex-col min-h-0">
          {/* Toolbar */}
          <div className="flex flex-wrap items-center justify-between px-6 py-2 border-b bg-gray-50 gap-2">
            <div className="flex items-center gap-2 flex-wrap">
              <Button
                variant="outline"
                size="sm"
                onClick={handleCopy}
                disabled={output.length === 0}
                className="h-8"
              >
                <Copy className="w-4 h-4 mr-2" />
                {copied ? t('commandOutput.copied') : t('commandOutput.copy')}
              </Button>
              {onClear && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleClear}
                  disabled={output.length === 0}
                  className="h-8"
                >
                  <Trash2 className="w-4 h-4 mr-2" />
                  {t('commandOutput.clear')}
                </Button>
              )}
            </div>

            {/* Filter Controls */}
            <div className="flex items-center gap-2 flex-wrap">
               <div className="relative">
                <Search className="w-3 h-3 absolute left-2 top-1/2 transform -translate-y-1/2 text-gray-400" />
                <input
                  type="text"
                  placeholder={t('commandOutput.filterPlaceholder')}
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="h-8 pl-8 pr-8 text-xs border border-gray-300 rounded focus:outline-none focus:border-blue-500 w-40"
                />
                {searchTerm && (
                  <button
                    onClick={() => setSearchTerm('')}
                    className="absolute right-2 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  >
                    <X className="w-3 h-3" />
                  </button>
                )}
              </div>

              <select
                value={filterType}
                onChange={(e) => setFilterType(e.target.value as 'all' | 'info' | 'success' | 'error' | 'warning')}
                className="h-8 text-xs border border-gray-300 rounded px-2 focus:outline-none focus:border-blue-500 bg-white"
              >
                <option value="all">{t('commandOutput.filterAll')}</option>
                <option value="error">{t('commandOutput.filterError')}</option>
                <option value="warning">{t('commandOutput.filterWarning')}</option>
                <option value="success">{t('commandOutput.filterSuccess')}</option>
                <option value="info">{t('commandOutput.filterInfo')}</option>
              </select>
            </div>

            {!autoScroll && (
              <div className="text-xs text-gray-500 flex items-center gap-1 w-full sm:w-auto">
                <AlertCircle className="w-3 h-3" />
                {t('commandOutput.autoScrollPaused')}
              </div>
            )}
          </div>

          {/* Output area */}
          <div
            ref={outputRef}
            onScroll={handleScroll}
            className="flex-1 overflow-auto bg-[#1e1e1e] text-gray-300 font-mono text-sm p-4"
            style={{ minHeight: '300px' }}
          >
            {output.length === 0 ? (
              <div className="text-gray-500 italic">{t('commandOutput.noOutputYet')}</div>
            ) : filteredOutput.length === 0 ? (
              <div className="text-gray-500 italic text-center pt-8">
                {t('commandOutput.noMatchingLogs')}
              </div>
            ) : (
              // Use index as key since lines don't move
              filteredOutput.map((line, index) => renderLine(line, index))
            )}
            {status === 'running' && filterType === 'all' && !searchTerm && (
              <div className="flex items-center gap-2 text-blue-400 mt-2">
                <Loader2 className="w-3 h-3 animate-spin" />
                <span>{t('commandOutput.status.running')}</span>
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
