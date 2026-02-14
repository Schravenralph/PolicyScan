/**
 * Search Examples Component
 * 
 * Displays example searches to help users learn how to use the search functionality.
 */

import { Search } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import type { JurisdictionLevel } from '../../pages/SearchPage';

interface SearchExamplesProps {
    onExampleSelect: (example: {
        topic: string;
        location: string;
        jurisdiction: JurisdictionLevel;
    }) => void;
}

export function SearchExamples({ onExampleSelect }: SearchExamplesProps) {
    const examples = [
        {
            topic: 'arbeidsmigranten',
            location: 'Horst aan de Maas',
            jurisdiction: 'municipal' as JurisdictionLevel,
            label: '"arbeidsmigranten in Horst aan de Maas"',
            description: 'Zoek naar beleid over arbeidsmigranten in een specifieke gemeente',
        },
        {
            topic: 'omgevingsvisie',
            location: '',
            jurisdiction: 'all' as JurisdictionLevel,
            label: '"omgevingsvisie"',
            description: 'Zoek naar omgevingsvisies van alle overheden',
        },
        {
            topic: 'klimaatadaptatie',
            location: '',
            jurisdiction: 'provincial' as JurisdictionLevel,
            label: '"klimaatadaptatie" op provinciaal niveau',
            description: 'Filter op bestuurslaag om gerichter te zoeken',
        },
        {
            topic: 'woningbouw',
            location: 'Amsterdam',
            jurisdiction: 'municipal' as JurisdictionLevel,
            label: '"woningbouw in Amsterdam"',
            description: 'Combineer onderwerp en locatie voor specifieke resultaten',
        },
    ];

    return (
        <Card className="mb-8">
            <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                    <Search className="h-5 w-5" />
                    Zoekvoorbeelden
                </CardTitle>
                <CardDescription>
                    Klik op een voorbeeld om de zoekopdracht in te vullen en te leren hoe je zoekt.
                </CardDescription>
            </CardHeader>
            <CardContent>
                <div className="grid gap-3 md:grid-cols-2">
                    {examples.map((example, index) => (
                        <button
                            key={index}
                            type="button"
                            onClick={() => onExampleSelect({
                                topic: example.topic,
                                location: example.location,
                                jurisdiction: example.jurisdiction,
                            })}
                            className="text-left p-4 border border-gray-200 rounded-lg hover:bg-blue-50 hover:border-blue-300 transition-all group focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 outline-none"
                            aria-label={`Zoekvoorbeeld: ${example.label}`}
                        >
                            <div className="font-medium text-gray-900 group-hover:text-blue-700">
                                {example.label}
                            </div>
                            <div className="text-sm text-gray-600 mt-1">
                                {example.description}
                            </div>
                        </button>
                    ))}
                </div>
                <div className="mt-4 p-3 bg-blue-50 rounded-lg border border-blue-200">
                    <p className="text-sm text-blue-900">
                        <strong>Tip:</strong> Gebruik filters om je zoekresultaten te verfijnen. Je kunt zoeken op onderwerp alleen, of combineren met locatie en bestuurslaag voor meer gerichte resultaten.
                    </p>
                </div>
            </CardContent>
        </Card>
    );
}
