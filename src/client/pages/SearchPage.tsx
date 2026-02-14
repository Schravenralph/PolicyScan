import React, { useState, useMemo } from 'react';
import { Search, FileText, Database, ArrowRight, MapPin, Download, Mail, FileDown, ChevronDown } from 'lucide-react';
import { logError } from '../utils/errorHandler';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
    DropdownMenuCheckboxItem,
} from '@/components/ui/dropdown-menu';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { api } from '../services/api';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import {
    Command,
    CommandEmpty,
    CommandGroup,
    CommandInput,
    CommandItem,
    CommandList,
} from '@/components/ui/command';
import { Check } from 'lucide-react';
import { t } from '../utils/i18n';
import gemeentenCsv from '../../../gemeentes-en-cbs.csv?raw';

import { getApiBaseUrl } from '../utils/apiUrl';

const API_BASE_URL = getApiBaseUrl();

const dutchCollator = new Intl.Collator('nl', { sensitivity: 'base', numeric: true });

const sortByDutch = (values: string[]) =>
    [...values].sort((a, b) => dutchCollator.compare(a, b));

const parseMunicipalitiesCsv = (csvText: string): string[] => {
    const rows = csvText.trim().split(/\r?\n/).slice(1);
    const uniqueNames = new Set<string>();

    rows.forEach((row) => {
        if (!row.trim()) return;
        const cells = row.split(',');
        const name = cells.slice(1).join(',').trim().replace(/^"|"$/g, '');
        if (name) {
            uniqueNames.add(name);
        }
    });

    return sortByDutch(Array.from(uniqueNames));
};

// Lazy load CSV parsing to reduce memory pressure during esbuild transformation
// This prevents parsing from happening at module load time, which can cause
// esbuild service crashes (EPIPE errors) when memory is constrained
let gemeentenCache: string[] | null = null;

const getGemeenten = (): string[] => {
    if (gemeentenCache === null) {
        gemeentenCache = parseMunicipalitiesCsv(gemeentenCsv);
    }
    return gemeentenCache;
};

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

export type JurisdictionLevel = 'all' | 'national' | 'provincial' | 'municipal';

