import React from 'react';
import type { SustainabilityMetrics, SustainabilityKPI } from '../../services/api';
interface FeatureDashboardProps {
    title: string;
    description: string;
    icon: React.ReactNode;
    featureKey: string;
    colorScheme: {
        primary: string;
        secondary: string;
        accent: string;
    };
    getMetrics: (startDate: Date, endDate: Date) => Promise<SustainabilityMetrics>;
    getKPIs: (startDate: Date, endDate: Date) => Promise<SustainabilityKPI[]>;
    customMetrics?: React.ReactNode;
}
export declare function FeatureDashboard({ title, description, icon, featureKey: _featureKey, colorScheme, getMetrics, getKPIs, customMetrics, }: FeatureDashboardProps): import("react/jsx-runtime").JSX.Element;
export {};
