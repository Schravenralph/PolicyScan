import { getDB } from '../../../config/database.js';
import { ObjectId, Filter } from 'mongodb';
// BronDocument import removed - now using CanonicalDocumentService
import type { BronDocumentDocument } from '../../../types/index.js';
import type { DocumentType } from '../../infrastructure/types.js';

/**
 * Type for metadata field values based on field type
 */
export type MetadataFieldValue = 
  | DocumentType  // documentType
  | string | null  // publicationDate, issuingAuthority, documentStatus
  | string[];  // themes

/**
 * Quality metrics for metadata extraction
 */
export interface MetadataQualityMetrics {
  _id?: ObjectId;
  date: Date;
  // Overall metrics
  totalDocuments: number;
  documentsWithMetadata: number;
  metadataCoverage: number; // Percentage
  averageConfidence: number;
  
  // Accuracy metrics (requires ground truth)
  documentTypeAccuracy?: number;
  dateAccuracy?: number;
  themePrecision?: number;
  themeRecall?: number;
  authorityAccuracy?: number;
  
  // Extraction method performance
  structuredExtractionCount: number;
  llmExtractionCount: number;
  hybridExtractionCount: number;
  
  // Error rates
  extractionErrors: number;
  errorRate: number; // Percentage
  
  // Confidence distribution
  highConfidenceCount: number; // > 0.8
  mediumConfidenceCount: number; // 0.5 - 0.8
  lowConfidenceCount: number; // < 0.5
}

/**
 * Manual validation entry
 */
export interface MetadataValidation {
  _id?: ObjectId;
  documentId: ObjectId;
  field: 'documentType' | 'publicationDate' | 'themes' | 'issuingAuthority' | 'documentStatus';
  extractedValue: MetadataFieldValue;
  correctValue: MetadataFieldValue | null; // null means extraction was incorrect
  isValid: boolean;
  validatedBy: string; // User ID
  validatedAt: Date;
  notes?: string;
}

/**
 * Metadata correction entry
 */
export interface MetadataCorrection {
  _id?: ObjectId;
  documentId: ObjectId;
  field: 'documentType' | 'publicationDate' | 'themes' | 'issuingAuthority' | 'documentStatus';
  originalValue: MetadataFieldValue;
  correctedValue: MetadataFieldValue;
  correctedBy: string; // User ID
  correctedAt: Date;
  reason?: string;
}

/**
 * Quality report data
 */
export interface QualityReport {
  period: {
    start: Date;
    end: Date;
  };
  overall: {
    coverage: number;
    averageConfidence: number;
    accuracy?: number;
  };
  byField: {
    documentType?: { accuracy: number; precision?: number; recall?: number };
    publicationDate?: { accuracy: number; precision?: number; recall?: number };
    themes?: { accuracy?: number; precision?: number; recall?: number };
    issuingAuthority?: { accuracy: number; precision?: number; recall?: number };
  };
  byMethod: {
    structured: { count: number; averageConfidence: number };
    llm: { count: number; averageConfidence: number };
    hybrid: { count: number; averageConfidence: number };
  };
  errors: {
    total: number;
    rate: number;
    byType: Record<string, number>;
  };
  trends: {
    coverage: number[]; // Daily coverage values
    confidence: number[]; // Daily average confidence
  };
}

const COLLECTION_QUALITY_METRICS = 'metadata_quality_metrics';
const COLLECTION_VALIDATIONS = 'metadata_validations';
const COLLECTION_CORRECTIONS = 'metadata_corrections';

/**
 * Service for validating and monitoring metadata extraction quality
 */
