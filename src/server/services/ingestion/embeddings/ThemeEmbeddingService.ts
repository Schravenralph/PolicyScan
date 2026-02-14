import axios from 'axios';
import * as cheerio from 'cheerio';
import path from 'path';
import { VectorStore, LocalEmbeddingProvider, VectorDocument } from '../../query/VectorService.js';
import { rateLimiter } from '../../infrastructure/rateLimiter.js';
import { htmlCache } from '../../infrastructure/cache.js';
import { scraperConfig } from '../../../config/scraperConfig.js';

interface ThemeHit {
  slug: string;
  score: number;
  url: string;
}

/**
 * Precomputes and serves embeddings for IPLO themes so we can route queries
 * without relying on the brittle HTML search endpoint.
 */
export class ThemeEmbeddingService {
  private store: VectorStore;
  private provider: LocalEmbeddingProvider;
  private initialized = false;
  private dirty = false;
  private baseThemeUrl = 'https://iplo.nl/thema';

  constructor(storagePath?: string) {
    const defaultPath = path.join(process.cwd(), 'data', 'theme_vectors.json');
    this.store = new VectorStore(storagePath || defaultPath);
    this.provider = new LocalEmbeddingProvider();
  }

  /**
   * Load store and ensure embeddings exist for all known themes.
   */
  async init(themeMap: Record<string, string>): Promise<void> {
    if (!this.initialized) {
      await this.store.load();
      this.initialized = true;
    }
    await this.ensureEmbeddings(themeMap);
  }

  /**
   * Find top theme slugs for the query.
   */
  async searchThemes(query: string, limit: number = 3): Promise<ThemeHit[]> {
    const queryVec = await this.provider.generateEmbedding(query);
    const results = this.store.search(queryVec, limit);

    return results.map(res => ({
      slug: (res.document.metadata?.slug as string) || res.document.id.replace('theme:', ''),
      score: res.score,
      url: (res.document.metadata?.url as string) || `${this.baseThemeUrl}/${res.document.id.replace('theme:', '')}/`
    }));
  }

  private async ensureEmbeddings(themeMap: Record<string, string>): Promise<void> {
    const uniqueSlugs = Array.from(new Set(Object.values(themeMap)));
    for (const slug of uniqueSlugs) {
      const id = this.buildId(slug);
      const existing = this.store.getDocument(id);
      if (existing) {
        continue;
      }

      const text = await this.fetchThemeText(slug);
      if (!text) {
        console.warn(`[ThemeEmbeddingService] Skipping ${slug}: no content extracted`);
        continue;
      }

      const vector = await this.provider.generateEmbedding(text);
      const doc: VectorDocument = {
        id,
        vector,
        content: text,
        metadata: {
          slug,
          url: `${this.baseThemeUrl}/${slug}/`
        }
      };

      this.store.addDocument(doc);
      this.dirty = true;
      console.log(`[ThemeEmbeddingService] Added embedding for theme ${slug}`);
    }

    if (this.dirty) {
      await this.store.save();
      this.dirty = false;
    }
  }

  private buildId(slug: string): string {
    return `theme:${slug}`;
  }

  private async fetchThemeText(slug: string): Promise<string> {
    const url = `${this.baseThemeUrl}/${slug}/`;

    const cached = htmlCache.getSync(url);
    if (cached !== undefined) {
      return this.extractText(cached);
    }

    await rateLimiter.acquire(url);
    
    const startTime = Date.now();
    try {
      const response = await axios.get(url, {
        timeout: scraperConfig.timeout,
        headers: {
          'User-Agent': scraperConfig.userAgent
        }
      });

      const responseTime = Date.now() - startTime;
      
      // Record successful request for adaptive rate limiting
      rateLimiter.recordResult({
        url,
        success: true,
        statusCode: response.status,
        responseTime
      });

      void htmlCache.set(url, response.data);
      return this.extractText(response.data);
    } catch (error) {
      const responseTime = Date.now() - startTime;
      const statusCode = (error as { response?: { status?: number } })?.response?.status;
      
      // Record failed request for adaptive rate limiting
      rateLimiter.recordResult({
        url,
        success: false,
        statusCode,
        responseTime,
        error: error instanceof Error ? error : new Error(String(error))
      });
      
      throw error;
    } finally {
      rateLimiter.release(url);
    }
  }

  private extractText(html: string): string {
    const $ = cheerio.load(html);

    const title = $('h1').first().text().trim();
    const headings = $('h2, h3').map((_, el) => $(el).text().trim()).get().join(' ');
    const paragraphs = $('p').map((_, el) => $(el).text().trim()).get().join(' ');

    const combined = [title, headings, paragraphs]
      .filter(Boolean)
      .join('\n')
      .replace(/\s+/g, ' ')
      .trim();

    return combined;
  }
}
