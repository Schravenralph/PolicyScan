/**
 * NarrativeFormatter Service
 * 
 * Centralizes narrative formatting logic for consistent user-friendly messages.
 * Transforms technical logs into explanatory narratives that explain:
 * - What is happening (intent)
 * - Why it's happening (context)
 * - What will happen next (next steps)
 */

export interface StepIntentParams {
  stepName: string;
  stepId?: string;
  stepNumber?: number;
  purpose: string;
  action: string;
}

export interface FindingsSummaryParams {
  count: number;
  type: 'documents' | 'items' | 'nodes' | 'clusters' | 'websites';
  examples: Array<{
    title: string;
    author?: string;
    municipality?: string;
    description?: string;
  }>;
  whyItMatters?: string;
}

export interface ProgressUpdateParams {
  completed: string;
  next: string;
  why?: string;
}

export interface StepCompletionParams {
  stepName: string;
  results: string;
  nextStep?: string;
  nextAction?: string;
}

export class NarrativeFormatter {
  /**
   * Format step starting message with intent-first explanation
   * 
   * Format: "In this step, we are trying to achieve X. To do that, we will now Y."
   */
  formatStepIntent(params: StepIntentParams): {
    formattedMessage: string;
    thoughtBubble: string;
  } {
    const { stepName, stepId, stepNumber, purpose, action } = params;
    
    // Build step identifier
    const stepIdentifier = stepNumber 
      ? `Stap ${stepNumber}: ${stepName}`
      : stepName;
    
    // Format main message directly in Dutch
    const formattedMessage = stepNumber
      ? `Stap ${stepNumber}: ${stepName} - ${purpose}. We gaan nu ${action} uitvoeren.`
      : `${stepName} - ${purpose}. We gaan nu ${action} uitvoeren.`;
    
    // Build thought bubble with intent-first explanation
    let thoughtBubble = `In deze stap proberen we ${purpose}. `;
    thoughtBubble += `Om dat te bereiken, gaan we nu ${action}. `;
    
    if (stepNumber) {
      thoughtBubble += `Dit is stap ${stepNumber} van de workflow. `;
    }
    
    thoughtBubble += `Dit helpt omdat we hiermee de informatie krijgen die we nodig hebben voor de volgende stappen.`;
    
    return {
      formattedMessage,
      thoughtBubble
    };
  }

  /**
   * Format findings summary with examples instead of exhaustive lists
   * 
   * When >5 items found, shows summary with 3 representative examples
   */
  formatFindingsSummary(params: FindingsSummaryParams): {
    formattedMessage: string;
    thoughtBubble: string;
  } {
    const { count, type, examples, whyItMatters } = params;
    
    const typeMap: Record<FindingsSummaryParams['type'], string> = {
      documents: 'documenten',
      items: 'items',
      nodes: 'pagina\'s',
      clusters: 'clusters',
      websites: 'websites'
    };
    
    const typeDesc = typeMap[type] || type;
    
    // Format examples
    const exampleTexts = examples.slice(0, 3).map((ex, idx) => {
      let text = `${idx + 1}. ${ex.title}`;
      if (ex.author || ex.municipality) {
        text += ` (${ex.author || ex.municipality})`;
      }
      if (ex.description) {
        text += ` - ${ex.description.substring(0, 100)}${ex.description.length > 100 ? '...' : ''}`;
      }
      return text;
    });
    
    const examplesJson = JSON.stringify(examples.slice(0, 3));
    
    // Format main message
    const formattedMessage = count > 5
      ? `${count} ${type} gevonden (samenvatting met voorbeelden): ${examplesJson}`
      : `${count} ${type} gevonden`;
    
    // Build thought bubble
    let thoughtBubble = `Uitstekend! Ik heb ${count} relevante ${typeDesc} gevonden. `;
    
    if (count > 5 && examples.length > 0) {
      thoughtBubble += `Hier zijn enkele voorbeelden:\n\n${exampleTexts.join('\n\n')}\n\n`;
    }
    
    if (whyItMatters) {
      thoughtBubble += `${whyItMatters} `;
    } else {
      thoughtBubble += `Deze ${typeDesc} zien er veelbelovend uit - ik zal nu elk item onderzoeken om de daadwerkelijke inhoud te extraheren en te bepalen hoe relevant ze zijn voor uw zoekopdracht. `;
    }
    
    thoughtBubble += `Ik zal de inhoud analyseren op relevantie, kwaliteit en volledigheid.`;
    
    return {
      formattedMessage,
      thoughtBubble
    };
  }

  /**
   * Format progress update with context about what was completed and what's next
   */
  formatProgressUpdate(params: ProgressUpdateParams): {
    formattedMessage: string;
    thoughtBubble: string;
  } {
    const { completed, next, why } = params;
    
    const formattedMessage = `Voortgang: ${completed} voltooid, volgende: ${next}`;
    
    let thoughtBubble = `Ik heb zojuist ${completed} voltooid. `;
    
    if (why) {
      thoughtBubble += `Dit helpt omdat ${why}. `;
    }
    
    thoughtBubble += `De volgende stap zal ${next} uitvoeren.`;
    
    return {
      formattedMessage,
      thoughtBubble
    };
  }