export class MetadataQualityService {
  /**
   * Calculate and store quality metrics for a given date
   */
  async calculateDailyMetrics(date: Date = new Date()): Promise<MetadataQualityMetrics> {
    const db = getDB();
    const startOfDay = new Date(date);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(date);
    endOfDay.setHours(23, 59, 59, 999);

    // Get all documents created or updated on this day
    const dateQuery: Filter<BronDocumentDocument> = {
      $or: [
        { createdAt: { $gte: startOfDay, $lte: endOfDay } },
        { updatedAt: { $gte: startOfDay, $lte: endOfDay } }
      ]
    };
    // Use canonical document service
    const { getCanonicalDocumentService } = await import('../../canonical/CanonicalDocumentService.js');
    const { transformCanonicalArrayToLegacy } = await import('../../../utils/canonicalToLegacyTransformer.js');
    const documentService = getCanonicalDocumentService();
    
    // Query canonical documents by date range
    const canonicalDocs = await documentService.findByDateRange(
      startOfDay,
      endOfDay
    );
    
    // Filter by updatedAt if needed (canonical service uses publishedAt, so we need to filter)
    const filteredCanonicalDocs = canonicalDocs.filter(doc => {
      const docCreatedAt = doc.createdAt;
      const docUpdatedAt = doc.updatedAt;
      return (docCreatedAt >= startOfDay && docCreatedAt <= endOfDay) ||
             (docUpdatedAt >= startOfDay && docUpdatedAt <= endOfDay);
    });
    
    // Transform to legacy format for compatibility
    const documents = transformCanonicalArrayToLegacy(filteredCanonicalDocs);

    const totalDocuments = documents.length;
    const documentsWithMetadata = documents.filter(doc => 
      doc.metadataConfidence !== undefined && doc.metadataConfidence !== null
    ).length;

    const metadataCoverage = totalDocuments > 0 
      ? (documentsWithMetadata / totalDocuments) * 100 
      : 0;

    // Calculate average confidence
    const confidences = documents
      .filter(doc => doc.metadataConfidence !== undefined && doc.metadataConfidence !== null)
      .map(doc => doc.metadataConfidence!);
    const averageConfidence = confidences.length > 0
      ? confidences.reduce((sum, conf) => sum + conf, 0) / confidences.length
      : 0;

    // Count by confidence level
    const highConfidenceCount = confidences.filter(c => c > 0.8).length;
    const mediumConfidenceCount = confidences.filter(c => c >= 0.5 && c <= 0.8).length;
    const lowConfidenceCount = confidences.filter(c => c < 0.5).length;

    // Count extraction methods (infer from confidence and fields)
    // This is a simplified approach - in reality, you'd track the method used
    let structuredExtractionCount = 0;
    let llmExtractionCount = 0;
    let hybridExtractionCount = 0;

    // Estimate method based on available fields and confidence
    documents.forEach(doc => {
      if (doc.metadataConfidence !== undefined && doc.metadataConfidence !== null) {
        const hasMultipleFields = [
          doc.type_document,
          doc.publicatiedatum,
          doc.themes && doc.themes.length > 0,
          doc.issuingAuthority
        ].filter(Boolean).length;

        if (hasMultipleFields >= 3 && doc.metadataConfidence > 0.7) {
          hybridExtractionCount++;
        } else if (doc.metadataConfidence > 0.6) {
          llmExtractionCount++;
        } else {
          structuredExtractionCount++;
        }
      }
    });

    // Count errors (documents with very low confidence or missing critical fields)
    const extractionErrors = documents.filter(doc => {
      if (!doc.metadataConfidence) return true;
      if (doc.metadataConfidence < 0.3) return true;
      // Missing critical fields
      if (!doc.type_document && !doc.publicatiedatum) return true;
      return false;
    }).length;

    const errorRate = totalDocuments > 0 ? (extractionErrors / totalDocuments) * 100 : 0;

    const metrics: MetadataQualityMetrics = {
      date: startOfDay,
      totalDocuments,
      documentsWithMetadata,
      metadataCoverage,
      averageConfidence,
      structuredExtractionCount,
      llmExtractionCount,
      hybridExtractionCount,
      extractionErrors,
      errorRate,
      highConfidenceCount,
      mediumConfidenceCount,
      lowConfidenceCount
    };

    // Store metrics
    await db.collection<MetadataQualityMetrics>(COLLECTION_QUALITY_METRICS).updateOne(
      { date: startOfDay },
      { $set: metrics },
      { upsert: true }
    );

    return metrics;
  }

  /**
   * Get quality metrics for a date range
   */
  async getMetrics(startDate: Date, endDate: Date): Promise<MetadataQualityMetrics[]> {
    const db = getDB();
    return await db.collection<MetadataQualityMetrics>(COLLECTION_QUALITY_METRICS)
      .find({
        date: { $gte: startDate, $lte: endDate }
      })
      .sort({ date: 1 })
      .toArray();
  }

  /**
   * Get latest quality metrics
   */
  async getLatestMetrics(): Promise<MetadataQualityMetrics | null> {
    const db = getDB();
    return await db.collection<MetadataQualityMetrics>(COLLECTION_QUALITY_METRICS)
      .find({})
      .sort({ date: -1 })
      .limit(1)
      .next();
  }

