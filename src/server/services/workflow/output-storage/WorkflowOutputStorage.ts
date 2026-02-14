import * as fs from 'fs/promises';
import * as path from 'path';
import type { WorkflowOutput } from '../WorkflowOutputService.js';

/**
 * Service for managing workflow output file storage
 */
export class WorkflowOutputStorage {
  private outputDir: string;

  constructor(outputDir: string) {
    this.outputDir = outputDir;
  }

  /**
   * Get list of all output files
   */
  async listOutputs(): Promise<Array<{
    name: string;
    jsonPath: string;
    markdownPath: string;
    txtPath: string;
    csvPath: string;
    htmlPath: string;
    xmlPath: string;
    pdfPath?: string;
    xlsxPath?: string;
    tsvPath?: string;
    createdAt: Date;
  }>> {
    const files = await fs.readdir(this.outputDir);
    const jsonFiles = files.filter(f => f.endsWith('.json'));
    
    const outputs = [];
    for (const jsonFile of jsonFiles) {
      const baseName = jsonFile.replace('.json', '');
      const mdFile = `${baseName}.md`;
      const txtFile = `${baseName}.txt`;
      const csvFile = `${baseName}.csv`;
      const htmlFile = `${baseName}.html`;
      const xmlFile = `${baseName}.xml`;
      const pdfFile = `${baseName}.pdf`;
      const xlsxFile = `${baseName}.xlsx`;
      const tsvFile = `${baseName}.tsv`;
      
      // Include if at least JSON exists (other formats may not exist for older runs)
      const stats = await fs.stat(path.join(this.outputDir, jsonFile));
      outputs.push({
        name: baseName,
        jsonPath: path.join(this.outputDir, jsonFile),
        markdownPath: files.includes(mdFile) ? path.join(this.outputDir, mdFile) : '',
        txtPath: files.includes(txtFile) ? path.join(this.outputDir, txtFile) : '',
        csvPath: files.includes(csvFile) ? path.join(this.outputDir, csvFile) : '',
        htmlPath: files.includes(htmlFile) ? path.join(this.outputDir, htmlFile) : '',
        xmlPath: files.includes(xmlFile) ? path.join(this.outputDir, xmlFile) : '',
        pdfPath: files.includes(pdfFile) ? path.join(this.outputDir, pdfFile) : undefined,
        xlsxPath: files.includes(xlsxFile) ? path.join(this.outputDir, xlsxFile) : undefined,
        tsvPath: files.includes(tsvFile) ? path.join(this.outputDir, tsvFile) : undefined,
        createdAt: stats.birthtime
      });
    }

    return outputs.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  /**
   * Load a specific output by name
   */
  async loadOutput(name: string): Promise<WorkflowOutput | null> {
    const jsonPath = path.join(this.outputDir, `${name}.json`);
    try {
      const content = await fs.readFile(jsonPath, 'utf-8');
      return JSON.parse(content);
    } catch {
      return null;
    }
  }

  /**
   * Get the output directory path
   */
  getOutputDir(): string {
    return this.outputDir;
  }
}



