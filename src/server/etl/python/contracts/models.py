"""
ETL Cross-Runtime Contract Models (Pydantic)

Pydantic models for ETL job requests, results, and manifests.

@see docs/40-implementation-plans/final-plan-canonical-document-parsing/15-cross-runtime-contracts.md
"""

from datetime import datetime
from typing import Literal, Optional, Any
from pydantic import BaseModel, Field, field_validator, model_validator
import re


# Type aliases
ETLJobStatus = Literal['succeeded', 'failed', 'partial']
GeoSource = Literal['mongo', 'postgis', 'both']
OutputFormat = Literal['turtle']
ETLJobSchemaVersion = Literal['etl-job@v1']
ETLJobResultSchemaVersion = Literal['etl-result@v1']


class ExtensionFlags(BaseModel):
    """Extension inclusion flags"""
    geo: bool
    legal: bool
    web: bool


class ETLJobInput(BaseModel):
    """ETL job input configuration"""
    document_ids: Optional[list[str]] = Field(None, alias='documentIds')
    query: Optional[dict[str, Any]] = None
    include_chunks: bool = Field(alias='includeChunks')
    include_extensions: ExtensionFlags = Field(alias='includeExtensions')
    geo_source: GeoSource = Field(alias='geoSource')

    @model_validator(mode='after')
    def validate_input_source(self):
        """Either documentIds or query must be provided, but not both"""
        has_document_ids = self.document_ids and len(self.document_ids) > 0
        has_query = self.query and len(self.query) > 0
        if has_document_ids == has_query:  # XOR
            raise ValueError('Either documentIds or query must be provided, but not both')
        return self

    class Config:
        populate_by_name = True


class ETLJobArtifacts(BaseModel):
    """ETL job artifacts configuration"""
    artifact_refs: Optional[list[str]] = Field(None, alias='artifactRefs')

    @field_validator('artifact_refs')
    @classmethod
    def validate_artifact_refs(cls, v):
        """Validate artifact refs are sha256 hex strings"""
        if v is not None:
            for ref in v:
                if not re.match(r'^[a-f0-9]{64}$', ref, re.IGNORECASE):
                    raise ValueError(f'Invalid artifact ref format: {ref}')
        return v

    class Config:
        populate_by_name = True


class ETLJobModels(BaseModel):
    """ETL job models configuration"""
    nlp_model_id: str = Field(alias='nlpModelId', min_length=1)
    rdf_mapping_version: str = Field(alias='rdfMappingVersion', min_length=1)

    class Config:
        populate_by_name = True


class ETLJobOutput(BaseModel):
    """ETL job output configuration"""
    format: OutputFormat
    output_dir: Optional[str] = Field(None, alias='outputDir', min_length=1)
    artifact_store_prefix: Optional[str] = Field(None, alias='artifactStorePrefix', min_length=1)
    manifest_name: str = Field(alias='manifestName', min_length=1)

    @model_validator(mode='after')
    def validate_output_destination(self):
        """Either outputDir or artifactStorePrefix must be provided, but not both"""
        has_output_dir = self.output_dir is not None
        has_prefix = self.artifact_store_prefix is not None
        if has_output_dir == has_prefix:  # XOR
            raise ValueError('Either outputDir or artifactStorePrefix must be provided, but not both')
        return self

    class Config:
        populate_by_name = True


class ETLJobRequest(BaseModel):
    """ETL job request payload"""
    schema_version: ETLJobSchemaVersion = Field(alias='schemaVersion')
    run_id: str = Field(alias='runId', min_length=1)
    created_at: str = Field(alias='createdAt')
    input: ETLJobInput
    artifacts: Optional[ETLJobArtifacts] = None
    models: ETLJobModels
    output: ETLJobOutput

    @field_validator('created_at')
    @classmethod
    def validate_created_at(cls, v):
        """Validate ISO 8601 datetime format"""
        try:
            datetime.fromisoformat(v.replace('Z', '+00:00'))
        except ValueError:
            raise ValueError(f'Invalid ISO 8601 datetime format: {v}')
        return v

    class Config:
        populate_by_name = True


class ETLJobStats(BaseModel):
    """ETL job statistics"""
    documents_processed: int = Field(alias='documentsProcessed', ge=0)
    triples_emitted: int = Field(alias='triplesEmitted', ge=0)
    files_written: int = Field(alias='filesWritten', ge=0)

    class Config:
        populate_by_name = True


class ETLJobOutputs(BaseModel):
    """ETL job output references"""
    turtle_files: list[str] = Field(alias='turtleFiles', min_length=1)
    manifest: str = Field(min_length=1)

    class Config:
        populate_by_name = True


class ETLJobError(BaseModel):
    """Structured error information"""
    code: str = Field(min_length=1)
    message: str = Field(min_length=1)
    document_id: Optional[str] = Field(None, alias='documentId')
    context: Optional[dict[str, Any]] = None

    class Config:
        populate_by_name = True


class ETLJobResult(BaseModel):
    """ETL job result payload"""
    schema_version: ETLJobResultSchemaVersion = Field(alias='schemaVersion')
    run_id: str = Field(alias='runId', min_length=1)
    status: ETLJobStatus
    stats: ETLJobStats
    outputs: ETLJobOutputs
    errors: Optional[list[ETLJobError]] = None

    class Config:
        populate_by_name = True


class DocumentFingerprint(BaseModel):
    """Document fingerprint for manifest provenance"""
    document_id: str = Field(alias='documentId', min_length=1)
    content_fingerprint: str = Field(alias='contentFingerprint')

    @field_validator('content_fingerprint')
    @classmethod
    def validate_content_fingerprint(cls, v):
        """Validate content fingerprint is sha256 hex string"""
        if not re.match(r'^[a-f0-9]{64}$', v, re.IGNORECASE):
            raise ValueError(f'Invalid content fingerprint format: {v}')
        return v

    class Config:
        populate_by_name = True


class ManifestProvenance(BaseModel):
    """Manifest provenance information"""
    input_fingerprints: list[DocumentFingerprint] = Field(alias='inputFingerprints')
    parser_versions: dict[str, str] = Field(alias='parserVersions')
    mapper_versions: dict[str, str] = Field(alias='mapperVersions')
    model_versions: dict[str, str] = Field(alias='modelVersions')
    rdf_mapping_version: str = Field(alias='rdfMappingVersion', min_length=1)

    class Config:
        populate_by_name = True


class ETLManifest(BaseModel):
    """ETL manifest structure"""
    schema_version: str = Field(alias='schemaVersion', min_length=1)
    run_id: str = Field(alias='runId', min_length=1)
    created_at: str = Field(alias='createdAt')
    completed_at: str = Field(alias='completedAt')
    provenance: ManifestProvenance
    outputs: dict[str, Any]  # { turtleFiles: list[str], manifest: str }
    stats: ETLJobStats

    @field_validator('created_at', 'completed_at')
    @classmethod
    def validate_datetime(cls, v):
        """Validate ISO 8601 datetime format"""
        try:
            datetime.fromisoformat(v.replace('Z', '+00:00'))
        except ValueError:
            raise ValueError(f'Invalid ISO 8601 datetime format: {v}')
        return v

    class Config:
        populate_by_name = True

