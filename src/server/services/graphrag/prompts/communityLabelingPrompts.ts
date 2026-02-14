/**
 * Prompts for semantic community label generation
 * Optimized for Dutch urban planning domain
 */

export interface CommunityLabelingContext {
  entityTypes: string[];
  entityCount: number;
  sampleEntities: Array<{
    id: string;
    type: string;
    name?: string;
    description?: string;
  }>;
  relationships?: Array<{
    type: string;
    source: string;
    target: string;
  }>;
  domain?: string;
  jurisdiction?: string;
}

/**
 * Generate a prompt for creating a community summary
 */
export function getCommunitySummaryPrompt(context: CommunityLabelingContext): string {
  const entityTypesList = context.entityTypes.join(', ');
  const sampleEntitiesText = context.sampleEntities
    .slice(0, 10)
    .map((e) => `- ${e.type}: ${e.name || e.id}${e.description ? ` (${e.description})` : ''}`)
    .join('\n');

  return `Je bent een expert in Nederlandse ruimtelijke ordening en beleid. Je analyseert een groep gerelateerde entiteiten uit een kennisgrafiek.

Context:
- Aantal entiteiten: ${context.entityCount}
- Entiteitstypen: ${entityTypesList}
- Domein: ${context.domain || 'Niet gespecificeerd'}
- Jurisdictie: ${context.jurisdiction || 'Niet gespecificeerd'}

Voorbeeld entiteiten:
${sampleEntitiesText}

${context.relationships && context.relationships.length > 0
  ? `\nRelaties:\n${context.relationships
      .slice(0, 10)
      .map((r) => `- ${r.source} --[${r.type}]--> ${r.target}`)
      .join('\n')}`
  : ''}

Opdracht:
Genereer een beknopte samenvatting (2-3 zinnen) van deze community in het Nederlands. De samenvatting moet:
1. Het hoofdthema of onderwerp van de community beschrijven
2. De belangrijkste entiteitstypen en hun rol noemen
3. Relevant zijn voor Nederlandse ruimtelijke ordening en beleid

Antwoord alleen met de samenvatting, zonder extra uitleg.`;
}

/**
 * Generate a prompt for creating a semantic label from a summary
 */
export function getSemanticLabelPrompt(summary: string): string {
  return `Je bent een expert in Nederlandse ruimtelijke ordening en beleid. Je maakt een semantisch label voor een community uit een kennisgrafiek.

Community samenvatting:
${summary}

Opdracht:
Genereer een kort, betekenisvol semantisch label (2-4 woorden) in het Nederlands dat deze community beschrijft. Het label moet:
1. Gebruik maken van domein-specifieke terminologie (bijv. IMBOR, EuroVoc)
2. Bevatten tussen 2-4 woorden
3. Relevant zijn voor Nederlandse ruimtelijke ordening en beleid
4. Begrijpelijk zijn voor professionals in het domein

Voorbeelden van goede labels:
- "Bodemkwaliteit en Verontreiniging"
- "Waterbeheer en Afwatering"
- "Ruimtelijke Ordening"
- "Klimaatadaptatie"
- "Natuur en Landschap"

Antwoord alleen met het label, zonder extra uitleg of aanhalingstekens.`;
}

/**
 * Generate a prompt for validating a label against domain knowledge
 */
export function getLabelValidationPrompt(
  label: string,
  summary: string,
  context: CommunityLabelingContext
): string {
  return `Je bent een expert in Nederlandse ruimtelijke ordening en beleid. Je valideert een semantisch label voor een community.

Label: "${label}"
Samenvatting: "${summary}"

Context:
- Entiteitstypen: ${context.entityTypes.join(', ')}
- Domein: ${context.domain || 'Niet gespecificeerd'}

Opdracht:
Beoordeel of dit label geschikt is voor deze community. Geef een score van 1-10 en een korte beoordeling.

Antwoord in JSON formaat:
{
  "score": <1-10>,
  "valid": <true/false>,
  "reasoning": "<korte uitleg>",
  "suggestions": ["<optioneel alternatief label 1>", "<optioneel alternatief label 2>"]
}`;
}
