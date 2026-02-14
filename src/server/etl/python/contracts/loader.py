"""
ETL Contract Loader

Loads and validates ETL job requests, results, and manifests from files or JSON strings.

@see docs/40-implementation-plans/final-plan-canonical-document-parsing/15-cross-runtime-contracts.md
"""

import json
from pathlib import Path
from typing import Any
from .models import ETLJobRequest, ETLJobResult, ETLManifest
from .validator import (
    validate_etl_job_request,
    validate_etl_job_result,
    validate_etl_manifest,
)


def load_etl_job_request(file_path: str | Path) -> ETLJobRequest:
    """
    Load and validate ETL job request from file

    Args:
        file_path: Path to JSON file

    Returns:
        Validated ETL job request

    Raises:
        ETLContractValidationError: If validation fails
        FileNotFoundError: If file does not exist
        json.JSONDecodeError: If file is not valid JSON
    """
    path = Path(file_path)
    if not path.exists():
        raise FileNotFoundError(f'ETL job request file not found: {file_path}')

    with open(path, 'r', encoding='utf-8') as f:
        data = json.load(f)

    return validate_etl_job_request(data)


def load_etl_job_result(file_path: str | Path) -> ETLJobResult:
    """
    Load and validate ETL job result from file

    Args:
        file_path: Path to JSON file

    Returns:
        Validated ETL job result

    Raises:
        ETLContractValidationError: If validation fails
        FileNotFoundError: If file does not exist
        json.JSONDecodeError: If file is not valid JSON
    """
    path = Path(file_path)
    if not path.exists():
        raise FileNotFoundError(f'ETL job result file not found: {file_path}')

    with open(path, 'r', encoding='utf-8') as f:
        data = json.load(f)

    return validate_etl_job_result(data)


def load_etl_manifest(file_path: str | Path) -> ETLManifest:
    """
    Load and validate ETL manifest from file

    Args:
        file_path: Path to JSON file

    Returns:
        Validated ETL manifest

    Raises:
        ETLContractValidationError: If validation fails
        FileNotFoundError: If file does not exist
        json.JSONDecodeError: If file is not valid JSON
    """
    path = Path(file_path)
    if not path.exists():
        raise FileNotFoundError(f'ETL manifest file not found: {file_path}')

    with open(path, 'r', encoding='utf-8') as f:
        data = json.load(f)

    return validate_etl_manifest(data)


def load_etl_job_request_from_json(json_str: str) -> ETLJobRequest:
    """
    Load and validate ETL job request from JSON string

    Args:
        json_str: JSON string

    Returns:
        Validated ETL job request

    Raises:
        ETLContractValidationError: If validation fails
        json.JSONDecodeError: If string is not valid JSON
    """
    return validate_etl_job_request(json_str)


def load_etl_job_result_from_json(json_str: str) -> ETLJobResult:
    """
    Load and validate ETL job result from JSON string

    Args:
        json_str: JSON string

    Returns:
        Validated ETL job result

    Raises:
        ETLContractValidationError: If validation fails
        json.JSONDecodeError: If string is not valid JSON
    """
    return validate_etl_job_result(json_str)


def load_etl_manifest_from_json(json_str: str) -> ETLManifest:
    """
    Load and validate ETL manifest from JSON string

    Args:
        json_str: JSON string

    Returns:
        Validated ETL manifest

    Raises:
        ETLContractValidationError: If validation fails
        json.JSONDecodeError: If string is not valid JSON
    """
    return validate_etl_manifest(json_str)

