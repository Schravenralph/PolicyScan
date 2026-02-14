/**
 * Constants for Beleidsscan component
 */

import { Building2, Droplets, Map as MapIcon, Landmark, Sparkles } from 'lucide-react';
import type { WebsiteType } from './types';
import { OVERHEIDSLAAG_COLORS } from '../../constants/colors';

export const SELECTED_WEBSITES_KEY_PREFIX = 'beleidsscan_selected_websites_';

export const dutchCollator = new Intl.Collator('nl', { sensitivity: 'base', numeric: true });

export const rijksorganisaties = [
  'Kadaster',
  'Ministerie van Binnenlandse Zaken en Koninkrijksrelaties',
  'Ministerie van Economische Zaken en Klimaat',
  'Ministerie van Infrastructuur en Waterstaat',
  'Ministerie van Landbouw, Natuur en Voedselkwaliteit',
  'Rijkswaterstaat',
  'RIVM',
].sort((a, b) => dutchCollator.compare(a, b));

export interface OverheidslaagConfig {
  id: WebsiteType;
  label: string;
  icon: typeof Building2;
  color: string;
}

export const overheidslagen: OverheidslaagConfig[] = [
  { id: 'gemeente' as WebsiteType, label: 'Gemeente', icon: Building2, color: OVERHEIDSLAAG_COLORS.gemeente },
  { id: 'waterschap' as WebsiteType, label: 'Waterschap', icon: Droplets, color: OVERHEIDSLAAG_COLORS.waterschap },
  { id: 'provincie' as WebsiteType, label: 'Provincie', icon: MapIcon, color: OVERHEIDSLAAG_COLORS.provincie },
  { id: 'rijk' as WebsiteType, label: 'Rijksoverheid', icon: Landmark, color: OVERHEIDSLAAG_COLORS.rijk },
  { id: 'kennisinstituut' as WebsiteType, label: 'Kennisinstituut', icon: Sparkles, color: OVERHEIDSLAAG_COLORS.kennisinstituut }
];

