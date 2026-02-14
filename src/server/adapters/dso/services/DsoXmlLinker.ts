/**
 * DSO XML Linker Service
 * 
 * Extracts and creates links between rules, activities, and regulation areas from DSO XML files.
 * 
 * Links created:
 * - Rules → Activities (which activities do rules apply to)
 * - Rules → Regulation Areas (which areas do rules apply to)
 * - Rules → Rule Texts (link rules to their full text content)
 * - Activities → Rules (reverse link: which rules apply to activities)
 * - Areas → Rules (reverse link: which rules apply to areas)
 * 
 * @see docs/30-dso-omgevingsdocument-downloaden/DSO-XML-DATA-USAGE-ANALYSIS.md
 */

import { logger } from '../../../utils/logger.js';
import type { ParsedXmlFile } from '../DsoZipParser.js';

/**
 * Rule with links to activities and areas
 */
export interface LinkedRule {
  identificatie: string;
  titel?: string;
  type?: string;
  hasTekst?: boolean;
  activityIds?: string[];
  areaIds?: string[];
  textId?: string;
}

/**
 * Activity with links to rules
 */
export interface LinkedActivity {
  identificatie: string;
  naam?: string;
  ruleIds?: string[];
}

/**
 * Regulation area with links to rules
 */
export interface LinkedRegulationArea {
  identificatie: string;
  naam?: string;
  ruleIds?: string[];
  hasGeometry?: boolean;
}

/**
 * Rule text with link to rule
 */
export interface LinkedRuleText {
  identificatie: string;
  regelId?: string;
  hasTekst?: boolean;
  tekstLength?: number;
}

/**
 * Linked XML data structure
 */
export interface LinkedXmlData {
  rules: LinkedRule[];
  activities: LinkedActivity[];
  regulationAreas: LinkedRegulationArea[];
  ruleTexts: LinkedRuleText[];
  links: {
    rulesByActivity: Record<string, string[]>; // activityId → ruleIds[]
    rulesByArea: Record<string, string[]>; // areaId → ruleIds[]
    activitiesByRule: Record<string, string[]>; // ruleId → activityIds[]
    areasByRule: Record<string, string[]>; // ruleId → areaIds[]
    textByRule: Record<string, string>; // ruleId → textId
  };
  statistics: {
    totalRules: number;
    totalActivities: number;
    totalAreas: number;
    totalRuleTexts: number;
    rulesWithActivities: number;
    rulesWithAreas: number;
    rulesWithTexts: number;
    activitiesWithRules: number;
    areasWithRules: number;
  };
}

/**
 * DSO XML Linker Service
 */
