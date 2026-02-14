/**
 * Search Results Component
 * 
 * Displays search results including documents and related entities.
 */

import { FileText, Database, ArrowRight, Download, Mail, FileDown, ChevronDown, Loader2, SearchX } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { EmptyState } from '../ui/EmptyState';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { Checkbox } from '../ui/checkbox';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
    DropdownMenuCheckboxItem,
} from '../ui/dropdown-menu';
import { t } from '../../utils/i18n';

interface SearchResult {
    documents: Array<{
        id: string;
        content: string;
        score: number;
        sourceUrl?: string;
        metadata: Record<string, unknown>;
    }>;
    relatedEntities: Array<{
        id: string;
        type: string;
        name: string;
        description?: string;
        category?: string;
    }>;
}

interface SearchResultsProps {
    results: SearchResult;
    selectedIds: Set<string>;
    exporting: boolean;
    includeCitations: boolean;
    citationFormat: 'apa' | 'custom';
    onToggleSelection: (docId: string) => void;
    onToggleSelectAll: () => void;
    onExport: (format: 'csv' | 'pdf') => Promise<void>;
    onEmailExport: () => void;
    onIncludeCitationsChange: (checked: boolean) => void;
    onCitationFormatChange: (format: 'apa' | 'custom') => void;
    onShowEmailDialog: () => void;
}