  /**
   * Validate metadata field manually
   */
  async validateField(
    documentId: string,
    field: 'documentType' | 'publicationDate' | 'themes' | 'issuingAuthority' | 'documentStatus',
    isValid: boolean,
    correctValue: MetadataFieldValue | null,
    validatedBy: string,
    notes?: string
  ): Promise<MetadataValidation> {
    const db = getDB();
    // Use canonical document service
    const { getCanonicalDocumentService } = await import('../../canonical/CanonicalDocumentService.js');
    const documentService = getCanonicalDocumentService();
    const canonicalDoc = await documentService.findById(documentId);
    
    if (!canonicalDoc) {
      throw new Error(`Document ${documentId} not found`);
    }
    
    // Transform to legacy format for field access
    const { transformCanonicalToLegacy } = await import('../../../utils/canonicalToLegacyTransformer.js');
    const document = transformCanonicalToLegacy(canonicalDoc);

    // Get extracted value
    let extractedValue: MetadataFieldValue;
    switch (field) {
      case 'documentType': {
        extractedValue = document.type_document || null;
        break;
      }
      case 'publicationDate': {
        extractedValue = document.publicatiedatum || null;
        break;
      }
      case 'themes': {
        extractedValue = document.themes || [];
        break;
      }
      case 'issuingAuthority': {
        extractedValue = document.issuingAuthority || null;
        break;
      }
      case 'documentStatus': {
        extractedValue = document.documentStatus || null;
        break;
      }
    }

    const validation: MetadataValidation = {
      documentId: new ObjectId(documentId),
      field,
      extractedValue,
      correctValue,
      isValid,
      validatedBy,
      validatedAt: new Date(),
      notes
    };

    await db.collection<MetadataValidation>(COLLECTION_VALIDATIONS).insertOne(validation);

    // If invalid and correct value provided, create correction
    if (!isValid && correctValue !== null) {
      await this.correctField(documentId, field, extractedValue, correctValue, validatedBy);
    }

    return validation;
  }

  /**
   * Correct metadata field
   */
  async correctField(
    documentId: string,
    field: 'documentType' | 'publicationDate' | 'themes' | 'issuingAuthority' | 'documentStatus',
    originalValue: MetadataFieldValue,
    correctedValue: MetadataFieldValue,
    correctedBy: string,
    reason?: string
  ): Promise<MetadataCorrection> {
    const db = getDB();
    // Use canonical document service
    const { getCanonicalDocumentService } = await import('../../canonical/CanonicalDocumentService.js');
    const documentService = getCanonicalDocumentService();
    const canonicalDoc = await documentService.findById(documentId);
    
    if (!canonicalDoc) {
      throw new Error(`Document ${documentId} not found`);
    }
    
    // Transform to legacy format for field access
    const { transformCanonicalToLegacy } = await import('../../../utils/canonicalToLegacyTransformer.js');
    const document = transformCanonicalToLegacy(canonicalDoc);

    const correction: MetadataCorrection = {
      documentId: new ObjectId(documentId),
      field,
      originalValue,
      correctedValue,
      correctedBy,
      correctedAt: new Date(),
      reason
    };

    await db.collection<MetadataCorrection>(COLLECTION_CORRECTIONS).insertOne(correction);

    // Update the canonical document with corrected value in enrichmentMetadata
    // Build updated enrichmentMetadata
    const updatedEnrichmentMetadata = {
      ...(canonicalDoc.enrichmentMetadata || {}),
    };
    
    switch (field) {
      case 'documentType': {
        // Update documentType in canonical document
        const updatedDraft = {
          ...canonicalDoc,
          documentType: correctedValue as string,
          enrichmentMetadata: updatedEnrichmentMetadata,
        };
        await documentService.upsertBySourceId(updatedDraft, {});
        break;
      }
      case 'publicationDate': {
        // Update dates.publishedAt in canonical document
        const dateDraft = {
          ...canonicalDoc,
          dates: {
            ...canonicalDoc.dates,
            publishedAt: correctedValue ? new Date(correctedValue as string) : undefined,
          },
          enrichmentMetadata: updatedEnrichmentMetadata,
        };
        await documentService.upsertBySourceId(dateDraft, {});
        break;
      }
      case 'themes': {
        updatedEnrichmentMetadata.themes = correctedValue as string[];
        const themesDraft = {
          ...canonicalDoc,
          enrichmentMetadata: updatedEnrichmentMetadata,
        };
        await documentService.upsertBySourceId(themesDraft, {});
        break;
      }
      case 'issuingAuthority': {
        // Update publisherAuthority in canonical document
        const authorityDraft = {
          ...canonicalDoc,
          publisherAuthority: correctedValue as string | undefined,
          enrichmentMetadata: updatedEnrichmentMetadata,
        };
        await documentService.upsertBySourceId(authorityDraft, {});
        break;
      }
      case 'documentStatus': {
        updatedEnrichmentMetadata.documentStatus = correctedValue as string | null;
        const statusDraft = {
          ...canonicalDoc,
          enrichmentMetadata: updatedEnrichmentMetadata,
        };
        await documentService.upsertBySourceId(statusDraft, {});
        break;
      }
    }

    return correction;
  }

