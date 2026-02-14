/**
 * Ruimtelijke Plannen API Service
 * 
 * Service for accessing IMRO documents through the Ruimtelijke Plannen API v4.
 * This API provides access to IMRO documents (bestemmingsplannen, etc.) that
 * are published via ruimtelijkeplannen.nl.
 * 
 * Unlike the Omgevingsdocumenten Download API (which requires AKN format),
 * this API works directly with IMRO identifiers.
 * 
 * @see docs/dso-ruimtelijke-plannen/
 */

import axios, { AxiosInstance } from 'axios';
import { logger } from '../../utils/logger.js';
import { getDeploymentConfig } from '../../config/deployment.js';
import { createHttpClient, HTTP_TIMEOUTS } from '../../config/httpClient.js';
import { ServiceUnavailableError, BadRequestError, NotFoundError } from '../../types/errors.js';

export interface RuimtelijkePlan {
  id: string; // IMRO identificatie (e.g., "NL.IMRO.0200.bp1253-vas1")
  naam?: string;
  type?: string;
  verwijzingNaarGml?: string; // URL to GML file on ruimtelijkeplannen.nl
  verwijzingNaarVaststellingsbesluit?: string; // URL to PDF file
  verwijzingNaarRegels?: string; // URL to HTML regels
  [key: string]: unknown;
}

export interface RuimtelijkePlanResponse {
  _links?: {
    self?: { href: string };
  };
  id: string;
  verwijzingNaarGml?: string;
  verwijzingNaarVaststellingsbesluit?: string;
  verwijzingNaarRegels?: string;
  [key: string]: unknown;
}

/**
 * Service for accessing IMRO documents via Ruimtelijke Plannen API
 */
export class RuimtelijkePlannenService {
  private client: AxiosInstance;
  private baseUrl: string;
  private apiKey: string;
  private useProduction: boolean;

  constructor(useProduction: boolean = false) {
    const deploymentConfig = getDeploymentConfig();
    const dsoConfig = deploymentConfig.dso;

    this.useProduction = useProduction || (dsoConfig.env === 'prod');
    
    // Ruimtelijke Plannen API requires a SEPARATE API key for Informatiehuis Ruimte
    // Check for DSO_RUIMTELIJKPLANNEN_V4_KEY (the actual env var name in .env)
    // Also check for other possible variations
    this.apiKey = process.env.DSO_RUIMTELIJKPLANNEN_V4_KEY
      || process.env.RUIMTELIJKE_PLANNEN_API_KEY
      || process.env.IHR_API_KEY
      || process.env.RP_API_KEY
      || process.env.RUIMTELIJKE_PLANNEN_KEY
      || dsoConfig.apiKey; // Fallback to DSO key if no separate key found

    if (!this.apiKey) {
      throw new ServiceUnavailableError(
        `Ruimtelijke Plannen API key not configured. Set DSO_RUIMTELIJKPLANNEN_V4_KEY, RUIMTELIJKE_PLANNEN_API_KEY, IHR_API_KEY, RP_API_KEY, or RUIMTELIJKE_PLANNEN_KEY in .env`,
        {
          reason: 'ruimtelijke_plannen_api_key_not_configured',
          environment: this.useProduction ? 'production' : 'preproduction',
          operation: 'constructor'
        }
      );
    }
    
    logger.debug(
      {
        hasSeparateKey: !!(process.env.DSO_RUIMTELIJKPLANNEN_V4_KEY || process.env.RUIMTELIJKE_PLANNEN_API_KEY || process.env.IHR_API_KEY || process.env.RP_API_KEY || process.env.RUIMTELIJKE_PLANNEN_KEY),
        usingKey: this.apiKey.substring(0, 8) + '...',
        keySource: process.env.DSO_RUIMTELIJKPLANNEN_V4_KEY ? 'DSO_RUIMTELIJKPLANNEN_V4_KEY' : 
                   process.env.RUIMTELIJKE_PLANNEN_API_KEY ? 'RUIMTELIJKE_PLANNEN_API_KEY' :
                   process.env.IHR_API_KEY ? 'IHR_API_KEY' :
                   process.env.RP_API_KEY ? 'RP_API_KEY' :
                   process.env.RUIMTELIJKE_PLANNEN_KEY ? 'RUIMTELIJKE_PLANNEN_KEY' : 'DSO_API_KEY (fallback)',
      },
      '[RuimtelijkePlannenService] API key configuration'
    );

    // Base URL for Ruimtelijke Plannen API v4
    this.baseUrl = this.useProduction
      ? 'https://ruimte.omgevingswet.overheid.nl/ruimtelijke-plannen/api/opvragen/v4'
      : 'https://ruimte.pre.omgevingswet.overheid.nl/ruimtelijke-plannen/api/opvragen/v4';

    // Use createHttpClient for consistency with other DSO services
    this.client = createHttpClient({
      baseURL: this.baseUrl,
      timeout: HTTP_TIMEOUTS.STANDARD,
      headers: {
        'x-api-key': this.apiKey, // Note: Ruimtelijke Plannen API uses lowercase x-api-key (per user instructions)
        'Accept': 'application/hal+json', // OpenAPI spec: API can only return application/hal+json (not application/json)
        'Content-Type': 'application/json',
      },
    });
  }

