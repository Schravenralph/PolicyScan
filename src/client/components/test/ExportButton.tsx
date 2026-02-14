/**
 * Export Button Component
 * 
 * Provides export functionality for test data in various formats.
 */

import { useState } from 'react';
import { Download, FileText, FileSpreadsheet, FileJson, Loader2 } from 'lucide-react';
import { Button } from '../ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '../ui/dropdown-menu';

interface ExportButtonProps {
  onExport: (format: 'csv' | 'json' | 'xlsx') => Promise<void>;
  disabled?: boolean;
  className?: string;
}

export function ExportButton({ onExport, disabled, className }: ExportButtonProps) {
  const [exporting, setExporting] = useState<string | null>(null);

  const handleExport = async (format: 'csv' | 'json' | 'xlsx') => {
    try {
      setExporting(format);
      await onExport(format);
    } catch (error) {
      console.error(`Failed to export as ${format}:`, error);
      alert(`Failed to export as ${format}. Please try again.`);
    } finally {
      setExporting(null);
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" disabled={disabled || !!exporting} className={className}>
          {exporting ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Exporting...
            </>
          ) : (
            <>
              <Download className="w-4 h-4 mr-2" />
              Export
            </>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem
          onClick={() => handleExport('csv')}
          disabled={exporting !== null}
          className="cursor-pointer"
        >
          <FileText className="w-4 h-4 mr-2" />
          Export as CSV
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => handleExport('json')}
          disabled={exporting !== null}
          className="cursor-pointer"
        >
          <FileJson className="w-4 h-4 mr-2" />
          Export as JSON
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => handleExport('xlsx')}
          disabled={exporting !== null}
          className="cursor-pointer"
        >
          <FileSpreadsheet className="w-4 h-4 mr-2" />
          Export as Excel
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

