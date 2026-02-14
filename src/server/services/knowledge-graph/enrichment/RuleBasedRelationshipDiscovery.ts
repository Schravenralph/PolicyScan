/**
 * Rule-Based Relationship Discovery Service
 * 
 * Discovers relationships between entities using rule-based inference:
 * - PolicyDocument hierarchy relationships (OVERRIDES, REFINES)
 * - Spatial containment relationships (LOCATED_IN)
 * - Regulation-Spatial relationships (APPLIES_TO)
 * - Document-Regulation relationships (DEFINED_IN)
 * - Regulation-Requirement relationships (HAS_REQUIREMENT)
 */

import type {
  BaseEntity,
  Relation,
  RelationType,
  PolicyDocument,
  Regulation,
  SpatialUnit,
  LandUse,
  Requirement,
  HierarchyLevel,
} from '../../../domain/ontology.js';
import { RelationType as RelationTypeEnum } from '../../../domain/ontology.js';
import { logger } from '../../../utils/logger.js';
import { booleanContains } from '@turf/boolean-contains';
import type { Geometry, Feature, FeatureCollection } from 'geojson';

export interface DiscoveredRelationship {
  relationship: Relation;
  confidence: number; // 0-1
  discoveryMethod: string;
  evidence: string[];
}

export interface RuleBasedDiscoveryOptions {
  minConfidence?: number;
  enableHierarchyDiscovery?: boolean;
  enableSpatialDiscovery?: boolean;
  enableRegulationSpatialDiscovery?: boolean;
  enableDocumentRegulationDiscovery?: boolean;
  enableRegulationRequirementDiscovery?: boolean;
}

/**
 * Hierarchy level ordering (higher number = higher level)
 */
const HIERARCHY_LEVEL_ORDER: Record<HierarchyLevel, number> = {
  municipality: 1,
  province: 2,
  national: 3,
  european: 4,
};

export class RuleBasedRelationshipDiscovery {
  /**
   * Discover relationships between two entities using rule-based methods
   */
  async discoverRelationships(
    sourceEntity: BaseEntity,
    targetEntity: BaseEntity,
    options: RuleBasedDiscoveryOptions = {}
  ): Promise<DiscoveredRelationship[]> {
    const {
      minConfidence = 0.6,
      enableHierarchyDiscovery = true,
      enableSpatialDiscovery = true,
      enableRegulationSpatialDiscovery = true,
      enableDocumentRegulationDiscovery = true,
      enableRegulationRequirementDiscovery = true,
    } = options;

    const discovered: DiscoveredRelationship[] = [];

    // PolicyDocument hierarchy relationships
    if (enableHierarchyDiscovery && sourceEntity.type === 'PolicyDocument' && targetEntity.type === 'PolicyDocument') {
      const hierarchyRels = this.discoverPolicyDocumentHierarchy(
        sourceEntity as PolicyDocument,
        targetEntity as PolicyDocument
      );
      discovered.push(...hierarchyRels);
    }

    // Spatial containment relationships
    if (enableSpatialDiscovery && sourceEntity.type === 'SpatialUnit' && targetEntity.type === 'SpatialUnit') {
      const spatialRels = this.discoverSpatialContainment(
        sourceEntity as SpatialUnit,
        targetEntity as SpatialUnit
      );
      discovered.push(...spatialRels);
    }

    // Regulation-Spatial relationships
    if (enableRegulationSpatialDiscovery && sourceEntity.type === 'Regulation') {
      if (targetEntity.type === 'SpatialUnit' || targetEntity.type === 'LandUse') {
        const regulationSpatialRels = this.discoverRegulationSpatial(
          sourceEntity as Regulation,
          targetEntity as SpatialUnit | LandUse
        );
        discovered.push(...regulationSpatialRels);
      }
    }

    // Document-Regulation relationships
    if (enableDocumentRegulationDiscovery) {
      if (
        (sourceEntity.type === 'Regulation' || sourceEntity.type === 'Requirement') &&
        targetEntity.type === 'PolicyDocument'
      ) {
        const docRegRels = this.discoverDocumentRegulation(
          sourceEntity as Regulation | Requirement,
          targetEntity as PolicyDocument
        );
        discovered.push(...docRegRels);
      }
    }

    // Regulation-Requirement relationships
    if (enableRegulationRequirementDiscovery && sourceEntity.type === 'Regulation' && targetEntity.type === 'Requirement') {
      const regReqRels = this.discoverRegulationRequirement(
        sourceEntity as Regulation,
        targetEntity as Requirement
      );
      discovered.push(...regReqRels);
    }

    // Filter by confidence
    return discovered.filter(rel => rel.confidence >= minConfidence);
  }

