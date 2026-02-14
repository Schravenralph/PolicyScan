/**
 * Constants for Beleidsscan component
 */
import { Building2 } from 'lucide-react';
import type { WebsiteType } from './types';
export declare const SELECTED_WEBSITES_KEY_PREFIX = "beleidsscan_selected_websites_";
export declare const dutchCollator: Intl.Collator;
export declare const rijksorganisaties: string[];
export interface OverheidslaagConfig {
    id: WebsiteType;
    label: string;
    icon: typeof Building2;
    color: string;
}
export declare const overheidslagen: OverheidslaagConfig[];
