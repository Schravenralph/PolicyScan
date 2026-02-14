import React from 'react';
import type { BeleidsscanDraft } from '../../hooks/useDraftPersistence';
type WebsiteType = 'gemeente' | 'waterschap' | 'provincie' | 'rijk' | 'kennisinstituut';
/**
 * Validation errors for Step 1 form fields
 */
export interface Step1ValidationErrors {
    onderwerp?: string;
    overheidslaag?: string;
    selectedEntity?: string;
}
interface Step1QueryConfigurationProps {
    showStep1Info: boolean;
    setShowStep1Info: (show: boolean) => void;
    overheidslagen: Array<{
        id: WebsiteType;
        label: string;
        icon: React.ComponentType<React.SVGProps<SVGSVGElement>>;
        color: string;
    }>;
    gemeenten: string[];
    waterschappen: string[];
    provincies: string[];
    rijksorganisaties: string[];
    isLoadingJurisdictions: boolean;
    handleGenerateWebsites: () => Promise<void>;
    getCharacterCounterColor: () => string;
    isLoadingWebsites: boolean;
    websiteGenerationProgress: number;
    websiteGenerationStatus: string;
    websiteGenerationEstimatedTime?: number;
    saveDraftToStorage: () => void;
    hasDraft: boolean;
    loadDraftFromStorage: () => BeleidsscanDraft | null;
    restoreDraft: () => void;
    cancelWebsiteGeneration?: () => void;
}
export declare function Step1QueryConfiguration({ showStep1Info, setShowStep1Info, overheidslagen, gemeenten, waterschappen, provincies, rijksorganisaties, isLoadingJurisdictions, handleGenerateWebsites, getCharacterCounterColor, isLoadingWebsites, websiteGenerationProgress, websiteGenerationStatus, websiteGenerationEstimatedTime, saveDraftToStorage, hasDraft, loadDraftFromStorage, restoreDraft, }: Step1QueryConfigurationProps): import("react/jsx-runtime").JSX.Element;
export {};