  /**
   * Discover PolicyDocument hierarchy relationships (OVERRIDES, REFINES)
   */
  private discoverPolicyDocumentHierarchy(
    source: PolicyDocument,
    target: PolicyDocument
  ): DiscoveredRelationship[] {
    const discovered: DiscoveredRelationship[] = [];

    // Skip if same document
    if (source.id === target.id) {
      return discovered;
    }

    const sourceLevel = source.hierarchy?.level;
    const targetLevel = target.hierarchy?.level;

    if (!sourceLevel || !targetLevel) {
      return discovered;
    }

    const sourceLevelOrder = HIERARCHY_LEVEL_ORDER[sourceLevel];
    const targetLevelOrder = HIERARCHY_LEVEL_ORDER[targetLevel];

    // Parse dates for temporal validation
    const sourceDate = source.date ? new Date(source.date) : null;
    const targetDate = target.date ? new Date(target.date) : null;

    // OVERRIDES: Higher hierarchy level overrides lower
    if (sourceLevelOrder > targetLevelOrder) {
      let confidence = 0.9; // High confidence if hierarchy matches
      const evidence: string[] = [
        `Source hierarchy level (${sourceLevel}) is higher than target (${targetLevel})`,
      ];

      // Boost confidence if dates suggest precedence
      if (sourceDate && targetDate && sourceDate > targetDate) {
        confidence = 0.95;
        evidence.push(`Source date (${source.date}) is later than target (${target.date})`);
      } else if (sourceDate && targetDate) {
        confidence = 0.7; // Lower confidence if dates don't align
        evidence.push(`Warning: Source date (${source.date}) is not later than target (${target.date})`);
      }

      discovered.push({
        relationship: {
          sourceId: source.id,
          targetId: target.id,
          type: RelationTypeEnum.OVERRIDES,
          metadata: {
            discoveredAt: new Date().toISOString(),
            discoveryMethod: 'rule_based_hierarchy',
            sourceLevel,
            targetLevel,
          },
        },
        confidence,
        discoveryMethod: 'rule_based_hierarchy',
        evidence,
      });
    }

    // REFINES: Lower level refines higher level
    if (sourceLevelOrder <= targetLevelOrder) {
      let confidence = 0.9; // High confidence if hierarchy matches
      const evidence: string[] = [
        `Source hierarchy level (${sourceLevel}) is lower than or equal to target (${targetLevel})`,
      ];

      // Boost confidence if dates suggest refinement
      if (sourceDate && targetDate && sourceDate > targetDate) {
        confidence = 0.95;
        evidence.push(`Source date (${source.date}) is later than target (${target.date})`);
      } else if (sourceDate && targetDate) {
        confidence = 0.7; // Lower confidence if dates don't align
        evidence.push(`Warning: Source date (${source.date}) is not later than target (${target.date})`);
      }

      discovered.push({
        relationship: {
          sourceId: source.id,
          targetId: target.id,
          type: RelationTypeEnum.REFINES,
          metadata: {
            discoveredAt: new Date().toISOString(),
            discoveryMethod: 'rule_based_hierarchy',
            sourceLevel,
            targetLevel,
          },
        },
        confidence,
        discoveryMethod: 'rule_based_hierarchy',
        evidence,
      });
    }

    return discovered;
  }

