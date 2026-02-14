import { RelationType } from '../../../domain/ontology.js';

export function entityUri(id: string): string {
  return `http://data.example.org/id/${encodeURIComponent(id)}`;
}

export function relationUri(sourceId: string, targetId: string, type: RelationType): string {
  return `http://data.example.org/relation/${encodeURIComponent(sourceId)}-${encodeURIComponent(targetId)}-${type}`;
}

export function literal(value: string): string {
  return JSON.stringify(value);
}
