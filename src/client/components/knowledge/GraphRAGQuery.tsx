import React, { useState } from 'react';
import { api } from '../../services/api';
import { GraphRAGQueryOptions, GraphRAGResponse } from '../../services/api';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Textarea } from '../ui/textarea';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/tabs';
import { ScrollArea } from '../ui/scroll-area';
import { Badge } from '../ui/badge';
import { Switch } from '../ui/switch';
import { AlertCircle, Brain, Database, FileText, Search, Settings } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '../ui/alert';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '../ui/accordion';
import { t } from '../../utils/i18n';

export const GraphRAGQuery: React.FC = () => {
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<GraphRAGResponse | null>(null);

  // Options
  const [strategy, setStrategy] = useState<'fact-first' | 'context-first' | 'hybrid'>('hybrid');
  const [maxResults, setMaxResults] = useState(20);
  const [maxHops, setMaxHops] = useState(2);
  const [kgWeight, setKgWeight] = useState(0.5);
  const [vectorWeight, setVectorWeight] = useState(0.5);
  const [enableExplainability, setEnableExplainability] = useState(true);

  const handleSearch = async () => {
    if (!query.trim()) return;

    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const options: GraphRAGQueryOptions = {
        query,
        strategy,
        maxResults,
        maxHops,
        kgWeight,
        vectorWeight,
        enableExplainability,
      };

      const response = await api.graph.graphRAGQuery(options);
      setResult(response);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred during the query');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Brain className="h-5 w-5" />
            {t('graphRAG.title')}
          </CardTitle>
          <CardDescription>
            {t('graphRAG.description')}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="query">{t('graphRAG.naturalLanguageQuery')}</Label>
            <Textarea
              id="query"
              placeholder={t('graphRAG.queryPlaceholder')}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="min-h-[100px]"
            />
          </div>

          <Accordion type="single" collapsible className="w-full">
            <AccordionItem value="options">
              <AccordionTrigger className="flex items-center gap-2">
                <Settings className="h-4 w-4" />
                {t('graphRAG.advancedOptions')}
              </AccordionTrigger>
              <AccordionContent>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4 border rounded-md bg-muted/20">
                  <div className="space-y-2">
                    <Label htmlFor="strategy">{t('graphRAG.retrievalStrategy')}</Label>
                    <Select value={strategy} onValueChange={(v: string) => setStrategy(v as 'fact-first' | 'context-first' | 'hybrid')}>
                      <SelectTrigger id="strategy">
                        <SelectValue placeholder={t('graphRAG.selectStrategy')} />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="fact-first">{t('graphRAG.strategy.factFirst')}</SelectItem>
                        <SelectItem value="context-first">{t('graphRAG.strategy.contextFirst')}</SelectItem>
                        <SelectItem value="hybrid">{t('graphRAG.strategy.hybrid')}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="maxResults">{t('graphRAG.maxResults')}</Label>
                    <Input
                      id="maxResults"
                      type="number"
                      value={maxResults}
                      onChange={(e) => setMaxResults(parseInt(e.target.value))}
                      min={1}
                      max={100}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="maxHops">{t('graphRAG.maxHops')}</Label>
                    <Input
                      id="maxHops"
                      type="number"
                      value={maxHops}
                      onChange={(e) => setMaxHops(parseInt(e.target.value))}
                      min={1}
                      max={5}
                    />
                  </div>

                  <div className="flex items-center space-x-2 pt-8">
                    <Switch
                      id="explainability"
                      checked={enableExplainability}
                      onCheckedChange={setEnableExplainability}
                    />
                    <Label htmlFor="explainability">{t('graphRAG.enableExplainability')}</Label>
                  </div>

                  <div className="space-y-2">
                    <Label>{t('graphRAG.kgWeight')} ({kgWeight})</Label>
                    <Input
                      type="range"
                      min="0"
                      max="1"
                      step="0.1"
                      value={kgWeight}
                      onChange={(e) => {
                        const val = parseFloat(e.target.value);
                        setKgWeight(val);
                        setVectorWeight(parseFloat((1 - val).toFixed(1)));
                      }}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label>{t('graphRAG.vectorWeight')} ({vectorWeight})</Label>
                    <Input
                      type="range"
                      min="0"
                      max="1"
                      step="0.1"
                      value={vectorWeight}
                      disabled // Controlled by KG weight
                    />
                  </div>
                </div>
              </AccordionContent>
            </AccordionItem>
          </Accordion>

          {error && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>{t('graphRAG.error')}</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
        </CardContent>
        <CardFooter>
          <Button onClick={handleSearch} disabled={loading || !query.trim()} className="w-full">
            {loading ? (
              <>
                <span className="animate-spin mr-2">⏳</span> {t('graphRAG.processing')}
              </>
            ) : (
              <>
                <Search className="mr-2 h-4 w-4" /> {t('graphRAG.search')}
              </>
            )}
          </Button>
        </CardFooter>
      </Card>

      {result && (
        <div className="space-y-4">
          {result.metrics && (
            <div className="flex gap-4 text-sm text-muted-foreground justify-end">
              <span>{t('graphRAG.retrieval')}: {result.metrics.retrievalTime}ms</span>
              <span>{t('graphRAG.ranking')}: {result.metrics.rankingTime}ms</span>
              <span>{t('graphRAG.total')}: {result.metrics.totalTime}ms</span>
            </div>
          )}

          <Tabs defaultValue="explanation" className="w-full">
            <TabsList className="grid w-full grid-cols-4">
              <TabsTrigger value="explanation">{t('graphRAG.explanation')}</TabsTrigger>
              <TabsTrigger value="facts">
                {t('graphRAG.facts')} ({result.facts?.length || 0})
              </TabsTrigger>
              <TabsTrigger value="context">
                {t('graphRAG.context')} ({result.chunks?.length || 0})
              </TabsTrigger>
              <TabsTrigger value="json">{t('graphRAG.rawJson')}</TabsTrigger>
            </TabsList>

            <TabsContent value="explanation" className="mt-4">
              <Card>
                <CardHeader>
                  <CardTitle>{t('graphRAG.answerExplanation')}</CardTitle>
                </CardHeader>
                <CardContent>
                  {result.explanation ? (
                    <div className="prose dark:prose-invert max-w-none">
                      <p>{result.explanation}</p>
                    </div>
                  ) : (
                    <div className="text-center text-muted-foreground py-8">
                      {t('graphRAG.noExplanation')}
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="facts" className="mt-4">
              <Card>
                <CardHeader>
                  <CardTitle>{t('graphRAG.retrievedFacts')}</CardTitle>
                  <CardDescription>{t('graphRAG.factsDescription')}</CardDescription>
                </CardHeader>
                <CardContent>
                  <ScrollArea className="h-[400px]">
                    <div className="space-y-4">
                      {result.facts?.map((fact, index) => (
                        <div key={index} className="flex flex-col p-3 border rounded hover:bg-muted/50 transition-colors">
                          <div className="flex justify-between items-start">
                            <div className="flex items-center gap-2">
                              <Database className="h-4 w-4 text-blue-500" />
                              <span className="font-semibold">{fact.entity.name}</span>
                              <Badge variant="outline">{fact.entity.type}</Badge>
                            </div>
                            <Badge variant={fact.score > 0.8 ? 'default' : 'secondary'}>
                              {t('graphRAG.score')}: {fact.score.toFixed(2)}
                            </Badge>
                          </div>
                          {fact.path && fact.path.length > 0 && (
                            <div className="mt-2 text-sm text-muted-foreground">
                              {t('graphRAG.path')}: {fact.path.join(' → ')}
                            </div>
                          )}
                          {fact.entity.properties && (
                            <div className="mt-2 text-xs font-mono bg-muted p-2 rounded overflow-x-auto">
                              {JSON.stringify(fact.entity.properties, null, 2)}
                            </div>
                          )}
                        </div>
                      ))}
                      {(!result.facts || result.facts.length === 0) && (
                        <div className="text-center text-muted-foreground py-8">
                          {t('graphRAG.noFacts')}
                        </div>
                      )}
                    </div>
                  </ScrollArea>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="context" className="mt-4">
              <Card>
                <CardHeader>
                  <CardTitle>{t('graphRAG.retrievedContext')}</CardTitle>
                  <CardDescription>{t('graphRAG.contextDescription')}</CardDescription>
                </CardHeader>
                <CardContent>
                  <ScrollArea className="h-[400px]">
                    <div className="space-y-4">
                      {result.chunks?.map((chunk, index) => (
                        <div key={index} className="flex flex-col p-3 border rounded hover:bg-muted/50 transition-colors">
                          <div className="flex justify-between items-start mb-2">
                            <div className="flex items-center gap-2">
                              <FileText className="h-4 w-4 text-green-500" />
                              <span className="font-medium text-sm truncate max-w-[300px]">
                                {t('graphRAG.source')}: {chunk.source || 'Unknown'}
                              </span>
                            </div>
                            <Badge variant={chunk.score > 0.8 ? 'default' : 'secondary'}>
                              {t('graphRAG.score')}: {chunk.score.toFixed(2)}
                            </Badge>
                          </div>
                          <p className="text-sm text-muted-foreground leading-relaxed">
                            "{chunk.text}"
                          </p>
                        </div>
                      ))}
                      {(!result.chunks || result.chunks.length === 0) && (
                        <div className="text-center text-muted-foreground py-8">
                          {t('graphRAG.noContext')}
                        </div>
                      )}
                    </div>
                  </ScrollArea>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="json" className="mt-4">
              <Card>
                <CardContent className="pt-6">
                  <ScrollArea className="h-[400px]">
                    <pre className="text-xs font-mono bg-muted p-4 rounded overflow-auto">
                      {JSON.stringify(result, null, 2)}
                    </pre>
                  </ScrollArea>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>
      )}
    </div>
  );
};