  /**
   * Format step completion with results and next step context
   */
  formatStepCompletion(params: StepCompletionParams): {
    formattedMessage: string;
    thoughtBubble: string;
  } {
    const { stepName, results, nextStep, nextAction } = params;
    
    const formattedMessage = `Stap voltooid: ${stepName}`;
    
    let thoughtBubble = `Ik heb "${stepName}" voltooid. `;
    thoughtBubble += `${results} `;
    
    if (nextStep && nextAction) {
      thoughtBubble += `De volgende stap (${nextStep}) zal ${nextAction} uitvoeren. `;
    } else if (nextAction) {
      thoughtBubble += `De volgende stap zal ${nextAction} uitvoeren. `;
    } else {
      thoughtBubble += `De resultaten zijn nu beschikbaar voor de volgende stap. `;
    }
    
    thoughtBubble += `Dit helpt omdat we hiermee verder kunnen bouwen op wat we hebben gevonden.`;
    
    return {
      formattedMessage,
      thoughtBubble
    };
  }

  /**
   * Extract step purpose from step name and action
   * This is a helper to infer purpose when not explicitly provided
   */
  inferStepPurpose(stepName: string, action?: string): string {
    const stepLower = stepName.toLowerCase();
    const actionLower = action?.toLowerCase() || '';
    
    // Common patterns for step purposes
    if (stepLower.includes('scan') || stepLower.includes('zoek') || actionLower.includes('search')) {
      return 'relevante documenten en informatie te vinden';
    }
    if (stepLower.includes('explore') || stepLower.includes('verkenn') || actionLower.includes('explore')) {
      return 'nieuwe pagina\'s en verbindingen te ontdekken';
    }
    if (stepLower.includes('filter') || stepLower.includes('score') || actionLower.includes('filter')) {
      return 'de meest relevante resultaten te identificeren';
    }
    if (stepLower.includes('merge') || stepLower.includes('categorize') || actionLower.includes('merge')) {
      return 'alle gevonden informatie samen te voegen en te organiseren';
    }
    if (stepLower.includes('enrich') || stepLower.includes('verrijk') || actionLower.includes('enrich')) {
      // Check if this is DSO enrichment specifically
      if (stepLower.includes('dso') || actionLower.includes('dso')) {
        return 'documenten te verrijken met volledige tekst, regels, activiteiten en regelingsgebieden om gestructureerde zoekopdrachten en betere documentanalyse mogelijk te maken';
      }
      return 'bestaande documenten te verrijken met aanvullende informatie';
    }
    if (stepLower.includes('save') || stepLower.includes('opslaan') || actionLower.includes('save')) {
      return 'de resultaten op te slaan voor verdere analyse';
    }
    
    // Default fallback
    return 'de workflow voort te zetten';
  }

  /**
   * Log document findings with summarization when >5 items
   * This is a convenience method that formats and logs in one call
   */
  async logFindingsSummary(
    runManager: { log: (runId: string, message: string, level: 'info' | 'warn' | 'error' | 'debug') => Promise<void> },
    runId: string,
    documents: Array<{
      title?: string;
      titel?: string;
      issuingAuthority?: string;
      municipality?: string;
      samenvatting?: string;
      summary?: string;
      description?: string;
      [key: string]: unknown;
    }>,
    type: FindingsSummaryParams['type'] = 'documents',
    source?: string
  ): Promise<void> {
    if (documents.length === 0) {
      await runManager.log(runId, `0 ${type} gevonden`, 'info');
      return;
    }

    if (documents.length <= 5) {
      // Small list - log all
      await runManager.log(runId, `${documents.length} ${type} gevonden`, 'info');
      return;
    }

    // Large list - summarize with examples
    const examples = documents.slice(0, 3).map(doc => ({
      title: doc.title || doc.titel || 'Onbekend',
      author: doc.issuingAuthority || doc.municipality,
      description: (doc.samenvatting || doc.summary || doc.description || '').substring(0, 100)
    }));

    const summary = this.formatFindingsSummary({
      count: documents.length,
      type,
      examples,
      whyItMatters: source 
        ? `Deze documenten komen van ${source} en zijn relevant voor uw zoekopdracht.`
        : undefined
    });

    await runManager.log(runId, summary.formattedMessage, 'info');
  }

  /**
   * Extract action description from action name
   */
  inferActionDescription(action: string): string {
    const actionLower = action.toLowerCase();
    
    // Common action patterns
    if (actionLower.includes('search_dso')) {
      return 'zoeken in de DSO Omgevingsdocumenten database';
    }
    if (actionLower.includes('search_iplo')) {
      return 'zoeken in de IPLO beleidsdocumentendatabase';
    }
    if (actionLower.includes('scan_known')) {
      return 'geselecteerde websites te scannen';
    }
    if (actionLower.includes('merge_score')) {
      return 'alle documenten samen te voegen, te scoren en te categoriseren';
    }
    if (actionLower.includes('enrich')) {
      // Check if this is DSO enrichment specifically
      if (actionLower.includes('dso')) {
        return 'de top-K documenten te downloaden en verrijken met volledige tekst, regels, activiteiten en regelingsgebieden';
      }
      return 'documenten te verrijken met aanvullende informatie';
    }
    if (actionLower.includes('search_officiele')) {
      return 'officiële bekendmakingen te doorzoeken';
    }
    if (actionLower.includes('search_rechtspraak')) {
      return 'jurisprudentie te doorzoeken';
    }
    
    // Default fallback
    return action.replace(/_/g, ' ');
  }
}
