import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Search, BookOpen } from 'lucide-react';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '../components/ui/tabs';
import { SearchPage } from './SearchPage';
import { LibraryPage } from './LibraryPage';

export function SearchPageWrapper() {
    const [searchParams, setSearchParams] = useSearchParams();
    const tabParam = searchParams.get('tab');
    const [activeTab, setActiveTab] = useState(tabParam === 'bibliotheek' ? 'bibliotheek' : 'zoeken');
    
    // Update active tab when URL param changes
    useEffect(() => {
        if (tabParam === 'bibliotheek') {
            setActiveTab('bibliotheek');
        }
    }, [tabParam]);
    
    // Update URL when tab changes
    const handleTabChange = (value: string) => {
        setActiveTab(value);
        if (value === 'bibliotheek') {
            setSearchParams(prev => {
                const newParams = new URLSearchParams(prev);
                newParams.set('tab', 'bibliotheek');
                return newParams;
            });
        } else {
            setSearchParams(prev => {
                const newParams = new URLSearchParams(prev);
                newParams.delete('tab');
                return newParams;
            });
        }
    };

    return (
        <div className="w-full">
            <Tabs value={activeTab} onValueChange={handleTabChange} className="w-full">
                <div className="container mx-auto px-6 pt-6 max-w-7xl">
                    <TabsList className="mb-0">
                        <TabsTrigger value="zoeken">
                            <Search className="w-4 h-4 mr-2" />
                            Zoeken
                        </TabsTrigger>
                        <TabsTrigger value="bibliotheek">
                            <BookOpen className="w-4 h-4 mr-2" />
                            Bibliotheek
                        </TabsTrigger>
                    </TabsList>
                </div>

                <TabsContent value="zoeken" className="mt-0">
                    <SearchPage />
                </TabsContent>

                <TabsContent value="bibliotheek" className="mt-0">
                    <LibraryPage />
                </TabsContent>
            </Tabs>
        </div>
    );
}

