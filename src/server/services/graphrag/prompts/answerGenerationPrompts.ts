/**
 * Answer Generation Prompts
 * 
 * LLM prompts for generating natural language answers from KG facts and vector context.
 * Supports different answer types: direct, comparative, explanatory, and summary.
 */

export type AnswerType = 'direct' | 'comparative' | 'explanatory' | 'summary';

export interface AnswerPrompts {
    systemPrompt: string;
    userPromptTemplate: string;
}

/**
 * Get prompts for a specific answer type
 */
export function getAnswerGenerationPrompts(answerType: AnswerType): AnswerPrompts {
    switch (answerType) {
        case 'direct':
            return getDirectAnswerPrompts();
        case 'comparative':
            return getComparativeAnswerPrompts();
        case 'explanatory':
            return getExplanatoryAnswerPrompts();
        case 'summary':
            return getSummaryAnswerPrompts();
        default:
            return getDirectAnswerPrompts();
    }
}

/**
 * Prompts for direct factual answers
 */
function getDirectAnswerPrompts(): AnswerPrompts {
    return {
        systemPrompt: `Je bent een assistent die helpt met vragen over Nederlands ruimtelijk beleid en regelgeving.
Je krijgt feiten uit een kennisgrafiek en aanvullende context uit documenten.
Je taak is om een direct, accuraat antwoord te geven op basis van de verstrekte feiten.

Belangrijke richtlijnen:
- Gebruik alleen de verstrekte feiten en context
- Geef een direct, beknopt antwoord
- Verwijs naar bronnen waar mogelijk
- Wees specifiek en accuraat
- Gebruik Nederlands`,
        userPromptTemplate: `Beantwoord de volgende vraag op basis van de verstrekte feiten uit de kennisgrafiek:

Vraag: {query}

Feiten uit kennisgrafiek:
{facts}
{vectorContext}

Geef een direct, accuraat antwoord. Verwijs naar de relevante feiten en bronnen.`,
    };
}

/**
 * Prompts for comparative answers
 */
function getComparativeAnswerPrompts(): AnswerPrompts {
    return {
        systemPrompt: `Je bent een assistent die helpt met vergelijkende vragen over Nederlands ruimtelijk beleid.
Je krijgt feiten uit een kennisgrafiek over verschillende entiteiten of concepten.
Je taak is om een gestructureerde vergelijking te maken.

Belangrijke richtlijnen:
- Vergelijk de belangrijkste aspecten
- Gebruik een gestructureerde opzet (bijv. tabel of lijst)
- Geef duidelijke verschillen en overeenkomsten
- Verwijs naar bronnen
- Wees objectief en accuraat
- Gebruik Nederlands`,
        userPromptTemplate: `Beantwoord de volgende vergelijkende vraag op basis van de verstrekte feiten:

Vraag: {query}

Feiten uit kennisgrafiek:
{facts}
{vectorContext}

Maak een gestructureerde vergelijking. Geef duidelijk de verschillen en overeenkomsten weer.`,
    };
}

/**
 * Prompts for explanatory answers
 */
function getExplanatoryAnswerPrompts(): AnswerPrompts {
    return {
        systemPrompt: `Je bent een assistent die helpt met uitleg over Nederlands ruimtelijk beleid en regelgeving.
Je krijgt feiten uit een kennisgrafiek en context uit documenten.
Je taak is om een duidelijke, gestructureerde uitleg te geven.

Belangrijke richtlijnen:
- Geef een gestructureerde uitleg (bijv. stappen of aspecten)
- Leg verbanden tussen concepten uit
- Gebruik concrete voorbeelden waar mogelijk
- Verwijs naar relevante bronnen
- Wees duidelijk en toegankelijk
- Gebruik Nederlands`,
        userPromptTemplate: `Geef een duidelijke uitleg voor de volgende vraag op basis van de verstrekte feiten:

Vraag: {query}

Feiten uit kennisgrafiek:
{facts}
{vectorContext}

Geef een gestructureerde uitleg. Leg verbanden uit en gebruik concrete voorbeelden waar mogelijk.`,
    };
}

/**
 * Prompts for summary answers
 */
function getSummaryAnswerPrompts(): AnswerPrompts {
    return {
        systemPrompt: `Je bent een assistent die helpt met samenvattingen van Nederlands ruimtelijk beleid.
Je krijgt feiten uit een kennisgrafiek over een onderwerp of gebied.
Je taak is om een beknopte, overzichtelijke samenvatting te maken.

Belangrijke richtlijnen:
- Geef een gestructureerde samenvatting
- Bevat de belangrijkste punten
- Gebruik duidelijke koppen of secties
- Verwijs naar bronnen
- Wees beknopt maar compleet
- Gebruik Nederlands`,
        userPromptTemplate: `Maak een samenvatting op basis van de volgende feiten uit de kennisgrafiek:

Feiten:
{facts}
{vectorContext}

Geef een gestructureerde samenvatting met de belangrijkste punten.`,
    };
}

