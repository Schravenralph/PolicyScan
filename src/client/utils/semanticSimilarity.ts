import { assertEquals } from './assertEquals.js';

/**
 * BM25-based semantic similarity scoring for log clustering
 * Uses basic NLP techniques (tokenization, TF-IDF-like scoring) to determine
 * semantic similarity between log messages.
 */

interface BM25Config {
  k1?: number; // Term frequency saturation parameter (default: 1.5)
  b?: number; // Length normalization parameter (default: 0.75)
}

/**
 * Tokenizes text into words, removing stop words and normalizing
 */
function tokenize(text: string): string[] {
  // Common stop words (English + Dutch)
  const stopWords = new Set([
    'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by',
    'de', 'het', 'een', 'en', 'of', 'maar', 'in', 'op', 'bij', 'naar', 'voor', 'van', 'met', 'door',
    'is', 'are', 'was', 'were', 'be', 'been', 'being', 'have', 'has', 'had', 'do', 'does', 'did',
    'i', 'you', 'he', 'she', 'it', 'we', 'they', 'this', 'that', 'these', 'those',
    'ik', 'jij', 'hij', 'zij', 'het', 'wij', 'zij', 'deze', 'die', 'dit', 'dat'
  ]);

  return text
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ') // Remove punctuation
    .split(/\s+/)
    .filter(word => word.length > 2 && !stopWords.has(word))
    .map(word => word.trim());
}

/**
 * Calculates term frequency (TF) for a term in a document
 */
function termFrequency(term: string, document: string[]): number {
  return document.filter(word => word === term).length;
}

/**
 * Calculates inverse document frequency (IDF) for a term across a corpus
 */
function inverseDocumentFrequency(term: string, corpus: string[][]): number {
  const documentsContainingTerm = corpus.filter(doc => doc.includes(term)).length;
  if (documentsContainingTerm === 0) return 0;
  
  // IDF = log((N - df + 0.5) / (df + 0.5))
  // where N is total documents, df is documents containing term
  const N = corpus.length;
  const df = documentsContainingTerm;
  // Use log1p to ensure a positive weight for present terms, even in tiny corpora
  return Math.log1p((N - df + 0.5) / (df + 0.5));
}

/**
 * Calculates average document length in the corpus
 */
function averageDocumentLength(corpus: string[][]): number {
  if (corpus.length === 0) return 0;
  const totalLength = corpus.reduce((sum, doc) => sum + doc.length, 0);
  return totalLength / corpus.length;
}

/**
 * Calculates BM25 score for a query against a document
 * BM25 formula: sum of IDF(qi) * (f(qi, D) * (k1 + 1)) / (f(qi, D) + k1 * (1 - b + b * |D| / avgdl))
 */
export function calculateBM25Score(
  query: string,
  document: string,
  corpus: string[],
  config: BM25Config = {}
): number {
  const { k1 = 1.5, b = 0.75 } = config;
  
  // Tokenize query and document
  const queryTokens = tokenize(query);
  const docTokens = tokenize(document);
  
  // Tokenize all documents in corpus for IDF calculation
  const tokenizedCorpus = corpus.map(doc => tokenize(doc));
  const avgdl = averageDocumentLength(tokenizedCorpus);
  
  let score = 0;
  
  for (const term of queryTokens) {
    const tf = termFrequency(term, docTokens);
    if (tf === 0) continue; // Skip terms not in document
    
    const idf = inverseDocumentFrequency(term, tokenizedCorpus);
    if (idf <= 0) continue; // Skip terms with no IDF value
    
    // BM25 formula
    const numerator = idf * (tf * (k1 + 1));
    const denominator = tf + k1 * (1 - b + b * (docTokens.length / avgdl));
    score += numerator / denominator;
  }
  
  return score;
}

/**
 * Calculates semantic similarity between two texts using BM25
 * Returns a score between 0 and 1 (normalized)
 */
