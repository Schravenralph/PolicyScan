/**
 * Empty State Component
 *
 * Reusable component for displaying empty states with guidance and suggestions.
 */
import { LucideIcon } from 'lucide-react';
export interface EmptyStateAction {
    label: string;
    onClick: () => void;
    variant?: 'default' | 'outline' | 'ghost';
    icon?: LucideIcon;
}
export interface EmptyStateProps {
    icon?: LucideIcon;
    title: string;
    message: string;
    guidance?: string[];
    suggestions?: string[];
    actions?: EmptyStateAction[];
    severity?: 'info' | 'warning' | 'error';
}
export declare function EmptyState({ icon: Icon, title, message, guidance, suggestions, actions, severity, }: EmptyStateProps): import("react/jsx-runtime").JSX.Element;
