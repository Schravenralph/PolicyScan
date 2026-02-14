/**
 * Cycle Detection for Graph Traversal
 * Prevents infinite loops during graph traversal by tracking visited nodes
 */

export class CycleDetector {
    private visited: Set<string> = new Set();
    private currentPath: string[] = [];

    /**
     * Check if a node would create a cycle in the current path
     * @param nodeId The node ID to check
     * @returns true if adding this node would create a cycle
     */
    wouldCreateCycle(nodeId: string): boolean {
        return this.currentPath.includes(nodeId);
    }

    /**
     * Mark a node as visited in the current path
     * @param nodeId The node ID to mark
     */
    visit(nodeId: string): void {
        this.visited.add(nodeId);
        this.currentPath.push(nodeId);
    }

    /**
     * Unvisit a node (backtrack)
     * @param nodeId The node ID to unvisit
     */
    unvisit(_nodeId: string): void {
        this.currentPath.pop();
    }

    /**
     * Check if a node has been visited in the current traversal
     * @param nodeId The node ID to check
     * @returns true if the node has been visited
     */
    isVisited(nodeId: string): boolean {
        return this.visited.has(nodeId);
    }

    /**
     * Reset the cycle detector for a new traversal
     */
    reset(): void {
        this.visited.clear();
        this.currentPath = [];
    }

    /**
     * Get the current path (for debugging)
     */
    getCurrentPath(): string[] {
        return [...this.currentPath];
    }
}

