import { BaseLogEntry } from '../types/logTypes.js';
import { combinedSemanticSimilarity } from './semanticSimilarity.js';

interface ClusterConfig {
  maxClusterSize?: number; // Maximum logs to cluster together (default: 50 for higher-level overview)
  minClusterSize?: number; // Minimum logs needed to cluster (default: 1 - always cluster)
  dropInvalid?: boolean; // Whether to drop logs missing required fields (default: true)
}

function normalizeTimestamp(timestamp?: Date | string): Date | string {
  if (!timestamp) return new Date();
  if (timestamp instanceof Date) return timestamp;
  const parsed = new Date(timestamp);
  return isNaN(parsed.getTime()) ? timestamp : parsed;
}

function sanitizeLogs(logs: BaseLogEntry[], dropInvalid: boolean): BaseLogEntry[] {
  const normalizedLogs = logs.map(log => {
    const message = (log?.message ?? '').trim();
    const formattedMessage = (log?.formattedMessage ?? message).trim();
    const timestamp = normalizeTimestamp(
      (log as BaseLogEntry | { timestamp?: Date | string }).timestamp
    );

    return {
      ...log,
      message,
      formattedMessage,
      timestamp
    };
  });

  if (!dropInvalid) {
    return normalizedLogs;
  }

  return normalizedLogs.filter(log => log.id && log.message.length > 0);
}

/**
 * Clusters logs semantically by grouping similar activities and operations.
 * Groups logs with similar message patterns, thought bubbles, or activity types
 * into a single entry with multiple thoughts.
 * 
 * Uses semantic similarity instead of time-based windows to create
 * human-readable chunks that represent logical operations.
 */
