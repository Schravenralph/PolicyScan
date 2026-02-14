/**
 * SPARQL Query Results Component
 * 
 * Displays SPARQL query results with:
 * - Results table
 * - CSV export
 * - Loading/error states
 * - Different result types (records, boolean, triples)
 */

import { Loader2, XCircle } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Alert, AlertDescription } from '../ui/alert';
import { Button } from '../ui/button';
import { ScrollArea } from '../ui/scroll-area';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../ui/table';
import { convertToCSV, downloadCSV } from '../../utils/sparqlUtils.js';
import type { SPARQLQueryResult } from '../../services/api/KnowledgeGraphManagementApiService';
import { t } from '../../utils/i18n';

interface SPARQLQueryResultsProps {
  queryResult: SPARQLQueryResult | null;
  queryLoading: boolean;
  queryError: string | null;
}

export function SPARQLQueryResults({
  queryResult,
  queryLoading,
  queryError,
}: SPARQLQueryResultsProps) {
  return (
    <Card className="flex-1 flex flex-col min-h-[300px]">
      <CardHeader>
        <CardTitle>{t('kg.query.results.title')}</CardTitle>
        <CardDescription>
          {t('kg.query.results.description')}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex-1 flex flex-col">
        {queryLoading ? (
          <div className="h-full flex items-center justify-center">
            <div className="text-center">
              <Loader2 className="h-8 w-8 animate-spin mx-auto mb-2" />
              <p className="text-muted-foreground">{t('kg.query.results.executing')}</p>
            </div>
          </div>
        ) : queryError ? (
          <Alert variant="destructive">
            <XCircle className="h-4 w-4" />
            <AlertDescription>{queryError}</AlertDescription>
          </Alert>
        ) : queryResult ? (
          <div className="flex-1 flex flex-col">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">
                  {t('kg.query.results.summary')
                    .replace('{{count}}', String(queryResult.summary.recordCount))
                    .replace('{{time}}', String(queryResult.summary.executionTime))}
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  if (queryResult.records) {
                    const csv = convertToCSV(queryResult.records);
                    downloadCSV(csv, 'sparql-results.csv');
                  }
                }}
              >
                {t('kg.query.results.exportCsv')}
              </Button>
            </div>
            <ScrollArea className="flex-1 border rounded-md">
              {queryResult.records && queryResult.records.length > 0 && queryResult.records[0] ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      {Object.keys(queryResult.records[0]!).map((key) => (
                        <TableHead key={key}>{key}</TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {queryResult.records && queryResult.records.map((row, idx) => {
                      const firstRecord = queryResult.records?.[0];
                      return (
                        <TableRow key={idx}>
                          {firstRecord && Object.keys(firstRecord).map((key) => (
                            <TableCell key={key} className="font-mono text-xs">
                              {row[key] || '(null)'}
                            </TableCell>
                          ))}
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              ) : queryResult.boolean !== undefined ? (
                <div className="p-4 text-center">
                  <p className="text-lg font-semibold">
                    {queryResult.boolean ? (
                      <span className="text-green-600">{t('kg.query.results.true')}</span>
                    ) : (
                      <span className="text-red-600">{t('kg.query.results.false')}</span>
                    )}
                  </p>
                </div>
              ) : queryResult.triples ? (
                <div className="p-4">
                  <pre className="text-xs font-mono whitespace-pre-wrap">{queryResult.triples}</pre>
                </div>
              ) : (
                <div className="p-4 text-center text-muted-foreground">
                  {t('kg.query.results.noResults')}
                </div>
              )}
            </ScrollArea>
          </div>
        ) : (
          <div className="h-full flex items-center justify-center text-muted-foreground">
            <p>{t('kg.query.results.noQueryYet')}</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
