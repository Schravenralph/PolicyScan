import React, { useState } from 'react';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '../ui/dialog';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Textarea } from '../ui/textarea';
import { Badge } from '../ui/badge';
import { CheckCircle2, Download, AlertCircle } from 'lucide-react';
import { t } from '../../utils/i18n';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '../ui/select';
import { api } from '../../services/api';
import type { CanonicalDocumentDraft } from '../../services/api';
import { logError, parseError } from '../../utils/errorHandler';
import { toast } from '../../utils/toast';

interface AddDocumentDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onSuccess: () => void;
}

function generateUUID() {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
        return crypto.randomUUID();
    }
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
        const r = Math.random() * 16 | 0;
        const v = c == 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
}

export function AddDocumentDialog({ open, onOpenChange, onSuccess }: AddDocumentDialogProps) {
    const [loading, setLoading] = useState(false);
    const [extractingContent, setExtractingContent] = useState(false);
    const [extractionError, setExtractionError] = useState<string | null>(null);
    const [contentExtracted, setContentExtracted] = useState(false);
    const [formData, setFormData] = useState({
        title: '',
        fullText: '',
        url: '',
        source: 'Web',
        documentType: 'Web Page',
    });

    const handleChange = (field: string, value: string) => {
        setFormData((prev) => ({ ...prev, [field]: value }));
        // Clear extraction error and extracted flag when URL changes
        if (field === 'url') {
            setExtractionError(null);
            setContentExtracted(false);
        }
        // Clear extracted flag when content is manually edited
        if (field === 'fullText' && contentExtracted) {
            setContentExtracted(false);
        }
    };

    const generateFingerprint = (text: string): string => {
        // Simple hash function for fingerprint
        let hash = 0;
        if (text.length === 0) return hash.toString();
        for (let i = 0; i < text.length; i++) {
            const char = text.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash; // Convert to 32bit integer
        }
        return Math.abs(hash).toString(16);
    };

    const handleExtractContent = async () => {
        if (!formData.url.trim()) {
            toast.error(t('addDocument.urlRequiredForExtraction') || 'URL is verplicht om inhoud op te halen');
            return;
        }

        // Basic URL validation
        try {
            new URL(formData.url);
        } catch {
            toast.error(t('addDocument.invalidUrl') || 'Ongeldige URL');
            return;
        }

        setExtractingContent(true);
        setExtractionError(null);

        try {
            const result = await api.canonicalDocument.extractContentFromUrl(formData.url);
            
            if (!result.text || result.text.trim().length === 0) {
                setExtractionError(t('addDocument.emptyExtraction') || 'Geen inhoud gevonden op deze URL. Controleer of de URL toegankelijk is.');
                toast.warning(t('addDocument.emptyExtraction') || 'Geen inhoud gevonden op deze URL');
                return;
            }

            // Update form data with extracted content
            setFormData((prev) => ({
                ...prev,
                fullText: result.text,
                // Optionally update title if extracted and not already set
                title: prev.title.trim() ? prev.title : (result.title || prev.title),
            }));

            setContentExtracted(true);
            toast.success(t('addDocument.contentExtracted') || 'Inhoud succesvol opgehaald');
        } catch (error) {
            logError(error, 'extract-content-from-url');
            const errorInfo = parseError(error);
            const errorMessage = errorInfo.message || 'Kon inhoud niet ophalen van deze URL';
            setExtractionError(errorMessage);
            toast.error(t('addDocument.extractionFailed') || 'Fout bij ophalen inhoud', errorMessage);
        } finally {
            setExtractingContent(false);
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        if (!formData.title.trim()) {
            toast.error(t('addDocument.titleRequired'));
            return;
        }
        if (!formData.fullText.trim()) {
            // If fullText is empty, require URL and suggest extraction
            if (!formData.url.trim()) {
                toast.error(t('addDocument.urlOrContentRequired') || 'Vul een URL in en haal de inhoud op, of vul handmatig de inhoud in');
                return;
            }
            toast.error(t('addDocument.contentRequired') || 'Haal eerst de inhoud op van de URL, of vul handmatig de inhoud in');
            return;
        }

        setLoading(true);
        try {
            const now = new Date();
            const draft: CanonicalDocumentDraft = {
                title: formData.title,
                fullText: formData.fullText,
                canonicalUrl: formData.url || undefined,
                source: formData.source as any,
                sourceId: generateUUID(),
                documentType: formData.documentType,
                documentFamily: 'Web', // Defaulting to Web for manual entry
                contentFingerprint: generateFingerprint(formData.fullText),
                dates: {
                    publishedAt: now,
                    validFrom: now,
                },
                sourceMetadata: {
                    manualEntry: true,
                    createdAt: now.toISOString(),
                    legacyWebsiteTitel: formData.source,
                    legacyWebsiteUrl: formData.url,
                },
                language: 'nl', // Default to Dutch
            };

            await api.canonicalDocument.createCanonicalDocument(draft);

            toast.success(t('library.documentAdded'), t('library.documentAddedDesc'));
            onSuccess();
            onOpenChange(false);

            // Reset form
            setFormData({
                title: '',
                fullText: '',
                url: '',
                source: 'Web',
                documentType: 'Web Page',
            });
            setExtractionError(null);
            setContentExtracted(false);
        } catch (error) {
            logError(error, 'add-document-dialog');
            const errorInfo = parseError(error);
            toast.error(errorInfo.title || 'Fout bij opslaan', errorInfo.message || 'Kon het document niet opslaan.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-2xl">
                <DialogHeader>
                    <DialogTitle>{t('library.addDocumentTitle')}</DialogTitle>
                    <DialogDescription>
                        {t('library.addDocumentDescription')}
                    </DialogDescription>
                </DialogHeader>

                <form onSubmit={handleSubmit} className="space-y-4 py-4">
                    {/* Step 1: URL input with extraction */}
                    <div className="space-y-3 p-4 bg-muted/30 rounded-lg border">
                        <div className="flex items-center gap-2 mb-2">
                            <span className="flex items-center justify-center w-6 h-6 rounded-full bg-primary text-primary-foreground text-sm font-semibold">1</span>
                            <Label htmlFor="url" className="text-base font-semibold">Stap 1: Voer de URL in</Label>
                        </div>
                        <div className="space-y-2">
                            <div className="flex gap-2">
                                <Input
                                    id="url"
                                    value={formData.url}
                                    onChange={(e) => handleChange('url', e.target.value)}
                                    placeholder="https://example.com/document"
                                    disabled={loading || extractingContent}
                                    className="flex-1"
                                />
                                <Button
                                    type="button"
                                    variant="default"
                                    onClick={handleExtractContent}
                                    disabled={loading || extractingContent || !formData.url.trim()}
                                    isLoading={extractingContent}
                                    loadingText={t('addDocument.extracting') || 'Ophalen...'}
                                    className="shrink-0"
                                >
                                    <Download className="w-4 h-4 mr-2" />
                                    {t('addDocument.extractContent') || 'Inhoud ophalen'}
                                </Button>
                            </div>
                            <p className="text-xs text-muted-foreground">
                                Voer de URL van het document in en klik op "Inhoud ophalen" om automatisch de inhoud te laden.
                            </p>
                            {extractionError && (
                                <div className="flex items-start gap-2 p-2 bg-destructive/10 border border-destructive/20 rounded text-sm text-destructive">
                                    <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                                    <span>{extractionError}</span>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Step 2: Content display */}
                    <div className="space-y-3 p-4 bg-muted/30 rounded-lg border">
                        <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center gap-2">
                                <span className="flex items-center justify-center w-6 h-6 rounded-full bg-primary text-primary-foreground text-sm font-semibold">2</span>
                                <Label htmlFor="fullText" className="text-base font-semibold">Stap 2: Inhoud</Label>
                            </div>
                            {contentExtracted && (
                                <Badge variant="default" className="gap-1">
                                    <CheckCircle2 className="w-3 h-3" />
                                    Automatisch opgehaald
                                </Badge>
                            )}
                        </div>
                        <div className="space-y-2">
                            <Textarea
                                id="fullText"
                                value={formData.fullText}
                                onChange={(e) => handleChange('fullText', e.target.value)}
                                placeholder={contentExtracted ? undefined : 'De inhoud wordt hier automatisch getoond nadat je op "Inhoud ophalen" hebt geklikt. Je hoeft dit veld niet handmatig in te vullen.'}
                                className={`min-h-[200px] font-mono text-sm ${contentExtracted ? 'bg-green-50 dark:bg-green-950/20 border-green-200 dark:border-green-800' : ''}`}
                                disabled={loading || extractingContent}
                            />
                            {!formData.fullText && !extractingContent && (
                                <div className="flex items-center gap-2 p-3 bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800 rounded text-sm text-blue-900 dark:text-blue-200">
                                    <AlertCircle className="w-4 h-4 shrink-0" />
                                    <span>Vul eerst een URL in en klik op "Inhoud ophalen" om de inhoud automatisch te laden.</span>
                                </div>
                            )}
                            {formData.fullText && (
                                <div className="flex items-center justify-between text-xs text-muted-foreground">
                                    <span>{formData.fullText.length} karakters geëxtraheerd</span>
                                    {contentExtracted && (
                                        <span className="text-muted-foreground/70">Deze inhoud is automatisch opgehaald van de URL</span>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Document metadata */}
                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label htmlFor="title">Titel *</Label>
                            <Input
                                id="title"
                                value={formData.title}
                                onChange={(e) => handleChange('title', e.target.value)}
                                placeholder={t('addDocument.documentTitle')}
                                disabled={loading || extractingContent}
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="documentType">Document Type</Label>
                            <Input
                                id="documentType"
                                value={formData.documentType}
                                onChange={(e) => handleChange('documentType', e.target.value)}
                                placeholder={t('addDocument.documentTypePlaceholder')}
                                disabled={loading}
                            />
                        </div>
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="source">Bron</Label>
                        <Select
                            value={formData.source}
                            onValueChange={(val) => handleChange('source', val)}
                            disabled={loading}
                        >
                            <SelectTrigger id="source">
                                <SelectValue placeholder={t('addDocument.selectSource')} />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="Web">{t('addDocument.source.web')}</SelectItem>
                                <SelectItem value="DSO">{t('addDocument.source.dso')}</SelectItem>
                                <SelectItem value="Rechtspraak">{t('addDocument.source.rechtspraak')}</SelectItem>
                                <SelectItem value="Wetgeving">{t('addDocument.source.wetgeving')}</SelectItem>
                                <SelectItem value="Gemeente">{t('addDocument.source.gemeente')}</SelectItem>
                                <SelectItem value="PDOK">{t('addDocument.source.pdok')}</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>

                    <DialogFooter className="mt-6">
                        <Button
                            type="button"
                            variant="outline"
                            onClick={() => onOpenChange(false)}
                            disabled={loading}
                        >
                            {t('addDocument.cancel')}
                        </Button>
                        <Button type="submit" disabled={loading}>
                            {loading ? t('addDocument.saving') : t('addDocument.add')}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}
