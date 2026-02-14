class TrieNode {
    children: Map<string, TrieNode> = new Map();
    isEndOfKey: boolean = false;
}

/**
 * specialized Prefix Trie for efficient key tracking and prefix-based retrieval
 * Used by TraversalCache to improve invalidation performance
 */
export class PrefixTrie {
    private root: TrieNode = new TrieNode();

    /**
     * Insert a key into the trie
     */
    insert(key: string): void {
        let node = this.root;
        for (const char of key) {
            if (!node.children.has(char)) {
                node.children.set(char, new TrieNode());
            }
            node = node.children.get(char)!;
        }
        node.isEndOfKey = true;
    }

    /**
     * Delete a key from the trie
     * Returns true if key was deleted (found and removed)
     */
    delete(key: string): boolean {
        return this.deleteRecursive(this.root, key, 0);
    }

    private deleteRecursive(node: TrieNode, key: string, index: number): boolean {
        if (index === key.length) {
            if (!node.isEndOfKey) {
                return false;
            }
            node.isEndOfKey = false;
            return node.children.size === 0;
        }

        const char = key[index];
        const child = node.children.get(char);
        if (!child) {
            return false;
        }

        const shouldDeleteChild = this.deleteRecursive(child, key, index + 1);

        if (shouldDeleteChild) {
            node.children.delete(char);
            return !node.isEndOfKey && node.children.size === 0;
        }

        return false;
    }

    /**
     * Find all keys starting with the given prefix
     */
    find(prefix: string): string[] {
        let node = this.root;
        for (const char of prefix) {
            const child = node.children.get(char);
            if (!child) {
                return [];
            }
            node = child;
        }

        const results: string[] = [];
        this.collectKeys(node, prefix, results);
        return results;
    }

    private collectKeys(node: TrieNode, currentPrefix: string, results: string[]): void {
        if (node.isEndOfKey) {
            results.push(currentPrefix);
        }

        for (const [char, child] of node.children.entries()) {
            this.collectKeys(child, currentPrefix + char, results);
        }
    }

    /**
     * Clear the trie
     */
    clear(): void {
        this.root = new TrieNode();
    }
}