export function clusterLogs(
  logs: BaseLogEntry[],
  config: ClusterConfig = {}
): BaseLogEntry[] {
  const {
    maxClusterSize = 50, // Much larger clusters for higher-level overview
    minClusterSize = 1,  // Always cluster, even single logs can be grouped
    dropInvalid = true   // Filter out logs missing id/message/timestamp
  } = config;

  const sanitizedLogs = sanitizeLogs(logs, dropInvalid);

  if (sanitizedLogs.length === 0) return [];

  const clustered: BaseLogEntry[] = [];
  let currentCluster: BaseLogEntry[] = [];
  let clusterSemanticKey: string | null = null;
  let clusterCounter = 0; // Sequential counter for cluster IDs to prevent recursive nesting

  /**
   * Extracts a semantic key from a log that represents its activity type.
   * Logs with the same semantic key should be grouped together.
   */
  const getSemanticKey = (log: BaseLogEntry): string => {
    // Use formattedMessage (English) for semantic key extraction, not thoughtBubble (Dutch)
    // formattedMessage is in English and contains the activity type
    const msg = (log.formattedMessage || log.message || '').toLowerCase();
    
    // Extract activity type from message patterns - prioritize exact matches
    // These patterns match English formattedMessage text
    const activityPatterns = [
      { pattern: /^crawling:/i, key: 'crawling-urls' }, // Specific pattern for "Crawling: URL"
      { pattern: /crawling|crawl/i, key: 'crawling' },
      { pattern: /processing|process/i, key: 'processing' },
      { pattern: /analyzing|analysis/i, key: 'analyzing' },
      { pattern: /fetching|fetch|retrieving/i, key: 'fetching' },
      { pattern: /loading|load/i, key: 'loading' },
      { pattern: /scanning|scan/i, key: 'scanning' },
      { pattern: /checking|check/i, key: 'checking' },
      { pattern: /updating|update/i, key: 'updating' },
      { pattern: /merging|merge/i, key: 'merging' },
      { pattern: /exploring|explore/i, key: 'exploring' },
      { pattern: /starting|start/i, key: 'starting' },
      { pattern: /completed|complete/i, key: 'completed' },
    ];
    
    // Find matching activity pattern in formattedMessage (English)
    for (const { pattern, key } of activityPatterns) {
      if (pattern.test(msg)) {
        return key;
      }
    }
    
    // Extract object type (what is being processed) from formattedMessage
    const objectPatterns = [
      { pattern: /document/i, key: 'document' },
      { pattern: /url|link|page/i, key: 'url' },
      { pattern: /site|website|domain/i, key: 'site' },
      { pattern: /graph|node/i, key: 'graph' },
      { pattern: /query|search/i, key: 'query' },
    ];
    
    for (const { pattern, key } of objectPatterns) {
      if (pattern.test(msg)) {
        return key;
      }
    }
    
    // Fallback: use first few words of formattedMessage as semantic key
    const words = msg.split(/\s+/).filter((w: string) => w.length > 3).slice(0, 3);
    return words.join('-') || 'other';
  };

  // Build context corpus from all logs for better IDF calculation in BM25
  // Include both formattedMessage (English) and thoughtBubble (Dutch) for multilingual corpus
  const contextCorpus = sanitizedLogs.map(log => [
    log.formattedMessage || log.message, 
    log.thoughtBubble
  ].filter(Boolean).join(' '));

  /**
   * Determines if two logs are semantically similar and should be clustered.
   * Uses BM25-based semantic similarity for better NLP-based matching.
   * Made VERY aggressive to create higher-level overview with slower progression.
   */
  const areSemanticallySimilar = (log1: BaseLogEntry, log2: BaseLogEntry): boolean => {
    // Same semantic key = same activity type - always cluster
    const key1 = getSemanticKey(log1);
    const key2 = getSemanticKey(log2);
    
    if (key1 === key2) {
      return true;
    }
    
    // Combine formattedMessage (English) and thoughtBubble (Dutch) for BM25 semantic matching
    // formattedMessage is in English and contains activity type
    // thoughtBubble is in Dutch and contains reasoning
    // BM25 handles both languages through tokenization
    const text1 = [
      log1.formattedMessage || log1.message, 
      log1.thoughtBubble
    ].filter(Boolean).join(' ');
    const text2 = [
      log2.formattedMessage || log2.message, 
      log2.thoughtBubble
    ].filter(Boolean).join(' ');
    
    // Use BM25-based semantic similarity with context corpus
    // BM25 tokenization handles both English and Dutch text
    const similarityScore = combinedSemanticSimilarity(text1, text2, contextCorpus);
    
    // Threshold for clustering (lower = more aggressive clustering)
    // 0.3 means ~30% semantic similarity is enough to cluster
    const SIMILARITY_THRESHOLD = 0.3;
    
    if (similarityScore >= SIMILARITY_THRESHOLD) {
      return true;
    }
    
    // Fallback: Check if messages contain the SAME specific items (URLs, documents, etc.)
    // Only cluster if they're working on the same items, not just any items
    const items1 = extractItemsFromMessage(log1.message);
    const items2 = extractItemsFromMessage(log2.message);
    
    // If both have items AND they share at least one common item, cluster them
    if (items1.length > 0 && items2.length > 0) {
      const commonItems = items1.filter(item => items2.includes(item));
      if (commonItems.length > 0) {
        return true; // Same items being processed - cluster them
      }
    }
    
    // Don't cluster just because both have thought bubbles - that's too aggressive
    // Thought bubbles should only cluster if they're semantically similar (checked above)
    
    return false;
  };

  const finalizeCluster = () => {
    if (currentCluster.length === 0) return;
    
    // Always cluster - minClusterSize is 1, so we always create clusters
    // This creates higher-level overview with slower progression
    if (currentCluster.length >= minClusterSize) {
      // Create a clustered log entry
      const firstLog = currentCluster[0];
      // lastLog not used, only firstLog is needed
      
      // Extract items being processed (URLs, documents, etc.) and create full-sentence one-liner thoughts
      const oneLinerThoughts: string[] = [];
      const extractedItems: string[] = [];
      
      // First pass: extract all items from all logs and map them to their activities/thoughts
      const itemActivityMap = new Map<string, { activity: string; thought: string | null }>(); // item -> {activity, thought}
      
      currentCluster.forEach(log => {
        const items = extractItemsFromMessage(log.message);
        const activityType = getActivityTypeFromMessage(log.message);
        
        // Get a descriptive activity phrase and thought
        let activityPhrase = activityType.toLowerCase();
        let thoughtBubbleText: string | null = null;
        
        if (log.thoughtBubble) {
          // Use thought bubble as the activity description
          thoughtBubbleText = log.thoughtBubble
            .split('\n')[0] // Take first line
            .replace(/\.$/, '') // Remove trailing period
            .trim();
          activityPhrase = thoughtBubbleText ? thoughtBubbleText.toLowerCase() : '';
        } else {
          // Create activity phrase from message
          const baseActivity = extractActivityFromMessage(log.message, true);
          if (baseActivity) {
            activityPhrase = baseActivity.toLowerCase();
          }
        }
        
        // Map each item to its activity and thought
        items.forEach(item => {
          if (item && item.length > 0) {
            extractedItems.push(item);
            // Store the activity phrase and thought for this item (use first one found)
            if (!itemActivityMap.has(item)) {
              itemActivityMap.set(item, { activity: activityPhrase, thought: thoughtBubbleText });
            }
          }
        });
      });
      
      // Second pass: create full-sentence thoughts
      if (extractedItems.length > 0) {
        // Create full-sentence thoughts combining activity + item
        const uniqueItems = Array.from(new Set(extractedItems));
        uniqueItems.forEach(item => {
          const itemData = itemActivityMap.get(item) || { activity: 'processing', thought: null };
          const { activity: activityPhrase, thought: thoughtBubbleText } = itemData;
          const itemType = getItemType(item);
          
          // Create a natural full sentence thought
          let thought = '';
          
          // Special handling for "Crawling: URL" pattern - create simple thoughts
          const isCrawlingPattern = activityPhrase.includes('crawl') || activityPhrase.includes('crawling');
          
          if (isCrawlingPattern && itemType === 'URL') {
            // For crawling URLs, create simple one-liners
            thought = `Crawling ${item}`;
          } else if (thoughtBubbleText && thoughtBubbleText.length > 0) {
            // If we have a thought bubble, try to incorporate it naturally
            thought = thoughtBubbleText;
            // If the thought doesn't mention the item, append it
            if (!thought.toLowerCase().includes(item.toLowerCase())) {
              // Try to insert the item naturally into the thought
              if (itemType === 'URL') {
                thought = `${thought} at ${item}`;
              } else {
                thought = `${thought}: ${item}`;
              }
            }
          } else {
            // Create a sentence from activity + item
            if (itemType === 'URL') {
              // For URLs, create sentences like "Fetching content from https://..."
              if (activityPhrase.includes('fetch') || activityPhrase.includes('ophaal')) {
                thought = `Fetching content from ${item}`;
              } else if (activityPhrase.includes('analys') || activityPhrase.includes('analyze')) {
                thought = `Analyzing page at ${item}`;
              } else if (activityPhrase.includes('explor') || activityPhrase.includes('verkenn')) {
                thought = `Exploring ${item}`;
              } else if (activityPhrase.includes('scan') || activityPhrase.includes('scannen')) {
                thought = `Scanning ${item}`;
              } else {
                thought = `${activityPhrase.charAt(0).toUpperCase() + activityPhrase.slice(1)} ${item}`;
              }
            } else if (itemType === 'document') {
              // For documents, create sentences like "Processing document: filename.pdf"
              thought = `Processing document: ${item}`;
            } else {
              // For other items, use the activity phrase
              thought = `${activityPhrase.charAt(0).toUpperCase() + activityPhrase.slice(1)} ${item}`;
            }
          }
          
          // Ensure it ends with proper punctuation if it doesn't already
          if (!thought.match(/[.!?]$/)) {
            thought += '.';
          }
          
          if (thought && !oneLinerThoughts.includes(thought)) {
            oneLinerThoughts.push(thought);
          }
        });
      } else {
        // Fallback: use activity descriptions from messages/thoughts
        currentCluster.forEach(log => {
          let activity = '';
          
          if (log.thoughtBubble) {
            // Use thought bubble if available, but make it a one-liner
            activity = log.thoughtBubble
              .split('\n')[0] // Take first line
              .replace(/\.$/, '') // Remove trailing period
              .trim();
          } else if (log.message) {
            // Extract activity from message
            activity = extractActivityFromMessage(log.message, false);
          }
          
          if (activity && !oneLinerThoughts.includes(activity)) {
            oneLinerThoughts.push(activity);
          }
        });
      }
      
      // Create summary message
      const count = currentCluster.length;
      let summaryMessage = firstLog.message;
      
      // Special handling for "Crawling: URL" pattern - always create summary
      const isCrawlingPattern = /^crawling:/i.test(firstLog.message);
      
      if (count > 1 || isCrawlingPattern) {
        // If we have extracted items, create a better summary
        if (extractedItems.length > 0) {
          const uniqueItems = Array.from(new Set(extractedItems));
          const activityType = getActivityTypeFromMessage(firstLog.message);
          
          if (isCrawlingPattern) {
            // For crawling, create a simple summary
            summaryMessage = `Crawling ${uniqueItems.length} URL${uniqueItems.length > 1 ? 's' : ''}`;
          } else {
            summaryMessage = `${activityType} ${uniqueItems.length} ${getItemType(uniqueItems[0])}${uniqueItems.length > 1 ? 's' : ''}`;
          }
        } else {
          // Try to create a more descriptive summary
          const messages = currentCluster.map(log => log.message);
          const commonWords = findCommonWords(messages);
          
          if (commonWords.length > 0) {
            summaryMessage = `${commonWords.join(' ')} (${count} items)`;
          } else if (isCrawlingPattern) {
            summaryMessage = `Crawling ${count} URL${count > 1 ? 's' : ''}`;
          } else {
            summaryMessage = `${firstLog.message} (+${count - 1} more)`;
          }
        }
      }
      
      // Combine one-liner thoughts
      const combinedThought = oneLinerThoughts.length > 0 
        ? oneLinerThoughts.join('\n')
        : undefined;
      
      // Use sequential cluster ID to prevent recursive nesting and exponential growth
      // Extract first original log ID (remove cluster- prefix if present) for reference
      const extractFirstOriginalId = (logId: string): string => {
        // If ID starts with "cluster-", try to extract the first original ID
        if (logId.startsWith('cluster-')) {
          const withoutPrefix = logId.substring(8); // Remove "cluster-" prefix
          // Split by '-' and find first part that's not "cluster"
          const parts = withoutPrefix.split('-');
          for (const part of parts) {
            if (part && !part.startsWith('cluster')) {
              return part.substring(0, 20); // Truncate to 20 chars max
            }
          }
          // Fallback: use first part truncated
          return parts[0]?.substring(0, 20) || 'log';
        }
        // Not a cluster ID, use as-is but truncate
        return logId.substring(0, 20);
      };
      
      clusterCounter++;
      const firstOriginalId = extractFirstOriginalId(firstLog.id);
      
      // Create compact cluster ID: cluster-{counter}-{firstOriginalId} (max 50 chars total)
      // This prevents exponential growth from recursive clustering
      const clusterId = `cluster-${clusterCounter}-${firstOriginalId}`.substring(0, 50);
      
      clustered.push({
        id: clusterId,
        timestamp: firstLog.timestamp,
        message: summaryMessage,
        formattedMessage: summaryMessage,
        thoughtBubble: combinedThought,
        level: firstLog.level || 'info',
        isComplete: currentCluster.every(log => log.isComplete),
        icon: firstLog.icon || '🤖',
        color: firstLog.color || 'text-blue-400'
      });
    } else {
      // Single log or small cluster - add individually for immediate visibility
      clustered.push(...currentCluster);
    }
    
    currentCluster = [];
    clusterSemanticKey = null;
  };

  for (let i = 0; i < sanitizedLogs.length; i++) {
    const log = sanitizedLogs[i];
    const logSemanticKey = getSemanticKey(log);
    
    if (currentCluster.length === 0) {
      // Start new cluster
      currentCluster.push(log);
      clusterSemanticKey = logSemanticKey;
    } else if (currentCluster.length < maxClusterSize) {
      // Check if this log is semantically similar to ANY log in the cluster (not just last one)
      const isSimilar = currentCluster.some(clusterLog => areSemanticallySimilar(clusterLog, log));
      
      // Only cluster if semantic keys match exactly - don't cluster different activity types
      // This prevents merging logs from different workflow steps
      const keysMatch = logSemanticKey === clusterSemanticKey;
      
      if (isSimilar && keysMatch) {
        // Semantically similar AND same activity type - add to current cluster
        currentCluster.push(log);
        // Update semantic key if it's more specific
        if (logSemanticKey !== 'other' && clusterSemanticKey === 'other') {
          clusterSemanticKey = logSemanticKey;
        }
      } else {
        // Different semantic type or not similar - finalize current cluster and start new one
        finalizeCluster();
        currentCluster.push(log);
        clusterSemanticKey = logSemanticKey;
      }
    } else {
      // Cluster is full, finalize it
      finalizeCluster();
      currentCluster.push(log);
      clusterSemanticKey = logSemanticKey;
    }
  }
  
  // Finalize any remaining cluster
  finalizeCluster();
  
  return clustered;
}