export function SearchPage() {
    const [topic, setTopic] = useState('');
    const [location, setLocation] = useState('');
    const [locationSearch, setLocationSearch] = useState('');
    const [jurisdiction, setJurisdiction] = useState<JurisdictionLevel>('all');
    const [results, setResults] = useState<SearchResult | null>(null);
    const [loading, setLoading] = useState(false);
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [includeCitations, setIncludeCitations] = useState(false);
    const [citationFormat, setCitationFormat] = useState<'apa' | 'custom'>('apa');
    const [exporting, setExporting] = useState(false);
    const [showEmailDialog, setShowEmailDialog] = useState(false);
    const [emailRecipients, setEmailRecipients] = useState('');

    // Filter municipalities based on search input
    const filteredMunicipalities = useMemo(() => {
        const gemeenten = getGemeenten();
        if (!locationSearch.trim()) return gemeenten.slice(0, 50); // Show top 50 when no search
        const searchLower = locationSearch.toLowerCase();
        return gemeenten
            .filter((name) => name.toLowerCase().includes(searchLower))
            .slice(0, 50);
    }, [locationSearch]);

    const handleSearch = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!topic.trim()) return;

        setLoading(true);
        try {
            const params = new URLSearchParams({
                q: topic.trim(),
            });
            if (location.trim()) {
                params.append('location', location.trim());
            }
            if (jurisdiction !== 'all') {
                params.append('jurisdiction', jurisdiction);
            }

            const response = await fetch(`${API_BASE_URL}/search?${params.toString()}`);
            if (!response.ok) {
                // Parse error response body
                const text = await response.text();
                let errorData: unknown;
                try {
                    errorData = text ? JSON.parse(text) : { message: response.statusText };
                } catch {
                    errorData = { message: response.statusText };
                }

                // Extract error message from API response if available
                const apiMessage = 
                    (typeof errorData === 'object' && errorData !== null && 'message' in errorData)
                        ? String((errorData as { message: string }).message)
                        : (typeof errorData === 'object' && errorData !== null && 'error' in errorData)
                        ? String((errorData as { error: string }).error)
                        : null;

                // Create error object with HTTP response details
                const errorMessage = apiMessage || t('searchPage.searchFailed');
                const error = new Error(errorMessage) as Error & {
                    response?: { status: number; data: unknown; url?: string };
                    statusCode?: number;
                };
                error.statusCode = response.status;
                error.response = {
                    status: response.status,
                    data: errorData,
                    url: `${API_BASE_URL}/search?${params.toString()}`
                };
                throw error;
            }
            const data = await response.json();
            setResults(data);
            setSelectedIds(new Set()); // Clear selections on new search
        } catch (error) {
            logError(error, 'search');
        } finally {
            setLoading(false);
        }
    };

    const toggleSelection = (docId: string) => {
        const newSelected = new Set(selectedIds);
        if (newSelected.has(docId)) {
            newSelected.delete(docId);
        } else {
            newSelected.add(docId);
        }
        setSelectedIds(newSelected);
    };

    const toggleSelectAll = () => {
        if (!results) return;
        if (selectedIds.size === results.documents.length) {
            setSelectedIds(new Set());
        } else {
            setSelectedIds(new Set(results.documents.map(doc => doc.id)));
        }
    };

    const getDocumentsToExport = () => {
        if (!results) return [];
        if (selectedIds.size === 0) {
            return results.documents; // Export all if nothing selected
        }
        return results.documents.filter(doc => selectedIds.has(doc.id));
    };

    const handleExport = async (format: 'csv' | 'pdf') => {
        if (!results || results.documents.length === 0) return;

        const documentsToExport = getDocumentsToExport();
        if (documentsToExport.length === 0) {
            alert('Please select documents to export');
            return;
        }

        setExporting(true);
        try {
            const blob = await api.exportResults(
                documentsToExport,
                format,
                {
                    includeCitations,
                    citationFormat,
                    searchParams: {
                        topic: topic.trim(),
                        location: location.trim() || undefined,
                        jurisdiction: jurisdiction !== 'all' ? jurisdiction : undefined,
                    },
                }
            );

            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            const filename = `beleidsscan-${topic.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').substring(0, 50)}-${new Date().toISOString().split('T')[0]}.${format}`;
            link.href = url;
            link.download = filename;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(url);
        } catch (error) {
            logError(error, 'export-search-results');
            alert(error instanceof Error ? error.message : `Failed to export ${format.toUpperCase()}`);
        } finally {
            setExporting(false);
        }
    };

    const handleEmailExport = async () => {
        if (!results || results.documents.length === 0) return;

        const documentsToExport = getDocumentsToExport();
        if (documentsToExport.length === 0) {
            alert('Please select documents to export');
            return;
        }

        if (!emailRecipients.trim()) {
            alert('Please enter recipient email addresses');
            return;
        }

        const recipients = emailRecipients.split(',').map(email => email.trim()).filter(Boolean);
        if (recipients.length === 0) {
            alert('Please enter valid email addresses');
            return;
        }

        setExporting(true);
        try {
            await api.emailExport(
                documentsToExport,
                recipients,
                {
                    topic: topic.trim(),
                    location: location.trim() || undefined,
                    jurisdiction: jurisdiction !== 'all' ? jurisdiction : undefined,
                },
                {
                    includeCitations,
                    citationFormat,
                }
            );
            alert(`Email sent successfully to ${recipients.length} recipient(s)`);
            setShowEmailDialog(false);
            setEmailRecipients('');
        } catch (error) {
            logError(error, 'email-export');
            alert(error instanceof Error ? error.message : 'Failed to send email export');
        } finally {
            setExporting(false);
        }
    };


    return (
        <div className="container mx-auto p-6 max-w-6xl">
            <div className="mb-8">
                <h1 className="text-3xl font-bold mb-2">{t('searchPage.title')}</h1>
                <p className="text-muted-foreground">
                    {t('searchPage.description')}
                </p>
            </div>

            <form onSubmit={handleSearch} className="space-y-4 mb-8">
                {/* Topic Input */}
                <div className="space-y-2">
                    <Label htmlFor="topic-input" className="text-base font-medium">
                        Onderwerp <span className="text-red-500">*</span>
                    </Label>
                    <div className="relative">
                        <Search className="absolute left-3 top-3 h-5 w-5 text-muted-foreground" />
                        <Input
                            id="topic-input"
                            value={topic}
                            onChange={(e) => setTopic(e.target.value)}
                            placeholder="Voer een onderwerp in (bijv. 'arbeidsmigranten', 'omgevingsvisie')"
                            className="pl-10 h-12 text-base"
                            required
                        />
                    </div>
                </div>

                {/* Location Input with Autocomplete */}
                <div className="space-y-2">
                    <Label htmlFor="location-input" className="text-base font-medium">
                        Locatie (optioneel)
                    </Label>
                    <Command className="rounded-lg border">
                        <CommandInput
                            id="location-input"
                            placeholder="Zoek gemeente (bijv. 'Horst aan de Maas', 'Amsterdam')"
                            value={locationSearch}
                            onValueChange={setLocationSearch}
                        />
                        {locationSearch.length > 0 && filteredMunicipalities.length > 0 && (
                            <CommandList>
                                <CommandEmpty>Geen gemeenten gevonden.</CommandEmpty>
                                <CommandGroup>
                                    {filteredMunicipalities.map((name) => (
                                        <CommandItem
                                            key={name}
                                            value={name}
                                            onSelect={() => {
                                                setLocation(name);
                                                setLocationSearch('');
                                            }}
                                        >
                                            <Check
                                                className={`mr-2 h-4 w-4 ${
                                                    location === name ? 'opacity-100' : 'opacity-0'
                                                }`}
                                            />
                                            <MapPin className="mr-2 h-4 w-4 text-muted-foreground" />
                                            {name}
                                        </CommandItem>
                                    ))}
                                </CommandGroup>
                            </CommandList>
                        )}
                    </Command>
                    {location && (
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                            <MapPin className="h-4 w-4" />
                            <span>Geselecteerd: {location}</span>
                            <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                onClick={() => {
                                    setLocation('');
                                    setLocationSearch('');
                                }}
                                className="h-6 px-2"
                            >
                                Verwijderen
                            </Button>
                        </div>
                    )}
                </div>

                {/* Jurisdiction Level Select */}
                <div className="space-y-2">
                    <Label htmlFor="jurisdiction-select" className="text-base font-medium">
                        Bestuurslaag (optioneel)
                    </Label>
                    <Select value={jurisdiction} onValueChange={(value: JurisdictionLevel) => setJurisdiction(value)}>
                        <SelectTrigger id="jurisdiction-select" className="h-12 text-base">
                            <SelectValue placeholder="Selecteer bestuurslaag" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all">Alle bestuurslagen</SelectItem>
                            <SelectItem value="national">Rijksoverheid</SelectItem>
                            <SelectItem value="provincial">Provincie</SelectItem>
                            <SelectItem value="municipal">Gemeente</SelectItem>
                        </SelectContent>
                    </Select>
                </div>

                {/* Search Button */}
                <Button type="submit" size="lg" disabled={loading || !topic.trim()} className="h-12 px-8 w-full sm:w-auto">
                    {loading ? t('searchPage.searching') : t('common.search')}
                </Button>
            </form>

            {/* Search Examples */}
            {!results && !loading && (
                <Card className="mb-8">
                    <CardHeader>
                        <CardTitle className="text-lg flex items-center gap-2">
                            <Search className="h-5 w-5" />
                            Zoekvoorbeelden
                        </CardTitle>
                        <CardDescription>
                            Klik op een voorbeeld om de zoekopdracht in te vullen en te leren hoe je zoekt.
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="grid gap-3 md:grid-cols-2">
                            <button
                                type="button"
                                onClick={() => {
                                    setTopic('arbeidsmigranten');
                                    setLocation('Horst aan de Maas');
                                    setLocationSearch('Horst aan de Maas');
                                    setJurisdiction('municipal');
                                }}
                                className="text-left p-4 border border-gray-200 rounded-lg hover:bg-blue-50 hover:border-blue-300 transition-colors group"
                            >
                                <div className="font-medium text-gray-900 group-hover:text-blue-700">
                                    "arbeidsmigranten in Horst aan de Maas"
                                </div>
                                <div className="text-sm text-gray-600 mt-1">
                                    Zoek naar beleid over arbeidsmigranten in een specifieke gemeente
                                </div>
                            </button>
                            <button
                                type="button"
                                onClick={() => {
                                    setTopic('omgevingsvisie');
                                    setLocation('');
                                    setLocationSearch('');
                                    setJurisdiction('all');
                                }}
                                className="text-left p-4 border border-gray-200 rounded-lg hover:bg-blue-50 hover:border-blue-300 transition-colors group"
                            >
                                <div className="font-medium text-gray-900 group-hover:text-blue-700">
                                    "omgevingsvisie"
                                </div>
                                <div className="text-sm text-gray-600 mt-1">
                                    Zoek naar omgevingsvisies van alle overheden
                                </div>
                            </button>
                            <button
                                type="button"
                                onClick={() => {
                                    setTopic('klimaatadaptatie');
                                    setLocation('');
                                    setLocationSearch('');
                                    setJurisdiction('provincial');
                                }}
                                className="text-left p-4 border border-gray-200 rounded-lg hover:bg-blue-50 hover:border-blue-300 transition-colors group"
                            >
                                <div className="font-medium text-gray-900 group-hover:text-blue-700">
                                    "klimaatadaptatie" op provinciaal niveau
                                </div>
                                <div className="text-sm text-gray-600 mt-1">
                                    Filter op bestuurslaag om gerichter te zoeken
                                </div>
                            </button>
                            <button
                                type="button"
                                onClick={() => {
                                    setTopic('woningbouw');
                                    setLocation('Amsterdam');
                                    setLocationSearch('Amsterdam');
                                    setJurisdiction('municipal');
                                }}
                                className="text-left p-4 border border-gray-200 rounded-lg hover:bg-blue-50 hover:border-blue-300 transition-colors group"
                            >
                                <div className="font-medium text-gray-900 group-hover:text-blue-700">
                                    "woningbouw in Amsterdam"
                                </div>
                                <div className="text-sm text-gray-600 mt-1">
                                    Combineer onderwerp en locatie voor specifieke resultaten
                                </div>
                            </button>
                        </div>
                        <div className="mt-4 p-3 bg-blue-50 rounded-lg border border-blue-200">
                            <p className="text-sm text-blue-900">
                                <strong>Tip:</strong> Gebruik filters om je zoekresultaten te verfijnen. Je kunt zoeken op onderwerp alleen, of combineren met locatie en bestuurslaag voor meer gerichte resultaten.
                            </p>
                        </div>
                    </CardContent>
                </Card>
            )}

            {results && (
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
                                        onClick={toggleSelectAll}
                                        className="text-xs"
                                    >
                                        {selectedIds.size === results.documents.length ? 'Deselect All' : 'Select All'}
                                    </Button>
                                )}
                                {selectedIds.size > 0 && (
                                    <span className="text-sm text-muted-foreground">
                                        {selectedIds.size} of {results.documents.length} selected
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
                                        >
                                            <Download className="h-4 w-4" />
                                            Export
                                            <ChevronDown className="h-4 w-4" />
                                        </Button>
                                    </DropdownMenuTrigger>
                                    <DropdownMenuContent align="end">
                                        <DropdownMenuLabel>Export Options</DropdownMenuLabel>
                                        <DropdownMenuSeparator />
                                        <DropdownMenuItem
                                            onClick={() => handleExport('csv')}
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
                                            onClick={() => handleExport('pdf')}
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
                                            onClick={() => setShowEmailDialog(true)}
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
                                            onCheckedChange={setIncludeCitations}
                                        >
                                            Include Citations
                                        </DropdownMenuCheckboxItem>
                                        {includeCitations && (
                                            <>
                                                <DropdownMenuCheckboxItem
                                                    checked={citationFormat === 'apa'}
                                                    onCheckedChange={(checked) => checked && setCitationFormat('apa')}
                                                >
                                                    APA Format
                                                </DropdownMenuCheckboxItem>
                                                <DropdownMenuCheckboxItem
                                                    checked={citationFormat === 'custom'}
                                                    onCheckedChange={(checked) => checked && setCitationFormat('custom')}
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
                            <p className="text-muted-foreground">{t('searchPage.noDocumentsFound')}</p>
                        ) : (
                            <div className="space-y-4">
                                {results.documents.map((doc) => {
                                    const getMetadataString = (key: string): string => {
                                        const value = doc.metadata?.[key];
                                        return value ? String(value) : '';
                                    };

                                    const title = getMetadataString('title') || getMetadataString('name') || getMetadataString('titel') || t('searchPage.unnamedDocument');
                                    const sourceUrl = doc.sourceUrl || getMetadataString('url') || getMetadataString('sourceUrl') || getMetadataString('website_url') || '';
                                    const summary = getMetadataString('summary') || getMetadataString('samenvatting') || doc.content.substring(0, 200) + (doc.content.length > 200 ? '...' : '');
                                    const source = getMetadataString('source') || getMetadataString('website_titel') || getMetadataString('jurisdiction') || t('searchPage.unknownSource');
                                    const jurisdiction = getMetadataString('jurisdiction');

                                    return (
                                        <Card key={doc.id}>
                                            <CardHeader className="pb-2">
                                                <div className="flex items-start gap-3">
                                                    <Checkbox
                                                        checked={selectedIds.has(doc.id)}
                                                        onCheckedChange={() => toggleSelection(doc.id)}
                                                        className="mt-1"
                                                        aria-label={selectedIds.has(doc.id) ? 'Deselect document' : 'Select document'}
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
            )}

            {/* Email Export Dialog */}
            <Dialog open={showEmailDialog} onOpenChange={setShowEmailDialog}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Email Export</DialogTitle>
                        <DialogDescription>
                            Enter recipient email addresses (comma-separated). The export will be sent as a CSV attachment.
                            {selectedIds.size > 0 && (
                                <span className="block mt-1 text-xs">
                                    Exporting {selectedIds.size} of {results?.documents.length || 0} selected results
                                </span>
                            )}
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                        <div className="space-y-2">
                            <Label htmlFor="email-recipients">Recipients</Label>
                            <Input
                                id="email-recipients"
                                type="text"
                                placeholder="email1@example.com, email2@example.com"
                                value={emailRecipients}
                                onChange={(e) => setEmailRecipients(e.target.value)}
                            />
                        </div>
                    </div>
                    <DialogFooter>
                        <Button
                            variant="outline"
                            onClick={() => {
                                setShowEmailDialog(false);
                                setEmailRecipients('');
                            }}
                        >
                            Cancel
                        </Button>
                        <Button
                            onClick={handleEmailExport}
                            disabled={exporting || !emailRecipients.trim()}
                        >
                            {exporting ? 'Sending...' : 'Send Email'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