export class DsoXmlLinker {
  /**
   * Extract and link rules, activities, and areas from parsed XML files
   * 
   * @param allXmlFiles - All parsed XML files from DSO ZIP
   * @returns Linked XML data with bidirectional links
   */
  extractAndLink(allXmlFiles: ParsedXmlFile[]): LinkedXmlData {
    logger.info(
      { xmlFileCount: allXmlFiles.length },
      '[DsoXmlLinker] Starting extraction and linking of rules, activities, and areas'
    );

    const startTime = Date.now();

    // Step 1: Extract rules from regelsvooriedereen.xml
    logger.debug('[DsoXmlLinker] Step 1: Extracting rules from regelsvooriedereen.xml');
    const rules = this.extractRules(allXmlFiles);
    logger.info(
      { ruleCount: rules.length },
      '[DsoXmlLinker] Step 1 complete: Extracted rules'
    );

    // Step 2: Extract activities from activiteiten.xml
    logger.debug('[DsoXmlLinker] Step 2: Extracting activities from activiteiten.xml');
    const activities = this.extractActivities(allXmlFiles);
    logger.info(
      { activityCount: activities.length },
      '[DsoXmlLinker] Step 2 complete: Extracted activities'
    );

    // Step 3: Extract regulation areas from regelingsgebieden.xml
    logger.debug('[DsoXmlLinker] Step 3: Extracting regulation areas from regelingsgebieden.xml');
    const regulationAreas = this.extractRegulationAreas(allXmlFiles);
    logger.info(
      { areaCount: regulationAreas.length },
      '[DsoXmlLinker] Step 3 complete: Extracted regulation areas'
    );

    // Step 4: Extract rule texts from regelteksten.xml
    logger.debug('[DsoXmlLinker] Step 4: Extracting rule texts from regelteksten.xml');
    const ruleTexts = this.extractRuleTexts(allXmlFiles);
    logger.info(
      { textCount: ruleTexts.length },
      '[DsoXmlLinker] Step 4 complete: Extracted rule texts'
    );

    // Step 5: Link rules to areas (from regelingsgebieden.xml regelIds)
    logger.debug('[DsoXmlLinker] Step 5: Linking rules to regulation areas');
    const { rulesWithAreas, areasByRule, rulesByArea } = this.linkRulesToAreas(rules, regulationAreas);
    logger.info(
      { linkedCount: rulesWithAreas.filter(r => r.areaIds && r.areaIds.length > 0).length, totalLinks: Object.keys(areasByRule).length },
      '[DsoXmlLinker] Step 5 complete: Linked rules to areas'
    );

    // Step 6: Link rules to rule texts (from regelteksten.xml regelId)
    logger.debug('[DsoXmlLinker] Step 6: Linking rules to rule texts');
    const { rulesWithTexts, textByRule } = this.linkRulesToTexts(rulesWithAreas, ruleTexts);
    logger.info(
      { linkedCount: rulesWithTexts.filter(r => r.textId).length, totalLinks: Object.keys(textByRule).length },
      '[DsoXmlLinker] Step 6 complete: Linked rules to texts'
    );

    // Step 7: Link rules to activities (if activity references exist in rules)
    logger.debug('[DsoXmlLinker] Step 7: Linking rules to activities');
    const { rulesWithActivities, activitiesByRule, rulesByActivity } = this.linkRulesToActivities(rulesWithTexts, activities);
    logger.info(
      { linkedCount: rulesWithActivities.filter(r => r.activityIds && r.activityIds.length > 0).length, totalLinks: Object.keys(activitiesByRule).length },
      '[DsoXmlLinker] Step 7 complete: Linked rules to activities'
    );

    // Step 8: Calculate statistics
    logger.debug('[DsoXmlLinker] Step 8: Calculating statistics');
    const statistics = this.calculateStatistics(
      rules,
      activities,
      regulationAreas,
      ruleTexts,
      rulesWithActivities,
      rulesWithAreas,
      rulesWithTexts
    );
    logger.info(
      { statistics },
      '[DsoXmlLinker] Step 8 complete: Calculated statistics'
    );

    const endTime = Date.now();
    const duration = endTime - startTime;

    logger.info(
      {
        duration,
        statistics,
        linksCreated: {
          rulesByActivity: Object.keys(rulesByActivity).length,
          rulesByArea: Object.keys(rulesByArea).length,
          activitiesByRule: Object.keys(activitiesByRule).length,
          areasByRule: Object.keys(areasByRule).length,
          textByRule: Object.keys(textByRule).length,
        },
      },
      '[DsoXmlLinker] Extraction and linking complete'
    );

    return {
      rules: rulesWithActivities, // Use fully linked rules
      activities,
      regulationAreas,
      ruleTexts,
      links: {
        rulesByActivity,
        rulesByArea,
        activitiesByRule,
        areasByRule,
        textByRule,
      },
      statistics,
    };
  }

