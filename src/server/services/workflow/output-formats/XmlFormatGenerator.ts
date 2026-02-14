import * as fs from 'fs/promises';
import type { WorkflowOutput } from '../WorkflowOutputService.js';
import type { FormatGenerator } from './FormatGenerator.js';

/**
 * Generates XML format output from workflow results (structured data exchange format)
 */
export class XmlFormatGenerator implements FormatGenerator {
  /**
   * Escape XML special characters
   */
  private escapeXml(text: string | null | undefined): string {
    if (!text) return '';
    return String(text)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  }

  /**
   * Generate XML string from workflow output
   */
  generate(output: WorkflowOutput): string {
    let xml = `<?xml version="1.0" encoding="UTF-8"?>
<workflow-output>
    <metadata>
        <run-id>${this.escapeXml(output.metadata.runId)}</run-id>
        <workflow-id>${this.escapeXml(output.metadata.workflowId)}</workflow-id>
        <workflow-name>${this.escapeXml(output.metadata.workflowName)}</workflow-name>
        <status>${this.escapeXml(output.metadata.status)}</status>
        <start-time>${this.escapeXml(output.metadata.startTime)}</start-time>
        ${output.metadata.endTime ? `<end-time>${this.escapeXml(output.metadata.endTime)}</end-time>` : ''}
        <version>${this.escapeXml(output.metadata.version)}</version>
        <generated>${new Date().toISOString()}</generated>
    </metadata>
    <parameters>
        ${Object.entries(output.parameters).map(([key, value]) => 
          `<parameter name="${this.escapeXml(key)}">${this.escapeXml(JSON.stringify(value))}</parameter>`
        ).join('\n        ')}
    </parameters>
    <trace>
        <workflow-id>${this.escapeXml(output.trace.workflowId)}</workflow-id>
        <workflow-name>${this.escapeXml(output.trace.workflowName)}</workflow-name>
        <run-id>${this.escapeXml(output.trace.runId)}</run-id>
        <start-time>${this.escapeXml(output.trace.startTime)}</start-time>
        ${output.trace.endTime ? `<end-time>${this.escapeXml(output.trace.endTime)}</end-time>` : ''}
        <status>${this.escapeXml(output.trace.status)}</status>
        <total-urls-visited>${output.trace.totalUrlsVisited}</total-urls-visited>
        <total-documents-found>${output.trace.totalDocumentsFound}</total-documents-found>
        <steps>`;

    for (const step of output.trace.steps) {
      xml += `
            <step>
                <step-id>${this.escapeXml(step.stepId)}</step-id>
                <step-name>${this.escapeXml(step.stepName)}</step-name>
                <action>${this.escapeXml(step.action)}</action>
                <start-time>${this.escapeXml(step.startTime)}</start-time>
                ${step.endTime ? `<end-time>${this.escapeXml(step.endTime)}</end-time>` : ''}
                <status>${this.escapeXml(step.status)}</status>
                ${step.urls && step.urls.length > 0 ? `<urls>${step.urls.map(url => `<url>${this.escapeXml(url)}</url>`).join('')}</urls>` : ''}
            </step>`;
    }

    xml += `
        </steps>
    </trace>
    <results>
        <summary>
            <total-pages>${output.results.summary.totalPages}</total-pages>
            <total-documents>${output.results.summary.totalDocuments}</total-documents>
            <newly-discovered>${output.results.summary.newlyDiscovered}</newly-discovered>
            <existing>${output.results.summary.existing}</existing>
            <errors>${output.results.summary.errors}</errors>
        </summary>
        <documents>`;

    for (const doc of output.results.documents) {
      xml += `
            <document>
                <title>${this.escapeXml(doc.title)}</title>
                <url>${this.escapeXml(doc.url)}</url>
                <type>${this.escapeXml(doc.type)}</type>
                <source-url>${this.escapeXml(doc.sourceUrl)}</source-url>
                ${doc.relevanceScore !== undefined ? `<relevance-score>${doc.relevanceScore}</relevance-score>` : ''}
                <discovered-at>${this.escapeXml(doc.discoveredAt)}</discovered-at>
                ${doc.metadata ? `<metadata>${this.escapeXml(JSON.stringify(doc.metadata))}</metadata>` : ''}
            </document>`;
    }

    xml += `
        </documents>
        <endpoints>`;

    for (const endpoint of output.results.endpoints) {
      xml += `
            <endpoint>
                <title>${this.escapeXml(endpoint.title)}</title>
                <url>${this.escapeXml(endpoint.url)}</url>
                <type>${this.escapeXml(endpoint.type)}</type>
                <source-url>${this.escapeXml(endpoint.sourceUrl)}</source-url>
                ${endpoint.relevanceScore !== undefined ? `<relevance-score>${endpoint.relevanceScore}</relevance-score>` : ''}
            </endpoint>`;
    }

    xml += `
        </endpoints>
    </results>
    <errors>`;

    for (const error of output.errors) {
      xml += `
        <error>
            <timestamp>${this.escapeXml(error.timestamp)}</timestamp>
            <message>${this.escapeXml(error.message)}</message>
            ${error.url ? `<url>${this.escapeXml(error.url)}</url>` : ''}
            ${error.stepId ? `<step-id>${this.escapeXml(error.stepId)}</step-id>` : ''}
        </error>`;
    }

    xml += `
    </errors>
</workflow-output>`;

    return xml;
  }

  /**
   * Write XML output to file
   */
  async write(filePath: string, output: WorkflowOutput): Promise<void> {
    try {
      const xml = this.generate(output);
      await fs.writeFile(filePath, xml, 'utf-8');
    } catch (error) {
      console.error(`[WorkflowOutput] Failed to write XML file ${filePath}:`, error);
      throw new Error(`Failed to write XML output: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}



