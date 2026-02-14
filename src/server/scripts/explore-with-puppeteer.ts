/**
 * Enhanced Website Explorer with Puppeteer
 * 
 * Explores websites using Puppeteer (for JS-rendered content)
 * and builds a graph of link relationships with selectors
 */

import puppeteer, { Browser, Page } from 'puppeteer';
import { writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import {
    WebsiteGraph,
    WebsiteNode,
    LinkGroup,
    LinkTarget,
    cssToXPath,
    serializeGraph
} from '../services/graphs/navigation/WebsiteGraph.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const SCRAPING_DATA_DIR = join(__dirname, '../../scraping-data');

class WebsiteExplorer {
    private browser: Browser | null = null;
    private graph: WebsiteGraph;
    private visitedUrls: Set<string> = new Set();
    private maxDepth: number;
    private maxConcurrentPages: number = 2; // Limit concurrent pages
    private activePagesCount: number = 0;

    constructor(rootUrl: string, maxDepth: number = 1) {
        this.maxDepth = maxDepth;
        this.graph = {
            rootUrl,
            explored: new Map(),
            pending: new Set([rootUrl]),
            metadata: {
                startTime: new Date().toISOString(),
                lastUpdate: new Date().toISOString(),
                totalNodes: 0,
                totalLinks: 0
            }
        };
    }

    async init() {
        console.log('🚀 Launching Puppeteer browser...');
        this.browser = await puppeteer.launch({
            headless: true,
            // Container-safe args to prevent crashes
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage', // Overcome limited shared memory in containers
                '--disable-gpu',
                '--disable-software-rasterizer',
                '--disable-extensions',
                '--max-old-space-size=400', // Limit V8 heap to 400MB per Chrome instance
            ],
            // Limit resources
            timeout: 30000,
        });

        // Graceful shutdown handlers
        const cleanup = async () => {
            console.log('\n⚠️  Received shutdown signal, closing browser...');
            await this.close();
            process.exit(0);
        };

        process.on('SIGINT', cleanup);
        process.on('SIGTERM', cleanup);
    }

    async explorePage(url: string, depth: number = 0): Promise<WebsiteNode> {
        if (!this.browser) throw new Error('Browser not initialized');
        if (this.visitedUrls.has(url)) {
            return this.graph.explored.get(url)!;
        }

        // Wait if too many pages are open
        while (this.activePagesCount >= this.maxConcurrentPages) {
            await new Promise(resolve => setTimeout(resolve, 500));
        }

        console.log(`\n${'  '.repeat(depth)}🔍 Exploring [depth=${depth}]: ${url}`);
        this.visitedUrls.add(url);

        this.activePagesCount++;
        const page = await this.browser.newPage();

        // Set page resource limits
        await page.setDefaultNavigationTimeout(30000);
        await page.setDefaultTimeout(30000);

        const startTime = Date.now();

        try {
            // Navigate with JavaScript enabled
            await page.goto(url, {
                waitUntil: 'networkidle2',
                timeout: 30000
            });

            const responseTime = Date.now() - startTime;

            // Take screenshot
            const screenshotPath = join(
                SCRAPING_DATA_DIR,
                'screenshots',
                `${this.sanitizeFilename(url)}.png`
            );
            await page.screenshot({ path: screenshotPath, fullPage: false });
            console.log(`${'  '.repeat(depth)}📸 Screenshot saved: ${screenshotPath}`);

            // Get page title
            const title = await page.title();

            // Analyze links
            const linkGroups = await this.analyzeLinks(page, url, depth);

            const node: WebsiteNode = {
                url,
                title,
                timestamp: new Date().toISOString(),
                status: 'explored',
                metadata: {
                    hasJavaScript: await this.checkJavaScript(page),
                    requiresPuppeteer: true,
                    responseTime,
                    statusCode: 200
                },
                links: linkGroups
            };

            this.graph.explored.set(url, node);
            this.graph.pending.delete(url);
            this.graph.metadata.totalNodes++;
            this.graph.metadata.totalLinks += linkGroups.reduce((sum, g) => sum + g.count, 0);

            console.log(`${'  '.repeat(depth)}✅ Found: ${title}`);
            console.log(`${'  '.repeat(depth)}   Links: ${linkGroups.length} groups, ${linkGroups.reduce((s, g) => s + g.count, 0)} total`);

            await page.close();
            this.activePagesCount--;
            return node;

        } catch (error: unknown) {
            const errorMsg = error instanceof Error ? error.message : String(error);
            console.error(`${'  '.repeat(depth)}❌ Error: ${errorMsg}`);

            const errorNode: WebsiteNode = {
                url,
                title: 'Error',
                timestamp: new Date().toISOString(),
                status: 'error',
                metadata: {
                    hasJavaScript: false,
                    requiresPuppeteer: true,
                    responseTime: Date.now() - startTime,
                    statusCode: 0
                },
                links: [],
                error: error instanceof Error ? error.message : String(error)
            };

            this.graph.explored.set(url, errorNode);
            this.graph.pending.delete(url);

            await page.close();
            this.activePagesCount--;
            return errorNode;
        }
    }

    private async analyzeLinks(page: Page, baseUrl: string, depth: number): Promise<LinkGroup[]> {
        const linkPatterns = [
            { type: 'document' as const, css: 'a[href*="document"]', desc: 'Document links' },
            { type: 'pdf' as const, css: 'a[href$=".pdf"], a[href*=".pdf"]', desc: 'PDF links' },
            { type: 'navigation' as const, css: 'a[href*="beleid"]', desc: 'Policy/Beleid links' },
            { type: 'navigation' as const, css: 'a[href*="publicatie"]', desc: 'Publication links' },
            { type: 'external' as const, css: 'a[href^="http"]:not([href*="' + new URL(baseUrl).hostname + '"])', desc: 'External links' },
        ];

        const groups: LinkGroup[] = [];

        for (const pattern of linkPatterns) {
            try {
                const elements = await page.$$(pattern.css);

                if (elements.length === 0) continue;

                const samples: LinkTarget[] = [];

                // Get first 5 samples
                for (let i = 0; i < Math.min(5, elements.length); i++) {
                    const el = elements[i];
                    const href = await (el.evaluate as (fn: (node: unknown) => string) => Promise<string>)((node: unknown) => (node as HTMLAnchorElement).href);
                    const text = await (el.evaluate as (fn: (node: unknown) => string) => Promise<string>)((node: unknown) => (node as HTMLElement).textContent?.trim() || '');

                    samples.push({ url: href, text });

                    // Add to pending if within depth and same domain
                    if (depth < this.maxDepth && this.isSameDomain(href, baseUrl) && !this.visitedUrls.has(href)) {
                        this.graph.pending.add(href);
                    }
                }

                groups.push({
                    type: pattern.type,
                    description: pattern.desc,
                    selectors: {
                        css: pattern.css,
                        xpath: cssToXPath(pattern.css)
                    },
                    count: elements.length,
                    samples
                });

            } catch (_error) {
                // Skip patterns that don't work
            }
        }

        return groups;
    }

    private async checkJavaScript(page: Page): Promise<boolean> {
        try {
            const hasReact = await page.evaluate(() => {
                interface WindowWithReact {
                    React?: unknown;
                }
                return !!(window as unknown as WindowWithReact).React ||
                    !!document.querySelector('[data-reactroot]') ||
                    !!document.querySelector('[data-react-id]');
            });

            const hasVue = await page.evaluate(() => {
                interface WindowWithVue {
                    Vue?: unknown;
                }
                return !!(window as unknown as WindowWithVue).Vue || !!document.querySelector('[data-v-]');
            });

            return hasReact || hasVue;
        } catch {
            return false;
        }
    }

    private isSameDomain(url: string, baseUrl: string): boolean {
        try {
            return new URL(url).hostname === new URL(baseUrl).hostname;
        } catch {
            return false;
        }
    }

    private sanitizeFilename(url: string): string {
        return url.replace(/[^a-zA-Z0-9]/g, '_').substring(0, 100);
    }

    async exploreWithDepth() {
        await this.init();

        try {
            // Explore root first
            await this.explorePage(this.graph.rootUrl, 0);

            // Explore pending URLs up to maxDepth
            let currentDepth = 1;
            while (currentDepth <= this.maxDepth && this.graph.pending.size > 0) {
                const urlsAtThisDepth = Array.from(this.graph.pending);
                console.log(`\n📊 Depth ${currentDepth}: ${urlsAtThisDepth.length} URLs to explore`);

                for (const url of urlsAtThisDepth.slice(0, 5)) { // Limit to 5 per depth
                    if (!this.visitedUrls.has(url)) {
                        await this.explorePage(url, currentDepth);
                        // Small delay between requests
                        await new Promise(resolve => setTimeout(resolve, 1000));
                    }
                }

                currentDepth++;
            }

            // Save graph
            this.saveGraph();
            this.printSummary();

        } finally {
            await this.close();
        }
    }

    private saveGraph() {
        this.graph.metadata.lastUpdate = new Date().toISOString();

        const graphPath = join(
            SCRAPING_DATA_DIR,
            'graphs',
            `${this.sanitizeFilename(this.graph.rootUrl)}.json`
        );

        writeFileSync(graphPath, serializeGraph(this.graph));
        console.log(`\n💾 Graph saved to: ${graphPath}`);
    }

    private printSummary() {
        console.log('\n' + '='.repeat(80));
        console.log('📊 Exploration Summary');
        console.log('='.repeat(80));
        console.log(`Root URL: ${this.graph.rootUrl}`);
        console.log(`Total nodes explored: ${this.graph.metadata.totalNodes}`);
        console.log(`Total links found: ${this.graph.metadata.totalLinks}`);
        console.log(`Pending URLs: ${this.graph.pending.size}`);

        console.log('\n📈 Link Type Distribution:');
        const typeCount: Record<string, number> = {};

        for (const [_url, node] of this.graph.explored) {
            for (const group of node.links) {
                typeCount[group.type] = (typeCount[group.type] || 0) + group.count;
            }
        }

        for (const [type, count] of Object.entries(typeCount)) {
            console.log(`  ${type}: ${count}`);
        }
    }

    async close() {
        if (this.browser) {
            await this.browser.close();
            console.log('\n🏁 Browser closed');
        }
    }
}

// Main execution
async function main() {
    const sitesToExplore = [
        { url: 'https://iplo.nl/thema/bouw/', depth: 1 },
        { url: 'https://iplo.nl/thema/klimaat/', depth: 1 },
        { url: 'https://www.rijksoverheid.nl', depth: 1 },
        { url: 'https://www.officielebekendmakingen.nl', depth: 1 },
    ];

    for (const { url, depth } of sitesToExplore) {
        console.log(`\n${'='.repeat(80)}`);
        console.log(`Starting exploration: ${url} (max depth: ${depth})`);
        console.log('='.repeat(80));

        const explorer = new WebsiteExplorer(url, depth);
        await explorer.exploreWithDepth();

        // Wait between sites
        await new Promise(resolve => setTimeout(resolve, 3000));
    }

    console.log('\n✅ All explorations complete!');
    console.log(`📁 Results saved to: ${SCRAPING_DATA_DIR}/`);
}

main().catch(console.error);