  /**
   * Extract rules from regelsvooriedereen.xml
   */
  private extractRules(allXmlFiles: ParsedXmlFile[]): LinkedRule[] {
    const rulesFile = allXmlFiles.find(f =>
      f.filename.toLowerCase().includes('regelsvooriedereen.xml')
    );

    if (!rulesFile || !rulesFile.parsed) {
      logger.debug('[DsoXmlLinker] No regelsvooriedereen.xml found');
      return [];
    }

    const parsed = rulesFile.parsed as Record<string, unknown>;
    let regels: unknown[] = [];

    if (Array.isArray(parsed)) {
      regels = parsed;
    } else if (parsed['regels'] || parsed['Regels'] || parsed['regelsVoorIedereen']) {
      const rules = parsed['regels'] || parsed['Regels'] || parsed['regelsVoorIedereen'];
      regels = Array.isArray(rules) ? rules : [rules];
    } else if (parsed['_embedded'] && typeof parsed['_embedded'] === 'object') {
      const embedded = parsed['_embedded'] as Record<string, unknown>;
      if (embedded['regels']) {
        const rules = embedded['regels'];
        regels = Array.isArray(rules) ? rules : [rules];
      }
    }

    logger.debug({ ruleCount: regels.length }, '[DsoXmlLinker] Found rules in XML');

    return regels
      .filter((r): r is Record<string, unknown> => typeof r === 'object' && r !== null)
      .map(r => {
        // Extract activity IDs from various potential fields
        let activityIds: string[] = [];

        // 1. Array of IDs (e.g. activiteitIds: ["act-1", "act-2"])
        if (Array.isArray(r['activiteitIds'])) {
          activityIds = activityIds.concat(r['activiteitIds'].map(String));
        }

        // 2. Single ID (e.g. activiteitId: "act-1")
        if (r['activiteitId']) {
          activityIds.push(String(r['activiteitId']));
        }

        // 3. Array of objects (e.g. activiteiten: [{ identificatie: "act-1" }])
        const activiteiten = r['activiteiten'] || r['gerelateerdeActiviteiten'] || r['gerelateerdeActiviteit'];
        if (Array.isArray(activiteiten)) {
          for (const act of activiteiten) {
            if (typeof act === 'object' && act !== null) {
              const id = (act as Record<string, unknown>)['identificatie'] || (act as Record<string, unknown>)['id'];
              if (id) {
                activityIds.push(String(id));
              }
            } else if (typeof act === 'string') {
              activityIds.push(act);
            }
          }
        } else if (typeof activiteiten === 'object' && activiteiten !== null) {
          // Single object
          const id = (activiteiten as Record<string, unknown>)['identificatie'] || (activiteiten as Record<string, unknown>)['id'];
          if (id) {
            activityIds.push(String(id));
          }
        }

        return {
          identificatie: String(r['identificatie'] || r['id'] || ''),
          titel: r['titel'] || r['title'] ? String(r['titel'] || r['title']) : undefined,
          type: r['type'] || r['soort'] ? String(r['type'] || r['soort']) : undefined,
          hasTekst: !!(r['tekst'] || r['text'] || r['inhoud']),
          activityIds: [...new Set(activityIds)], // Deduplicate
        };
      })
      .filter(r => r.identificatie); // Only include rules with identifiers
  }

  /**
   * Extract activities from activiteiten.xml
   */
  private extractActivities(allXmlFiles: ParsedXmlFile[]): LinkedActivity[] {
    const activitiesFile = allXmlFiles.find(f =>
      f.filename.toLowerCase().includes('activiteiten.xml')
    );

    if (!activitiesFile || !activitiesFile.parsed) {
      logger.debug('[DsoXmlLinker] No activiteiten.xml found');
      return [];
    }

    const parsed = activitiesFile.parsed as Record<string, unknown>;
    let activities: unknown[] = [];

    if (Array.isArray(parsed)) {
      activities = parsed;
    } else if (parsed['activiteiten'] || parsed['Activiteiten']) {
      const activiteiten = parsed['activiteiten'] || parsed['Activiteiten'];
      activities = Array.isArray(activiteiten) ? activiteiten : [activiteiten];
    } else if (parsed['_embedded'] && typeof parsed['_embedded'] === 'object') {
      const embedded = parsed['_embedded'] as Record<string, unknown>;
      if (embedded['activiteiten']) {
        const activiteiten = embedded['activiteiten'];
        activities = Array.isArray(activiteiten) ? activiteiten : [activiteiten];
      }
    }

    logger.debug({ activityCount: activities.length }, '[DsoXmlLinker] Found activities in XML');

    return activities
      .filter((a): a is Record<string, unknown> => typeof a === 'object' && a !== null)
      .map(a => ({
        identificatie: String(a['identificatie'] || a['id'] || a['identifier'] || ''),
        naam: a['naam'] || a['name'] || a['titel'] ? String(a['naam'] || a['name'] || a['titel']) : undefined,
      }))
      .filter(a => a.identificatie); // Only include activities with identifiers
  }

  /**
   * Extract regulation areas from regelingsgebieden.xml
   */
  private extractRegulationAreas(allXmlFiles: ParsedXmlFile[]): LinkedRegulationArea[] {
    const areasFile = allXmlFiles.find(f =>
      f.filename.toLowerCase().includes('regelingsgebieden.xml')
    );

    if (!areasFile || !areasFile.parsed) {
      logger.debug('[DsoXmlLinker] No regelingsgebieden.xml found');
      return [];
    }

    const parsed = areasFile.parsed as Record<string, unknown>;
    let areas: unknown[] = [];

    if (Array.isArray(parsed)) {
      areas = parsed;
    } else if (parsed['regelingsgebieden'] || parsed['Regelingsgebieden']) {
      const regelingsgebieden = parsed['regelingsgebieden'] || parsed['Regelingsgebieden'];
      areas = Array.isArray(regelingsgebieden) ? regelingsgebieden : [regelingsgebieden];
    }

    logger.debug({ areaCount: areas.length }, '[DsoXmlLinker] Found regulation areas in XML');

    return areas
      .filter((a): a is Record<string, unknown> => typeof a === 'object' && a !== null)
      .map(a => {
        const regelIds = a['regelIds'] || a['regel_ids'];
        const ruleIds = Array.isArray(regelIds) 
          ? regelIds.map(id => String(id)).filter(Boolean)
          : undefined;

        return {
          identificatie: String(a['identificatie'] || a['id'] || ''),
          naam: a['naam'] || a['name'] || a['titel'] ? String(a['naam'] || a['name'] || a['titel']) : undefined,
          ruleIds,
          hasGeometry: !!(a['geometrie'] || a['geometry'] || a['geo']),
        };
      })
      .filter(a => a.identificatie); // Only include areas with identifiers
  }