/**
 * Extracts specific items (URLs, documents, etc.) from a log message
 */
function extractItemsFromMessage(message: string): string[] {
  const items: string[] = [];
  
  // Extract URLs
  const urlPattern = /(https?:\/\/[^\s)]+|www\.[^\s)]+)/gi;
  const urls = message.match(urlPattern);
  if (urls) {
    items.push(...urls.map(url => url.trim()));
  }
  
  // Extract quoted strings (often document names, URLs, etc.)
  const quotedPattern = /["']([^"']+)["']/g;
  let match;
  while ((match = quotedPattern.exec(message)) !== null) {
    const item = match[1].trim();
    // Only add if it looks like a meaningful item (not just a word)
    if (item.length > 5 && (item.includes('/') || item.includes('.') || item.includes(' '))) {
      items.push(item);
    }
  }
  
  // Extract items after colons (e.g., "Fetching URL: https://...")
  const colonPattern = /:\s*([^\s,;]+(?:[^\s,;.]+)?)/g;
  while ((match = colonPattern.exec(message)) !== null) {
    const item = match[1].trim();
    if (item.length > 5 && !items.includes(item)) {
      items.push(item);
    }
  }
  
  return items;
}

/**
 * Gets the activity type from a message (e.g., "Fetching", "Processing")
 */