  /**
   * Discover spatial containment relationships (LOCATED_IN)
   */
  private discoverSpatialContainment(
    source: SpatialUnit,
    target: SpatialUnit
  ): DiscoveredRelationship[] {
    const discovered: DiscoveredRelationship[] = [];

    // Skip if same unit
    if (source.id === target.id) {
      return discovered;
    }

    let confidence = 0.7; // Medium confidence by default
    const evidence: string[] = [];

    // Check geometry containment if available
    if (source.geometry && target.geometry) {
      // In a real implementation, would use a geometry library to check containment
      // For now, we'll use name-based heuristics
      const geometryCheck = this.checkGeometryContainment(source.geometry, target.geometry);
      if (geometryCheck.isContained) {
        confidence = 0.95; // High confidence if geometry proves containment
        evidence.push('Geometry containment verified');
      }
    }

    // Name-based hierarchy check (e.g., "Amsterdam Centrum" in "Amsterdam")
    const nameContainment = this.checkNameContainment(source.name, target.name);
    if (nameContainment.isContained) {
      if (confidence < 0.7) {
        confidence = 0.7; // Medium confidence for name-based inference
      }
      evidence.push(`Name hierarchy suggests containment: "${source.name}" likely in "${target.name}"`);
    }

    // If we have evidence, create relationship
    if (evidence.length > 0) {
      discovered.push({
        relationship: {
          sourceId: source.id,
          targetId: target.id,
          type: RelationTypeEnum.LOCATED_IN,
          metadata: {
            discoveredAt: new Date().toISOString(),
            discoveryMethod: 'rule_based_spatial',
            sourceSpatialType: source.spatialType,
            targetSpatialType: target.spatialType,
          },
        },
        confidence,
        discoveryMethod: 'rule_based_spatial',
        evidence,
      });
    }

    return discovered;
  }

  /**
   * Check if source geometry is contained in target geometry
   * Uses Turf.js to check if target geometry physically contains source geometry
   */
  private checkGeometryContainment(
    sourceGeometry: unknown,
    targetGeometry: unknown
  ): { isContained: boolean; method: string } {
    try {
      // Cast to valid GeoJSON types for Turf
      // Turf accepts Geometry, Feature, or FeatureCollection
      let source: Geometry | Feature<any> | null = null;
      let target: Geometry | Feature<any> | null = null;

      // Handle FeatureCollection by extracting first feature
      if (sourceGeometry && typeof sourceGeometry === 'object') {
        if ('type' in sourceGeometry) {
          if (sourceGeometry.type === 'FeatureCollection' && 'features' in sourceGeometry) {
            const fc = sourceGeometry as FeatureCollection<any>;
            source = fc.features.length > 0 ? fc.features[0] : null;
          } else {
            source = sourceGeometry as Geometry | Feature<any>;
          }
        }
      }

      if (targetGeometry && typeof targetGeometry === 'object') {
        if ('type' in targetGeometry) {
          if (targetGeometry.type === 'FeatureCollection' && 'features' in targetGeometry) {
            const fc = targetGeometry as FeatureCollection<any>;
            target = fc.features.length > 0 ? fc.features[0] : null;
          } else {
            target = targetGeometry as Geometry | Feature<any>;
          }
        }
      }

      if (!source || !target) {
        return { isContained: false, method: 'geometry' };
      }

      // booleanContains(feature1, feature2) returns true if feature2 is completely inside feature1
      // So we check if target contains source
      if (booleanContains(target, source)) {
        return { isContained: true, method: 'geometry_containment' };
      }
    } catch (error) {
      logger.warn(`Geometry containment check failed: ${error instanceof Error ? error.message : String(error)}`);
    }

    return { isContained: false, method: 'geometry' };
  }

  /**
   * Check if source name suggests containment in target name
   */
  private checkNameContainment(sourceName: string, targetName: string): { isContained: boolean; method: string } {
    const sourceLower = sourceName.toLowerCase();
    const targetLower = targetName.toLowerCase();

    // Check if source name contains target name (e.g., "Amsterdam Centrum" contains "Amsterdam")
    if (sourceLower.includes(targetLower) && sourceLower !== targetLower) {
      return { isContained: true, method: 'name_contains' };
    }

    // Check if target name contains source name (e.g., "Amsterdam" contains "Centrum" in "Amsterdam Centrum")
    if (targetLower.includes(sourceLower) && sourceLower !== targetLower) {
      return { isContained: true, method: 'name_contained_in' };
    }

    return { isContained: false, method: 'name' };
  }