  /**
   * Extract rule texts from regelteksten.xml
   */
  private extractRuleTexts(allXmlFiles: ParsedXmlFile[]): LinkedRuleText[] {
    const textsFile = allXmlFiles.find(f =>
      f.filename.toLowerCase().includes('regelteksten.xml')
    );

    if (!textsFile || !textsFile.parsed) {
      logger.debug('[DsoXmlLinker] No regelteksten.xml found');
      return [];
    }

    const parsed = textsFile.parsed as Record<string, unknown>;
    let texts: unknown[] = [];

    if (Array.isArray(parsed)) {
      texts = parsed;
    } else if (parsed['regelteksten'] || parsed['Regelteksten']) {
      const regelteksten = parsed['regelteksten'] || parsed['Regelteksten'];
      texts = Array.isArray(regelteksten) ? regelteksten : [regelteksten];
    }

    logger.debug({ textCount: texts.length }, '[DsoXmlLinker] Found rule texts in XML');

    return texts
      .filter((t): t is Record<string, unknown> => typeof t === 'object' && t !== null)
      .map(t => {
        const tekst = t['tekst'] || t['text'] || t['inhoud'];
        const tekstStr = typeof tekst === 'string' ? tekst : '';
        return {
          identificatie: String(t['identificatie'] || t['id'] || ''),
          regelId: t['regelId'] || t['regel_id'] ? String(t['regelId'] || t['regel_id']) : undefined,
          hasTekst: !!tekstStr,
          tekstLength: tekstStr.length,
        };
      })
      .filter(t => t.identificatie); // Only include texts with identifiers
  }

  /**
   * Link rules to regulation areas (from regelingsgebieden.xml regelIds)
   */
  private linkRulesToAreas(
    rules: LinkedRule[],
    areas: LinkedRegulationArea[]
  ): {
    rulesWithAreas: LinkedRule[];
    areasByRule: Record<string, string[]>;
    rulesByArea: Record<string, string[]>;
  } {
    const areasByRule: Record<string, string[]> = {};
    const rulesByArea: Record<string, string[]> = {};

    // Build links from areas (which have regelIds)
    for (const area of areas) {
      if (area.ruleIds && area.ruleIds.length > 0) {
        // Initialize area's rule list
        if (!rulesByArea[area.identificatie]) {
          rulesByArea[area.identificatie] = [];
        }

        for (const ruleId of area.ruleIds) {
          // Link rule → area
          if (!areasByRule[ruleId]) {
            areasByRule[ruleId] = [];
          }
          if (!areasByRule[ruleId].includes(area.identificatie)) {
            areasByRule[ruleId].push(area.identificatie);
          }

          // Link area → rule
          if (!rulesByArea[area.identificatie].includes(ruleId)) {
            rulesByArea[area.identificatie].push(ruleId);
          }
        }
      }
    }

    // Update rules with area links
    const rulesWithAreas = rules.map(rule => ({
      ...rule,
      areaIds: areasByRule[rule.identificatie] || [],
    }));

    logger.debug(
      {
        rulesWithAreas: rulesWithAreas.filter(r => r.areaIds.length > 0).length,
        totalLinks: Object.keys(areasByRule).length,
      },
      '[DsoXmlLinker] Linked rules to areas'
    );

    return { rulesWithAreas, areasByRule, rulesByArea };
  }

