import * as fs from 'fs/promises';
import type { WorkflowOutput } from '../WorkflowOutputService.js';
import type { FormatGenerator } from './FormatGenerator.js';

/**
 * Generates HTML format output from workflow results (browser-viewable format)
 */
export class HtmlFormatGenerator implements FormatGenerator {
  /**
   * Escape HTML special characters
   */
  private escapeHtml(text: string | null | undefined): string {
    if (!text) return '';
    return String(text)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  /**
   * Generate HTML string from workflow output
   */
  generate(output: WorkflowOutput): string {
    let html = `<!DOCTYPE html>
<html lang="nl">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Workflow Output: ${this.escapeHtml(output.metadata.workflowName)}</title>
    <style>
        body {
            font-family: Arial, sans-serif;
            margin: 20px;
            line-height: 1.6;
            background-color: #f5f5f5;
        }
        .container {
            max-width: 1200px;
            margin: 0 auto;
            background-color: white;
            padding: 30px;
            border-radius: 8px;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
        }
        h1 {
            color: #333;
            border-bottom: 3px solid #4CAF50;
            padding-bottom: 10px;
        }
        h2 {
            color: #555;
            margin-top: 30px;
            border-bottom: 2px solid #ddd;
            padding-bottom: 5px;
        }
        .metadata {
            background-color: #f9f9f9;
            padding: 15px;
            margin: 20px 0;
            border-radius: 5px;
            border-left: 4px solid #4CAF50;
        }
        .metadata table {
            width: 100%;
        }
        .metadata td {
            padding: 5px 10px;
        }
        .metadata td:first-child {
            font-weight: bold;
            width: 200px;
        }
        table {
            width: 100%;
            border-collapse: collapse;
            margin: 20px 0;
        }
        th, td {
            border: 1px solid #ddd;
            padding: 12px;
            text-align: left;
        }
        th {
            background-color: #4CAF50;
            color: white;
            font-weight: bold;
        }
        tr:nth-child(even) {
            background-color: #f9f9f9;
        }
        tr:hover {
            background-color: #e8f5e9;
        }
        a {
            color: #0066cc;
            text-decoration: none;
        }
        a:hover {
            text-decoration: underline;
        }
        .status-success {
            color: #4CAF50;
            font-weight: bold;
        }
        .status-failed {
            color: #f44336;
            font-weight: bold;
        }
        .error {
            background-color: #ffebee;
            padding: 10px;
            margin: 5px 0;
            border-left: 4px solid #f44336;
            border-radius: 4px;
        }
    </style>
</head>
<body>
    <div class="container">
        <h1>Workflow Output: ${this.escapeHtml(output.metadata.workflowName)}</h1>
        <div class="metadata">
            <table>
                <tr><td>Run ID:</td><td>${this.escapeHtml(output.metadata.runId)}</td></tr>
                <tr><td>Workflow ID:</td><td>${this.escapeHtml(output.metadata.workflowId)}</td></tr>
                <tr><td>Status:</td><td class="${output.metadata.status === 'completed' ? 'status-success' : 'status-failed'}">${this.escapeHtml(output.metadata.status)}</td></tr>
                <tr><td>Start Time:</td><td>${this.escapeHtml(output.metadata.startTime)}</td></tr>
                <tr><td>End Time:</td><td>${this.escapeHtml(output.metadata.endTime || 'Lopend')}</td></tr>
                <tr><td>Generated:</td><td>${new Date().toLocaleString('nl-NL')}</td></tr>
            </table>
        </div>

        ${Object.keys(output.parameters).length > 0 ? `
        <h2>Parameters</h2>
        <div class="metadata">
            <pre style="background-color: #f5f5f5; padding: 15px; border-radius: 5px; overflow-x: auto; white-space: pre-wrap; word-wrap: break-word; font-family: 'Courier New', monospace; font-size: 0.9em;">${this.escapeHtml(JSON.stringify(output.parameters, null, 2))}</pre>
        </div>
        ` : ''}

        <h2>Summary</h2>
        <table>
            <thead>
                <tr>
                    <th>Metric</th>
                    <th>Value</th>
                </tr>
            </thead>
            <tbody>
                <tr><td>Total Pages</td><td>${output.results.summary.totalPages}</td></tr>
                <tr><td>Total Documents</td><td>${output.results.summary.totalDocuments}</td></tr>
                <tr><td>Newly Discovered</td><td>${output.results.summary.newlyDiscovered}</td></tr>
                <tr><td>Existing</td><td>${output.results.summary.existing}</td></tr>
                <tr><td>Errors</td><td>${output.results.summary.errors}</td></tr>
            </tbody>
        </table>

        <h2>Trace</h2>
        <p><strong>Total URLs Visited:</strong> ${output.trace.totalUrlsVisited}</p>
        <table>
            <thead>
                <tr>
                    <th>Step</th>
                    <th>Action</th>
                    <th>Status</th>
                    <th>Start Time</th>
                    <th>End Time</th>
                </tr>
            </thead>
            <tbody>`;

    for (const step of output.trace.steps) {
      html += `
                <tr>
                    <td>${this.escapeHtml(step.stepName)}</td>
                    <td>${this.escapeHtml(step.action)}</td>
                    <td class="${step.status === 'success' ? 'status-success' : 'status-failed'}">${this.escapeHtml(step.status)}</td>
                    <td>${this.escapeHtml(step.startTime)}</td>
                    <td>${this.escapeHtml(step.endTime || 'N/A')}</td>
                </tr>`;
    }

    html += `
            </tbody>
        </table>`;

    if (output.results.documents.length > 0) {
      html += `
        <h2>Documents (${output.results.documents.length})</h2>
        <table>
            <thead>
                <tr>
                    <th>Title</th>
                    <th>URL</th>
                    <th>Type</th>
                    <th>Source URL</th>
                    <th>Relevance Score</th>
                </tr>
            </thead>
            <tbody>`;

      for (const doc of output.results.documents) {
        html += `
                <tr>
                    <td>${this.escapeHtml(doc.title)}</td>
                    <td><a href="${this.escapeHtml(doc.url)}" target="_blank">${this.escapeHtml(doc.url)}</a></td>
                    <td>${this.escapeHtml(doc.type)}</td>
                    <td>${this.escapeHtml(doc.sourceUrl)}</td>
                    <td>${doc.relevanceScore !== undefined ? doc.relevanceScore.toFixed(2) : 'N/A'}</td>
                </tr>`;
      }

      html += `
            </tbody>
        </table>`;
    }

    if (output.results.endpoints.length > 0) {
      html += `
        <h2>Endpoints (${output.results.endpoints.length})</h2>
        <table>
            <thead>
                <tr>
                    <th>Title</th>
                    <th>URL</th>
                    <th>Type</th>
                    <th>Source URL</th>
                    <th>Relevance Score</th>
                </tr>
            </thead>
            <tbody>`;

      for (const endpoint of output.results.endpoints) {
        html += `
                <tr>
                    <td>${this.escapeHtml(endpoint.title)}</td>
                    <td><a href="${this.escapeHtml(endpoint.url)}" target="_blank">${this.escapeHtml(endpoint.url)}</a></td>
                    <td>${this.escapeHtml(endpoint.type)}</td>
                    <td>${this.escapeHtml(endpoint.sourceUrl)}</td>
                    <td>${endpoint.relevanceScore !== undefined ? endpoint.relevanceScore.toFixed(2) : 'N/A'}</td>
                </tr>`;
      }

      html += `
            </tbody>
        </table>`;
    }

    if (output.errors.length > 0) {
      html += `
        <h2>Errors (${output.errors.length})</h2>`;

      for (const error of output.errors) {
        html += `
        <div class="error">
            <strong>${this.escapeHtml(error.timestamp)}</strong>: ${this.escapeHtml(error.message)}
            ${error.url ? `<br><small>URL: ${this.escapeHtml(error.url)}</small>` : ''}
            ${error.stepId ? `<br><small>Step: ${this.escapeHtml(error.stepId)}</small>` : ''}
        </div>`;
      }
    }

    html += `
    </div>
</body>
</html>`;

    return html;
  }

  /**
   * Write HTML output to file
   */
  async write(filePath: string, output: WorkflowOutput): Promise<void> {
    try {
      const html = this.generate(output);
      await fs.writeFile(filePath, html, 'utf-8');
    } catch (error) {
      console.error(`[WorkflowOutput] Failed to write HTML file ${filePath}:`, error);
      throw new Error(`Failed to write HTML output: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}



