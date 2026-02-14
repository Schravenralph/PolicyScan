/**
 * Service for executing SPARQL queries with GPT magic predicates
 * 
 * This service enables LLM-powered explanations and queries on GraphDB ontologies
 * using GraphDB's GPT SPARQL extensions (gpt:complete, gpt:prompt, etc.)
 * 
 * Prerequisites:
 * - GraphDB must be configured with LLM settings (graphdb.llm.* in graphdb.properties)
 * - OpenAI API key must be set in environment (OPENAI_API_KEY)
 * - Ontologies must be loaded into a named graph (default: http://data.ruimtemeesters.nl/ontologies/base)
 */

import { getGraphDBClient } from '../../../config/graphdb.js';

export interface OntologyClassExplanation {
  class: string;
  label?: string;
  explanation: string;
}

export interface OntologyPropertyExplanation {
  property: string;
  label?: string;
  explanation: string;
}

/**
 * GraphDB SPARQL query result row
 * The client.query() method returns Record<string, string>[], so all values are strings
 */
type GraphDBQueryResult = Record<string, string>;

/**
 * Service for GPT-enhanced SPARQL queries on ontologies
 */
export class OntologyGPTService {
  private readonly client = getGraphDBClient();
  private readonly defaultOntologyGraph = 'http://data.ruimtemeesters.nl/ontologies/base';

  /**
   * Generate human-readable explanations for ontology classes using GPT
   * 
   * @param ontologyGraph URI of the named graph containing ontologies (default: base ontology graph)
   * @param limit Maximum number of classes to explain (default: 20)
   * @param language Language for explanations (default: 'nl' for Dutch)
   * @returns Array of class explanations
   */
  async explainOntologyClasses(
    ontologyGraph: string = this.defaultOntologyGraph,
    limit: number = 20,
    language: 'nl' | 'en' = 'nl'
  ): Promise<OntologyClassExplanation[]> {
    const langInstruction = language === 'nl' 
      ? 'Leg in het Nederlands, voor een gemeentelijke beleidsmedewerker, uit wat deze ontologie-klasse betekent.'
      : 'Explain in English what this ontology class means for a municipal policy officer.';

    const query = `
      PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
      PREFIX owl:  <http://www.w3.org/2002/07/owl#>
      PREFIX gpt:  <http://www.ontotext.com/plugins/gpt#>

      SELECT ?class ?label ?explanation
      WHERE {
        GRAPH <${ontologyGraph}> {
          ?class a owl:Class .
          OPTIONAL { ?class rdfs:label ?label . }
          OPTIONAL { ?class rdfs:comment ?comment . }
        }

        BIND(
          gpt:complete(
            CONCAT(
              "${langInstruction}\\n",
              "URI: ", STR(?class), "\\n",
              "Label: ", COALESCE(STR(?label), "(geen label)"), "\\n",
              "Commentaar: ", COALESCE(STR(?comment), "(geen commentaar)"), "\\n",
              "Houd het kort (max 3 zinnen)."
            )
          ) AS ?explanation
        )
      }
      LIMIT ${limit}
    `;

    try {
      const results = await this.client.query(query);
      return results.map((result: GraphDBQueryResult) => ({
        class: result.class || '',
        label: result.label || undefined,
        explanation: result.explanation || 'Geen uitleg beschikbaar',
      }));
    } catch (error) {
      // If GPT predicates are not available, fall back to basic query
      if (error instanceof Error && (error.message.includes('gpt:') || error.message.includes('Unknown function'))) {
        console.warn('GPT predicates not available, falling back to basic query');
        return this.explainOntologyClassesBasic(ontologyGraph, limit);
      }
      throw error;
    }
  }