  /**
   * Link rules to rule texts (from regelteksten.xml regelId)
   */
  private linkRulesToTexts(
    rules: LinkedRule[],
    texts: LinkedRuleText[]
  ): {
    rulesWithTexts: LinkedRule[];
    textByRule: Record<string, string>;
  } {
    const textByRule: Record<string, string> = {};

    // Build links from texts (which have regelId)
    for (const text of texts) {
      if (text.regelId) {
        textByRule[text.regelId] = text.identificatie;
      }
    }

    // Update rules with text links
    const rulesWithTexts = rules.map(rule => ({
      ...rule,
      textId: textByRule[rule.identificatie],
    }));

    logger.debug(
      {
        rulesWithTexts: rulesWithTexts.filter(r => r.textId).length,
        totalLinks: Object.keys(textByRule).length,
      },
      '[DsoXmlLinker] Linked rules to texts'
    );

    return { rulesWithTexts, textByRule };
  }

  /**
   * Link rules to activities (if activity references exist in rules)
   * 
   * Extracts activity references from rules and builds bidirectional links.
   */
  private linkRulesToActivities(
    rules: LinkedRule[],
    activities: LinkedActivity[]
  ): {
    rulesWithActivities: LinkedRule[];
    activitiesByRule: Record<string, string[]>;
    rulesByActivity: Record<string, string[]>;
  } {
    const activitiesByRule: Record<string, string[]> = {};
    const rulesByActivity: Record<string, string[]> = {};

    // Initialize rulesByActivity for all known activities
    for (const activity of activities) {
      rulesByActivity[activity.identificatie] = [];
    }

    // Build links from rules (which have activityIds extracted in extractRules)
    for (const rule of rules) {
      if (rule.activityIds && rule.activityIds.length > 0) {
        // Link rule → activities
        activitiesByRule[rule.identificatie] = [...rule.activityIds];

        // Link activities → rule
        for (const activityId of rule.activityIds) {
          if (!rulesByActivity[activityId]) {
            rulesByActivity[activityId] = [];
          }
          if (!rulesByActivity[activityId].includes(rule.identificatie)) {
            rulesByActivity[activityId].push(rule.identificatie);
          }
        }
      }
    }

    // Update rules with activity links (redundant if extractRules already populated it,
    // but ensures consistency with other link methods)
    const rulesWithActivities = rules.map(rule => ({
      ...rule,
      activityIds: activitiesByRule[rule.identificatie] || rule.activityIds || [],
    }));

    logger.debug(
      {
        rulesWithActivities: rulesWithActivities.filter(r => r.activityIds && r.activityIds.length > 0).length,
        totalLinks: Object.keys(activitiesByRule).length,
      },
      '[DsoXmlLinker] Linked rules to activities'
    );

    return { rulesWithActivities, activitiesByRule, rulesByActivity };
  }

  /**
   * Calculate statistics
   */
  private calculateStatistics(
    rules: LinkedRule[],
    activities: LinkedActivity[],
    areas: LinkedRegulationArea[],
    texts: LinkedRuleText[],
    rulesWithActivities: LinkedRule[],
    rulesWithAreas: LinkedRule[],
    rulesWithTexts: LinkedRule[]
  ): LinkedXmlData['statistics'] {
    return {
      totalRules: rules.length,
      totalActivities: activities.length,
      totalAreas: areas.length,
      totalRuleTexts: texts.length,
      rulesWithActivities: rulesWithActivities.filter(r => r.activityIds && r.activityIds.length > 0).length,
      rulesWithAreas: rulesWithAreas.filter(r => r.areaIds && r.areaIds.length > 0).length,
      rulesWithTexts: rulesWithTexts.filter(r => r.textId).length,
      activitiesWithRules: activities.filter(a => {
        // Count activities that have rules linked (from reverse index)
        // Note: we can't access rulesByActivity here directly as it's not passed,
        // but we can infer if we assume the caller passed the result of linkRulesToActivities.
        // However, we can simply check if the activity is in the activitiesByRule (inverse)
        // or check rulesWithActivities for references.
        // Actually, the easiest way is to pass the links object to calculateStatistics,
        // but since we can't change the signature easily without affecting the caller,
        // we'll leave it as is or implement a heuristic.

        // Since we don't have the reverse index passed in, we can re-calculate or assume
        // that if we modify the LinkedActivity interface to include ruleIds, we could check that.
        // But LinkedActivity interface has ruleIds?: string[]. Let's check if they are populated.
        // Wait, linkRulesToActivities returns the maps but doesn't update the activities array in-place
        // (unlike rules).

        // Let's rely on checking if any rule references this activity.
        return rulesWithActivities.some(r => r.activityIds && r.activityIds.includes(a.identificatie));
      }).length,
      areasWithRules: areas.filter(a => a.ruleIds && a.ruleIds.length > 0).length,
    };
  }
}

