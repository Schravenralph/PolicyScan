import { useState, useEffect } from 'react';
import { api } from '../services/api';
import { logError } from '../utils/errorHandler';
import { toast } from '../utils/toast';
import { getGemeenten } from '../utils/gemeenten';

export interface UseJurisdictionsReturn {
  gemeenten: string[];
  waterschappen: string[];
  provincies: string[];
  isLoading: boolean;
  error: string | null;
}

/**
 * Hook for loading jurisdictions (gemeenten, waterschappen, provincies) from the API.
 * Falls back to CSV file if API fails.
 * 
 * Loads jurisdictions on mount and provides loading state and error handling.
 * 
 * @returns Object containing jurisdictions arrays, loading state, and error
 * 
 * @example
 * ```typescript
 * const { gemeenten, waterschappen, provincies, isLoading, error } = useJurisdictions();
 * ```
 */
export function useJurisdictions(): UseJurisdictionsReturn {
  const [gemeenten, setGemeenten] = useState<string[]>([]);
  const [waterschappen, setWaterschappen] = useState<string[]>([]);
  const [provincies, setProvincies] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadJurisdictions = async () => {
      try {
        setIsLoading(true);
        setError(null);
        const data = await api.getJurisdictions();
        setGemeenten(data.municipalities);
        setWaterschappen(data.waterschappen);
        setProvincies(data.provincies);
        
        // Verify signature (optional client-side validation)
        // In production, you might want to verify the signature here
        // For now, we trust the backend signature validation
      } catch (err) {
        logError(err, 'load-jurisdictions');
        const errorMessage = 'Kon jurisdicties niet laden van de server';
        setError(errorMessage);
        toast.error('Fout bij laden jurisdicties', errorMessage);
        
        // Fallback to CSV file for municipalities
        try {
          const csvGemeenten = getGemeenten();
          if (csvGemeenten.length > 0) {
            setGemeenten(csvGemeenten);
            console.log(`[useJurisdictions] Using CSV fallback: ${csvGemeenten.length} municipalities loaded`);
          } else {
            setGemeenten([]);
          }
        } catch (csvErr) {
          logError(csvErr, 'load-jurisdictions-csv-fallback');
          setGemeenten([]);
        }
        
        // Keep empty arrays for waterschappen and provincies if API fails
        // These are hardcoded in the backend, so we can't fallback easily
        setWaterschappen([]);
        setProvincies([]);
      } finally {
        setIsLoading(false);
      }
    };
    
    loadJurisdictions();
  }, []);

  return {
    gemeenten,
    waterschappen,
    provincies,
    isLoading,
    error
  };
}

