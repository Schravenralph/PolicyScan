-- pgvector Migration Scripts
-- 
-- Creates schema and tables for chunk embeddings with vector similarity search.
-- 
-- @see docs/40-implementation-plans/final-plan-canonical-document-parsing/06-vector-search.md

-- Enable pgvector extension if not already enabled
CREATE EXTENSION IF NOT EXISTS vector;

-- Create vector schema (optional, for organization)
CREATE SCHEMA IF NOT EXISTS vector;

-- Create chunk_embeddings table
-- Stores embeddings keyed by (chunkId, modelId) for idempotency
CREATE TABLE IF NOT EXISTS vector.chunk_embeddings (
  chunk_id TEXT NOT NULL,
  model_id TEXT NOT NULL,
  document_id TEXT NOT NULL,
  embedding vector NOT NULL,
  dims INTEGER NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  PRIMARY KEY (chunk_id, model_id)
);

-- Create index on document_id for filtering
CREATE INDEX IF NOT EXISTS idx_chunk_embeddings_document_id 
  ON vector.chunk_embeddings 
  USING BTREE (document_id);

-- Create index on model_id for filtering
CREATE INDEX IF NOT EXISTS idx_chunk_embeddings_model_id 
  ON vector.chunk_embeddings 
  USING BTREE (model_id);

-- Create index on updated_at for time-based queries
CREATE INDEX IF NOT EXISTS idx_chunk_embeddings_updated_at 
  ON vector.chunk_embeddings 
  USING BTREE (updated_at);

-- Create function to update updated_at timestamp
CREATE OR REPLACE FUNCTION vector.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to automatically update updated_at
DROP TRIGGER IF EXISTS update_chunk_embeddings_updated_at ON vector.chunk_embeddings;
CREATE TRIGGER update_chunk_embeddings_updated_at
  BEFORE UPDATE ON vector.chunk_embeddings
  FOR EACH ROW
  EXECUTE FUNCTION vector.update_updated_at_column();

-- Note: Vector similarity index (HNSW or IVFFLAT) is created separately
-- via PgVectorProvider.ensureIndex() based on configuration
-- This allows for different index types per model_id if needed