  /**
   * Discover Regulation-Spatial relationships (APPLIES_TO)
   */
  private discoverRegulationSpatial(
    source: Regulation,
    target: SpatialUnit | LandUse
  ): DiscoveredRelationship[] {
    const discovered: DiscoveredRelationship[] = [];

    let confidence = 0.6; // Medium-low confidence by default
    const evidence: string[] = [];

    // Check jurisdiction matching
    const sourceJurisdiction = this.extractJurisdiction(source);
    const targetJurisdiction = this.extractJurisdiction(target);

    if (sourceJurisdiction && targetJurisdiction) {
      if (this.jurisdictionsMatch(sourceJurisdiction, targetJurisdiction)) {
        confidence = 0.85; // High confidence if jurisdiction matches
        evidence.push(`Jurisdiction match: ${sourceJurisdiction} = ${targetJurisdiction}`);
      } else {
        evidence.push(`Jurisdiction mismatch: ${sourceJurisdiction} vs ${targetJurisdiction}`);
      }
    }

    // Check if regulation category matches spatial/land use type
    if (target.type === 'SpatialUnit') {
      const spatialType = (target as SpatialUnit).spatialType;
      const categoryMatch = this.checkCategoryApplicability(source.category, spatialType);
      if (categoryMatch.matches) {
        confidence = Math.max(confidence, 0.75);
        evidence.push(categoryMatch.reason);
      }
    } else if (target.type === 'LandUse') {
      const landUseCategory = (target as LandUse).category;
      const categoryMatch = this.checkCategoryApplicability(source.category, landUseCategory);
      if (categoryMatch.matches) {
        confidence = Math.max(confidence, 0.75);
        evidence.push(categoryMatch.reason);
      }
    }

    // Check if regulation mentions spatial unit name
    const nameMention = this.checkNameMention(source, target);
    if (nameMention.mentioned) {
      confidence = Math.max(confidence, 0.8);
      evidence.push(`Regulation mentions "${target.name}"`);
    }

    // If we have evidence, create relationship
    if (evidence.length > 0) {
      discovered.push({
        relationship: {
          sourceId: source.id,
          targetId: target.id,
          type: RelationTypeEnum.APPLIES_TO,
          metadata: {
            discoveredAt: new Date().toISOString(),
            discoveryMethod: 'rule_based_regulation_spatial',
            regulationCategory: source.category,
          },
        },
        confidence,
        discoveryMethod: 'rule_based_regulation_spatial',
        evidence,
      });
    }

    return discovered;
  }

