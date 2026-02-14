/**
 * Type definitions for Beleidsscan component
 */
export interface BeleidsscanProps {
    onBack: () => void;
}
export type WebsiteType = 'gemeente' | 'waterschap' | 'provincie' | 'rijk' | 'kennisinstituut';
export type WorkflowDocumentApi = {
    _id: string;
    titel: string;
    url: string;
    website_url: string;
    website_titel: string;
    label?: string;
    samenvatting?: string;
    'relevantie voor zoekopdracht'?: string;
    type_document?: string;
    publicatiedatum?: string;
    subjects?: string[];
    themes?: string[];
    accepted?: boolean | null;
};