  /**
   * Get a plan by IMRO identificatie
   * 
   * @param imroIdentificatie - IMRO identifier (e.g., "NL.IMRO.0200.bp1253-vas1")
   * @returns Plan with download URLs
   */
  async getPlanByImro(imroIdentificatie: string): Promise<RuimtelijkePlan | null> {
    try {
      logger.debug(
        { imroIdentificatie, baseUrl: this.baseUrl },
        '[RuimtelijkePlannenService] Fetching plan by IMRO identificatie'
      );

      // Log request details for debugging
      const url = `/plannen/${encodeURIComponent(imroIdentificatie)}`;
      logger.debug(
        {
          url,
          fullUrl: `${this.baseUrl}${url}`,
          apiKeyPrefix: this.apiKey.substring(0, 8) + '...',
          headers: this.client.defaults.headers,
        },
        '[RuimtelijkePlannenService] Making request'
      );

      const response = await this.client.get<RuimtelijkePlanResponse>(url);

      const plan: RuimtelijkePlan = {
        verwijzingNaarGml: response.data.verwijzingNaarGml,
        verwijzingNaarVaststellingsbesluit: response.data.verwijzingNaarVaststellingsbesluit,
        verwijzingNaarRegels: response.data.verwijzingNaarRegels,
        ...response.data, // This includes id, so don't duplicate it
      };

      logger.debug(
        {
          imroIdentificatie,
          hasGml: !!plan.verwijzingNaarGml,
          hasPdf: !!plan.verwijzingNaarVaststellingsbesluit,
          hasRegels: !!plan.verwijzingNaarRegels,
        },
        '[RuimtelijkePlannenService] Retrieved plan'
      );

      return plan;
    } catch (error) {
      if (axios.isAxiosError(error)) {
        if (error.response?.status === 404) {
          logger.warn(
            { imroIdentificatie, status: 404 },
            '[RuimtelijkePlannenService] Plan not found'
          );
          return null;
        }
        if (error.response?.status === 406) {
          logger.error(
            { 
              imroIdentificatie,
              status: 406,
              statusText: error.response.statusText,
              responseData: error.response.data,
              requestHeaders: error.config?.headers,
            },
            '[RuimtelijkePlannenService] Not Acceptable (406) - check Accept header or API version'
          );
          throw new BadRequestError(`Not Acceptable (406): ${JSON.stringify(error.response.data)}`, {
            reason: 'not_acceptable',
            operation: 'getPlanByImro',
            imroIdentificatie,
            statusCode: 406,
            responseData: error.response.data
          });
        }
      }

      logger.error(
        { error, imroIdentificatie },
        '[RuimtelijkePlannenService] Error fetching plan'
      );
      throw error;
    }
  }