  /**
   * Discover Document-Regulation relationships (DEFINED_IN)
   */
  private discoverDocumentRegulation(
    source: Regulation | Requirement,
    target: PolicyDocument
  ): DiscoveredRelationship[] {
    const discovered: DiscoveredRelationship[] = [];

    let confidence = 0.7; // Medium confidence by default
    const evidence: string[] = [];

    // Check if entities share same source document
    const sourceSource = source.metadata?.source as string | undefined;
    const targetSource = target.url || target.metadata?.source as string | undefined;

    if (sourceSource && targetSource && sourceSource === targetSource) {
      confidence = 0.9; // High confidence if same source
      evidence.push(`Same source document: ${sourceSource}`);
    } else if (sourceSource || targetSource) {
      // Check if source ID matches document URL or source
      const sourceIdMatch = source.id === target.id || source.id === target.url;
      if (sourceIdMatch) {
        confidence = 0.85;
        evidence.push('Source ID matches document identifier');
      }
    }

    // Check jurisdiction matching
    const sourceJurisdiction = this.extractJurisdiction(source);
    const targetJurisdiction = target.jurisdiction;

    if (sourceJurisdiction && targetJurisdiction) {
      if (this.jurisdictionsMatch(sourceJurisdiction, targetJurisdiction)) {
        confidence = Math.max(confidence, 0.8);
        evidence.push(`Jurisdiction match: ${sourceJurisdiction} = ${targetJurisdiction}`);
      }
    }

    // Check document status (must be active or draft)
    if (target.status === 'Active' || target.status === 'Draft') {
      evidence.push(`Document status: ${target.status}`);
    } else {
      confidence = Math.max(0.5, confidence - 0.2); // Lower confidence for archived documents
      evidence.push(`Warning: Document status is ${target.status}`);
    }

    // Check date alignment
    const sourceDate = source.effectiveDate ? new Date(source.effectiveDate) : null;
    const targetDate = target.date ? new Date(target.date) : null;

    if (sourceDate && targetDate) {
      if (sourceDate >= targetDate) {
        evidence.push(`Effective date (${source.effectiveDate}) aligns with document date (${target.date})`);
      } else {
        confidence = Math.max(0.5, confidence - 0.1);
        evidence.push(`Warning: Effective date (${source.effectiveDate}) is before document date (${target.date})`);
      }
    }

    // If we have evidence, create relationship
    if (evidence.length > 0) {
      discovered.push({
        relationship: {
          sourceId: source.id,
          targetId: target.id,
          type: RelationTypeEnum.DEFINED_IN,
          metadata: {
            discoveredAt: new Date().toISOString(),
            discoveryMethod: 'rule_based_document_regulation',
            documentType: target.documentType,
            documentStatus: target.status,
          },
        },
        confidence,
        discoveryMethod: 'rule_based_document_regulation',
        evidence,
      });
    }

    return discovered;
  }

  /**
   * Discover Regulation-Requirement relationships (HAS_REQUIREMENT)
   */
  private discoverRegulationRequirement(
    source: Regulation,
    target: Requirement
  ): DiscoveredRelationship[] {
    const discovered: DiscoveredRelationship[] = [];

    let confidence = 0.6; // Medium-low confidence by default
    const evidence: string[] = [];

    // Check if requirement metric matches regulation category
    const categoryMatch = this.checkRequirementCategoryMatch(source.category, target.metric);
    if (categoryMatch.matches) {
      confidence = 0.85; // High confidence if category matches
      evidence.push(categoryMatch.reason);
    } else {
      confidence = 0.6; // Medium confidence if metric suggests relevance
      evidence.push(`Category: ${source.category}, Metric: ${target.metric}`);
    }

    // Check if entities share same source
    const sourceSource = source.metadata?.source as string | undefined;
    const targetSource = target.metadata?.source as string | undefined;

    if (sourceSource && targetSource && sourceSource === targetSource) {
      confidence = Math.max(confidence, 0.9);
      evidence.push(`Same source document: ${sourceSource}`);
    }

    // Check jurisdiction matching
    const sourceJurisdiction = this.extractJurisdiction(source);
    const targetJurisdiction = this.extractJurisdiction(target);

    if (sourceJurisdiction && targetJurisdiction) {
      if (this.jurisdictionsMatch(sourceJurisdiction, targetJurisdiction)) {
        confidence = Math.max(confidence, 0.8);
        evidence.push(`Jurisdiction match: ${sourceJurisdiction} = ${targetJurisdiction}`);
      }
    }

    // If we have evidence, create relationship
    if (evidence.length > 0) {
      discovered.push({
        relationship: {
          sourceId: source.id,
          targetId: target.id,
          type: RelationTypeEnum.HAS_REQUIREMENT,
          metadata: {
            discoveredAt: new Date().toISOString(),
            discoveryMethod: 'rule_based_regulation_requirement',
            regulationCategory: source.category,
            requirementMetric: target.metric,
          },
        },
        confidence,
        discoveryMethod: 'rule_based_regulation_requirement',
        evidence,
      });
    }

    return discovered;
  }

  /**
   * Extract jurisdiction from entity
   */
  private extractJurisdiction(entity: BaseEntity): string | null {
    if (entity.type === 'PolicyDocument') {
      return (entity as PolicyDocument).jurisdiction || null;
    }
    return (entity.metadata?.jurisdiction as string) || null;
  }

