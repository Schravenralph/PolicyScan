"""
ETL Cross-Runtime Contracts (Python)

Pydantic models and validators for ETL job request/response contracts
between Node/TypeScript orchestration and Python ETL workers.

@see docs/40-implementation-plans/final-plan-canonical-document-parsing/15-cross-runtime-contracts.md
"""

from .models import (
    ETLJobRequest,
    ETLJobResult,
    ETLJobInput,
    ETLJobArtifacts,
    ETLJobModels,
    ETLJobOutput,
    ETLJobStats,
    ETLJobOutputs,
    ETLJobError,
    ETLManifest,
    ManifestProvenance,
    DocumentFingerprint,
    ETLJobStatus,
    GeoSource,
    OutputFormat,
    ExtensionFlags,
)
from .validator import (
    validate_etl_job_request,
    validate_etl_job_result,
    validate_etl_manifest,
    ETLContractValidationError,
)
from .loader import (
    load_etl_job_request,
    load_etl_job_result,
    load_etl_manifest,
)

__all__ = [
    # Models
    'ETLJobRequest',
    'ETLJobResult',
    'ETLJobInput',
    'ETLJobArtifacts',
    'ETLJobModels',
    'ETLJobOutput',
    'ETLJobStats',
    'ETLJobOutputs',
    'ETLJobError',
    'ETLManifest',
    'ManifestProvenance',
    'DocumentFingerprint',
    'ETLJobStatus',
    'GeoSource',
    'OutputFormat',
    'ExtensionFlags',
    # Validators
    'validate_etl_job_request',
    'validate_etl_job_result',
    'validate_etl_manifest',
    'ETLContractValidationError',
    # Loaders
    'load_etl_job_request',
    'load_etl_job_result',
    'load_etl_manifest',
]

