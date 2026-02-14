/**
 * BronnenOverzicht Component
 * 
 * ✅ **MIGRATED** - Now uses canonical document hooks directly.
 * 
 * **Migration Status:**
 * - ✅ Uses `useCanonicalDocumentsByQuery` to fetch canonical documents directly
 * - ✅ Uses `useUpdateCanonicalDocumentAcceptance` for status updates
 * - ✅ Transforms canonical documents to Bron format only at BronCard boundary
 * - ✅ All document operations use canonical API hooks
 * 
 * **Transformation Strategy:**
 * - Hooks return CanonicalDocument format directly
 * - Component transforms to Bron format only for BronCard display (necessary boundary)
 * - Future: Migrate BronCard to accept CanonicalDocument directly
 * 
 * **Migration Reference:**
 * - WI-413: Frontend Hooks & Components Migration
 * - See `docs/70-sprint-backlog/WI-413-frontend-hooks-components-migration.md`
 * 
 * @see WI-413: Frontend Hooks & Components Migration
 */

import { useState, useEffect, useMemo, useCallback } from 'react';
import { Bron } from '../utils/transformations';
import { MetadataFilterPanel, MetadataFilters } from './MetadataFilterPanel';
import { MetadataGroupingSelector, GroupingOption } from './MetadataGroupingSelector';
import { api } from '../services/api';
import { toast } from '../utils/toast';
import { t } from '../utils/i18n';
import { validateUrl } from '../utils/validation';
import { statusToAcceptance } from '../utils/businessRules';
import { transformWebsitesToBronnen } from '../utils/transformations';
import { createCustomDocumentData } from '../utils/businessRules';
import { type ScanParameters, normalizeScanParameters, type NormalizedScanParameters } from '../types/scanParameters';
import { logError } from '../utils/errorHandler';
import { useAllWebsites } from '../hooks/useWebsiteWithReactQuery';
import { useCreateDocument, useDeleteDocument } from '../hooks/useDocumentWithReactQuery';
import { useCanonicalDocumentsByQuery, useUpdateCanonicalDocumentAcceptance } from '../hooks/useCanonicalDocumentWithReactQuery';
import { useUpdateWebsiteAcceptance } from '../hooks/useWebsiteWithReactQuery';
import type { CanonicalDocument } from '../services/api';
import { BronnenOverzichtHeader } from './BronnenOverzichtHeader';
import { BronnenOverzichtSummary } from './BronnenOverzichtSummary';
import { BronnenOverzichtScanCard } from './BronnenOverzichtScanCard';
import { BronnenOverzichtCustomSource } from './BronnenOverzichtCustomSource';
import { BronnenOverzichtList } from './BronnenOverzichtList';
import { BronnenOverzichtActions } from './BronnenOverzichtActions';

interface BronnenOverzichtProps {
  onBack: () => void;
  queryId: string;
  scanParameters: ScanParameters;
}