  /**
   * Calculate accuracy from validations
   */
  async calculateAccuracy(
    startDate?: Date,
    endDate?: Date
  ): Promise<{
    documentType?: number;
    publicationDate?: number;
    themes?: { precision: number; recall: number };
    issuingAuthority?: number;
  }> {
    const db = getDB();
    const query: Filter<MetadataValidation> = {};
    if (startDate || endDate) {
      query.validatedAt = {
        ...(startDate ? { $gte: startDate } : {}),
        ...(endDate ? { $lte: endDate } : {}),
      };
    }

    const validations = await db.collection<MetadataValidation>(COLLECTION_VALIDATIONS)
      .find(query)
      .toArray();

    const accuracy: Record<string, number | { precision: number; recall: number }> = {};

    // Calculate accuracy per field
    ['documentType', 'publicationDate', 'issuingAuthority'].forEach(field => {
      const fieldValidations = validations.filter(v => v.field === field);
      if (fieldValidations.length > 0) {
        const correct = fieldValidations.filter(v => v.isValid).length;
        accuracy[field] = (correct / fieldValidations.length) * 100;
      }
    });

    // Calculate precision and recall for themes (multi-value field)
    const themeValidations = validations.filter(v => v.field === 'themes');
    if (themeValidations.length > 0) {
      let truePositives = 0;
      let falsePositives = 0;
      let falseNegatives = 0;

      themeValidations.forEach(v => {
        const extracted = Array.isArray(v.extractedValue) ? v.extractedValue : [];
        const correct = Array.isArray(v.correctValue) ? v.correctValue : [];
        
        if (v.isValid) {
          truePositives += extracted.length;
        } else {
          falsePositives += extracted.filter(t => !correct.includes(t)).length;
          falseNegatives += correct.filter(t => !extracted.includes(t)).length;
        }
      });

      const precision = (truePositives + falsePositives) > 0
        ? (truePositives / (truePositives + falsePositives)) * 100
        : 0;
      const recall = (truePositives + falseNegatives) > 0
        ? (truePositives / (truePositives + falseNegatives)) * 100
        : 0;

      accuracy.themes = { precision, recall };
    }

    return accuracy;
  }

  /**
   * Get documents with low confidence metadata
   * Optionally filter by date range (based on createdAt or updatedAt)
   */
  async getLowConfidenceDocuments(
    limit: number = 50,
    startDate?: Date,
    endDate?: Date
  ): Promise<BronDocumentDocument[]> {
    // Use canonical document service
    const { getCanonicalDocumentService } = await import('../../canonical/CanonicalDocumentService.js');
    const { transformCanonicalArrayToLegacy } = await import('../../../utils/canonicalToLegacyTransformer.js');
    const documentService = getCanonicalDocumentService();
    
    // Query canonical documents by date range if provided
    let canonicalDocs;
    if (startDate || endDate) {
      const start = startDate || new Date(0);
      const end = endDate || new Date();
      canonicalDocs = await documentService.findByDateRange(start, end);
    } else {
      // Get all documents (with limit applied later)
      canonicalDocs = await documentService.findByQuery({}, { limit: limit * 2 }); // Get more to filter
    }
    
    // Filter by low confidence metadata
    const lowConfidenceDocs = canonicalDocs.filter(doc => {
      const confidence = doc.enrichmentMetadata?.metadataConfidence as number | undefined;
      return confidence !== undefined && confidence < 0.5;
    });
    
    // Sort by confidence (ascending - lowest first) and limit
    lowConfidenceDocs.sort((a, b) => {
      const confA = (a.enrichmentMetadata?.metadataConfidence as number) || 0;
      const confB = (b.enrichmentMetadata?.metadataConfidence as number) || 0;
      return confA - confB;
    });
    
    const limitedDocs = lowConfidenceDocs.slice(0, limit);
    
    // Transform to legacy format for backward compatibility
    return transformCanonicalArrayToLegacy(limitedDocs);
  }

