/**
 * Citation Formatter
 * 
 * Formats citations in answers according to different citation formats.
 */

export type CitationFormat = 'markdown' | 'html' | 'plain';

export interface Citation {
    type: 'entity' | 'document';
    id: string;
    name?: string;
    url?: string;
    timestamp?: string;
}

/**
 * Citation Formatter Service
 * 
 * Formats citations in generated answers
 */
export class CitationFormatter {
    /**
     * Format answer with citations
     */
    formatAnswer(
        answer: string,
        citations: Citation[],
        format: CitationFormat = 'markdown'
    ): string {
        if (citations.length === 0) {
            return answer;
        }

        switch (format) {
            case 'markdown':
                return this.formatMarkdown(answer, citations);
            case 'html':
                return this.formatHTML(answer, citations);
            case 'plain':
                return this.formatPlain(answer, citations);
            default:
                return this.formatMarkdown(answer, citations);
        }
    }

    /**
     * Format citations in Markdown
     */
    private formatMarkdown(answer: string, citations: Citation[]): string {
        // Add citations at the end
        const citationList = citations.map((citation, index) => {
            const num = index + 1;
            const parts: string[] = [];

            if (citation.url) {
                parts.push(`[${num}](${citation.url})`);
            } else {
                parts.push(`[${num}]`);
            }

            if (citation.name) {
                parts.push(` - ${citation.name}`);
            }

            if (citation.timestamp) {
                parts.push(` (${citation.timestamp})`);
            }

            return `${num}. ${parts.join('')}`;
        });

        if (citationList.length > 0) {
            return `${answer}\n\n## Bronnen\n\n${citationList.join('\n')}`;
        }

        return answer;
    }

    /**
     * Format citations in HTML
     */
    private formatHTML(answer: string, citations: Citation[]): string {
        const citationList = citations.map((citation, index) => {
            const num = index + 1;
            const parts: string[] = [];

            if (citation.url) {
                parts.push(`<a href="${citation.url}">[${num}]</a>`);
            } else {
                parts.push(`[${num}]`);
            }

            if (citation.name) {
                parts.push(` - ${this.escapeHtml(citation.name)}`);
            }

            if (citation.timestamp) {
                parts.push(` (${this.escapeHtml(citation.timestamp)})`);
            }

            return `<li>${parts.join('')}</li>`;
        });

        if (citationList.length > 0) {
            return `${answer}\n\n<h2>Bronnen</h2>\n<ul>\n${citationList.join('\n')}\n</ul>`;
        }

        return answer;
    }

    /**
     * Format citations in plain text
     */
    private formatPlain(answer: string, citations: Citation[]): string {
        const citationList = citations.map((citation, index) => {
            const num = index + 1;
            const parts: string[] = [`[${num}]`];

            if (citation.url) {
                parts.push(` ${citation.url}`);
            }

            if (citation.name) {
                parts.push(` - ${citation.name}`);
            }

            if (citation.timestamp) {
                parts.push(` (${citation.timestamp})`);
            }

            return parts.join('');
        });

        if (citationList.length > 0) {
            return `${answer}\n\nBronnen:\n${citationList.join('\n')}`;
        }

        return answer;
    }

    /**
     * Escape HTML special characters
     */
    private escapeHtml(text: string): string {
        return text
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }
}