export function semanticSimilarity(
  text1: string,
  text2: string,
  contextCorpus: string[] = [],
  config: BM25Config = {}
): number {
  // Use both texts as query and document, take average
  const tokens1 = tokenize(text1);
  const tokens2 = tokenize(text2);
  
  // If texts are identical, return high similarity
  if (tokens1.join(' ') === tokens2.join(' ')) {
    return 1.0;
  }
  
  // Build corpus from context + both texts
  const corpus = [...contextCorpus, text1, text2];
  
  // Calculate BM25 in both directions and average
  const score1 = calculateBM25Score(text1, text2, corpus, config);
  const score2 = calculateBM25Score(text2, text1, corpus, config);
  const avgScore = (score1 + score2) / 2;
  
  // Normalize to 0-1 range (BM25 can be negative, but typically positive)
  // Use sigmoid-like normalization: 1 / (1 + e^(-score))
  const normalized = 1 / (1 + Math.exp(-avgScore / 5)); // Scale factor of 5 for better distribution
  
  return normalized;
}

/**
 * Calculates cosine similarity between two tokenized texts
 * Alternative to BM25 for semantic similarity
 */
export function cosineSimilarity(text1: string, text2: string): number {
  const tokens1 = tokenize(text1);
  const tokens2 = tokenize(text2);
  
  if (tokens1.length === 0 || tokens2.length === 0) return 0;
  
  // Create term frequency vectors
  const allTerms = new Set([...tokens1, ...tokens2]);
  const vector1: number[] = [];
  const vector2: number[] = [];
  
  for (const term of allTerms) {
    vector1.push(tokens1.filter(t => t === term).length);
    vector2.push(tokens2.filter(t => t === term).length);
  }
  
  // Calculate dot product
  let dotProduct = 0;
  for (let i = 0; i < vector1.length; i++) {
    dotProduct += vector1[i] * vector2[i];
  }
  
  // Calculate magnitudes
  const magnitude1 = Math.sqrt(vector1.reduce((sum, val) => sum + val * val, 0));
  const magnitude2 = Math.sqrt(vector2.reduce((sum, val) => sum + val * val, 0));
  
  if (magnitude1 === 0 || magnitude2 === 0) return 0;
  
  return dotProduct / (magnitude1 * magnitude2);
}

/**
 * Combined semantic similarity using both BM25 and cosine similarity
 * Returns a score between 0 and 1
 */
export function combinedSemanticSimilarity(
  text1: string,
  text2: string,
  contextCorpus: string[] = [],
  config: BM25Config = {}
): number {
  const bm25Score = semanticSimilarity(text1, text2, contextCorpus, config);
  const cosineScore = cosineSimilarity(text1, text2);
  
  // Weighted average (BM25 gets more weight as it's more sophisticated)
  return (bm25Score * 0.6) + (cosineScore * 0.4);
}

interface ImportMetaEnv {
  DEV?: boolean;
}

interface ImportMeta {
  env?: ImportMetaEnv;
}

const shouldRunInlineChecks =
  (typeof import.meta !== 'undefined' && Boolean((import.meta as unknown as ImportMeta).env?.DEV)) ||
  false;

const runInlineChecks = () => {
  const tokens = tokenize('The quick brown fox jumps over the lazy dog');
  assertEquals(tokens, ['quick', 'brown', 'fox', 'jumps', 'over', 'lazy', 'dog'], {
    message: 'tokenize should drop stop words and short tokens',
  });

  assertEquals(termFrequency('fox', ['fox', 'cat', 'fox']), 2, {
    message: 'termFrequency counts term occurrences',
  });

  const idf = inverseDocumentFrequency('fox', [['fox', 'cat'], ['cat']]);
  assertEquals(idf > 0, true, {
    message: 'inverseDocumentFrequency returns positive weight when present',
  });

  const identicalScore = combinedSemanticSimilarity(
    'scan documents now',
    'scan documents now',
    ['unrelated filler']
  );
  assertEquals(identicalScore, 1, {
    tolerance: 0.00001,
    message: 'identical texts have maximum similarity',
  });
};

if (shouldRunInlineChecks) {
  runInlineChecks();
}

