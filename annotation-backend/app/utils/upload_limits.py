from fastapi import HTTPException, status


def enforce_max_upload_size(size_bytes: int, max_mb: int, label: str) -> None:
    max_bytes = max_mb * 1024 * 1024
    if size_bytes > max_bytes:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=f"{label} exceeds the {max_mb} MB limit",
        )


def enforce_max_rows(row_count: int, max_rows: int, label: str) -> None:
    if row_count > max_rows:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"{label} exceeds the {max_rows} row limit",
        )
