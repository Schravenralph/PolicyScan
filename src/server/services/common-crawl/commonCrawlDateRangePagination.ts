/**
 * Common Crawl Date Range Pagination
 * 
 * Implements pagination by splitting crawl period into date ranges.
 * This is necessary because Common Crawl CDX API doesn't support offset pagination.
 */

import axios from 'axios';

export interface DateRange {
    from: string; // YYYYMMDD format
    to: string;   // YYYYMMDD format
}

interface CrawlMetadata {
    id: string;
    name: string;
    timegate: string;
    startDate: string; // YYYYMMDD
    endDate: string;   // YYYYMMDD
}

/**
 * Get crawl metadata including date range
 */
export async function getCrawlMetadata(crawlId: string): Promise<CrawlMetadata | null> {
    try {
        // Fetch crawl info from Common Crawl
        const response = await axios.get('https://index.commoncrawl.org/collinfo.json', {
            timeout: 10000,
        });

        interface CommonCrawlItem {
            id: string;
            name: string;
            timegate: string;
            'cdx-api': string;
            from?: string;
            to?: string;
        }

        const crawls = response.data as CommonCrawlItem[];

        const crawl = crawls.find(c => c.id === crawlId);
        if (!crawl) {
            return null;
        }

        // Try to get actual dates from crawl metadata
        // Some crawls have 'from' and 'to' fields
        let startDate: string;
        let endDate: string;

        if (crawl.from && crawl.to) {
            // Use actual dates from API
            const fromDate = new Date(crawl.from);
            const toDate = new Date(crawl.to);
            startDate = formatDate(fromDate);
            endDate = formatDate(toDate);
        } else {
            // Fallback: estimate from crawl ID pattern
            const match = crawlId.match(/CC-MAIN-(\d{4})-(\d+)/);
            if (!match) {
                return null;
            }

            const year = parseInt(match[1], 10);
            const week = parseInt(match[2], 10);
            startDate = estimateStartDate(year, week);
            endDate = estimateEndDate(year, week);
        }

        return {
            id: crawlId,
            name: crawl.name,
            timegate: crawl.timegate,
            startDate,
            endDate,
        };
    } catch (error) {
        console.error('[Date Range Pagination] Error fetching crawl metadata:', error);
        return null;
    }
}

/**
 * Estimate start date from crawl ID
 */
function estimateStartDate(year: number, week: number): string {
    // Rough estimate: crawl starts around week number
    // This is approximate - actual dates may vary
    const startOfYear = new Date(year, 0, 1);
    const daysOffset = (week - 1) * 7;
    const date = new Date(startOfYear);
    date.setDate(date.getDate() + daysOffset);
    
    return formatDate(date);
}

/**
 * Estimate end date from crawl ID
 */
function estimateEndDate(year: number, week: number): string {
    // Estimate: crawl ends ~3 months after start
    const startDate = estimateStartDate(year, week);
    const date = parseDate(startDate);
    date.setMonth(date.getMonth() + 3);
    
    return formatDate(date);
}

/**
 * Split date range into batches
 */
export function splitDateRangeIntoBatches(
    startDate: string,
    endDate: string,
    totalBatches: number
): DateRange[] {
    const start = parseDate(startDate);
    const end = parseDate(endDate);
    const totalDays = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
    const daysPerBatch = Math.ceil(totalDays / totalBatches);

    const batches: DateRange[] = [];
    let currentDate = new Date(start);

    for (let i = 0; i < totalBatches; i++) {
        const batchStart = new Date(currentDate);
        const batchEnd = new Date(currentDate);
        batchEnd.setDate(batchEnd.getDate() + daysPerBatch);

        // Don't exceed end date
        if (batchEnd > end) {
            batchEnd.setTime(end.getTime());
        }

        batches.push({
            from: formatDate(batchStart),
            to: formatDate(batchEnd),
        });

        currentDate = new Date(batchEnd);
        currentDate.setDate(currentDate.getDate() + 1); // Start next batch day after

        // Stop if we've reached the end
        if (batchEnd >= end) {
            break;
        }
    }

    return batches;
}

/**
 * Format date as YYYYMMDD
 */
function formatDate(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}${month}${day}`;
}

/**
 * Parse YYYYMMDD date string
 */
function parseDate(dateStr: string): Date {
    const year = parseInt(dateStr.substring(0, 4), 10);
    const month = parseInt(dateStr.substring(4, 6), 10) - 1;
    const day = parseInt(dateStr.substring(6, 8), 10);
    return new Date(year, month, day);
}

/**
 * Generate date ranges for batch loading
 */
export async function generateBatchDateRanges(
    crawlId: string,
    totalBatches: number
): Promise<DateRange[]> {
    const metadata = await getCrawlMetadata(crawlId);
    
    if (!metadata) {
        throw new Error(`Could not get metadata for crawl ${crawlId}`);
    }

    return splitDateRangeIntoBatches(
        metadata.startDate,
        metadata.endDate,
        totalBatches
    );
}

