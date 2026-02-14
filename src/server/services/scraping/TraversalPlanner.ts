/**
 * Traversal Planner
 * Plans BFS/DFS traversal paths for adaptive scraping
 */

import { PrioritizedLink } from './LinkPrioritizer.js';
import { logger } from '../../utils/logger.js';

export type TraversalStrategy = 'bfs' | 'dfs' | 'hybrid';

export interface TraversalPath {
  url: string;
  depth: number;
  priority: number;
  parentUrl?: string;
  path: string[]; // Full path from root to this URL
}

export interface TraversalPlan {
  paths: TraversalPath[];
  strategy: TraversalStrategy;
  maxDepth: number;
  totalLinks: number;
}

export interface TraversalOptions {
  strategy?: TraversalStrategy;
  maxDepth?: number;
  maxLinks?: number;
  earlyTerminationThreshold?: number; // Stop exploring paths below this score
  bfsBreadthLimit?: number; // Max links per level in BFS
}

/**
 * Service for planning traversal paths
 */
export class TraversalPlanner {
  private defaultMaxDepth = 3;
  private defaultMaxLinks = 200;
  private defaultEarlyTerminationThreshold = 0.3;
  private defaultBfsBreadthLimit = 20;

  /**
   * Plan traversal paths from prioritized links
   */
  planTraversal(
    prioritizedLinks: PrioritizedLink[],
    rootUrl?: string,
    options: TraversalOptions = {}
  ): TraversalPlan {
    const {
      strategy = 'hybrid',
      maxDepth = this.defaultMaxDepth,
      maxLinks = this.defaultMaxLinks,
      earlyTerminationThreshold = this.defaultEarlyTerminationThreshold,
      bfsBreadthLimit = this.defaultBfsBreadthLimit,
    } = options;

    let paths: TraversalPath[] = [];

    switch (strategy) {
      case 'bfs':
        paths = this.planBFS(
          prioritizedLinks,
          rootUrl,
          maxDepth,
          maxLinks,
          earlyTerminationThreshold,
          bfsBreadthLimit
        );
        break;
      case 'dfs':
        paths = this.planDFS(
          prioritizedLinks,
          rootUrl,
          maxDepth,
          maxLinks,
          earlyTerminationThreshold
        );
        break;
      case 'hybrid':
        paths = this.planHybrid(
          prioritizedLinks,
          rootUrl,
          maxDepth,
          maxLinks,
          earlyTerminationThreshold,
          bfsBreadthLimit
        );
        break;
    }

    return {
      paths: paths.slice(0, maxLinks),
      strategy,
      maxDepth,
      totalLinks: paths.length,
    };
  }

  /**
   * Plan BFS traversal (breadth-first)
   */
  private planBFS(
    prioritizedLinks: PrioritizedLink[],
    rootUrl: string | undefined,
    maxDepth: number,
    maxLinks: number,
    earlyTerminationThreshold: number,
    breadthLimit: number
  ): TraversalPath[] {
    const paths: TraversalPath[] = [];
    const visited = new Set<string>();
    const queue: TraversalPath[] = [];

    // Initialize with root or high-priority links
    if (rootUrl) {
      queue.push({
        url: rootUrl,
        depth: 0,
        priority: 1.0,
        path: [rootUrl],
      });
      visited.add(rootUrl);
    }

    // Add high-priority links as starting points
    const highPriorityLinks = prioritizedLinks
      .filter(link => link.priority === 'high')
      .slice(0, breadthLimit);
    
    for (const link of highPriorityLinks) {
      if (!visited.has(link.url)) {
        queue.push({
          url: link.url,
          depth: 0,
          priority: link.score,
          path: [link.url],
        });
        visited.add(link.url);
      }
    }

    // Process queue level by level
    while (queue.length > 0 && paths.length < maxLinks) {
      const current = queue.shift()!;
      
      // Early termination for low-priority paths
      if (current.priority < earlyTerminationThreshold && current.depth > 0) {
        continue;
      }

      paths.push(current);

      // Don't expand beyond max depth
      if (current.depth >= maxDepth) {
        continue;
      }

      // Find children (links that could be reached from current URL)
      const children = this.findChildren(
        prioritizedLinks,
        current.url,
        visited,
        breadthLimit
      );

      for (const child of children) {
        if (!visited.has(child.url)) {
          queue.push({
            url: child.url,
            depth: current.depth + 1,
            priority: child.score,
            parentUrl: current.url,
            path: [...current.path, child.url],
          });
          visited.add(child.url);
        }
      }
    }

    return paths;
  }