  /**
   * Get all texts (regels, toelichting, etc.) for a plan
   * 
   * @param imroIdentificatie - IMRO identifier
   * @returns Array of text objects with content
   */
  async getTeksten(imroIdentificatie: string): Promise<unknown[]> {
    try {
      logger.debug(
        { imroIdentificatie },
        '[RuimtelijkePlannenService] Fetching teksten for plan'
      );

      const response = await this.client.get<{ _embedded?: { teksten?: unknown[] } }>(
        `/plannen/${encodeURIComponent(imroIdentificatie)}/teksten`
      );

      const teksten = response.data._embedded?.teksten || [];
      logger.debug(
        { imroIdentificatie, tekstCount: teksten.length },
        '[RuimtelijkePlannenService] Retrieved teksten'
      );

      return teksten;
    } catch (error) {
      logger.error(
        { error, imroIdentificatie },
        '[RuimtelijkePlannenService] Error fetching teksten'
      );
      throw error;
    }
  }

  /**
   * Download GML file for an IMRO plan (from verwijzingNaarGml URL)
   * 
   * @param imroIdentificatie - IMRO identifier
   * @returns GML file content as Buffer, or null if not available
   */
  async downloadGml(imroIdentificatie: string): Promise<Buffer | null> {
    const plan = await this.getPlanByImro(imroIdentificatie);
    
    if (!plan || !plan.verwijzingNaarGml) {
      logger.warn(
        { imroIdentificatie },
        '[RuimtelijkePlannenService] No GML URL available for plan'
      );
      return null;
    }

    try {
      logger.debug(
        { imroIdentificatie, gmlUrl: plan.verwijzingNaarGml },
        '[RuimtelijkePlannenService] Downloading GML file from ruimtelijkeplannen.nl'
      );

      const response = await axios.get(plan.verwijzingNaarGml, {
        responseType: 'arraybuffer',
        timeout: 60000,
      });

      const buffer = Buffer.from(response.data);
      logger.info(
        {
          imroIdentificatie,
          gmlUrl: plan.verwijzingNaarGml,
          size: buffer.length,
        },
        '[RuimtelijkePlannenService] Successfully downloaded GML file'
      );

      return buffer;
    } catch (error) {
      logger.error(
        { error, imroIdentificatie, gmlUrl: plan.verwijzingNaarGml },
        '[RuimtelijkePlannenService] Error downloading GML file'
      );
      throw error;
    }
  }

  /**
   * Get complete plan data (plan + teksten + geometrie) and bundle it
   * 
   * This is the "download" equivalent - fetches all plan components and bundles them
   * 
   * @param imroIdentificatie - IMRO identifier
   * @returns Complete plan data bundle
   */
  async getCompletePlan(imroIdentificatie: string): Promise<{
    plan: RuimtelijkePlan;
    teksten: unknown[];
    gml?: Buffer;
  }> {
    const plan = await this.getPlanByImro(imroIdentificatie);
    if (!plan) {
      throw new NotFoundError('Plan', imroIdentificatie, {
        reason: 'plan_not_found',
        operation: 'getCompletePlan',
      });
    }

    const teksten = await this.getTeksten(imroIdentificatie);
    const gml = await this.downloadGml(imroIdentificatie);

    return {
      plan,
      teksten,
      gml: gml || undefined,
    };
  }

  /**
   * Check if a plan exists and is accessible
   * 
   * @param imroIdentificatie - IMRO identifier
   * @returns true if plan exists and is accessible
   */
  async planExists(imroIdentificatie: string): Promise<boolean> {
    const plan = await this.getPlanByImro(imroIdentificatie);
    return plan !== null;
  }
}