function getActivityTypeFromMessage(message: string): string {
  const msg = message.toLowerCase();
  if (msg.includes('fetching') || msg.includes('fetch')) return 'Fetching';
  if (msg.includes('processing') || msg.includes('process')) return 'Processing';
  if (msg.includes('analyzing') || msg.includes('analysis')) return 'Analyzing';
  if (msg.includes('scanning') || msg.includes('scan')) return 'Scanning';
  if (msg.includes('checking') || msg.includes('check')) return 'Checking';
  if (msg.includes('loading') || msg.includes('load')) return 'Loading';
  if (msg.includes('updating') || msg.includes('update')) return 'Updating';
  if (msg.includes('exploring') || msg.includes('explore')) return 'Exploring';
  if (msg.includes('crawling') || msg.includes('crawl')) return 'Crawling';
  return 'Processing';
}

/**
 * Gets the item type from an item string (e.g., "URL", "document")
 */
function getItemType(item: string): string {
  if (item.startsWith('http://') || item.startsWith('https://') || item.startsWith('www.')) {
    return 'URL';
  }
  if (item.includes('.pdf') || item.includes('.doc') || item.includes('.txt')) {
    return 'document';
  }
  if (item.includes('/')) {
    return 'URL';
  }
  return 'item';
}

/**
 * Extracts a one-liner activity description from a message
 */
