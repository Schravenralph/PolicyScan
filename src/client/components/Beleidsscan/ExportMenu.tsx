/**
 * Export Menu Component
 * 
 * Dropdown menu for exporting documents in various formats
 * with scope selection (all/filtered/selected) and format information.
 */

import { memo } from 'react';
import { Download, FileText, ChevronDown, Info } from 'lucide-react';
import { Button } from '../ui/button';
import { t } from '../../utils/i18n';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '../ui/dropdown-menu';
import { Popover, PopoverContent, PopoverTrigger } from '../ui/popover';

type ExportFormat = 'csv' | 'json' | 'markdown' | 'xlsx';
type ExportScope = 'all' | 'filtered' | 'selected';

interface ExportMenuProps {
  selectedCount: number;
  onExport: (format: ExportFormat, scope: ExportScope) => void;
}

function ExportMenuComponent({
  selectedCount,
  onExport,
}: ExportMenuProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="flex items-center gap-2 text-foreground"
          aria-label={t('exportMenu.exportDocumentsAria')}
          data-testid="export-documents-button"
        >
          <Download className="w-4 h-4" aria-hidden="true" />
          <span>{t('exportMenu.export')}</span>
          <ChevronDown className="w-4 h-4" aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel className="flex items-center justify-between gap-2">
          <span>{t('exportMenu.exportAs')}</span>
          <Popover>
            <PopoverTrigger asChild>
              <button
                type="button"
                className="inline-flex items-center justify-center rounded-full hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-300 p-1"
                aria-label={t('exportMenu.exportFormatsInfoAria')}
              >
                <Info className="w-3.5 h-3.5 text-muted-foreground" />
              </button>
            </PopoverTrigger>
            <PopoverContent className="w-80 p-4" align="end">
              <div className="space-y-3">
                <h4 className="font-semibold text-sm mb-2">{t('exportMenu.exportFormats')}</h4>
                <div className="space-y-2.5 text-xs">
                  <div>
                    <div className="font-medium text-foreground mb-1">CSV</div>
                    <div className="text-muted-foreground">
                      {t('exportMenu.csvDescription')}
                    </div>
                  </div>
                  <div>
                    <div className="font-medium text-foreground mb-1">JSON</div>
                    <div className="text-muted-foreground">
                      {t('exportMenu.jsonDescription')}
                    </div>
                  </div>
                  <div>
                    <div className="font-medium text-foreground mb-1">Markdown</div>
                    <div className="text-muted-foreground">
                      {t('exportMenu.markdownDescription')}
                    </div>
                  </div>
                  <div>
                    <div className="font-medium text-foreground mb-1">Excel (XLSX)</div>
                    <div className="text-muted-foreground">
                      {t('exportMenu.excelDescription')}
                    </div>
                  </div>
                </div>
              </div>
            </PopoverContent>
          </Popover>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">{t('exportMenu.allDocuments')}</DropdownMenuLabel>
        <DropdownMenuItem onClick={() => onExport('csv', 'all')}>
          <FileText className="w-4 h-4 mr-2" />
          CSV
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => onExport('json', 'all')}>
          <FileText className="w-4 h-4 mr-2" />
          JSON
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => onExport('markdown', 'all')}>
          <FileText className="w-4 h-4 mr-2" />
          Markdown
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => onExport('xlsx', 'all')}>
          <FileText className="w-4 h-4 mr-2" />
          Excel (XLSX)
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">{t('exportMenu.filteredDocuments')}</DropdownMenuLabel>
        <DropdownMenuItem onClick={() => onExport('csv', 'filtered')}>
          <FileText className="w-4 h-4 mr-2" />
          CSV
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => onExport('json', 'filtered')}>
          <FileText className="w-4 h-4 mr-2" />
          JSON
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => onExport('markdown', 'filtered')}>
          <FileText className="w-4 h-4 mr-2" />
          Markdown
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => onExport('xlsx', 'filtered')}>
          <FileText className="w-4 h-4 mr-2" />
          Excel (XLSX)
        </DropdownMenuItem>
        {selectedCount > 0 && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">{t('exportMenu.selectedDocuments').replace('{{count}}', String(selectedCount))}</DropdownMenuLabel>
            <DropdownMenuItem onClick={() => onExport('csv', 'selected')}>
              <FileText className="w-4 h-4 mr-2" />
              CSV
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onExport('json', 'selected')}>
              <FileText className="w-4 h-4 mr-2" />
              JSON
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onExport('markdown', 'selected')}>
              <FileText className="w-4 h-4 mr-2" />
              Markdown
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onExport('xlsx', 'selected')}>
              <FileText className="w-4 h-4 mr-2" />
              Excel (XLSX)
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

// Memoize ExportMenu to prevent unnecessary re-renders
// Only re-render when props actually change
export const ExportMenu = memo(ExportMenuComponent, (prevProps, nextProps) => {
  return (
    prevProps.selectedCount === nextProps.selectedCount &&
    prevProps.onExport === nextProps.onExport
  );
});
