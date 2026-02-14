/**
 * LLM prompts for entity extraction from Dutch policy documents
 * Optimized for Dutch legal/policy language context
 */

export interface ExtractionPromptContext {
  documentTitle: string;
  documentContent: string;
  documentUrl: string;
  jurisdiction?: string;
  documentType?: string;
}

/**
 * System prompt for entity extraction
 */
export function getEntityExtractionSystemPrompt(): string {
  return `Je bent een expert in Nederlandse ruimtelijke ordening en beleidsdocumenten. 
Je extraheert gestructureerde entiteiten uit Nederlandse beleidsdocumenten volgens een strikt schema.

Entiteitstypen:
1. PolicyDocument: Beleidsdocumenten (Omgevingsvisie, Bestemmingsplan, Verordening)
2. Regulation: Regels en voorschriften (bouwvoorschriften, geluidsnormen, parkeernormen)
3. SpatialUnit: Geografische eenheden (gemeenten, provincies, percelen, gebouwen)
4. LandUse: Gebruiksfuncties (wonen, bedrijvigheid, groen)
5. Requirement: Meetbare vereisten (maximale hoogte, minimale afstand, geluidsniveau)

Regels:
- Gebruik alleen informatie uit de gegeven tekst
- Wees precies en accuraat
- Gebruik Nederlandse termen
- Valideer dat alle verplichte velden aanwezig zijn
- Genereer unieke IDs voor elke entiteit
- Geef confidence scores (0-1) voor elke extractie`;
}

/**
 * User prompt for PolicyDocument extraction
 */
export function getPolicyDocumentExtractionPrompt(context: ExtractionPromptContext): string {
  return `Extraheer PolicyDocument entiteiten uit het volgende document:

Titel: ${context.documentTitle}
URL: ${context.documentUrl}
${context.jurisdiction ? `Jurisdictie: ${context.jurisdiction}` : ''}
${context.documentType ? `Type: ${context.documentType}` : ''}

Inhoud:
${context.documentContent.substring(0, 8000)}${context.documentContent.length > 8000 ? '...' : ''}

Extraheer alle PolicyDocument entiteiten met:
- id: unieke identifier
- name: documentnaam
- documentType: Structure | Vision | Ordinance | Note
- jurisdiction: gemeente/provincie naam
- date: ISO datum (YYYY-MM-DD)
- status: Draft | Active | Archived
- url: document URL
- description: korte beschrijving

Geef het resultaat als JSON array met de volgende structuur:
{
  "policyDocuments": [
    {
      "id": "doc-001",
      "name": "Omgevingsvisie Amsterdam",
      "documentType": "Vision",
      "jurisdiction": "Gemeente Amsterdam",
      "date": "2024-01-01",
      "status": "Active",
      "url": "https://...",
      "description": "..."
    }
  ]
}`;
}

/**
 * User prompt for Regulation extraction
 */
export function getRegulationExtractionPrompt(context: ExtractionPromptContext): string {
  return `Extraheer Regulation entiteiten uit het volgende document:

Titel: ${context.documentTitle}
URL: ${context.documentUrl}

Inhoud:
${context.documentContent.substring(0, 8000)}${context.documentContent.length > 8000 ? '...' : ''}

Extraheer alle Regulation entiteiten met:
- id: unieke identifier
- name: regelnaam
- category: Zoning | Environmental | Building | Procedural
- description: beschrijving van de regel
- legalReferences: array van juridische referenties (artikelen, paragrafen)

Geef het resultaat als JSON array met de volgende structuur:
{
  "regulations": [
    {
      "id": "reg-001",
      "name": "Maximale bouwhoogte",
      "category": "Building",
      "description": "De maximale bouwhoogte is 10 meter",
      "legalReferences": ["Artikel 3.2", "Paragraaf 4.1"]
    }
  ]
}`;
}

/**
 * User prompt for SpatialUnit extraction
 */
