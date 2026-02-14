import { BaseApiService } from './BaseApiService';
import { getApiBaseUrl } from '../../utils/apiUrl';

export interface SustainabilityMetrics {
  startDate: string;
  endDate: string;
  apiCallsAvoided: number;
  co2Savings: number;
  energyCostSavings: number;
  cacheHitRate: number;
  cacheHits: number;
  cacheMisses: number;
  totalCacheRequests: number;
  costSavings: number;
  totalAPICalls: number;
  totalTokens: number;
  totalCO2Emitted: number;
  totalCost: number;
}

export interface SustainabilityKPI {
  name: string;
  value: number;
  unit: string;
  target?: number;
  trend?: 'up' | 'down' | 'stable';
  description: string;
}

export class SustainabilityApiService extends BaseApiService {
  /**
   * Get sustainability metrics for a time period
   */
  async getMetrics(
    startDate?: Date,
    endDate?: Date
  ): Promise<SustainabilityMetrics> {
    const params = new URLSearchParams();
    if (startDate) params.append('startDate', startDate.toISOString());
    if (endDate) params.append('endDate', endDate.toISOString());
    
    return this.get<SustainabilityMetrics>(`/sustainability/metrics?${params.toString()}`);
  }

  /**
   * Get sustainability KPIs
   */
  async getKPIs(
    startDate?: Date,
    endDate?: Date,
    baselineStartDate?: Date,
    baselineEndDate?: Date
  ): Promise<SustainabilityKPI[]> {
    const params = new URLSearchParams();
    if (startDate) params.append('startDate', startDate.toISOString());
    if (endDate) params.append('endDate', endDate.toISOString());
    if (baselineStartDate) params.append('baselineStartDate', baselineStartDate.toISOString());
    if (baselineEndDate) params.append('baselineEndDate', baselineEndDate.toISOString());
    
    return this.get<SustainabilityKPI[]>(`/sustainability/kpis?${params.toString()}`);
  }

  /**
   * Download sustainability report
   */
  async downloadReport(
    format: 'json' | 'csv' | 'pdf',
    startDate?: Date,
    endDate?: Date,
    includeBaseline?: boolean,
    baselineStartDate?: Date,
    baselineEndDate?: Date
  ): Promise<void> {
    const params = new URLSearchParams();
    params.append('format', format);
    if (startDate) params.append('startDate', startDate.toISOString());
    if (endDate) params.append('endDate', endDate.toISOString());
    if (includeBaseline) params.append('includeBaseline', 'true');
    if (baselineStartDate) params.append('baselineStartDate', baselineStartDate.toISOString());
    if (baselineEndDate) params.append('baselineEndDate', baselineEndDate.toISOString());
    
    const token = this.getAuthToken();
    const apiUrl = `${getApiBaseUrl()}/sustainability/report?${params.toString()}`;
    
    const response = await fetch(apiUrl, {
      method: 'GET',
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      credentials: 'include',
    });
    
    if (!response.ok) {
      throw new Error(`Failed to download report: ${response.statusText}`);
    }
    
    const blob = await response.blob();
    
    // Create download link
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const extension = format === 'pdf' ? 'pdf' : format === 'csv' ? 'csv' : 'json';
    a.download = `sustainability-report.${extension}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
  }
}

