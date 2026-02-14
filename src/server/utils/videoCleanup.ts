import { join } from 'path';
import { readdirSync, statSync, unlinkSync, rmdirSync } from 'fs';
import { logger } from './logger.js';

interface CleanupStats {
  videosDeleted: number;
  directoriesRemoved: number;
  spaceFreed: number; // in bytes
  errors: number;
}

/**
 * Clean up test video files older than specified days
 * @param testResultsDir - Directory containing test results
 * @param maxAgeDays - Maximum age in days (default: 7 to prevent unbounded growth)
 * @param dryRun - If true, only report what would be deleted without actually deleting
 * @returns Statistics about the cleanup operation
 */
export async function cleanupOldVideos(
  testResultsDir: string = join(process.cwd(), 'test-results'),
  maxAgeDays: number = 7, // Default to 7 days to prevent unbounded growth
  dryRun: boolean = false
): Promise<CleanupStats> {
  const stats: CleanupStats = {
    videosDeleted: 0,
    directoriesRemoved: 0,
    spaceFreed: 0,
    errors: 0,
  };

  const maxAgeMs = maxAgeDays * 24 * 60 * 60 * 1000;
  const cutoffDate = Date.now() - maxAgeMs;

  logger.info({ testResultsDir, maxAgeDays, cutoffDate: new Date(cutoffDate).toISOString() }, 
    `Starting video cleanup (dryRun: ${dryRun})`);

  try {
    if (!statSync(testResultsDir).isDirectory()) {
      logger.warn({ testResultsDir }, 'Test results directory does not exist or is not a directory');
      return stats;
    }

    const deletedDirs = new Set<string>();

    // Recursively find and delete old video files
    // Returns true if the directory is empty (or became empty after cleanup)
    const processDirectory = (dir: string): boolean => {
      try {
        const entries = readdirSync(dir, { withFileTypes: true });
        let isEmpty = true;

        for (const entry of entries) {
          const fullPath = join(dir, entry.name);
          let entryDeleted = false;

          try {
            if (entry.isDirectory()) {
              // Recursively process subdirectories
              const subDirEmpty = processDirectory(fullPath);
              
              // After processing, check if directory is empty and can be removed
              if (subDirEmpty && !deletedDirs.has(fullPath)) {
                if (!dryRun) {
                  try {
                    rmdirSync(fullPath);
                    deletedDirs.add(fullPath);
                    stats.directoriesRemoved++;
                    logger.debug({ path: fullPath }, 'Removed empty directory');
                    entryDeleted = true;
                  } catch (err) {
                    // Directory might not be empty or might have been deleted already
                  }
                } else {
                  logger.debug({ path: fullPath }, '[DRY RUN] Would remove empty directory');
                  entryDeleted = true;
                }
              }
            } else if (entry.isFile()) {
              // Check if it's a video file
              const isVideo = entry.name.endsWith('.webm') || 
                             entry.name.endsWith('.mp4') || 
                             entry.name.endsWith('.avi') ||
                             entry.name.endsWith('.mov');

              if (isVideo) {
                const fileStats = statSync(fullPath);
                const fileAge = fileStats.mtimeMs;

                if (fileAge < cutoffDate) {
                  const fileSize = fileStats.size;
                  const ageDays = Math.floor((Date.now() - fileAge) / (24 * 60 * 60 * 1000));

                  if (!dryRun) {
                    try {
                      unlinkSync(fullPath);
                      stats.videosDeleted++;
                      stats.spaceFreed += fileSize;
                      logger.info(
                        { 
                          path: fullPath, 
                          ageDays, 
                          size: `${(fileSize / 1024 / 1024).toFixed(2)}MB` 
                        },
                        'Deleted old video file'
                      );
                      entryDeleted = true;
                    } catch (err) {
                      stats.errors++;
                      logger.error({ error: err, path: fullPath }, 'Failed to delete video file');
                    }
                  } else {
                    stats.videosDeleted++;
                    stats.spaceFreed += fileSize;
                    logger.info(
                      { 
                        path: fullPath, 
                        ageDays, 
                        size: `${(fileSize / 1024 / 1024).toFixed(2)}MB` 
                      },
                      '[DRY RUN] Would delete old video file'
                    );
                    entryDeleted = true;
                  }
                }
              }
            }
          } catch (err) {
            // Skip files/directories we can't access
            logger.debug({ error: err, path: fullPath }, 'Skipping entry due to error');
          }

          if (!entryDeleted) {
            isEmpty = false;
          }
        }

        return isEmpty;
      } catch (err) {
        logger.error({ error: err, dir }, 'Error processing directory');
        stats.errors++;
        return false;
      }
    };

    processDirectory(testResultsDir);

    const summary = {
      videosDeleted: stats.videosDeleted,
      directoriesRemoved: stats.directoriesRemoved,
      spaceFreedMB: (stats.spaceFreed / 1024 / 1024).toFixed(2),
      errors: stats.errors,
      dryRun,
    };

    if (dryRun) {
      logger.info(summary, '[DRY RUN] Video cleanup completed');
    } else {
      logger.info(summary, 'Video cleanup completed');
    }

    return stats;
  } catch (error) {
    logger.error({ error, testResultsDir }, 'Fatal error during video cleanup');
    stats.errors++;
    return stats;
  }
}

/**
 * Get statistics about video files in test-results directory
 */
export function getVideoStats(testResultsDir: string = join(process.cwd(), 'test-results')): {
  totalVideos: number;
  totalSize: number;
  oldestVideo: { path: string; age: number } | null;
  videosByAge: { [ageRange: string]: number };
} {
  const stats = {
    totalVideos: 0,
    totalSize: 0,
    oldestVideo: null as { path: string; age: number } | null,
    videosByAge: {
      '0-7 days': 0,
      '8-30 days': 0,
      '31-60 days': 0,
      '61+ days': 0,
    },
  };

  try {
    if (!statSync(testResultsDir).isDirectory()) {
      return stats;
    }

    const processDirectory = (dir: string): void => {
      try {
        const entries = readdirSync(dir, { withFileTypes: true });

        for (const entry of entries) {
          const fullPath = join(dir, entry.name);

          try {
            if (entry.isDirectory()) {
              processDirectory(fullPath);
            } else if (entry.isFile()) {
              const isVideo = entry.name.endsWith('.webm') || 
                             entry.name.endsWith('.mp4') || 
                             entry.name.endsWith('.avi') ||
                             entry.name.endsWith('.mov');

              if (isVideo) {
                const fileStats = statSync(fullPath);
                const fileAge = Date.now() - fileStats.mtimeMs;
                const ageDays = Math.floor(fileAge / (24 * 60 * 60 * 1000));

                stats.totalVideos++;
                stats.totalSize += fileStats.size;

                // Track oldest video
                if (!stats.oldestVideo || fileAge > stats.oldestVideo.age) {
                  stats.oldestVideo = {
                    path: fullPath,
                    age: fileAge,
                  };
                }

                // Categorize by age
                if (ageDays <= 7) {
                  stats.videosByAge['0-7 days']++;
                } else if (ageDays <= 30) {
                  stats.videosByAge['8-30 days']++;
                } else if (ageDays <= 60) {
                  stats.videosByAge['31-60 days']++;
                } else {
                  stats.videosByAge['61+ days']++;
                }
              }
            }
          } catch (err) {
            // Skip files we can't access
          }
        }
      } catch (err) {
        // Skip directories we can't access
      }
    };

    processDirectory(testResultsDir);
  } catch (error) {
    logger.error({ error, testResultsDir }, 'Error getting video stats');
  }

  return stats;
}

