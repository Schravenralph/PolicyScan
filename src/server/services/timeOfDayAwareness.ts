/**
 * Time-of-Day Awareness Service
 * 
 * Optional feature to avoid peak hours (9am-5pm CET) for large scraping operations
 * as per US-011 acceptance criteria
 */

export interface TimeOfDayConfig {
    enabled: boolean;
    peakHoursStart: number; // Hour of day (0-23) in CET
    peakHoursEnd: number; // Hour of day (0-23) in CET
    avoidWeekends: boolean; // Whether to avoid weekends for large operations
}

export class TimeOfDayAwareness {
    private config: TimeOfDayConfig;

    constructor(config?: Partial<TimeOfDayConfig>) {
        this.config = {
            enabled: config?.enabled ?? process.env.AVOID_PEAK_HOURS === 'true',
            peakHoursStart: config?.peakHoursStart ?? 9, // 9am CET
            peakHoursEnd: config?.peakHoursEnd ?? 17, // 5pm CET
            avoidWeekends: config?.avoidWeekends ?? false
        };
    }

    /**
     * Check if current time is within peak hours
     */
    isPeakHours(): boolean {
        if (!this.config.enabled) {
            return false;
        }

        const now = new Date();
        const cetTime = this.toCET(now);
        const hour = cetTime.getHours();
        const dayOfWeek = cetTime.getDay(); // 0 = Sunday, 6 = Saturday

        // Check if it's a weekend and we should avoid weekends
        if (this.config.avoidWeekends && (dayOfWeek === 0 || dayOfWeek === 6)) {
            return true; // Treat weekends as peak hours
        }

        // Check if within peak hours
        return hour >= this.config.peakHoursStart && hour < this.config.peakHoursEnd;
    }

    /**
     * Get recommended delay before starting a large scraping operation
     * Returns 0 if it's safe to proceed, or milliseconds to wait
     */
    getRecommendedDelay(): number {
        if (!this.config.enabled) {
            return 0;
        }

        if (!this.isPeakHours()) {
            return 0; // Safe to proceed
        }

        // Calculate time until peak hours end
        const now = new Date();
        const cetTime = this.toCET(now);
        const hour = cetTime.getHours();
        const minutes = cetTime.getMinutes();
        const seconds = cetTime.getSeconds();

        // Calculate milliseconds until peak hours end
        const currentMinutes = hour * 60 + minutes + seconds / 60;
        const peakEndMinutes = this.config.peakHoursEnd * 60;
        const minutesUntilPeakEnd = peakEndMinutes - currentMinutes;

        if (minutesUntilPeakEnd <= 0) {
            return 0; // Peak hours already ended (shouldn't happen, but safety check)
        }

        return minutesUntilPeakEnd * 60 * 1000; // Convert to milliseconds
    }

    /**
     * Check if it's recommended to proceed with a large scraping operation
     */
    shouldProceedWithLargeOperation(): boolean {
        if (!this.config.enabled) {
            return true;
        }

        return !this.isPeakHours();
    }

    /**
     * Get a human-readable message about current time status
     */
    getStatusMessage(): string {
        if (!this.config.enabled) {
            return 'Time-of-day awareness is disabled';
        }

        if (this.isPeakHours()) {
            const delay = this.getRecommendedDelay();
            const hours = Math.floor(delay / (60 * 60 * 1000));
            const minutes = Math.floor((delay % (60 * 60 * 1000)) / (60 * 1000));
            return `Currently in peak hours. Recommended delay: ${hours}h ${minutes}m`;
        }

        return 'Outside peak hours - safe to proceed';
    }

    /**
     * Convert UTC time to CET (Central European Time)
     * Note: This is a simplified version. For production, use a proper timezone library
     */
    private toCET(date: Date): Date {
        // CET is UTC+1 in winter, UTC+2 in summer (CEST)
        // Simplified: assume CEST (UTC+2) for summer months (March-October)
        const month = date.getUTCMonth();
        const isSummer = month >= 2 && month <= 9; // March (2) to October (9)
        const offset = isSummer ? 2 : 1;

        const cetDate = new Date(date);
        cetDate.setUTCHours(cetDate.getUTCHours() + offset);
        return cetDate;
    }

    /**
     * Wait until peak hours end (if currently in peak hours)
     */
    async waitIfPeakHours(): Promise<void> {
        if (!this.config.enabled) {
            return;
        }

        const delay = this.getRecommendedDelay();
        if (delay > 0) {
            console.log(`⏰ Waiting ${Math.round(delay / 1000 / 60)} minutes until peak hours end...`);
            await new Promise(resolve => setTimeout(resolve, delay));
        }
    }
}

// Singleton instance
export const timeOfDayAwareness = new TimeOfDayAwareness();

