import { ResourceThresholdService } from '../monitoring/ResourceThresholdService.js';
import { logger } from '../../utils/logger.js';

/**
 * Background job service for automatically evaluating and applying threshold schedules
 * Runs every minute to check if any schedule should be active and applies thresholds accordingly
 */
export class ThresholdScheduleJob {
    private thresholdService: ResourceThresholdService;
    private intervalId: NodeJS.Timeout | null = null;
    private readonly CHECK_INTERVAL_MS = 60 * 1000; // Check every minute
    private lastActiveScheduleId: string | null = null;

    constructor(thresholdService: ResourceThresholdService) {
        this.thresholdService = thresholdService;
    }

    /**
     * Start the background job
     */
    start(): void {
        if (this.intervalId) {
            logger.warn('ThresholdScheduleJob already running');
            return;
        }

        logger.info('Starting threshold schedule evaluation job...');
        
        // Run immediately on start
        this.evaluateAndApplySchedules().catch((error) => {
            logger.error({ err: error }, 'Error in initial evaluation');
        });

        // Then run every minute
        this.intervalId = setInterval(() => {
            this.evaluateAndApplySchedules().catch((error) => {
                logger.error({ err: error }, 'Error evaluating schedules');
            });
        }, this.CHECK_INTERVAL_MS);

        logger.info('ThresholdScheduleJob background job started (checking every minute)');
    }

    /**
     * Stop the background job
     */
    stop(): void {
        if (this.intervalId) {
            clearInterval(this.intervalId);
            this.intervalId = null;
            logger.info('ThresholdScheduleJob background job stopped');
        }
    }

    /**
     * Evaluate active schedules and apply thresholds if needed
     */
    private async evaluateAndApplySchedules(): Promise<void> {
        try {
            const activeSchedule = await this.thresholdService.getActiveSchedule();
            const currentThresholds = await this.thresholdService.getThresholds();

            // Check if we need to apply a schedule
            if (activeSchedule) {
                // Check if this is a different schedule than the last one we applied
                if (this.lastActiveScheduleId !== activeSchedule.id) {
                    logger.info(
                        {
                            scheduleName: activeSchedule.name,
                            timeRange: activeSchedule.timeRange
                        },
                        `Applying schedule: ${activeSchedule.name} (${activeSchedule.timeRange.start} - ${activeSchedule.timeRange.end})`
                    );
                    
                    // Apply scheduled thresholds
                    await this.thresholdService.updateThresholds(
                        activeSchedule.thresholds,
                        'system',
                        `Active schedule: ${activeSchedule.name}`
                    );

                    this.lastActiveScheduleId = activeSchedule.id;
                    logger.info('Schedule applied successfully');
                }
                // If same schedule, thresholds are already applied, no action needed
            } else {
                // No active schedule - check if we need to restore original thresholds
                if (this.lastActiveScheduleId !== null) {
                    logger.info('No active schedule, checking if thresholds need restoration...');
                    
                    // Check if current thresholds match a schedule (indicating we're still using scheduled thresholds)
                    const schedules = await this.thresholdService.listSchedules(true);
                    const matchingSchedule = schedules.find(s => {
                        // Check if current thresholds match this schedule's thresholds
                        const scheduleThresholds = s.thresholds;
                        return Object.keys(scheduleThresholds).every(key => {
                            const scheduleValue = scheduleThresholds[key as keyof typeof scheduleThresholds];
                            const currentValue = currentThresholds[key as keyof typeof currentThresholds];
                            return scheduleValue === currentValue;
                        });
                    });

                    // If no matching schedule, we might need to restore defaults
                    // But we'll be conservative and only log - actual restoration should be manual
                    // to avoid overwriting manual threshold changes
                    if (!matchingSchedule) {
                        logger.info('Schedule ended, but thresholds may have been manually changed. Skipping auto-restore.');
                    }

                    this.lastActiveScheduleId = null;
                }
            }
        } catch (error) {
            logger.error({ err: error }, 'Error evaluating schedules');
            // Don't throw - we want the job to continue running
        }
    }
}