export function BronnenOverzicht({ onBack, queryId, scanParameters }: BronnenOverzichtProps) {
  // Normalize scan parameters to ensure all optional properties have default values
  // This eliminates the need for || '' workarounds throughout the component
  const normalizedParams: NormalizedScanParameters = normalizeScanParameters(scanParameters);

  const [isLoading, setIsLoading] = useState(false);
  const [customBronUrl, setCustomBronUrl] = useState('');
  const [customBronnen, setCustomBronnen] = useState<Bron[]>([]);
  const [isScanning, setIsScanning] = useState(false);
  const [scanProgress, setScanProgress] = useState<{
    status: string;
    currentStep: string;
    documentsFound: number;
    sourcesFound: number;
  } | null>(null);

  // Metadata filtering and grouping
  const [filters, setFilters] = useState<MetadataFilters>({});
  const [grouping, setGrouping] = useState<GroupingOption>('none');

  // Use React Query hooks for data fetching
  const { data: websites = [], isLoading: isLoadingWebsites, refetch: refetchWebsites } = useAllWebsites();
  // ✅ MIGRATED: Use canonical hooks directly
  const { data: canonicalDocuments = [], isLoading: isLoadingDocuments, refetch: refetchDocuments } = useCanonicalDocumentsByQuery(queryId);
  const createDocument = useCreateDocument();
  const deleteDocument = useDeleteDocument();
  const updateDocumentAcceptance = useUpdateCanonicalDocumentAcceptance();
  const updateWebsiteAcceptance = useUpdateWebsiteAcceptance();

  const { mutateAsync: updateDocumentAcceptanceMutation } = updateDocumentAcceptance;
  const { mutateAsync: updateWebsiteAcceptanceMutation } = updateWebsiteAcceptance;
  const { mutateAsync: deleteDocumentMutation } = deleteDocument;
  const { mutateAsync: createDocumentMutation } = createDocument;

  // Transform websites to Bron format (websites are not CanonicalDocument)
  // ✅ MIGRATED: Documents are now passed directly as CanonicalDocument to BronCard
  const websiteBronnen = useMemo(() => {
    return transformWebsitesToBronnen(websites);
  }, [websites]);

  const isFetchingBronnen = isLoadingWebsites || isLoadingDocuments;

  const handleStatusChange = useCallback(async (documentId: string, status: 'approved' | 'rejected' | 'pending') => {
    try {
      const accepted = statusToAcceptance(status);
      // ✅ MIGRATED: Use canonical document acceptance hook
      await updateDocumentAcceptanceMutation({
        documentId,
        accepted,
      });
      // React Query will automatically refetch data after the mutation
    } catch (error) {
      logError(error, 'update-document-acceptance');
      toast.error(
        t('bronnenOverzicht.failedToUpdateStatus'),
        t('bronnenOverzicht.failedToUpdateStatusDesc')
      );
    }
  }, [updateDocumentAcceptanceMutation]);

  const handleWebsiteStatusChange = useCallback(async (websiteId: string, status: 'approved' | 'rejected' | 'pending') => {
    try {
      const accepted = statusToAcceptance(status);
      await updateWebsiteAcceptanceMutation({
        websiteId,
        accepted,
      });
      // React Query will automatically refetch data after the mutation
    } catch (error) {
      logError(error, 'update-website-acceptance');
      toast.error(
        t('bronnenOverzicht.failedToUpdateStatus'),
        t('bronnenOverzicht.failedToUpdateStatusDesc')
      );
    }
  }, [updateWebsiteAcceptanceMutation]);

  const handleCustomBronStatusChange = useCallback(async (bronId: string, status: 'approved' | 'rejected' | 'pending') => {
    // Find bron before async operation
    const capturedBron = customBronnen.find(b => b.id === bronId);
    if (!capturedBron || !capturedBron._id) return;

    try {
      // Update in database
      const accepted = statusToAcceptance(status);

      // ✅ MIGRATED: Use canonical document acceptance hook
      await updateDocumentAcceptanceMutation({
        documentId: capturedBron._id,
        accepted,
      });

      // Update local state for custom bronnen (these are not refetched)
      setCustomBronnen(prev => prev.map(b =>
        b.id === bronId ? { ...b, status } : b
      ));
    } catch (error) {
      logError(error, 'update-custom-bron-acceptance');
      toast.error(
        t('bronnenOverzicht.failedToUpdateStatus'),
        t('bronnenOverzicht.failedToUpdateStatusDesc')
      );
    }
  }, [customBronnen, updateDocumentAcceptanceMutation]);

  const handleAddCustomBron = useCallback(async () => {
    if (!customBronUrl) return;

    // Validate URL format before making API call
    const validation = validateUrl(customBronUrl);
    if (!validation.isValid) {
      toast.error(t('common.invalidUrl'), validation.error || t('common.invalidUrlMessage'));
      return;
    }

    setIsLoading(true);

    try {
      // Create document in database using business rule utility
      // Use original scanParameters for business rule (which expects optional properties)
      const documentData = createCustomDocumentData(customBronUrl, scanParameters, queryId);
      // useCreateDocument already returns a Bron (it transforms internally)
      const newBron = await createDocumentMutation(documentData);
      setCustomBronnen(prev => [...prev, newBron]);
      setCustomBronUrl('');
      // React Query will automatically refetch documents after the mutation
    } catch (error) {
      logError(error, 'add-custom-bron');
      toast.error(
        t('bronnenOverzicht.failedToAddDocument'),
        t('bronnenOverzicht.failedToAddDocumentDesc')
      );
    } finally {
      setIsLoading(false);
    }
  }, [customBronUrl, scanParameters, queryId, createDocumentMutation]);

  const handleRemoveCustomBron = useCallback(async (bronId: string) => {
    const bron = customBronnen.find(b => b.id === bronId);
    if (!bron || !bron._id) return;

    try {
      // Remove from database
      await deleteDocumentMutation(bron._id);
      // Remove from local state after successful deletion
      setCustomBronnen(prev => prev.filter(b => b.id !== bronId));
      // React Query will automatically refetch documents after the mutation
    } catch (error) {
      logError(error, 'remove-custom-bron');
      toast.error(
        t('bronnenOverzicht.failedToDeleteDocument'),
        t('bronnenOverzicht.failedToDeleteDocumentDesc')
      );
    }
  }, [customBronnen, deleteDocumentMutation]);

  const handleStartScan = async () => {
    setIsScanning(true);
    setScanProgress({
      status: 'scanning',
      currentStep: t('bronnenOverzicht.startingScan'),
      documentsFound: 0,
      sourcesFound: 0
    });

    try {
      const result = await api.triggerScan(queryId);

      setScanProgress({
        status: 'completed',
        currentStep: result.progress.currentStep,
        documentsFound: result.documentsFound,
        sourcesFound: result.sourcesFound
      });

      // Refresh bronnen lists to show new documents
      await Promise.all([refetchWebsites(), refetchDocuments()]);

      toast.success(
        t('bronnenOverzicht.scanCompleted'),
        t('bronnenOverzicht.scanCompletedDesc')
          .replace('{{documents}}', String(result.documentsFound))
          .replace('{{sources}}', String(result.sourcesFound))
      );
    } catch (error) {
      logError(error, 'trigger-scan');
      setScanProgress({
        status: 'error',
        currentStep: t('bronnenOverzicht.scanFailed'),
        documentsFound: 0,
        sourcesFound: 0
      });
      toast.error(
        t('bronnenOverzicht.scanError'),
        t('bronnenOverzicht.scanErrorDesc')
      );
    } finally {
      setIsScanning(false);
    }
  };

  // Filter documents based on metadata filters
  const filteredDocuments = useMemo(() => {
    return canonicalDocuments.filter(doc => {
      const sourceMetadata = doc.sourceMetadata || {};
      const enrichmentMetadata = doc.enrichmentMetadata || {};
      const legacyThemes = (sourceMetadata.legacyThemes ?? enrichmentMetadata.themes) as string[] | undefined;
      const legacyIssuingAuthority = (sourceMetadata.legacyIssuingAuthority ?? enrichmentMetadata.issuingAuthority) as string | null | undefined;
      const legacyDocumentStatus = enrichmentMetadata.documentStatus as string | null | undefined;

      // Filter by document type
      if (filters.documentTypes && filters.documentTypes.length > 0) {
        if (!doc.documentType || !filters.documentTypes.includes(doc.documentType)) {
          return false;
        }
      }

      // Filter by date range
      if (filters.dateFrom || filters.dateTo) {
        if (!doc.dates?.publishedAt) return false;
        const pubDate = typeof doc.dates.publishedAt === 'string'
          ? new Date(doc.dates.publishedAt)
          : doc.dates.publishedAt;
        if (isNaN(pubDate.getTime())) return false;

        if (filters.dateFrom) {
          const fromDate = new Date(filters.dateFrom);
          if (pubDate < fromDate) return false;
        }
        if (filters.dateTo) {
          const toDate = new Date(filters.dateTo);
          toDate.setHours(23, 59, 59, 999);
          if (pubDate > toDate) return false;
        }
      }

      // Filter by themes
      if (filters.themes && filters.themes.length > 0) {
        if (!legacyThemes || legacyThemes.length === 0) return false;
        const hasMatchingTheme = filters.themes.some(theme =>
          legacyThemes.some(docTheme =>
            docTheme.toLowerCase().includes(theme.toLowerCase()) ||
            theme.toLowerCase().includes(docTheme.toLowerCase())
          )
        );
        if (!hasMatchingTheme) return false;
      }

      // Filter by issuing authority
      if (filters.issuingAuthorities && filters.issuingAuthorities.length > 0) {
        if (!legacyIssuingAuthority) return false;
        const hasMatchingAuthority = filters.issuingAuthorities.some(auth =>
          legacyIssuingAuthority.toLowerCase().includes(auth.toLowerCase()) ||
          auth.toLowerCase().includes(legacyIssuingAuthority.toLowerCase())
        );
        if (!hasMatchingAuthority) return false;
      }

      // Filter by document status
      if (filters.documentStatuses && filters.documentStatuses.length > 0) {
        if (!legacyDocumentStatus) return false;
        const hasMatchingStatus = filters.documentStatuses.some(status =>
          legacyDocumentStatus.toLowerCase().includes(status.toLowerCase()) ||
          status.toLowerCase().includes(legacyDocumentStatus.toLowerCase())
        );
        if (!hasMatchingStatus) return false;
      }

      return true;
    });
  }, [canonicalDocuments, filters]);

  // Filter custom bronnen (these are Bron format)
  const filteredCustomBronnen = useMemo(() => {
    return customBronnen.filter(bron => {
      if (bron.type === 'website') return true;
      const metadata = bron.metadata;
      if (!metadata) return true;

      // Apply same filters as documents
      if (filters.documentTypes && filters.documentTypes.length > 0) {
        if (!metadata.documentType || !filters.documentTypes.includes(metadata.documentType)) {
          return false;
        }
      }

      // Filter by date range
      if (filters.dateFrom || filters.dateTo) {
        if (!metadata.publicationDate) return false;
        const pubDate = new Date(metadata.publicationDate);
        if (isNaN(pubDate.getTime())) return false;

        if (filters.dateFrom) {
          const fromDate = new Date(filters.dateFrom);
          if (pubDate < fromDate) return false;
        }
        if (filters.dateTo) {
          const toDate = new Date(filters.dateTo);
          toDate.setHours(23, 59, 59, 999);
          if (pubDate > toDate) return false;
        }
      }

      // Filter by themes
      if (filters.themes && filters.themes.length > 0) {
        if (!metadata.themes || metadata.themes.length === 0) return false;
        const hasMatchingTheme = filters.themes.some(theme =>
          metadata.themes.some(docTheme =>
            docTheme.toLowerCase().includes(theme.toLowerCase()) ||
            theme.toLowerCase().includes(docTheme.toLowerCase())
          )
        );
        if (!hasMatchingTheme) return false;
      }

      // Filter by issuing authority
      if (filters.issuingAuthorities && filters.issuingAuthorities.length > 0) {
        if (!metadata.issuingAuthority) return false;
        const hasMatchingAuthority = filters.issuingAuthorities.some(auth =>
          metadata.issuingAuthority!.toLowerCase().includes(auth.toLowerCase()) ||
          auth.toLowerCase().includes(metadata.issuingAuthority!.toLowerCase())
        );
        if (!hasMatchingAuthority) return false;
      }

      // Filter by document status
      if (filters.documentStatuses && filters.documentStatuses.length > 0) {
        if (!metadata.documentStatus) return false;
        const hasMatchingStatus = filters.documentStatuses.some(status =>
          metadata.documentStatus!.toLowerCase().includes(status.toLowerCase()) ||
          status.toLowerCase().includes(metadata.documentStatus!.toLowerCase())
        );
        if (!hasMatchingStatus) return false;
      }

      return true;
    });
  }, [customBronnen, filters]);

  // Group filtered documents and websites
  const groupedItems = useMemo(() => {
    // Combine documents and websites for grouping
    const allItems: Array<{ type: 'document' | 'website'; document?: CanonicalDocument; bron?: Bron }> = [
      ...filteredDocuments.map(doc => ({ type: 'document' as const, document: doc })),
      ...websiteBronnen.map(bron => ({ type: 'website' as const, bron })),
      ...filteredCustomBronnen.map(bron => ({ type: 'document' as const, bron })),
    ];

    if (grouping === 'none') {
      return { [t('common.allDocuments')]: allItems };
    }

    const groups: Record<string, typeof allItems> = {};

    allItems.forEach(item => {
      if (item.type === 'website') {
        const key = t('common.websites');
        if (!groups[key]) groups[key] = [];
        groups[key].push(item);
        return;
      }

      // For documents, extract metadata from canonical or bron
      const sourceMetadata = item.document?.sourceMetadata || {};
      const enrichmentMetadata = item.document?.enrichmentMetadata || {};
      const metadata = item.bron?.metadata;
      const legacyThemes = (sourceMetadata.legacyThemes ?? enrichmentMetadata.themes) as string[] | undefined;
      const legacyIssuingAuthority = (sourceMetadata.legacyIssuingAuthority ?? enrichmentMetadata.issuingAuthority) as string | null | undefined;
      const documentType = item.document?.documentType || metadata?.documentType;
      const publicationDate = item.document?.dates?.publishedAt || metadata?.publicationDate;

      let groupKey = t('common.unknown');

      if (grouping === 'documentType') {
        groupKey = documentType || t('common.unknownType');
      } else if (grouping === 'theme') {
        if (legacyThemes && legacyThemes.length > 0) {
          groupKey = legacyThemes[0];
        } else if (metadata?.themes && metadata.themes.length > 0) {
          groupKey = metadata.themes[0];
        } else {
          groupKey = t('common.noTheme');
        }
      } else if (grouping === 'date') {
        if (publicationDate) {
          const pubDate = typeof publicationDate === 'string'
            ? new Date(publicationDate)
            : publicationDate instanceof Date ? publicationDate : new Date(publicationDate);
          if (!isNaN(pubDate.getTime())) {
            const now = new Date();
            const yearDiff = now.getFullYear() - pubDate.getFullYear();
            if (yearDiff === 0) {
              groupKey = t('common.thisYear');
            } else if (yearDiff === 1) {
              groupKey = t('common.lastYear');
            } else if (yearDiff <= 5) {
              groupKey = t('common.yearsAgo').replace('{{count}}', String(yearDiff));
            } else {
              groupKey = t('common.olderThan5Years');
            }
          }
        } else {
          groupKey = t('common.unknownDate');
        }
      } else if (grouping === 'authority') {
        groupKey = legacyIssuingAuthority || metadata?.issuingAuthority || t('common.unknownAuthority');
      }

      if (!groups[groupKey]) groups[groupKey] = [];
      groups[groupKey].push(item);
    });

    return groups;
  }, [filteredDocuments, websiteBronnen, filteredCustomBronnen, grouping]);

  // Extract available options for filters from documents
  const availableOptions = useMemo(() => {
    const documentTypes = new Set<string>();
    const themes = new Set<string>();
    const issuingAuthorities = new Set<string>();
    const documentStatuses = new Set<string>();

    // Extract from canonical documents
    canonicalDocuments.forEach(doc => {
      const sourceMetadata = doc.sourceMetadata || {};
      const enrichmentMetadata = doc.enrichmentMetadata || {};
      const legacyThemes = (sourceMetadata.legacyThemes ?? enrichmentMetadata.themes) as string[] | undefined;
      const legacyIssuingAuthority = (sourceMetadata.legacyIssuingAuthority ?? enrichmentMetadata.issuingAuthority) as string | null | undefined;
      const legacyDocumentStatus = enrichmentMetadata.documentStatus as string | null | undefined;

      if (doc.documentType) {
        documentTypes.add(doc.documentType);
      }
      if (legacyThemes) {
        legacyThemes.forEach(theme => themes.add(theme));
      }
      if (legacyIssuingAuthority) {
        issuingAuthorities.add(legacyIssuingAuthority);
      }
      if (legacyDocumentStatus) {
        documentStatuses.add(legacyDocumentStatus);
      }
    });

    // Extract from custom bronnen (Bron format)
    customBronnen.forEach(bron => {
      if (bron.type === 'document' && bron.metadata) {
        if (bron.metadata.documentType) {
          documentTypes.add(bron.metadata.documentType);
        }
        if (bron.metadata.themes) {
          bron.metadata.themes.forEach(theme => themes.add(theme));
        }
        if (bron.metadata.issuingAuthority) {
          issuingAuthorities.add(bron.metadata.issuingAuthority);
        }
        if (bron.metadata.documentStatus) {
          documentStatuses.add(bron.metadata.documentStatus);
        }
      }
    });

    return {
      documentTypes: Array.from(documentTypes).sort(),
      themes: Array.from(themes).sort(),
      issuingAuthorities: Array.from(issuingAuthorities).sort(),
      documentStatuses: Array.from(documentStatuses).sort()
    };
  }, [canonicalDocuments, customBronnen]);

  // Update URL query parameters when filters change
  useEffect(() => {
    const params = new URLSearchParams();
    if (filters.documentTypes && filters.documentTypes.length > 0) {
      params.set('documentTypes', filters.documentTypes.join(','));
    }
    if (filters.dateFrom) params.set('dateFrom', filters.dateFrom);
    if (filters.dateTo) params.set('dateTo', filters.dateTo);
    if (filters.themes && filters.themes.length > 0) {
      params.set('themes', filters.themes.join(','));
    }
    if (filters.issuingAuthorities && filters.issuingAuthorities.length > 0) {
      params.set('authorities', filters.issuingAuthorities.join(','));
    }
    if (filters.documentStatuses && filters.documentStatuses.length > 0) {
      params.set('statuses', filters.documentStatuses.join(','));
    }
    if (grouping !== 'none') {
      params.set('grouping', grouping);
    }

    const newUrl = params.toString() ? `${window.location.pathname}?${params.toString()}` : window.location.pathname;
    window.history.replaceState({}, '', newUrl);
  }, [filters, grouping]);

  // Load filters from URL on mount
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const urlFilters: MetadataFilters = {};

    if (params.get('documentTypes')) {
      urlFilters.documentTypes = params.get('documentTypes')?.split(',') || [];
    }
    if (params.get('dateFrom')) {
      urlFilters.dateFrom = params.get('dateFrom') || undefined;
    }
    if (params.get('dateTo')) {
      urlFilters.dateTo = params.get('dateTo') || undefined;
    }
    if (params.get('themes')) {
      urlFilters.themes = params.get('themes')?.split(',') || [];
    }
    if (params.get('authorities')) {
      urlFilters.issuingAuthorities = params.get('authorities')?.split(',') || [];
    }
    if (params.get('statuses')) {
      urlFilters.documentStatuses = params.get('statuses')?.split(',') || [];
    }

    if (Object.keys(urlFilters).length > 0) {
      setFilters(urlFilters);
    }

    if (params.get('grouping')) {
      setGrouping(params.get('grouping') as GroupingOption || 'none');
    }
  }, []);

  // Calculate counts from filtered items
  const approvedCount = useMemo(() => {
    const docCount = filteredDocuments.filter(doc => {
      const accepted = doc.enrichmentMetadata?.accepted;
      return accepted === true;
    }).length;
    const websiteCount = websiteBronnen.filter(b => b.status === 'approved').length;
    const customCount = filteredCustomBronnen.filter(b => b.status === 'approved').length;
    return docCount + websiteCount + customCount;
  }, [filteredDocuments, websiteBronnen, filteredCustomBronnen]);

  const rejectedCount = useMemo(() => {
    const docCount = filteredDocuments.filter(doc => {
      const accepted = doc.enrichmentMetadata?.accepted;
      return accepted === false;
    }).length;
    const websiteCount = websiteBronnen.filter(b => b.status === 'rejected').length;
    const customCount = filteredCustomBronnen.filter(b => b.status === 'rejected').length;
    return docCount + websiteCount + customCount;
  }, [filteredDocuments, websiteBronnen, filteredCustomBronnen]);

  const pendingCount = useMemo(() => {
    const docCount = filteredDocuments.filter(doc => {
      const accepted = doc.enrichmentMetadata?.accepted;
      return accepted === null || accepted === undefined;
    }).length;
    const websiteCount = websiteBronnen.filter(b => b.status === 'pending').length;
    const customCount = filteredCustomBronnen.filter(b => b.status === 'pending').length;
    return docCount + websiteCount + customCount;
  }, [filteredDocuments, websiteBronnen, filteredCustomBronnen]);

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <BronnenOverzichtHeader onBack={onBack} />

      {/* Content */}
      <div className="container mx-auto px-6 py-12">
        <div className="max-w-6xl mx-auto">
          {/* Title and Summary */}
          <BronnenOverzichtSummary
            normalizedParams={normalizedParams}
            totalBronnen={canonicalDocuments.length + websites.length}
            pendingCount={pendingCount}
            approvedCount={approvedCount}
            rejectedCount={rejectedCount}
          />

          {/* Start Scan Section */}
          <BronnenOverzichtScanCard
            isScanning={isScanning}
            scanProgress={scanProgress}
            onStartScan={handleStartScan}
          />

          {/* Add Custom Source */}
          <BronnenOverzichtCustomSource
            customBronUrl={customBronUrl}
            onUrlChange={setCustomBronUrl}
            onAdd={handleAddCustomBron}
            isLoading={isLoading}
          />

          {/* Metadata Filter Panel and Grouping */}
          <div className="mb-8 space-y-4">
            <MetadataFilterPanel
              filters={filters}
              onFiltersChange={setFilters}
              availableOptions={availableOptions}
            />
            <MetadataGroupingSelector
              grouping={grouping}
              onGroupingChange={setGrouping}
            />
          </div>

          {/* Bronnen List */}
          <BronnenOverzichtList
            customBronnen={filteredCustomBronnen}
            filters={filters}
            onCustomBronStatusChange={handleCustomBronStatusChange}
            onRemoveCustomBron={handleRemoveCustomBron}
            groupedItems={groupedItems}
            grouping={grouping}
            isFetchingBronnen={isFetchingBronnen}
            totalCount={filteredDocuments.length + websiteBronnen.length + filteredCustomBronnen.length}
            onWebsiteStatusChange={handleWebsiteStatusChange}
            onDocumentStatusChange={handleStatusChange}
          />

          {/* Action Buttons */}
          <BronnenOverzichtActions
            onBack={onBack}
            approvedCount={approvedCount}
          />
        </div>
      </div>
    </div>
  );
}

