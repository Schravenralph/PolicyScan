/**
 * Prompts for community report generation
 * Optimized for Dutch urban planning domain
 */

export interface ReportGenerationContext {
  label: string; // Semantic label
  summary: string; // Community summary
  entities: Array<{
    id: string;
    type: string;
    name: string;
    description?: string;
  }>;
  relationships: Array<{
    sourceId: string;
    targetId: string;
    type: string;
    sourceName?: string;
    targetName?: string;
  }>;
  entityCount: number;
  relationshipCount: number;
  domain?: string;
  jurisdiction?: string;
}

/**
 * Generate a prompt for extracting key entities from a community
 */
export function getKeyEntitiesPrompt(context: ReportGenerationContext): string {
  const entitiesText = context.entities
    .slice(0, 50) // Limit to 50 entities for prompt efficiency
    .map((e) => `- ${e.type}: ${e.name}${e.description ? ` (${e.description})` : ''}`)
    .join('\n');

  return `Je bent een expert in Nederlandse ruimtelijke ordening en beleid. Je selecteert de belangrijkste entiteiten uit een community voor een community report.

Community Label: "${context.label}"
Community Samenvatting: "${context.summary}"

Totaal aantal entiteiten in community: ${context.entityCount}
${context.domain ? `Domein: ${context.domain}` : ''}
${context.jurisdiction ? `Jurisdictie: ${context.jurisdiction}` : ''}

Entiteiten in community:
${entitiesText}

Opdracht:
Selecteer de top 10 belangrijkste entiteiten voor deze community. Belangrijke entiteiten zijn:
1. Entiteiten die centraal staan in het hoofdthema
2. Entiteiten met veel relaties
3. Entiteiten die representatief zijn voor de community
4. Entiteiten met relevante beschrijvingen

Antwoord in JSON formaat met een array van entiteiten:
[
  {
    "id": "<entity-id>",
    "importanceScore": <0-1>,
    "reason": "<korte uitleg waarom deze entiteit belangrijk is>"
  }
]

Antwoord alleen met de JSON array, zonder extra uitleg.`;
}

/**
 * Generate a prompt for extracting key relationships from a community
 */
export function getKeyRelationshipsPrompt(context: ReportGenerationContext): string {
  const relationshipsText = context.relationships
    .slice(0, 50) // Limit to 50 relationships for prompt efficiency
    .map((r) => {
      const sourceName = r.sourceName || r.sourceId;
      const targetName = r.targetName || r.targetId;
      return `- ${sourceName} --[${r.type}]--> ${targetName}`;
    })
    .join('\n');

  return `Je bent een expert in Nederlandse ruimtelijke ordening en beleid. Je selecteert de belangrijkste relaties uit een community voor een community report.

Community Label: "${context.label}"
Community Samenvatting: "${context.summary}"

Totaal aantal relaties in community: ${context.relationshipCount}
${context.domain ? `Domein: ${context.domain}` : ''}
${context.jurisdiction ? `Jurisdictie: ${context.jurisdiction}` : ''}

Relaties in community:
${relationshipsText}

Opdracht:
Selecteer de top 10 belangrijkste relaties voor deze community. Belangrijke relaties zijn:
1. Relaties tussen centrale entiteiten
2. Relaties die het hoofdthema illustreren
3. Relaties met betekenisvolle types (bijv. "reguleert", "beïnvloedt", "is onderdeel van")
4. Relaties die structuren en patronen blootleggen

Antwoord in JSON formaat met een array van relaties:
[
  {
    "sourceId": "<source-id>",
    "targetId": "<target-id>",
    "type": "<relationship-type>",
    "importanceScore": <0-1>,
    "reason": "<korte uitleg waarom deze relatie belangrijk is>"
  }
]

Antwoord alleen met de JSON array, zonder extra uitleg.`;
}

/**
 * Generate a prompt for generating representative examples
 */
export function getRepresentativeExamplesPrompt(context: ReportGenerationContext): string {
  const topEntities = context.entities.slice(0, 10);
  const topRelationships = context.relationships.slice(0, 10);

  const entitiesText = topEntities
    .map((e) => `- ${e.type}: ${e.name}${e.description ? ` (${e.description})` : ''}`)
    .join('\n');

  const relationshipsText = topRelationships
    .map((r) => {
      const sourceName = r.sourceName || r.sourceId;
      const targetName = r.targetName || r.targetId;
      return `- ${sourceName} --[${r.type}]--> ${targetName}`;
    })
    .join('\n');

  return `Je bent een expert in Nederlandse ruimtelijke ordening en beleid. Je genereert representatieve voorbeelden voor een community report.

Community Label: "${context.label}"
Community Samenvatting: "${context.summary}"

Belangrijkste entiteiten:
${entitiesText}

Belangrijkste relaties:
${relationshipsText}

Opdracht:
Genereer 3-5 representatieve voorbeelden die illustreren wat deze community bevat. Voorbeelden kunnen entiteiten of relaties zijn.

Voor elk voorbeeld:
1. Beschrijf wat het voorbeeld illustreert
2. Leg uit waarom het representatief is voor de community
3. Maak de beschrijving kort maar informatief (1-2 zinnen)

Antwoord in JSON formaat met een array van voorbeelden:
[
  {
    "type": "entity" | "relationship",
    "entityId": "<entity-id>" (als type="entity"),
    "relationshipId": "<source-id>-<target-id>-<type>" (als type="relationship"),
    "description": "<beschrijving van het voorbeeld en waarom het representatief is>"
  }
]

Antwoord alleen met de JSON array, zonder extra uitleg.`;
}




