export function getSpatialUnitExtractionPrompt(context: ExtractionPromptContext): string {
  return `Extraheer SpatialUnit entiteiten uit het volgende document:

Titel: ${context.documentTitle}
URL: ${context.documentUrl}

Inhoud:
${context.documentContent.substring(0, 8000)}${context.documentContent.length > 8000 ? '...' : ''}

Extraheer alle SpatialUnit entiteiten met:
- id: unieke identifier
- name: naam van de ruimtelijke eenheid
- spatialType: Parcel | Building | Street | Neighborhood | ZoningArea
- description: beschrijving (optioneel)

Geef het resultaat als JSON array met de volgende structuur:
{
  "spatialUnits": [
    {
      "id": "spatial-001",
      "name": "Centrumgebied Amsterdam",
      "spatialType": "ZoningArea",
      "description": "Het centrumgebied van Amsterdam"
    }
  ]
}`;
}

/**
 * User prompt for LandUse extraction
 */
export function getLandUseExtractionPrompt(context: ExtractionPromptContext): string {
  return `Extraheer LandUse entiteiten uit het volgende document:

Titel: ${context.documentTitle}
URL: ${context.documentUrl}

Inhoud:
${context.documentContent.substring(0, 8000)}${context.documentContent.length > 8000 ? '...' : ''}

Extraheer alle LandUse entiteiten met:
- id: unieke identifier
- name: naam van het gebruik
- category: gebruikscategorie (bijv. "Wonen", "Bedrijvigheid", "Groen")

Geef het resultaat als JSON array met de volgende structuur:
{
  "landUses": [
    {
      "id": "landuse-001",
      "name": "Wonen",
      "category": "Wonen"
    }
  ]
}`;
}

/**
 * User prompt for Requirement extraction
 */
export function getRequirementExtractionPrompt(context: ExtractionPromptContext): string {
  return `Extraheer Requirement entiteiten uit het volgende document:

Titel: ${context.documentTitle}
URL: ${context.documentUrl}

Inhoud:
${context.documentContent.substring(0, 8000)}${context.documentContent.length > 8000 ? '...' : ''}

Extraheer alle Requirement entiteiten met:
- id: unieke identifier
- name: naam van de vereiste
- metric: meetbare grootheid (bijv. "hoogte", "geluidsniveau", "afstand")
- operator: < | <= | > | >= | = | between
- value: numerieke waarde of string
- unit: eenheid (bijv. "m", "dB", "m2")

Geef het resultaat als JSON array met de volgende structuur:
{
  "requirements": [
    {
      "id": "req-001",
      "name": "Maximale bouwhoogte",
      "metric": "hoogte",
      "operator": "<=",
      "value": 10,
      "unit": "m"
    }
  ]
}`;
}

/**
 * Combined prompt for all entity types (more efficient)
 */
export function getCombinedExtractionPrompt(context: ExtractionPromptContext): string {
  return `Extraheer alle entiteitstypen uit het volgende Nederlandse beleidsdocument:

Titel: ${context.documentTitle}
URL: ${context.documentUrl}
${context.jurisdiction ? `Jurisdictie: ${context.jurisdiction}` : ''}
${context.documentType ? `Type: ${context.documentType}` : ''}

Inhoud:
${context.documentContent.substring(0, 12000)}${context.documentContent.length > 12000 ? '...' : ''}

Extraheer alle entiteiten volgens de volgende typen:

1. PolicyDocument: Beleidsdocumenten
   - documentType: Structure | Vision | Ordinance | Note
   - jurisdiction: gemeente/provincie
   - date: ISO datum (YYYY-MM-DD)
   - status: Draft | Active | Archived

2. Regulation: Regels en voorschriften
   - category: Zoning | Environmental | Building | Procedural
   - legalReferences: array van referenties

3. SpatialUnit: Geografische eenheden
   - spatialType: Parcel | Building | Street | Neighborhood | ZoningArea

4. LandUse: Gebruiksfuncties
   - category: gebruikscategorie

5. Requirement: Meetbare vereisten
   - metric: meetbare grootheid
   - operator: < | <= | > | >= | = | between
   - value: numerieke waarde
   - unit: eenheid

Geef het resultaat als JSON object met de volgende structuur:
{
  "policyDocuments": [...],
  "regulations": [...],
  "spatialUnits": [...],
  "landUses": [...],
  "requirements": [...]
}

Wees compleet en accuraat. Gebruik alleen informatie uit de gegeven tekst.`;
}