function extractActivityFromMessage(message: string, removeItems: boolean = false): string {
  // Remove emojis and clean up
  let activity = message
    .replace(/[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1F600}-\u{1F64F}\u{1F680}-\u{1F6FF}\u{1F1E0}-\u{1F1FF}]/gu, '')
    .trim();
  
  // Remove specific items if requested (for generic activity description)
  if (removeItems) {
    const items = extractItemsFromMessage(activity);
    items.forEach(item => {
      activity = activity.replace(item, '').trim();
    });
    // Clean up extra spaces and punctuation
    activity = activity.replace(/\s+/g, ' ').replace(/[:\s]+$/, '').trim();
  }
  
  // Take first sentence or first 80 characters
  const firstSentence = activity.split(/[.!?]/)[0].trim();
  if (firstSentence.length > 0 && firstSentence.length <= 100) {
    return firstSentence;
  }
  
  // Fallback: take first 80 chars
  return activity.substring(0, 80).trim();
}

/**
 * Finds common words across multiple messages to create a summary
 */
function findCommonWords(messages: string[]): string[] {
  if (messages.length === 0) return [];
  
  // Extract words from each message
  const wordSets = messages.map(msg => {
    const words = msg.toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter(word => word.length > 3); // Only words longer than 3 chars
    return new Set(words);
  });
  
  // Find words that appear in at least 50% of messages
  const wordCounts = new Map<string, number>();
  wordSets.forEach(wordSet => {
    wordSet.forEach(word => {
      wordCounts.set(word, (wordCounts.get(word) || 0) + 1);
    });
  });
  
  const threshold = Math.ceil(messages.length * 0.5);
  const commonWords = Array.from(wordCounts.entries())
    .filter(([, count]) => count >= threshold)
    .map(([word]) => word)
    .slice(0, 3); // Take top 3 common words
  
  return commonWords;
}

