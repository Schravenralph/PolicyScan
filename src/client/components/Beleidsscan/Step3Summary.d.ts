/**
 * Step3 Summary Component
 *
 * Displays scan summary with query details.
 */
import type { CanonicalDocument } from '../../services/api';
import type { LightweightDocument } from '../../utils/documentStateOptimization';
interface OverheidslaagConfig {
    id: 'gemeente' | 'waterschap' | 'provincie' | 'rijk' | 'kennisinstituut';
    label: string;
}
interface Step3SummaryProps {
    overheidslagen: OverheidslaagConfig[];
    overheidslaag: 'gemeente' | 'waterschap' | 'provincie' | 'rijk' | 'kennisinstituut' | '';
    selectedEntity: string;
    onderwerp: string;
    selectedWebsites: string[];
    documents: (CanonicalDocument | LightweightDocument)[];
}
declare function Step3SummaryComponent({ overheidslagen, overheidslaag, selectedEntity, onderwerp, selectedWebsites, documents, }: Step3SummaryProps): import("react/jsx-runtime").JSX.Element;
export declare const Step3Summary: import("react").MemoExoticComponent<typeof Step3SummaryComponent>;
export {};
