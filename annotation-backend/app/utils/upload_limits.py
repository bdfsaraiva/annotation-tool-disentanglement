"""
Upload guard helpers that raise HTTP errors for oversized files or row counts.

Both functions are called in upload endpoints *before* any database writes so
that the server fails fast with a helpful error message rather than discovering
the problem mid-import.
"""
from fastapi import HTTPException, status


def enforce_max_upload_size(size_bytes: int, max_mb: int, label: str) -> None:
    """
    Raise HTTP 413 if an uploaded file exceeds the configured size limit.

    Args:
        size_bytes: The actual size of the uploaded content in bytes.
        max_mb: The maximum allowed size in megabytes (from ``Settings``).
        label: Human-readable name of the upload type, included in the error
            detail (e.g. ``"CSV upload"``).

    Raises:
        HTTPException: 413 if ``size_bytes > max_mb * 1024 * 1024``.
    """
    max_bytes = max_mb * 1024 * 1024
    if size_bytes > max_bytes:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=f"{label} exceeds the {max_mb} MB limit",
        )


def enforce_max_rows(row_count: int, max_rows: int, label: str) -> None:
    """
    Raise HTTP 400 if a file's row count exceeds the configured import limit.

    Args:
        row_count: The actual number of data rows in the file.
        max_rows: The maximum number of rows allowed (from ``Settings``).
        label: Human-readable name of the data type, included in the error
            detail (e.g. ``"CSV messages"`` or ``"Batch annotations"``).

    Raises:
        HTTPException: 400 if ``row_count > max_rows``.
    """
    if row_count > max_rows:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"{label} exceeds the {max_rows} row limit",
        )
