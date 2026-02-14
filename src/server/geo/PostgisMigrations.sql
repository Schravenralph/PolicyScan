-- PostGIS Migration Scripts
-- 
-- Creates schema and tables for document geometries with spatial indexing.
-- 
-- @see docs/40-implementation-plans/final-plan-canonical-document-parsing/03-spatial-architecture.md

-- Enable PostGIS extension if not already enabled
CREATE EXTENSION IF NOT EXISTS postgis;

-- Create geo schema (optional, for organization)
CREATE SCHEMA IF NOT EXISTS geo;

-- Create document_geometries table
-- Stores canonical geometries in WGS84 (EPSG:4326)
CREATE TABLE IF NOT EXISTS geo.document_geometries (
  document_id TEXT PRIMARY KEY,
  geom GEOMETRY(GEOMETRY, 4326) NOT NULL,
  bbox BOX2D,
  geometry_hash TEXT NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Create GiST index on geometry for spatial queries
CREATE INDEX IF NOT EXISTS idx_document_geometries_geom 
  ON geo.document_geometries 
  USING GIST (geom);

-- Create index on updated_at for time-based queries
CREATE INDEX IF NOT EXISTS idx_document_geometries_updated_at 
  ON geo.document_geometries 
  USING BTREE (updated_at);

-- Create index on geometry_hash for idempotency checks
CREATE INDEX IF NOT EXISTS idx_document_geometries_hash 
  ON geo.document_geometries 
  USING BTREE (geometry_hash);

-- Create function to update updated_at timestamp
CREATE OR REPLACE FUNCTION geo.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to automatically update updated_at
DROP TRIGGER IF EXISTS update_document_geometries_updated_at ON geo.document_geometries;
CREATE TRIGGER update_document_geometries_updated_at
  BEFORE UPDATE ON geo.document_geometries
  FOR EACH ROW
  EXECUTE FUNCTION geo.update_updated_at_column();