export function SearchResults({
    results,
    selectedIds,
    exporting,
    includeCitations,
    citationFormat,
    onToggleSelection,
    onToggleSelectAll,
    onExport,
    onEmailExport: _onEmailExport,
    onIncludeCitationsChange,
    onCitationFormatChange,
    onShowEmailDialog,
}: SearchResultsProps) {
    const getMetadataString = (doc: SearchResult['documents'][0], key: string): string => {
        const value = doc.metadata?.[key];
        return value ? String(value) : '';
    };

    return (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {/* Main Content: Search Results */}
            <div className="md:col-span-2 space-y-6">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                        <h2 className="text-xl font-semibold flex items-center gap-2">
                            <FileText className="h-5 w-5" />
                            {t('searchPage.documents')} ({results.documents.length})
                        </h2>
                        {results.documents.length > 0 && (
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={onToggleSelectAll}
                                className="text-xs"
                                aria-label={selectedIds.size === results.documents.length ? t('common.selectNothing') : t('common.selectAll')}
                            >
                                {selectedIds.size === results.documents.length ? t('common.deselectAll') : t('common.selectAll')}
                            </Button>
                        )}
                        {selectedIds.size > 0 && (
                            <span className="text-sm text-muted-foreground">
                                {selectedIds.size} {t('common.of')} {results.documents.length} {t('common.selected')}
                            </span>
                        )}
                    </div>
                    {results.documents.length > 0 && (
                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <Button
                                    variant="outline"
                                    size="sm"
                                    disabled={exporting}
                                    className="flex items-center gap-2"
                                    aria-label={t('common.exportOptions')}
                                >
                                    {exporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                                    Export
                                    <ChevronDown className="h-4 w-4" />
                                </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                                <DropdownMenuLabel>{t('search.exportOptions')}</DropdownMenuLabel>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem
                                    onClick={() => onExport('csv')}
                                    disabled={exporting}
                                >
                                    <FileDown className="mr-2 h-4 w-4" />
                                    Export to CSV
                                    {selectedIds.size > 0 && (
                                        <span className="ml-2 text-xs text-muted-foreground">
                                            ({selectedIds.size} selected)
                                        </span>
                                    )}
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                    onClick={() => onExport('pdf')}
                                    disabled={exporting}
                                >
                                    <FileDown className="mr-2 h-4 w-4" />
                                    Export to PDF
                                    {selectedIds.size > 0 && (
                                        <span className="ml-2 text-xs text-muted-foreground">
                                            ({selectedIds.size} selected)
                                        </span>
                                    )}
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem
                                    onClick={onShowEmailDialog}
                                    disabled={exporting}
                                >
                                    <Mail className="mr-2 h-4 w-4" />
                                    Email Results
                                    {selectedIds.size > 0 && (
                                        <span className="ml-2 text-xs text-muted-foreground">
                                            ({selectedIds.size} selected)
                                        </span>
                                    )}
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
                                <DropdownMenuCheckboxItem
                                    checked={includeCitations}
                                    onCheckedChange={onIncludeCitationsChange}
                                >
                                    Include Citations
                                </DropdownMenuCheckboxItem>
                                {includeCitations && (
                                    <>
                                        <DropdownMenuCheckboxItem
                                            checked={citationFormat === 'apa'}
                                            onCheckedChange={(checked) => checked && onCitationFormatChange('apa')}
                                        >
                                            APA Format
                                        </DropdownMenuCheckboxItem>
                                        <DropdownMenuCheckboxItem
                                            checked={citationFormat === 'custom'}
                                            onCheckedChange={(checked) => checked && onCitationFormatChange('custom')}
                                        >
                                            Custom Format
                                        </DropdownMenuCheckboxItem>
                                    </>
                                )}
                            </DropdownMenuContent>
                        </DropdownMenu>
                    )}
                </div>
                {results.documents.length === 0 ? (
                    <EmptyState
                        icon={SearchX}
                        title={t('searchPage.noDocumentsFound')}
                        message={t('searchPage.noDocumentsFoundMessage')}
                        suggestions={[
                            t('searchPage.suggestion1'),
                            t('searchPage.suggestion2'),
                            t('searchPage.suggestion3')
                        ]}
                    />
                ) : (
                    <div className="space-y-4">
                        {results.documents.map((doc) => {
                            const title = getMetadataString(doc, 'title') || getMetadataString(doc, 'name') || getMetadataString(doc, 'titel') || t('searchPage.unnamedDocument');
                            const sourceUrl = doc.sourceUrl || getMetadataString(doc, 'url') || getMetadataString(doc, 'sourceUrl') || getMetadataString(doc, 'website_url') || '';
                            const summary = getMetadataString(doc, 'summary') || getMetadataString(doc, 'samenvatting') || doc.content.substring(0, 200) + (doc.content.length > 200 ? '...' : '');
                            const source = getMetadataString(doc, 'source') || getMetadataString(doc, 'website_titel') || getMetadataString(doc, 'jurisdiction') || t('searchPage.unknownSource');
                            const jurisdiction = getMetadataString(doc, 'jurisdiction');

                            return (
                                <Card key={doc.id}>
                                    <CardHeader className="pb-2">
                                        <div className="flex items-start gap-3">
                                            <Checkbox
                                                checked={selectedIds.has(doc.id)}
                                                onCheckedChange={() => onToggleSelection(doc.id)}
                                                className="mt-1"
                                                aria-label={selectedIds.has(doc.id) ? t('common.deselectDocument') : t('common.selectDocument')}
                                            />
                                            <div className="flex-1">
                                                <CardTitle className="text-lg font-medium text-blue-600">
                                                    {sourceUrl ? (
                                                        <a
                                                            href={sourceUrl}
                                                            target="_blank"
                                                            rel="noopener noreferrer"
                                                            className="hover:underline"
                                                        >
                                                            {title}
                                                        </a>
                                                    ) : (
                                                        title
                                                    )}
                                                </CardTitle>
                                            </div>
                                        </div>
                                        <div className="flex flex-wrap gap-2 text-sm text-muted-foreground items-center">
                                            <Badge variant="secondary">
                                                {t('searchPage.score')} {(doc.score * 100).toFixed(0)}%
                                            </Badge>
                                            <span>{source}</span>
                                            {jurisdiction && (
                                                <Badge variant="outline">
                                                    {jurisdiction}
                                                </Badge>
                                            )}
                                        </div>
                                    </CardHeader>
                                    <CardContent>
                                        <p className="text-sm leading-relaxed mb-3">
                                            {summary}
                                        </p>
                                        {sourceUrl && (
                                            <a
                                                href={sourceUrl}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="inline-flex items-center gap-1 text-sm text-blue-500 hover:underline"
                                            >
                                                {t('searchPage.viewSource')} <ArrowRight className="h-3 w-3" />
                                            </a>
                                        )}
                                    </CardContent>
                                </Card>
                            );
                        })}
                    </div>
                )}
            </div>

            {/* Sidebar: Knowledge Graph Entities */}
            <div className="space-y-6">
                <h2 className="text-xl font-semibold flex items-center gap-2">
                    <Database className="h-5 w-5" />
                    {t('searchPage.relatedConcepts')}
                </h2>

                {results.relatedEntities.length === 0 ? (
                    <p className="text-muted-foreground">{t('searchPage.noRelatedEntities')}</p>
                ) : (
                    <div className="space-y-4">
                        {results.relatedEntities.map((entity) => (
                            <Card key={entity.id} className="bg-slate-50 border-slate-200">
                                <CardHeader className="p-4 pb-2">
                                    <div className="flex justify-between items-start">
                                        <h3 className="font-medium text-slate-900">{entity.name}</h3>
                                        <Badge variant="outline" className="text-xs">
                                            {entity.type}
                                        </Badge>
                                    </div>
                                    {entity.category && (
                                        <span className="text-xs text-slate-500 uppercase tracking-wider font-semibold">
                                            {entity.category}
                                        </span>
                                    )}
                                </CardHeader>
                                <CardContent className="p-4 pt-2">
                                    <p className="text-sm text-slate-600">
                                        {entity.description || t('searchPage.noDescriptionAvailable')}
                                    </p>
                                </CardContent>
                            </Card>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
