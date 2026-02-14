import { ExtractionContext } from '../models/RelationshipModels.js';

/**
 * Build system prompt for relationship extraction
 */
export function buildRelationshipExtractionSystemPrompt(): string {
  return `You are an expert relationship extraction assistant specialized in Dutch policy and legal documents.
Your task is to extract structured relationships between entities mentioned in policy documents.

Key guidelines:
- You understand Dutch language, government structure, and policy terminology
- You recognize relationships between policy entities (documents, regulations, spatial units, land uses, requirements)
- You are precise: only extract relationships that are explicitly stated or strongly implied
- You provide confidence scores (0-1) based on clarity of the relationship
- You respond with ONLY valid JSON, no explanatory text

Relationship types:
- RELATES_TO: General semantic relationship between any entities
- IMPLEMENTS: Document implements or enforces a regulation
- APPLIES_TO: Regulation applies to a spatial unit or land use
- DEFINES: Document defines a requirement or regulation
- OVERRIDES: Document overrides another document (hierarchical)
- REFINES: Document refines or elaborates on another document
- LOCATED_IN: Spatial unit is located within another spatial unit
- HAS_REQUIREMENT: Regulation has a specific requirement
- CONSTRAINS: Requirement constrains a spatial unit
- DEFINED_IN: Regulation or requirement is defined in a document

Output format:
{
  "relationships": [
    {
      "sourceId": "entity-id-1",
      "targetId": "entity-id-2",
      "type": "APPLIES_TO",
      "confidence": 0.9,
      "sourceText": "relevant text snippet"
    }
  ]
}`;
}

/**
 * Build user prompt for relationship extraction
 */
export function buildRelationshipExtractionPrompt(context: ExtractionContext): string {
  const { documentText, existingEntities, documentTitle, jurisdiction } = context;

  // Build entity list for reference
  const entityList = existingEntities
    .map((e) => `- ${e.id} (${e.type}): ${e.name}`)
    .join('\n');

  const jurisdictionContext = jurisdiction
    ? `\nJurisdiction: ${jurisdiction}`
    : '';

  return `Extract relationships between entities from the following Dutch policy document.

Document Title: ${documentTitle || 'Untitled'}
${jurisdictionContext}

Available Entities:
${entityList || 'No entities found'}

Document Text:
${documentText.slice(0, 4000)}${documentText.length > 4000 ? '\n[... truncated]' : ''}

Instructions:
1. Identify relationships between the entities listed above
2. Only extract relationships that are explicitly mentioned or strongly implied in the text
3. Use the entity IDs exactly as listed above
4. Assign appropriate relationship types based on the context
5. Provide confidence scores (0-1) based on how clear the relationship is
6. Include a brief text snippet (sourceText) that indicates the relationship

Return a JSON object with a "relationships" array containing all extracted relationships.`;
}

/**
 * Build few-shot examples for relationship extraction
 */
export function getFewShotExamples(): string {
  return `Example 1:
Input: "Deze regelgeving geldt voor woonbestemmingen in Amsterdam. De maximale hoogte is 10 meter."
Entities:
- reg-1 (Regulation): Regelgeving voor woonbestemmingen
- landuse-1 (LandUse): Woonbestemming
- spatial-1 (SpatialUnit): Amsterdam
- req-1 (Requirement): Maximale hoogte 10 meter

Output:
{
  "relationships": [
    {
      "sourceId": "reg-1",
      "targetId": "landuse-1",
      "type": "APPLIES_TO",
      "confidence": 0.95,
      "sourceText": "geldt voor woonbestemmingen"
    },
    {
      "sourceId": "reg-1",
      "targetId": "spatial-1",
      "type": "APPLIES_TO",
      "confidence": 0.9,
      "sourceText": "woonbestemmingen in Amsterdam"
    },
    {
      "sourceId": "reg-1",
      "targetId": "req-1",
      "type": "HAS_REQUIREMENT",
      "confidence": 0.85,
      "sourceText": "maximale hoogte is 10 meter"
    }
  ]
}

Example 2:
Input: "Het bestemmingsplan voor de binnenstad is gebaseerd op de omgevingsvisie van 2020."
Entities:
- doc-1 (PolicyDocument): Bestemmingsplan binnenstad
- doc-2 (PolicyDocument): Omgevingsvisie 2020

Output:
{
  "relationships": [
    {
      "sourceId": "doc-1",
      "targetId": "doc-2",
      "type": "REFINES",
      "confidence": 0.9,
      "sourceText": "gebaseerd op de omgevingsvisie"
    }
  ]
}`;
}