  /**
   * Fallback method that returns basic class information without GPT explanations
   */
  private async explainOntologyClassesBasic(
    ontologyGraph: string,
    limit: number
  ): Promise<OntologyClassExplanation[]> {
    const query = `
      PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
      PREFIX owl:  <http://www.w3.org/2002/07/owl#>

      SELECT ?class ?label ?comment
      WHERE {
        GRAPH <${ontologyGraph}> {
          ?class a owl:Class .
          OPTIONAL { ?class rdfs:label ?label . }
          OPTIONAL { ?class rdfs:comment ?comment . }
        }
      }
      LIMIT ${limit}
    `;

    const results = await this.client.query(query);
    return results.map((result: GraphDBQueryResult) => ({
      class: result.class || '',
      label: result.label || undefined,
      explanation: result.comment || result.label || 'Geen uitleg beschikbaar',
    }));
  }

  /**
   * Generate explanations for ontology properties using GPT
   * 
   * @param ontologyGraph URI of the named graph containing ontologies
   * @param limit Maximum number of properties to explain
   * @param language Language for explanations
   * @returns Array of property explanations
   */
  async explainOntologyProperties(
    ontologyGraph: string = this.defaultOntologyGraph,
    limit: number = 20,
    language: 'nl' | 'en' = 'nl'
  ): Promise<OntologyPropertyExplanation[]> {
    const langInstruction = language === 'nl'
      ? 'Leg in het Nederlands uit wat deze ontologie-eigenschap betekent en wanneer je deze gebruikt.'
      : 'Explain in English what this ontology property means and when to use it.';

    const query = `
      PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
      PREFIX owl:  <http://www.w3.org/2002/07/owl#>
      PREFIX gpt:  <http://www.ontotext.com/plugins/gpt#>

      SELECT ?property ?label ?explanation
      WHERE {
        GRAPH <${ontologyGraph}> {
          ?property a ?propertyType .
          FILTER (?propertyType IN (owl:ObjectProperty, owl:DatatypeProperty, rdf:Property))
          OPTIONAL { ?property rdfs:label ?label . }
          OPTIONAL { ?property rdfs:comment ?comment . }
          OPTIONAL { ?property rdfs:domain ?domain . }
          OPTIONAL { ?property rdfs:range ?range . }
        }

        BIND(
          gpt:complete(
            CONCAT(
              "${langInstruction}\\n",
              "URI: ", STR(?property), "\\n",
              "Label: ", COALESCE(STR(?label), "(geen label)"), "\\n",
              "Commentaar: ", COALESCE(STR(?comment), "(geen commentaar)"), "\\n",
              "Domein: ", COALESCE(STR(?domain), "(geen domein)"), "\\n",
              "Bereik: ", COALESCE(STR(?range), "(geen bereik)"), "\\n",
              "Houd het kort (max 3 zinnen)."
            )
          ) AS ?explanation
        )
      }
      LIMIT ${limit}
    `;

    try {
      const results = await this.client.query(query);
      return results.map((result: GraphDBQueryResult) => ({
        property: result.property || '',
        label: result.label || undefined,
        explanation: result.explanation || 'Geen uitleg beschikbaar',
      }));
    } catch (error) {
      if (error instanceof Error && (error.message.includes('gpt:') || error.message.includes('Unknown function'))) {
        console.warn('GPT predicates not available, falling back to basic query');
        return this.explainOntologyPropertiesBasic(ontologyGraph, limit);
      }
      throw error;
    }
  }

  /**
   * Fallback method for property explanations without GPT
   */
  private async explainOntologyPropertiesBasic(
    ontologyGraph: string,
    limit: number
  ): Promise<OntologyPropertyExplanation[]> {
    const query = `
      PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
      PREFIX owl:  <http://www.w3.org/2002/07/owl#>

      SELECT ?property ?label ?comment
      WHERE {
        GRAPH <${ontologyGraph}> {
          ?property a ?propertyType .
          FILTER (?propertyType IN (owl:ObjectProperty, owl:DatatypeProperty, rdf:Property))
          OPTIONAL { ?property rdfs:label ?label . }
          OPTIONAL { ?property rdfs:comment ?comment . }
        }
      }
      LIMIT ${limit}
    `;

    const results = await this.client.query(query);
    return results.map((result: GraphDBQueryResult) => ({
      property: result.property || '',
      label: result.label || undefined,
      explanation: result.comment || result.label || 'Geen uitleg beschikbaar',
    }));
  }

