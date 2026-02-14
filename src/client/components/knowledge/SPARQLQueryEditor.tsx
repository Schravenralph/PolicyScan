/**
 * SPARQL Query Editor Component
 * 
 * Provides a text editor for SPARQL queries with:
 * - Query input textarea
 * - Execute/Save buttons
 * - Query history dropdown
 * - Query templates dropdown
 * - Error display
 */

import { Code, Play, Save, History, Loader2 } from 'lucide-react';
import { Button } from '../ui/button';
import { Textarea } from '../ui/textarea';
import { Alert, AlertDescription } from '../ui/alert';
import { ScrollArea } from '../ui/scroll-area';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { XCircle } from 'lucide-react';
import { t } from '../../utils/i18n';

interface QueryTemplate {
  name: string;
  query: string;
}

interface SPARQLQueryEditorProps {
  query: string;
  onQueryChange: (query: string) => void;
  onExecute: () => void;
  onSave: () => void;
  queryLoading: boolean;
  queryError: string | null;
  queryHistory: string[];
  onLoadFromHistory: (query: string) => void;
  queryTemplates: QueryTemplate[];
  onLoadTemplate: (query: string) => void;
}

export function SPARQLQueryEditor({
  query,
  onQueryChange,
  onExecute,
  onSave,
  queryLoading,
  queryError,
  queryHistory,
  onLoadFromHistory,
  queryTemplates,
  onLoadTemplate,
}: SPARQLQueryEditorProps) {
  return (
    <Card className="flex-1 flex flex-col min-h-[300px]">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Code className="h-5 w-5" />
          {t('kg.query.title')}
        </CardTitle>
        <CardDescription>
          {t('kg.query.description')}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex-1 flex flex-col">
        <div className="flex-1 mb-4">
          <Textarea
            className="w-full h-full min-h-[200px] p-4 border rounded-md font-mono text-sm resize-none"
            placeholder="SELECT ?s ?p ?o WHERE { GRAPH <http://data.example.org/graph/knowledge> { ?s ?p ?o } } LIMIT 10"
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                onExecute();
              }
            }}
          />
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Button 
            onClick={onExecute}
            disabled={queryLoading || !query.trim()}
          >
            {queryLoading ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                {t('kg.query.executing')}
              </>
            ) : (
              <>
                <Play className="h-4 w-4 mr-2" />
                {t('kg.query.execute')}
              </>
            )}
          </Button>
          <Button variant="outline" onClick={onSave} disabled={!query.trim()}>
            <Save className="h-4 w-4 mr-2" />
            {t('common.save')}
          </Button>
          {queryHistory.length > 0 && (
            <div className="relative group">
              <Button variant="outline">
                <History className="h-4 w-4 mr-2" />
                {t('kg.query.history').replace('{{count}}', String(queryHistory.length))}
              </Button>
              <div className="absolute left-0 top-full mt-1 w-64 bg-white border rounded-md shadow-lg z-10 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all">
                <ScrollArea className="max-h-64">
                  <div className="p-2">
                    {queryHistory.map((histQuery, idx) => (
                      <button
                        key={idx}
                        className="w-full text-left p-2 text-sm hover:bg-gray-100 rounded truncate"
                        onClick={() => onLoadFromHistory(histQuery)}
                        title={histQuery}
                      >
                        {histQuery.substring(0, 50)}...
                      </button>
                    ))}
                  </div>
                </ScrollArea>
              </div>
            </div>
          )}
          <div className="relative group ml-auto">
            <Button variant="outline">
              <Code className="h-4 w-4 mr-2" />
              {t('kg.query.templates')}
            </Button>
            <div className="absolute right-0 top-full mt-1 w-64 bg-white border rounded-md shadow-lg z-10 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all">
              <ScrollArea className="max-h-64">
                <div className="p-2">
                  {queryTemplates.map((template, idx) => (
                    <button
                      key={idx}
                      className="w-full text-left p-2 text-sm hover:bg-gray-100 rounded"
                      onClick={() => onLoadTemplate(template.query)}
                    >
                      {template.name}
                    </button>
                  ))}
                </div>
              </ScrollArea>
            </div>
          </div>
        </div>
        {queryError && (
          <Alert variant="destructive" className="mt-2">
            <XCircle className="h-4 w-4" />
            <AlertDescription>{queryError}</AlertDescription>
          </Alert>
        )}
      </CardContent>
    </Card>
  );
}