  /**
   * Plan DFS traversal (depth-first)
   */
  private planDFS(
    prioritizedLinks: PrioritizedLink[],
    rootUrl: string | undefined,
    maxDepth: number,
    maxLinks: number,
    earlyTerminationThreshold: number
  ): TraversalPath[] {
    const paths: TraversalPath[] = [];
    const visited = new Set<string>();
    const stack: TraversalPath[] = [];

    // Initialize with root or high-priority links
    if (rootUrl) {
      stack.push({
        url: rootUrl,
        depth: 0,
        priority: 1.0,
        path: [rootUrl],
      });
      visited.add(rootUrl);
    }

    // Add high-priority links as starting points
    const highPriorityLinks = prioritizedLinks
      .filter(link => link.priority === 'high')
      .slice(0, 10); // Start with top 10
    
    for (const link of highPriorityLinks) {
      if (!visited.has(link.url)) {
        stack.push({
          url: link.url,
          depth: 0,
          priority: link.score,
          path: [link.url],
        });
        visited.add(link.url);
      }
    }

    // Process stack (depth-first)
    while (stack.length > 0 && paths.length < maxLinks) {
      const current = stack.pop()!;
      
      // Early termination for low-priority paths
      if (current.priority < earlyTerminationThreshold && current.depth > 0) {
        continue;
      }

      paths.push(current);

      // Don't expand beyond max depth
      if (current.depth >= maxDepth) {
        continue;
      }

      // Find children and add to stack (highest priority first)
      const children = this.findChildren(
        prioritizedLinks,
        current.url,
        visited,
        10 // Limit children per node in DFS
      );

      // Add children in reverse order (so highest priority is popped first)
      for (let i = children.length - 1; i >= 0; i--) {
        const child = children[i];
        if (!visited.has(child.url)) {
          stack.push({
            url: child.url,
            depth: current.depth + 1,
            priority: child.score,
            parentUrl: current.url,
            path: [...current.path, child.url],
          });
          visited.add(child.url);
        }
      }
    }

    return paths;
  }

  /**
   * Plan hybrid traversal (BFS for discovery, DFS for depth)
   */
  private planHybrid(
    prioritizedLinks: PrioritizedLink[],
    rootUrl: string | undefined,
    maxDepth: number,
    maxLinks: number,
    earlyTerminationThreshold: number,
    breadthLimit: number
  ): TraversalPath[] {
    // Use BFS for first 2 levels (discovery)
    const bfsPaths = this.planBFS(
      prioritizedLinks,
      rootUrl,
      2, // First 2 levels with BFS
      Math.floor(maxLinks * 0.6), // 60% of links from BFS
      earlyTerminationThreshold,
      breadthLimit
    );

    // Use DFS for deeper exploration (depth)
    const remainingLinks = maxLinks - bfsPaths.length;
    const dfsStartingPoints = bfsPaths
      .filter(path => path.depth === 2 && path.priority >= 0.5)
      .slice(0, 10);

    const dfsPaths: TraversalPath[] = [];
    const visited = new Set(bfsPaths.map(p => p.url));

    for (const start of dfsStartingPoints) {
      const dfsFromStart = this.planDFS(
        prioritizedLinks,
        start.url,
        maxDepth - 2, // Remaining depth
        Math.floor(remainingLinks / dfsStartingPoints.length),
        earlyTerminationThreshold
      );

      // Adjust depths and paths
      for (const path of dfsFromStart) {
        if (!visited.has(path.url)) {
          dfsPaths.push({
            ...path,
            depth: path.depth + 2, // Adjust for BFS levels
            path: [...start.path, ...path.path.slice(1)], // Combine paths
          });
          visited.add(path.url);
        }
      }
    }

    return [...bfsPaths, ...dfsPaths].slice(0, maxLinks);
  }

  /**
   * Find children links for a given URL
   * This is a simplified version - in practice, you'd use the navigation graph
   */
  private findChildren(
    prioritizedLinks: PrioritizedLink[],
    parentUrl: string,
    visited: Set<string>,
    limit: number
  ): PrioritizedLink[] {
    // Extract domain from parent URL
    try {
      const parentDomain = new URL(parentUrl).hostname;
      
      // Find links that:
      // 1. Are on the same domain
      // 2. Haven't been visited
      // 3. Could logically be children (same domain, different path)
      const children = prioritizedLinks
        .filter(link => {
          try {
            const linkDomain = new URL(link.url).hostname;
            return (
              linkDomain === parentDomain &&
              !visited.has(link.url) &&
              link.url !== parentUrl
            );
          } catch {
            return false;
          }
        })
        .sort((a, b) => b.score - a.score)
        .slice(0, limit);

      return children;
    } catch {
      return [];
    }
  }
}