  /**
   * Check if two jurisdictions match or are compatible
   */
  private jurisdictionsMatch(jurisdiction1: string, jurisdiction2: string): boolean {
    const j1 = jurisdiction1.toLowerCase().trim();
    const j2 = jurisdiction2.toLowerCase().trim();

    // Exact match
    if (j1 === j2) {
      return true;
    }

    // Check if one contains the other (e.g., "Gemeente Amsterdam" contains "Amsterdam")
    if (j1.includes(j2) || j2.includes(j1)) {
      return true;
    }

    // Check for common patterns (e.g., "Amsterdam" vs "Gemeente Amsterdam")
    const normalize = (j: string) => j.replace(/^(gemeente|provincie|rijksoverheid)\s+/i, '').trim();
    const n1 = normalize(j1);
    const n2 = normalize(j2);

    return n1 === n2;
  }

  /**
   * Check if regulation category is applicable to spatial/land use type
   */
  private checkCategoryApplicability(
    category: Regulation['category'],
    targetType: string
  ): { matches: boolean; reason: string } {
    const categoryLower = category.toLowerCase();
    const targetLower = targetType.toLowerCase();

    // Zoning regulations apply to zoning areas and land uses
    if (categoryLower === 'zoning') {
      if (targetLower.includes('zoning') || targetLower.includes('bestemming') || targetLower.includes('gebied')) {
        return { matches: true, reason: `Zoning regulation applies to ${targetType}` };
      }
    }

    // Building regulations apply to buildings
    if (categoryLower === 'building') {
      if (targetLower.includes('building') || targetLower.includes('gebouw') || targetLower.includes('bouw')) {
        return { matches: true, reason: `Building regulation applies to ${targetType}` };
      }
    }

    // Environmental regulations apply to all spatial units
    if (categoryLower === 'environmental') {
      return { matches: true, reason: `Environmental regulation applies to ${targetType}` };
    }

    return { matches: false, reason: `Category ${category} may not be directly applicable to ${targetType}` };
  }

  /**
   * Check if regulation mentions entity name
   */
  private checkNameMention(source: Regulation, target: BaseEntity): { mentioned: boolean; method: string } {
    const sourceName = source.name.toLowerCase();
    const sourceDesc = (source.description || '').toLowerCase();
    const targetName = target.name.toLowerCase();

    // Check if target name appears in source name or description
    if (sourceName.includes(targetName) || sourceDesc.includes(targetName)) {
      return { mentioned: true, method: 'name_mention' };
    }

    return { mentioned: false, method: 'name_mention' };
  }

  /**
   * Check if requirement metric matches regulation category
   */
  private checkRequirementCategoryMatch(
    category: Regulation['category'],
    metric: string
  ): { matches: boolean; reason: string } {
    const categoryLower = category.toLowerCase();
    const metricLower = metric.toLowerCase();

    // Building category matches height, area, distance metrics
    if (categoryLower === 'building') {
      if (metricLower.includes('height') || metricLower.includes('hoogte') ||
          metricLower.includes('area') || metricLower.includes('oppervlakte') ||
          metricLower.includes('distance') || metricLower.includes('afstand')) {
        return { matches: true, reason: `Building regulation matches ${metric} requirement` };
      }
    }

    // Environmental category matches noise, pollution, environmental metrics
    if (categoryLower === 'environmental') {
      if (metricLower.includes('noise') || metricLower.includes('geluid') ||
          metricLower.includes('pollution') || metricLower.includes('vervuiling') ||
          metricLower.includes('environment') || metricLower.includes('milieu')) {
        return { matches: true, reason: `Environmental regulation matches ${metric} requirement` };
      }
    }

    // Zoning category matches density, parking, use metrics
    if (categoryLower === 'zoning') {
      if (metricLower.includes('density') || metricLower.includes('dichtheid') ||
          metricLower.includes('parking') || metricLower.includes('parkeer') ||
          metricLower.includes('use') || metricLower.includes('gebruik')) {
        return { matches: true, reason: `Zoning regulation matches ${metric} requirement` };
      }
    }

    return { matches: false, reason: `Category ${category} may not directly match ${metric} requirement` };
  }
}
