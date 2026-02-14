/**
 * Website Structure Explorer
 * 
 * Fetches real pages from target websites and analyzes their structure
 * to inform scraper development with actual data
 */

import axios from 'axios';
import * as cheerio from 'cheerio';
import { writeFileSync } from 'fs';

interface ExplorationResult {
    url: string;
    status: number;
    title: string;
    selectors: {
        links: { selector: string; count: number; samples: string[] }[];
        headings: { selector: string; count: number; samples: string[] }[];
        forms: { selector: string; count: number }[];
    };
    documentLinks: string[];
    pdfLinks: string[];
}

async function exploreWebsite(url: string): Promise<ExplorationResult> {
    console.log(`\n🔍 Exploring: ${url}`);

    try {
        const response = await axios.get(url, {
            timeout: 10000,
            headers: {
                'User-Agent': 'Mozilla/5.0 (compatible; Beleidsscan/1.0)'
            }
        });

        const $ = cheerio.load(response.data);
        const title = $('title').text();

        console.log(`✅ Status ${response.status}: ${title}`);

        // Analyze link patterns
        const linkPatterns = [
            'a[href*="beleid"]',
            'a[href*="document"]',
            'a[href*="publicatie"]',
            'a[href*="regelgeving"]',
            'a[href*=".pdf"]',
            '.document-link',
            '.publication',
            'article a',
            '.content a'
        ];

        const linkAnalysis = linkPatterns.map(selector => {
            const elements = $(selector);
            const samples: string[] = [];
            elements.slice(0, 3).each((_, el) => {
                const href = $(el).attr('href');
                const text = $(el).text().trim();
                if (href) samples.push(`${text} -> ${href}`);
            });

            return {
                selector,
                count: elements.length,
                samples
            };
        }).filter(r => r.count > 0);

        // Analyze heading patterns
        const headingPatterns = ['h1', 'h2', 'h3', '.title', '.page-title'];
        const headingAnalysis = headingPatterns.map(selector => {
            const elements = $(selector);
            const samples: string[] = [];
            elements.slice(0, 3).each((_, el) => {
                samples.push($(el).text().trim());
            });

            return {
                selector,
                count: elements.length,
                samples
            };
        }).filter(r => r.count > 0);

        // Extract all PDF links
        const pdfLinks: string[] = [];
        $('a[href$=".pdf"], a[href*=".pdf"]').each((_, el) => {
            const href = $(el).attr('href');
            if (href) {
                const absoluteUrl = new URL(href, url).toString();
                pdfLinks.push(absoluteUrl);
            }
        });

        // Extract document-related links
        const documentLinks: string[] = [];
        $('a[href*="document"], a[href*="publicatie"], a[href*="beleid"]').each((_, el) => {
            const href = $(el).attr('href');
            if (href && !href.endsWith('.pdf')) {
                const absoluteUrl = new URL(href, url).toString();
                documentLinks.push(absoluteUrl);
            }
        });

        const result: ExplorationResult = {
            url,
            status: response.status,
            title,
            selectors: {
                links: linkAnalysis,
                headings: headingAnalysis,
                forms: []
            },
            documentLinks: documentLinks.slice(0, 10),
            pdfLinks: pdfLinks.slice(0, 10)
        };

        // Print summary
        console.log(`\n📊 Analysis:`);
        console.log(`  Title: ${title}`);
        console.log(`  PDF links found: ${pdfLinks.length}`);
        console.log(`  Document links found: ${documentLinks.length}`);
        console.log(`\n  Working selectors:`);
        linkAnalysis.forEach(({ selector, count, samples }) => {
            console.log(`    ${selector}: ${count} matches`);
            samples.forEach(s => console.log(`      - ${s.substring(0, 80)}`));
        });

        return result;

    } catch (error: unknown) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        console.error(`❌ Error: ${errorMsg}`);
        throw error;
    }
}

async function main() {
    console.log('🚀 Website Structure Exploration\n');
    console.log('='.repeat(80));

    const sitesToExplore = [
        // IPLO
        'https://iplo.nl/thema/klimaat/',
        'https://iplo.nl/thema/bouw/',
        'https://iplo.nl/zoeken/?q=duurzaamheid',

        // Rijksoverheid
        'https://www.rijksoverheid.nl/onderwerpen/klimaat-en-energie',
        'https://www.rijksoverheid.nl/zoeken?searchterm=duurzaamheid',

        // Example gemeente
        'https://www.amsterdam.nl',
        'https://www.rotterdam.nl',

        // Officiële Bekendmakingen
        'https://www.officielebekendmakingen.nl'
    ];

    const results: ExplorationResult[] = [];

    for (const url of sitesToExplore) {
        try {
            const result = await exploreWebsite(url);
            results.push(result);

            // Wait between requests
            await new Promise(resolve => setTimeout(resolve, 2000));
        } catch (_error) {
            console.log(`Skipping ${url} due to error\n`);
        }
    }

    // Save detailed results
    const report = {
        exploredAt: new Date().toISOString(),
        sites: results,
        summary: {
            totalSites: results.length,
            totalPDFs: results.reduce((sum, r) => sum + r.pdfLinks.length, 0),
            totalDocLinks: results.reduce((sum, r) => sum + r.documentLinks.length, 0)
        }
    };

    writeFileSync(
        'exploration-report.json',
        JSON.stringify(report, null, 2)
    );

    console.log('\n' + '='.repeat(80));
    console.log('📝 Exploration Report Summary:');
    console.log(`  Sites explored: ${report.summary.totalSites}`);
    console.log(`  PDFs found: ${report.summary.totalPDFs}`);
    console.log(`  Document links found: ${report.summary.totalDocLinks}`);
    console.log(`\n✅ Full report saved to: exploration-report.json`);
}

main().catch(console.error);
