import React from 'react';
import {
    Breadcrumb,
    BreadcrumbList,
    BreadcrumbItem,
    BreadcrumbLink,
    BreadcrumbPage,
    BreadcrumbSeparator,
} from './ui/breadcrumb';
import { HierarchyLevel } from '../../shared/types';

export interface HierarchyBreadcrumbItem {
    id: string;
    name: string;
    level: HierarchyLevel;
    url?: string;
}

interface HierarchyBreadcrumbProps {
    items: HierarchyBreadcrumbItem[];
    onItemClick?: (item: HierarchyBreadcrumbItem) => void;
    className?: string;
}

const levelLabels: Record<HierarchyLevel, string> = {
    municipality: 'Gemeente',
    province: 'Provincie',
    national: 'Nationaal',
    european: 'Europees',
};

export function HierarchyBreadcrumb({ items, onItemClick, className }: HierarchyBreadcrumbProps) {
    if (items.length === 0) {
        return null;
    }

    return (
        <Breadcrumb className={className}>
            <BreadcrumbList>
                {items.map((item, index) => {
                    const isLast = index === items.length - 1;
                    const label = `${levelLabels[item.level]}: ${item.name}`;

                    return (
                        <React.Fragment key={item.id}>
                            <BreadcrumbItem>
                                {isLast ? (
                                    <BreadcrumbPage>{label}</BreadcrumbPage>
                                ) : (
                                    <BreadcrumbLink
                                        href={item.url || '#'}
                                        onClick={(e) => {
                                            if (onItemClick && !item.url) {
                                                e.preventDefault();
                                                onItemClick(item);
                                            }
                                        }}
                                    >
                                        {label}
                                    </BreadcrumbLink>
                                )}
                            </BreadcrumbItem>
                            {!isLast && <BreadcrumbSeparator />}
                        </React.Fragment>
                    );
                })}
            </BreadcrumbList>
        </Breadcrumb>
    );
}




