  /**
   * Generate quality report
   */
  async generateReport(startDate: Date, endDate: Date): Promise<QualityReport> {
    const metrics = await this.getMetrics(startDate, endDate);
    const accuracy = await this.calculateAccuracy(startDate, endDate);

    if (metrics.length === 0) {
      throw new Error('No metrics available for the specified date range');
    }

    // Calculate averages
    const totalDocs = metrics.reduce((sum, m) => sum + m.totalDocuments, 0);
    const docsWithMetadata = metrics.reduce((sum, m) => sum + m.documentsWithMetadata, 0);
    const coverage = totalDocs > 0 ? (docsWithMetadata / totalDocs) * 100 : 0;
    const avgConfidence = metrics.reduce((sum, m) => sum + m.averageConfidence, 0) / metrics.length;

    // Calculate method performance
    const structuredCount = metrics.reduce((sum, m) => sum + m.structuredExtractionCount, 0);
    const llmCount = metrics.reduce((sum, m) => sum + m.llmExtractionCount, 0);
    const hybridCount = metrics.reduce((sum, m) => sum + m.hybridExtractionCount, 0);

    // Calculate average confidence by method (simplified)
    const structuredConf = metrics.length > 0 
      ? metrics.reduce((sum, m) => sum + (m.structuredExtractionCount > 0 ? m.averageConfidence : 0), 0) / metrics.length
      : 0;
    const llmConf = metrics.length > 0
      ? metrics.reduce((sum, m) => sum + (m.llmExtractionCount > 0 ? m.averageConfidence : 0), 0) / metrics.length
      : 0;
    const hybridConf = metrics.length > 0
      ? metrics.reduce((sum, m) => sum + (m.hybridExtractionCount > 0 ? m.averageConfidence : 0), 0) / metrics.length
      : 0;

    // Calculate error rates
    const totalErrors = metrics.reduce((sum, m) => sum + m.extractionErrors, 0);
    const errorRate = totalDocs > 0 ? (totalErrors / totalDocs) * 100 : 0;

    // Trends
    const coverageTrend = metrics.map(m => m.metadataCoverage);
    const confidenceTrend = metrics.map(m => m.averageConfidence);

    return {
      period: { start: startDate, end: endDate },
      overall: {
        coverage,
        averageConfidence: avgConfidence,
        accuracy: accuracy.documentType || accuracy.publicationDate
      },
      byField: {
        documentType: accuracy.documentType ? { accuracy: accuracy.documentType } : undefined,
        publicationDate: accuracy.publicationDate ? { accuracy: accuracy.publicationDate } : undefined,
        themes: accuracy.themes,
        issuingAuthority: accuracy.issuingAuthority ? { accuracy: accuracy.issuingAuthority } : undefined
      },
      byMethod: {
        structured: { count: structuredCount, averageConfidence: structuredConf },
        llm: { count: llmCount, averageConfidence: llmConf },
        hybrid: { count: hybridCount, averageConfidence: hybridConf }
      },
      errors: {
        total: totalErrors,
        rate: errorRate,
        byType: {} // Could be enhanced to track error types
      },
      trends: {
        coverage: coverageTrend,
        confidence: confidenceTrend
      }
    };
  }

  /**
   * Check if quality thresholds are met and return alerts if not
   */
  async checkQualityThresholds(): Promise<Array<{ type: string; message: string; severity: 'warning' | 'error' }>> {
    const latest = await this.getLatestMetrics();
    if (!latest) {
      return [];
    }

    const alerts: Array<{ type: string; message: string; severity: 'warning' | 'error' }> = [];

    // Check coverage threshold (90%)
    if (latest.metadataCoverage < 90) {
      alerts.push({
        type: 'coverage',
        message: `Metadata coverage is ${latest.metadataCoverage.toFixed(1)}%, below threshold of 90%`,
        severity: latest.metadataCoverage < 70 ? 'error' : 'warning'
      });
    }

    // Check error rate threshold (5%)
    if (latest.errorRate > 5) {
      alerts.push({
        type: 'error_rate',
        message: `Extraction error rate is ${latest.errorRate.toFixed(1)}%, above threshold of 5%`,
        severity: latest.errorRate > 10 ? 'error' : 'warning'
      });
    }

    // Check average confidence (should be > 0.6)
    if (latest.averageConfidence < 0.6) {
      alerts.push({
        type: 'confidence',
        message: `Average confidence is ${(latest.averageConfidence * 100).toFixed(1)}%, below threshold of 60%`,
        severity: latest.averageConfidence < 0.4 ? 'error' : 'warning'
      });
    }

    return alerts;
  }
}


