"""
ETL Contract Validator

Validates ETL job requests, results, and manifests using Pydantic models.

@see docs/40-implementation-plans/final-plan-canonical-document-parsing/15-cross-runtime-contracts.md
"""

import json
from typing import Any
from pydantic import ValidationError
from .models import ETLJobRequest, ETLJobResult, ETLManifest


class ETLContractValidationError(Exception):
    """Validation error for ETL contracts"""

    def __init__(
        self,
        message: str,
        errors: list[dict[str, Any]],
        schema_version: str | None = None
    ):
        super().__init__(message)
        self.errors = errors
        self.schema_version = schema_version
        self.name = 'ETLContractValidationError'


def validate_etl_job_request(data: dict[str, Any] | str) -> ETLJobRequest:
    """
    Validate ETL job request

    Args:
        data: Request data as dict or JSON string

    Returns:
        Validated ETL job request

    Raises:
        ETLContractValidationError: If validation fails
    """
    try:
        if isinstance(data, str):
            data = json.loads(data)

        request = ETLJobRequest.model_validate(data)
        return request
    except json.JSONDecodeError as e:
        raise ETLContractValidationError(
            f'Invalid JSON: {e.msg}',
            [],
            None
        )
    except ValidationError as e:
        schema_version = data.get('schemaVersion') if isinstance(data, dict) else None
        raise ETLContractValidationError(
            f'ETL job request validation failed: {e}',
            e.errors(),
            schema_version
        )


def validate_etl_job_result(data: dict[str, Any] | str) -> ETLJobResult:
    """
    Validate ETL job result

    Args:
        data: Result data as dict or JSON string

    Returns:
        Validated ETL job result

    Raises:
        ETLContractValidationError: If validation fails
    """
    try:
        if isinstance(data, str):
            data = json.loads(data)

        result = ETLJobResult.model_validate(data)
        return result
    except json.JSONDecodeError as e:
        raise ETLContractValidationError(
            f'Invalid JSON: {e.msg}',
            [],
            None
        )
    except ValidationError as e:
        schema_version = data.get('schemaVersion') if isinstance(data, dict) else None
        raise ETLContractValidationError(
            f'ETL job result validation failed: {e}',
            e.errors(),
            schema_version
        )


def validate_etl_manifest(data: dict[str, Any] | str) -> ETLManifest:
    """
    Validate ETL manifest

    Args:
        data: Manifest data as dict or JSON string

    Returns:
        Validated ETL manifest

    Raises:
        ETLContractValidationError: If validation fails
    """
    try:
        if isinstance(data, str):
            data = json.loads(data)

        manifest = ETLManifest.model_validate(data)
        return manifest
    except json.JSONDecodeError as e:
        raise ETLContractValidationError(
            f'Invalid JSON: {e.msg}',
            [],
            None
        )
    except ValidationError as e:
        schema_version = data.get('schemaVersion') if isinstance(data, dict) else None
        raise ETLContractValidationError(
            f'ETL manifest validation failed: {e}',
            e.errors(),
            schema_version
        )

