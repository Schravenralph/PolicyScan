/**
 * Graph Health Banner Component
 *
 * Displays health status banner for the navigation graph,
 * including warnings, recommendations, and action buttons.
 */
import type { GraphHealthResponse } from '../../services/api';
interface GraphHealthBannerProps {
    graphHealth: GraphHealthResponse;
    onDismiss: () => void;
}
export declare function GraphHealthBanner({ graphHealth, onDismiss }: GraphHealthBannerProps): import("react/jsx-runtime").JSX.Element;
export {};
