import express from 'express';
import { ragService } from '../services/retrieval/RAGService.js';
import * as CDS from '../services/canonical/CanonicalDocumentService.js';
import type { CanonicalDocument } from '../contracts/types.js';
import { Query } from '../models/Query.js';
import { ScrapedDocument } from '../services/infrastructure/types.js';
import { asyncHandler, throwIfNotFound } from '../utils/errorHandling.js';
import { BadRequestError, ServiceUnavailableError } from '../types/errors.js';

const router = express.Router();

function mapCanonicalToScrapedDocument(doc: CanonicalDocument): ScrapedDocument {
  return {
    titel: doc.title || '',
    url: doc.canonicalUrl || (doc.sourceMetadata?.url as string) || (doc.sourceMetadata?.legacyUrl as string) || '',
    website_url: (doc.sourceMetadata?.website_url as string) || (doc.sourceMetadata?.legacyWebsiteUrl as string) || '',
    website_titel: doc.sourceMetadata?.website_titel as string | undefined,
    // Use fullText if available as it contains the main content, fallback to summary
    samenvatting: doc.fullText || (doc.sourceMetadata?.samenvatting as string) || '',
    type_document: 'Webpagina',
    publicatiedatum: doc.dates?.publishedAt ? doc.dates.publishedAt.toISOString().split('T')[0] : null,
  };
}

/**
 * POST /api/qa/answer
 * Answer a question using documents
 * 
 * Request body:
 * {
 *   question: string,
 *   documentIds?: string[], // Optional: specific document IDs to use
 *   queryId?: string        // Optional: use documents from a query
 * }
 */
router.post('/answer', asyncHandler(async (req, res) => {
  const { question, documentIds, queryId } = req.body;

  if (!question || typeof question !== 'string') {
    throw new BadRequestError('Question is required');
  }

  // Get documents
  let documents: ScrapedDocument[] = [];

  if (documentIds && Array.isArray(documentIds) && documentIds.length > 0) {
    // Use specific document IDs
    const docObjects = await CDS.getCanonicalDocumentService().findByIds(documentIds);
    documents = docObjects.map(mapCanonicalToScrapedDocument);
  } else if (queryId) {
    // Use documents from a query
    const query = await Query.findById(queryId);
    throwIfNotFound(query, 'Query', queryId);

    const docObjects = await CDS.getCanonicalDocumentService().findByQueryId(queryId);
    documents = docObjects.map(mapCanonicalToScrapedDocument);
  } else {
    throw new BadRequestError('Either documentIds or queryId must be provided');
  }

  if (documents.length === 0) {
    throw new BadRequestError('No documents found');
  }

  try {
    // Answer the question
    const result = await ragService.answerQuestion(question, documents);

    res.json({
      question,
      answer: result.answer,
      citations: result.citations,
      chunksUsed: result.chunksUsed.length,
      confidence: result.confidence
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Internal server error during QA';
    
    // Check if it's a configuration error (LLM disabled, etc.)
    if (errorMessage.includes('disabled') || errorMessage.includes('OPENAI_API_KEY')) {
      throw new ServiceUnavailableError('QA service is not available', { originalError: errorMessage });
    }
    
    // Re-throw to be handled by error middleware
    throw error;
  }
}));

/**
 * POST /api/qa/summarize
 * Summarize documents
 * 
 * Request body:
 * {
 *   documentIds?: string[], // Optional: specific document IDs to use
 *   queryId?: string,        // Optional: use documents from a query
 *   query?: string,          // Optional: query-focused summary
 *   maxLength?: number       // Optional: target summary length in words
 * }
 */
router.post('/summarize', asyncHandler(async (req, res) => {
  const { documentIds, queryId, query, maxLength } = req.body;

  // Get documents
  let documents: ScrapedDocument[] = [];

  if (documentIds && Array.isArray(documentIds) && documentIds.length > 0) {
    // Use specific document IDs
    const docObjects = await CDS.getCanonicalDocumentService().findByIds(documentIds);
    documents = docObjects.map(mapCanonicalToScrapedDocument);
  } else if (queryId) {
    // Use documents from a query
    const queryDoc = await Query.findById(queryId);
    throwIfNotFound(queryDoc, 'Query', queryId);

    const docObjects = await CDS.getCanonicalDocumentService().findByQueryId(queryId);
    documents = docObjects.map(mapCanonicalToScrapedDocument);
  } else {
    throw new BadRequestError('Either documentIds or queryId must be provided');
  }

  if (documents.length === 0) {
    throw new BadRequestError('No documents found');
  }

  try {
    // Generate summary
    const result = await ragService.summarizeDocuments(documents, {
      query,
      maxLength,
      singleDocument: documents.length === 1
    });

    res.json({
      summary: result.summary,
      citations: result.citations,
      chunksUsed: result.chunksUsed.length,
      documentCount: documents.length
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Internal server error during summarization';
    
    // Check if it's a configuration error
    if (errorMessage.includes('disabled') || errorMessage.includes('OPENAI_API_KEY')) {
      throw new ServiceUnavailableError('Summarization service is not available', { originalError: errorMessage });
    }
    
    // Re-throw to be handled by error middleware
    throw error;
  }
}));

export default router;