  /**
   * Execute a custom SPARQL query with GPT predicates
   * 
   * @param sparqlQuery SPARQL query string (may include gpt: predicates)
   * @returns Query results
   */
  async executeGPTQuery(sparqlQuery: string): Promise<Record<string, string>[]> {
    return await this.client.query(sparqlQuery);
  }

  /**
   * Generate a natural language explanation for a specific ontology class
   * 
   * @param classUri URI of the ontology class to explain
   * @param ontologyGraph Named graph containing the ontology
   * @param language Language for explanation
   * @returns Explanation string
   */
  async explainClass(
    classUri: string,
    ontologyGraph: string = this.defaultOntologyGraph,
    language: 'nl' | 'en' = 'nl'
  ): Promise<string> {
    const langInstruction = language === 'nl'
      ? 'Leg in het Nederlands, voor een gemeentelijke beleidsmedewerker, uit wat deze ontologie-klasse betekent.'
      : 'Explain in English what this ontology class means for a municipal policy officer.';

    const query = `
      PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
      PREFIX owl:  <http://www.w3.org/2002/07/owl#>
      PREFIX gpt:  <http://www.ontotext.com/plugins/gpt#>

      SELECT ?explanation
      WHERE {
        GRAPH <${ontologyGraph}> {
          <${classUri}> a owl:Class .
          OPTIONAL { <${classUri}> rdfs:label ?label . }
          OPTIONAL { <${classUri}> rdfs:comment ?comment . }
        }

        BIND(
          gpt:complete(
            CONCAT(
              "${langInstruction}\\n",
              "URI: ${classUri}\\n",
              "Label: ", COALESCE(STR(?label), "(geen label)"), "\\n",
              "Commentaar: ", COALESCE(STR(?comment), "(geen commentaar)"), "\\n",
              "Houd het kort (max 3 zinnen)."
            )
          ) AS ?explanation
        )
      }
    `;

    try {
      const results = await this.client.query(query);
      if (results.length > 0 && results[0].explanation) {
        return results[0].explanation;
      }
      return 'Geen uitleg beschikbaar';
    } catch (error) {
      if (error instanceof Error && (error.message.includes('gpt:') || error.message.includes('Unknown function'))) {
        // Fallback to basic query
        const basicQuery = `
          PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
          PREFIX owl:  <http://www.w3.org/2002/07/owl#>

          SELECT ?label ?comment
          WHERE {
            GRAPH <${ontologyGraph}> {
              <${classUri}> a owl:Class .
              OPTIONAL { <${classUri}> rdfs:label ?label . }
              OPTIONAL { <${classUri}> rdfs:comment ?comment . }
            }
          }
        `;
        const results = await this.client.query(basicQuery);
        if (results.length > 0) {
          return results[0].comment || results[0].label || 'Geen uitleg beschikbaar';
        }
      }
      throw error;
    }
  }

  /**
   * List all named graphs containing ontologies
   * 
   * @returns Array of graph URIs
   */
  async listOntologyGraphs(): Promise<string[]> {
    const query = `
      SELECT DISTINCT ?g
      WHERE {
        GRAPH ?g {
          ?s a <http://www.w3.org/2002/07/owl#Class>
        }
      }
    `;

    const results = await this.client.query(query);
    return results.map((result: GraphDBQueryResult) => result.g || '');
  }
}

// Singleton instance
let ontologyGPTService: OntologyGPTService | null = null;

/**
 * Get the singleton OntologyGPTService instance
 */
export function getOntologyGPTService(): OntologyGPTService {
  if (!ontologyGPTService) {
    ontologyGPTService = new OntologyGPTService();
  }
  return ontologyGPTService;
}

